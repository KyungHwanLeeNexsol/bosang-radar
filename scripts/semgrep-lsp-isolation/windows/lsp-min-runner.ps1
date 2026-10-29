<#
.SYNOPSIS
  전용 계정으로 실행되는 LSP-MIN-1 표준 입력 러너(좁은 용도). `semgrep.exe lsp --debug` 를 한 번 띄워 initialize → shutdown → exit 만 보내고, 한도 안에서 결과를 파일에 남긴다.
.DESCRIPTION
  범용 실행기가 아니다. 요청의 mode 는 두 가지뿐이고 각각 실행 파일과 인자가 고정돼 있어 그 밖은 거부한다.
    semgrep-lsp : 실행 파일 이름이 semgrep.exe(절대 경로), 인자는 정확히 ["lsp","--debug"]
    stub        : System32 의 Windows PowerShell 5.1 로 이 폴더의 lsp-min-stub.ps1 을 허용된 시나리오로만 실행(정책·정리 확인용)
  보내는 메시지는 initialize → shutdown → exit 셋뿐이다(Assert-LspMinOutbound). `initialized` 는 보내지 않는다. 문서 알림·스캔 요청도 보내지 않는다.
  정책(scripts/semgrep-lsp/lsp-min.ts 및 .moai/reports/semgrep-lsp-min-start-impl-20261028.md 4절과 같다):
    · 초기화 응답이 핵심 규칙(Get-LspMinInitCore)을 통과하면 shutdown·exit 를 보내고 exit 한도까지 자식의 종료를 기다린다. 그 한도 안에 안 끝나면 stdin 을 닫는다.
    · 통과하지 못한 응답이나 init 한도 초과면 shutdown·exit 를 보내지 않고 바로 stdin 을 닫는다. 닫은 뒤 유예 안에 안 끝나면 프로세스 트리를 강제 종료한다.
    · 중단 조건(A1 stderr 문구, A2 내려받기 문구, A4 허용 밖 이미지, A5 감시 폴더 위반, A8 stdout 의 규칙·진단 알림, 외부 중단 파일 A3/A7)·전체 상한·출력 상한·프레임 오류·stdin 오류는
      stdin 닫기 없이 곧바로 트리를 강제 종료한다. 강제 종료는 한 번만 보낸다.
    · 전체 상한(관측 구간)에 닿으면 새 유예를 붙이지 않는다. 종료 확인 창(정리 구간)은 고정 한 번이다.
  A3(루프백 수신기)은 이 러너 밖에서 읽는다: 관리자 쪽이 수신기를 읽다가 건수가 늘면 `abortFile` 을 만든다. 러너는 매 표본마다 그 파일의 존재를 본다.
  표준 입력·출력은 셸 없이 ProcessStartInfo(UseShellExecute=false)로 다룬다. PATH 를 탐색하지 않는다. 환경은 요청의 env 만 쓰고 이 러너의 환경을 물려주지 않는다.
  결과(JSON)에는 원문 stdout·stderr(base64), 송신 기록, 종료·강제 종료·stdin 닫기 기록, 표본 요약, 감시 폴더의 전후 파일 목록, 정리 결과를 적는다.
  초기화 응답의 해석(서버 정보, 분석 규칙)과 최종 판정은 하지 않는다(관리자 쪽 TS 모듈이 원문 바이트를 다시 풀어 한다). 이 러너는 흐름을 정하는 핵심 규칙만 안다.
  -LoadFunctionsOnly: 함수 정의만 읽고 곧바로 돌아온다(시험이 함수를 직접 확인하려고 쓴다). 프로세스를 시작하는 코드보다 앞에서 끝난다.
#>
[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Run')][string]$RequestFile,
    [Parameter(Mandatory, ParameterSetName = 'Load')][switch]$LoadFunctionsOnly
)
$ErrorActionPreference = 'Stop'
# 점 불러오기(dot-source)는 불러온 스크립트의 매개변수($RequestFile)와 $PSCmdlet 을 이 범위에 덮어쓴다. 불러오기 전에 내 값을 따로 저장하고 이후에는 이 사본만 쓴다.
$Script:LspMode = $PSCmdlet.ParameterSetName
$Script:LspRequestFile = $RequestFile
$Script:LspHere = Split-Path -Parent $PSCommandPath
. (Join-Path $Script:LspHere 'LspMinContract.ps1')
# 기존 버전 러너의 스트림 읽기·프로세스 트리 도구를 파일을 바꾸지 않고 그대로 가져온다(Write-ResultFile, New-StreamState, Step-StreamRead, Get-StreamRecord, Test-StreamsClosed,
# Get-ProcessTable, Get-DescendantRecords, Stop-ProcessTree, Invoke-DescendantCleanup, Format-StreamError, $Script:Ps51Path).
. (Join-Path $Script:LspHere 'version-runner.ps1') -LoadFunctionsOnly

$Script:LspMinStubScenarios = @('ok', 'error', 'initialize-error', 'wrong-id', 'split', 'silent', 'silent-hold', 'ignore-exit', 'ignore-exit-eof', 'exit-early', 'garbage', 'server-request', 'stderr-scan', 'stderr-split', 'stderr-download', 'publish', 'write-ws', 'flood-out', 'flood-err', 'orphan', 'env-names', 'spawn-disallowed', 'id-case', 'jsonrpc-case', 'method-case')
# 곧바로 강제 종료하는 이유(stdin 닫기와 유예를 거치지 않는다).
$Script:LspMinImmediate = @('LIVE_ABORT', 'TOTAL_TIMEOUT', 'OUTPUT_LIMIT', 'FRAME_ERROR', 'STDIN_ERROR', 'CHILD_EXITED_EARLY')
$Script:LspMinMaxFrameBytes = 3500       # 익명 파이프 버퍼(4096)를 넘지 않게: 쓰기가 막힐 수 없다
$Script:LspMinConsecutiveFailures = 3

# ── 프레임 해석(핵심 규칙에 필요한 만큼만. 엄격한 재해석은 TS 가 원문 바이트로 다시 한다) ─────────────────────────
function New-LspMinFramer { @{ pos = 0; bodyLen = $null; headerEnd = 0; failed = $false; error = $null } }

function Set-LspMinFrameError {
    param($Fr, [string]$Kind, [string]$Detail)
    $Fr.failed = $true
    $Fr.error = [ordered]@{ kind = $Kind; detail = $Detail; atByte = $Fr.pos }
}

# 새로 완성된 메시지(ConvertFrom-Json 결과)를 배열로 돌려준다. 첫 위반에서 영구 실패하고 이후 바이트는 보지 않는다(재동기화 없음).
function Step-LspMinFramer {
    param($Fr, $Ms, [int]$MaxBody)
    $out = New-Object System.Collections.ArrayList
    if ($Fr.failed) { return , @() }
    $buf = $Ms.GetBuffer()
    $len = [int]$Ms.Length
    while ($true) {
        if ($Fr.failed -or $Fr.pos -ge $len) { break }
        if ($null -eq $Fr.bodyLen) {
            $end = -1
            for ($i = $Fr.pos; $i + 3 -lt $len; $i++) {
                if ($buf[$i] -eq 13 -and $buf[$i + 1] -eq 10 -and $buf[$i + 2] -eq 13 -and $buf[$i + 3] -eq 10) { $end = $i; break }
            }
            if ($end -lt 0) {
                if (($len - $Fr.pos) -gt 8192 + 3) { Set-LspMinFrameError $Fr 'MALFORMED' '헤더가 끝나지 않는다'; break }
                # 첫 바이트가 헤더 이름 모양이 아니면 바로 거부한다(쓰레기 접두).
                $first = $buf[$Fr.pos]
                if (-not (($first -ge 0x30 -and $first -le 0x39) -or ($first -ge 0x41 -and $first -le 0x5a) -or ($first -ge 0x61 -and $first -le 0x7a))) { Set-LspMinFrameError $Fr 'MALFORMED' '헤더가 아닌 바이트'; break }
                break
            }
            $header = [Text.Encoding]::GetEncoding('latin1').GetString($buf, $Fr.pos, $end - $Fr.pos)
            $lengthValue = $null
            foreach ($line in $header.Split([string[]]@("`r`n"), [StringSplitOptions]::None)) {
                $colon = $line.IndexOf(':')
                if ($colon -lt 0) { Set-LspMinFrameError $Fr 'MALFORMED' '콜론이 없는 헤더 줄'; break }
                $name = $line.Substring(0, $colon)
                if ($name -cnotmatch "^[!#$%&'*+\-.^_``|~0-9A-Za-z]+$") { Set-LspMinFrameError $Fr 'MALFORMED' '헤더 이름이 올바르지 않다'; break }
                if ($name.ToLowerInvariant() -eq 'content-length') {
                    if ($null -ne $lengthValue) { Set-LspMinFrameError $Fr 'MALFORMED' 'Content-Length 중복'; break }
                    $lengthValue = $line.Substring($colon + 1).Trim(' ', "`t")
                }
            }
            if ($Fr.failed) { break }
            if ($null -eq $lengthValue -or $lengthValue -cnotmatch '^[0-9]+$' -or $lengthValue.Length -gt 15) { Set-LspMinFrameError $Fr 'MALFORMED' 'Content-Length 가 올바르지 않다'; break }
            $n = [long]$lengthValue
            if ($n -eq 0 -or $n -gt $MaxBody) { Set-LspMinFrameError $Fr 'MALFORMED' 'Content-Length 범위 밖'; break }
            $Fr.bodyLen = [int]$n
            $Fr.headerEnd = $end + 4
        }
        $total = $Fr.headerEnd + $Fr.bodyLen
        if ($len -lt $total) { break }
        $bodyText = $null
        try { $bodyText = (New-Object Text.UTF8Encoding($false, $true)).GetString($buf, $Fr.headerEnd, $Fr.bodyLen) } catch { Set-LspMinFrameError $Fr 'MALFORMED' '본문이 유효한 UTF-8 이 아니다'; break }
        # 최상위가 객체가 아니면(배열·배치·스칼라) 거절한다. pwsh 7 의 ConvertFrom-Json 은 원소 하나짜리 배열을 그 원소로 풀어 버려서 파싱 결과만으로는 구분할 수 없다.
        $lead = $bodyText.TrimStart([char]32, [char]9, [char]13, [char]10)
        if ($lead.Length -eq 0 -or [string]$lead[0] -cne '{') { Set-LspMinFrameError $Fr 'MALFORMED' '최상위 값이 일반 객체가 아니다'; break }
        $msg = $null
        try { $msg = $bodyText | ConvertFrom-Json } catch { Set-LspMinFrameError $Fr 'MALFORMED' '본문이 유효한 JSON 이 아니다'; break }
        if ($msg -isnot [pscustomobject]) { Set-LspMinFrameError $Fr 'MALFORMED' '최상위 값이 일반 객체가 아니다'; break }
        # 멤버 이름은 대소문자 그대로, 값은 형까지 TS framing.ts parseBody 와 같게 본다(`-cne` 만 쓰면 숫자 2.0 이 '2.0' 과 같다고 나온다).
        $jr = Get-LmExactMember $msg 'jsonrpc'
        if ($jr -isnot [string] -or $jr -cne '2.0') { Set-LspMinFrameError $Fr 'MALFORMED' 'jsonrpc 가 2.0 이 아니다'; break }
        if ((Test-LmExactMember $msg 'method') -and (Get-LmExactMember $msg 'method') -isnot [string]) { Set-LspMinFrameError $Fr 'MALFORMED' 'method 가 문자열이 아니다'; break }
        if (Test-LmExactMember $msg 'id') {
            $mid = Get-LmExactMember $msg 'id'
            if ($null -ne $mid -and $mid -isnot [string] -and $mid -isnot [int] -and $mid -isnot [long] -and $mid -isnot [double] -and $mid -isnot [decimal]) { Set-LspMinFrameError $Fr 'MALFORMED' 'id 형식이 올바르지 않다'; break }
        }
        [void]$out.Add($msg)
        $Fr.pos = $total
        $Fr.bodyLen = $null
    }
    , @($out)
}

# ── 작업 폴더 도구 ─────────────────────────────────────────────────

# 작업 폴더가 요청이 정한 배치인지 다시 도출해 본다. 어긋나는 필드 이름 목록을 돌려준다.
function Test-LspMinLayoutMatches {
    param($Layout)
    $bad = New-Object System.Collections.ArrayList
    $work = [string](Get-LmProp $Layout 'work')
    if (-not [IO.Path]::IsPathRooted($work) -or $work.StartsWith('\\')) { [void]$bad.Add('work'); return , @($bad) }
    $want = Get-LspMinLayout -Work $work
    foreach ($k in $want.Keys) { if ([string](Get-LmProp $Layout $k) -cne [string]$want[$k]) { [void]$bad.Add($k) } }
    , @($bad)
}

function New-LspMinWorkDirs {
    param($Layout)
    foreach ($k in 'workspace', 'stateDir', 'rulesDir', 'homeDir', 'tmpDir') { [void][IO.Directory]::CreateDirectory([string](Get-LmProp $Layout $k)) }
}

# 감시 폴더 안의 파일(디렉터리는 제외) 목록: 폴더 기준 상대 경로, '/' 구분, 이름 순.
function Get-LspMinRootFiles {
    param([Parameter(Mandatory)][string]$Root)
    $files = [IO.Directory]::GetFiles($Root, '*', [IO.SearchOption]::AllDirectories)
    $rel = New-Object System.Collections.ArrayList
    $prefix = $Root.TrimEnd('\', '/')
    foreach ($f in $files) { [void]$rel.Add($f.Substring($prefix.Length).TrimStart('\', '/').Replace('\', '/')) }
    , @($rel | Sort-Object { $_ } -CaseSensitive)
}

# 자식 트리 판정용 프로세스 표(이미지 이름이 필요해 Name 을 더한다). 읽지 못하면 $null.
function Get-LspMinProcessTable {
    param([int]$TimeoutSec = 5)
    # 조회 한 번에 시간 제한을 둔다. 제한이 없으면 CIM 이 멈췄을 때 전체 상한을 넘어 기다린다.
    try { @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine, CreationDate -OperationTimeoutSec $TimeoutSec -ErrorAction Stop) } catch { $null }
}

function Get-LspMinSha256 {
    param([string]$Path)
    try { (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant() } catch { $null }
}

# 실행 중 상태($Ctx)를 쓰는 두 함수. $Ctx 는 실행 본문에서 만들고 함수는 부를 때 찾으므로, 시험이 가짜 $Ctx 와 가짜 stdin 스트림으로 불러 쓸 수 있도록
# 불러오기 반환(-LoadFunctionsOnly)보다 앞에 둔다. 정의만 하고 아무것도 실행하지 않는다.
function Add-LspMinTrigger {
    param([string]$Trigger, [string]$Condition = '', [string]$Detail = '')
    if ($null -eq $Ctx.trigger) { $Ctx.trigger = $Trigger } elseif ($Ctx.trigger -ne $Trigger -and -not $Ctx.also.Contains($Trigger)) { [void]$Ctx.also.Add($Trigger) }
    if ($Condition -ne '' -and $null -eq $Ctx.abort) { $Ctx.abort = [ordered]@{ condition = $Condition; detail = $Detail; tMs = [int]$Ctx.sw.ElapsedMilliseconds } }
    if ($Script:LspMinImmediate -contains $Trigger) { $Ctx.immediate = $true }
}
function Send-LspMinMessage {
    param([string]$Label, $Message)
    Assert-LspMinOutbound -Label $Label -Message $Message
    $rec = [ordered]@{ label = $Label; tMs = [int]$Ctx.sw.ElapsedMilliseconds; ok = $false }
    [void]$Ctx.sends.Add($rec)
    $bytes = ConvertTo-LspMinFrame -Message $Message
    if ($bytes.Length -gt $Script:LspMinMaxFrameBytes) { Add-LspMinTrigger 'STDIN_ERROR'; return $false }
    try { $Ctx.stdinStream.Write($bytes, 0, $bytes.Length); $Ctx.stdinStream.Flush() } catch { Add-LspMinTrigger 'STDIN_ERROR'; return $false }
    $rec.ok = $true
    $true
}

if ($Script:LspMode -eq 'Load') { return }

# ── 실행 ───────────────────────────────────────────────────────────

$resultPath = Join-Path (Split-Path -Parent $Script:LspRequestFile) 'lsp-min-result.json'
$res = [ordered]@{
    schema = 1; kind = 'lsp-min-runner-result'; runToken = $null; mode = $null; startedUtc = [DateTime]::UtcNow.ToString('o'); finishedUtc = $null
    runner = [ordered]@{ pid = $PID; sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; exe = $null; envNames = @([Environment]::GetEnvironmentVariables().Keys | Sort-Object) }
    request = $null; refused = $null; refusals = @(); error = $null; errorPhase = $null
    child = [ordered]@{ started = $false; pid = $null; startUtc = $null; mainModule = $null; spawnError = $null }
    sends = @()
    stdout = $null; stderr = $null
    frameError = $null; initResponseAtMs = $null
    exit = [ordered]@{ observed = $false; code = $null; signal = $null; tMs = $null }
    stdinClosed = [ordered]@{ byHarness = $false; ok = $null; tMs = $null }
    kill = [ordered]@{ count = 0; firstTMs = $null; confirmed = $null }
    trigger = $null; also = @(); abort = $null
    live = $null; roots = @(); artifacts = @()
    timeline = [ordered]@{ observationMs = $null; cleanupMs = $null }
    cleanup = [ordered]@{ childExitConfirmed = $false; streamsClosed = $null; descendantsAliveAfter = $null; descendantTracking = $null; dispose = 'NOT_CALLED'; timersCancelled = $true; problems = @() }
    descendantsSeen = @(); descendantsLeftoverKilled = @(); descendantsAliveAfterCleanup = $null; descendantTrackingOk = $true
}
try { $res.runner.exe = (Get-Process -Id $PID).Path } catch { }

# 실행 중 상태(함수들이 함께 쓰는 한 곳)
$Ctx = @{
    sw = $null; limits = $null; layout = $null; sends = (New-Object System.Collections.ArrayList); also = (New-Object System.Collections.ArrayList)
    trigger = $null; abort = $null; immediate = $false
    initMessage = $null; initCore = $null; initAt = $null; framesChecked = 0
    stdinStream = $null; p = $null; exitAt = $null; firstKill = $null; killCount = 0
    stderrTail = ''; stderrChecked = 0; initErrorLogged = $false
}
$p = $null; $streams = $null; $childPid = $null; $childStart = $null; $bodyDone = $false; $observationEnded = $false
$descSeen = @{}
$beforeFiles = @{}; $samplesProc = 0; $failProc = 0; $consProc = 0; $maxDesc = 0; $imagesSeen = @{}; $disallowed = @{}
$samplesFile = 0; $failFile = 0; $consFile = 0; $abortChecks = 0
try {
    $req = [IO.File]::ReadAllText($Script:LspRequestFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $res.runToken = [string]$req.runToken
    $res.mode = [string]$req.mode
    if ($req.resultFile) { $resultPath = [string]$req.resultFile }
    $args0 = @($req.args | ForEach-Object { [string]$_ })
    $layout = $req.layout
    $Ctx.layout = $layout
    $envReq = $req.env
    $envNames = @(); if ($envReq) { $envNames = @($envReq.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object) }
    $limNames = @('totalMs', 'initMs', 'exitMs', 'stdinCloseGraceMs', 'killConfirmMs', 'maxStdoutBytes', 'maxStderrBytes', 'sampleIntervalMs')
    $res.request = [ordered]@{ exe = [string]$req.exe; args = $args0; layoutWork = [string](Get-LmProp $layout 'work'); envNames = $envNames; limits = $req.limits }

    # ── 요청 검증: 이 두 모드 밖은 거부한다(범용 실행기가 되지 않게). 사유 토큰에는 값(경로·환경 값)을 싣지 않는다. ──
    $refusals = New-Object System.Collections.ArrayList
    $exe = [string]$req.exe
    if ([string]::IsNullOrWhiteSpace($req.runToken)) { [void]$refusals.Add('RUN_TOKEN_MISSING') }
    if (-not [IO.Path]::IsPathRooted($exe) -or $exe.StartsWith('\\')) { [void]$refusals.Add('COMMAND_NOT_ABSOLUTE') }
    elseif (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { [void]$refusals.Add('COMMAND_NOT_FOUND') }
    if ($req.mode -eq 'semgrep-lsp') {
        if ((Split-Path -Leaf $exe) -ne $Script:LspMinExeName) { [void]$refusals.Add('COMMAND_NAME_NOT_ALLOWED') }
        if ($args0.Count -ne 2 -or $args0[0] -cne 'lsp' -or $args0[1] -cne '--debug') { [void]$refusals.Add('ARGS_NOT_FIXED') }
    } elseif ($req.mode -eq 'stub') {
        if (-not $exe.Equals($Script:Ps51Path, [StringComparison]::OrdinalIgnoreCase)) { [void]$refusals.Add('STUB_COMMAND_NOT_ALLOWED') }
        elseif ($args0.Count -ne 7 -or ($args0[0..4] -join ' ') -ne '-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File') { [void]$refusals.Add('STUB_ARGS_NOT_FIXED') }
        elseif ((Split-Path -Leaf $args0[5]) -ne 'lsp-min-stub.ps1' -or -not ((Split-Path -Parent $args0[5]).Equals($Script:LspHere, [StringComparison]::OrdinalIgnoreCase))) { [void]$refusals.Add('STUB_SCRIPT_NOT_ALLOWED') }
        elseif ($Script:LspMinStubScenarios -notcontains $args0[6]) { [void]$refusals.Add('STUB_SCENARIO_NOT_ALLOWED') }
    } else { [void]$refusals.Add('MODE_UNKNOWN') }
    # 실행 파일 경로가 중단 문구를 담으면 --debug 가 argv 를 찍을 때 스스로 중단될 수 있다(단 한 번의 실행을 헛되이 쓰지 않도록 시작 전에 거절한다).
    if ($null -ne (Find-LspMinPathPattern $exe)) { [void]$refusals.Add('PATH_CONTAINS_ABORT_PATTERN:COMMAND') }

    # 배치: 요청이 준 경로는 작업 폴더에서 다시 도출한 것과 같아야 하고, 중단 문구를 담으면 안 된다(스스로 중단되는 사고).
    $layoutBad = Test-LspMinLayoutMatches $layout      # 함수가 `, @(...)` 로 돌려주므로 @() 로 다시 감싸지 않는다(빈 배열이 원소 하나로 보인다)
    if ($layoutBad.Count -gt 0) { [void]$refusals.Add('LAYOUT_MISMATCH') }
    else {
        foreach ($role in $Script:LspMinWatchedRoles) { if ($null -ne (Find-LspMinPathPattern (Get-LspMinRootPath $layout $role))) { [void]$refusals.Add("PATH_CONTAINS_ABORT_PATTERN:$role") } }
    }
    # 환경: 이름 집합과 값이 계약 함수가 만든 것과 같아야 한다.
    foreach ($n in $envNames) { if ($Script:LspMinEnvNames -cnotcontains $n) { [void]$refusals.Add('ENV_NAME_NOT_ALLOWED:' + ($n -replace '[^A-Za-z0-9_]', '?')) } }
    $url = [string](Get-LmProp $envReq 'SEMGREP_APP_URL'); $winDir = [string](Get-LmProp $envReq 'SYSTEMROOT')
    if ($url -cnotmatch '^http://127\.0\.0\.1:[0-9]{1,5}$') { [void]$refusals.Add('ENV_URL_NOT_LOOPBACK') }
    elseif ([string]::IsNullOrEmpty($winDir)) { [void]$refusals.Add('ENV_NAME_MISSING:SYSTEMROOT') }
    elseif ($layoutBad.Count -eq 0) {
        $want = New-LspMinChildEnv -WindowsDir $winDir -Layout $layout -Url $url
        foreach ($n in $Script:LspMinEnvNames) {
            if ($envNames -cnotcontains $n) { [void]$refusals.Add("ENV_NAME_MISSING:$n") }
            elseif ([string](Get-LmProp $envReq $n) -cne [string]$want[$n]) { [void]$refusals.Add("ENV_VALUE_UNEXPECTED:$n") }
        }
    }
    # 한도: 모두 있고 1 이상이며 계약 상한을 넘지 않는다.
    $lim = $req.limits
    foreach ($k in $limNames) {
        $v = Get-LmProp $lim $k
        if ($null -eq $v -or $v -isnot [int] -and $v -isnot [long] -and $v -isnot [double]) { [void]$refusals.Add("LIMIT_INVALID:$k") }
        elseif ([double]$v -lt 1) { [void]$refusals.Add("LIMIT_INVALID:$k") }
        elseif ([double]$v -gt [double]$Script:LspMinLimits[$k]) { [void]$refusals.Add("LIMIT_ABOVE_CAP:$k") }
    }
    # 설치물·중단 파일 경로.
    foreach ($a in @($req.artifacts)) {
        if ($null -eq $a) { continue }
        if (-not [IO.Path]::IsPathRooted([string]$a.path)) { [void]$refusals.Add('ARTIFACT_PATH_NOT_ABSOLUTE') }
        elseif ($null -ne (Find-LspMinPathPattern ([string]$a.path))) { [void]$refusals.Add('PATH_CONTAINS_ABORT_PATTERN:ARTIFACT') }
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

    # 폴더 준비 → 감시 폴더 셋이 비어 있는지 확인(비어 있지 않으면 시작하지 않는다).
    New-LspMinWorkDirs $layout
    $roots = New-Object System.Collections.ArrayList
    foreach ($role in $Script:LspMinWatchedRoles) {
        $files = Get-LspMinRootFiles (Get-LspMinRootPath $layout $role)
        $beforeFiles[$role] = $files
        [void]$roots.Add([ordered]@{ role = $role; filesBefore = $files.Count; filesAfter = $null; added = @(); removed = @() })
        if ($files.Count -gt 0) { [void]$refusals.Add("WATCHED_ROOT_NOT_EMPTY:$role") }
    }
    if ($refusals.Count -gt 0) { $res.refusals = @($refusals); $res.refused = ($refusals -join ','); throw "REFUSED: $($res.refused)" }
    $res.roots = @($roots)
    $arts = New-Object System.Collections.ArrayList
    foreach ($a in @($req.artifacts)) { if ($null -ne $a) { [void]$arts.Add([ordered]@{ label = [string]$a.label; path = [string]$a.path; before = (Get-LspMinSha256 ([string]$a.path)); after = $null }) } }

    $L = @{}; foreach ($k in $limNames) { $L[$k] = [int]$lim.$k }
    $Ctx.limits = $L

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
    $framer = New-LspMinFramer
    $decoder = (New-Object Text.UTF8Encoding($false)).GetDecoder()
    $maxPattern = ((@($Script:LspMinScanPatterns) + @($Script:LspMinNetworkPatterns) + @($Script:LspMinInitErrorLogPattern)) | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum

    # A4 허용 이미지: 실제 모드는 계약 목록 그대로. 스텁 모드에서만 스텁 서버 본체인 powershell.exe 를 더한다(자손은 여전히 이 목록으로 걸러진다).
    $allowedImages = @($Script:LspMinAllowedImages)
    if ($res.mode -eq 'stub') { $allowedImages += 'powershell.exe' }

    $state = 'INIT_WAIT'; $stateAt = 0; $lastSample = -1000; $exitSeenAt = $null; $stdinClosed = $false
    # 띄운 즉시 initialize 를 먼저 보낸다(표본은 그 뒤에 돈다). 응답은 init 한도까지 기다린다.
    $deadline = [int]$sw.ElapsedMilliseconds + $L.initMs
    [void](Send-LspMinMessage 'initialize' (New-LspMinInitializeMessage -Layout $layout))

    $closeStdin = {
        if (-not $stdinClosed) {
            $stdinClosed = $true
            $res.stdinClosed.byHarness = $true; $res.stdinClosed.tMs = [int]$sw.ElapsedMilliseconds
            try { $p.StandardInput.Close(); $res.stdinClosed.ok = $true } catch { $res.stdinClosed.ok = $false }
        }
    }
    $clamp = { param([int]$Ms) [Math]::Max(0, [Math]::Min($Ms, $L.totalMs - [int]$sw.ElapsedMilliseconds)) }

    while ($true) {
        foreach ($x in $streams) { Step-StreamRead $x }
        $now = [int]$sw.ElapsedMilliseconds

        # stdout: 새 바이트를 프레임으로, 완성된 메시지를 분류한다.
        if ($out.overflow) { Add-LspMinTrigger 'OUTPUT_LIMIT' }
        elseif ($out.failed) { $res.child.streamReadFailed = $true; Add-LspMinTrigger 'STDIN_ERROR' }
        if ($out.ms.Length -gt $out.consumed -or $framer.pos -lt $out.ms.Length) {
            $out.consumed = [int]$out.ms.Length
            $msgs = Step-LspMinFramer $framer $out.ms $L.maxStdoutBytes
            if ($framer.failed -and $null -eq $res.frameError) { $res.frameError = $framer.error; Add-LspMinTrigger 'FRAME_ERROR' }
            foreach ($m in $msgs) {
                $Ctx.framesChecked++
                # 분류는 TS classifyServerMessage 와 같은 규칙(키 이름은 대소문자 그대로)으로 한다. 어긋나면 러너(흐름)가 받아들인 응답을 기록(TS)은 응답 없음으로 읽는다.
                $kind = Get-LspMinMessageKind $m
                if ($kind -eq 'response') {
                    $mid = Get-LmExactMember $m 'id'
                    if ($mid -is [string] -and $mid -ceq $Script:LspMinInitId -and $null -eq $Ctx.initMessage) {
                        $Ctx.initMessage = $m; $Ctx.initCore = Get-LspMinInitCore $m; $Ctx.initAt = $now
                    }
                } elseif ($kind -eq 'notification') {
                    $nm = [string](Get-LmExactMember $m 'method')
                    if ($Script:LspMinAbortMethods -ccontains $nm) { Add-LspMinTrigger 'LIVE_ABORT' 'A8' $nm }
                }
            }
        }
        # stderr: 새 바이트를 문구 감시에 먹인다(청크 경계에 걸친 문구도 잡도록 꼬리를 이어 붙인다).
        if ($err.overflow) { Add-LspMinTrigger 'OUTPUT_LIMIT' }
        elseif ($err.failed) { $res.child.streamReadFailed = $true }
        if ($err.ms.Length -gt $err.consumed) {
            $ebuf = $err.ms.GetBuffer(); $count = [int]$err.ms.Length - $err.consumed
            $chars = New-Object char[] ($count + 4)
            $nc = $decoder.GetChars($ebuf, $err.consumed, $count, $chars, 0, $false)
            $err.consumed = [int]$err.ms.Length
            $Ctx.stderrChecked += $count
            $window = ($Ctx.stderrTail + (New-Object string (, [char[]]$chars[0..([Math]::Max(0, $nc - 1))]))).ToLowerInvariant()
            if ($nc -eq 0) { $window = $Ctx.stderrTail }
            if ($window.Contains($Script:LspMinInitErrorLogPattern)) { $Ctx.initErrorLogged = $true }
            $Ctx.stderrTail = $window.Substring([Math]::Max(0, $window.Length - ($maxPattern - 1)))
            if ($null -eq $Ctx.abort) {
                $hit = Find-LspMinAbortPattern $window
                if ($null -ne $hit) { Add-LspMinTrigger 'LIVE_ABORT' $hit.condition $hit.pattern }
            }
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
                    if ($first -cmatch '^(A3|A7):[A-Z_]{1,40}$') { Add-LspMinTrigger 'LIVE_ABORT' $first.Substring(0, 2) $first.Substring(3) }
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
                            if ($allowedImages -cnotcontains $img) { $disallowed[$img] = $true; Add-LspMinTrigger 'LIVE_ABORT' 'A4' $img }
                        }
                    }
                }
            }
            if (-not $Ctx.immediate) {
                $samplesFile++
                $failedThis = $false
                foreach ($role in $Script:LspMinWatchedRoles) {
                    $list = $null
                    try { $list = Get-LspMinRootFiles (Get-LspMinRootPath $layout $role) } catch { $failedThis = $true; $failFile++; continue }
                    foreach ($f in $list) { if (Test-LspMinRootViolation $role $f) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' $role; break } }
                }
                if ($failedThis) { $consFile++ } else { $consFile = 0 }
                if ($consFile -ge $Script:LspMinConsecutiveFailures) { Add-LspMinTrigger 'LIVE_ABORT' 'A5' 'LIST_FAILED' }
            }
        }
        if ($Ctx.immediate) { break }

        # 상태 흐름
        switch ($state) {
            'INIT_WAIT' {
                if ($null -ne $Ctx.initCore) {
                    if ($Ctx.initCore.ok) {
                        $exitDeadline = $now + $L.exitMs
                        if (-not (Send-LspMinMessage 'shutdown' (New-LspMinShutdownMessage))) { break }
                        if (-not (Send-LspMinMessage 'exit' (New-LspMinExitMessage))) { break }
                        $state = 'EXIT_WAIT'; $deadline = $exitDeadline
                    } else {
                        Add-LspMinTrigger 'INIT_INVALID'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now
                    }
                } elseif ($out.eof) {
                    Add-LspMinTrigger 'CHILD_EXITED_EARLY'
                } elseif ($now -ge $deadline) {
                    Add-LspMinTrigger 'INIT_TIMEOUT'; & $closeStdin; $state = 'CLOSE_WAIT'; $stateAt = $now
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

    # 스트림이 닫히기를 잠깐(최대 1초, 종료 확인 창 안에서) 기다려 닫힘 여부를 정한다. 반드시 자손을 끝내기 **전에** 정한다:
    # 자손을 끝내면 파이프가 닫혀 버려 '자손이 파이프를 쥐고 있었다'는 사실이 사라진다.
    $streamSettleEnd = [Math]::Min($windowEnd, [int]$sw.ElapsedMilliseconds + 1000)
    while ($true) {
        foreach ($x in $streams) { Step-StreamRead $x }
        if (($out.eof -or $out.overflow -or $out.failed) -and ($err.eof -or $err.overflow -or $err.failed)) { break }
        if ([int]$sw.ElapsedMilliseconds -ge $streamSettleEnd) { break }
        Start-Sleep -Milliseconds 20
    }
    $res.cleanup.streamsClosed = Test-StreamsClosed $streams
    if ($res.cleanup.streamsClosed -eq $false) { $res.cleanup.problems += 'STREAMS_NOT_CLOSED' }

    # 마지막 표본: 남은 자손. 콘솔 호스트(conhost.exe)처럼 부모가 끝난 뒤 잠깐 남는 것을 걸러내려고 최대 1초(종료 확인 창 안에서) 안정되기를 기다린다.
    # 정리는 이 러너가 하지만(Invoke-DescendantCleanup), 안정된 뒤에도 자손이 남아 있었다는 사실은 정리 문제로 기록한다.
    # Get-DescendantRecords 는 `, 배열` 로 돌려주므로 @() 로 다시 감싸지 않고 그대로 받는다(빈 배열이 원소 하나로 보이는 함정).
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

    # 스트림: 마지막으로 한 번 더 읽고 기록한다.
    foreach ($x in $streams) { Step-StreamRead $x }       # 자손을 끝낸 뒤 늦게 닿은 바이트까지 담는다(닫힘 여부는 위에서 이미 정했다)
    $res.cleanup.dispose = 'OK'
    try { $p.Dispose() } catch { $res.cleanup.dispose = 'FAILED'; $res.cleanup.problems += 'DISPOSE_FAILED' }
    $res.timeline.observationMs = $observationEnd

    # 사후 비교: 감시 폴더의 전후 파일 이름, 설치물 해시.
    $finalRoots = New-Object System.Collections.ArrayList
    foreach ($r in $res.roots) {
        $after = $null
        try { $after = Get-LspMinRootFiles (Get-LspMinRootPath $layout $r.role) } catch { $after = $null }
        $r.filesAfter = $(if ($null -eq $after) { $null } else { @($after).Count })
        $r.added = $(if ($null -eq $after) { @() } else { @($after) })       # 실행 전에는 비어 있었으므로 전부 추가된 파일이다
        [void]$finalRoots.Add($r)
    }
    $res.roots = @($finalRoots)
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
        stderrCheckedBytes = $Ctx.stderrChecked; stdoutFramesChecked = $Ctx.framesChecked; initErrorLogged = $Ctx.initErrorLogged
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
