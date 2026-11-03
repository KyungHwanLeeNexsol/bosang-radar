<#
.SYNOPSIS
  lsp-scan-runner.ps1 의 동작(initialized·didOpen 송신 조건, 장벽, 두 묶음 대기와 settle, 중단, 종료 정책, 정리)을 확인하는 무해한 스크립트형 가짜 서버. 실제 Semgrep 이 아니다.
.DESCRIPTION
  고정된 시나리오 이름만 받는다(lsp-scan-runner.ps1 이 같은 목록으로 한 번 더 거른다). 네트워크·계정/방화벽 접근이 없고 semgrep 과 git 을 부르지 않는다.
  하는 일은 표준 입출력과, 작업 폴더(cwd = 상태 폴더) 안의 기록 파일 쓰기(받은 메서드 received.log, pid.txt, env.json, didopen.log)와 시나리오가 정한 시험용 파일 쓰기뿐이다.
  서버 버전 자리에 찍는 값은 실제 도구와 헷갈리지 않도록 항상 9.9.9 이다. 어떤 시나리오도 스스로 60초 안에 끝난다(정리가 실패해도 오래 남지 않는다).
  initialized 이후와 didOpen 이후의 로그 줄은 소스에서 도출한 **예측**이다(scripts/semgrep-lsp/testing/scan-fixtures.ts 와 같다). 여기서 통과한 시험은 러너 로직이 합성 입력에서 의도대로 동작한다는 것만 보여 준다.
  시간표는 initialized(장벽 구간) 또는 didOpen(스캔 반응 구간)을 받은 시각부터의 밀리초다.
  정상 경로: 장벽(진행 요청 → 새로고침 줄 → 로딩 줄 → stdout rulesRefreshed → 맨줄 Rules refreshed → 열린 문서 스캔 + 외부 명령 시도 줄 1건 → 맨줄 Scanned open documents) 뒤,
  didOpen 에 반응해 단일 파일 스캔 로그 묶음(stderr)과 진단 알림 하나(stdout)를 낸다.
  도착 순서 변형(같은 증거, 다른 순서): ok / ok-diag-first(진단이 먼저) / ok-log-first(로그 묶음이 먼저) / ok-split-chunks(양쪽 1바이트씩) / ok-simultaneous(같은 순간).
  스캔 반응 시나리오: diag-only log-only pre-open-evidence duplicate-notification two-diagnostics other-uri extra-uri wrong-code code-short wrong-message wrong-severity range-start-shift range-end-plus1 range-end-minus1
    late-log wrong-log-order engine-error-line skipped-rule no-targets rules-not-loaded extra-scan-during-settle exit-during-settle timeout ext-ok-x2 ext-wrong-command ext-wrong-args ext-wrong-path ext-third-attempt ext-missing-post
    server-request-after-didopen forbidden-signal modify-target
  장벽 구간 실패 시나리오(RULES 와 같은 이름): rules-zero yaml-error invalid-rule wrong-file-loaded notification-only log-missing log-variant log-duplicate order-violation barrier-timeout download-line registry-line token-line
    settings-line early-signal early-notification initialize-error error-response version-mismatch wrong-id silent silent-hold exit-early garbage exit-ignored exit-ignored-eof nonzero-exit stderr-split stdout-split
    flood-err flood-out orphan write-ws write-extra-rules modify-probe home-write shutdown-reply env-names spawn-disallowed requests-2 requests-3 request-disallowed request-malformed delayed-forbidden header-variants json-dump-signal-text notification-twice
  초기화 응답의 프레임 경계(프레임 파서 시험용): init-jsonrpc-shy init-jsonrpc-nul init-jsonrpc-key-shy init-header-over init-header-name-lf init-header-max
    앞의 다섯은 TS 프레임 디코더가 거절하는 응답을 보낸다(jsonrpc 값 끝에 소프트 하이픈·NUL, 키 이름 끝에 소프트 하이픈, 헤더 8193바이트, 헤더 이름 끝에 LF). 러너가 initialized 를 보내면 안 된다.
    init-header-max 는 헤더가 정확히 8192바이트인 정상 응답이다(경계 대조군): 그대로 정상 경로로 이어진다.
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Scenario)
$ErrorActionPreference = 'Stop'
$allowed = @(
        'ok', 'ok-diag-first', 'ok-log-first', 'ok-split-chunks', 'ok-simultaneous', 'diag-only', 'log-only', 'pre-open-evidence'
    'duplicate-notification', 'two-diagnostics', 'other-uri', 'extra-uri', 'wrong-code', 'code-short', 'wrong-message', 'wrong-severity'
    'range-start-shift', 'range-end-plus1', 'range-end-minus1', 'late-log', 'wrong-log-order', 'engine-error-line', 'skipped-rule', 'no-targets'
    'rules-not-loaded', 'extra-scan-during-settle', 'exit-during-settle', 'timeout', 'ext-ok-x2', 'ext-wrong-command', 'ext-wrong-args', 'ext-wrong-path'
    'ext-third-attempt', 'ext-missing-post', 'server-request-after-didopen', 'forbidden-signal', 'modify-target', 'rules-zero', 'yaml-error', 'invalid-rule'
    'wrong-file-loaded', 'notification-only', 'log-missing', 'log-variant', 'log-duplicate', 'order-violation', 'barrier-timeout', 'download-line'
    'registry-line', 'token-line', 'settings-line', 'early-signal', 'early-notification', 'initialize-error', 'error-response', 'version-mismatch'
    'wrong-id', 'silent', 'silent-hold', 'exit-early', 'garbage', 'exit-ignored', 'exit-ignored-eof', 'nonzero-exit'
    'stderr-split', 'stdout-split', 'flood-err', 'flood-out', 'orphan', 'write-ws', 'write-extra-rules', 'modify-probe'
    'home-write', 'shutdown-reply', 'env-names', 'spawn-disallowed', 'requests-2', 'requests-3', 'request-disallowed', 'request-malformed'
    'delayed-forbidden', 'header-variants', 'json-dump-signal-text', 'notification-twice'
    'init-jsonrpc-shy', 'init-jsonrpc-nul', 'init-jsonrpc-key-shy', 'init-header-over', 'init-header-name-lf', 'init-header-max'
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
$Script:DidOpenAt = $null
$Script:DidOpenCount = 0
$Script:ExitRequested = $false

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
# 헤더 줄을 직접 정한 프레임(프레임 파서의 경계 시험용). $HeaderLines 에 Content-Length 줄도 직접 넣는다. 줄은 CRLF 로 잇고 빈 줄로 끝낸다.
function Get-RawFrame([string[]]$HeaderLines, [byte[]]$Body) {
    $head = [Text.Encoding]::ASCII.GetBytes((($HeaderLines -join "`r`n") + "`r`n`r`n"))
    $all = New-Object byte[] ($head.Length + $Body.Length)
    [Array]::Copy($head, 0, $all, 0, $head.Length); [Array]::Copy($Body, 0, $all, $head.Length, $Body.Length)
    , $all
}
# 정상 초기화 응답의 헤더(종결자 앞까지, CRLFCRLF 제외)가 정확히 $HeaderBytes 바이트가 되도록 X-Pad 헤더로 채운 프레임.
function Get-PaddedInitFrame($Object, [int]$HeaderBytes) {
    $body = [Text.Encoding]::UTF8.GetBytes(($Object | ConvertTo-Json -Depth 10 -Compress))
    $first = "Content-Length: $($body.Length)"
    $pad = $HeaderBytes - ($first.Length + 2 + 'X-Pad: '.Length)
    Get-RawFrame @($first, ('X-Pad: ' + ('a' * $pad))) $body
}
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
        '[00.24][DEBUG](default): Sending response {', '  "id": "lsp-scan-init-1",', '  "jsonrpc": "2.0",', '  "result": {', '    "capabilities": { "hoverProvider": true },', '    "serverInfo": { "name": "Semgrep", "version": "9.9.9" }', '  }', '}'
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
            (New-Ev 75 'err' 'Scanning open documents'), (New-Ev 80 'err' (Get-ExternalLine '00.83')),
            (New-Ev 78 'out' (Get-ProgressCreate 2 'scan-token')), (New-Ev 79 'out' (Get-ProgressNote 'scan-token' 'begin')),
            (New-Ev 85 'err' '[00.83][WARNING]: No targets to scan! Not scanning anything.'),
            (New-Ev 90 'err' 'Scanned open documents'),
            (New-Ev 92 'out' (Get-ProgressNote 'scan-token' 'end')))) { [void]$e.Add($x) }
    , $e
}
function Remove-Ev($Events, [string]$Like) { $keep = New-Object System.Collections.ArrayList; foreach ($x in $Events) { if (-not ($x.kind -eq 'err' -and $x.data -like $Like)) { [void]$keep.Add($x) } }; , $keep }
function Update-Ev($Events, [string]$Like, [string]$With) { foreach ($x in $Events) { if ($x.kind -eq 'err' -and $x.data -like $Like) { $x.data = $With } } }

# ── LSP-SCAN-1: 외부 명령 시도 줄과 didOpen 뒤의 스캔 반응 ──────────────────────────────────────────

# 작업 영역 경로가 로그에 찍히는 모양: 역슬래시, 드라이브 문자 소문자(LSP-RULES-1 stderr:227). 작업 영역은 cwd(상태 폴더)의 형제 폴더 ws 다.
function Get-LogWorkspace {
    $ws = Join-Path (Split-Path -Parent $Script:Cwd) 'ws'
    if ($ws.Length -ge 2 -and $ws[1] -eq ':') { $ws = $ws.Substring(0, 1).ToLowerInvariant() + $ws.Substring(1) }
    $ws
}
function Get-ExternalLine([string]$Stamp, [string]$Command = 'git', [string]$Path = $null) {
    if ([string]::IsNullOrEmpty($Path)) { $Path = Get-LogWorkspace }
    '[' + $Stamp + '][INFO]: Running external command: "' + $Command + '" "-C" "' + $Path + '" "rev-parse" "--show-toplevel"'
}

$Script:TargetUri = ''
function Get-GoodDiagnostic {
    [ordered]@{
        range = [ordered]@{ start = [ordered]@{ line = 1; character = 8 }; end = [ordered]@{ line = 1; character = 53 } }
        severity = 3; code = 'rules-probe.lsp-rules-1-probe'; source = 'Semgrep'
        message = 'LSP-RULES-1 probe rule. It is loaded but is not expected to match any target.'
    }
}
function Get-Publish($Uri, $Diagnostics) { [ordered]@{ jsonrpc = '2.0'; method = 'textDocument/publishDiagnostics'; params = [ordered]@{ uri = $Uri; diagnostics = @($Diagnostics) } } }

# 정상 스캔 반응의 stderr 줄(소스에서 도출한 예측). Final 은 묶음의 마지막 4줄(오류 목록·건너뛴 규칙·스캔한 파일·매치)이다.
function Get-PostLines {
    @(
        '[01.00][DEBUG](default): Handling notification { "method": "textDocument/didOpen", "params": { "textDocument": { "uri": "x" } }, "jsonrpc": "2.0" }',
        'Scanning single file', 'Scanned single file', (Get-ExternalLine '01.01'),
        '[01.02][INFO]: Scanning 1 targets', '[01.02][DEBUG](default): Running Semgrep with 1 rules', '[01.20][INFO]: Found 1 matches before processing',
        'Semgrep errors: ', 'Semgrep skipped 0 rules', 'Scanned 1 files', 'Found 1 matches'
    )
}
$Script:PostDump = @('[01.21][DEBUG](default): Sending notification {', '  "params": { "diagnostics": [ { "code": "rules-probe.lsp-rules-1-probe" } ] },', '  "method": "textDocument/publishDiagnostics",', '  "jsonrpc": "2.0"', '}')

# didOpen 을 받은 시각부터의 시간표를 만든다. 기본 정상 경로는 진단 알림(+45)이 로그 묶음의 마지막 줄(+53)보다 먼저 온다(diag-first).
# 도착 순서 변형: ok-diag-first / ok-log-first(진단이 묶음 뒤) / ok-split-chunks(양쪽 1바이트씩) / ok-simultaneous(같은 순간에 연달아). 모두 같은 증거를 낸다.
function Get-AfterDidOpenEvents {
    $lines = @(Get-PostLines)
    $diagMsgs = New-Object System.Collections.ArrayList
    [void]$diagMsgs.Add((Get-Publish $Script:TargetUri @((Get-GoodDiagnostic))))
    $diagAt = 45; $logStart = 10; $gap = 5; $dumpAt = 60
    $mode = 'normal'
    $e = New-Object System.Collections.ArrayList
    $withDump = $true; $sendDiag = $true; $sendLog = $true
    $kindDiag = 'out'; $kindLog = 'err'
    switch -CaseSensitive ($Scenario) {
        # 두 묶음 사이 간격은 러너의 읽기 반복 주기보다 충분히 크게 둔다. 그래야 "어느 쪽이 늦은 쪽인가"와 "settle 은 늦은 묶음에서 시작한다"가 시험으로 가려진다(판정은 이 간격과 무관해야 한다).
        # (간격이 500ms 일 때 ok-log-first 에서 두 묶음의 완성 시각이 같은 값으로 찍힌 실행이 있었다. 러너의 읽기 반복 한 번이 길어 한 반복에 함께 읽혔을 것으로 추정하지만 원인을 따로 확인하지는 않았다. 간격을 1.5초로 둔다.)
        'ok-log-first' { $diagAt = 1500 }
        'ok-diag-first' { $diagAt = 20; $logStart = 1500; $dumpAt = 1560 }
        'ok-simultaneous' { $mode = 'simultaneous' }
        'ok-split-chunks' { $kindDiag = 'outbytes'; $kindLog = 'errbytes' }
        'diag-only' { $sendLog = $false; $withDump = $false }
        'log-only' { $sendDiag = $false }
        'duplicate-notification' { [void]$diagMsgs.Add((Get-Publish $Script:TargetUri @((Get-GoodDiagnostic)))) }
        'two-diagnostics' { $diagMsgs[0] = (Get-Publish $Script:TargetUri @((Get-GoodDiagnostic), (Get-GoodDiagnostic))) }
        'other-uri' { $diagMsgs[0] = (Get-Publish 'file:///c%3A/other/ws/lsp-scan-1-target.txt' @((Get-GoodDiagnostic))) }
        'extra-uri' { [void]$diagMsgs.Add((Get-Publish 'file:///c%3A/other/ws/extra.txt' @())) }
        'wrong-code' { $d = Get-GoodDiagnostic; $d.code = 'other.rule'; $diagMsgs[0] = (Get-Publish $Script:TargetUri @($d)) }
        'code-short' { $d = Get-GoodDiagnostic; $d.code = 'lsp-rules-1-probe'; $diagMsgs[0] = (Get-Publish $Script:TargetUri @($d)) }
        'wrong-message' { $d = Get-GoodDiagnostic; $d.message = 'something else'; $diagMsgs[0] = (Get-Publish $Script:TargetUri @($d)) }
        'wrong-severity' { $d = Get-GoodDiagnostic; $d.severity = 1; $diagMsgs[0] = (Get-Publish $Script:TargetUri @($d)) }
        'range-start-shift' { $d = Get-GoodDiagnostic; $d.range.start.character = 9; $diagMsgs[0] = (Get-Publish $Script:TargetUri @($d)) }
        'range-end-plus1' { $d = Get-GoodDiagnostic; $d.range.end.character = 54; $diagMsgs[0] = (Get-Publish $Script:TargetUri @($d)) }
        'range-end-minus1' { $d = Get-GoodDiagnostic; $d.range.end.character = 52; $diagMsgs[0] = (Get-Publish $Script:TargetUri @($d)) }
        'late-log' { $logStart = 10; $gap = 5 }
        'wrong-log-order' {
            $i = [Array]::IndexOf($lines, '[01.02][INFO]: Scanning 1 targets'); $j = [Array]::IndexOf($lines, '[01.20][INFO]: Found 1 matches before processing')
            $t = $lines[$i]; $lines[$i] = $lines[$j]; $lines[$j] = $t
        }
        'engine-error-line' { $lines = @($lines[0..6]) + @('[01.10][ERROR]: engine failure') + @($lines[7..10]) }
        'skipped-rule' { $lines = @($lines | ForEach-Object { if ($_ -ceq 'Semgrep skipped 0 rules') { 'Semgrep skipped 1 rules' } else { $_ } }) }
        'no-targets' { $lines = @($lines[0..2]) + @('[01.05][WARNING]: No targets to scan! Not scanning anything.'); $sendDiag = $false; $withDump = $false }
        'rules-not-loaded' { $lines = @($lines[0..2]) + @('Rules not loaded yet, retry later'); $sendDiag = $false; $withDump = $false }
        'ext-ok-x2' { $lines = @($lines[0..3]) + @((Get-ExternalLine '01.015')) + @($lines[4..10]) }
        'ext-wrong-command' { $lines = @($lines | ForEach-Object { if ($_ -like '*Running external command*') { Get-ExternalLine '01.01' 'hg' } else { $_ } }) }
        'ext-wrong-args' { $lines = @($lines | ForEach-Object { if ($_ -like '*Running external command*') { $_.Replace('"rev-parse"', '"status"') } else { $_ } }) }
        'ext-wrong-path' { $lines = @($lines | ForEach-Object { if ($_ -like '*Running external command*') { Get-ExternalLine '01.01' 'git' 'c:\elsewhere' } else { $_ } }) }
        'ext-missing-post' { $lines = @($lines | ForEach-Object { if ($_ -notlike '*Running external command*') { $_ } }) }
        'forbidden-signal' { $lines = @($lines[0..2]) + @('Scanning workspace') + @($lines[3..10]) }
        'timeout' { $lines = @(); $sendDiag = $false; $sendLog = $false; $withDump = $false }
    }
    if ($Scenario -ceq 'server-request-after-didopen') { [void]$e.Add((New-Ev 20 'out' ([ordered]@{ jsonrpc = '2.0'; id = 9; method = 'window/workDoneProgress/create'; params = [ordered]@{ token = 'late-token' } }))) }
    # 늦은 로그: 마지막 줄이 3초 뒤에 온다(요청이 scanMs 를 줄이면 마감을 넘는다).
    $lateExtra = 0; if ($Scenario -ceq 'late-log') { $lateExtra = 2500 }
    $at = $logStart
    if ($sendLog) {
        $count = $lines.Count
        for ($i = 0; $i -lt $count; $i++) {
            $t = $at; if ($mode -ceq 'simultaneous') { $t = 50 }
            if ($i -eq $count - 1) { $t += $lateExtra }
            [void]$e.Add((New-Ev $t $kindLog $lines[$i]))
            $at += $gap
        }
        if ($withDump) { $d0 = $dumpAt + $lateExtra; foreach ($l in $Script:PostDump) { [void]$e.Add((New-Ev $d0 'err' $l)); $d0++ } }
    }
    if ($sendDiag) {
        $dt = $diagAt; if ($mode -ceq 'simultaneous') { $dt = 50 }
        foreach ($m in $diagMsgs) { [void]$e.Add((New-Ev $dt $kindDiag $m)) }
    }
    switch -CaseSensitive ($Scenario) {
        'extra-scan-during-settle' { [void]$e.Add((New-Ev 300 'err' 'Scanning single file')) }
        'exit-during-settle' { [void]$e.Add((New-Ev 300 'act' 'exit1')) }
    }
    , $e
}

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
        'pre-open-evidence' { [void]$ev.Add((New-Ev 86 'err' 'Scanning single file')); [void]$ev.Add((New-Ev 87 'out' (Get-Publish 'file:///c%3A/x/lsp-scan-1-target.txt' @((Get-GoodDiagnostic))))) }
        'modify-target' { [void]$ev.Add((New-Ev 30 'act' 'modify-target')) }
        'ext-third-attempt' { [void]$ev.Add((New-Ev 82 'err' (Get-ExternalLine '00.835'))) }
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
        'modify-target' { [IO.File]::AppendAllText((Join-Path (Split-Path -Parent $Script:Cwd) 'ws\lsp-scan-1-target.txt'), 'x') }
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
        # 프레임 파서 경계: TS 의 FrameDecoder 가 거절하는 초기화 응답(그 밖의 내용은 정상이다). 러너는 이 응답으로 initialized 를 보내면 안 된다.
        'init-jsonrpc-shy' { Send-Msg ([ordered]@{ jsonrpc = ('2.0' + [string][char]0x00AD); id = $Msg.id; result = (Get-GoodResult $Script:Ver) }) }
        'init-jsonrpc-nul' { Send-Msg ([ordered]@{ jsonrpc = ('2.0' + [string][char]0); id = $Msg.id; result = (Get-GoodResult $Script:Ver) }) }
        'init-jsonrpc-key-shy' { Send-Msg ([ordered]@{ ('jsonrpc' + [string][char]0x00AD) = '2.0'; id = $Msg.id; result = (Get-GoodResult $Script:Ver) }) }
        'init-header-over' { Write-Bytes $stdout (Get-PaddedInitFrame ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult $Script:Ver) }) 8193) }
        'init-header-name-lf' {
            $b = [Text.Encoding]::UTF8.GetBytes(([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult $Script:Ver) } | ConvertTo-Json -Depth 10 -Compress))
            Write-Bytes $stdout (Get-RawFrame @("Content-Length: $($b.Length)", "X-A`n: v") $b)
        }
        'init-header-max' { Write-Bytes $stdout (Get-PaddedInitFrame ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult $Script:Ver) }) 8192) }
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
        'textDocument/didOpen' {
            $Script:DidOpenCount++
            try { $Script:TargetUri = [string]$Msg.params.textDocument.uri } catch { }
            try { Write-Rec 'didopen.log' (('uri={0};lang={1};version={2};textLen={3}' -f [string]$Msg.params.textDocument.uri, [string]$Msg.params.textDocument.languageId, [string]$Msg.params.textDocument.version, ([string]$Msg.params.textDocument.text).Length) + "`n") } catch { }
            if ($Script:DidOpenCount -gt 1) { Write-Rec 'unexpected.log' "second didOpen`n" }
            $Script:DidOpenAt = $clock.ElapsedMilliseconds
            foreach ($x in (Get-AfterDidOpenEvents)) { $x.at = $x.at + $Script:DidOpenAt; [void]$Script:Pending.Add($x) }
        }
        'shutdown' {
            Write-ErrLines $shutdownLines[0..2]
            if ($Script:FingerprintOnShutdown) { Write-Fingerprint }
            if ($Script:ShutdownReply) { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = $null }) }
        }
        'exit' {
            if ($Script:ExitMode -eq 'ignore') { return }
            if ($Scenario -ceq 'late-log') { $Script:ExitRequested = $true; return }
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
                'outbytes' { foreach ($b in (Get-Frame $ev.data)) { Write-Bytes $stdout ([byte[]]@($b)) } }
                'errbytes' { foreach ($b in [Text.Encoding]::UTF8.GetBytes([string]$ev.data + "`r`n")) { Write-Bytes $stderr ([byte[]]@($b)) } }
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
    if ($Script:ExitRequested -and @($Script:Pending | Where-Object { -not $_.done }).Count -eq 0) { Write-ErrLines $shutdownLines[3..6]; exit 0 }
    Start-Sleep -Milliseconds 10
}
exit 0
