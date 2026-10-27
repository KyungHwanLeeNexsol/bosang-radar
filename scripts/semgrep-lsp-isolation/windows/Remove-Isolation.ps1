<#
.SYNOPSIS
  Initialize-Isolation.ps1 / Test-IsolationEffect.ps1 이 만든 것만 되돌린다. 정상 종료·실패·중단 어느 경우에도 쓴다.
.DESCRIPTION
  기본은 dry-run(지울 것을 출력만 한다). 실제로 지우려면 -Apply.
  복구 대상 = 실행 기록(resources.json)에 적힌 자원, 또는 -RunId 로 이름이 정해지는 자원. 지우기 전에 각각 소유 확인을 한다:
    - 방화벽 규칙: 이름 + Group + 설명 표식(bosang-semgrep-iso:<RunId>)이 모두 맞아야 한다.
    - 계정: 이름 + 설명 표식 + (기록돼 있으면) SID 가 맞아야 한다.
    - 작업 폴더: %ProgramData%\bosang-semgrep-iso 아래이고 .owner 파일 내용이 표식과 같아야 한다.
    - ACL: 기록된 계정 SID 의 ACE 만 제거한다(다른 ACE 는 그대로).
    - 감사 정책: 우리가 설정한 값(set)일 때만 원래 값(original)으로 되돌린다. 그 사이에 다른 값이 되었으면 건드리지 않고 DRIFT 로 보고한다.
  하나라도 소유 확인에 실패하면 그 자원은 건드리지 않고 REFUSED_NOT_OURS 로 남긴다. 지울 것이 이미 없으면 SKIPPED_ABSENT.
  순서: 계정 사용 중지·남은 프로세스 종료 → 감사 → 방화벽 규칙 → ACL → 계정(+선택 프로필) → 작업 폴더 → 암호 파일.
.EXAMPLE
  .\Remove-Isolation.ps1 -Discover                         # 이름 접두로 남은 것 찾기(지우지 않음)
  .\Remove-Isolation.ps1 -RunDir <RunDir>                  # dry-run
  .\Remove-Isolation.ps1 -RunDir <RunDir> -Apply [-RemoveProfile]
  .\Remove-Isolation.ps1 -RunId <RunId> -Apply             # 실행 기록 없이 이름으로만(감사 원래 값은 모르므로 복구하지 못한다)
#>
[CmdletBinding()]
param(
    [string]$RunDir,
    [string]$RunId,
    [switch]$Apply,
    [switch]$RemoveProfile,
    [switch]$Discover
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
$Script:ApplyMode = [bool]$Apply

if ($Discover) {
    $rules = @(Get-NetFirewallRule | Where-Object { $_.Group -eq $Script:IsoPrefix -or $_.Name -like ($Script:IsoPrefix + '*') } | ForEach-Object { [ordered]@{ name = $_.Name; enabled = [string]$_.Enabled; description = $_.Description } })
    $users = @(Get-LocalUser | Where-Object { $_.Name -like 'bsi*' } | ForEach-Object { [ordered]@{ name = $_.Name; enabled = $_.Enabled; sid = $_.SID.Value; description = $_.Description } })
    $wr = Get-IsoWorkRoot
    $dirs = @(); if (Test-Path -LiteralPath $wr) { $dirs = @(Get-ChildItem -LiteralPath $wr -Directory | ForEach-Object { $_.FullName }) }
    $runs = @()
    $sr = Get-IsoStateRoot
    if (Test-Path -LiteralPath $sr) {
        $runs = @(Get-ChildItem -LiteralPath $sr -Directory | ForEach-Object {
                $st = 'no-manifest'; $mf = Join-Path $_.FullName 'resources.json'
                if (Test-Path -LiteralPath $mf) { try { $st = [string](Read-IsoJson -Path $mf).status } catch { $st = 'unreadable' } }
                [ordered]@{ runDir = $_.FullName; status = $st }
            })
    }
    $out = [ordered]@{ firewallRules = $rules; localUsers = $users; workDirs = $dirs; runDirs = $runs }
    $out | ConvertTo-Json -Depth 6
    Write-Host '찾기만 했고 아무것도 지우지 않았다. 정리하려면 -RunDir 또는 -RunId 와 함께 -Apply 로 실행한다.'
    exit 0
}

if (-not $RunDir -and -not $RunId) { Write-Host '-RunDir 또는 -RunId 가 필요하다(-Discover 로 먼저 찾을 수 있다).'; exit 30 }
if ($RunDir) {
    if (-not (Test-Path -LiteralPath $RunDir)) { Write-Host "RunDir 가 없다: $RunDir"; exit 30 }
    $Script:IsoRunDir = (Resolve-Path -LiteralPath $RunDir).Path
    if (-not $RunId) { $RunId = Split-Path $Script:IsoRunDir -Leaf }
}
if ($Apply -and -not (Test-IsElevated)) { Write-Host '관리자 권한이 필요하다.'; exit 30 }
$names = Get-IsoNames -RunId $RunId
$manifestFile = $null; if ($Script:IsoRunDir) { $manifestFile = Join-Path $Script:IsoRunDir 'resources.json' }

$steps = @()
if ($manifestFile -and (Test-Path -LiteralPath $manifestFile)) {
    $m = Import-IsoManifest -Path $manifestFile
    $steps = @($m.steps)
    Write-IsoLog -Level 'INFO' -Message "실행 기록을 읽었다: status=$($m.status) 단계 $($steps.Count)개"
} else {
    # 실행 기록이 없다(적용 도중 중단 등). 이름으로 정해지는 자원만 찾는다.
    $m = New-IsoManifest -RunId $RunId
    Write-IsoLog -Level 'WARN' -Message '실행 기록(resources.json)이 없다. 이름으로 정해지는 자원만 복구하고, 감사 정책·ACL 은 기록이 없어 복구하지 못한다.'
    $steps = @(
        [ordered]@{ kind = 'user'; name = $names.UserName; state = 'intent'; detail = [ordered]@{ marker = $names.Marker } },
        [ordered]@{ kind = 'workDir'; name = $names.WorkDir; state = 'intent'; detail = [ordered]@{ rootExisted = $true } },
        [ordered]@{ kind = 'firewallRule'; name = $names.RuleName; state = 'intent'; detail = [ordered]@{ marker = $names.Marker } }
    )
}
if ($Script:IsoRunDir) { $m.status = 'recovering' }

Write-IsoLog -Level 'INFO' -Message ("모드: {0}  runId={1}" -f $(if ($Apply) { 'APPLY(실제 복구)' } else { 'DRY-RUN(지울 것만 출력)' }), $RunId)

$results = New-Object System.Collections.ArrayList
function Add-Result {
    param([string]$Step, [string]$Result, [string]$Note)
    [void]$results.Add([ordered]@{ step = $Step; result = $Result; note = $Note })
    Write-IsoLog -Level $Result -Message ('{0} : {1}' -f $Step, $Note)
}
function Get-StepsOf([string]$Kind) { @($steps | Where-Object { $_.kind -eq $Kind }) }

# 계정 정보(소유 확인에 쓴다)
$userStep = $null; foreach ($s in (Get-StepsOf 'user')) { $userStep = $s }
$recordedSid = $null
if ($userStep -and $userStep.detail.Contains('sid')) { $recordedSid = [string]$userStep.detail['sid'] }
$acct = Get-LocalUser -Name $names.UserName -ErrorAction SilentlyContinue
$acctOurs = $false
if ($acct) {
    $acctOurs = ($acct.Description -eq $names.Marker)
    if ($recordedSid -and $acct.SID.Value -ne $recordedSid) { $acctOurs = $false }
}
if (-not $recordedSid -and $acct -and $acctOurs) { $recordedSid = $acct.SID.Value }

# 0) 계정 사용 중지 + 이 계정이 남긴 프로세스 종료
if ($acct -and $acctOurs) {
    if ($acct.Enabled) { Invoke-Mutation -Description "계정 사용 중지: $($names.UserName)" -Action { Disable-LocalUser -Name $names.UserName -ErrorAction Stop } | Out-Null; Add-Result 'account-disable' $(if ($Apply) { 'OK' } else { 'DRYRUN' }) $names.UserName }
    $procs = @()
    try { $procs = @(Get-Process -IncludeUserName -ErrorAction Stop | Where-Object { $_.UserName -like ('*\' + $names.UserName) }) } catch { Add-Result 'process-scan' 'FAILED' $_.Exception.Message }
    foreach ($p in $procs) {
        Invoke-Mutation -Description "이 계정의 프로세스 종료: $($p.ProcessName) pid=$($p.Id)" -Action { Stop-Process -Id $p.Id -Force -ErrorAction Stop } | Out-Null
        Add-Result 'process-stop' $(if ($Apply) { 'OK' } else { 'DRYRUN' }) ("{0} pid={1}" -f $p.ProcessName, $p.Id)
    }
} elseif ($acct) {
    Add-Result 'account' 'REFUSED_NOT_OURS' "같은 이름의 계정이 있지만 설명 표식이나 SID 가 다르다: $($names.UserName)"
} else {
    Add-Result "user $($names.UserName)" 'SKIPPED_ABSENT' '계정이 없다'
}

# 1) 감사 정책
foreach ($s in (Get-StepsOf 'auditSetting')) {
    if ($s.state -in @('unchanged', 'restored')) { Add-Result "audit $($s.name)" 'SKIPPED_ABSENT' "이미 $($s.state)"; continue }
    if (-not $s.detail['changed']) { Add-Result "audit $($s.name)" 'SKIPPED_ABSENT' '바꾼 적이 없다'; continue }
    $cur = Get-AuditSettings -BackupPath (Join-Path $Script:IsoRunDir ('auditpol-recover-{0}.csv' -f [DateTime]::UtcNow.ToString('HHmmssfff')))
    $now = $null; if ($cur.Ok -and $cur.Values.ContainsKey([string]$s.name)) { $now = [int]$cur.Values[[string]$s.name] }
    if ($null -eq $now) { Add-Result "audit $($s.name)" 'FAILED' ('현재 감사 값을 읽지 못했다. 원래 값은 ' + $s.detail['original']); continue }
    if ($now -eq [int]$s.detail['original']) { $s.state = 'unchanged'; Add-Result "audit $($s.name)" 'SKIPPED_ABSENT' "이미 원래 값($now)이다"; continue }
    if ($now -ne [int]$s.detail['set']) { Add-Result "audit $($s.name)" 'DRIFT_NOT_RESTORED' "현재 $now 는 우리가 설정한 값($($s.detail['set']))도 원래 값($($s.detail['original']))도 아니다. 건드리지 않았다"; continue }
    try {
        Close-IsoAuditWindow -Step $s
        Add-Result "audit $($s.name)" $(if ($Apply) { 'OK' } else { 'DRYRUN' }) "원래 값 $($s.detail['original']) 으로 복구"
    } catch { Add-Result "audit $($s.name)" 'FAILED' $_.Exception.Message }
}

# 2) 방화벽 규칙
foreach ($s in (Get-StepsOf 'firewallRule')) {
    $r = Get-NetFirewallRule -Name ([string]$s.name) -ErrorAction SilentlyContinue
    if (-not $r) { Add-Result "rule $($s.name)" 'SKIPPED_ABSENT' '규칙이 없다'; continue }
    if ($r.Description -ne $names.Marker -or $r.Group -ne $Script:IsoPrefix) { Add-Result "rule $($s.name)" 'REFUSED_NOT_OURS' '설명 표식 또는 Group 이 다르다. 지우지 않았다'; continue }
    try {
        Invoke-Mutation -Description "방화벽 규칙 삭제: $($s.name)" -Action { Remove-NetFirewallRule -Name ([string]$s.name) -ErrorAction Stop } | Out-Null
        Add-Result "rule $($s.name)" $(if ($Apply) { 'OK' } else { 'DRYRUN' }) '삭제'
    } catch { Add-Result "rule $($s.name)" 'FAILED' $_.Exception.Message }
}

# 3) ACL: 기록된 계정 SID 의 ACE 만 제거
foreach ($s in (Get-StepsOf 'aclGrant')) {
    $path = [string]$s.name
    $gsid = [string]$s.detail['sid']
    if (-not (Test-Path -LiteralPath $path)) { Add-Result "acl $path" 'SKIPPED_ABSENT' '경로가 없다'; continue }
    if (-not $gsid -or $gsid -notlike 'S-1-5-21-*') { Add-Result "acl $path" 'REFUSED_NOT_OURS' '기록된 SID 가 없거나 계정 SID 형식이 아니다'; continue }
    $acl = Get-Acl -LiteralPath $path
    $has = @($acl.Access | Where-Object { try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $gsid } catch { ([string]$_.IdentityReference) -eq $gsid } }).Count
    if ($has -lt 1) { Add-Result "acl $path" 'SKIPPED_ABSENT' '해당 SID 의 ACE 가 없다'; continue }
    try {
        Invoke-Mutation -Description "ACL 에서 SID $gsid 의 ACE 제거: $path" -Action {
            $a = Get-Acl -LiteralPath $path
            $a.PurgeAccessRules((New-Object Security.Principal.SecurityIdentifier($gsid)))
            Set-Acl -LiteralPath $path -AclObject $a
        } | Out-Null
        Add-Result "acl $path" $(if ($Apply) { 'OK' } else { 'DRYRUN' }) "SID $gsid 의 ACE 제거(다른 ACE 는 그대로)"
    } catch { Add-Result "acl $path" 'FAILED' $_.Exception.Message }
}

# 4) 계정(+선택 프로필)
if ($acct -and $acctOurs) {
    try {
        Invoke-Mutation -Description "로컬 계정 삭제: $($names.UserName) ($recordedSid)" -Action { Remove-LocalUser -SID ([Security.Principal.SecurityIdentifier]$recordedSid) -ErrorAction Stop } | Out-Null
        Add-Result "user $($names.UserName)" $(if ($Apply) { 'OK' } else { 'DRYRUN' }) '삭제'
    } catch { Add-Result "user $($names.UserName)" 'FAILED' $_.Exception.Message }
}
if ($recordedSid) {
    $prof = Get-CimInstance -ClassName Win32_UserProfile -Filter "SID='$recordedSid'" -ErrorAction SilentlyContinue
    if ($prof) {
        $expected = Join-Path $env:SystemDrive ('Users\' + $names.UserName)
        if ($RemoveProfile -and $prof.LocalPath -eq $expected) {
            try {
                Invoke-Mutation -Description "프로필 삭제: $($prof.LocalPath)" -Action { Remove-CimInstance -InputObject $prof -ErrorAction Stop } | Out-Null
                Add-Result 'profile' $(if ($Apply) { 'OK' } else { 'DRYRUN' }) $prof.LocalPath
            } catch { Add-Result 'profile' 'FAILED' $_.Exception.Message }
        } elseif ($RemoveProfile) {
            Add-Result 'profile' 'REFUSED_NOT_OURS' "프로필 경로가 기대($expected)와 다르다: $($prof.LocalPath)"
        } else {
            Add-Result 'profile' 'LEFT_IN_PLACE' "프로필 폴더가 남아 있다: $($prof.LocalPath) (지우려면 -RemoveProfile)"
        }
    }
}

# 5) 작업 폴더
foreach ($s in (Get-StepsOf 'workDir')) {
    $dir = [string]$s.name
    $root = [IO.Path]::GetFullPath((Get-IsoWorkRoot)).TrimEnd('\') + '\'
    if (-not (Test-Path -LiteralPath $dir)) { Add-Result "workdir $dir" 'SKIPPED_ABSENT' '폴더가 없다'; continue }
    $owner = Join-Path $dir '.owner'
    $okPath = ([IO.Path]::GetFullPath($dir)).StartsWith($root, [StringComparison]::OrdinalIgnoreCase)
    $okOwner = (Test-Path -LiteralPath $owner) -and (([IO.File]::ReadAllText($owner)) -eq $names.Marker)
    if (-not ($okPath -and $okOwner)) { Add-Result "workdir $dir" 'REFUSED_NOT_OURS' '위치 또는 .owner 표식이 다르다. 지우지 않았다'; continue }
    try {
        Invoke-Mutation -Description "작업 폴더 삭제: $dir" -Action { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction Stop } | Out-Null
        Add-Result "workdir $dir" $(if ($Apply) { 'OK' } else { 'DRYRUN' }) '삭제'
        $rootDir = Get-IsoWorkRoot
        if (-not $s.detail['rootExisted'] -and (Test-Path -LiteralPath $rootDir) -and @(Get-ChildItem -LiteralPath $rootDir -Force).Count -eq 0) {
            Invoke-Mutation -Description "비어 있는 작업 루트 삭제: $rootDir" -Action { Remove-Item -LiteralPath $rootDir -Force -ErrorAction Stop } | Out-Null
        }
    } catch { Add-Result "workdir $dir" 'FAILED' $_.Exception.Message }
}

# 6) 암호 파일
if ($Script:IsoRunDir) {
    $cred = Join-Path $Script:IsoRunDir 'credential.dpapi'
    if (Test-Path -LiteralPath $cred) {
        Invoke-Mutation -Description "암호 파일 삭제: $cred" -Action { Remove-Item -LiteralPath $cred -Force -ErrorAction Stop } | Out-Null
        Add-Result 'credential' $(if ($Apply) { 'OK' } else { 'DRYRUN' }) 'credential.dpapi'
    }
}

$bad = @($results | Where-Object { $_.result -in @('FAILED', 'REFUSED_NOT_OURS', 'DRIFT_NOT_RESTORED') })
if ($Apply -and $Script:IsoRunDir) {
    $m.status = $(if ($bad.Count -eq 0) { 'recovered' } else { 'recovered-with-issues' })
    Save-IsoManifest
    Write-IsoJson -Path (Join-Path $Script:IsoRunDir ('recovery-{0}.json' -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))) -Object ([ordered]@{ runId = $RunId; utc = [DateTime]::UtcNow.ToString('o'); results = $results })
}
Write-Host ''
$results | ForEach-Object { Write-Host ('{0,-20} {1}  {2}' -f $_.result, $_.step, $_.note) }
if (-not $Apply) { Write-Host 'dry-run 이라 아무것도 지우지 않았다.' }
if ($bad.Count -gt 0) { Write-Host '건드리지 않았거나 실패한 항목이 있다. 위 목록을 사람이 확인한다.' -ForegroundColor Yellow; exit 40 }
exit 0
