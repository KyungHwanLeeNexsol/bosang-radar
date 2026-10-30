# LSP-RULES-1 관리자 진입점(Test-LspRulesObservation.ps1)의 순수 계약과 판정 함수.
# LSP-MIN-1 의 LspMinAdminContract.ps1 에서 그대로 쓸 수 있는 것(토큰, 감독 결정, 5157 건수, 정리 묶기, 종료 코드, 실패 토큰 정리)은 거기서 쓰고,
# 이 파일에는 규칙 로딩 관측에만 필요한 것(작업 폴더 목적지, 프로브 검증, 해시 대조, 요청, 결합, 신원 교차 확인, 문맥 문서, 판정 이름)만 둔다.
# 이 파일은 부작용이 없다: 불러와도 아무것도 실행하지 않고, 파일·프로세스·네트워크·계정·방화벽·감사·ACL·환경에 닿지 않는다(문자열·객체 계산만 한다).
# 실제로 시스템에 닿는 일은 LspRulesAdminPorts.ps1 의 포트 함수와 진입 스크립트가 한다.
# 이 계약은 하네스가 정한 것이며 실제 Semgrep 으로 확인한 형식이 아니다. 실제 출력을 보고 계약을 고치지 않는다.
# SEMGREP_LOG_SRCS 도, 토큰 이름도, SEMGREP_ENABLE_VERSION_CHECK 도 이 파일 어디에도 없다(소유자 결정 D5).
#
# 먼저 읽혀 있어야 하는 것: IsolationCommon.ps1(ConvertTo-UtcDate), LspRulesContract.ps1(LspMinContract.ps1 포함), LspMinAdminContract.ps1.

$Script:LrAdminSchema = 'lsp-rules-admin-observation/1'
$Script:LrAdminContextSchema = 'lsp-rules-admin-context/1'
$Script:LrAdminContextKind = 'lsp-rules-admin-context'
# 한도 이름은 러너의 계약(LspRulesContract.ps1)에서 그대로 가져온다: LSP-MIN-1 의 여덟 개 + 장벽 한도(rulesMs) + 장벽 뒤 감시(settleMs).
$Script:LrAdminLimitNames = @($Script:LrLimits.Keys | ForEach-Object { [string]$_ })
# LSP-MIN-1 의 작업 배치(작업 폴더 아래 lsp)와 섞이지 않도록 이 관측은 작업 폴더 아래 lsp-rules 를 쓴다.
$Script:LrAdminWorkLeaf = 'lsp-rules'
# 관리자 권한으로 지우거나 쓰는 작업 폴더 안의 파일 이름. 진입점의 삭제·복사 목록과 경로 조각 확인 목록이 같은 곳에서 나오게 여기 한 번만 적는다.
$Script:LrAdminWorkTransientFiles = @('lsp-rules-request.json', 'lsp-rules-result.json', 'lsp-rules-result.json.tmp', 'lsp-rules-abort.flag')
$Script:LrAdminWorkCopyFiles = @('lsp-rules-runner.ps1', 'LspRulesContract.ps1', 'lsp-min-runner.ps1', 'LspMinContract.ps1', 'version-runner.ps1', 'lsp-rules-stub.ps1')
# 스텁 시나리오 이름은 러너(lsp-rules-runner.ps1)의 목록과 같아야 한다(시험이 대조한다).
$Script:LrAdminStubScenarios = @(
    'ok', 'rules-zero', 'yaml-error', 'invalid-rule', 'wrong-file-loaded', 'notification-only', 'log-missing', 'log-variant', 'log-duplicate', 'order-violation',
    'header-variants', 'json-dump-signal-text', 'engine-line-leak', 'download-line', 'registry-line', 'token-line', 'settings-line', 'publish-diagnostics', 'workspace-scan-line',
    'early-signal', 'early-notification', 'initialize-error', 'error-response', 'version-mismatch', 'wrong-id', 'requests-2', 'request-disallowed', 'requests-3', 'request-malformed',
    'delayed-forbidden', 'barrier-timeout', 'exit-ignored', 'exit-ignored-eof', 'nonzero-exit', 'stderr-split', 'stdout-split', 'flood-err', 'flood-out', 'orphan',
    'write-ws', 'write-extra-rules', 'modify-probe', 'shutdown-reply', 'silent', 'silent-hold', 'exit-early', 'exit-during-refresh', 'garbage', 'env-names', 'spawn-disallowed',
    'notification-twice', 'home-write'
)
# 관리자가 실행 전후로 해시를 재는 파일의 이름표. 실제 모드는 설치물 넷, 스텁 모드는 띄우는 실행 파일 하나다. 이 키가 모두 유효한 해시로 같아야 "바뀌지 않았다"고 한다.
$Script:LrAdminRealArtifactKeys = @('semgrepExe', 'semgrepCore', 'venvPython', 'basePython')
$Script:LrAdminStubArtifactKeys = @('launchedExe')

# 입력을 문자열 목록으로 바꾼다. $null 은 빈 목록이다(`@($null)` 은 원소가 하나인 배열이라 쓰지 않는다). 빈 문자열은 버린다.
function ConvertTo-LrAdminList {
    param($Value)
    $out = New-Object System.Collections.ArrayList
    if ($null -ne $Value) {
        foreach ($x in @($Value)) { if ($null -ne $x -and [string]$x -ne '') { [void]$out.Add([string]$x) } }
    }
    , $out.ToArray()
}

# ── 작업 폴더 목적지 ─────────────────────────────────────────────────────

# 관리자 권한의 삭제·복사·쓰기가 닿거나 전용 계정이 새로 쓰는 모든 목적지: 작업 폴더, 이 관측의 작업 배치(lsp-rules)와 그 아래 상태 폴더들, 프로브 파일 자리,
# 요청·결과·중단 표지, 러너 사본. 경로 조각 확인(신뢰 루트 → 목적지)이 이 목록 전부를 본다. 아직 없는 조각에서는 멈추므로 목록에 있어도 해가 없다.
function Get-LrAdminWorkTargets {
    param([Parameter(Mandatory)][string]$WorkDir, [Parameter(Mandatory)][string]$RulesWork)
    $t = New-Object System.Collections.ArrayList
    [void]$t.Add($WorkDir); [void]$t.Add($RulesWork)
    $layout = Get-LrLayout -Work $RulesWork
    foreach ($k in 'stateDir', 'workspace', 'rulesDir', 'homeDir', 'tmpDir') { [void]$t.Add([string]$layout[$k]) }
    [void]$t.Add((Get-LrProbePath $layout))
    $base = $WorkDir.TrimEnd('\', '/')   # 문자열 연결만 한다(이 파일은 경로를 읽지 않는다)
    foreach ($n in @($Script:LrAdminWorkTransientFiles) + @($Script:LrAdminWorkCopyFiles)) { [void]$t.Add($base + '\' + $n) }
    , $t.ToArray()
}

# ── 프로브 검증과 해시 대조 ──────────────────────────────────────────────

# 프로브 규칙 파일의 바이트가 계약의 고정값(233바이트, 고정 sha256)과 같은가. 읽지 못한 것($null)·크기가 다른 것·해시가 다른 것은 모두 ok=false 다.
function Test-LrAdminProbeBytes {
    param($Bytes)
    $r = [ordered]@{ ok = $false; size = $null; sha256 = $null; problems = @() }
    $p = New-Object System.Collections.ArrayList
    if ($null -eq $Bytes -or $Bytes -isnot [byte[]]) { [void]$p.Add('PROBE_BYTES_MISSING'); $r.problems = @($p); return $r }
    $r.size = $Bytes.Length
    if ($Bytes.Length -ne $Script:LrProbeBytes) { [void]$p.Add('PROBE_SIZE_MISMATCH') }
    $r.sha256 = Get-LrSha256Hex $Bytes
    if ($r.sha256 -cne $Script:LrProbeSha256) { [void]$p.Add('PROBE_HASH_MISMATCH') }
    $r.ok = ($p.Count -eq 0)
    $r.problems = @($p)
    $r
}

# 같은 파일을 서로 다른 곳에서 잰 두 값을 하나로 합친다(관리자 문맥에 싣는 값).
#  · 둘 다 유효한 64자리 16진수이고 같으면 그 값.
#  · 둘 다 유효하지만 다르면 기대값이 **아닌** 쪽(어느 쪽이든 읽는 쪽이 일치로 읽을 수 없게 한다).
#  · 하나라도 $null·빈 문자열·16진수가 아닌 값이면 $null — 읽지 못한 값이 다른 읽지 못한 값이나 유효한 값과 "같다"고 하지 않는다(모르면 성립하지 않는다).
function Resolve-LrAdminHash {
    param($Expected, $First, $Second)
    $x = ConvertTo-LspMinSha256 $First
    $y = ConvertTo-LspMinSha256 $Second
    if ($null -eq $x -or $null -eq $y) { return $null }
    if ($x -ceq $y) { return $x }
    if ($x -cne [string]$Expected) { return $x }
    $y
}

# 실행 전후 해시 대조. RequiredKeys 의 모든 이름이 양쪽에서 유효한 64자리 해시로 존재하고 같아야 unchanged 다.
# 읽지 못해 $null·빈 값인 것은 같은 읽지 못한 값끼리도 "같다"고 하지 않는다(BEFORE_UNKNOWN / AFTER_UNKNOWN). 키 목록이 비어 있으면 대조할 것이 없다(스텁 모드가 아닌 곳에서는 비지 않는다).
function Test-LrAdminHashesUnchanged {
    param($Before, $After, $RequiredKeys)
    $p = New-Object System.Collections.ArrayList
    $keys = @()
    if ($null -ne $RequiredKeys) { $keys = @($RequiredKeys) }
    foreach ($k in $keys) {
        $b = ConvertTo-LspMinSha256 (Get-LmProp $Before ([string]$k))
        $a = ConvertTo-LspMinSha256 (Get-LmProp $After ([string]$k))
        if ($null -eq $b) { [void]$p.Add("BEFORE_UNKNOWN:$k") }
        elseif ($null -eq $a) { [void]$p.Add("AFTER_UNKNOWN:$k") }
        elseif ($a -cne $b) { [void]$p.Add("CHANGED:$k") }
    }
    [ordered]@{ unchanged = ($p.Count -eq 0); problems = @($p) }
}

# 감시 폴더 셋의 실행 뒤 파일 목록(관리자가 직접 읽은 것)에서 금지된 상태를 찾는다. Roots: 역할 → 파일 목록(상대 경로) 또는 $null(읽지 못함).
# 작업 영역은 비어 있어야 하고, 규칙 폴더는 프로브 하나뿐이어야 하며, 홈은 지문 폴더 아래만 허용한다. 읽지 못한 폴더는 깨끗하다고 하지 않는다.
function Get-LrAdminRootProblems {
    param($Roots)
    $p = New-Object System.Collections.ArrayList
    foreach ($role in $Script:LspMinWatchedRoles) {
        # 값을 함수의 출력으로 돌려받지 않고 직접 꺼낸다: 빈 목록이 함수 출력에서 풀려 $null(= 읽지 못함)로 보이는 일을 막는다.
        $files = $null
        if ($Roots -is [System.Collections.IDictionary]) { if ($Roots.Contains($role)) { $files = $Roots[$role] } }
        elseif ($null -ne $Roots) { $pp = $Roots.PSObject.Properties[$role]; if ($pp) { $files = $pp.Value } }
        if ($null -eq $files) { [void]$p.Add("ROOT_UNREADABLE:$role"); continue }
        $list = @($files)
        if ($role -ceq 'RULES_DIR') {
            $probes = 0
            foreach ($f in $list) {
                if (Test-LrOrdinalEqual (ConvertTo-LrJsLower ([string]$f)) $Script:LrProbeFile) { $probes++ } else { [void]$p.Add("ROOT_CHANGED:$role") }
            }
            if ($probes -ne 1) { [void]$p.Add("ROOT_CHANGED:$role") }
        } else {
            foreach ($f in $list) { if (Test-LrRootViolation $role ([string]$f)) { [void]$p.Add("ROOT_CHANGED:$role"); break } }
        }
    }
    , @($p | Select-Object -Unique)
}

# ── 요청 ──────────────────────────────────────────────────────────────

# 러너에 줄 요청 문서. 러너가 읽는 키만 담는다. 프로브 규칙의 바이트(probeB64)는 관리자가 먼저 고정값과 대조해 검증한 것이고, 러너가 규칙 폴더에 쓴다.
function New-LrAdminRunnerRequest {
    param(
        [Parameter(Mandatory)][string]$Token, [Parameter(Mandatory)][ValidateSet('semgrep-lsp', 'stub')][string]$Mode,
        [Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string[]]$ArgList, [Parameter(Mandatory)]$Layout,
        [Parameter(Mandatory)]$Env, [Parameter(Mandatory)]$Limits, [string]$ExpectedVersion, [Parameter(Mandatory)][AllowEmptyString()][string]$ProbeB64,
        [object[]]$Artifacts = @(), [Parameter(Mandatory)][string]$AbortFile, [Parameter(Mandatory)][string]$ResultFile
    )
    [ordered]@{ runToken = $Token; mode = $Mode; exe = $Exe; args = @($ArgList); layout = $Layout; env = $Env; limits = $Limits; expectedVersion = $ExpectedVersion; probeB64 = $ProbeB64; artifacts = @($Artifacts); abortFile = $AbortFile; resultFile = $ResultFile }
}

# 요청이 계약과 모순되지 않는가(보내기 전의 자기 점검). 러너 자신의 정적 거절 검사(Get-LrStaticRefusals)를 그대로 쓰고, 관리자 쪽 요구를 더한다. 사유 토큰 목록(값은 싣지 않는다).
function Test-LrAdminRunnerRequest {
    param([Parameter(Mandatory)]$Request)
    $bad = New-Object System.Collections.ArrayList
    $static = Get-LrStaticRefusals $Request
    foreach ($r in @($static.refusals)) { [void]$bad.Add([string]$r) }
    $mode = [string](Get-LmProp $Request 'mode')
    $lim = Get-LmProp $Request 'limits'
    if (Test-LrOrdinalEqual $mode 'semgrep-lsp') {
        # 실제 모드의 한도는 계약 값 그대로다(줄이지도 않는다).
        foreach ($k in $Script:LrAdminLimitNames) {
            $v = Get-LmProp $lim $k
            if ($null -eq $v -or [double]$v -ne [double]$Script:LrLimits[$k]) { [void]$bad.Add("LIMIT_NOT_CAP:$k") }
        }
    } elseif (Test-LrOrdinalEqual $mode 'stub') {
        $a = @(Get-LmProp $Request 'args' | ForEach-Object { [string]$_ })
        if ($a.Count -ne 7 -or -not (Test-LrOrdinalIn ([string]$a[6]) $Script:LrAdminStubScenarios)) { [void]$bad.Add('STUB_ARGS') }
        foreach ($k in $Script:LrAdminLimitNames) {
            $v = Get-LmProp $lim $k
            if ($null -eq $v -or [double]$v -lt 1) { [void]$bad.Add("LIMIT_INVALID:$k") }
        }
    }
    if ([string]::IsNullOrWhiteSpace([string](Get-LmProp $Request 'runToken'))) { [void]$bad.Add('TOKEN_MISSING') }
    if ([string]::IsNullOrWhiteSpace([string](Get-LmProp $Request 'expectedVersion'))) { [void]$bad.Add('EXPECTED_VERSION_MISSING') }
    if (-not [IO.Path]::IsPathRooted([string](Get-LmProp $Request 'abortFile'))) { [void]$bad.Add('ABORT_FILE_NOT_ABSOLUTE') }
    if (-not [IO.Path]::IsPathRooted([string](Get-LmProp $Request 'resultFile'))) { [void]$bad.Add('RESULT_FILE_NOT_ABSOLUTE') }
    , @($bad | Select-Object -Unique)
}

# ── 결과 결합과 신원 교차 확인 ────────────────────────────────────────────

# 결과가 이번 요청의 것인가. 실패 코드 목록(빈 목록이면 결합 성립). 토큰·모드·요청 반향·시작 시각은 LSP-MIN-1 의 Test-LspMinResultBinding 을 그대로 쓴다.
# 그 함수는 결과 종류를 lsp-min 으로 고정해 읽으므로, 종류를 여기서 먼저 확인한 뒤 종류 한 칸만 바꾼 읽기 전용 사본에 건다. 장벽 한도·장벽 뒤 감시·기대 버전의 반향은 여기서 더 본다.
function Test-LrAdminResultBinding {
    param($Result, [Parameter(Mandatory)]$Request, [Parameter(Mandatory)][string]$RunId, [Parameter(Mandatory)][DateTime]$LaunchedUtc)
    if ($null -eq $Result -or (($Result -isnot [pscustomobject]) -and ($Result -isnot [System.Collections.IDictionary]))) { return , @('RESULT_NOT_OBJECT') }
    $f = New-Object System.Collections.ArrayList
    if ((Get-LmProp $Result 'schema') -ne 1 -or -not (Test-LrOrdinalEqual (Get-LmProp $Result 'kind') 'lsp-rules-runner-result')) { [void]$f.Add('RESULT_SCHEMA') }
    $view = [ordered]@{}
    if ($Result -is [System.Collections.IDictionary]) { foreach ($k in $Result.Keys) { $view[[string]$k] = $Result[$k] } }
    else { foreach ($p in $Result.PSObject.Properties) { $view[$p.Name] = $p.Value } }
    $view['kind'] = 'lsp-min-runner-result'
    $view['schema'] = 1
    foreach ($c in (Test-LspMinResultBinding -Result $view -Request $Request -RunId $RunId -LaunchedUtc $LaunchedUtc)) {
        if ([string]$c -cne 'RESULT_SCHEMA') { [void]$f.Add([string]$c) }
    }
    $echo = Get-LmProp $Result 'request'
    if ($null -ne $echo) {
        foreach ($k in 'rulesMs', 'settleMs') {
            $ev = Get-LmProp (Get-LmProp $echo 'limits') $k
            $rv = Get-LmProp (Get-LmProp $Request 'limits') $k
            if ($null -eq $ev -or $null -eq $rv -or [double]$ev -ne [double]$rv) { [void]$f.Add("ECHO_LIMIT:$k"); break }
        }
        if (-not (Test-LrOrdinalEqual ([string](Get-LmProp $echo 'expectedVersion')) ([string](Get-LmProp $Request 'expectedVersion')))) { [void]$f.Add('ECHO_EXPECTED_VERSION') }
    }
    , @($f | Select-Object -Unique)
}

# 관리자 쪽 CIM 으로 본 자손 프로세스 트리(루트 포함하지 않음). 루트 PID 의 시작 시각보다 이른 후보는 PID 재사용으로 보고 버린다. Table: Win32_Process 행의 목록.
function Get-LrAdminDescendantCim {
    param([int]$RootPid, $RootStart, $Table)
    $byParent = @{}
    foreach ($p in $Table) {
        $k = [int]$p.ParentProcessId
        if (-not $byParent.ContainsKey($k)) { $byParent[$k] = New-Object System.Collections.ArrayList }
        [void]$byParent[$k].Add($p)
    }
    $out = New-Object System.Collections.ArrayList
    $seen = @{ $RootPid = $true }
    $queue = New-Object System.Collections.Queue; $queue.Enqueue($RootPid)
    while ($queue.Count -gt 0) {
        $cur = [int]$queue.Dequeue()
        if (-not $byParent.ContainsKey($cur)) { continue }
        foreach ($c in $byParent[$cur]) {
            $cid = [int]$c.ProcessId
            if ($seen.ContainsKey($cid)) { continue }
            if ($null -ne $RootStart -and $c.CreationDate -lt $RootStart) { continue }
            $seen[$cid] = $true; [void]$out.Add($c); $queue.Enqueue($cid)
        }
    }
    , $out.ToArray()
}

# 신원 교차 확인: 러너의 자기 보고(결과) ↔ 요청 ↔ 관리자 CIM. 실행기·자식의 소유 SID, 실행 파일, 부모 관계, 명령줄, 시작 시각을 대조한다.
# 결과 {code, message} 의 목록(빈 목록이면 통과). 받아들인 결과가 없으면 NO_ACCEPTED_RESULT 하나다. 러너가 스스로 거절한 요청은 자식이 없는 것이 정상이다.
function Get-LrAdminIdentityFailures {
    param(
        $Result, $RunnerRec, $Tracked, [string]$Sid, [int]$ParentPid, [Parameter(Mandatory)][string]$Ps51, [Parameter(Mandatory)][string]$Exe, $Argv, [Parameter(Mandatory)][DateTime]$LaunchedUtc
    )
    $fail = New-Object System.Collections.ArrayList
    $addF = { param([string]$Code, [string]$Msg); [void]$fail.Add([ordered]@{ code = $Code; message = $Msg }) }
    $same = { param($a, $b); ($null -ne $a) -and ($null -ne $b) -and ([string]$a).Equals([string]$b, [StringComparison]::OrdinalIgnoreCase) }
    if ($null -eq $Result) { & $addF 'NO_ACCEPTED_RESULT' '받아들인 러너 결과가 없다'; return , @($fail) }
    $refused = [string](Get-LmProp $Result 'refused')
    if (-not $RunnerRec) { & $addF 'NO_RUNNER_CIM' '실행기 프로세스의 CIM 기록이 없다' }
    else {
        if ([string](Get-LmProp $RunnerRec 'ownerSid') -ne $Sid) { & $addF 'RUNNER_OWNER_MISMATCH' "실행기 소유 SID 가 전용 계정이 아니다($(Get-LmProp $RunnerRec 'ownerSid'))" }
        if (-not (& $same (Get-LmProp $RunnerRec 'exePath') $Ps51)) { & $addF 'RUNNER_EXE_MISMATCH' "실행기 실행 파일이 기대와 다르다($(Get-LmProp $RunnerRec 'exePath'))" }
        if ((ConvertTo-UtcDate (Get-LmProp $RunnerRec 'startUtc')) -lt $LaunchedUtc.AddSeconds(-2)) { & $addF 'RUNNER_STARTED_BEFORE_LAUNCH' '실행기 시작 시각이 이번 실행 시작보다 이르다' }
    }
    $rself = Get-LmProp $Result 'runner'
    if ([int](Get-LmProp $rself 'pid') -ne $ParentPid) { & $addF 'SELF_PID_MISMATCH' '실행기 자기 보고 PID 가 CIM 의 PID 와 다르다' }
    if ([string](Get-LmProp $rself 'sid') -ne $Sid) { & $addF 'SELF_SID_MISMATCH' '실행기 자기 보고 SID 가 전용 계정이 아니다' }
    if (-not (& $same (Get-LmProp $rself 'exe') $Ps51)) { & $addF 'SELF_EXE_MISMATCH' '실행기 자기 보고 실행 파일이 기대와 다르다' }
    $cinfo = Get-LmProp $Result 'child'
    if (-not [bool](Get-LmProp $cinfo 'started')) {
        if (-not $refused) { & $addF 'CHILD_NOT_STARTED' '실행기가 자식을 시작하지 못했다' }
    } else {
        $cpid = [int](Get-LmProp $cinfo 'pid')
        $cands = @($Tracked | Where-Object { (Get-LmProp $_ 'role') -eq 'descendant' -and [int](Get-LmProp $_ 'processId') -eq $cpid })
        if ($cands.Count -lt 1) { & $addF 'CHILD_CIM_MISSING' "자식(PID $cpid)의 CIM 기록을 관리자 쪽에서 잡지 못했다(너무 빨리 끝났거나 놓쳤다)" }
        else {
            $childRec = $cands[0]
            if ([int](Get-LmProp $childRec 'parentProcessId') -ne $ParentPid) { & $addF 'CHILD_PARENT_MISMATCH' '자식의 부모 PID 가 실행기가 아니다' }
            if ([string](Get-LmProp $childRec 'ownerSid') -ne $Sid) { & $addF 'CHILD_OWNER_MISMATCH' "자식 소유 SID 가 전용 계정이 아니다($(Get-LmProp $childRec 'ownerSid'))" }
            if (-not (& $same (Get-LmProp $childRec 'exePath') $Exe)) { & $addF 'CHILD_EXE_MISMATCH' "자식 실행 파일이 기대와 다르다($(Get-LmProp $childRec 'exePath'))" }
            $cl = ([string](Get-LmProp $childRec 'commandLine')).Replace('"', '').Trim()
            $wantCl = ($Exe + ' ' + (@($Argv) -join ' ')).Replace('"', '').Trim()
            if (-not $cl.Equals($wantCl, [StringComparison]::OrdinalIgnoreCase)) { & $addF 'CHILD_COMMANDLINE_MISMATCH' "자식 명령줄이 기대와 다르다(실제: $cl)" }
            $selfStart = Get-LmProp $cinfo 'startUtc'
            if ($selfStart) {
                $dt = [Math]::Abs(((ConvertTo-UtcDate $selfStart) - (ConvertTo-UtcDate (Get-LmProp $childRec 'startUtc'))).TotalSeconds)
                if ($dt -gt 3) { & $addF 'CHILD_START_MISMATCH' "자식 시작 시각이 자기 보고와 CIM 에서 ${dt}초 다르다" }
            }
            $mm = Get-LmProp $cinfo 'mainModule'
            if ($mm -and -not (& $same $mm $Exe)) { & $addF 'CHILD_MAINMODULE_MISMATCH' '자식 자기 보고 실행 파일이 요청과 다르다' }
        }
    }
    , @($fail)
}

# ── 관리자 문맥과 판정 ────────────────────────────────────────────────────

# TS 재해석(lsp-rules-reinterpret-cli.ts)에 넘길 관리자 문맥 문서(러너 결과 원문과 짝). 관측하지 못한 값은 $null 로 둔다(0 이나 true 로 채우지 않는다).
#  · RunnerLaunched: 전용 계정의 러너를 실제로 띄웠는가. $false 는 서버를 띄우지 않았음(사전 조건 실패)에만 쓴다. 띄운 뒤의 신원·결합·해시 실패는 $true 인 채로 관측 불성립 사유가 된다.
#  · Probe: sourceSha256 / afterCopySha256 / afterRunSha256 (Resolve-LrAdminHash 등으로 합친 값).
#  · OsBlock: Get-LspMinOsBlockCounts 의 결과. 주지 않으면 확인 못 한 것으로 쓴다.
function New-LrAdminContext {
    param(
        [Parameter(Mandatory)][string]$RunId, [Parameter(Mandatory)][string]$Token, [Parameter(Mandatory)][string]$Mode, [Parameter(Mandatory)][string]$Work, $ExpectedVersion, $Limits,
        [bool]$RunnerLaunched, $Refusals,
        $ReceiverBaseline, $ReceiverFinal, [int]$ReceiverSamples, [int]$ReceiverFailures,
        $Probe,
        [bool]$IdentityOk, $IdentityFailures, [bool]$BindingOk, $BindingFailures,
        [bool]$AbortRequested, $AbortReason, $AbortDelivered, [bool]$ForcedKill, [bool]$DeadlineReached, [bool]$ResultMissing,
        $DescendantPathViolations, [bool]$HashesUnchanged, $OsBlock = $null
    )
    [ordered]@{
        schema = $Script:LrAdminContextSchema; kind = $Script:LrAdminContextKind; runId = $RunId; runToken = $Token; mode = $Mode; work = $Work; expectedVersion = $ExpectedVersion; limits = $Limits
        runnerLaunched = $RunnerLaunched; refusals = (ConvertTo-LrAdminList $Refusals)
        receiver = [ordered]@{ baselineHits = $ReceiverBaseline; finalHits = $ReceiverFinal; samples = $ReceiverSamples; failures = $ReceiverFailures }
        probe = [ordered]@{ sourceSha256 = (Get-LmProp $Probe 'sourceSha256'); afterCopySha256 = (Get-LmProp $Probe 'afterCopySha256'); afterRunSha256 = (Get-LmProp $Probe 'afterRunSha256') }
        identity = [ordered]@{ ok = $IdentityOk; failures = (ConvertTo-LrAdminList $IdentityFailures) }
        binding = [ordered]@{ ok = $BindingOk; failures = (ConvertTo-LrAdminList $BindingFailures) }
        supervisor = [ordered]@{ abortRequested = $AbortRequested; abortReason = $AbortReason; abortDelivered = $AbortDelivered; forcedKill = $ForcedKill; deadlineReached = $DeadlineReached; resultMissing = $ResultMissing }
        descendantPathViolations = (ConvertTo-LrAdminList $DescendantPathViolations)
        hashesUnchanged = $HashesUnchanged
        # 5157(OS 차단 이벤트) 요약: usable=수집·감사·로그가 확실했는가, attributedCount=이번 실행의 프로세스에 귀속된 건수(확실하지 않으면 null).
        osBlock = [ordered]@{ usable = $(if ($null -ne $OsBlock) { [bool](Get-LspMinAdminProp $OsBlock 'usable') } else { $false }); attributedCount = $(if ($null -ne $OsBlock) { Get-LspMinAdminProp $OsBlock 'attributed' } else { $null }) }
    }
}

# 최종 판정 이름. 성립하면 RULES_LOAD_OBSERVED, 서버를 띄우지 못했으면 NOT_ATTEMPTED:<사유>, 재해석 기록이 성립 아닌 판정을 냈으면 그 판정(LOAD_FAILED:·NOT_CONFIRMED:·ABORTED:·NOT_OBSERVED:·NOT_ATTEMPTED:),
# 기록은 성립인데 관리자 쪽 사유가 막았거나 기록이 없으면 NOT_OBSERVED:<주 실패 토큰>. 스텁 실행은 STUB_ 를 앞에 붙여 실제 Semgrep 의 관측과 섞이지 않게 한다.
function Get-LrAdminVerdict {
    param([bool]$Established, $NotAttempted, $RecordStatus, $RecordVerdict, $PrimaryFailure, [bool]$Stub)
    $core = $null
    $negative = @('LOAD_FAILED', 'NOT_CONFIRMED', 'ABORTED', 'NOT_ATTEMPTED', 'NOT_OBSERVED')
    if ($Established) { $core = 'RULES_LOAD_OBSERVED' }
    elseif (-not [string]::IsNullOrEmpty([string]$NotAttempted)) { $core = 'NOT_ATTEMPTED:' + [string]$NotAttempted }
    elseif ((Test-LrOrdinalIn ([string]$RecordStatus) $negative) -and (-not [string]::IsNullOrEmpty([string]$RecordVerdict))) { $core = [string]$RecordVerdict }
    else {
        $pf = [string]$PrimaryFailure
        if ($pf -eq '') { $pf = 'UNKNOWN' }
        $core = 'NOT_OBSERVED:' + $pf
    }
    if ($Stub) { return ('STUB_' + $core) }
    $core
}
