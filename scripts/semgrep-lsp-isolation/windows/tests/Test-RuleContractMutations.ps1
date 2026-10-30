<#
.SYNOPSIS
  방화벽 규칙 생성 계약 대조의 핵심 검사를 하나씩 빼 보고(제한된 변이 점검) 시험이 그 결함을 잡는지 확인한다. 실제 Semgrep 은 실행하지도 임포트하지도 않고, 계정·방화벽·감사·ACL 을 읽지도 바꾸지도 않는다.
.DESCRIPTION
  변이마다: 코드 폴더(windows)를 이 저장소의 형제 폴더(windows.mut-<id>)로 복사 → 한 파일의 한 군데를 정확히 한 번만 바꾼다(바뀐 곳이 없거나 둘 이상이면 변이 실패) → 관련 시험을 변이본에 돌린다 →
  시험이 하나라도 실패하거나 도중에 멈추면 CAUGHT(잡힘), 전부 통과하면 MISSED(놓침)다. 정상 복사본(변이 없음)은 전부 통과해야 한다(CONTROL).
  - 'base' = tests\Test-IsolationBaseline.ps1 (순수 판정·읽기 포트·Verify 흐름), 'flow' = tests\Test-LspRulesAdmin.ps1 -Only rule-contract (관리자 진입점 흐름).
  - 변이본은 -CodeDir 로 넘긴다. 시험 코드와 모의 파일은 원본 tests 폴더의 것을 그대로 쓴다. 변이본 폴더는 끝나면 지운다(저장소에 남지 않는다).
  - 이 점검은 "이 시험들이 이 변이를 잡는다"까지만 뜻한다. 모든 가능한 결함을 잡는다는 뜻이 아니다.
  종료 코드: 0 모든 변이가 잡힘 + 정상 복사본 통과 / 1 놓친 변이가 있거나 변이를 적용하지 못했거나 정상 복사본이 실패.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\tests\Test-RuleContractMutations.ps1 -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -NodeDir C:\node
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\tests\Test-RuleContractMutations.ps1 -Only m01,m20 -SkipFlow
#>
[CmdletBinding()]
param(
    [string]$CodeDir,
    [string[]]$Only = @(),
    [switch]$SkipFlow,
    [string]$TsxCmd,
    [string]$NodeDir
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
if (-not $CodeDir) { $CodeDir = Split-Path -Parent $PSScriptRoot }
$CodeDir = (Resolve-Path -LiteralPath $CodeDir).Path
$ParentDir = Split-Path -Parent $CodeDir
$HostExe = Join-Path $PSHOME 'powershell.exe'
if ($PSVersionTable.PSEdition -eq 'Core') { $HostExe = Join-Path $PSHOME 'pwsh.exe' }
$Utf8Bom = New-Object Text.UTF8Encoding($true)

# 변이 목록. file = 바꿀 파일, old = 정확히 한 번 있어야 하는 원문, new = 바꾼 문구, suites = 돌릴 시험.
$Mutations = @(
    @{ id = 'm01'; file = 'IsolationBaselineCore.ps1'; what = '계정 SID 를 정확히 비교하지 않고 SDDL 문자열에 SID 가 들어 있는지만 본다(수정 전 결함 복원)'; suites = @('base', 'flow')
        old = 'if (-not $ace.SecurityIdentifier.Equals($want)) {'; new = 'if (-not $Sddl.ToUpperInvariant().Contains($Sid.ToUpperInvariant())) {' },
    @{ id = 'm02'; file = 'IsolationBaselineCore.ps1'; what = 'ACE 가 정확히 한 건이라는 검사를 "한 건 이상"으로 느슨하게 한다'; suites = @('base')
        old = 'if ($null -eq $dacl -or $dacl.Count -ne 1) {'; new = 'if ($null -eq $dacl -or $dacl.Count -lt 1) {' },
    @{ id = 'm03'; file = 'IsolationBaselineCore.ps1'; what = 'ACE 권한(CC) 검사를 뺀다'; suites = @('base')
        old = 'if ([int64]$ace.AccessMask -ne $Script:BlLocalUserMask) {'; new = 'if ($false) {' },
    @{ id = 'm04'; file = 'IsolationBaselineCore.ps1'; what = 'ACE 종류(허용 ACE 한 종류) 검사를 뺀다'; suites = @('base')
        old = "if (-not (Test-BlTextEqual `$ace.GetType().FullName 'System.Security.AccessControl.CommonAce') -or ([int]`$ace.AceType -ne 0)) {"; new = 'if ($false) {' },
    @{ id = 'm05'; file = 'IsolationBaselineCore.ps1'; what = '적용 프로필 검사를 뺀다(일부 프로필만 적용돼도 통과)'; suites = @('base', 'flow')
        old = 'if (-not (Test-BlProfileIsAny $v)) {'; new = 'if ($false) {' },
    @{ id = 'm06'; file = 'IsolationBaselineCore.ps1'; what = '프로그램·서비스·프로토콜·포트 등 Any 여야 하는 필터 검사를 뺀다'; suites = @('base', 'flow')
        old = 'elseif ($Script:BlRuleAnyKeys -contains $key) {'; new = 'elseif ($false) {' },
    @{ id = 'm07'; file = 'IsolationBaselineCore.ps1'; what = '읽기 결과에 없는 필수 키를 문제로 세지 않고 건너뛴다(누락을 정상으로 채움)'; suites = @('base')
        old = "{ [void]`$problems.Add(('{0}: 읽기 결과에 없다(MISSING)' -f `$key)); continue }"; new = '{ continue }' },
    @{ id = 'm08'; file = 'IsolationBaselineCore.ps1'; what = '읽기 포트가 값이 없는(null) 필터를 Any 로 채운다'; suites = @('base')
        old = 'if ($null -eq $Value) { return $Script:BlRuleUnset }'; new = "if (`$null -eq `$Value) { return 'Any' }" },
    @{ id = 'm09'; file = 'IsolationBaselineCore.ps1'; what = '한 줄을 만들 때 상세에 없는 속성을 Any 로 채운다'; suites = @('base')
        old = '$v = $Script:BlRuleMissing'; new = "`$v = 'Any'" },
    @{ id = 'm10'; file = 'IsolationBaselineCore.ps1'; what = '적용 직후 직접 확인(Verify)이 계약 대조 결과를 무시하고 통과시킨다'; suites = @('base')
        old = "`$rPass = [bool]`$chk['Pass']"; new = '$rPass = $true' },
    @{ id = 'm11'; file = 'IsolationBaselineCore.ps1'; what = '한 줄에서 키가 겹쳐도 표지를 달지 않고 뒤의 값으로 덮는다'; suites = @('base')
        old = "if (`$h.ContainsKey(`$k)) { `$h['__duplicate'] = `$true } else {"; new = 'if ($false) { } else {' },
    @{ id = 'm12'; file = 'IsolationBaselineCore.ps1'; what = '값 안의 | 를 부호화하지 않는다(값이 다른 키로 읽힐 수 있다)'; suites = @('base')
        old = "`$s = `$s -replace '\|', '%7C'"; new = '$s = $s' },
    @{ id = 'm13'; file = 'IsolationBaselineCore.ps1'; what = '보안 설명자 제어 플래그 검사를 뺀다'; suites = @('base')
        old = 'if ([int]$rsd.ControlFlags -ne $Script:BlLocalUserFlags) {'; new = 'if ($false) {' },
    @{ id = 'm14'; file = 'IsolationBaselineCore.ps1'; what = '보안 설명자의 소유자·그룹 검사를 뺀다'; suites = @('base')
        old = 'if ($null -ne $rsd.Owner -or $null -ne $rsd.Group) {'; new = 'if ($false) {' },
    @{ id = 'm15'; file = 'IsolationBaselineCore.ps1'; what = '원격 주소 범위(루프백 제외) 검사를 항상 통과시킨다'; suites = @('base')
        old = '($remote.Count -eq 3) -and $v4a -and $v4b -and $v6'; new = '$true' },
    @{ id = 'm16'; file = 'IsolationBaselineCore.ps1'; what = '서수 비교를 -ceq 로 바꾼다(소프트 하이픈·NUL 을 무시한다)'; suites = @('base')
        old = '[string]::Equals([string]$A, [string]$B, $mode)'; new = '([string]$A -ceq [string]$B)' },
    @{ id = 'm17'; file = 'IsolationBaselineCore.ps1'; what = '패키지 필터 검사를 뺀다'; suites = @('base')
        old = "if (-not ((Test-BlTextEqual `$v 'Any' `$true) -or (Test-BlTextEqual `$v `$Script:BlRuleUnset))) {"; new = 'if ($false) {' },
    @{ id = 'm20'; file = 'Test-LspRulesObservation.ps1'; what = '관리자 진입점 T04 가 공통 판정 대신 계정 범위 부분 문자열 대조만 쓴다(수정 전 결함 복원)'; suites = @('flow')
        old = "`$ruleOk = [bool]`$chk['Pass']"; new = '$ruleOk = ([string]$rdetail[''LocalUser'']).Contains([string]$sid)' },
    @{ id = 'm21'; file = 'Test-LspRulesObservation.ps1'; what = '관리자 진입점 T04 가 판정을 무시하고 항상 통과시킨다'; suites = @('flow')
        old = "`$ruleOk = [bool]`$chk['Pass']"; new = '$ruleOk = $true' }
)

function Copy-CodeTree {
    param([string]$To)
    if (Test-Path -LiteralPath $To) { throw "이미 있다: $To" }
    [void][IO.Directory]::CreateDirectory($To)
    foreach ($f in Get-ChildItem -LiteralPath $CodeDir -File) { [IO.File]::Copy($f.FullName, (Join-Path $To $f.Name)) }
    $tests = Join-Path $To 'tests'
    [void][IO.Directory]::CreateDirectory($tests)
    foreach ($f in Get-ChildItem -LiteralPath (Join-Path $CodeDir 'tests') -File) { [IO.File]::Copy($f.FullName, (Join-Path $tests $f.Name)) }
}
function Set-OneReplacement {
    param([string]$Path, [string]$Old, [string]$New)
    $text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
    $i = $text.IndexOf($Old, [StringComparison]::Ordinal)
    if ($i -lt 0) { return 'NOT_FOUND' }
    if ($text.IndexOf($Old, $i + 1, [StringComparison]::Ordinal) -ge 0) { return 'AMBIGUOUS' }
    [IO.File]::WriteAllText($Path, $text.Substring(0, $i) + $New + $text.Substring($i + $Old.Length), $Utf8Bom)
    'OK'
}
function Invoke-Suite {
    param([string]$Suite, [string]$Copy)
    $args1 = @('-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File')
    if ($Suite -eq 'base') { $args1 += @((Join-Path $PSScriptRoot 'Test-IsolationBaseline.ps1'), '-CodeDir', $Copy, '-SkipRealStateCheck') }
    else {
        $args1 += @((Join-Path $PSScriptRoot 'Test-LspRulesAdmin.ps1'), '-CodeDir', $Copy, '-Only', 'rule-contract', '-SkipRealStateCheck')
        if ($TsxCmd) { $args1 += @('-TsxCmd', $TsxCmd) }
        if ($NodeDir) { $args1 += @('-NodeDir', $NodeDir) }
    }
    $out = & $HostExe @args1 2>&1 | Out-String
    $m = [regex]::Match($out, '(IsolationBaseline|LspRulesAdmin)[^\r\n:]*:\s*(\d+)/(\d+) 통과,\s*(\d+) 실패')
    if (-not $m.Success) { return [pscustomobject]@{ Suite = $Suite; Ran = $false; Fail = -1; Total = 0; Note = 'NO_SUMMARY(시험이 도중에 멈췄다)' } }
    [pscustomobject]@{ Suite = $Suite; Ran = $true; Fail = [int]$m.Groups[4].Value; Total = [int]$m.Groups[3].Value; Note = '' }
}

$results = New-Object System.Collections.ArrayList
$work = @()
try {
    $selected = @($Mutations | Where-Object { $Only.Count -eq 0 -or $Only -contains $_.id })
    # 정상 복사본: 변이 없이 같은 시험이 모두 통과해야 한다(그렇지 않으면 이 점검 자체를 믿을 수 없다)
    $ctl = Join-Path $ParentDir 'windows.mut-control'; $work += $ctl
    Copy-CodeTree -To $ctl
    $suitesCtl = @('base'); if (-not $SkipFlow) { $suitesCtl += 'flow' }
    foreach ($s in $suitesCtl) {
        $r = Invoke-Suite -Suite $s -Copy $ctl
        $ok = ($r.Ran -and $r.Fail -eq 0)
        [void]$results.Add([pscustomobject]@{ Id = 'CONTROL'; Suite = $s; Applied = 'n/a'; Verdict = $(if ($ok) { 'PASS' } else { 'CONTROL_FAILED' }); Detail = "fail=$($r.Fail)/$($r.Total) $($r.Note)"; What = '변이 없는 복사본' })
        Write-Host ('{0,-8} {1,-5} {2,-14} {3}' -f 'CONTROL', $s, $(if ($ok) { 'PASS' } else { 'CONTROL_FAILED' }), "fail=$($r.Fail)/$($r.Total)")
    }
    foreach ($mu in $selected) {
        $copy = Join-Path $ParentDir ('windows.mut-' + $mu.id); $work += $copy
        Copy-CodeTree -To $copy
        $applied = Set-OneReplacement -Path (Join-Path $copy $mu.file) -Old $mu.old -New $mu.new
        if ($applied -ne 'OK') {
            [void]$results.Add([pscustomobject]@{ Id = $mu.id; Suite = '-'; Applied = $applied; Verdict = 'NOT_APPLIED'; Detail = ''; What = $mu.what })
            Write-Host ('{0,-8} {1,-5} {2,-14} {3}' -f $mu.id, '-', 'NOT_APPLIED', $applied)
            continue
        }
        $caught = $false; $notes = New-Object System.Collections.ArrayList
        foreach ($s in $mu.suites) {
            if ($s -eq 'flow' -and $SkipFlow) { continue }
            $r = Invoke-Suite -Suite $s -Copy $copy
            if ((-not $r.Ran) -or $r.Fail -gt 0) { $caught = $true }
            [void]$notes.Add("$s fail=$($r.Fail)/$($r.Total)$(if ($r.Note) { ' ' + $r.Note })")
        }
        $verdict = 'MISSED'; if ($caught) { $verdict = 'CAUGHT' }
        [void]$results.Add([pscustomobject]@{ Id = $mu.id; Suite = ($mu.suites -join '+'); Applied = $applied; Verdict = $verdict; Detail = ($notes -join ' ; '); What = $mu.what })
        Write-Host ('{0,-8} {1,-9} {2,-14} {3}' -f $mu.id, ($mu.suites -join '+'), $verdict, ($notes -join ' ; '))
        Remove-Item -LiteralPath $copy -Recurse -Force -ErrorAction SilentlyContinue
    }
} finally {
    foreach ($w in $work) { if (Test-Path -LiteralPath $w) { Remove-Item -LiteralPath $w -Recurse -Force -ErrorAction SilentlyContinue } }
}

$bad = @($results | Where-Object { $_.Verdict -in @('MISSED', 'NOT_APPLIED', 'CONTROL_FAILED') })
$caughtN = @($results | Where-Object { $_.Verdict -eq 'CAUGHT' }).Count
Write-Host ('변이 점검: 잡힘 {0} / 놓침·미적용·정상 복사본 실패 {1}' -f $caughtN, $bad.Count)
foreach ($b in $bad) { Write-Host ('  {0} {1} {2} {3}' -f $b.Id, $b.Verdict, $b.What, $b.Detail) -ForegroundColor Red }
if ($bad.Count -gt 0) { exit 1 }
exit 0
