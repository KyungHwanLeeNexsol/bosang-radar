# Windows 격리 준비 공용 함수. 직접 실행하지 않고 다른 스크립트가 점 읽기(. .\IsolationCommon.ps1)로 불러온다.
#
# 규칙(Test-IsolationScripts.ps1 이 구조로 검사한다)
# - 이 파일을 불러오는 것만으로는 시스템 상태를 바꾸지 않는다.
# - 계정·방화벽 규칙·감사 정책·ACL·프로세스 실행처럼 시스템 상태를 바꾸는 호출은 반드시 Invoke-Mutation 의 스크립트 블록 안에서만 한다.
#   $Script:ApplyMode 가 $false 이면 Invoke-Mutation 은 "하려던 일"만 출력하고 아무것도 하지 않는다(기본값).
# - 파일 쓰기는 RunDir(실행 기록 폴더) 안으로 한정한다(Write-IsoJson, Write-IsoLog).
# - Windows PowerShell 5.1 에서도 돌아야 하므로 삼항 연산자·?? ·?. 를 쓰지 않는다.
# - 두 엔진의 차이로 이미 데인 곳(시험에서 재현됨):
#   · 메서드의 문자열 인자에 $null 을 넘기면 빈 문자열이 된다 → [NullString]::Value
#   · 5.1 은 @(… | ConvertFrom-Json) 이 최상위 JSON 배열을 한 겹 더 감싼다 → JSON 은 최상위를 객체로 쓴다
#   · pwsh 는 ISO 시각 문자열을 DateTime 으로 바꾼다 → 시각을 [string] 으로 바꾸지 않고 ConvertTo-UtcDate 로 다룬다
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
    # 백업 경로 인자는 반드시 [NullString]::Value: 그냥 $null 을 넘기면 빈 문자열이 되어 "경로가 비었다"로 실패한다(두 번째 저장부터).
    if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($tmp, $Path, [NullString]::Value) } else { [IO.File]::Move($tmp, $Path) }
}

function Read-IsoJson {
    param([Parameter(Mandatory)][string]$Path)
    [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json
}

# 객체·해시테이블 어느 쪽이든 없는 속성은 $null (StrictMode 에서도 오류가 나지 않는다).
function Get-IsoProp {
    param($Object, [Parameter(Mandatory)][string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) { if ($Object.Contains($Name)) { return $Object[$Name] }; return $null }
    $p = $Object.PSObject.Properties[$Name]
    if ($p) { return $p.Value }
    $null
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

function ConvertTo-UtcDate {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [datetime]) {
        if ($Value.Kind -eq [DateTimeKind]::Unspecified) { return [DateTime]::SpecifyKind($Value, [DateTimeKind]::Utc) }
        return $Value.ToUniversalTime()
    }
    [DateTime]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
}

# ── 감사 정책 ────────────────────────────────────────────────────────────────
# auditpol.exe 를 부르는 유일한 자리(시험에서 대체한다). 종료 코드와 출력을 객체로 돌려준다.
# 읽기('/backup')는 Invoke-Mutation 밖에서 불러도 되고, 그 밖의 인자('/set' 등)는 Invoke-Mutation 안에서만 부른다(자체 점검이 검사).
function Invoke-AuditPol {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $out = & (Join-Path $env:WINDIR 'System32\auditpol.exe') @Arguments 2>&1
    @{ ExitCode = $LASTEXITCODE; Output = (($out | Out-String).Trim()) }
}

# auditpol /backup 의 마지막 열(Setting Value)을 숫자로 읽는다. 이름 열은 로케일 인코딩이라 GUID 와 숫자만 파싱한다.
function Get-AuditSettings {
    param([Parameter(Mandatory)][string]$BackupPath)
    Assert-UnderRunDir -Path $BackupPath
    $r = Invoke-AuditPol -Arguments @('/backup', "/file:$BackupPath")
    if ($r.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $BackupPath)) {
        return @{ Ok = $false; Error = [string]$r.Output; Values = @{} }
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
        $r = Invoke-AuditPol -Arguments @('/set', "/subcategory:$Guid", "/success:$s", "/failure:$f")
        if ($r.ExitCode -ne 0) { throw ('auditpol /set 실패: ' + $r.Output) }
    }
}

# 지금 "Filtering Platform Connection" 실패 감사가 켜져 있는가. 읽지 못하면 $null (꺼짐으로 바꾸지 않는다).
function Get-IsoAuditFailureState {
    $guid = $Script:AuditGuid.FilteringPlatformConnection
    $r = Get-AuditSettings -BackupPath (Join-Path $Script:IsoRunDir ('auditpol-evidence-{0}.csv' -f [DateTime]::UtcNow.ToString('HHmmssfff')))
    if (-not $r.Ok -or -not $r.Values.ContainsKey($guid)) { return $null }
    $flags = ConvertTo-AuditFlags -Value ([int]$r.Values[$guid])
    if (-not $flags.Supported) { return $null }
    [bool]$flags.Failure
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

# ── 프로브 신원 검증 ─────────────────────────────────────────────────────────
# 순수 함수. 성공 판정에 쓸 부모·자식 프로세스가 "이번 실행이 띄운 전용 계정의 프로브"임을 서로 다른 출처로 교차 확인한다.
#  출처 1: 실행기가 CIM 으로 직접 기록한 프로세스 정보(ParentCim, ChildCim)
#  출처 2: 프로브가 스스로 쓴 파일(ParentSelf, ChildResult.self), 부모가 쓴 자식 PID(Link)
# 필수 기록이 없거나 하나라도 어긋나면 ok=$false 이고 failures 에 코드가 쌓인다. 서명·출처 인증은 하지 않는다.
function Test-ProbeIdentity {
    param(
        [Parameter(Mandatory)][string]$ExpectedSid,
        [Parameter(Mandatory)][string]$ExpectedExe,
        [Parameter(Mandatory)][string]$RunToken,
        [Parameter(Mandatory)][datetime]$LaunchedUtc,
        [datetime]$NowUtc = [DateTime]::UtcNow,
        $ParentCim, $ChildCim, $ParentSelf, $ChildResult, $Link, $ParentDone,
        [double]$ToleranceSec = 2.0
    )
    $f = New-Object System.Collections.ArrayList
    function Add-F([string]$Code, [string]$Msg) { [void]$f.Add(@{ code = $Code; message = $Msg }) }
    function Same-Text($a, $b) { ($null -ne $a) -and ($null -ne $b) -and ([string]$a).Equals([string]$b, [StringComparison]::OrdinalIgnoreCase) }
    function Try-Date($v) { try { return (ConvertTo-UtcDate $v) } catch { return $null } }

    if ($null -eq $ParentCim) { Add-F 'REQ_PARENT_CIM' '부모 프로세스의 CIM 기록이 없다' }
    if ($null -eq $ChildCim) { Add-F 'REQ_CHILD_CIM' '자식 프로세스의 CIM 기록이 없다' }
    if ($null -eq $ParentSelf) { Add-F 'REQ_PARENT_SELF' '부모 프로브의 자기 보고(이번 실행의 토큰 포함)가 없다' }
    if ($null -eq $ChildResult) { Add-F 'REQ_CHILD_RESULT' '자식 프로브의 결과 파일(이번 실행의 토큰 포함)이 없다' }
    if ($null -eq $Link) { Add-F 'REQ_LINK' '부모가 쓴 자식 PID 기록(이번 실행의 토큰 포함)이 없다' }
    $childSelf = Get-IsoProp $ChildResult 'self'
    if ($null -ne $ChildResult -and $null -eq $childSelf) { Add-F 'REQ_CHILD_SELF' '자식 결과 파일에 self 항목이 없다' }

    # 토큰: 이번 실행이 만든 파일인가
    foreach ($pair in @(@('PARENT_SELF', $ParentSelf), @('LINK', $Link), @('CHILD_RESULT', $ChildResult), @('PARENT_DONE', $ParentDone))) {
        if ($null -ne $pair[1] -and (Get-IsoProp $pair[1] 'runToken') -ne $RunToken) { Add-F ('TOKEN_MISMATCH_' + $pair[0]) '결과 파일의 실행 토큰이 이번 실행과 다르다' }
    }

    foreach ($side in @(@('PARENT', $ParentCim, $ParentSelf), @('CHILD', $ChildCim, $childSelf))) {
        $name = $side[0]; $cim = $side[1]; $self = $side[2]
        if ($null -ne $cim) {
            if (-not (Same-Text (Get-IsoProp $cim 'ownerSid') $ExpectedSid)) { Add-F ($name + '_OWNER_SID') "CIM 소유 SID 가 전용 계정이 아니다($(Get-IsoProp $cim 'ownerSid'))" }
            if (-not (Same-Text (Get-IsoProp $cim 'exePath') $ExpectedExe)) { Add-F ($name + '_EXE_UNEXPECTED') "CIM 실행 파일이 기대($ExpectedExe)와 다르다($(Get-IsoProp $cim 'exePath'))" }
            $cs = Try-Date (Get-IsoProp $cim 'startUtc')
            if ($null -eq $cs) { Add-F ($name + '_CIM_START_INVALID') 'CIM 시작 시각을 읽지 못했다' }
            elseif ($cs -lt $LaunchedUtc.AddSeconds(-$ToleranceSec)) { Add-F ($name + '_STARTED_BEFORE_LAUNCH') '프로세스가 이번 실행을 시작하기 전에 이미 떠 있었다' }
        }
        if ($null -ne $self) {
            if (-not (Same-Text (Get-IsoProp $self 'sid') $ExpectedSid)) { Add-F ($name + '_SELF_SID') "자기 보고 SID 가 전용 계정이 아니다($(Get-IsoProp $self 'sid'))" }
        }
        if ($null -ne $cim -and $null -ne $self) {
            if ([string](Get-IsoProp $self 'pid') -ne [string](Get-IsoProp $cim 'processId')) { Add-F ($name + '_SELF_PID_MISMATCH') "자기 보고 PID($(Get-IsoProp $self 'pid'))가 CIM PID($(Get-IsoProp $cim 'processId'))와 다르다" }
            if (-not (Same-Text (Get-IsoProp $self 'exePath') (Get-IsoProp $cim 'exePath'))) { Add-F ($name + '_SELF_EXE_MISMATCH') '자기 보고 실행 파일이 CIM 과 다르다' }
            $ss = Try-Date (Get-IsoProp $self 'startUtc'); $cs2 = Try-Date (Get-IsoProp $cim 'startUtc')
            if ($null -eq $ss -or $null -eq $cs2 -or [Math]::Abs(($ss - $cs2).TotalSeconds) -gt $ToleranceSec) { Add-F ($name + '_SELF_START_MISMATCH') '자기 보고 시작 시각이 CIM 과 맞지 않는다' }
        }
    }

    # 부모→자식 관계
    if ($null -ne $ParentCim -and $null -ne $ChildCim) {
        if ([string](Get-IsoProp $ChildCim 'parentProcessId') -ne [string](Get-IsoProp $ParentCim 'processId')) { Add-F 'CHILD_NOT_PARENTS_CHILD' "자식의 부모 PID($(Get-IsoProp $ChildCim 'parentProcessId'))가 부모 프로브 PID($(Get-IsoProp $ParentCim 'processId'))와 다르다" }
        $ps = Try-Date (Get-IsoProp $ParentCim 'startUtc'); $cs3 = Try-Date (Get-IsoProp $ChildCim 'startUtc')
        if ($null -ne $ps -and $null -ne $cs3 -and $cs3 -lt $ps.AddSeconds(-1.0)) { Add-F 'CHILD_BEFORE_PARENT' '자식이 부모보다 먼저 시작했다' }
    }
    if ($null -ne $Link -and $null -ne $ChildCim) {
        if ([string](Get-IsoProp $Link 'childPid') -ne [string](Get-IsoProp $ChildCim 'processId')) { Add-F 'LINK_CHILD_PID_MISMATCH' "부모가 보고한 자식 PID($(Get-IsoProp $Link 'childPid'))가 CIM 자식 PID 와 다르다" }
    }

    # 자식이 보고한 종료 시각: 시작 이후, 지금보다 크게 미래가 아니어야 한다(이벤트 시각 구간에 쓰므로 검증된 값만 쓴다)
    if ($null -ne $ChildResult -and $null -ne $ChildCim) {
        $ce = Try-Date (Get-IsoProp $ChildResult 'endUtc'); $cs4 = Try-Date (Get-IsoProp $ChildCim 'startUtc')
        if ($null -eq $ce -or ($null -ne $cs4 -and $ce -lt $cs4) -or $ce -gt $NowUtc.AddSeconds($ToleranceSec)) { Add-F 'CHILD_END_INVALID' '자식이 보고한 종료 시각이 시작 이전이거나 미래이거나 없다' }
    }
    @{ ok = ($f.Count -eq 0); failures = @($f.ToArray()) }
}

# 이번 실행의 토큰이 든 파일만 받는다. 파일이 있다는 것만으로는 준비 완료로 보지 않는다(이전 실행의 파일이 남아 있을 수 있다).
function Wait-IsoRunFile {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Token, [int]$TimeoutSec = 10)
    $end = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
    while ($true) {
        if (Test-Path -LiteralPath $Path) {
            try {
                $o = Read-IsoJson -Path $Path
                if ((Get-IsoProp $o 'runToken') -eq $Token) { return $o }
            } catch { }
        }
        if ([DateTime]::UtcNow -ge $end) { break }
        Start-Sleep -Milliseconds 200
    }
    $null
}

function ConvertTo-IsoCleanupItem {
    param([string]$Name, [bool]$Ok, [string]$Outcome, [string]$ErrorText = $null, $Detail = $null)
    [ordered]@{ name = $Name; ok = $Ok; outcome = $Outcome; error = $ErrorText; detail = $Detail }
}

# 정리 하나를 실행하고 결과를 항목으로 돌려준다. 예외가 나도 호출자의 다음 정리를 막지 않는다.
# 동작이 ok/outcome 을 가진 사전을 돌려주면 그대로 항목이 되고, 아무것도 돌려주지 않으면 DONE(성공)으로 본다.
function Invoke-IsoCleanupStep {
    param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][scriptblock]$Action)
    try {
        $r = & $Action
        if ($r -is [System.Collections.IDictionary] -and $r.Contains('ok') -and $r.Contains('outcome')) { return (ConvertTo-IsoCleanupItem -Name $Name -Ok ([bool]$r['ok']) -Outcome ([string]$r['outcome']) -ErrorText ([string](Get-IsoProp $r 'error')) -Detail $r) }
        ConvertTo-IsoCleanupItem -Name $Name -Ok $true -Outcome 'DONE'
    } catch {
        ConvertTo-IsoCleanupItem -Name $Name -Ok $false -Outcome 'EXCEPTION' -ErrorText $_.Exception.Message
    }
}

# 전용 계정을 끄고, 정말 꺼졌는지 읽어서 확인한다. 끄기가 예외를 내도 읽어서 꺼져 있으면 꺼진 것으로 센다(그 사실을 오류와 함께 남긴다).
function Disable-IsoAccount {
    param([Parameter(Mandatory)][string]$UserName)
    $res = [ordered]@{ ok = $false; outcome = $null; error = $null; enabledAfter = $null }
    if (-not $Script:ApplyMode) { $res.ok = $true; $res.outcome = 'WOULD_DISABLE'; return $res }
    try { Invoke-Mutation -Description "전용 계정 비활성화: $UserName" -Action { Disable-LocalUser -Name $UserName -ErrorAction Stop } | Out-Null }
    catch { $res.error = $_.Exception.Message }
    try {
        $u = Get-LocalUser -Name $UserName -ErrorAction Stop
        $res.enabledAfter = [bool]$u.Enabled
    } catch {
        $res.outcome = 'READ_FAILED'; $res.error = (@($res.error, $_.Exception.Message) | Where-Object { $_ }) -join ' / '
        return $res
    }
    if ($res.enabledAfter -eq $false) { $res.ok = $true; $res.outcome = 'DISABLED'; if ($res.error) { $res.outcome = 'DISABLED_DESPITE_ERROR' }; return $res }
    $res.outcome = 'SET_FAILED'
    if (-not $res.error) { $res.error = '오류 없이 끝났지만 읽어 보니 계정이 아직 켜져 있다' }
    $res
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
# 정상적인 빈 목록(이벤트 0건)도 받는다. 프로세스 기록이 비어 있는지는 호출자(Get-BlockEvidence)가 따로 구분한다.
function Select-MatchingBlockEvents {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Events,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Processes,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Probes,
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
# Evidence 는 collectionOk, auditFailureEnabled, wrapped, processRecordsOk, matchedCount 를 모두 가져야 한다(하나라도 빠지면 증거 부족).
function Get-ProbeVerdict {
    param(
        [Parameter(Mandatory)][ValidateSet('allowed', 'blocked')][string]$Expectation,
        [Parameter(Mandatory)][bool]$Connected,
        [Parameter(Mandatory)][hashtable]$Evidence
    )
    if ($Expectation -eq 'allowed') {
        if ($Connected) { return 'ALLOWED_AS_EXPECTED' } else { return 'UNEXPECTEDLY_FAILED' }
    }
    if ($Connected) { return 'NOT_BLOCKED' }
    foreach ($k in 'collectionOk', 'auditFailureEnabled', 'wrapped', 'processRecordsOk', 'matchedCount') { if (-not $Evidence.ContainsKey($k)) { return 'FAILED_EVIDENCE_UNAVAILABLE' } }
    if ($Evidence.collectionOk -ne $true -or $Evidence.auditFailureEnabled -ne $true -or $Evidence.wrapped -ne $false -or $Evidence.processRecordsOk -ne $true) { return 'FAILED_EVIDENCE_UNAVAILABLE' }
    if ($Evidence.matchedCount -ge 1) { return 'OS_BLOCK_OBSERVED' }
    'FAILED_WITHOUT_OS_EVIDENCE'
}

# 증거 수집 전체: 로그 읽기 → 이번 실행과 맞추기. 읽지 못하면 건수를 $null 로 둔다(0 이 아니다).
# 프로세스 기록이 하나도 없으면(필수 기록 누락) 로그를 읽어 "0건"을 만들지 않고 processRecordsOk=$false 로 돌려준다.
function Get-BlockEvidence {
    param(
        [Parameter(Mandatory)][hashtable]$Baseline,        # lastRecordId, oldestRecordNumber (실행 직전 값)
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Processes,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Probes,
        $AuditFailureEnabled
    )
    $ev = [ordered]@{
        collection = [ordered]@{ ok = $false; error = $null; auditFailureEnabled = $AuditFailureEnabled; wrapped = $null }
        processRecordsOk = (@($Processes).Count -gt 0); countsUsable = $false
        matchedCount = $null; matched = $null; runOtherDestinationCount = $null; unidentifiedCount = $null; unidentified = $null
    }
    if (-not $ev.processRecordsOk) { $ev.collection.error = '필수 프로세스 기록이 없다(이벤트 0건과 다르다)'; return $ev }
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
    # 건수는 "믿을 수 있을 때만" 숫자로 내놓는다: 실패 감사가 켜져 있었다고 확인됐고(=true) 기준점 이후 로그가 밀리지 않았을 때(=false).
    # 그렇지 않으면 읽은 이벤트가 0건이어도 0건이라고 하지 않고 null 로 둔다(읽은 숫자는 진단용으로만 unreliableCounts 에 남긴다).
    $countsUsable = ($AuditFailureEnabled -eq $true) -and ($wrapped -eq $false)
    $ev.countsUsable = $countsUsable
    if ($countsUsable) {
        $ev.matchedCount = $mc
        $ev.matched = $sel.matched
        $ev.runOtherDestinationCount = @($sel.runOtherDestination).Count
        $ev.unidentifiedCount = @($sel.unidentified).Count
        $ev.unidentified = $sel.unidentified
    } else {
        $ev.unreliableCounts = [ordered]@{ matched = $mc; unidentified = @($sel.unidentified).Count; note = '실패 감사 상태가 확인되지 않았거나 로그가 밀려서, 읽은 이벤트 수를 0건/N건으로 해석하지 않는다.' }
    }
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
# Registry(호출자의 복구 목록)에는 설정을 시도하기 *전에* 단계를 넣는다. 그래서 설정 직후 읽기 실패 같은 중간 오류가 나도 호출자의 finally 가 이 단계를 복구한다.
function Open-IsoAuditWindow {
    param(
        [Parameter(Mandatory)][string]$Guid, [Parameter(Mandatory)][bool]$EnableSuccess, [Parameter(Mandatory)][bool]$EnableFailure,
        [Parameter(Mandatory)][System.Collections.IList]$Registry, [string]$Why
    )
    $backup = Join-Path $Script:IsoRunDir ('auditpol-before-{0}.csv' -f [DateTime]::UtcNow.ToString('HHmmssfff'))
    $cur = Get-AuditSettings -BackupPath $backup
    if (-not $cur.Ok -or -not $cur.Values.ContainsKey($Guid)) { throw '감사 정책의 현재 값을 읽지 못해 원래 값을 알 수 없다. 바꾸지 않는다.' }
    $orig = [int]$cur.Values[$Guid]
    $flags = ConvertTo-AuditFlags -Value $orig
    if (-not $flags.Supported) { throw "지원하지 않는 감사 값($orig)이다. 추측하지 않고 바꾸지 않는다." }
    $wantS = ($flags.Success -or $EnableSuccess); $wantF = ($flags.Failure -or $EnableFailure)
    $set = 0; if ($wantS) { $set = $set -bor 1 }; if ($wantF) { $set = $set -bor 2 }
    # 여기까지는 아무것도 바꾸지 않았다. 이제부터는 단계를 먼저 남기고(intent), 호출자의 복구 목록에도 넣은 뒤 바꾼다.
    $step = Add-IsoStep -Kind 'auditSetting' -Name $Guid -Detail @{ original = $orig; set = $set; changed = ($set -ne $orig); backupFile = (Split-Path $backup -Leaf) }
    [void]$Registry.Add($step)
    if ($set -eq $orig) { Complete-IsoStep -Step $step -State 'unchanged'; return $step }
    Complete-IsoStep -Step $step -State 'applying'
    try {
        Set-AuditSubcategory -Guid $Guid -Success $wantS -Failure $wantF -Why $Why
    } catch {
        # auditpol 이 실패했어도 실제로 적용됐는지는 모른다 → 단계를 복구 대상으로 남기고(원래 값·설정 값 보존) 오류를 올린다.
        $step.detail['error'] = $_.Exception.Message
        Complete-IsoStep -Step $step -State 'apply-failed'
        throw
    }
    if ($Script:ApplyMode) {
        $after = Get-AuditSettings -BackupPath ($backup + '.after.csv')
        if (-not $after.Ok -or -not $after.Values.ContainsKey($Guid) -or [int]$after.Values[$Guid] -ne $set) {
            $step.detail['error'] = '설정 직후 다시 읽은 값이 없거나 설정 값과 다르다'
            Complete-IsoStep -Step $step -State 'applied-unverified'
            throw "감사 값을 $set 으로 바꿨지만 다시 읽어 확인하지 못했다. 복구 대상으로 남긴다."
        }
    }
    Complete-IsoStep -Step $step -State 'applied'
    $step
}

# 복구하고, 결과를 구조화해서 돌려준다. 예외를 올리지 않는다. 호출자는 outcome 으로 구분한다:
#   RESTORED          우리가 바꾼 값이었고 되돌린 뒤 다시 읽어 원래 값임을 확인했다
#   ALREADY_RESTORED  읽어 보니 이미 원래 값이다(누군가 되돌렸거나 설정이 적용되지 않았다)
#   NOT_CHANGED       바꾼 적이 없다
#   WOULD_RESTORE     dry-run: 설정 값이라 되돌릴 것이다
#   READ_FAILED       현재 값을 읽지 못했다(복구하지 않았다)
#   SET_FAILED        되돌리는 설정이 실패했다
#   VERIFY_FAILED     되돌렸다고 했지만 다시 읽지 못했거나 원래 값이 아니다
#   DRIFT             설정 값도 원래 값도 아니다 → 제3자의 변경으로 보고 덮어쓰지 않았다
# ok 는 RESTORED / ALREADY_RESTORED / NOT_CHANGED / WOULD_RESTORE 만 $true. 상태(state)는 실제로 읽어 확인한 뒤에만 'restored' 로 바꾼다.
function Close-IsoAuditWindow {
    param([Parameter(Mandatory)]$Step)
    $guid = [string]$Step.name
    $orig = [int](Get-IsoProp $Step.detail 'original'); $set = [int](Get-IsoProp $Step.detail 'set')
    $res = [ordered]@{ ok = $false; outcome = $null; guid = $guid; original = $orig; set = $set; current = $null; error = $null }
    $state = [string]$Step.state
    if ($state -eq 'unchanged' -or (Get-IsoProp $Step.detail 'changed') -eq $false) { $res.ok = $true; $res.outcome = 'NOT_CHANGED'; return $res }
    $readOnce = {
        $c = Get-AuditSettings -BackupPath (Join-Path $Script:IsoRunDir ('auditpol-restore-{0}.csv' -f [DateTime]::UtcNow.ToString('HHmmssfff')))
        if ($c.Ok -and $c.Values.ContainsKey($guid)) { return [int]$c.Values[$guid] }
        $null
    }
    $now = & $readOnce
    $res.current = $now
    if ($null -eq $now) {
        $res.outcome = 'READ_FAILED'; $res.error = '현재 감사 값을 읽지 못했다'
        $Step.detail['restoreError'] = $res.error
        Complete-IsoStep -Step $Step -State 'restore-read-failed'
        return $res
    }
    if ($now -eq $orig) {
        $res.ok = $true; $res.outcome = 'ALREADY_RESTORED'
        Complete-IsoStep -Step $Step -State 'restored'
        return $res
    }
    if ($now -ne $set) {
        # 설정 값도 원래 값도 아니다: 제3자가 바꿨다. 덮어쓰지 않는다.
        $res.outcome = 'DRIFT'; $res.error = "현재 값 $now 는 우리가 설정한 값($set)도 원래 값($orig)도 아니다"
        $Step.detail['restoreNote'] = "DRIFT: 현재 $now"
        Complete-IsoStep -Step $Step -State 'drift-not-restored'
        return $res
    }
    if (-not $Script:ApplyMode) { $res.ok = $true; $res.outcome = 'WOULD_RESTORE'; return $res }
    $f = ConvertTo-AuditFlags -Value $orig
    try {
        Set-AuditSubcategory -Guid $guid -Success $f.Success -Failure $f.Failure -Why '감사 창 종료: 원래 값으로 복구'
    } catch {
        $res.outcome = 'SET_FAILED'; $res.error = $_.Exception.Message
        $Step.detail['restoreError'] = $res.error
        Complete-IsoStep -Step $Step -State 'restore-set-failed'
        return $res
    }
    $after = & $readOnce
    $res.current = $after
    if ($null -eq $after) {
        $res.outcome = 'VERIFY_FAILED'; $res.error = '되돌린 뒤 값을 읽지 못해 확인하지 못했다'
        Complete-IsoStep -Step $Step -State 'restore-unverified'
        return $res
    }
    if ($after -ne $orig) {
        $res.outcome = 'VERIFY_FAILED'; $res.error = "되돌린 뒤 읽은 값 $after 가 원래 값 $orig 와 다르다"
        Complete-IsoStep -Step $Step -State 'restore-unverified'
        return $res
    }
    $res.ok = $true; $res.outcome = 'RESTORED'
    Complete-IsoStep -Step $Step -State 'restored'
    $res
}
