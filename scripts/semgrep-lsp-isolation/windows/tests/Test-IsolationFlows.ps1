<#
.SYNOPSIS
  모의 시스템 위에서 적용·검증·복구 진입 스크립트를 끝까지 돌려 보는 흐름 시험. 실제 Windows 의 계정·방화벽·감사 정책·ACL 은 읽지도 바꾸지도 않는다.
.DESCRIPTION
  - 임시 샌드박스에 코드 사본(-CodeDir)과 MockSystem.ps1 을 끼워 넣고, 진입 스크립트(Initialize/Test-IsolationEffect/Remove)를 자식 프로세스로 실행한다.
  - 시스템 상태는 샌드박스의 fake-state.json 이고, 단계 사이에 이어진다. 시나리오의 'knobs' 로 실패·불일치를 주입한다.
  - 확인하는 것: 종료 코드, 검증 보고서의 판정·정리 결과, 가짜 상태(계정 사용 여부, 감사 값, 규칙), 실행 기록(manifest).
  - -CodeDir 로 수정 전 코드를 가리키면, 같은 시나리오가 그 코드에서 어떻게 실패하는지(재현)를 볼 수 있다. 그 경우 FAIL 이 나오는 것이 정상이다.
  이 시험의 통과는 "합성 환경에서 흐름이 의도대로 동작한다"까지만 뜻한다. 실제 Windows 에서의 동작은 뜻하지 않는다.
#>
[CmdletBinding()]
param(
    [string]$CodeDir = (Split-Path $PSScriptRoot -Parent),
    [ValidateSet('pwsh', 'powershell')][string]$Engine = 'pwsh',
    [string[]]$Only = @(),
    [string]$Label = 'current',
    [switch]$KeepSandbox
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$EnginePath = if ($Engine -eq 'pwsh') { (Get-Command pwsh).Source } else { Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe' }
$CodeDir = (Resolve-Path -LiteralPath $CodeDir).Path
$IsNew = Test-Path -LiteralPath (Join-Path $CodeDir 'IsolationFlows.ps1')
$HasTimeoutParams = (Get-Content -Raw -LiteralPath (Join-Path $CodeDir 'Test-IsolationEffect.ps1')) -match 'LaunchTimeoutSec'
$RunId = '20261027T120000Z-0a1b2c3d'
$UserName = 'bsi0a1b2c3d'
$FpcGuid = '{0CCE9226-69AE-11D9-BED3-505054503030}'
$Ps51 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Results = New-Object System.Collections.ArrayList
$Sandboxes = New-Object System.Collections.ArrayList
$Utf8 = New-Object Text.UTF8Encoding($false)

function Assert-Flow {
    param([string]$Case, [string]$Name, [bool]$Cond, [string]$Detail = '')
    [void]$Results.Add([ordered]@{ case = $Case; name = $Name; pass = $Cond; detail = $Detail })
    if (-not $Cond) { Write-Host ("  FAIL  [{0}] {1}  {2}" -f $Case, $Name, $Detail) -ForegroundColor Red }
}
function Get-Prop { param($Object, [string]$Path)
    $cur = $Object
    foreach ($seg in $Path.Split('.')) {
        if ($null -eq $cur) { return $null }
        $p = $cur.PSObject.Properties[$seg]
        if (-not $p) { return $null }
        $cur = $p.Value
    }
    $cur
}

# ── 샌드박스 ────────────────────────────────────────────────────────────────
function New-Sandbox {
    param([hashtable]$Scenario = @{})
    $root = Join-Path ([IO.Path]::GetTempPath()) ('iso-flows-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
    $code = Join-Path $root 'code'
    [void][IO.Directory]::CreateDirectory($code)
    foreach ($f in Get-ChildItem -LiteralPath $CodeDir -Filter *.ps1 -File) { [IO.File]::Copy($f.FullName, (Join-Path $code $f.Name)) }
    [IO.File]::Copy((Join-Path $PSScriptRoot 'MockSystem.ps1'), (Join-Path $root 'MockSystem.ps1'))
    # 모의 시스템은 흐름 파일(새 코드) 또는 공용 파일(옛 코드) 바로 뒤에 읽히게 한다. 엔진 5.1 이 한글을 읽도록 BOM 을 붙인다.
    $target = if ($IsNew) { 'IsolationFlows.ps1' } else { 'IsolationCommon.ps1' }
    $real = $target -replace '\.ps1$', '.real.ps1'
    [IO.File]::Move((Join-Path $code $target), (Join-Path $code $real))
    $stub = ". (Join-Path `$PSScriptRoot '$real')`r`n. (Join-Path `$PSScriptRoot '..\MockSystem.ps1')`r`n"
    [IO.File]::WriteAllText((Join-Path $code $target), $stub, (New-Object Text.UTF8Encoding($true)))
    $runDir = Join-Path $root "state\$RunId"
    [void][IO.Directory]::CreateDirectory($runDir)
    $pf = [ordered]@{ schema = 1; runId = $RunId; createdUtc = [DateTime]::UtcNow.ToString('o'); applyBlockers = @(); checks = @() }
    [IO.File]::WriteAllText((Join-Path $runDir 'preflight.json'), ($pf | ConvertTo-Json -Depth 4), $Utf8)
    $hash = (Get-FileHash -LiteralPath (Join-Path $runDir 'preflight.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    $scenarioFile = Join-Path $root 'scenario.json'
    [IO.File]::WriteAllText($scenarioFile, ($Scenario | ConvertTo-Json -Depth 8), $Utf8)
    $sb = [pscustomobject]@{ Root = $root; Code = $code; RunDir = $runDir; Hash12 = $hash.Substring(0, 12); ScenarioFile = $scenarioFile; WorkDir = (Join-Path $root "work\$RunId") }
    [void]$Sandboxes.Add($root)
    $sb
}
function Set-Scenario { param($Sb, [hashtable]$Scenario) [IO.File]::WriteAllText($Sb.ScenarioFile, ($Scenario | ConvertTo-Json -Depth 8), $Utf8) }

function Invoke-Entry {
    param($Sb, [string]$Phase, [string]$Script, [string[]]$ScriptArgs = @())
    $env:ISO_MOCK_SANDBOX = $Sb.Root; $env:ISO_MOCK_SCENARIO = $Sb.ScenarioFile; $env:ISO_MOCK_PHASE = $Phase
    try {
        $out = & $EnginePath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Sb.Code $Script) @ScriptArgs 2>&1 | Out-String
        $code = $LASTEXITCODE
    } finally { Remove-Item Env:\ISO_MOCK_SANDBOX, Env:\ISO_MOCK_SCENARIO, Env:\ISO_MOCK_PHASE -ErrorAction SilentlyContinue }
    [pscustomobject]@{ exit = $code; out = $out }
}
function Invoke-Apply { param($Sb, [string]$Phase = 'apply', [switch]$Dry)
    $a = @('-PreflightDir', $Sb.RunDir)
    if (-not $Dry) { $a += @('-ConfirmSnapshot', $Sb.Hash12, '-Apply') }
    Invoke-Entry $Sb $Phase 'Initialize-Isolation.ps1' $a
}
function Invoke-Verify { param($Sb, [string]$Phase = 'verify', [switch]$Dry)
    $a = @('-RunDir', $Sb.RunDir, '-HoldSeconds', '0', '-ConnectTimeoutSec', '1')
    if ($HasTimeoutParams) { $a += @('-LaunchTimeoutSec', '2', '-ResultExtraSec', '2', '-DoneTimeoutSec', '1') }
    if (-not $Dry) { $a += '-Execute' }
    Invoke-Entry $Sb $Phase 'Test-IsolationEffect.ps1' $a
}
function Invoke-Recover { param($Sb, [string]$Phase = 'recover', [switch]$Dry)
    $a = @('-RunDir', $Sb.RunDir)
    if (-not $Dry) { $a += '-Apply' }
    Invoke-Entry $Sb $Phase 'Remove-Isolation.ps1' $a
}
function Get-Fake { param($Sb) $f = Join-Path $Sb.Root 'fake-state.json'; if (Test-Path -LiteralPath $f) { [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-FakeText { param($Sb) $f = Join-Path $Sb.Root 'fake-state.json'; if (Test-Path -LiteralPath $f) { [IO.File]::ReadAllText($f) } else { '' } }
function Get-AuditValue { param($Sb, [string]$Guid = $FpcGuid) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; Get-Prop $s.audit $Guid }
function Get-UserEnabled { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; $u = Get-Prop $s.users $UserName; if ($null -eq $u) { return $null }; $u.Enabled }
function Get-Report { param($Sb) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter 'verification-*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-ManifestObj { param($Sb) $f = Join-Path $Sb.RunDir 'resources.json'; if (Test-Path -LiteralPath $f) { [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-AuditStep { param($Sb) $m = Get-ManifestObj $Sb; if ($null -eq $m) { return $null }; @($m.steps | Where-Object { $_.kind -eq 'auditSetting' }) | Select-Object -First 1 }
function Test-NotObserved { param($Report) ($null -eq $Report) -or ((Get-Prop $Report 'verdict') -ne 'PROBE_ISOLATION_OBSERVED') }

# 정상 대조군으로 적용까지 마친 샌드박스
function New-AppliedSandbox {
    param([hashtable]$Scenario = @{})
    $sb = New-Sandbox -Scenario $Scenario
    $r = Invoke-Apply $sb
    if ($r.exit -ne 0) { throw "적용 단계가 실패했다(exit $($r.exit)): $($r.out)" }
    $sb
}

# ── 복구 시험용 도우미: 권한을 줄 경로 둘(grant-a, grant-b)이 있는 샌드박스 ──────
# 실행 기록에 aclGrant 단계가 둘 남게 해서, 복구의 ACL 단계가 대상을 차례로 처리하는 모양을 시험한다.
# 기존 시험은 -GrantReadExecute 를 쓰지 않아 복구가 ACL 단계를 한 번도 거치지 않았다.
function New-AppliedGrantSandbox {
    param([hashtable]$Scenario = @{})
    $sb = New-Sandbox -Scenario $Scenario
    $ga = Join-Path $sb.Root 'grant-a'; $gb = Join-Path $sb.Root 'grant-b'
    [void][IO.Directory]::CreateDirectory($ga); [void][IO.Directory]::CreateDirectory($gb)
    $r = Invoke-Entry $sb 'apply' 'Initialize-Isolation.ps1' @('-PreflightDir', $sb.RunDir, '-ConfirmSnapshot', $sb.Hash12, '-Apply', '-GrantReadExecute', "$ga,$gb")
    if ($r.exit -ne 0) { throw "적용 단계가 실패했다(exit $($r.exit)): $($r.out)" }
    [pscustomobject]@{ Sb = $sb; GrantA = $ga; GrantB = $gb; Sid = [string](Get-Prop (Get-Fake $sb) "users.$UserName.Sid") }
}
function Get-FakeAclSddl { param($Sb, [string]$Path) $p = (Get-Fake $Sb).acl.PSObject.Properties[[IO.Path]::GetFullPath($Path)]; if ($p) { [string]$p.Value } else { $null } }
function Set-FakeAclSddl {
    param($Sb, [string]$Path, [string]$Sddl)
    $f = Get-Fake $Sb
    $f.acl.PSObject.Properties[[IO.Path]::GetFullPath($Path)].Value = $Sddl
    [IO.File]::WriteAllText((Join-Path $Sb.Root 'fake-state.json'), ($f | ConvertTo-Json -Depth 8), $Utf8)
}
function Test-SddlHasSid { param([string]$Sddl, [string]$Sid) (-not [string]::IsNullOrEmpty($Sddl)) -and $Sddl.Contains($Sid) }
# calls.log 는 적용 단계의 호출도 쌓여 있다. 복구 중 호출만 보려면 단계 이름('recover' 로 시작하는 줄)을 준다.
function Get-CallsLog {
    param($Sb, [string]$Phase = '')
    $lf = Join-Path $Sb.Root 'calls.log'
    if (-not (Test-Path -LiteralPath $lf)) { return '' }
    $text = [IO.File]::ReadAllText($lf)
    if (-not $Phase) { return $text }
    (($text -split "`n") | Where-Object { $_.StartsWith("[$Phase") }) -join "`n"
}
function Get-RecoveryRecord { param($Sb) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter 'recovery-*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-ResultOf { param($Record, [string]$StepPattern) if ($null -eq $Record) { return $null }; @($Record.results | Where-Object { $_.step -like $StepPattern }) | Select-Object -First 1 }
function Get-RecoverState {
    param($G)
    $sb = $G.Sb; $f = Get-Fake $sb
    [pscustomobject]@{
        UsersLeft = @($f.users.PSObject.Properties).Count; RulesLeft = @($f.rules.PSObject.Properties).Count
        WorkDirExists = [bool](Test-Path -LiteralPath $sb.WorkDir); CredExists = [bool](Test-Path -LiteralPath (Join-Path $sb.RunDir 'credential.dpapi'))
        AclA = (Get-FakeAclSddl $sb $G.GrantA); AclB = (Get-FakeAclSddl $sb $G.GrantB); Status = [string](Get-Prop (Get-ManifestObj $sb) 'status')
    }
}
# 시험이 헛돌지 않게: 복구 전에 두 경로에 새 계정 ACE 가 있고 계정·작업 폴더·암호 파일이 모두 남아 있는지 먼저 확인한다.
function Test-GrantSetup {
    param([string]$Case, $G)
    $st = Get-RecoverState $G
    Assert-Flow $Case '준비: 두 경로에 새 계정 ACE, 계정 1개, 작업 폴더·암호 파일이 있다' ((Test-SddlHasSid $st.AclA $G.Sid) -and (Test-SddlHasSid $st.AclB $G.Sid) -and ($st.UsersLeft -eq 1) -and $st.WorkDirExists -and $st.CredExists) "aclA=$($st.AclA) users=$($st.UsersLeft) workdir=$($st.WorkDirExists) cred=$($st.CredExists)"
}

# ── 시나리오 ─────────────────────────────────────────────────────────────────
function Test-Case-Control {
    $c = 'C00 정상 대조군'
    $sb = New-Sandbox -Scenario @{}
    $s0 = Get-FakeText $sb
    $d = Invoke-Apply $sb -Dry
    Assert-Flow $c '적용 dry-run: 종료 코드 0, 상태 불변' (($d.exit -eq 0) -and ((Get-FakeText $sb) -eq $s0)) "exit=$($d.exit)"
    $r = Invoke-Entry $sb 'apply' 'Initialize-Isolation.ps1' @('-PreflightDir', $sb.RunDir, '-Apply')
    Assert-Flow $c '적용: ConfirmSnapshot 없으면 거부(30), 상태 불변' (($r.exit -eq 30) -and ((Get-FakeText $sb) -eq $s0)) "exit=$($r.exit)"
    $r = Invoke-Entry $sb 'apply' 'Initialize-Isolation.ps1' @('-PreflightDir', $sb.RunDir, '-Apply', '-ConfirmSnapshot', '000000000000')
    Assert-Flow $c '적용: 틀린 해시는 거부(30), 상태 불변' (($r.exit -eq 30) -and ((Get-FakeText $sb) -eq $s0)) "exit=$($r.exit)"
    $r = Invoke-Verify $sb -Dry
    Assert-Flow $c '검증: 실행 기록이 없으면 사전 조건 실패(50)' ($r.exit -eq 50) "exit=$($r.exit)"
    $r = Invoke-Apply $sb
    Assert-Flow $c '적용: 종료 코드 0' ($r.exit -eq 0) "exit=$($r.exit) $($r.out)"
    $f = Get-Fake $sb
    Assert-Flow $c '적용: 계정 1개(비활성), 규칙 1개(켜짐)' (($null -ne $f) -and ((Get-UserEnabled $sb) -eq $false) -and ((Get-Prop $f.rules "bosang-semgrep-iso-$RunId-out.Enabled") -eq 'True'))
    $s1 = Get-FakeText $sb
    $v = Invoke-Verify $sb -Dry
    $rep = Get-Report $sb
    Assert-Flow $c '검증 dry-run: 종료 코드 0, 상태 불변, 보고서 없음' (($v.exit -eq 0) -and ((Get-FakeText $sb) -eq $s1) -and ($null -eq $rep)) "exit=$($v.exit)"
    $v = Invoke-Verify $sb
    $rep = Get-Report $sb
    Assert-Flow $c '검증: 종료 코드 0, PROBE_ISOLATION_OBSERVED' (($v.exit -eq 0) -and ((Get-Prop $rep 'verdict') -eq 'PROBE_ISOLATION_OBSERVED')) "exit=$($v.exit) verdict=$(Get-Prop $rep 'verdict') $($v.out)"
    Assert-Flow $c '검증 뒤: 계정 비활성, 감사 값 원래대로(0)' (((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq 0)) "enabled=$(Get-UserEnabled $sb) audit=$(Get-AuditValue $sb)"
    if ($IsNew) {
        Assert-Flow $c '새 보고서: 신원 확인 통과, 정리 성공 구조' (((Get-Prop $rep 'identity.ok') -eq $true) -and ((Get-Prop $rep 'cleanup.ok') -eq $true) -and ((Get-Prop $rep 'finalStatus') -eq 'PROBE_ISOLATION_OBSERVED'))
    }
    $s2 = Get-FakeText $sb
    $r = Invoke-Entry $sb 'discover' 'Remove-Isolation.ps1' @('-Discover')
    Assert-Flow $c '복구 -Discover: 종료 코드 0, 상태 불변, 만든 자원이 목록에 보인다' (($r.exit -eq 0) -and ((Get-FakeText $sb) -eq $s2) -and ($r.out -match [regex]::Escape($UserName)) -and ($r.out -match 'firewallRules')) "exit=$($r.exit) $($r.out)"
    $r = Invoke-Recover $sb -Dry
    Assert-Flow $c '복구 dry-run: 종료 코드 0, 상태 불변' (($r.exit -eq 0) -and ((Get-FakeText $sb) -eq $s2)) "exit=$($r.exit)"
    $r = Invoke-Recover $sb
    $f = Get-Fake $sb
    Assert-Flow $c '복구: 종료 코드 0, 계정·규칙 없음, 작업 폴더 없음, 감사 0' (($r.exit -eq 0) -and (@($f.users.PSObject.Properties).Count -eq 0) -and (@($f.rules.PSObject.Properties).Count -eq 0) -and (-not (Test-Path -LiteralPath $sb.WorkDir)) -and ((Get-AuditValue $sb) -eq 0)) "exit=$($r.exit) $($r.out)"
    $r = Invoke-Entry $sb 'recover' 'Remove-Isolation.ps1' @()
    Assert-Flow $c '복구: 대상 없이 부르면 거부(30)' ($r.exit -eq 30) "exit=$($r.exit)"
}

function Test-Case-Identity {
    $variants = @(
        @{ n = 'a 자식 자기 보고 PID 가 다르다'; probe = @{ childSelf = @{ pid = 4999 } } },
        @{ n = 'b 자식 자기 보고 실행 파일이 다르다'; probe = @{ childSelf = @{ exePath = 'C:\Windows\System32\cmd.exe' } } },
        @{ n = 'c 자식 자기 보고 SID 가 다르다'; probe = @{ childSelf = @{ sid = 'S-1-5-21-9-9-9-500' } } },
        @{ n = 'd CIM 자식 소유 SID 가 전용 계정이 아니다'; probe = @{ cimChild = @{ ownerSid = 'S-1-5-21-9-9-9-500' } } },
        @{ n = 'e CIM 자식의 부모 PID 가 부모 프로브가 아니다'; probe = @{ cimChild = @{ parentProcessId = 7777 } } },
        @{ n = 'f CIM 자식 기록이 없다'; probe = @{ cimMissing = @('child') } },
        @{ n = 'g CIM 부모 기록이 없다'; probe = @{ cimMissing = @('parent') } },
        @{ n = 'h 부모가 보고한 자식 PID 가 다르다'; probe = @{ parentChildPid = 8888 } },
        @{ n = 'i 자식 결과 파일이 없다'; probe = @{ omitFiles = @('child-result.json') } },
        @{ n = 'j 부모 자기 보고 파일이 없다'; probe = @{ omitFiles = @('parent-self.json') } },
        @{ n = 'k 부모 자기 보고 PID 가 다르다'; probe = @{ parentSelf = @{ pid = 5555 } } },
        @{ n = 'l 자식 자기 보고 시작 시각이 크게 다르다'; probe = @{ childSelf = @{ startUtc = '2020-01-01T00:00:00.0000000Z' } } }
    )
    foreach ($v in $variants) {
        $c = 'C01 신원 불일치 ' + $v.n
        # 파일이 없는 변형은 옛 코드가 30초 넘게 기다린다 → 옛 코드에서는 건너뛴다.
        if (-not $IsNew -and ($v.probe.ContainsKey('omitFiles') -or $v.probe.ContainsKey('cimMissing'))) { continue }
        $sb = New-AppliedSandbox -Scenario @{ probe = $v.probe }
        $r = Invoke-Verify $sb
        $rep = Get-Report $sb
        Assert-Flow $c '성공(PROBE_ISOLATION_OBSERVED)이나 종료 코드 0 이 될 수 없다' (($r.exit -ne 0) -and (Test-NotObserved $rep)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
        Assert-Flow $c '그래도 정리는 끝난다(계정 비활성, 감사 0)' (((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq 0)) "enabled=$(Get-UserEnabled $sb) audit=$(Get-AuditValue $sb)"
        if ($IsNew) {
            Assert-Flow $c '새 보고서: 신원 확인 실패와 실패 코드가 남는다' (((Get-Prop $rep 'identity.ok') -eq $false) -and (@(Get-Prop $rep 'identity.failures').Count -ge 1)) "failures=$((@(Get-Prop $rep 'identity.failures')) -join ',')"
            Assert-Flow $c '새 보고서: 교차 확인에 실패한 연결 결과를 검증된 사실로 쓰지 않는다' (($null -eq (Get-Prop $rep 'connectionAttempts')) -and ((Get-Prop $rep 'osBlockObservation.skipped') -eq $true))
        }
    }
}

function Test-Case-StaleFiles {
    $c = 'C02 이전 결과 파일'
    # (a) 이전 실행이 남긴 그럴듯한 결과 파일만 있고 이번 실행은 아무것도 쓰지 않는다.
    $sb = New-AppliedSandbox -Scenario @{ probe = @{ writeNothing = $true } }
    $f = Get-Fake $sb
    $sid = [string](Get-Prop $f.users "$UserName.Sid")
    $work = Join-Path $sb.WorkDir 'work'
    $far = [DateTime]::UtcNow.AddHours(1).ToString('o'); $start = [DateTime]::UtcNow.ToString('o')
    $self = [ordered]@{ pid = 4101; startUtc = $start; exePath = $Ps51; sid = $sid }
    $stale = [ordered]@{ self = $self; endUtc = $far; runToken = 'previous-run-token'; attempts = @(
            [ordered]@{ name = 'loopback'; address = '127.0.0.1'; port = 1; startUtc = $start; endUtc = $start; outcome = 'connected'; detail = $null },
            [ordered]@{ name = 'external-reserved'; address = '192.0.2.1'; port = 9; startUtc = $start; endUtc = $start; outcome = 'timeout'; detail = $null }) }
    foreach ($pair in @(@('child-result.json', $stale), @('parent-self.json', ([ordered]@{ pid = 4100; startUtc = $start; exePath = $Ps51; sid = $sid; runToken = 'previous-run-token' })), @('parent-child.json', ([ordered]@{ childPid = 4101; runToken = 'previous-run-token' })), @('parent-done.json', ([ordered]@{ endUtc = $far; childExitCode = 0; runToken = 'previous-run-token' })))) {
        [IO.File]::WriteAllText((Join-Path $work $pair[0]), ($pair[1] | ConvertTo-Json -Depth 6), $Utf8)
    }
    $r = Invoke-Verify $sb
    $rep = Get-Report $sb
    Assert-Flow $c '(a) 이번 실행이 쓰지 않은 이전 파일은 현재 결과로 소비되지 않는다' (($r.exit -ne 0) -and (Test-NotObserved $rep)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
    Assert-Flow $c '(a) 그래도 정리는 끝난다' (((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq 0))
    if ($IsNew) { Assert-Flow $c '(a) 새 보고서: 연결 결과를 쓰지 않았다' ($null -eq (Get-Prop $rep 'connectionAttempts')) }
    # (c) 실행 전 정리(삭제)와 별개로 토큰 확인이 독립적으로 막는다: 이번 실행 도중에 옛 토큰으로 쓰는 파일(실행 전부터 떠 있던 이전 프로브)은 받지 않는다.
    $sbC = New-AppliedSandbox -Scenario @{ probe = @{ tokenMode = 'stale' } }
    $rC = Invoke-Verify $sbC
    $repC = Get-Report $sbC
    Assert-Flow $c '(c) 이번 실행의 토큰이 아닌 파일은 내용이 완벽해도 받지 않는다' (($rC.exit -ne 0) -and (Test-NotObserved $repC)) "exit=$($rC.exit) verdict=$(Get-Prop $repC 'verdict')"
    if ($IsNew) { Assert-Flow $c '(c) 새 보고서: 필수 기록 누락으로 신원 확인이 실패한다' (((Get-Prop $repC 'identity.ok') -eq $false) -and ((@(Get-Prop $repC 'identity.failures') | ForEach-Object { $_.code }) -contains 'REQ_CHILD_RESULT')) }
    # (b) 같은 샌드박스에서 반복 실행: 1회차 정상 → 2회차는 아무것도 쓰지 않는다.
    $sb2 = New-AppliedSandbox -Scenario @{ verify2 = @{}; probe = @{} }
    $r1 = Invoke-Verify $sb2
    $rep1 = Get-Report $sb2
    Assert-Flow $c '(b) 1회차는 정상 관측' (($r1.exit -eq 0) -and ((Get-Prop $rep1 'verdict') -eq 'PROBE_ISOLATION_OBSERVED')) "exit=$($r1.exit)"
    Set-Scenario $sb2 @{ probe = @{ writeNothing = $true } }
    Start-Sleep -Seconds 1
    $r2 = Invoke-Verify $sb2 'verify2'
    $rep2 = Get-Report $sb2
    Assert-Flow $c '(b) 2회차에 1회차 결과 파일이 소비되지 않는다' (($r2.exit -ne 0) -and (Test-NotObserved $rep2)) "exit=$($r2.exit) verdict=$(Get-Prop $rep2 'verdict')"
}

function Test-Case-AuditOpen {
    $c = 'C03 감사 변경 직후 오류(재현 A)'
    $sb = New-AppliedSandbox -Scenario @{ verify = @{ auditReadFailInOpenAfterSet = $true } }
    $r = Invoke-Verify $sb
    $step = Get-AuditStep $sb
    Assert-Flow $c '변경 직후 읽기 실패: 종료 코드 0 이 아니다' ($r.exit -ne 0) "exit=$($r.exit)"
    Assert-Flow $c '감사 값이 바뀐 채 남지 않는다(자동 복구, 값 0)' ((Get-AuditValue $sb) -eq 0) "audit=$(Get-AuditValue $sb)"
    Assert-Flow $c '실행 기록에 단계가 남고 원래 값 0·설정 값 2 가 보존된다' (($null -ne $step) -and ([int](Get-Prop $step 'detail.original') -eq 0) -and ([int](Get-Prop $step 'detail.set') -eq 2)) "step=$($step | ConvertTo-Json -Compress -Depth 4)"
    # 복구 읽기까지 계속 실패하면 정리 실패로 보고되고 값은 남지만, 복구 스크립트가 이어서 되돌릴 수 있어야 한다.
    $sb2 = New-AppliedSandbox -Scenario @{ verify = @{ auditReadFailAfterSet = $true }; recover = @{} }
    $r = Invoke-Verify $sb2
    $step2 = Get-AuditStep $sb2
    Assert-Flow $c '읽기가 계속 실패: 값은 2 로 남지만 종료 코드 0 이 아니다' (((Get-AuditValue $sb2) -eq 2) -and ($r.exit -ne 0)) "audit=$(Get-AuditValue $sb2) exit=$($r.exit)"
    Assert-Flow $c '그때도 복구에 필요한 원래 값·설정 값이 실행 기록에 남는다' (($null -ne $step2) -and ([int](Get-Prop $step2 'detail.original') -eq 0) -and ([int](Get-Prop $step2 'detail.set') -eq 2) -and ((Get-Prop $step2 'state') -ne 'restored')) "state=$(Get-Prop $step2 'state')"
    $rec = Invoke-Recover $sb2
    $step2b = Get-AuditStep $sb2
    Assert-Flow $c '복구 스크립트가 이어서 되돌린다(값 0, 종료 코드 0)' (((Get-AuditValue $sb2) -eq 0) -and ($rec.exit -eq 0)) "audit=$(Get-AuditValue $sb2) exit=$($rec.exit) $($rec.out)"
    Assert-Flow $c '복구 뒤 단계 상태는 실제 확인 뒤에만 restored' ((Get-Prop $step2b 'state') -eq 'restored') "state=$(Get-Prop $step2b 'state')"
}

function Test-Case-AuditClose {
    $c = 'C04 감사 복구 읽기 실패(재현 B)'
    $sb = New-AppliedSandbox -Scenario @{ verify = @{ auditReadFailInClose = $true }; recover = @{ auditReadFailInClose = $true }; recover2 = @{} }
    $r = Invoke-Verify $sb
    $rep = Get-Report $sb
    $step = Get-AuditStep $sb
    Assert-Flow $c '검증: 복구 읽기 실패 → 종료 코드 0 이 아니다' ($r.exit -ne 0) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
    Assert-Flow $c '검증: 실제로 값이 2 로 남아 있다' ((Get-AuditValue $sb) -eq 2) "audit=$(Get-AuditValue $sb)"
    Assert-Flow $c '검증: 실행 기록 단계가 restored 가 아니다' ((Get-Prop $step 'state') -ne 'restored') "state=$(Get-Prop $step 'state')"
    if ($IsNew) { Assert-Flow $c '검증: 프로브 관측 결과와 정리 결과가 따로 남는다(관측은 유지, 정리 실패)' (((Get-Prop $rep 'verdict') -eq 'PROBE_ISOLATION_OBSERVED') -and ((Get-Prop $rep 'cleanup.ok') -eq $false) -and ((Get-Prop $rep 'finalStatus') -eq 'CLEANUP_INCOMPLETE')) "final=$(Get-Prop $rep 'finalStatus')" }
    # 복구 스크립트의 Close 안에서도 읽기가 실패하면 OK 로 기록하면 안 된다.
    $rec = Invoke-Recover $sb
    $step = Get-AuditStep $sb
    Assert-Flow $c '복구: Close 읽기 실패를 OK 로 기록하지 않는다(종료 코드 0 아님)' (($rec.exit -ne 0) -and ($rec.out -notmatch 'OK\s+audit') -and ((Get-AuditValue $sb) -eq 2)) "exit=$($rec.exit) audit=$(Get-AuditValue $sb)"
    Assert-Flow $c '복구: 단계 상태가 restored 가 아니다' ((Get-Prop $step 'state') -ne 'restored') "state=$(Get-Prop $step 'state')"
    $rec2 = Invoke-Recover $sb 'recover2'
    $step = Get-AuditStep $sb
    Assert-Flow $c '다시 복구하면 실제로 되돌아가고(값 0) 성공한다' (((Get-AuditValue $sb) -eq 0) -and ($rec2.exit -eq 0) -and ((Get-Prop $step 'state') -eq 'restored')) "audit=$(Get-AuditValue $sb) exit=$($rec2.exit) state=$(Get-Prop $step 'state')"
}

function Test-Case-AccountAndCleanup {
    $c = 'C05 계정 비활성화·복구 설정 실패(재현 C)'
    $sb = New-AppliedSandbox -Scenario @{ verify = @{ disableUserFails = $true } }
    $r = Invoke-Verify $sb
    $rep = Get-Report $sb
    Assert-Flow $c '프로브 관측은 정상이어도 계정 비활성화 실패면 종료 코드 0 이 아니다' ($r.exit -ne 0) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
    Assert-Flow $c '계정이 켜진 채 남은 사실이 보고서/상태에 있다' ((Get-UserEnabled $sb) -eq $true) "enabled=$(Get-UserEnabled $sb)"
    Assert-Flow $c '한 정리가 실패해도 감사 복구는 건너뛰지 않는다(값 0)' ((Get-AuditValue $sb) -eq 0) "audit=$(Get-AuditValue $sb)"
    if ($IsNew) {
        Assert-Flow $c '관측 결과는 보존되고 정리 실패가 따로 기록된다' (((Get-Prop $rep 'verdict') -eq 'PROBE_ISOLATION_OBSERVED') -and ((Get-Prop $rep 'cleanup.ok') -eq $false) -and (@((Get-Prop $rep 'cleanup.items') | Where-Object { $_.name -eq 'account-disable' -and -not $_.ok }).Count -eq 1)) "final=$(Get-Prop $rep 'finalStatus')"
        Assert-Flow $c '종료 코드는 정리 실패를 뜻하는 70' ($r.exit -eq 70) "exit=$($r.exit)"
    }
    $sb2 = New-AppliedSandbox -Scenario @{ verify = @{ disableUserSilent = $true } }
    $r2 = Invoke-Verify $sb2
    Assert-Flow $c '오류 없이 반환했지만 실제로는 켜져 있는 경우도 실패로 본다(읽어서 확인)' (($r2.exit -ne 0) -and ((Get-UserEnabled $sb2) -eq $true)) "exit=$($r2.exit) enabled=$(Get-UserEnabled $sb2)"

    $c = 'C06 복구 쪽 설정 실패'
    $sb3 = New-AppliedSandbox -Scenario @{ verify = @{ auditSetFailInClose = $true }; recover = @{} }
    $r3 = Invoke-Verify $sb3
    Assert-Flow $c '복구 설정(auditpol /set) 실패 → 종료 코드 0 이 아니고 값 2 가 남는다' (($r3.exit -ne 0) -and ((Get-AuditValue $sb3) -eq 2)) "exit=$($r3.exit) audit=$(Get-AuditValue $sb3)"
    $rr = Invoke-Recover $sb3
    Assert-Flow $c '이어서 복구하면 값 0 으로 돌아간다' (((Get-AuditValue $sb3) -eq 0) -and ($rr.exit -eq 0)) "exit=$($rr.exit) audit=$(Get-AuditValue $sb3)"

    $c = 'C07 계정 비활성화와 감사 복구가 둘 다 실패'
    $sb4 = New-AppliedSandbox -Scenario @{ verify = @{ disableUserFails = $true; auditSetFailInClose = $true } }
    $r4 = Invoke-Verify $sb4
    $log = ''; $lf = Join-Path $sb4.Root 'calls.log'; if (Test-Path -LiteralPath $lf) { $log = [IO.File]::ReadAllText($lf) }
    $setCalls = ([regex]::Matches($log, 'Set-AuditSubcategory|Invoke-AuditPol /set')).Count   # 감사 창 열기 1회 + 복구 시도 1회 이상
    Assert-Flow $c '둘 다 시도했다(하나가 실패해도 나머지를 건너뛰지 않는다)' (($log -match 'Disable-LocalUser') -and ($setCalls -ge 2) -and ($r4.exit -ne 0)) "exit=$($r4.exit) setCalls=$setCalls"
    if ($IsNew) {
        $rep4 = Get-Report $sb4
        Assert-Flow $c '새 보고서: 실패한 정리 항목이 둘 다 기록된다' (@((Get-Prop $rep4 'cleanup.items') | Where-Object { -not $_.ok }).Count -ge 2)
    }

    $c = 'C08 감사 값 drift'
    $sb5 = New-AppliedSandbox -Scenario @{ verify = @{ auditExternalInClose = 3 } }
    $r5 = Invoke-Verify $sb5
    $st5 = Get-AuditStep $sb5
    Assert-Flow $c '제3자가 3 으로 바꾼 값을 덮어쓰지 않는다' ((Get-AuditValue $sb5) -eq 3) "audit=$(Get-AuditValue $sb5)"
    Assert-Flow $c 'drift 는 정리 완료로 세지 않는다(종료 코드 0 아님)' ($r5.exit -ne 0) "exit=$($r5.exit)"
    if ($IsNew) { Assert-Flow $c '새 보고서: drift 로 구분된다' ((@((Get-Prop (Get-Report $sb5) 'cleanup.items') | Where-Object { $_.outcome -eq 'DRIFT' }).Count -eq 1)) }
    $c = 'C09 이미 원래 값'
    $sb6 = New-AppliedSandbox -Scenario @{ verify = @{ auditExternalInClose = 0 } }
    $r6 = Invoke-Verify $sb6
    $st6 = Get-AuditStep $sb6
    Assert-Flow $c '현재 값이 이미 원래 값이면 복구된 상태로 처리한다(실제 확인 뒤 restored, 종료 코드 0)' (($r6.exit -eq 0) -and ((Get-Prop $st6 'state') -eq 'restored') -and ((Get-AuditValue $sb6) -eq 0)) "exit=$($r6.exit) state=$(Get-Prop $st6 'state')"
}

function Test-Case-Events {
    $c = 'C10 차단 이벤트 0건'
    $sb = New-AppliedSandbox -Scenario @{ verify = @{ events = 'empty' } }
    $r = Invoke-Verify $sb
    $rep = Get-Report $sb
    Assert-Flow $c '빈 이벤트 목록은 예외 없이 처리된다(보고서에 오류가 없다)' ($null -eq (Get-Prop $rep 'error')) "error=$(Get-Prop $rep 'error')"
    Assert-Flow $c '외부 예약 주소 판정이 FAILED_WITHOUT_OS_EVIDENCE' ((Get-Prop $rep 'probeVerdicts.external-reserved.verdict') -eq 'FAILED_WITHOUT_OS_EVIDENCE') "verdict=$(Get-Prop $rep 'probeVerdicts.external-reserved.verdict')"
    Assert-Flow $c '성공이 아니므로 종료 코드 0 이 아니다(60)' (($r.exit -eq 60) -and (Test-NotObserved $rep)) "exit=$($r.exit)"
    $c = 'C11 증거 부족은 0건으로 바뀌지 않는다'
    $cases = @(
        @{ n = '이벤트 읽기 실패'; v = @{ events = 'readFail' }; sec = $null },
        @{ n = '로그가 밀림'; v = @{ events = 'empty' }; sec = @{ oldest = 1500 } },
        @{ n = 'Security 로그 상태 읽기 실패'; v = @{ events = 'empty' }; sec = @{ readFail = $true } },
        @{ n = '이번 실행과 무관한 PID 이벤트만 있다'; v = @{ events = 'unrelated' }; sec = $null }
    )
    if ($IsNew) { $cases += @{ n = '증거 시점의 감사 상태 읽기 실패'; v = @{ events = 'empty'; auditReadFailInEvidenceCheck = $true }; sec = $null } }
    foreach ($k in $cases) {
        $scn = @{ verify = $k.v }; if ($k.sec) { $scn['securityAfter'] = $k.sec }
        $sbx = New-AppliedSandbox -Scenario $scn
        $rx = Invoke-Verify $sbx
        $repx = Get-Report $sbx
        $verd = [string](Get-Prop $repx 'probeVerdicts.external-reserved.verdict')
        $expect = if ($k.n -eq '이번 실행과 무관한 PID 이벤트만 있다') { 'FAILED_WITHOUT_OS_EVIDENCE' } else { 'FAILED_EVIDENCE_UNAVAILABLE' }
        Assert-Flow $c ("{0}: {1}" -f $k.n, $expect) ($verd -eq $expect) "verdict=$verd"
        if ($k.n -ne '이번 실행과 무관한 PID 이벤트만 있다') { Assert-Flow $c ("{0}: 건수는 null(0 아님)" -f $k.n) ($null -eq (Get-Prop $repx 'osBlockObservation.matchedCount')) }
        Assert-Flow $c ("{0}: 성공 아님" -f $k.n) (($rx.exit -ne 0) -and (Test-NotObserved $repx)) "exit=$($rx.exit)"
    }
    if ($IsNew) {
        $c = 'C12 필수 프로세스 기록 누락 ≠ 이벤트 0건'
        $sbm = New-AppliedSandbox -Scenario @{ verify = @{ events = 'empty' }; probe = @{ cimMissing = @('child') } }
        $rm = Invoke-Verify $sbm
        $repm = Get-Report $sbm
        $v = [string](Get-Prop $repm 'probeVerdicts.external-reserved.verdict')
        Assert-Flow $c '정상 0건 판정(FAILED_WITHOUT_OS_EVIDENCE)으로 섞이지 않는다' ($v -ne 'FAILED_WITHOUT_OS_EVIDENCE') "verdict=$v"
    }
}

# 복구의 ACL 단계: 한 대상의 읽기·확인 실패가 복구 전체를 멈추면 안 된다. 읽지 못한 ACL 은 FAILED(없음·성공 아님)이고, 그 항목은 건드리지 않으며, 뒤의 자원 복구는 계속된다.
function Test-Case-RecoverAclFailures {
    $variants = @(
        @{ n = 'ACL 읽기가 접근 거부 예외로 실패'; stage = 'ACL 읽기'; knobs = @{ aclReadFail = @('grant-a'); aclReadFailMode = 'throw' } },
        @{ n = 'ACL 읽기가 오류 없이 빈 값을 돌려줌'; stage = 'ACL 읽기'; knobs = @{ aclReadFail = @('grant-a'); aclReadFailMode = 'null' } },
        @{ n = '경로 확인(Test-Path)이 예외'; stage = '경로 확인'; knobs = @{ testPathThrow = @('grant-a') } }
    )
    foreach ($v in $variants) {
        $c = 'C13 복구 ACL 단계 실패 — ' + $v.n
        $G = New-AppliedGrantSandbox -Scenario @{ recover = $v.knobs; recover2 = @{} }
        $sb = $G.Sb
        Test-GrantSetup $c $G
        $aclA0 = Get-FakeAclSddl $sb $G.GrantA
        $r = Invoke-Recover $sb
        $rec = Get-RecoveryRecord $sb
        $ra = Get-ResultOf $rec 'acl *grant-a'
        $rb = Get-ResultOf $rec 'acl *grant-b'
        $st = Get-RecoverState $G
        Assert-Flow $c '종료 코드 40(실패한 항목이 있다)' ($r.exit -eq 40) "exit=$($r.exit) $($r.out)"
        Assert-Flow $c '읽지 못한 ACL 은 FAILED 로 남고(없음·성공이 아니다) 실패한 단계가 기록에 적힌다' (((Get-Prop $ra 'result') -eq 'FAILED') -and ([string](Get-Prop $ra 'note') -like ('*' + $v.stage + ' 단계에서 예외*'))) "result=$(Get-Prop $ra 'result') note=$(Get-Prop $ra 'note')"
        Assert-Flow $c '읽지 못한 ACL 은 건드리지 않는다(저장값 그대로, Set-Acl 호출 없음)' (($st.AclA -eq $aclA0) -and ((Get-CallsLog $sb 'recover') -notmatch ('Set-Acl ' + [regex]::Escape($G.GrantA)))) "aclA=$($st.AclA)"
        Assert-Flow $c '뒤의 ACL 은 계속 복구된다(OK, 새 계정 ACE 제거)' (((Get-Prop $rb 'result') -eq 'OK') -and (-not (Test-SddlHasSid $st.AclB $G.Sid))) "result=$(Get-Prop $rb 'result') aclB=$($st.AclB)"
        Assert-Flow $c '계정·규칙·작업 폴더·암호 파일 복구가 이어진다' (($st.UsersLeft -eq 0) -and ($st.RulesLeft -eq 0) -and (-not $st.WorkDirExists) -and (-not $st.CredExists)) "users=$($st.UsersLeft) rules=$($st.RulesLeft) workdir=$($st.WorkDirExists) cred=$($st.CredExists)"
        Assert-Flow $c '최종 기록이 남는다(상태 recovered-with-issues, 복구 결과 파일에 완료·실패 항목)' (($st.Status -eq 'recovered-with-issues') -and ($null -ne $rec) -and ((Get-Prop (Get-ResultOf $rec 'credential') 'result') -eq 'OK')) "status=$($st.Status) record=$($null -ne $rec)"
        $r2 = Invoke-Recover $sb 'recover2'
        $st2 = Get-RecoverState $G
        Assert-Flow $c '읽을 수 있게 된 뒤 다시 복구하면 실패했던 항목도 되돌아가고 종료 코드 0, 상태 recovered' (($r2.exit -eq 0) -and (-not (Test-SddlHasSid $st2.AclA $G.Sid)) -and ($st2.Status -eq 'recovered')) "exit=$($r2.exit) status=$($st2.Status) aclA=$($st2.AclA) $($r2.out)"
    }

    $c = 'C14 복구 ACL 단계 실패 — 대상 둘 모두 읽기 실패'
    $G = New-AppliedGrantSandbox -Scenario @{ recover = @{ aclReadFail = @('grant-a', 'grant-b'); aclReadFailMode = 'throw' } }
    $sb = $G.Sb
    Test-GrantSetup $c $G
    $aclA0 = Get-FakeAclSddl $sb $G.GrantA; $aclB0 = Get-FakeAclSddl $sb $G.GrantB
    $r = Invoke-Recover $sb
    $rec = Get-RecoveryRecord $sb
    $st = Get-RecoverState $G
    Assert-Flow $c '종료 코드 40, 두 항목이 각각 FAILED 로 남는다' (($r.exit -eq 40) -and ((Get-Prop (Get-ResultOf $rec 'acl *grant-a') 'result') -eq 'FAILED') -and ((Get-Prop (Get-ResultOf $rec 'acl *grant-b') 'result') -eq 'FAILED')) "exit=$($r.exit) $($r.out)"
    Assert-Flow $c '두 ACL 모두 그대로이고 나머지 자원 복구는 이어진다' (($st.AclA -eq $aclA0) -and ($st.AclB -eq $aclB0) -and ($st.UsersLeft -eq 0) -and ($st.RulesLeft -eq 0) -and (-not $st.WorkDirExists) -and (-not $st.CredExists)) "users=$($st.UsersLeft) workdir=$($st.WorkDirExists) cred=$($st.CredExists)"
    Assert-Flow $c '상태 recovered-with-issues' ($st.Status -eq 'recovered-with-issues') "status=$($st.Status)"

    $c = 'C14 복구 dry-run 에서도 읽기 실패는 FAILED 로 보이고 아무것도 바꾸지 않는다'
    $G = New-AppliedGrantSandbox -Scenario @{ recover = @{ aclReadFail = @('grant-a'); aclReadFailMode = 'throw' } }
    $sb = $G.Sb
    $s0 = Get-FakeText $sb
    $r = Invoke-Recover $sb -Dry
    Assert-Flow $c '종료 코드 40, FAILED 줄, 상태 불변, 복구 결과 파일 없음' (($r.exit -eq 40) -and ($r.out -match 'FAILED\s+acl\s+\S*grant-a') -and ((Get-FakeText $sb) -eq $s0) -and ($null -eq (Get-RecoveryRecord $sb))) "exit=$($r.exit) $($r.out)"
}

# 고치지 않은 동작이 그대로인가: 정상 복구, dry-run, 소유 불일치 거절. 모두 권한을 준 경로(aclGrant)가 있는 실행 기록으로 시험한다.
function Test-Case-RecoverKeepsBehavior {
    $c = 'C15 정상 복구와 dry-run (권한 경로 포함)'
    $G = New-AppliedGrantSandbox -Scenario @{}
    $sb = $G.Sb
    # 다른 ACE 가 그대로 남는지 보려고 grant-b 에 관리자 그룹(BA) ACE 한 건을 미리 넣어 둔다.
    Set-FakeAclSddl $sb $G.GrantB ((Get-FakeAclSddl $sb $G.GrantB) + '(A;OICI;FA;;;BA)')
    Test-GrantSetup $c $G
    $s0 = Get-FakeText $sb
    $d = Invoke-Recover $sb -Dry
    Assert-Flow $c 'dry-run: 종료 코드 0, 두 ACL 줄은 DRYRUN, 상태 불변, 복구 결과 파일 없음' (($d.exit -eq 0) -and ($d.out -match 'DRYRUN\s+acl\s+\S*grant-a') -and ($d.out -match 'DRYRUN\s+acl\s+\S*grant-b') -and ((Get-FakeText $sb) -eq $s0) -and ($null -eq (Get-RecoveryRecord $sb))) "exit=$($d.exit) $($d.out)"
    $r = Invoke-Recover $sb
    $rec = Get-RecoveryRecord $sb
    $st = Get-RecoverState $G
    Assert-Flow $c '복구: 종료 코드 0, 두 경로 모두 OK, 새 계정 ACE 제거, 상태 recovered' (($r.exit -eq 0) -and ((Get-Prop (Get-ResultOf $rec 'acl *grant-a') 'result') -eq 'OK') -and ((Get-Prop (Get-ResultOf $rec 'acl *grant-b') 'result') -eq 'OK') -and (-not (Test-SddlHasSid $st.AclA $G.Sid)) -and (-not (Test-SddlHasSid $st.AclB $G.Sid)) -and ($st.Status -eq 'recovered')) "exit=$($r.exit) status=$($st.Status) $($r.out)"
    Assert-Flow $c '복구: 다른 ACE(BA)는 그대로 남는다(ACL 전체를 덮어쓰지 않는다)' ($st.AclB -match ';;;BA\)') "aclB=$($st.AclB)"
    Assert-Flow $c '복구: 계정·규칙·작업 폴더·암호 파일이 모두 없다' (($st.UsersLeft -eq 0) -and ($st.RulesLeft -eq 0) -and (-not $st.WorkDirExists) -and (-not $st.CredExists)) "users=$($st.UsersLeft) workdir=$($st.WorkDirExists) cred=$($st.CredExists)"

    $c = 'C15 소유 불일치 거절 — ACL 에 기록된 SID 가 계정 SID 형식이 아니다'
    $G = New-AppliedGrantSandbox -Scenario @{}
    $sb = $G.Sb
    $mf = Join-Path $sb.RunDir 'resources.json'
    $m = [IO.File]::ReadAllText($mf, [Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($s in @($m.steps)) { if ($s.kind -eq 'aclGrant' -and $s.name -eq $G.GrantA) { $s.detail.sid = 'S-1-5-32-545' } }
    [IO.File]::WriteAllText($mf, ($m | ConvertTo-Json -Depth 8), $Utf8)
    $aclA0 = Get-FakeAclSddl $sb $G.GrantA
    $r = Invoke-Recover $sb
    $rec = Get-RecoveryRecord $sb
    $st = Get-RecoverState $G
    Assert-Flow $c '종료 코드 40, 해당 항목은 REFUSED_NOT_OURS' (($r.exit -eq 40) -and ((Get-Prop (Get-ResultOf $rec 'acl *grant-a') 'result') -eq 'REFUSED_NOT_OURS')) "exit=$($r.exit) $($r.out)"
    Assert-Flow $c '거절한 ACL 은 그대로이고(Set-Acl 호출 없음) 다른 경로와 나머지 자원은 복구된다' (($st.AclA -eq $aclA0) -and ((Get-CallsLog $sb 'recover') -notmatch ('Set-Acl ' + [regex]::Escape($G.GrantA))) -and (-not (Test-SddlHasSid $st.AclB $G.Sid)) -and ($st.UsersLeft -eq 0) -and (-not $st.WorkDirExists) -and (-not $st.CredExists)) "aclA=$($st.AclA)"

    $c = 'C15 소유 불일치 거절 — 작업 폴더 .owner 표식이 다르다'
    $G = New-AppliedGrantSandbox -Scenario @{}
    $sb = $G.Sb
    [IO.File]::WriteAllText((Join-Path $sb.WorkDir '.owner'), 'someone-else', $Utf8)
    $r = Invoke-Recover $sb
    $rec = Get-RecoveryRecord $sb
    $st = Get-RecoverState $G
    Assert-Flow $c '종료 코드 40, 작업 폴더는 REFUSED_NOT_OURS 이고 지우지 않는다' (($r.exit -eq 40) -and ((Get-Prop (Get-ResultOf $rec 'workdir *') 'result') -eq 'REFUSED_NOT_OURS') -and $st.WorkDirExists -and ((Get-CallsLog $sb 'recover') -notmatch ('Remove-Item ' + [regex]::Escape($sb.WorkDir)))) "exit=$($r.exit) $($r.out)"
    Assert-Flow $c '나머지(두 ACL·계정·암호 파일)는 복구된다' ((-not (Test-SddlHasSid $st.AclA $G.Sid)) -and (-not (Test-SddlHasSid $st.AclB $G.Sid)) -and ($st.UsersLeft -eq 0) -and (-not $st.CredExists)) "users=$($st.UsersLeft) cred=$($st.CredExists)"
}

# 같은 유형(읽기·소유 확인이 예외 처리 밖에 있어 복구 전체를 멈춤)으로 확인된 다른 두 지점: 작업 폴더 .owner 읽기, 암호 파일 경로 확인.
function Test-Case-RecoverOwnerReadFailures {
    $c = 'C16 복구 작업 폴더 .owner 읽기 실패(다른 프로세스가 파일을 잠금)'
    $G = New-AppliedGrantSandbox -Scenario @{ recover2 = @{} }
    $sb = $G.Sb
    $owner = Join-Path $sb.WorkDir '.owner'
    Test-GrantSetup $c $G
    # 진짜 파일 잠금: 이 프로세스가 .owner 를 공유 없이 열어 두면 자식 프로세스의 읽기가 공유 위반(IOException)으로 실패한다.
    $lock = [IO.File]::Open($owner, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try { $r = Invoke-Recover $sb } finally { $lock.Dispose() }
    $rec = Get-RecoveryRecord $sb
    $st = Get-RecoverState $G
    Assert-Flow $c '종료 코드 40, 작업 폴더는 FAILED(소유를 확인하지 못했다)' (($r.exit -eq 40) -and ((Get-Prop (Get-ResultOf $rec 'workdir *') 'result') -eq 'FAILED')) "exit=$($r.exit) $($r.out)"
    Assert-Flow $c '소유를 확인하지 못한 폴더는 지우지 않는다' ($st.WorkDirExists -and (Test-Path -LiteralPath $owner) -and ((Get-CallsLog $sb 'recover') -notmatch ('Remove-Item ' + [regex]::Escape($sb.WorkDir)))) "workdir=$($st.WorkDirExists)"
    Assert-Flow $c '그 뒤 단계(암호 파일)와 앞 단계(ACL·계정)는 복구된다' ((-not $st.CredExists) -and ($st.UsersLeft -eq 0) -and (-not (Test-SddlHasSid $st.AclA $G.Sid)) -and (-not (Test-SddlHasSid $st.AclB $G.Sid))) "cred=$($st.CredExists) users=$($st.UsersLeft)"
    Assert-Flow $c '최종 기록이 남는다(상태 recovered-with-issues)' (($st.Status -eq 'recovered-with-issues') -and ($null -ne $rec)) "status=$($st.Status)"
    $r2 = Invoke-Recover $sb 'recover2'
    $st2 = Get-RecoverState $G
    Assert-Flow $c '잠금이 풀린 뒤 다시 복구하면 작업 폴더가 지워지고 종료 코드 0, 상태 recovered' (($r2.exit -eq 0) -and (-not $st2.WorkDirExists) -and ($st2.Status -eq 'recovered')) "exit=$($r2.exit) status=$($st2.Status) $($r2.out)"

    $c = 'C16 복구 암호 파일 경로 확인이 예외'
    $G = New-AppliedGrantSandbox -Scenario @{ recover = @{ testPathThrow = @('credential.dpapi') }; recover2 = @{} }
    $sb = $G.Sb
    $r = Invoke-Recover $sb
    $rec = Get-RecoveryRecord $sb
    $st = Get-RecoverState $G
    Assert-Flow $c '종료 코드 40, 암호 파일은 FAILED 이고 지우지 않았다(확인하지 못했으므로)' (($r.exit -eq 40) -and ((Get-Prop (Get-ResultOf $rec 'credential') 'result') -eq 'FAILED') -and $st.CredExists) "exit=$($r.exit) $($r.out)"
    Assert-Flow $c '앞 단계는 모두 복구되고 최종 기록(recovered-with-issues)이 남는다' (($st.UsersLeft -eq 0) -and ($st.RulesLeft -eq 0) -and (-not $st.WorkDirExists) -and (-not (Test-SddlHasSid $st.AclA $G.Sid)) -and ($st.Status -eq 'recovered-with-issues') -and ($null -ne $rec)) "status=$($st.Status) users=$($st.UsersLeft)"
    $r2 = Invoke-Recover $sb 'recover2'
    $st2 = Get-RecoverState $G
    Assert-Flow $c '확인이 되는 상태에서 다시 복구하면 암호 파일이 지워지고 종료 코드 0' (($r2.exit -eq 0) -and (-not $st2.CredExists) -and ($st2.Status -eq 'recovered')) "exit=$($r2.exit) status=$($st2.Status)"
}

$all = [ordered]@{
    'control' = { Test-Case-Control }
    'identity' = { Test-Case-Identity }
    'stale' = { Test-Case-StaleFiles }
    'audit-open' = { Test-Case-AuditOpen }
    'audit-close' = { Test-Case-AuditClose }
    'cleanup' = { Test-Case-AccountAndCleanup }
    'events' = { Test-Case-Events }
    'recover-acl' = { Test-Case-RecoverAclFailures }
    'recover-keep' = { Test-Case-RecoverKeepsBehavior }
    'recover-owner' = { Test-Case-RecoverOwnerReadFailures }
}
Write-Host ("흐름 시험 [{0}] 엔진={1} 코드={2} ({3})" -f $Label, $Engine, $CodeDir, $(if ($IsNew) { '새 구조(IsolationFlows.ps1)' } else { '옛 구조' }))
foreach ($k in $all.Keys) {
    if ($Only.Count -gt 0 -and $Only -notcontains $k) { continue }
    Write-Host "== $k"
    try { & $all[$k] } catch { Assert-Flow $k '시험 자체가 예외 없이 끝난다' $false $_.Exception.Message }
}
$fail = @($Results | Where-Object { -not $_.pass })
Write-Host ''
Write-Host ("흐름 시험 [{0}]: 통과 {1} / 전체 {2}   (합성 환경, 실제 Windows 변경 없음)" -f $Label, ($Results.Count - $fail.Count), $Results.Count)
if (-not $KeepSandbox) { foreach ($s in $Sandboxes) { if (Test-Path -LiteralPath $s) { Remove-Item -LiteralPath $s -Recurse -Force -ErrorAction SilentlyContinue } } }
if ($fail.Count -gt 0) { exit 1 }
exit 0
