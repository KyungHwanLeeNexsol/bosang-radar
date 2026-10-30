<#
.SYNOPSIS
  전용 계정으로 실행되는 LSP-RULES-1 표준 입력 러너(좁은 용도). `semgrep.exe lsp --debug` 를 한 번 띄워 initialize → (조건부) initialized → 장벽 → 짧은 감시 → shutdown → exit 를 보내고, 한도 안에서 결과를 파일에 남긴다.
.DESCRIPTION
  범용 실행기가 아니다. 요청의 mode 는 두 가지뿐이고 각각 실행 파일과 인자가 고정돼 있어 그 밖은 거부한다.
    semgrep-lsp : 실행 파일 이름이 semgrep.exe(드라이브 문자로 시작하는 절대 경로), 인자는 정확히 ["lsp","--debug"]
    stub        : System32 의 Windows PowerShell 5.1 로 이 폴더의 lsp-rules-stub.ps1 을 허용된 시나리오로만 실행(정책·정리 확인용)
  보내는 메시지는 initialize → initialized → shutdown → exit 넷뿐이다(Assert-LrOutbound). 문서 알림·작업 영역 변경·semgrep/scanWorkspace·semgrep/refreshRules·debug/echo·서버 요청에 대한 응답은 보내지 않는다.
  흐름(scripts/semgrep-lsp/lsp-rules-run.ts 와 같다. 판정은 하지 않는다 — 관리자 쪽 TS 모듈이 원문 바이트를 다시 풀어서 한다):
    1. initialize 를 보내고 응답을 initMs 까지 기다린다.
    2. 응답이 핵심 규칙(Get-LspMinInitCore)과 serverInfo 모양을 통과하고, 초기화 오류 로그가 없고, 서버 버전이 요청의 expectedVersion 과 같을 때만 initialized 를 **정확히 한 번** 보낸다.
       그렇지 않으면 initialized 를 보내지 않고 stdin 을 닫는다(INIT_INVALID). 이것은 흐름을 정하는 러너 수준의 확인일 뿐이다.
    3. 장벽(stdout `semgrep/rulesRefreshed` 와 initialized **뒤의** 맨줄 `Scanned open documents` 가 모두 나옴)을 rulesMs 까지 기다린다. 한도는 늘어나지 않는다.
       넘기면 shutdown·exit 를 보내지 않고(A9, RULES_TIMEOUT) stdin 을 닫은 뒤 유예 안에 안 끝나면 프로세스 트리를 강제 종료한다.
    4. 장벽에 닿으면 프로브 해시를 한 번 더 보고, settleMs 동안 감시를 이어간다(금지 신호가 늦게 오는지 보는 짧은 확인이다. 부재의 증명이 아니다).
    5. shutdown 을 보내고(응답을 기다리지 않는다: 서버는 응답하지 않는 것이 정상) exit 를 보낸 뒤 자식이 스스로 끝나기를 exitMs 까지 기다린다.
  중단 조건(LIVE_ABORT): A1 엔진·작업 영역·단일 파일 스캔 신호, stdout publishDiagnostics, initialized 송신 전의 새로고침·스캔 신호; A2 레지스트리·내려받기·토큰·설정 파일 신호와 download/registry 부분 문자열;
    A3/A7 외부 중단 파일; A4 허용 밖 이미지; A5 감시 폴더의 금지 변경(작업 영역은 비어 있어야 하고 규칙 폴더는 프로브 하나, 해시 불변; 홈은 지문 폴더 아래만); A6 허용 밖 서버 요청 또는 3건 이상.
    전체 상한·출력 상한·프레임 오류·stdin 오류·읽기 실패와 함께 stdin 닫기 없이 곧바로 트리를 강제 종료한다. 강제 종료는 한 번만 보낸다. 전체 상한에 닿으면 새 유예를 붙이지 않는다.
  관측 결과와 정리 결과는 따로다: 이 러너는 앞의 둘(흐름의 결과와 프로세스 정리)만 보고한다. 시스템 복구(계정·방화벽·감사·ACL)는 이 러너 밖이다.
  A3(루프백 수신기)은 이 러너 밖에서 읽는다: 관리자 쪽이 수신기를 읽다가 건수가 늘면 `abortFile` 을 만든다. 러너는 매 표본마다 그 파일의 존재를 본다.
  표준 입력·출력은 셸 없이 ProcessStartInfo(UseShellExecute=false)로 다룬다. PATH 를 탐색하지 않는다. 환경은 요청의 env 만 쓰고 이 러너의 환경을 물려주지 않는다.
  -LoadFunctionsOnly: 함수 정의만 읽고 곧바로 돌아온다(시험이 함수를 직접 확인하려고 쓴다). 프로세스를 시작하는 코드보다 앞에서 끝난다.

  요청(JSON): runToken, mode, exe, args[], layout{work,workspace,stateDir,rulesDir,homeDir,tmpDir}(work 에서 Get-LrLayout 으로 다시 도출한 값과 같아야 한다), env(이름 11개 고정, 값은 계약 함수가 만든 것),
    limits(선택: 기본 상한 이하의 값만; totalMs initMs exitMs stdinCloseGraceMs killConfirmMs maxStdoutBytes maxStderrBytes sampleIntervalMs rulesMs settleMs),
    expectedVersion(핀의 서버 버전; 없으면 initialized 를 보내지 않는다), probeB64(프로브 규칙 파일의 바이트; 233바이트이고 sha256 이 고정값과 같아야 한다 — 러너가 규칙 폴더에 쓴다),
    artifacts[{label,path}](선택: 실행 전후 해시), abortFile(선택), resultFile(선택).
  프로브는 이 러너가 쓴다(TS 실행기와 같다): 요청 검사에서 바이트 수·해시를 고정값과 대조하고, 감시 폴더 셋이 비어 있음을 확인한 뒤 규칙 폴더에 배타적으로 쓰고, 쓴 직후·장벽에서·실행 뒤에 다시 해시를 잰다.
  결과(JSON, kind=lsp-rules-runner-result)에는 원문 stdout·stderr(base64), 송신 기록(initialized 포함, 쓰기 직전 읽은 바이트 수), 종료·강제 종료·stdin 닫기 기록, 표본 요약, 감시 폴더의 전후 파일 목록, 프로브 해시, 정리 결과를 적는다.
#>
[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Run')][string]$RequestFile,
    [Parameter(Mandatory, ParameterSetName = 'Load')][switch]$LoadFunctionsOnly
)
$ErrorActionPreference = 'Stop'
# 점 불러오기(dot-source)는 불러온 스크립트의 매개변수($RequestFile)와 $PSCmdlet 을 이 범위에 덮어쓴다. 불러오기 전에 내 값을 따로 저장하고 이후에는 이 사본만 쓴다.
$Script:LrMode = $PSCmdlet.ParameterSetName
$Script:LrRequestFile = $RequestFile
$Script:LrHere = Split-Path -Parent $PSCommandPath
. (Join-Path $Script:LrHere 'LspRulesContract.ps1')
# LSP-MIN-1 러너의 프레임 해석기·표본 도구·실행 중 상태 함수(Add-LspMinTrigger, Step-LspMinStreamTriggers)와 그 밑의 version-runner.ps1 의 스트림·프로세스 트리 도구를 파일을 바꾸지 않고 그대로 가져온다.
. (Join-Path $Script:LrHere 'lsp-min-runner.ps1') -LoadFunctionsOnly

# 이 러너의 파일 해시(프로브 복사 직후·장벽·실행 뒤, 설치물 전후)는 판정의 근거다. LSP-MIN-1 러너의 같은 이름 함수는 Get-FileHash 에 기대는데, 5.1 프로세스가 pwsh 7 의 PSModulePath 를
# 물려받으면 그 명령이 인식되지 않아 해시가 null 이 된다(안전한 쪽으로 거절되지만 관측이 헛돈다). 모듈 가용성에 기대지 않는 .NET 구현으로 이 범위에서만 덮어쓴다(원본 파일은 그대로).
# 읽지 못하면 $null 이다. $null 은 어떤 값과도 같지 않다.
function Get-LspMinSha256 {
    param([string]$Path)
    try { Get-LrSha256Hex ([IO.File]::ReadAllBytes($Path)) } catch { $null }
}

# 스텁 시나리오 허용 목록(lsp-rules-stub.ps1 이 같은 목록으로 한 번 더 거른다).
$Script:LrStubScenarios = @(
    'ok', 'rules-zero', 'yaml-error', 'invalid-rule', 'wrong-file-loaded', 'notification-only', 'log-missing', 'log-variant', 'log-duplicate', 'order-violation',
    'header-variants', 'json-dump-signal-text', 'engine-line-leak', 'download-line', 'registry-line', 'token-line', 'settings-line', 'publish-diagnostics', 'workspace-scan-line',
    'early-signal', 'early-notification', 'initialize-error', 'error-response', 'version-mismatch', 'wrong-id', 'requests-2', 'request-disallowed', 'requests-3', 'request-malformed',
    'delayed-forbidden', 'barrier-timeout', 'exit-ignored', 'exit-ignored-eof', 'nonzero-exit', 'stderr-split', 'stdout-split', 'flood-err', 'flood-out', 'orphan',
    'write-ws', 'write-extra-rules', 'modify-probe', 'shutdown-reply', 'silent', 'silent-hold', 'exit-early', 'exit-during-refresh', 'garbage', 'env-names', 'spawn-disallowed',
    'notification-twice', 'home-write'
)

# ── 작업 폴더 도구 ─────────────────────────────────────────────────

function New-LrWorkDirs {
    param($Layout)
    foreach ($k in 'workspace', 'stateDir', 'rulesDir', 'homeDir', 'tmpDir') { [void][IO.Directory]::CreateDirectory([string](Get-LmProp $Layout $k)) }
}

# 링크·junction 이면 쓰기 경로가 작업 폴더 밖으로 샐 수 있다: 만들기 전에 이미 있는 조각을 보고(Test-LrChainHasReparsePoint), 만든 뒤 쓰기 전에 한 번 더 본다.
# 읽지 못하거나 없는 경로는 $true 다(안전한 쪽). 아직 없을 수 있는 경로에는 Test-LrChainHasReparsePoint 를 쓴다.
function Test-LrReparsePoint {
    param([string]$Path)
    try { ((Get-Item -LiteralPath $Path -Force -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 } catch { $true }
}

# 만들기 전의 검사: 작업 폴더에서 대상까지 **이미 있는** 조각 중 하나라도 링크·junction 이면 $true. 없는 조각을 만나면 거기서 멈춘다(그 아래는 아직 아무것도 없다).
# 전용 계정이 미리 만든 junction(예: lsp-state)이 그 아래 폴더(rules-probe·home·tmp)의 생성을 작업 폴더 밖으로 돌리는 것을 만들기 전에 막으려는 것이다.
# 대상이 작업 폴더 아래가 아니면 $true 다(배치는 작업 폴더에서만 도출한다).
function Test-LrChainHasReparsePoint {
    param([string]$Work, [string]$Target)
    $w = $Work.TrimEnd('\', '/')
    $t = $Target.TrimEnd('\', '/')
    if ($w -eq '' -or -not $t.StartsWith($w, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    # 이름만 앞부분이 같은 형제 폴더(C:\w-sibling\x 와 C:\w)는 작업 폴더 아래가 아니다: 접두어 바로 뒤가 구분자여야 한다.
    if ($t.Length -gt $w.Length) {
        $next = $t.Substring($w.Length, 1)
        if ($next -ne '\' -and $next -ne '/') { return $true }
    }
    $cur = $w
    if (([IO.Directory]::Exists($cur) -or [IO.File]::Exists($cur)) -and (Test-LrReparsePoint $cur)) { return $true }
    $rest = $t.Substring($w.Length).TrimStart('\', '/')
    foreach ($part in ($rest -split '[\\/]+')) {
        if ($part -eq '') { continue }
        $cur = Join-LmPath $cur $part
        if (-not ([IO.Directory]::Exists($cur) -or [IO.File]::Exists($cur))) { break }
        if (Test-LrReparsePoint $cur) { return $true }
    }
    $false
}

# ── 초기화 응답이 initialized 를 보내도 되는가 ─────────────────────────────

# 응답이 핵심 규칙과 serverInfo 모양을 통과하고, 초기화 오류 로그가 없고, 서버 버전이 핀과 같을 때만 ok. TS 의 initGate(analyzeInitResponse + 버전 + initErrorLogged)와 같은 조건이다.
function Test-LrInitGate {
    param($InitMessage, $ExpectedVersion, [bool]$InitErrorLogged)
    $reasons = New-Object System.Collections.ArrayList
    if ($null -eq $InitMessage) { return @{ ok = $false; reasons = @('INIT_NO_RESPONSE') } }
    $core = Get-LspMinInitCore $InitMessage
    foreach ($r in $core.reasons) { [void]$reasons.Add($r) }
    $version = $null
    $result = Get-LrMember $InitMessage 'result'
    if ($core.ok -and (Test-LrPlainObject $result) -and (Test-LrMember $result 'serverInfo')) {
        $info = Get-LrMember $result 'serverInfo'
        if ((Test-LrArrayMember $result 'serverInfo') -or -not (Test-LrPlainObject $info) -or (Get-LrMember $info 'name') -isnot [string]) { [void]$reasons.Add('INIT_SERVERINFO_MALFORMED') }
        elseif (Test-LrMember $info 'version') {
            $v = Get-LrMember $info 'version'
            if ($v -isnot [string]) { [void]$reasons.Add('INIT_SERVERINFO_MALFORMED') } else { $version = $v }
        }
    }
    if ($InitErrorLogged) { [void]$reasons.Add('INIT_ERROR_LOGGED') }
    if ($ExpectedVersion -isnot [string] -or $ExpectedVersion -eq '') { [void]$reasons.Add('PIN_VERSION_NOT_GIVEN') }
    elseif ($version -isnot [string]) { [void]$reasons.Add('PIN_VERSION_NOT_OBSERVED') }
    elseif (-not (Test-LrOrdinalEqual $version $ExpectedVersion)) { [void]$reasons.Add('PIN_VERSION_MISMATCH') }
    @{ ok = ($reasons.Count -eq 0); reasons = @($reasons) }
}

# ── 실행 중 상태($Ctx)를 쓰는 함수 ─────────────────────────────────────────
# $Ctx 는 실행 본문에서 만들고 함수는 부를 때 찾으므로, 시험이 가짜 $Ctx 와 가짜 stdin 스트림으로 불러 쓸 수 있도록 -LoadFunctionsOnly 반환보다 앞에 둔다.

# 정해진 메시지를 stdin 에 쓴다. 쓰기 직전에 방어선(Assert-LrOutbound)을 통과해야 한다. initialized 는 정확히 한 번이다(두 번째 시도는 프로그래머 오류).
# 송신 기록에는 쓰기 직전까지 읽은 stderr·stdout 바이트 수를 남긴다 — initialized 이전 신호를 사후에 가려내는 기준이다.
function Send-LrMessage {
    param([string]$Label, $Message)
    Assert-LrOutbound -Label $Label -Message $Message
    if ($Label -ceq 'initialized') {
        foreach ($s in $Ctx.sends) { if ($s.label -ceq 'initialized') { throw 'initialized는 한 번만 보낸다' } }
    }
    # 곧바로 끝내기로 한 뒤에는 새 메시지를 쓰지 않는다(송신 기록도 남기지 않는다).
    if ($Ctx.immediate) { return $false }
    $rec = [ordered]@{ label = $Label; tMs = [int]$Ctx.sw.ElapsedMilliseconds; ok = $false; stderrBytesAtSend = $null; stdoutBytesAtSend = $null }
    if ($null -ne $Ctx.errState) { $rec.stderrBytesAtSend = [long]$Ctx.errState.total }
    if ($null -ne $Ctx.outState) { $rec.stdoutBytesAtSend = [long]$Ctx.outState.total }
    [void]$Ctx.sends.Add($rec)
    $bytes = ConvertTo-LspMinFrame -Message $Message
    if ($bytes.Length -gt $Script:LspMinMaxFrameBytes) { Add-LspMinTrigger 'STDIN_ERROR'; return $false }
    try { $Ctx.stdinStream.Write($bytes, 0, $bytes.Length); $Ctx.stdinStream.Flush() } catch { Add-LspMinTrigger 'STDIN_ERROR'; return $false }
    $rec.ok = $true
    $true
}

# 대기 중인 출력을 한 번에 버퍼 하나(4096B)씩만 읽으면 상한 감지가 쌓인 양에 비례해 늦어진다(1 MiB 는 256번 루프). 한 루프에서 읽을 수 있는 만큼(최대 300번 ≈ 1.2 MiB, stdout 상한 1 MiB 를 넘는 크기)을 비운다.
# 프레임 파싱(느린 JSON 변환)보다 **먼저** 읽은 양으로 상한을 판단하기 위해서다. 새 바이트가 더 없으면(읽은 양이 늘지 않으면) 곧바로 멈춘다.
# 상한을 넘으면 Step-StreamRead 가 overflow 를 걸고 더 읽지 않으므로 이 반복은 스트림마다 상한까지만 돈다.
function Step-LrStreamDrain {
    param($St)
    for ($i = 0; $i -lt 300; $i++) {
        $before = [long]$St.total
        Step-StreamRead $St
        if ([long]$St.total -eq $before -or $St.eof -or $St.failed -or $St.overflow) { break }
    }
}

if ($Script:LrMode -eq 'Load') { return }

# ── 실행 ───────────────────────────────────────────────────────────

$resultPath = Join-Path (Split-Path -Parent $Script:LrRequestFile) 'lsp-rules-result.json'
$res = [ordered]@{
    schema = 1; kind = 'lsp-rules-runner-result'; runToken = $null; mode = $null; startedUtc = [DateTime]::UtcNow.ToString('o'); finishedUtc = $null
    runner = [ordered]@{ pid = $PID; sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; exe = $null; envNames = @([Environment]::GetEnvironmentVariables().Keys | Sort-Object) }
    request = $null; refused = $null; refusals = @(); error = $null; errorPhase = $null
    child = [ordered]@{ started = $false; pid = $null; startUtc = $null; mainModule = $null; spawnError = $null }
    sends = @()
    stdout = $null; stderr = $null
    frameError = $null; initResponseAtMs = $null
    barrier = [ordered]@{ reachedAtMs = $null; settledAtMs = $null }
    exit = [ordered]@{ observed = $false; code = $null; signal = $null; tMs = $null }
    stdinClosed = [ordered]@{ byHarness = $false; ok = $null; tMs = $null }
    kill = [ordered]@{ count = 0; firstTMs = $null; confirmed = $null }
    trigger = $null; also = @(); abort = $null
    live = $null; roots = @(); artifacts = @()
    probe = [ordered]@{ sourceSha256 = $null; afterCopySha256 = $null; barrierSha256 = $null; afterRunSha256 = $null }
    timeline = [ordered]@{ observationMs = $null; cleanupMs = $null }
    cleanup = [ordered]@{ childExitConfirmed = $false; streamsClosed = $null; descendantsAliveAfter = $null; descendantTracking = $null; dispose = 'NOT_CALLED'; timersCancelled = $true; problems = @() }
    descendantsSeen = @(); descendantsLeftoverKilled = @(); descendantsAliveAfterCleanup = $null; descendantTrackingOk = $true
}
try { $res.runner.exe = (Get-Process -Id $PID).Path } catch { }

# 실행 중 상태(함수들이 함께 쓰는 한 곳)
$Ctx = @{
    sw = $null; limits = $null; layout = $null; sends = (New-Object System.Collections.ArrayList); also = (New-Object System.Collections.ArrayList)
    trigger = $null; abort = $null; immediate = $false
    initAt = $null; framesChecked = 0
    stdinStream = $null; p = $null; exitAt = $null; firstKill = $null; killCount = 0
    errState = $null; outState = $null
}
$p = $null; $streams = $null; $childPid = $null; $childStart = $null; $bodyDone = $false; $observationEnded = $false
$descSeen = @{}
$samplesProc = 0; $failProc = 0; $consProc = 0; $maxDesc = 0; $imagesSeen = @{}; $disallowed = @{}
$samplesFile = 0; $failFile = 0; $consFile = 0; $abortChecks = 0
$watcher = New-LrStderrWatcher
$tracker = New-LrStdoutTracker
try {
    $req = [IO.File]::ReadAllText($Script:LrRequestFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $res.runToken = [string]$req.runToken
    $res.mode = [string]$req.mode
    if ($req.resultFile) { $resultPath = [string]$req.resultFile }
    $args0 = @($req.args | ForEach-Object { [string]$_ })
    $layout = $req.layout
    $Ctx.layout = $layout
    $envReq = $req.env
    $envNames = @(); if ($envReq) { $envNames = @($envReq.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object) }
    $expectedVersion = $null; if ($req.expectedVersion -is [string]) { $expectedVersion = [string]$req.expectedVersion }
    $res.request = [ordered]@{ exe = [string]$req.exe; args = $args0; layoutWork = [string](Get-LmProp $layout 'work'); envNames = $envNames; limits = $req.limits; expectedVersion = $expectedVersion }

    # ── 요청 검증: 이 두 모드 밖은 거부한다(범용 실행기가 되지 않게). 사유 토큰에는 값(경로·환경 값)을 싣지 않는다. ──
    $refusals = New-Object System.Collections.ArrayList
    $static = Get-LrStaticRefusals $req
    foreach ($r in $static.refusals) { [void]$refusals.Add($r) }
    $exe = [string]$req.exe
    if ([string]::IsNullOrWhiteSpace($req.runToken)) { [void]$refusals.Add('RUN_TOKEN_MISSING') }
    if (Test-LrDriveAbsolute $exe) { if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { [void]$refusals.Add('COMMAND_NOT_FOUND') } }
    if (Test-LrOrdinalEqual ([string]$req.mode) 'stub') {
        if (-not $exe.Equals($Script:Ps51Path, [StringComparison]::OrdinalIgnoreCase)) { [void]$refusals.Add('STUB_COMMAND_NOT_ALLOWED') }
        elseif ($args0.Count -ne 7 -or -not (Test-LrOrdinalEqualCI ($args0[0..4] -join ' ') '-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File')) { [void]$refusals.Add('STUB_ARGS_NOT_FIXED') }
        elseif (-not (Test-LrOrdinalEqualCI ([string](Split-Path -Leaf $args0[5])) 'lsp-rules-stub.ps1') -or -not ((Split-Path -Parent $args0[5]).Equals($Script:LrHere, [StringComparison]::OrdinalIgnoreCase))) { [void]$refusals.Add('STUB_SCRIPT_NOT_ALLOWED') }
        elseif (-not (Test-LrOrdinalIn ([string]$args0[6]) $Script:LrStubScenarios)) { [void]$refusals.Add('STUB_SCENARIO_NOT_ALLOWED') }
    }
    $abortFile = $null
    if ($req.abortFile) {
        $abortFile = [string]$req.abortFile
        if (-not [IO.Path]::IsPathRooted($abortFile)) { [void]$refusals.Add('ABORT_FILE_NOT_ABSOLUTE') }
        elseif (Test-Path -LiteralPath $abortFile) { [void]$refusals.Add('ABORT_FILE_ALREADY_PRESENT') }
    }
    if ($refusals.Count -gt 0) {
        $res.refusals = @($refusals | Select-Object -Unique)
        $res.refused = ($res.refusals -join ',')
        throw "REFUSED: $($res.refused)"
    }
    $L = @{}; foreach ($k in $static.limits.Keys) { $L[$k] = [int]$static.limits[$k] }
    $Ctx.limits = $L
    $probeBytes = [byte[]]$static.probeBytes
    $res.probe.sourceSha256 = Get-LrSha256Hex $probeBytes

    # 링크 여부(만들기 전) → 폴더 준비 → 링크 여부(만든 뒤) → 감시 폴더 셋이 비어 있는지 확인(비어 있지 않으면 시작하지 않는다).
    # 만들기 전에 작업 폴더에서 각 배치 경로까지 이미 있는 조각이 링크·junction 이면 아무 폴더도 만들지 않고 거절한다:
    # 만든 뒤에야 보면, 미리 놓인 junction(예: lsp-state)이 그 아래 폴더(rules-probe·home·tmp)의 생성을 이미 작업 폴더 밖으로 돌린 뒤다.
    foreach ($k in 'workspace', 'stateDir', 'rulesDir', 'homeDir', 'tmpDir') {
        if (Test-LrChainHasReparsePoint ([string](Get-LmProp $layout 'work')) ([string](Get-LmProp $layout $k))) { [void]$refusals.Add('PATH_ESCAPES_WORK') }
    }
    if ($refusals.Count -gt 0) { $res.refusals = @($refusals | Select-Object -Unique); $res.refused = ($res.refusals -join ','); throw "REFUSED: $($res.refused)" }
    New-LrWorkDirs $layout
    foreach ($d in @([string](Get-LmProp $layout 'work'), [string](Get-LmProp $layout 'stateDir'), [string](Get-LmProp $layout 'workspace'), [string](Get-LmProp $layout 'rulesDir'), [string](Get-LmProp $layout 'homeDir'), [string](Get-LmProp $layout 'tmpDir'))) {
        if (Test-LrReparsePoint $d) { [void]$refusals.Add('PATH_ESCAPES_WORK') }
    }
    if ($refusals.Count -gt 0) { $res.refusals = @($refusals | Select-Object -Unique); $res.refused = ($res.refusals -join ','); throw "REFUSED: $($res.refused)" }
    foreach ($role in $Script:LspMinWatchedRoles) {
        $files = Get-LspMinRootFiles (Get-LrRootPath $layout $role)
        if ($files.Count -gt 0) { [void]$refusals.Add("WATCHED_ROOT_NOT_EMPTY:$role") }
    }
    if ($refusals.Count -gt 0) { $res.refusals = @($refusals); $res.refused = ($refusals -join ','); throw "REFUSED: $($res.refused)" }

    # 프로브 쓰기: 배타 쓰기 → 해시 대조 → 규칙 폴더에 그 파일 하나뿐이고 나머지 감시 폴더는 비어 있는지 확인.
    $probePath = Get-LrProbePath $layout
    try {
        $fsOut = New-Object IO.FileStream($probePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $fsOut.Write($probeBytes, 0, $probeBytes.Length) } finally { $fsOut.Dispose() }
    } catch { [void]$refusals.Add('PROBE_NOT_WRITTEN') }
    if ($refusals.Count -eq 0) {
        $res.probe.afterCopySha256 = Get-LspMinSha256 $probePath
        if ($res.probe.afterCopySha256 -cne $Script:LrProbeSha256) { [void]$refusals.Add('PROBE_COPY_HASH_MISMATCH') }
    }
    $roots = New-Object System.Collections.ArrayList
    if ($refusals.Count -eq 0) {
        foreach ($role in $Script:LspMinWatchedRoles) {
            $now0 = Get-LspMinRootFiles (Get-LrRootPath $layout $role)
            $want = $(if ($role -ceq 'RULES_DIR') { 1 } else { 0 })
            if ($now0.Count -ne $want) { [void]$refusals.Add("WATCHED_ROOT_UNEXPECTED:$role") }
            [void]$roots.Add([ordered]@{ role = $role; filesBefore = $now0.Count; filesAfter = $null; added = @(); removed = @() })
        }
    }
    if ($refusals.Count -gt 0) { $res.refusals = @($refusals); $res.refused = ($refusals -join ','); throw "REFUSED: $($res.refused)" }
    $res.roots = @($roots)
    $arts = New-Object System.Collections.ArrayList
    foreach ($a in @($req.artifacts)) { if ($null -ne $a) { [void]$arts.Add([ordered]@{ label = [string]$a.label; path = [string]$a.path; before = (Get-LspMinSha256 ([string]$a.path)); after = $null }) } }

    # ── 시작: 환경은 요청의 것만. 이 프로세스의 환경을 물려주지 않는다. cwd 는 상태 폴더다. ──
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = ConvertTo-ArgumentString $args0
    $psi.WorkingDirectory = [string](Get-LmProp $layout 'stateDir')
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.EnvironmentVariables.Clear()
    foreach ($pr in $envReq.PSObject.Properties) { $psi.EnvironmentVariables[[string]$pr.Name] = [string]$pr.Value }

    $sw = [Diagnostics.Stopwatch]::StartNew()
    $Ctx.sw = $sw
    try { $p = [Diagnostics.Process]::Start($psi) } catch { $res.child.spawnError = $_.Exception.Message; Add-LspMinTrigger 'SPAWN_FAILED'; throw }
    $Ctx.p = $p
    $res.child.started = $true; $res.child.pid = $p.Id
    $childPid = $p.Id
    try { $childStart = $p.StartTime; $res.child.startUtc = $childStart.ToUniversalTime().ToString('o') } catch { }
    try { $res.child.mainModule = $p.MainModule.FileName } catch { $res.child.mainModule = $null }
    $Ctx.stdinStream = $p.StandardInput.BaseStream
    $streams = @(
        (New-StreamState 'stdout' $p.StandardOutput.BaseStream ([int]$L.maxStdoutBytes)),
        (New-StreamState 'stderr' $p.StandardError.BaseStream ([int]$L.maxStderrBytes))
    )
    $out = $streams[0]; $err = $streams[1]
    $out.consumed = 0; $err.consumed = 0
    $Ctx.outState = $out; $Ctx.errState = $err
    $framer = New-LspMinFramer
    $stderrDone = $false

    # A4 허용 이미지: 실제 모드는 계약 목록 그대로. 스텁 모드에서만 스텁 서버 본체인 powershell.exe 를 더한다(자손은 여전히 이 목록으로 걸러진다).
    $allowedImages = @($Script:LspMinAllowedImages)
    if (Test-LrOrdinalEqual ([string]$res.mode) 'stub') { $allowedImages += 'powershell.exe' }

    $state = 'INIT_WAIT'; $stateAt = 0; $lastSample = -1000; $exitSeenAt = $null; $stdinClosed = $false
    $drainPrev = -1; $drainCount = 0; $barrierDeadline = 0; $settleDeadline = 0
    # 띄운 즉시 initialize 를 먼저 보낸다(표본은 그 뒤에 돈다). 응답은 init 한도까지 기다린다.
    $deadline = [int]$sw.ElapsedMilliseconds + $L.initMs
    [void](Send-LrMessage 'initialize' (New-LrInitializeMessage -Layout $layout))

    $closeStdin = {
        if (-not $res.stdinClosed.byHarness) {
            $res.stdinClosed.byHarness = $true; $res.stdinClosed.tMs = [int]$sw.ElapsedMilliseconds
            try { $p.StandardInput.Close(); $res.stdinClosed.ok = $true } catch { $res.stdinClosed.ok = $false }
        }
    }

    while ($true) {
        foreach ($x in $streams) { Step-LrStreamDrain $x }
        $now = [int]$sw.ElapsedMilliseconds
        $bytesNow = $out.total + $err.total

        # stdout: 새 바이트를 프레임으로, 완성된 메시지를 감시기에 먹인다.
        Step-LspMinStreamTriggers $out
        if ($out.failed) { $res.child.streamReadFailed = $true }
        if ($out.ms.Length -gt $out.consumed -or $framer.pos -lt $out.ms.Length) {
            $out.consumed = [int]$out.ms.Length
            $msgs = Step-LspMinFramer $framer $out.ms $L.maxStdoutBytes
            if ($framer.failed -and $null -eq $res.frameError) { $res.frameError = $framer.error; Add-LspMinTrigger 'FRAME_ERROR' }
            foreach ($m in $msgs) {
                $Ctx.framesChecked++
                $hadInit = ($null -ne $tracker.analysis.initMessage)
                $abortHit = Invoke-LrStdoutTracker $tracker $m
                if (-not $hadInit -and $null -ne $tracker.analysis.initMessage) { $Ctx.initAt = $now }
                if ($null -ne $abortHit) { Add-LspMinTrigger 'LIVE_ABORT' $abortHit.condition $abortHit.detail }
            }
        }
        # stderr: 새 바이트를 감시기에 먹인다(줄 단위 신호로 풀고 청크 경계에 걸친 문구도 잡는다).
        Step-LspMinStreamTriggers $err
        if ($err.failed) { $res.child.streamReadFailed = $true }
        if ($err.ms.Length -gt $err.consumed) {
            $count = [int]$err.ms.Length - $err.consumed
            $chunk = New-Object byte[] $count
            [Array]::Copy($err.ms.GetBuffer(), $err.consumed, $chunk, 0, $count)
            $err.consumed = [int]$err.ms.Length
            $hit = Add-LrStderrChunk $watcher $chunk $count
            if ($null -ne $hit) { Add-LspMinTrigger 'LIVE_ABORT' $hit.condition $hit.detail }
        }
        if ($err.eof -and -not $stderrDone) {
            $stderrDone = $true
            $hit = Complete-LrStderrWatcher $watcher
            if ($null -ne $hit) { Add-LspMinTrigger 'LIVE_ABORT' $hit.condition $hit.detail }
        }

        if ($p.HasExited -and $null -eq $Ctx.exitAt) { $Ctx.exitAt = $now; $res.exit.observed = $true; $res.exit.tMs = $now; try { $res.exit.code = $p.ExitCode } catch { } }
        if ($now -ge $L.totalMs) { Add-LspMinTrigger 'TOTAL_TIMEOUT' }

        # 표본(실시간 감시): 중단 파일, 프로세스 이미지, 감시 폴더.
        if (-not $Ctx.immediate -and ($now - $lastSample) -ge $L.sampleIntervalMs) {
            $lastSample = $now
            if ($null -ne $abortFile) {
                $abortChecks++
                if (Test-Path -LiteralPath $abortFile) {
                    $first = ''; try { $first = ([IO.File]::ReadAllText($abortFile, [Text.Encoding]::UTF8)).Split("`n")[0].Trim() } catch { }
                    if ($first -cmatch '^(A3|A7):[A-Z_]{1,40}\z') { Add-LspMinTrigger 'LIVE_ABORT' $first.Substring(0, 2) $first.Substring(3) }
                    else { Add-LspMinTrigger 'LIVE_ABORT' 'A7' 'ABORT_FILE' }
                }
            }
            # 전체 마감까지 1초도 남지 않았으면 프로세스 표본을 시작하지 않는다(조회가 마감을 넘기지 못하게). 마감은 이어지는 반복에서 위의 TOTAL_TIMEOUT 확인이 처리한다.
            $sampleSec = Get-LspMinSampleTimeoutSec ([int]($L.totalMs - [int]$sw.ElapsedMilliseconds))
            if (-not $Ctx.immediate -and -not $p.HasExited -and $sampleSec -gt 0) {
                $samplesProc++
                $tbl = Get-LspMinProcessTable -TimeoutSec $sampleSec
                if ($null -eq $tbl) {
                    $failProc++; $consProc++
                    if ($consProc -ge $Script:LspMinConsecutiveFailures) { Add-LspMinTrigger 'LIVE_ABORT' 'A4' 'LIST_FAILED' }
                } else {
                    $consProc = 0
                    $desc = Get-DescendantRecords $childPid $childStart $tbl
                    $maxDesc = [Math]::Max($maxDesc, @($desc).Count)
                    $rootRec = @($tbl | Where-Object { [int]$_.ProcessId -eq $childPid }) | Select-Object -First 1
                    $all = @($desc); if ($null -ne $rootRec) { $all += $rootRec }
                    foreach ($d in $all) {
                        $key = '{0}|{1}' -f $d.ProcessId, $d.CreationDate.ToUniversalTime().ToString('o')
                        if (-not $descSeen.ContainsKey($key)) { $descSeen[$key] = [ordered]@{ pid = [int]$d.ProcessId; parentPid = [int]$d.ParentProcessId; image = (Get-LspMinImageName $d.Name $d.ExecutablePath); exe = $d.ExecutablePath; firstSeenMs = $now } }
                        $img = Get-LspMinImageName $d.Name $d.ExecutablePath
                        if ($null -eq $img) { $disallowed['UNKNOWN_IMAGE'] = $true; Add-LspMinTrigger 'LIVE_ABORT' 'A4' 'UNKNOWN_IMAGE' }
                        else {
                            $imagesSeen[$img] = $true
                            if (-not (Test-LrOrdinalIn ([string]$img) $allowedImages)) { $disallowed[$img] = $true; Add-LspMinTrigger 'LIVE_ABORT' 'A4' $img }
                        }
                    }
                }
            }
            if (-not $Ctx.immediate) {
                $samplesFile++
                $failedThis = $false
                foreach ($role in $Script:LspMinWatchedRoles) {
                    $list = $null
                    try { $list = Get-LspMinRootFiles (Get-LrRootPath $layout $role) } catch { $failedThis = $true; $failFile++; continue }
                    foreach ($f in $list) { if (Test-LrRootViolation $role $f) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' $role; break } }
                    # 규칙 폴더에서 프로브가 없어져도 위반이다.
                    if ($role -ceq 'RULES_DIR') {
                        $hasProbe = $false
                        foreach ($f in $list) { if (Test-LrOrdinalEqual (ConvertTo-LrJsLower ([string]$f)) $Script:LrProbeFile) { $hasProbe = $true } }
                        if (-not $hasProbe) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' 'PROBE_MISSING' }
                    }
                }
                if ($failedThis) { $consFile++ } else { $consFile = 0 }
                if ($consFile -ge $Script:LspMinConsecutiveFailures) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' 'LIST_FAILED' }
            }
        }
        if ($Ctx.immediate) { break }

        # 상태 흐름
        switch ($state) {
            'INIT_WAIT' {
                if ($null -ne $tracker.analysis.initMessage) {
                    $gate = Test-LrInitGate $tracker.analysis.initMessage $expectedVersion $watcher.initErrorLogged
                    if ($gate.ok) { $state = 'PRE_INITIALIZED_DRAIN'; $drainPrev = -1; $drainCount = 0 }
                    else { Add-LspMinTrigger 'INIT_INVALID'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now }
                } elseif ($out.eof) {
                    Add-LspMinTrigger 'CHILD_EXITED_EARLY'
                } elseif ($now -ge $deadline) {
                    Add-LspMinTrigger 'INIT_TIMEOUT'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now
                }
            }
            'PRE_INITIALIZED_DRAIN' {
                # initialized 를 보내기 전에, 이미 와 있는 바이트가 모두 "initialized 이전"으로 해석되도록 새 바이트가 더 오지 않을 때까지(최대 20번) 한 번 더 읽는다.
                $drainCount++
                if ($bytesNow -ne $drainPrev -and $drainCount -lt 20) { $drainPrev = $bytesNow }
                else {
                    $gate = Test-LrInitGate $tracker.analysis.initMessage $expectedVersion $watcher.initErrorLogged
                    if (-not $gate.ok) { Add-LspMinTrigger 'INIT_INVALID'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now }
                    else {
                        # 쓰기 직전에 감시기에 알려 이 시점 이후의 새로고침·스캔 줄을 정상 신호로 읽게 한다.
                        $watcher.initializedSent = $true
                        $tracker.initializedSent = $true
                        if (Send-LrMessage 'initialized' (New-LrInitializedMessage)) {
                            $state = 'BARRIER_WAIT'
                            $e0 = [int]$sw.ElapsedMilliseconds; $barrierDeadline = $e0 + [Math]::Max(0, [Math]::Min($L.rulesMs, $L.totalMs - $e0))   # 시각을 한 번만 읽는다: 두 번 읽으면 장벽 마감이 전체 마감보다 1ms 일찍 끝나 RULES_TIMEOUT 이 TOTAL_TIMEOUT 보다 먼저 걸린다
                        }
                    }
                }
            }
            'BARRIER_WAIT' {
                if ($p.HasExited) { Add-LspMinTrigger 'CHILD_EXITED_EARLY' }
                elseif ((Test-LrRulesRefreshedSeen $tracker) -and $watcher.scannedOpenDocumentsSeen) {
                    $res.barrier.reachedAtMs = $now
                    $res.probe.barrierSha256 = Get-LspMinSha256 $probePath
                    if ($res.probe.barrierSha256 -cne $Script:LrProbeSha256) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' 'PROBE_CHANGED' }
                    else { $state = 'SETTLE'; $settleDeadline = $now + [Math]::Max(0, [Math]::Min($L.settleMs, $L.totalMs - $now)) }
                } elseif ($now -ge $barrierDeadline) {
                    Add-LspMinTrigger 'RULES_TIMEOUT' 'A9' 'BARRIER_LIMIT'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now
                }
            }
            'SETTLE' {
                if ($p.HasExited) { Add-LspMinTrigger 'CHILD_EXITED_EARLY' }
                elseif ($now -ge $settleDeadline) {
                    $res.barrier.settledAtMs = $now
                    $exitDeadline = $now + $L.exitMs
                    if (-not (Send-LrMessage 'shutdown' (New-LrShutdownMessage))) { break }
                    if (-not (Send-LrMessage 'exit' (New-LrExitMessage))) { break }
                    $state = 'EXIT_WAIT'; $deadline = $exitDeadline
                }
            }
            'EXIT_WAIT' {
                if ($p.HasExited) { $state = 'DONE' }
                elseif ($now -ge $deadline) { Add-LspMinTrigger 'EXIT_TIMEOUT'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now }
            }
            'CLOSE_WAIT' {
                if ($p.HasExited) { $state = 'DONE' }
                elseif (($now - $stateAt) -ge $L.stdinCloseGraceMs) { $state = 'KILL' }
            }
        }
        if ($Ctx.immediate) { break }
        if ($state -eq 'KILL') { break }
        if ($p.HasExited) {
            if ($out.eof -and $err.eof) { break }
            if ($null -eq $exitSeenAt) { $exitSeenAt = $now }
            elseif (($now - $exitSeenAt) -gt 2000) { break }      # 종료 뒤 파이프가 안 닫히면(자손이 쥐고 있음) 2초만 더 기다린다
        }
        Start-Sleep -Milliseconds 15
    }
    $now = [int]$sw.ElapsedMilliseconds

    # ── 끝내기: 아직 살아 있으면 트리를 강제 종료한다(한 번만). ──
    if (-not $p.HasExited) {
        [void](Stop-ProcessTree $childPid $childStart)
        $Ctx.killCount = 1; $Ctx.firstKill = $now
    }
    $observationEnd = $now
    if ($null -ne $Ctx.firstKill) { $observationEnd = $Ctx.firstKill } elseif ($null -ne $Ctx.exitAt) { $observationEnd = $Ctx.exitAt }
    $observationEnded = $true      # 여기서부터 정리 구간이다: 이 뒤에 던지면 errorPhase 가 CLEANUP 이 되어 관측 결과에는 영향을 주지 않는다
    $cleanupStart = [int]$sw.ElapsedMilliseconds
    $windowEnd = $cleanupStart + $L.killConfirmMs
    $gone = $p.WaitForExit([int]$L.killConfirmMs)
    if ($null -eq $Ctx.exitAt -and $p.HasExited) { $Ctx.exitAt = [int]$sw.ElapsedMilliseconds; $res.exit.observed = $true; $res.exit.tMs = $Ctx.exitAt; try { $res.exit.code = $p.ExitCode } catch { } }
    $res.cleanup.childExitConfirmed = [bool]$gone
    if ($Ctx.killCount -gt 0) { $res.kill.confirmed = [bool]$gone }
    if (-not $gone) { $res.cleanup.problems += 'KILL_NOT_OBSERVED' }
    if ($p.HasExited -and $res.exit.observed -and $Ctx.killCount -gt 0) { $res.exit.code = $null }   # 강제 종료한 자식의 종료 코드는 기록하지 않는다(의미 없는 값)

    # 스트림이 닫히기를 잠깐(최대 1초, 종료 확인 창 안에서) 기다려 닫힘 여부를 정한다. 반드시 자손을 끝내기 **전에** 정한다.
    $streamSettleEnd = [Math]::Min($windowEnd, [int]$sw.ElapsedMilliseconds + 1000)
    while ($true) {
        foreach ($x in $streams) { Step-LrStreamDrain $x }
        if (($out.eof -or $out.overflow -or $out.failed) -and ($err.eof -or $err.overflow -or $err.failed)) { break }
        if ([int]$sw.ElapsedMilliseconds -ge $streamSettleEnd) { break }
        Start-Sleep -Milliseconds 20
    }
    $res.cleanup.streamsClosed = Test-StreamsClosed $streams
    if ($res.cleanup.streamsClosed -eq $false) { $res.cleanup.problems += 'STREAMS_NOT_CLOSED' }

    # 마지막 표본: 남은 자손(최대 1초, 종료 확인 창 안에서 안정되기를 기다린다). 정리는 이 러너가 하지만 남아 있었다는 사실은 정리 문제로 기록한다.
    $tblFinal = $null
    $leftoverFound = $null
    $settleEnd = [Math]::Min($windowEnd, [int]$sw.ElapsedMilliseconds + 1000)
    while ($true) {
        $tblFinal = Get-ProcessTable
        if ($null -eq $tblFinal) { break }
        $leftNow = Get-DescendantRecords $childPid $childStart $tblFinal
        $leftoverFound = $leftNow.Count
        if ($leftoverFound -eq 0 -or [int]$sw.ElapsedMilliseconds -ge $settleEnd) { break }
        Start-Sleep -Milliseconds 100
    }
    if ($null -eq $tblFinal) { $res.cleanup.problems += 'FINAL_PROCESS_LIST_UNAVAILABLE' }
    $res.cleanup.descendantsAliveAfter = $leftoverFound
    $res.cleanup.descendantTracking = $(if ($null -eq $tblFinal) { $null } elseif (@($tblFinal | Where-Object { [int]$_.ProcessId -eq $childPid }).Count -gt 0) { 'ROOT_PRESENT' } else { 'ROOT_GONE' })
    if (-not (Invoke-DescendantCleanup $childPid $childStart $res)) { $res.descendantTrackingOk = $false }
    if ($null -ne $leftoverFound -and $leftoverFound -gt 0) { $res.cleanup.problems += "LEFTOVER_DESCENDANTS_KILLED:$leftoverFound" }

    foreach ($x in $streams) { Step-StreamRead $x }       # 자손을 끝낸 뒤 늦게 닿은 바이트까지 담는다(닫힘 여부는 위에서 이미 정했다)
    $res.cleanup.dispose = 'OK'
    try { $p.Dispose() } catch { $res.cleanup.dispose = 'FAILED'; $res.cleanup.problems += 'DISPOSE_FAILED' }
    $res.timeline.observationMs = $observationEnd

    # 사후 비교: 감시 폴더의 전후 파일 이름, 프로브 해시, 설치물 해시.
    $finalRoots = New-Object System.Collections.ArrayList
    foreach ($r in $res.roots) {
        $after = $null
        try { $after = Get-LspMinRootFiles (Get-LrRootPath $layout $r.role) } catch { $after = $null }
        $r.filesAfter = $(if ($null -eq $after) { $null } else { @($after).Count })
        if ($r.role -ceq 'RULES_DIR') {
            # 실행 전에는 프로브 하나였다: 프로브 말고 늘어난 것이 added, 프로브가 없어졌으면 removed 다.
            $extra = New-Object System.Collections.ArrayList; $sawProbe = $false
            foreach ($f in @($after)) { if (Test-LrOrdinalEqual (ConvertTo-LrJsLower ([string]$f)) $Script:LrProbeFile) { $sawProbe = $true } else { [void]$extra.Add([string]$f) } }
            $r.added = @($extra)
            $r.removed = $(if ($sawProbe -or $null -eq $after) { @() } else { @($Script:LrProbeFile) })
        } else {
            $r.added = $(if ($null -eq $after) { @() } else { @($after) })       # 실행 전에는 비어 있었으므로 전부 추가된 파일이다
            $r.removed = @()
        }
        [void]$finalRoots.Add($r)
    }
    $res.roots = @($finalRoots)
    $res.probe.afterRunSha256 = Get-LspMinSha256 $probePath
    foreach ($a in $arts) { $a.after = Get-LspMinSha256 $a.path }
    $res.artifacts = @($arts | ForEach-Object { [ordered]@{ label = $_.label; before = $_.before; after = $_.after } })
    $res.timeline.cleanupMs = [int]$sw.ElapsedMilliseconds - $cleanupStart
    foreach ($x in $streams) { $res[$x.name] = Get-StreamRecord $x }
    $res.descendantsSeen = @($descSeen.Values | Sort-Object { $_.firstSeenMs })
    $bodyDone = $true          # 정리까지 끝났다: 이 뒤로는 $p(이미 Dispose 했다)도 PID 도 건드리지 않는다(PID 가 재사용됐을 수 있다)
} catch {
    if (-not $res.error -and -not $res.refused) {
        $res.error = $_.Exception.Message
        $res.errorPhase = $(if ($observationEnded) { 'CLEANUP' } else { 'OBSERVATION' })
    }
} finally {
    # 본문이 중간에 던졌을 때만 쓰는 마지막 수단. 본문이 정리까지 끝냈다면(bodyDone) 아무 프로세스도 건드리지 않는다.
    if (-not $bodyDone -and $p -and $null -ne $childPid) {
        try { if (-not $p.HasExited) { [void](Stop-ProcessTree $childPid $childStart); if ($Ctx.killCount -eq 0) { $Ctx.killCount = 1; $Ctx.firstKill = [int]$Ctx.sw.ElapsedMilliseconds } } } catch { }
        try { if ($null -eq $res.descendantsAliveAfterCleanup -and -not (Invoke-DescendantCleanup $childPid $childStart $res)) { $res.descendantTrackingOk = $false } } catch { $res.descendantTrackingOk = $false }
        $res.cleanup.problems += 'RUNNER_ABORTED_BEFORE_CLEANUP_DONE'
    }
    if ($streams) { foreach ($x in $streams) { if ($null -eq $res[$x.name]) { try { $res[$x.name] = Get-StreamRecord $x } catch { } } } }
    if ($null -eq $Ctx.trigger) { $Ctx.trigger = $(if ($res.child.started) { 'NORMAL' } else { 'SPAWN_FAILED' }) }
    $res.sends = @($Ctx.sends)
    $res.trigger = $(if ($res.refused) { $null } else { $Ctx.trigger })
    $res.also = @($Ctx.also)
    $res.abort = $Ctx.abort
    $res.initResponseAtMs = $Ctx.initAt
    $res.kill.count = $Ctx.killCount; $res.kill.firstTMs = $Ctx.firstKill
    $res.live = [ordered]@{
        stderrCheckedBytes = $watcher.checkedBytes; stdoutFramesChecked = $Ctx.framesChecked; initErrorLogged = $watcher.initErrorLogged
        receiver = [ordered]@{ abortFileChecks = $abortChecks }
        processes = [ordered]@{ samples = $samplesProc; failures = $failProc; maxDescendants = $maxDesc; imagesSeen = @($imagesSeen.Keys | Sort-Object); disallowed = @($disallowed.Keys | Sort-Object) }
        files = [ordered]@{ samples = $samplesFile; failures = $failFile }
        log = $watcher.scanner.counters
    }
    $res.finishedUtc = [DateTime]::UtcNow.ToString('o')
    try { Write-ResultFile -Path $resultPath -Object $res } catch { }
}
if ($res.refused) { exit 2 }
if ($res.error) { exit 3 }
exit 0
