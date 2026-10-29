# LSP-MIN-1 관리자 진입점(Test-LspMinObservation.ps1)의 순수 계약과 판정 함수.
# 이 파일은 부작용이 없다: 불러와도 아무것도 실행하지 않고, 파일·프로세스·네트워크·계정·방화벽·감사·ACL·환경에 닿지 않는다(문자열·객체 계산만 한다).
# 실제로 시스템에 닿는 일은 LspMinAdminPorts.ps1 의 포트 함수와 진입 스크립트가 한다.
# 이 계약은 하네스가 정한 것이며 실제 Semgrep 으로 확인한 형식이 아니다. 실제 출력을 보고 계약을 고치지 않는다.
# `initialized` 는 이 파일 어디에도 없다. SEMGREP_ENABLE_VERSION_CHECK 도 없다(소유자 결정: LSP 환경에 더하지 않는다).

$Script:LspMinAdminSchema = 'lsp-min-admin-observation/1'
$Script:LspMinAdminContextSchema = 'lsp-min-admin-context/1'
$Script:LspMinAdminContextKind = 'lsp-min-admin-context'
# 스텁 시나리오 이름은 러너(lsp-min-runner.ps1)의 목록과 같아야 한다(시험이 대조한다).
$Script:LspMinAdminStubScenarios = @('ok', 'error', 'initialize-error', 'wrong-id', 'split', 'silent', 'silent-hold', 'ignore-exit', 'ignore-exit-eof', 'exit-early', 'garbage', 'server-request', 'stderr-scan', 'stderr-split', 'stderr-download', 'publish', 'write-ws', 'flood-out', 'flood-err', 'orphan', 'env-names', 'spawn-disallowed', 'id-case', 'jsonrpc-case', 'method-case')
# 러너 기동에 허용하는 시간(프로필 불러오기 등)과 감독 유예. 실제 모드에서는 이 값 그대로, 스텁 모드에서만 줄일 수 있다.
$Script:LspMinAdminStartAllowanceMs = 20000
$Script:LspMinAdminSupervisorGraceMs = 15000
$Script:LspMinAdminKillSettleMs = 3000
$Script:LspMinAdminLimitNames = @('totalMs', 'initMs', 'exitMs', 'stdinCloseGraceMs', 'killConfirmMs', 'maxStdoutBytes', 'maxStderrBytes', 'sampleIntervalMs')
$Script:LspMinAdminAbortTexts = @('A3:RECEIVER_HIT', 'A3:RECEIVER_UNREADABLE', 'A7:SUPERVISOR_DEADLINE', 'A7:OPERATOR_CANCEL')
$Script:LspMinAdminRunIdPattern = '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$'

function Get-LspMinAdminProp {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) { if ($Object.Contains($Name)) { return $Object[$Name] }; return $null }
    $p = $Object.PSObject.Properties[$Name]
    if ($p) { return $p.Value }
    $null
}

# ── 해시·경로·보고서 대조 ───────────────────────────────────────────────

# 전체 64자리 16진수만 받는다(앞부분만 쓴 축약형은 거절). 소문자로 정규화한 값을 돌려주고, 아니면 $null.
function ConvertTo-LspMinSha256 {
    param($Value)
    if ($Value -isnot [string]) { return $null }
    if ($Value -cnotmatch '^[0-9a-fA-F]{64}$') { return $null }
    $Value.ToLowerInvariant()
}

function Get-LspMinLeaf {
    param([string]$Path)
    $parts = $Path.Split([char[]]@('\', '/'))
    $parts[$parts.Length - 1]
}

# 배포물 검증 보고서(PR #35)에서 `경로`(크기바이트, [SHA-256 ]`해시`) 짝을 모두 뽑는다. 파일을 읽지 않고 문자열만 본다.
function Get-LspMinDistReportEntries {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
    $out = New-Object System.Collections.ArrayList
    $re = '`(?<path>[^`\r\n]+)`\((?<size>[0-9,]+)바이트,\s*(?:SHA-256\s*)?`(?<hash>[0-9a-fA-F]{64})`'
    foreach ($m in [regex]::Matches($Text, $re)) {
        [void]$out.Add([ordered]@{ path = $m.Groups['path'].Value; leaf = (Get-LspMinLeaf $m.Groups['path'].Value); size = [long]($m.Groups['size'].Value -replace ',', ''); sha256 = $m.Groups['hash'].Value.ToLowerInvariant() })
    }
    , @($out)
}

# 휠 해시는 보고서의 `win_amd64` 행에서 읽는다(표 한 줄에 해시가 있다).
function Get-LspMinDistReportWheelHashes {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
    $out = New-Object System.Collections.ArrayList
    foreach ($line in $Text.Split("`n")) {
        if ($line.Contains('win_amd64')) { foreach ($m in [regex]::Matches($line, '(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])')) { [void]$out.Add($m.Value.ToLowerInvariant()) } }
    }
    , @($out)
}

# 현재 파일의 해시·크기가 보고서의 값과 같은가. 항목마다 id/ok/detail. 같은 파일 이름에 다른 해시가 하나라도 적혀 있으면 충돌로 거절한다.
# 값이 없으면($null) 해당 항목은 ok=false 다(확인 못 한 것은 통과가 아니다).
function Test-LspMinReportCrossCheck {
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$ReportText,
        [string]$ExeSha256, $ExeSize, [string]$CoreSha256, $CoreSize, [string]$WheelSha256
    )
    # 두 함수는 `, @(...)` 로 돌려주므로 @() 로 다시 감싸지 않는다(빈 배열이 원소 하나로 보이는 함정).
    $entries = Get-LspMinDistReportEntries -Text $ReportText
    $wheels = Get-LspMinDistReportWheelHashes -Text $ReportText
    $items = New-Object System.Collections.ArrayList
    $add = { param([string]$Id, [bool]$Ok, [string]$Detail); [void]$items.Add([ordered]@{ id = $Id; ok = $Ok; detail = $Detail }) }
    $pairCheck = {
        param([string]$Id, [string]$Leaf, [string]$Hash, $Size)
        $same = @($entries | Where-Object { $_.leaf -ieq $Leaf })
        if ($same.Count -eq 0) { & $add $Id $false "보고서에 $Leaf 의 해시 짝이 없다"; return }
        $conflict = @($same | Where-Object { $_.sha256 -ne $Hash })
        $match = @($same | Where-Object { $_.sha256 -eq $Hash })
        if ($conflict.Count -gt 0) { & $add $Id $false "보고서에 $Leaf 의 다른 해시가 적혀 있다($($conflict.Count)건)"; return }
        if ($null -eq $Size) { & $add $Id $false "$Leaf 의 현재 크기를 모른다"; return }
        $sizeOk = @($match | Where-Object { $_.size -eq [long]$Size }).Count -gt 0
        & $add $Id $sizeOk "보고서 해시 일치, 크기 보고서=$($match[0].size) 현재=$Size"
    }
    $eh = ConvertTo-LspMinSha256 $ExeSha256
    if ($null -eq $eh) { & $add 'R1' $false 'semgrep.exe 해시가 64자리 16진수가 아니다' } else { & $pairCheck 'R1' 'semgrep.exe' $eh $ExeSize }
    if ($CoreSha256) {
        $ch = ConvertTo-LspMinSha256 $CoreSha256
        if ($null -eq $ch) { & $add 'R2' $false 'semgrep-core.exe 해시가 64자리 16진수가 아니다' } else { & $pairCheck 'R2' 'semgrep-core.exe' $ch $CoreSize }
    }
    $wh = ConvertTo-LspMinSha256 $WheelSha256
    if ($null -eq $wh) { & $add 'R3' $false '휠 해시가 64자리 16진수가 아니다' }
    else {
        $others = @($wheels | Where-Object { $_ -ne $wh })
        $hit = @($wheels | Where-Object { $_ -eq $wh }).Count
        & $add 'R3' ($hit -gt 0 -and $others.Count -eq 0) "win_amd64 행에서 휠 해시 일치=$hit, 다른 값=$($others.Count)"
    }
    [ordered]@{ ok = (@($items | Where-Object { -not $_.ok }).Count -eq 0); items = @($items) }
}

# 설치 위치에서 도출한 실행 파일 경로(문자열 계산만).
function Get-LspMinExpectedExePath {
    param([Parameter(Mandatory)][string]$DistRoot)
    [IO.Path]::Combine($DistRoot, 'venv', 'Scripts', 'semgrep.exe')
}

# 두 경로가 같은 파일을 가리키는가: 둘 다 로컬 절대 경로, '..'·'.' 조각 없음, 정규화 뒤 대소문자 무시 동일.
function Test-LspMinSamePath {
    param($A, $B)
    if ($A -isnot [string] -or $B -isnot [string]) { return $false }
    foreach ($p in $A, $B) {
        if (-not [IO.Path]::IsPathRooted($p) -or $p.StartsWith('\\')) { return $false }
        if (@($p.Split([char[]]@('\', '/')) | Where-Object { $_ -eq '..' -or $_ -eq '.' }).Count -gt 0) { return $false }
    }
    [IO.Path]::GetFullPath($A).TrimEnd('\', '/').Equals([IO.Path]::GetFullPath($B).TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)
}

# ── 실행별 토큰·요청 ────────────────────────────────────────────────────

# 토큰에 RunId 를 넣는다: 러너는 토큰을 그대로 되돌려 쓰므로(불투명 문자열) 결과가 어느 실행의 것인지 RunId 까지 결합된다.
function New-LspMinRunToken {
    param([Parameter(Mandatory)][string]$RunId, [Parameter(Mandatory)][string]$Nonce)
    if ($RunId -cnotmatch $Script:LspMinAdminRunIdPattern) { throw "RunId 형식이 올바르지 않다" }
    if ($Nonce -cnotmatch '^[0-9a-f]{32}$') { throw "Nonce 형식이 올바르지 않다" }
    "lsp-$RunId-$Nonce"
}

# 토큰이 이 RunId 의 것인가. 결과: ok, runId, nonce.
function Test-LspMinTokenForRun {
    param($Token, [Parameter(Mandatory)][string]$RunId)
    $r = [ordered]@{ ok = $false; runId = $null; nonce = $null }
    if ($Token -isnot [string]) { return $r }
    $m = [regex]::Match($Token, '^lsp-(?<run>[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8})-(?<n>[0-9a-f]{32})$')
    if (-not $m.Success) { return $r }
    $r.runId = $m.Groups['run'].Value; $r.nonce = $m.Groups['n'].Value
    $r.ok = ($r.runId -ceq $RunId)
    $r
}

# 러너에 줄 요청 문서. 러너가 읽는 키만 담는다.
function New-LspMinRunnerRequest {
    param(
        [Parameter(Mandatory)][string]$Token, [Parameter(Mandatory)][ValidateSet('semgrep-lsp', 'stub')][string]$Mode,
        [Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string[]]$ArgList, [Parameter(Mandatory)]$Layout,
        [Parameter(Mandatory)]$Env, [Parameter(Mandatory)]$Limits, [object[]]$Artifacts = @(), [Parameter(Mandatory)][string]$AbortFile, [Parameter(Mandatory)][string]$ResultFile
    )
    [ordered]@{ runToken = $Token; mode = $Mode; exe = $Exe; args = @($ArgList); layout = $Layout; env = $Env; limits = $Limits; artifacts = @($Artifacts); abortFile = $AbortFile; resultFile = $ResultFile }
}

# 요청이 계약과 모순되지 않는가(보내기 전의 자기 점검). 어긋난 사유 토큰 목록(값은 싣지 않는다).
function Test-LspMinRunnerRequest {
    param([Parameter(Mandatory)]$Request)
    $bad = New-Object System.Collections.ArrayList
    $mode = [string](Get-LspMinAdminProp $Request 'mode')
    $exe = [string](Get-LspMinAdminProp $Request 'exe')
    $args0 = @((Get-LspMinAdminProp $Request 'args') | ForEach-Object { [string]$_ })
    if ($mode -ceq 'semgrep-lsp') {
        if ((Get-LspMinLeaf $exe) -cne $Script:LspMinExeName) { [void]$bad.Add('EXE_NAME') }
        if ($args0.Count -ne 2 -or $args0[0] -cne 'lsp' -or $args0[1] -cne '--debug') { [void]$bad.Add('ARGS_NOT_FIXED') }
        $lim = Get-LspMinAdminProp $Request 'limits'
        foreach ($k in $Script:LspMinAdminLimitNames) { if ([double](Get-LspMinAdminProp $lim $k) -ne [double]$Script:LspMinLimits[$k]) { [void]$bad.Add("LIMIT_NOT_CAP:$k") } }
    } elseif ($mode -ceq 'stub') {
        if ($args0.Count -ne 7 -or $Script:LspMinAdminStubScenarios -cnotcontains $args0[6]) { [void]$bad.Add('STUB_ARGS') }
        $lim = Get-LspMinAdminProp $Request 'limits'
        foreach ($k in $Script:LspMinAdminLimitNames) { $v = Get-LspMinAdminProp $lim $k; if ($null -eq $v -or [double]$v -lt 1 -or [double]$v -gt [double]$Script:LspMinLimits[$k]) { [void]$bad.Add("LIMIT_INVALID:$k") } }
    } else { [void]$bad.Add('MODE') }
    if ([string]::IsNullOrWhiteSpace([string](Get-LspMinAdminProp $Request 'runToken'))) { [void]$bad.Add('TOKEN_MISSING') }
    $layout = Get-LspMinAdminProp $Request 'layout'
    $want = Get-LspMinLayout -Work ([string](Get-LspMinAdminProp $layout 'work'))
    foreach ($k in $want.Keys) { if ([string](Get-LspMinAdminProp $layout $k) -cne [string]$want[$k]) { [void]$bad.Add("LAYOUT:$k") } }
    $envr = Get-LspMinAdminProp $Request 'env'
    $names = @($envr.Keys | Sort-Object)
    foreach ($n in $names) { if ($Script:LspMinEnvNames -cnotcontains $n) { [void]$bad.Add('ENV_NAME_NOT_ALLOWED') } }
    foreach ($n in $Script:LspMinEnvNames) { if ($names -cnotcontains $n) { [void]$bad.Add("ENV_NAME_MISSING:$n") } }
    if (-not [IO.Path]::IsPathRooted([string](Get-LspMinAdminProp $Request 'abortFile'))) { [void]$bad.Add('ABORT_FILE_NOT_ABSOLUTE') }
    , @($bad | Select-Object -Unique)
}

# ── 결과 결합(러너 자기 보고를 요청과 맞춰 본다) ─────────────────────────────

# 결과가 이번 요청의 것인가. 실패 코드 목록(빈 목록이면 결합 성립). 이전 실행의 결과 재사용은 토큰·시작 시각으로 거절한다.
function Test-LspMinResultBinding {
    param($Result, [Parameter(Mandatory)]$Request, [Parameter(Mandatory)][string]$RunId, [Parameter(Mandatory)][DateTime]$LaunchedUtc)
    $f = New-Object System.Collections.ArrayList
    if ($null -eq $Result -or (($Result -isnot [pscustomobject]) -and ($Result -isnot [System.Collections.IDictionary]))) { return , @('RESULT_NOT_OBJECT') }
    if ((Get-LspMinAdminProp $Result 'schema') -ne 1 -or (Get-LspMinAdminProp $Result 'kind') -cne 'lsp-min-runner-result') { [void]$f.Add('RESULT_SCHEMA') }
    $tok = Get-LspMinAdminProp $Result 'runToken'
    if ($tok -isnot [string] -or $tok -cne [string](Get-LspMinAdminProp $Request 'runToken')) { [void]$f.Add('TOKEN_MISMATCH') }
    if (-not (Test-LspMinTokenForRun $tok $RunId).ok) { [void]$f.Add('TOKEN_RUNID_MISMATCH') }
    if ([string](Get-LspMinAdminProp $Result 'mode') -cne [string](Get-LspMinAdminProp $Request 'mode')) { [void]$f.Add('MODE_MISMATCH') }
    $echo = Get-LspMinAdminProp $Result 'request'
    if ($null -ne $echo) {
        if ([string](Get-LspMinAdminProp $echo 'exe') -cne [string](Get-LspMinAdminProp $Request 'exe')) { [void]$f.Add('ECHO_EXE') }
        $ea = @((Get-LspMinAdminProp $echo 'args') | ForEach-Object { [string]$_ }); $ra = @((Get-LspMinAdminProp $Request 'args') | ForEach-Object { [string]$_ })
        if (($ea -join "`n") -cne ($ra -join "`n")) { [void]$f.Add('ECHO_ARGS') }
        if ([string](Get-LspMinAdminProp $echo 'layoutWork') -cne [string](Get-LspMinAdminProp (Get-LspMinAdminProp $Request 'layout') 'work')) { [void]$f.Add('ECHO_LAYOUT') }
        $en = @((Get-LspMinAdminProp $echo 'envNames') | ForEach-Object { [string]$_ } | Sort-Object); $rn = @((Get-LspMinAdminProp $Request 'env').Keys | Sort-Object)
        if (($en -join ',') -cne ($rn -join ',')) { [void]$f.Add('ECHO_ENV_NAMES') }
        foreach ($k in $Script:LspMinAdminLimitNames) {
            $ev = Get-LspMinAdminProp (Get-LspMinAdminProp $echo 'limits') $k
            if ($null -eq $ev -or [double]$ev -ne [double](Get-LspMinAdminProp (Get-LspMinAdminProp $Request 'limits') $k)) { [void]$f.Add("ECHO_LIMIT:$k"); break }
        }
    } elseif ($null -eq (Get-LspMinAdminProp $Result 'refused') -or [string](Get-LspMinAdminProp $Result 'refused') -eq '') { [void]$f.Add('ECHO_MISSING') }
    $st = Get-LspMinAdminProp $Result 'startedUtc'
    $stDt = $null
    # pwsh 7 의 ConvertFrom-Json 은 ISO 문자열을 이미 DateTime 으로 풀어 준다(5.1 은 문자열 그대로).
    if ($st -is [DateTime]) { $stDt = $st.ToUniversalTime() }
    else { try { $stDt = ([DateTime]::Parse([string]$st, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)).ToUniversalTime() } catch { } }
    if ($null -eq $stDt) { [void]$f.Add('STARTED_UNPARSEABLE') } elseif ($stDt -lt $LaunchedUtc.AddSeconds(-2)) { [void]$f.Add('STARTED_BEFORE_LAUNCH') }
    , @($f)
}

# 송신 기록이 계약 순서(initialize → shutdown → exit 의 앞부분)인가. 판정의 본체는 TS 재해석이 하고, 여기서는 자기 보고의 최소 일관성만 본다.
function Test-LspMinSendsShape {
    param($Result)
    $labels = @((Get-LspMinAdminProp $Result 'sends') | Where-Object { $null -ne $_ } | ForEach-Object { [string](Get-LspMinAdminProp $_ 'label') })
    if ($labels.Count -gt $Script:LspMinSendOrder.Count) { return $false }
    for ($i = 0; $i -lt $labels.Count; $i++) { if ($labels[$i] -cne $Script:LspMinSendOrder[$i]) { return $false } }
    $true
}

# ── 감독(러너가 매달려도 관리자 쪽에서 마감을 지키는 결정) ───────────────────────

# 시각은 모두 실행 시작 이후 경과 ms. 러너의 동기 호출과 무관하게 관리자 루프가 부르는 순수 결정 함수다.
# 반환: NONE | REQUEST_ABORT(관측 마감 도달, 아직 요청 안 함) | FORCE_KILL(요청 뒤 정리 유예까지 지났는데 러너가 아직 있다) | GIVE_UP(강제 종료 뒤 안정 시간이 지났다)
function Get-LspMinSupervisorAction {
    param(
        [Parameter(Mandatory)][int]$ElapsedMs, [Parameter(Mandatory)]$Limits, [bool]$ResultSeen, [bool]$RunnerAlive,
        $AbortRequestedAtMs, $ForceKilledAtMs, [int]$StartAllowanceMs = $Script:LspMinAdminStartAllowanceMs, [int]$GraceMs = $Script:LspMinAdminSupervisorGraceMs, [int]$SettleMs = $Script:LspMinAdminKillSettleMs
    )
    if ($ResultSeen -and -not $RunnerAlive) { return 'NONE' }
    $observationDeadline = $StartAllowanceMs + [int]$Limits.totalMs
    if ($null -ne $ForceKilledAtMs) { if ($ElapsedMs -ge ([int]$ForceKilledAtMs + $SettleMs)) { return 'GIVE_UP' }; return 'NONE' }
    if ($null -eq $AbortRequestedAtMs) { if ($ElapsedMs -ge $observationDeadline) { return 'REQUEST_ABORT' }; return 'NONE' }
    if ($RunnerAlive -and $ElapsedMs -ge ([int]$AbortRequestedAtMs + [int]$Limits.killConfirmMs + $GraceMs)) { return 'FORCE_KILL' }
    'NONE'
}

# ── 프로세스 경로 점검 ──────────────────────────────────────────────────

# 관리자 쪽 CIM 으로 본 자손의 실행 파일 경로가 허용 폴더 밖인가(러너의 이미지 허용 목록은 이름만 보므로 경로로 다시 본다). 밖에 있는 것의 목록을 돌려준다.
function Get-LspMinDescendantPathViolations {
    param($Tracked, [Parameter(Mandatory)][string[]]$AllowedDirs)
    $dirs = @($AllowedDirs | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\', '/') + '\' })
    $out = New-Object System.Collections.ArrayList
    foreach ($r in @($Tracked)) {
        if ((Get-LspMinAdminProp $r 'role') -ne 'descendant') { continue }
        $p = [string](Get-LspMinAdminProp $r 'exePath')
        $ok = $false
        if ($p) { foreach ($d in $dirs) { if ($p.StartsWith($d, [StringComparison]::OrdinalIgnoreCase)) { $ok = $true; break } } }
        if (-not $ok) { [void]$out.Add([ordered]@{ processId = (Get-LspMinAdminProp $r 'processId'); exePath = $(if ($p) { $p } else { $null }) }) }
    }
    , @($out)
}

# ── 5157 이벤트 계수(0건으로 채우지 않는다) ─────────────────────────────────

# 수집 상태에서 건수를 정한다. 수집이 안 됐거나 감사가 꺼져 있었거나 로그가 밀렸으면 모든 건수가 $null 이다.
function Get-LspMinOsBlockCounts {
    param([bool]$CollectionOk, $AuditFailureEnabled, $LogWrapped, $AttributedCount, $UnidentifiedCount)
    $usable = ($CollectionOk -and ($AuditFailureEnabled -eq $true) -and ($LogWrapped -eq $false))
    $why = New-Object System.Collections.ArrayList
    if (-not $CollectionOk) { [void]$why.Add('COLLECTION_FAILED') }
    if ($AuditFailureEnabled -ne $true) { [void]$why.Add('AUDIT_NOT_CONFIRMED') }
    if ($LogWrapped -ne $false) { [void]$why.Add('LOG_WRAPPED_OR_UNKNOWN') }
    [ordered]@{ usable = $usable; attributed = $(if ($usable) { $AttributedCount } else { $null }); unidentified = $(if ($usable) { $UnidentifiedCount } else { $null }); unusableBecause = @($why) }
}

# 5157 요약이 관측 성립을 막는가: 귀속된 차단 이벤트가 1건 이상이면 OS_BLOCK_ATTRIBUTED, 건수를 믿을 수 없으면(수집 실패·감사 미확인·로그 밀림) OS_BLOCK_EVIDENCE_UNAVAILABLE.
# "차단된 연결이 없었다"고 말할 증거가 없는데 관측이 성립했다고 하지 않는다. 식별 불가 이벤트(예: 시스템 프로세스의 UDP 137/138)는 막지 않고 건수만 따로 적는다.
function Get-LspMinOsBlockFailureTokens {
    param([Parameter(Mandatory)]$Counts)
    $t = New-Object System.Collections.ArrayList
    if (-not [bool](Get-LspMinAdminProp $Counts 'usable')) { [void]$t.Add('OS_BLOCK_EVIDENCE_UNAVAILABLE') }
    else {
        $a = Get-LspMinAdminProp $Counts 'attributed'
        if ($null -eq $a) { [void]$t.Add('OS_BLOCK_EVIDENCE_UNAVAILABLE') } elseif ([int]$a -gt 0) { [void]$t.Add('OS_BLOCK_ATTRIBUTED') }
    }
    , @($t)
}

# ── 세 결과를 따로 두는 최종 판정 ────────────────────────────────────────

# 정리 항목(ConvertTo-IsoCleanupItem 모양) 목록에서 이름 접두로 묶는다.
function Group-LspMinCleanupItems {
    param($Items)
    $proc = @($Items | Where-Object { $_.name -like 'listener-*' -or $_.name -like 'process-*' })
    $sys = @($Items | Where-Object { $_.name -like 'account-*' -or $_.name -like 'audit-*' })
    [ordered]@{
        processCleanup = [ordered]@{ ok = (@($proc | Where-Object { -not $_.ok }).Count -eq 0); items = $proc }
        systemRecovery = [ordered]@{ ok = (@($sys | Where-Object { -not $_.ok }).Count -eq 0); items = $sys }
    }
}

# 종료 코드: 정리(프로세스·시스템)가 하나라도 실패하면 70, 아니면 관측이 성립했으면 0, 아니면 60. 관측과 정리는 서로를 바꾸지 않는다.
function Get-LspMinAdminExitCode {
    param([bool]$Established, [bool]$ProcessCleanupOk, [bool]$SystemRecoveryOk)
    if (-not ($ProcessCleanupOk -and $SystemRecoveryOk)) { return 70 }
    if ($Established) { return 0 }
    60
}

# 관측 실패 토큰을 우선순위대로 하나의 주 토큰과 전체 목록으로 정리한다(중복 제거, 순서 보존).
function Get-LspMinFailureSummary {
    param([string[]]$Tokens)
    $priority = @('RECEIVER_NOT_READY', 'RUNNER_NO_RESULT', 'RESULT_UNREADABLE', 'RESULT_BINDING_FAILED', 'IDENTITY_UNVERIFIED', 'RUNNER_REFUSED', 'SUPERVISOR_FORCED_KILL', 'RECEIVER_HIT', 'RECEIVER_UNREADABLE', 'OS_BLOCK_ATTRIBUTED', 'OS_BLOCK_EVIDENCE_UNAVAILABLE', 'ABORT_DELIVERY_FAILED', 'HASH_CHANGED', 'DESCENDANT_PATH_UNEXPECTED', 'REINTERPRETATION_NOT_RUN', 'REINTERPRETATION_FAILED')
    $all = @($Tokens | Where-Object { $_ } | Select-Object -Unique)
    $primary = $null
    foreach ($p in $priority) { if ($all -contains $p) { $primary = $p; break } }
    if ($null -eq $primary -and $all.Count -gt 0) { $primary = $all[0] }
    [ordered]@{ primary = $primary; all = $all }
}

# TS 재해석에 넘길 관리자 문맥 문서(runner 결과와 짝). 관측하지 못한 값은 $null 로 둔다.
function New-LspMinAdminContext {
    param(
        [Parameter(Mandatory)][string]$RunId, [Parameter(Mandatory)][string]$Token, [Parameter(Mandatory)][string]$Mode, $ExpectedVersion, $Limits,
        $ReceiverBaseline, $ReceiverFinal, [int]$ReceiverSamples, [int]$ReceiverFailures,
        [bool]$IdentityOk, [string[]]$IdentityFailures, [bool]$BindingOk, [string[]]$BindingFailures,
        [bool]$AbortRequested, $AbortReason, $AbortDelivered, [bool]$ForcedKill, [bool]$DeadlineReached, [bool]$ResultMissing,
        [string[]]$DescendantPathViolations, [bool]$HashesUnchanged, $OsBlock = $null
    )
    [ordered]@{
        schema = $Script:LspMinAdminContextSchema; kind = $Script:LspMinAdminContextKind; runId = $RunId; runToken = $Token; mode = $Mode; expectedVersion = $ExpectedVersion; limits = $Limits
        receiver = [ordered]@{ baselineHits = $ReceiverBaseline; finalHits = $ReceiverFinal; samples = $ReceiverSamples; failures = $ReceiverFailures }
        identity = [ordered]@{ ok = $IdentityOk; failures = @($IdentityFailures) }
        binding = [ordered]@{ ok = $BindingOk; failures = @($BindingFailures) }
        supervisor = [ordered]@{ abortRequested = $AbortRequested; abortReason = $AbortReason; abortDelivered = $AbortDelivered; forcedKill = $ForcedKill; deadlineReached = $DeadlineReached; resultMissing = $ResultMissing }
        descendantPathViolations = @($DescendantPathViolations)
        hashesUnchanged = $HashesUnchanged
        # 5157(OS 차단 이벤트) 요약: usable=수집·감사·로그가 확실했는가, attributedCount=이번 실행의 프로세스에 귀속된 건수(확실하지 않으면 null). 주지 않으면 확인 못 한 것으로 본다.
        osBlock = [ordered]@{ usable = $(if ($null -ne $OsBlock) { [bool](Get-LspMinAdminProp $OsBlock 'usable') } else { $false }); attributedCount = $(if ($null -ne $OsBlock) { Get-LspMinAdminProp $OsBlock 'attributed' } else { $null }) }
    }
}
