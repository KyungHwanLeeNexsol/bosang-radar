<#
  격리 기준 저장·직접 확인·비교(Save-IsolationBaseline.ps1)의 핵심 함수. 직접 실행하지 않고 점 읽기(. .\IsolationBaselineCore.ps1)로 불러온다.

  규칙
  - 이 파일을 불러오는 것만으로는 아무것도 읽거나 바꾸지 않는다.
  - 시스템은 읽기만 한다. 파일 쓰기는 Write-BlJsonFile 한 곳(출력 JSON 파일 하나)뿐이다. 계정·방화벽·감사·ACL·레지스트리를 바꾸는 호출은 없다.
  - 읽기는 모두 작은 "포트" 함수(Read-Bl*)로 나눴다. 시험은 포트를 대체한다. 판정(Compare-Bl*)은 부작용 없는 순수 함수다.
  - 항목마다 status 는 OK | NOT_PRESENT | READ_FAILED 이고 value 는 문자열이다. 비교는 fail-closed:
      같다 = 양쪽이 OK 이면서 값이 비어 있지 않고 같은 경우, 또는 양쪽이 근거(reason)가 있는 NOT_PRESENT 인 경우뿐.
      READ_FAILED, null, 빈 문자열, 한쪽에만 있는 키는 절대 "같다"가 아니다(UNVERIFIABLE). null==null, ""=="" 는 일치로 세지 않는다.
  - 키는 전체 정규화 경로(file:<전체 경로>) 또는 겹치지 않는 역할 이름(role:venv-python.exe)이다. 파일 이름만으로 키를 만들지 않는다.
    저장 단계는 키 중복을 검사하고 중복이면 실패한다(값을 덮어쓰지 않는다).
  - Windows PowerShell 5.1 과 pwsh 7 에서 모두 돌아야 한다: 삼항·?? 를 쓰지 않고, 해시는 .NET 으로 계산한다(Get-FileHash 를 쓰지 않는다).
    메서드 인자 안에서 -replace/-split 에 쉼표를 쓰지 않는다(인자 구분으로 읽힌다). $home 은 자동 변수라 쓰지 않는다.
#>
Set-StrictMode -Version 2.0

$Script:BlSchema = 1
$Script:BlTool = 'IsolationBaseline'
$Script:BlIsoPrefix = 'bosang-semgrep-iso'
$Script:BlAuditGuids = @('{0CCE9226-69AE-11D9-BED3-505054503030}', '{0CCE922B-69AE-11D9-BED3-505054503030}')
$Script:BlSidAdministrators = 'S-1-5-32-544'
$Script:BlSidUsers = 'S-1-5-32-545'
$Script:BlRoleIds = @('venv-root', 'base-python-root', 'venv-python.exe', 'base-python.exe', 'semgrep.exe', 'semgrep-core.exe')
$Script:BlPathKinds = @('file', 'acl', 'ace', 'owner', 'tree', 'vfy-ace-run', 'vfy-ace-others')
$Script:BlRunIdPattern = '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$'
$Script:BlGrantMask = [int64]1179817   # 0x1200A9 = ReadAndExecute
$Script:BlReadExecuteBits = [int64]169 # 0xA9

# ══ 기본 도우미 ═══════════════════════════════════════════════════════════════
function Format-BlReason {
    param($Text)
    if ($null -eq $Text) { return '' }
    $s = ([string]$Text) -replace '\s+', ' '
    $s = $s.Trim()
    if ($s.Length -gt 300) { $s = $s.Substring(0, 300) + '...' }
    $s
}

function Limit-BlText {
    param($Text, [int]$Max = 400)
    if ($null -eq $Text) { return $null }
    $s = [string]$Text
    if ($s.Length -gt $Max) { return $s.Substring(0, $Max) + '...' }
    $s
}

# 객체·사전 어느 쪽이든 없는 속성은 $null (StrictMode 에서도 오류가 나지 않는다).
function Get-BlProp {
    param($Object, [Parameter(Mandatory)][string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) { if ($Object.Contains($Name)) { return $Object[$Name] }; return $null }
    $p = $Object.PSObject.Properties[$Name]
    if ($p) { return $p.Value }
    $null
}

# 값이 없거나 하나이거나 여러 개이거나 항상 "null 이 아닌 원소들"만 내보낸다. 호출자는 @(ConvertTo-BlArray $x) 로 받는다.
function ConvertTo-BlArray {
    param($Value)
    if ($null -eq $Value) { return }
    foreach ($v in @($Value)) { if ($null -ne $v) { $v } }
}

# 문자열을 서수(ordinal) 순서로 정렬한다. 빈 문자열과 null 은 버린다. 호출자는 @(Sort-BlOrdinal ...) 로 받는다.
function Sort-BlOrdinal {
    param([string[]]$Lines)
    $list = New-Object 'System.Collections.Generic.List[string]'
    foreach ($l in @($Lines)) { if (-not [string]::IsNullOrEmpty($l)) { $list.Add($l) } }
    $list.Sort([StringComparer]::Ordinal)
    foreach ($x in $list) { $x }
}

# 목록 값의 표준형: 첫 줄 count=N, 이어서 서수 정렬한 줄들(LF). 빈 목록도 count=0 이라 빈 문자열이 되지 않는다.
function ConvertTo-BlListValue {
    param($Lines)
    $clean = New-Object System.Collections.ArrayList
    foreach ($l in @($Lines)) {
        if ($null -eq $l) { continue }
        $t = ([string]$l) -replace '[\r\n]+', ' '
        [void]$clean.Add($t)
    }
    $sorted = @(Sort-BlOrdinal -Lines ([string[]]$clean.ToArray()))
    if ($sorted.Count -eq 0) { return 'count=0' }
    return ('count={0}' -f $sorted.Count) + "`n" + ($sorted -join "`n")
}

function ConvertFrom-BlListValue {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return }
    $parts = @($Value -split "`n")
    for ($i = 1; $i -lt $parts.Count; $i++) { if ($parts[$i].Length -gt 0) { $parts[$i] } }
}

# "path=<경로>" 줄 + 목록 값. 작업 루트·프로필 폴더 목록처럼 어느 경로의 목록인지 함께 기록할 때 쓴다.
function Format-BlPathedList {
    param([string]$Path, $Lines)
    ('path={0}' -f $Path) + "`n" + (ConvertTo-BlListValue -Lines $Lines)
}

function Split-BlPathedList {
    param([string]$Value)
    $r = @{ Ok = $false; Path = $null; Lines = @() }
    if ([string]::IsNullOrEmpty($Value)) { return $r }
    $nl = $Value.IndexOf("`n")
    if ($nl -lt 0) { return $r }
    $first = $Value.Substring(0, $nl)
    $rest = $Value.Substring($nl + 1)
    if (-not $first.StartsWith('path=') -or -not $rest.StartsWith('count=')) { return $r }
    $r['Ok'] = $true
    $r['Path'] = $first.Substring(5)
    $r['Lines'] = @(ConvertFrom-BlListValue -Value $rest)
    $r
}

function Test-BlRootedPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    ($Path -match '^[A-Za-z]:[\\/]') -or ($Path -match '^\\\\')
}

function ConvertTo-BlFullPath {
    param([Parameter(Mandatory)][string]$Path)
    $full = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($full)
    if ($full.Length -gt $root.Length) { $full = $full.TrimEnd('\', '/') }
    $full
}

# ══ 키·항목 ═══════════════════════════════════════════════════════════════════
# 키는 소문자로 정규화한다. 경로 종류(file/acl/ace/owner/tree …)는 전체 경로만 받는다: 파일 이름만으로는 키를 만들 수 없다.
function New-BlKey {
    param([Parameter(Mandatory)][string]$Kind, [Parameter(Mandatory)][string]$Id)
    if ($Kind -notmatch '^[a-z][a-z0-9-]*$') { throw ('키 종류가 올바르지 않다: {0}' -f $Kind) }
    if ([string]::IsNullOrWhiteSpace($Id)) { throw ('키 식별자가 비었다: {0}' -f $Kind) }
    $idv = $Id
    if ($Script:BlPathKinds -contains $Kind) {
        if (-not (Test-BlRootedPath $idv)) { throw ('경로 키는 전체 경로여야 한다(파일 이름만으로 키를 만들지 않는다): {0}:{1}' -f $Kind, $Id) }
        $idv = ConvertTo-BlFullPath -Path $idv
    }
    if ($Kind -eq 'role' -and ($Script:BlRoleIds -notcontains $idv)) { throw ('알 수 없는 역할 이름: {0}' -f $Id) }
    ('{0}:{1}' -f $Kind, $idv).ToLowerInvariant()
}

function Test-BlStatus {
    param([string]$Status)
    ($Status -ceq 'OK') -or ($Status -ceq 'NOT_PRESENT') -or ($Status -ceq 'READ_FAILED')
}

# 항목을 만든다. 정규화(fail-closed):
#  - OK 인데 값이 null/빈/공백이면 READ_FAILED(EMPTY_VALUE)
#  - NOT_PRESENT 인데 근거(Reason)가 없으면 READ_FAILED(ABSENCE_UNPROVEN)  — NOT_PRESENT 는 "없음을 실제로 읽어 확인했다"는 뜻이다
#  - READ_FAILED 는 값을 버리고 이유를 남긴다(비밀을 넣지 않는다)
function New-BlItem {
    # Kind·Status 는 Mandatory 로 두지 않는다: 저장본에서 빈 문자열로 읽힌 값이 바인딩 오류가 아니라 INVALID_STATUS(확인 불가)가 되게 한다.
    param([Parameter(Mandatory)][string]$Key, [string]$Kind = '', [string]$Status = '', $Value = $null, [string]$Reason = '')
    $st = $Status
    $why = Format-BlReason $Reason
    if (-not (Test-BlStatus $st)) { $st = 'READ_FAILED'; $why = 'INVALID_STATUS' }
    $val = $null
    if ($st -ceq 'OK') {
        if ($null -ne $Value) { $val = [string]$Value }
        if ([string]::IsNullOrWhiteSpace($val)) { $st = 'READ_FAILED'; $val = $null; $why = 'EMPTY_VALUE' }
    } elseif ($st -ceq 'NOT_PRESENT') {
        if ($why.Length -eq 0) { $st = 'READ_FAILED'; $why = 'ABSENCE_UNPROVEN' }
    }
    if ($st -ceq 'READ_FAILED' -and $why.Length -eq 0) { $why = 'UNKNOWN' }
    [ordered]@{ key = $Key; kind = $Kind; status = $st; value = $val; reason = $why }
}

function Copy-BlItemAs {
    param($Item, [Parameter(Mandatory)][string]$Key, [string]$Kind = '')
    New-BlItem -Key $Key -Kind $Kind -Status ([string](Get-BlProp $Item 'status')) -Value (Get-BlProp $Item 'value') -Reason ([string](Get-BlProp $Item 'reason'))
}

# 중복 키(대소문자 무시)를 돌려준다. 저장 단계는 하나라도 있으면 실패한다.
function Get-BlDuplicateKeys {
    param($Items)
    $seen = @{}
    $dups = @{}
    foreach ($it in @($Items)) {
        if ($null -eq $it) { continue }
        $k = [string](Get-BlProp $it 'key')
        if ([string]::IsNullOrWhiteSpace($k)) { $k = '(blank)' }
        if ($seen.ContainsKey($k)) { $dups[$k] = $true } else { $seen[$k] = $true }
    }
    Sort-BlOrdinal -Lines ([string[]]@($dups.Keys))
}

# ══ 순수 비교(부작용 없음) ═══════════════════════════════════════════════════
function Get-BlListDelta {
    param([string]$Expected, [string]$Actual)
    if (-not ($Expected.StartsWith('count=') -and $Actual.StartsWith('count='))) { return $null }
    $e = @(ConvertFrom-BlListValue -Value $Expected)
    $a = @(ConvertFrom-BlListValue -Value $Actual)
    $cnt = @{}
    foreach ($l in $e) { if ($cnt.ContainsKey($l)) { $cnt[$l] = [int]$cnt[$l] + 1 } else { $cnt[$l] = 1 } }
    $added = New-Object System.Collections.ArrayList
    foreach ($l in $a) {
        if ($cnt.ContainsKey($l) -and [int]$cnt[$l] -gt 0) { $cnt[$l] = [int]$cnt[$l] - 1 } else { [void]$added.Add($l) }
    }
    $removed = New-Object System.Collections.ArrayList
    foreach ($k in @($cnt.Keys)) { for ($i = 0; $i -lt [int]$cnt[$k]; $i++) { [void]$removed.Add([string]$k) } }
    $addedShown = Limit-BlText (($added | Select-Object -First 5) -join ' ; ') 300
    $removedShown = Limit-BlText (($removed | Select-Object -First 5) -join ' ; ') 300
    '추가 {0}개 [{1}] / 제거 {2}개 [{3}]' -f $added.Count, $addedShown, $removed.Count, $removedShown
}

# 항목 하나의 비교. verdict ∈ SAME | DIFFERENT | UNVERIFIABLE
function Compare-BlItem {
    param($Expected, $Actual, [string]$Key = '')
    $verdict = 'UNVERIFIABLE'
    $code = ''
    $detail = ''
    $es = $null; $as = $null; $ev = $null; $av = $null; $er = ''; $ar = ''
    if ($null -eq $Expected -or $null -eq $Actual) {
        if ($null -eq $Expected -and $null -eq $Actual) { $code = 'MISSING_BOTH' }
        elseif ($null -eq $Expected) { $code = 'MISSING_EXPECTED' }
        else { $code = 'MISSING_ACTUAL' }
        $detail = '한쪽(또는 양쪽)에 이 키가 없다: 같다고 말하지 않는다'
    } else {
        $es = [string](Get-BlProp $Expected 'status')
        $as = [string](Get-BlProp $Actual 'status')
        $ev = Get-BlProp $Expected 'value'
        $av = Get-BlProp $Actual 'value'
        $er = [string](Get-BlProp $Expected 'reason')
        $ar = [string](Get-BlProp $Actual 'reason')
        $ek = [string](Get-BlProp $Expected 'key')
        $ak = [string](Get-BlProp $Actual 'key')
        if (-not [string]::Equals($ek, $ak, [StringComparison]::OrdinalIgnoreCase)) {
            $code = 'KEY_MISMATCH'
            $detail = ('키가 다르다: {0} / {1}' -f $ek, $ak)
        } elseif (-not (Test-BlStatus $es) -or -not (Test-BlStatus $as)) {
            $code = 'INVALID_STATUS'
            $detail = ('status 가 올바르지 않다: expected={0} actual={1}' -f $es, $as)
        } elseif ($es -ceq 'READ_FAILED' -or $as -ceq 'READ_FAILED') {
            $code = 'READ_FAILED'
            $detail = ('읽지 못한 항목이 있어 비교할 수 없다: expected={0}({1}) actual={2}({3})' -f $es, (Limit-BlText $er 120), $as, (Limit-BlText $ar 120))
        } elseif ($es -ceq 'NOT_PRESENT' -and $as -ceq 'NOT_PRESENT') {
            if ([string]::IsNullOrWhiteSpace($er) -or [string]::IsNullOrWhiteSpace($ar)) {
                $code = 'ABSENCE_UNPROVEN'
                $detail = '없음의 근거가 한쪽에 없다: 없다고 말하지 않는다'
            } else {
                $verdict = 'SAME'
                $code = 'BOTH_VERIFIED_ABSENT'
            }
        } elseif ($es -cne $as) {
            $verdict = 'DIFFERENT'
            $code = 'PRESENCE_DIFFERS'
            $detail = ('읽어서 확인한 상태가 다르다: expected={0} actual={1}' -f $es, $as)
        } else {
            if ([string]::IsNullOrWhiteSpace([string]$ev) -or [string]::IsNullOrWhiteSpace([string]$av)) {
                $code = 'EMPTY_VALUE'
                $detail = '값이 비어 있어 같다고 말하지 않는다'
            } elseif ([string]::Equals([string]$ev, [string]$av, [StringComparison]::Ordinal)) {
                $verdict = 'SAME'
                $code = 'VALUES_EQUAL'
            } else {
                $verdict = 'DIFFERENT'
                $code = 'VALUE_DIFFERS'
                $delta = Get-BlListDelta -Expected ([string]$ev) -Actual ([string]$av)
                if ($null -ne $delta) { $detail = $delta }
                else { $detail = ('expected={0} actual={1}' -f (Limit-BlText $ev 150), (Limit-BlText $av 150)) }
            }
        }
    }
    [ordered]@{
        key = $Key; verdict = $verdict; code = $code; detail = $detail
        expectedStatus = $es; actualStatus = $as
        expected = (Limit-BlText $ev); actual = (Limit-BlText $av)
        expectedReason = $er; actualReason = $ar
    }
}

function Get-BlIndex {
    param($Items)
    $idx = @{}
    $dups = @{}
    $blank = 0
    foreach ($it in @($Items)) {
        if ($null -eq $it) { continue }
        $k = [string](Get-BlProp $it 'key')
        if ([string]::IsNullOrWhiteSpace($k)) { $blank++; continue }
        if ($idx.ContainsKey($k)) { $dups[$k] = $true; continue }
        $idx[$k] = $it
    }
    @{ Index = $idx; Dups = $dups; Blank = $blank }
}

function Get-BlOverall {
    param($Results)
    $r = @($Results | Where-Object { $null -ne $_ })
    if ($r.Count -eq 0) { return 'UNVERIFIABLE' }
    $diff = 0; $unv = 0
    foreach ($x in $r) {
        $v = [string]$x['verdict']
        if ($v -ceq 'DIFFERENT') { $diff++ }
        elseif ($v -cne 'SAME') { $unv++ }
    }
    if ($diff -gt 0) { return 'DIFFERENT' }
    if ($unv -gt 0) { return 'UNVERIFIABLE' }
    'EQUAL'
}

# EQUAL 0 / DIFFERENT 1 / UNVERIFIABLE 2. (사용법·입출력 오류는 3)
function Get-BlExitCode {
    param([string]$Overall)
    if ($Overall -ceq 'EQUAL') { return 0 }
    if ($Overall -ceq 'DIFFERENT') { return 1 }
    2
}

# 기대 항목 집합과 실제 항목 집합의 비교. Scope='Union' 은 한쪽에만 있는 키도 비교 대상이고(같지 않다), 'Expected' 는 기대 쪽 키만 본다.
function Compare-BlSets {
    param($Expected, $Actual, [string]$Scope = 'Union')
    $ei = Get-BlIndex -Items $Expected
    $ai = Get-BlIndex -Items $Actual
    $keys = New-Object 'System.Collections.Generic.List[string]'
    $seen = @{}
    foreach ($k in @($ei['Index'].Keys)) { if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $keys.Add([string]$k) } }
    foreach ($k in @($ei['Dups'].Keys)) { if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $keys.Add([string]$k) } }
    if ($Scope -ceq 'Union') {
        foreach ($k in @($ai['Index'].Keys)) { if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $keys.Add([string]$k) } }
        foreach ($k in @($ai['Dups'].Keys)) { if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $keys.Add([string]$k) } }
    }
    $sortedKeys = @(Sort-BlOrdinal -Lines ([string[]]$keys.ToArray()))
    $results = New-Object System.Collections.ArrayList
    foreach ($k in $sortedKeys) {
        if ($ei['Dups'].ContainsKey($k) -or $ai['Dups'].ContainsKey($k)) {
            [void]$results.Add([ordered]@{ key = $k; verdict = 'UNVERIFIABLE'; code = 'DUPLICATE_KEY'; detail = '같은 키가 두 번 이상 있어 어느 값인지 알 수 없다'; expectedStatus = $null; actualStatus = $null; expected = $null; actual = $null; expectedReason = ''; actualReason = '' })
            continue
        }
        $e = $null; if ($ei['Index'].ContainsKey($k)) { $e = $ei['Index'][$k] }
        $a = $null; if ($ai['Index'].ContainsKey($k)) { $a = $ai['Index'][$k] }
        [void]$results.Add((Compare-BlItem -Expected $e -Actual $a -Key $k))
    }
    if ([int]$ei['Blank'] -gt 0 -or [int]$ai['Blank'] -gt 0) {
        [void]$results.Add([ordered]@{ key = '(blank)'; verdict = 'UNVERIFIABLE'; code = 'BLANK_KEY'; detail = '키가 비어 있는 항목이 있다'; expectedStatus = $null; actualStatus = $null; expected = $null; actual = $null; expectedReason = ''; actualReason = '' })
    }
    $same = 0; $diff = 0; $unv = 0
    foreach ($r in $results) {
        $v = [string]$r['verdict']
        if ($v -ceq 'SAME') { $same++ } elseif ($v -ceq 'DIFFERENT') { $diff++ } else { $unv++ }
    }
    @{ Results = $results.ToArray(); Overall = (Get-BlOverall -Results $results.ToArray()); Counts = [ordered]@{ same = $same; different = $diff; unverifiable = $unv } }
}

# ══ 읽기 포트(시험이 대체한다). 반환: Ok=$true/$false 를 가진 사전. 읽기 전용 ═══════════
function Invoke-BlPort {
    param([Parameter(Mandatory)][string]$Name, [hashtable]$Arguments = @{})
    $r = $null
    try { $r = & $Name @Arguments } catch { return @{ Ok = $false; Error = (Format-BlReason ('{0}: {1}' -f $Name, $_.Exception.Message)) } }
    $arr = @($r)
    if ($arr.Count -ne 1 -or $arr[0] -isnot [System.Collections.IDictionary]) { return @{ Ok = $false; Error = ('{0}: PORT_RESULT_INVALID' -f $Name) } }
    $d = $arr[0]
    if (-not $d.Contains('Ok')) { return @{ Ok = $false; Error = ('{0}: PORT_RESULT_HAS_NO_OK' -f $Name) } }
    $d
}

function ConvertTo-BlPortFailure {
    param($Port)
    $e = $null
    if ($null -ne $Port -and ($Port -is [System.Collections.IDictionary]) -and $Port.Contains('Error')) { $e = $Port['Error'] }
    $t = Format-BlReason $e
    if ($t.Length -eq 0) { $t = 'PORT_FAILED' }
    $t
}

function Test-BlElevated {
    try {
        $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
        return [bool]$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch { return $false }
}

function Get-BlExceptionText {
    param($ErrorRecord)
    $ex = $ErrorRecord.Exception
    if ($ex.InnerException) { $ex = $ex.InnerException }
    Format-BlReason ('{0}: {1}' -f $ex.GetType().Name, $ex.Message)
}

# 경로 상태: FILE | DIR | ABSENT(없음을 실제로 확인) | ERROR(읽지 못함). ABSENT 는 FileNotFound/DirectoryNotFound 로만 인정한다.
function Read-BlPathState {
    param([string]$Path)
    try {
        $attr = [IO.File]::GetAttributes($Path)
        $isDir = (($attr -band [IO.FileAttributes]::Directory) -ne 0)
        $isRp = (($attr -band [IO.FileAttributes]::ReparsePoint) -ne 0)
        $kind = 'FILE'; if ($isDir) { $kind = 'DIR' }
        return @{ Ok = $true; State = $kind; Reparse = $isRp; Error = $null }
    } catch {
        $ex = $_.Exception
        if ($ex.InnerException) { $ex = $ex.InnerException }
        if (($ex -is [IO.FileNotFoundException]) -or ($ex -is [IO.DirectoryNotFoundException])) {
            return @{ Ok = $true; State = 'ABSENT'; Reparse = $false; Error = $null }
        }
        return @{ Ok = $false; State = 'ERROR'; Reparse = $false; Error = (Get-BlExceptionText $_) }
    }
}

# 파일의 크기와 SHA-256(.NET). 다른 프로세스가 읽는 중이어도 열 수 있게 ReadWrite 공유로 연다.
function Read-BlFileFacts {
    param([string]$Path)
    $fs = $null; $sha = $null
    try {
        $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        $sha = [Security.Cryptography.SHA256]::Create()
        $hash = $sha.ComputeHash($fs)
        $hex = (($hash | ForEach-Object { $_.ToString('x2') }) -join '')
        return @{ Ok = $true; Size = [int64]$fs.Length; Sha256 = $hex; Error = $null }
    } catch {
        return @{ Ok = $false; Size = $null; Sha256 = $null; Error = (Get-BlExceptionText $_) }
    } finally {
        if ($null -ne $fs) { $fs.Dispose() }
        if ($null -ne $sha) { $sha.Dispose() }
    }
}

# ACL 한 번 읽기: SDDL(소유자·그룹·DACL), 소유자·그룹 SID, ACE 줄 목록(형식: 종류|SID|0x권한|inh=N|prop=N|inherited=True/False)
function Read-BlAcl {
    param([string]$Path)
    try {
        $acl = $null
        try { $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop }
        catch {
            $first = $_.Exception.Message
            $acl = $null
            try {
                if ([IO.Directory]::Exists($Path)) { $acl = (New-Object IO.DirectoryInfo($Path)).GetAccessControl() }
                else { $acl = (New-Object IO.FileInfo($Path)).GetAccessControl() }
            } catch { throw $first }
            if ($null -eq $acl) { throw $first }
        }
        $sections = [Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
        $sddl = [string]$acl.GetSecurityDescriptorSddlForm($sections)
        $owner = $null; $group = $null
        try { $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value } catch { $owner = $null }
        try { $group = $acl.GetGroup([Security.Principal.SecurityIdentifier]).Value } catch { $group = $null }
        $aces = New-Object System.Collections.ArrayList
        foreach ($r in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
            $mask = ([int64][int]$r.FileSystemRights) -band [int64]4294967295
            $line = '{0}|{1}|0x{2:x}|inh={3}|prop={4}|inherited={5}' -f $r.AccessControlType, $r.IdentityReference.Value, $mask, [int]$r.InheritanceFlags, [int]$r.PropagationFlags, $r.IsInherited
            [void]$aces.Add($line)
        }
        return @{ Ok = $true; Sddl = $sddl; Owner = $owner; Group = $group; Aces = $aces.ToArray(); Error = $null }
    } catch {
        return @{ Ok = $false; Sddl = $null; Owner = $null; Group = $null; Aces = @(); Error = (Get-BlExceptionText $_) }
    }
}

# 로컬 계정 목록(ADSI WinNT 공급자: 모듈 자동 로드에 기대지 않는다). psbase 로 .NET 속성을 읽는다(ADSI 어댑터가 이름을 가리는 것을 피한다).
function Read-BlLocalUsers {
    try {
        $comp = New-Object System.DirectoryServices.DirectoryEntry(('WinNT://{0},computer' -f $env:COMPUTERNAME))
        $users = New-Object System.Collections.ArrayList
        foreach ($c in $comp.psbase.Children) {
            if ([string]$c.psbase.SchemaClassName -ne 'User') { continue }
            $sidBytes = [byte[]]$c.psbase.Properties['objectSid'].Value
            $sid = (New-Object Security.Principal.SecurityIdentifier($sidBytes, 0)).Value
            $flags = [int]$c.psbase.Properties['UserFlags'].Value
            $desc = [string]$c.psbase.Properties['Description'].Value
            [void]$users.Add(@{ Name = [string]$c.psbase.Name; Sid = $sid; Enabled = (($flags -band 2) -eq 0); Description = $desc })
        }
        return @{ Ok = $true; Users = $users.ToArray(); Error = $null }
    } catch {
        return @{ Ok = $false; Users = @(); Error = (Get-BlExceptionText $_) }
    }
}

# 로컬 그룹(SID 로 지정)의 구성원 SID 목록
function Read-BlGroupMemberSids {
    param([string]$GroupSid)
    try {
        $nt = (New-Object Security.Principal.SecurityIdentifier($GroupSid)).Translate([Security.Principal.NTAccount]).Value
        $name = $nt.Substring($nt.LastIndexOf('\') + 1)
        $g = New-Object System.DirectoryServices.DirectoryEntry(('WinNT://{0}/{1},group' -f $env:COMPUTERNAME, $name))
        $sids = New-Object System.Collections.ArrayList
        $members = $g.psbase.Invoke('Members')
        foreach ($m in @($members)) {
            $b = [byte[]]($m.GetType().InvokeMember('objectSid', [Reflection.BindingFlags]::GetProperty, $null, $m, $null))
            [void]$sids.Add((New-Object Security.Principal.SecurityIdentifier($b, 0)).Value)
        }
        return @{ Ok = $true; Sids = $sids.ToArray(); Error = $null }
    } catch {
        return @{ Ok = $false; Sids = @(); Error = (Get-BlExceptionText $_) }
    }
}

# 방화벽 규칙 이름 전체와, 접두가 맞는 규칙의 속성. (NetSecurity 모듈 필요. 읽기만 한다)
function Read-BlFirewallRules {
    param([string]$Prefix)
    try {
        $all = @(Get-NetFirewallRule -ErrorAction Stop)
        $names = New-Object System.Collections.ArrayList
        $details = @{}
        foreach ($r in $all) {
            $n = [string]$r.Name
            [void]$names.Add($n)
            if ($n.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
                try {
                    $sf = $r | Get-NetFirewallSecurityFilter
                    $af = $r | Get-NetFirewallAddressFilter
                    $remote = @(Sort-BlOrdinal -Lines ([string[]]@($af.RemoteAddress | ForEach-Object { ([string]$_).ToLowerInvariant() })))
                    $details[$n] = @{
                        Ok = $true; Enabled = [string]$r.Enabled; Direction = [string]$r.Direction; Action = [string]$r.Action
                        Group = [string]$r.Group; Description = [string]$r.Description; LocalUser = [string]$sf.LocalUser; Remote = ($remote -join ',')
                    }
                } catch {
                    $details[$n] = @{ Ok = $false; Error = (Get-BlExceptionText $_) }
                }
            }
        }
        return @{ Ok = $true; Names = $names.ToArray(); Details = $details; Error = $null }
    } catch {
        return @{ Ok = $false; Names = @(); Details = @{}; Error = (Get-BlExceptionText $_) }
    }
}

# 감사 하위 범주 한 줄(auditpol /get … /r 의 데이터 행 원문). 로케일 문구를 해석하지 않고 GUID 가 든 행을 그대로 쓴다. 관리자 권한이 없으면 읽기 실패로 돌려준다.
function Read-BlAuditRow {
    param([string]$Guid)
    try {
        $exe = Join-Path $env:WINDIR 'System32\auditpol.exe'
        $out = & $exe '/get' ('/subcategory:' + $Guid) '/r' 2>&1
        $code = $LASTEXITCODE
        $lines = @($out | ForEach-Object { [string]$_ })
        if ($code -ne 0) { return @{ Ok = $false; Row = $null; Error = (Format-BlReason ('auditpol 종료 코드 {0}: {1}' -f $code, ($lines -join ' '))) } }
        $bare = $Guid.Trim('{', '}')
        $row = $null
        foreach ($l in $lines) { if ($l.IndexOf($bare, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $row = $l.Trim(); break } }
        if ([string]::IsNullOrWhiteSpace($row)) { return @{ Ok = $false; Row = $null; Error = 'GUID 가 든 행이 출력에 없다(NO_ROW)' } }
        return @{ Ok = $true; Row = $row; Error = $null }
    } catch {
        return @{ Ok = $false; Row = $null; Error = (Get-BlExceptionText $_) }
    }
}

function Read-BlDirNames {
    param([string]$Path)
    try {
        $names = @([IO.Directory]::GetFileSystemEntries($Path) | ForEach-Object { [IO.Path]::GetFileName($_) })
        return @{ Ok = $true; Names = $names; Error = $null }
    } catch {
        return @{ Ok = $false; Names = @(); Error = (Get-BlExceptionText $_) }
    }
}

function Read-BlProfileList {
    try {
        $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList')
        if ($null -eq $key) { throw 'ProfileList 키를 열 수 없다' }
        $dir = $null; $sids = @()
        try {
            $dir = [string]$key.GetValue('ProfilesDirectory')
            $sids = @($key.GetSubKeyNames())
        } finally { $key.Dispose() }
        if ([string]::IsNullOrWhiteSpace($dir)) { throw 'ProfilesDirectory 값이 비어 있다' }
        return @{ Ok = $true; ProfilesDirectory = $dir; Sids = $sids; Error = $null }
    } catch {
        return @{ Ok = $false; ProfilesDirectory = $null; Sids = @(); Error = (Get-BlExceptionText $_) }
    }
}

function Read-BlProcessNames {
    param([string]$Prefix)
    try {
        $ps = [Diagnostics.Process]::GetProcesses()
        $names = @()
        try {
            $names = @($ps | Where-Object { $_.ProcessName.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { [string]$_.ProcessName })
        } finally { foreach ($p in $ps) { $p.Dispose() } }
        return @{ Ok = $true; Names = $names; Error = $null }
    } catch {
        return @{ Ok = $false; Names = @(); Error = (Get-BlExceptionText $_) }
    }
}

function Read-BlTextFile {
    param([string]$Path, [int64]$MaxBytes = 67108864)
    try {
        $len = (New-Object IO.FileInfo($Path)).Length
        if ($len -gt $MaxBytes) { throw ('파일이 너무 크다: {0} 바이트' -f $len) }
        return @{ Ok = $true; Text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8); Error = $null }
    } catch {
        return @{ Ok = $false; Text = $null; Error = (Get-BlExceptionText $_) }
    }
}

# 폴더 트리의 파일 수·바이트(링크는 따라가지 않고 센다). 읽지 못한 폴더가 하나라도 있으면 실패로 돌려준다.
function Read-BlTreeStats {
    param([string]$Path)
    try {
        $files = [int64]0; $bytes = [int64]0; $dirs = [int64]0; $links = [int64]0; $errors = 0
        $stack = New-Object 'System.Collections.Generic.Stack[string]'
        $stack.Push($Path)
        while ($stack.Count -gt 0) {
            $d = $stack.Pop()
            try {
                $di = New-Object IO.DirectoryInfo($d)
                foreach ($f in $di.GetFiles()) { $files++; $bytes += [int64]$f.Length }
                foreach ($sd in $di.GetDirectories()) {
                    if ((([int]$sd.Attributes) -band ([int][IO.FileAttributes]::ReparsePoint)) -ne 0) { $links++ } else { $dirs++; $stack.Push($sd.FullName) }
                }
            } catch { $errors++ }
        }
        if ($errors -gt 0) { return @{ Ok = $false; Error = ('읽지 못한 폴더 {0}개' -f $errors) } }
        return @{ Ok = $true; Files = $files; Bytes = $bytes; Dirs = $dirs; Links = $links; Error = $null }
    } catch {
        return @{ Ok = $false; Error = (Get-BlExceptionText $_) }
    }
}

# ══ 이름: IsolationCommon.ps1 의 Get-IsoNames 와 같은 규칙(시험이 두 결과를 대조한다) ═══
function Test-BlRunId {
    param([string]$RunId)
    (-not [string]::IsNullOrWhiteSpace($RunId)) -and ($RunId -cmatch $Script:BlRunIdPattern)
}

function Get-BlRunNames {
    param([Parameter(Mandatory)][string]$RunId)
    if (-not (Test-BlRunId $RunId)) { throw ('RunId 형식이 올바르지 않다: {0}' -f $RunId) }
    $hex = ($RunId -split '-')[-1]
    $workRoot = $null; $workDir = $null
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramData)) {
        $workRoot = Join-Path $env:ProgramData $Script:BlIsoPrefix
        $workDir = Join-Path $workRoot $RunId
    }
    [ordered]@{
        RunId = $RunId; UserName = ('bsi' + $hex); RuleName = ('{0}-{1}-out' -f $Script:BlIsoPrefix, $RunId)
        Marker = ('{0}:{1}' -f $Script:BlIsoPrefix, $RunId); WorkRoot = $workRoot; WorkDir = $workDir
    }
}

# ══ 설치물 배치 ═══════════════════════════════════════════════════════════════
function Resolve-BlLayout {
    param([string]$DistRoot, [string]$VenvRoot, [string]$BasePythonHome)
    $problems = New-Object System.Collections.ArrayList
    $venv = $null; $baseHome = $null
    $v = $VenvRoot
    if ([string]::IsNullOrWhiteSpace($v) -and -not [string]::IsNullOrWhiteSpace($DistRoot)) {
        if (-not (Test-BlRootedPath $DistRoot)) { [void]$problems.Add('DIST_ROOT_NOT_ABSOLUTE') }
        else { $v = [IO.Path]::Combine((ConvertTo-BlFullPath -Path $DistRoot), 'venv') }
    }
    if ([string]::IsNullOrWhiteSpace($v)) { [void]$problems.Add('VENV_ROOT_MISSING') }
    elseif (-not (Test-BlRootedPath $v)) { [void]$problems.Add('VENV_ROOT_NOT_ABSOLUTE') }
    else { $venv = ConvertTo-BlFullPath -Path $v }
    $b = $BasePythonHome
    if ([string]::IsNullOrWhiteSpace($b) -and $null -ne $venv) {
        $cfg = Invoke-BlPort -Name 'Read-BlTextFile' -Arguments @{ Path = [IO.Path]::Combine($venv, 'pyvenv.cfg') }
        if ($cfg['Ok']) {
            $m = [regex]::Match([string]$cfg['Text'], '(?im)^\s*home\s*=\s*(.+?)\s*$')
            if ($m.Success) { $b = $m.Groups[1].Value.Trim() } else { [void]$problems.Add('BASE_HOME_NOT_IN_PYVENV_CFG') }
        } else {
            [void]$problems.Add('PYVENV_CFG_UNREADABLE: ' + (ConvertTo-BlPortFailure $cfg))
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($b)) {
        if (-not (Test-BlRootedPath $b)) { [void]$problems.Add('BASE_HOME_NOT_ABSOLUTE') }
        else { $baseHome = ConvertTo-BlFullPath -Path $b }
    } elseif ($null -ne $venv -and $problems.Count -eq 0) {
        [void]$problems.Add('BASE_HOME_UNRESOLVED')
    }
    @{ VenvRoot = $venv; BaseHome = $baseHome; Problems = $problems.ToArray() }
}

# 역할 → 전체 경로. 경로를 정하지 못한 역할은 $null.
function Get-BlLayoutPaths {
    param($Layout)
    $v = $Layout['VenvRoot']
    $b = $Layout['BaseHome']
    $roles = [ordered]@{}
    $roles['venv-root'] = $v
    $roles['base-python-root'] = $b
    $roles['semgrep.exe'] = $null
    $roles['venv-python.exe'] = $null
    $roles['semgrep-core.exe'] = $null
    $roles['base-python.exe'] = $null
    if (-not [string]::IsNullOrWhiteSpace([string]$v)) {
        $roles['semgrep.exe'] = [IO.Path]::Combine($v, 'Scripts', 'semgrep.exe')
        $roles['venv-python.exe'] = [IO.Path]::Combine($v, 'Scripts', 'python.exe')
        $roles['semgrep-core.exe'] = [IO.Path]::Combine($v, 'Lib', 'site-packages', 'semgrep', 'bin', 'semgrep-core.exe')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$b)) { $roles['base-python.exe'] = [IO.Path]::Combine($b, 'python.exe') }
    $roles
}

# ══ 항목 만들기(읽기 → 항목) ═════════════════════════════════════════════════
function Get-BlPathItems {
    param([Parameter(Mandatory)][string]$Path, [bool]$IsDir, [bool]$TreeStats)
    $targets = New-Object System.Collections.ArrayList
    if (-not $IsDir) { [void]$targets.Add(@{ Key = (New-BlKey 'file' $Path); Kind = 'file' }) }
    [void]$targets.Add(@{ Key = (New-BlKey 'acl' $Path); Kind = 'acl' })
    [void]$targets.Add(@{ Key = (New-BlKey 'ace' $Path); Kind = 'ace' })
    [void]$targets.Add(@{ Key = (New-BlKey 'owner' $Path); Kind = 'owner' })
    if ($IsDir -and $TreeStats) { [void]$targets.Add(@{ Key = (New-BlKey 'tree' $Path); Kind = 'tree' }) }
    $want = 'FILE'; if ($IsDir) { $want = 'DIR' }
    $st = Invoke-BlPort -Name 'Read-BlPathState' -Arguments @{ Path = $Path }
    $problem = $null; $absent = $false
    if (-not $st['Ok']) { $problem = ConvertTo-BlPortFailure $st }
    elseif ([string]$st['State'] -eq 'ABSENT') { $absent = $true }
    elseif ([bool]$st['Reparse']) { $problem = 'REPARSE_POINT' }
    elseif ([string]$st['State'] -ne $want) { $problem = ('EXPECTED_{0}_FOUND_{1}' -f $want, $st['State']) }
    if ($absent -or $null -ne $problem) {
        foreach ($t in $targets) {
            if ($absent) { New-BlItem -Key $t['Key'] -Kind $t['Kind'] -Status 'NOT_PRESENT' -Reason 'path-state:not-found' }
            else { New-BlItem -Key $t['Key'] -Kind $t['Kind'] -Status 'READ_FAILED' -Reason $problem }
        }
        return
    }
    if (-not $IsDir) {
        $f = Invoke-BlPort -Name 'Read-BlFileFacts' -Arguments @{ Path = $Path }
        $kf = New-BlKey 'file' $Path
        if ($f['Ok']) { New-BlItem -Key $kf -Kind 'file' -Status 'OK' -Value ('size={0};sha256={1}' -f $f['Size'], $f['Sha256']) }
        else { New-BlItem -Key $kf -Kind 'file' -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $f) }
    }
    $ka = New-BlKey 'acl' $Path; $ke = New-BlKey 'ace' $Path; $ko = New-BlKey 'owner' $Path
    $a = Invoke-BlPort -Name 'Read-BlAcl' -Arguments @{ Path = $Path }
    if ($a['Ok']) {
        New-BlItem -Key $ka -Kind 'acl' -Status 'OK' -Value $a['Sddl']
        New-BlItem -Key $ke -Kind 'ace' -Status 'OK' -Value (ConvertTo-BlListValue -Lines @(ConvertTo-BlArray $a['Aces']))
        $o = [string]$a['Owner']; $g = [string]$a['Group']
        if ([string]::IsNullOrWhiteSpace($o) -or [string]::IsNullOrWhiteSpace($g)) { New-BlItem -Key $ko -Kind 'owner' -Status 'READ_FAILED' -Reason 'OWNER_OR_GROUP_UNREADABLE' }
        else { New-BlItem -Key $ko -Kind 'owner' -Status 'OK' -Value ('owner={0};group={1}' -f $o.ToUpperInvariant(), $g.ToUpperInvariant()) }
    } else {
        $why = ConvertTo-BlPortFailure $a
        New-BlItem -Key $ka -Kind 'acl' -Status 'READ_FAILED' -Reason $why
        New-BlItem -Key $ke -Kind 'ace' -Status 'READ_FAILED' -Reason $why
        New-BlItem -Key $ko -Kind 'owner' -Status 'READ_FAILED' -Reason $why
    }
    if ($IsDir -and $TreeStats) {
        $kt = New-BlKey 'tree' $Path
        $t = Invoke-BlPort -Name 'Read-BlTreeStats' -Arguments @{ Path = $Path }
        if ($t['Ok']) { New-BlItem -Key $kt -Kind 'tree' -Status 'OK' -Value ('files={0};bytes={1};dirs={2};links={3}' -f $t['Files'], $t['Bytes'], $t['Dirs'], $t['Links']) }
        else { New-BlItem -Key $kt -Kind 'tree' -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $t) }
    }
}

function Get-BlLayoutItems {
    param($Layout, [bool]$TreeStats)
    $problems = @(ConvertTo-BlArray $Layout['Problems'])
    $kl = New-BlKey 'layout' 'resolution'
    if ($problems.Count -eq 0) { New-BlItem -Key $kl -Kind 'layout' -Status 'OK' -Value 'resolved' }
    else { New-BlItem -Key $kl -Kind 'layout' -Status 'READ_FAILED' -Reason ($problems -join '; ') }
    $paths = Get-BlLayoutPaths -Layout $Layout
    $dirRoles = @('venv-root', 'base-python-root')
    $seen = @{}
    foreach ($role in @($paths.Keys)) {
        $p = $paths[$role]
        $rk = New-BlKey 'role' $role
        if ([string]::IsNullOrWhiteSpace([string]$p)) {
            New-BlItem -Key $rk -Kind 'role' -Status 'READ_FAILED' -Reason 'PATH_UNRESOLVED'
            continue
        }
        New-BlItem -Key $rk -Kind 'role' -Status 'OK' -Value ([string]$p)
        $pk = ([string]$p).ToLowerInvariant()
        if ($seen.ContainsKey($pk)) { continue }
        $seen[$pk] = $true
        Get-BlPathItems -Path ([string]$p) -IsDir ($dirRoles -contains $role) -TreeStats $TreeStats
    }
}

function Get-BlAccountItems {
    param($RunNames)
    $kUsers = New-BlKey 'accounts' 'local-users'
    $kBsi = New-BlKey 'accounts' 'bsi-matching'
    $kRun = $null; if ($null -ne $RunNames) { $kRun = New-BlKey 'run-account' ([string]$RunNames['UserName']) }
    $port = Invoke-BlPort -Name 'Read-BlLocalUsers'
    if (-not $port['Ok']) {
        $why = ConvertTo-BlPortFailure $port
        New-BlItem -Key $kUsers -Kind 'accounts' -Status 'READ_FAILED' -Reason $why
        New-BlItem -Key $kBsi -Kind 'accounts' -Status 'READ_FAILED' -Reason $why
        if ($null -ne $kRun) { New-BlItem -Key $kRun -Kind 'run-account' -Status 'READ_FAILED' -Reason $why }
        return
    }
    $users = @(ConvertTo-BlArray $port['Users'])
    $lines = New-Object System.Collections.ArrayList
    $bsi = New-Object System.Collections.ArrayList
    $runLine = $null
    foreach ($u in $users) {
        $line = '{0}|{1}|{2}|{3}' -f $u['Name'], ([string]$u['Sid']).ToUpperInvariant(), [string]$u['Enabled'], $u['Description']
        [void]$lines.Add($line)
        if (([string]$u['Name']) -match '^bsi[0-9a-f]{8}$') { [void]$bsi.Add($line) }
        if ($null -ne $RunNames -and [string]::Equals([string]$u['Name'], [string]$RunNames['UserName'], [StringComparison]::OrdinalIgnoreCase)) { $runLine = $line }
    }
    New-BlItem -Key $kUsers -Kind 'accounts' -Status 'OK' -Value (ConvertTo-BlListValue -Lines $lines.ToArray())
    New-BlItem -Key $kBsi -Kind 'accounts' -Status 'OK' -Value (ConvertTo-BlListValue -Lines $bsi.ToArray())
    if ($null -ne $kRun) {
        if ($null -ne $runLine) { New-BlItem -Key $kRun -Kind 'run-account' -Status 'OK' -Value $runLine }
        else { New-BlItem -Key $kRun -Kind 'run-account' -Status 'NOT_PRESENT' -Reason ('local users enumerated: {0}, name not found' -f $users.Count) }
    }
}

function Get-BlGroupItems {
    foreach ($gsid in @($Script:BlSidAdministrators, $Script:BlSidUsers)) {
        $key = New-BlKey 'group' $gsid
        $port = Invoke-BlPort -Name 'Read-BlGroupMemberSids' -Arguments @{ GroupSid = $gsid }
        if ($port['Ok']) {
            $sids = @(ConvertTo-BlArray $port['Sids'] | ForEach-Object { ([string]$_).ToUpperInvariant() })
            New-BlItem -Key $key -Kind 'group' -Status 'OK' -Value (ConvertTo-BlListValue -Lines $sids)
        } else {
            New-BlItem -Key $key -Kind 'group' -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $port)
        }
    }
}

# 규칙 상세의 표준 한 줄(구분자 |). 파싱은 ConvertFrom-BlRuleLine.
function Format-BlRuleLine {
    param($Detail)
    'enabled={0}|direction={1}|action={2}|group={3}|description={4}|localuser={5}|remote={6}' -f $Detail['Enabled'], $Detail['Direction'], $Detail['Action'], $Detail['Group'], $Detail['Description'], $Detail['LocalUser'], $Detail['Remote']
}

function ConvertFrom-BlRuleLine {
    param([string]$Line)
    $h = @{}
    foreach ($part in @($Line -split '\|')) {
        $i = $part.IndexOf('=')
        if ($i -gt 0) { $h[$part.Substring(0, $i)] = $part.Substring($i + 1) }
    }
    $h
}

function Get-BlFirewallItems {
    param($RunNames)
    $kNames = New-BlKey 'fw' 'rule-names'
    $kPrefix = New-BlKey 'fw' 'prefix-rules'
    $kRun = $null; if ($null -ne $RunNames) { $kRun = New-BlKey 'run-rule' ([string]$RunNames['RuleName']) }
    $port = Invoke-BlPort -Name 'Read-BlFirewallRules' -Arguments @{ Prefix = $Script:BlIsoPrefix }
    if (-not $port['Ok']) {
        $why = ConvertTo-BlPortFailure $port
        New-BlItem -Key $kNames -Kind 'fw' -Status 'READ_FAILED' -Reason $why
        New-BlItem -Key $kPrefix -Kind 'fw' -Status 'READ_FAILED' -Reason $why
        if ($null -ne $kRun) { New-BlItem -Key $kRun -Kind 'run-rule' -Status 'READ_FAILED' -Reason $why }
        return
    }
    $names = @(ConvertTo-BlArray $port['Names'] | ForEach-Object { [string]$_ })
    $prefixNames = @($names | Where-Object { $_.StartsWith($Script:BlIsoPrefix, [StringComparison]::OrdinalIgnoreCase) })
    New-BlItem -Key $kNames -Kind 'fw' -Status 'OK' -Value (ConvertTo-BlListValue -Lines $names)
    New-BlItem -Key $kPrefix -Kind 'fw' -Status 'OK' -Value (ConvertTo-BlListValue -Lines $prefixNames)
    if ($null -ne $kRun) {
        $found = $null
        foreach ($n in $names) { if ([string]::Equals($n, [string]$RunNames['RuleName'], [StringComparison]::OrdinalIgnoreCase)) { $found = $n; break } }
        if ($null -eq $found) {
            New-BlItem -Key $kRun -Kind 'run-rule' -Status 'NOT_PRESENT' -Reason ('firewall rules enumerated: {0}, name not found' -f $names.Count)
        } else {
            $details = $port['Details']
            $d = $null; if ($null -ne $details -and $details.Contains($found)) { $d = $details[$found] }
            if ($null -eq $d -or -not [bool]$d['Ok']) {
                $why = 'RULE_DETAIL_UNREADABLE'; if ($null -ne $d -and $d.Contains('Error')) { $why = [string]$d['Error'] }
                New-BlItem -Key $kRun -Kind 'run-rule' -Status 'READ_FAILED' -Reason $why
            } else {
                New-BlItem -Key $kRun -Kind 'run-rule' -Status 'OK' -Value (Format-BlRuleLine -Detail $d)
            }
        }
    }
}

function Get-BlAuditItems {
    foreach ($guid in $Script:BlAuditGuids) {
        $key = New-BlKey 'audit' $guid
        $port = Invoke-BlPort -Name 'Read-BlAuditRow' -Arguments @{ Guid = $guid }
        if ($port['Ok']) { New-BlItem -Key $key -Kind 'audit' -Status 'OK' -Value $port['Row'] }
        else { New-BlItem -Key $key -Kind 'audit' -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $port) }
    }
}

# 경로 하나의 존재 상태와 폴더 목록을 항목으로 만든다(작업 루트·프로필 폴더 용). 폴더가 없으면 "없음을 읽어 확인"한 NOT_PRESENT.
function Get-BlDirListingItem {
    param([string]$Key, [string]$Kind, [string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason 'PATH_UNRESOLVED') }
    $st = Invoke-BlPort -Name 'Read-BlPathState' -Arguments @{ Path = $Path }
    if (-not $st['Ok']) { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $st)) }
    if ([string]$st['State'] -eq 'ABSENT') { return (New-BlItem -Key $Key -Kind $Kind -Status 'NOT_PRESENT' -Reason 'path-state:not-found') }
    if ([bool]$st['Reparse']) { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason 'REPARSE_POINT') }
    if ([string]$st['State'] -ne 'DIR') { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason ('EXPECTED_DIR_FOUND_{0}' -f $st['State'])) }
    $d = Invoke-BlPort -Name 'Read-BlDirNames' -Arguments @{ Path = $Path }
    if (-not $d['Ok']) { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $d)) }
    New-BlItem -Key $Key -Kind $Kind -Status 'OK' -Value (Format-BlPathedList -Path $Path -Lines @(ConvertTo-BlArray $d['Names']))
}

function Get-BlStateItem {
    param([string]$Key, [string]$Kind, [string]$Path, [string]$Want, [string]$PresentValue)
    if ([string]::IsNullOrWhiteSpace($Path)) { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason 'PATH_UNRESOLVED') }
    $st = Invoke-BlPort -Name 'Read-BlPathState' -Arguments @{ Path = $Path }
    if (-not $st['Ok']) { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $st)) }
    if ([string]$st['State'] -eq 'ABSENT') { return (New-BlItem -Key $Key -Kind $Kind -Status 'NOT_PRESENT' -Reason 'path-state:not-found') }
    if ([bool]$st['Reparse']) { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason 'REPARSE_POINT') }
    if ([string]$st['State'] -ne $Want) { return (New-BlItem -Key $Key -Kind $Kind -Status 'READ_FAILED' -Reason ('EXPECTED_{0}_FOUND_{1}' -f $Want, $st['State'])) }
    New-BlItem -Key $Key -Kind $Kind -Status 'OK' -Value $PresentValue
}

function Get-BlProfileItems {
    param($RunNames)
    $kList = New-BlKey 'profiles' 'profilelist-sids'
    $kDir = New-BlKey 'profiles' 'dir-listing'
    $kRun = $null; if ($null -ne $RunNames) { $kRun = New-BlKey 'run-profiledir' ([string]$RunNames['UserName']) }
    $pl = Invoke-BlPort -Name 'Read-BlProfileList'
    if (-not $pl['Ok']) {
        $why = ConvertTo-BlPortFailure $pl
        New-BlItem -Key $kList -Kind 'profiles' -Status 'READ_FAILED' -Reason $why
        New-BlItem -Key $kDir -Kind 'profiles' -Status 'READ_FAILED' -Reason $why
        if ($null -ne $kRun) { New-BlItem -Key $kRun -Kind 'run-profiledir' -Status 'READ_FAILED' -Reason $why }
        return
    }
    New-BlItem -Key $kList -Kind 'profiles' -Status 'OK' -Value (ConvertTo-BlListValue -Lines @(ConvertTo-BlArray $pl['Sids'] | ForEach-Object { ([string]$_).ToUpperInvariant() }))
    $dir = [string]$pl['ProfilesDirectory']
    Get-BlDirListingItem -Key $kDir -Kind 'profiles' -Path $dir
    if ($null -ne $kRun) {
        $runPath = Join-Path $dir ([string]$RunNames['UserName'])
        Get-BlStateItem -Key $kRun -Kind 'run-profiledir' -Path $runPath -Want 'DIR' -PresentValue 'dir'
    }
}

function Get-BlWorkItems {
    param($RunNames)
    $root = $null
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramData)) { $root = Join-Path $env:ProgramData $Script:BlIsoPrefix }
    Get-BlDirListingItem -Key (New-BlKey 'workroot' 'listing') -Kind 'workroot' -Path $root
    if ($null -ne $RunNames) {
        $rid = [string]$RunNames['RunId']
        Get-BlStateItem -Key (New-BlKey 'run-workdir' $rid) -Kind 'run-workdir' -Path ([string]$RunNames['WorkDir']) -Want 'DIR' -PresentValue 'dir'
        $kOwner = New-BlKey 'run-workdir-owner' $rid
        $wd = [string]$RunNames['WorkDir']
        if ([string]::IsNullOrWhiteSpace($wd)) { New-BlItem -Key $kOwner -Kind 'run-workdir-owner' -Status 'READ_FAILED' -Reason 'PATH_UNRESOLVED' }
        else {
            $ownerPath = Join-Path $wd '.owner'
            $st = Invoke-BlPort -Name 'Read-BlPathState' -Arguments @{ Path = $ownerPath }
            if (-not $st['Ok']) { New-BlItem -Key $kOwner -Kind 'run-workdir-owner' -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $st) }
            elseif ([string]$st['State'] -eq 'ABSENT') { New-BlItem -Key $kOwner -Kind 'run-workdir-owner' -Status 'NOT_PRESENT' -Reason 'path-state:not-found' }
            elseif ([bool]$st['Reparse'] -or [string]$st['State'] -ne 'FILE') { New-BlItem -Key $kOwner -Kind 'run-workdir-owner' -Status 'READ_FAILED' -Reason 'OWNER_FILE_NOT_REGULAR' }
            else {
                $t = Invoke-BlPort -Name 'Read-BlTextFile' -Arguments @{ Path = $ownerPath; MaxBytes = 4096 }
                if ($t['Ok']) { New-BlItem -Key $kOwner -Kind 'run-workdir-owner' -Status 'OK' -Value ([string]$t['Text']).Trim() }
                else { New-BlItem -Key $kOwner -Kind 'run-workdir-owner' -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $t) }
            }
        }
    }
}

function Get-BlProcessItems {
    $key = New-BlKey 'proc' 'semgrep-running'
    $port = Invoke-BlPort -Name 'Read-BlProcessNames' -Arguments @{ Prefix = 'semgrep' }
    if ($port['Ok']) { New-BlItem -Key $key -Kind 'proc' -Status 'OK' -Value (ConvertTo-BlListValue -Lines @(ConvertTo-BlArray $port['Names'] | ForEach-Object { [string]$_ })) }
    else { New-BlItem -Key $key -Kind 'proc' -Status 'READ_FAILED' -Reason (ConvertTo-BlPortFailure $port) }
}

# 모든 항목을 읽는다. 호출자는 @(Get-BaselineItems …) 로 받는다. 시험은 이 함수 전체를 대체할 수도 있다.
function Get-BaselineItems {
    param([Parameter(Mandatory)]$Layout, [string]$RunId, [bool]$TreeStats = $false)
    $runNames = $null
    if (-not [string]::IsNullOrWhiteSpace($RunId)) { $runNames = Get-BlRunNames -RunId $RunId }
    Get-BlLayoutItems -Layout $Layout -TreeStats $TreeStats
    Get-BlAccountItems -RunNames $runNames
    Get-BlGroupItems
    Get-BlFirewallItems -RunNames $runNames
    Get-BlAuditItems
    Get-BlProfileItems -RunNames $runNames
    Get-BlWorkItems -RunNames $runNames
    Get-BlProcessItems
}

# ══ 직접 확인(Verify): 기준 + 이번 실행의 예상 변화 ════════════════════════════
# 실행 기록(resources.json)에서 RunId·상태·전용 SID·권한 부여 경로를 읽는다.
function ConvertFrom-BlManifest {
    param([string]$Text)
    $m = ConvertFrom-Json -InputObject $Text
    $sid = $null
    $grants = New-Object System.Collections.ArrayList
    foreach ($s in @(Get-BlProp $m 'steps')) {
        $kind = [string](Get-BlProp $s 'kind')
        $detail = Get-BlProp $s 'detail'
        if ($kind -ceq 'user') { $sid = [string](Get-BlProp $detail 'sid') }
        elseif ($kind -ceq 'aclGrant') { [void]$grants.Add([string](Get-BlProp $s 'name')) }
    }
    @{ RunId = [string](Get-BlProp $m 'runId'); Status = [string](Get-BlProp $m 'status'); Sid = $sid; Grants = $grants.ToArray() }
}

function Add-BlListLinesToItem {
    param($Item, [string[]]$Lines)
    $key = [string](Get-BlProp $Item 'key')
    $kind = [string](Get-BlProp $Item 'kind')
    if ([string](Get-BlProp $Item 'status') -cne 'OK') { return (Copy-BlItemAs -Item $Item -Key $key -Kind $kind) }
    $cur = @(ConvertFrom-BlListValue -Value ([string](Get-BlProp $Item 'value')))
    New-BlItem -Key $key -Kind $kind -Status 'OK' -Value (ConvertTo-BlListValue -Lines ($cur + @($Lines)))
}

function ConvertFrom-BlAccountLine {
    param([string]$Line)
    $m = [regex]::Match($Line, '^([^|]*)\|([^|]*)\|([^|]*)\|(.*)$')
    if (-not $m.Success) { return $null }
    @{ Name = $m.Groups[1].Value; Sid = $m.Groups[2].Value; Enabled = $m.Groups[3].Value; Description = $m.Groups[4].Value }
}

function ConvertFrom-BlAceLine {
    param([string]$Line)
    $p = @($Line -split '\|')
    if ($p.Count -ne 6) { return $null }
    $mask = [int64]0
    $hex = $p[2]
    if (-not $hex.StartsWith('0x')) { return $null }
    try { $mask = [Convert]::ToInt64($hex.Substring(2), 16) } catch { return $null }
    @{ Type = $p[0]; Sid = $p[1].ToUpperInvariant(); Mask = $mask; Inherit = $p[3]; Prop = $p[4]; Inherited = $p[5] }
}

function New-BlCheckPair {
    param([string]$Key, $Sources, [bool]$Pass, [string]$Why)
    # 원본 항목이 없거나 READ_FAILED 이면 판정할 수 없다(READ_FAILED). 원본이 NOT_PRESENT(없음 확인)이면 "있어야 하는 것이 없다"는 FAIL 이다.
    $bad = New-Object System.Collections.ArrayList
    $absent = New-Object System.Collections.ArrayList
    foreach ($s in @($Sources)) {
        if ($null -eq $s) { [void]$bad.Add('(missing)'); continue }
        $ss = [string](Get-BlProp $s 'status')
        if ($ss -ceq 'NOT_PRESENT') { [void]$absent.Add([string](Get-BlProp $s 'key')) }
        elseif ($ss -cne 'OK') { [void]$bad.Add(('{0}={1}' -f (Get-BlProp $s 'key'), $ss)) }
    }
    $exp = New-BlItem -Key $Key -Kind 'vfy' -Status 'OK' -Value 'PASS'
    $act = $null
    if ($bad.Count -gt 0) { $act = New-BlItem -Key $Key -Kind 'vfy' -Status 'READ_FAILED' -Reason ('SOURCE_NOT_OK: ' + ($bad -join ', ')) }
    elseif ($absent.Count -gt 0) { $act = New-BlItem -Key $Key -Kind 'vfy' -Status 'OK' -Value ('FAIL: 읽어 보니 있어야 하는 항목이 없다: ' + ($absent -join ', ')) }
    elseif ($Pass) { $act = New-BlItem -Key $Key -Kind 'vfy' -Status 'OK' -Value 'PASS' }
    else { $act = New-BlItem -Key $Key -Kind 'vfy' -Status 'OK' -Value ('FAIL: ' + (Format-BlReason $Why)) }
    @{ Expected = $exp; Actual = $act }
}

function Get-BlItemByKey {
    param($Index, [string]$Key)
    if ($Index.ContainsKey($Key)) { return $Index[$Key] }
    $null
}

# 이 실행이 만든 계정·규칙·ACE 가 읽기로 확인되는지의 판정 항목들과, 기준에서 "변하지 않아야 하는" 항목들의 기대값.
# 반환: Expected(기대 항목 목록), Actual(판정 항목 목록: 현재 항목에서 파생한 vfy:* 만). 현재 항목 전체는 호출자가 따로 갖고 있다.
function New-BlVerifyPlan {
    param($BaselineItems, $CurrentItems, $Run, $Layout, $BaselineParams)
    $names = Get-BlRunNames -RunId ([string]$Run['RunId'])
    $sid = ([string]$Run['Sid']).ToUpperInvariant()
    $marker = [string]$names['Marker']
    $acctLine = '{0}|{1}|{2}|{3}' -f $names['UserName'], $sid, 'False', $marker
    $kUsers = New-BlKey 'accounts' 'local-users'
    $kBsi = New-BlKey 'accounts' 'bsi-matching'
    $kG545 = New-BlKey 'group' $Script:BlSidUsers
    $kG544 = New-BlKey 'group' $Script:BlSidAdministrators
    $kRuleNames = New-BlKey 'fw' 'rule-names'
    $kPrefix = New-BlKey 'fw' 'prefix-rules'
    $kWorkroot = New-BlKey 'workroot' 'listing'
    $expected = New-Object System.Collections.ArrayList
    $actual = New-Object System.Collections.ArrayList
    $cur = (Get-BlIndex -Items $CurrentItems)['Index']
    $base = (Get-BlIndex -Items $BaselineItems)['Index']

    foreach ($it in @($BaselineItems)) {
        $k = [string](Get-BlProp $it 'key')
        $kind = [string](Get-BlProp $it 'kind')
        if ($k.StartsWith('acl:') -or $k.StartsWith('ace:')) { continue }   # 폴더·파일 ACL 은 아래 ACE 판정(vfy-ace-*)으로 대신한다
        if ($k.StartsWith('run-')) { continue }                              # 이 실행의 자원은 실행 정보에서 만든 기대값을 쓴다
        if ($k -ceq $kUsers -or $k -ceq $kBsi) { [void]$expected.Add((Add-BlListLinesToItem -Item $it -Lines @($acctLine))); continue }
        if ($k -ceq $kG545) { [void]$expected.Add((Add-BlListLinesToItem -Item $it -Lines @($sid))); continue }
        if ($k -ceq $kRuleNames -or $k -ceq $kPrefix) { [void]$expected.Add((Add-BlListLinesToItem -Item $it -Lines @([string]$names['RuleName']))); continue }
        if ($k -ceq $kWorkroot) {
            $st = [string](Get-BlProp $it 'status')
            $root = [string]$names['WorkRoot']
            if ($st -ceq 'NOT_PRESENT') {
                [void]$expected.Add((New-BlItem -Key $k -Kind $kind -Status 'OK' -Value (Format-BlPathedList -Path $root -Lines @([string]$names['RunId']))))
            } elseif ($st -ceq 'OK') {
                $pl = Split-BlPathedList -Value ([string](Get-BlProp $it 'value'))
                if ($pl['Ok']) { [void]$expected.Add((New-BlItem -Key $k -Kind $kind -Status 'OK' -Value (Format-BlPathedList -Path $pl['Path'] -Lines (@($pl['Lines']) + @([string]$names['RunId']))))) }
                else { [void]$expected.Add((New-BlItem -Key $k -Kind $kind -Status 'READ_FAILED' -Reason 'BASELINE_VALUE_FORMAT')) }
            } else { [void]$expected.Add((Copy-BlItemAs -Item $it -Key $k -Kind $kind)) }
            continue
        }
        [void]$expected.Add((Copy-BlItemAs -Item $it -Key $k -Kind $kind))   # 나머지는 적용 뒤에도 기준과 같아야 한다
    }

    # 이 실행의 자원(기준과 무관하게 실행 정보에서 기대값을 만든다)
    $rid = [string]$names['RunId']
    [void]$expected.Add((New-BlItem -Key (New-BlKey 'run-account' ([string]$names['UserName'])) -Kind 'run-account' -Status 'OK' -Value $acctLine))
    [void]$expected.Add((New-BlItem -Key (New-BlKey 'run-workdir' $rid) -Kind 'run-workdir' -Status 'OK' -Value 'dir'))
    [void]$expected.Add((New-BlItem -Key (New-BlKey 'run-workdir-owner' $rid) -Kind 'run-workdir-owner' -Status 'OK' -Value $marker))
    [void]$expected.Add((New-BlItem -Key (New-BlKey 'run-profiledir' ([string]$names['UserName'])) -Kind 'run-profiledir' -Status 'NOT_PRESENT' -Reason 'expected: 프로필은 첫 로그온 때 만들어지므로 적용 직후에는 없어야 한다'))

    # 판정 항목들
    $pairs = New-Object System.Collections.ArrayList
    $okStatus = ([string]$Run['Status'] -ceq 'applied')
    [void]$pairs.Add((New-BlCheckPair -Key (New-BlKey 'vfy' 'run-status') -Sources @() -Pass $okStatus -Why ('실행 기록 상태가 applied 가 아니다: ' + [string]$Run['Status'])))
    $bRun = ''; if ($null -ne $BaselineParams) { $bRun = [string](Get-BlProp $BaselineParams 'runId') }
    $idOk = ((-not [string]::IsNullOrWhiteSpace($bRun)) -and [string]::Equals($bRun, $rid, [StringComparison]::OrdinalIgnoreCase))
    [void]$pairs.Add((New-BlCheckPair -Key (New-BlKey 'vfy' 'runid-match') -Sources @() -Pass $idOk -Why ('기준에 기록된 RunId({0})와 실행 기록의 RunId({1})가 다르거나 기준에 RunId 가 없다' -f $bRun, $rid)))

    $grantNorm = New-Object System.Collections.ArrayList
    foreach ($g in @(ConvertTo-BlArray $Run['Grants'])) { try { [void]$grantNorm.Add((ConvertTo-BlFullPath -Path ([string]$g)).ToLowerInvariant()) } catch { [void]$grantNorm.Add(('(invalid) ' + [string]$g)) } }
    $wantRoots = New-Object System.Collections.ArrayList
    if (-not [string]::IsNullOrWhiteSpace([string]$Layout['VenvRoot'])) { [void]$wantRoots.Add(([string]$Layout['VenvRoot']).ToLowerInvariant()) }
    if (-not [string]::IsNullOrWhiteSpace([string]$Layout['BaseHome'])) { [void]$wantRoots.Add(([string]$Layout['BaseHome']).ToLowerInvariant()) }
    $gPass = ($wantRoots.Count -eq 2) -and ((@(Sort-BlOrdinal -Lines ([string[]]$grantNorm.ToArray())) -join '|') -ceq (@(Sort-BlOrdinal -Lines ([string[]]$wantRoots.ToArray())) -join '|'))
    [void]$pairs.Add((New-BlCheckPair -Key (New-BlKey 'vfy' 'grant-paths') -Sources @() -Pass $gPass -Why ('실행 기록의 권한 부여 경로({0})가 가상환경 루트·기반 Python 폴더({1})와 같지 않다' -f ($grantNorm -join ' ; '), ($wantRoots -join ' ; '))))

    # 기준에 이 실행의 자원이 없었다(적용 전 기준이다)
    $runBase = @(@($BaselineItems) | Where-Object { ([string](Get-BlProp $_ 'key')).StartsWith('run-') })
    $notAbsent = @($runBase | Where-Object { [string](Get-BlProp $_ 'status') -cne 'NOT_PRESENT' } | ForEach-Object { [string](Get-BlProp $_ 'key') })
    $bPass = ($runBase.Count -gt 0) -and ($notAbsent.Count -eq 0)
    $runBaseUnread = @($runBase | Where-Object { [string](Get-BlProp $_ 'status') -ceq 'READ_FAILED' })
    [void]$pairs.Add((New-BlCheckPair -Key (New-BlKey 'vfy' 'baseline-run-absent') -Sources $runBaseUnread -Pass $bPass -Why ('기준이 적용 전 상태가 아니다(없음이 확인되지 않은 항목: {0}) 또는 기준에 run-* 항목이 없다' -f ($notAbsent -join ', '))))

    # 계정: SID·사용 안 함·표식·Users 소속·Administrators 아님
    $acctItem = Get-BlItemByKey -Index $cur -Key (New-BlKey 'run-account' ([string]$names['UserName']))
    $g545 = Get-BlItemByKey -Index $cur -Key $kG545
    $g544 = Get-BlItemByKey -Index $cur -Key $kG544
    $aPass = $false; $aWhy = '계정 항목을 해석하지 못했다'
    if ($null -ne $acctItem -and [string](Get-BlProp $acctItem 'status') -ceq 'OK') {
        $pa = ConvertFrom-BlAccountLine -Line ([string](Get-BlProp $acctItem 'value'))
        $m545 = $false; $m544 = $true
        if ($null -ne $g545 -and [string](Get-BlProp $g545 'status') -ceq 'OK') { $m545 = (@(ConvertFrom-BlListValue -Value ([string](Get-BlProp $g545 'value'))) -contains $sid) }
        if ($null -ne $g544 -and [string](Get-BlProp $g544 'status') -ceq 'OK') { $m544 = (@(ConvertFrom-BlListValue -Value ([string](Get-BlProp $g544 'value'))) -contains $sid) }
        if ($null -ne $pa) {
            $aPass = ([string]::Equals($pa['Sid'], $sid, [StringComparison]::OrdinalIgnoreCase)) -and ($pa['Enabled'] -ceq 'False') -and ($pa['Description'] -ceq $marker) -and $m545 -and (-not $m544)
            $aWhy = ('sid={0} enabled={1} description={2} Users 소속={3} Administrators 소속={4}' -f $pa['Sid'], $pa['Enabled'], $pa['Description'], $m545, $m544)
        }
    }
    [void]$pairs.Add((New-BlCheckPair -Key (New-BlKey 'vfy' 'run-account') -Sources @($acctItem, $g545, $g544) -Pass $aPass -Why $aWhy))

    # 방화벽 규칙
    $ruleItem = Get-BlItemByKey -Index $cur -Key (New-BlKey 'run-rule' ([string]$names['RuleName']))
    $rPass = $false; $rWhy = '규칙 항목을 해석하지 못했다'
    if ($null -ne $ruleItem -and [string](Get-BlProp $ruleItem 'status') -ceq 'OK') {
        $pr = ConvertFrom-BlRuleLine -Line ([string](Get-BlProp $ruleItem 'value'))
        $remote = @(); if ($pr.ContainsKey('remote')) { $remote = @(([string]$pr['remote']) -split ',' | Where-Object { $_ }) }
        $v4a = $remote -contains '0.0.0.0-126.255.255.255'
        $v4b = $remote -contains '128.0.0.0-255.255.255.255'
        $v6 = (@($remote | Where-Object { $_ -match '^::2-(ffff:){7}ffff$' })).Count -eq 1
        $rPass = ($pr.ContainsKey('enabled') -and $pr['enabled'] -ceq 'True') -and ($pr.ContainsKey('direction') -and $pr['direction'] -ceq 'Outbound') -and ($pr.ContainsKey('action') -and $pr['action'] -ceq 'Block') -and
            ($pr.ContainsKey('description') -and $pr['description'] -ceq $marker) -and ($pr.ContainsKey('group') -and $pr['group'] -ceq $Script:BlIsoPrefix) -and
            ($pr.ContainsKey('localuser') -and ([string]$pr['localuser']).ToUpperInvariant().Contains($sid)) -and ($remote.Count -eq 3) -and $v4a -and $v4b -and $v6
        $rWhy = ('규칙 속성이 기대와 다르다: {0}' -f (Limit-BlText ([string](Get-BlProp $ruleItem 'value')) 300))
    }
    [void]$pairs.Add((New-BlCheckPair -Key (New-BlKey 'vfy' 'run-rule') -Sources @($ruleItem) -Pass $rPass -Why $rWhy))

    # ACE: 경로마다 따로(역할마다 키가 다르다). 폴더는 비상속 한 건(0x1200a9, CI+OI), 파일은 상속 한 건. 나머지 ACE 는 기준과 같아야 한다.
    $paths = Get-BlLayoutPaths -Layout $Layout
    $seen = @{}
    foreach ($role in @($paths.Keys)) {
        $p = $paths[$role]
        if ([string]::IsNullOrWhiteSpace([string]$p)) { continue }
        $pk = ([string]$p).ToLowerInvariant()
        if ($seen.ContainsKey($pk)) { continue }
        $seen[$pk] = $true
        $isDir = (@('venv-root', 'base-python-root') -contains $role)
        $aceKey = New-BlKey 'ace' ([string]$p)
        $curAce = Get-BlItemByKey -Index $cur -Key $aceKey
        $baseAce = Get-BlItemByKey -Index $base -Key $aceKey
        $runKey = New-BlKey 'vfy-ace-run' ([string]$p)
        $othKey = New-BlKey 'vfy-ace-others' ([string]$p)
        $ok = $false; $why = 'ACE 목록을 해석하지 못했다'
        $others = New-Object System.Collections.ArrayList
        $okSrc = ($null -ne $curAce -and [string](Get-BlProp $curAce 'status') -ceq 'OK')
        if ($okSrc) {
            $mine = New-Object System.Collections.ArrayList
            foreach ($line in @(ConvertFrom-BlListValue -Value ([string](Get-BlProp $curAce 'value')))) {
                $pa = ConvertFrom-BlAceLine -Line $line
                if ($null -ne $pa -and $pa['Sid'] -ceq $sid) { [void]$mine.Add($pa) } else { [void]$others.Add($line) }
            }
            if ($mine.Count -ne 1) { $why = ('전용 SID 의 ACE 가 {0}건이다(정확히 1건이어야 한다)' -f $mine.Count) }
            else {
                $a1 = $mine[0]
                if ($isDir) {
                    $ok = ($a1['Type'] -ceq 'Allow') -and ($a1['Mask'] -eq $Script:BlGrantMask) -and ($a1['Inherit'] -ceq 'inh=3') -and ($a1['Inherited'] -ceq 'inherited=False')
                    $why = ('폴더 ACE: {0} 0x{1:x} {2} {3} {4}' -f $a1['Type'], $a1['Mask'], $a1['Inherit'], $a1['Prop'], $a1['Inherited'])
                } else {
                    $ok = ($a1['Type'] -ceq 'Allow') -and ((([int64]$a1['Mask']) -band $Script:BlReadExecuteBits) -eq $Script:BlReadExecuteBits) -and ($a1['Inherited'] -ceq 'inherited=True')
                    $why = ('파일 ACE: {0} 0x{1:x} {2} {3} {4}' -f $a1['Type'], $a1['Mask'], $a1['Inherit'], $a1['Prop'], $a1['Inherited'])
                }
            }
        }
        [void]$pairs.Add((New-BlCheckPair -Key $runKey -Sources @($curAce) -Pass $ok -Why $why))
        # 기준과 같아야 하는 나머지 ACE
        if ($null -eq $baseAce) { [void]$expected.Add((New-BlItem -Key $othKey -Kind 'vfy' -Status 'READ_FAILED' -Reason 'BASELINE_ITEM_MISSING')) }
        else { [void]$expected.Add((Copy-BlItemAs -Item $baseAce -Key $othKey -Kind 'vfy')) }
        if ($okSrc) { [void]$actual.Add((New-BlItem -Key $othKey -Kind 'vfy' -Status 'OK' -Value (ConvertTo-BlListValue -Lines $others.ToArray()))) }
        else { [void]$actual.Add((New-BlItem -Key $othKey -Kind 'vfy' -Status 'READ_FAILED' -Reason 'SOURCE_NOT_OK: ace item')) }
    }

    foreach ($pr2 in $pairs) { [void]$expected.Add($pr2['Expected']); [void]$actual.Add($pr2['Actual']) }
    @{ Expected = $expected.ToArray(); Actual = $actual.ToArray() }
}

# ══ 파일 입출력 ═══════════════════════════════════════════════════════════════
# 출력 파일 경로의 문제 목록. 비어 있으면 쓸 수 있다. 상위 폴더를 만들지 않고, 링크(reparse point)가 낀 경로·`..`·덮어쓰기를 거부한다.
function Get-BlOutFileProblems {
    param([string]$Path, [bool]$Force = $false, [string]$Protect = '')
    $problems = New-Object System.Collections.ArrayList
    if ([string]::IsNullOrWhiteSpace($Path)) { [void]$problems.Add('OUTFILE_MISSING') }
    elseif (-not (Test-BlRootedPath $Path)) { [void]$problems.Add('NOT_ABSOLUTE') }
    elseif ($Path -match '(^|[\\/])\.\.([\\/]|$)') { [void]$problems.Add('DOTDOT_SEGMENT') }
    else {
        $full = $null
        try { $full = [IO.Path]::GetFullPath($Path) } catch { [void]$problems.Add('INVALID_PATH') }
        if ($null -ne $full) {
            if (-not [string]::Equals([IO.Path]::GetExtension($full), '.json', [StringComparison]::OrdinalIgnoreCase)) { [void]$problems.Add('EXTENSION_NOT_JSON') }
            if (-not [string]::IsNullOrWhiteSpace($Protect)) {
                try { if ([string]::Equals((ConvertTo-BlFullPath -Path $Protect), (ConvertTo-BlFullPath -Path $full), [StringComparison]::OrdinalIgnoreCase)) { [void]$problems.Add('WOULD_OVERWRITE_BASELINE') } } catch { [void]$problems.Add('PROTECT_PATH_INVALID') }
            }
            $parent = [IO.Path]::GetDirectoryName($full)
            if ([string]::IsNullOrEmpty($parent)) { [void]$problems.Add('NO_PARENT') }
            else {
                $chain = New-Object System.Collections.ArrayList
                $cur = $parent
                while (-not [string]::IsNullOrEmpty($cur)) { [void]$chain.Insert(0, $cur); $cur = [IO.Path]::GetDirectoryName($cur) }
                foreach ($c in $chain) {
                    $root = [IO.Path]::GetPathRoot($c)
                    if ([string]::Equals($c.TrimEnd('\', '/'), $root.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)) { continue }
                    $st = Invoke-BlPort -Name 'Read-BlPathState' -Arguments @{ Path = $c }
                    if (-not $st['Ok']) { [void]$problems.Add(('UNREADABLE: {0}' -f $c)); continue }
                    if ([string]$st['State'] -eq 'ABSENT') { [void]$problems.Add(('PARENT_MISSING: {0}' -f $c)); break }
                    if ([bool]$st['Reparse']) { [void]$problems.Add(('REPARSE_POINT: {0}' -f $c)) }
                    if ([string]$st['State'] -ne 'DIR') { [void]$problems.Add(('PARENT_NOT_DIRECTORY: {0}' -f $c)) }
                }
                $leaf = Invoke-BlPort -Name 'Read-BlPathState' -Arguments @{ Path = $full }
                if (-not $leaf['Ok']) { [void]$problems.Add('LEAF_UNREADABLE') }
                elseif ([string]$leaf['State'] -ne 'ABSENT') {
                    if ([bool]$leaf['Reparse']) { [void]$problems.Add('LEAF_IS_REPARSE_POINT') }
                    if ([string]$leaf['State'] -eq 'DIR') { [void]$problems.Add('LEAF_IS_DIRECTORY') }
                    elseif (-not $Force) { [void]$problems.Add('EXISTS_USE_FORCE_TO_OVERWRITE') }
                }
            }
        }
    }
    foreach ($x in $problems) { $x }
}

# 이 도구가 쓰는 유일한 파일 쓰기. -Force 가 없으면 CreateNew 라서 이미 있으면 실패한다(검사와 쓰기 사이에 생겨도 덮어쓰지 않는다).
function Write-BlJsonFile {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)]$Object, [bool]$Force = $false)
    $json = ConvertTo-Json -InputObject $Object -Depth 8
    $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
    $mode = [IO.FileMode]::CreateNew; if ($Force) { $mode = [IO.FileMode]::Create }
    $fs = [IO.File]::Open($Path, $mode, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Dispose() }
}

# 저장된 기준을 읽어 검증한다. 반환: Ok, Problems, Items(평범한 사전 목록), Params, Sha256
function Read-BlBaselineFile {
    param([string]$Path)
    $r = @{ Ok = $false; Problems = @(); Items = @(); Params = $null; Sha256 = $null }
    $problems = New-Object System.Collections.ArrayList
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-BlRootedPath $Path)) { [void]$problems.Add('BASELINE_PATH_NOT_ABSOLUTE'); $r['Problems'] = $problems.ToArray(); return $r }
    $t = Invoke-BlPort -Name 'Read-BlTextFile' -Arguments @{ Path = $Path }
    if (-not $t['Ok']) { [void]$problems.Add('BASELINE_UNREADABLE: ' + (ConvertTo-BlPortFailure $t)); $r['Problems'] = $problems.ToArray(); return $r }
    $doc = $null
    try { $doc = ConvertFrom-Json -InputObject ([string]$t['Text']) } catch { [void]$problems.Add('BASELINE_NOT_JSON: ' + (Get-BlExceptionText $_)); $r['Problems'] = $problems.ToArray(); return $r }
    if ($null -eq $doc) { [void]$problems.Add('BASELINE_EMPTY'); $r['Problems'] = $problems.ToArray(); return $r }
    if ([string](Get-BlProp $doc 'tool') -cne $Script:BlTool) { [void]$problems.Add('BASELINE_TOOL_MISMATCH') }
    if ([string](Get-BlProp $doc 'schema') -cne [string]$Script:BlSchema) { [void]$problems.Add('BASELINE_SCHEMA_MISMATCH') }
    $items = New-Object System.Collections.ArrayList
    foreach ($it in @(Get-BlProp $doc 'items')) {
        if ($null -eq $it) { continue }
        $k = [string](Get-BlProp $it 'key')
        if ([string]::IsNullOrWhiteSpace($k)) { [void]$problems.Add('BASELINE_ITEM_WITHOUT_KEY'); continue }
        $v = Get-BlProp $it 'value'
        if ($null -ne $v) { $v = [string]$v }
        [void]$items.Add([ordered]@{ key = $k; kind = [string](Get-BlProp $it 'kind'); status = [string](Get-BlProp $it 'status'); value = $v; reason = [string](Get-BlProp $it 'reason') })
    }
    if ($items.Count -eq 0) { [void]$problems.Add('BASELINE_HAS_NO_ITEMS') }
    $f = Invoke-BlPort -Name 'Read-BlFileFacts' -Arguments @{ Path = $Path }
    if ($f['Ok']) { $r['Sha256'] = [string]$f['Sha256'] }
    $r['Items'] = $items.ToArray()
    $r['Params'] = Get-BlProp $doc 'params'
    $r['Problems'] = $problems.ToArray()
    $r['Ok'] = ($problems.Count -eq 0)
    $r
}

function Get-BlItemCounts {
    param($Items)
    $c = [ordered]@{ ok = 0; notPresent = 0; readFailed = 0 }
    foreach ($it in @($Items)) {
        $s = [string](Get-BlProp $it 'status')
        if ($s -ceq 'OK') { $c['ok'] = [int]$c['ok'] + 1 } elseif ($s -ceq 'NOT_PRESENT') { $c['notPresent'] = [int]$c['notPresent'] + 1 } else { $c['readFailed'] = [int]$c['readFailed'] + 1 }
    }
    $c
}

function Write-BlResultLines {
    param($Results, [int]$Max = 60)
    $n = 0
    foreach ($r in @($Results)) {
        if ([string]$r['verdict'] -ceq 'SAME') { continue }
        $n++
        if ($n -gt $Max) { Write-Host '  ... (더 있다. 보고 파일을 본다)'; break }
        Write-Host ('  [{0}] {1} ({2}) {3}' -f $r['verdict'], $r['key'], $r['code'], $r['detail'])
    }
}

function Write-BlOverallBanner {
    param([string]$Label, $Cmp)
    $c = $Cmp['Counts']
    Write-Host ('{0}: {1}  (같음 {2} / 다름 {3} / 확인 불가 {4})' -f $Label, $Cmp['Overall'], $c['same'], $c['different'], $c['unverifiable'])
    if ($Cmp['Overall'] -ceq 'EQUAL') { Write-Host '  모든 항목을 읽어서 확인했고 기대와 같았다.' }
    elseif ($Cmp['Overall'] -ceq 'DIFFERENT') { Write-Host '  다른 항목이 있다. 아래 목록을 확인한다.' }
    else { Write-Host '  다른 항목은 보이지 않았지만 읽지 못했거나 비교할 수 없는 항목이 있어 "같다"고 말하지 않는다.' }
}

# ══ 흐름 ═══════════════════════════════════════════════════════════════════════
function New-BlParamsRecord {
    param([string]$DistRoot, $Layout, [string]$RunId, [bool]$TreeStats)
    [ordered]@{ distRoot = $DistRoot; venvRoot = $Layout['VenvRoot']; basePythonHome = $Layout['BaseHome']; runId = $RunId; treeStats = $TreeStats }
}

function Get-BlRunIdFromDir {
    param([string]$RunDir)
    foreach ($name in @('preflight.json', 'resources.json')) {
        $p = Join-Path $RunDir $name
        $st = Invoke-BlPort -Name 'Read-BlPathState' -Arguments @{ Path = $p }
        if ($st['Ok'] -and [string]$st['State'] -eq 'FILE') {
            $t = Invoke-BlPort -Name 'Read-BlTextFile' -Arguments @{ Path = $p }
            if (-not $t['Ok']) { continue }
            try { $j = ConvertFrom-Json -InputObject ([string]$t['Text']); $id = [string](Get-BlProp $j 'runId'); if (Test-BlRunId $id) { return $id } } catch { continue }
        }
    }
    $null
}

function Invoke-BlSave {
    param([string]$OutFile, [string]$DistRoot, [string]$VenvRoot, [string]$BasePythonHome, [string]$RunDir, [string]$RunId, [bool]$TreeStats, [bool]$Force)
    if ([string]::IsNullOrWhiteSpace($OutFile)) { Write-Host 'Save 에는 -OutFile 이 필요하다.'; return 3 }
    $probs = @(Get-BlOutFileProblems -Path $OutFile -Force $Force)
    if ($probs.Count -gt 0) { Write-Host ('출력 파일을 쓸 수 없다: ' + ($probs -join ' ; ')); return 3 }
    $rid = $RunId
    if ([string]::IsNullOrWhiteSpace($rid) -and -not [string]::IsNullOrWhiteSpace($RunDir)) {
        $rid = Get-BlRunIdFromDir -RunDir $RunDir
        if ([string]::IsNullOrWhiteSpace($rid)) { Write-Host '-RunDir 에서 RunId 를 읽지 못했다(preflight.json / resources.json).'; return 3 }
    }
    if (-not [string]::IsNullOrWhiteSpace($rid) -and -not (Test-BlRunId $rid)) { Write-Host ('RunId 형식이 올바르지 않다: {0}' -f $rid); return 3 }
    $layout = Resolve-BlLayout -DistRoot $DistRoot -VenvRoot $VenvRoot -BasePythonHome $BasePythonHome
    if ($null -eq $layout['VenvRoot']) { Write-Host ('가상환경 루트를 정하지 못했다: ' + (@($layout['Problems']) -join '; ')); return 3 }
    $items = @(Get-BaselineItems -Layout $layout -RunId $rid -TreeStats $TreeStats)
    $dups = @(Get-BlDuplicateKeys -Items $items)
    if ($dups.Count -gt 0) { Write-Host ('키가 겹친다. 값을 덮어쓰게 되므로 저장하지 않는다: ' + ($dups -join ' ; ')); return 3 }
    $counts = Get-BlItemCounts -Items $items
    $params = New-BlParamsRecord -DistRoot $DistRoot -Layout $layout -RunId $rid -TreeStats $TreeStats
    $doc = [ordered]@{
        schema = $Script:BlSchema; tool = $Script:BlTool; mode = 'Save'; createdUtc = [DateTime]::UtcNow.ToString('o')
        computer = $env:COMPUTERNAME; psVersion = $PSVersionTable.PSVersion.ToString(); elevated = (Test-BlElevated)
        params = $params; counts = $counts; items = @($items)
    }
    try { Write-BlJsonFile -Path $OutFile -Object $doc -Force $Force } catch { Write-Host ('기준 파일을 쓰지 못했다: ' + (Get-BlExceptionText $_)); return 3 }
    Write-Host ('기준 저장: {0}' -f $OutFile)
    Write-Host ('  항목 {0}개: OK {1} / NOT_PRESENT {2} / READ_FAILED {3}' -f @($items).Count, $counts['ok'], $counts['notPresent'], $counts['readFailed'])
    if ([int]$counts['readFailed'] -gt 0) {
        foreach ($it in $items) { if ([string](Get-BlProp $it 'status') -ceq 'READ_FAILED') { Write-Host ('  [READ_FAILED] {0}: {1}' -f (Get-BlProp $it 'key'), (Get-BlProp $it 'reason')) } }
        Write-Host '  읽지 못한 항목이 있다. 이 기준으로는 그 항목을 나중에 "같다"고 말할 수 없다(비교는 확인 불가가 된다). 적용 전에 원인을 해결한다.'
        return 2
    }
    0
}

function Get-BlLayoutFromParams {
    param($Params)
    $venv = [string](Get-BlProp $Params 'venvRoot')
    $baseHome = [string](Get-BlProp $Params 'basePythonHome')
    Resolve-BlLayout -DistRoot '' -VenvRoot $venv -BasePythonHome $baseHome
}

function Invoke-BlCompare {
    param([string]$BaselineFile, [string]$OutFile, [bool]$Force)
    if ([string]::IsNullOrWhiteSpace($BaselineFile)) { Write-Host 'Compare 에는 -BaselineFile 이 필요하다.'; return 3 }
    if (-not [string]::IsNullOrWhiteSpace($OutFile)) {
        $probs = @(Get-BlOutFileProblems -Path $OutFile -Force $Force -Protect $BaselineFile)
        if ($probs.Count -gt 0) { Write-Host ('출력 파일을 쓸 수 없다: ' + ($probs -join ' ; ')); return 3 }
    }
    $b = Read-BlBaselineFile -Path $BaselineFile
    if (-not $b['Ok']) { Write-Host ('기준 파일을 쓸 수 없다: ' + (@($b['Problems']) -join ' ; ')); return 3 }
    $layout = Get-BlLayoutFromParams -Params $b['Params']
    if ($null -eq $layout['VenvRoot']) { Write-Host '기준에 가상환경 루트가 없다.'; return 3 }
    $rid = [string](Get-BlProp $b['Params'] 'runId')
    $tree = $false; if ([string](Get-BlProp $b['Params'] 'treeStats') -ieq 'True') { $tree = $true }
    $current = @(Get-BaselineItems -Layout $layout -RunId $rid -TreeStats $tree)
    $dups = @(Get-BlDuplicateKeys -Items $current)
    if ($dups.Count -gt 0) { Write-Host ('현재 읽기에서 키가 겹친다: ' + ($dups -join ' ; ')); return 3 }
    $cmp = Compare-BlSets -Expected $b['Items'] -Actual $current -Scope 'Union'
    Write-BlOverallBanner -Label '정리 후 비교(기준 대비)' -Cmp $cmp
    Write-BlResultLines -Results $cmp['Results']
    $code = Get-BlExitCode -Overall ([string]$cmp['Overall'])
    if (-not [string]::IsNullOrWhiteSpace($OutFile)) {
        $doc = [ordered]@{
            schema = $Script:BlSchema; tool = $Script:BlTool; mode = 'Compare'; createdUtc = [DateTime]::UtcNow.ToString('o'); computer = $env:COMPUTERNAME
            psVersion = $PSVersionTable.PSVersion.ToString(); elevated = (Test-BlElevated); baselineFile = $BaselineFile; baselineSha256 = $b['Sha256']
            overall = $cmp['Overall']; exitCode = $code; counts = $cmp['Counts']; results = @($cmp['Results']); current = @($current)
        }
        try { Write-BlJsonFile -Path $OutFile -Object $doc -Force $Force; Write-Host ('보고 파일: {0}' -f $OutFile) } catch { Write-Host ('보고 파일을 쓰지 못했다: ' + (Get-BlExceptionText $_)); return 3 }
    }
    $code
}

function Invoke-BlVerify {
    param([string]$BaselineFile, [string]$RunDir, [string]$OutFile, [bool]$Force)
    if ([string]::IsNullOrWhiteSpace($BaselineFile)) { Write-Host 'Verify 에는 -BaselineFile 이 필요하다.'; return 3 }
    if ([string]::IsNullOrWhiteSpace($RunDir)) { Write-Host 'Verify 에는 -RunDir(resources.json 이 있는 실행 기록 폴더)가 필요하다.'; return 3 }
    if (-not [string]::IsNullOrWhiteSpace($OutFile)) {
        $probs = @(Get-BlOutFileProblems -Path $OutFile -Force $Force -Protect $BaselineFile)
        if ($probs.Count -gt 0) { Write-Host ('출력 파일을 쓸 수 없다: ' + ($probs -join ' ; ')); return 3 }
    }
    $b = Read-BlBaselineFile -Path $BaselineFile
    if (-not $b['Ok']) { Write-Host ('기준 파일을 쓸 수 없다: ' + (@($b['Problems']) -join ' ; ')); return 3 }
    $mt = Invoke-BlPort -Name 'Read-BlTextFile' -Arguments @{ Path = (Join-Path $RunDir 'resources.json') }
    if (-not $mt['Ok']) { Write-Host ('실행 기록(resources.json)을 읽지 못했다: ' + (ConvertTo-BlPortFailure $mt)); return 3 }
    $run = $null
    try { $run = ConvertFrom-BlManifest -Text ([string]$mt['Text']) } catch { Write-Host ('resources.json 을 해석하지 못했다: ' + (Get-BlExceptionText $_)); return 3 }
    if (-not (Test-BlRunId ([string]$run['RunId']))) { Write-Host 'resources.json 의 RunId 형식이 올바르지 않다.'; return 3 }
    if ([string]::IsNullOrWhiteSpace([string]$run['Sid'])) { Write-Host 'resources.json 에 전용 계정 SID 가 없다.'; return 3 }
    $layout = Get-BlLayoutFromParams -Params $b['Params']
    if ($null -eq $layout['VenvRoot']) { Write-Host '기준에 가상환경 루트가 없다.'; return 3 }
    $tree = $false; if ([string](Get-BlProp $b['Params'] 'treeStats') -ieq 'True') { $tree = $true }
    $current = @(Get-BaselineItems -Layout $layout -RunId ([string]$run['RunId']) -TreeStats $tree)
    $dups = @(Get-BlDuplicateKeys -Items $current)
    if ($dups.Count -gt 0) { Write-Host ('현재 읽기에서 키가 겹친다: ' + ($dups -join ' ; ')); return 3 }
    $plan = New-BlVerifyPlan -BaselineItems $b['Items'] -CurrentItems $current -Run $run -Layout $layout -BaselineParams $b['Params']
    $actualAll = @($current) + @($plan['Actual'])
    $cmp = Compare-BlSets -Expected $plan['Expected'] -Actual $actualAll -Scope 'Expected'
    Write-BlOverallBanner -Label '적용 직후 직접 확인(기준 + 예상 변화 대비)' -Cmp $cmp
    Write-BlResultLines -Results $cmp['Results']
    $code = Get-BlExitCode -Overall ([string]$cmp['Overall'])
    if (-not [string]::IsNullOrWhiteSpace($OutFile)) {
        $doc = [ordered]@{
            schema = $Script:BlSchema; tool = $Script:BlTool; mode = 'Verify'; createdUtc = [DateTime]::UtcNow.ToString('o'); computer = $env:COMPUTERNAME
            psVersion = $PSVersionTable.PSVersion.ToString(); elevated = (Test-BlElevated); baselineFile = $BaselineFile; baselineSha256 = $b['Sha256']
            runDir = $RunDir; runId = $run['RunId']; overall = $cmp['Overall']; exitCode = $code; counts = $cmp['Counts']; results = @($cmp['Results']); current = @($current)
        }
        try { Write-BlJsonFile -Path $OutFile -Object $doc -Force $Force; Write-Host ('보고 파일: {0}' -f $OutFile) } catch { Write-Host ('보고 파일을 쓰지 못했다: ' + (Get-BlExceptionText $_)); return 3 }
    }
    $code
}

# 진입점이 부르는 하나의 함수. 종료 코드를 돌려준다: 0 같음(EQUAL)/저장 완료, 1 다름, 2 확인 불가(또는 읽지 못한 항목이 있는 저장), 3 사용법·입출력 오류
function Invoke-BaselineMain {
    param(
        [string]$Mode, [string]$OutFile, [string]$BaselineFile, [string]$DistRoot, [string]$VenvRoot, [string]$BasePythonHome,
        [string]$RunDir, [string]$RunId, [bool]$TreeStats = $false, [bool]$Force = $false
    )
    try {
        if ($Mode -ceq 'Save') { return (Invoke-BlSave -OutFile $OutFile -DistRoot $DistRoot -VenvRoot $VenvRoot -BasePythonHome $BasePythonHome -RunDir $RunDir -RunId $RunId -TreeStats $TreeStats -Force $Force) }
        if ($Mode -ceq 'Compare') { return (Invoke-BlCompare -BaselineFile $BaselineFile -OutFile $OutFile -Force $Force) }
        if ($Mode -ceq 'Verify') { return (Invoke-BlVerify -BaselineFile $BaselineFile -RunDir $RunDir -OutFile $OutFile -Force $Force) }
        Write-Host '-Mode 는 Save, Verify, Compare 중 하나여야 한다(대소문자 구분).'
        return 3
    } catch {
        Write-Host ('예기치 않은 오류: ' + (Get-BlExceptionText $_))
        return 3
    }
}
