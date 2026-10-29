<#
.SYNOPSIS
  lsp-min-runner.ps1 의 송신 제한·종료 정책·중단 조건·환경 격리·거부 경로와 LspMinContract.ps1 의 계약 이식본을 무해한 스텁으로 확인한다.
.DESCRIPTION
  시스템 설정(계정·방화벽·감사·ACL)을 바꾸지 않는다. 임시 샌드박스 폴더에서 현재 사용자로 러너를 부르고, 스텁(lsp-min-stub.ps1)과 시스템 폴더의 실행 파일 하나(whoami.exe 사본)만 쓴다.
  semgrep 계열은 실행하지 않는다. 확인 항목:
    - 구문, BOM, 금지된 명령(Invoke-Expression, 내려받기, semgrep 계열 호출)
    - 계약 이식본 ↔ 실제 TS 모듈 대조(tsx 가 있을 때만. 없으면 SKIPPED 로 표시하고 통과로 세지 않는다): 상수, 환경, initialize 메시지, 초기화 응답 핵심 규칙 표, 중단 문구 표, 감시 폴더 위반 표
    - 프레임 해석 함수(분할·깨짐·한도), 쓰기 방어선(initialized 등 허용 밖 메시지 거절)
    - 러너: 정상, 오류 응답, result 안의 InitializeError, 잘못된 ID, 분할 응답, 무응답+EOF 무시(강제 종료), exit 무시, exit·EOF 무시, 응답 전 종료, 깨진 프레임, 서버 요청 선행,
      중단 조건(A1 분할 포함·A2·A4·A5·A8·외부 중단 파일), 전체 상한(유예 연장 없음), 출력 상한, 자손의 파이프 보유와 정리, 환경 비상속(+Node/libuv 가 채우는 이름이 없음), 거부 경로
    - 러너 결과 → 실제 TS 어댑터(factsFromRunnerResult)·기록 만들기: 같은 규칙으로 해석되는가(tsx 가 있을 때만)
  이 시험의 통과는 "러너와 계약 이식본이 스텁·합성 입력에서 의도대로 동작한다"까지만 뜻한다. 실제 Semgrep 의 동작은 뜻하지 않는다.
.EXAMPLE
  pwsh -NoProfile -File .\tests\Test-LspMinRunner.ps1 -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -NodeDir C:\node -LspMinTs C:\repo\scripts\semgrep-lsp\lsp-min.ts -RunnerResultTs C:\repo\scripts\semgrep-lsp\lsp-min-runner-result.ts
#>
[CmdletBinding()]
param([string]$TsxCmd, [string]$NodeDir, [string]$LspMinTs, [string]$RunnerResultTs)
$ErrorActionPreference = 'Stop'
$windowsDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $windowsDir 'LspMinContract.ps1')
$ps51 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

$results = New-Object System.Collections.ArrayList
function Assert-That([string]$Name, [bool]$Condition, [string]$Detail = '') {
    [void]$results.Add([ordered]@{ name = $Name; pass = $Condition; detail = $Detail })
    if (-not $Condition) { Write-Host ("FAIL  {0}  {1}" -f $Name, $Detail) -ForegroundColor Red }
}
function Skip-Test([string]$Name, [string]$Why) {
    [void]$results.Add([ordered]@{ name = $Name; pass = $null; detail = $Why })
    Write-Host ("SKIPPED  {0}  {1}" -f $Name, $Why) -ForegroundColor Yellow
}

# ── 정적 점검: 구문, BOM, 금지된 명령 ───────────────────────────────────────────
$files = 'LspMinContract.ps1', 'lsp-min-runner.ps1', 'lsp-min-stub.ps1', 'tests\Test-LspMinRunner.ps1'
$forbidden = 'Invoke-Expression', 'iex', 'Invoke-WebRequest', 'Invoke-RestMethod', 'Start-BitsTransfer', 'curl', 'wget'
foreach ($f in $files) {
    $p = Join-Path $windowsDir $f
    if (-not (Test-Path -LiteralPath $p)) { Assert-That "파일 있음 ($f)" $false $p; continue }
    $errs = $null; $tokens = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errs)
    Assert-That "구문 $f ($($PSVersionTable.PSVersion))" ($errs.Count -eq 0) (($errs | ForEach-Object { "$($_.Message)@$($_.Extent.StartLineNumber)" }) -join '; ')
    $b = [IO.File]::ReadAllBytes($p)
    Assert-That "BOM $f" ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) 'Windows PowerShell 5.1 이 한글을 읽으려면 UTF-8 BOM 이 필요하다'
    $hits = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | Where-Object {
            $nm = $_.GetCommandName(); $first = $_.CommandElements[0].Extent.Text.Trim('"', "'")
            ($nm -and ($forbidden -contains $nm -or $nm -match '(?i)^(semgrep|pysemgrep|semgrep-core)(\.exe)?$')) -or ($first -match '(?i)(^|[\\/])(semgrep|pysemgrep|semgrep-core)(\.exe)?$')
        } | ForEach-Object { $_.Extent.Text.Split("`n")[0].Trim() })
    Assert-That "내려받기·Invoke-Expression·semgrep 명령 호출 없음 ($f)" ($hits.Count -eq 0) ($hits -join ' | ')
}

# ── 도구 ────────────────────────────────────────────────────────────────────
function ConvertTo-SortedJson($Obj) {
    if ($null -eq $Obj) { return 'null' }
    if ($Obj -is [string]) { return (ConvertTo-Json -InputObject $Obj -Compress) }
    if ($Obj -is [bool]) { if ($Obj) { return 'true' } else { return 'false' } }
    if ($Obj -is [int] -or $Obj -is [long] -or $Obj -is [double] -or $Obj -is [decimal]) { return ([string]$Obj) }
    if ($Obj -is [System.Collections.IDictionary]) {
        $keys = @($Obj.Keys | ForEach-Object { [string]$_ } | Sort-Object { $_ } -CaseSensitive)
        return '{' + (($keys | ForEach-Object { (ConvertTo-Json -InputObject $_ -Compress) + ':' + (ConvertTo-SortedJson $Obj[$_]) }) -join ',') + '}'
    }
    if ($Obj -is [pscustomobject]) {
        $keys = @($Obj.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object { $_ } -CaseSensitive)
        return '{' + (($keys | ForEach-Object { (ConvertTo-Json -InputObject $_ -Compress) + ':' + (ConvertTo-SortedJson $Obj.PSObject.Properties[$_].Value) }) -join ',') + '}'
    }
    if ($Obj -is [System.Collections.IEnumerable]) { return '[' + ((@($Obj) | ForEach-Object { ConvertTo-SortedJson $_ }) -join ',') + ']' }
    return (ConvertTo-Json -InputObject ([string]$Obj) -Compress)
}
function Read-Json([string]$Json) { $Json | ConvertFrom-Json }

# ── 합성 입력: 초기화 응답의 핵심 규칙 표 ────────────────────────────────────────
$coreBodies = @(
    @{ name = 'good'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":{"textDocumentSync":1},"serverInfo":{"name":"Semgrep","version":"9.9.9"}}}' },
    @{ name = 'empty-caps'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":{}}}' },
    @{ name = 'extra-key'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":{},"extra":1}}' },
    @{ name = 'initialize-error'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"retry":false}}' },
    @{ name = 'retry-with-caps'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":{},"retry":true}}' },
    @{ name = 'error'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","error":{"code":-1,"message":"x"}}' },
    @{ name = 'error-null'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","error":null}' },
    @{ name = 'result-and-error'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":{}},"error":{"code":1,"message":"x"}}' },
    @{ name = 'no-result'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1"}' },
    @{ name = 'result-null'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":null}' },
    @{ name = 'result-array'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":[]}' },
    @{ name = 'result-string'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":"ok"}' },
    @{ name = 'result-number'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":1}' },
    @{ name = 'result-true'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":true}' },
    @{ name = 'no-caps'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"serverInfo":{"name":"x"}}}' },
    @{ name = 'caps-null'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":null}}' },
    @{ name = 'caps-array'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":[]}}' },
    @{ name = 'caps-string'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":"{}"}}' },
    @{ name = 'caps-number'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":0}}' },
    @{ name = 'with-method'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","method":"client/registerCapability","result":{"capabilities":{}}}' },
    @{ name = 'upper-case-key'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","Result":{"capabilities":{}}}' },
    @{ name = 'upper-retry'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":{},"Retry":true}}' }
)
$abortTexts = @('xx refreshing rules yy', 'download registry', 'scanning workspace download', 'starting legacy language server', 'rules refreshed', 'scanned open documents', 'scanning single file', 'the registry', 'no match here', '', 'error initializing server', 'scanned workspace')
$violations = @(
    @{ role = 'WORKSPACE'; path = 'a.txt' }, @{ role = 'RULES_DIR'; path = 'r.yaml' },
    @{ role = 'HOME_DIR'; path = '.semgrep/cache/fingerprinted_ignored_findings/ws.txt' }, @{ role = 'HOME_DIR'; path = '.semgrep\cache\fingerprinted_ignored_findings\ws.txt' },
    @{ role = 'HOME_DIR'; path = '.semgrep/cache/fingerprints/x' }, @{ role = 'HOME_DIR'; path = '.semgrep/settings.yml' }, @{ role = 'HOME_DIR'; path = 'other.txt' }
)
$imageCases = @(@('Python.EXE', $null), @($null, 'C:\Py\Scripts\SEMGREP.exe'), @($null, $null), @('', 'C:\x\a.exe'), @('semgrep-core.exe', 'C:\y\z.exe'))

# ── 계약 이식본 ↔ 실제 TS 모듈 대조 ────────────────────────────────────────────
$tsReady = $TsxCmd -and $LspMinTs -and $RunnerResultTs -and (Test-Path -LiteralPath $TsxCmd) -and (Test-Path -LiteralPath $LspMinTs) -and (Test-Path -LiteralPath $RunnerResultTs)
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('bosang-lm-test-' + [guid]::NewGuid().ToString('N').Substring(0, 12))
[void][IO.Directory]::CreateDirectory($sandbox)

$parityWork = 'C:\work\run-1'
$parityLayout = Get-LspMinLayout -Work $parityWork
$psParity = [ordered]@{
    consts = [ordered]@{
        args = @($Script:LspMinArgs); exe = $Script:LspMinExeName; initId = $Script:LspMinInitId; shutdownId = $Script:LspMinShutdownId; sendOrder = @($Script:LspMinSendOrder)
        limits = $Script:LspMinLimits; scan = @($Script:LspMinScanPatterns); network = @($Script:LspMinNetworkPatterns); stdoutMethods = @($Script:LspMinAbortMethods)
        images = @($Script:LspMinAllowedImages); envNames = @($Script:LspMinEnvNames); watchedRoles = @($Script:LspMinWatchedRoles); homePrefix = $Script:LspMinHomeExpectedPrefix
        initErrorLog = $Script:LspMinInitErrorLogPattern
    }
    layout = $parityLayout
    env = (New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $parityLayout -Url 'http://127.0.0.1:41999')
    init = (New-LspMinInitializeMessage -Layout $parityLayout); shutdown = (New-LspMinShutdownMessage); exit = (New-LspMinExitMessage)
    core = @($coreBodies | ForEach-Object { $c = Get-LspMinInitCore (Read-Json $_.json); [ordered]@{ name = $_.name; ok = [bool]$c.ok; reasons = @($c.reasons) } })
    patterns = @($abortTexts | ForEach-Object { $h = Find-LspMinAbortPattern $_.ToLowerInvariant(); [ordered]@{ s = $_; hit = $h } })
    violations = @($violations | ForEach-Object { [ordered]@{ role = $_.role; path = $_.path; v = [bool](Test-LspMinRootViolation $_.role $_.path) } })
    images = @($imageCases | ForEach-Object { [ordered]@{ name = $_[0]; exe = $_[1]; image = (Get-LspMinImageName $_[0] $_[1]) } })
}
if (-not $tsReady) { Skip-Test '계약(PS) ↔ 실제 TS lsp-min.ts 대조' 'tsx 또는 lsp-min.ts·lsp-min-runner-result.ts 경로가 없어 실행하지 않았다(통과로 세지 않는다)' }
else {
    $driver = Join-Path $sandbox 'parity-driver.mts'
    $driverText = @'
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const lm: any = await import(pathToFileURL(process.argv[2]).href);
const work: string = process.argv[3];
const input: any = JSON.parse(readFileSync(process.argv[4], "utf8"));
const layout = lm.lspMinLayout(work);
const out = {
  consts: {
    args: [...lm.LSP_MIN_ARGS], exe: lm.LSP_MIN_EXE_NAME, initId: lm.LSP_MIN_INIT_ID, shutdownId: lm.LSP_MIN_SHUTDOWN_ID, sendOrder: [...lm.LSP_MIN_SEND_ORDER],
    limits: lm.LSP_MIN_LIMITS, scan: [...lm.ABORT_SCAN_PATTERNS], network: [...lm.ABORT_NETWORK_PATTERNS], stdoutMethods: [...lm.ABORT_STDOUT_METHODS],
    images: [...lm.ALLOWED_IMAGES], envNames: [...lm.LSP_MIN_ENV_NAMES], watchedRoles: [...lm.WATCHED_ROLES], homePrefix: lm.HOME_EXPECTED_PREFIX, initErrorLog: lm.INIT_ERROR_LOG_PATTERN,
  },
  layout,
  env: lm.buildLspMinEnv(layout, "C:\\Windows", "http://127.0.0.1:41999"),
  init: lm.buildInitializeMessage(layout), shutdown: lm.buildShutdownMessage(), exit: lm.buildExitMessage(),
  core: input.bodies.map((b: any) => { const r = lm.classifyInitResponseCore(JSON.parse(b.json)); return { name: b.name, ok: r.ok, reasons: r.ok ? [] : r.reasons }; }),
  patterns: input.texts.map((s: string) => ({ s, hit: lm.findAbortPattern(s.toLowerCase()) })),
  violations: input.violations.map((v: any) => ({ role: v.role, path: v.path, v: lm.rootViolation(v.role, v.path) })),
  images: input.images.map((i: any) => ({ name: i[0], exe: i[1], image: lm.imageNameOf({ pid: 1, ppid: null, startTime: null, name: i[0], executable: i[1], args: null, cwd: null, vanished: false }) })),
};
console.log(JSON.stringify(out));
'@
    [IO.File]::WriteAllText($driver, $driverText, (New-Object Text.UTF8Encoding($false)))
    $inputFile = Join-Path $sandbox 'parity-input.json'
    [IO.File]::WriteAllText($inputFile, (ConvertTo-Json -Depth 6 -InputObject ([ordered]@{ bodies = @($coreBodies | ForEach-Object { [ordered]@{ name = $_.name; json = $_.json } }); texts = @($abortTexts); violations = @($violations | ForEach-Object { [ordered]@{ role = $_.role; path = $_.path } }); images = @($imageCases | ForEach-Object { , @($_[0], $_[1]) }) })), (New-Object Text.UTF8Encoding($false)))
    $oldPath = $env:PATH
    if ($NodeDir) { $env:PATH = $NodeDir + ';' + $env:PATH }
    try { $tsOut = & $TsxCmd $driver $LspMinTs $parityWork $inputFile 2>&1; $tsExit = $LASTEXITCODE } finally { $env:PATH = $oldPath }
    $tsParity = $null; try { $tsParity = ($tsOut | Out-String) | ConvertFrom-Json } catch { }
    Assert-That '계약(PS) ↔ TS: tsx 로 lsp-min.ts 실행 성공' ($tsExit -eq 0 -and $null -ne $tsParity) ("exit=$tsExit " + (($tsOut | Out-String).Trim().Substring(0, [Math]::Min(400, ($tsOut | Out-String).Trim().Length))))
    if ($tsParity) {
        foreach ($k in 'consts', 'layout', 'env', 'init', 'shutdown', 'exit', 'core', 'patterns', 'violations', 'images') {
            $a = ConvertTo-SortedJson $psParity[$k]; $b = ConvertTo-SortedJson $tsParity.$k
            Assert-That "계약(PS) ↔ TS: $k 가 같다" ($a -ceq $b) ("PS: " + $a.Substring(0, [Math]::Min(300, $a.Length)) + " / TS: " + $b.Substring(0, [Math]::Min(300, $b.Length)))
        }
    }
}

# ── 계약 이식본 자체 점검 (TS 없이) ─────────────────────────────────────────────
Assert-That '계약: 초기화 응답 핵심 규칙 — 정상 응답과 빈 capabilities 는 통과, {retry:false}(InitializeError)는 error 필드가 없어도 거절' ((Get-LspMinInitCore (Read-Json $coreBodies[0].json)).ok -and (Get-LspMinInitCore (Read-Json $coreBodies[1].json)).ok -and (-not (Get-LspMinInitCore (Read-Json $coreBodies[3].json)).ok) -and ((Get-LspMinInitCore (Read-Json $coreBodies[3].json)).reasons -contains 'INIT_RESULT_IS_INITIALIZE_ERROR'))
Assert-That '계약: 한도는 새 실행기 전용 상한이다 (150초 / stdout 1 MiB / stderr 256 KiB)' (($Script:LspMinLimits.totalMs -eq 150000) -and ($Script:LspMinLimits.maxStdoutBytes -eq 1048576) -and ($Script:LspMinLimits.maxStderrBytes -eq 262144) -and ($Script:LspMinLimits.initMs -eq 60000) -and ($Script:LspMinLimits.exitMs -eq 30000))
Assert-That '계약: 환경 이름 집합에 SEMGREP_ENABLE_* 가 없고, 만든 환경도 없다' (($Script:LspMinEnvNames -cnotcontains ('SEMGREP_ENABLE_' + 'VERSION_CHECK')) -and ((New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $parityLayout -Url 'http://127.0.0.1:1').Keys -cnotcontains ('SEMGREP_ENABLE_' + 'VERSION_CHECK')) -and ((New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $parityLayout -Url 'http://127.0.0.1:1').Count -eq 11))
$ob = @(
    @{ n = 'initialized 알림'; label = 'exit'; msg = [ordered]@{ jsonrpc = '2.0'; method = 'initialized'; params = @{} } },
    @{ n = 'didOpen'; label = 'exit'; msg = [ordered]@{ jsonrpc = '2.0'; method = 'textDocument/didOpen'; params = @{} } },
    @{ n = '스캔 알림'; label = 'exit'; msg = [ordered]@{ jsonrpc = '2.0'; method = 'semgrep/scanWorkspace'; params = @{ full = $true } } },
    @{ n = 'debug/echo 요청'; label = 'shutdown'; msg = [ordered]@{ jsonrpc = '2.0'; id = 'x'; method = 'debug/echo' } },
    @{ n = '라벨과 다른 메서드'; label = 'initialize'; msg = [ordered]@{ jsonrpc = '2.0'; id = 'x'; method = 'shutdown' } },
    @{ n = 'exit 에 id'; label = 'exit'; msg = [ordered]@{ jsonrpc = '2.0'; id = 1; method = 'exit' } },
    @{ n = 'shutdown 에 id 없음'; label = 'shutdown'; msg = [ordered]@{ jsonrpc = '2.0'; method = 'shutdown' } },
    @{ n = '알 수 없는 라벨'; label = 'initialized'; msg = [ordered]@{ jsonrpc = '2.0'; method = 'initialized' } }
)
foreach ($o in $ob) {
    $threw = $false; try { Assert-LspMinOutbound -Label $o.label -Message $o.msg } catch { $threw = $true }
    Assert-That "쓰기 방어선이 거절한다: $($o.n)" $threw
}
$okMsgs = @(@('initialize', (New-LspMinInitializeMessage -Layout $parityLayout)), @('shutdown', (New-LspMinShutdownMessage)), @('exit', (New-LspMinExitMessage)))
$allPass = $true; foreach ($m in $okMsgs) { try { Assert-LspMinOutbound -Label $m[0] -Message $m[1] } catch { $allPass = $false } }
Assert-That '쓰기 방어선: initialize·shutdown·exit 는 통과한다' $allPass
$frame = ConvertTo-LspMinFrame -Message (New-LspMinExitMessage)
Assert-That '프레임 만들기: 헤더의 Content-Length 가 본문의 UTF-8 바이트 수와 같다' ([Text.Encoding]::ASCII.GetString($frame, 0, 20) -match '^Content-Length: \d+\r\n' -and [int]([regex]::Match([Text.Encoding]::ASCII.GetString($frame), 'Content-Length: (\d+)').Groups[1].Value) -eq ($frame.Length - [Text.Encoding]::ASCII.GetString($frame).IndexOf("`r`n`r`n") - 4))

# ── 프레임 해석 함수(분할·깨짐) ─────────────────────────────────────────────────
$runnerPath = Join-Path $sandbox 'lsp-min-runner.ps1'
foreach ($f in 'LspMinContract.ps1', 'lsp-min-runner.ps1', 'lsp-min-stub.ps1', 'version-runner.ps1', 'version-stub.ps1') { Copy-Item -LiteralPath (Join-Path $windowsDir $f) -Destination $sandbox }
function Get-FrameBytes([string]$Json) {
    $body = [Text.Encoding]::UTF8.GetBytes($Json); $head = [Text.Encoding]::ASCII.GetBytes("Content-Length: $($body.Length)`r`n`r`n")
    $all = New-Object byte[] ($head.Length + $body.Length); [Array]::Copy($head, 0, $all, 0, $head.Length); [Array]::Copy($body, 0, $all, $head.Length, $body.Length); , $all
}
function Invoke-FramerTests {
    . $runnerPath -LoadFunctionsOnly
    function Push-Frames([byte[][]]$Chunks, [int]$Max = 1048576) {
        $fr = New-LspMinFramer; $ms = New-Object IO.MemoryStream; $all = New-Object System.Collections.ArrayList
        foreach ($c in $Chunks) { $ms.Write($c, 0, $c.Length); $m = Step-LspMinFramer $fr $ms $Max; foreach ($x in $m) { [void]$all.Add($x) } }
        [pscustomobject]@{ messages = @($all); failed = $fr.failed; error = $fr.error }
    }
    $f1 = Get-FrameBytes '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":{}}}'
    $f2 = Get-FrameBytes '{"jsonrpc":"2.0","method":"window/logMessage","params":{}}'
    $r = Push-Frames @(, ([byte[]]($f1 + $f2)))
    Assert-That '프레임 해석: 이어 붙은 프레임 둘을 푼다' ($r.messages.Count -eq 2 -and -not $r.failed) "messages=$($r.messages.Count)"
    $cut = [int]($f1.Length / 2)
    $r = Push-Frames @(([byte[]]$f1[0..($cut - 1)]), ([byte[]]$f1[$cut..($f1.Length - 1)]))
    Assert-That '프레임 해석: 가운데서 둘로 나뉘어 와도 하나로 푼다' ($r.messages.Count -eq 1 -and -not $r.failed)
    $bytewise = @(); foreach ($b in $f1) { $bytewise += , ([byte[]]@($b)) }
    $r = Push-Frames $bytewise
    Assert-That '프레임 해석: 한 바이트씩 와도 하나로 푼다' ($r.messages.Count -eq 1 -and -not $r.failed)
    $r = Push-Frames @(, ([byte[]]$f1[0..($f1.Length - 4)]))
    Assert-That '프레임 해석: 덜 온 프레임은 메시지도 오류도 아니다(기다린다)' ($r.messages.Count -eq 0 -and -not $r.failed)
    $h2 = [Text.Encoding]::ASCII.GetBytes("Content-Length: 2`r`n`r`n"); $invalidUtf8 = New-Object byte[] ($h2.Length + 2); [Array]::Copy($h2, 0, $invalidUtf8, 0, $h2.Length); $invalidUtf8[$h2.Length] = 0xC3; $invalidUtf8[$h2.Length + 1] = 0x28
    $badCases = @(
        @{ n = '헤더가 아닌 시작'; b = [Text.Encoding]::ASCII.GetBytes("garbage`r`n`r`n") },
        @{ n = 'Content-Length 없음'; b = [Text.Encoding]::ASCII.GetBytes("X-A: 1`r`n`r`n{}") },
        @{ n = 'Content-Length 가 숫자가 아님'; b = [Text.Encoding]::ASCII.GetBytes("Content-Length: ab`r`n`r`n{}") },
        @{ n = 'Content-Length 0'; b = [Text.Encoding]::ASCII.GetBytes("Content-Length: 0`r`n`r`n") },
        @{ n = 'Content-Length 중복'; b = [Text.Encoding]::ASCII.GetBytes("Content-Length: 2`r`nContent-Length: 2`r`n`r`n{}") },
        @{ n = '본문이 JSON 이 아님'; b = (Get-FrameBytes 'not json') },
        @{ n = '본문이 배열'; b = (Get-FrameBytes '[]') },
        @{ n = 'jsonrpc 가 2.0 이 아님'; b = (Get-FrameBytes '{"jsonrpc":"1.0","id":"a","result":{}}') },
        @{ n = 'method 가 숫자'; b = (Get-FrameBytes '{"jsonrpc":"2.0","method":5}') },
        @{ n = 'id 가 불리언'; b = (Get-FrameBytes '{"jsonrpc":"2.0","id":true,"result":{}}') },
        @{ n = '본문이 잘못된 UTF-8'; b = $invalidUtf8 }
    )
    foreach ($c in $badCases) {
        $r = Push-Frames @(, ([byte[]]$c.b))
        Assert-That "프레임 해석: 깨진 입력은 영구 실패한다 — $($c.n)" ($r.failed -and $r.error.kind -eq 'MALFORMED') "failed=$($r.failed)"
    }
    $r = Push-Frames @(, ([byte[]]$f1)) 10
    Assert-That '프레임 해석: Content-Length 가 한도를 넘으면 실패한다' ($r.failed)
    $fr = New-LspMinFramer; $ms = New-Object IO.MemoryStream; $bad = [Text.Encoding]::ASCII.GetBytes("garbage`r`n`r`n"); $ms.Write($bad, 0, $bad.Length); [void](Step-LspMinFramer $fr $ms 1000)
    $ms.Write($f1, 0, $f1.Length); $m2 = Step-LspMinFramer $fr $ms 1000
    Assert-That '프레임 해석: 한 번 실패하면 이후 바이트로 재동기화하지 않는다' ($fr.failed -and $m2.Count -eq 0)

    # ── 엄격함: 키 이름의 대소문자와 값의 형. PowerShell 의 느슨한 비교(대소문자 무시, 숫자 2.0 == '2.0', 원소 하나짜리 배열 풀기)에 기대지 않는다. ──
    $strictBad = @(
        @{ n = 'JSONRPC(대문자) 키'; b = (Get-FrameBytes '{"JSONRPC":"2.0","id":"a","result":{}}') },
        @{ n = 'jsonrpc 값이 숫자 2.0'; b = (Get-FrameBytes '{"jsonrpc":2.0,"id":"a","result":{}}') },
        @{ n = 'method 가 null'; b = (Get-FrameBytes '{"jsonrpc":"2.0","id":"a","method":null,"result":{}}') },
        @{ n = '원소 하나짜리 배열(배치)'; b = (Get-FrameBytes '[{"jsonrpc":"2.0","id":"a","result":{}}]') },
        @{ n = '원소 둘짜리 배열(배치)'; b = (Get-FrameBytes '[{"jsonrpc":"2.0","id":"a","result":{}},{"jsonrpc":"2.0","id":"b","result":{}}]') },
        @{ n = '앞에 공백이 있는 배열'; b = (Get-FrameBytes "  `t`r`n[{`"jsonrpc`":`"2.0`",`"id`":`"a`",`"result`":{}}]") }
    )
    foreach ($c in $strictBad) {
        $r = Push-Frames @(, ([byte[]]$c.b))
        Assert-That "프레임 해석(엄격): 깨진 입력은 영구 실패한다 — $($c.n)" ($r.failed -and $r.error.kind -eq 'MALFORMED' -and $r.messages.Count -eq 0) "failed=$($r.failed) messages=$($r.messages.Count)"
    }
    $strictGood = @(
        @{ n = 'id 가 소수 1.5'; b = (Get-FrameBytes '{"jsonrpc":"2.0","id":1.5,"result":{}}') },
        @{ n = 'id 가 null'; b = (Get-FrameBytes '{"jsonrpc":"2.0","id":null,"result":{}}') },
        @{ n = 'Id(대문자) 키: 프레임으로는 정상이다(id 키가 없는 메시지로 분류된다)'; b = (Get-FrameBytes '{"jsonrpc":"2.0","Id":"a","result":{}}') },
        @{ n = '앞에 공백이 있는 객체'; b = (Get-FrameBytes "  `t`r`n{`"jsonrpc`":`"2.0`",`"id`":`"a`",`"result`":{}}") }
    )
    foreach ($c in $strictGood) {
        $r = Push-Frames @(, ([byte[]]$c.b))
        Assert-That "프레임 해석(엄격): 정상 입력은 풀린다 — $($c.n)" ($r.messages.Count -eq 1 -and -not $r.failed) "failed=$($r.failed) messages=$($r.messages.Count)"
    }

    # 메시지 분류: TS classifyServerMessage 와 같다. 키 이름은 대소문자 그대로 읽는다.
    $kindCases = @(
        @('response', '{"jsonrpc":"2.0","id":"x","result":{}}'),
        @('invalid', '{"jsonrpc":"2.0","Id":"x","result":{}}'),
        @('invalid', '{"jsonrpc":"2.0","ID":"x","result":{}}'),
        @('response', '{"jsonrpc":"2.0","id":"x","Method":"m","result":{}}'),
        @('server-request', '{"jsonrpc":"2.0","id":7,"method":"m"}'),
        @('notification', '{"jsonrpc":"2.0","method":"m"}'),
        @('invalid', '{"jsonrpc":"2.0","Method":"m"}'),
        @('invalid', '{"jsonrpc":"2.0","id":null,"result":{}}'),
        @('notification', '{"jsonrpc":"2.0","id":null,"method":"m"}'),
        @('response', '{"jsonrpc":"2.0","id":0,"result":{}}'),
        @('response', '{"jsonrpc":"2.0","id":"","result":{}}')
    )
    foreach ($k in $kindCases) {
        $kr = Push-Frames @(, ([byte[]](Get-FrameBytes $k[1])))
        $got = if ($kr.messages.Count -eq 1) { Get-LspMinMessageKind $kr.messages[0] } else { 'NOT_FRAMED' }
        Assert-That "메시지 분류: $($k[1]) → $($k[0])" ($got -ceq $k[0]) "실제: $got"
    }

    # PS(러너가 흐름을 정하는 쪽) ↔ TS(기록을 만드는 쪽): 같은 본문에서 받아들임·분류·핵심 규칙이 같아야 한다.
    $parityBodies = @(
        @{ name = 'normal'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","result":{"capabilities":{}}}' },
        @{ name = 'JSONRPC-key'; json = '{"JSONRPC":"2.0","id":"lsp-min-init-1","result":{"capabilities":{}}}' },
        @{ name = 'Id-key'; json = '{"jsonrpc":"2.0","Id":"lsp-min-init-1","result":{"capabilities":{}}}' },
        @{ name = 'ID-key'; json = '{"jsonrpc":"2.0","ID":"lsp-min-init-1","result":{"capabilities":{}}}' },
        @{ name = 'Method-key-with-id'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","Method":"x","result":{"capabilities":{}}}' },
        @{ name = 'method-null'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","method":null,"result":{"capabilities":{}}}' },
        @{ name = 'method-number'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","method":5,"result":{"capabilities":{}}}' },
        @{ name = 'method-string-with-id'; json = '{"jsonrpc":"2.0","id":"lsp-min-init-1","method":"m","result":{"capabilities":{}}}' },
        @{ name = 'id-true'; json = '{"jsonrpc":"2.0","id":true,"result":{"capabilities":{}}}' },
        @{ name = 'id-object'; json = '{"jsonrpc":"2.0","id":{"a":1},"result":{"capabilities":{}}}' },
        @{ name = 'id-null'; json = '{"jsonrpc":"2.0","id":null,"result":{"capabilities":{}}}' },
        @{ name = 'id-float'; json = '{"jsonrpc":"2.0","id":1.5,"result":{"capabilities":{}}}' },
        @{ name = 'jsonrpc-1.0'; json = '{"jsonrpc":"1.0","id":"a","result":{}}' },
        @{ name = 'jsonrpc-trailing-space'; json = '{"jsonrpc":"2.0 ","id":"a","result":{}}' },
        @{ name = 'jsonrpc-number'; json = '{"jsonrpc":2.0,"id":"a","result":{}}' },
        @{ name = 'jsonrpc-missing'; json = '{"id":"a","result":{}}' },
        @{ name = 'top-level-array'; json = '[{"jsonrpc":"2.0","id":"a","result":{}}]' },
        @{ name = 'top-level-null'; json = 'null' },
        @{ name = 'top-level-string'; json = '"x"' },
        @{ name = 'trailing-garbage'; json = '{"jsonrpc":"2.0","id":"a","result":{}} x' },
        @{ name = 'duplicate-id'; json = '{"jsonrpc":"2.0","id":"a","id":"lsp-min-init-1","result":{"capabilities":{}}}' },
        @{ name = 'bom-prefixed'; json = ([string][char]0xFEFF + '{"jsonrpc":"2.0","id":"a","result":{}}') },
        @{ name = 'notification'; json = '{"jsonrpc":"2.0","method":"semgrep/rulesRefreshed"}' },
        @{ name = 'Method-only'; json = '{"jsonrpc":"2.0","Method":"semgrep/rulesRefreshed"}' }
    )
    if (-not $tsReady) { Skip-Test '프레임·분류 PS ↔ TS 대조' 'tsx 또는 TS 경로가 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        $psRows = @($parityBodies | ForEach-Object {
                $pr = Push-Frames @(, ([byte[]](Get-FrameBytes $_.json)))
                $accepted = ($pr.messages.Count -eq 1 -and -not $pr.failed)
                $kind = $null; $ok = $null; $why = $null
                if ($accepted) {
                    $kind = Get-LspMinMessageKind $pr.messages[0]
                    if ($kind -ceq 'response') { $core = Get-LspMinInitCore $pr.messages[0]; $ok = [bool]$core.ok; $why = (@($core.reasons) -join ',') }
                }
                [ordered]@{ name = $_.name; accepted = $accepted; kind = $kind; ok = $ok; why = $why }
            })
        $fdriver = Join-Path $sandbox 'framer-parity.mts'
        $fdText = @'
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const lm: any = await import(pathToFileURL(process.argv[2]).href);
const fr: any = await import(pathToFileURL(process.argv[3]).href);
const bodies: { name: string; json: string }[] = JSON.parse(readFileSync(process.argv[4], "utf8"));
const out = bodies.map((b) => {
  const body = new TextEncoder().encode(b.json);
  const head = new TextEncoder().encode(`Content-Length: ${body.length}\r\n\r\n`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head, 0);
  all.set(body, head.length);
  const r = new fr.FrameDecoder({ maxMessageBytes: 1048576 }).push(all);
  const accepted = r.messages.length === 1 && !r.error;
  const kind = accepted ? lm.classifyServerMessage(r.messages[0]) : null;
  const core = accepted && kind === "response" ? lm.classifyInitResponseCore(r.messages[0]) : null;
  return { name: b.name, accepted, kind, ok: core ? core.ok : null, why: core ? (core.ok ? "" : core.reasons.join(",")) : null };
});
console.log(JSON.stringify(out));
'@
        [IO.File]::WriteAllText($fdriver, $fdText, (New-Object Text.UTF8Encoding($false)))
        $fInput = Join-Path $sandbox 'framer-parity-input.json'
        [IO.File]::WriteAllText($fInput, (ConvertTo-Json -InputObject @($parityBodies | ForEach-Object { [ordered]@{ name = $_.name; json = $_.json } }) -Depth 4), (New-Object Text.UTF8Encoding($false)))
        $framingTs = Join-Path (Split-Path -Parent $LspMinTs) 'framing.ts'
        $oldPath = $env:PATH
        if ($NodeDir) { $env:PATH = $NodeDir + ';' + $env:PATH }
        try { $fOut = & $TsxCmd $fdriver $LspMinTs $framingTs $fInput 2>&1; $fExit = $LASTEXITCODE } finally { $env:PATH = $oldPath }
        $tsRows = $null; try { $tsRows = ($fOut | Out-String) | ConvertFrom-Json } catch { }
        Assert-That '프레임·분류 PS ↔ TS: tsx 로 대조 실행 성공' ($fExit -eq 0 -and $null -ne $tsRows -and @($tsRows).Count -eq $parityBodies.Count) ("exit=$fExit " + (($fOut | Out-String).Trim().Substring(0, [Math]::Min(300, ($fOut | Out-String).Trim().Length))))
        if ($tsRows) {
            foreach ($row in $psRows) {
                $t = @($tsRows | Where-Object { $_.name -ceq $row.name })[0]
                $a = ConvertTo-SortedJson $row; $b = ConvertTo-SortedJson ([ordered]@{ name = $t.name; accepted = [bool]$t.accepted; kind = $t.kind; ok = $t.ok; why = $t.why })
                Assert-That "프레임·분류 PS ↔ TS: $($row.name) 의 받아들임·분류·핵심 규칙이 같다" ($a -ceq $b) ("PS: $a / TS: $b")
            }
        }
    }

    # ── 프로세스 표본(CIM 조회)에는 시간 제한을 준다: 멈춘 조회가 전체 상한을 넘겨 실행을 늘리지 못하게 ──
    function Get-CimInstance {
        [CmdletBinding()]
        param([string]$ClassName, [string[]]$Property, [uint32]$OperationTimeoutSec = 0)
        $Script:CimCall = @{ ClassName = $ClassName; OperationTimeoutSec = $OperationTimeoutSec; Property = @($Property) }
        if ($Script:CimThrow) { throw 'cim stub failure' }
        @([pscustomobject]@{ ProcessId = 1 })
    }
    $Script:CimThrow = $false; $Script:CimCall = $null
    $rows = Get-LspMinProcessTable -TimeoutSec 3
    Assert-That '프로세스 표본: 조회에 요청한 시간 제한(OperationTimeoutSec)이 그대로 전달된다' ($Script:CimCall.OperationTimeoutSec -eq 3 -and $Script:CimCall.ClassName -ceq 'Win32_Process' -and @($rows).Count -eq 1) ($Script:CimCall | ConvertTo-Json -Compress)
    $null = Get-LspMinProcessTable
    Assert-That '프로세스 표본: 시간 제한을 안 주면 기본 5초가 전달된다(제한 없는 조회가 없다)' ($Script:CimCall.OperationTimeoutSec -eq 5) "전달된 값: $($Script:CimCall.OperationTimeoutSec)"
    $Script:CimThrow = $true
    $failed = Get-LspMinProcessTable -TimeoutSec 2
    Assert-That '프로세스 표본: 조회가 실패하거나 시간 제한에 걸리면 $null 이다(0 건으로 치지 않는다)' ($null -eq $failed)
    $Script:CimThrow = $false
    foreach ($tc in @(@(-5, 0), @(0, 0), @(999, 0), @(1000, 1), @(1999, 1), @(4999, 4), @(5000, 5), @(60000, 5), @(149000, 5))) {
        Assert-That "표본 제한 시간: 남은 $($tc[0])ms → $($tc[1])초 (0 이면 표본을 시작하지 않는다)" ((Get-LspMinSampleTimeoutSec $tc[0]) -eq $tc[1]) "실제: $(Get-LspMinSampleTimeoutSec $tc[0])"
    }

    # ── 쓰기 실패: 실제 파이프의 끊김 시점은 흔들리므로, 가짜 stdin 스트림으로 Send-LspMinMessage 의 반응을 결정적으로 본다 ──
    function New-FakeStdin([string]$FailAt) {
        $o = New-Object psobject -Property @{ WriteCalls = 0; FlushCalls = 0; Fail = $FailAt }
        $o | Add-Member -MemberType ScriptMethod -Name Write -Value { param($b, $off, $n) $this.WriteCalls++; if ($this.Fail -eq 'write') { throw (New-Object IO.IOException 'The pipe is being closed.') } }
        $o | Add-Member -MemberType ScriptMethod -Name Flush -Value { $this.FlushCalls++; if ($this.Fail -eq 'flush') { throw (New-Object IO.IOException 'The pipe has been ended.') } }
        $o
    }
    function New-FakeCtx($Stdin) {
        @{ sw = [Diagnostics.Stopwatch]::StartNew(); sends = (New-Object System.Collections.ArrayList); also = (New-Object System.Collections.ArrayList); trigger = $null; abort = $null; immediate = $false; stdinStream = $Stdin }
    }
    $smallLayout = Get-LspMinLayout -Work 'C:\work\run-1'
    foreach ($wc in @(@('write', 'Write 가 던진다'), @('flush', 'Flush 가 던진다'))) {
        $fake = New-FakeStdin $wc[0]; $Ctx = New-FakeCtx $fake
        $sent = Send-LspMinMessage 'shutdown' (New-LspMinShutdownMessage)
        Assert-That "쓰기 실패($($wc[1])): 보내지 못했다고 돌려주고 STDIN_ERROR 로 곧바로 끝내기로 한다" ($sent -eq $false -and $Ctx.trigger -ceq 'STDIN_ERROR' -and $Ctx.immediate -eq $true -and $Ctx.sends.Count -eq 1 -and $Ctx.sends[0].ok -eq $false -and $Ctx.sends[0].label -ceq 'shutdown') "sent=$sent trigger=$($Ctx.trigger) immediate=$($Ctx.immediate)"
    }
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake
    $sent = Send-LspMinMessage 'exit' (New-LspMinExitMessage)
    Assert-That '쓰기 성공: 한 번 쓰고 비우며, 보냈다고 기록하고 이유를 올리지 않는다' ($sent -eq $true -and $fake.WriteCalls -eq 1 -and $fake.FlushCalls -eq 1 -and $null -eq $Ctx.trigger -and -not $Ctx.immediate -and $Ctx.sends[0].ok -eq $true)
    $hugeLayout = Get-LspMinLayout -Work ('C:\' + ('a' * 4000))
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake
    $sent = Send-LspMinMessage 'initialize' (New-LspMinInitializeMessage -Layout $hugeLayout)
    Assert-That '프레임이 파이프 버퍼 한도(3500바이트)를 넘으면 쓰지 않고 STDIN_ERROR 로 끝내기로 한다 (쓰기가 막힐 수 없다)' ($sent -eq $false -and $fake.WriteCalls -eq 0 -and $Ctx.trigger -ceq 'STDIN_ERROR' -and $Ctx.immediate)
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake
    $threw = $false; try { [void](Send-LspMinMessage 'exit' ([ordered]@{ jsonrpc = '2.0'; method = 'initialized'; params = @{} })) } catch { $threw = $true }
    Assert-That '허용 밖 메시지(initialized)는 방어선이 던지고 스트림에 아무것도 쓰지 않는다' ($threw -and $fake.WriteCalls -eq 0)
    Remove-Variable Ctx -ErrorAction SilentlyContinue
}

# ── 러너 실행 도구 ──────────────────────────────────────────────────────────
$holderMarker = 'Start-Sleep -Seconds 91'
function Get-HolderPids { @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$holderMarker*" } | ForEach-Object { [int]$_.ProcessId }) }
function Get-PingPids { @(Get-CimInstance Win32_Process -Filter "Name='PING.EXE'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*-n 8 127.0.0.1*' } | ForEach-Object { [int]$_.ProcessId }) }
$holdersBefore = Get-HolderPids; $pingsBefore = Get-PingPids

$fakeBinDir = Join-Path $sandbox 'Scripts'; [void][IO.Directory]::CreateDirectory($fakeBinDir)
$fakeSemgrep = Join-Path $fakeBinDir 'semgrep.exe'
Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32\whoami.exe') -Destination $fakeSemgrep      # 내용은 whoami.exe. 이름만 semgrep.exe 인 무해한 사본
$Script:RunCounter = 0
$collected = New-Object System.Collections.ArrayList
$URL = 'http://127.0.0.1:41999'

function Invoke-Runner {
    param(
        [string]$Mode = 'stub', [string]$Scenario = 'ok', $Limits = $null, [scriptblock]$Mutate = $null,
        [int]$AbortAfterMs = 0, [string]$AbortContent = '', [string]$Exe = $ps51, $Args0 = $null, [string]$Name = ''
    )
    $Script:RunCounter++
    $work = Join-Path $sandbox ('w' + $Script:RunCounter)
    $reqDir = Join-Path $sandbox ('r' + $Script:RunCounter); [void][IO.Directory]::CreateDirectory($reqDir)
    $layout = Get-LspMinLayout -Work $work
    $envT = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $layout -Url $URL
    $lim = [ordered]@{}; foreach ($k in $Script:LspMinLimits.Keys) { $lim[$k] = $Script:LspMinLimits[$k] }
    if ($Limits) { foreach ($k in $Limits.Keys) { $lim[$k] = $Limits[$k] } }
    if ($null -eq $Args0) { $Args0 = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-Path $sandbox 'lsp-min-stub.ps1'), $Scenario) }
    $resFile = Join-Path $reqDir 'lsp-min-result.json'
    $req = [ordered]@{ runToken = [guid]::NewGuid().ToString('N'); mode = $Mode; exe = $Exe; args = @($Args0); layout = $layout; env = $envT; limits = $lim; resultFile = $resFile }
    $abortFile = Join-Path $reqDir 'abort.flag'
    if ($AbortAfterMs -gt 0) { $req.abortFile = $abortFile }
    if ($Mutate) { & $Mutate $req }
    $reqFile = Join-Path $reqDir 'request.json'
    [IO.File]::WriteAllText($reqFile, ($req | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath $ps51 -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"{0}"' -f $runnerPath), '-RequestFile', ('"{0}"' -f $reqFile)) -PassThru -WindowStyle Hidden
    if ($AbortAfterMs -gt 0) { Start-Sleep -Milliseconds $AbortAfterMs; [IO.File]::WriteAllText($abortFile, $AbortContent + "`n") }
    $proc.WaitForExit()
    $sw.Stop()
    $r = $null; if (Test-Path -LiteralPath $resFile) { $r = Get-Content -LiteralPath $resFile -Raw -Encoding UTF8 | ConvertFrom-Json }
    if ($Name -and $r) { [void]$collected.Add([ordered]@{ name = $Name; path = $resFile }) }
    [pscustomobject]@{ exit = $proc.ExitCode; wallMs = $sw.ElapsedMilliseconds; result = $r; layout = $layout; token = $req.runToken }
}
function Get-Received($Run) { $f = Join-Path $Run.layout.stateDir 'received.log'; if (Test-Path -LiteralPath $f) { @(Get-Content -LiteralPath $f -Encoding UTF8 | Where-Object { $_ }) } else { @() } }
function Get-SentLabels($Run) { @($Run.result.sends | ForEach-Object { $_.label }) }
function Test-PidAlive([int]$ProcessId) { [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) }
$fast = @{ initMs = 2500; exitMs = 2500; stdinCloseGraceMs = 1000; killConfirmMs = 5000 }

try {
    $env:BOSANG_CANARY_SECRET = 'must-not-leak'; $env:GITHUB_TOKEN_CANARY = 'must-not-leak'; $env:HTTPS_PROXY = 'http://user:pass@127.0.0.1:9'

    Invoke-FramerTests

    # ── 정상 ──
    $r = Invoke-Runner -Scenario 'ok' -Name 'ok'
    $res = $r.result
    Assert-That '정상: 종료 코드 0, 거부·오류 없음, trigger NORMAL' ($r.exit -eq 0 -and -not $res.refused -and -not $res.error -and $res.trigger -eq 'NORMAL') (($res | ConvertTo-Json -Depth 5 -Compress).Substring(0, 300))
    Assert-That '정상: 보낸 것은 initialize → shutdown → exit 셋이 이 순서이고 모두 성공이다' ((Get-SentLabels $r) -join ',' -ceq 'initialize,shutdown,exit' -and @($res.sends | Where-Object { -not $_.ok }).Count -eq 0)
    Assert-That '정상: 스텁이 실제로 받은 메서드가 정확히 initialize, shutdown, exit 이다 (initialized 는 한 번도 가지 않았다)' (((Get-Received $r) -join ',') -ceq 'initialize,shutdown,exit') ((Get-Received $r) -join ',')
    Assert-That '정상: 서버가 스스로 끝났다 — 종료 코드 0, stdin 을 닫지 않았고 강제 종료 신호도 없다' ($res.exit.observed -and $res.exit.code -eq 0 -and -not $res.stdinClosed.byHarness -and $res.kill.count -eq 0) (($res.exit | ConvertTo-Json -Compress) + ' ' + ($res.kill | ConvertTo-Json -Compress))
    Assert-That '정상: 정리가 깔끔하다 — 종료 확인, 스트림 닫힘, 남은 자손 0, 문제 없음' ($res.cleanup.childExitConfirmed -and $res.cleanup.streamsClosed -and $res.cleanup.descendantsAliveAfter -eq 0 -and @($res.cleanup.problems).Count -eq 0) (($res.cleanup | ConvertTo-Json -Compress))
    Assert-That '정상: 전용 홈과 폴더 네 개가 실제로 만들어졌다' ((Test-Path -LiteralPath $r.layout.homeDir -PathType Container) -and (Test-Path -LiteralPath $r.layout.workspace -PathType Container) -and (Test-Path -LiteralPath $r.layout.rulesDir -PathType Container) -and (Test-Path -LiteralPath $r.layout.tmpDir -PathType Container))
    Assert-That '정상: 감시 폴더 셋은 전후 모두 비어 있다' (@($res.roots | Where-Object { $_.filesBefore -ne 0 -or $_.filesAfter -ne 0 }).Count -eq 0 -and @($res.roots).Count -eq 3)
    Assert-That '정상: 원문 stdout 은 initialize 응답 프레임 하나이고 stderr 는 비어 있다' ($res.stdout.state -eq 'EOF' -and $res.stdout.bytesRead -gt 0 -and $res.stderr.bytesRead -eq 0)
    Assert-That '정상: 표본이 돌았다 — 프로세스 표본·폴더 표본 1회 이상, 실패 0, 허용 밖 이미지 없음' ($res.live.processes.samples -ge 1 -and $res.live.files.samples -ge 1 -and $res.live.processes.failures -eq 0 -and @($res.live.processes.disallowed).Count -eq 0)

    # ── 환경 격리 ──
    $r = Invoke-Runner -Scenario 'env-names' -Name 'env-names'
    $envJson = Get-Content -LiteralPath (Join-Path $r.layout.stateDir 'env.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $names = @($envJson.names | ForEach-Object { [string]$_ })
    $requested = @($Script:LspMinEnvNames)
    $psOwn = @('PSModulePath', 'PathExt', 'PSExecutionPolicyPreference')
    $extra = @($names | Where-Object { ($requested -notcontains $_) -and ($psOwn -notcontains $_) })
    Assert-That '환경 격리: 자식 환경변수 이름이 요청한 것(+PowerShell 이 스스로 채우는 몇 개)뿐이다' ($extra.Count -eq 0) ("예상 밖: " + ($extra -join ',') + " / 전체: " + ($names -join ','))
    $libuvAdded = @('HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'WINDIR')
    Assert-That '환경 격리: Node 어댑터(libuv)가 Windows 에서 채워 넣는 일곱 이름(HOMEDRIVE 등)이 이 경로에는 없다' (@($names | Where-Object { $libuvAdded -contains $_ }).Count -eq 0) (($names | Where-Object { $libuvAdded -contains $_ }) -join ',')
    Assert-That '환경 격리: 부모의 canary·프록시·토큰 이름이 없고 SEMGREP_ENABLE_* 도 없다' (@($names | Where-Object { $_ -match 'CANARY|PROXY|TOKEN' -or $_ -ceq ('SEMGREP_ENABLE_' + 'VERSION_CHECK') }).Count -eq 0 -and (@($r.result.runner.envNames) -contains 'BOSANG_CANARY_SECRET'))
    $okVals = $true; foreach ($n in 'PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'SEMGREP_APP_URL') { if ([string]$envJson.values.$n -cne [string](New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $r.layout -Url $URL)[$n]) { $okVals = $false } }
    Assert-That '환경 전달: 자식이 받은 PATH·SYSTEMROOT·TEMP·TMP·USERPROFILE·주소가 요청한 값 그대로이고 부모의 값이 아니다' ($okVals -and [string]$envJson.values.USERPROFILE -ne $env:USERPROFILE) ($envJson.values | ConvertTo-Json -Compress)
    Assert-That '환경 전달: 전용 홈이 서버가 뜰 때 이미 실제 폴더였고, 작업 폴더(cwd)는 상태 폴더다' ($envJson.homeIsDir -eq $true -and ([string]$envJson.cwd).TrimEnd('\') -ieq $r.layout.stateDir.TrimEnd('\')) "cwd=$($envJson.cwd)"

    # ── 초기화 실패: shutdown·exit 를 보내지 않고 stdin 을 닫는다 ──
    foreach ($sc in @(@('error', 'JSON-RPC error 응답'), @('initialize-error', 'result 안의 InitializeError({retry:false})'))) {
        $r = Invoke-Runner -Scenario $sc[0] -Name $sc[0]
        $res = $r.result
        Assert-That "초기화 실패($($sc[1])): initialize 만 보내고 shutdown·exit 는 보내지 않는다" ((Get-SentLabels $r) -join ',' -ceq 'initialize') ((Get-SentLabels $r) -join ',')
        Assert-That "초기화 실패($($sc[1])): stdin 을 닫았고 실제 EOF 로 서버가 끝났다 — 강제 종료 없음" ($res.trigger -eq 'INIT_INVALID' -and $res.stdinClosed.byHarness -and $res.exit.observed -and $res.kill.count -eq 0 -and ((Get-Received $r) -join ',') -ceq 'initialize,<stdin-end>') (((Get-Received $r) -join ',') + ' trigger=' + $res.trigger)
    }
    $r = Invoke-Runner -Scenario 'wrong-id' -Limits $fast -Name 'wrong-id'
    Assert-That '잘못된 ID 의 응답: 응답으로 인정하지 않아 init 시간 초과 → initialize 만 보내고 stdin 을 닫는다' ($r.result.trigger -eq 'INIT_TIMEOUT' -and (Get-SentLabels $r) -join ',' -ceq 'initialize' -and $r.result.stdinClosed.byHarness -and $r.result.timeline.observationMs -ge 2500 -and $r.result.timeline.observationMs -lt 6000) "trigger=$($r.result.trigger) obs=$($r.result.timeline.observationMs)"
    # 키 이름의 대소문자: JSON-RPC 는 구분한다. 러너(흐름)와 TS(기록)의 판정이 같아야 한다. 어긋나면 러너가 응답으로 받아들여 shutdown·exit 를 보내는데 기록은 응답 없음이 된다.
    $r = Invoke-Runner -Scenario 'id-case' -Limits $fast -Name 'id-case'
    Assert-That 'Id(대문자) 키의 응답: id 키가 없는 메시지라 응답으로 인정하지 않는다 — initialize 만 보내고 init 시간 초과' ($r.result.trigger -eq 'INIT_TIMEOUT' -and (Get-SentLabels $r) -join ',' -ceq 'initialize') "trigger=$($r.result.trigger) sent=$((Get-SentLabels $r) -join ',')"
    $r = Invoke-Runner -Scenario 'jsonrpc-case' -Limits $fast -Name 'jsonrpc-case'
    Assert-That 'JSONRPC(대문자) 키의 응답: jsonrpc 필드가 없는 깨진 프레임이다 — FRAME_ERROR 로 곧바로 끝내고 initialize 만 보낸다' ($r.result.trigger -eq 'FRAME_ERROR' -and $r.result.frameError.kind -eq 'MALFORMED' -and (Get-SentLabels $r) -join ',' -ceq 'initialize' -and -not $r.result.stdinClosed.byHarness) "trigger=$($r.result.trigger) sent=$((Get-SentLabels $r) -join ',')"
    $r = Invoke-Runner -Scenario 'method-case' -Name 'method-case'
    Assert-That 'Method(대문자) 멤버가 붙은 응답: method 가 아니므로 응답으로 읽는다 — 정상 경로로 initialize → shutdown → exit' ($r.result.trigger -eq 'NORMAL' -and (Get-SentLabels $r) -join ',' -ceq 'initialize,shutdown,exit') "trigger=$($r.result.trigger) sent=$((Get-SentLabels $r) -join ',')"
    $r = Invoke-Runner -Scenario 'split' -Name 'split'
    Assert-That '분할 응답(한 바이트씩): 하나의 응답으로 읽혀 정상 경로를 탄다' ($r.result.trigger -eq 'NORMAL' -and (Get-SentLabels $r) -join ',' -ceq 'initialize,shutdown,exit')
    $r = Invoke-Runner -Scenario 'server-request' -Name 'server-request'
    Assert-That '서버 요청·알림이 응답보다 먼저 와도 답하지 않는다 — 보낸 것은 정확히 셋' ($r.result.trigger -eq 'NORMAL' -and (Get-SentLabels $r) -join ',' -ceq 'initialize,shutdown,exit' -and ((Get-Received $r) -join ',') -ceq 'initialize,shutdown,exit')

    # ── 종료 정책 ──
    $r = Invoke-Runner -Scenario 'silent-hold' -Limits @{ initMs = 1500; stdinCloseGraceMs = 1000; killConfirmMs = 5000 } -Name 'silent-hold'
    $res = $r.result
    Assert-That '무응답 + EOF 무시: 시간 초과 → stdin 닫기 → 유예 → 강제 종료 한 번, 종료가 확인된다' ($res.trigger -eq 'INIT_TIMEOUT' -and $res.stdinClosed.byHarness -and $res.kill.count -eq 1 -and $res.kill.confirmed -eq $true -and $res.cleanup.childExitConfirmed) (($res.kill | ConvertTo-Json -Compress) + ' obs=' + $res.timeline.observationMs)
    Assert-That '무응답 + EOF 무시: initialize 만 갔고, 관측 구간이 init 한도 + 유예 근처다 (2.5초 안팎)' ((Get-SentLabels $r) -join ',' -ceq 'initialize' -and $res.timeline.observationMs -ge 2400 -and $res.timeline.observationMs -lt 6000) "obs=$($res.timeline.observationMs)"
    Assert-That '무응답 + EOF 무시: 서버 프로세스가 실제로 사라졌다' (-not (Test-PidAlive ([int](Get-Content -LiteralPath (Join-Path $r.layout.stateDir 'pid.txt')))))
    $r = Invoke-Runner -Scenario 'silent' -Limits $fast -Name 'silent'
    Assert-That '무응답(EOF 에는 종료): init 시간 초과 → stdin 닫기 → EOF 로 서버가 끝난다, 강제 종료 없음' ($r.result.trigger -eq 'INIT_TIMEOUT' -and $r.result.stdinClosed.byHarness -and $r.result.kill.count -eq 0 -and $r.result.exit.observed)
    $r = Invoke-Runner -Scenario 'ignore-exit' -Limits $fast -Name 'ignore-exit'
    Assert-That 'exit 무시: 응답 뒤 shutdown·exit 를 보내고, exit 한도 뒤 stdin 을 닫아 끝낸다' ($r.result.trigger -eq 'EXIT_TIMEOUT' -and (Get-SentLabels $r) -join ',' -ceq 'initialize,shutdown,exit' -and $r.result.stdinClosed.byHarness -and $r.result.kill.count -eq 0 -and ((Get-Received $r) -join ',') -ceq 'initialize,shutdown,exit,<stdin-end>') (((Get-Received $r) -join ',') + ' ' + $r.result.trigger)
    $r = Invoke-Runner -Scenario 'ignore-exit-eof' -Limits $fast -Name 'ignore-exit-eof'
    Assert-That 'exit·EOF 모두 무시: exit 한도 + 유예 뒤 강제 종료 한 번' ($r.result.trigger -eq 'EXIT_TIMEOUT' -and $r.result.kill.count -eq 1 -and $r.result.kill.confirmed -eq $true -and $r.result.stdinClosed.byHarness)
    $r = Invoke-Runner -Scenario 'exit-early' -Name 'exit-early'
    Assert-That '응답 없이 서버가 먼저 끝남: 더 보내지 않고(stdin 도 닫지 않고) 정리만 한다' ($r.result.trigger -eq 'CHILD_EXITED_EARLY' -and (Get-SentLabels $r) -join ',' -ceq 'initialize' -and -not $r.result.stdinClosed.byHarness -and $r.result.exit.code -eq 3)
    $r = Invoke-Runner -Scenario 'silent-hold' -Limits @{ totalMs = 2500; initMs = 60000; stdinCloseGraceMs = 10000; killConfirmMs = 5000 } -Name 'total-timeout'
    Assert-That '전체 상한: 닿으면 stdin 닫기·유예 없이 곧바로 강제 종료한다 (단계 한도 60초가 남은 시간으로 줄어든다)' ($r.result.trigger -eq 'TOTAL_TIMEOUT' -and -not $r.result.stdinClosed.byHarness -and $r.result.kill.count -eq 1 -and $r.result.timeline.observationMs -ge 2400 -and $r.result.timeline.observationMs -lt 5000) "obs=$($r.result.timeline.observationMs)"
    $r = Invoke-Runner -Scenario 'silent-hold' -Limits @{ totalMs = 3500; initMs = 1500; stdinCloseGraceMs = 10000; killConfirmMs = 5000 } -Name 'total-clamp'
    Assert-That '전체 상한: stdin 닫기 유예(10초)도 전체 마감을 넘지 못한다 — 1.5초 + 10초가 아니라 3.5초 근처에서 끝난다' ($r.result.timeline.observationMs -ge 3400 -and $r.result.timeline.observationMs -lt 7000 -and $r.result.kill.count -eq 1) "obs=$($r.result.timeline.observationMs) trigger=$($r.result.trigger) also=$(@($r.result.also) -join ',')"

    # ── 중단 조건 ──
    function Assert-Aborted($Run, [string]$Cond, [string]$Label) {
        $x = $Run.result
        Assert-That "라이브 중단 $Label : LIVE_ABORT 이고 조건이 $Cond 다" ($x.trigger -eq 'LIVE_ABORT' -and $x.abort.condition -eq $Cond) (($x.abort | ConvertTo-Json -Compress) + " trigger=$($x.trigger)")
        Assert-That "라이브 중단 $Label : stdin 을 닫지 않고 곧바로 강제 종료 한 번, 종료 확인, 서버 프로세스가 사라졌다" (-not $x.stdinClosed.byHarness -and $x.kill.count -eq 1 -and $x.cleanup.childExitConfirmed -and -not (Test-PidAlive ([int](Get-Content -LiteralPath (Join-Path $Run.layout.stateDir 'pid.txt'))))) (($x.kill | ConvertTo-Json -Compress))
        Assert-That "라이브 중단 $Label : 중단 뒤에 아무 메시지도 가지 않았다 (initialize 만)" ((Get-SentLabels $Run) -join ',' -ceq 'initialize' -and (Get-Received $Run) -join ',' -ceq 'initialize')
    }
    $r = Invoke-Runner -Scenario 'stderr-scan' -Name 'stderr-scan'; Assert-Aborted $r 'A1' 'A1 stderr 문구'
    Assert-That '라이브 중단 A1: 중단 문구가 기록에 남는다' ($r.result.abort.detail -ceq 'refreshing rules') "detail=$($r.result.abort.detail)"
    $r = Invoke-Runner -Scenario 'stderr-split' -Name 'stderr-split'; Assert-Aborted $r 'A1' 'A1 (두 번에 나뉜 문구)'
    $r = Invoke-Runner -Scenario 'stderr-download' -Name 'stderr-download'; Assert-Aborted $r 'A2' 'A2 내려받기 문구'
    $r = Invoke-Runner -Scenario 'publish' -Name 'publish'; Assert-Aborted $r 'A8' 'A8 stdout 진단 알림'
    $r = Invoke-Runner -Scenario 'write-ws' -Name 'write-ws'; Assert-Aborted $r 'A5' 'A5 작업 영역 파일'
    Assert-That '라이브 중단 A5: 작업 영역의 추가된 파일이 사후 비교에도 보인다' ((@($r.result.roots | Where-Object { $_.role -eq 'WORKSPACE' })[0].added -join ',') -ceq 'x.txt')
    $r = Invoke-Runner -Scenario 'spawn-disallowed' -Name 'spawn-disallowed'; Assert-Aborted $r 'A4' 'A4 허용 밖 이미지(ping.exe)'
    Assert-That '라이브 중단 A4: 허용 밖 이미지 이름이 기록된다' (@($r.result.live.processes.disallowed) -contains 'ping.exe') (@($r.result.live.processes.disallowed) -join ',')
    $r = Invoke-Runner -Scenario 'silent-hold' -AbortAfterMs 1500 -AbortContent 'A3:HITS_INCREASED' -Name 'abort-file-a3'; Assert-Aborted $r 'A3' 'A3 외부 중단 파일(수신기 건수 증가)'
    $r = Invoke-Runner -Scenario 'silent-hold' -AbortAfterMs 1500 -AbortContent 'cancel' -Name 'abort-file-a7'; Assert-Aborted $r 'A7' 'A7 외부 중단 파일(취소)'

    # ── 출력 상한 ──
    $r = Invoke-Runner -Scenario 'flood-err' -Name 'flood-err'
    Assert-That 'stderr 상한(256 KiB) 초과: OUTPUT_LIMIT, 곧바로 강제 종료, 붙잡아 둔 바이트는 상한 이하' ($r.result.trigger -eq 'OUTPUT_LIMIT' -and $r.result.stderr.overflow -and $r.result.stderr.bytesKept -le 262144 -and -not $r.result.stdinClosed.byHarness -and $r.result.kill.count -eq 1) "kept=$($r.result.stderr.bytesKept)"
    $r = Invoke-Runner -Scenario 'flood-out' -Name 'flood-out'
    Assert-That 'stdout 상한(1 MiB) 초과: OUTPUT_LIMIT, 곧바로 강제 종료' ($r.result.trigger -eq 'OUTPUT_LIMIT' -and $r.result.stdout.overflow -and $r.result.stdout.bytesKept -le 1048576 -and $r.result.kill.count -eq 1) "kept=$($r.result.stdout.bytesKept)"
    $r = Invoke-Runner -Scenario 'garbage' -Name 'garbage'
    Assert-That '깨진 프레임: FRAME_ERROR, 오류 위치가 기록되고 곧바로 강제 종료한다' ($r.result.trigger -eq 'FRAME_ERROR' -and $r.result.frameError.kind -eq 'MALFORMED' -and -not $r.result.stdinClosed.byHarness -and $r.result.kill.count -eq 1)

    # ── 자손이 파이프를 쥔 경우 ──
    $r = Invoke-Runner -Scenario 'orphan' -Name 'orphan'
    $res = $r.result
    Assert-That '자손의 파이프 보유: 서버는 정상 종료(0)했지만 파이프가 닫히지 않아 정리는 실패로 기록한다 (STREAMS_NOT_CLOSED)' ($res.exit.code -eq 0 -and $res.cleanup.streamsClosed -eq $false -and (@($res.cleanup.problems) -contains 'STREAMS_NOT_CLOSED')) (($res.cleanup | ConvertTo-Json -Compress))
    $leftover = @($res.cleanup.problems | Where-Object { $_ -like 'LEFTOVER_DESCENDANTS_KILLED:*' })
    Assert-That '자손의 파이프 보유: 남은 자손을 찾아 끝내고 그 사실도 정리 문제로 기록한다' ($leftover.Count -eq 1 -and @($res.descendantsLeftoverKilled).Count -ge 1 -and $res.cleanup.descendantsAliveAfter -ge 1) (($res.cleanup | ConvertTo-Json -Compress))
    Assert-That '자손의 파이프 보유: 그 자손 프로세스가 실제로 사라졌다' (@(Get-HolderPids | Where-Object { $holdersBefore -notcontains $_ }).Count -eq 0) ((Get-HolderPids) -join ',')

    # ── 거부 경로 ──
    $refusals = @(
        @{ n = '알 수 없는 mode'; mut = { param($q) $q.mode = 'any-command' }; tok = 'MODE_UNKNOWN' },
        @{ n = 'semgrep-lsp 인데 실행 파일 이름이 semgrep.exe 가 아님'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = $ps51; $q.args = @('lsp', '--debug') }; tok = 'COMMAND_NAME_NOT_ALLOWED' },
        @{ n = 'semgrep-lsp 인데 인자가 [lsp,--debug,--legacy]'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = $fakeSemgrep; $q.args = @('lsp', '--debug', '--legacy') }; tok = 'ARGS_NOT_FIXED' },
        @{ n = 'semgrep-lsp 인데 인자가 [--version]'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = $fakeSemgrep; $q.args = @('--version') }; tok = 'ARGS_NOT_FIXED' },
        @{ n = 'semgrep-lsp 인데 인자가 순서 바뀜'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = $fakeSemgrep; $q.args = @('--debug', 'lsp') }; tok = 'ARGS_NOT_FIXED' },
        @{ n = '실행 파일 경로에 중단 문구(downloads)'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = 'C:\downloads\Scripts\semgrep.exe'; $q.args = @('lsp', '--debug') }; tok = 'PATH_CONTAINS_ABORT_PATTERN:COMMAND' },
        @{ n = '실행 파일이 상대 경로'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = 'Scripts\semgrep.exe'; $q.args = @('lsp', '--debug') }; tok = 'COMMAND_NOT_ABSOLUTE' },
        @{ n = 'stub 인데 허용되지 않은 시나리오'; mut = { param($q) $q.args = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-Path $sandbox 'lsp-min-stub.ps1'), 'format-disk') }; tok = 'STUB_SCENARIO_NOT_ALLOWED' },
        @{ n = 'stub 인데 다른 스크립트'; mut = { param($q) $q.args = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-Path $sandbox 'other.ps1'), 'ok') }; tok = 'STUB_SCRIPT_NOT_ALLOWED' },
        @{ n = '환경에 프록시 이름(HTTPS_PROXY)'; mut = { param($q) $q.env.HTTPS_PROXY = 'http://user:pass@x' }; tok = 'ENV_NAME_NOT_ALLOWED:HTTPS_PROXY' },
        @{ n = '환경에 SEMGREP_ENABLE_*'; mut = { param($q) $q.env[('SEMGREP_ENABLE_' + 'VERSION_CHECK')] = '0' }; tok = ('ENV_NAME_NOT_ALLOWED:SEMGREP_ENABLE_' + 'VERSION_CHECK') },
        @{ n = '환경의 USERPROFILE 이 부모 값'; mut = { param($q) $q.env.USERPROFILE = $env:USERPROFILE }; tok = 'ENV_VALUE_UNEXPECTED:USERPROFILE' },
        @{ n = '환경의 TEMP 가 작업 폴더 밖'; mut = { param($q) $q.env.TEMP = $env:TEMP }; tok = 'ENV_VALUE_UNEXPECTED:TEMP' },
        @{ n = '환경에서 USERPROFILE 이 빠짐'; mut = { param($q) $q.env.Remove('USERPROFILE') }; tok = 'ENV_NAME_MISSING:USERPROFILE' },
        @{ n = '수신기 주소가 루프백이 아님'; mut = { param($q) foreach ($k in 'SEMGREP_APP_URL', 'SEMGREP_METRICS_URL', 'SEMGREP_VERSION_CHECK_URL') { $q.env[$k] = 'http://example.com:80' } }; tok = 'ENV_URL_NOT_LOOPBACK' },
        @{ n = '한도를 기본 상한 위로 올림'; mut = { param($q) $q.limits.totalMs = 999999 }; tok = 'LIMIT_ABOVE_CAP:totalMs' },
        @{ n = '한도가 0'; mut = { param($q) $q.limits.initMs = 0 }; tok = 'LIMIT_INVALID:initMs' },
        @{ n = '한도가 없음'; mut = { param($q) $q.limits.Remove('killConfirmMs') }; tok = 'LIMIT_INVALID:killConfirmMs' },
        @{ n = '배치가 작업 폴더에서 도출한 것과 다름'; mut = { param($q) $q.layout.workspace = (Join-Path $sandbox 'elsewhere') }; tok = 'LAYOUT_MISMATCH' },
        @{ n = '작업 폴더 경로에 중단 문구(downloads)'; mut = { param($q) $w = Join-Path $sandbox 'downloads\run'; $lay = Get-LspMinLayout -Work $w; $q.layout = $lay; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $lay -Url $URL }; tok = 'PATH_CONTAINS_ABORT_PATTERN:WORKSPACE' },
        @{ n = '중단 파일이 이미 있음'; mut = { param($q) $af = Join-Path $sandbox 'preexisting.flag'; [IO.File]::WriteAllText($af, 'x'); $q.abortFile = $af }; tok = 'ABORT_FILE_ALREADY_PRESENT' },
        @{ n = '중단 파일이 상대 경로'; mut = { param($q) $q.abortFile = 'relative.flag' }; tok = 'ABORT_FILE_NOT_ABSOLUTE' },
        @{ n = '설치물 경로에 중단 문구(downloads)'; mut = { param($q) $q.artifacts = @(@{ label = 'w'; path = 'C:\downloads\a.whl' }) }; tok = 'PATH_CONTAINS_ABORT_PATTERN:ARTIFACT' },
        @{ n = '설치물 경로가 상대 경로'; mut = { param($q) $q.artifacts = @(@{ label = 'w'; path = 'rel\a.whl' }) }; tok = 'ARTIFACT_PATH_NOT_ABSOLUTE' }
    )
    foreach ($rf in $refusals) {
        $r = Invoke-Runner -Scenario 'ok' -Mutate $rf.mut -Name ''
        $refusedText = [string]$r.result.refused
        Assert-That "거부: $($rf.n)" ($r.exit -eq 2 -and $refusedText.Contains($rf.tok) -and $r.result.child.started -eq $false -and @($r.result.sends).Count -eq 0) "exit=$($r.exit) refused=$refusedText"
        $leakedValue = ($r.result | ConvertTo-Json -Depth 6 -Compress) -match 'user:pass|must-not-leak'
        Assert-That "거부: $($rf.n) — 사유에 환경 값(토큰·프록시)을 싣지 않는다" (-not $leakedValue)
    }
    $pre = Invoke-Runner -Scenario 'ok' -Mutate { param($q) $q.args = @('x') } -Name ''
    Assert-That '거부된 요청은 아무 폴더도 만들지 않고 아무 프로세스도 띄우지 않는다' (-not (Test-Path -LiteralPath $pre.layout.workspace) -and -not (Test-Path -LiteralPath $pre.layout.homeDir) -and $pre.result.child.started -eq $false)
    # 작업 영역이 비어 있지 않으면 폴더는 있어도 시작하지 않는다.
    $pw = Join-Path $sandbox 'nonempty'; $pl = Get-LspMinLayout -Work $pw; [void][IO.Directory]::CreateDirectory($pl.workspace); [IO.File]::WriteAllText((Join-Path $pl.workspace 'leftover.txt'), 'x')
    $r = Invoke-Runner -Scenario 'ok' -Mutate { param($q) $q.layout = $pl; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl -Url $URL } -Name ''
    Assert-That '거부: 작업 영역이 비어 있지 않으면 시작하지 않는다 (WATCHED_ROOT_NOT_EMPTY:WORKSPACE)' ($r.exit -eq 2 -and ([string]$r.result.refused).Contains('WATCHED_ROOT_NOT_EMPTY:WORKSPACE') -and $r.result.child.started -eq $false) "refused=$($r.result.refused)"
    # semgrep-lsp 모드의 실제 실행 경로(내용은 whoami.exe 사본): 셸 없이 절대 경로 + [lsp, --debug]
    $r = Invoke-Runner -Mode 'semgrep-lsp' -Exe $fakeSemgrep -Args0 @('lsp', '--debug') -Limits @{ initMs = 2500; stdinCloseGraceMs = 1000; killConfirmMs = 5000 } -Name 'fake-semgrep'
    Assert-That 'semgrep-lsp 모드 실행 경로: 이름이 semgrep.exe 인 절대 경로를 [lsp,--debug] 로 셸 없이 부르고, 응답 없이 끝난 자식은 CHILD_EXITED_EARLY 로 기록한다' ($r.result.child.started -eq $true -and -not $r.result.refused -and ([string]$r.result.child.mainModule).Equals($fakeSemgrep, [StringComparison]::OrdinalIgnoreCase) -and @('CHILD_EXITED_EARLY', 'INIT_TIMEOUT') -contains $r.result.trigger) (($r.result | ConvertTo-Json -Depth 5 -Compress).Substring(0, 300))

    # ── 러너 결과 → 실제 TS 어댑터와 기록 만들기 ──
    if (-not $tsReady) { Skip-Test '러너 결과 → 실제 TS factsFromRunnerResult·buildObservationRecord' 'tsx 경로가 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        $pipeDriver = Join-Path $sandbox 'pipe-driver.mts'
        $pipeText = @'
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const lm: any = await import(pathToFileURL(process.argv[2]).href);
const rr: any = await import(pathToFileURL(process.argv[3]).href);
const files: { name: string; path: string }[] = JSON.parse(readFileSync(process.argv[4], "utf8"));
const out = files.map((f) => {
  const json = JSON.parse(readFileSync(f.path, "utf8").replace(/^\uFEFF/, ""));
  const facts = rr.factsFromRunnerResult(json, { runId: "t", expectedVersion: "9.9.9", receiver: { baselineHits: 0, finalHits: 0, samples: 3, failures: 0 } });
  const rec = lm.buildObservationRecord(facts);
  return { name: f.name, status: rec.status, reasons: rec.status_reasons, trigger: rec.termination.trigger, path: rec.termination.path, init: rec.initialize.response, cleanupOk: rec.cleanup.ok, abort: rec.termination.abort, sent: rec.sent.map((s: any) => s.label), version: rec.initialize.server_info?.version ?? null, pin: rec.initialize.pin_version_comparison, provenance: rec.provenance };
});
console.log(JSON.stringify(out));
'@
        [IO.File]::WriteAllText($pipeDriver, $pipeText, (New-Object Text.UTF8Encoding($false)))
        $listFile = Join-Path $sandbox 'pipe-list.json'
        [IO.File]::WriteAllText($listFile, (ConvertTo-Json -InputObject @($collected | ForEach-Object { [ordered]@{ name = $_.name; path = $_.path } }) -Depth 4), (New-Object Text.UTF8Encoding($false)))
        $oldPath = $env:PATH
        if ($NodeDir) { $env:PATH = $NodeDir + ';' + $env:PATH }
        try { $pOut = & $TsxCmd $pipeDriver $LspMinTs $RunnerResultTs $listFile 2>&1; $pExit = $LASTEXITCODE } finally { $env:PATH = $oldPath }
        $pj = $null; try { $pj = ($pOut | Out-String) | ConvertFrom-Json } catch { }
        Assert-That '러너 결과 → TS: tsx 로 어댑터·기록 만들기 실행 성공' ($pExit -eq 0 -and $null -ne $pj -and @($pj).Count -eq $collected.Count) ("exit=$pExit " + (($pOut | Out-String).Trim().Substring(0, [Math]::Min(400, ($pOut | Out-String).Trim().Length))))
        if ($pj) {
            $by = @{}; foreach ($x in @($pj)) { $by[[string]$x.name] = $x }
            $expect = @(
                @('ok', 'OBSERVED', $null), @('split', 'OBSERVED', $null), @('server-request', 'OBSERVED', $null), @('env-names', 'OBSERVED', $null),
                @('error', 'NOT_OBSERVED', 'INIT_ERROR_RESPONSE'), @('initialize-error', 'NOT_OBSERVED', 'INIT_RESULT_IS_INITIALIZE_ERROR'),
                @('wrong-id', 'NOT_OBSERVED', 'INIT_NO_RESPONSE'), @('id-case', 'NOT_OBSERVED', 'INIT_NO_RESPONSE'), @('jsonrpc-case', 'NOT_OBSERVED', 'FRAME_ERROR:MALFORMED'), @('method-case', 'OBSERVED', $null), @('silent', 'NOT_OBSERVED', 'INIT_NO_RESPONSE'), @('silent-hold', 'NOT_OBSERVED', 'INIT_NO_RESPONSE'),
                @('ignore-exit', 'OBSERVED', $null), @('ignore-exit-eof', 'OBSERVED', $null), @('exit-early', 'NOT_OBSERVED', 'CHILD_EXITED_EARLY'),
                @('total-timeout', 'NOT_OBSERVED', 'TOTAL_TIMEOUT'), @('garbage', 'NOT_OBSERVED', 'FRAME_ERROR:MALFORMED'),
                @('flood-err', 'NOT_OBSERVED', 'OUTPUT_LIMIT'), @('flood-out', 'NOT_OBSERVED', 'OUTPUT_LIMIT'),
                @('stderr-scan', 'ABORTED', 'ABORT:A1'), @('stderr-split', 'ABORTED', 'ABORT:A1'), @('stderr-download', 'ABORTED', 'ABORT:A2'), @('publish', 'ABORTED', 'ABORT:A8'),
                @('write-ws', 'ABORTED', 'ABORT:A5'), @('spawn-disallowed', 'ABORTED', 'ABORT:A4'), @('abort-file-a3', 'ABORTED', 'ABORT:A3'), @('abort-file-a7', 'ABORTED', 'ABORT:A7')
            )
            foreach ($e in $expect) {
                $x = $by[$e[0]]
                $okStatus = $null -ne $x -and $x.status -eq $e[1] -and ($null -eq $e[2] -or @($x.reasons) -contains $e[2])
                Assert-That "러너 결과 → TS 기록: $($e[0]) → $($e[1])$(if ($e[2]) { ' (' + $e[2] + ')' })" $okStatus ("실제: " + ($x | ConvertTo-Json -Compress -Depth 3))
            }
            Assert-That '러너 결과 → TS 기록: 정상 실행의 서버 정보·핀 비교·출처가 해석된다 (stub 출처, 핀 9.9.9 일치)' ($by['ok'].version -ceq '9.9.9' -and $by['ok'].pin -ceq 'MATCH' -and $by['ok'].provenance -ceq 'stub' -and (@($by['ok'].sent) -join ',') -ceq 'initialize,shutdown,exit')
            Assert-That '러너 결과 → TS 기록: 자손의 파이프 보유(orphan)는 관측 성립이지만 정리 실패로 따로 기록된다' ($by['orphan'].status -eq 'OBSERVED' -and $by['orphan'].cleanupOk -eq $false) (($by['orphan'] | ConvertTo-Json -Compress))
            Assert-That '러너 결과 → TS 기록: 정상 실행의 정리는 깔끔하다 (cleanup.ok)' ($by['ok'].cleanupOk -eq $true) (($by['ok'] | ConvertTo-Json -Compress))
            Assert-That '러너 결과 → TS 기록: 초기화 실패 두 경로는 stdin 닫기로 끝났다고 기록된다' ($by['error'].path -eq 'STDIN_CLOSED' -and $by['initialize-error'].path -eq 'STDIN_CLOSED')
            Assert-That '러너 결과 → TS 기록: 무응답 + EOF 무시는 강제 종료로 끝났다고 기록된다' ($by['silent-hold'].path -eq 'FORCE_KILLED')
        }
    }
} finally {
    Remove-Item Env:\BOSANG_CANARY_SECRET, Env:\GITHUB_TOKEN_CANARY, Env:\HTTPS_PROXY -ErrorAction SilentlyContinue
    # 시험이 남긴 스텁 자손·ping 이 없어야 한다(있으면 정리 실패이므로 실패로 센다). 남은 것은 치운다.
    $holdersAfter = @(Get-HolderPids | Where-Object { $holdersBefore -notcontains $_ })
    $pingsAfter = @(Get-PingPids | Where-Object { $pingsBefore -notcontains $_ })
    Assert-That '시험 뒤 남은 스텁 자손(대기자)이 없다' ($holdersAfter.Count -eq 0) ("남은 PID: " + ($holdersAfter -join ','))
    foreach ($sp in ($holdersAfter + $pingsAfter)) { Stop-Process -Id $sp -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 300
    try { Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction Stop } catch { Write-Host "샌드박스를 지우지 못했다: $sandbox ($($_.Exception.Message))" -ForegroundColor Yellow }
}

$pass = @($results | Where-Object { $_.pass -eq $true }).Count
$fail = @($results | Where-Object { $_.pass -eq $false }).Count
$skip = @($results | Where-Object { $null -eq $_.pass }).Count
Write-Host ("{0}/{1} 통과, 실패 {2}, 건너뜀 {3}  (엔진 {4})" -f $pass, ($pass + $fail), $fail, $skip, $PSVersionTable.PSVersion)
if ($fail -gt 0) { exit 1 }
exit 0
