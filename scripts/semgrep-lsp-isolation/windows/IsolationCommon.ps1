# Windows 격리 준비 공용 함수. 직접 실행하지 않고 다른 스크립트가 점 읽기(. .\IsolationCommon.ps1)로 불러온다.
#
# 규칙(Test-IsolationScripts.ps1 이 구조로 검사한다)
# - 이 파일을 불러오는 것만으로는 시스템 상태를 바꾸지 않는다.
# - 계정·방화벽 규칙·감사 정책·ACL·프로세스 실행처럼 시스템 상태를 바꾸는 호출은 반드시 Invoke-Mutation 의 스크립트 블록 안에서만 한다.
#   $Script:ApplyMode 가 $false 이면 Invoke-Mutation 은 "하려던 일"만 출력하고 아무것도 하지 않는다(기본값).
# - 파일 쓰기는 RunDir(실행 기록 폴더) 안으로 한정한다(Write-IsoJson, Write-IsoLog).
# - Windows PowerShell 5.1 에서도 돌아야 하므로 삼항 연산자·?? ·?. 를 쓰지 않는다.
Set-StrictMode -Version 2.0

$Script:IsoPrefix = 'bosang-semgrep-iso'
$Script:ApplyMode = $false
$Script:IsoRunDir = $null
$Script:AuditGuid = @{
    FilteringPlatformConnection = '{0CCE9226-69AE-11D9-BED3-505054503030}'
    ProcessCreation             = '{0CCE922B-69AE-11D9-BED3-505054503030}'
}
$Script:SidUsers = 'S-1-5-32-545'
$Script:SidAuthenticatedUsers = 'S-1-5-11'
$Script:SidEveryone = 'S-1-1-0'
$Script:Ps51 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

function New-IsoRunId {
    $hex = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    '{0}-{1}' -f [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'"), $hex
}

function Get-IsoStateRoot { Join-Path $env:LOCALAPPDATA 'bosang-radar\semgrep-isolation' }
function Get-IsoWorkRoot { Join-Path $env:ProgramData $Script:IsoPrefix }

# 실행 하나가 만드는 자원의 이름은 RunId 에서만 정해진다. 복구는 이 이름과 설명 표식이 모두 맞는 것만 지운다.
function Get-IsoNames {
    param([Parameter(Mandatory)][string]$RunId)
    $hex = ($RunId -split '-')[-1]
    @{
        RunId    = $RunId
        UserName = 'bsi' + $hex
        RuleName = '{0}-{1}-out' -f $Script:IsoPrefix, $RunId
        Marker   = '{0}:{1}' -f $Script:IsoPrefix, $RunId
        WorkDir  = Join-Path (Get-IsoWorkRoot) $RunId
    }
}

function Test-IsElevated {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-IsoLog {
    param([string]$Level, [string]$Message, [hashtable]$Data)
    Write-Host ('[{0}] {1}' -f $Level, $Message)
    if ($Script:IsoRunDir -and (Test-Path -LiteralPath $Script:IsoRunDir)) {
        $rec = [ordered]@{ utc = [DateTime]::UtcNow.ToString('o'); level = $Level; message = $Message }
        if ($Data) { $rec.data = $Data }
        [IO.File]::AppendAllText((Join-Path $Script:IsoRunDir 'log.jsonl'), (($rec | ConvertTo-Json -Compress -Depth 6) + "`n"), (New-Object Text.UTF8Encoding($false)))
    }
}

function Assert-UnderRunDir {
    param([Parameter(Mandatory)][string]$Path)
    if (-not $Script:IsoRunDir) { throw 'RunDir 가 정해지지 않았다.' }
    $full = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetFullPath($Script:IsoRunDir).TrimEnd('\') + '\'
    if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw "RunDir 밖에는 쓰지 않는다: $full" }
}

function Write-IsoJson {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][object]$Object, [int]$Depth = 10)
    Assert-UnderRunDir -Path $Path
    $tmp = $Path + '.tmp'
    [IO.File]::WriteAllText($tmp, ($Object | ConvertTo-Json -Depth $Depth), (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($tmp, $Path, $null) } else { [IO.File]::Move($tmp, $Path) }
}

function Read-IsoJson {
    param([Parameter(Mandatory)][string]$Path)
    [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json
}

function Get-FileSha256Hex {
    param([Parameter(Mandatory)][string]$Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    $fs = [IO.File]::OpenRead($Path)
    try { (($sha.ComputeHash($fs) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $fs.Dispose(); $sha.Dispose() }
}

# 시스템 상태를 바꾸는 유일한 관문. 기본은 계획만 출력한다.
function Invoke-Mutation {
    param([Parameter(Mandatory)][string]$Description, [Parameter(Mandatory)][scriptblock]$Action)
    if (-not $Script:ApplyMode) {
        Write-IsoLog -Level 'PLAN' -Message $Description
        return $null
    }
    Write-IsoLog -Level 'APPLY' -Message $Description
    & $Action
}

function New-IsoRandomPassword {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    'Aa1!' + (([Convert]::ToBase64String($bytes)) -replace '[+/=]', '')
}

# ── 감사 정책 ────────────────────────────────────────────────────────────────
# auditpol /backup 의 마지막 열(Setting Value)을 숫자로 읽는다. 이름 열은 로케일 인코딩이라 GUID 와 숫자만 파싱한다.
function Get-AuditSettings {
    param([Parameter(Mandatory)][string]$BackupPath)
    Assert-UnderRunDir -Path $BackupPath
    $out = & (Join-Path $env:WINDIR 'System32\auditpol.exe') /backup /file:$BackupPath 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $BackupPath)) {
        return @{ Ok = $false; Error = (($out | Out-String).Trim()); Values = @{} }
    }
    @{ Ok = $true; Error = $null; Values = (ConvertFrom-AuditBackupLines -Lines ([IO.File]::ReadAllLines($BackupPath, [Text.Encoding]::Default))) }
}

# 순수 함수: 백업 CSV 줄 → GUID(대문자, 중괄호 포함) → 숫자. 이름 열은 로케일 인코딩이라 읽지 않는다.
function ConvertFrom-AuditBackupLines {
    param([string[]]$Lines)
    $values = @{}
    foreach ($line in $Lines) {
        if ($line -match '(\{[0-9A-Fa-f\-]{36}\}),[^,]*,[^,]*,(\d+)\s*$') { $values[$Matches[1].ToUpperInvariant()] = [int]$Matches[2] }
    }
    $values
}

# 0=없음 1=성공 2=실패 3=둘 다. 그 밖의 값(제외 설정 등)은 추측하지 않고 지원하지 않는 값으로 돌려준다.
function ConvertTo-AuditFlags {
    param([int]$Value)
    if ($Value -lt 0 -or $Value -gt 3) { return @{ Supported = $false; Success = $false; Failure = $false } }
    @{ Supported = $true; Success = [bool]($Value -band 1); Failure = [bool]($Value -band 2) }
}

function Set-AuditSubcategory {
    param([Parameter(Mandatory)][string]$Guid, [Parameter(Mandatory)][bool]$Success, [Parameter(Mandatory)][bool]$Failure, [string]$Why)
    $s = 'disable'; if ($Success) { $s = 'enable' }
    $f = 'disable'; if ($Failure) { $f = 'enable' }
    Invoke-Mutation -Description ("auditpol /set /subcategory:{0} /success:{1} /failure:{2} ({3})" -f $Guid, $s, $f, $Why) -Action {
        $o = & (Join-Path $env:WINDIR 'System32\auditpol.exe') /set "/subcategory:$Guid" "/success:$s" "/failure:$f" 2>&1
        if ($LASTEXITCODE -ne 0) { throw ('auditpol /set 실패: ' + (($o | Out-String).Trim())) }
    }
}

# ── 경로·접근 권한 ───────────────────────────────────────────────────────────
function ConvertTo-RightsMask {
    param($Rights)
    # 16진 리터럴 0x80000000 은 PowerShell 에서 음수(Int32)로 읽혀 int64 와 섞이면 부호가 틀어진다. 상수를 모두 int64 로 쓴다.
    [int64]$m = ([int64][int]$Rights) -band [int64]4294967295
    if ($m -band [int64]268435456) { return [int64]2032127 }          # GenericAll(0x10000000) → 0x1F01FF
    if ($m -band [int64]2147483648) { $m = $m -bor [int64]1179785 }   # GenericRead(0x80000000) → 0x120089
    if ($m -band [int64]536870912) { $m = $m -bor [int64]1179808 }    # GenericExecute(0x20000000) → 0x1200A0
    $m
}

# 주어진 SID 들(예: 새 계정이 속할 Users·Authenticated Users·Everyone)이 경로를 읽고 실행할 수 있는지 ACL 만으로 계산한다.
# 거부 규칙은 허용보다 우선한다. 토큰의 다른 SID 나 상속 차단 이후 상태를 완전히 재현하지는 않으므로 판정은 "ACL 상 예상"이다.
function Test-SidsReadExecute {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string[]]$Sids)
    $want = [int64]0x1200A9   # ReadAndExecute + Synchronize
    $result = [ordered]@{ path = $Path; exists = (Test-Path -LiteralPath $Path); canReadExecute = $false; aces = @(); note = $null }
    if (-not $result.exists) { $result.note = '경로가 없다'; return $result }
    $eval = Get-EffectiveRightsForSids -Rules @((Get-Acl -LiteralPath $Path).Access) -Sids $Sids
    $result.canReadExecute = (($eval.effective -band $want) -eq $want)
    $result.aces = $eval.aces
    $result
}

# 순수 함수: 접근 규칙 목록에서 주어진 SID 들에 해당하는 허용·거부를 합쳐 유효 권한 마스크를 계산한다(거부 우선).
function Get-EffectiveRightsForSids {
    param([object[]]$Rules, [Parameter(Mandatory)][string[]]$Sids)
    $allow = [int64]0; $deny = [int64]0; $aces = @()
    foreach ($r in $Rules) {
        $sid = $null
        try { $sid = $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { $sid = [string]$r.IdentityReference }
        if ($Sids -notcontains $sid) { continue }
        $mask = ConvertTo-RightsMask -Rights $r.FileSystemRights
        if ($r.AccessControlType -eq 'Deny') { $deny = $deny -bor $mask } else { $allow = $allow -bor $mask }
        $aces += ('{0} {1} {2} inherited={3}' -f $sid, $r.AccessControlType, $r.FileSystemRights, $r.IsInherited)
    }
    @{ effective = ($allow -band (-bnot $deny)); aces = $aces }
}

# ── 프로세스·NT 경로 ─────────────────────────────────────────────────────────
function Get-ProcessRecord {
    param([Parameter(Mandatory)][int]$ProcessId, [Parameter(Mandatory)][string]$Role)
    $p = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if (-not $p) { return $null }
    $sid = $null
    try {
        $o = Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid -ErrorAction Stop
        if ($o.ReturnValue -eq 0) { $sid = $o.Sid }
    } catch { $sid = $null }
    [ordered]@{
        role = $Role; processId = $ProcessId; parentProcessId = [int]$p.ParentProcessId; exePath = $p.ExecutablePath
        startUtc = $p.CreationDate.ToUniversalTime().ToString('o'); endUtc = $null; ownerSid = $sid
        snapshotUtc = [DateTime]::UtcNow.ToString('o')
    }
}

function Get-NtToDosMap {
    if (-not ('Iso.Native' -as [type])) {
        Add-Type -Namespace Iso -Name Native -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError=true, CharSet=System.Runtime.InteropServices.CharSet.Unicode)] public static extern uint QueryDosDevice(string lpDeviceName, System.Text.StringBuilder lpTargetPath, int ucchMax);'
    }
    $map = @{}
    foreach ($d in [IO.DriveInfo]::GetDrives()) {
        $letter = $d.Name.Substring(0, 2)
        $sb = New-Object Text.StringBuilder 520
        if ([Iso.Native]::QueryDosDevice($letter, $sb, $sb.Capacity) -gt 0) { $map[$sb.ToString().ToLowerInvariant()] = $letter }
    }
    $map
}

# \device\harddiskvolume3\windows\x.exe → C:\windows\x.exe. 대응이 없으면 $null (추측하지 않는다).
function Convert-NtPathToDosPath {
    param([string]$NtPath, [Parameter(Mandatory)][hashtable]$Map)
    if ([string]::IsNullOrEmpty($NtPath)) { return $null }
    $lower = $NtPath.ToLowerInvariant()
    foreach ($k in $Map.Keys) {
        if ($lower -eq $k -or $lower.StartsWith($k + '\')) { return $Map[$k] + $NtPath.Substring($k.Length) }
    }
    $null
}

function ConvertTo-UtcDate {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [datetime]) { return $Value.ToUniversalTime() }
    [DateTime]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
}

# ── Security 로그의 WFP 차단 이벤트(5157) ───────────────────────────────────
function Get-SecurityLogState {
    $r = [ordered]@{ ok = $false; error = $null; lastRecordId = $null; oldestRecordNumber = $null; recordCount = $null; maxSizeBytes = $null; logMode = $null; isEnabled = $null }
    try {
        $info = Get-WinEvent -ListLog Security -ErrorAction Stop
        $r.oldestRecordNumber = $info.OldestRecordNumber; $r.recordCount = $info.RecordCount
        $r.maxSizeBytes = $info.MaximumSizeInBytes; $r.logMode = [string]$info.LogMode; $r.isEnabled = $info.IsEnabled
        $last = @(Get-WinEvent -LogName Security -MaxEvents 1 -ErrorAction Stop)
        if ($last.Count -ge 1) { $r.lastRecordId = [long]$last[0].RecordId }
        $r.ok = $true
    } catch { $r.error = $_.Exception.Message }
    $r
}

function Get-WfpBlockEvents {
    param([Parameter(Mandatory)][long]$AfterRecordId)
    $r = [ordered]@{ ok = $false; error = $null; events = @() }
    $found = @()
    try {
        $found = @(Get-WinEvent -LogName Security -FilterXPath "*[System[(EventID=5157) and (EventRecordID > $AfterRecordId)]]" -ErrorAction Stop)
    } catch {
        if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { $found = @() } else { $r.error = $_.Exception.Message; return $r }
    }
    $list = @()
    foreach ($e in $found) {
        $d = @{}
        foreach ($n in ([xml]$e.ToXml()).Event.EventData.Data) { $d[$n.Name] = $n.'#text' }
        $raw = [string]$d['ProcessID']
        $pid32 = $null; $fmt = 'decimal'
        if ($raw -match '^0[xX][0-9a-fA-F]+$') { $pid32 = [Convert]::ToInt32($raw.Substring(2), 16); $fmt = 'hex-prefixed' }
        elseif ($raw -match '^\d+$') { $pid32 = [int]$raw }
        $dir = [string]$d['Direction']
        if ($dir -eq '%%14593') { $dir = 'Outbound' } elseif ($dir -eq '%%14592') { $dir = 'Inbound' }
        $list += @{
            recordId = [long]$e.RecordId; timeUtc = $e.TimeCreated.ToUniversalTime(); processId = $pid32; processIdRaw = $raw; processIdFormat = $fmt
            application = [string]$d['Application']; direction = $dir; destAddress = [string]$d['DestAddress']; destPort = [string]$d['DestPort']
            sourceAddress = [string]$d['SourceAddress']; protocol = [string]$d['Protocol']; filterRtid = [string]$d['FilterRTID']
        }
    }
    $r.ok = $true; $r.events = $list
    $r
}

# 순수 함수: 이벤트를 "이번 실행의 프로세스"와 프로브(목적지)에 맞춰 나눈다.
# 이번 실행의 것으로 인정하려면 PID·실행 파일 경로·시각 구간이 모두 맞아야 한다. 하나라도 못 맞추면 식별 불가로 둔다(우리 것이라고 가정하지 않는다).
function Select-MatchingBlockEvents {
    param(
        [Parameter(Mandatory)][object[]]$Events,
        [Parameter(Mandatory)][object[]]$Processes,
        [Parameter(Mandatory)][object[]]$Probes,
        [Parameter(Mandatory)][hashtable]$DosMap,
        [datetime]$NowUtc = [DateTime]::UtcNow,
        [double]$SlackBeforeSec = 1.0,
        [double]$SlackAfterSec = 5.0
    )
    $matched = @{}; foreach ($p in $Probes) { $matched[[string]$p.name] = @() }
    $runOther = @(); $unidentified = @()
    foreach ($e in $Events) {
        $why = @()
        $proc = $null
        foreach ($p in $Processes) { if ($null -ne $e.processId -and [int]$p.processId -eq [int]$e.processId) { $proc = $p; break } }
        if ($null -eq $e.processId) { $why += 'PID를 읽지 못했다' }
        elseif ($null -eq $proc) { $why += 'PID가 이번 실행의 프로세스가 아니다' }
        else {
            $dos = Convert-NtPathToDosPath -NtPath $e.application -Map $DosMap
            if ($null -eq $dos) { $why += '실행 파일 NT 경로를 DOS 경로로 바꾸지 못했다' }
            elseif ([string]$proc.exePath -ne $dos -and -not ([string]$proc.exePath).Equals($dos, [StringComparison]::OrdinalIgnoreCase)) { $why += '실행 파일 경로가 다르다' }
            $start = ConvertTo-UtcDate $proc.startUtc
            $end = ConvertTo-UtcDate $proc.endUtc
            if ($null -eq $end) { $end = $NowUtc }
            if ($e.timeUtc -lt $start.AddSeconds(-$SlackBeforeSec) -or $e.timeUtc -gt $end.AddSeconds($SlackAfterSec)) { $why += '이벤트 시각이 프로세스 시작~종료 구간 밖이다' }
            if ($e.direction -ne 'Outbound') { $why += '방향이 Outbound 가 아니다' }
        }
        if ($why.Count -gt 0) { $unidentified += @{ event = $e; reasons = $why }; continue }
        $hit = $false
        foreach ($p in $Probes) {
            $da = ([string]$e.destAddress) -replace '^::ffff:', ''
            if ($da -eq [string]$p.destAddress -and [string]$e.destPort -eq [string]$p.destPort) { $matched[[string]$p.name] += $e; $hit = $true; break }
        }
        if (-not $hit) { $runOther += $e }
    }
    @{ matched = $matched; runOtherDestination = $runOther; unidentified = $unidentified }
}

# 순수 함수: 연결 결과 + 증거 → 판정. 연결 실패만으로는 차단이라고 하지 않는다.
function Get-ProbeVerdict {
    param(
        [Parameter(Mandatory)][ValidateSet('allowed', 'blocked')][string]$Expectation,
        [Parameter(Mandatory)][bool]$Connected,
        [Parameter(Mandatory)][hashtable]$Evidence   # collectionOk, auditFailureEnabled, wrapped, matchedCount
    )
    if ($Expectation -eq 'allowed') {
        if ($Connected) { return 'ALLOWED_AS_EXPECTED' } else { return 'UNEXPECTEDLY_FAILED' }
    }
    if ($Connected) { return 'NOT_BLOCKED' }
    if (-not $Evidence.collectionOk -or $Evidence.auditFailureEnabled -ne $true -or $Evidence.wrapped -ne $false) { return 'FAILED_EVIDENCE_UNAVAILABLE' }
    if ($Evidence.matchedCount -ge 1) { return 'OS_BLOCK_OBSERVED' }
    'FAILED_WITHOUT_OS_EVIDENCE'
}

# 증거 수집 전체: 로그 읽기 → 이번 실행과 맞추기. 읽지 못하면 건수를 $null 로 둔다(0 이 아니다).
function Get-BlockEvidence {
    param(
        [Parameter(Mandatory)][hashtable]$Baseline,        # lastRecordId, oldestRecordNumber (실행 직전 값)
        [Parameter(Mandatory)][object[]]$Processes,
        [Parameter(Mandatory)][object[]]$Probes,
        $AuditFailureEnabled
    )
    $ev = [ordered]@{
        collection = [ordered]@{ ok = $false; error = $null; auditFailureEnabled = $AuditFailureEnabled; wrapped = $null }
        matchedCount = $null; matched = $null; runOtherDestinationCount = $null; unidentifiedCount = $null; unidentified = $null
    }
    if ($null -eq $Baseline.lastRecordId) { $ev.collection.error = '실행 직전 Security 로그 기준점을 읽지 못했다'; return $ev }
    $state = Get-SecurityLogState
    if (-not $state.ok) { $ev.collection.error = $state.error; return $ev }
    $wrapped = $false
    if ($null -ne $state.oldestRecordNumber -and [long]$state.oldestRecordNumber -gt ([long]$Baseline.lastRecordId + 1)) { $wrapped = $true }
    $ev.collection.wrapped = $wrapped
    $got = Get-WfpBlockEvents -AfterRecordId ([long]$Baseline.lastRecordId)
    if (-not $got.ok) { $ev.collection.error = $got.error; return $ev }
    $ev.collection.ok = $true
    $sel = Select-MatchingBlockEvents -Events @($got.events) -Processes $Processes -Probes $Probes -DosMap (Get-NtToDosMap)
    $mc = @{}; foreach ($k in $sel.matched.Keys) { $mc[$k] = @($sel.matched[$k]).Count }
    $ev.matchedCount = $mc
    $ev.matched = $sel.matched
    $ev.runOtherDestinationCount = @($sel.runOtherDestination).Count
    $ev.unidentifiedCount = @($sel.unidentified).Count
    $ev.unidentified = $sel.unidentified
    $ev
}

# ── 실행 기록(manifest) ─────────────────────────────────────────────────────
function New-IsoManifest {
    param([Parameter(Mandatory)][string]$RunId)
    $Script:Manifest = [ordered]@{
        schema = 1; runId = $RunId; status = 'planned'; createdUtc = [DateTime]::UtcNow.ToString('o'); computer = $env:COMPUTERNAME
        steps = New-Object System.Collections.ArrayList
    }
    $Script:Manifest
}

function Save-IsoManifest {
    if (-not $Script:ApplyMode) { return }
    Write-IsoJson -Path (Join-Path $Script:IsoRunDir 'resources.json') -Object $Script:Manifest
}

# 만들기 직전에 intent 로 먼저 적고(중단돼도 복구가 이름으로 찾을 수 있게), 만든 뒤 created 로 바꾼다.
function Add-IsoStep {
    param([Parameter(Mandatory)][string]$Kind, [Parameter(Mandatory)][string]$Name, [hashtable]$Detail = @{})
    $s = [ordered]@{ kind = $Kind; name = $Name; state = 'intent'; detail = $Detail; utc = [DateTime]::UtcNow.ToString('o') }
    [void]$Script:Manifest.steps.Add($s)
    Save-IsoManifest
    $s
}

function Complete-IsoStep {
    param([Parameter(Mandatory)]$Step, [hashtable]$Extra = @{}, [string]$State = 'created')
    foreach ($k in $Extra.Keys) { $Step.detail[$k] = $Extra[$k] }
    $Step.state = $State
    Save-IsoManifest
}

function ConvertTo-PlainObject {
    param($Object)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Management.Automation.PSCustomObject]) {
        $h = [ordered]@{}
        foreach ($p in $Object.PSObject.Properties) { $h[$p.Name] = ConvertTo-PlainObject -Object $p.Value }
        return $h
    }
    if ($Object -is [System.Collections.IEnumerable] -and $Object -isnot [string]) {
        $list = @(); foreach ($i in $Object) { $list += , (ConvertTo-PlainObject -Object $i) }
        return , $list
    }
    $Object
}

# 저장된 resources.json 을 고칠 수 있는 형태로 불러온다(검증 스크립트가 감사 창 단계를 이어 적을 때 쓴다).
function Import-IsoManifest {
    param([Parameter(Mandatory)][string]$Path)
    $m = ConvertTo-PlainObject -Object (Read-IsoJson -Path $Path)
    $steps = New-Object System.Collections.ArrayList
    foreach ($s in @($m.steps)) { [void]$steps.Add($s) }
    $m.steps = $steps
    $Script:Manifest = $m
    $m
}

# ── 감사 창: 필요한 동안만 켜고, 끝나면 "내가 바꾼 것만" 원래 값으로 되돌린다 ───────────
# 원래 값은 켜기 직전에 auditpol /backup 으로 새로 읽는다(오래된 사전 점검 값을 믿지 않는다).
function Open-IsoAuditWindow {
    param([Parameter(Mandatory)][string]$Guid, [Parameter(Mandatory)][bool]$EnableSuccess, [Parameter(Mandatory)][bool]$EnableFailure, [string]$Why)
    $backup = Join-Path $Script:IsoRunDir ('auditpol-before-{0}.csv' -f [DateTime]::UtcNow.ToString('HHmmssfff'))
    $cur = Get-AuditSettings -BackupPath $backup
    if (-not $cur.Ok -or -not $cur.Values.ContainsKey($Guid)) { throw '감사 정책의 현재 값을 읽지 못해 원래 값을 알 수 없다. 바꾸지 않는다.' }
    $orig = [int]$cur.Values[$Guid]
    $flags = ConvertTo-AuditFlags -Value $orig
    if (-not $flags.Supported) { throw "지원하지 않는 감사 값($orig)이다. 추측하지 않고 바꾸지 않는다." }
    $wantS = ($flags.Success -or $EnableSuccess); $wantF = ($flags.Failure -or $EnableFailure)
    $set = 0; if ($wantS) { $set = $set -bor 1 }; if ($wantF) { $set = $set -bor 2 }
    $step = Add-IsoStep -Kind 'auditSetting' -Name $Guid -Detail @{ original = $orig; set = $set; changed = ($set -ne $orig); backupFile = (Split-Path $backup -Leaf) }
    if ($set -eq $orig) { Complete-IsoStep -Step $step -State 'unchanged'; return $step }
    Set-AuditSubcategory -Guid $Guid -Success $wantS -Failure $wantF -Why $Why
    if ($Script:ApplyMode) {
        $after = Get-AuditSettings -BackupPath ($backup + '.after.csv')
        if (-not $after.Ok -or $after.Values[$Guid] -ne $set) { Complete-IsoStep -Step $step -State 'applied-unverified'; throw "감사 값을 $set 으로 바꿨지만 다시 읽은 값이 다르다. 복구 대상으로 남긴다." }
    }
    Complete-IsoStep -Step $step -State 'applied'
    $step
}

function Close-IsoAuditWindow {
    param([Parameter(Mandatory)]$Step)
    if ($Step.state -eq 'unchanged' -or $Step.state -eq 'restored') { return }
    $guid = [string]$Step.name
    $backup = Join-Path $Script:IsoRunDir ('auditpol-restore-{0}.csv' -f [DateTime]::UtcNow.ToString('HHmmssfff'))
    $cur = Get-AuditSettings -BackupPath $backup
    $now = $null; if ($cur.Ok -and $cur.Values.ContainsKey($guid)) { $now = [int]$cur.Values[$guid] }
    $orig = [int]$Step.detail.original; $set = [int]$Step.detail.set
    if ($null -eq $now) { Write-IsoLog -Level 'WARN' -Message "감사 값을 다시 읽지 못해 복구하지 않았다: $guid (원래 값 $orig)"; return }
    if ($now -ne $set) {
        # 우리가 바꾼 값이 아니면 건드리지 않는다(누가 그 사이에 바꿨거나 이미 되돌려졌다).
        Write-IsoLog -Level 'WARN' -Message "감사 값이 우리가 설정한 값($set)이 아니라 복구하지 않았다: 현재 $now, 원래 $orig ($guid)"
        $Step.detail['restoreNote'] = "DRIFT: 현재 $now"
        Complete-IsoStep -Step $Step -State 'drift-not-restored'
        return
    }
    $f = ConvertTo-AuditFlags -Value $orig
    Set-AuditSubcategory -Guid $guid -Success $f.Success -Failure $f.Failure -Why '감사 창 종료: 원래 값으로 복구'
    Complete-IsoStep -Step $Step -State 'restored'
}
