<#
.SYNOPSIS
  전용 비관리자 계정, 그 계정에만 걸리는 아웃바운드 차단 규칙, (선택) 경로 읽기·실행 권한을 만든다.
.DESCRIPTION
  기본은 계획만 출력한다(dry-run). 실제로 만들려면 -Apply 와 사전 점검의 -ConfirmSnapshot 이 모두 필요하다.
  만드는 것(모두 RunId 로 만든 고유 이름, 설명에 표식 bosang-semgrep-iso:<RunId>):
    1) 로컬 계정 bsi<8hex>  — Users 그룹만. 무작위 암호는 이 폴더의 credential.dpapi 에 현재 사용자 DPAPI 로만 보관. 만든 직후 비활성화한다.
    2) 작업 폴더 %ProgramData%\bosang-semgrep-iso\<RunId>  — SYSTEM·Administrators 전체, 새 계정 수정 권한(상속 끊음)
    3) (선택 -GrantReadExecute) 지정한 경로에 새 계정 SID 한 건의 읽기·실행 ACE
    4) 방화벽 규칙 bosang-semgrep-iso-<RunId>-out  — 아웃바운드 Block, LocalUser 조건 = 새 계정 SID. 꺼진 채로 만들어 범위를 다시 읽어 확인한 뒤 켠다.
  바꾸지 않는 것: 기존 계정·기존 방화벽 규칙·프로필 기본 정책·감사 정책(감사는 Test-IsolationEffect.ps1 이 실행 시간 동안만 켰다 끈다).
  실패하면 이 실행이 만든 것만 Remove-Isolation.ps1 로 되돌린다.
.EXAMPLE
  .\Initialize-Isolation.ps1 -PreflightDir <RunDir>                              # 계획만 출력
  .\Initialize-Isolation.ps1 -PreflightDir <RunDir> -ConfirmSnapshot <12자리> -Apply -GrantReadExecute <venv>,<Python 폴더>
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PreflightDir,
    [string]$ConfirmSnapshot,
    [switch]$Apply,
    [string[]]$GrantReadExecute = @(),
    [ValidateSet('NonLoopback', 'Any')][string]$RemoteScope = 'NonLoopback'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')

$Script:IsoRunDir = (Resolve-Path -LiteralPath $PreflightDir).Path
$Script:ApplyMode = [bool]$Apply
# powershell.exe -File 로 부르면 배열 인자가 쉼표로 붙은 문자열 하나로 들어온다. 경로에 쉼표를 쓰지 않는다는 전제로 나눈다.
$GrantReadExecute = @($GrantReadExecute | ForEach-Object { $_ -split ',' } | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
$pfFile = Join-Path $Script:IsoRunDir 'preflight.json'
if (-not (Test-Path -LiteralPath $pfFile)) { Write-Host 'preflight.json 이 없다. Invoke-IsolationPreflight.ps1 을 먼저 실행한다.'; exit 30 }
$pf = Read-IsoJson -Path $pfFile
$runId = [string]$pf.runId
$names = Get-IsoNames -RunId $runId
$manifestFile = Join-Path $Script:IsoRunDir 'resources.json'

function Stop-Refused([string]$Msg) { Write-IsoLog -Level 'REFUSED' -Message $Msg; exit 30 }

Write-IsoLog -Level 'INFO' -Message ("모드: {0}  runId={1}" -f $(if ($Apply) { 'APPLY(실제 적용)' } else { 'DRY-RUN(계획만, 아무것도 바꾸지 않음)' }), $runId)

# ── 사전 조건 ────────────────────────────────────────────────────────────────
if ($Apply) {
    if (-not (Test-IsElevated)) { Stop-Refused '관리자 권한이 필요하다.' }
    if (@($pf.applyBlockers).Count -gt 0) { Stop-Refused ('사전 점검의 적용 차단 항목이 남아 있다: ' + (@($pf.applyBlockers) -join ', ')) }
    $hash = Get-FileSha256Hex -Path $pfFile
    if (-not $ConfirmSnapshot -or $ConfirmSnapshot.Length -lt 12 -or -not $hash.StartsWith($ConfirmSnapshot, [StringComparison]::OrdinalIgnoreCase)) {
        Stop-Refused "ConfirmSnapshot 이 preflight.json 의 SHA-256 앞부분과 다르다(검토한 스냅숏이 아니다). 기대 앞 12자리: $($hash.Substring(0, 12))"
    }
    if (Test-Path -LiteralPath $manifestFile) { Stop-Refused 'resources.json 이 이미 있다. 이 RunId 는 한 번만 적용한다. 새 사전 점검을 하거나 Remove-Isolation.ps1 로 정리한다.' }
    # 사전 점검 이후 상태가 바뀌었는지 다시 본다: 이름이 겹치는 자원이 없어야 한다.
    if (Get-NetFirewallRule -Name $names.RuleName -ErrorAction SilentlyContinue) { Stop-Refused "같은 이름의 방화벽 규칙이 이미 있다: $($names.RuleName)" }
    if (Get-LocalUser -Name $names.UserName -ErrorAction SilentlyContinue) { Stop-Refused "같은 이름의 계정이 이미 있다: $($names.UserName)" }
    if (Test-Path -LiteralPath $names.WorkDir) { Stop-Refused "같은 이름의 작업 폴더가 이미 있다: $($names.WorkDir)" }
}
$winDir = [IO.Path]::GetFullPath($env:WINDIR).TrimEnd('\')
foreach ($g in $GrantReadExecute) {
    if (-not (Test-Path -LiteralPath $g)) { Stop-Refused "권한을 줄 경로가 없다: $g" }
    $full = [IO.Path]::GetFullPath($g).TrimEnd('\')
    if ($full.Length -le 3 -or $full.StartsWith($winDir, [StringComparison]::OrdinalIgnoreCase)) { Stop-Refused "드라이브 루트나 Windows 폴더에는 권한을 주지 않는다: $g" }
}

$remote = @('Any')
if ($RemoteScope -eq 'NonLoopback') { $remote = @('0.0.0.0-126.255.255.255', '128.0.0.0-255.255.255.255', '::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') }

Write-IsoLog -Level 'INFO' -Message "만들 이름: 계정=$($names.UserName) 규칙=$($names.RuleName) 작업폴더=$($names.WorkDir)"
Write-IsoLog -Level 'INFO' -Message ("차단 범위(RemoteAddress): {0}  — 루프백(127.0.0.0/8, ::1)은 차단 대상에서 뺀다. 이 범위 문법의 수용 여부와 실제 효과는 적용 뒤 읽기·관측으로 확인한다" -f ($remote -join ', '))

$manifest = New-IsoManifest -RunId $runId
$manifest.status = 'applying'
$manifest.names = $names
Save-IsoManifest

$sid = '<새 계정 SID>'
$sidObj = $null
try {
    # 1) 계정
    $userStep = Add-IsoStep -Kind 'user' -Name $names.UserName -Detail @{ marker = $names.Marker }
    $pw = New-IsoRandomPassword
    $secure = ConvertTo-SecureString -String $pw -AsPlainText -Force
    $pw = $null
    $u = Invoke-Mutation -Description "로컬 계정 만들기(Users 그룹만, 만든 직후 비활성화): $($names.UserName)" -Action {
        $acct = New-LocalUser -Name $names.UserName -Password $secure -Description $names.Marker -PasswordNeverExpires -UserMayNotChangePassword -AccountNeverExpires -ErrorAction Stop
        Add-LocalGroupMember -SID ([Security.Principal.SecurityIdentifier]$Script:SidUsers) -Member $acct.Name -ErrorAction Stop
        Disable-LocalUser -Name $acct.Name -ErrorAction Stop
        $acct
    }
    if ($Apply) {
        $sid = $u.SID.Value
        $sidObj = New-Object Security.Principal.SecurityIdentifier($sid)
        Complete-IsoStep -Step $userStep -Extra @{ sid = $sid; enabled = $false }
        # 암호는 현재 사용자의 DPAPI 로만 보관한다(다른 계정·다른 PC 에서는 풀리지 않는다).
        Invoke-Mutation -Description '전용 계정 암호를 DPAPI 로 보관: credential.dpapi' -Action {
            [IO.File]::WriteAllText((Join-Path $Script:IsoRunDir 'credential.dpapi'), ($secure | ConvertFrom-SecureString))
        } | Out-Null
        Write-IsoLog -Level 'INFO' -Message "계정 SID=$sid"
    }

    # 2) 작업 폴더 + ACL
    $workStep = Add-IsoStep -Kind 'workDir' -Name $names.WorkDir -Detail @{ rootExisted = (Test-Path -LiteralPath (Get-IsoWorkRoot)) }
    Invoke-Mutation -Description "작업 폴더 만들기와 ACL(상속 끊음, SYSTEM·Administrators 전체, 전용 계정 수정): $($names.WorkDir)" -Action {
        [void][IO.Directory]::CreateDirectory((Join-Path $names.WorkDir 'work'))
        [IO.File]::WriteAllText((Join-Path $names.WorkDir '.owner'), $names.Marker)
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($idStr in 'S-1-5-18', 'S-1-5-32-544') {
            $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($idStr)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
        }
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sidObj, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
        Set-Acl -LiteralPath $names.WorkDir -AclObject $acl
    } | Out-Null
    if ($Apply) {
        # 설정한 ACL 을 다시 읽어 확인한다: 상속이 끊겼고, 새 계정 ACE 가 있고, Users·Everyone·Authenticated Users 가 없어야 한다.
        $wacl = Get-Acl -LiteralPath $names.WorkDir
        $sidsOf = @($wacl.Access | ForEach-Object { try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { [string]$_.IdentityReference } })
        $broad = @($sidsOf | Where-Object { $_ -eq $Script:SidUsers -or $_ -eq $Script:SidEveryone -or $_ -eq $Script:SidAuthenticatedUsers })
        if (-not $wacl.AreAccessRulesProtected -or $sidsOf -notcontains $sid -or $broad.Count -gt 0) { throw "작업 폴더 ACL 을 읽어 보니 의도와 다르다(보호=$($wacl.AreAccessRulesProtected), 넓은 그룹=$($broad -join ','))." }
    }
    Complete-IsoStep -Step $workStep

    # 3) 선택: 경로 읽기·실행 권한(새 계정 SID 한 건만 추가, 기존 ACE 는 건드리지 않는다)
    foreach ($g in $GrantReadExecute) {
        $isDir = (Get-Item -LiteralPath $g).PSIsContainer
        $inherit = 'None'; if ($isDir) { $inherit = 'ContainerInherit,ObjectInherit' }
        $gs = Add-IsoStep -Kind 'aclGrant' -Name $g -Detail @{ sid = $sid; rights = 'ReadAndExecute'; inheritance = $inherit }
        Invoke-Mutation -Description "ACL 에 새 계정 SID 의 읽기·실행 한 건 추가: $g ($inherit)" -Action {
            $acl = Get-Acl -LiteralPath $g
            $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sidObj, 'ReadAndExecute', $inherit, 'None', 'Allow')))
            Set-Acl -LiteralPath $g -AclObject $acl
        } | Out-Null
        Complete-IsoStep -Step $gs
    }
    if ($Apply -and $GrantReadExecute.Count -gt 0) {
        # 하위 파일까지 전파됐는지 대표 파일로 확인한다. 안 됐으면 실패로 보고 되돌린다.
        foreach ($g in $GrantReadExecute) {
            if ((Get-Item -LiteralPath $g).PSIsContainer) {
                $probe = Get-ChildItem -LiteralPath $g -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($probe) {
                    $has = @((Get-Acl -LiteralPath $probe.FullName).Access | Where-Object { try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid } catch { $false } }).Count
                    if ($has -lt 1) { throw "ACL 이 하위 파일로 전파되지 않았다: $($probe.FullName)" }
                }
            }
        }
    }

    # 4) 방화벽 규칙: 꺼진 채로 만들고 → 범위(LocalUser)를 다시 읽어 확인 → 켠다.
    $ruleStep = Add-IsoStep -Kind 'firewallRule' -Name $names.RuleName -Detail @{ marker = $names.Marker; remoteAddress = $remote; localUserSddl = "D:(A;;CC;;;$sid)" }
    Invoke-Mutation -Description "방화벽 규칙 만들기(꺼진 상태): Outbound Block, LocalUser=$sid, RemoteAddress=$($remote -join ',')" -Action {
        $p = @{
            Name = $names.RuleName; DisplayName = "bosang semgrep isolation outbound block ($runId)"; Group = $Script:IsoPrefix
            Description = $names.Marker; Direction = 'Outbound'; Action = 'Block'; Profile = 'Any'; Enabled = 'False'
            LocalUser = "D:(A;;CC;;;$sid)"; RemoteAddress = $remote
        }
        New-NetFirewallRule @p -ErrorAction Stop | Out-Null
    } | Out-Null
    if ($Apply) {
        $r = Get-NetFirewallRule -Name $names.RuleName -ErrorAction Stop
        $sf = $r | Get-NetFirewallSecurityFilter
        $af = $r | Get-NetFirewallAddressFilter
        $okScope = ([string]$sf.LocalUser).Contains($sid)
        $okBasic = ($r.Direction -eq 'Outbound' -and $r.Action -eq 'Block' -and $r.Description -eq $names.Marker)
        $ruleStep.detail['readback'] = @{ localUser = [string]$sf.LocalUser; remoteAddress = @($af.RemoteAddress | ForEach-Object { [string]$_ }); enabled = [string]$r.Enabled }
        if (-not ($okScope -and $okBasic)) { throw "규칙을 읽어 보니 계정 범위나 기본 속성이 기대와 다르다(LocalUser=$($sf.LocalUser)). 켜지 않고 되돌린다." }
        $want = @($remote | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object)
        $got = @($af.RemoteAddress | ForEach-Object { ([string]$_).ToLowerInvariant() } | Sort-Object)
        if (($want -join ',') -ne ($got -join ',')) { Write-IsoLog -Level 'WARN' -Message ("RemoteAddress 읽은 값이 요청과 다르다(표기 차이일 수 있음): 요청=" + ($want -join ',') + " 읽음=" + ($got -join ',')); $ruleStep.detail['remoteAddressMismatch'] = $true }
    }
    Invoke-Mutation -Description "방화벽 규칙 켜기: $($names.RuleName)" -Action { Set-NetFirewallRule -Name $names.RuleName -Enabled True -ErrorAction Stop } | Out-Null
    Complete-IsoStep -Step $ruleStep -Extra @{ enabledByRun = $true }

    $manifest.status = 'applied'
    Save-IsoManifest
} catch {
    Write-IsoLog -Level 'FAIL' -Message ('적용 중 실패: ' + $_.Exception.Message)
    if ($Apply) {
        $manifest.status = 'apply-failed'
        Save-IsoManifest
        Write-IsoLog -Level 'INFO' -Message '이 실행이 만든 것만 되돌린다(Remove-Isolation.ps1).'
        & (Join-Path $PSScriptRoot 'Remove-Isolation.ps1') -RunDir $Script:IsoRunDir -Apply
    }
    exit 20
}

Write-Host ''
if ($Apply) {
    Write-Host '적용 완료. 이것은 "만들었다"는 뜻이고, 격리 효과가 확인되었다는 뜻이 아니다. 효과는 Test-IsolationEffect.ps1 -Execute 의 관측으로만 말한다.'
    Write-Host "다음: .\Test-IsolationEffect.ps1 -RunDir `"$($Script:IsoRunDir)`" -Execute"
    Write-Host "되돌리기: .\Remove-Isolation.ps1 -RunDir `"$($Script:IsoRunDir)`" -Apply"
} else {
    Write-Host 'dry-run 이라 아무것도 만들지 않았다. 위 [PLAN] 줄이 -Apply 때 실행될 일이다.'
}
exit 0
