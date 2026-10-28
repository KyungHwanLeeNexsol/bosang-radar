# 모의 시스템: 실제 Windows 를 바꾸지 않고 적용·검증·복구 진입 스크립트를 끝까지 돌리기 위한 시험용 대역.
#
# - 시험 러너(Test-IsolationFlows.ps1)가 임시 사본의 공용/흐름 파일 뒤에 끼워 넣는다. 운영 스크립트에는 이 파일을 읽는 곳이 없다.
# - 계정·방화벽 규칙·감사 정책·ACL·프로세스·Security 로그·NT 경로·프로브 결과 파일을 모두 메모리/샌드박스 파일로 흉내 낸다.
# - 대체하지 않은 시스템 변경 명령은 호출되면 예외를 던진다(진짜로 실행되지 않게 막는다).
# - 상태는 샌드박스의 fake-state.json 에 저장돼 적용 → 검증 → 복구 단계(서로 다른 프로세스)가 이어서 쓴다.
# - 시나리오(ISO_MOCK_SCENARIO)의 단계별 절(apply/verify/recover) 'knobs' 로 실패·불일치를 주입한다.
Set-StrictMode -Version 2.0

$Script:MockSandbox = [string]$env:ISO_MOCK_SANDBOX
if (-not $Script:MockSandbox -or -not (Test-Path -LiteralPath $Script:MockSandbox)) { throw 'ISO_MOCK_SANDBOX 가 없다: 모의 시험 밖에서는 이 파일을 읽지 않는다.' }
$Script:MockSandbox = [IO.Path]::GetFullPath($Script:MockSandbox).TrimEnd('\')
$Script:MockPhase = [string]$env:ISO_MOCK_PHASE
$Script:MockScenario = [IO.File]::ReadAllText([string]$env:ISO_MOCK_SCENARIO, [Text.Encoding]::UTF8) | ConvertFrom-Json
$Script:MockStateFile = Join-Path $Script:MockSandbox 'fake-state.json'
$Script:MockLogFile = Join-Path $Script:MockSandbox 'calls.log'
$Script:MockCounters = @{}
$Script:MockProcs = @{}
$Script:MockLaunched = $false
$Script:MockSetHappened = $false
$Script:MockRealCmd = @{}
$Script:MockUtf8 = New-Object Text.UTF8Encoding($false)
# 진짜 Get-Acl 이 돌려주는 객체의 Access 속성은 Microsoft.PowerShell.Security 모듈의 형식 정보가 붙여 준다. 모의 Get-Acl 은 그 모듈을 부르지 않아서,
# 적용 단계(ConvertTo-SecureString 이 모듈을 불러 온다)에서만 우연히 Access 가 읽히고 복구 단계에서는 없었다. 모듈만 불러 두면 같은 모양이 된다(ACL 을 읽지 않는다).
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop

function Get-MockKnob {
    param([string]$Name, $Default = $null)
    $ph = $Script:MockScenario.PSObject.Properties[$Script:MockPhase]
    if ($ph -and $ph.Value) {
        $k = $ph.Value.PSObject.Properties[$Name]
        if ($k) { return $k.Value }
    }
    $Default
}
function Step-MockCounter { param([string]$Name) if (-not $Script:MockCounters.ContainsKey($Name)) { $Script:MockCounters[$Name] = 0 }; $Script:MockCounters[$Name]++; $Script:MockCounters[$Name] }
function Write-MockLog { param([string]$Text) [IO.File]::AppendAllText($Script:MockLogFile, ('[{0}] {1}' -f $Script:MockPhase, $Text) + "`n", $Script:MockUtf8) }
function Test-MockIn { param($List, [int]$Value) if ($null -eq $List) { return $false }; foreach ($x in @($List)) { if ([int]$x -eq $Value) { return $true } }; $false }

# ── 저장되는 가짜 상태 ────────────────────────────────────────────────────────
$Script:Fake = [ordered]@{ users = [ordered]@{}; rules = [ordered]@{}; audit = [ordered]@{}; acl = [ordered]@{}; nextRid = 2001; nextPid = 4100 }
if (Test-Path -LiteralPath $Script:MockStateFile) {
    $Script:Fake = ConvertTo-PlainObject -Object ([IO.File]::ReadAllText($Script:MockStateFile, [Text.Encoding]::UTF8) | ConvertFrom-Json)
} else {
    $init = $Script:MockScenario.PSObject.Properties['initialAudit']
    $fpc = 0; $pc = 0
    if ($init) { $fpc = [int]$init.Value.fpc; $pc = [int]$init.Value.pc }
    $Script:Fake.audit['{0CCE9226-69AE-11D9-BED3-505054503030}'] = $fpc
    $Script:Fake.audit['{0CCE922B-69AE-11D9-BED3-505054503030}'] = $pc
}
function Save-MockState { [IO.File]::WriteAllText($Script:MockStateFile, ($Script:Fake | ConvertTo-Json -Depth 8), $Script:MockUtf8) }

# ── 경로 루트: 모두 샌드박스 안 ───────────────────────────────────────────────
function Get-IsoStateRoot { Join-Path $Script:MockSandbox 'state' }
function Get-IsoWorkRoot { Join-Path $Script:MockSandbox 'work' }
function Test-IsElevated { $true }
function Start-Sleep { [CmdletBinding()] param([int]$Seconds = 0, [int]$Milliseconds = 0) Microsoft.PowerShell.Utility\Start-Sleep -Milliseconds 5 }

# ── 감사 정책 ────────────────────────────────────────────────────────────────
function Update-MockAuditExternal {
    $n = Get-MockKnob 'auditExternalAfterReadCall'
    if ($null -ne $n -and (Step-MockCounter 'auditReadForExternal') -eq [int]$n) {
        $Script:Fake.audit[[string](Get-MockKnob 'auditExternalGuid' '{0CCE9226-69AE-11D9-BED3-505054503030}')] = [int](Get-MockKnob 'auditExternalValue' 3)
        Save-MockState
    }
}
# 호출 스택에 해당 함수가 있는지: 옛 코드와 새 코드가 같은 시나리오를 쓰도록, 호출 횟수가 아니라 "어느 함수 안에서"로 실패를 주입한다.
function Test-MockInFunction { param([string]$Name) @(Get-PSCallStack | Where-Object { $_.FunctionName -eq $Name }).Count -gt 0 }
function Test-MockAuditReadFails {
    $call = Step-MockCounter 'auditRead'
    if (Test-MockIn (Get-MockKnob 'auditReadFailOnCalls') $call) { return $true }
    if ((Get-MockKnob 'auditReadFailAfterSet' $false) -and $Script:MockSetHappened) { return $true }
    if ((Get-MockKnob 'auditReadFailInOpenAfterSet' $false) -and $Script:MockSetHappened -and (Test-MockInFunction 'Open-IsoAuditWindow')) { return $true }
    if ((Get-MockKnob 'auditReadFailInClose' $false) -and (Test-MockInFunction 'Close-IsoAuditWindow')) { return $true }
    if ((Get-MockKnob 'auditReadFailInEvidenceCheck' $false) -and (Test-MockInFunction 'Get-IsoAuditFailureState')) { return $true }
    $false
}
function Test-MockAuditSetFails {
    $call = Step-MockCounter 'auditSet'
    if (Test-MockIn (Get-MockKnob 'auditSetFailOnCalls') $call) { return $true }
    if ((Get-MockKnob 'auditSetFailInClose' $false) -and (Test-MockInFunction 'Close-IsoAuditWindow')) { return $true }
    if ((Get-MockKnob 'auditSetFailInOpen' $false) -and (Test-MockInFunction 'Open-IsoAuditWindow')) { return $true }
    $false
}
# 제3자가 감사 값을 바꾸는 상황: Close 안에서 처음 읽을 때 값이 이미 바뀌어 있다.
function Update-MockAuditExternalInClose {
    $v = Get-MockKnob 'auditExternalInClose'
    if ($null -ne $v -and (Test-MockInFunction 'Close-IsoAuditWindow') -and (Step-MockCounter 'externalInClose') -eq 1) {
        $Script:Fake.audit['{0CCE9226-69AE-11D9-BED3-505054503030}'] = [int]$v
        Save-MockState
    }
}
function Set-MockAuditValue {
    param([string]$Guid, [bool]$Success, [bool]$Failure)
    $v = 0; if ($Success) { $v = $v -bor 1 }; if ($Failure) { $v = $v -bor 2 }
    $Script:Fake.audit[$Guid.ToUpperInvariant()] = $v
    $Script:MockSetHappened = $true
    Save-MockState
}
# 새 코드는 auditpol 을 Invoke-AuditPol 로만 부른다 → 이것만 대체하면 진짜 Get-AuditSettings/Set-AuditSubcategory 코드가 시험된다.
# 옛 코드는 auditpol.exe 를 직접 부르므로, 이 함수가 없으면 두 함수를 통째로 대체한다(진짜 auditpol 이 실행되지 않게).
$Script:MockHasAuditPolWrapper = [bool](Get-Command Invoke-AuditPol -CommandType Function -ErrorAction SilentlyContinue)
function Invoke-AuditPol {
    param([Parameter(Mandatory)][string[]]$Arguments)
    Write-MockLog ('Invoke-AuditPol ' + ($Arguments -join ' '))
    if ($Arguments[0] -eq '/backup') {
        if (Test-MockAuditReadFails) { return @{ ExitCode = 1; Output = 'mock: auditpol /backup failed' } }
        Update-MockAuditExternal
        Update-MockAuditExternalInClose
        $path = ($Arguments | Where-Object { $_ -like '/file:*' } | Select-Object -First 1).Substring(6)
        $lines = @('Machine Name,Policy Target,Subcategory,Subcategory GUID,Inclusion Setting,Exclusion Setting,Setting Value')
        foreach ($g in $Script:Fake.audit.Keys) { $lines += ('MOCK-PC,System,Sub {0},{1},x,,{2}' -f $g.Substring(1, 4), $g, $Script:Fake.audit[$g]) }
        [IO.File]::WriteAllLines($path, $lines, $Script:MockUtf8)
        return @{ ExitCode = 0; Output = '' }
    }
    if ($Arguments[0] -eq '/set') {
        if (Test-MockAuditSetFails) {
            if (Get-MockKnob 'auditSetAppliesDespiteFailure' $false) {
                $g = ($Arguments | Where-Object { $_ -like '/subcategory:*' } | Select-Object -First 1).Substring(13)
                Set-MockAuditValue -Guid $g -Success ($Arguments -contains '/success:enable') -Failure ($Arguments -contains '/failure:enable')
            }
            return @{ ExitCode = 1; Output = 'mock: auditpol /set failed' }
        }
        $g = ($Arguments | Where-Object { $_ -like '/subcategory:*' } | Select-Object -First 1).Substring(13)
        Set-MockAuditValue -Guid $g -Success ($Arguments -contains '/success:enable') -Failure ($Arguments -contains '/failure:enable')
        return @{ ExitCode = 0; Output = '' }
    }
    throw "MOCK GUARD: 허용하지 않은 auditpol 인자: $($Arguments -join ' ')"
}
if (-not $Script:MockHasAuditPolWrapper) {
    function Get-AuditSettings {
        param([Parameter(Mandatory)][string]$BackupPath)
        if (Test-MockAuditReadFails) { return @{ Ok = $false; Error = 'mock: audit read failed'; Values = @{} } }
        Update-MockAuditExternal
        Update-MockAuditExternalInClose
        $v = @{}; foreach ($g in $Script:Fake.audit.Keys) { $v[$g] = [int]$Script:Fake.audit[$g] }
        @{ Ok = $true; Error = $null; Values = $v }
    }
    function Set-AuditSubcategory {
        param([Parameter(Mandatory)][string]$Guid, [Parameter(Mandatory)][bool]$Success, [Parameter(Mandatory)][bool]$Failure, [string]$Why)
        if (-not $Script:ApplyMode) { Write-IsoLog -Level 'PLAN' -Message "auditpol /set $Guid ($Why)"; return $null }
        Write-MockLog "Set-AuditSubcategory $Guid success=$Success failure=$Failure"
        if (Test-MockAuditSetFails) {
            if (Get-MockKnob 'auditSetAppliesDespiteFailure' $false) { Set-MockAuditValue -Guid $Guid -Success $Success -Failure $Failure }
            throw 'mock: auditpol /set 실패'
        }
        Set-MockAuditValue -Guid $Guid -Success $Success -Failure $Failure
    }
}

# ── 계정 ─────────────────────────────────────────────────────────────────────
function New-MockUserObject { param($Rec) [pscustomobject]@{ Name = [string]$Rec['Name']; Enabled = [bool]$Rec['Enabled']; Description = [string]$Rec['Description']; SID = [pscustomobject]@{ Value = [string]$Rec['Sid'] } } }
function Get-LocalUser {
    [CmdletBinding()] param([string]$Name)
    if ($Name) {
        if (-not $Script:Fake.users.Contains($Name)) { Write-Error "User $Name was not found."; return }
        return (New-MockUserObject $Script:Fake.users[$Name])
    }
    foreach ($k in @($Script:Fake.users.Keys)) { New-MockUserObject $Script:Fake.users[$k] }
}
function New-LocalUser {
    [CmdletBinding()] param([string]$Name, $Password, [string]$Description, [switch]$PasswordNeverExpires, [switch]$UserMayNotChangePassword, [switch]$AccountNeverExpires)
    Write-MockLog "New-LocalUser $Name"
    $sid = 'S-1-5-21-1111111111-2222222222-3333333333-{0}' -f $Script:Fake.nextRid
    $Script:Fake.nextRid = [int]$Script:Fake.nextRid + 1
    $Script:Fake.users[$Name] = [ordered]@{ Name = $Name; Enabled = $true; Description = $Description; Sid = $sid; Groups = @() }
    Save-MockState
    New-MockUserObject $Script:Fake.users[$Name]
}
function Add-LocalGroupMember {
    [CmdletBinding()] param($SID, [string]$Member)
    Write-MockLog "Add-LocalGroupMember $($SID.Value) $Member"
    $Script:Fake.users[$Member].Groups = @($Script:Fake.users[$Member].Groups) + @([string]$SID.Value)
    Save-MockState
}
function Enable-LocalUser { [CmdletBinding()] param([string]$Name) Write-MockLog "Enable-LocalUser $Name"; $Script:Fake.users[$Name].Enabled = $true; Save-MockState }
function Disable-LocalUser {
    [CmdletBinding()] param([string]$Name)
    Write-MockLog "Disable-LocalUser $Name"
    if (Get-MockKnob 'disableUserFails' $false) { throw 'mock: Disable-LocalUser 실패' }
    if (Get-MockKnob 'disableUserSilent' $false) { return }   # 오류 없이 반환하지만 실제로는 꺼지지 않는 경우
    $Script:Fake.users[$Name].Enabled = $false; Save-MockState
}
function Remove-LocalUser {
    [CmdletBinding()] param($SID)
    Write-MockLog "Remove-LocalUser $($SID.Value)"
    $hit = @($Script:Fake.users.Keys | Where-Object { $Script:Fake.users[$_].Sid -eq [string]$SID.Value })
    foreach ($k in $hit) { $Script:Fake.users.Remove($k) }
    Save-MockState
}

# ── 방화벽 ───────────────────────────────────────────────────────────────────
function New-MockRuleObject { param($Rec) [pscustomobject]@{ Name = [string]$Rec['Name']; DisplayName = [string]$Rec['DisplayName']; Group = [string]$Rec['Group']; Description = [string]$Rec['Description']; Enabled = [string]$Rec['Enabled']; Action = [string]$Rec['Action']; Direction = [string]$Rec['Direction']; LocalUser = [string]$Rec['LocalUser']; RemoteAddress = @($Rec['RemoteAddress']) } }
function Get-NetFirewallRule {
    [CmdletBinding()] param([string]$Name)
    if ($Name) {
        if (-not $Script:Fake.rules.Contains($Name)) { Write-Error "No MSFT_NetFirewallRule objects found with property 'InstanceID' equal to '$Name'."; return }
        return (New-MockRuleObject $Script:Fake.rules[$Name])
    }
    foreach ($k in @($Script:Fake.rules.Keys)) { New-MockRuleObject $Script:Fake.rules[$k] }
}
function Get-NetFirewallSecurityFilter { [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject) process { [pscustomobject]@{ LocalUser = [string]$InputObject.LocalUser } } }
function Get-NetFirewallAddressFilter { [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject) process { [pscustomobject]@{ RemoteAddress = @($InputObject.RemoteAddress) } } }
function New-NetFirewallRule {
    [CmdletBinding()] param([string]$Name, [string]$DisplayName, [string]$Group, [string]$Description, [string]$Direction, [string]$Action, [string]$Profile, [string]$Enabled, [string]$LocalUser, [string[]]$RemoteAddress)
    Write-MockLog "New-NetFirewallRule $Name enabled=$Enabled localUser=$LocalUser"
    $Script:Fake.rules[$Name] = [ordered]@{ Name = $Name; DisplayName = $DisplayName; Group = $Group; Description = $Description; Enabled = $Enabled; Action = $Action; Direction = $Direction; LocalUser = $LocalUser; RemoteAddress = @($RemoteAddress) }
    Save-MockState
}
function Set-NetFirewallRule { [CmdletBinding()] param([string]$Name, [string]$Enabled) Write-MockLog "Set-NetFirewallRule $Name enabled=$Enabled"; $Script:Fake.rules[$Name].Enabled = $Enabled; Save-MockState }
function Remove-NetFirewallRule { [CmdletBinding()] param([string]$Name) Write-MockLog "Remove-NetFirewallRule $Name"; $Script:Fake.rules.Remove($Name); Save-MockState }

# ── ACL: SDDL 로 저장하는 가짜 저장소 ────────────────────────────────────────
function Test-MockPathMatches { param([string]$Path, $Fragments) if (-not $Path) { return $false }; foreach ($x in @($Fragments)) { if ($Path.IndexOf([string]$x, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true } }; $false }
function Get-Acl {
    [CmdletBinding()] param([string]$LiteralPath)
    # 읽기 실패 주입: knob aclReadFail(경로 조각 목록)에 걸리면 실패한다. aclReadFailMode 'throw' = 접근 거부 예외(기본), 'null' = 오류 없이 아무것도 돌려주지 않음.
    $failOn = Get-MockKnob 'aclReadFail'
    if ($null -ne $failOn -and (Test-MockPathMatches $LiteralPath $failOn)) {
        Write-MockLog "Get-Acl FAIL $LiteralPath"
        if ([string](Get-MockKnob 'aclReadFailMode' 'throw') -eq 'null') { return $null }
        throw 'mock: Get-Acl 접근 거부(UnauthorizedAccessException)'
    }
    $d = New-Object Security.AccessControl.DirectorySecurity
    $key = [IO.Path]::GetFullPath($LiteralPath)
    # ACE 를 모두 지운 뒤 저장된 SDDL 이 빈 문자열일 수 있다: 빈 값은 "ACE 없음"이므로 되살리지 않는다(SetSecurityDescriptorSddlForm('') 은 예외).
    if ($Script:Fake.acl.Contains($key) -and [string]$Script:Fake.acl[$key]) { $d.SetSecurityDescriptorSddlForm([string]$Script:Fake.acl[$key]) }
    $d
}
# 경로 확인 실패 주입: knob testPathThrow(경로 조각 목록)에 걸린 경로를 확인하면 예외를 던진다. 그 밖에는 진짜 Test-Path 에 그대로 넘긴다.
function Test-Path {
    [CmdletBinding()] param([Parameter(Position = 0)][string]$Path, [string]$LiteralPath, [string]$PathType)
    $throwOn = Get-MockKnob 'testPathThrow'
    if ($null -ne $throwOn) {
        $target = $LiteralPath; if (-not $target) { $target = $Path }
        if (Test-MockPathMatches $target $throwOn) { Write-MockLog "Test-Path THROW $target"; throw 'mock: Test-Path 접근 거부' }
    }
    Microsoft.PowerShell.Management\Test-Path @PSBoundParameters
}
function Set-Acl {
    [CmdletBinding()] param([string]$LiteralPath, $AclObject)
    Write-MockLog "Set-Acl $LiteralPath"
    $Script:Fake.acl[[IO.Path]::GetFullPath($LiteralPath)] = $AclObject.GetSecurityDescriptorSddlForm('Access')
    Save-MockState
}

# ── 프로세스 ─────────────────────────────────────────────────────────────────
function Get-MockUserSid { param([string]$UserName) $n = $UserName -replace '^\.\\', ''; if ($Script:Fake.users.Contains($n)) { return [string]$Script:Fake.users[$n].Sid }; 'S-1-5-21-0-0-0-9999' }
function Write-MockJson { param([string]$Path, $Object) [IO.File]::WriteAllText($Path, ($Object | ConvertTo-Json -Depth 8), $Script:MockUtf8) }
function Merge-MockOverride { param($Base, $Override) if ($Override) { foreach ($p in $Override.PSObject.Properties) { $Base[$p.Name] = $p.Value } }; $Base }

function Start-Process {
    [CmdletBinding()]
    param([string]$FilePath, [object]$ArgumentList, $Credential, [string]$WorkingDirectory, [switch]$LoadUserProfile, [switch]$PassThru, [switch]$Wait, [string]$WindowStyle)
    $argv = @($ArgumentList | ForEach-Object { [string]$_ })
    Write-MockLog ('Start-Process ' + $FilePath + ' ' + ($argv -join ' ') + ' credential=' + [bool]$Credential)
    # 버전 실행기(version-runner.ps1): 전용 계정으로 부르는 경우만 흉내 낸다(결과 파일을 시나리오대로 만든다).
    if ($Credential -and ($argv -join ' ') -match 'version-runner\.ps1') { return (Invoke-MockVersionRunner -Credential $Credential -Argv $argv) }
    if (-not $Credential -or ($argv -join ' ') -notmatch 'probe-parent\.ps1') {
        # 관리자 계정 대조군이거나 그 밖의 실행: 아무것도 하지 않고 끝난 프로세스를 돌려준다.
        return [pscustomobject]@{ Id = 1; HasExited = $true; ExitCode = 0 }
    }
    function ArgAfter([string]$flag) { $i = [Array]::IndexOf($argv, $flag); if ($i -ge 0 -and ($i + 1) -lt $argv.Count) { return $argv[$i + 1].Trim('"') }; $null }
    $dir = ArgAfter '-Dir'; $targetsFile = ArgAfter '-TargetsFile'; $token = ArgAfter '-RunToken'
    $sid = Get-MockUserSid $Credential.UserName
    $exe = $Script:Ps51
    $base = [DateTime]::UtcNow
    $Script:MockLaunched = $true
    $parentPid = [int]$Script:Fake.nextPid; $childPid = $parentPid + 1; $Script:Fake.nextPid = $parentPid + 2; Save-MockState
    $pStart = $base.AddMilliseconds(10); $cStart = $base.AddMilliseconds(50); $cEnd = $base.AddMilliseconds(120); $pDone = $base.AddMilliseconds(150)
    $Script:MockProcs[$parentPid] = @{ role = 'parent'; processId = $parentPid; parentProcessId = 1234; exePath = $exe; startUtc = $pStart.ToString('o'); ownerSid = $sid; alive = [bool](Get-MockKnob 'procsStayAlive' $false) }
    $Script:MockProcs[$childPid] = @{ role = 'child'; processId = $childPid; parentProcessId = $parentPid; exePath = $exe; startUtc = $cStart.ToString('o'); ownerSid = $sid; alive = [bool](Get-MockKnob 'procsStayAlive' $false) }
    $Script:MockProcs[$parentPid].alive = $Script:MockProcs[$parentPid].alive;
    $probe = $Script:MockScenario.PSObject.Properties['probe']
    $pk = $null; if ($probe) { $pk = $probe.Value }
    function PK([string]$n, $d = $null) { if ($pk) { $x = $pk.PSObject.Properties[$n]; if ($x) { return $x.Value } }; $d }
    foreach ($who in 'parent', 'child') {
        $ov = PK ('cim' + (Get-Culture).TextInfo.ToTitleCase($who))
        if ($ov) { foreach ($p in $ov.PSObject.Properties) { $Script:MockProcs[$(if ($who -eq 'parent') { $parentPid } else { $childPid })][$p.Name] = $p.Value } }
    }
    $tokenMode = [string](PK 'tokenMode' 'echo')
    $tok = $null; if ($tokenMode -eq 'echo' -and $token) { $tok = $token } elseif ($tokenMode -eq 'stale') { $tok = 'stale-token-from-earlier-run' }
    $omit = @(PK 'omitFiles' @())
    # targets.json: 옛 모양은 최상위 배열, 새 모양은 { runToken, targets: [...] }. 5.1 에서는 @(… | ConvertFrom-Json) 이 최상위 배열을 한 겹 더 감싸므로 변수에 먼저 받는다.
    $parsedTargets = [IO.File]::ReadAllText($targetsFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($parsedTargets.PSObject.Properties['targets']) { $targets = @($parsedTargets.targets) } else { $targets = @($parsedTargets) }
    $attempts = @()
    foreach ($t in $targets) {
        $outcome = 'timeout'
        if ($t.name -eq 'loopback' -and (PK 'loopbackConnect' $true)) {
            try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', [int]$t.port); $c.Close(); $outcome = 'connected' } catch { $outcome = 'socket-error' }
        } elseif ($t.name -ne 'loopback') { $outcome = [string](PK 'externalOutcome' 'timeout') }
        $attempts += , ([ordered]@{ name = $t.name; address = $t.address; port = [int]$t.port; startUtc = $base.AddMilliseconds(70).ToString('o'); endUtc = $base.AddMilliseconds(100).ToString('o'); outcome = $outcome; detail = $null })
    }
    # writeNothing: 프로세스는 떴고 루프백 연결도 실제로 일어났지만 결과 파일은 하나도 쓰지 않는다(이전 실행의 파일만 남아 있는 상황).
    if (PK 'writeNothing' $false) { return [pscustomobject]@{ Id = $parentPid; HasExited = $true; ExitCode = 0 } }
    $parentSelf = Merge-MockOverride ([ordered]@{ pid = $parentPid; startUtc = $pStart.ToString('o'); exePath = $exe; sid = $sid }) (PK 'parentSelf')
    $childSelf = Merge-MockOverride ([ordered]@{ pid = $childPid; startUtc = $cStart.ToString('o'); exePath = $exe; sid = $sid }) (PK 'childSelf')
    if ($tok) { $parentSelf['runToken'] = $tok }
    $childResult = [ordered]@{ self = $childSelf; endUtc = $cEnd.ToString('o'); attempts = $attempts }
    if ($tok) { $childResult['runToken'] = $tok }
    $linkPid = $childPid; $lp = PK 'parentChildPid'; if ($null -ne $lp) { $linkPid = [int]$lp }
    $link = [ordered]@{ childPid = $linkPid }; if ($tok) { $link['runToken'] = $tok }
    $done = [ordered]@{ endUtc = $pDone.ToString('o'); childExitCode = 0 }; if ($tok) { $done['runToken'] = $tok }
    if ($omit -notcontains 'parent-self.json') { Write-MockJson (Join-Path $dir 'parent-self.json') $parentSelf }
    if ($omit -notcontains 'parent-child.json') { Write-MockJson (Join-Path $dir 'parent-child.json') $link }
    if ($omit -notcontains 'child-result.json') { Write-MockJson (Join-Path $dir 'child-result.json') $childResult }
    if ($omit -notcontains 'parent-done.json') { Write-MockJson (Join-Path $dir 'parent-done.json') $done }
    [pscustomobject]@{ Id = $parentPid; HasExited = $true; ExitCode = 0 }
}
# ── 버전 실행기(version-runner.ps1) 흉내 ─────────────────────────────────────
# 시나리오 version 절의 runner 손잡이:
#   stdout / stderr (문자열), exitCode (기본 0), childState (기본 EXITED), noResult (결과 파일을 쓰지 않는다)
#   set   = [ { path = 'stdout.readFailed'; value = $true }, ... ]   결과 JSON 의 점 경로를 덮어쓴다(값 null 은 null 로 쓴다)
#   unset = [ 'streamsClosed', ... ]                                  점 경로를 지운다(필수 상태가 누락된 결과를 흉내 낸다)
# 실행기를 실제로 돌리지 않는다. 진입 스크립트(관리자 쪽)의 판정이 시험 대상이므로, 실행기가 남길 수 있는 결과 파일을 대신 만든다.
function Set-MockPath {
    param($Root, [string]$Path, $Value, [switch]$Remove)
    $segs = $Path.Split('.'); $cur = $Root
    for ($i = 0; $i -lt $segs.Count - 1; $i++) { $cur = $cur[$segs[$i]] }
    $leaf = $segs[$segs.Count - 1]
    if ($Remove) { $cur.Remove($leaf) } else { $cur[$leaf] = $Value }
}
function Invoke-MockVersionRunner {
    param($Credential, [string[]]$Argv)
    $ri = [Array]::IndexOf($Argv, '-RequestFile'); $reqFile = $Argv[$ri + 1].Trim('"')
    $req = [IO.File]::ReadAllText($reqFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $sid = Get-MockUserSid $Credential.UserName
    $exe = $Script:Ps51
    $base = [DateTime]::UtcNow
    $Script:MockLaunched = $true
    $runnerPid = [int]$Script:Fake.nextPid; $childPid = $runnerPid + 1; $Script:Fake.nextPid = $runnerPid + 2; Save-MockState
    $rStart = $base.AddMilliseconds(10); $cStart = $base.AddMilliseconds(50)
    $alive = [bool](Get-MockKnob 'procsStayAlive' $false)
    # 자식 명령줄: 실행기가 ProcessStartInfo.Arguments 로 만드는 것과 같은 모양(공백·따옴표가 있는 인자만 따옴표로 감싼다).
    $cmd = '"' + [string]$req.exe + '" ' + ((@($req.args) | ForEach-Object { if (([string]$_) -match '[\s"]') { '"' + ([string]$_).Replace('"', '\"') + '"' } else { [string]$_ } }) -join ' ')
    $Script:MockProcs[$runnerPid] = @{ role = 'parent'; processId = $runnerPid; parentProcessId = 1234; exePath = $exe; startUtc = $rStart.ToString('o'); ownerSid = $sid; alive = $alive; commandLine = 'runner' }
    $Script:MockProcs[$childPid] = @{ role = 'child'; processId = $childPid; parentProcessId = $runnerPid; exePath = [string]$req.exe; startUtc = $cStart.ToString('o'); ownerSid = $sid; alive = $alive; commandLine = $cmd }
    $knob = Get-MockKnob 'runner'
    function RK([string]$n, $d = $null) { if ($knob) { $x = $knob.PSObject.Properties[$n]; if ($x) { return $x.Value } }; $d }
    $so = [Text.Encoding]::UTF8.GetBytes([string](RK 'stdout' "0.0.0`r`n")); $se = [Text.Encoding]::UTF8.GetBytes([string](RK 'stderr' ''))
    $res = [ordered]@{
        schema = 2; runToken = [string]$req.runToken; mode = [string]$req.mode; startedUtc = $base.ToString('o'); finishedUtc = $base.AddMilliseconds(150).ToString('o')
        runner = [ordered]@{ pid = $runnerPid; sid = $sid; exe = $exe; envNames = @('PATH', 'SYSTEMROOT') }
        request = [ordered]@{ exe = [string]$req.exe; args = @($req.args) }; refused = $null; error = $null
        child = [ordered]@{ started = $true; pid = $childPid; startUtc = $cStart.ToString('o'); exitCode = [int](RK 'exitCode' 0); hasExited = $true; killed = $false; timedOut = $false; outputLimitExceeded = $false; spawnError = $null; mainModule = [string]$req.exe }
        durationMsObserved = 80; durationMsOs = 78
        stdout = [ordered]@{ b64 = [Convert]::ToBase64String($so); bytesKept = $so.Length; bytesRead = $so.Length; limit = 4096; overflow = $false; readFailed = $false }
        stderr = [ordered]@{ b64 = [Convert]::ToBase64String($se); bytesKept = $se.Length; bytesRead = $se.Length; limit = 16384; overflow = $false; readFailed = $false }
        streamsClosed = $true
        descendantsSeen = @(); descendantsLeftoverKilled = @(); descendantsAliveAfterCleanup = 0; descendantTrackingOk = $true
        childState = [string](RK 'childState' 'EXITED')
    }
    foreach ($s in @(RK 'set' @())) { Set-MockPath -Root $res -Path ([string]$s.path) -Value $s.value }
    foreach ($u in @(RK 'unset' @())) { Set-MockPath -Root $res -Path ([string]$u) -Remove }
    if (-not [bool](RK 'noResult' $false)) { Write-MockJson ([string]$req.resultFile) $res }
    [pscustomobject]@{ Id = $runnerPid; HasExited = $true; ExitCode = 0 }
}
function Get-ProcessRecord {
    param([Parameter(Mandatory)][int]$ProcessId, [Parameter(Mandatory)][string]$Role)
    if (-not $Script:MockProcs.ContainsKey($ProcessId)) { return $null }
    $p = $Script:MockProcs[$ProcessId]
    if ($Role -eq 'cleanup' -and -not $p.alive) { return $null }
    $probe = $Script:MockScenario.PSObject.Properties['probe']
    if ($probe) { $m = $probe.Value.PSObject.Properties['cimMissing']; if ($m -and @($m.Value) -contains $p.role -and $Role -ne 'cleanup') { return $null } }
    [ordered]@{ role = $Role; processId = $ProcessId; parentProcessId = [int]$p.parentProcessId; exePath = [string]$p.exePath; startUtc = [string]$p.startUtc; endUtc = $null; ownerSid = [string]$p.ownerSid; snapshotUtc = [DateTime]::UtcNow.ToString('o') }
}
function Stop-Process { [CmdletBinding()] param([int]$Id, [switch]$Force) Write-MockLog "Stop-Process $Id"; if ($Script:MockProcs.ContainsKey($Id)) { $Script:MockProcs[$Id].alive = $false } }
function Get-Process {
    [CmdletBinding()] param([switch]$IncludeUserName, [int[]]$Id)
    foreach ($k in @($Script:MockProcs.Keys)) {
        if ($Id -and @($Id) -notcontains [int]$k) { continue }
        $p = $Script:MockProcs[$k]
        if ($p.alive) { $u = @($Script:Fake.users.Keys | Where-Object { $Script:Fake.users[$_].Sid -eq $p.ownerSid }) | Select-Object -First 1; [pscustomobject]@{ ProcessName = 'powershell'; Id = [int]$k; UserName = ('MOCK-PC\' + $u) } }
    }
}
function Get-CimInstance {
    [CmdletBinding()] param([string]$ClassName, [string]$Filter, [string[]]$Property)
    if ($ClassName -eq 'Win32_UserProfile') { return $null }
    if ($ClassName -eq 'Win32_Process') {
        # 버전 관측 흐름이 관리자 쪽에서 읽는 프로세스 표(모의 프로세스만). 시작 시각은 지역 시간으로 돌려준다(진짜 CIM 처럼).
        foreach ($k in @($Script:MockProcs.Keys)) {
            $p = $Script:MockProcs[$k]
            $cl = $null; if ($p.ContainsKey('commandLine')) { $cl = [string]$p.commandLine }
            [pscustomobject]@{ ProcessId = [int]$k; ParentProcessId = [int]$p.parentProcessId; ExecutablePath = [string]$p.exePath; CommandLine = $cl; CreationDate = ([DateTime]::Parse([string]$p.startUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)).ToLocalTime() }
        }
        return
    }
    throw "MOCK GUARD: 대체하지 않은 CIM 조회: $ClassName"
}
function Invoke-CimMethod {
    [CmdletBinding()] param($InputObject, [string]$MethodName)
    if ($MethodName -ne 'GetOwnerSid') { throw "MOCK GUARD: 대체하지 않은 CIM 메서드: $MethodName" }
    $k = [int]$InputObject.ProcessId
    if (-not $Script:MockProcs.ContainsKey($k)) { return [pscustomobject]@{ ReturnValue = 2; Sid = $null } }
    [pscustomobject]@{ ReturnValue = 0; Sid = [string]$Script:MockProcs[$k].ownerSid }
}
function Remove-CimInstance { [CmdletBinding()] param($InputObject) throw 'MOCK GUARD: Remove-CimInstance 는 이 시나리오에서 호출되면 안 된다' }

# ── 파일 삭제·복사: 샌드박스 안에서만 진짜로 수행 ────────────────────────────
function Remove-Item {
    [CmdletBinding()] param([string]$LiteralPath, [switch]$Recurse, [switch]$Force)
    $full = [IO.Path]::GetFullPath($LiteralPath)
    if (-not $full.StartsWith($Script:MockSandbox + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "MOCK GUARD: 샌드박스 밖 삭제 시도: $full" }
    Write-MockLog "Remove-Item $full"
    Microsoft.PowerShell.Management\Remove-Item -LiteralPath $LiteralPath -Recurse:$Recurse -Force:$Force
}
function New-Item {
    [CmdletBinding()] param([string]$ItemType, [Parameter(Position = 0)][string]$Path, [switch]$Force)
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($Script:MockSandbox + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "MOCK GUARD: 샌드박스 밖 폴더 만들기 시도: $full" }
    Write-MockLog "New-Item $full"
    Microsoft.PowerShell.Management\New-Item -ItemType $ItemType -Path $Path -Force:$Force
}
function Copy-Item {
    [CmdletBinding()] param([string]$LiteralPath, [string]$Destination, [switch]$Force)
    $full = [IO.Path]::GetFullPath($Destination)
    if (-not $full.StartsWith($Script:MockSandbox + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "MOCK GUARD: 샌드박스 밖 복사 시도: $full" }
    Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
}

# ── 대체하지 않은 시스템 변경 명령은 막는다 ──────────────────────────────────
foreach ($n in 'Set-NetFirewallProfile', 'Set-NetFirewallSetting', 'Set-LocalUser', 'Remove-LocalGroupMember', 'Set-ItemProperty', 'New-ItemProperty', 'Remove-ItemProperty', 'Set-Service', 'Stop-Service', 'Start-Service', 'Register-ScheduledTask', 'Unregister-ScheduledTask', 'Enable-NetFirewallRule', 'Disable-NetFirewallRule') {
    Set-Item -Path ("function:$n") -Value ([scriptblock]::Create("throw 'MOCK GUARD: $n 는 호출되면 안 된다'"))
}

# ── Security 로그·NT 경로 ────────────────────────────────────────────────────
function Get-SecurityLogState {
    $r = [ordered]@{ ok = $true; error = $null; lastRecordId = 1000; oldestRecordNumber = 10; recordCount = 990; maxSizeBytes = 20971520; logMode = 'Circular'; isEnabled = $true }
    if ($Script:MockLaunched) {
        $a = $Script:MockScenario.PSObject.Properties['securityAfter']
        if ($a) {
            $v = $a.Value
            if ($v.PSObject.Properties['readFail'] -and $v.readFail) { $r.ok = $false; $r.error = 'mock: Security 로그를 읽을 수 없다'; $r.lastRecordId = $null; $r.oldestRecordNumber = $null }
            elseif ($v.PSObject.Properties['oldest']) { $r.oldestRecordNumber = [long]$v.oldest }
        }
    }
    $r
}
function Get-NtToDosMap { @{ '\device\harddiskvolume3' = $Script:Ps51.Substring(0, 2) } }
function Get-WfpBlockEvents {
    param([Parameter(Mandatory)][long]$AfterRecordId)
    $mode = [string](Get-MockKnob 'events' 'matching')
    if ($mode -eq 'readFail') { return [ordered]@{ ok = $false; error = 'mock: 이벤트를 읽을 수 없다'; events = @() } }
    if ($mode -eq 'empty') { return [ordered]@{ ok = $true; error = $null; events = @() } }
    $childPid = $null; $childStart = $null
    foreach ($k in $Script:MockProcs.Keys) { if ($Script:MockProcs[$k].role -eq 'child') { $childPid = [int]$k; $childStart = [DateTime]::Parse($Script:MockProcs[$k].startUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind) } }
    if ($null -eq $childPid) { return [ordered]@{ ok = $true; error = $null; events = @() } }
    $nt = '\Device\HarddiskVolume3' + $Script:Ps51.Substring(2)
    $pidForEvent = $childPid; if ($mode -eq 'unrelated') { $pidForEvent = 9999 }
    $ev = @{ recordId = [long]1001; timeUtc = $childStart.AddMilliseconds(40); processId = $pidForEvent; processIdRaw = "$pidForEvent"; processIdFormat = 'decimal'; application = $nt; direction = 'Outbound'; destAddress = '192.0.2.1'; destPort = '9'; sourceAddress = '10.0.0.2'; protocol = '6'; filterRtid = '1' }
    [ordered]@{ ok = $true; error = $null; events = @($ev) }
}
