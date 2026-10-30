<#
.SYNOPSIS
  lsp-rules-runner.ps1 의 동작(initialized 송신 조건, 장벽, 중단, 종료 정책, 정리)을 확인하는 무해한 스크립트형 가짜 서버. 실제 Semgrep 이 아니다.
.DESCRIPTION
  고정된 시나리오 이름만 받는다(lsp-rules-runner.ps1 이 같은 목록으로 한 번 더 거른다). 네트워크·계정/방화벽 접근이 없고 semgrep 을 부르지 않는다.
  하는 일은 표준 입출력과, 작업 폴더(cwd = 상태 폴더) 안의 기록 파일 쓰기(받은 메서드 `received.log`, `pid.txt`, `env.json`)와 시나리오가 정한 시험용 파일 쓰기뿐이다.
  서버 버전 자리에 찍는 값은 실제 도구와 헷갈리지 않도록 항상 9.9.9 이다. 어떤 시나리오도 스스로 60초 안에 끝난다(정리가 실패해도 오래 남지 않는다).
  `initialized` 이후의 로그 줄은 소스에서 도출한 **예측**이다(scripts/semgrep-lsp/testing/rules-fixtures.ts 와 같다). 여기서 통과한 시험은 러너 로직이 합성 입력에서 의도대로 동작한다는 것만 보여 준다.
  시간표는 `initialized` 를 받은 시각부터의 밀리초다. 정상 경로: 진행 요청 → 새로고침 줄 → 로딩 줄 → stdout rulesRefreshed → 맨줄 Rules refreshed → 열린 문서 스캔(대상 0개) → 진행 요청 → 맨줄 Scanned open documents.
  시나리오(괄호는 러너가 기대하는 결과):
    ok                    정상. shutdown 때 홈에 지문 파일을 쓴다(실제 서버처럼). 진행 요청이 정확히 2건이다.
    requests-2            ok 와 같다(허용된 진행 요청 2건. 답하지 않아야 한다).
    rules-zero            로딩 줄이 없고 맨줄 뒤에 `No rules to run!`
    yaml-error            로딩 시작만 있고 `Got 1 errors`, `No rules to run!`
    invalid-rule          로딩 시작·완료, `Got 0 errors`, 그리고 `No rules to run!`
    wrong-file-loaded     다른 파일을 로딩했다고 적는다
    notification-only     stdout 알림만 보내고 stderr 신호는 없다(장벽에 닿지 못한다)
    log-missing           장벽 신호는 있지만 로딩·Got 줄이 없다
    log-variant           `No targets` 줄이 INFO 수준으로 나온다
    log-duplicate         맨줄 `Rules refreshed` 가 두 번
    order-violation       맨줄 `Refreshing rules` 와 `Rules refreshed` 의 자리가 바뀐다
    header-variants       태그·출처가 다른 무해한 머리말 줄들
    json-dump-signal-text 여러 줄 JSON 덤프 안에 신호 문구와 같은 텍스트가 있다(신호가 아니다)
    engine-line-leak      `Running Semgrep with 1 rules`
    download-line / registry-line / token-line / settings-line   내려받기·레지스트리·토큰·설정 파일 줄
    publish-diagnostics   stdout publishDiagnostics
    workspace-scan-line   `Scanning workspace`
    early-signal          initialized 를 받기 전에 stderr 에 `Refreshing rules`
    early-notification    initialized 를 받기 전에 stdout rulesRefreshed
    initialize-error      오류 로그 알림 뒤 result 에 {retry:false} (initialized 를 받으면 안 된다)
    error-response        initialize 에 JSON-RPC error
    version-mismatch      유효한 응답이지만 서버 버전이 8.8.8
    wrong-id              id 가 다른 응답
    request-disallowed    허용 밖 서버 요청 / requests-3  진행 요청 3건 / request-malformed  token 이 없는 진행 요청
    delayed-forbidden     장벽 뒤 감시 구간 안에 금지 신호가 늦게 온다
    barrier-timeout       새로고침 줄만 내고 멈춘다
    exit-ignored          exit 를 무시한다(EOF 에는 종료) / exit-ignored-eof  exit·EOF 모두 무시 / nonzero-exit  종료 코드 1
    stderr-split          금지 문구(download)를 두 번에 나눠 보낸다 / stdout-split  initialize 응답을 한 바이트씩
    flood-err / flood-out 출력 상한을 넘는다 / orphan  종료 뒤 자손이 파이프를 쥔다
    write-ws / write-extra-rules / modify-probe / home-write   작업 영역·규칙 폴더·프로브·홈에 금지된 쓰기
    shutdown-reply        shutdown 에 응답한다(서버는 원래 응답하지 않는다. 판정은 달라지지 않는다)
    silent / silent-hold  initialize 에 응답하지 않는다(EOF 에 종료 / EOF 도 무시)
    exit-early / exit-during-refresh / garbage / env-names / spawn-disallowed / notification-twice
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Scenario)
$ErrorActionPreference = 'Stop'
$allowed = @(
    'ok', 'rules-zero', 'yaml-error', 'invalid-rule', 'wrong-file-loaded', 'notification-only', 'log-missing', 'log-variant', 'log-duplicate', 'order-violation',
    'header-variants', 'json-dump-signal-text', 'engine-line-leak', 'download-line', 'registry-line', 'token-line', 'settings-line', 'publish-diagnostics', 'workspace-scan-line',
    'early-signal', 'early-notification', 'initialize-error', 'error-response', 'version-mismatch', 'wrong-id', 'requests-2', 'request-disallowed', 'requests-3', 'request-malformed',
    'delayed-forbidden', 'barrier-timeout', 'exit-ignored', 'exit-ignored-eof', 'nonzero-exit', 'stderr-split', 'stdout-split', 'flood-err', 'flood-out', 'orphan',
    'write-ws', 'write-extra-rules', 'modify-probe', 'shutdown-reply', 'silent', 'silent-hold', 'exit-early', 'exit-during-refresh', 'garbage', 'env-names', 'spawn-disallowed',
    'notification-twice', 'home-write'
)
# -cnotcontains 는 서수 비교가 아니라서(소프트 하이픈·NUL 이 낀 이름도 같다고 본다) 이 스크립트가 따로 서수로 확인한다. 허용 목록 밖이면 아무것도 하지 않고 끝낸다.
$scenarioAllowed = $false
foreach ($candidate in $allowed) { if ([string]::Equals([string]$candidate, $Scenario, [StringComparison]::Ordinal)) { $scenarioAllowed = $true } }
if (-not $scenarioAllowed) { exit 9 }

$clock = [Diagnostics.Stopwatch]::StartNew()
$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()
$stderr = [Console]::OpenStandardError()
$Script:Cwd = (Get-Location).Path
$Script:Ver = '9.9.9'
$Script:ProbeFile = 'lsp-rules-1-probe.yaml'
$Script:LoadDir = ''
$Script:InitializedAt = $null

function Write-Rec([string]$Name, [string]$Text) { [IO.File]::AppendAllText((Join-Path $Script:Cwd $Name), $Text, (New-Object Text.UTF8Encoding($false))) }
function Write-Bytes($Stream, [byte[]]$Bytes) { $Stream.Write($Bytes, 0, $Bytes.Length); $Stream.Flush() }
function Get-Frame($Object) {
    $body = [Text.Encoding]::UTF8.GetBytes(($Object | ConvertTo-Json -Depth 10 -Compress))
    $head = [Text.Encoding]::ASCII.GetBytes("Content-Length: $($body.Length)`r`n`r`n")
    $all = New-Object byte[] ($head.Length + $body.Length)
    [Array]::Copy($head, 0, $all, 0, $head.Length); [Array]::Copy($body, 0, $all, $head.Length, $body.Length)
    , $all
}
function Send-Msg($Object) { Write-Bytes $stdout (Get-Frame $Object) }
function Write-ErrLines([string[]]$Lines) { foreach ($l in $Lines) { Write-Bytes $stderr ([Text.Encoding]::UTF8.GetBytes($l + "`r`n")) } }
function Write-ErrRaw([string]$Text) { Write-Bytes $stderr ([Text.Encoding]::UTF8.GetBytes($Text)) }

function Get-GoodResult([string]$Version) { [ordered]@{ capabilities = [ordered]@{ textDocumentSync = 1 }; serverInfo = [ordered]@{ name = 'Semgrep'; version = $Version } } }
function Get-ProgressCreate([int]$Id, [string]$Token) { [ordered]@{ jsonrpc = '2.0'; id = $Id; method = 'window/workDoneProgress/create'; params = [ordered]@{ token = $Token } } }
function Get-ProgressNote([string]$Token, [string]$Kind) { [ordered]@{ jsonrpc = '2.0'; method = '$/progress'; params = [ordered]@{ token = $Token; value = [ordered]@{ kind = $Kind; title = 'x' } } } }
function Get-RulesRefreshed { [ordered]@{ jsonrpc = '2.0'; method = 'semgrep/rulesRefreshed'; params = [ordered]@{} } }

# 부모의 표준 핸들을 그대로 물려받는 자손(종료 뒤에도 파이프를 쥔다). 91초 뒤 스스로 끝난다.
function Start-Holder {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
    $psi.Arguments = '-NoProfile -NonInteractive -Command Start-Sleep -Seconds 91'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    [void][Diagnostics.Process]::Start($psi)
}
# 허용 목록에 없는 이미지(ping.exe, 약 8초 뒤 스스로 끝난다)를 자손으로 띄운다.
function Start-Disallowed {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = (Join-Path $env:SystemRoot 'System32\PING.EXE')
    $psi.Arguments = '-n 8 127.0.0.1'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    [void][Diagnostics.Process]::Start($psi)
}

# 실제 관측을 본뜬 서두의 앞부분(시작과 함께 나온다): 안내문 배너.
$banner = @(
    '[00.11][DEBUG](default): Skipping logs for: [networking.http, cohttp.lwt.client, semgrep.parsing, bos]',
    '[00.11][DEBUG](default): Showing logs for: [application]',
    '[00.11][DEBUG](default): !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    '[00.11][DEBUG](default): ',
    'If you want to show the logs of a particular library',
    "(e.g., the semgrep targeting library), you'll need to adjust the",
    'SEMGREP_LOG_SRCS environment variable as in',
    '',
    '  SEMGREP_LOG_SRCS="semgrep.targeting" semgrep ... --debug',
    '',
    'You can see the list of possible libraries above in this log as in',
    '...',
    '[00.04][DEBUG](default): Skipping logs for semgrep.targeting',
    '...',
    'For more information, See',
    'https://www.notion.so/semgrep/Logging-in-semgrep',
    '',
    '[00.11][DEBUG](default): !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    '[00.11][DEBUG](default): Logging setup for osemgrep: color=Console.Auto level=debug',
    '[00.11][DEBUG](default): Executed as: osemgrep lsp --debug',
    '[00.11][DEBUG](default): Starting semgrep-lsp',
    'Starting legacy language server',
    '[00.11][DEBUG](default): Starting Semgrep Language Server'
)

# 서두의 뒷부분(initialize 를 받은 직후): 요청 덤프, 초기화 덤프, 세션 덤프, 응답 덤프. 여러 줄 JSON 안에는 신호 문구와 같은 텍스트가 없다.
function Get-PreambleAfterInit([string]$RulesDir) {
    $j = $RulesDir.Replace('\', '\\')
    @(
        '[00.11][DEBUG](default): Handling request:', '{', '  "id": 0,', '  "params": {', '    "capabilities": {},', '    "initializationOptions": {', '      "scan": {', '        "ci": false,',
        '        "configuration": [', "          `"$j`"", '        ],', '        "onlyGitDirty": false', '      },', '      "metrics": { "enabled": false }', '    }', '  },', '  "method": "initialize",', '  "jsonrpc": "2.0"', '}',
        'Initializing server',
        '[00.11][DEBUG](default): Initializing server with initializationOptions:', '{', '  "scan": {', '    "ci": false,', '    "configuration": [', "      `"$j`"", '    ]', '  }', '}',
        '[00.11][DEBUG](default): Initializing preemptive threads', 'Caching workspace targets', 'Finished caching workspace targets',
        '[00.11][DEBUG](default): Initialized server with session:', '{ Legacy_session.capabilities =', '  {', '    "codeActionProvider": true,', '    "executeCommandProvider": {', '      "commands": [ "semgrep/ignore", "semgrep/autofix" ]', '    }', '  };',
        '  workspace_folders =', '  [c:\ProgramData\x\work\lsp\ws];', '  cached_workspace_targets = <opaque>; cached_scans = <opaque>;', '  cached_session =', '  { Legacy_session.rules = <opaque>; skipped_app_fingerprints = [];',
        '    open_documents = []; initialized = false; deployment_id = None;', '    lock = <opaque> };', '  is_intellij = false }', 'Server initialized',
        '[00.24][DEBUG](default): Sending response {', '  "id": "lsp-rules-init-1",', '  "jsonrpc": "2.0",', '  "result": {', '    "capabilities": { "hoverProvider": true },', '    "serverInfo": { "name": "Semgrep", "version": "9.9.9" }', '  }', '}'
    )
}

# 시간표(initialized 를 받은 시각부터의 ms). kind: err(한 줄) / errraw(개행 없는 조각) / out(stdout 프레임) / act(이름이 있는 부수 효과)
function New-Ev([int]$At, [string]$Kind, $Data) { @{ at = $At; kind = $Kind; data = $Data; done = $false } }
function New-HappyEvents {
    $f = $Script:LoadDir.TrimEnd('\', '/') + '\' + $Script:ProbeFile
    $e = New-Object System.Collections.ArrayList
    foreach ($x in @(
            (New-Ev 10 'err' '[00.80][DEBUG](default): Handling notification { "method": "initialized", "params": {}, "jsonrpc": "2.0" }'),
            (New-Ev 20 'err' 'Refreshing rules'),
            (New-Ev 22 'out' (Get-ProgressCreate 1 'refresh-token')), (New-Ev 23 'out' (Get-ProgressNote 'refresh-token' 'begin')),
            (New-Ev 30 'err' '[00.80][INFO]: Checking for API token in environment variables'),
            (New-Ev 35 'err' '[00.80][INFO]: No API token found in environment variables'),
            (New-Ev 40 'err' '[00.80][INFO]: No settings file found, using default settings'),
            (New-Ev 45 'err' '[00.81][DEBUG](default): CI disabled, not checking API token'),
            (New-Ev 50 'err' "[00.81][INFO]: loading local config from $f"),
            (New-Ev 55 'err' "[00.82][INFO]: Done loading local config from $f"),
            (New-Ev 60 'err' '[00.82][INFO]: Got 0 errors while refreshing rules in language server'),
            (New-Ev 65 'out' (Get-RulesRefreshed)), (New-Ev 66 'out' (Get-ProgressNote 'refresh-token' 'end')),
            (New-Ev 70 'err' 'Rules refreshed'),
            (New-Ev 75 'err' 'Scanning open documents'),
            (New-Ev 78 'out' (Get-ProgressCreate 2 'scan-token')), (New-Ev 79 'out' (Get-ProgressNote 'scan-token' 'begin')),
            (New-Ev 85 'err' '[00.83][WARNING]: No targets to scan! Not scanning anything.'),
            (New-Ev 90 'err' 'Scanned open documents'),
            (New-Ev 92 'out' (Get-ProgressNote 'scan-token' 'end')))) { [void]$e.Add($x) }
    , $e
}
function Remove-Ev($Events, [string]$Like) { $keep = New-Object System.Collections.ArrayList; foreach ($x in $Events) { if (-not ($x.kind -eq 'err' -and $x.data -like $Like)) { [void]$keep.Add($x) } }; , $keep }
function Update-Ev($Events, [string]$Like, [string]$With) { foreach ($x in $Events) { if ($x.kind -eq 'err' -and $x.data -like $Like) { $x.data = $With } } }

# 시나리오별 설정
$Script:ExitMode = 'exit0'          # exit0 | exit1 | ignore
$Script:IgnoreEof = $false
$Script:FingerprintOnShutdown = $true
$Script:ShutdownReply = $false
$Script:Orphan = $false
$Script:ExtraEvents = New-Object System.Collections.ArrayList
switch -CaseSensitive ($Scenario) {
    'silent-hold' { $Script:IgnoreEof = $true }
    'exit-ignored' { $Script:ExitMode = 'ignore' }
    'exit-ignored-eof' { $Script:ExitMode = 'ignore'; $Script:IgnoreEof = $true }
    'nonzero-exit' { $Script:ExitMode = 'exit1' }
    'orphan' { $Script:Orphan = $true }
    'shutdown-reply' { $Script:ShutdownReply = $true }
}

# initialized 이후의 시간표를 만든다(LoadDir 는 initialize 의 configuration 에서 온다).
function Get-AfterInitializedEvents {
    $ev = New-HappyEvents
    switch -CaseSensitive ($Scenario) {
        'rules-zero' { $ev = Remove-Ev $ev '*loading local config*'; Update-Ev $ev '*No targets*' '[00.83][WARNING]: No rules to run! Not scanning anything.' }
        'yaml-error' { $ev = Remove-Ev $ev '*Done loading*'; Update-Ev $ev '*Got 0 errors*' '[00.82][INFO]: Got 1 errors while refreshing rules in language server'; Update-Ev $ev '*No targets*' '[00.83][WARNING]: No rules to run! Not scanning anything.' }
        'invalid-rule' { Update-Ev $ev '*No targets*' '[00.83][WARNING]: No rules to run! Not scanning anything.' }
        'wrong-file-loaded' { foreach ($x in $ev) { if ($x.kind -eq 'err' -and $x.data -like '*loading local config*') { $x.data = $x.data.Replace($Script:ProbeFile, 'somewhere-else.yaml') } } }
        'notification-only' { $ev = New-Object System.Collections.ArrayList; [void]$ev.Add((New-Ev 20 'out' (Get-RulesRefreshed))) }
        'log-missing' { $ev = Remove-Ev $ev '*loading local config*'; $ev = Remove-Ev $ev '*Done loading*'; $ev = Remove-Ev $ev '*Got 0 errors*' }
        'log-variant' { Update-Ev $ev '*No targets*' '[00.83][INFO]: No targets to scan! Not scanning anything.' }
        'log-duplicate' { [void]$ev.Add((New-Ev 120 'err' 'Rules refreshed')) }
        'order-violation' { Update-Ev $ev 'Refreshing rules' '@@SWAP1'; Update-Ev $ev 'Rules refreshed' 'Refreshing rules'; Update-Ev $ev '@@SWAP1' 'Rules refreshed' }
        'header-variants' { foreach ($l in @('[1][DEBUG](default): hi', '[00.9][INFO](semgrep.parsing): hello', '[2.50][DEBUG](default)(x): y', '[00.95][INFO]: plain info')) { [void]$ev.Add((New-Ev 95 'err' $l)) } }
        'json-dump-signal-text' {
            # 중괄호로 열린 세션 덤프 안에 신호 문구와 **똑같은** 줄이 들어 있다. 덤프 안의 줄은 신호가 아니다(embeddedSignalText 로만 센다).
            $i = 96
            foreach ($l in @('[00.9][DEBUG](default): Initialized server with session:', '{ Legacy_session.capabilities =', 'Scanning workspace', 'Running Semgrep with 1 rules', 'Scanned 3 files', '  is_intellij = false }')) { [void]$ev.Add((New-Ev $i 'err' $l)); $i++ }
        }
        'engine-line-leak' { [void]$ev.Add((New-Ev 95 'err' 'Running Semgrep with 1 rules')) }
        'download-line' { [void]$ev.Add((New-Ev 95 'err' '[00.9][INFO]: trying to download from https://example.invalid/x')) }
        'registry-line' { [void]$ev.Add((New-Ev 95 'err' '[00.9][INFO]: No rules source specified, using auto')) }
        'token-line' { [void]$ev.Add((New-Ev 95 'err' '[00.9][INFO]: Found API token in environment variables')) }
        'settings-line' { [void]$ev.Add((New-Ev 95 'err' '[00.9][INFO]: Settings file found at C:\x')) }
        'publish-diagnostics' { [void]$ev.Add((New-Ev 95 'out' ([ordered]@{ jsonrpc = '2.0'; method = 'textDocument/publishDiagnostics'; params = [ordered]@{} }))) }
        'workspace-scan-line' { [void]$ev.Add((New-Ev 95 'err' 'Scanning workspace')) }
        'request-disallowed' { [void]$ev.Add((New-Ev 30 'out' ([ordered]@{ jsonrpc = '2.0'; id = 7; method = 'client/registerCapability'; params = [ordered]@{} }))) }
        'requests-3' { [void]$ev.Add((New-Ev 100 'out' (Get-ProgressCreate 3 'extra-token'))) }
        'request-malformed' { [void]$ev.Add((New-Ev 30 'out' ([ordered]@{ jsonrpc = '2.0'; id = 5; method = 'window/workDoneProgress/create'; params = [ordered]@{} }))) }
        'delayed-forbidden' { [void]$ev.Add((New-Ev 1200 'err' 'Running Semgrep with 1 rules')) }
        'barrier-timeout' { $ev = New-Object System.Collections.ArrayList; [void]$ev.Add((New-Ev 20 'err' 'Refreshing rules')) }
        'stderr-split' { [void]$ev.Add((New-Ev 95 'errraw' '[00.9][DEBUG](default): a down')); [void]$ev.Add((New-Ev 400 'errraw' "load b`r`n")) }
        'flood-err' { [void]$ev.Add((New-Ev 95 'act' 'flood-err')) }
        'flood-out' { [void]$ev.Add((New-Ev 95 'act' 'flood-out')) }
        'write-ws' { [void]$ev.Add((New-Ev 30 'act' 'write-ws')) }
        'write-extra-rules' { [void]$ev.Add((New-Ev 30 'act' 'write-extra-rules')) }
        'modify-probe' { [void]$ev.Add((New-Ev 30 'act' 'modify-probe')) }
        'home-write' { [void]$ev.Add((New-Ev 30 'act' 'home-write')) }
        'spawn-disallowed' { [void]$ev.Add((New-Ev 30 'act' 'spawn-disallowed')) }
        'exit-during-refresh' { $ev = New-Object System.Collections.ArrayList; [void]$ev.Add((New-Ev 10 'err' 'Refreshing rules')); [void]$ev.Add((New-Ev 30 'act' 'exit1')) }
        'notification-twice' { [void]$ev.Add((New-Ev 100 'out' (Get-RulesRefreshed))) }
    }
    , $ev
}

function Invoke-Act([string]$Name) {
    switch -CaseSensitive ($Name) {
        'flood-err' { Write-Bytes $stderr ([byte[]](, 0x61 * 300000)) }
        'flood-out' { $chunk = ('a' * 400000); for ($i = 0; $i -lt 4; $i++) { Send-Msg ([ordered]@{ jsonrpc = '2.0'; method = 'x/flood'; params = $chunk }) } }   # 40만 자 4개 ≈ 1.6 MB > stdout 상한 1 MiB. 작은 메시지 450개는 스텁이 만드는 데만 몇 초 걸려 settle 안에 상한에 닿지 못한다
        'write-ws' { [IO.File]::WriteAllText((Join-Path (Split-Path -Parent $Script:Cwd) 'ws\x.txt'), 'x') }
        'write-extra-rules' { [IO.File]::WriteAllText((Join-Path $Script:LoadDir 'extra.yaml'), 'rules: []') }
        'modify-probe' { [IO.File]::AppendAllText((Join-Path $Script:LoadDir $Script:ProbeFile), "# changed`n") }
        'home-write' { [IO.File]::WriteAllText((Join-Path $env:USERPROFILE 'settings.yml'), 'x') }
        'spawn-disallowed' { Start-Disallowed }
        'exit1' { exit 1 }
    }
}

# 홈에 지문 파일을 쓴다(실제 서버가 shutdown 때 하는 일: 무시 목록 캐시). 러너의 A5 가 허용하는 위치다.
function Write-Fingerprint {
    $dir = Join-Path $env:USERPROFILE '.semgrep\cache\fingerprinted_ignored_findings'
    [void][IO.Directory]::CreateDirectory($dir)
    [IO.File]::WriteAllText((Join-Path $dir 'ws.txt'), 'x')
}

$shutdownLines = @(
    '[00.90][DEBUG](default): Handling request:', '{ "id": 0, "method": "shutdown", "jsonrpc": "2.0" }', 'Shutting down server',
    '[00.90][DEBUG](default): Handling notification { "method": "exit", "jsonrpc": "2.0" }', '[00.90][DEBUG](default): Server exiting', 'Server stopped', '[00.90][DEBUG](default): Producing exit code 0 (OK)'
)

Write-Rec 'pid.txt' ([string]$PID)
if ($Scenario -eq 'env-names') {
    $vals = [ordered]@{}; foreach ($n in 'PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'SEMGREP_APP_URL') { $vals[$n] = [Environment]::GetEnvironmentVariable($n) }
    Write-Rec 'env.json' (([ordered]@{ names = @([Environment]::GetEnvironmentVariables().Keys | Sort-Object); values = $vals; cwd = $Script:Cwd } | ConvertTo-Json -Depth 5 -Compress))
}
Write-ErrLines $banner

$Script:Pending = New-Object System.Collections.ArrayList

function Invoke-Init($Msg) {
    $cfg = ''; try { $cfg = [string]$Msg.params.initializationOptions.scan.configuration[0] } catch { }
    $Script:LoadDir = $cfg
    Write-ErrLines (Get-PreambleAfterInit $cfg)
    switch -CaseSensitive ($Scenario) {
        { $_ -ceq 'silent' -or $_ -ceq 'silent-hold' } { return }
        'exit-early' { exit 3 }
        'error-response' { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; error = [ordered]@{ code = -32602; message = 'stub invalid params' } }) }
        'initialize-error' {
            Send-Msg ([ordered]@{ jsonrpc = '2.0'; method = 'window/logMessage'; params = [ordered]@{ type = 1; message = 'Error initializing server' } })
            Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = [ordered]@{ retry = $false } })
        }
        'wrong-id' { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = 'other'; result = (Get-GoodResult $Script:Ver) }) }
        'garbage' { Write-Bytes $stdout ([Text.Encoding]::ASCII.GetBytes("garbage`r`n`r`n")) }
        'early-signal' { Write-ErrLines @('Refreshing rules'); Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult $Script:Ver) }) }
        'early-notification' { Send-Msg (Get-RulesRefreshed); Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult $Script:Ver) }) }
        'version-mismatch' { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult '8.8.8') }) }
        'stdout-split' { foreach ($b in (Get-Frame ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult $Script:Ver) }))) { Write-Bytes $stdout ([byte[]]@($b)); Start-Sleep -Milliseconds 2 } }
        default { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult $Script:Ver) }) }
    }
}

function Invoke-OnMessage($Msg) {
    $method = [string]$Msg.method
    # 서버 요청에 대한 응답(id 만 있고 method 가 없는 메시지)을 받으면 따로 적는다: 러너는 절대 응답하지 않아야 한다.
    if ($method -eq '') { Write-Rec 'received.log' ("RESPONSE:$($Msg.id)`n"); Write-Rec 'unexpected.log' "RESPONSE`n"; return }
    Write-Rec 'received.log' "$method`n"
    switch -CaseSensitive ($method) {
        'initialize' { Invoke-Init $Msg }
        'initialized' {
            $Script:InitializedAt = $clock.ElapsedMilliseconds
            foreach ($x in (Get-AfterInitializedEvents)) { $x.at = $x.at + $Script:InitializedAt; [void]$Script:Pending.Add($x) }
        }
        'shutdown' {
            Write-ErrLines $shutdownLines[0..2]
            if ($Script:FingerprintOnShutdown) { Write-Fingerprint }
            if ($Script:ShutdownReply) { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = $null }) }
        }
        'exit' {
            if ($Script:ExitMode -eq 'ignore') { return }
            Write-ErrLines $shutdownLines[3..6]
            if ($Script:Orphan) { Start-Holder }
            if ($Script:ExitMode -eq 'exit1') { exit 1 }
            exit 0
        }
        default { Write-Rec 'unexpected.log' "$method`n" }
    }
}

# 표준 입력을 비동기로 읽으며 시간표를 돌린다. 프레임은 Content-Length 헤더로 나눈다.
$acc = New-Object IO.MemoryStream
$readBuf = New-Object byte[] 65536
$ar = $stdin.BeginRead($readBuf, 0, $readBuf.Length, $null, $null)
$eof = $false
while ($clock.ElapsedMilliseconds -lt 60000) {
    foreach ($ev in @($Script:Pending)) {
        if (-not $ev.done -and $clock.ElapsedMilliseconds -ge $ev.at) {
            $ev.done = $true
            switch -CaseSensitive ($ev.kind) {
                'err' { Write-ErrLines @([string]$ev.data) }
                'errraw' { Write-ErrRaw ([string]$ev.data) }
                'out' { Send-Msg $ev.data }
                'act' { Invoke-Act ([string]$ev.data) }
            }
        }
    }
    if (-not $eof -and $ar.IsCompleted) {
        $n = $stdin.EndRead($ar)
        if ($n -le 0) {
            $eof = $true
            Write-Rec 'received.log' "<stdin-end>`n"
            if (-not $Script:IgnoreEof) { exit 0 }
        } else {
            $acc.Write($readBuf, 0, $n)
            $ar = $stdin.BeginRead($readBuf, 0, $readBuf.Length, $null, $null)
            while ($true) {
                $bytes = $acc.ToArray()
                $text = [Text.Encoding]::GetEncoding('latin1').GetString($bytes)
                $end = $text.IndexOf("`r`n`r`n")
                if ($end -lt 0) { break }
                $m = [regex]::Match($text.Substring(0, $end), 'Content-Length:\s*(\d+)')
                if (-not $m.Success) { break }
                $len = [int]$m.Groups[1].Value
                if ($bytes.Length -lt $end + 4 + $len) { break }
                $json = [Text.Encoding]::UTF8.GetString($bytes, $end + 4, $len)
                $acc = New-Object IO.MemoryStream
                $rest = $bytes.Length - ($end + 4 + $len)
                if ($rest -gt 0) { $acc.Write($bytes, $end + 4 + $len, $rest) }
                Invoke-OnMessage ($json | ConvertFrom-Json)
            }
        }
    }
    Start-Sleep -Milliseconds 10
}
exit 0
