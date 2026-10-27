<#
.SYNOPSIS
  격리 설정 적용 전의 읽기 전용 사전 점검. 현재 설정을 읽어 실행 기록 폴더(RunDir)에 스냅숏으로 보관한다.
.DESCRIPTION
  - 계정·방화벽 규칙·감사 정책·ACL·프로세스를 바꾸지 않는다(이 파일에는 Invoke-Mutation 호출이 없다. Test-IsolationScripts.ps1 이 검사한다).
  - 쓰는 파일은 RunDir 안의 preflight.json, auditpol-backup.csv, log.jsonl 뿐이다. RunDir 는 저장소 밖(기본: %LOCALAPPDATA%\bosang-radar\semgrep-isolation\<RunId>)이다.
  - auditpol /backup 은 감사 정책을 읽어 파일로 쓰는 호출이다(정책을 바꾸지 않는다). 관리자 권한이 필요하다.
  - 판정은 PASS / FAIL / UNKNOWN / INFO / NEEDS_GRANT. 읽지 못한 항목은 UNKNOWN 이고 통과로 세지 않는다.
.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Invoke-IsolationPreflight.ps1
#>
[CmdletBinding()]
param(
    [string]$VenvRoot = (Join-Path $env:LOCALAPPDATA 'bosang-radar\semgrep-dist\1.180.0\venv'),
    [string]$WheelDir = (Join-Path $env:LOCALAPPDATA 'bosang-radar\semgrep-dist\1.180.0\dist'),
    [string]$StateRoot
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
$Script:ApplyMode = $false

if (-not $StateRoot) { $StateRoot = Get-IsoStateRoot }
$runId = New-IsoRunId
$runDir = Join-Path $StateRoot $runId
[void][IO.Directory]::CreateDirectory($runDir)
$Script:IsoRunDir = $runDir
$names = Get-IsoNames -RunId $runId

$checks = New-Object System.Collections.ArrayList
$applyBlockers = New-Object System.Collections.ArrayList
function Add-Check {
    param([string]$Id, [string]$Status, [string]$Title, $Detail, [switch]$BlocksApply)
    [void]$checks.Add([ordered]@{ id = $Id; status = $Status; title = $Title; detail = $Detail })
    if ($BlocksApply -and $Status -ne 'PASS' -and $Status -ne 'INFO') { [void]$applyBlockers.Add($Id) }
    Write-IsoLog -Level $Status -Message ('{0} {1}' -f $Id, $Title)
}

Write-IsoLog -Level 'INFO' -Message "사전 점검 시작 runId=$runId (읽기 전용)"

# P01 권한
$elevated = Test-IsElevated
$st = 'FAIL'; if ($elevated) { $st = 'PASS' }
Add-Check 'P01' $st '관리자 권한으로 실행 중인가(auditpol /backup·보안 로그 읽기·이후 적용에 필요)' @{ elevated = $elevated; user = [Security.Principal.WindowsIdentity]::GetCurrent().Name } -BlocksApply

# P02 운영체제·에디션(읽기)
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$os = [ordered]@{ editionId = $cv.EditionID; productName = $cv.ProductName; build = ('{0}.{1}' -f $cv.CurrentBuildNumber, $cv.UBR); displayVersion = $cv.DisplayVersion; arch = $env:PROCESSOR_ARCHITECTURE }
Add-Check 'P02' 'INFO' '운영체제·에디션(EditionID Core = Home)' $os

# P03 PowerShell
$ps51 = Test-Path -LiteralPath $Script:Ps51
$st = 'FAIL'; if ($ps51) { $st = 'PASS' }
Add-Check 'P03' $st 'Windows PowerShell 5.1(powershell.exe)이 있는가. 프로브·전용 계정 실행에 쓴다' @{ path = $Script:Ps51; thisHost = $PSVersionTable.PSVersion.ToString() } -BlocksApply

# P04 필요한 명령 존재(쓰기 동작은 실행하지 않았다)
$cmds = 'New-NetFirewallRule', 'Remove-NetFirewallRule', 'Get-NetFirewallProfile', 'Get-NetFirewallSecurityFilter', 'New-LocalUser', 'Remove-LocalUser', 'Add-LocalGroupMember', 'Get-WinEvent', 'Get-CimInstance'
$have = @{}; foreach ($c in $cmds) { $have[$c] = [bool](Get-Command $c -ErrorAction SilentlyContinue) }
$havePol = Test-Path -LiteralPath (Join-Path $env:WINDIR 'System32\auditpol.exe')
$have['auditpol.exe'] = $havePol
$missing = @($have.Keys | Where-Object { -not $have[$_] })
$st = 'PASS'; if ($missing.Count -gt 0) { $st = 'FAIL' }
Add-Check 'P04' $st '필요한 명령이 이 에디션에 있는가(존재만 확인, 쓰기 동작은 실행하지 않았다)' @{ present = $have; missing = $missing } -BlocksApply

# P05 감사 정책 읽기(숫자)
$audit = Get-AuditSettings -BackupPath (Join-Path $runDir 'auditpol-backup.csv')
$auditNow = @{}
if ($audit.Ok) {
    foreach ($k in $Script:AuditGuid.Keys) {
        $g = $Script:AuditGuid[$k]
        $v = $null; if ($audit.Values.ContainsKey($g)) { $v = $audit.Values[$g] }
        $flags = $null; if ($null -ne $v) { $flags = ConvertTo-AuditFlags -Value $v }
        $auditNow[$k] = @{ guid = $g; value = $v; supported = ($null -ne $flags -and $flags.Supported); success = ($null -ne $flags -and $flags.Success); failure = ($null -ne $flags -and $flags.Failure) }
    }
    $bad = @($auditNow.Keys | Where-Object { -not $auditNow[$_].supported })
    $st = 'PASS'; if ($bad.Count -gt 0) { $st = 'FAIL' }
    Add-Check 'P05' $st '감사 하위 범주의 현재 값을 숫자로 읽었는가(0 없음, 1 성공, 2 실패, 3 둘 다; 그 밖의 값은 지원하지 않음)' @{ values = $auditNow; unsupported = $bad; backupFile = 'auditpol-backup.csv' } -BlocksApply
} else {
    Add-Check 'P05' 'UNKNOWN' '감사 정책을 읽지 못했다(관리자 권한 필요). 원래 값을 모르면 적용하지 않는다' @{ error = $audit.Error } -BlocksApply
}

# P06 감사 설정이 덮이는지(참고)
$legacy = $null
try { $legacy = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' -Name SCENoApplyLegacyAuditPolicy -ErrorAction Stop).SCENoApplyLegacyAuditPolicy } catch { $legacy = $null }
Add-Check 'P06' 'INFO' '"하위 범주 감사 설정으로 범주 설정을 덮어쓰기" 값(없음=설정 안 됨). 적용 뒤 값 읽기와 실제 이벤트 관측으로 효과를 확인한다' @{ SCENoApplyLegacyAuditPolicy = $legacy }

# P07 방화벽 서비스
$svc = @{}
foreach ($n in 'BFE', 'mpssvc') { $s = Get-Service -Name $n -ErrorAction SilentlyContinue; if ($s) { $svc[$n] = [string]$s.Status } else { $svc[$n] = 'missing' } }
$st = 'PASS'; if ($svc['BFE'] -ne 'Running' -or $svc['mpssvc'] -ne 'Running') { $st = 'FAIL' }
Add-Check 'P07' $st '기본 필터링 엔진(BFE)·Windows Defender 방화벽 서비스(mpssvc)가 실행 중인가' $svc -BlocksApply

# P08 방화벽 프로필
$profiles = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ name = [string]$_.Name; enabled = [string]$_.Enabled; defaultInbound = [string]$_.DefaultInboundAction; defaultOutbound = [string]$_.DefaultOutboundAction; logBlocked = [string]$_.LogBlocked; logAllowed = [string]$_.LogAllowed } })
$off = @($profiles | Where-Object { $_.enabled -ne 'True' } | ForEach-Object { $_.name })
$st = 'PASS'; if ($off.Count -gt 0) { $st = 'FAIL' }
Add-Check 'P08' $st '세 프로필이 모두 켜져 있는가(꺼진 프로필에서는 규칙이 적용되지 않는다). 이 스크립트들은 기본 정책·프로필 설정을 바꾸지 않는다' @{ profiles = $profiles; disabled = $off } -BlocksApply

# P09 기존 규칙 보관(이름·활성·방향·동작) + 사용자 범위 규칙 수 + 우리 접두 자원
$allRules = @(Get-NetFirewallRule)
$ruleList = @($allRules | ForEach-Object { [ordered]@{ name = $_.Name; displayName = $_.DisplayName; enabled = [string]$_.Enabled; direction = [string]$_.Direction; action = [string]$_.Action; profile = [string]$_.Profile; group = $_.Group } })
$localUserRules = $null
try { $localUserRules = @($allRules | Get-NetFirewallSecurityFilter | Where-Object { $_.LocalUser -and $_.LocalUser -ne 'Any' }).Count } catch { $localUserRules = $null }
$oursRules = @($allRules | Where-Object { $_.Group -eq $Script:IsoPrefix -or $_.Name -like ($Script:IsoPrefix + '*') } | ForEach-Object { $_.Name })
$users = @(Get-LocalUser | ForEach-Object { [ordered]@{ name = $_.Name; enabled = $_.Enabled; sid = $_.SID.Value; description = $_.Description } })
$oursUsers = @($users | Where-Object { $_.name -like 'bsi*' -and $_.description -like ($Script:IsoPrefix + ':*') } | ForEach-Object { $_.name })
$oursDirs = @(); $wr = Get-IsoWorkRoot
if (Test-Path -LiteralPath $wr) { $oursDirs = @(Get-ChildItem -LiteralPath $wr -Directory | ForEach-Object { $_.Name }) }
$existing = @($oursRules) + @($oursUsers) + @($oursDirs)
$st = 'PASS'; if ($existing.Count -gt 0) { $st = 'FAIL' }
Add-Check 'P09' $st '이전 실행이 남긴 자원(접두 bosang-semgrep-iso·bsi*·작업 폴더)이 없는가. 있으면 Remove-Isolation.ps1 -Discover 로 먼저 정리한다' @{ rules = $oursRules; users = $oursUsers; workDirs = $oursDirs } -BlocksApply
Add-Check 'P10' 'INFO' '기존 방화벽 규칙·로컬 계정을 보관했다(이 스크립트들은 이것들을 바꾸지 않는다)' @{ ruleCount = $ruleList.Count; localUserScopedRuleCount = $localUserRules; localUsers = $users }

# P11 Security 로그
$sl = Get-SecurityLogState
$st = 'PASS'; if (-not $sl.ok) { $st = 'UNKNOWN' } elseif (-not $sl.isEnabled) { $st = 'FAIL' }
Add-Check 'P11' $st 'Security 로그를 읽을 수 있고 켜져 있는가. 순환(Circular) 로그라 오래된 기록이 밀려날 수 있어 실행 직전 기준점을 따로 기록한다' $sl -BlocksApply

# P12 전용 계정이 쓸 경로 접근(ACL 기준 예상). 계정 생성 전이므로 Users·Authenticated Users·Everyone 으로 계산한다
$sids = @($Script:SidUsers, $Script:SidAuthenticatedUsers, $Script:SidEveryone)
$cfgPath = Join-Path $VenvRoot 'pyvenv.cfg'
$baseHome = $null
if (Test-Path -LiteralPath $cfgPath) {
    foreach ($l in [IO.File]::ReadAllLines($cfgPath)) { if ($l -match '^\s*home\s*=\s*(.+?)\s*$') { $baseHome = $Matches[1] } }
}
$paths = New-Object System.Collections.ArrayList
foreach ($p in @($VenvRoot, (Join-Path $VenvRoot 'Scripts\python.exe'), (Join-Path $VenvRoot 'Lib\site-packages\semgrep\bin\semgrep-core.exe'), $baseHome, $(if ($baseHome) { Join-Path $baseHome 'python.exe' }), $WheelDir)) {
    if ($p) { [void]$paths.Add($p) }
}
$access = @($paths | ForEach-Object { Test-SidsReadExecute -Path $_ -Sids $sids })
$blocked = @($access | Where-Object { -not $_.canReadExecute } | ForEach-Object { $_.path })
$recommend = @($VenvRoot); if ($baseHome) { $recommend += $baseHome }
$st = 'PASS'; if ($blocked.Count -gt 0) { $st = 'NEEDS_GRANT' }
Add-Check 'P12' $st '일반 사용자 그룹이 가상환경·기반 인터프리터·휠 폴더를 읽고 실행할 수 있는가(ACL 기준 예상). NEEDS_GRANT 면 적용 때 -GrantReadExecute 로 새 계정 SID 한 건만 추가한다. 실제 실행 가능 여부는 검증 스크립트가 전용 계정으로 확인한다' @{ venvRoot = $VenvRoot; baseInterpreterHome = $baseHome; checkedSids = $sids; paths = $access; notReadable = $blocked; recommendedGrantPaths = $recommend; note = '프로필 폴더(C:\Users\<이름>) 아래 설치는 기본 ACL 에 Users 가 없어 막힌다. 해석할 수 없는 SID 의 ACE 는 우리 것이 아니므로 건드리지 않는다.' }

# P13 네트워크 주소(선택 프로브용 참고)
$ips = @()
try { $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress }) } catch { $ips = @() }
Add-Check 'P13' 'INFO' '비루프백 IPv4 주소(선택 프로브 -IncludeSelfAddressProbe 참고용)' @{ addresses = $ips }

# P14 도메인·정책 관리 여부(참고) 와 Sandbox 기능
$cs = Get-CimInstance -ClassName Win32_ComputerSystem
$sandbox = 'unreadable'
try { $f = Get-WindowsOptionalFeature -Online -ErrorAction Stop | Where-Object { $_.FeatureName -like '*DisposableClient*' }; if ($f) { $sandbox = [string]$f.State } else { $sandbox = 'feature-not-listed' } } catch { $sandbox = 'unreadable: ' + $_.Exception.Message }
Add-Check 'P14' 'INFO' '도메인 가입 여부와 Windows Sandbox 기능 상태(그룹 정책이 규칙을 덮을 수 있는지의 참고)' @{ partOfDomain = $cs.PartOfDomain; sandboxFeature = $sandbox }

# P15 Secondary Logon 서비스: Start-Process -Credential 이 쓴다. 꺼져 있으면 검증 스크립트가 전용 계정으로 프로세스를 띄우지 못한다(적용 자체는 막지 않는다)
$seclogon = Get-Service -Name seclogon -ErrorAction SilentlyContinue
$slInfo = @{ present = [bool]$seclogon; status = $null; startType = $null }
if ($seclogon) { $slInfo.status = [string]$seclogon.Status; $slInfo.startType = [string]$seclogon.StartType }
$st = 'PASS'; if (-not $seclogon -or $slInfo.startType -eq 'Disabled') { $st = 'FAIL' }
Add-Check 'P15' $st 'Secondary Logon(seclogon) 서비스가 사용 가능한가(검증 스크립트가 전용 계정으로 프로세스를 띄울 때 필요. 시작 유형 Manual 이면 요청 때 시작된다)' $slInfo

$summary = [ordered]@{
    schema = 1; runId = $runId; createdUtc = [DateTime]::UtcNow.ToString('o'); computer = $env:COMPUTERNAME
    plannedNames = $names
    applyBlockers = @($applyBlockers)
    checks = $checks
    snapshot = [ordered]@{ firewallProfiles = $profiles; firewallRules = $ruleList; auditOriginal = $auditNow; securityLog = $sl }
    readOnlyAssertion = '이 스크립트는 계정·방화벽 규칙·감사 정책·ACL·프로세스를 바꾸지 않았다. 쓴 파일은 RunDir 안의 기록뿐이다.'
}
$file = Join-Path $runDir 'preflight.json'
Write-IsoJson -Path $file -Object $summary -Depth 12
$hash = Get-FileSha256Hex -Path $file

Write-Host ''
Write-Host "RunDir          : $runDir"
Write-Host "preflight.json  : $file"
Write-Host "SHA-256         : $hash"
Write-Host "ConfirmSnapshot : $($hash.Substring(0, 12))   (Initialize-Isolation.ps1 -Apply 에 그대로 넘긴다)"
if ($applyBlockers.Count -gt 0) {
    Write-Host ('적용 차단 항목: ' + (@($applyBlockers) -join ', ')) -ForegroundColor Yellow
    exit 10
}
Write-Host '적용 차단 항목 없음. 이것은 적용해도 된다는 허가가 아니라 사전 조건 점검 결과다.'
exit 0
