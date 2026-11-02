<#
.SYNOPSIS
  전용 계정으로 실행되는 LSP-SCAN-1 표준 입력 러너(좁은 용도). `semgrep.exe lsp --debug` 를 한 번 띄워 initialize → initialized(1회) → 규칙 로딩 장벽 → didOpen(1회) → 두 묶음 대기 + settle 감시 → shutdown → exit 를 보내고, 한도 안에서 결과를 파일에 남긴다.
.DESCRIPTION
  범용 실행기가 아니다. 요청의 mode 는 두 가지뿐이고 각각 실행 파일과 인자가 고정돼 있어 그 밖은 거부한다.
    semgrep-lsp : 실행 파일 이름이 semgrep.exe(드라이브 문자로 시작하는 절대 경로), 인자는 정확히 ["lsp","--debug"]  (이 작업에서는 어디서도 실행하지 않았다)
    stub        : System32 의 Windows PowerShell 5.1 로 이 폴더의 lsp-scan-stub.ps1 을 허용된 시나리오로만 실행(정책·정리 확인용)
  보내는 메시지는 initialize → initialized → didOpen → shutdown → exit 다섯뿐이다(Assert-LsOutbound). didOpen 은 정확히 한 번이고 규칙 장벽을 넘고 장벽이 계약대로(clean)일 때만 나간다.
  didSave·didChange·didClose·semgrep/scanWorkspace·semgrep/refreshRules·작업 영역 변경·파일 생성·서버 요청에 대한 응답은 보내지 않는다. 서버 요청에는 절대 응답하지 않는다.
  흐름(scripts/semgrep-lsp/lsp-scan-run.ts 와 같다. 판정은 하지 않는다 — 관리자 쪽 TS 모듈이 원문 바이트·청크 시간표·표시에서 다시 한다):
    0. 요청을 검사한다(아무것도 쓰기 전). 거절하면 아무 폴더도 만들지 않고 아무 프로세스도 띄우지 않는다. 쓰는 모든 경로는 작업 폴더(신뢰 루트)에서 링크·junction 이 없는지 만들기 전에 본다.
       합성 대상 파일과 프로브 규칙 복사본을 **서버를 띄우기 전에** 배타적으로 쓰고 곧바로 해시를 고정값과 대조한다.
    1. initialize 를 보내고 응답을 initMs 까지 기다린다. 응답이 핵심 규칙과 serverInfo 모양을 통과하고 초기화 오류 로그가 없고 버전이 핀과 같을 때만 initialized 를 정확히 한 번 보낸다.
    2. 장벽(stdout semgrep/rulesRefreshed 와 맨줄 Scanned open documents 가 모두 나옴)을 rulesMs 까지 기다린다. 한도는 늘어나지 않는다. 넘기면 shutdown·exit·didOpen 을 보내지 않고(A9) stdin 을 닫는다.
    3. 장벽에서 프로브와 합성 파일의 해시를 한 번 더 본다. 장벽이 계약대로(clean)이고 사전 증거가 없을 때만 didOpen 을 보낸다(아니면 보내지 않고 settleMs 동안 지켜본 뒤 정상 종료한다).
    4. didOpen 송신부터 scanMs 안에 진단 알림 묶음과 엔진 로그 묶음이 **둘 다** 완성되기를 기다린다. 어느 스트림이 먼저 왔는지는 어떤 판단에도 쓰지 않는다. 마감에서 기다림을 끝내고 정상 종료로 간다(연장·재시도 없음).
    5. settle 창은 늦은 묶음이 완성된 청크의 시각에서 settleMs 다. 그 안에 자식이 끝나면 이상이다. 그 뒤 shutdown 을 보내고(응답을 기다리지 않는다) exit 를 보낸 뒤 자식이 스스로 끝나기를 exitMs 까지 기다린다.
  중단 조건(LIVE_ABORT): A1 작업 영역·사전 신호·허용 밖 외부 명령 줄; A2 레지스트리·내려받기·토큰·설정 파일; A3/A7 외부 중단 파일; A4 허용 밖 이미지; A5 감시 폴더의 금지 변경(작업 영역은 합성 파일 하나, 규칙 폴더는 프로브 하나, 해시 불변);
    A6 허용 밖 서버 요청 또는 didOpen 뒤의 서버 요청; A10 송신 방어선의 거절. 전체 상한·출력 상한·프레임 오류·stdin 오류·읽기 실패와 함께 stdin 닫기 없이 곧바로 트리를 강제 종료한다(한 번만).
  관측 결과와 정리 결과는 따로다: 이 러너는 앞의 둘(흐름의 결과와 프로세스 정리)만 보고한다. 시스템 복구(계정·방화벽·감사·ACL)는 이 러너 밖이다.
  환경은 요청의 env 만 쓰고 이 러너의 환경을 물려주지 않는다. 자식에게 준 PATH **값**과 작업 폴더를 결과에 기록한다.
  -LoadFunctionsOnly: 함수 정의만 읽고 곧바로 돌아온다(시험이 함수를 직접 확인하려고 쓴다).

  요청(JSON): runToken, mode, exe, args[], layout{work,workspace,stateDir,rulesDir,homeDir,tmpDir,targetPath}, env(이름 11개 고정), limits(선택: 기본 상한 이하만; totalMs initMs exitMs stdinCloseGraceMs killConfirmMs maxStdoutBytes maxStderrBytes sampleIntervalMs rulesMs settleMs scanMs),
    expectedVersion, probeB64(233바이트·고정 해시), targetB64(135바이트·고정 해시), artifacts[{label,path}](선택), abortFile(선택), resultFile(선택).
  결과(JSON, kind=lsp-scan-runner-result)는 scripts/semgrep-lsp/lsp-scan-runner-result.ts 머리말의 스키마를 따른다.
#>
[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Run')][string]$RequestFile,
    [Parameter(Mandatory, ParameterSetName = 'Load')][switch]$LoadFunctionsOnly
)
$ErrorActionPreference = 'Stop'
# 점 불러오기(dot-source)는 불러온 스크립트의 매개변수($RequestFile)와 $PSCmdlet 을 이 범위에 덮어쓴다. 불러오기 전에 내 값을 따로 저장하고 이후에는 이 사본만 쓴다.
$Script:LsMode = $PSCmdlet.ParameterSetName
$Script:LsRequestFile = $RequestFile
$Script:LsHere = Split-Path -Parent $PSCommandPath
. (Join-Path $Script:LsHere 'LspScanContract.ps1')
# RULES 러너의 도구(폴더 만들기, 링크 점검, 초기화 응답 조건, 스트림 비우기)와 그 밑의 LSP-MIN-1 러너·version-runner.ps1 의 스트림·프로세스 트리 도구를 파일을 바꾸지 않고 그대로 가져온다.
. (Join-Path $Script:LsHere 'lsp-rules-runner.ps1') -LoadFunctionsOnly

# 스텁 시나리오 허용 목록(lsp-scan-stub.ps1 이 같은 목록으로 한 번 더 거른다).
$Script:LsStubScenarios = @(
    'ok', 'ok-diag-first', 'ok-log-first', 'ok-split-chunks', 'ok-simultaneous', 'diag-only', 'log-only', 'pre-open-evidence', 'duplicate-notification', 'two-diagnostics', 'other-uri', 'extra-uri', 'wrong-code', 'code-short',
    'wrong-message', 'wrong-severity', 'range-start-shift', 'range-end-plus1', 'range-end-minus1', 'late-log', 'wrong-log-order', 'engine-error-line', 'skipped-rule', 'no-targets', 'rules-not-loaded', 'extra-scan-during-settle',
    'exit-during-settle', 'timeout', 'ext-ok-x2', 'ext-wrong-command', 'ext-wrong-args', 'ext-wrong-path', 'ext-third-attempt', 'ext-missing-post', 'server-request-after-didopen', 'forbidden-signal', 'modify-target',
    'rules-zero', 'yaml-error', 'invalid-rule', 'wrong-file-loaded', 'notification-only', 'log-missing', 'log-variant', 'log-duplicate', 'order-violation', 'barrier-timeout', 'download-line', 'registry-line', 'token-line',
    'settings-line', 'early-signal', 'early-notification', 'initialize-error', 'error-response', 'version-mismatch', 'wrong-id', 'silent', 'silent-hold', 'exit-early', 'garbage', 'exit-ignored', 'exit-ignored-eof',
    'nonzero-exit', 'stderr-split', 'stdout-split', 'flood-err', 'flood-out', 'orphan', 'write-ws', 'write-extra-rules', 'modify-probe', 'home-write', 'shutdown-reply', 'env-names', 'spawn-disallowed', 'requests-2',
    'requests-3', 'request-disallowed', 'request-malformed', 'delayed-forbidden', 'header-variants', 'json-dump-signal-text', 'notification-twice'
)

# 읽은 바이트는 보관한 것의 해시와 함께 기록한다(TS 어댑터가 b64 ↔ sha256 ↔ bytesRead 를 대조한다).
function Get-LsStreamRecord {
    param($St)
    $bytes = $St.ms.ToArray()
    $state = 'OPEN'
    if ($St.failed) { $state = 'READ_FAILED' } elseif ($St.overflow) { $state = 'LIMIT_EXCEEDED' } elseif ($St.eof) { $state = 'EOF' }
    [ordered]@{ b64 = [Convert]::ToBase64String($bytes); bytesKept = $bytes.Length; bytesRead = $St.total; sha256 = (Get-LrSha256Hex $bytes); limit = $St.limit; overflow = $St.overflow; readFailed = $St.failed; eof = $St.eof; state = $state; error = $St.error }
}

# ── 실행 중 상태($Ctx)를 쓰는 함수 ─────────────────────────────────────────
# $Ctx 는 실행 본문에서 만들고 함수는 부를 때 찾으므로, 시험이 가짜 $Ctx 와 가짜 stdin 스트림으로 불러 쓸 수 있도록 -LoadFunctionsOnly 반환보다 앞에 둔다.

# 정해진 메시지를 stdin 에 쓴다. 쓰기 직전에 방어선(Assert-LsOutbound)을 통과해야 한다. 거절되면 쓰지 않고 A10(SEND_REFUSED)으로 곧바로 끝낸다.
# 송신 기록에는 쓰기 직전까지 읽은 stderr·stdout 바이트 수를 남긴다 — initialized·didOpen 이전 신호를 사후에 가려내는 기준이다. didOpen 은 쓰기 직전에 감시기에 알려 사전/사후 경계를 정한다.
function Send-LsMessage {
    param([string]$Label, $Message)
    $labels = @($Ctx.sends | ForEach-Object { [string]$_.label })
    $guard = @{ barrierDone = ($null -ne $Ctx.barrierAt); sent = $labels; expectedUri = [string]$Ctx.expectedUri; expectedText = [string]$Ctx.expectedText }
    try { Assert-LsOutbound -Label $Label -Message $Message -Ctx $guard }
    catch {
        $code = 'GUARD_REFUSED'
        if (Test-LrOrdinalIn $Label $labels) { $code = 'DUPLICATE_SEND' } elseif ((Test-LrOrdinalEqual $Label 'didOpen') -and $null -eq $Ctx.barrierAt) { $code = 'DID_OPEN_BEFORE_BARRIER' } elseif (-not (Test-LrOrdinalIn $Label $Script:LsSendOrder)) { $code = 'LABEL_NOT_ALLOWED' }
        Add-LspMinTrigger 'LIVE_ABORT' 'A10' ("${Label}:$code")
        return $false
    }
    # 곧바로 끝내기로 한 뒤에는 새 메시지를 쓰지 않는다(송신 기록도 남기지 않는다).
    if ($Ctx.immediate) { return $false }
    $rec = [ordered]@{ label = $Label; tMs = [int]$Ctx.sw.ElapsedMilliseconds; ok = $false; stderrBytesAtSend = $null; stdoutBytesAtSend = $null }
    if ($null -ne $Ctx.watch) { $rec.stderrBytesAtSend = [long]$Ctx.watch.stderrLen; $rec.stdoutBytesAtSend = [long]$Ctx.watch.stdoutLen }
    if (Test-LrOrdinalEqual $Label 'didOpen') {
        $doc = Get-LrMember (Get-LrMember $Message 'params') 'textDocument'
        $text = [string](Get-LrMember $doc 'text')
        $rec.didOpen = [ordered]@{ uri = [string](Get-LrMember $doc 'uri'); languageId = [string](Get-LrMember $doc 'languageId'); version = (Get-LrMember $doc 'version'); textSha256 = (Get-LrSha256Hex ($Script:LrUtf8.GetBytes($text))) }
        if ($null -ne $Ctx.watch) { Set-LsDidOpenSent $Ctx.watch ([double]$rec.tMs) }
    }
    [void]$Ctx.sends.Add($rec)
    $bytes = ConvertTo-LspMinFrame -Message $Message
    if ($bytes.Length -gt $Script:LspMinMaxFrameBytes) { Add-LspMinTrigger 'STDIN_ERROR'; return $false }
    try { $Ctx.stdinStream.Write($bytes, 0, $bytes.Length); $Ctx.stdinStream.Flush() } catch { Add-LspMinTrigger 'STDIN_ERROR'; return $false }
    $rec.ok = $true
    $true
}

if ($Script:LsMode -eq 'Load') { return }

# ── 실행 ───────────────────────────────────────────────────────────

$resultPath = Join-Path (Split-Path -Parent $Script:LsRequestFile) 'lsp-scan-result.json'
$res = [ordered]@{
    schema = 1; kind = 'lsp-scan-runner-result'; runToken = $null; mode = $null; startedUtc = [DateTime]::UtcNow.ToString('o'); finishedUtc = $null
    runner = [ordered]@{ pid = $PID; sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; exe = $null; envNames = @([Environment]::GetEnvironmentVariables().Keys | Sort-Object) }
    request = $null; refused = $null; refusals = @(); error = $null; errorPhase = $null
    child = [ordered]@{ started = $false; pid = $null; startUtc = $null; mainModule = $null; spawnError = $null }
    sends = @()
    stdout = $null; stderr = $null
    frameError = $null; initResponseAtMs = $null
    markers = [ordered]@{ barrierDoneAtMs = $null; didOpenSent = $null }
    settle = [ordered]@{ endedAtMs = $null }
    chunks = @()
    liveView = $null
    exit = [ordered]@{ observed = $false; code = $null; signal = $null; tMs = $null }
    stdinClosed = [ordered]@{ byHarness = $false; ok = $null; tMs = $null }
    kill = [ordered]@{ count = 0; firstTMs = $null; confirmed = $null }
    trigger = $null; also = @(); abort = $null
    live = $null; roots = @(); artifacts = @()
    files = [ordered]@{
        target = [ordered]@{ sourceSha256 = $null; afterWriteSha256 = $null; barrierSha256 = $null; afterRunSha256 = $null }
        probe = [ordered]@{ sourceSha256 = $null; afterCopySha256 = $null; barrierSha256 = $null; afterRunSha256 = $null }
    }
    timeline = [ordered]@{ observationMs = $null; cleanupMs = $null }
    cleanup = [ordered]@{ childExitConfirmed = $false; streamsClosed = $null; descendantsAliveAfter = $null; descendantTracking = $null; dispose = 'NOT_CALLED'; timersCancelled = $true; problems = @() }
    descendantsSeen = @(); descendantsLeftoverKilled = @(); descendantsAliveAfterCleanup = $null; descendantTrackingOk = $true
}
try { $res.runner.exe = (Get-Process -Id $PID).Path } catch { }

# 실행 중 상태(함수들이 함께 쓰는 한 곳)
$Ctx = @{
    sw = $null; limits = $null; layout = $null; sends = (New-Object System.Collections.ArrayList); also = (New-Object System.Collections.ArrayList)
    trigger = $null; abort = $null; immediate = $false
    initAt = $null; framesChecked = 0; barrierAt = $null
    stdinStream = $null; p = $null; exitAt = $null; firstKill = $null; killCount = 0
    errState = $null; outState = $null; watch = $null; expectedUri = ''; expectedText = ''
}
$p = $null; $streams = $null; $childPid = $null; $childStart = $null; $bodyDone = $false; $observationEnded = $false
$descSeen = @{}
$samplesProc = 0; $failProc = 0; $consProc = 0; $maxDesc = 0; $imagesSeen = @{}; $disallowed = @{}
$samplesFile = 0; $failFile = 0; $consFile = 0; $abortChecks = 0
$W = $null
try {
    $req = [IO.File]::ReadAllText($Script:LsRequestFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $res.runToken = [string]$req.runToken
    $res.mode = [string]$req.mode
    if ($req.resultFile) { $resultPath = [string]$req.resultFile }
    $args0 = @($req.args | ForEach-Object { [string]$_ })
    $layout = $req.layout
    $Ctx.layout = $layout
    $envReq = $req.env
    $envNames = @(); if ($envReq) { $envNames = @($envReq.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object) }
    $expectedVersion = $null; if ($req.expectedVersion -is [string]) { $expectedVersion = [string]$req.expectedVersion }
    $res.request = [ordered]@{ exe = [string]$req.exe; args = $args0; layoutWork = [string](Get-LmProp $layout 'work'); envNames = $envNames; envPath = $null; workingDirectory = $null; limits = $req.limits; expectedVersion = $expectedVersion }

    # ── 요청 검증: 이 두 모드 밖은 거부한다(범용 실행기가 되지 않게). 사유 토큰에는 값(경로·환경 값)을 싣지 않는다. 아무것도 쓰기 전에 한다. ──
    $refusals = New-Object System.Collections.ArrayList
    $static = Get-LsStaticRefusals $req
    foreach ($r in $static.refusals) { [void]$refusals.Add($r) }
    $exe = [string]$req.exe
    if ([string]::IsNullOrWhiteSpace($req.runToken)) { [void]$refusals.Add('RUN_TOKEN_MISSING') }
    if (Test-LrDriveAbsolute $exe) { if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { [void]$refusals.Add('COMMAND_NOT_FOUND') } }
    if (Test-LrOrdinalEqual ([string]$req.mode) 'stub') {
        if (-not $exe.Equals($Script:Ps51Path, [StringComparison]::OrdinalIgnoreCase)) { [void]$refusals.Add('STUB_COMMAND_NOT_ALLOWED') }
        elseif ($args0.Count -ne 7 -or -not (Test-LrOrdinalEqualCI ($args0[0..4] -join ' ') '-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File')) { [void]$refusals.Add('STUB_ARGS_NOT_FIXED') }
        elseif (-not (Test-LrOrdinalEqualCI ([string](Split-Path -Leaf $args0[5])) 'lsp-scan-stub.ps1') -or -not ((Split-Path -Parent $args0[5]).Equals($Script:LsHere, [StringComparison]::OrdinalIgnoreCase))) { [void]$refusals.Add('STUB_SCRIPT_NOT_ALLOWED') }
        elseif (-not (Test-LrOrdinalIn ([string]$args0[6]) $Script:LsStubScenarios)) { [void]$refusals.Add('STUB_SCENARIO_NOT_ALLOWED') }
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
    $targetBytes = [byte[]]$static.targetBytes
    $res.files.probe.sourceSha256 = Get-LrSha256Hex $probeBytes
    $res.files.target.sourceSha256 = Get-LrSha256Hex $targetBytes
    $Ctx.expectedUri = Get-LsTargetUri $layout
    $Ctx.expectedText = $Script:LrUtf8.GetString($targetBytes)
    $work = [string](Get-LmProp $layout 'work')
    $probePath = Get-LsProbePath $layout
    $targetPath = [string](Get-LmProp $layout 'targetPath')

    # 링크 여부(만들기 전) → 폴더 준비 → 링크 여부(만든 뒤) → 감시 폴더 셋이 비어 있는지 확인(비어 있지 않으면 시작하지 않는다).
    # 쓰는 모든 경로(작업 영역·상태 폴더들·프로브 복사본·합성 파일)를 신뢰 루트(작업 폴더)에서 만들기 전에 본다.
    foreach ($target in @([string](Get-LmProp $layout 'workspace'), [string](Get-LmProp $layout 'stateDir'), [string](Get-LmProp $layout 'rulesDir'), [string](Get-LmProp $layout 'homeDir'), [string](Get-LmProp $layout 'tmpDir'), $probePath, $targetPath)) {
        if (Test-LrChainHasReparsePoint $work $target) { [void]$refusals.Add('PATH_ESCAPES_WORK') }
    }
    if ($refusals.Count -gt 0) { $res.refusals = @($refusals | Select-Object -Unique); $res.refused = ($res.refusals -join ','); throw "REFUSED: $($res.refused)" }
    New-LrWorkDirs $layout
    foreach ($d in @($work, [string](Get-LmProp $layout 'stateDir'), [string](Get-LmProp $layout 'workspace'), [string](Get-LmProp $layout 'rulesDir'), [string](Get-LmProp $layout 'homeDir'), [string](Get-LmProp $layout 'tmpDir'))) {
        if (Test-LrReparsePoint $d) { [void]$refusals.Add('PATH_ESCAPES_WORK') }
    }
    if ($refusals.Count -gt 0) { $res.refusals = @($refusals | Select-Object -Unique); $res.refused = ($res.refusals -join ','); throw "REFUSED: $($res.refused)" }
    foreach ($role in $Script:LspMinWatchedRoles) {
        $files = Get-LspMinRootFiles (Get-LsRootPath $layout $role)
        if ($files.Count -gt 0) { [void]$refusals.Add("WATCHED_ROOT_NOT_EMPTY:$role") }
    }
    if ($refusals.Count -gt 0) { $res.refusals = @($refusals); $res.refused = ($refusals -join ','); throw "REFUSED: $($res.refused)" }

    # 프로브 복사와 합성 파일 쓰기: 배타 쓰기 → 해시 대조 → 서버를 띄우기 전에 감시 폴더 셋의 파일 수가 1·1·0 인지 확인.
    foreach ($pair in @(@($probePath, $probeBytes, 'PROBE'), @($targetPath, $targetBytes, 'TARGET'))) {
        try {
            $fsOut = New-Object IO.FileStream([string]$pair[0], [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $fsOut.Write([byte[]]$pair[1], 0, ([byte[]]$pair[1]).Length) } finally { $fsOut.Dispose() }
        } catch { [void]$refusals.Add($pair[2] + '_NOT_WRITTEN') }
    }
    if ($refusals.Count -eq 0) {
        $res.files.probe.afterCopySha256 = Get-LspMinSha256 $probePath
        $res.files.target.afterWriteSha256 = Get-LspMinSha256 $targetPath
        if ($res.files.probe.afterCopySha256 -cne $Script:LsProbeSha256) { [void]$refusals.Add('PROBE_COPY_HASH_MISMATCH') }
        if ($res.files.target.afterWriteSha256 -cne $Script:LsTargetSha256) { [void]$refusals.Add('TARGET_COPY_HASH_MISMATCH') }
    }
    $roots = New-Object System.Collections.ArrayList
    if ($refusals.Count -eq 0) {
        foreach ($role in $Script:LspMinWatchedRoles) {
            $now0 = Get-LspMinRootFiles (Get-LsRootPath $layout $role)
            $want = $(if ($role -ceq 'HOME_DIR') { 0 } else { 1 })
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
    # 자식에게 실제로 건네는 PATH 값과 작업 폴더를 기록한다(이름만이 아니라).
    $res.request.envPath = [string]$psi.EnvironmentVariables['PATH']
    $res.request.workingDirectory = [string]$psi.WorkingDirectory

    $watchCfg = [ordered]@{ workspace = [string](Get-LmProp $layout 'workspace'); expectedTargetUri = $Ctx.expectedUri; probePath = $probePath; scanMs = [double]$L.scanMs; settleMs = [double]$L.settleMs; maxStdoutBytes = [int]$L.maxStdoutBytes }
    $W = New-LsLiveWatch $watchCfg
    $Ctx.watch = $W

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
    $stderrDone = $false; $stdoutDone = $false

    # A4 허용 이미지: 실제 모드는 계약 목록 그대로(git 은 넣지 않는다). 스텁 모드에서만 스텁 서버 본체인 powershell.exe 를 더한다(자손은 여전히 이 목록으로 걸러진다).
    $allowedImages = @($Script:LspMinAllowedImages)
    if (Test-LrOrdinalEqual ([string]$res.mode) 'stub') { $allowedImages += 'powershell.exe' }

    $state = 'INIT_WAIT'; $stateAt = 0; $lastSample = -1000; $exitSeenAt = $null; $stdinClosed = $false
    $drainPrev = -1; $drainCount = 0; $barrierDeadline = 0; $settleDeadline = 0; $scanDeadline = 0; $quietDeadline = 0; $didOpenAt = 0; $settleEndAt = 0
    # 띄운 즉시 initialize 를 먼저 보낸다(표본은 그 뒤에 돈다). 응답은 init 한도까지 기다린다.
    $deadline = [int]$sw.ElapsedMilliseconds + $L.initMs
    [void](Send-LsMessage 'initialize' (New-LsInitializeMessage -Layout $layout))

    $closeStdin = {
        if (-not $res.stdinClosed.byHarness) {
            $res.stdinClosed.byHarness = $true; $res.stdinClosed.tMs = [int]$sw.ElapsedMilliseconds
            try { $p.StandardInput.Close(); $res.stdinClosed.ok = $true } catch { $res.stdinClosed.ok = $false }
        }
    }

    while ($true) {
        foreach ($x in $streams) { Step-LrStreamDrain $x }
        $tRead = [int]$sw.ElapsedMilliseconds
        $now = $tRead
        $bytesNow = $out.total + $err.total

        # stdout: 새 바이트를 원문·시간표에 쌓고 프레임으로 풀어 감시기에 먹인다. 어느 스트림이 먼저 왔는지는 어떤 판단에도 쓰지 않는다.
        Step-LspMinStreamTriggers $out
        if ($out.failed) { $res.child.streamReadFailed = $true }
        if ($out.ms.Length -gt $out.consumed) {
            $n = [int]$out.ms.Length - $out.consumed
            $chunk = New-Object byte[] $n
            [Array]::Copy($out.ms.GetBuffer(), $out.consumed, $chunk, 0, $n)
            $out.consumed = [int]$out.ms.Length
            $fed = Add-LsStdout $W $chunk ([double]$tRead)
            $Ctx.framesChecked = $W.framesChecked
            if ($fed.initArrived) { $Ctx.initAt = $now }
            if ($null -ne $fed.abort) { Add-LspMinTrigger 'LIVE_ABORT' $fed.abort.condition $fed.abort.detail }
            if ($null -ne $fed.frameError -and $null -eq $res.frameError) { $res.frameError = $fed.frameError; Add-LspMinTrigger 'FRAME_ERROR' }
        }
        if ($out.eof -and -not $stdoutDone) {
            $stdoutDone = $true
            $te = Complete-LsStdout $W
            if ($null -ne $te -and $null -eq $res.frameError) { $res.frameError = $te; Add-LspMinTrigger 'FRAME_ERROR' }
        }
        # stderr: 새 바이트를 감시기에 먹인다(줄 단위 신호로 풀고 청크 경계에 걸친 문구도 잡는다).
        Step-LspMinStreamTriggers $err
        if ($err.failed) { $res.child.streamReadFailed = $true }
        if ($err.ms.Length -gt $err.consumed) {
            $n = [int]$err.ms.Length - $err.consumed
            $chunk = New-Object byte[] $n
            [Array]::Copy($err.ms.GetBuffer(), $err.consumed, $chunk, 0, $n)
            $err.consumed = [int]$err.ms.Length
            $hit = Add-LsStderr $W $chunk ([double]$tRead)
            if ($null -ne $hit) { Add-LspMinTrigger 'LIVE_ABORT' $hit.condition $hit.detail }
        }
        if ($err.eof -and -not $stderrDone) {
            $stderrDone = $true
            $hit = Complete-LsStderr $W
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
                    try { $list = Get-LspMinRootFiles (Get-LsRootPath $layout $role) } catch { $failedThis = $true; $failFile++; continue }
                    foreach ($f in $list) { if (Test-LsRootViolation $role $f) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' $role; break } }
                    # 규칙 폴더에서 프로브가, 작업 영역에서 합성 파일이 없어져도 위반이다.
                    if ($role -ceq 'RULES_DIR') {
                        $hasProbe = $false
                        foreach ($f in $list) { if (Test-LrOrdinalEqual (ConvertTo-LrJsLower ([string]$f)) $Script:LsProbeFile) { $hasProbe = $true } }
                        if (-not $hasProbe) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' 'PROBE_MISSING' }
                    }
                    if ($role -ceq 'WORKSPACE') {
                        $hasTarget = $false
                        foreach ($f in $list) { if (Test-LrOrdinalEqual (ConvertTo-LrJsLower ([string]$f)) $Script:LsTargetFile) { $hasTarget = $true } }
                        if (-not $hasTarget) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' 'TARGET_MISSING' }
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
                if ($null -ne $W.stdoutTracker.analysis.initMessage) {
                    $gate = Test-LrInitGate $W.stdoutTracker.analysis.initMessage $expectedVersion $W.initErrorLogged
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
                    $gate = Test-LrInitGate $W.stdoutTracker.analysis.initMessage $expectedVersion $W.initErrorLogged
                    if (-not $gate.ok) { Add-LspMinTrigger 'INIT_INVALID'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now }
                    else {
                        # 쓰기 직전에 감시기에 알려 이 시점 이후의 새로고침·스캔 줄을 정상 신호로 읽게 한다.
                        Set-LsInitializedSent $W
                        if (Send-LsMessage 'initialized' (New-LsInitializedMessage)) {
                            $state = 'BARRIER_WAIT'
                            $e0 = [int]$sw.ElapsedMilliseconds; $barrierDeadline = $e0 + [Math]::Max(0, [Math]::Min($L.rulesMs, $L.totalMs - $e0))
                        }
                    }
                }
            }
            'BARRIER_WAIT' {
                if ($p.HasExited) { Add-LspMinTrigger 'CHILD_EXITED_EARLY' }
                elseif (Test-LsBarrierReady $W) {
                    $Ctx.barrierAt = $now
                    $res.markers.barrierDoneAtMs = $now
                    Set-LsBarrierDone $W ([double]$now)
                    # 장벽에서 프로브와 합성 파일의 해시를 한 번 더 본다. didOpen 은 이 확인 뒤에만 나간다.
                    $res.files.probe.barrierSha256 = Get-LspMinSha256 $probePath
                    $res.files.target.barrierSha256 = Get-LspMinSha256 $targetPath
                    if ($res.files.probe.barrierSha256 -cne $Script:LsProbeSha256) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' 'PROBE_CHANGED' }
                    elseif ($res.files.target.barrierSha256 -cne $Script:LsTargetSha256) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' 'TARGET_CHANGED' }
                    else {
                        # didOpen: 장벽이 계약대로(clean)이고 사전 증거가 없을 때만 보낸다. 아니면 보내지 않고 짧은 감시 뒤 정상 종료한다.
                        $bar = Get-LsWatchBarrier $W
                        if ($bar.clean) {
                            $doc = New-LsDidOpenMessage -Layout $layout -TargetBytes $targetBytes
                            if (Send-LsMessage 'didOpen' $doc) {
                                $didOpenAt = [int]$Ctx.sends[$Ctx.sends.Count - 1].tMs
                                $scanDeadline = $didOpenAt + $L.scanMs
                                $state = 'SCAN_WAIT'
                            }
                        } else {
                            $quietDeadline = $now + [Math]::Max(0, [Math]::Min($L.settleMs, $L.totalMs - $now)); $state = 'QUIET'
                        }
                    }
                } elseif ($now -ge $barrierDeadline) {
                    Add-LspMinTrigger 'RULES_TIMEOUT' 'A9' 'BARRIER_LIMIT'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now
                }
            }
            'QUIET' {
                if ($p.HasExited) { Add-LspMinTrigger 'CHILD_EXITED_EARLY' }
                elseif ($now -ge $quietDeadline) { $state = 'SHUTDOWN' }
            }
            'SCAN_WAIT' {
                # 두 묶음: didOpen 송신부터 scanMs 안에. 연장도 재시도도 없다. 마감을 넘어 완성된 묶음은 늦은 증거로 원문에 남고 판정이 가른다.
                $snap = Get-LsWatchSnapshot $W $now
                if ($null -ne $snap.bothCompleteAtMs -and $snap.bothCompleteAtMs -le $scanDeadline) {
                    $settleEndAt = [int][Math]::Ceiling([double]$snap.settleEndMs)
                    $state = 'SETTLE'
                } elseif ($p.HasExited) { Add-LspMinTrigger 'CHILD_EXITED_EARLY' }
                elseif ($now -ge $scanDeadline) { Add-LspMinTrigger 'SCAN_TIMEOUT'; $state = 'SHUTDOWN' }
            }
            'SETTLE' {
                # settle 창: 늦은 묶음이 완성된 하니스 시각에서 settleMs. 그 안에 자식이 끝나면 이상이다.
                if ($p.HasExited) { Add-LspMinTrigger 'CHILD_EXITED_EARLY' }
                elseif ($now -ge $settleEndAt) { $res.settle.endedAtMs = $now; $state = 'SHUTDOWN' }
            }
            'SHUTDOWN' {
                $exitDeadline = $now + $L.exitMs
                if (-not (Send-LsMessage 'shutdown' (New-LsShutdownMessage))) { break }
                if (-not (Send-LsMessage 'exit' (New-LsExitMessage))) { break }
                $state = 'EXIT_WAIT'; $deadline = $exitDeadline
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

    # 스트림이 닫히기를 잠깐(최대 1초, 종료 확인 창 안에서) 기다려 닫힘 여부를 정한다. 반드시 자손을 끝내기 전에 정한다. 이 사이에 도착한 바이트도 시간표에 쌓는다.
    $streamSettleEnd = [Math]::Min($windowEnd, [int]$sw.ElapsedMilliseconds + 1000)
    while ($true) {
        foreach ($x in $streams) { Step-LrStreamDrain $x }
        $tLate = [int]$sw.ElapsedMilliseconds
        if ($out.ms.Length -gt $out.consumed) {
            $n = [int]$out.ms.Length - $out.consumed; $chunk = New-Object byte[] $n
            [Array]::Copy($out.ms.GetBuffer(), $out.consumed, $chunk, 0, $n); $out.consumed = [int]$out.ms.Length
            [void](Add-LsStdout $W $chunk ([double]$tLate))
        }
        if ($err.ms.Length -gt $err.consumed) {
            $n = [int]$err.ms.Length - $err.consumed; $chunk = New-Object byte[] $n
            [Array]::Copy($err.ms.GetBuffer(), $err.consumed, $chunk, 0, $n); $err.consumed = [int]$err.ms.Length
            [void](Add-LsStderr $W $chunk ([double]$tLate))
        }
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
    if ($out.ms.Length -gt $out.consumed) {
        $n = [int]$out.ms.Length - $out.consumed; $chunk = New-Object byte[] $n
        [Array]::Copy($out.ms.GetBuffer(), $out.consumed, $chunk, 0, $n); $out.consumed = [int]$out.ms.Length
        [void](Add-LsStdout $W $chunk ([double][int]$sw.ElapsedMilliseconds))
    }
    if ($err.ms.Length -gt $err.consumed) {
        $n = [int]$err.ms.Length - $err.consumed; $chunk = New-Object byte[] $n
        [Array]::Copy($err.ms.GetBuffer(), $err.consumed, $chunk, 0, $n); $err.consumed = [int]$err.ms.Length
        [void](Add-LsStderr $W $chunk ([double][int]$sw.ElapsedMilliseconds))
    }
    $res.cleanup.dispose = 'OK'
    try { $p.Dispose() } catch { $res.cleanup.dispose = 'FAILED'; $res.cleanup.problems += 'DISPOSE_FAILED' }
    $res.timeline.observationMs = $observationEnd

    # 사후 비교: 감시 폴더의 전후 파일 이름, 프로브·합성 파일 해시, 설치물 해시.
    $finalRoots = New-Object System.Collections.ArrayList
    foreach ($r in $res.roots) {
        $after = $null
        try { $after = Get-LspMinRootFiles (Get-LsRootPath $layout $r.role) } catch { $after = $null }
        $r.filesAfter = $(if ($null -eq $after) { $null } else { @($after).Count })
        if ($r.role -ceq 'RULES_DIR' -or $r.role -ceq 'WORKSPACE') {
            # 실행 전에는 파일 하나(프로브 또는 합성 파일)였다: 그것 말고 늘어난 것이 added, 그것이 없어졌으면 removed 다.
            $keep = $Script:LsProbeFile; if ($r.role -ceq 'WORKSPACE') { $keep = $Script:LsTargetFile }
            $extra = New-Object System.Collections.ArrayList; $sawKeep = $false
            foreach ($f in @($after)) { if (Test-LrOrdinalEqual (ConvertTo-LrJsLower ([string]$f)) $keep) { $sawKeep = $true } else { [void]$extra.Add([string]$f) } }
            $r.added = @($extra)
            $r.removed = $(if ($sawKeep -or $null -eq $after) { @() } else { @($keep) })
        } else {
            $r.added = $(if ($null -eq $after) { @() } else { @($after) })       # 실행 전에는 비어 있었으므로 전부 추가된 파일이다
            $r.removed = @()
        }
        [void]$finalRoots.Add($r)
    }
    $res.roots = @($finalRoots)
    $res.files.probe.afterRunSha256 = Get-LspMinSha256 $probePath
    $res.files.target.afterRunSha256 = Get-LspMinSha256 $targetPath
    foreach ($a in $arts) { $a.after = Get-LspMinSha256 $a.path }
    $res.artifacts = @($arts | ForEach-Object { [ordered]@{ label = $_.label; before = $_.before; after = $_.after } })
    $res.timeline.cleanupMs = [int]$sw.ElapsedMilliseconds - $cleanupStart
    foreach ($x in $streams) { $res[$x.name] = Get-LsStreamRecord $x }
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
    if ($streams) { foreach ($x in $streams) { if ($null -eq $res[$x.name]) { try { $res[$x.name] = Get-LsStreamRecord $x } catch { } } } }
    if ($null -eq $Ctx.trigger) { $Ctx.trigger = $(if ($res.child.started) { 'NORMAL' } else { 'SPAWN_FAILED' }) }
    $res.sends = @($Ctx.sends)
    $res.trigger = $(if ($res.refused) { $null } else { $Ctx.trigger })
    $res.also = @($Ctx.also)
    $res.abort = $Ctx.abort
    $res.initResponseAtMs = $Ctx.initAt
    $res.kill.count = $Ctx.killCount; $res.kill.firstTMs = $Ctx.firstKill
    if ($null -ne $W) {
        # 원문 바이트와 짝을 이루는 청크 시간표·표시·실시간 보기. 판정은 이것으로 모든 묶음을 다시 만든다.
        $res.chunks = @($W.chunks | ForEach-Object { [ordered]@{ stream = $_.stream; offset = $_.offset; length = $_.length; tMs = $_.tMs } })
        $res.markers.didOpenSent = $W.didOpen
        if ($res.child.started) { try { $res.liveView = Get-LsLiveView $W } catch { $res.liveView = $null } }
    }
    $res.live = [ordered]@{
        stderrCheckedBytes = $(if ($null -ne $W) { $W.stderrLen } else { 0 }); stdoutFramesChecked = $Ctx.framesChecked; initErrorLogged = $(if ($null -ne $W) { [bool]$W.initErrorLogged } else { $false })
        receiver = [ordered]@{ abortFileChecks = $abortChecks }
        processes = [ordered]@{ samples = $samplesProc; failures = $failProc; maxDescendants = $maxDesc; imagesSeen = @($imagesSeen.Keys | Sort-Object); disallowed = @($disallowed.Keys | Sort-Object) }
        files = [ordered]@{ samples = $samplesFile; failures = $failFile }
    }
    $res.finishedUtc = [DateTime]::UtcNow.ToString('o')
    try { Write-ResultFile -Path $resultPath -Object $res } catch { }
}
if ($res.refused) { exit 2 }
if ($res.error) { exit 3 }
exit 0
