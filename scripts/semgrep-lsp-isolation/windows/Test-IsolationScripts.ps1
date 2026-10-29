<#
.SYNOPSIS
  격리 스크립트 묶음의 자체 점검. 시스템을 읽지도 바꾸지도 않는다(파일 읽기와 메모리 계산뿐).
.DESCRIPTION
  1) 구문: 모든 .ps1 을 지금 실행 중인 엔진의 파서로 읽는다. pwsh 7 과 powershell.exe(5.1) 에서 각각 돌려 둘 다 통과해야 한다.
  2) 인코딩: 모든 .ps1 이 UTF-8 BOM 으로 시작하는가(5.1 은 BOM 없는 UTF-8 을 ANSI 로 읽어 한글이 깨진다).
  3) 구조:
     - 진입 스크립트와 공용 파일에서 시스템 상태를 바꾸는 명령(계정·방화벽·ACL·감사 정책·파일 삭제/복사·프로세스 실행/종료 등)은
       모두 Invoke-Mutation 의 스크립트 블록 안에 있어야 한다.
     - .NET 파일 쓰기/삭제 호출은 Invoke-Mutation 안이거나 Write-IsoLog·Write-IsoJson 안이거나 사전 점검의 RunDir 만들기여야 한다.
     - auditpol 은 Invoke-AuditPol 로만 부르고, 읽기('/backup') 외의 인자는 Invoke-Mutation 안에서만 부른다.
     - 사전 점검 스크립트에는 Invoke-Mutation 이 없어야 한다(읽기 전용).
     - semgrep 계열을 명령으로 호출하는 곳이 없고, 내려받기·Invoke-Expression 이 없다.
     - 각 진입 스크립트의 기본 모드가 dry-run 이다($Script:ApplyMode 가 -Apply/-Execute 로만 켜진다).
     - 코드가 부르는 모든 시스템 변경 명령을 모의 시스템(tests/MockSystem.ps1)이 덮는다(새 변경 명령을 추가하면서 모의를 빠뜨리면 흐름 시험이 진짜 명령을 부를 수 있다).
     - 버전 관측 파일은 역할마다 다른 규칙을 받는다(모두에 같은 규칙을 억지로 씌우지 않고, 위 규칙을 완화하지도 않는다):
         관리자 진입점(Test-VersionObservation.ps1): 위의 변경 관문·dry-run 규칙을 그대로 받고, -Execute 없이는 첫 Invoke-Mutation 앞에서 돌아오며, 자식 환경을 계약 함수로만 만든다.
         자식 실행기(version-runner.ps1): 고정 모드·인자, 셸 비사용, 환경 제한, 시간·출력 제한, 읽기 실패를 EOF 로 바꾸지 않는 읽기 함수, 허용된 쓰기는 결과 파일뿐.
         스텁(version-stub.ps1): 시나리오 목록이 실행기·진입점과 같고, 시스템을 바꾸는 명령이 없다.
         계약 파일(VersionContract.ps1): 실행 부작용이 없다(최상위는 대입과 함수 정의뿐, 부를 수 있는 명령은 허용 목록뿐).
  4) 논리: 신원 교차 확인·이벤트 대조·판정·감사 값 읽기·권한 계산을 합성 입력으로 시험한다. 실제 이벤트 로그·방화벽·계정은 쓰지 않는다.
  적용·검증·복구 진입 경로를 모의 시스템 위에서 끝까지 도는 흐름 시험은 tests/Test-IsolationFlows.ps1 이 한다.
  이 점검의 통과는 "스크립트가 의도한 구조와 논리를 가졌다"까지만 뜻한다. 실제 환경에서의 효과는 뜻하지 않는다.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
$Script:ApplyMode = $false

$results = New-Object System.Collections.ArrayList
function Assert-That([string]$Name, [bool]$Condition, [string]$Detail = '') {
    [void]$results.Add([ordered]@{ name = $Name; pass = $Condition; detail = $Detail })
    if (-not $Condition) { Write-Host ("FAIL  {0}  {1}" -f $Name, $Detail) -ForegroundColor Red }
}

$dir = $PSScriptRoot
$versionEntry = 'Test-VersionObservation.ps1'
$entry = 'Invoke-IsolationPreflight.ps1', 'Initialize-Isolation.ps1', 'Remove-Isolation.ps1', 'Test-IsolationEffect.ps1', 'Get-IsolationEvidence.ps1', $versionEntry
$libCommon = 'IsolationCommon.ps1'
$libFlows = 'IsolationFlows.ps1'
$library = @($libCommon, $libFlows)
$probes = 'probe-parent.ps1', 'probe-child.ps1'
$versionRunner = 'version-runner.ps1'
$versionStub = 'version-stub.ps1'
$versionContract = 'VersionContract.ps1'
$versionChildFiles = @($versionRunner, $versionStub)
$testFiles = 'tests\MockSystem.ps1', 'tests\Test-IsolationFlows.ps1', 'tests\Test-VersionRunner.ps1', 'tests\Test-VersionFlows.ps1'
$all = @($entry) + @($library) + @($probes) + @($versionChildFiles) + @($versionContract) + @($testFiles) + @('Test-IsolationScripts.ps1')

# ── 1) 구문, 2) BOM ─────────────────────────────────────────────────────────
$asts = @{}
foreach ($f in $all) {
    $p = Join-Path $dir $f
    $errs = $null; $tokens = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errs)
    Assert-That "구문 $f ($($PSVersionTable.PSVersion))" ($errs.Count -eq 0) (($errs | ForEach-Object { "$($_.Message)@$($_.Extent.StartLineNumber)" }) -join '; ')
    $asts[$f] = $ast
    $b = [IO.File]::ReadAllBytes($p)
    Assert-That "BOM $f" ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) 'UTF-8 BOM 이 없으면 Windows PowerShell 5.1 에서 한글이 깨진다'
}

# ── 3) 구조 ─────────────────────────────────────────────────────────────────
$mutatingCmdlets = @(
    'New-LocalUser', 'Remove-LocalUser', 'Enable-LocalUser', 'Disable-LocalUser', 'Set-LocalUser', 'Add-LocalGroupMember', 'Remove-LocalGroupMember',
    'New-NetFirewallRule', 'Set-NetFirewallRule', 'Remove-NetFirewallRule', 'Enable-NetFirewallRule', 'Disable-NetFirewallRule', 'Set-NetFirewallProfile', 'Set-NetFirewallSetting',
    'Set-Acl', 'Remove-Item', 'Copy-Item', 'Move-Item', 'Rename-Item', 'New-Item', 'Set-Content', 'Add-Content', 'Out-File', 'Clear-Content',
    'Start-Process', 'Stop-Process', 'Remove-CimInstance', 'Set-ItemProperty', 'New-ItemProperty', 'Remove-ItemProperty', 'Set-Service', 'Stop-Service', 'Start-Service', 'Register-ScheduledTask', 'Unregister-ScheduledTask'
)
$mutatingNative = '(?i)(^|[\\"''\s&])(auditpol(\.exe)?["'']?\s+.*?/(set|restore|remove|clear)\b|netsh(\.exe)?\s|reg(\.exe)?\s+(add|delete|import)|icacls(\.exe)?\s|net(\.exe)?\s+(user|localgroup)|schtasks(\.exe)?\s|sc(\.exe)?\s+(config|create|delete|stop|start)|wevtutil(\.exe)?\s+sl\b)'
$dotNetWrites = '^(WriteAllText|WriteAllBytes|AppendAllText|AppendAllLines|WriteAllLines|Delete|Move|Copy|Replace|Create|CreateDirectory|SetAccessControl)$'

function Test-InsideCommand($Node, [string]$Name) {
    $p = $Node.Parent
    while ($p) { if ($p -is [Management.Automation.Language.CommandAst] -and $p.GetCommandName() -eq $Name) { return $true }; $p = $p.Parent }
    $false
}
function Get-EnclosingFunction($Node) {
    $p = $Node.Parent
    while ($p) { if ($p -is [Management.Automation.Language.FunctionDefinitionAst]) { return $p.Name }; $p = $p.Parent }
    $null
}

$usedMutators = New-Object System.Collections.ArrayList
foreach ($f in (@($entry) + @($library))) {
    $ast = $asts[$f]
    foreach ($c in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) { $nm0 = $c.GetCommandName(); if ($nm0 -and ($mutatingCmdlets -contains $nm0) -and $usedMutators -notcontains $nm0) { [void]$usedMutators.Add($nm0) } }
    $bad = New-Object System.Collections.ArrayList
    foreach ($c in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
        $name = $c.GetCommandName()
        if ($name -eq 'Invoke-Mutation') { continue }   # 호출문의 설명 문자열이 아니라 그 안의 실제 명령을 본다
        $isMut = $false
        if ($name -and ($mutatingCmdlets -contains $name)) { $isMut = $true }
        elseif ((-not $name -or $name -match '^(auditpol|netsh|reg|icacls|net|schtasks|sc|wevtutil)(\.exe)?$') -and $c.Extent.Text -match $mutatingNative) { $isMut = $true }
        elseif ($name -eq 'Invoke-AuditPol' -and $c.Extent.Text -notmatch "'/backup'") { $isMut = $true }   # auditpol 은 읽기('/backup') 외에는 변경으로 본다
        if ($isMut -and -not (Test-InsideCommand $c 'Invoke-Mutation')) { [void]$bad.Add(("{0}@{1}" -f $c.Extent.Text.Split("`n")[0].Trim(), $c.Extent.StartLineNumber)) }
    }
    Assert-That "상태 변경 명령은 Invoke-Mutation 안에서만 ($f)" ($bad.Count -eq 0) ($bad -join ' | ')

    $badIo = New-Object System.Collections.ArrayList
    foreach ($m in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Static }, $true)) {
        $typeText = $m.Expression.Extent.Text
        if ($typeText -notmatch '(?i)^\[(System\.)?IO\.(File|Directory)\]$') { continue }
        if ($m.Member.Extent.Text -notmatch $dotNetWrites) { continue }
        $fn = Get-EnclosingFunction $m
        $ok = (Test-InsideCommand $m 'Invoke-Mutation') -or ($fn -in @('Write-IsoLog', 'Write-IsoJson')) -or ($f -eq 'Invoke-IsolationPreflight.ps1' -and $m.Member.Extent.Text -eq 'CreateDirectory')
        if (-not $ok) { [void]$badIo.Add(("{0}@{1}" -f $m.Extent.Text.Split("`n")[0].Trim(), $m.Extent.StartLineNumber)) }
    }
    Assert-That ".NET 파일 쓰기/삭제는 허용된 자리에서만 ($f)" ($badIo.Count -eq 0) ($badIo -join ' | ')
}

# 사전 점검은 읽기 전용: Invoke-Mutation 이 한 번도 없어야 한다.
$pfCalls = @($asts['Invoke-IsolationPreflight.ps1'].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-Mutation' }, $true))
Assert-That '사전 점검에는 Invoke-Mutation 이 없다(읽기 전용)' ($pfCalls.Count -eq 0)

# 모든 스크립트: semgrep 호출·내려받기·Invoke-Expression 금지
$forbiddenNames = '(?i)^(semgrep|pysemgrep|semgrep-core)(\.exe)?$'
foreach ($f in $all) {
    $hits = New-Object System.Collections.ArrayList
    foreach ($c in $asts[$f].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
        $name = $c.GetCommandName()
        $first = $c.CommandElements[0].Extent.Text.Trim('"', "'")
        if (($name -and ($name -match $forbiddenNames -or $name -in @('Invoke-WebRequest', 'Invoke-RestMethod', 'Invoke-Expression', 'iex', 'curl', 'wget', 'Start-BitsTransfer'))) -or ($first -match '(?i)(^|[\\/])(semgrep|pysemgrep|semgrep-core)(\.exe)?$')) { [void]$hits.Add(("{0}@{1}" -f $c.Extent.Text.Split("`n")[0].Trim(), $c.Extent.StartLineNumber)) }
    }
    Assert-That "semgrep 호출·내려받기·Invoke-Expression 없음 ($f)" ($hits.Count -eq 0) ($hits -join ' | ')
}

# 프로브: 계정·방화벽·감사·ACL 을 건드리는 명령이 없어야 한다(부모의 Start-Process 만 허용).
foreach ($f in $probes) {
    $bad = @()
    foreach ($c in $asts[$f].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
        $name = $c.GetCommandName()
        if (($name -and ($mutatingCmdlets -contains $name) -and -not ($f -eq 'probe-parent.ps1' -and $name -eq 'Start-Process')) -or $c.Extent.Text -match $mutatingNative) { $bad += $c.Extent.Text.Split("`n")[0].Trim() }
    }
    Assert-That "프로브에 시스템 변경 명령 없음 ($f)" ($bad.Count -eq 0) ($bad -join ' | ')
}

# 점 읽기(dot-source)한 공용 파일의 $Script: 변수가 진입 스크립트의 파라미터를 덮어쓰면 안 된다(실제로 RunDir 로 한 번 겪었다).
$commonVars = @($library | ForEach-Object { [regex]::Matches([IO.File]::ReadAllText((Join-Path $dir $_)), '\$Script:(\w+)\s*=') } | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() } | Select-Object -Unique)
foreach ($f in $entry) {
    $pb = $asts[$f].ParamBlock
    $pn = @(); if ($pb) { $pn = @($pb.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath.ToLowerInvariant() }) }
    $clash = @($pn | Where-Object { $commonVars -contains $_ })
    Assert-That "파라미터 이름이 공용 `$Script: 변수와 겹치지 않는다 ($f)" ($clash.Count -eq 0) ($clash -join ', ')
}

# 기본 모드는 dry-run
$srcOf = @{}; foreach ($f in $all) { $srcOf[$f] = [IO.File]::ReadAllText((Join-Path $dir $f)) }
Assert-That '공용 기본값 ApplyMode=$false' ($srcOf[$libCommon] -match '\$Script:ApplyMode\s*=\s*\$false')
Assert-That '사전 점검 ApplyMode=$false' ($srcOf['Invoke-IsolationPreflight.ps1'] -match '\$Script:ApplyMode\s*=\s*\$false')
# 진입 스크립트는 스위치를 [bool] 로 흐름 함수에 넘기고, 흐름 함수는 그 값으로만 ApplyMode 를 켠다.
Assert-That 'Initialize 는 -Apply 로만 적용' (($srcOf['Initialize-Isolation.ps1'] -match 'Invoke-IsoApply[^\r\n]*-Apply \(\[bool\]\$Apply\)') -and ($srcOf[$libFlows] -match '(?s)function Invoke-IsoApply.*?\$Script:ApplyMode\s*=\s*\$Apply'))
Assert-That 'Remove 는 -Apply 로만 적용' (($srcOf['Remove-Isolation.ps1'] -match 'Invoke-IsoRecover[^\r\n]*-Apply \(\[bool\]\$Apply\)') -and ($srcOf[$libFlows] -match '(?s)function Invoke-IsoRecover.*?\$Script:ApplyMode\s*=\s*\$Apply'))
Assert-That 'Test 는 -Execute 로만 실행' (($srcOf['Test-IsolationEffect.ps1'] -match 'Invoke-IsoVerify[^\r\n]*-Execute \(\[bool\]\$Execute\)') -and ($srcOf[$libFlows] -match '(?s)function Invoke-IsoVerify.*?\$Script:ApplyMode\s*=\s*\$Execute'))
Assert-That 'Initialize 는 스냅숏 해시 확인 없이 적용하지 않는다' (($srcOf['Initialize-Isolation.ps1'] -match 'ConfirmSnapshot') -and ($srcOf[$libFlows] -match 'ConfirmSnapshot 이 preflight.json'))
# 검증 흐름은 신원 확인을 성공 조건에 넣어야 하고, 정리 실패는 종료 코드 0 이 될 수 없어야 한다(구조로 고정).
Assert-That '검증: 성공 조건에 신원 확인이 들어 있다' ($srcOf[$libFlows] -match '\$established\s*=\s*\(\$identity\.ok\)')
Assert-That '검증: 정리 불완전이면 종료 코드 70' ($srcOf[$libFlows] -match '(?s)if \(-not \$cleanupOk\)\s*\{[^}]*\$exitCode = 70')
$profileCalls = @()
foreach ($f in (@($entry) + @($library) + @($probes))) {
    foreach ($c in $asts[$f].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
        if ($c.GetCommandName() -in @('Set-NetFirewallProfile', 'Set-NetFirewallSetting')) { $profileCalls += "$f@$($c.Extent.StartLineNumber)" }
    }
}
Assert-That '이 묶음은 방화벽 프로필·전역 설정(기본 정책)을 바꾸는 호출이 없다' ($profileCalls.Count -eq 0) ($profileCalls -join ', ')

# 코드가 부르는 모든 시스템 변경 명령을 모의 시스템이 덮는가(함수로 대체하거나, 호출되면 예외를 던지는 막이로 막는다).
# 이것이 빠지면 흐름 시험이 그 명령의 진짜 cmdlet 을 부를 수 있다.
$mockText = $srcOf['tests\MockSystem.ps1']
$uncovered = @($usedMutators | Where-Object { $mockText -notmatch ("(?m)^function " + [regex]::Escape($_) + "\b") -and $mockText -notmatch ("'" + [regex]::Escape($_) + "'") })
Assert-That '모의 시스템이 코드가 부르는 모든 변경 명령을 덮는다' ($uncovered.Count -eq 0) ($uncovered -join ', ')
Assert-That '모의 시스템은 진짜 auditpol 을 부르지 않는다(Invoke-AuditPol 을 대체한다)' ($mockText -match '(?m)^function Invoke-AuditPol')

# ── 버전 관측 파일: 역할별 구조 검사 ─────────────────────────────────────────────
# 모두에 같은 규칙을 씌우지 않는다. 관리자 진입점은 위의 변경 관문·.NET 쓰기·모의 덮개 규칙을 이미 받았고(진입점 목록에 있다),
# 여기서는 역할에 맞는 규칙을 더한다. 위의 어떤 규칙도 이 구역 때문에 느슨해지지 않는다.
function Get-FuncAst($Ast, [string]$Name) { $Ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $Name }, $true) }
function Get-CommandNames($Ast) { @($Ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | ForEach-Object { $_.GetCommandName() } | Where-Object { $_ } | Select-Object -Unique) }
function Get-QuotedList([string]$Text, [string]$Pattern) { $m = [regex]::Match($Text, $Pattern); if (-not $m.Success) { return @() }; @([regex]::Matches($m.Groups[1].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value } | Sort-Object) }
function Get-EnvNames([string]$Text) { @([regex]::Matches($Text, '\$env:(\w+)') | ForEach-Object { $_.Groups[1].Value.ToUpperInvariant() } | Sort-Object -Unique) }
function Get-DotNetWriteSites($Ast) {
    $sites = New-Object System.Collections.ArrayList
    foreach ($m in $Ast.FindAll({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Static }, $true)) {
        if ($m.Expression.Extent.Text -notmatch '(?i)^\[(System\.)?IO\.(File|Directory)\]$') { continue }
        if ($m.Member.Extent.Text -notmatch $dotNetWrites) { continue }
        [void]$sites.Add([pscustomobject]@{ Fn = (Get-EnclosingFunction $m); Text = $m.Extent.Text.Split("`n")[0].Trim(); Line = $m.Extent.StartLineNumber })
    }
    , @($sites)
}

# (A) 관리자 진입점 Test-VersionObservation.ps1: 변경 관문·dry-run·환경 구성
$veSrc = $srcOf[$versionEntry]; $veAst = $asts[$versionEntry]
$fnVO = Get-FuncAst $veAst 'Invoke-VersionObservation'
Assert-That '진입점(버전 관측): Invoke-VersionObservation 함수가 있다' ($null -ne $fnVO)
if ($fnVO) {
    $mutOffs = @($fnVO.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-Mutation' }, $true) | ForEach-Object { $_.Extent.StartOffset })
    $dryIf = @($fnVO.FindAll({ param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text -match 'NOT_EXECUTED' }, $true)) | Select-Object -First 1
    $firstMut = $null; if ($mutOffs.Count -gt 0) { $firstMut = ($mutOffs | Measure-Object -Minimum).Minimum }
    Assert-That '진입점(버전 관측): -Execute 가 없으면 NOT_EXECUTED 로 돌아오고, 그 분기가 첫 Invoke-Mutation 보다 앞에 있다(기본은 dry-run)' ([bool]($dryIf -and $null -ne $firstMut -and $dryIf.Extent.EndOffset -lt $firstMut))
}
Assert-That '진입점(버전 관측): -Execute 는 [bool] 로 흐름 함수에 넘어가고 ApplyMode 는 그 값으로만 켜진다' (($veSrc -match 'Invoke-VersionObservation[^\r\n]*-Execute \(\[bool\]\$Execute\)') -and ($veSrc -match '\$Script:ApplyMode\s*=\s*\$Execute'))
Assert-That '진입점(버전 관측): semgrep-version 모드의 한도는 어댑터 계약 값에 고정돼 있고 다르면 거부(30)한다' ($veSrc -match '(?s)semgrep-version.{0,200}\$Script:VersionLimits.{0,400}exitCode = 30')
Assert-That '진입점(버전 관측): 자식 환경은 계약 함수(New-VersionChildEnv)로만 만든다 — 부모 환경 변수는 $env:WINDIR 하나만 읽는다' (($veSrc -match 'New-VersionChildEnv\s+-WindowsDir') -and ((Get-EnvNames $veSrc) -join ',') -eq 'WINDIR') ((Get-EnvNames $veSrc) -join ',')
Assert-That '진입점(버전 관측): 수집 상태·종료 코드·해석의 판정은 계약 함수(Get-VersionObservationFailures) 한 곳에서 한다' (($veSrc -match 'Get-VersionObservationFailures\s+-RunnerResult') -and ($veSrc -notmatch "\`$failure\s*=\s*'(TIMEOUT|KILLED|NONZERO_EXIT|STREAM|RUNNER)"))
Assert-That '진입점(버전 관측): 성공(VERSION_OBSERVED)은 신원 확인·실패 없음·버전 값이 모두 있을 때만 정해진다' ($veSrc -match 'if \(\$idOk -and -not \$failure -and \$versionStr\)')
Assert-That '진입점(버전 관측): 정리 불완전이면 종료 코드 70 이고, 정리는 항목마다 독립 실행한다(Invoke-IsoCleanupStep 4곳 이상)' (($veSrc -match '(?s)if \(-not \$cleanupOk\)\s*\{[^}]*\$exitCode = 70') -and ([regex]::Matches($veSrc, 'Invoke-IsoCleanupStep')).Count -ge 4)
Assert-That '진입점(버전 관측): 관측 성립과 정리 완료를 따로 기록한다(report.observation·report.cleanup)' (($veSrc -match '\$report\.observation\s*=') -and ($veSrc -match '\$report\.cleanup\s*='))

# (B) 자식 실행기 version-runner.ps1: 고정 모드·인자, 셸 비사용, 환경 제한, 시간·출력 제한, 읽기 실패 구분
$vrSrc = $srcOf[$versionRunner]; $vrAst = $asts[$versionRunner]
$vrCmds = Get-CommandNames $vrAst
$vrMut = @($mutatingCmdlets | Where-Object { $_ -ne 'Stop-Process' } | Where-Object { $vrCmds -contains $_ })
$vrNative = @($vrAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | Where-Object { $_.Extent.Text -match $mutatingNative })
Assert-That '자식 실행기: 프로세스 종료(Stop-Process) 말고는 시스템을 바꾸는 명령이 없다(계정·방화벽·감사·ACL·파일 삭제/복사·Start-Process 없음)' (($vrMut.Count -eq 0) -and ($vrNative.Count -eq 0)) ($vrMut -join ',')
$vrIoBad = @((Get-DotNetWriteSites $vrAst) | Where-Object { $_.Fn -ne 'Write-ResultFile' })
Assert-That '자식 실행기: 파일 쓰기/삭제 .NET 호출은 결과 파일을 쓰는 Write-ResultFile 안에서만 한다' ($vrIoBad.Count -eq 0) (($vrIoBad | ForEach-Object { "$($_.Text)@$($_.Line)" }) -join ' | ')
Assert-That '자식 실행기: mode 는 semgrep-version 과 stub 둘뿐이고 그 밖은 거부한다' (($vrSrc -match "\`$req\.mode -eq 'semgrep-version'") -and ($vrSrc -match "\`$req\.mode -eq 'stub'") -and ($vrSrc -match "else \{ \`$refuse = '알 수 없는 mode' \}"))
Assert-That '자식 실행기: semgrep-version 모드는 이름이 semgrep.exe 인 절대 경로와 인자 정확히 ["--version"] 하나만 받는다' (($vrSrc -match "\(Split-Path -Leaf \`$exe\) -ne 'semgrep\.exe'") -and ($vrSrc -match "\`$args0\.Count -ne 1 -or \`$args0\[0\] -ne '--version'") -and ($vrSrc -match 'IsPathRooted\(\$exe\)'))
$vrShell = @($vrAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | Where-Object { $nm = $_.GetCommandName(); $nm -and ($nm -in @('Invoke-Expression', 'iex', 'Start-Process', 'Invoke-Command', 'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe')) })
Assert-That '자식 실행기: 셸을 쓰지 않는다 — ProcessStartInfo(UseShellExecute=$false) 로 절대 경로를 직접 실행한다' (($vrShell.Count -eq 0) -and ($vrSrc -match 'UseShellExecute = \$false') -and ($vrSrc -notmatch 'UseShellExecute\s*=\s*\$true') -and ($vrSrc -notmatch '(?i)cmd(\.exe)?\s+/c') -and ($vrSrc -match 'FileName = \$exe'))
$iClear = $vrSrc.IndexOf('EnvironmentVariables.Clear()'); $iSet = $vrSrc.IndexOf('EnvironmentVariables[')
Assert-That '자식 실행기: 환경은 요청의 것만 쓴다 — EnvironmentVariables.Clear() 가 첫 대입보다 앞서고, 이 프로세스의 $env: 는 WINDIR(5.1 경로) 하나뿐이다' (($iClear -ge 0) -and ($iSet -gt $iClear) -and ((Get-EnvNames $vrSrc) -join ',') -eq 'WINDIR') "Clear=$iClear Set=$iSet env=$((Get-EnvNames $vrSrc) -join ',')"
Assert-That '자식 실행기: 한도 네 개가 없거나 1 미만이면 거부한다(timeoutMs·maxStdoutBytes·maxStderrBytes·killWaitMs)' ($vrSrc -match "foreach \(\`$k in 'timeoutMs', 'maxStdoutBytes', 'maxStderrBytes', 'killWaitMs'\)[^\r\n]*-lt 1")
Assert-That '자식 실행기: 시간 초과·출력 초과·읽기 실패면 자식 트리를 끝내고 종료를 관찰한다' ($vrSrc -match '(?s)if \(\$res\.child\.timedOut -or \$res\.child\.outputLimitExceeded -or \$res\.child\.streamReadFailed\)\s*\{\s*\[void\]\(Stop-ProcessTree')
$fnStep = Get-FuncAst $vrAst 'Step-StreamRead'; $fnNew = Get-FuncAst $vrAst 'New-StreamState'
$eofInCatch = @()
foreach ($fn in @($fnStep, $fnNew)) { if ($fn) { foreach ($c in $fn.FindAll({ param($n) $n -is [Management.Automation.Language.CatchClauseAst] }, $true)) { if ($c.Body.Extent.Text -match '\.eof\s*=') { $eofInCatch += "$($fn.Name)@$($c.Extent.StartLineNumber)" } } } }
Assert-That '자식 실행기: 읽기 예외(catch) 안에서 eof 를 true 로 만들지 않는다 — 정상 EOF 와 읽기 실패를 구분한다' ([bool]($fnStep -and $fnNew) -and $eofInCatch.Count -eq 0) ($eofInCatch -join ',')
Assert-That '자식 실행기: eof 를 켜는 곳은 EndRead 가 예외 없이 0 을 돌려준 한 곳뿐이다' (([regex]::Matches($vrSrc, '\.eof\s*=\s*\$true')).Count -eq 1)
Assert-That '자식 실행기: streamsClosed 는 한 함수(Test-StreamsClosed)가 정하고, 식으로 직접 계산하지 않는다' (($vrSrc -match '\$res\.streamsClosed = Test-StreamsClosed') -and ($vrSrc -notmatch 'streamsClosed\s*=\s*\[bool\]'))
$loadIf = $vrAst.Find({ param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text -match "ParameterSetName -eq 'Load'" }, $true)
$procStart = $vrAst.Find({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Static -and $n.Extent.Text -match 'Diagnostics\.Process\]::Start' }, $true)
Assert-That '자식 실행기: -LoadFunctionsOnly 는 프로세스를 시작하는 코드보다 앞에서 돌아온다' ([bool]($loadIf -and $procStart -and $loadIf.Extent.EndOffset -lt $procStart.Extent.StartOffset))

# (C) 스텁 version-stub.ps1: 시나리오 목록이 실행기·진입점과 같고, 시스템을 바꾸는 명령이 없다
$vsSrc = $srcOf[$versionStub]; $vsAst = $asts[$versionStub]
$stubList = Get-QuotedList $vsSrc '\$allowed\s*=\s*@\(([^)]*)\)'
$runnerList = Get-QuotedList $vrSrc '\$Script:StubScenarios\s*=\s*@\(([^)]*)\)'
$entryList = Get-QuotedList $veSrc 'ValidateSet\(([^)]*)\)\]\[string\]\$StubScenario'
Assert-That '스텁: 시나리오 목록이 스텁·실행기·진입점에서 같다(허용 목록이 어긋나지 않는다)' ((@($stubList).Count -ge 12) -and (($stubList -join ',') -eq ($runnerList -join ',')) -and (($stubList -join ',') -eq ($entryList -join ','))) ("스텁=$($stubList -join ',') / 실행기=$($runnerList -join ',') / 진입점=$($entryList -join ',')")
$vsMut = @($mutatingCmdlets | Where-Object { (Get-CommandNames $vsAst) -contains $_ })
$vsEnv = @(Get-EnvNames $vsSrc | Where-Object { @('SYSTEMROOT', 'USERPROFILE') -notcontains $_ })
Assert-That '스텁: 시스템을 바꾸는 명령도 파일 쓰기도 없고, 읽는 환경 변수는 SYSTEMROOT·USERPROFILE 뿐이다' (($vsMut.Count -eq 0) -and ((Get-DotNetWriteSites $vsAst).Count -eq 0) -and ($vsEnv.Count -eq 0)) (($vsMut + $vsEnv) -join ',')
Assert-That '스텁: 프로세스를 시작하는 곳은 고정 인자(Start-Sleep -Seconds 90)의 자손 하나뿐이다' (([regex]::Matches($vsSrc, 'Diagnostics\.Process\]::Start')).Count -eq 1 -and ($vsSrc -match "Arguments = '-NoProfile -NonInteractive -Command Start-Sleep -Seconds 90'"))

# (D) 계약 파일 VersionContract.ps1: 실행 부작용이 없다
$vcSrc = $srcOf[$versionContract]; $vcAst = $asts[$versionContract]
$vcTopBad = @($vcAst.EndBlock.Statements | Where-Object { $_ -isnot [Management.Automation.Language.AssignmentStatementAst] -and $_ -isnot [Management.Automation.Language.FunctionDefinitionAst] })
Assert-That '계약 파일: 최상위는 대입과 함수 정의뿐이다(불러오는 것만으로 실행되는 것이 없다)' ($vcTopBad.Count -eq 0) (($vcTopBad | ForEach-Object { $_.Extent.Text.Split("`n")[0].Trim() }) -join ' | ')
$vcOwn = @($vcAst.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true) | ForEach-Object { $_.Name })
$vcExtra = @((Get-CommandNames $vcAst) | Where-Object { (@('New-Object', 'Join-Path') + $vcOwn) -notcontains $_ })
Assert-That '계약 파일: 부르는 명령이 허용 목록(New-Object·Join-Path·이 파일의 함수)뿐이다 — 파일·프로세스·네트워크·계정 접근 없음' ($vcExtra.Count -eq 0) ($vcExtra -join ',')
$vcNewObjBad = @($vcAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'New-Object' }, $true) | Where-Object { $_.Extent.Text -notmatch 'New-Object\s+(Text\.UTF8Encoding|System\.Collections\.ArrayList)\b' })
$vcStatic = @($vcAst.FindAll({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Static -and $n.Expression.Extent.Text -match '(?i)IO\.|Diagnostics|Net\.|Environment|Reflection|Activator' }, $true))
$vcVars = @([regex]::Matches($vcSrc, '\$Script:(\w+)\s*=') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
Assert-That '계약 파일: New-Object 는 인코딩·목록만, 정적 .NET 호출은 파일·프로세스·네트워크·환경이 아니고, $env: 를 읽지 않으며, $Script: 대입은 상수 둘(VersionArgs·VersionLimits)뿐이다' (($vcNewObjBad.Count -eq 0) -and ($vcStatic.Count -eq 0) -and (@(Get-EnvNames $vcSrc).Count -eq 0) -and (($vcVars -join ',') -eq 'VersionArgs,VersionLimits')) "newObj=$($vcNewObjBad.Count) static=$($vcStatic.Count) vars=$($vcVars -join ',')"
Assert-That '계약 파일: 온라인 최신 버전 조회를 끄는 고정값은 문자열 상수 0 으로 한 번만 대입한다(부모 환경에서 읽지 않는다)' (([regex]::Matches($vcSrc, "SEMGREP_ENABLE_VERSION_CHECK\s*=\s*'0'")).Count -eq 1) ''
$vcNameUsers = @($all | Where-Object { $_ -ne 'Test-IsolationScripts.ps1' -and $srcOf[$_] -match 'SEMGREP_ENABLE_VERSION_CHECK' } | Sort-Object)
$vcNameWant = @($versionContract, $versionEntry, $versionStub, 'tests\Test-VersionRunner.ps1', 'tests\Test-VersionFlows.ps1') | Sort-Object
Assert-That '고정값 한정: 이 이름은 버전 관측 계약(대입 한 곳)·진입점(설명 주석)·스텁·그 시험에만 나온다(프로브·격리 흐름·다른 관리자 진입점·자식 실행기에는 없다)' (($vcNameUsers -join ',') -eq ($vcNameWant -join ',')) ("실제: $($vcNameUsers -join ',')")
$veNameCode = @($asts[$versionEntry].FindAll({ param($n) ($n -is [Management.Automation.Language.StringConstantExpressionAst] -or $n -is [Management.Automation.Language.ExpandableStringExpressionAst] -or $n -is [Management.Automation.Language.CommandAst] -or $n -is [Management.Automation.Language.VariableExpressionAst]) -and $n.Extent.Text -match 'SEMGREP_ENABLE_VERSION_CHECK' }, $true))
Assert-That '고정값 한정: 진입점 파일에서 이 이름은 설명 주석에만 있고 실행 코드(문자열·명령·변수)에는 없다' ($veNameCode.Count -eq 0) (($veNameCode | ForEach-Object { "$($_.Extent.Text)@$($_.Extent.StartLineNumber)" }) -join ' | ')

# (E) 새 시험 파일: 모의 샌드박스 환경 변수를 정한 뒤에만 진입 스크립트를 부른다
$vfSrc = $srcOf['tests\Test-VersionFlows.ps1']
Assert-That '흐름 시험(버전): 진입 스크립트를 부르기 전에 모의 샌드박스(ISO_MOCK_SANDBOX)를 정하고 끝나면 지운다' (($vfSrc.IndexOf('$env:ISO_MOCK_SANDBOX = ') -ge 0) -and ($vfSrc.IndexOf('$env:ISO_MOCK_SANDBOX = ') -lt $vfSrc.IndexOf('-File (Join-Path $Sb.Code $Script)')) -and ($vfSrc -match 'Remove-Item Env:\\ISO_MOCK_SANDBOX'))

# (F) LSP-MIN-1 파일(최소 기동 관측): 별도 목록으로 역할마다 점검한다. 위의 $all 에 넣지 않는 이유: '고정값 한정' 검사가 이 이름이 나오는 파일을 세는데,
#     이 파일들은 그 이름을 **코드에 두지 않는다**(주석에서 "없다"고 적는 것은 허용) — 그 사실을 아래에서 따로 지킨다. 위의 어떤 규칙도 이 구역 때문에 느슨해지지 않는다.
$lspContract = 'LspMinContract.ps1'; $lspRunner = 'lsp-min-runner.ps1'; $lspStub = 'lsp-min-stub.ps1'; $lspTest = 'tests\Test-LspMinRunner.ps1'
$lspFiles = @($lspContract, $lspRunner, $lspStub, $lspTest)
$lspAst = @{}; $lspSrc = @{}
foreach ($f in $lspFiles) {
    $p = Join-Path $dir $f
    $errs = $null; $tokens = $null
    $lspAst[$f] = [Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errs)
    $lspSrc[$f] = [IO.File]::ReadAllText($p)
    $b = [IO.File]::ReadAllBytes($p)
    Assert-That "LSP-MIN 구문 $f ($($PSVersionTable.PSVersion))" ($errs.Count -eq 0) (($errs | ForEach-Object { "$($_.Message)@$($_.Extent.StartLineNumber)" }) -join '; ')
    Assert-That "LSP-MIN BOM $f" ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)
    $hits = New-Object System.Collections.ArrayList
    foreach ($c in $lspAst[$f].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
        $name = $c.GetCommandName(); $first = $c.CommandElements[0].Extent.Text.Trim('"', "'")
        if (($name -and ($name -match $forbiddenNames -or $name -in @('Invoke-WebRequest', 'Invoke-RestMethod', 'Invoke-Expression', 'iex', 'curl', 'wget', 'Start-BitsTransfer'))) -or ($first -match '(?i)(^|[\\/])(semgrep|pysemgrep|semgrep-core)(\.exe)?$')) { [void]$hits.Add(("{0}@{1}" -f $c.Extent.Text.Split("`n")[0].Trim(), $c.Extent.StartLineNumber)) }
    }
    Assert-That "LSP-MIN semgrep 호출·내려받기·Invoke-Expression 없음 ($f)" ($hits.Count -eq 0) ($hits -join ' | ')
    # 소유자 결정: LSP 환경에 온라인 최신 버전 조회를 끄는 변수를 더하지 않는다 — 이름이 코드(문자열·명령·변수)에 없어야 한다. 주석은 허용한다.
    $nameCode = @($lspAst[$f].FindAll({ param($n) ($n -is [Management.Automation.Language.StringConstantExpressionAst] -or $n -is [Management.Automation.Language.ExpandableStringExpressionAst] -or $n -is [Management.Automation.Language.CommandAst] -or $n -is [Management.Automation.Language.VariableExpressionAst]) -and $n.Extent.Text -match 'SEMGREP_ENABLE_VERSION_CHECK' }, $true))
    Assert-That "LSP-MIN SEMGREP_ENABLE_VERSION_CHECK 가 코드에 없다 ($f)" ($nameCode.Count -eq 0) (($nameCode | ForEach-Object { "$($_.Extent.Text)@$($_.Extent.StartLineNumber)" }) -join ' | ')
}
# (F-1) 계약 파일: 실행 부작용이 없다.
$lcAst = $lspAst[$lspContract]; $lcSrc = $lspSrc[$lspContract]
$lcTopBad = @($lcAst.EndBlock.Statements | Where-Object { $_ -isnot [Management.Automation.Language.AssignmentStatementAst] -and $_ -isnot [Management.Automation.Language.FunctionDefinitionAst] })
Assert-That 'LSP-MIN 계약 파일: 최상위는 대입과 함수 정의뿐이다(불러오는 것만으로 실행되는 것이 없다)' ($lcTopBad.Count -eq 0) (($lcTopBad | ForEach-Object { $_.Extent.Text.Split("`n")[0].Trim() }) -join ' | ')
$lcOwn = @($lcAst.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true) | ForEach-Object { $_.Name })
$lcExtra = @((Get-CommandNames $lcAst) | Where-Object { (@('New-Object', 'ForEach-Object', 'Where-Object', 'ConvertTo-Json') + $lcOwn) -notcontains $_ })
Assert-That 'LSP-MIN 계약 파일: 부르는 명령이 허용 목록(New-Object·ForEach-Object·Where-Object·ConvertTo-Json·이 파일의 함수)뿐이다 — 파일·프로세스·네트워크·계정 접근 없음' ($lcExtra.Count -eq 0) ($lcExtra -join ',')
$lcStatic = @($lcAst.FindAll({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Static -and $n.Expression.Extent.Text -match '(?i)IO\.|Diagnostics|Net\.|Environment|Reflection|Activator' }, $true))
Assert-That 'LSP-MIN 계약 파일: 파일·프로세스·네트워크·환경을 만지는 정적 .NET 호출이 없고 $env: 도 읽지 않는다' (($lcStatic.Count -eq 0) -and (@(Get-EnvNames $lcSrc).Count -eq 0))
$lcVars = @([regex]::Matches($lcSrc, '\$Script:(\w+)\s*=') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$lcWantVars = @('LspMinAbortMethods', 'LspMinAllowedImages', 'LspMinArgs', 'LspMinEnvNames', 'LspMinExeName', 'LspMinHomeExpectedPrefix', 'LspMinInitErrorLogPattern', 'LspMinInitId', 'LspMinLimits', 'LspMinNetworkPatterns', 'LspMinScanPatterns', 'LspMinSendOrder', 'LspMinShutdownId', 'LspMinWatchedRoles') | Sort-Object
Assert-That 'LSP-MIN 계약 파일: $Script: 대입은 정해진 상수 열네 개뿐이다' (($lcVars -join ',') -eq ($lcWantVars -join ',')) ($lcVars -join ',')
Assert-That 'LSP-MIN 계약 파일: 보낼 수 있는 메시지는 initialize·shutdown·exit 셋이고 이 순서다' ($lcSrc -match "\`$Script:LspMinSendOrder = @\('initialize', 'shutdown', 'exit'\)")
# (F-2) 러너: 고정 모드·인자, 셸 비사용, 환경 제한, 한도 상한, 송신 방어선, 강제 종료는 한 번, 점 불러오기 안전.
$lrAst = $lspAst[$lspRunner]; $lrSrc = $lspSrc[$lspRunner]
$lrCmds = Get-CommandNames $lrAst
$lrMut = @($mutatingCmdlets | Where-Object { $lrCmds -contains $_ })
$lrNative = @($lrAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | Where-Object { $_.Extent.Text -match $mutatingNative })
Assert-That 'LSP-MIN 러너: 시스템을 바꾸는 cmdlet·명령이 하나도 없다(계정·방화벽·감사·ACL·파일 삭제/복사·Start-Process·Stop-Process 없음 — 프로세스 종료는 불러온 Stop-ProcessTree 함수만 한다)' (($lrMut.Count -eq 0) -and ($lrNative.Count -eq 0)) ($lrMut -join ',')
$lrIoBad = @((Get-DotNetWriteSites $lrAst) | Where-Object { $_.Fn -ne 'New-LspMinWorkDirs' })
Assert-That 'LSP-MIN 러너: 파일 쓰기·폴더 만들기 .NET 호출은 작업 폴더를 만드는 New-LspMinWorkDirs 안에서만 한다 (결과 파일은 불러온 Write-ResultFile 이 쓴다)' ($lrIoBad.Count -eq 0) (($lrIoBad | ForEach-Object { "$($_.Text)@$($_.Line)" }) -join ' | ')
Assert-That 'LSP-MIN 러너: mode 는 semgrep-lsp 와 stub 둘뿐이고 그 밖은 거부한다' (($lrSrc -match "\`$req\.mode -eq 'semgrep-lsp'") -and ($lrSrc -match "\`$req\.mode -eq 'stub'") -and ($lrSrc -match "else \{ \[void\]\`$refusals\.Add\('MODE_UNKNOWN'\) \}"))
Assert-That 'LSP-MIN 러너: semgrep-lsp 모드는 이름이 semgrep.exe 인 절대 경로와 인자 정확히 [lsp, --debug] 만 받는다' (($lrSrc -match "\(Split-Path -Leaf \`$exe\) -ne \`$Script:LspMinExeName") -and ($lrSrc -match "\`$args0\.Count -ne 2 -or \`$args0\[0\] -cne 'lsp' -or \`$args0\[1\] -cne '--debug'") -and ($lrSrc -match 'IsPathRooted\(\$exe\)'))
$lrShell = @($lrAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | Where-Object { $nm = $_.GetCommandName(); $nm -and ($nm -in @('Invoke-Expression', 'iex', 'Start-Process', 'Invoke-Command', 'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe')) })
Assert-That 'LSP-MIN 러너: 셸을 쓰지 않는다 — ProcessStartInfo(UseShellExecute=$false)로 절대 경로를 직접 실행한다' (($lrShell.Count -eq 0) -and ($lrSrc -match 'UseShellExecute = \$false') -and ($lrSrc -notmatch 'UseShellExecute\s*=\s*\$true') -and ($lrSrc -match 'FileName = \$exe'))
$lriClear = $lrSrc.IndexOf('EnvironmentVariables.Clear()'); $lriSet = $lrSrc.IndexOf('EnvironmentVariables[')
Assert-That 'LSP-MIN 러너: 환경은 요청의 것만 쓴다 — EnvironmentVariables.Clear() 가 첫 대입보다 앞서고, 이 프로세스의 $env: 는 읽지 않는다' (($lriClear -ge 0) -and ($lriSet -gt $lriClear) -and (@(Get-EnvNames $lrSrc).Count -eq 0)) "Clear=$lriClear Set=$lriSet env=$((Get-EnvNames $lrSrc) -join ',')"
Assert-That 'LSP-MIN 러너: 환경이 계약 함수(New-LspMinChildEnv)가 만든 것과 이름·값이 같지 않으면 거부한다' (($lrSrc -match 'New-LspMinChildEnv -WindowsDir \$winDir -Layout \$layout -Url \$url') -and ($lrSrc -match 'ENV_VALUE_UNEXPECTED') -and ($lrSrc -match 'ENV_NAME_NOT_ALLOWED'))
Assert-That 'LSP-MIN 러너: 한도 여덟 개가 모두 있고 1 이상이며 계약 상한을 넘지 않아야 한다' (($lrSrc -match "\`$limNames = @\('totalMs', 'initMs', 'exitMs', 'stdinCloseGraceMs', 'killConfirmMs', 'maxStdoutBytes', 'maxStderrBytes', 'sampleIntervalMs'\)") -and ($lrSrc -match 'LIMIT_ABOVE_CAP') -and ($lrSrc -match 'LIMIT_INVALID'))
$lrWrites = @([regex]::Matches($lrSrc, '\.Write\('))
$sendFn = Get-FuncAst $lrAst 'Send-LspMinMessage'
$sendText = ''; if ($sendFn) { $sendText = $sendFn.Extent.Text }
Assert-That 'LSP-MIN 러너: stdin 에 쓰는 곳은 Send-LspMinMessage 한 곳뿐이고, 쓰기 직전에 허용 메시지 검사(Assert-LspMinOutbound)를 거친다' (($lrWrites.Count -eq 1) -and ($sendText.IndexOf('Assert-LspMinOutbound') -ge 0) -and ($sendText.IndexOf('Assert-LspMinOutbound') -lt $sendText.IndexOf('.Write(')))
Assert-That 'LSP-MIN 러너: 프레임이 파이프 버퍼를 넘으면 쓰지 않는다(쓰기가 막힐 수 없다)' (($lrSrc -match '\$Script:LspMinMaxFrameBytes = 3500') -and ($sendText -match 'LspMinMaxFrameBytes'))
Assert-That 'LSP-MIN 러너: 보내는 메시지 라벨은 initialize·shutdown·exit 뿐이다(initialized 문자열이 코드에 없다)' (@($lrAst.FindAll({ param($n) $n -is [Management.Automation.Language.StringConstantExpressionAst] -and $n.Value -ceq 'initialized' }, $true)).Count -eq 0)
$killSites = @($lrAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Stop-ProcessTree' }, $true))
Assert-That 'LSP-MIN 러너: 프로세스 트리 종료 호출은 두 곳(본문의 한 번, 본문이 정리 전에 던졌을 때만 쓰는 finally 안)뿐이고, finally 쪽은 정리가 끝났으면(bodyDone) 아무것도 건드리지 않는다' (($killSites.Count -eq 2) -and ($lrSrc -match 'if \(-not \$bodyDone -and \$p -and \$null -ne \$childPid\)') -and ($lrSrc -match '\$bodyDone = \$true'))
Assert-That 'LSP-MIN 러너: 강제 종료 신호 횟수는 대입(= 1)으로만 정한다 — 늘려 가며 다시 보내는 코드가 없다' (([regex]::Matches($lrSrc, 'killCount\s*(\+=|\+\+)')).Count -eq 0)
$iCap1 = $lrSrc.IndexOf('$Script:LspMode = $PSCmdlet.ParameterSetName'); $iCap2 = $lrSrc.IndexOf('$Script:LspRequestFile = $RequestFile'); $iDot = $lrSrc.IndexOf("version-runner.ps1') -LoadFunctionsOnly")
Assert-That 'LSP-MIN 러너: 점 불러오기(version-runner.ps1)가 매개변수·$PSCmdlet 을 덮어쓰기 전에 내 값을 따로 저장한다' (($iCap1 -ge 0) -and ($iCap2 -ge 0) -and ($iDot -gt $iCap1) -and ($iDot -gt $iCap2) -and ($lrSrc -match "if \(\`$Script:LspMode -eq 'Load'\) \{ return \}"))
$iLoad = $lrSrc.IndexOf("if (`$Script:LspMode -eq 'Load') { return }"); $iStart = $lrSrc.IndexOf('[Diagnostics.Process]::Start')
Assert-That 'LSP-MIN 러너: -LoadFunctionsOnly 는 프로세스를 시작하는 코드보다 앞에서 돌아온다' (($iLoad -ge 0) -and ($iStart -gt $iLoad))
Assert-That 'LSP-MIN 러너: `, 배열` 로 돌려주는 함수를 @() 로 다시 감싸지 않는다(빈 배열이 원소 하나로 보이는 함정)' (([regex]::Matches($lrSrc, '@\(\s*(Get-DescendantRecords|Test-LspMinLayoutMatches|Get-LspMinRootFiles|Step-LspMinFramer)\b')).Count -eq 0)
$iClosed = $lrSrc.IndexOf('$res.cleanup.streamsClosed = Test-StreamsClosed'); $iLeft = $lrSrc.IndexOf('if (-not (Invoke-DescendantCleanup $childPid $childStart $res)) { $res.descendantTrackingOk = $false }')
Assert-That 'LSP-MIN 러너: 스트림이 닫혔는지는 자손을 끝내기 전에 정한다 (자손을 끝내면 파이프가 닫혀 사실이 사라진다)' (($iClosed -ge 0) -and ($iLeft -gt $iClosed))
Assert-That 'LSP-MIN 러너: 거부 사유 토큰에 값(경로·환경 값)을 싣지 않는다 — 환경 이름 외의 동적 문자열은 이름만 정규화해 넣는다' ($lrSrc -match "ENV_NAME_NOT_ALLOWED:' \+ \(\`$n -replace '\[\^A-Za-z0-9_\]', '\?'\)")
$lrSrvProp = @($lrAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Get-LmProp' -and $n.CommandElements.Count -ge 2 -and $n.CommandElements[1].Extent.Text -match '^\$(m|msg|decoded|message)$' }, $true))
$kindFn = Get-FuncAst $lcAst 'Get-LspMinMessageKind'
$kindText = ''; if ($kindFn) { $kindText = $kindFn.Extent.Text }
Assert-That 'LSP-MIN 러너·계약: 서버가 보낸 메시지의 멤버는 키 이름을 대소문자 그대로 읽는다 — 서버 메시지를 대소문자 무시 조회(Get-LmProp)로 읽는 곳이 없고, 분류 함수는 Get-LmExactMember 만 쓴다' (($lrSrvProp.Count -eq 0) -and ($kindText.Length -gt 0) -and ($kindText -notmatch 'Get-LmProp') -and ($kindText -match 'Get-LmExactMember') -and ($lrSrc -match 'Get-LspMinMessageKind \$m'))
$lrCim = @($lrAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Get-CimInstance' }, $true))
$lrTable = @($lrAst.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Get-LspMinProcessTable' }, $true))
Assert-That 'LSP-MIN 러너: CIM 프로세스 조회는 한 곳이고 시간 제한(-OperationTimeoutSec)을 준다 — 멈춘 조회가 전체 상한을 넘겨 실행을 늘리지 못한다' (($lrCim.Count -eq 1) -and ($lrCim[0].Extent.Text -match '-OperationTimeoutSec \$TimeoutSec') -and ($lrCim[0].Extent.Text -match '-ErrorAction Stop'))
Assert-That 'LSP-MIN 러너: 프로세스 표본 호출은 모두 남은 시간에서 정한 제한(-TimeoutSec)을 주고, 마감까지 1초도 남지 않으면 표본을 시작하지 않는다' (($lrTable.Count -eq 1) -and ($lrTable[0].Extent.Text -match '-TimeoutSec \$sampleSec') -and ($lrSrc -match 'Get-LspMinSampleTimeoutSec') -and ($lrSrc -match '\$sampleSec -gt 0'))
Assert-That 'LSP-MIN 러너: 던진 오류에는 어느 구간(관측/정리)에서 났는지 적는다 — 관측이 끝난 표시($observationEnded)는 정리 구간 시작 직전에 서고 catch 가 errorPhase 로 남긴다' (($lrSrc -match "\`$res\.errorPhase = \`$\(if \(\`$observationEnded\) \{ 'CLEANUP' \} else \{ 'OBSERVATION' \}\)") -and ($lrSrc -match '\$observationEnded = \$true') -and ($lrSrc.IndexOf('$observationEnded = $true') -lt $lrSrc.IndexOf('$cleanupStart = [int]$sw.ElapsedMilliseconds')))
Assert-That 'LSP-MIN 러너: 실행 파일 경로도 중단 문구 검사를 받는다' ($lrSrc -match "Find-LspMinPathPattern \`$exe\) \) \{ \[void\]\`$refusals\.Add\('PATH_CONTAINS_ABORT_PATTERN:COMMAND'\)" -or $lrSrc -match "Find-LspMinPathPattern \`$exe\)\) \{ \[void\]\`$refusals\.Add\('PATH_CONTAINS_ABORT_PATTERN:COMMAND'\)")
# (F-3) 스텁: 시나리오 목록이 스텁·러너에서 같고, 시스템을 바꾸는 명령이 없다.
$lsAst = $lspAst[$lspStub]; $lsSrc = $lspSrc[$lspStub]
$lsList = Get-QuotedList $lsSrc '\$allowed\s*=\s*@\(([^)]*)\)'
$lrList = Get-QuotedList $lrSrc '\$Script:LspMinStubScenarios\s*=\s*@\(([^)]*)\)'
Assert-That 'LSP-MIN 스텁: 시나리오 목록이 스텁과 러너에서 같다 (허용 목록이 어긋나지 않는다)' ((@($lsList).Count -ge 20) -and (($lsList -join ',') -eq ($lrList -join ','))) ("스텁=$($lsList -join ',') / 러너=$($lrList -join ',')")
$lsMut = @($mutatingCmdlets | Where-Object { (Get-CommandNames $lsAst) -contains $_ })
$lsIo = @((Get-DotNetWriteSites $lsAst) | Where-Object { $_.Fn -ne 'Write-Rec' -and $_.Text -notmatch 'ws\\x\.txt' })
$lsEnv = @(Get-EnvNames $lsSrc | Where-Object { @('SYSTEMROOT', 'USERPROFILE') -notcontains $_ })
Assert-That 'LSP-MIN 스텁: 시스템을 바꾸는 명령이 없고, 파일 쓰기는 기록 함수(Write-Rec)와 작업 영역 시험 파일 하나뿐이며, 읽는 환경 변수는 SYSTEMROOT·USERPROFILE 뿐이다' (($lsMut.Count -eq 0) -and ($lsIo.Count -eq 0) -and ($lsEnv.Count -eq 0)) (($lsMut + $lsEnv + @($lsIo | ForEach-Object { $_.Text })) -join ',')
$lsStarts = @([regex]::Matches($lsSrc, 'Diagnostics\.Process\]::Start'))
Assert-That 'LSP-MIN 스텁: 프로세스를 시작하는 곳은 고정 인자의 자손 둘뿐이다 (Start-Sleep -Seconds 91 대기자, ping.exe -n 8 127.0.0.1)' (($lsStarts.Count -eq 2) -and ($lsSrc -match "Arguments = '-NoProfile -NonInteractive -Command Start-Sleep -Seconds 91'") -and ($lsSrc -match "Arguments = '-n 8 127\.0\.0\.1'"))
Assert-That 'LSP-MIN 스텁: 네트워크 접근이 없다 (127.0.0.1 로 ping 하는 자손 하나가 전부이고 소켓·웹 호출이 없다)' (($lsSrc -notmatch '(?i)Net\.Sockets|WebClient|HttpClient|Invoke-WebRequest|TcpClient') -and ((Get-CommandNames $lsAst) -notcontains 'Test-NetConnection'))

# ── 4) 논리(합성 입력) ──────────────────────────────────────────────────────
Assert-That 'ConvertTo-AuditFlags 0..3' ((-not (ConvertTo-AuditFlags 0).Success) -and (ConvertTo-AuditFlags 1).Success -and (-not (ConvertTo-AuditFlags 1).Failure) -and (ConvertTo-AuditFlags 2).Failure -and (ConvertTo-AuditFlags 3).Success -and (ConvertTo-AuditFlags 3).Failure)
Assert-That 'ConvertTo-AuditFlags 지원하지 않는 값은 추측하지 않는다' ((-not (ConvertTo-AuditFlags 4).Supported) -and (-not (ConvertTo-AuditFlags -1).Supported))

$sample = @(
    'Machine Name,Policy Target,Subcategory,Subcategory GUID,Inclusion Setting,Exclusion Setting,Setting Value',
    'NEXSOL-PC,System,���͸� �÷��� ����,{0CCE9226-69AE-11D9-BED3-505054503030},No Auditing,,0',
    'NEXSOL-PC,System,Process Creation,{0cce922b-69ae-11d9-bed3-505054503030},Success and Failure,,3',
    'NEXSOL-PC,System,Odd,{0CCE9225-69AE-11D9-BED3-505054503030},Failure,,2'
)
$av = ConvertFrom-AuditBackupLines -Lines $sample
Assert-That '감사 백업 줄 파싱(깨진 이름 열·소문자 GUID 포함)' ($av.Count -eq 3 -and $av['{0CCE9226-69AE-11D9-BED3-505054503030}'] -eq 0 -and $av['{0CCE922B-69AE-11D9-BED3-505054503030}'] -eq 3 -and $av['{0CCE9225-69AE-11D9-BED3-505054503030}'] -eq 2)

$map = @{ '\device\harddiskvolume3' = 'C:' }
Assert-That 'NT→DOS 경로 변환' ((Convert-NtPathToDosPath -NtPath '\Device\HarddiskVolume3\Windows\x.exe' -Map $map) -eq 'C:\Windows\x.exe')
Assert-That 'NT→DOS: 볼륨 번호 접두만 같은 다른 볼륨은 매칭하지 않는다' ($null -eq (Convert-NtPathToDosPath -NtPath '\Device\HarddiskVolume30\Windows\x.exe' -Map $map))
Assert-That 'NT→DOS: 대응이 없으면 $null (추측하지 않는다)' ($null -eq (Convert-NtPathToDosPath -NtPath '\Device\HarddiskVolume9\a.exe' -Map $map))

# 권한 계산
function New-Rule([string]$Sid, $Rights, [string]$Type) { New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($Sid)), $Rights, 'None', 'None', $Type) }
$want = [int64]0x1200A9
$usersOnly = @($Script:SidUsers)
$e1 = Get-EffectiveRightsForSids -Rules @((New-Rule $Script:SidUsers 'ReadAndExecute' 'Allow')) -Sids $usersOnly
Assert-That '권한: Users 읽기·실행 허용 → 가능' (($e1.effective -band $want) -eq $want)
$e2 = Get-EffectiveRightsForSids -Rules @((New-Rule $Script:SidUsers 'ReadAndExecute' 'Allow'), (New-Rule $Script:SidUsers 'ExecuteFile' 'Deny')) -Sids $usersOnly
Assert-That '권한: 같은 SID 의 실행 거부가 허용보다 우선 → 불가' (($e2.effective -band $want) -ne $want)
$e3 = Get-EffectiveRightsForSids -Rules @((New-Rule $Script:SidUsers 'Read' 'Allow')) -Sids $usersOnly
Assert-That '권한: 읽기만 허용 → 실행 불가' (($e3.effective -band $want) -ne $want)
$e4 = Get-EffectiveRightsForSids -Rules @((New-Rule 'S-1-5-21-1-2-3-1004' 'ReadAndExecute' 'Allow')) -Sids $usersOnly
Assert-That '권한: 관계없는 SID(해석 불가 포함)의 허용은 세지 않는다' ($e4.effective -eq 0)
Assert-That '권한: GenericRead(음수 Int32)만으로는 실행 불가' (((ConvertTo-RightsMask -Rights ([int]-2147483648)) -band $want) -ne $want)
Assert-That '권한: GenericAll 은 전체' (((ConvertTo-RightsMask -Rights 268435456) -band $want) -eq $want)

# 이벤트 대조
$t0 = [DateTime]::Parse('2026-10-27T10:00:00Z', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
$exe = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$nt = '\device\harddiskvolume3\windows\system32\windowspowershell\v1.0\powershell.exe'
$procs = @(
    [ordered]@{ role = 'parent'; processId = 100; exePath = $exe; startUtc = $t0.AddSeconds(0).ToString('o'); endUtc = $t0.AddSeconds(20).ToString('o') },
    [ordered]@{ role = 'child'; processId = 200; exePath = $exe; startUtc = $t0.AddSeconds(1).ToString('o'); endUtc = $t0.AddSeconds(19).ToString('o') }
)
$probesT = @([ordered]@{ name = 'external-reserved'; destAddress = '192.0.2.1'; destPort = 9 })
function New-Ev($pid2, $app, $sec, $dest, $port, $dir) { @{ recordId = 1; timeUtc = $t0.AddSeconds($sec); processId = $pid2; processIdRaw = "$pid2"; application = $app; direction = $dir; destAddress = $dest; destPort = "$port" } }
function Select-Ev($evs) { Select-MatchingBlockEvents -Events $evs -Processes $procs -Probes $probesT -DosMap $map -NowUtc $t0.AddSeconds(30) }

$r = Select-Ev @((New-Ev 200 $nt 10 '192.0.2.1' 9 'Outbound'))
Assert-That '대조: PID·경로·시각·목적지가 모두 맞으면 프로브에 귀속' ($r.matched['external-reserved'].Count -eq 1 -and $r.unidentified.Count -eq 0)
$r = Select-Ev @((New-Ev 999 $nt 10 '192.0.2.1' 9 'Outbound'))
Assert-That '대조: 다른 PID 는 식별 불가(우리 것이라고 가정하지 않는다)' ($r.matched['external-reserved'].Count -eq 0 -and $r.unidentified.Count -eq 1)
$r = Select-Ev @((New-Ev 200 $nt 60 '192.0.2.1' 9 'Outbound'))
Assert-That '대조: PID 가 같아도 프로세스 종료 한참 뒤 이벤트(PID 재사용)는 식별 불가' ($r.matched['external-reserved'].Count -eq 0 -and $r.unidentified.Count -eq 1)
$r = Select-Ev @((New-Ev 200 '\device\harddiskvolume3\windows\system32\cmd.exe' 10 '192.0.2.1' 9 'Outbound'))
Assert-That '대조: 실행 파일 경로가 다르면 식별 불가' ($r.unidentified.Count -eq 1)
$r = Select-Ev @((New-Ev 200 '\device\harddiskvolume9\windows\system32\windowspowershell\v1.0\powershell.exe' 10 '192.0.2.1' 9 'Outbound'))
Assert-That '대조: NT 경로를 DOS 경로로 못 바꾸면 식별 불가' ($r.unidentified.Count -eq 1)
$r = Select-Ev @((New-Ev 200 $nt 10 '203.0.113.5' 443 'Outbound'))
Assert-That '대조: 이번 실행의 프로세스지만 다른 목적지는 별도 항목' ($r.matched['external-reserved'].Count -eq 0 -and $r.runOtherDestination.Count -eq 1 -and $r.unidentified.Count -eq 0)
$r = Select-Ev @((New-Ev $null $nt 10 '192.0.2.1' 9 'Outbound'))
Assert-That '대조: PID 를 못 읽은 이벤트는 식별 불가' ($r.unidentified.Count -eq 1)
$r = Select-Ev @((New-Ev 200 $nt 10 '192.0.2.1' 9 'Inbound'))
Assert-That '대조: 방향이 Outbound 가 아니면 식별 불가' ($r.unidentified.Count -eq 1)
$r = Select-Ev @((New-Ev 200 $nt 10 '::ffff:192.0.2.1' 9 'Outbound'))
Assert-That '대조: IPv4 매핑 표기(::ffff:)를 같은 주소로 본다' ($r.matched['external-reserved'].Count -eq 1)

# 정상적인 빈 이벤트 목록(0건)은 예외 없이 처리된다. 프로세스 기록이 비어 있는 것과는 다른 문제로 호출자가 구분한다.
$r0 = $null; $err0 = $null
try { $r0 = Select-MatchingBlockEvents -Events @() -Processes $procs -Probes $probesT -DosMap $map -NowUtc $t0.AddSeconds(30) } catch { $err0 = $_.Exception.Message }
Assert-That '대조: 이벤트가 0건이어도(빈 배열) 예외 없이 처리된다' (($null -eq $err0) -and ($r0.matched['external-reserved'].Count -eq 0) -and ($r0.unidentified.Count -eq 0)) $err0
$r0b = $null; $err0b = $null
try { $r0b = Select-MatchingBlockEvents -Events @() -Processes @() -Probes @() -DosMap $map } catch { $err0b = $_.Exception.Message }
Assert-That '대조: 이벤트·프로세스·프로브가 모두 비어도 예외가 나지 않는다' (($null -eq $err0b) -and ($null -ne $r0b)) $err0b

# 판정: 연결 실패만으로는 차단이라고 하지 않는다
function Ev([bool]$ok, $audit, $wrapped, [int]$n, [bool]$procOk = $true) { @{ collectionOk = $ok; auditFailureEnabled = $audit; wrapped = $wrapped; processRecordsOk = $procOk; matchedCount = $n } }
Assert-That '판정: 실패 + 증거 일치 → OS_BLOCK_OBSERVED' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence (Ev $true $true $false 1)) -eq 'OS_BLOCK_OBSERVED')
Assert-That '판정: 실패 + 이벤트 0건(수집·감사 정상) → FAILED_WITHOUT_OS_EVIDENCE (차단이라고 하지 않는다)' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence (Ev $true $true $false 0)) -eq 'FAILED_WITHOUT_OS_EVIDENCE')
Assert-That '판정: 로그 수집 실패 → FAILED_EVIDENCE_UNAVAILABLE (0건 아님)' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence (Ev $false $true $false 0)) -eq 'FAILED_EVIDENCE_UNAVAILABLE')
Assert-That '판정: 감사 꺼짐 → FAILED_EVIDENCE_UNAVAILABLE' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence (Ev $true $false $false 0)) -eq 'FAILED_EVIDENCE_UNAVAILABLE')
Assert-That '판정: 감사 상태 모름($null) → FAILED_EVIDENCE_UNAVAILABLE' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence (Ev $true $null $false 0)) -eq 'FAILED_EVIDENCE_UNAVAILABLE')
Assert-That '판정: 로그가 밀렸음 → FAILED_EVIDENCE_UNAVAILABLE' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence (Ev $true $true $true 1)) -eq 'FAILED_EVIDENCE_UNAVAILABLE')
Assert-That '판정: 밀림 여부 모름($null) → FAILED_EVIDENCE_UNAVAILABLE' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence (Ev $true $true $null 1)) -eq 'FAILED_EVIDENCE_UNAVAILABLE')
Assert-That '판정: 연결 성공이면 이벤트와 상관없이 NOT_BLOCKED' ((Get-ProbeVerdict -Expectation blocked -Connected $true -Evidence (Ev $true $true $false 1)) -eq 'NOT_BLOCKED')
Assert-That '판정: 허용 기대 + 연결 성공' ((Get-ProbeVerdict -Expectation allowed -Connected $true -Evidence (Ev $true $true $false 0)) -eq 'ALLOWED_AS_EXPECTED')
Assert-That '판정: 허용 기대 + 연결 실패 → UNEXPECTEDLY_FAILED' ((Get-ProbeVerdict -Expectation allowed -Connected $false -Evidence (Ev $true $true $false 0)) -eq 'UNEXPECTEDLY_FAILED')

Assert-That '판정: 필수 프로세스 기록이 없으면(이벤트 0건과 다르다) FAILED_EVIDENCE_UNAVAILABLE' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence (Ev $true $true $false 0 $false)) -eq 'FAILED_EVIDENCE_UNAVAILABLE')
Assert-That '판정: 증거 항목이 하나라도 빠지면(processRecordsOk 없음) FAILED_EVIDENCE_UNAVAILABLE' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence @{ collectionOk = $true; auditFailureEnabled = $true; wrapped = $false; matchedCount = 1 }) -eq 'FAILED_EVIDENCE_UNAVAILABLE')

# 증거 수집: 기준점이 없으면 로그를 읽지 않고 건수를 null 로 둔다(0 이 아니다)
$ev0 = Get-BlockEvidence -Baseline @{ lastRecordId = $null; oldestRecordNumber = $null } -Processes $procs -Probes $probesT -AuditFailureEnabled $true
Assert-That '증거: 기준점이 없으면 collection.ok=false 이고 건수는 null' (($ev0.collection.ok -eq $false) -and ($null -eq $ev0.matchedCount) -and ($null -eq $ev0.unidentifiedCount))
# 프로세스 기록이 하나도 없으면 로그를 읽지도 않고 processRecordsOk=false (정상적인 이벤트 0건으로 보이지 않게)
$evNoProc = Get-BlockEvidence -Baseline @{ lastRecordId = 1000; oldestRecordNumber = 10 } -Processes @() -Probes $probesT -AuditFailureEnabled $true
Assert-That '증거: 프로세스 기록이 없으면 processRecordsOk=false, 건수 null, 로그를 읽지 않는다' (($evNoProc.processRecordsOk -eq $false) -and ($null -eq $evNoProc.matchedCount) -and ($evNoProc.collection.ok -eq $false))
Assert-That '증거: 그 결과로 낸 판정은 FAILED_EVIDENCE_UNAVAILABLE' ((Get-ProbeVerdict -Expectation blocked -Connected $false -Evidence @{ collectionOk = [bool]$evNoProc.collection.ok; auditFailureEnabled = $true; wrapped = $evNoProc.collection.wrapped; processRecordsOk = [bool]$evNoProc.processRecordsOk; matchedCount = 0 }) -eq 'FAILED_EVIDENCE_UNAVAILABLE')

# 시각: pwsh 는 ISO 문자열을 DateTime 으로 바꾸고 5.1 은 문자열로 둔다. 어느 쪽이든 같은 UTC 시각이어야 한다.
$iso = '2026-10-27T05:38:39.6258772Z'
$expectTicks = [DateTime]::Parse($iso, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime().Ticks
Assert-That '시각: ISO 문자열(Z)' ((ConvertTo-UtcDate $iso).Ticks -eq $expectTicks)
Assert-That '시각: ISO 문자열(+09:00 오프셋)을 UTC 로 환산' ((ConvertTo-UtcDate '2026-10-27T14:38:39.6258772+09:00').Ticks -eq $expectTicks)
Assert-That '시각: DateTime(Kind=Utc) 은 그대로' ((ConvertTo-UtcDate ([DateTime]::new($expectTicks, [DateTimeKind]::Utc))).Ticks -eq $expectTicks)
Assert-That '시각: DateTime(Kind=Local) 은 UTC 로 환산' ((ConvertTo-UtcDate ([DateTime]::new($expectTicks, [DateTimeKind]::Utc).ToLocalTime())).Ticks -eq $expectTicks)
Assert-That '시각: DateTime(Kind=Unspecified) 은 UTC 로 본다' ((ConvertTo-UtcDate ([DateTime]::new($expectTicks, [DateTimeKind]::Unspecified))).Ticks -eq $expectTicks)

# 신원 교차 확인(성공 판정의 필수 조건): 정상 대조군은 통과하고, 어긋나거나 빠지면 각각 해당 코드로 실패한다.
$sidD = 'S-1-5-21-1111111111-2222222222-3333333333-2001'
$tok = 'tok-current'
$launch = $t0
function New-IdSet {
    $iso0 = { param($sec) $t0.AddSeconds($sec).ToString('o') }
    @{
        ParentCim = [ordered]@{ role = 'parent'; processId = 100; parentProcessId = 5; exePath = $exe; startUtc = (& $iso0 0.1); ownerSid = $sidD }
        ChildCim = [ordered]@{ role = 'child'; processId = 200; parentProcessId = 100; exePath = $exe; startUtc = (& $iso0 0.5); ownerSid = $sidD }
        ParentSelf = [ordered]@{ runToken = $tok; pid = 100; startUtc = (& $iso0 0.1); exePath = $exe; sid = $sidD }
        ChildResult = [ordered]@{ runToken = $tok; self = [ordered]@{ pid = 200; startUtc = (& $iso0 0.5); exePath = $exe; sid = $sidD }; endUtc = (& $iso0 3); attempts = @() }
        Link = [ordered]@{ runToken = $tok; childPid = 200 }
        ParentDone = [ordered]@{ runToken = $tok; endUtc = (& $iso0 3.2) }
    }
}
function Test-Id($set) {
    Test-ProbeIdentity -ExpectedSid $sidD -ExpectedExe $exe -RunToken $tok -LaunchedUtc $launch -NowUtc $t0.AddSeconds(10) -ParentCim $set.ParentCim -ChildCim $set.ChildCim -ParentSelf $set.ParentSelf -ChildResult $set.ChildResult -Link $set.Link -ParentDone $set.ParentDone
}
function Codes($r) { @($r.failures | ForEach-Object { $_.code }) }
$good = Test-Id (New-IdSet)
Assert-That '신원: 정상 대조군은 통과한다' (($good.ok -eq $true) -and ($good.failures.Count -eq 0)) ((Codes $good) -join ',')
# 같은 정상 입력을 JSON 왕복(pwsh 에서는 시각이 DateTime 으로 바뀐다)해도 통과해야 한다
$setJ = New-IdSet; $roundTrip = @{}
foreach ($k in $setJ.Keys) { $roundTrip[$k] = ($setJ[$k] | ConvertTo-Json -Depth 6 | ConvertFrom-Json) }
$goodJ = Test-Id $roundTrip
Assert-That '신원: JSON 을 읽어 온 객체(시각이 DateTime 일 수 있음)로도 통과한다' ($goodJ.ok -eq $true) ((Codes $goodJ) -join ',')

$mutations = @(
    @{ n = '부모 CIM 기록 없음'; code = 'REQ_PARENT_CIM'; f = { param($s) $s.ParentCim = $null } },
    @{ n = '자식 CIM 기록 없음'; code = 'REQ_CHILD_CIM'; f = { param($s) $s.ChildCim = $null } },
    @{ n = '부모 자기 보고 없음'; code = 'REQ_PARENT_SELF'; f = { param($s) $s.ParentSelf = $null } },
    @{ n = '자식 결과 파일 없음'; code = 'REQ_CHILD_RESULT'; f = { param($s) $s.ChildResult = $null } },
    @{ n = '부모→자식 PID 기록 없음'; code = 'REQ_LINK'; f = { param($s) $s.Link = $null } },
    @{ n = '자식 CIM 소유 SID 가 다르다'; code = 'CHILD_OWNER_SID'; f = { param($s) $s.ChildCim.ownerSid = 'S-1-5-21-9-9-9-500' } },
    @{ n = '부모 CIM 소유 SID 를 읽지 못했다(null)'; code = 'PARENT_OWNER_SID'; f = { param($s) $s.ParentCim.ownerSid = $null } },
    @{ n = '자식 CIM 실행 파일이 기대와 다르다'; code = 'CHILD_EXE_UNEXPECTED'; f = { param($s) $s.ChildCim.exePath = 'C:\Windows\System32\cmd.exe' } },
    @{ n = '자식 자기 보고 PID 가 다르다'; code = 'CHILD_SELF_PID_MISMATCH'; f = { param($s) $s.ChildResult.self.pid = 999 } },
    @{ n = '자식 자기 보고 실행 파일이 다르다'; code = 'CHILD_SELF_EXE_MISMATCH'; f = { param($s) $s.ChildResult.self.exePath = 'C:\Windows\System32\cmd.exe' } },
    @{ n = '자식 자기 보고 SID 가 다르다'; code = 'CHILD_SELF_SID'; f = { param($s) $s.ChildResult.self.sid = 'S-1-5-21-9-9-9-500' } },
    @{ n = '자식 자기 보고 시작 시각이 크게 다르다'; code = 'CHILD_SELF_START_MISMATCH'; f = { param($s) $s.ChildResult.self.startUtc = $t0.AddSeconds(60).ToString('o') } },
    @{ n = '부모 자기 보고 PID 가 다르다'; code = 'PARENT_SELF_PID_MISMATCH'; f = { param($s) $s.ParentSelf.pid = 555 } },
    @{ n = '자식의 부모 PID 가 부모 프로브가 아니다'; code = 'CHILD_NOT_PARENTS_CHILD'; f = { param($s) $s.ChildCim.parentProcessId = 7 } },
    @{ n = '부모가 보고한 자식 PID 가 다르다'; code = 'LINK_CHILD_PID_MISMATCH'; f = { param($s) $s.Link.childPid = 9 } },
    @{ n = '자식 결과 파일의 토큰이 이번 실행이 아니다'; code = 'TOKEN_MISMATCH_CHILD_RESULT'; f = { param($s) $s.ChildResult.runToken = 'old-run' } },
    @{ n = '링크 파일의 토큰이 이번 실행이 아니다'; code = 'TOKEN_MISMATCH_LINK'; f = { param($s) $s.Link.runToken = 'old-run' } },
    @{ n = '부모가 이번 실행 시작 전에 이미 떠 있었다'; code = 'PARENT_STARTED_BEFORE_LAUNCH'; f = { param($s) $s.ParentCim.startUtc = $t0.AddSeconds(-60).ToString('o'); $s.ParentSelf.startUtc = $t0.AddSeconds(-60).ToString('o') } },
    @{ n = '자식이 보고한 종료 시각이 미래다'; code = 'CHILD_END_INVALID'; f = { param($s) $s.ChildResult.endUtc = $t0.AddSeconds(100).ToString('o') } },
    @{ n = '자식이 보고한 종료 시각이 시작보다 이르다'; code = 'CHILD_END_INVALID'; f = { param($s) $s.ChildResult.endUtc = $t0.AddSeconds(-5).ToString('o') } },
    @{ n = '자식이 보고한 종료 시각이 없다'; code = 'CHILD_END_INVALID'; f = { param($s) $s.ChildResult.endUtc = $null } }
)
foreach ($mu in $mutations) {
    $set = New-IdSet
    & $mu.f $set
    $res = Test-Id $set
    Assert-That ("신원: {0} → {1} 로 실패" -f $mu.n, $mu.code) (($res.ok -eq $false) -and ((Codes $res) -contains $mu.code)) ((Codes $res) -join ',')
}

# 이름: 복구가 쓰는 이름은 RunId 에서만 정해진다
$nm = Get-IsoNames -RunId '20261027T101500Z-1a2b3c4d'
Assert-That '이름: 계정은 bsi + 8hex, 설명 표식은 48자 이하' ($nm.UserName -eq 'bsi1a2b3c4d' -and $nm.Marker.Length -le 48 -and $nm.RuleName -eq 'bosang-semgrep-iso-20261027T101500Z-1a2b3c4d-out')

# 실행 기록 변환: JSON → 고칠 수 있는 구조. 원소가 하나인 배열이 풀리지 않아야 한다(복구가 단계 목록을 순회한다).
$plain = ConvertTo-PlainObject -Object ('{"steps":[{"kind":"user","name":"a","detail":{"sid":"S-1-5-21-1-2-3-1005","changed":true}}],"list":[7]}' | ConvertFrom-Json)
Assert-That '실행 기록 변환: 원소 하나짜리 배열이 배열로 남는다' (($plain.steps -is [array]) -and ($plain.steps.Count -eq 1) -and ($plain.list -is [array]) -and ($plain.list.Count -eq 1))
Assert-That '실행 기록 변환: 단계의 detail 을 키로 읽을 수 있다' (($plain.steps[0].detail['sid'] -eq 'S-1-5-21-1-2-3-1005') -and ($plain.steps[0].detail['changed'] -eq $true))

# dry-run 관문: ApplyMode 가 꺼져 있으면 Invoke-Mutation 은 아무것도 실행하지 않는다
$Script:Marker = 0
$ret = Invoke-Mutation -Description '시험: 실행되면 안 된다' -Action { $Script:Marker = 1; 'ran' }
Assert-That 'Invoke-Mutation: ApplyMode=$false 이면 동작을 실행하지 않는다' (($Script:Marker -eq 0) -and ($null -eq $ret))

$fail = @($results | Where-Object { -not $_.pass })
Write-Host ''
Write-Host ("자체 점검: 통과 {0} / 전체 {1}   (엔진 {2})" -f ($results.Count - $fail.Count), $results.Count, $PSVersionTable.PSVersion)
Write-Host '이 통과는 스크립트의 구조·논리가 의도와 같다는 뜻이다. 실제 환경에서 격리가 걸렸다는 뜻이 아니다.'
if ($fail.Count -gt 0) { exit 1 }
exit 0
