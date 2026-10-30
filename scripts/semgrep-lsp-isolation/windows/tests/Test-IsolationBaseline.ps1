<#
.SYNOPSIS
  기준 저장·직접 확인·비교(Save-IsolationBaseline.ps1 / IsolationBaselineCore.ps1)의 시험. 실제 Semgrep 은 실행하지도 임포트하지도 않고, 계정·방화벽·감사·ACL 을 바꾸지도 않는다.
.DESCRIPTION
  구성
   (A) 정적 점검: 구문·BOM·LF·이상한 공백, 금지 명령(Invoke-Expression, 내려받기, semgrep 호출, Get-FileHash), 변경 명령 없음, 파일 쓰기 API 는 한 곳뿐.
   (B) 순수 함수: 키(파일 이름만으로 키를 만들 수 없음, 두 python.exe 는 다른 키), 항목 정규화, 중복 키 검출, 목록 값, 비교 진리표(fail-closed), 집합 비교와 종료 코드.
   (C) 임시 폴더의 진짜 파일: 해시·ACL·경로 상태·텍스트·목록·트리 읽기, 배치 해석, 두 python.exe 가 다른 키와 값으로 남는지, 출력 경로(덮어쓰기·링크·`..`·확장자) 거부.
   (D) 흐름(저장 → 비교, 적용 흉내 → 직접 확인 → 복구 흉내 → 비교): 머신 수준 포트(계정·그룹·방화벽·감사·프로필 목록·프로세스)만 모의로 바꾸고 나머지 파일 읽기는 임시 폴더에서 진짜로 한다.
       읽기 실패 주입(포트가 던짐), 키 중복 주입, 경로별 ACE 누락(가상환경 python.exe 의 것만 빠져도 기반 python.exe 의 것에 가려지지 않음) 포함.
   (E) 자식 프로세스로 진입점의 사용법 오류(종료 3) 확인.
   (F) 진짜 머신 읽기(-SkipRealStateCheck 로 건너뜀): 실제 포트로 읽어 저장 → 비교(종료 0 또는 2, 1 은 아님), 출력 폴더에 늘어난 파일은 출력 파일뿐.
  이 시험의 통과는 "이 도구의 읽기·비교 로직이 합성/임시 환경에서 의도대로 동작한다"까지만 뜻한다. 적용 중인 진짜 시스템의 직접 확인은 실제 실행에서 이 도구로 한다.
.EXAMPLE
  pwsh -NoProfile -File .\tests\Test-IsolationBaseline.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-IsolationBaseline.ps1
  pwsh -NoProfile -File .\tests\Test-IsolationBaseline.ps1 -SkipRealStateCheck   # 진짜 머신 읽기 구역 생략
#>
[CmdletBinding()]
param(
    [string]$CodeDir,
    [switch]$SkipRealStateCheck,
    [switch]$SkipChild,
    [switch]$KeepSandbox
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

# 5.1 에서는 param 기본값 안의 $PSScriptRoot 가 비어 있다. 본문에서 정한다.
if (-not $CodeDir) { $CodeDir = Split-Path -Parent $PSScriptRoot }
$CodeDir = (Resolve-Path -LiteralPath $CodeDir).Path
$CorePath = Join-Path $CodeDir 'IsolationBaselineCore.ps1'
$EntryPath = Join-Path $CodeDir 'Save-IsolationBaseline.ps1'
$Results = New-Object System.Collections.ArrayList
$Utf8 = New-Object Text.UTF8Encoding($false)

function Assert-That {
    param([string]$Case, [string]$Name, $Cond, [string]$Detail = '')
    $ok = $false
    if ($null -ne $Cond) { try { $ok = [bool]$Cond } catch { $ok = $false } }
    [void]$Results.Add([ordered]@{ case = $Case; name = $Name; pass = $ok; detail = $Detail })
    if (-not $ok) { Write-Host ("  FAIL  [{0}] {1}  {2}" -f $Case, $Name, $Detail) -ForegroundColor Red }
}
function Skip-That { param([string]$Case, [string]$Why) [void]$Results.Add([ordered]@{ case = $Case; name = 'SKIPPED'; pass = $null; detail = $Why }); Write-Host ("  SKIPPED [{0}] {1}" -f $Case, $Why) -ForegroundColor Yellow }
function Write-TestFile { param([string]$Path, [string]$Text) [IO.File]::WriteAllText($Path, $Text, $Utf8) }
function Read-TestJson { param([string]$Path) ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)) }
function Get-FileSha { param([string]$Path) $b = [IO.File]::ReadAllBytes($Path); $s = [Security.Cryptography.SHA256]::Create(); try { (($s.ComputeHash($b) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $s.Dispose() } }
function Get-Keys { param($Results, [string]$Verdict) @($Results | Where-Object { [string]$_.verdict -eq $Verdict } | ForEach-Object { [string]$_.key }) }

# 코어를 불러온다(점 읽기). 이후 시험이 포트를 대체하고, 필요하면 다시 불러와 되돌린다.
. $CorePath
$Script:RealReadAcl = ${function:Read-BlAcl}

# ═══ (A) 정적 점검 ════════════════════════════════════════════════════════════
foreach ($f in @($CorePath, $EntryPath)) {
    $name = Split-Path -Leaf $f
    $bytes = [IO.File]::ReadAllBytes($f)
    Assert-That 'static' "${name}: UTF-8 BOM" (($bytes.Length -ge 3) -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)
    Assert-That 'static' "${name}: LF only (CR 없음)" (-not ($bytes -contains 13))
    $text = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
    $odd = [regex]::Matches($text, '[\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]')
    Assert-That 'static' "${name}: 이상한 공백 없음" ($odd.Count -eq 0) "count=$($odd.Count)"
    $tokens = $null; $errs = $null
    $ast = [Management.Automation.Language.Parser]::ParseInput($text, [ref]$tokens, [ref]$errs)
    Assert-That 'static' "${name}: 구문 오류 없음" (@($errs).Count -eq 0) (@($errs | ForEach-Object { $_.Message }) -join ' ; ')
    # 주석을 뺀 코드 본문
    $code = $text
    $comments = @($tokens | Where-Object { $_.Kind -eq 'Comment' } | Sort-Object { $_.Extent.StartOffset } -Descending)
    foreach ($c in $comments) { $code = $code.Remove($c.Extent.StartOffset, $c.Extent.EndOffset - $c.Extent.StartOffset) }
    $cmdNames = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | ForEach-Object { $_.GetCommandName() } | Where-Object { $_ })
    $defined = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true) | ForEach-Object { $_.Name })
    $mutating = @($cmdNames | Where-Object { $_ -match '^(Set|Remove|Add|Enable|Disable|Grant|Revoke|Stop|Restart|Start|Register|Unregister|Install|Uninstall|Clear|Reset|Update|Out|Move|Copy|Rename)-' -or $_ -match '^New-(Item|NetFirewallRule|LocalUser|LocalGroup|Service|ItemProperty|PSDrive|SmbShare|ScheduledTask)$' -or $_ -match '^Invoke-(Expression|WebRequest|RestMethod|Item|Command)$' -or $_ -in @('iex', 'iwr', 'irm', 'curl', 'wget', 'Get-FileHash', 'Import-Module', 'Add-Type') } | Where-Object { ($defined -notcontains $_) -and $_ -ne 'Set-StrictMode' })
    Assert-That 'static' "${name}: 변경·실행·내려받기 명령 없음" ($mutating.Count -eq 0) ($mutating -join ',')
    Assert-That 'static' "${name}: semgrep 을 실행하는 명령 없음" (@($cmdNames | Where-Object { $_ -match 'semgrep' }).Count -eq 0)
    $native = [regex]::Matches($code, '(?i)netsh|icacls|takeown|\bsc\.exe|reg\.exe|SetAccessControl|AddAccessRule|RemoveAccessRule|SetAccessRule|\.Delete\(|\.Move\(|WriteAllText|WriteAllBytes|AppendAllText|CreateDirectory|\.Replace\(|Start-Process|\biex\b')
    Assert-That 'static' "${name}: 시스템·파일을 바꾸는 API 문구 없음" ($native.Count -eq 0) (@($native | ForEach-Object { $_.Value }) -join ',')
    if ($f -eq $CorePath) {
        Assert-That 'static' "${name}: auditpol 은 /get 만 쓴다" (($code -match "'/get'") -and ($code -notmatch "'/(set|backup|restore|clear|remove|resetPolicy)'"))
        Assert-That 'static' "${name}: 파일 쓰기 API 는 Write-BlJsonFile 한 곳뿐" ((([regex]::Matches($code, '\[IO\.FileAccess\]::Write')).Count -eq 1) -and (([regex]::Matches($code, '\$fs\.Write\(')).Count -eq 1))
        Assert-That 'static' "${name}: 해시는 .NET SHA256 (Get-FileHash 없음)" (($code -match 'Security\.Cryptography\.SHA256') -and ($code -notmatch 'Get-FileHash'))
        Assert-That 'static' "${name}: 점 읽기만으로는 읽기·쓰기를 하지 않는다(최상위에 함수 정의와 변수 설정뿐)" (@($ast.EndBlock.Statements | Where-Object { $_ -isnot [Management.Automation.Language.FunctionDefinitionAst] -and $_ -isnot [Management.Automation.Language.AssignmentStatementAst] -and $_.Extent.Text -notmatch '^Set-StrictMode' }).Count -eq 0)
    } else {
        Assert-That 'static' "${name}: 진입점은 Invoke-BaselineMain 하나만 부른다" (($code -match 'Invoke-BaselineMain @entryArgs') -and ($code -match 'exit \(\[int\]\$codes\[-1\]\)'))
    }
}

# ═══ (B) 순수 함수 ═══════════════════════════════════════════════════════════
# 키
$threw = $false; try { [void](New-BlKey 'file' 'python.exe') } catch { $threw = $true }
Assert-That 'key' '파일 이름만으로는 file 키를 만들 수 없다' $threw
$threw = $false; try { [void](New-BlKey 'acl' 'python.exe') } catch { $threw = $true }
Assert-That 'key' '파일 이름만으로는 acl 키를 만들 수 없다' $threw
$threw = $false; try { [void](New-BlKey 'file' '.\relative\python.exe') } catch { $threw = $true }
Assert-That 'key' '상대 경로로는 경로 키를 만들 수 없다' $threw
$k1 = New-BlKey 'file' 'C:\dist\venv\Scripts\python.exe'
$k2 = New-BlKey 'file' 'C:\Python312\python.exe'
Assert-That 'key' '다른 폴더의 두 python.exe 는 다른 키다' ($k1 -ne $k2) "$k1 / $k2"
Assert-That 'key' '경로 키는 소문자 정규화(대소문자·끝 구분자 무시)' ((New-BlKey 'file' 'C:\A\B\X.exe') -ceq (New-BlKey 'file' 'c:\a\b\x.exe\'))
Assert-That 'key' '경로 키 접두는 종류다' ($k1.StartsWith('file:c:\'))
Assert-That 'key' '역할 키는 둘이 다르다(venv-python.exe / base-python.exe)' ((New-BlKey 'role' 'venv-python.exe') -ne (New-BlKey 'role' 'base-python.exe'))
$threw = $false; try { [void](New-BlKey 'role' 'python.exe') } catch { $threw = $true }
Assert-That 'key' '역할 이름이 아닌 값(python.exe)은 role 키가 될 수 없다' $threw
$threw = $false; try { [void](New-BlKey 'Bad Kind' 'x') } catch { $threw = $true }
Assert-That 'key' '종류 형식이 틀리면 거부' $threw

# 항목 정규화
$i = New-BlItem -Key 'x:1' -Kind 'x' -Status 'OK' -Value ''
Assert-That 'item' 'OK 인데 빈 값이면 READ_FAILED(EMPTY_VALUE)' ($i['status'] -ceq 'READ_FAILED' -and $i['reason'] -ceq 'EMPTY_VALUE')
$i = New-BlItem -Key 'x:1' -Kind 'x' -Status 'OK' -Value $null
Assert-That 'item' 'OK 인데 null 이면 READ_FAILED' ($i['status'] -ceq 'READ_FAILED')
$i = New-BlItem -Key 'x:1' -Kind 'x' -Status 'OK' -Value '   '
Assert-That 'item' 'OK 인데 공백뿐이면 READ_FAILED' ($i['status'] -ceq 'READ_FAILED')
$i = New-BlItem -Key 'x:1' -Kind 'x' -Status 'NOT_PRESENT'
Assert-That 'item' '근거 없는 NOT_PRESENT 는 READ_FAILED(ABSENCE_UNPROVEN)' ($i['status'] -ceq 'READ_FAILED' -and $i['reason'] -ceq 'ABSENCE_UNPROVEN')
$i = New-BlItem -Key 'x:1' -Kind 'x' -Status 'NOT_PRESENT' -Reason 'path-state:not-found'
Assert-That 'item' '근거 있는 NOT_PRESENT 는 유지' ($i['status'] -ceq 'NOT_PRESENT' -and $null -eq $i['value'])
$i = New-BlItem -Key 'x:1' -Kind 'x' -Status 'READ_FAILED' -Value 'leftover' -Reason ''
Assert-That 'item' 'READ_FAILED 는 값을 버리고 이유가 비지 않는다' ($null -eq $i['value'] -and $i['reason'].Length -gt 0)
$i = New-BlItem -Key 'x:1' -Kind 'x' -Status 'ok' -Value 'a'
Assert-That 'item' '알 수 없는 status(소문자 ok)는 READ_FAILED(INVALID_STATUS)' ($i['status'] -ceq 'READ_FAILED' -and $i['reason'] -ceq 'INVALID_STATUS')
$i = New-BlItem -Key 'x:1' -Kind 'x' -Status 'OK' -Value 'line1
line2' -Reason "multi`nline"
Assert-That 'item' '이유는 한 줄로 정리된다' ($i['reason'] -notmatch "[\r\n]")

# 중복 키
$dupItems = @((New-BlItem -Key 'ace.file.python.exe' -Kind 'x' -Status 'OK' -Value 'venv'), (New-BlItem -Key 'Ace.File.Python.exe' -Kind 'x' -Status 'OK' -Value 'base'), (New-BlItem -Key 'other' -Kind 'x' -Status 'OK' -Value 'v'))
Assert-That 'dup' '같은 키(대소문자 무시)가 두 번 있으면 중복으로 보고한다(옛 python.exe 덮어쓰기 재현)' (@(Get-BlDuplicateKeys -Items $dupItems).Count -eq 1)
Assert-That 'dup' '중복이 없으면 빈 목록' (@(Get-BlDuplicateKeys -Items @($dupItems[2])).Count -eq 0)

# 목록 값
Assert-That 'list' '빈 목록도 빈 문자열이 아니다(count=0)' ((ConvertTo-BlListValue -Lines @()) -ceq 'count=0')
Assert-That 'list' '서수 정렬과 개수' ((ConvertTo-BlListValue -Lines @('b', 'a', 'B')) -ceq "count=3`nB`na`nb")
Assert-That 'list' '왕복' ((@(ConvertFrom-BlListValue -Value (ConvertTo-BlListValue -Lines @('x', 'y'))) -join ',') -ceq 'x,y')
Assert-That 'list' '줄바꿈은 공백으로 바뀐다' ((ConvertTo-BlListValue -Lines @("a`nb")) -ceq "count=1`na b")
$pl = Split-BlPathedList -Value (Format-BlPathedList -Path 'C:\x' -Lines @('q', 'p'))
Assert-That 'list' 'path 목록 왕복' ($pl['Ok'] -and $pl['Path'] -ceq 'C:\x' -and (@($pl['Lines']) -join ',') -ceq 'p,q')

# 비교 진리표(fail-closed)
function Mk { param([string]$S, $V, [string]$R = '') @{ key = 'k:x'; kind = 'k'; status = $S; value = $V; reason = $R } }
function Cmp { param($E, $A) (Compare-BlItem -Expected $E -Actual $A -Key 'k:x')['verdict'] }
Assert-That 'truth' 'OK a / OK a = SAME' ((Cmp (Mk 'OK' 'a') (Mk 'OK' 'a')) -ceq 'SAME')
Assert-That 'truth' 'OK a / OK b = DIFFERENT' ((Cmp (Mk 'OK' 'a') (Mk 'OK' 'b')) -ceq 'DIFFERENT')
Assert-That 'truth' '대소문자만 다른 값 = DIFFERENT(서수 비교)' ((Cmp (Mk 'OK' 'A') (Mk 'OK' 'a')) -ceq 'DIFFERENT')
Assert-That 'truth' 'READ_FAILED / OK = UNVERIFIABLE' ((Cmp (Mk 'READ_FAILED' $null 'x') (Mk 'OK' 'a')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' 'OK / READ_FAILED = UNVERIFIABLE' ((Cmp (Mk 'OK' 'a') (Mk 'READ_FAILED' $null 'x')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' 'READ_FAILED / READ_FAILED = UNVERIFIABLE (같은 이유여도)' ((Cmp (Mk 'READ_FAILED' $null 'x') (Mk 'READ_FAILED' $null 'x')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' 'READ_FAILED / NOT_PRESENT = UNVERIFIABLE' ((Cmp (Mk 'READ_FAILED' $null 'x') (Mk 'NOT_PRESENT' $null 'proof')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' 'null / null (둘 다 OK 인데 값 null) = UNVERIFIABLE, 일치로 세지 않는다' ((Cmp (Mk 'OK' $null) (Mk 'OK' $null)) -ceq 'UNVERIFIABLE')
Assert-That 'truth' '"" / "" (둘 다 OK 인데 빈 문자열) = UNVERIFIABLE' ((Cmp (Mk 'OK' '') (Mk 'OK' '')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' '공백 / 공백 = UNVERIFIABLE' ((Cmp (Mk 'OK' '  ') (Mk 'OK' '  ')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' 'OK a / OK "" = UNVERIFIABLE (한쪽만 비어도 같다고 하지 않는다)' ((Cmp (Mk 'OK' 'a') (Mk 'OK' '')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' '기대 항목 없음 = UNVERIFIABLE' ((Cmp $null (Mk 'OK' 'a')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' '실제 항목 없음 = UNVERIFIABLE' ((Cmp (Mk 'OK' 'a') $null) -ceq 'UNVERIFIABLE')
Assert-That 'truth' '양쪽 항목 없음 = UNVERIFIABLE' ((Cmp $null $null) -ceq 'UNVERIFIABLE')
Assert-That 'truth' 'NOT_PRESENT(근거) / NOT_PRESENT(근거) = SAME' ((Cmp (Mk 'NOT_PRESENT' $null 'proof') (Mk 'NOT_PRESENT' $null 'proof')) -ceq 'SAME')
Assert-That 'truth' 'NOT_PRESENT(근거 없음) / NOT_PRESENT = UNVERIFIABLE' ((Cmp (Mk 'NOT_PRESENT' $null '') (Mk 'NOT_PRESENT' $null 'proof')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' 'NOT_PRESENT / OK = DIFFERENT' ((Cmp (Mk 'NOT_PRESENT' $null 'proof') (Mk 'OK' 'a')) -ceq 'DIFFERENT')
Assert-That 'truth' 'OK / NOT_PRESENT = DIFFERENT' ((Cmp (Mk 'OK' 'a') (Mk 'NOT_PRESENT' $null 'proof')) -ceq 'DIFFERENT')
Assert-That 'truth' '알 수 없는 status = UNVERIFIABLE' ((Cmp (Mk 'ok' 'a') (Mk 'ok' 'a')) -ceq 'UNVERIFIABLE')
Assert-That 'truth' '키가 다른 두 항목 = UNVERIFIABLE' ((Compare-BlItem -Expected @{ key = 'k:a'; status = 'OK'; value = 'v' } -Actual @{ key = 'k:b'; status = 'OK'; value = 'v' } -Key 'k:a')['verdict'] -ceq 'UNVERIFIABLE')
Assert-That 'truth' 'JSON 에서 읽은 객체(PSCustomObject)도 같은 규칙으로 비교한다' ((Cmp ([pscustomobject]@{ key = 'k:x'; status = 'OK'; value = 'a'; reason = '' }) ([pscustomobject]@{ key = 'k:x'; status = 'OK'; value = 'a'; reason = '' })) -ceq 'SAME')
$listDelta = Compare-BlItem -Expected (Mk 'OK' (ConvertTo-BlListValue -Lines @('a', 'b'))) -Actual (Mk 'OK' (ConvertTo-BlListValue -Lines @('a', 'c'))) -Key 'k:x'
Assert-That 'truth' '목록 값이 다르면 추가/제거 줄을 알려준다' (($listDelta['verdict'] -ceq 'DIFFERENT') -and $listDelta['detail'].Contains('추가 1개 [c]') -and $listDelta['detail'].Contains('제거 1개 [b]')) $listDelta['detail']

# 전체 판정과 종료 코드
function Ov { param([string[]]$Verdicts) $r = @($Verdicts | ForEach-Object { @{ verdict = $_ } }); Get-BlOverall -Results $r }
Assert-That 'overall' '전부 SAME = EQUAL(종료 0)' ((Ov @('SAME', 'SAME')) -ceq 'EQUAL' -and (Get-BlExitCode 'EQUAL') -eq 0)
Assert-That 'overall' 'DIFFERENT 하나 = DIFFERENT(종료 1)' ((Ov @('SAME', 'DIFFERENT')) -ceq 'DIFFERENT' -and (Get-BlExitCode 'DIFFERENT') -eq 1)
Assert-That 'overall' 'UNVERIFIABLE 하나(다른 것은 모두 SAME) = UNVERIFIABLE(종료 2)' ((Ov @('SAME', 'UNVERIFIABLE')) -ceq 'UNVERIFIABLE' -and (Get-BlExitCode 'UNVERIFIABLE') -eq 2)
Assert-That 'overall' 'DIFFERENT 와 UNVERIFIABLE 가 함께면 DIFFERENT' ((Ov @('UNVERIFIABLE', 'DIFFERENT')) -ceq 'DIFFERENT')
Assert-That 'overall' '비교한 것이 하나도 없으면 EQUAL 이 아니라 UNVERIFIABLE' ((Get-BlOverall -Results @()) -ceq 'UNVERIFIABLE')

# 집합 비교
function MkI { param([string]$K, [string]$S, $V, [string]$R = '') New-BlItem -Key $K -Kind 'x' -Status $S -Value $V -Reason $R }
$base = @((MkI 'a:1' 'OK' 'v1'), (MkI 'a:2' 'OK' 'v2'))
$c1 = Compare-BlSets -Expected $base -Actual @((MkI 'a:1' 'OK' 'v1'), (MkI 'a:2' 'OK' 'v2')) -Scope 'Union'
Assert-That 'sets' '같은 두 집합 = EQUAL' ($c1['Overall'] -ceq 'EQUAL' -and $c1['Counts']['same'] -eq 2)
$c2 = Compare-BlSets -Expected $base -Actual @((MkI 'a:1' 'OK' 'v1')) -Scope 'Union'
Assert-That 'sets' '현재에 키가 없으면(기준에만 있음) EQUAL 이 아니다' ($c2['Overall'] -ceq 'UNVERIFIABLE' -and (@(Get-Keys $c2['Results'] 'UNVERIFIABLE')) -contains 'a:2')
$c3 = Compare-BlSets -Expected $base -Actual @((MkI 'a:1' 'OK' 'v1'), (MkI 'a:2' 'OK' 'v2'), (MkI 'a:3' 'OK' 'v3')) -Scope 'Union'
Assert-That 'sets' '현재에만 있는 키는 Union 에서 EQUAL 이 아니다' ($c3['Overall'] -ceq 'UNVERIFIABLE')
$c3b = Compare-BlSets -Expected $base -Actual @((MkI 'a:1' 'OK' 'v1'), (MkI 'a:2' 'OK' 'v2'), (MkI 'a:3' 'OK' 'v3')) -Scope 'Expected'
Assert-That 'sets' '기대 쪽 키만 보는 Expected 범위는 여분의 실제 키를 무시한다' ($c3b['Overall'] -ceq 'EQUAL')
$c4 = Compare-BlSets -Expected $base -Actual @((MkI 'a:1' 'OK' 'v1'), (MkI 'a:1' 'OK' 'v1'), (MkI 'a:2' 'OK' 'v2')) -Scope 'Union'
Assert-That 'sets' '실제 쪽 중복 키는 값이 같아도 UNVERIFIABLE(DUPLICATE_KEY)' ($c4['Overall'] -ceq 'UNVERIFIABLE' -and (@($c4['Results'] | Where-Object { $_['code'] -ceq 'DUPLICATE_KEY' })).Count -eq 1)
$c5 = Compare-BlSets -Expected @((MkI 'a:1' 'OK' 'v1'), (MkI 'a:2' 'READ_FAILED' $null 'boom')) -Actual @((MkI 'a:1' 'OK' 'v1'), (MkI 'a:2' 'OK' 'v2')) -Scope 'Union'
Assert-That 'sets' '읽기 실패 하나만 있고 다른 차이는 없으면 UNVERIFIABLE → 종료 2' ($c5['Overall'] -ceq 'UNVERIFIABLE' -and (Get-BlExitCode $c5['Overall']) -eq 2)
$c6 = Compare-BlSets -Expected @((MkI 'a:1' 'OK' 'v1'), (MkI 'a:2' 'READ_FAILED' $null 'boom')) -Actual @((MkI 'a:1' 'OK' 'CHANGED'), (MkI 'a:2' 'OK' 'v2')) -Scope 'Union'
Assert-That 'sets' '차이가 하나라도 있으면 읽기 실패가 있어도 DIFFERENT → 종료 1' ($c6['Overall'] -ceq 'DIFFERENT' -and (Get-BlExitCode $c6['Overall']) -eq 1)
$c7 = Compare-BlSets -Expected @() -Actual @() -Scope 'Union'
Assert-That 'sets' '빈 집합끼리는 EQUAL 이 아니다' ($c7['Overall'] -ceq 'UNVERIFIABLE')

# 이름 규칙: 격리 스크립트의 Get-IsoNames 와 같아야 한다(읽기 전용으로 점 읽기만 한다)
function Get-CommonNames { param([string]$RunId) . (Join-Path $CodeDir 'IsolationCommon.ps1'); Get-IsoNames -RunId $RunId }
$rid = '20261030T010203Z-0a1b2c3d'
$mine = Get-BlRunNames -RunId $rid
$common = Get-CommonNames -RunId $rid
Assert-That 'names' 'Get-BlRunNames 가 IsolationCommon 의 Get-IsoNames 와 UserName/RuleName/Marker/WorkDir 이 모두 같다' (($mine['UserName'] -ceq $common['UserName']) -and ($mine['RuleName'] -ceq $common['RuleName']) -and ($mine['Marker'] -ceq $common['Marker']) -and ($mine['WorkDir'] -ceq $common['WorkDir'])) "mine=$($mine['UserName']),$($mine['RuleName']),$($mine['WorkDir']) common=$($common['UserName']),$($common['RuleName']),$($common['WorkDir'])"
$threw = $false; try { [void](Get-BlRunNames -RunId 'bad') } catch { $threw = $true }
Assert-That 'names' '형식이 틀린 RunId 는 거부' $threw

# ═══ 샌드박스와 진짜 파일 읽기(C) ══════════════════════════════════════════════
$Sandbox = Join-Path ([IO.Path]::GetTempPath()) ('bsl-test-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
[void][IO.Directory]::CreateDirectory($Sandbox)
$origProgramData = $env:ProgramData
$ProgData = Join-Path $Sandbox 'ProgramData'
$UsersDir = Join-Path $Sandbox 'Users'
[void][IO.Directory]::CreateDirectory($ProgData)
[void][IO.Directory]::CreateDirectory((Join-Path $UsersDir 'Public'))
[void][IO.Directory]::CreateDirectory((Join-Path $UsersDir 'alice'))

function New-TestLayout {
    param([string]$Root, [string]$BaseName = 'basepy')
    [void][IO.Directory]::CreateDirectory($Root)
    $dist = Join-Path $Root 'dist'
    $venv = Join-Path $dist 'venv'
    $scripts = Join-Path $venv 'Scripts'
    $coreDir = Join-Path $venv 'Lib\site-packages\semgrep\bin'
    $base = Join-Path $Root $BaseName
    foreach ($d in @($scripts, $coreDir, $base)) { [void][IO.Directory]::CreateDirectory($d) }
    $l = [ordered]@{
        Root = $Root; Dist = $dist; Venv = $venv; Base = $base
        SemgrepExe = (Join-Path $scripts 'semgrep.exe'); VenvPython = (Join-Path $scripts 'python.exe')
        Core = (Join-Path $coreDir 'semgrep-core.exe'); BasePython = (Join-Path $base 'python.exe'); Cfg = (Join-Path $venv 'pyvenv.cfg')
    }
    Write-TestFile $l.SemgrepExe 'semgrep-exe-content'
    Write-TestFile $l.VenvPython 'venv-python-content'
    Write-TestFile $l.Core 'core-content'
    Write-TestFile $l.BasePython 'base-python-content'
    Write-TestFile $l.Cfg ("home = $base`r`ninclude-system-site-packages = false`r`nversion = 3.12.0`r`n")
    $l
}
function Run-Main {
    param([hashtable]$A)
    $all = @(Invoke-BaselineMain @A 6>&1)
    $text = (@($all | Where-Object { $_ -is [Management.Automation.InformationRecord] } | ForEach-Object { [string]$_.MessageData }) -join "`n")
    $ints = @($all | Where-Object { $_ -is [int] })
    $code = -1; if ($ints.Count -gt 0) { $code = [int]$ints[-1] }
    $stray = @($all | Where-Object { $_ -isnot [int] -and $_ -isnot [Management.Automation.InformationRecord] }).Count
    [pscustomobject]@{ Exit = $code; Text = $text; Stray = $stray }
}

try {
    # 파일 읽기 포트
    $L = New-TestLayout (Join-Path $Sandbox 'real')
    $abc = Join-Path $Sandbox 'abc.txt'
    [IO.File]::WriteAllBytes($abc, [Text.Encoding]::ASCII.GetBytes('abc'))
    $f = Read-BlFileFacts -Path $abc
    Assert-That 'ports' 'Read-BlFileFacts: abc 의 크기와 SHA-256 (알려진 값)' ($f['Ok'] -and $f['Size'] -eq 3 -and $f['Sha256'] -ceq 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') "$($f['Sha256'])"
    $f2 = Read-BlFileFacts -Path (Join-Path $Sandbox 'nope.bin')
    Assert-That 'ports' 'Read-BlFileFacts: 없는 파일은 Ok=false(빈 해시로 쓰지 않는다)' (-not $f2['Ok'] -and $null -eq $f2['Sha256'])
    $s1 = Read-BlPathState -Path $abc
    $s2 = Read-BlPathState -Path $Sandbox
    $s3 = Read-BlPathState -Path (Join-Path $Sandbox 'missing-here')
    $s4 = Read-BlPathState -Path (Join-Path $Sandbox 'missing-dir\deeper\x')
    Assert-That 'ports' 'Read-BlPathState: 파일 / 폴더 / 없음 / 상위도 없음' (($s1['State'] -eq 'FILE') -and ($s2['State'] -eq 'DIR') -and ($s3['Ok'] -and $s3['State'] -eq 'ABSENT') -and ($s4['Ok'] -and $s4['State'] -eq 'ABSENT'))
    $a = Read-BlAcl -Path $abc
    Assert-That 'ports' 'Read-BlAcl: 임시 파일의 SDDL(소유자·그룹 포함)·ACE 줄·소유자' ($a['Ok'] -and ([string]$a['Sddl']).StartsWith('O:') -and @($a['Aces']).Count -ge 1 -and -not [string]::IsNullOrWhiteSpace([string]$a['Owner'])) "$($a['Error'])"
    Assert-That 'ports' 'Read-BlAcl: ACE 줄 형식(종류|SID|0x권한|inh|prop|inherited)' (@($a['Aces'] | Where-Object { $_ -notmatch '^(Allow|Deny)\|S-1-[0-9-]+\|0x[0-9a-f]+\|inh=\d+\|prop=\d+\|inherited=(True|False)$' }).Count -eq 0) (@($a['Aces']) -join ' ; ')
    $a2 = Read-BlAcl -Path (Join-Path $Sandbox 'nope.bin')
    Assert-That 'ports' 'Read-BlAcl: 없는 파일은 Ok=false' (-not $a2['Ok'])
    $t = Read-BlTextFile -Path $L.Cfg
    Assert-That 'ports' 'Read-BlTextFile: pyvenv.cfg 읽기' ($t['Ok'] -and ([string]$t['Text']).Contains('home ='))
    $d = Read-BlDirNames -Path $UsersDir
    Assert-That 'ports' 'Read-BlDirNames: 최상위 이름 목록' ($d['Ok'] -and ((@($d['Names']) | Sort-Object) -join ',') -ceq 'alice,Public') (@($d['Names']) -join ',')
    $tree = Join-Path $Sandbox 'tree'
    [void][IO.Directory]::CreateDirectory((Join-Path $tree 'a\b'))
    Write-TestFile (Join-Path $tree 'r.txt') '12345'
    Write-TestFile (Join-Path $tree 'a\x.txt') '123'
    Write-TestFile (Join-Path $tree 'a\b\y.txt') '1'
    $ts = Read-BlTreeStats -Path $tree
    Assert-That 'ports' 'Read-BlTreeStats: 파일 3개·9바이트' ($ts['Ok'] -and $ts['Files'] -eq 3 -and $ts['Bytes'] -eq 9) "$($ts['Files']) $($ts['Bytes']) $($ts['Error'])"
    $e = Test-BlElevated
    Assert-That 'ports' 'Test-BlElevated 는 bool' ($e -is [bool])

    # 배치 해석
    $lay = Resolve-BlLayout -DistRoot $L.Dist
    Assert-That 'layout' 'DistRoot 에서 가상환경 루트를 도출하고 pyvenv.cfg 의 home(CRLF)에서 기반 Python 폴더를 읽는다' ((@($lay['Problems']).Count -eq 0) -and $lay['VenvRoot'] -ieq $L.Venv -and $lay['BaseHome'] -ieq $L.Base) "$($lay['VenvRoot']) / $($lay['BaseHome']) / $(@($lay['Problems']) -join ';')"
    $lay2 = Resolve-BlLayout -VenvRoot $L.Venv -BasePythonHome (Join-Path $Sandbox 'other')
    Assert-That 'layout' '-BasePythonHome 을 주면 pyvenv.cfg 보다 우선한다' ($lay2['BaseHome'] -ieq (Join-Path $Sandbox 'other'))
    $lay3 = Resolve-BlLayout -DistRoot (Join-Path $Sandbox 'no-such-dist')
    Assert-That 'layout' 'pyvenv.cfg 를 못 읽으면 Problems 가 남고 기반 폴더는 null' (@($lay3['Problems']).Count -ge 1 -and $null -eq $lay3['BaseHome'])
    $lay4 = Resolve-BlLayout
    Assert-That 'layout' '아무것도 주지 않으면 VENV_ROOT_MISSING' ($null -eq $lay4['VenvRoot'] -and (@($lay4['Problems']) -contains 'VENV_ROOT_MISSING'))

    # 두 python.exe: 다른 키, 다른 값, 덮어쓰기 없음
    $pyItems = @(Get-BlPathItems -Path $L.VenvPython -IsDir $false -TreeStats $false) + @(Get-BlPathItems -Path $L.BasePython -IsDir $false -TreeStats $false)
    $pyKeys = @($pyItems | ForEach-Object { [string]$_['key'] })
    Assert-That 'python' '두 python.exe 의 항목 키가 모두 다르다(file/acl/ace/owner 4종 × 2개 = 8개, 중복 없음)' ((@(Get-BlDuplicateKeys -Items $pyItems).Count -eq 0) -and ($pyKeys.Count -eq 8)) "keys=$($pyKeys.Count)"
    $fv = @($pyItems | Where-Object { $_['key'] -ceq (New-BlKey 'file' $L.VenvPython) })[0]
    $fb = @($pyItems | Where-Object { $_['key'] -ceq (New-BlKey 'file' $L.BasePython) })[0]
    Assert-That 'python' '가상환경 python.exe 와 기반 python.exe 의 값이 따로 남는다(해시가 다르다)' ($fv['status'] -ceq 'OK' -and $fb['status'] -ceq 'OK' -and $fv['value'] -cne $fb['value']) "$($fv['value']) / $($fb['value'])"

    # 출력 경로 검사
    $newOut = Join-Path $Sandbox 'out-new.json'
    $p0 = @(Get-BlOutFileProblems -Path $newOut)
    Assert-That 'outfile' '새 경로는 문제 없음(샌드박스 경로에 링크가 낀 환경이면 이 시험이 실패한다)' ($p0.Count -eq 0) ($p0 -join ' ; ')
    Write-TestFile $newOut '{}'
    $p1 = @(Get-BlOutFileProblems -Path $newOut)
    Assert-That 'outfile' '이미 있으면 거부(EXISTS_USE_FORCE_TO_OVERWRITE)' ($p1 -contains 'EXISTS_USE_FORCE_TO_OVERWRITE') ($p1 -join ' ; ')
    Assert-That 'outfile' '-Force 면 허용' (@(Get-BlOutFileProblems -Path $newOut -Force $true).Count -eq 0)
    Assert-That 'outfile' '상대 경로 거부' (@(Get-BlOutFileProblems -Path 'out.json') -contains 'NOT_ABSOLUTE')
    Assert-That 'outfile' '`..` 구간 거부' (@(Get-BlOutFileProblems -Path ($Sandbox + '\sub\..\x.json')) -contains 'DOTDOT_SEGMENT')
    Assert-That 'outfile' '.json 이 아니면 거부' (@(Get-BlOutFileProblems -Path (Join-Path $Sandbox 'x.txt')) -contains 'EXTENSION_NOT_JSON')
    Assert-That 'outfile' '상위 폴더가 없으면 거부(만들지 않는다)' ((@(Get-BlOutFileProblems -Path (Join-Path $Sandbox 'nodir\x.json')) -join ';').Contains('PARENT_MISSING'))
    Assert-That 'outfile' 'nodir 가 만들어지지 않았다' (-not (Test-Path -LiteralPath (Join-Path $Sandbox 'nodir')))
    Assert-That 'outfile' '기준 파일과 같은 경로는 -Force 여도 거부(WOULD_OVERWRITE_BASELINE)' (@(Get-BlOutFileProblems -Path $newOut -Force $true -Protect $newOut) -contains 'WOULD_OVERWRITE_BASELINE')
    $realDir = Join-Path $Sandbox 'realdir'
    $linkDir = Join-Path $Sandbox 'linkdir'
    [void][IO.Directory]::CreateDirectory($realDir)
    $junctionOk = $false
    try { [void](New-Item -ItemType Junction -Path $linkDir -Target $realDir); $junctionOk = $true } catch { $junctionOk = $false }
    if ($junctionOk) {
        $pj = @(Get-BlOutFileProblems -Path (Join-Path $linkDir 'x.json'))
        Assert-That 'outfile' '경로 중간이 정션이면 거부(REPARSE_POINT)' ((($pj -join ';')).Contains('REPARSE_POINT')) ($pj -join ' ; ')
        $r = Run-Main @{ Mode = 'Save'; OutFile = (Join-Path $linkDir 'x.json'); DistRoot = $L.Dist }
        Assert-That 'outfile' '정션 아래 경로로 Save 하면 종료 3 이고 링크 대상에 파일이 생기지 않는다' (($r.Exit -eq 3) -and -not (Test-Path -LiteralPath (Join-Path $realDir 'x.json'))) "exit=$($r.Exit) $($r.Text)"
        [IO.Directory]::Delete($linkDir)
    } else { Skip-That 'outfile' '정션을 만들 수 없어 링크 거부 시험을 건너뜀' }
    $threw = $false
    try { Write-BlJsonFile -Path $newOut -Object @{ a = 1 } -Force $false } catch { $threw = $true }
    Assert-That 'outfile' 'Write-BlJsonFile 는 -Force 없이는 기존 파일을 덮어쓰지 못한다(CreateNew)' ($threw -and (Get-Content -LiteralPath $newOut -Raw) -eq '{}')

    # ═══ (D) 흐름: 머신 수준 포트를 모의로 바꾼다 ═══════════════════════════════
    $env:ProgramData = $ProgData
    $UserSid = 'S-1-5-21-111-222-333-1001'
    function Reset-Fake {
        $Script:Fake = @{
            Users = @(
                @{ Name = 'alice'; Sid = $UserSid; Enabled = $true; Description = '' },
                @{ Name = 'Administrator'; Sid = 'S-1-5-21-111-222-333-500'; Enabled = $false; Description = 'built-in' },
                @{ Name = 'bsi11111111'; Sid = 'S-1-5-21-111-222-333-1005'; Enabled = $false; Description = 'old leftover' }
            )
            Admins = @('S-1-5-21-111-222-333-500', $UserSid)
            UsersGroup = @('S-1-5-4', 'S-1-5-11')
            RuleNames = @('Core Networking - DNS', 'Core Networking - DHCP', 'bosang-semgrep-iso-20260101T000000Z-aaaaaaaa-out')
            RuleDetails = @{}
            Audit = @{
                '{0CCE9226-69AE-11D9-BED3-505054503030}' = 'HOST,System,Filtering Platform Connection,{0CCE9226-69AE-11D9-BED3-505054503030},No Auditing,'
                '{0CCE922B-69AE-11D9-BED3-505054503030}' = 'HOST,System,Process Creation,{0CCE922B-69AE-11D9-BED3-505054503030},No Auditing,'
            }
            ProfilesDir = $UsersDir
            ProfileSids = @('S-1-5-18', $UserSid)
            Procs = @()
            Fail = @{}
            AclFail = @{}
            AclAdd = @{}
        }
    }
    $FakePorts = {
        function Read-BlLocalUsers {
            if ($Script:Fake['Fail'].ContainsKey('Read-BlLocalUsers')) { return @{ Ok = $false; Users = @(); Error = [string]$Script:Fake['Fail']['Read-BlLocalUsers'] } }
            @{ Ok = $true; Users = @($Script:Fake['Users']); Error = $null }
        }
        function Read-BlGroupMemberSids {
            param([string]$GroupSid)
            if ($Script:Fake['Fail'].ContainsKey('Read-BlGroupMemberSids')) { return @{ Ok = $false; Sids = @(); Error = [string]$Script:Fake['Fail']['Read-BlGroupMemberSids'] } }
            $list = @($Script:Fake['UsersGroup']); if ($GroupSid -eq 'S-1-5-32-544') { $list = @($Script:Fake['Admins']) }
            @{ Ok = $true; Sids = $list; Error = $null }
        }
        function Read-BlFirewallRules {
            param([string]$Prefix)
            if ($Script:Fake['Fail'].ContainsKey('Read-BlFirewallRules')) { return @{ Ok = $false; Names = @(); Details = @{}; Error = [string]$Script:Fake['Fail']['Read-BlFirewallRules'] } }
            @{ Ok = $true; Names = @($Script:Fake['RuleNames']); Details = $Script:Fake['RuleDetails']; Error = $null }
        }
        function Read-BlAuditRow {
            param([string]$Guid)
            if ($Script:Fake['Fail'].ContainsKey('Read-BlAuditRow')) { return @{ Ok = $false; Row = $null; Error = [string]$Script:Fake['Fail']['Read-BlAuditRow'] } }
            @{ Ok = $true; Row = [string]$Script:Fake['Audit'][$Guid]; Error = $null }
        }
        function Read-BlProfileList {
            if ($Script:Fake['Fail'].ContainsKey('Read-BlProfileList')) { return @{ Ok = $false; ProfilesDirectory = $null; Sids = @(); Error = 'injected' } }
            @{ Ok = $true; ProfilesDirectory = [string]$Script:Fake['ProfilesDir']; Sids = @($Script:Fake['ProfileSids']); Error = $null }
        }
        function Read-BlProcessNames {
            param([string]$Prefix)
            @{ Ok = $true; Names = @($Script:Fake['Procs']); Error = $null }
        }
        # 진짜 ACL 읽기 위에 "적용으로 생긴 ACE"를 얹는다. 경로별 실패 주입도 한다.
        function Read-BlAcl {
            param([string]$Path)
            $k = $Path.ToLowerInvariant()
            if ($Script:Fake['AclFail'].ContainsKey($k)) { return @{ Ok = $false; Sddl = $null; Owner = $null; Group = $null; Aces = @(); Error = 'injected acl failure' } }
            $r = & $Script:RealReadAcl -Path $Path
            if (-not $r['Ok']) { return $r }
            if ($Script:Fake['AclAdd'].ContainsKey($k)) {
                return @{ Ok = $true; Sddl = ([string]$r['Sddl'] + '(ADDED)'); Owner = $r['Owner']; Group = $r['Group']; Aces = (@($r['Aces']) + @($Script:Fake['AclAdd'][$k])); Error = $null }
            }
            $r
        }
    }
    function Invoke-FakeApply {
        param($Lay, [string]$RunId, [string]$Sid, [switch]$SkipFileAce, [switch]$SkipVenvRootAce)
        $names = Get-BlRunNames -RunId $RunId
        $Script:Fake['Users'] = @($Script:Fake['Users']) + @(@{ Name = $names['UserName']; Sid = $Sid; Enabled = $false; Description = $names['Marker'] })
        $Script:Fake['UsersGroup'] = @($Script:Fake['UsersGroup']) + @($Sid)
        $Script:Fake['RuleNames'] = @($Script:Fake['RuleNames']) + @($names['RuleName'])
        $Script:Fake['RuleDetails'][$names['RuleName']] = @{ Ok = $true; Enabled = 'True'; Direction = 'Outbound'; Action = 'Block'; Group = 'bosang-semgrep-iso'; Description = $names['Marker']; LocalUser = ('D:(A;;CC;;;{0})' -f $Sid); Remote = '0.0.0.0-126.255.255.255,128.0.0.0-255.255.255.255,::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' }
        [void][IO.Directory]::CreateDirectory((Join-Path $names['WorkDir'] 'work'))
        Write-TestFile (Join-Path $names['WorkDir'] '.owner') $names['Marker']
        $dirAce = 'Allow|{0}|0x1200a9|inh=3|prop=0|inherited=False' -f $Sid
        $fileAce = 'Allow|{0}|0x1200a9|inh=0|prop=0|inherited=True' -f $Sid
        if (-not $SkipVenvRootAce) { $Script:Fake['AclAdd'][$Lay.Venv.ToLowerInvariant()] = @($dirAce) }
        $Script:Fake['AclAdd'][$Lay.Base.ToLowerInvariant()] = @($dirAce)
        if (-not $SkipFileAce) { foreach ($p in @($Lay.SemgrepExe, $Lay.VenvPython, $Lay.Core, $Lay.BasePython)) { $Script:Fake['AclAdd'][$p.ToLowerInvariant()] = @($fileAce) } }
        else { foreach ($p in @($Lay.SemgrepExe, $Lay.Core, $Lay.BasePython)) { $Script:Fake['AclAdd'][$p.ToLowerInvariant()] = @($fileAce) } }   # 가상환경 python.exe 의 ACE 만 빠진다
    }
    function Invoke-FakeRestore {
        param([string]$RunId)
        $names = Get-BlRunNames -RunId $RunId
        $Script:Fake['Users'] = @(@($Script:Fake['Users']) | Where-Object { $_['Name'] -ne $names['UserName'] })
        $Script:Fake['UsersGroup'] = @(@($Script:Fake['UsersGroup']) | Where-Object { $_ -ne 'S-1-5-21-111-222-333-2001' })
        $Script:Fake['RuleNames'] = @(@($Script:Fake['RuleNames']) | Where-Object { $_ -ne $names['RuleName'] })
        $Script:Fake['RuleDetails'] = @{}
        $Script:Fake['AclAdd'] = @{}
        if (Test-Path -LiteralPath $names['WorkRoot']) { Remove-Item -LiteralPath $names['WorkRoot'] -Recurse -Force }
    }
    function Write-TestManifest {
        param([string]$RunDir, $Lay, [string]$RunId, [string]$Sid, [string]$Status = 'applied', [bool]$OneGrantOnly = $false)
        $names = Get-BlRunNames -RunId $RunId
        $steps = New-Object System.Collections.ArrayList
        [void]$steps.Add([ordered]@{ kind = 'user'; name = $names['UserName']; state = 'created'; detail = [ordered]@{ marker = $names['Marker']; sid = $Sid; enabled = $false } })
        [void]$steps.Add([ordered]@{ kind = 'workDir'; name = $names['WorkDir']; state = 'created'; detail = [ordered]@{} })
        [void]$steps.Add([ordered]@{ kind = 'aclGrant'; name = $Lay.Venv; state = 'created'; detail = [ordered]@{ sid = $Sid; rights = 'ReadAndExecute' } })
        if (-not $OneGrantOnly) { [void]$steps.Add([ordered]@{ kind = 'aclGrant'; name = $Lay.Base; state = 'created'; detail = [ordered]@{ sid = $Sid; rights = 'ReadAndExecute' } }) }
        [void]$steps.Add([ordered]@{ kind = 'firewallRule'; name = $names['RuleName']; state = 'created'; detail = [ordered]@{ marker = $names['Marker'] } })
        $doc = [ordered]@{ schema = 1; runId = $RunId; status = $Status; steps = $steps.ToArray() }
        [void][IO.Directory]::CreateDirectory($RunDir)
        Write-TestFile (Join-Path $RunDir 'resources.json') (ConvertTo-Json -InputObject $doc -Depth 8)
    }
    function Reset-Dir { param([string]$Path) if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }; [void][IO.Directory]::CreateDirectory($Path) }

    $Reinstall = { . $CorePath; . $FakePorts }
    . $FakePorts
    Reset-Fake

    # ─ 저장 ─
    $F1 = New-TestLayout (Join-Path $Sandbox 'flow1')
    $pre = Join-Path $Sandbox 'flow1\pre.json'
    $runId = '20261030T010203Z-0a1b2c3d'
    $runSid = 'S-1-5-21-111-222-333-2001'
    $runDir = Join-Path $Sandbox 'flow1\run'
    [void][IO.Directory]::CreateDirectory($runDir)
    $r = Run-Main @{ Mode = 'Save'; OutFile = $pre; DistRoot = $F1.Dist; RunId = $runId }
    Assert-That 'save' '모의 머신 + 임시 설치물: Save 종료 0(읽지 못한 항목 없음)' ($r.Exit -eq 0) "exit=$($r.Exit) $($r.Text)"
    Assert-That 'save' 'Run-Main 출력에 정수 종료 코드 외의 군더더기가 없다(파이프라인 오염 방지)' ($r.Stray -eq 0) "stray=$($r.Stray)"
    $bl = Read-BlBaselineFile -Path $pre
    Assert-That 'save' '저장본을 다시 읽으면 유효하다(schema·tool·항목)' ($bl['Ok']) (@($bl['Problems']) -join ';')
    $blKeys = @($bl['Items'] | ForEach-Object { [string]$_['key'] })
    Assert-That 'save' '저장본 키가 모두 유일하다(대소문자 무시)' ((@(Get-BlDuplicateKeys -Items $bl['Items']).Count -eq 0) -and $blKeys.Count -gt 20) "keys=$($blKeys.Count)"
    $wantKeys = @(
        (New-BlKey 'role' 'venv-python.exe'), (New-BlKey 'role' 'base-python.exe'), (New-BlKey 'role' 'semgrep.exe'), (New-BlKey 'role' 'semgrep-core.exe'), (New-BlKey 'role' 'venv-root'), (New-BlKey 'role' 'base-python-root'),
        (New-BlKey 'file' $F1.VenvPython), (New-BlKey 'file' $F1.BasePython), (New-BlKey 'file' $F1.SemgrepExe), (New-BlKey 'file' $F1.Core),
        (New-BlKey 'acl' $F1.Venv), (New-BlKey 'acl' $F1.Base), (New-BlKey 'ace' $F1.Venv), (New-BlKey 'ace' $F1.Base), (New-BlKey 'owner' $F1.Venv), (New-BlKey 'owner' $F1.Base),
        (New-BlKey 'ace' $F1.VenvPython), (New-BlKey 'ace' $F1.BasePython),
        'accounts:local-users', 'accounts:bsi-matching', 'group:s-1-5-32-544', 'group:s-1-5-32-545', 'fw:rule-names', 'fw:prefix-rules', 'profiles:profilelist-sids', 'profiles:dir-listing', 'workroot:listing', 'proc:semgrep-running', 'layout:resolution'
    ) + @($Script:BlAuditGuids | ForEach-Object { New-BlKey 'audit' $_ }) + @(
        (New-BlKey 'run-account' 'bsi0a1b2c3d'), (New-BlKey 'run-rule' 'bosang-semgrep-iso-20261030T010203Z-0a1b2c3d-out'), (New-BlKey 'run-workdir' $runId), (New-BlKey 'run-workdir-owner' $runId), (New-BlKey 'run-profiledir' 'bsi0a1b2c3d')
    )
    $missing = @($wantKeys | Where-Object { $blKeys -notcontains $_ })
    Assert-That 'save' '항목 목록에 기대한 키가 모두 있다(역할·파일·ACL·ACE·소유자·계정·그룹·규칙·감사·프로필·작업 루트·실행 자원)' ($missing.Count -eq 0) ($missing -join ' ; ')
    $pyFileKeys = @($blKeys | Where-Object { $_ -like 'file:*python.exe' })
    Assert-That 'save' 'python.exe 의 file 키가 정확히 둘이고 서로 다르다' (($pyFileKeys.Count -eq 2) -and ($pyFileKeys[0] -ne $pyFileKeys[1])) ($pyFileKeys -join ' ; ')
    $runItems = @($bl['Items'] | Where-Object { ([string]$_['key']).StartsWith('run-') })
    Assert-That 'save' '기준 시점에 이 실행의 자원 5개는 모두 근거 있는 NOT_PRESENT 다' ((@($runItems | Where-Object { $_['status'] -ceq 'NOT_PRESENT' -and $_['reason'].Length -gt 0 }).Count) -eq 5) (@($runItems | ForEach-Object { "$($_['key'])=$($_['status'])" }) -join ' ; ')
    $wr = @($bl['Items'] | Where-Object { $_['key'] -ceq 'workroot:listing' })[0]
    Assert-That 'save' '작업 루트는 샌드박스 ProgramData 아래이고 아직 없다(NOT_PRESENT)' ($wr['status'] -ceq 'NOT_PRESENT')
    $baselineHash = Get-FileSha $pre

    # ─ 덮어쓰기 거부 / 사용법 ─
    $r = Run-Main @{ Mode = 'Save'; OutFile = $pre; DistRoot = $F1.Dist; RunId = $runId }
    Assert-That 'save' '이미 있는 기준 파일에는 Save 가 종료 3 이고 파일이 그대로다' (($r.Exit -eq 3) -and ((Get-FileSha $pre) -ceq $baselineHash)) "exit=$($r.Exit)"
    $r = Run-Main @{ Mode = 'Save'; DistRoot = $F1.Dist }
    Assert-That 'save' '-OutFile 없이 Save 하면 종료 3' ($r.Exit -eq 3)
    $r = Run-Main @{ Mode = 'Save'; OutFile = (Join-Path $Sandbox 'flow1\bad-run.json'); DistRoot = $F1.Dist; RunId = 'not-a-run-id' }
    Assert-That 'save' '형식이 틀린 RunId 는 종료 3 이고 파일이 생기지 않는다' (($r.Exit -eq 3) -and -not (Test-Path -LiteralPath (Join-Path $Sandbox 'flow1\bad-run.json')))
    $r = Run-Main @{ Mode = 'Save'; OutFile = (Join-Path $Sandbox 'flow1\no-venv.json') }
    Assert-That 'save' '가상환경 루트를 정하지 못하면 종료 3' ($r.Exit -eq 3)
    $r = Run-Main @{ Mode = 'Bogus' }
    Assert-That 'save' '알 수 없는 Mode 는 종료 3' ($r.Exit -eq 3)
    $r = Run-Main @{ Mode = 'save'; OutFile = (Join-Path $Sandbox 'flow1\lower.json'); DistRoot = $F1.Dist }
    Assert-That 'save' 'Mode 는 대소문자를 구분한다(save → 종료 3)' ($r.Exit -eq 3)

    # ─ 키 중복 주입: Get-BaselineItems 를 중복 키를 내는 것으로 바꾼다 ─
    $realGet = ${function:Get-BaselineItems}
    function Get-BaselineItems {
        param($Layout, [string]$RunId, [bool]$TreeStats = $false)
        New-BlItem -Key 'ace.file.python.exe' -Kind 'x' -Status 'OK' -Value 'venv'
        New-BlItem -Key 'ace.file.python.exe' -Kind 'x' -Status 'OK' -Value 'base'
    }
    $dupOut = Join-Path $Sandbox 'flow1\dup.json'
    $r = Run-Main @{ Mode = 'Save'; OutFile = $dupOut; DistRoot = $F1.Dist }
    Assert-That 'save' '키가 겹치면 Save 가 종료 3 이고 기준 파일을 쓰지 않는다(값을 덮어쓰지 않는다)' (($r.Exit -eq 3) -and -not (Test-Path -LiteralPath $dupOut) -and $r.Text.Contains('키가 겹친다')) "exit=$($r.Exit) $($r.Text)"
    Set-Item -Path Function:Get-BaselineItems -Value $realGet

    # ─ 비교(복구 뒤) ─
    $cmpOut = Join-Path $Sandbox 'flow1\cmp-equal.json'
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $pre; OutFile = $cmpOut }
    Assert-That 'compare' '아무것도 안 바뀌면 Compare = EQUAL(종료 0)' ($r.Exit -eq 0) "exit=$($r.Exit) $($r.Text)"
    $rep = Read-TestJson $cmpOut
    Assert-That 'compare' '보고 파일: overall EQUAL, exitCode 0, 다름 0, 확인 불가 0, baselineSha256 가 기준 파일의 해시' (($rep.overall -eq 'EQUAL') -and ($rep.exitCode -eq 0) -and ($rep.counts.different -eq 0) -and ($rep.counts.unverifiable -eq 0) -and ($rep.baselineSha256 -eq $baselineHash))
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $pre; OutFile = $pre; Force = $true }
    Assert-That 'compare' '보고 파일 경로가 기준 파일과 같으면 -Force 여도 종료 3(기준을 지키는 장치)' (($r.Exit -eq 3) -and ((Get-FileSha $pre) -ceq $baselineHash))
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = (Join-Path $Sandbox 'no-such-baseline.json') }
    Assert-That 'compare' '없는 기준 파일이면 종료 3' ($r.Exit -eq 3)
    Write-TestFile (Join-Path $Sandbox 'garbage.json') 'not json {'
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = (Join-Path $Sandbox 'garbage.json') }
    Assert-That 'compare' 'JSON 이 아닌 기준 파일이면 종료 3' ($r.Exit -eq 3)

    # 기반 python.exe 내용 변경 → 그 키만 DIFFERENT
    Write-TestFile $F1.BasePython 'base-python-CHANGED'
    $cmpOut2 = Join-Path $Sandbox 'flow1\cmp-diff.json'
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $pre; OutFile = $cmpOut2 }
    $rep = Read-TestJson $cmpOut2
    $diffKeys = @(Get-Keys $rep.results 'DIFFERENT')
    Assert-That 'compare' '기반 python.exe 만 바뀌면 종료 1 이고 다른 키는 그 파일의 file 키 하나뿐이다(가상환경 python.exe 와 섞이지 않는다)' (($r.Exit -eq 1) -and ($diffKeys.Count -eq 1) -and ($diffKeys[0] -ceq (New-BlKey 'file' $F1.BasePython))) "exit=$($r.Exit) diff=$($diffKeys -join ' ; ')"
    Write-TestFile $F1.BasePython 'base-python-content'
    # 가상환경 python.exe 도 따로 잡힌다
    Write-TestFile $F1.VenvPython 'venv-python-CHANGED'
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $pre; OutFile = (Join-Path $Sandbox 'flow1\cmp-diff2.json') }
    $rep = Read-TestJson (Join-Path $Sandbox 'flow1\cmp-diff2.json')
    $diffKeys = @(Get-Keys $rep.results 'DIFFERENT')
    Assert-That 'compare' '가상환경 python.exe 만 바뀌면 그 file 키 하나만 다르다' (($r.Exit -eq 1) -and ($diffKeys.Count -eq 1) -and ($diffKeys[0] -ceq (New-BlKey 'file' $F1.VenvPython))) ($diffKeys -join ' ; ')
    Write-TestFile $F1.VenvPython 'venv-python-content'
    # 계정이 하나 남아 있으면 DIFFERENT
    $Script:Fake['Users'] = @($Script:Fake['Users']) + @(@{ Name = 'bsi0a1b2c3d'; Sid = $runSid; Enabled = $false; Description = 'left behind' })
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $pre; OutFile = (Join-Path $Sandbox 'flow1\cmp-diff3.json') }
    $rep = Read-TestJson (Join-Path $Sandbox 'flow1\cmp-diff3.json')
    $diffKeys = @(Get-Keys $rep.results 'DIFFERENT')
    Assert-That 'compare' '복구 뒤 전용 계정이 남아 있으면 종료 1 (계정 목록·bsi 목록·run-account 가 다르다)' (($r.Exit -eq 1) -and ($diffKeys -contains 'accounts:local-users') -and ($diffKeys -contains 'accounts:bsi-matching') -and ($diffKeys -contains (New-BlKey 'run-account' 'bsi0a1b2c3d'))) ($diffKeys -join ' ; ')
    Reset-Fake
    # 읽기 실패(포트 오류 반환) → 종료 2
    $Script:Fake['Fail']['Read-BlFirewallRules'] = 'injected firewall failure'
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $pre; OutFile = (Join-Path $Sandbox 'flow1\cmp-unv.json') }
    $rep = Read-TestJson (Join-Path $Sandbox 'flow1\cmp-unv.json')
    Assert-That 'compare' '방화벽을 못 읽고 다른 차이는 없으면 종료 2(UNVERIFIABLE) — "없음"으로 취급하지 않는다' (($r.Exit -eq 2) -and ($rep.overall -eq 'UNVERIFIABLE') -and ($rep.counts.different -eq 0) -and ($rep.counts.unverifiable -ge 3)) "exit=$($r.Exit) unv=$($rep.counts.unverifiable)"
    # 읽기 실패 + 실제 차이 → 종료 1
    $Script:Fake['Users'] = @($Script:Fake['Users']) + @(@{ Name = 'mallory'; Sid = 'S-1-5-21-111-222-333-9999'; Enabled = $true; Description = '' })
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $pre }
    Assert-That 'compare' '읽기 실패가 있어도 실제 차이가 있으면 종료 1' ($r.Exit -eq 1)
    Reset-Fake
    # 읽기 실패 주입: 포트가 던진다
    function Read-BlLocalUsers { throw 'injected: users port threw' }
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $pre }
    Assert-That 'compare' '포트가 예외를 던져도 크래시하지 않고 확인 불가(종료 2)로 끝난다' ($r.Exit -eq 2) "exit=$($r.Exit) $($r.Text)"
    . $Reinstall
    Reset-Fake

    # ─ ACL 읽기 실패 주입 → Save 종료 2, 저장은 되고 READ_FAILED 로 남는다 ─
    function Read-BlAcl { param([string]$Path) throw 'injected acl failure' }
    $failBase = Join-Path $Sandbox 'flow1\acl-fail.json'
    $r = Run-Main @{ Mode = 'Save'; OutFile = $failBase; DistRoot = $F1.Dist; RunId = $runId }
    $blf = Read-BlBaselineFile -Path $failBase
    $aclFailed = @($blf['Items'] | Where-Object { ([string]$_['key']).StartsWith('acl:') -and $_['status'] -ceq 'READ_FAILED' })
    Assert-That 'inject' 'ACL 포트가 던지면 Save 는 종료 2 로 끝나고 파일은 저장되며 acl: 항목은 READ_FAILED 다(빈 값·없음으로 쓰지 않는다)' (($r.Exit -eq 2) -and $blf['Ok'] -and ($aclFailed.Count -eq 6)) "exit=$($r.Exit) failed=$($aclFailed.Count) $($r.Text)"
    . $Reinstall
    Reset-Fake
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $failBase }
    Assert-That 'inject' '기준 쪽이 READ_FAILED 였던 항목은 나중에 읽어도 같다고 하지 않는다(Compare 종료 2)' ($r.Exit -eq 2) "exit=$($r.Exit)"

    # ═══ 적용 흉내 → 직접 확인 → 복구 흉내 → 비교 ══════════════════════════════
    Reset-Fake
    $V = New-TestLayout (Join-Path $Sandbox 'verify1')
    $vpre = Join-Path $Sandbox 'verify1\pre.json'
    $vdir = Join-Path $Sandbox 'verify1\run'
    $r = Run-Main @{ Mode = 'Save'; OutFile = $vpre; DistRoot = $V.Dist; RunDir = $vdir; RunId = $runId }
    Assert-That 'verify' '준비: 적용 전 기준 저장(종료 0)' ($r.Exit -eq 0) "exit=$($r.Exit) $($r.Text)"
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir }
    Assert-That 'verify' 'resources.json 이 없으면 Verify 는 종료 3' ($r.Exit -eq 3)
    Write-TestManifest -RunDir $vdir -Lay $V -RunId $runId -Sid $runSid
    # 아직 적용 흉내를 하지 않았다 → 적용됐다고 말할 수 없다
    $vOut0 = Join-Path $Sandbox 'verify1\verify-not-applied.json'
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = $vOut0 }
    $rep0 = Read-TestJson $vOut0
    Assert-That 'verify' '적용 전 상태에서 Verify 하면 종료 1(전용 계정·규칙·ACE 가 없다)' (($r.Exit -eq 1) -and ((@(Get-Keys $rep0.results 'DIFFERENT')) -contains (New-BlKey 'run-account' 'bsi0a1b2c3d'))) "exit=$($r.Exit)"

    Invoke-FakeApply -Lay $V -RunId $runId -Sid $runSid
    $vOut1 = Join-Path $Sandbox 'verify1\verify-ok.json'
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = $vOut1 }
    $rep1 = Read-TestJson $vOut1
    Assert-That 'verify' '적용 흉내 뒤 Verify = EQUAL(종료 0): 임시 상태가 있고, 나머지는 기준과 같다' (($r.Exit -eq 0) -and ($rep1.overall -eq 'EQUAL')) "exit=$($r.Exit) $($r.Text)"
    $vkeys = @($rep1.results | ForEach-Object { [string]$_.key })
    Assert-That 'verify' 'ACE 판정 키가 경로마다 따로 있다(여섯 경로 × run/others = 12개, 두 python.exe 포함)' ((@($vkeys | Where-Object { $_ -like 'vfy-ace-run:*' }).Count -eq 6) -and (@($vkeys | Where-Object { $_ -like 'vfy-ace-others:*' }).Count -eq 6) -and ($vkeys -contains (New-BlKey 'vfy-ace-run' $V.VenvPython)) -and ($vkeys -contains (New-BlKey 'vfy-ace-run' $V.BasePython)))
    Assert-That 'verify' 'Verify 보고에는 직접 읽은 현재 항목이 함께 저장된다' (@($rep1.current).Count -gt 20)
    # 가상환경 python.exe 의 ACE 만 빠진 경우: 기반 python.exe 의 ACE 가 있어도 가려지지 않는다
    Invoke-FakeRestore -RunId $runId
    Invoke-FakeApply -Lay $V -RunId $runId -Sid $runSid -SkipFileAce
    $vOut2 = Join-Path $Sandbox 'verify1\verify-venvpy-missing.json'
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = $vOut2 }
    $rep2 = Read-TestJson $vOut2
    $dk = @(Get-Keys $rep2.results 'DIFFERENT')
    Assert-That 'verify' '가상환경 python.exe 의 ACE 만 빠지면 종료 1 이고 그 경로의 판정만 DIFFERENT 다(기반 python.exe 의 ACE 가 있어도 가려지지 않는다)' (($r.Exit -eq 1) -and ($dk.Count -eq 1) -and ($dk[0] -ceq (New-BlKey 'vfy-ace-run' $V.VenvPython))) "exit=$($r.Exit) diff=$($dk -join ' ; ')"
    # 가상환경 루트(폴더)의 ACE 가 빠진 경우
    Invoke-FakeRestore -RunId $runId
    Invoke-FakeApply -Lay $V -RunId $runId -Sid $runSid -SkipVenvRootAce
    $vOut3 = Join-Path $Sandbox 'verify1\verify-venvroot-missing.json'
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = $vOut3 }
    $rep3 = Read-TestJson $vOut3
    $dk = @(Get-Keys $rep3.results 'DIFFERENT')
    Assert-That 'verify' '가상환경 루트 폴더의 ACE 가 빠지면 그 경로의 판정이 DIFFERENT 다' (($r.Exit -eq 1) -and ($dk -contains (New-BlKey 'vfy-ace-run' $V.Venv)) -and ($dk -notcontains (New-BlKey 'vfy-ace-run' $V.Base))) ($dk -join ' ; ')
    # 한 경로의 ACL 을 못 읽는 경우 → 확인 불가
    Invoke-FakeRestore -RunId $runId
    Invoke-FakeApply -Lay $V -RunId $runId -Sid $runSid
    $Script:Fake['AclFail'][$V.BasePython.ToLowerInvariant()] = $true
    $vOut4 = Join-Path $Sandbox 'verify1\verify-acl-unreadable.json'
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = $vOut4 }
    $rep4 = Read-TestJson $vOut4
    Assert-That 'verify' '기반 python.exe 의 ACL 을 못 읽으면 Verify 는 종료 2(확인 불가)다 — 통과로 세지 않는다' (($r.Exit -eq 2) -and ($rep4.overall -eq 'UNVERIFIABLE') -and ($rep4.counts.different -eq 0)) "exit=$($r.Exit) unv=$($rep4.counts.unverifiable)"
    $Script:Fake['AclFail'] = @{}
    # 규칙 속성이 틀림
    $Script:Fake['RuleDetails'][(Get-BlRunNames -RunId $runId)['RuleName']]['Enabled'] = 'False'
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = (Join-Path $Sandbox 'verify1\verify-rule.json') }
    $rep5 = Read-TestJson (Join-Path $Sandbox 'verify1\verify-rule.json')
    Assert-That 'verify' '규칙이 꺼져 있으면 vfy:run-rule 이 DIFFERENT (종료 1)' (($r.Exit -eq 1) -and ((@(Get-Keys $rep5.results 'DIFFERENT')) -contains 'vfy:run-rule'))
    $Script:Fake['RuleDetails'][(Get-BlRunNames -RunId $runId)['RuleName']]['Enabled'] = 'True'
    # 계정이 켜져 있음
    $savedUsers = @($Script:Fake['Users'])
    $Script:Fake['Users'] = @($Script:Fake['Users'] | ForEach-Object { if ($_['Name'] -eq 'bsi0a1b2c3d') { @{ Name = $_['Name']; Sid = $_['Sid']; Enabled = $true; Description = $_['Description'] } } else { $_ } })
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = (Join-Path $Sandbox 'verify1\verify-enabled.json') }
    Assert-That 'verify' '전용 계정이 켜져 있으면(적용 직후엔 꺼져 있어야 한다) 종료 1' ($r.Exit -eq 1)
    $Script:Fake['Users'] = $savedUsers
    # 예상 밖 계정이 늘었음
    $Script:Fake['Users'] = @($Script:Fake['Users']) + @(@{ Name = 'intruder'; Sid = 'S-1-5-21-111-222-333-7777'; Enabled = $true; Description = '' })
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = (Join-Path $Sandbox 'verify1\verify-intruder.json') }
    Assert-That 'verify' '예상 밖 계정이 늘면 종료 1(계정 목록이 기준 + 전용 계정과 다르다)' ($r.Exit -eq 1)
    $Script:Fake['Users'] = $savedUsers
    # 폴더에 예상 밖 ACE
    $Script:Fake['AclAdd'][$V.Venv.ToLowerInvariant()] = @($Script:Fake['AclAdd'][$V.Venv.ToLowerInvariant()]) + @('Allow|S-1-5-21-111-222-333-7777|0x1f01ff|inh=3|prop=0|inherited=False')
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = (Join-Path $Sandbox 'verify1\verify-extra-ace.json') }
    $rep6 = Read-TestJson (Join-Path $Sandbox 'verify1\verify-extra-ace.json')
    Assert-That 'verify' '다른 SID 의 ACE 가 하나 더 생기면 vfy-ace-others 가 DIFFERENT (종료 1)' (($r.Exit -eq 1) -and ((@(Get-Keys $rep6.results 'DIFFERENT')) -contains (New-BlKey 'vfy-ace-others' $V.Venv)))
    $Script:Fake['AclAdd'][$V.Venv.ToLowerInvariant()] = @('Allow|{0}|0x1200a9|inh=3|prop=0|inherited=False' -f $runSid)
    # 권한 부여 경로가 하나뿐
    Write-TestManifest -RunDir $vdir -Lay $V -RunId $runId -Sid $runSid -OneGrantOnly $true
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = (Join-Path $Sandbox 'verify1\verify-grants.json') }
    $rep7 = Read-TestJson (Join-Path $Sandbox 'verify1\verify-grants.json')
    Assert-That 'verify' '실행 기록의 권한 부여 경로가 두 폴더와 다르면 vfy:grant-paths 가 DIFFERENT' (($r.Exit -eq 1) -and ((@(Get-Keys $rep7.results 'DIFFERENT')) -contains 'vfy:grant-paths'))
    Write-TestManifest -RunDir $vdir -Lay $V -RunId $runId -Sid $runSid
    # 상태가 applied 가 아님
    Write-TestManifest -RunDir $vdir -Lay $V -RunId $runId -Sid $runSid -Status 'apply-failed'
    $r = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre; RunDir = $vdir; OutFile = (Join-Path $Sandbox 'verify1\verify-status.json') }
    Assert-That 'verify' '실행 기록 상태가 applied 가 아니면 종료 1' ($r.Exit -eq 1)
    Write-TestManifest -RunDir $vdir -Lay $V -RunId $runId -Sid $runSid
    # RunId 없이 저장한 기준은 이 실행의 "적용 전" 증거가 아니다
    $vpre2 = Join-Path $Sandbox 'verify1\pre-norun.json'
    Invoke-FakeRestore -RunId $runId
    $r = Run-Main @{ Mode = 'Save'; OutFile = $vpre2; DistRoot = $V.Dist }
    Invoke-FakeApply -Lay $V -RunId $runId -Sid $runSid
    $r2 = Run-Main @{ Mode = 'Verify'; BaselineFile = $vpre2; RunDir = $vdir; OutFile = (Join-Path $Sandbox 'verify1\verify-norun.json') }
    $rep8 = Read-TestJson (Join-Path $Sandbox 'verify1\verify-norun.json')
    $dk8 = @(Get-Keys $rep8.results 'DIFFERENT') + @(Get-Keys $rep8.results 'UNVERIFIABLE')
    Assert-That 'verify' 'RunId 가 없는 기준이면 vfy:runid-match 와 vfy:baseline-run-absent 가 통과하지 못한다(종료 0 이 아니다)' (($r2.Exit -ne 0) -and ($dk8 -contains 'vfy:runid-match') -and (($dk8 -contains 'vfy:baseline-run-absent'))) "exit=$($r2.Exit) not-ok=$($dk8 -join ' ; ')"
    # 복구 흉내 → 비교
    Invoke-FakeRestore -RunId $runId
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $vpre; OutFile = (Join-Path $Sandbox 'verify1\compare-restored.json') }
    Assert-That 'verify' '복구 흉내 뒤 Compare = EQUAL(종료 0): 기준과 모든 항목이 같다(실행 자원은 양쪽 모두 근거 있는 NOT_PRESENT)' ($r.Exit -eq 0) "exit=$($r.Exit) $($r.Text)"
    # 복구가 덜 됐다: 작업 폴더가 남음
    Invoke-FakeApply -Lay $V -RunId $runId -Sid $runSid
    $names = Get-BlRunNames -RunId $runId
    Invoke-FakeRestore -RunId $runId
    [void][IO.Directory]::CreateDirectory($names['WorkDir'])
    $r = Run-Main @{ Mode = 'Compare'; BaselineFile = $vpre; OutFile = (Join-Path $Sandbox 'verify1\compare-leftover.json') }
    $rep9 = Read-TestJson (Join-Path $Sandbox 'verify1\compare-leftover.json')
    Assert-That 'verify' '작업 폴더가 남아 있으면 Compare 종료 1 (workroot·run-workdir 가 다르다)' (($r.Exit -eq 1) -and ((@(Get-Keys $rep9.results 'DIFFERENT')) -contains 'workroot:listing'))
    Invoke-FakeRestore -RunId $runId

    # ═══ (E) 자식 프로세스: 진입점 사용법 오류 ═══════════════════════════════════
    if ($SkipChild) { Skip-That 'child' '-SkipChild' } else {
        $enginePath = Join-Path $PSHOME 'powershell.exe'
        if ($PSVersionTable.PSEdition -eq 'Core') { $enginePath = Join-Path $PSHOME 'pwsh.exe' }
        function Invoke-Child {
            param([string[]]$ChildArgs)
            $ErrorActionPreference = 'Continue'
            $out = & $enginePath -NoProfile -ExecutionPolicy Bypass -File $EntryPath @ChildArgs 2>&1
            [pscustomobject]@{ Exit = $LASTEXITCODE; Out = (($out | ForEach-Object { [string]$_ }) -join "`n") }
        }
        $childDir = Join-Path $Sandbox 'child'
        [void][IO.Directory]::CreateDirectory($childDir)
        $c = Invoke-Child @()
        Assert-That 'child' '인자 없이 실행하면 종료 3' ($c.Exit -eq 3) "exit=$($c.Exit) $($c.Out)"
        $c = Invoke-Child @('-Mode', 'Bogus')
        Assert-That 'child' '-Mode Bogus 는 종료 3' ($c.Exit -eq 3) "exit=$($c.Exit)"
        $c = Invoke-Child @('-Mode', 'Compare')
        Assert-That 'child' '-Mode Compare 에 -BaselineFile 이 없으면 종료 3' ($c.Exit -eq 3) "exit=$($c.Exit)"
        $c = Invoke-Child @('-Mode', 'Save', '-DistRoot', $F1.Dist)
        Assert-That 'child' '-Mode Save 에 -OutFile 이 없으면 종료 3' ($c.Exit -eq 3) "exit=$($c.Exit)"
        $c = Invoke-Child @('-Mode', 'Verify', '-BaselineFile', $pre)
        Assert-That 'child' '-Mode Verify 에 -RunDir 이 없으면 종료 3' ($c.Exit -eq 3) "exit=$($c.Exit)"
        $c = Invoke-Child @('-Mode', 'Compare', '-BaselineFile', (Join-Path $childDir 'nope.json'))
        Assert-That 'child' '없는 기준 파일이면 종료 3' ($c.Exit -eq 3) "exit=$($c.Exit)"
        $c = Invoke-Child @('-Mode', 'Save', '-DistRoot', $F1.Dist, '-OutFile', 'relative.json')
        Assert-That 'child' '상대 경로 -OutFile 은 종료 3' ($c.Exit -eq 3) "exit=$($c.Exit)"
        Assert-That 'child' '사용법 오류 실행들이 파일을 만들지 않았다' (@(Get-ChildItem -LiteralPath $childDir -Force).Count -eq 0)
    }

    # ═══ (F) 진짜 머신 읽기(읽기 전용) ═══════════════════════════════════════════
    if ($SkipRealStateCheck) { Skip-That 'real' '-SkipRealStateCheck' } else {
        $env:ProgramData = $origProgramData
        . $CorePath   # 모의 포트를 지우고 진짜 포트로 되돌린다
        $u = Invoke-BlPort -Name 'Read-BlLocalUsers'
        Assert-That 'real' '진짜 Read-BlLocalUsers(ADSI) 성공' ($u['Ok'] -and @($u['Users']).Count -ge 1) "$($u['Error'])"
        $g1 = Invoke-BlPort -Name 'Read-BlGroupMemberSids' -Arguments @{ GroupSid = 'S-1-5-32-544' }
        $g2 = Invoke-BlPort -Name 'Read-BlGroupMemberSids' -Arguments @{ GroupSid = 'S-1-5-32-545' }
        Assert-That 'real' '진짜 Read-BlGroupMemberSids(Administrators) 성공이고 구성원이 있다' ($g1['Ok'] -and @($g1['Sids']).Count -ge 1) "$($g1['Error'])"
        Assert-That 'real' '진짜 Read-BlGroupMemberSids(Users) 성공' ($g2['Ok']) "$($g2['Error'])"
        $pl = Invoke-BlPort -Name 'Read-BlProfileList'
        Assert-That 'real' '진짜 Read-BlProfileList 성공' ($pl['Ok'] -and @($pl['Sids']).Count -ge 1) "$($pl['Error'])"
        $pn = Invoke-BlPort -Name 'Read-BlProcessNames' -Arguments @{ Prefix = 'semgrep' }
        Assert-That 'real' '진짜 Read-BlProcessNames 성공' ($pn['Ok']) "$($pn['Error'])"
        if (Test-BlElevated) {
            $au = Invoke-BlPort -Name 'Read-BlAuditRow' -Arguments @{ Guid = $Script:BlAuditGuids[0] }
            Assert-That 'real' '진짜 Read-BlAuditRow(관리자) 성공' ($au['Ok']) "$($au['Error'])"
        } else { Skip-That 'real' '관리자 권한이 아니라 auditpol /get 을 확인하지 않음(저장은 audit 항목만 READ_FAILED 로 남는다)' }

        $R = New-TestLayout (Join-Path $Sandbox 'realrun')
        $outDir = Join-Path $Sandbox 'realout'
        [void][IO.Directory]::CreateDirectory($outDir)
        $before = @(Get-ChildItem -LiteralPath $outDir -Force).Count
        $realPre = Join-Path $outDir 'real-pre.json'
        $rs = Run-Main @{ Mode = 'Save'; OutFile = $realPre; DistRoot = $R.Dist }
        Assert-That 'real' '진짜 머신 Save 는 종료 0 또는 2(관리자가 아니면 audit 만 읽기 실패)' (($rs.Exit -eq 0) -or ($rs.Exit -eq 2)) "exit=$($rs.Exit) $($rs.Text)"
        if (Test-Path -LiteralPath $realPre) {
            $realBl = Read-BlBaselineFile -Path $realPre
            $badKeys = @($realBl['Items'] | Where-Object { $_['status'] -ceq 'READ_FAILED' } | ForEach-Object { [string]$_['key'] })
            $badNonAudit = @($badKeys | Where-Object { -not $_.StartsWith('audit:') })
            Assert-That 'real' '읽지 못한 항목은 audit: 뿐이다(계정·그룹·방화벽·프로필·작업 루트·프로세스·파일 읽기는 모두 성공)' ($badNonAudit.Count -eq 0) ($badNonAudit -join ' ; ')
            Write-Host ('  (정보) 진짜 Save: 항목 {0}개, READ_FAILED {1}개 [{2}]' -f @($realBl['Items']).Count, $badKeys.Count, ($badKeys -join ', '))
            $rc = Run-Main @{ Mode = 'Compare'; BaselineFile = $realPre; OutFile = (Join-Path $outDir 'real-compare.json') }
            Assert-That 'real' '진짜 머신 Compare(바로 이어서)는 종료 0 또는 2 이고 1(다름) 이 아니다' (($rc.Exit -eq 0) -or ($rc.Exit -eq 2)) "exit=$($rc.Exit) $($rc.Text)"
            $after = @(Get-ChildItem -LiteralPath $outDir -Force).Count
            Assert-That 'real' '출력 폴더에 늘어난 파일은 출력 파일 둘뿐이다(읽기 전용)' (($after - $before) -eq 2) "before=$before after=$after"
        } else { Assert-That 'real' '진짜 Save 가 기준 파일을 만들었다' $false }
    }
}
finally {
    $env:ProgramData = $origProgramData
    if (-not $KeepSandbox) {
        # 링크가 남았다면 대상을 지우지 않도록 먼저 링크만 제거한다
        foreach ($i in @(Get-ChildItem -LiteralPath $Sandbox -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })) { try { if ($i.PSIsContainer) { [IO.Directory]::Delete($i.FullName) } else { [IO.File]::Delete($i.FullName) } } catch { } }
        Remove-Item -LiteralPath $Sandbox -Recurse -Force -ErrorAction SilentlyContinue
    } else { Write-Host ("샌드박스 보존: $Sandbox") }
}

$pass = @($Results | Where-Object { $_.pass -eq $true }).Count
$fail = @($Results | Where-Object { $_.pass -eq $false }).Count
$skip = @($Results | Where-Object { $null -eq $_.pass }).Count
Write-Host ('IsolationBaseline: {0}/{1} 통과, {2} 실패, {3} 건너뜀' -f $pass, ($pass + $fail), $fail, $skip)
if ($skip -gt 0) { Write-Host ('  건너뛴 {0}건은 통과로 세지 않았다.' -f $skip) -ForegroundColor Yellow }
Write-Host ('{0}/{1} 통과' -f $pass, ($pass + $fail))
if ($fail -gt 0) { exit 1 }
exit 0
