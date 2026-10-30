<#
.SYNOPSIS
  LSP-RULES-1 관리자 진입점(Test-LspRulesObservation.ps1)을 모의 시스템과 무해한 스텁으로 끝까지 돌려 보는 시험. 실제 Semgrep 은 실행하지도 임포트하지도 않는다.
.DESCRIPTION
  구성:
   (A) 정적 점검: 구문·BOM·LF·이상한 공백·금지 명령(Invoke-Expression, 내려받기, semgrep 호출), 변경 명령은 Invoke-Mutation 안에서만, 진입점의 순서(dry-run → 수신기 → 감사 창 → 계정 → 복사 → 러너 실행)와 관문 위치.
   (B) 순수 계약(LspRulesAdminContract.ps1)·읽기 전용 포트(LspRulesAdminPorts.ps1) 단위 시험과, 실제 Windows 임시 폴더·정션으로 하는 작업 경로 확인.
   (C) 흐름 시험: 임시 샌드박스에 코드 사본과 모의 시스템(MockSystem + MockSystemLsp + MockPortsLsp + MockSystemRules + MockPortsRules)을 끼워 넣고, 적용(Initialize-Isolation.ps1 -Apply) 뒤 진입점을 자식 프로세스로 실행한다.
       계정·방화벽·감사 정책·ACL·Security 로그는 모의라서 진짜 시스템은 읽지도 바꾸지도 않는다. 러너는 stub 모드일 때에 한해 **현재 사용자로** 진짜 러너(lsp-rules-runner.ps1)와 스텁 서버(lsp-rules-stub.ps1)를 띄운다.
       semgrep-lsp 모드 요청은 모의가 예외로 막는다. 정상, dry-run, 서버를 띄우지 못한 경우(NOT_ATTEMPTED), 띄운 뒤의 신원·결합·토큰·해시 실패(NOT_OBSERVED), 수신기 적중·읽기 실패, 프로브 해시(원본·복사 직후·실행 뒤·관리자 재확인),
       감시 폴더 변경, 이전 배치 정리와 링크 거부, 정리 부분 실패(종료 70), 5157 불확실성, 설치물 해시 변경, 실제 모드 사전 조건과 거절(종료 30)을 포함한다.
   (D) TS ↔ PS 일치: 관리자 문맥을 PS 계약 함수로 만들어 실제 TS 재해석 CLI 에 넣고 판정이 같은지 본다(-TsxCmd 가 있을 때만).
   (E) 진짜 시스템 상태 불변 확인: 시험 전후에 읽기 전용으로 전용 계정(bsi*)·방화벽 규칙(bosang-semgrep-iso*)·감사 값·작업 폴더 루트를 비교한다.
  TS 재해석이 필요한 사례는 -TsxCmd(와 -NodeDir)가 있을 때만 판정 전체를 확인한다. 없으면 그 사례는 SKIPPED 로 표시하고 통과로 세지 않는다.
  이 시험의 통과는 "합성 환경에서 진입점의 감독·결합·판정·정리가 의도대로 동작한다"까지만 뜻한다. 실제 Semgrep·전용 계정·방화벽·감사·ACL 아래의 동작은 뜻하지 않는다.
.EXAMPLE
  pwsh -NoProfile -File .\tests\Test-LspRulesAdmin.ps1 -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -NodeDir C:\node
  pwsh -NoProfile -File .\tests\Test-LspRulesAdmin.ps1 -Engine powershell -TsxCmd ... -NodeDir ... (안쪽 엔진을 5.1 로)
  pwsh -NoProfile -File .\tests\Test-LspRulesAdmin.ps1 -Only static,unit -TsxCmd ...  (일부 구역만)
#>
[CmdletBinding()]
param(
    [string]$CodeDir,
    [ValidateSet('pwsh', 'powershell')][string]$Engine = 'pwsh',
    [string[]]$Only = @(),
    [string]$TsxCmd,
    [string]$NodeDir,
    [string]$ReinterpretCli,
    [string]$ProbeFile,
    [switch]$SkipRealStateCheck,
    [switch]$KeepSandbox
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

if ($Engine -eq 'pwsh') {
    $c = Get-Command pwsh -ErrorAction SilentlyContinue
    $EnginePath = $(if ($c) { $c.Source } else { Join-Path $PSHOME 'pwsh.exe' })
    if (-not (Test-Path -LiteralPath $EnginePath)) { $EnginePath = 'C:\Program Files\PowerShell\7\pwsh.exe' }
} else { $EnginePath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe' }
# 5.1 에서는 param 기본값 안의 $PSScriptRoot 가 비어 있다. 본문에서 정한다.
if (-not $CodeDir) { $CodeDir = Split-Path -Parent $PSScriptRoot }
$CodeDir = (Resolve-Path -LiteralPath $CodeDir).Path
$TsDir = (Resolve-Path -LiteralPath (Join-Path $CodeDir '..\..\semgrep-lsp')).Path
if (-not $ReinterpretCli) { $ReinterpretCli = Join-Path $TsDir 'lsp-rules-reinterpret-cli.ts' }
if (-not $ProbeFile) { $ProbeFile = Join-Path $TsDir 'data\lsp-rules-1-probe.yaml' }
$RunId = '20261029T120000Z-0a1b2c3d'
$UserName = 'bsi0a1b2c3d'
$FpcGuid = '{0CCE9226-69AE-11D9-BED3-505054503030}'
$Utf8 = New-Object Text.UTF8Encoding($false)
$RealSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$Results = New-Object System.Collections.ArrayList
$Sandboxes = New-Object System.Collections.ArrayList
$toolsReady = [bool]($TsxCmd -and (Test-Path -LiteralPath $TsxCmd) -and (Test-Path -LiteralPath $ReinterpretCli))
$Script:Control = $null

function Assert-That {
    param([string]$Case, [string]$Name, [bool]$Cond, [string]$Detail = '')
    [void]$Results.Add([ordered]@{ case = $Case; name = $Name; pass = $Cond; detail = $Detail })
    if (-not $Cond) { Write-Host ("  FAIL  [{0}] {1}  {2}" -f $Case, $Name, $Detail) -ForegroundColor Red }
}
function Skip-That { param([string]$Case, [string]$Why) [void]$Results.Add([ordered]@{ case = $Case; name = 'SKIPPED'; pass = $null; detail = $Why }); Write-Host ("  SKIPPED [{0}] {1}" -f $Case, $Why) -ForegroundColor Yellow }
function Get-Prop {
    param($Object, [string]$Path)
    $cur = $Object
    foreach ($seg in $Path.Split('.')) {
        if ($null -eq $cur) { return $null }
        $p = $cur.PSObject.Properties[$seg]
        if (-not $p) { return $null }
        $cur = $p.Value
    }
    $cur
}
function Test-Selected { param([string]$Id) ($Only.Count -eq 0) -or ($Only -contains $Id) }
function Limit-Text { param([string]$Text, [int]$Max = 400) if ($Text.Length -le $Max) { $Text } else { $Text.Substring(0, $Max) + '...' } }

# 진짜 시스템 상태 스냅샷(읽기 전용): 전용 계정(bsi*), 방화벽 규칙(bosang-semgrep-iso*), 감사 값 둘, 작업 폴더 루트. 시험이 이 중 어느 것도 바꾸지 않는지 전후로 비교한다.
function Get-RealStateSnapshot {
    $s = [ordered]@{}
    try { $s.users = (@(Get-LocalUser -ErrorAction Stop | Where-Object { $_.Name -like 'bsi*' } | ForEach-Object { $_.Name + ':' + $_.Enabled }) -join ',') } catch { $s.users = 'UNREADABLE' }
    try { $s.rules = (@(Get-NetFirewallRule -ErrorAction Stop | Where-Object { $_.Name -like 'bosang-semgrep-iso*' } | ForEach-Object { $_.Name }) -join ',') } catch { $s.rules = 'UNREADABLE' }
    $ap = Join-Path $env:WINDIR 'System32\auditpol.exe'
    foreach ($g in '{0CCE9226-69AE-11D9-BED3-505054503030}', '{0CCE922B-69AE-11D9-BED3-505054503030}') {
        try { $o = & $ap /get "/subcategory:$g" /r 2>&1 | Out-String; $line = ($o -split "`n" | Where-Object { $_ -match ',' } | Select-Object -Last 1); $s["audit$g"] = $(if ($line) { $line.Trim() } else { 'UNREADABLE' }) } catch { $s["audit$g"] = 'UNREADABLE' }
    }
    $pd = Join-Path $env:ProgramData 'bosang-semgrep-iso'
    $s.programDataRoot = $(if (Test-Path -LiteralPath $pd) { 'EXISTS:' + ((@(Get-ChildItem -LiteralPath $pd -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) | Sort-Object) -join ',') } else { 'ABSENT' })
    $s
}
$realBefore = $null
if (-not $SkipRealStateCheck) { $realBefore = Get-RealStateSnapshot }

# 폴더 트리의 지문(경로·크기·SHA-256). 링크 대상 폴더가 시험 전후로 같은지 비교하는 데 쓴다. 대상 폴더 안에는 링크를 두지 않는다. 해시는 .NET 으로 잰다.
function Get-TreePrint {
    param([string]$Dir)
    if (-not (Test-Path -LiteralPath $Dir)) { return 'ABSENT' }
    $items = @(Get-ChildItem -LiteralPath $Dir -Recurse -Force -ErrorAction Stop | Sort-Object FullName)
    (@($items | ForEach-Object { $rel = $_.FullName.Substring($Dir.Length); if ($_.PSIsContainer) { 'D|' + $rel } else { 'F|' + $rel + '|' + $_.Length + '|' + (Get-LrSha256Hex ([IO.File]::ReadAllBytes($_.FullName))) } })) -join "`n"
}
function Remove-LinksUnder {
    param([string]$Dir)
    if (Test-Path -LiteralPath $Dir) {
        foreach ($i in @(Get-ChildItem -LiteralPath $Dir -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })) { try { if ($i.PSIsContainer) { [IO.Directory]::Delete($i.FullName) } else { [IO.File]::Delete($i.FullName) } } catch { } }
    }
}

# 불러오기: 진입점이 쓰는 것과 같은 순서
. (Join-Path $CodeDir 'IsolationCommon.ps1')
. (Join-Path $CodeDir 'LspRulesContract.ps1')
. (Join-Path $CodeDir 'LspMinAdminContract.ps1')
. (Join-Path $CodeDir 'LspRulesAdminContract.ps1')

$mutatingCmdlets = @(
    'New-LocalUser', 'Remove-LocalUser', 'Enable-LocalUser', 'Disable-LocalUser', 'Set-LocalUser', 'Add-LocalGroupMember', 'Remove-LocalGroupMember',
    'New-NetFirewallRule', 'Set-NetFirewallRule', 'Remove-NetFirewallRule', 'Enable-NetFirewallRule', 'Disable-NetFirewallRule', 'Set-NetFirewallProfile', 'Set-NetFirewallSetting',
    'Set-Acl', 'Remove-Item', 'Copy-Item', 'Move-Item', 'Rename-Item', 'New-Item', 'Set-Content', 'Add-Content', 'Out-File', 'Clear-Content',
    'Start-Process', 'Stop-Process', 'Remove-CimInstance', 'Set-ItemProperty', 'New-ItemProperty', 'Remove-ItemProperty', 'Set-Service', 'Stop-Service', 'Start-Service', 'Register-ScheduledTask', 'Unregister-ScheduledTask'
)
$dotNetWrites = '^(WriteAllText|WriteAllBytes|AppendAllText|AppendAllLines|WriteAllLines|Delete|Move|Copy|Replace|Create|CreateDirectory|SetAccessControl)$'
function Test-InsideCommand($Node, [string]$Name) {
    $p = $Node.Parent
    while ($p) { if ($p -is [Management.Automation.Language.CommandAst] -and $p.GetCommandName() -eq $Name) { return $true }; $p = $p.Parent }
    $false
}
function Get-CommandNames($Ast) { @($Ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | ForEach-Object { $_.GetCommandName() } | Where-Object { $_ } | Select-Object -Unique) }

# ═══ (A) 정적 점검 ═══════════════════════════════════════════════════════════
if (Test-Selected 'static') {
    Write-Host '[static] 구문·BOM·LF·금지 명령·변경 관문·진입점 구조'
    $product = @('LspRulesAdminContract.ps1', 'LspRulesAdminPorts.ps1', 'Test-LspRulesObservation.ps1')
    $allFiles = $product + @('tests\MockSystemRules.ps1', 'tests\MockPortsRules.ps1', 'tests\Test-LspRulesAdmin.ps1')
    $forbiddenCmd = @('Invoke-Expression', 'iex', 'Invoke-WebRequest', 'Invoke-RestMethod', 'Start-BitsTransfer', 'curl', 'wget')
    $sAst = @{}; $sSrc = @{}
    foreach ($f in $allFiles) {
        $p = Join-Path $CodeDir $f
        if (-not (Test-Path -LiteralPath $p)) { Assert-That 'static' "파일 있음 ($f)" $false $p; continue }
        $errs = $null; $tokens = $null
        $ast = [Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errs)
        Assert-That 'static' "구문 $f ($($PSVersionTable.PSVersion))" ($errs.Count -eq 0) (($errs | ForEach-Object { "$($_.Message)@$($_.Extent.StartLineNumber)" }) -join '; ')
        $sAst[$f] = $ast
        $b = [IO.File]::ReadAllBytes($p)
        Assert-That 'static' "BOM $f" ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) 'Windows PowerShell 5.1 이 한글을 읽으려면 UTF-8 BOM 이 필요하다'
        $text = [Text.Encoding]::UTF8.GetString($b, 3, $b.Length - 3)
        $sSrc[$f] = $text
        Assert-That 'static' "줄바꿈이 LF 뿐이다 ($f)" (-not $text.Contains("`r"))
        $odd = [regex]::Matches($text, '[\u0085\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]')
        Assert-That 'static' "이상한 유니코드 공백·줄 끝 문자(NBSP, U+2028/2029, U+FEFF 등)가 본문에 없다 ($f)" ($odd.Count -eq 0) "count=$($odd.Count)"
        $hits = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | Where-Object {
                $nm = $_.GetCommandName(); $first = $_.CommandElements[0].Extent.Text.Trim('"', "'")
                ($nm -and ($forbiddenCmd -contains $nm -or $nm -match '(?i)^(semgrep|pysemgrep|semgrep-core)(\.exe)?$')) -or ($first -match '(?i)(^|[\\/])(semgrep|pysemgrep|semgrep-core)(\.exe)?$')
            } | ForEach-Object { $_.Extent.Text.Split("`n")[0].Trim() })
        Assert-That 'static' "내려받기·Invoke-Expression·semgrep 명령 호출 없음 ($f)" ($hits.Count -eq 0) ($hits -join ' | ')
    }
    # 변경 명령은 Invoke-Mutation 안에서만. 계약·포트에는 변경 명령도 파일 쓰기도 없다(읽기 전용).
    $entry = 'Test-LspRulesObservation.ps1'
    if ($sAst.ContainsKey($entry)) {
        $bad = New-Object System.Collections.ArrayList
        foreach ($c in $sAst[$entry].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
            $name = $c.GetCommandName()
            if ($name -eq 'Invoke-Mutation') { continue }
            if ($name -and ($mutatingCmdlets -contains $name) -and -not (Test-InsideCommand $c 'Invoke-Mutation')) { [void]$bad.Add(("{0}@{1}" -f $c.Extent.Text.Split("`n")[0].Trim(), $c.Extent.StartLineNumber)) }
        }
        Assert-That 'static' '진입점: 상태 변경 명령은 Invoke-Mutation 안에서만' ($bad.Count -eq 0) ($bad -join ' | ')
        $badIo = New-Object System.Collections.ArrayList
        foreach ($m in $sAst[$entry].FindAll({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Static }, $true)) {
            if ($m.Expression.Extent.Text -notmatch '(?i)^\[(System\.)?IO\.(File|Directory)\]$') { continue }
            if ($m.Member.Extent.Text -notmatch $dotNetWrites) { continue }
            if (-not (Test-InsideCommand $m 'Invoke-Mutation')) { [void]$badIo.Add(("{0}@{1}" -f $m.Extent.Text.Split("`n")[0].Trim(), $m.Extent.StartLineNumber)) }
        }
        Assert-That 'static' '진입점: .NET 파일 쓰기·삭제는 Invoke-Mutation 안에서만' ($badIo.Count -eq 0) ($badIo -join ' | ')
    }
    foreach ($f in 'LspRulesAdminContract.ps1', 'LspRulesAdminPorts.ps1') {
        if (-not $sAst.ContainsKey($f)) { continue }
        $mut = @((Get-CommandNames $sAst[$f]) | Where-Object { $mutatingCmdlets -contains $_ })
        $io = @($sAst[$f].FindAll({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Static -and $n.Expression.Extent.Text -match '(?i)IO\.(File|Directory)' }, $true) | Where-Object { $_.Member.Extent.Text -match $dotNetWrites })
        Assert-That 'static' "읽기 전용: 변경 명령도 .NET 파일 쓰기·삭제도 없다 ($f)" (($mut.Count -eq 0) -and ($io.Count -eq 0)) ((@($mut) + @($io | ForEach-Object { $_.Extent.Text })) -join ' | ')
        $fh = @((Get-CommandNames $sAst[$f]) | Where-Object { $_ -eq 'Get-FileHash' })
        Assert-That 'static' "안전과 관련된 해시는 Get-FileHash 모듈에 기대지 않고 .NET 으로 잰다 ($f)" ($fh.Count -eq 0)
    }
    # 계약 파일: 최상위는 대입과 함수 정의뿐이고, 부르는 명령이 허용 목록뿐이다(파일·프로세스·네트워크·계정 접근 없음).
    if ($sAst.ContainsKey('LspRulesAdminContract.ps1')) {
        $ca = $sAst['LspRulesAdminContract.ps1']
        $top = @($ca.EndBlock.Statements | Where-Object { $_ -isnot [Management.Automation.Language.AssignmentStatementAst] -and $_ -isnot [Management.Automation.Language.FunctionDefinitionAst] })
        Assert-That 'static' '계약 파일: 최상위는 대입과 함수 정의뿐이다(불러오는 것만으로 실행되는 것이 없다)' ($top.Count -eq 0) (($top | ForEach-Object { $_.Extent.Text.Split("`n")[0].Trim() }) -join ' | ')
        $own = @($ca.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true) | ForEach-Object { $_.Name })
        $allowedCmds = @('New-Object', 'ForEach-Object', 'Where-Object', 'Sort-Object', 'Select-Object', 'Get-LmProp', 'Get-LspMinAdminProp', 'ConvertTo-LspMinSha256', 'ConvertTo-UtcDate', 'Get-LrLayout', 'Get-LrProbePath', 'Get-LrSha256Hex', 'Get-LrStaticRefusals', 'Test-LrRootViolation', 'ConvertTo-LrJsLower', 'Test-LspMinResultBinding', 'Test-LrOrdinalEqual', 'Test-LrOrdinalIn')
        $extra = @((Get-CommandNames $ca) | Where-Object { ($allowedCmds + $own) -notcontains $_ })
        Assert-That 'static' '계약 파일: 부르는 명령이 허용 목록(순수 계약 함수들)뿐이다' ($extra.Count -eq 0) ($extra -join ', ')
        $st = @($ca.FindAll({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Static -and $n.Expression.Extent.Text -match '(?i)IO\.File|IO\.Directory|Diagnostics|Net\.|Environment|Reflection|Activator' }, $true))
        Assert-That 'static' '계약 파일: 파일·프로세스·네트워크·환경을 만지는 정적 .NET 호출이 없다' ($st.Count -eq 0) (($st | ForEach-Object { $_.Extent.Text }) -join ' | ')
    }
    # 이름·값의 금지: 로그 소스 환경변수·토큰 이름·버전 확인 환경변수·핀/검증 표지/ADR 를 가리키지 않고, 프로브 해시 값을 코드에 따로 적지 않는다(계약 한 곳이 원본이다).
    foreach ($f in $product) {
        if (-not $sAst.ContainsKey($f)) { continue }
        $strs = @($sAst[$f].FindAll({ param($n) $n -is [Management.Automation.Language.StringConstantExpressionAst] -or $n -is [Management.Automation.Language.ExpandableStringExpressionAst] }, $true))
        $nameBad = @($strs | Where-Object { $_.Extent.Text -match 'SEMGREP_LOG_SRCS|SEMGREP_APP_TOKEN|SEMGREP_ENABLE_|GITHUB_TOKEN|HTTPS?_PROXY' })
        Assert-That 'static' "코드 문자열에 SEMGREP_LOG_SRCS·토큰·SEMGREP_ENABLE_* 이름이 없다 (소유자 결정 D5) ($f)" ($nameBad.Count -eq 0) (($nameBad | ForEach-Object { "$($_.Extent.Text)@$($_.Extent.StartLineNumber)" }) -join ' | ')
        $stateBad = @($strs | Where-Object { $_.Extent.Text -match '(?i)pin\.json|policy_accepted|(?<![A-Za-z])verified(?![A-Za-z])|lsp-security-source|decisions[\\/]' })
        Assert-That 'static' "핀 파일·검증 표지·정책 수락·ADR 을 가리키지 않는다 ($f)" ($stateBad.Count -eq 0) (($stateBad | ForEach-Object { "$($_.Extent.Text)@$($_.Extent.StartLineNumber)" }) -join ' | ')
        Assert-That 'static' "프로브 해시 값을 코드에 따로 적지 않는다(계약의 상수만 쓴다) ($f)" (-not $sSrc[$f].Contains('d5089fdeb3c8'))
    }
    # 진입점의 순서와 구조
    if ($sSrc.ContainsKey($entry)) {
        $src = $sSrc[$entry]
        $ix = { param([string]$s, [int]$from = 0) $src.IndexOf($s, $from, [StringComparison]::Ordinal) }
        $apply = & $ix '$Script:ApplyMode = $Execute'; $dry = & $ix 'if (-not $Execute) {'
        $order = @('$receiver = New-LspMinReceiver', 'Open-IsoAuditWindow -Guid', 'Enable-LocalUser -Name', 'Copy-Item -LiteralPath $src', 'Start-Process -FilePath $Script:Ps51') | ForEach-Object { & $ix $_ ([Math]::Max(0, $dry)) }
        Assert-That 'static' '진입점: -Execute 없이는 수신기·감사 창·계정·복사·러너 실행보다 앞에서 돌아오고, 그 앞에서 ApplyMode 를 정한다' (($dry -gt 0) -and ($apply -ge 0) -and ($apply -lt $dry) -and (@($order | Where-Object { $_ -lt 0 }).Count -eq 0)) "order=$($order -join ',') dry=$dry apply=$apply"
        Assert-That 'static' '진입점: 수신기 → 감사 창 → 계정 켜기 → 러너 복사 → 러너 실행 순서다 (수신기가 자식보다 먼저)' (($order[0] -lt $order[1]) -and ($order[1] -lt $order[2]) -and ($order[2] -lt $order[3]) -and ($order[3] -lt $order[4])) "order=$($order -join ',')"
        $starts = @($sAst[$entry].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Start-Process' }, $true))
        Assert-That 'static' '진입점: 프로세스를 띄우는 곳은 전용 계정(-Credential)으로 Windows PowerShell 5.1 러너를 띄우는 한 곳뿐이다' (($starts.Count -eq 1) -and ($starts[0].Extent.Text -match '-FilePath \$Script:Ps51') -and ($starts[0].Extent.Text -match '-Credential \$cred') -and $src.Contains("lsp-rules-runner.ps1')"))
        Assert-That 'static' '진입점: 서버와 직접 이야기하지 않는다(표준 입력·네트워크 스트림·콘솔 스트림 열기가 없다) — 보내는 일은 러너가 한다' ($src -notmatch 'StandardInput|NetworkStream|GetStream\(\)|OpenStandard|\.Write\(' )
        $g1 = & $ix '$gate1 = Get-LrAdminWorkSafetyProblems'; $g2 = & $ix '$gate2 = Get-LrAdminWorkSafetyProblems'; $rcv = & $ix '$receiver = New-LspMinReceiver'
        $rmTree = & $ix 'Remove-Item -LiteralPath $rulesWork -Recurse'; $rmFile = & $ix 'Remove-Item -LiteralPath $ap -Force'; $enable = & $ix 'Enable-LocalUser -Name'; $mkWork = & $ix '작업 폴더 만들기'; $cp = & $ix 'Copy-Item -LiteralPath $src'
        Assert-That 'static' '진입점: 작업 경로 확인이 첫 삭제·수신기보다 앞(관문 1)에, 계정을 켠 뒤 첫 작업 폴더 만들기·복사보다 앞(관문 2)에 있다. 이전 배치 삭제는 관문 1 뒤·계정 켜기 앞이다' (($g1 -gt 0) -and ($g1 -lt $rcv) -and ($g1 -lt $rmFile) -and ($rmFile -lt $rmTree) -and ($rmTree -lt $enable) -and ($enable -lt $g2) -and ($g2 -lt $mkWork) -and ($mkWork -lt $cp)) "g1=$g1 rcv=$rcv rmFile=$rmFile rmTree=$rmTree enable=$enable g2=$g2 mk=$mkWork cp=$cp"
        Assert-That 'static' '진입점: 신뢰 루트는 names.WorkDir 이고, 중단 파일은 신뢰 루트를 주고 쓰며, 새 쓰기 목적지 확인은 Get-LrAdminWorkSafetyProblems 한 곳이다(사전 조건 T08 포함)' (($src -match '\$trustedRoot = \$names\.WorkDir') -and ($src -match 'Write-LspMinAbortFile -Path \$abortFile -Text \$Text -TrustedRoot \$trustedRoot') -and ($src -match "& \`$addPre 'T08'") -and ($src -notmatch 'Find-LspMinReparseInTree'))
        $fin = & $ix '} finally {'
        Assert-That 'static' '진입점: 사후 사실 읽기(설치물 해시·프로브 재확인)·관리자 문맥 만들기·재해석 도구 호출은 모두 정리(finally) 뒤에 있다' (($fin -gt 0) -and ((& $ix 'Get-LrAdminAfterRunState -TrustedRoot') -gt $fin) -and ((& $ix 'New-LrAdminContext -RunId') -gt $fin) -and ((& $ix 'Invoke-LspMinReinterpret -TsxCmd') -gt $fin) -and ((& $ix 'Get-LrAdminArtifactHashes -Paths $artifactPaths' $fin) -gt $fin))
        Assert-That 'static' '진입점: 한도는 늘릴 수 없다 — 실제 모드는 계약 값 그대로만 받고, 스텁 모드는 1 이상 계약 상한 이하만 받는다. 기동 허용·감독 유예도 실제 모드는 고정이다' (($src -match '\[int\]\$Limits\[\$k\] -ne \[int\]\$Script:LrLimits\[\$k\]') -and ($src -match '\$v -gt \[double\]\$Script:LrLimits\[\$k\]') -and ($src -match '\$StartAllowanceMs -ne \$Script:LspMinAdminStartAllowanceMs -or \$SupervisorGraceMs -ne \$Script:LspMinAdminSupervisorGraceMs'))
        Assert-That 'static' '진입점: 감독 루프는 순수 결정 함수로 마감을 판단하고(REQUEST_ABORT·FORCE_KILL·GIVE_UP), 프로세스 표는 제한 시간이 있는 포트로만 읽는다' (($src -match 'Get-LspMinSupervisorAction -ElapsedMs') -and ($src -match "-eq 'REQUEST_ABORT'") -and ($src -match "-eq 'FORCE_KILL'") -and ($src -match "-eq 'GIVE_UP'") -and ($src -match 'Get-LspMinCimTable -TimeoutSec') -and ($src -notmatch 'Get-CimInstance|Invoke-CimMethod|Get-ProcessRecord'))
        Assert-That 'static' '진입점: 수신기 읽기 실패·적중·마감·취소는 A3:RECEIVER_UNREADABLE·A3:RECEIVER_HIT·A7:SUPERVISOR_DEADLINE·A7:OPERATOR_CANCEL 로 전달하고, 전달 실패는 전용 계정 프로세스를 직접 끝낸다' (($src -match 'A3:RECEIVER_UNREADABLE') -and ($src -match 'A3:RECEIVER_HIT') -and ($src -match 'A7:SUPERVISOR_DEADLINE') -and ($src -match 'A7:OPERATOR_CANCEL') -and ($src -match "& \`$forceKill 'ABORT_DELIVERY_FAILED'") -and ($src -match "EndsWith\('\\' \+ \`$uname"))
        $cleanNames = @("'listener-stop'", "'process-cleanup'", "'account-disable'", "('audit-restore '") | ForEach-Object { $src.IndexOf("Invoke-IsoCleanupStep -Name $_", $fin, [StringComparison]::Ordinal) }
        Assert-That 'static' '진입점: finally 에서 수신기 정지·프로세스 정리·계정 비활성화·감사 복구를 각각 Invoke-IsoCleanupStep 으로 독립 실행한다' (@($cleanNames | Where-Object { $_ -lt 0 }).Count -eq 0)
        Assert-That 'static' '진입점: 관측·프로세스 정리·시스템 복구를 보고서의 따로 된 항목으로 적고, 종료 코드는 Get-LspMinAdminExitCode 한 곳이 정한다. 5157 은 Get-LspMinOsBlockCounts 를 거쳐 0 으로 채우지 않는다' (($src -match '\$report\.observation = ') -and ($src -match '\$report\.processCleanup = \$groups\.processCleanup') -and ($src -match '\$report\.systemRecovery = \$groups\.systemRecovery') -and ($src -match 'Get-LspMinAdminExitCode -Established') -and ($src -match 'Get-LspMinOsBlockCounts -CollectionOk'))
        Assert-That 'static' '진입점: 재해석 도구 호출에 취소 표지를 주고, 도구 뒤처리는 process-reinterpret-tool 항목으로 프로세스 정리 묶음에 넣는다' (($src -match 'Invoke-LspMinReinterpret -TsxCmd \$TsxCmd [^\r\n]*-CancelFile \$CancelFile') -and ($src -match "Invoke-IsoCleanupStep -Name 'process-reinterpret-tool'"))
        Assert-That 'static' '진입점: 설치물 해시 대조는 읽지 못한 값을 같다고 하지 않는 함수(Test-LrAdminHashesUnchanged)만 쓴다. 문자열 비교(-ne [string])로 직접 비교하지 않는다' (($src -match 'Test-LrAdminHashesUnchanged -Before \$hashesBefore -After \$hashesAfter') -and ($src -notmatch '\[string\]\$hashesBefore\[\$k\]'))
        # 방화벽 규칙 확인(T04)은 기준 점검기(IsolationBaselineCore.ps1)의 Verify 와 같은 판정 함수·같은 읽기 포트를 쓴다. 약한 부분 문자열 대조와 규칙 명령 직접 호출이 없다.
        $coreText = [IO.File]::ReadAllText((Join-Path $CodeDir 'IsolationBaselineCore.ps1'), [Text.Encoding]::UTF8)
        $coreAst = [Management.Automation.Language.Parser]::ParseInput($coreText, [ref]$null, [ref]$null)
        $verifyPlanFn = @($coreAst.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'New-BlVerifyPlan' }, $true))
        $contractDefs = 0; foreach ($f in $product + @('IsolationBaselineCore.ps1')) { $fp = Join-Path $CodeDir $f; if (Test-Path -LiteralPath $fp) { $contractDefs += [regex]::Matches([IO.File]::ReadAllText($fp, [Text.Encoding]::UTF8), '(?m)^function Test-BlRunRuleContract\b').Count } }
        $t04At = $src.IndexOf('Test-BlRunRuleContract -Line', [StringComparison]::Ordinal); $rcvAt = & $ix '$receiver = New-LspMinReceiver'
        Assert-That 'static' '진입점: T04 는 Core 를 불러와 Read-BlFirewallRuleByName 으로 읽고 Test-BlRunRuleContract 로 대조한다. 계정 범위를 .Contains($sid) 로 대조하거나 방화벽 명령을 직접 부르지 않으며, 수신기보다 앞이다' (($src -match "IsolationBaselineCore\.ps1'\)") -and ($src -match "Invoke-BlPort -Name 'Read-BlFirewallRuleByName'") -and ($t04At -gt 0) -and ($t04At -lt $rcvAt) -and ($src -notmatch '\.Contains\(\$sid\)') -and ($src -notmatch 'Get-NetFirewall'))
        Assert-That 'static' 'Core: 적용 직후 직접 확인(New-BlVerifyPlan)도 같은 Test-BlRunRuleContract 를 부르고, 부분 문자열 대조(.Contains($sid))가 없으며, 판정 함수 정의는 저장소에 한 곳뿐이다' (($verifyPlanFn.Count -eq 1) -and ($verifyPlanFn[0].Extent.Text -match 'Test-BlRunRuleContract -Line') -and ($coreText -notmatch '\.Contains\(\$sid\)') -and ($contractDefs -eq 1)) "defs=$contractDefs plan=$($verifyPlanFn.Count)"
    }
}

# ═══ (B) 순수 계약·읽기 전용 포트 단위 시험 ═══════════════════════════════════
$bt = [char]96
$probeBytes = $null; if (Test-Path -LiteralPath $ProbeFile) { $probeBytes = [IO.File]::ReadAllBytes($ProbeFile) }
if (Test-Selected 'unit') {
    Write-Host '[unit] 순수 계약'
    $H = 'a' * 64
    Assert-That 'unit' '한도 이름은 열 개이고 러너 계약의 한도 이름과 같다(장벽 한도·장벽 뒤 감시 포함)' (($Script:LrAdminLimitNames.Count -eq 10) -and ($Script:LrAdminLimitNames -contains 'rulesMs') -and ($Script:LrAdminLimitNames -contains 'settleMs') -and ((@($Script:LrAdminLimitNames | Sort-Object) -join ',') -ceq (@($Script:LrLimits.Keys | Sort-Object) -join ',')))
    Assert-That 'unit' '장벽 한도 60000, 장벽 뒤 감시 2000, 전체 150000 (소유자 결정 D6)' (($Script:LrLimits.rulesMs -eq 60000) -and ($Script:LrLimits.settleMs -eq 2000) -and ($Script:LrLimits.totalMs -eq 150000))
    # 문자열 목록 변환
    Assert-That 'unit' '문자열 목록: $null 은 빈 목록이고(원소 하나짜리가 아니다), 스칼라는 원소 하나, 빈 문자열은 버린다' (((ConvertTo-LrAdminList $null).Count -eq 0) -and ((ConvertTo-LrAdminList 'x').Count -eq 1) -and ((ConvertTo-LrAdminList @('a', '', $null, 'b')).Count -eq 2))
    # 작업 목적지
    $tg = Get-LrAdminWorkTargets -WorkDir 'C:\W\work' -RulesWork 'C:\W\work\lsp-rules'
    $needed = @('C:\W\work', 'C:\W\work\lsp-rules', 'C:\W\work\lsp-rules\lsp-state', 'C:\W\work\lsp-rules\ws', 'C:\W\work\lsp-rules\lsp-state\rules-probe', 'C:\W\work\lsp-rules\lsp-state\home', 'C:\W\work\lsp-rules\lsp-state\tmp', 'C:\W\work\lsp-rules\lsp-state\rules-probe\lsp-rules-1-probe.yaml', 'C:\W\work\lsp-rules-request.json', 'C:\W\work\lsp-rules-result.json', 'C:\W\work\lsp-rules-result.json.tmp', 'C:\W\work\lsp-rules-abort.flag', 'C:\W\work\lsp-rules-runner.ps1', 'C:\W\work\LspRulesContract.ps1', 'C:\W\work\lsp-min-runner.ps1', 'C:\W\work\LspMinContract.ps1', 'C:\W\work\version-runner.ps1', 'C:\W\work\lsp-rules-stub.ps1')
    Assert-That 'unit' '목적지 목록: 작업 폴더·작업 배치·상태 폴더들·규칙 폴더·프로브 자리·지우는 파일 넷·복사 파일 여섯을 모두 담는다(18개)' (($tg.Count -eq 18) -and (@($needed | Where-Object { $tg -notcontains $_ }).Count -eq 0)) ((@($needed | Where-Object { $tg -notcontains $_ })) -join ',')
    # 프로브 바이트
    if ($null -eq $probeBytes) { Skip-That 'unit' "프로브 규칙 원본이 없어 바이트 검사를 하지 못했다: $ProbeFile" }
    else {
        $pt = Test-LrAdminProbeBytes $probeBytes
        Assert-That 'unit' '프로브: 저장소의 원본은 233바이트이고 고정 sha256 과 같다' ($pt.ok -and $pt.size -eq 233 -and $pt.sha256 -ceq $Script:LrProbeSha256) ($pt.problems -join ',')
        $flip = [byte[]]$probeBytes.Clone(); $flip[0] = $flip[0] -bxor 1
        Assert-That 'unit' '프로브: 한 바이트만 달라도 PROBE_HASH_MISMATCH' ((-not (Test-LrAdminProbeBytes $flip).ok) -and ((Test-LrAdminProbeBytes $flip).problems -contains 'PROBE_HASH_MISMATCH'))
        Assert-That 'unit' '프로브: 크기가 다르면 PROBE_SIZE_MISMATCH' (((Test-LrAdminProbeBytes ([byte[]]($probeBytes + [byte]10))).problems) -contains 'PROBE_SIZE_MISMATCH')
        Assert-That 'unit' '프로브: $null·빈 배열·문자열은 PROBE_BYTES_MISSING 또는 불일치이고 ok 가 아니다' ((-not (Test-LrAdminProbeBytes $null).ok) -and (-not (Test-LrAdminProbeBytes ([byte[]]@())).ok) -and ((Test-LrAdminProbeBytes 'text').problems -contains 'PROBE_BYTES_MISSING'))
    }
    # 해시 합치기: 읽지 못한 값은 일치가 아니다
    $E = $Script:LrProbeSha256; $X = 'e' * 64
    Assert-That 'unit' '해시 합치기: 둘 다 유효하고 같으면 그 값(대문자는 소문자로)' ((Resolve-LrAdminHash $E $E $E) -ceq $E -and (Resolve-LrAdminHash $E $E $E.ToUpperInvariant()) -ceq $E)
    foreach ($case in @(@('둘 다 $null', $null, $null), @('하나가 $null', $E, $null), @('다른 하나가 $null', $null, $E), @('둘 다 빈 문자열', '', ''), @('빈 문자열과 유효한 값', '', $E), @('16진수가 아닌 값끼리', 'zz', 'zz'), @('짧은 해시끼리 같음', 'abcd', 'abcd'), @('오류 문구끼리 같음', 'ERR', 'ERR'))) {
        Assert-That 'unit' "해시 합치기: $($case[0]) 이면 `$null (모르는 값은 다른 모르는 값과도, 유효한 값과도 같지 않다)" ($null -eq (Resolve-LrAdminHash $E $case[1] $case[2]))
    }
    Assert-That 'unit' '해시 합치기: 둘 다 유효하지만 다르면 기대값이 아닌 쪽을 돌려준다(어느 쪽 순서든 일치로 읽히지 않는다)' (((Resolve-LrAdminHash $E $E $X) -ceq $X) -and ((Resolve-LrAdminHash $E $X $E) -ceq $X) -and ((Resolve-LrAdminHash $E $X ('d' * 64)) -cne $E))
    # 설치물 해시 대조
    $keys = @('a1', 'b2')
    $same = [ordered]@{ a1 = $H; b2 = ('b' * 64) }
    Assert-That 'unit' '설치물 해시: 모든 키가 유효하고 같으면 unchanged' ((Test-LrAdminHashesUnchanged -Before $same -After $same -RequiredKeys $keys).unchanged)
    $chg = [ordered]@{ a1 = $H; b2 = ('c' * 64) }
    Assert-That 'unit' '설치물 해시: 하나라도 다르면 CHANGED 로 바뀐 것' ((-not (Test-LrAdminHashesUnchanged -Before $same -After $chg -RequiredKeys $keys).unchanged) -and ((Test-LrAdminHashesUnchanged -Before $same -After $chg -RequiredKeys $keys).problems -contains 'CHANGED:b2'))
    foreach ($case in @(@('실행 뒤 값이 $null', $same, [ordered]@{ a1 = $H; b2 = $null }, 'AFTER_UNKNOWN:b2'), @('실행 뒤 값이 빈 문자열', $same, [ordered]@{ a1 = $H; b2 = '' }, 'AFTER_UNKNOWN:b2'), @('실행 뒤 키가 없다', $same, [ordered]@{ a1 = $H }, 'AFTER_UNKNOWN:b2'), @('실행 뒤 값이 짧다', $same, [ordered]@{ a1 = $H; b2 = 'bbbb' }, 'AFTER_UNKNOWN:b2'), @('실행 전 값이 $null', [ordered]@{ a1 = $H; b2 = $null }, $same, 'BEFORE_UNKNOWN:b2'))) {
        $r = Test-LrAdminHashesUnchanged -Before $case[1] -After $case[2] -RequiredKeys $keys
        Assert-That 'unit' "설치물 해시: $($case[0]) 이면 같다고 하지 않는다 ($($case[3]))" ((-not $r.unchanged) -and ($r.problems -contains $case[3])) ($r.problems -join ',')
    }
    $nn = Test-LrAdminHashesUnchanged -Before ([ordered]@{ a1 = $null; b2 = $null }) -After ([ordered]@{ a1 = $null; b2 = $null }) -RequiredKeys $keys
    Assert-That 'unit' '설치물 해시: 실행 전후 모두 읽지 못한 값($null == $null)이어도 같다고 하지 않는다' ((-not $nn.unchanged) -and @($nn.problems).Count -eq 2)
    $ee = Test-LrAdminHashesUnchanged -Before ([ordered]@{ a1 = ''; b2 = '' }) -After ([ordered]@{ a1 = ''; b2 = '' }) -RequiredKeys $keys
    Assert-That 'unit' '설치물 해시: 실행 전후 모두 빈 문자열이어도 같다고 하지 않는다' (-not $ee.unchanged)
    Assert-That 'unit' '설치물 해시: 대조할 키가 없으면(스텁 모드가 아닌 곳에서는 비지 않는다) 대조할 것이 없다' ((Test-LrAdminHashesUnchanged -Before @{} -After @{} -RequiredKeys @()).unchanged -and (Test-LrAdminHashesUnchanged -Before @{} -After @{} -RequiredKeys $null).unchanged)
    Assert-That 'unit' '설치물 해시 키: 실제 모드 넷(semgrepExe·semgrepCore·venvPython·basePython), 스텁 모드 하나(launchedExe)' ((($Script:LrAdminRealArtifactKeys -join ',') -ceq 'semgrepExe,semgrepCore,venvPython,basePython') -and (($Script:LrAdminStubArtifactKeys -join ',') -ceq 'launchedExe'))
    # 감시 폴더 사후 목록
    $clean = [ordered]@{ WORKSPACE = @(); RULES_DIR = @('lsp-rules-1-probe.yaml'); HOME_DIR = @('.semgrep/cache/fingerprinted_ignored_findings/abc') }
    Assert-That 'unit' '감시 폴더 사후 목록: 작업 영역 비어 있음·규칙 폴더 프로브 하나·홈은 지문 폴더 아래만이면 문제 없음' ((Get-LrAdminRootProblems -Roots $clean).Count -eq 0)
    $rcase = @(
        @('작업 영역에 파일', [ordered]@{ WORKSPACE = @('x.txt'); RULES_DIR = @('lsp-rules-1-probe.yaml'); HOME_DIR = @() }, 'ROOT_CHANGED:WORKSPACE'),
        @('규칙 폴더에 다른 파일이 더 있음', [ordered]@{ WORKSPACE = @(); RULES_DIR = @('lsp-rules-1-probe.yaml', 'extra.yaml'); HOME_DIR = @() }, 'ROOT_CHANGED:RULES_DIR'),
        @('규칙 폴더에서 프로브가 없어짐', [ordered]@{ WORKSPACE = @(); RULES_DIR = @(); HOME_DIR = @() }, 'ROOT_CHANGED:RULES_DIR'),
        @('규칙 폴더에 프로브 아닌 이름 하나', [ordered]@{ WORKSPACE = @(); RULES_DIR = @('other.yaml'); HOME_DIR = @() }, 'ROOT_CHANGED:RULES_DIR'),
        @('홈에 허용 밖 파일', [ordered]@{ WORKSPACE = @(); RULES_DIR = @('lsp-rules-1-probe.yaml'); HOME_DIR = @('stray.txt') }, 'ROOT_CHANGED:HOME_DIR'),
        @('홈 폴더 목록을 읽지 못함', [ordered]@{ WORKSPACE = @(); RULES_DIR = @('lsp-rules-1-probe.yaml'); HOME_DIR = $null }, 'ROOT_UNREADABLE:HOME_DIR'),
        @('규칙 폴더 목록을 읽지 못함', [ordered]@{ WORKSPACE = @(); RULES_DIR = $null; HOME_DIR = @() }, 'ROOT_UNREADABLE:RULES_DIR'))
    foreach ($c in $rcase) { $pr = Get-LrAdminRootProblems -Roots $c[1]; Assert-That 'unit' "감시 폴더 사후 목록: $($c[0]) → $($c[2]) (읽지 못한 폴더는 깨끗하다고 하지 않는다)" ($pr -contains $c[2]) ($pr -join ',') }

    # 요청
    $work = 'C:\W\work\lsp-rules'; $layout = Get-LrLayout -Work $work
    $envT = New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layout -Url 'http://127.0.0.1:5555'
    $tok = New-LspMinRunToken -RunId $RunId -Nonce ('b' * 32)
    $lim = [ordered]@{}; foreach ($k in $Script:LrAdminLimitNames) { $lim[$k] = [int]$Script:LrLimits[$k] }
    $stubLim = [ordered]@{}; foreach ($k in $lim.Keys) { $stubLim[$k] = $lim[$k] }; $stubLim.totalMs = 5000; $stubLim.rulesMs = 1500; $stubLim.settleMs = 300
    $pb64 = [Convert]::ToBase64String($(if ($probeBytes) { $probeBytes } else { New-Object byte[] 233 }))
    $stubArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', 'C:\W\work\lsp-rules-stub.ps1', 'ok')
    $mk = { param($mode, $exe, $a, $l, $e, $ver, $pb) New-LrAdminRunnerRequest -Token $tok -Mode $mode -Exe $exe -ArgList $a -Layout $layout -Env $e -Limits $l -ExpectedVersion $ver -ProbeB64 $pb -AbortFile 'C:\W\work\lsp-rules-abort.flag' -ResultFile 'C:\W\work\lsp-rules-result.json' }
    $realExe = 'C:\D\venv\Scripts\semgrep.exe'
    if ($null -eq $probeBytes) { Skip-That 'unit' '프로브 원본이 없어 요청 점검을 하지 못했다' }
    else {
        $realReq = & $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $lim $envT '1.180.0' $pb64
        Assert-That 'unit' '요청: 정상 실제 모드 요청은 문제 없음' ((Test-LrAdminRunnerRequest $realReq).Count -eq 0) ((Test-LrAdminRunnerRequest $realReq) -join ',')
        $stubReq = & $mk 'stub' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' $stubArgs $stubLim $envT '9.9.9' $pb64
        Assert-That 'unit' '요청: 정상 스텁 요청(낮춘 한도)은 문제 없음' ((Test-LrAdminRunnerRequest $stubReq).Count -eq 0) ((Test-LrAdminRunnerRequest $stubReq) -join ',')
        Assert-That 'unit' '요청 키: 러너가 읽는 키(runToken·mode·exe·args·layout·env·limits·expectedVersion·probeB64·artifacts·abortFile·resultFile)만 담는다' ((($realReq.Keys | Sort-Object) -join ',') -ceq 'abortFile,args,artifacts,env,exe,expectedVersion,layout,limits,mode,probeB64,resultFile,runToken')
        Assert-That 'unit' '요청: 실제 모드에서 한도를 줄이면 거절(LIMIT_NOT_CAP)' ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $stubLim $envT '1.180.0' $pb64)) -contains 'LIMIT_NOT_CAP:rulesMs')
        $up = [ordered]@{}; foreach ($k in $lim.Keys) { $up[$k] = $lim[$k] }; $up.rulesMs = 120000
        Assert-That 'unit' '요청: 장벽 한도를 상한 위로 올리면 거절(LIMIT_ABOVE_CAP:rulesMs) — 어느 모드든 늘릴 수 없다' (((Test-LrAdminRunnerRequest (& $mk 'stub' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' $stubArgs $up $envT '9.9.9' $pb64)) -contains 'LIMIT_ABOVE_CAP:rulesMs') -and ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $up $envT '1.180.0' $pb64)) -contains 'LIMIT_ABOVE_CAP:rulesMs'))
        $up2 = [ordered]@{}; foreach ($k in $lim.Keys) { $up2[$k] = $lim[$k] }; $up2.settleMs = 9000
        Assert-That 'unit' '요청: 장벽 뒤 감시를 늘리면 거절(LIMIT_ABOVE_CAP:settleMs)' ((Test-LrAdminRunnerRequest (& $mk 'stub' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' $stubArgs $up2 $envT '9.9.9' $pb64)) -contains 'LIMIT_ABOVE_CAP:settleMs')
        Assert-That 'unit' '요청: 인자가 고정과 다르면(--version, lsp 만, 순서 바뀜) 거절' (((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('--version') $lim $envT '1.180.0' $pb64)) -contains 'ARGS_NOT_FIXED') -and ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp') $lim $envT '1.180.0' $pb64)) -contains 'ARGS_NOT_FIXED') -and ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('--debug', 'lsp') $lim $envT '1.180.0' $pb64)) -contains 'ARGS_NOT_FIXED'))
        Assert-That 'unit' '요청: 이름이 semgrep.exe 가 아니면 거절' ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' 'C:\D\venv\Scripts\pysemgrep.exe' @('lsp', '--debug') $lim $envT '1.180.0' $pb64)) -contains 'COMMAND_NAME_NOT_ALLOWED')
        foreach ($bad in @('SEMGREP_LOG_SRCS', 'SEMGREP_APP_TOKEN', 'HTTPS_PROXY')) {
            $envB = [ordered]@{}; foreach ($k in $envT.Keys) { $envB[$k] = $envT[$k] }; $envB[$bad] = 'x'
            Assert-That 'unit' "요청: 환경에 $bad 를 더하면 거절(ENV_NAME_NOT_ALLOWED)" ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $lim $envB '1.180.0' $pb64)) -contains "ENV_NAME_NOT_ALLOWED:$bad")
        }
        $envM = [ordered]@{}; foreach ($k in $envT.Keys) { if ($k -ne 'USERPROFILE') { $envM[$k] = $envT[$k] } }
        Assert-That 'unit' '요청: 환경 이름이 빠지면 거절' ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $lim $envM '1.180.0' $pb64)) -contains 'ENV_NAME_MISSING:USERPROFILE')
        $badLayout = Get-LrLayout -Work $work; $badLayout['rulesDir'] = 'C:\W\work\lsp-rules\lsp-state\rules-empty'
        $rq = New-LrAdminRunnerRequest -Token $tok -Mode 'semgrep-lsp' -Exe $realExe -ArgList @('lsp', '--debug') -Layout $badLayout -Env $envT -Limits $lim -ExpectedVersion '1.180.0' -ProbeB64 $pb64 -AbortFile 'C:\W\a.flag' -ResultFile 'C:\W\r.json'
        Assert-That 'unit' '요청: 규칙 폴더가 작업 폴더에서 도출한 배치(rules-probe)와 다르면 거절(LAYOUT_MISMATCH)' ((Test-LrAdminRunnerRequest $rq) -contains 'LAYOUT_MISMATCH')
        Assert-That 'unit' '요청: 프로브 바이트가 없거나 크기·해시가 다르면 거절(쓰기 전에)' (((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $lim $envT '1.180.0' '')) -contains 'PROBE_BYTES_MISSING') -and ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $lim $envT '1.180.0' ([Convert]::ToBase64String((New-Object byte[] 10))))) -contains 'PROBE_SIZE_MISMATCH') -and ((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $lim $envT '1.180.0' ([Convert]::ToBase64String((New-Object byte[] 233))))) -contains 'PROBE_HASH_MISMATCH'))
        Assert-That 'unit' '요청: 기대 버전이 비면 거절, 중단 파일·결과 파일이 절대 경로가 아니면 거절, 스텁 시나리오가 목록 밖이면 거절' (((Test-LrAdminRunnerRequest (& $mk 'semgrep-lsp' $realExe @('lsp', '--debug') $lim $envT '' $pb64)) -contains 'EXPECTED_VERSION_MISSING') -and ((Test-LrAdminRunnerRequest (New-LrAdminRunnerRequest -Token $tok -Mode 'semgrep-lsp' -Exe $realExe -ArgList @('lsp', '--debug') -Layout $layout -Env $envT -Limits $lim -ExpectedVersion '1.180.0' -ProbeB64 $pb64 -AbortFile 'rel.flag' -ResultFile 'rel.json')) -contains 'ABORT_FILE_NOT_ABSOLUTE') -and ((Test-LrAdminRunnerRequest (& $mk 'stub' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', 'C:\W\work\lsp-rules-stub.ps1', 'format-disk') $stubLim $envT '9.9.9' $pb64)) -contains 'STUB_ARGS'))
    }
    # 결과 결합
    $launched = [DateTime]::UtcNow.AddSeconds(-5)
    $reqObj = [ordered]@{ runToken = $tok; mode = 'stub'; exe = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'; args = $stubArgs; layout = $layout; env = $envT; limits = $stubLim; expectedVersion = '9.9.9' }
    $mkRes = {
        param([hashtable]$Over = @{})
        $o = [ordered]@{
            schema = 1; kind = 'lsp-rules-runner-result'; runToken = $tok; mode = 'stub'; startedUtc = [DateTime]::UtcNow.ToString('o'); refused = $null
            request = [pscustomobject]@{ exe = $reqObj.exe; args = @($reqObj.args); layoutWork = $layout.work; envNames = @($envT.Keys | Sort-Object); limits = [pscustomobject]$stubLim; expectedVersion = '9.9.9' }
        }
        foreach ($k in $Over.Keys) { $o[$k] = $Over[$k] }
        [pscustomobject]$o
    }
    $bind = { param($r) Test-LrAdminResultBinding -Result $r -Request $reqObj -RunId $RunId -LaunchedUtc $launched }
    Assert-That 'unit' '결합: 이번 요청의 결과는 문제 없음' ((& $bind (& $mkRes)).Count -eq 0) ((& $bind (& $mkRes)) -join ',')
    Assert-That 'unit' '결합: 결과 종류가 lsp-min-runner-result 이면(다른 관측의 결과) 거절' ((& $bind (& $mkRes @{ kind = 'lsp-min-runner-result' })) -contains 'RESULT_SCHEMA')
    Assert-That 'unit' '결합: 다른 토큰·다른 RunId 의 토큰은 거절' (((& $bind (& $mkRes @{ runToken = "lsp-$RunId-$('c' * 32)" })) -contains 'TOKEN_MISMATCH') -and ((& $bind (& $mkRes @{ runToken = "lsp-20261029T120000Z-ffffffff-$('b' * 32)" })) -contains 'TOKEN_RUNID_MISMATCH'))
    Assert-That 'unit' '결합: 모드가 다르면 거절, 이전 실행의 시작 시각이면 거절' (((& $bind (& $mkRes @{ mode = 'semgrep-lsp' })) -contains 'MODE_MISMATCH') -and ((& $bind (& $mkRes @{ startedUtc = '2020-01-01T00:00:00.0000000Z' })) -contains 'STARTED_BEFORE_LAUNCH'))
    $lim2 = [pscustomobject]$stubLim; $lim2.rulesMs = 7
    $lim3 = [pscustomobject]$stubLim; $lim3.settleMs = 7
    $echoBad = { param($lm, $ver) [pscustomobject]@{ exe = $reqObj.exe; args = @($reqObj.args); layoutWork = $layout.work; envNames = @($envT.Keys | Sort-Object); limits = $lm; expectedVersion = $ver } }
    Assert-That 'unit' '결합: 요청 반향의 장벽 한도·장벽 뒤 감시·기대 버전이 다르면 거절' (((& $bind (& $mkRes @{ request = (& $echoBad $lim2 '9.9.9') })) -contains 'ECHO_LIMIT:rulesMs') -and ((& $bind (& $mkRes @{ request = (& $echoBad $lim3 '9.9.9') })) -contains 'ECHO_LIMIT:settleMs') -and ((& $bind (& $mkRes @{ request = (& $echoBad ([pscustomobject]$stubLim) '1.0.0') })) -contains 'ECHO_EXPECTED_VERSION'))
    Assert-That 'unit' '결합: 반향이 없고 거절도 아니면 거절, 객체가 아니면·null 이면 거절' (((& $bind (& $mkRes @{ request = $null })) -contains 'ECHO_MISSING') -and ((& $bind 'x') -contains 'RESULT_NOT_OBJECT') -and ((& $bind $null) -contains 'RESULT_NOT_OBJECT'))
    # 신원 교차 확인
    $sidX = 'S-1-5-21-1-2-3-1001'; $ps51X = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'; $exeX = 'C:\D\venv\Scripts\semgrep.exe'; $argvX = @('lsp', '--debug')
    $launchX = [DateTime]::UtcNow.AddSeconds(-30)
    $newRunner = { param([hashtable]$Over = @{}) $o = [ordered]@{ role = 'runner'; processId = 100; parentProcessId = 1; exePath = $ps51X; startUtc = $launchX.AddSeconds(1).ToString('o'); endUtc = $null; ownerSid = $sidX; commandLine = $null }; foreach ($k in $Over.Keys) { $o[$k] = $Over[$k] }; $o }
    $newChild = { param([hashtable]$Over = @{}) $o = [ordered]@{ role = 'descendant'; processId = 101; parentProcessId = 100; exePath = $exeX; startUtc = $launchX.AddSeconds(2).ToString('o'); endUtc = $null; ownerSid = $sidX; commandLine = 'C:\D\venv\Scripts\semgrep.exe lsp --debug' }; foreach ($k in $Over.Keys) { $o[$k] = $Over[$k] }; $o }
    $newResX = { param([hashtable]$Self = @{}, [hashtable]$ChildOver = @{}) $rn = [ordered]@{ pid = 100; sid = $sidX; exe = $ps51X }; foreach ($k in $Self.Keys) { $rn[$k] = $Self[$k] }; $ch = [ordered]@{ started = $true; pid = 101; startUtc = $launchX.AddSeconds(2).ToString('o'); mainModule = $exeX }; foreach ($k in $ChildOver.Keys) { $ch[$k] = $ChildOver[$k] }; [pscustomobject]@{ refused = $null; runner = [pscustomobject]$rn; child = [pscustomobject]$ch } }
    $idf = { param($res, $rr, $tr) $fl = Get-LrAdminIdentityFailures -Result $res -RunnerRec $rr -Tracked $tr -Sid $sidX -ParentPid 100 -Ps51 $ps51X -Exe $exeX -Argv $argvX -LaunchedUtc $launchX; @($fl | ForEach-Object { $_.code }) }
    Assert-That 'unit' '신원: 모든 것이 맞으면 실패 없음' (@(& $idf (& $newResX) (& $newRunner) @((& $newChild))).Count -eq 0) ((& $idf (& $newResX) (& $newRunner) @((& $newChild))) -join ',')
    Assert-That 'unit' '신원: 받아들인 결과가 없으면 NO_ACCEPTED_RESULT 하나' ((& $idf $null (& $newRunner) @((& $newChild))) -contains 'NO_ACCEPTED_RESULT')
    $idCases = @(
        @('실행기 소유 SID', (& $newResX), (& $newRunner @{ ownerSid = 'S-1-5-21-9-9-9-9' }), @((& $newChild)), 'RUNNER_OWNER_MISMATCH'),
        @('실행기 실행 파일', (& $newResX), (& $newRunner @{ exePath = 'C:\Evil\ps.exe' }), @((& $newChild)), 'RUNNER_EXE_MISMATCH'),
        @('실행기 CIM 기록이 없음', (& $newResX), $null, @((& $newChild)), 'NO_RUNNER_CIM'),
        @('실행기 시작 시각이 실행 전', (& $newResX), (& $newRunner @{ startUtc = $launchX.AddSeconds(-60).ToString('o') }), @((& $newChild)), 'RUNNER_STARTED_BEFORE_LAUNCH'),
        @('자기 보고 PID', (& $newResX @{ pid = 7 }), (& $newRunner), @((& $newChild)), 'SELF_PID_MISMATCH'),
        @('자기 보고 SID', (& $newResX @{ sid = 'S-1-5-21-9-9-9-9' }), (& $newRunner), @((& $newChild)), 'SELF_SID_MISMATCH'),
        @('자기 보고 실행 파일', (& $newResX @{ exe = 'C:\x.exe' }), (& $newRunner), @((& $newChild)), 'SELF_EXE_MISMATCH'),
        @('자식 CIM 이 없음', (& $newResX), (& $newRunner), @(), 'CHILD_CIM_MISSING'),
        @('자식 부모 PID', (& $newResX), (& $newRunner), @((& $newChild @{ parentProcessId = 5 })), 'CHILD_PARENT_MISMATCH'),
        @('자식 소유 SID', (& $newResX), (& $newRunner), @((& $newChild @{ ownerSid = 'S-1-5-21-9-9-9-9' })), 'CHILD_OWNER_MISMATCH'),
        @('자식 실행 파일', (& $newResX), (& $newRunner), @((& $newChild @{ exePath = 'C:\Evil\other.exe' })), 'CHILD_EXE_MISMATCH'),
        @('자식 명령줄', (& $newResX), (& $newRunner), @((& $newChild @{ commandLine = 'C:\x.exe --other' })), 'CHILD_COMMANDLINE_MISMATCH'),
        @('자식 시작 시각', (& $newResX), (& $newRunner), @((& $newChild @{ startUtc = $launchX.AddSeconds(40).ToString('o') })), 'CHILD_START_MISMATCH'),
        @('자식 자기 보고 실행 파일', (& $newResX @{} @{ mainModule = 'C:\x\other.exe' }), (& $newRunner), @((& $newChild)), 'CHILD_MAINMODULE_MISMATCH'),
        @('자식을 시작하지 못했다고 보고(거절도 아님)', (& $newResX @{} @{ started = $false }), (& $newRunner), @(), 'CHILD_NOT_STARTED'))
    foreach ($c in $idCases) { $got = & $idf $c[1] $c[2] $c[3]; Assert-That 'unit' "신원: $($c[0]) 이 어긋나면 $($c[4])" ($got -contains $c[4]) ($got -join ',') }
    $refusedRes = [pscustomobject]@{ refused = 'WATCHED_ROOT_NOT_EMPTY:WORKSPACE'; runner = [pscustomobject]@{ pid = 100; sid = $sidX; exe = $ps51X }; child = [pscustomobject]@{ started = $false } }
    Assert-That 'unit' '신원: 러너가 스스로 거절한 요청은 자식이 없는 것이 정상이다(CHILD_NOT_STARTED 아님)' (@(& $idf $refusedRes (& $newRunner) @()).Count -eq 0)
    # 자손 트리
    $t0 = [DateTime]::Now
    $tbl = @(
        [pscustomobject]@{ ProcessId = 100; ParentProcessId = 1; CreationDate = $t0 },
        [pscustomobject]@{ ProcessId = 101; ParentProcessId = 100; CreationDate = $t0.AddSeconds(1) },
        [pscustomobject]@{ ProcessId = 102; ParentProcessId = 101; CreationDate = $t0.AddSeconds(2) },
        [pscustomobject]@{ ProcessId = 103; ParentProcessId = 100; CreationDate = $t0.AddSeconds(-50) },
        [pscustomobject]@{ ProcessId = 104; ParentProcessId = 999; CreationDate = $t0.AddSeconds(3) })
    $dsc = Get-LrAdminDescendantCim 100 $t0 $tbl
    Assert-That 'unit' '자손 트리: 자식과 손자를 찾고, 부모가 다른 것과 루트보다 먼저 시작한 것(PID 재사용)은 버린다' ((@($dsc | ForEach-Object { $_.ProcessId } | Sort-Object) -join ',') -ceq '101,102')
    Assert-That 'unit' '자손 트리: 표가 비어도 던지지 않고 빈 목록' ((Get-LrAdminDescendantCim 100 $t0 @()).Count -eq 0)
    # 관리자 문맥
    $ctxA = New-LrAdminContext -RunId $RunId -Token $tok -Mode 'stub' -Work $work -ExpectedVersion '9.9.9' -Limits $lim -RunnerLaunched $true -Refusals $null -ReceiverBaseline 0 -ReceiverFinal $null -ReceiverSamples 4 -ReceiverFailures 2 -Probe ([ordered]@{ sourceSha256 = $E; afterCopySha256 = $E; afterRunSha256 = $null }) -IdentityOk $true -IdentityFailures @() -BindingOk $true -BindingFailures @() -AbortRequested $false -AbortReason $null -AbortDelivered $null -ForcedKill $false -DeadlineReached $false -ResultMissing $false -DescendantPathViolations @() -HashesUnchanged $true
    Assert-That 'unit' '문맥: 스키마·종류·작업 폴더와, 관측하지 못한 값(수신기 최종 건수·프로브 실행 뒤 해시·중단 전달)은 null 로 싣는다' (($ctxA.schema -eq 'lsp-rules-admin-context/1') -and ($ctxA.kind -eq 'lsp-rules-admin-context') -and ($ctxA.work -eq $work) -and ($null -eq $ctxA.receiver.finalHits) -and ($ctxA.receiver.failures -eq 2) -and ($null -eq $ctxA.probe.afterRunSha256) -and ($null -eq $ctxA.supervisor.abortDelivered))
    Assert-That 'unit' '문맥: runnerLaunched 와 refusals(빈 목록)·5157 요약을 주지 않으면 확인 못 한 것(usable=false, attributedCount=null)으로 쓴다' (($ctxA.runnerLaunched -eq $true) -and (@($ctxA.refusals).Count -eq 0) -and ($ctxA.osBlock.usable -eq $false) -and ($null -eq $ctxA.osBlock.attributedCount))
    $ctxB = New-LrAdminContext -RunId $RunId -Token $tok -Mode 'stub' -Work $work -ExpectedVersion '9.9.9' -Limits $lim -RunnerLaunched $false -Refusals 'RECEIVER_NOT_READY' -ReceiverBaseline $null -ReceiverFinal $null -ReceiverSamples 0 -ReceiverFailures 0 -Probe $null -IdentityOk $false -IdentityFailures @('NO_ACCEPTED_RESULT') -BindingOk $false -BindingFailures @() -AbortRequested $false -AbortReason $null -AbortDelivered $null -ForcedKill $false -DeadlineReached $false -ResultMissing $true -DescendantPathViolations @('pid=5') -HashesUnchanged $false -OsBlock ([ordered]@{ usable = $true; attributed = 0 })
    Assert-That 'unit' '문맥: 서버를 띄우지 못했으면 runnerLaunched=false 와 사유, 프로브를 주지 않으면 세 해시 모두 null, 5157 요약은 그대로' (($ctxB.runnerLaunched -eq $false) -and (@($ctxB.refusals) -contains 'RECEIVER_NOT_READY') -and ($null -eq $ctxB.probe.sourceSha256) -and ($null -eq $ctxB.probe.afterCopySha256) -and ($ctxB.osBlock.usable -eq $true) -and ($ctxB.osBlock.attributedCount -eq 0) -and (@($ctxB.descendantPathViolations).Count -eq 1))
    $json = $ctxB | ConvertTo-Json -Depth 8
    $back = ConvertFrom-Json -InputObject $json
    Assert-That 'unit' '문맥: JSON 으로 쓰고 읽어도 모양이 같다(refusals·identity.failures 가 문자열 목록으로 읽히고, 목록 객체의 Capacity·Count 속성으로 풀리지 않는다)' (($json -notmatch '"Capacity"') -and (@($back.refusals) -contains 'RECEIVER_NOT_READY') -and (@($back.identity.failures) -contains 'NO_ACCEPTED_RESULT') -and ($back.runnerLaunched -eq $false))
    # 판정 이름
    $vt = @(
        @('성립', $true, $null, 'OBSERVED', 'RULES_LOAD_OBSERVED', $null, $false, 'RULES_LOAD_OBSERVED'),
        @('스텁의 성립', $true, $null, 'OBSERVED', 'RULES_LOAD_OBSERVED', $null, $true, 'STUB_RULES_LOAD_OBSERVED'),
        @('서버를 띄우지 못함', $false, 'RECEIVER_NOT_READY', 'NOT_ATTEMPTED', 'NOT_ATTEMPTED:ADMIN_RUNNER_NOT_LAUNCHED', 'X', $false, 'NOT_ATTEMPTED:RECEIVER_NOT_READY'),
        @('기록이 규칙 0개를 관측', $false, $null, 'LOAD_FAILED', 'LOAD_FAILED:NO_RULES_TO_RUN', 'RECORD_LOAD_FAILED', $false, 'LOAD_FAILED:NO_RULES_TO_RUN'),
        @('기록이 확인 불가', $false, $null, 'NOT_CONFIRMED', 'NOT_CONFIRMED:SIGNAL_ABSENT', 'RECORD_NOT_CONFIRMED', $true, 'STUB_NOT_CONFIRMED:SIGNAL_ABSENT'),
        @('기록은 성립인데 관리자 사유가 막음', $false, $null, 'OBSERVED', 'RULES_LOAD_OBSERVED', 'IDENTITY_UNVERIFIED', $false, 'NOT_OBSERVED:IDENTITY_UNVERIFIED'),
        @('기록이 없음', $false, $null, $null, $null, 'REINTERPRETATION_NOT_RUN', $false, 'NOT_OBSERVED:REINTERPRETATION_NOT_RUN'),
        @('사유도 없음', $false, $null, $null, $null, $null, $false, 'NOT_OBSERVED:UNKNOWN'))
    foreach ($v in $vt) { $got = Get-LrAdminVerdict -Established $v[1] -NotAttempted $v[2] -RecordStatus $v[3] -RecordVerdict $v[4] -PrimaryFailure $v[5] -Stub $v[6]; Assert-That 'unit' "판정 이름: $($v[0]) → $($v[7])" ($got -ceq $v[7]) "got=$got" }
    # 스텁 시나리오 목록 일치: 러너 == 스텁 스크립트 == 계약 == 진입점 ValidateSet
    $runnerText = [IO.File]::ReadAllText((Join-Path $CodeDir 'lsp-rules-runner.ps1'), [Text.Encoding]::UTF8)
    $m = [regex]::Match($runnerText, '\$Script:LrStubScenarios = @\((?<l>[^)]*)\)')
    $runnerList = @([regex]::Matches($m.Groups['l'].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
    $stubText = [IO.File]::ReadAllText((Join-Path $CodeDir 'lsp-rules-stub.ps1'), [Text.Encoding]::UTF8)
    $ms = [regex]::Match($stubText, '\$allowed = @\((?<l>[^)]*)\)')
    $stubList = @([regex]::Matches($ms.Groups['l'].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
    $entryText = [IO.File]::ReadAllText((Join-Path $CodeDir 'Test-LspRulesObservation.ps1'), [Text.Encoding]::UTF8)
    $vs = [regex]::Match($entryText, "\[ValidateSet\((?<l>'ok'[^)]*)\)\]\[string\]\`$StubScenario")
    $entryList = @([regex]::Matches($vs.Groups['l'].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
    $cj = $Script:LrAdminStubScenarios -join ','
    Assert-That 'unit' '스텁 시나리오 이름: 러너 목록 == 계약 목록' (($runnerList -join ',') -ceq $cj) "runner=$($runnerList.Count) contract=$($Script:LrAdminStubScenarios.Count)"
    Assert-That 'unit' '스텁 시나리오 이름: 스텁 스크립트 목록 == 계약 목록' (($stubList -join ',') -ceq $cj) "stub=$($stubList.Count)"
    Assert-That 'unit' '스텁 시나리오 이름: 진입점 ValidateSet == 계약 목록' (($entryList -join ',') -ceq $cj) "entry=$($entryList.Count)"
}

# ═══ (B2) 읽기 전용 포트 단위 시험: 해시·파일 읽기·프로브 원본 ═══════════════════════════
if (Test-Selected 'ports') {
    Write-Host '[ports] 읽기 전용 포트: 해시·작은 파일 읽기·프로브 원본'
    . (Join-Path $CodeDir 'LspMinAdminPorts.ps1')
    . (Join-Path $CodeDir 'LspRulesAdminPorts.ps1')
    $tmpP = Join-Path ([IO.Path]::GetTempPath()) ('lsprules-ports-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    [void][IO.Directory]::CreateDirectory($tmpP)
    try {
        $f1 = Join-Path $tmpP 'a.bin'; [IO.File]::WriteAllBytes($f1, [Text.Encoding]::ASCII.GetBytes('abc'))
        Assert-That 'ports' '파일 해시: 알려진 값(abc 의 SHA-256)과 같다' ((Get-LrAdminFileSha256 -Path $f1) -ceq 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
        Assert-That 'ports' '파일 해시: 없는 파일·폴더·빈 경로·null 은 $null (읽지 못한 값이다)' (($null -eq (Get-LrAdminFileSha256 -Path (Join-Path $tmpP 'nope.bin'))) -and ($null -eq (Get-LrAdminFileSha256 -Path $tmpP)) -and ($null -eq (Get-LrAdminFileSha256 -Path '')) -and ($null -eq (Get-LrAdminFileSha256 -Path $null)))
        $h2 = Get-LrAdminArtifactHashes -Paths ([ordered]@{ ok = $f1; missing = (Join-Path $tmpP 'nope.bin'); nothing = $null })
        Assert-That 'ports' '이름표 해시 표: 읽은 것은 해시, 읽지 못한 것(없음·경로 null)은 $null' (($h2['ok'] -ceq 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') -and ($null -eq $h2['missing']) -and ($null -eq $h2['nothing']))
        $big = Join-Path $tmpP 'big.bin'; [IO.File]::WriteAllBytes($big, (New-Object byte[] 5000))
        $rb = Get-LrAdminFileBytes -Path $big -MaxBytes 4096
        Assert-That 'ports' '작은 파일 읽기: 상한을 넘으면 읽지 않는다(TOO_LARGE, bytes null)' ((-not $rb.ok) -and ($rb.error -eq 'TOO_LARGE') -and ($null -eq $rb.bytes) -and ($rb.size -eq 5000))
        Assert-That 'ports' '작은 파일 읽기: 없는 파일·폴더는 읽지 못한다(NOT_A_REGULAR_FILE)' ((-not (Get-LrAdminFileBytes -Path (Join-Path $tmpP 'nope.bin')).ok) -and (-not (Get-LrAdminFileBytes -Path $tmpP).ok))
        Assert-That 'ports' '작은 파일 읽기: 정상 파일은 바이트 그대로' ((Get-LrAdminFileBytes -Path $f1).ok -and ([Convert]::ToBase64String((Get-LrAdminFileBytes -Path $f1).bytes) -ceq [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('abc'))))
        $ps = Read-LrAdminProbeSource -Path $ProbeFile
        if ($null -eq $probeBytes) { Skip-That 'ports' "프로브 원본이 없어 확인하지 못했다: $ProbeFile" }
        else {
            Assert-That 'ports' '프로브 원본: 저장소의 파일은 일반 파일이고 233바이트·고정 sha256 이라 ok 이며 바이트를 돌려준다' ($ps.ok -and $ps.size -eq 233 -and $ps.sha256 -ceq $Script:LrProbeSha256 -and $ps.bytes.Length -eq 233) ($ps.problems -join ',')
            $tam = Join-Path $tmpP 'tampered.yaml'; $tb = [byte[]]$probeBytes.Clone(); $tb[5] = $tb[5] -bxor 1; [IO.File]::WriteAllBytes($tam, $tb)
            $pt = Read-LrAdminProbeSource -Path $tam
            Assert-That 'ports' '프로브 원본: 한 바이트 바뀐 사본은 ok 가 아니고 PROBE_HASH_MISMATCH' ((-not $pt.ok) -and ($pt.problems -contains 'PROBE_HASH_MISMATCH'))
            $crlf = Join-Path $tmpP 'crlf.yaml'; [IO.File]::WriteAllBytes($crlf, [Text.Encoding]::UTF8.GetBytes(([Text.Encoding]::UTF8.GetString($probeBytes)).Replace("`n", "`r`n")))
            Assert-That 'ports' '프로브 원본: 줄바꿈이 CRLF 로 바뀐 사본은 크기가 달라 거절(PROBE_SIZE_MISMATCH)' ((Read-LrAdminProbeSource -Path $crlf).problems -contains 'PROBE_SIZE_MISMATCH')
        }
        Assert-That 'ports' '프로브 원본: 없는 파일·빈 경로는 ok 가 아니다' ((-not (Read-LrAdminProbeSource -Path (Join-Path $tmpP 'nope.yaml')).ok) -and ((Read-LrAdminProbeSource -Path '').problems -contains 'PROBE_SOURCE_PATH_MISSING'))
        $lnk = Join-Path $tmpP 'probe-link.yaml'; $madeLink = $false
        if ($null -ne $probeBytes) { try { New-Item -ItemType SymbolicLink -Path $lnk -Target $ProbeFile -ErrorAction Stop | Out-Null; $madeLink = $true } catch { $madeLink = $false } }
        if ($madeLink) { Assert-That 'ports' '프로브 원본: 심볼릭 링크는 읽지 않는다(NOT_A_REGULAR_FILE:LINK)' ((-not (Read-LrAdminProbeSource -Path $lnk).ok) -and ((Read-LrAdminProbeSource -Path $lnk).problems -join ',') -match 'LINK'); [IO.File]::Delete($lnk) }
        else { Skip-That 'ports' '이 계정으로는 파일 심볼릭 링크를 만들 수 없다(권한): 링크 원본 사례를 확인하지 못했다' }
        # 감시 폴더 목록
        $rt = Join-Path $tmpP 'root'; [void][IO.Directory]::CreateDirectory((Join-Path $rt 'sub')); [IO.File]::WriteAllText((Join-Path $rt 'sub\b.txt'), 'x'); [IO.File]::WriteAllText((Join-Path $rt 'a.txt'), 'x')
        Assert-That 'ports' '감시 폴더 목록: 상대 경로·슬래시·이름 순, 폴더는 제외' (((Get-LrAdminRootFiles -Root $rt) -join '|') -ceq 'a.txt|sub/b.txt')
        Assert-That 'ports' '감시 폴더 목록: 없는 폴더는 빈 목록이 아니라 $null (읽지 못한 것이다)' (($null -eq (Get-LrAdminRootFiles -Root (Join-Path $tmpP 'nope'))))
        $emptyDir = Join-Path $tmpP 'empty'; [void][IO.Directory]::CreateDirectory($emptyDir)
        $el = Get-LrAdminRootFiles -Root $emptyDir
        Assert-That 'ports' '감시 폴더 목록: 빈 폴더는 $null 이 아니라 빈 목록' (($null -ne $el) -and (@($el).Count -eq 0))
    } finally { Remove-Item -LiteralPath $tmpP -Recurse -Force -ErrorAction SilentlyContinue }
}

# ═══ (B3) 작업 경로 확인: 실제 Windows 임시 폴더와 정션 ═══════════════════════════════════
if (Test-Selected 'workpath') {
    Write-Host '[workpath] 신뢰 루트부터 새 쓰기 목적지(규칙 폴더·프로브 자리·상태 폴더)까지 경로 조각 확인 (정션 사용)'
    . (Join-Path $CodeDir 'LspMinAdminPorts.ps1')
    . (Join-Path $CodeDir 'LspRulesAdminPorts.ps1')
    $tmpW = Join-Path ([IO.Path]::GetTempPath()) ('lsprules-wp-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    $wpLayout = {
        param([string]$Name)
        $root = Join-Path $tmpW $Name; $task = Join-Path $root 'task'; [void][IO.Directory]::CreateDirectory($task)
        $outside = Join-Path $root 'outside'; [void][IO.Directory]::CreateDirectory((Join-Path $outside 'lsp-rules')); [IO.File]::WriteAllText((Join-Path $outside 'keep.txt'), 'keep'); [IO.File]::WriteAllText((Join-Path $outside 'lsp-rules\inner.txt'), 'inner')
        $work = Join-Path $task 'work'; $rw = Join-Path $work 'lsp-rules'
        [pscustomobject]@{ Root = $root; Task = $task; Work = $work; Rules = $rw; Outside = $outside; State = (Join-Path $rw 'lsp-state'); RulesDir = (Join-Path (Join-Path $rw 'lsp-state') 'rules-probe') }
    }
    $wpProblems = { param($L) Get-LrAdminWorkSafetyProblems -TrustedRoot $L.Task -WorkDir $L.Work -RulesWork $L.Rules }
    try {
        $L = & $wpLayout 'normal-absent'
        Assert-That 'workpath' '허용: work 가 아직 없어도 문제 없음(검증한 기존 부모 task 아래에 만들 수 있다)' ((& $wpProblems $L).Count -eq 0)
        [void][IO.Directory]::CreateDirectory($L.RulesDir); [IO.File]::WriteAllBytes((Join-Path $L.RulesDir 'lsp-rules-1-probe.yaml'), [byte[]]@(1, 2, 3))
        [void][IO.Directory]::CreateDirectory((Join-Path $L.Rules 'ws\sub')); [IO.File]::WriteAllText((Join-Path $L.Rules 'ws\sub\a.txt'), 'x'); foreach ($n in 'lsp-rules-request.json', 'lsp-rules-runner.ps1', 'version-runner.ps1') { [IO.File]::WriteAllText((Join-Path $L.Work $n), 'old') }
        Assert-That 'workpath' '허용: 일반 폴더·일반 파일이 이미 있는 정상 배치(규칙 폴더·프로브 포함)도 문제 없음' ((& $wpProblems $L).Count -eq 0) ((& $wpProblems $L) -join ' ; ')
        # 읽기: 정상 배치의 사후 사실
        $st = Get-LrAdminAfterRunState -TrustedRoot $L.Task -WorkDir $L.Work -RulesWork $L.Rules
        Assert-That 'workpath' '사후 사실: 깨끗한 배치는 읽어도 되고(readAllowed), 프로브를 읽어 해시를 재며 감시 폴더 목록을 돌려준다' ($st.readAllowed -and ($st.probe.sha256 -ceq (Get-LrSha256Hex ([byte[]]@(1, 2, 3)))) -and (@($st.roots['RULES_DIR']) -contains 'lsp-rules-1-probe.yaml') -and (@($st.roots['WORKSPACE']).Count -eq 1))
        [IO.File]::Delete((Join-Path $L.RulesDir 'lsp-rules-1-probe.yaml'))
        $st2 = Get-LrAdminAfterRunState -TrustedRoot $L.Task -WorkDir $L.Work -RulesWork $L.Rules
        Assert-That 'workpath' '사후 사실: 프로브가 없어졌으면 해시는 $null 이다(없는 파일의 해시를 만들어 내지 않는다)' ($st2.readAllowed -and ($null -eq $st2.probe.sha256) -and -not [string]::IsNullOrEmpty([string]$st2.probe.error))

        # 결함 재현과 수정: 상위 work 가 정션
        $L = & $wpLayout 'work-junction'
        New-Item -ItemType Junction -Path $L.Work -Target $L.Outside | Out-Null
        $pr0 = Get-TreePrint $L.Outside
        $p = & $wpProblems $L
        Assert-That 'workpath' '상위 work 가 정션이면 LINK 로 찾는다' (($p -contains ('LINK:' + $L.Work)) -and $p.Count -ge 1) ($p -join ' ; ')
        $st = Get-LrAdminAfterRunState -TrustedRoot $L.Task -WorkDir $L.Work -RulesWork $L.Rules
        Assert-That 'workpath' '사후 사실: 경로에 링크가 있으면 읽어도 되는지 확인하지 못한 것이다(readAllowed=false, 해시 null, 감시 폴더 목록 없음) — 링크를 따라 읽지 않는다' ((-not $st.readAllowed) -and ($null -eq $st.probe.sha256) -and (@($st.problems).Count -ge 1) -and ($st.roots.Count -eq 0))
        Assert-That 'workpath' '링크 확인은 링크를 따라가지 않고 쓰지도 않는다: 대상 폴더의 파일·목록·바이트가 그대로' ((Get-TreePrint $L.Outside) -eq $pr0)
        $w = Write-LspMinAbortFile -Path (Join-Path $L.Work 'lsp-rules-abort.flag') -Text 'A3:RECEIVER_HIT' -TrustedRoot $L.Task
        Assert-That 'workpath' '중단 파일: work 가 정션이면 쓰지 않고 WORK_PATH_UNSAFE (대상 폴더에 파일이 생기지 않는다)' ((-not $w.ok) -and ([string]$w.error).StartsWith('WORK_PATH_UNSAFE') -and ((Get-TreePrint $L.Outside) -eq $pr0))
        [IO.Directory]::Delete($L.Work)
        Assert-That 'workpath' '링크를 지워도 대상 폴더는 그대로' ((Get-TreePrint $L.Outside) -eq $pr0)

        # 새 쓰기 목적지 하나하나가 정션이면 찾는다
        $targets = @(
            @('lsp-rules-junction', { param($L) $L.Rules }, { param($L) [void][IO.Directory]::CreateDirectory($L.Work) }),
            @('lsp-state-junction', { param($L) $L.State }, { param($L) [void][IO.Directory]::CreateDirectory($L.Rules) }),
            @('rules-probe-junction', { param($L) $L.RulesDir }, { param($L) [void][IO.Directory]::CreateDirectory($L.State) }),
            @('ws-junction', { param($L) (Join-Path $L.Rules 'ws') }, { param($L) [void][IO.Directory]::CreateDirectory($L.Rules) }),
            @('home-junction', { param($L) (Join-Path $L.State 'home') }, { param($L) [void][IO.Directory]::CreateDirectory($L.State) }),
            @('tmp-junction', { param($L) (Join-Path $L.State 'tmp') }, { param($L) [void][IO.Directory]::CreateDirectory($L.State) }))
        foreach ($t in $targets) {
            $L = & $wpLayout $t[0]; & $t[2] $L
            $lp = & $t[1] $L
            New-Item -ItemType Junction -Path $lp -Target $L.Outside | Out-Null
            $pr0 = Get-TreePrint $L.Outside; $p = & $wpProblems $L
            Assert-That 'workpath' "새 쓰기 목적지 $($t[0] -replace '-junction', '') 가 정션이면 LINK 로 찾는다" ($p -contains ('LINK:' + $lp)) ($p -join ' ; ')
            Assert-That 'workpath' "  (그 정션 안을 훑거나 쓰지 않는다: 대상 폴더 불변) $($t[0])" ((Get-TreePrint $L.Outside) -eq $pr0)
            [IO.Directory]::Delete($lp)
        }
        # 프로브 파일 자리가 링크
        $L = & $wpLayout 'probe-file-link'; [void][IO.Directory]::CreateDirectory($L.RulesDir)
        $realF = Join-Path $L.Outside 'real-target.txt'; [IO.File]::WriteAllText($realF, 'must not change')
        $pl = Join-Path $L.RulesDir 'lsp-rules-1-probe.yaml'; $madeFileLink = $false
        try { New-Item -ItemType SymbolicLink -Path $pl -Target $realF -ErrorAction Stop | Out-Null; $madeFileLink = $true } catch { $madeFileLink = $false }
        if ($madeFileLink) {
            $p = & $wpProblems $L
            Assert-That 'workpath' '프로브 파일 자리가 심볼릭 링크면 LINK 로 찾는다' ($p -contains ('LINK:' + $pl)) ($p -join ' ; ')
            $st = Get-LrAdminAfterRunState -TrustedRoot $L.Task -WorkDir $L.Work -RulesWork $L.Rules
            Assert-That 'workpath' '프로브 파일이 링크면 사후 해시를 재지 않는다(readAllowed=false, 해시 null)' ((-not $st.readAllowed) -and ($null -eq $st.probe.sha256))
            [IO.File]::Delete($pl)
            Assert-That 'workpath' '파일 링크를 지워도 대상 파일은 그대로' (([IO.File]::ReadAllText($realF)) -eq 'must not change')
        } else { Skip-That 'workpath' '이 계정으로는 파일 심볼릭 링크를 만들 수 없다(권한): 프로브 자리 파일 링크 사례를 확인하지 못했다' }
        # 작업 배치 안쪽의 정션(상위 경로는 깨끗)은 트리 확인이 찾는다
        $L = & $wpLayout 'nested-junction'; [void][IO.Directory]::CreateDirectory((Join-Path $L.Rules 'ws\deep'))
        $nj = Join-Path $L.Rules 'ws\deep\j'; New-Item -ItemType Junction -Path $nj -Target $L.Outside | Out-Null
        $p = & $wpProblems $L
        Assert-That 'workpath' '작업 배치 안쪽 정션: 경로 조각은 깨끗해도 트리 확인이 찾는다' (($p -contains $nj) -and $p.Count -eq 1) ($p -join ' ; ')
        [IO.Directory]::Delete($nj)
        # 기존 복사·삭제 목적지가 정션
        foreach ($leaf in 'lsp-rules-runner.ps1', 'LspRulesContract.ps1', 'lsp-min-runner.ps1', 'LspMinContract.ps1', 'version-runner.ps1', 'lsp-rules-stub.ps1', 'lsp-rules-request.json', 'lsp-rules-result.json', 'lsp-rules-abort.flag') {
            $L = & $wpLayout ('dest-' + $leaf); [void][IO.Directory]::CreateDirectory($L.Work)
            $dj = Join-Path $L.Work $leaf; New-Item -ItemType Junction -Path $dj -Target $L.Outside | Out-Null
            $p = & $wpProblems $L
            Assert-That 'workpath' "기존 목적지 $leaf 가 정션이면 LINK 로 찾는다" ($p -contains ('LINK:' + $dj)) ($p -join ' ; ')
            [IO.Directory]::Delete($dj)
        }
        # 신뢰 루트 자체와 중간 조각이 파일인 경우
        $L = & $wpLayout 'root-junction'
        $rj = Join-Path $L.Root 'taskjn'; New-Item -ItemType Junction -Path $rj -Target $L.Task | Out-Null
        $p = Get-LrAdminWorkSafetyProblems -TrustedRoot $rj -WorkDir (Join-Path $rj 'work') -RulesWork (Join-Path (Join-Path $rj 'work') 'lsp-rules')
        Assert-That 'workpath' '신뢰 루트 자체가 정션이면 LINK 로 거절한다' ($p -contains ('LINK:' + $rj)) ($p -join ' ; ')
        [IO.Directory]::Delete($rj)
        $p = Get-LrAdminWorkSafetyProblems -TrustedRoot (Join-Path $L.Root 'no-such-root') -WorkDir (Join-Path $L.Root 'no-such-root\work') -RulesWork (Join-Path $L.Root 'no-such-root\work\lsp-rules')
        Assert-That 'workpath' '신뢰 루트가 없으면 확인할 수 없으므로 거절한다(ROOT_MISSING)' (($p.Count -eq 1) -and ([string]$p[0]).StartsWith('ROOT_MISSING:')) ($p -join ' ; ')
        $L = & $wpLayout 'rules-is-file'; [void][IO.Directory]::CreateDirectory($L.Work); [IO.File]::WriteAllText($L.Rules, 'i am a file')
        $p = & $wpProblems $L
        Assert-That 'workpath' '작업 배치 자리에 파일이 있으면 NOT_A_DIRECTORY 로 거절한다' ($p -contains ('NOT_A_DIRECTORY:' + $L.Rules)) ($p -join ' ; ')
        # 읽지 못한 조각(모의)
        $L = & $wpLayout 'unreadable-sim'; [void][IO.Directory]::CreateDirectory($L.Work)
        $origPiece = (Get-Item 'function:Get-LspMinPieceState').ScriptBlock
        try {
            $Script:SimBadWork = $L.Work
            function Get-LspMinPieceState { param([string]$Path) if ($Path -ieq $Script:SimBadWork) { return 'UNREADABLE' }; & $origPiece $Path }
            $p = & $wpProblems $L
            Assert-That 'workpath' '(모의) 조각을 읽지 못하면 UNREADABLE 로 거절한다 — 깨끗하다고 하지 않는다' ($p -contains ('UNREADABLE:' + $L.Work)) ($p -join ' ; ')
        } finally { . (Join-Path $CodeDir 'LspMinAdminPorts.ps1') }
        Assert-That 'workpath' '(모의 해제 확인) 원래 상태 함수로 돌아오면 같은 경로는 문제 없음' ((& $wpProblems $L).Count -eq 0)
    } finally {
        if (Test-Path -LiteralPath $tmpW) { Remove-LinksUnder $tmpW; Remove-Item -LiteralPath $tmpW -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# ═══ (C) 흐름 시험 ═══════════════════════════════════════════════════════════
# 목록 값은 PowerShell 5.1 의 ConvertTo-Json 이 빈 배열을 {} 로, 원소 하나짜리를 스칼라로 쓸 수 있어 이 도우미로 읽는다(빈 객체는 빈 목록이다).
function Get-List {
    param($Object, [string]$Path)
    $v = @(Get-Prop $Object $Path)
    $out = New-Object System.Collections.ArrayList
    foreach ($x in $v) { if ($x -is [pscustomobject] -and @($x.PSObject.Properties).Count -eq 0) { continue }; [void]$out.Add($x) }
    , $out.ToArray()
}
function New-Sandbox {
    param([hashtable]$Scenario = @{})
    $root = Join-Path ([IO.Path]::GetTempPath()) ('iso-rulesflows-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
    $code = Join-Path $root 'code'
    [void][IO.Directory]::CreateDirectory($code)
    foreach ($f in Get-ChildItem -LiteralPath $CodeDir -Filter *.ps1 -File) { [IO.File]::Copy($f.FullName, (Join-Path $code $f.Name)) }
    foreach ($f in 'MockSystem.ps1', 'MockSystemLsp.ps1', 'MockPortsLsp.ps1', 'MockSystemRules.ps1', 'MockPortsRules.ps1') { [IO.File]::Copy((Join-Path $PSScriptRoot $f), (Join-Path $root $f)) }
    # 모의 시스템 확장은 (a) 적용·복구 진입점이 읽는 IsolationFlows.ps1, (b) LSP-MIN-1 포트(LspMinAdminPorts.ps1), (c) 이 관측의 포트(LspRulesAdminPorts.ps1) 바로 뒤에 읽히게 한다. 5.1 이 한글을 읽도록 BOM 을 붙인다.
    $stubs = @{ 'IsolationFlows.ps1' = @('..\MockSystemLsp.ps1'); 'LspMinAdminPorts.ps1' = @('..\MockSystemLsp.ps1', '..\MockPortsLsp.ps1'); 'LspRulesAdminPorts.ps1' = @('..\MockSystemRules.ps1', '..\MockPortsRules.ps1') }
    foreach ($target in $stubs.Keys) {
        $real = $target -replace '\.ps1$', '.real.ps1'
        [IO.File]::Move((Join-Path $code $target), (Join-Path $code $real))
        $text = ". (Join-Path `$PSScriptRoot '$real')`r`n"
        foreach ($m in $stubs[$target]) { $text += ". (Join-Path `$PSScriptRoot '$m')`r`n" }
        [IO.File]::WriteAllText((Join-Path $code $target), $text, (New-Object Text.UTF8Encoding($true)))
    }
    $runDir = Join-Path $root "state\$RunId"
    [void][IO.Directory]::CreateDirectory($runDir)
    $pf = [ordered]@{ schema = 1; runId = $RunId; createdUtc = [DateTime]::UtcNow.ToString('o'); applyBlockers = @(); checks = @() }
    [IO.File]::WriteAllText((Join-Path $runDir 'preflight.json'), ($pf | ConvertTo-Json -Depth 4), $Utf8)
    $hash = Get-LrSha256Hex ([IO.File]::ReadAllBytes((Join-Path $runDir 'preflight.json')))
    $scenarioFile = Join-Path $root 'scenario.json'
    [IO.File]::WriteAllText($scenarioFile, ($Scenario | ConvertTo-Json -Depth 8), $Utf8)
    $sb = [pscustomobject]@{ Root = $root; Code = $code; RunDir = $runDir; Hash12 = $hash.Substring(0, 12); ScenarioFile = $scenarioFile; WorkDir = (Join-Path $root "work\$RunId"); Cancel = (Join-Path $root 'cancel.flag') }
    [void]$Sandboxes.Add($root)
    $sb
}
function Invoke-Entry {
    param($Sb, [string]$Phase, [string]$Script, [string[]]$ScriptArgs = @())
    $env:ISO_MOCK_SANDBOX = $Sb.Root; $env:ISO_MOCK_SCENARIO = $Sb.ScenarioFile; $env:ISO_MOCK_PHASE = $Phase
    try {
        $out = & $EnginePath -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $Sb.Code $Script) @ScriptArgs 2>&1 | Out-String
        $code = $LASTEXITCODE
    } finally { Remove-Item Env:\ISO_MOCK_SANDBOX, Env:\ISO_MOCK_SCENARIO, Env:\ISO_MOCK_PHASE -ErrorAction SilentlyContinue }
    [pscustomobject]@{ exit = $code; out = $out }
}
function Invoke-Apply { param($Sb) Invoke-Entry $Sb 'apply' 'Initialize-Isolation.ps1' @('-PreflightDir', $Sb.RunDir, '-ConfirmSnapshot', $Sb.Hash12, '-Apply') }
# 장벽 한도(-RulesMs)와 장벽 뒤 감시(-SettleMs)도 줄여서 시험을 빠르게 한다(줄이는 것만 허용된다).
$GOODLIM = @('-TotalMs', '20000', '-InitMs', '8000', '-RulesMs', '8000', '-SettleMs', '400', '-ExitMs', '6000', '-StdinCloseGraceMs', '3000', '-KillConfirmMs', '3000', '-StartAllowanceMs', '15000', '-SupervisorGraceMs', '5000')
$FASTLIM = @('-TotalMs', '3000', '-InitMs', '1500', '-RulesMs', '1500', '-SettleMs', '300', '-ExitMs', '1000', '-StdinCloseGraceMs', '800', '-KillConfirmMs', '1500', '-StartAllowanceMs', '4000', '-SupervisorGraceMs', '2000')
$BARLIM = @('-TotalMs', '20000', '-InitMs', '8000', '-RulesMs', '1500', '-SettleMs', '400', '-ExitMs', '6000', '-StdinCloseGraceMs', '1500', '-KillConfirmMs', '5000', '-StartAllowanceMs', '15000', '-SupervisorGraceMs', '5000')
function Invoke-Rules {
    param($Sb, [switch]$Dry, [string]$StubScenario = 'ok', [string[]]$Limits = $GOODLIM, [switch]$NoTools, [string[]]$Extra = @(), [string]$ExpectedVersion = '9.9.9', [string]$Probe)
    $probeArg = $ProbeFile; if ($Probe) { $probeArg = $Probe }
    $a = @('-RunDir', $Sb.RunDir, '-Mode', 'stub', '-StubScenario', $StubScenario, '-ExpectedVersion', $ExpectedVersion, '-ProbeFile', $probeArg, '-CancelFile', $Sb.Cancel) + $Limits
    if (-not $NoTools -and $toolsReady) { $a += @('-TsxCmd', $TsxCmd, '-ReinterpretCli', $ReinterpretCli); if ($NodeDir) { $a += @('-NodeDir', $NodeDir) } }
    if (-not $Dry) { $a += '-Execute' }
    Invoke-Entry $Sb 'lsp' 'Test-LspRulesObservation.ps1' ($a + $Extra)
}
function Invoke-Recover { param($Sb) Invoke-Entry $Sb 'recover' 'Remove-Isolation.ps1' @('-RunDir', $Sb.RunDir, '-Apply') }
function Get-Fake { param($Sb) $f = Join-Path $Sb.Root 'fake-state.json'; if (Test-Path -LiteralPath $f) { [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-AuditValue { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; Get-Prop $s.audit $FpcGuid }
function Get-UserEnabled { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; $u = Get-Prop $s.users $UserName; if ($null -eq $u) { return $null }; $u.Enabled }
function Get-RunJson { param($Sb, [string]$Filter) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter $Filter -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-RunFile { param($Sb, [string]$Filter) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter $Filter -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { $f.FullName } else { $null } }
function Get-RulesReport { param($Sb) Get-RunJson $Sb 'lsp-rules-observation-*.json' }
function Get-CallsLog { param($Sb) $lf = Join-Path $Sb.Root 'calls.log'; if (-not (Test-Path -LiteralPath $lf)) { return '' }; [IO.File]::ReadAllText($lf) }
# 이 샌드박스가 띄운 프로세스가 남아 있는지(있으면 끝낸다). 남은 개수를 돌려준다.
function Remove-Stragglers {
    param($Sb)
    $left = @(Get-CimInstance Win32_Process -Property ProcessId, CommandLine -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($Sb.Root, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    foreach ($p in $left) { Stop-Process -Id ([int]$p.ProcessId) -Force -ErrorAction SilentlyContinue }
    $left.Count
}
function New-RulesSandbox { param([hashtable]$Lsp = @{}, [hashtable]$Top = @{}) $sc = @{ lsp = $Lsp }; foreach ($k in $Top.Keys) { $sc[$k] = $Top[$k] }; $sb = New-Sandbox -Scenario $sc; $r = Invoke-Apply $sb; if ($r.exit -ne 0) { throw "적용 단계가 실패했다(exit $($r.exit)): $($r.out)" }; $sb }
$RulesWorkOf = { param($Sb) Join-Path $Sb.WorkDir 'work\lsp-rules' }

# ── 정상 대조군 ───────────────────────────────────────────────────────────
if (Test-Selected 'control') {
    Write-Host '[control] 정상 흐름(진짜 러너 + 스텁 서버, 모의 시스템)'
    if (-not $toolsReady) { Skip-That 'control' 'TS 재해석 도구(-TsxCmd)가 없다: 관측 성립 판정을 확인할 수 없다' }
    else {
        $sb = New-RulesSandbox
        $auditBefore = Get-AuditValue $sb
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        $Script:Control = [pscustomobject]@{ Sb = $sb; Out = $r }
        $E = $Script:LrProbeSha256
        Assert-That 'control' '종료 코드 0' ($r.exit -eq 0) "exit=$($r.exit)`n$($r.out)"
        Assert-That 'control' '판정 STUB_RULES_LOAD_OBSERVED' ((Get-Prop $rep 'verdict') -ceq 'STUB_RULES_LOAD_OBSERVED') (Get-Prop $rep 'verdict')
        Assert-That 'control' '관측 성립: 재해석 기록 상태 OBSERVED, 판정 RULES_LOAD_OBSERVED, 종료 경로(trigger) NORMAL, 서버를 띄웠다(runnerLaunched)' (((Get-Prop $rep 'observation.established') -eq $true) -and ((Get-Prop $rep 'observation.recordStatus') -ceq 'OBSERVED') -and ((Get-Prop $rep 'observation.recordVerdict') -ceq 'RULES_LOAD_OBSERVED') -and ((Get-Prop $rep 'observation.trigger') -ceq 'NORMAL') -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $true) -and ($null -eq (Get-Prop $rep 'observation.notAttempted')))
        Assert-That 'control' '결과 결합과 신원 교차 확인이 통과' (((Get-Prop $rep 'binding.ok') -eq $true) -and ((Get-Prop $rep 'identity.ok') -eq $true) -and ((Get-Prop $rep 'binding.resultState') -eq 'ACCEPTED'))
        Assert-That 'control' '토큰이 RunId 를 담는다' ([string](Get-Prop $rep 'runToken')).StartsWith("lsp-$RunId-")
        Assert-That 'control' '수신기: 기준 0, 최종 0, 읽기 실패 0' (((Get-Prop $rep 'receiver.baselineHits') -eq 0) -and ((Get-Prop $rep 'receiver.finalHits') -eq 0) -and ((Get-Prop $rep 'receiver.failures') -eq 0) -and ((Get-Prop $rep 'receiver.samples') -ge 2))
        Assert-That 'control' '감독은 개입하지 않았다(중단 요청·강제 종료 없음)' (((Get-Prop $rep 'supervisor.forcedKill') -eq $false) -and ($null -eq (Get-Prop $rep 'supervisor.abortReason')))
        Assert-That 'control' '보낸 것은 initialize, initialized(정확히 1회), shutdown, exit 순서다' (((Get-List $rep 'runnerResult.sentLabels') -join ',') -ceq 'initialize,initialized,shutdown,exit') ((Get-List $rep 'runnerResult.sentLabels') -join ',')
        Assert-That 'control' 'initialized 는 정확히 1번 갔다' ((Get-Prop $rep 'runnerResult.initializedCount') -eq 1)
        Assert-That 'control' '프로브 해시: 문맥에 실린 원본·복사 직후·실행 뒤가 모두 고정값이다' (((Get-Prop $rep 'probe.contextValues.sourceSha256') -ceq $E) -and ((Get-Prop $rep 'probe.contextValues.afterCopySha256') -ceq $E) -and ((Get-Prop $rep 'probe.contextValues.afterRunSha256') -ceq $E))
        Assert-That 'control' '관리자 사후 확인: 읽어도 되는지 확인했고(링크 없음), 규칙 폴더의 프로브를 직접 다시 읽어 잰 해시가 고정값이며, 작업 영역은 비고 규칙 폴더는 프로브 하나뿐이다' (((Get-Prop $rep 'adminPostRun.readAllowed') -eq $true) -and ((Get-Prop $rep 'adminPostRun.probe.sha256') -ceq $E) -and ((Get-List $rep 'adminPostRun.roots.WORKSPACE').Count -eq 0) -and ((Get-List $rep 'adminPostRun.roots.RULES_DIR') -join ',') -ceq 'lsp-rules-1-probe.yaml')
        $probeOnDisk = Join-Path $sb.WorkDir 'work\lsp-rules\lsp-state\rules-probe\lsp-rules-1-probe.yaml'
        Assert-That 'control' '디스크: 규칙 폴더에는 프로브 한 개뿐이고 바이트가 고정 해시와 같다' ((Test-Path -LiteralPath $probeOnDisk) -and (@(Get-ChildItem -LiteralPath (Split-Path $probeOnDisk -Parent) -Force).Count -eq 1) -and ((Get-LrSha256Hex ([IO.File]::ReadAllBytes($probeOnDisk))) -ceq $E))
        Assert-That 'control' '설치물(띄운 실행 파일) 해시는 실행 전후로 같고 모두 유효한 해시다' (((Get-Prop $rep 'hashes.unchanged') -eq $true) -and ((Get-Prop $rep 'hashes.before.launchedExe') -ceq (Get-Prop $rep 'hashes.after.launchedExe')) -and ([string](Get-Prop $rep 'hashes.before.launchedExe')).Length -eq 64)
        Assert-That 'control' '세 결과가 따로 있고 모두 성공' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and ((Get-Prop $rep 'observation.established') -eq $true))
        Assert-That 'control' '5157: 수집이 확실하므로 건수는 숫자 0 이고 루프백 건수도 따로 있다' (((Get-Prop $rep 'osBlockObservation.countsUsable') -eq $true) -and ((Get-Prop $rep 'osBlockObservation.attributedCount') -eq 0) -and ((Get-Prop $rep 'osBlockObservation.unidentifiedCount') -eq 0) -and ((Get-Prop $rep 'osBlockObservation.loopbackHits') -eq 0))
        $envNames = Get-List $rep 'request.envNames'
        Assert-That 'control' '요청의 환경 이름은 11개 그대로이고 SEMGREP_LOG_SRCS·토큰·SEMGREP_ENABLE_* 가 없다(소유자 결정 D5), 자기 점검 문제 없음' (($envNames.Count -eq 11) -and (@($envNames | Where-Object { $_ -match 'LOG_SRCS|TOKEN|ENABLE_|PROXY' }).Count -eq 0) -and ((Get-List $rep 'request.selfCheckProblems').Count -eq 0))
        Assert-That 'control' '요청의 한도는 열 개이고 장벽 한도·장벽 뒤 감시를 담는다(줄인 값)' (((Get-Prop $rep 'request.limits.rulesMs') -eq 8000) -and ((Get-Prop $rep 'request.limits.settleMs') -eq 400) -and ((Get-Prop $rep 'request.limits.totalMs') -eq 20000))
        $reqOnDisk = Get-Content -LiteralPath (Join-Path $sb.WorkDir 'work\lsp-rules-request.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        Assert-That 'control' '디스크의 요청: 프로브 바이트(233바이트로 풀린다)와 기대 버전, 같은 토큰을 담는다' (([Convert]::FromBase64String([string]$reqOnDisk.probeB64).Length -eq 233) -and ($reqOnDisk.expectedVersion -eq '9.9.9') -and ([string]$reqOnDisk.runToken -ceq [string](Get-Prop $rep 'runToken')))
        Assert-That 'control' '정리: 감사 값 복구, 계정 비활성화' (((Get-AuditValue $sb) -eq $auditBefore) -and ((Get-UserEnabled $sb) -eq $false))
        Assert-That 'control' '원시 stdout·stderr, 러너 결과 원문, 문맥, 기록 파일이 실행 기록 폴더에 하나씩 있다' ((@(Get-ChildItem $sb.RunDir -Filter 'lsp-rules-stdout-*.bin').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-rules-stderr-*.bin').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-rules-runner-result-*.json').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-rules-admin-context-*.json').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-rules-record-*.json').Count -eq 1))
        $rrPath = Get-RunFile $sb 'lsp-rules-runner-result-*.json'
        Assert-That 'control' '보고서의 러너 결과 해시가 보관한 원문과 같다' ((Get-Prop $rep 'runnerResult.sha256') -ceq (Get-LrSha256Hex ([IO.File]::ReadAllBytes($rrPath))))
        $ctxDoc = Get-RunJson $sb 'lsp-rules-admin-context-*.json'
        Assert-That 'control' '문맥 파일: 스키마, runnerLaunched=true, 작업 폴더가 규칙 작업 배치, 프로브 해시 셋, 한도 열 개' (((Get-Prop $ctxDoc 'schema') -eq 'lsp-rules-admin-context/1') -and ((Get-Prop $ctxDoc 'runnerLaunched') -eq $true) -and ((Get-Prop $ctxDoc 'work') -eq (& $RulesWorkOf $sb)) -and ((Get-Prop $ctxDoc 'probe.afterRunSha256') -ceq $E) -and (@((Get-Prop $ctxDoc 'limits').PSObject.Properties).Count -eq 10))
        $recDoc = Get-RunJson $sb 'lsp-rules-record-*.json'
        Assert-That 'control' '기록 파일: 상태 OBSERVED, 보낸 순서에 initialized 가 한 번, 프로브 해시 셋이 고정값' (((Get-Prop $recDoc 'record.status') -eq 'OBSERVED') -and ((@(Get-Prop $recDoc 'record.sent') | ForEach-Object { $_.label }) -join ',') -ceq 'initialize,initialized,shutdown,exit' -and ((Get-Prop $recDoc 'record.probe.after_run_sha256') -ceq $E))
        Assert-That 'control' '호출 기록: 진짜 러너는 stub 모드로 한 번만 띄웠고 MOCK GUARD 가 없다' (([regex]::Matches((Get-CallsLog $sb), 'LspRunner kind=real')).Count -eq 1 -and (Get-CallsLog $sb) -notmatch 'MOCK GUARD')
        $recover = Invoke-Recover $sb
        Assert-That 'control' '이어서 복구 스크립트가 정상 종료(0)' ($recover.exit -eq 0) "exit=$($recover.exit)"
        Assert-That 'control' '남은 프로세스 없음' ((Remove-Stragglers $sb) -eq 0)
    }
}

# ── dry-run ───────────────────────────────────────────────────────────────
if (Test-Selected 'dry-run') {
    Write-Host '[dry-run] -Execute 없이는 상태를 바꾸지 않는다'
    $sb = New-RulesSandbox
    $fake0 = [IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json'))
    $log0 = (Get-CallsLog $sb).Split("`n").Count
    $r = Invoke-Rules $sb -Dry
    Assert-That 'dry-run' '종료 코드 0, NOT_EXECUTED' (($r.exit -eq 0) -and ($r.out -match 'NOT_EXECUTED')) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'dry-run' '모의 상태(계정·규칙·감사)가 그대로' ([IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json')) -eq $fake0)
    $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
    Assert-That 'dry-run' '새 호출 기록에 계정 켜기·감사 설정·러너 실행·프로세스 시작·종료·중단 파일이 없다' ($new -notmatch 'Enable-LocalUser|Invoke-AuditPol /set|LspRunner|Start-Process|Stop-Process|Write-LspMinAbortFile|Remove-Item|Copy-Item|New-Item') $new
    Assert-That 'dry-run' '보고서·요청·결과·중단 파일·작업 배치·문맥을 만들지 않았다' (($null -eq (Get-RulesReport $sb)) -and -not (Test-Path (Join-Path $sb.WorkDir 'work\lsp-rules-request.json')) -and -not (Test-Path (Join-Path $sb.WorkDir 'work\lsp-rules-abort.flag')) -and -not (Test-Path (& $RulesWorkOf $sb)) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-rules-*').Count -eq 0))
    Assert-That 'dry-run' '프로브 원본을 확인했고(P01 PASS) 설치물 해시를 읽었다(A01 PASS), 계획 줄이 initialized 를 한 번이라고 말한다' (($r.out -match '\[PASS\] P01 ') -and ($r.out -match '\[PASS\] A01 ') -and ($r.out -match 'initialized\(정확히 1회'))
    Assert-That 'dry-run' '감독 마감 계획이 출력된다' ($r.out -match '부모 감독')
    Assert-That 'dry-run' '자식 프로세스를 띄우지 않았다' ((Remove-Stragglers $sb) -eq 0)
}

# ── 방화벽 규칙이 생성 계약과 다르면 변경 전에 거절한다(사전 조건 T04) ─────────────────────
# 거절 사례는 계정 켜기·감사 변경·수신기·러너 실행 어느 것보다 앞에서 멈춘다(종료 50). 한 샌드박스를 쓰고, 사례마다 모의 상태의 규칙 레코드만 고쳤다가 원래대로 되돌린다.
if (Test-Selected 'rule-contract') {
    Write-Host '[rule-contract] 규칙이 생성 계약과 다르면(계정 SID 부분 일치·일부 프로필만·프로그램/프로토콜/포트 제한 …) T04 가 실패하고 아무것도 바꾸지 않는다'
    $sb = New-RulesSandbox
    $fakePath = Join-Path $sb.Root 'fake-state.json'
    $orig = [IO.File]::ReadAllText($fakePath, [Text.Encoding]::UTF8)
    $ruleName = "bosang-semgrep-iso-$RunId-out"
    $acctSid = [string](($orig | ConvertFrom-Json).users.PSObject.Properties[$UserName].Value.Sid)
    $setRule = {
        param([hashtable]$Fields)
        $fs = $orig | ConvertFrom-Json
        $rule = $fs.rules.PSObject.Properties[$ruleName].Value
        foreach ($k in $Fields.Keys) { $rule | Add-Member -NotePropertyName $k -NotePropertyValue $Fields[$k] -Force }
        $t = ($fs | ConvertTo-Json -Depth 10)
        [IO.File]::WriteAllText($fakePath, $t, $Utf8)
        $t
    }
    $v6 = '::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
    $v4a = '0.0.0.0-126.255.255.255'; $v4b = '128.0.0.0-255.255.255.255'
    $other = 'S-1-5-21-1-2-3-4'
    $reject = @(
        @{ id = 'sid-suffix'; fields = @{ LocalUser = "D:(A;;CC;;;${acctSid}0)" }; token = 'localuser: ACE_SID_MISMATCH'; both = $true },
        @{ id = 'sid-prefix'; fields = @{ LocalUser = ('D:(A;;CC;;;{0})' -f $acctSid.Substring(0, $acctSid.Length - 1)) }; token = 'localuser: ACE_SID_MISMATCH' },
        @{ id = 'sid-other'; fields = @{ LocalUser = "D:(A;;CC;;;$other)" }; token = 'localuser: ACE_SID_MISMATCH' },
        @{ id = 'two-aces'; fields = @{ LocalUser = "D:(A;;CC;;;$acctSid)(A;;CC;;;$other)" }; token = 'localuser: SDDL_ACE_COUNT' },
        @{ id = 'deny-ace'; fields = @{ LocalUser = "D:(D;;CC;;;$acctSid)" }; token = 'localuser: ACE_TYPE' },
        @{ id = 'extra-right'; fields = @{ LocalUser = "D:(A;;CCRC;;;$acctSid)" }; token = 'localuser: ACE_MASK' },
        @{ id = 'inherit-flag'; fields = @{ LocalUser = "D:(A;CI;CC;;;$acctSid)" }; token = 'localuser: ACE_FLAGS' },
        @{ id = 'condition-ace'; fields = @{ LocalUser = "D:(XA;;CC;;;$acctSid;(@User.x==1))" }; token = 'localuser: (ACE_TYPE|SDDL_UNPARSEABLE)' },
        @{ id = 'owner-present'; fields = @{ LocalUser = "O:LSD:(A;;CC;;;$acctSid)" }; token = 'localuser: SDDL_OWNER_OR_GROUP' },
        @{ id = 'dacl-flags'; fields = @{ LocalUser = "D:P(A;;CC;;;$acctSid)" }; token = 'localuser: SDDL_FLAGS' },
        @{ id = 'localuser-any'; fields = @{ LocalUser = 'Any' }; token = 'localuser: LOCALUSER_ANY' },
        @{ id = 'localuser-empty'; fields = @{ LocalUser = '' }; token = 'localuser: LOCALUSER_MISSING' },
        @{ id = 'sddl-unparseable'; fields = @{ LocalUser = 'D:(A;;CC;;;' }; token = 'localuser: SDDL_UNPARSEABLE' },
        @{ id = 'profile-private'; fields = @{ Profile = 'Private' }; token = 'profile: '; both = $true },
        @{ id = 'profile-two'; fields = @{ Profile = 'Domain, Private' }; token = 'profile: ' },
        @{ id = 'profile-extra-token'; fields = @{ Profile = 'Domain, Private, Public, NotApplicable' }; token = 'profile: ' },
        @{ id = 'program'; fields = @{ Program = 'C:\Windows\System32\curl.exe' }; token = 'program: '; both = $true },
        @{ id = 'package'; fields = @{ Package = 'Microsoft.Example_8wekyb3d8bbwe' }; token = 'package: ' },
        @{ id = 'service'; fields = @{ Service = 'dnscache' }; token = 'service: ' },
        @{ id = 'protocol'; fields = @{ Protocol = 'TCP' }; token = 'protocol: '; both = $true },
        @{ id = 'local-port'; fields = @{ LocalPort = '443' }; token = 'localport: ' },
        @{ id = 'remote-port'; fields = @{ RemotePort = '443' }; token = 'remoteport: '; both = $true },
        @{ id = 'icmp-type'; fields = @{ IcmpType = '8' }; token = 'icmptype: ' },
        @{ id = 'dynamic-target'; fields = @{ DynamicTarget = 'WifiDirectPrinting' }; token = 'dynamictarget: ' },
        @{ id = 'local-address'; fields = @{ LocalAddress = 'LocalSubnet' }; token = 'localaddress: ' },
        @{ id = 'interface-alias'; fields = @{ InterfaceAlias = 'Wi-Fi' }; token = 'interfacealias: ' },
        @{ id = 'interface-type'; fields = @{ InterfaceType = 'Wireless' }; token = 'interfacetype: ' },
        @{ id = 'remote-user'; fields = @{ RemoteUser = 'D:(A;;CC;;;BA)' }; token = 'remoteuser: ' },
        @{ id = 'remote-machine'; fields = @{ RemoteMachine = 'D:(A;;CC;;;BA)' }; token = 'remotemachine: ' },
        @{ id = 'auth-required'; fields = @{ Authentication = 'Required' }; token = 'authentication: ' },
        @{ id = 'encryption-required'; fields = @{ Encryption = 'Required' }; token = 'encryption: ' },
        @{ id = 'override-block'; fields = @{ OverrideBlockRules = $true }; token = 'overrideblockrules: ' },
        @{ id = 'remote-no-v6'; fields = @{ RemoteAddress = @($v4a, $v4b) }; token = 'remote: ' },
        @{ id = 'remote-any'; fields = @{ RemoteAddress = @('Any') }; token = 'remote: ' },
        @{ id = 'remote-includes-loopback'; fields = @{ RemoteAddress = @($v4a, $v4b, $v6, '127.0.0.1') }; token = 'remote: ' },
        @{ id = 'disabled'; fields = @{ Enabled = 'False' }; token = 'enabled: ' },
        @{ id = 'allow-action'; fields = @{ Action = 'Allow' }; token = 'action: ' },
        @{ id = 'inbound'; fields = @{ Direction = 'Inbound' }; token = 'direction: ' },
        @{ id = 'other-description'; fields = @{ Description = 'someone else' }; token = 'description: ' },
        @{ id = 'other-group'; fields = @{ Group = 'other-group' }; token = 'group: ' },
        @{ id = 'read-fail-application'; fields = @{ ReadFail = @('ApplicationFilter') }; token = '규칙을 읽지 못했다' },
        @{ id = 'read-fail-port'; fields = @{ ReadFail = @('PortFilter') }; token = '규칙을 읽지 못했다' },
        @{ id = 'read-fail-interface-type'; fields = @{ ReadFail = @('InterfaceTypeFilter') }; token = '규칙을 읽지 못했다' },
        @{ id = 'read-fail-security'; fields = @{ ReadFail = @('SecurityFilter') }; token = '규칙을 읽지 못했다' }
    )
    foreach ($c in $reject) {
        $modes = @($true); if ($c.ContainsKey('both') -and $c.both) { $modes = @($true, $false) }
        foreach ($dry in $modes) {
            $edited = & $setRule $c.fields
            $log0 = (Get-CallsLog $sb).Split("`n").Count
            $r = $(if ($dry) { Invoke-Rules $sb -Dry } else { Invoke-Rules $sb })
            $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
            $label = "rule-contract-$($c.id)" + $(if ($dry) { '' } else { '-execute' })
            Assert-That $label 'T04 가 실패하고 종료 50 이며 원인 이름이 출력에 있다' (($r.exit -eq 50) -and ($r.out -match '\[FAIL\] T04 ') -and ($r.out -match $c.token)) "exit=$($r.exit)`n$($r.out)"
            Assert-That $label '계정 켜기·감사 변경·러너 실행·프로세스 시작·종료가 없고, 모의 상태가 그대로이며, 계획 줄·보고서도 없다(변경 전 거절)' (($new -notmatch 'Enable-LocalUser|Disable-LocalUser|Invoke-AuditPol /set|LspRunner|Start-Process|Stop-Process') -and ([IO.File]::ReadAllText($fakePath) -eq $edited) -and ($null -eq (Get-RulesReport $sb)) -and ($r.out -notmatch 'PLAN') -and ($r.out -notmatch 'NOT_EXECUTED')) $new
        }
        [IO.File]::WriteAllText($fakePath, $orig, $Utf8)
    }
    # 규칙이 아예 없다
    $fsNo = $orig | ConvertFrom-Json
    [void]$fsNo.rules.PSObject.Properties.Remove($ruleName)
    [IO.File]::WriteAllText($fakePath, ($fsNo | ConvertTo-Json -Depth 10), $Utf8)
    $r = Invoke-Rules $sb -Dry
    Assert-That 'rule-contract-missing-rule' '규칙이 없으면 T04 실패, 종료 50' (($r.exit -eq 50) -and ($r.out -match '\[FAIL\] T04 ') -and ($r.out -match '규칙이 없다')) "exit=$($r.exit)`n$($r.out)"
    [IO.File]::WriteAllText($fakePath, $orig, $Utf8)

    # 정상 대조군과 동등 표기: 계약과 같은 의미면 통과한다(dry-run 이라 아무것도 바꾸지 않는다)
    $accept = @(
        @{ id = 'exact'; fields = @{} },
        @{ id = 'profile-all-three'; fields = @{ Profile = 'Domain, Private, Public' } },
        @{ id = 'profile-order'; fields = @{ Profile = 'Public, Domain, Private' } },
        @{ id = 'package-any'; fields = @{ Package = 'Any' } },
        @{ id = 'remote-order'; fields = @{ RemoteAddress = @($v6, $v4b, $v4a) } },
        @{ id = 'remote-upper'; fields = @{ RemoteAddress = @($v4a, $v4b, $v6.ToUpperInvariant()) } },
        @{ id = 'sddl-space'; fields = @{ LocalUser = "D: (A;;CC;;;$acctSid)" } }
    )
    foreach ($c in $accept) {
        $edited = & $setRule $c.fields
        $fake0 = [IO.File]::ReadAllText($fakePath)
        $r = Invoke-Rules $sb -Dry
        Assert-That "rule-contract-accept-$($c.id)" 'T04 통과, dry-run 종료 0(NOT_EXECUTED), 모의 상태 그대로' (($r.exit -eq 0) -and ($r.out -match '\[PASS\] T04 ') -and ($r.out -match 'NOT_EXECUTED') -and ([IO.File]::ReadAllText($fakePath) -eq $fake0)) "exit=$($r.exit)`n$($r.out)"
        [IO.File]::WriteAllText($fakePath, $orig, $Utf8)
    }
    [void](Remove-Stragglers $sb)
}

# ── 도구 없음 ─────────────────────────────────────────────────────────────
if (Test-Selected 'no-tools') {
    Write-Host '[no-tools] 재해석 도구가 없으면 관측은 성립하지 않는다(자기 보고만으로는 성립시키지 않는다)'
    $sb = New-RulesSandbox
    $r = Invoke-Rules $sb -NoTools
    $rep = Get-RulesReport $sb
    Assert-That 'no-tools' '종료 60, REINTERPRETATION_NOT_RUN, 판정 STUB_NOT_OBSERVED:REINTERPRETATION_NOT_RUN' (($r.exit -eq 60) -and ((Get-Prop $rep 'observation.failure') -eq 'REINTERPRETATION_NOT_RUN') -and ((Get-Prop $rep 'verdict') -ceq 'STUB_NOT_OBSERVED:REINTERPRETATION_NOT_RUN') -and ((Get-Prop $rep 'reinterpretation.reason') -eq 'TOOLS_MISSING')) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
    Assert-That 'no-tools' '러너는 실행됐고 결합·신원은 통과했으며 정리도 끝났다(서버를 띄운 사실은 지워지지 않는다)' (((Get-Prop $rep 'binding.ok') -eq $true) -and ((Get-Prop $rep 'identity.ok') -eq $true) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $true))
    [void](Remove-Stragglers $sb)
}

# ── 서버를 띄우지 못한 경우(NOT_ATTEMPTED) ─────────────────────────────────
if (Test-Selected 'not-launched') {
    Write-Host '[not-launched] 서버를 띄우지 못한 경우만 NOT_ATTEMPTED 이고 runnerLaunched=false 다'
    $sb = New-RulesSandbox @{ receiverNotReady = $true }
    $before = Get-AuditValue $sb
    $r = Invoke-Rules $sb
    $rep = Get-RulesReport $sb
    $log = Get-CallsLog $sb
    Assert-That 'receiver-not-ready' '판정 STUB_NOT_ATTEMPTED:RECEIVER_NOT_READY, 종료 60, runnerLaunched=false' (($r.exit -eq 60) -and ((Get-Prop $rep 'verdict') -ceq 'STUB_NOT_ATTEMPTED:RECEIVER_NOT_READY') -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $false)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
    Assert-That 'receiver-not-ready' '계정을 켜지 않았고 감사 창도 열지 않았으며 러너도 띄우지 않았다' (($log -notmatch 'Enable-LocalUser|LspRunner') -and ((Get-AuditValue $sb) -eq $before) -and ((Get-UserEnabled $sb) -eq $false))
    Assert-That 'receiver-not-ready' '정리는 끝났다' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
    if ($toolsReady) {
        $ctxDoc = Get-RunJson $sb 'lsp-rules-admin-context-*.json'
        Assert-That 'receiver-not-ready' '문맥에 runnerLaunched=false 와 사유가 실리고, 재해석 기록은 NOT_ATTEMPTED 다(러너 결과 파일 없이도 기록을 만든다)' (((Get-Prop $ctxDoc 'runnerLaunched') -eq $false) -and ((Get-List $ctxDoc 'refusals') -contains 'RECEIVER_NOT_READY') -and ((Get-Prop $rep 'reinterpretation.recordStatus') -eq 'NOT_ATTEMPTED') -and ((Get-Prop $rep 'observation.recordVerdict') -ceq 'NOT_ATTEMPTED:RECEIVER_NOT_READY')) "status=$(Get-Prop $rep 'reinterpretation.recordStatus') verdict=$(Get-Prop $rep 'observation.recordVerdict')"
    }
    # 계정을 켠 뒤 러너를 띄우지 못함
    $sb = New-RulesSandbox @{ startProcessFails = $true }
    $before = Get-AuditValue $sb
    $r = Invoke-Rules $sb
    $rep = Get-RulesReport $sb
    $log = Get-CallsLog $sb
    Assert-That 'start-fails' '러너를 띄우지 못하면 판정 STUB_NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED, 종료 60, runnerLaunched=false (러너 실행을 시도했지만 프로세스를 얻지 못했다)' (($r.exit -eq 60) -and ((Get-Prop $rep 'verdict') -ceq 'STUB_NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED') -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $false)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')`n$($r.out)"
    Assert-That 'start-fails' '계정은 켰다가 다시 껐고 감사 값은 복구됐으며 정리는 완료다. 러너는 어느 것도 실행되지 않았다' (($log -match 'Enable-LocalUser') -and ($log -notmatch 'LspRunner kind=') -and ((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq $before) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
    Assert-That 'start-fails' '오류 문구가 보고서에 남는다' ([string](Get-Prop $rep 'error') -match '러너를 띄울 수 없다')
    [void](Remove-Stragglers $sb)
}

# ── 띄운 뒤의 신원·결합·토큰 실패: 실행 사실을 지우지 않는다(NOT_OBSERVED) ──────────
if (Test-Selected 'identity') {
    Write-Host '[identity] 띄운 뒤 관리자 CIM 과 러너 자기 보고가 어긋나면 NOT_OBSERVED 이고 서버를 띄운 사실은 남는다'
    $alt = 'S-1-5-21-9-9-9-9'
    $cases = @(
        @{ id = 'child-owner'; knob = @{ identity = @{ role = 'child'; field = 'ownerSid'; value = $alt } }; code = 'CHILD_OWNER_MISMATCH' },
        @{ id = 'runner-owner'; knob = @{ identity = @{ role = 'runner'; field = 'ownerSid'; value = $alt } }; code = 'RUNNER_OWNER_MISMATCH' },
        @{ id = 'child-exe'; knob = @{ identity = @{ role = 'child'; field = 'exePath'; value = 'C:\Evil\other.exe' } }; code = 'CHILD_EXE_MISMATCH'; also = 'DESCENDANT_PATH_UNEXPECTED' },
        @{ id = 'child-cmdline'; knob = @{ identity = @{ role = 'child'; field = 'commandLine'; value = 'C:\x.exe --other' } }; code = 'CHILD_COMMANDLINE_MISMATCH' },
        @{ id = 'child-start'; knob = @{ identity = @{ role = 'child'; field = 'startShiftSec'; value = 30 } }; code = 'CHILD_START_MISMATCH' },
        @{ id = 'self-sid'; knob = @{ resultEdit = @{ set = @(@{ path = 'runner.sid'; value = $alt }) } }; code = 'SELF_SID_MISMATCH' },
        @{ id = 'self-pid'; knob = @{ resultEdit = @{ set = @(@{ path = 'runner.pid'; value = 1 }) } }; code = 'SELF_PID_MISMATCH' })
    foreach ($c in $cases) {
        $sb = New-RulesSandbox $c.knob
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        $codes = @(Get-Prop $rep 'identity.failures' | ForEach-Object { $_.code })
        Assert-That "identity-$($c.id)" "코드 $($c.code) 로 신원 교차 확인 실패, 종료 60, 관측 불성립, 실패 토큰 IDENTITY_UNVERIFIED" (($r.exit -eq 60) -and ($codes -contains $c.code) -and ((Get-Prop $rep 'identity.ok') -eq $false) -and ((Get-Prop $rep 'observation.established') -eq $false) -and ((Get-List $rep 'observation.failures') -contains 'IDENTITY_UNVERIFIED')) "exit=$($r.exit) codes=$($codes -join ',')`n$($r.out)"
        Assert-That "identity-$($c.id)" '서버를 띄운 사실이 남는다: 판정은 NOT_ATTEMPTED 가 아니라 NOT_OBSERVED 이고, runnerLaunched=true, 러너가 initialized 를 보낸 기록이 있다' (((Get-Prop $rep 'verdict') -clike 'STUB_NOT_OBSERVED:*') -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $true) -and ($null -eq (Get-Prop $rep 'observation.notAttempted')) -and ((Get-Prop $rep 'runnerResult.initializedCount') -eq 1)) "verdict=$(Get-Prop $rep 'verdict')"
        if ($c.ContainsKey('also')) { Assert-That "identity-$($c.id)" "허용 폴더 밖 후손도 $($c.also) 로 남는다" ((Get-List $rep 'observation.failures') -contains $c.also) }
        if ($toolsReady) {
            $recDoc = Get-RunJson $sb 'lsp-rules-record-*.json'
            Assert-That "identity-$($c.id)" '재해석 기록도 관리자 신원 사유(ADMIN_IDENTITY_UNVERIFIED)로 NOT_OBSERVED 이고 기록의 보낸 목록에 initialized 가 있다(실행 사실 보존)' (((Get-Prop $rep 'reinterpretation.recordStatus') -eq 'NOT_OBSERVED') -and ((Get-List $rep 'reinterpretation.adminReasons') -contains 'ADMIN_IDENTITY_UNVERIFIED') -and (@(Get-Prop $recDoc 'record.sent' | ForEach-Object { $_.label }) -contains 'initialized')) "status=$(Get-Prop $rep 'reinterpretation.recordStatus')"
        }
        Assert-That "identity-$($c.id)" '정리는 완료' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
        [void](Remove-Stragglers $sb)
    }
    Write-Host '[binding] 결과가 요청과 맞지 않으면 결합 실패'
    $bcases = @(
        @{ id = 'mode'; edit = @{ set = @(@{ path = 'mode'; value = 'semgrep-lsp' }) }; code = 'MODE_MISMATCH' },
        @{ id = 'echo-exe'; edit = @{ set = @(@{ path = 'request.exe'; value = 'C:\x.exe' }) }; code = 'ECHO_EXE' },
        @{ id = 'echo-rulesMs'; edit = @{ set = @(@{ path = 'request.limits.rulesMs'; value = 7 }) }; code = 'ECHO_LIMIT:rulesMs' },
        @{ id = 'echo-version'; edit = @{ set = @(@{ path = 'request.expectedVersion'; value = '1.0.0' }) }; code = 'ECHO_EXPECTED_VERSION' },
        @{ id = 'old-start'; edit = @{ set = @(@{ path = 'startedUtc'; value = '2020-01-01T00:00:00.0000000Z' }) }; code = 'STARTED_BEFORE_LAUNCH' },
        @{ id = 'kind'; edit = @{ set = @(@{ path = 'kind'; value = 'lsp-min-runner-result' }) }; code = 'RESULT_SCHEMA' },
        @{ id = 'no-echo'; edit = @{ unset = @('request') }; code = 'ECHO_MISSING' })
    foreach ($c in $bcases) {
        $sb = New-RulesSandbox @{ resultEdit = $c.edit }
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        Assert-That "binding-$($c.id)" "결합 실패 $($c.code), 종료 60, 서버를 띄운 사실은 남는다(NOT_OBSERVED)" (($r.exit -eq 60) -and ((Get-List $rep 'binding.failures') -contains $c.code) -and ((Get-Prop $rep 'binding.ok') -eq $false) -and ((Get-List $rep 'observation.failures') -contains 'RESULT_BINDING_FAILED') -and ((Get-Prop $rep 'verdict') -clike 'STUB_NOT_OBSERVED:*')) "exit=$($r.exit) failures=$((Get-List $rep 'binding.failures') -join ',') verdict=$(Get-Prop $rep 'verdict')`n$($r.out)"
        if ($toolsReady) { Assert-That "binding-$($c.id)" '재해석 기록도 ADMIN_BINDING_FAILED 로 막는다' ((Get-List $rep 'reinterpretation.adminReasons') -contains 'ADMIN_BINDING_FAILED') ((Get-List $rep 'reinterpretation.adminReasons') -join ',') }
        [void](Remove-Stragglers $sb)
    }
    $sb = New-RulesSandbox @{ resultEdit = @{ set = @(@{ path = 'runToken'; value = 'lsp-20200101T000000Z-00000000-' + ('0' * 32) }) } }
    $r = Invoke-Rules $sb
    $rep = Get-RulesReport $sb
    Assert-That 'binding-token' '러너가 다른 토큰을 되돌려 쓰면 받아들이지 않는다(TOKEN_MISMATCH): 결과 상태 TOKEN_MISMATCH, 결합·신원 실패, 이 결과는 판정에 쓰지 않는다' (($r.exit -eq 60) -and ((Get-Prop $rep 'binding.resultState') -eq 'TOKEN_MISMATCH') -and ((Get-List $rep 'binding.failures') -contains 'TOKEN_MISMATCH') -and ((Get-Prop $rep 'identity.ok') -eq $false) -and ($null -eq (Get-Prop $rep 'runnerResult')) -and ((Get-Prop $rep 'observation.established') -eq $false)) "exit=$($r.exit)`n$($r.out)"
    [void](Remove-Stragglers $sb)
}

# ── 프로브 해시: 원본·복사 직후·실행 뒤·관리자 재확인 ─────────────────────────────
if (Test-Selected 'probe') {
    Write-Host '[probe] 프로브 규칙 해시 — 원본(관리자), 복사 직후(러너), 실행 뒤(러너 + 관리자 재확인)'
    $E = $Script:LrProbeSha256
    # 원본이 고정값과 다르면 아무것도 만들기 전에 거절한다.
    if ($null -eq $probeBytes) { Skip-That 'probe-source' "프로브 원본이 없어 변조 사본을 만들지 못했다: $ProbeFile" }
    else {
        $sb = New-RulesSandbox
        $tam = Join-Path $sb.Root 'tampered-probe.yaml'; $tb = [byte[]]$probeBytes.Clone(); $tb[7] = $tb[7] -bxor 1; [IO.File]::WriteAllBytes($tam, $tb)
        $fake0 = [IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json')); $log0 = (Get-CallsLog $sb).Split("`n").Count
        $rx = Invoke-Rules $sb -Probe $tam
        $rd = Invoke-Rules $sb -Dry -Probe $tam
        $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
        Assert-That 'probe-source' '원본의 한 바이트가 다르면 -Execute 도 dry-run 도 사전 조건 P01 실패, 종료 50' (($rx.exit -eq 50) -and ($rx.out -match '\[FAIL\] P01 ') -and ($rd.exit -eq 50) -and ($rd.out -match '\[FAIL\] P01 ')) "exec=$($rx.exit) dry=$($rd.exit)`n$($rx.out)"
        Assert-That 'probe-source' '아무것도 만들지도 바꾸지도 않았다: 호출 기록에 계정·감사·러너·수신기 변경이 없고, 작업 배치·요청·보고서가 없다' (($new -notmatch 'Enable-LocalUser|Invoke-AuditPol /set|LspRunner|Start-Process|Remove-Item|Copy-Item|New-Item') -and ([IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json')) -eq $fake0) -and ($null -eq (Get-RulesReport $sb)) -and -not (Test-Path (& $RulesWorkOf $sb)) -and -not (Test-Path (Join-Path $sb.WorkDir 'work\lsp-rules-request.json'))) $new
        $rm = Invoke-Rules $sb -Probe (Join-Path $sb.Root 'no-such-probe.yaml')
        Assert-That 'probe-source' '원본 파일이 없어도 P01 실패, 종료 50' (($rm.exit -eq 50) -and ($rm.out -match '\[FAIL\] P01 '))
    }
    if (-not $toolsReady) { Skip-That 'probe' '러너가 보고한 해시 불일치와 관리자 재확인 사례는 판정 전체가 필요해 재해석 도구(-TsxCmd)가 있어야 한다' }
    else {
        $pcases = @(
            @{ id = 'source'; knob = @{ resultEdit = @{ set = @(@{ path = 'probe.sourceSha256'; value = ('0' * 64) }) } }; token = 'PROBE_HASH_NOT_CONFIRMED:sourceSha256'; reason = 'PROBE_SOURCE_HASH_UNEXPECTED'; field = 'sourceSha256' },
            @{ id = 'after-copy'; knob = @{ resultEdit = @{ set = @(@{ path = 'probe.afterCopySha256'; value = ('0' * 64) }) } }; token = 'PROBE_HASH_NOT_CONFIRMED:afterCopySha256'; reason = 'PROBE_COPY_HASH_UNEXPECTED'; field = 'afterCopySha256' },
            @{ id = 'after-run'; knob = @{ resultEdit = @{ set = @(@{ path = 'probe.afterRunSha256'; value = ('0' * 64) }) } }; token = 'PROBE_HASH_NOT_CONFIRMED:afterRunSha256'; reason = 'PROBE_CHANGED_DURING_RUN'; field = 'afterRunSha256' },
            @{ id = 'after-run-unreported'; knob = @{ resultEdit = @{ unset = @('probe.afterRunSha256') } }; token = 'PROBE_HASH_NOT_CONFIRMED:afterRunSha256'; reason = 'PROBE_CHANGED_DURING_RUN'; field = 'afterRunSha256' },
            @{ id = 'admin-reread-fails'; knob = @{ adminProbe = 'fail' }; token = 'PROBE_HASH_NOT_CONFIRMED:afterRunSha256'; reason = 'PROBE_CHANGED_DURING_RUN'; field = 'afterRunSha256' },
            @{ id = 'admin-reread-differs'; knob = @{ adminProbe = 'wrong' }; token = 'PROBE_HASH_NOT_CONFIRMED:afterRunSha256'; reason = 'PROBE_CHANGED_DURING_RUN'; field = 'afterRunSha256' },
            @{ id = 'admin-reread-link'; knob = @{ adminProbe = 'link' }; token = 'POST_RUN_READ_NOT_ALLOWED'; reason = 'PROBE_CHANGED_DURING_RUN'; field = 'afterRunSha256' })
        foreach ($c in $pcases) {
            $sb = New-RulesSandbox $c.knob
            $r = Invoke-Rules $sb
            $rep = Get-RulesReport $sb
            $cv = Get-Prop $rep "probe.contextValues.$($c.field)"
            Assert-That "probe-$($c.id)" "종료 60, 관측 불성립, 실패 토큰 $($c.token), 문맥의 $($c.field) 는 고정값이 아니다(null 이거나 다른 값)" (($r.exit -eq 60) -and ((Get-Prop $rep 'observation.established') -eq $false) -and ((Get-List $rep 'observation.failures') -contains $c.token) -and ($cv -cne $E)) "exit=$($r.exit) ctx=$cv failures=$((Get-List $rep 'observation.failures') -join ',')`n$($r.out)"
            Assert-That "probe-$($c.id)" "재해석 기록도 $($c.reason) 로 성립하지 않는다(NOT_OBSERVED)" (((Get-Prop $rep 'reinterpretation.recordStatus') -ne 'OBSERVED') -and ((Get-List $rep 'reinterpretation.statusReasons') -contains $c.reason)) "status=$(Get-Prop $rep 'reinterpretation.recordStatus') reasons=$((Get-List $rep 'reinterpretation.statusReasons') -join ',')"
            Assert-That "probe-$($c.id)" '정리는 완료' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
            [void](Remove-Stragglers $sb)
        }
        # 관리자가 직접 읽은 감시 폴더 상태(사후)가 러너의 보고와 달라도 성립하지 않는다.
        $rcases = @(
            @{ id = 'workspace-file'; knob = @{ adminProbe = 'workspace-file' }; token = 'ROOT_CHANGED:WORKSPACE' },
            @{ id = 'rules-extra'; knob = @{ adminProbe = 'rules-extra' }; token = 'ROOT_CHANGED:RULES_DIR' },
            @{ id = 'home-unreadable'; knob = @{ adminProbe = 'roots-unreadable' }; token = 'ROOT_UNREADABLE:HOME_DIR' })
        foreach ($c in $rcases) {
            $sb = New-RulesSandbox $c.knob
            $r = Invoke-Rules $sb
            $rep = Get-RulesReport $sb
            Assert-That "roots-$($c.id)" "관리자가 읽은 감시 폴더가 기대와 다르면 $($c.token) 로 성립하지 않는다(읽지 못한 폴더는 깨끗하다고 하지 않는다)" (($r.exit -eq 60) -and ((Get-Prop $rep 'observation.established') -eq $false) -and ((Get-List $rep 'observation.failures') -contains $c.token)) "exit=$($r.exit) failures=$((Get-List $rep 'observation.failures') -join ',')"
            [void](Remove-Stragglers $sb)
        }
        # 스텁 서버가 실행 도중 프로브를 바꾼다: 러너가 A5 로 중단하고, 관리자가 직접 다시 읽은 해시도 달라진 것을 본다.
        $sb = New-RulesSandbox
        $r = Invoke-Rules $sb -StubScenario 'modify-probe'
        $rep = Get-RulesReport $sb
        Assert-That 'probe-modify' '프로브가 바뀌면 ABORTED:A5, 관측 불성립, 관리자가 직접 재서 얻은 해시가 고정값이 아니다' (($r.exit -eq 60) -and ((Get-Prop $rep 'verdict') -ceq 'STUB_ABORTED:A5') -and ((Get-Prop $rep 'adminPostRun.probe.sha256') -cne $E) -and ((Get-Prop $rep 'probe.contextValues.afterRunSha256') -cne $E)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict') admin=$(Get-Prop $rep 'adminPostRun.probe.sha256')`n$($r.out)"
        [void](Remove-Stragglers $sb)
    }
}

# ── 설치물 해시 ───────────────────────────────────────────────────────────
if (Test-Selected 'hash') {
    Write-Host '[hash] 설치물(띄운 실행 파일) 해시가 바뀌었거나 읽지 못하면 성립하지 않는다'
    $hcases = @(
        @{ id = 'changed'; knob = @{ hashChange = 'changed' }; problem = 'CHANGED:launchedExe' },
        @{ id = 'unreadable-after'; knob = @{ hashChange = 'unreadable' }; problem = 'AFTER_UNKNOWN:launchedExe' })
    foreach ($c in $hcases) {
        $sb = New-RulesSandbox $c.knob
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        Assert-That "hash-$($c.id)" "실행 뒤 해시가 $($c.id) 이면 HASH_CHANGED, 대조 문제 $($c.problem), 종료 60, 관측 불성립(읽지 못한 값을 같다고 하지 않는다)" (($r.exit -eq 60) -and ((Get-Prop $rep 'hashes.unchanged') -eq $false) -and ((Get-List $rep 'hashes.problems') -contains $c.problem) -and ((Get-List $rep 'observation.failures') -contains 'HASH_CHANGED') -and ((Get-Prop $rep 'observation.established') -eq $false)) "exit=$($r.exit) problems=$((Get-List $rep 'hashes.problems') -join ',')`n$($r.out)"
        if ($toolsReady) { Assert-That "hash-$($c.id)" '재해석 기록도 ADMIN_HASH_CHANGED 로 막는다' ((Get-List $rep 'reinterpretation.adminReasons') -contains 'ADMIN_HASH_CHANGED') ((Get-List $rep 'reinterpretation.adminReasons') -join ',') }
        Assert-That "hash-$($c.id)" '정리는 완료' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
        [void](Remove-Stragglers $sb)
    }
}

# ── 수신기 적중·읽기 실패·중단 전달 ────────────────────────────────────────
if (Test-Selected 'receiver') {
    Write-Host '[receiver] 적중이면 중단 파일을 전달하고, 읽기 실패와 전달 실패도 기록한다'
    $sb = New-RulesSandbox @{ loopbackHit = $true }
    $r = Invoke-Rules $sb -StubScenario 'silent-hold'
    $rep = Get-RulesReport $sb
    $flagText = ''; $flag = Join-Path $sb.WorkDir 'work\lsp-rules-abort.flag'; if (Test-Path -LiteralPath $flag) { $flagText = ([IO.File]::ReadAllText($flag)).Trim() }
    Assert-That 'receiver' '적중: 종료 60, 수신기 건수가 늘었다' (($r.exit -eq 60) -and ((Get-Prop $rep 'receiver.finalHits') -ge 1) -and ((Get-Prop $rep 'osBlockObservation.loopbackHits') -ge 1)) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'receiver' '적중: 중단 파일 A3:RECEIVER_HIT 가 전달됐다' (($flagText -eq 'A3:RECEIVER_HIT') -and ((Get-Prop $rep 'supervisor.abortFile.delivered') -eq $true) -and ((Get-Prop $rep 'supervisor.abortReason') -eq 'A3:RECEIVER_HIT')) "flag=$flagText"
    Assert-That 'receiver' '적중: 러너가 중단 조건 A3 로 곧바로 끝냈다(관리자가 직접 죽이지 않았다)' ((-not $toolsReady) -or (((Get-Prop $rep 'observation.recordStatus') -eq 'ABORTED') -and ((Get-Prop $rep 'supervisor.forcedKill') -eq $false))) "record=$(Get-Prop $rep 'observation.recordStatus') forced=$(Get-Prop $rep 'supervisor.forcedKill')"
    Assert-That 'receiver' '적중: 실패 토큰에 RECEIVER_HIT, 관측 불성립, 정리는 완료' (((Get-List $rep 'observation.failures') -contains 'RECEIVER_HIT') -and ((Get-Prop $rep 'observation.established') -eq $false) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
    [void](Remove-Stragglers $sb)
    $sb = New-RulesSandbox @{ loopbackHit = 'early' }
    $r = Invoke-Rules $sb -StubScenario 'silent-hold' -Limits $FASTLIM
    $rep = Get-RulesReport $sb
    Assert-That 'receiver-early' '러너 시작 전 적중: 러너가 ABORT_FILE_ALREADY_PRESENT 로 시작을 거절하고 자식을 띄우지 않는다' (($r.exit -eq 60) -and ((Get-List $rep 'runnerResult.refusals') -contains 'ABORT_FILE_ALREADY_PRESENT') -and ($null -eq (Get-Prop $rep 'runnerResult.trigger'))) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'receiver-early' '러너 시작 전 적중: 토큰 RUNNER_REFUSED·RECEIVER_HIT, 관측 불성립, 정리 완료' (((Get-List $rep 'observation.failures') -contains 'RUNNER_REFUSED') -and ((Get-List $rep 'observation.failures') -contains 'RECEIVER_HIT') -and ((Get-Prop $rep 'observation.established') -eq $false) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
    [void](Remove-Stragglers $sb)
    $sb = New-RulesSandbox @{ receiverFailAfter = 2 }
    $r = Invoke-Rules $sb -StubScenario 'silent-hold'
    $rep = Get-RulesReport $sb
    Assert-That 'receiver' '읽기 실패: 폴러 실패가 기록되고 최종 건수는 0 이 아니라 null 이다' (($r.exit -eq 60) -and ((Get-Prop $rep 'receiver.failures') -ge 1) -and ($null -eq (Get-Prop $rep 'receiver.finalHits')) -and ((Get-List $rep 'observation.failures') -contains 'RECEIVER_UNREADABLE')) "exit=$($r.exit) final=$(Get-Prop $rep 'receiver.finalHits')"
    Assert-That 'receiver' '읽기 실패: 중단 A3:RECEIVER_UNREADABLE 이 전달됐고 루프백 건수도 null(0 으로 채우지 않는다)' (((Get-Prop $rep 'supervisor.abortReason') -eq 'A3:RECEIVER_UNREADABLE') -and ((Get-Prop $rep 'supervisor.abortFile.delivered') -eq $true) -and ($null -eq (Get-Prop $rep 'osBlockObservation.loopbackHits')))
    [void](Remove-Stragglers $sb)
    $sb = New-RulesSandbox @{ loopbackHit = $true; abortWriteFails = $true }
    $r = Invoke-Rules $sb -StubScenario 'silent-hold'
    $rep = Get-RulesReport $sb
    Assert-That 'receiver' '전달 실패: 실패가 기록되고 관리자가 전용 계정 프로세스를 직접 끝냈다' (($r.exit -eq 60) -and ((Get-Prop $rep 'supervisor.abortFile.delivered') -eq $false) -and ((Get-Prop $rep 'supervisor.forcedKill') -eq $true) -and ((Get-Prop $rep 'supervisor.forcedKillReason') -eq 'ABORT_DELIVERY_FAILED')) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'receiver' '전달 실패: 토큰 ABORT_DELIVERY_FAILED·SUPERVISOR_FORCED_KILL·RECEIVER_HIT 가 모두 남고, 정리는 끝났다' (((Get-List $rep 'observation.failures') -contains 'ABORT_DELIVERY_FAILED') -and ((Get-List $rep 'observation.failures') -contains 'SUPERVISOR_FORCED_KILL') -and ((Get-List $rep 'observation.failures') -contains 'RECEIVER_HIT') -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and ((Remove-Stragglers $sb) -eq 0))
}

# ── 취소, 러너 정체, 결과 누락·손상·재사용 ───────────────────────────────────
if (Test-Selected 'cancel') {
    Write-Host '[cancel] 취소 표지가 생기면 중단을 전달하고 정리로 간다'
    $sb = New-Sandbox -Scenario @{ lsp = @{} }
    $sc = @{ lsp = @{ cancelFile = (Join-Path $sb.Root 'cancel.flag') } }
    [IO.File]::WriteAllText($sb.ScenarioFile, ($sc | ConvertTo-Json -Depth 4), $Utf8)
    $ap = Invoke-Apply $sb
    $r = Invoke-Rules $sb -StubScenario 'silent-hold'
    $rep = Get-RulesReport $sb
    Assert-That 'cancel' '종료 60, 중단 A7:OPERATOR_CANCEL 이 전달됐고 토큰 OPERATOR_CANCELLED' (($ap.exit -eq 0) -and ($r.exit -eq 60) -and ((Get-Prop $rep 'supervisor.abortReason') -eq 'A7:OPERATOR_CANCEL') -and ((Get-Prop $rep 'supervisor.abortFile.delivered') -eq $true) -and ((Get-List $rep 'observation.failures') -contains 'OPERATOR_CANCELLED')) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'cancel' '정리는 완료' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and ((Remove-Stragglers $sb) -eq 0))
}
if (Test-Selected 'hang') {
    Write-Host '[hang] 러너가 매달려도 관측 마감에 중단을 요청하고 정리로 넘어간다(진짜 정지 스텁 프로세스)'
    $sb = New-RulesSandbox @{ runner = 'hang-real' }
    $t0 = [DateTime]::UtcNow
    $r = Invoke-Rules $sb -Limits $FASTLIM
    $secs = ([DateTime]::UtcNow - $t0).TotalSeconds
    $rep = Get-RulesReport $sb
    $runnerPid = [int](Get-Prop (@(Get-Prop $rep 'processes')[0]) 'processId')
    $flag = Join-Path $sb.WorkDir 'work\lsp-rules-abort.flag'; $flagText = ''; if (Test-Path -LiteralPath $flag) { $flagText = ([IO.File]::ReadAllText($flag)).Trim() }
    Assert-That 'hang' '종료 60, 결과 파일이 없으므로 RUNNER_NO_RESULT 로 관측 실패' (($r.exit -eq 60) -and ((Get-Prop $rep 'observation.failure') -eq 'RUNNER_NO_RESULT') -and ((Get-Prop $rep 'binding.resultState') -eq 'NONE')) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'hang' '관측 마감(기동 허용 + totalMs)에 A7:SUPERVISOR_DEADLINE 가 파일로 전달됐고, 유예 뒤에도 러너가 있어 전용 계정 프로세스를 직접 끝냈다' (($flagText -eq 'A7:SUPERVISOR_DEADLINE') -and ((Get-Prop $rep 'supervisor.deadlineReached') -eq $true) -and ((Get-Prop $rep 'supervisor.forcedKill') -eq $true) -and ((Get-Prop $rep 'supervisor.forcedKillReason') -eq 'ABORT_NOT_FOLLOWED:A7:SUPERVISOR_DEADLINE') -and ((Get-List $rep 'supervisor.killTargets') -contains $runnerPid))
    Assert-That 'hang' '진짜 정지 스텁이 실제로 끝났고, 시간이 마감 계산 안에 든다(7초 마감 + 유예 + 안정 시간)' (($null -eq (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue)) -and ($secs -lt 60) -and ((Get-Prop $rep 'supervisor.elapsedAtEndMs') -ge 7000)) "secs=$secs"
    Assert-That 'hang' '서버를 띄운 사실은 남는다(NOT_ATTEMPTED 가 아니다): 러너 프로세스를 띄웠고 결과가 없을 뿐이다' (((Get-Prop $rep 'observation.runnerLaunched') -eq $true) -and ((Get-Prop $rep 'verdict') -clike 'STUB_NOT_OBSERVED:*'))
    Assert-That 'hang' '복구는 계속됐다: 프로세스 정리·시스템 복구 모두 ok, 계정 비활성화, 감사 복구' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and ((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq 0))
    [void](Remove-Stragglers $sb)
}
if (Test-Selected 'result') {
    Write-Host '[result] 결과 누락·손상·이전 결과 재사용은 관측 실패이고 복구는 계속한다'
    foreach ($c in @(
            @{ id = 'missing'; knob = @{ runner = 'none' }; token = 'RUNNER_NO_RESULT'; state = 'NONE' },
            @{ id = 'corrupt'; knob = @{ runner = 'corrupt' }; token = 'RESULT_UNREADABLE'; state = 'UNREADABLE' },
            @{ id = 'stale'; knob = @{ runner = 'stale' }; token = 'RESULT_BINDING_FAILED'; state = 'TOKEN_MISMATCH' })) {
        $sb = New-RulesSandbox $c.knob
        $r = Invoke-Rules $sb -Limits $FASTLIM
        $rep = Get-RulesReport $sb
        Assert-That "result-$($c.id)" "종료 60, 주 토큰 $($c.token), 결과 상태 $($c.state)" (($r.exit -eq 60) -and ((Get-Prop $rep 'observation.failure') -eq $c.token) -and ((Get-Prop $rep 'binding.resultState') -eq $c.state)) "exit=$($r.exit) failure=$(Get-Prop $rep 'observation.failure') state=$(Get-Prop $rep 'binding.resultState')`n$($r.out)"
        Assert-That "result-$($c.id)" '관측 성립 아님, 정리는 완료(복구 계속), 신원 교차 확인도 통과로 치지 않는다' (((Get-Prop $rep 'observation.established') -eq $false) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and ((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq 0) -and ((Get-Prop $rep 'identity.ok') -eq $false))
        if ($c.id -eq 'stale') { Assert-That 'result-stale' '이전 실행의 토큰은 받아들이지 않았고 판정에 쓰지 않았다' ($null -eq (Get-Prop $rep 'runnerResult')) }
        [void](Remove-Stragglers $sb)
    }
}

# ── 러너가 다룬 스텁 서버 변종(진짜 러너 + 재해석) ───────────────────────────
if (Test-Selected 'stub-variants') {
    Write-Host '[stub-variants] 정상이 아닌 서버 동작은 관측 불성립이고 정리는 끝난다'
    if (-not $toolsReady) { Skip-That 'stub-variants' '재해석 도구가 필요하다' }
    else {
        $vc = @(
            @{ s = 'rules-zero'; v = 'STUB_LOAD_FAILED:NO_RULES_TO_RUN'; lim = $GOODLIM },
            @{ s = 'yaml-error'; v = 'STUB_LOAD_FAILED:LOCAL_CONFIG_ERRORS'; lim = $GOODLIM },
            @{ s = 'log-missing'; v = 'STUB_NOT_CONFIRMED:SIGNAL_ABSENT'; lim = $GOODLIM },
            @{ s = 'engine-line-leak'; v = 'STUB_ABORTED:A1'; lim = $GOODLIM },
            @{ s = 'download-line'; v = 'STUB_ABORTED:A2'; lim = $GOODLIM },
            @{ s = 'write-ws'; v = 'STUB_ABORTED:A5'; lim = $GOODLIM },
            @{ s = 'write-extra-rules'; v = 'STUB_ABORTED:A5'; lim = $GOODLIM },
            @{ s = 'home-write'; v = 'STUB_ABORTED:A5'; lim = $GOODLIM },
            @{ s = 'barrier-timeout'; v = 'STUB_NOT_OBSERVED:RULES_TIMEOUT'; lim = $BARLIM },
            @{ s = 'nonzero-exit'; v = 'STUB_NOT_OBSERVED:EXIT_CODE_NOT_ZERO'; lim = $GOODLIM },
            @{ s = 'version-mismatch'; v = 'STUB_NOT_OBSERVED:*'; lim = $GOODLIM; noInitialized = $true },
            @{ s = 'initialize-error'; v = 'STUB_NOT_OBSERVED:*'; lim = $GOODLIM; noInitialized = $true })
        foreach ($c in $vc) {
            $sb = New-RulesSandbox
            $r = Invoke-Rules $sb -StubScenario $c.s -Limits $c.lim
            $rep = Get-RulesReport $sb
            Assert-That "stub-$($c.s)" "판정 $($c.v), 종료 60, 관측 불성립" (($r.exit -eq 60) -and ((Get-Prop $rep 'verdict') -clike $c.v) -and ((Get-Prop $rep 'observation.established') -eq $false)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict') failures=$((Get-List $rep 'observation.failures') -join ',')`n$($r.out)"
            if ($c.ContainsKey('noInitialized')) { Assert-That "stub-$($c.s)" '초기화 응답이 조건을 못 채우면 initialized 는 단 한 번도 가지 않는다' ((Get-Prop $rep 'runnerResult.initializedCount') -eq 0) }
            Assert-That "stub-$($c.s)" '정리 완료' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
            [void](Remove-Stragglers $sb)
        }
        # 기대 버전이 서버 버전과 다르면(기본값 1.180.0 은 스텁의 9.9.9 와 다르다) initialized 를 보내지 않는다.
        $sb = New-RulesSandbox
        $r = Invoke-Rules $sb -ExpectedVersion '1.180.0'
        $rep = Get-RulesReport $sb
        Assert-That 'stub-pin-mismatch' '핀 버전과 서버 버전이 다르면 initialized 가 가지 않고 관측은 성립하지 않는다' (($r.exit -eq 60) -and ((Get-Prop $rep 'runnerResult.initializedCount') -eq 0) -and ((Get-Prop $rep 'observation.established') -eq $false)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
        [void](Remove-Stragglers $sb)
    }
}

# ── 정리 부분 실패: 관측·프로세스 정리·시스템 복구는 서로를 바꾸지 않는다 ──────────
if (Test-Selected 'cleanup') {
    Write-Host '[cleanup] 정리 항목 하나의 실패가 뒤의 복구를 멈추지 않고, 관측 결과도 바꾸지 않는다'
    if ($toolsReady) {
        $sb = New-RulesSandbox @{ disableUserFails = $true }
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        $audit = @(Get-Prop $rep 'systemRecovery.items' | Where-Object { $_.name -like 'audit-restore*' })
        Assert-That 'cleanup-account' '계정 비활성화 실패: 종료 70, 시스템 복구 ok=false, 프로세스 정리 ok' (($r.exit -eq 70) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $false) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true)) "exit=$($r.exit)`n$($r.out)"
        Assert-That 'cleanup-account' '관측 결과는 그대로 성립(정리 실패가 덮어쓰지 않는다)하고 뒤의 감사 복구는 계속 실행돼 값이 복구됐다' (((Get-Prop $rep 'observation.established') -eq $true) -and ((Get-Prop $rep 'verdict') -ceq 'STUB_RULES_LOAD_OBSERVED') -and ($audit.Count -ge 1) -and ($audit[0].ok -eq $true) -and ((Get-AuditValue $sb) -eq 0))
        [void](Remove-Stragglers $sb)
        $sb = New-RulesSandbox @{ auditSetFailInClose = $true }
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        $acc = @(Get-Prop $rep 'systemRecovery.items' | Where-Object { $_.name -eq 'account-disable' })
        Assert-That 'cleanup-audit' '감사 복구 실패: 종료 70, 시스템 복구 ok=false, 계정은 비활성화됨, 관측 결과는 그대로 성립' (($r.exit -eq 70) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $false) -and ($acc.Count -eq 1) -and ($acc[0].ok -eq $true) -and ((Get-UserEnabled $sb) -eq $false) -and ((Get-Prop $rep 'observation.established') -eq $true)) "exit=$($r.exit)`n$($r.out)"
        [void](Remove-Stragglers $sb)
        $sb = New-RulesSandbox @{ reinterpret = 'cleanup-fail' }
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        $toolItem = @(@(Get-Prop $rep 'processCleanup.items') | Where-Object { $_.name -eq 'process-reinterpret-tool' })
        Assert-That 'cleanup-tool' '(합성) 재해석 도구 뒤처리 실패: 종료 70, 최종 상태 CLEANUP_INCOMPLETE, processCleanup.ok=false, systemRecovery.ok=true, 관측은 성립하지 않는다' (($r.exit -eq 70) -and ((Get-Prop $rep 'finalStatus') -eq 'CLEANUP_INCOMPLETE') -and ((Get-Prop $rep 'processCleanup.ok') -eq $false) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and ((Get-Prop $rep 'observation.established') -eq $false) -and ($toolItem.Count -eq 1) -and ($toolItem[0].ok -eq $false)) "exit=$($r.exit) final=$(Get-Prop $rep 'finalStatus')`n$($r.out)"
        [void](Remove-Stragglers $sb)
    } else { Skip-That 'cleanup-account/audit/tool' '관측 성립을 전제로 하는 사례라 재해석 도구가 필요하다' }
    $sb = New-RulesSandbox @{ runner = 'hang-real'; stopProcessFails = $true }
    $r = Invoke-Rules $sb -Limits $FASTLIM
    $rep = Get-RulesReport $sb
    $runnerPid = [int](Get-Prop (@(Get-Prop $rep 'processes')[0]) 'processId')
    $aliveAtEnd = [bool](Get-Process -Id $runnerPid -ErrorAction SilentlyContinue)
    Assert-That 'cleanup-process' '프로세스 정리 실패(종료 호출이 듣지 않음): 종료 70, 프로세스 정리 ok=false, 시스템 복구 ok=true, 계정 비활성화·감사 복구는 실행됐다' (($r.exit -eq 70) -and ((Get-Prop $rep 'processCleanup.ok') -eq $false) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and $aliveAtEnd -and ((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq 0)) "exit=$($r.exit) alive=$aliveAtEnd`n$($r.out)"
    # Stop-Process 는 비동기라 직후에는 종료 중인 프로세스가 아직 보일 수 있다: 최대 3초 기다린 뒤 판단한다.
    $stragglersKilled = Remove-Stragglers $sb
    for ($w = 0; $w -lt 30 -and (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue); $w++) { Start-Sleep -Milliseconds 100 }
    Assert-That 'cleanup-process' '남아 있던 시험용 프로세스를 시험이 실제로 끝냈다(끝내기 전에는 살아 있었다)' ($aliveAtEnd -and ($stragglersKilled -ge 1) -and ($null -eq (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue))) "alive=$aliveAtEnd pid=$runnerPid killed=$stragglersKilled"
}

# ── 5157(OS 차단 이벤트) ────────────────────────────────────────────────────
if (Test-Selected 'os-block') {
    Write-Host '[os-block] 5157 은 판정에 반영되고, 불확실하면 0 으로 채우지 않는다'
    $osCases = @(
        @{ id = 'attributed'; lsp = @{ events = 'matching' }; top = @{}; usable = $true; attr = 1; token = 'OS_BLOCK_ATTRIBUTED'; adminReason = 'ADMIN_OS_BLOCK_ATTRIBUTED' },
        @{ id = 'readfail'; lsp = @{ events = 'readFail' }; top = @{}; usable = $false; attr = $null; token = 'OS_BLOCK_EVIDENCE_UNAVAILABLE'; why = 'COLLECTION_FAILED'; adminReason = 'ADMIN_OS_BLOCK_UNCONFIRMED' },
        @{ id = 'wrapped'; lsp = @{}; top = @{ securityAfter = @{ oldest = 5000 } }; usable = $false; attr = $null; token = 'OS_BLOCK_EVIDENCE_UNAVAILABLE'; why = 'LOG_WRAPPED_OR_UNKNOWN'; adminReason = 'ADMIN_OS_BLOCK_UNCONFIRMED' },
        @{ id = 'audit-unconfirmed'; lsp = @{ auditReadFailInEvidenceCheck = $true }; top = @{}; usable = $false; attr = $null; token = 'OS_BLOCK_EVIDENCE_UNAVAILABLE'; why = 'AUDIT_NOT_CONFIRMED'; adminReason = 'ADMIN_OS_BLOCK_UNCONFIRMED' })
    foreach ($c in $osCases) {
        $sb = New-RulesSandbox $c.lsp $c.top
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        Assert-That "os-$($c.id)" "종료 60, 관측 불성립, 토큰 $($c.token), 건수 사용 가능 여부 $($c.usable)" (($r.exit -eq 60) -and ((Get-Prop $rep 'observation.established') -eq $false) -and ((Get-List $rep 'observation.failures') -contains $c.token) -and ((Get-Prop $rep 'osBlockObservation.countsUsable') -eq $c.usable)) "exit=$($r.exit) failures=$((Get-List $rep 'observation.failures') -join ',')`n$($r.out)"
        if ($c.usable) { Assert-That "os-$($c.id)" '귀속된 건수가 1 이고 이벤트 요약이 있다' (((Get-Prop $rep 'osBlockObservation.attributedCount') -eq $c.attr) -and ((Get-List $rep 'osBlockObservation.attributed').Count -eq 1)) }
        else { Assert-That "os-$($c.id)" "0 으로 채우지 않는다: 귀속·식별 불가 건수는 null 이고 사유 $($c.why) 가 남는다" (($null -eq (Get-Prop $rep 'osBlockObservation.attributedCount')) -and ($null -eq (Get-Prop $rep 'osBlockObservation.unidentifiedCount')) -and ((Get-List $rep 'osBlockObservation.unusableBecause') -contains $c.why)) "because=$((Get-List $rep 'osBlockObservation.unusableBecause') -join ',')" }
        if ($toolsReady) { Assert-That "os-$($c.id)" "TS 재해석 기록도 $($c.adminReason) 로 성립하지 않는다" (((Get-Prop $rep 'reinterpretation.recordStatus') -ne 'OBSERVED') -and ((Get-List $rep 'reinterpretation.adminReasons') -contains $c.adminReason)) "reasons=$((Get-List $rep 'reinterpretation.adminReasons') -join ',')" }
        Assert-That "os-$($c.id)" '정리는 완료' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
        [void](Remove-Stragglers $sb)
    }
    if ($toolsReady) {
        $sb = New-RulesSandbox @{ events = 'unrelated' }
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        Assert-That 'os-unidentified' '식별 불가 1건은 관측을 막지 않는다: 성립, 귀속 0, 식별 불가 1' (($r.exit -eq 0) -and ((Get-Prop $rep 'observation.established') -eq $true) -and ((Get-Prop $rep 'osBlockObservation.attributedCount') -eq 0) -and ((Get-Prop $rep 'osBlockObservation.unidentifiedCount') -eq 1)) "exit=$($r.exit)`n$($r.out)"
        [void](Remove-Stragglers $sb)
    } else { Skip-That 'os-unidentified' '관측 성립 경로라 재해석 도구가 필요하다' }
}

# ── 이전 실행의 작업 배치: 관리자 권한 삭제 전에 링크를 확인한다 ──────────────────────
if (Test-Selected 'old-layout') {
    Write-Host '[old-layout] 이전 작업 배치의 일반 파일은 지우고, 정션·링크가 있으면 지우지 않고 멈춘다'
    $sb = New-RulesSandbox
    $rw = & $RulesWorkOf $sb
    $decoy = Join-Path $sb.Root 'decoy'; [void][IO.Directory]::CreateDirectory($decoy); [IO.File]::WriteAllText((Join-Path $decoy 'keep.txt'), 'must survive', $Utf8)
    [void][IO.Directory]::CreateDirectory($rw)
    $junction = Join-Path $rw 'x'
    New-Item -ItemType Junction -Path $junction -Target $decoy | Out-Null
    $log0 = (Get-CallsLog $sb).Split("`n").Count
    $r = Invoke-Rules $sb
    $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
    $kept = Test-Path -LiteralPath (Join-Path $decoy 'keep.txt')
    [IO.Directory]::Delete($junction)
    Assert-That 'old-layout-junction' '사전 조건 T08 실패, 종료 50' (($r.exit -eq 50) -and ($r.out -match '\[FAIL\] T08 ')) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'old-layout-junction' '아무것도 지우지 않았고 계정·감사도 건드리지 않았다(대상 파일이 그대로)' ($kept -and ($new -notmatch 'Remove-Item|Enable-LocalUser|Invoke-AuditPol /set|LspRunner'))
    if ($toolsReady) {
        $sb = New-RulesSandbox
        $rw = & $RulesWorkOf $sb
        $staleWs = Join-Path $rw 'ws\sub'; $staleRules = Join-Path $rw 'lsp-state\rules-probe'; $staleHome = Join-Path $rw 'lsp-state\home\junk'
        foreach ($d in $staleWs, $staleRules, $staleHome) { [void][IO.Directory]::CreateDirectory($d) }
        [IO.File]::WriteAllText((Join-Path $staleWs 'stale.txt'), 'old', $Utf8); [IO.File]::WriteAllText((Join-Path $staleRules 'old-rule.yaml'), 'old', $Utf8); [IO.File]::WriteAllText((Join-Path $staleHome 'x.bin'), 'old', $Utf8)
        [IO.File]::WriteAllText((Join-Path $sb.WorkDir 'work\lsp-rules-result.json'), '{"stale":true}', $Utf8); [IO.File]::WriteAllText((Join-Path $sb.WorkDir 'work\lsp-rules-request.json'), '{"stale":true}', $Utf8)
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        Assert-That 'old-layout-files' '이전 배치의 일반 파일(작업 영역·규칙 폴더·홈의 남은 것, 이전 요청·결과)은 지워지고 관측이 성립한다. 규칙 폴더에는 프로브 한 개뿐이다' (($r.exit -eq 0) -and ((Get-Prop $rep 'observation.established') -eq $true) -and -not (Test-Path -LiteralPath (Join-Path $staleWs 'stale.txt')) -and -not (Test-Path -LiteralPath (Join-Path $staleRules 'old-rule.yaml')) -and -not (Test-Path -LiteralPath $staleHome) -and ((Get-List $rep 'adminPostRun.roots.RULES_DIR') -join ',') -ceq 'lsp-rules-1-probe.yaml') "exit=$($r.exit)`n$($r.out)"
        [void](Remove-Stragglers $sb)
    } else { Skip-That 'old-layout-files' '관측 성립 경로라 재해석 도구가 필요하다' }
}

# ── 작업 경로의 상위 링크 ───────────────────────────────────────────────────
if (Test-Selected 'work-chain') {
    Write-Host '[work-chain] 상위 work 폴더·작업 배치·상태 폴더·규칙 폴더·기존 복사 목적지가 링크면 계정 켜기·감사 변경·러너 실행·삭제·복사 없이 거절한다'
    $wcCases = @(
        @{ id = 'work-junction'; make = { param($sb, $out) $w = Join-Path $sb.WorkDir 'work'; if (Test-Path -LiteralPath $w) { [IO.Directory]::Delete($w) }; New-Item -ItemType Junction -Path $w -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work')) } },
        @{ id = 'rules-work-junction'; make = { param($sb, $out) [void][IO.Directory]::CreateDirectory((Join-Path $sb.WorkDir 'work')); New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work\lsp-rules') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work\lsp-rules')) } },
        @{ id = 'state-junction'; make = { param($sb, $out) [void][IO.Directory]::CreateDirectory((Join-Path $sb.WorkDir 'work\lsp-rules')); New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work\lsp-rules\lsp-state') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work\lsp-rules\lsp-state')) } },
        @{ id = 'rules-probe-junction'; make = { param($sb, $out) [void][IO.Directory]::CreateDirectory((Join-Path $sb.WorkDir 'work\lsp-rules\lsp-state')); New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work\lsp-rules\lsp-state\rules-probe') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work\lsp-rules\lsp-state\rules-probe')) } },
        @{ id = 'copy-dest-junction'; make = { param($sb, $out) [void][IO.Directory]::CreateDirectory((Join-Path $sb.WorkDir 'work')); New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work\version-runner.ps1') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work\version-runner.ps1')) } },
        @{ id = 'request-dest-junction'; make = { param($sb, $out) [void][IO.Directory]::CreateDirectory((Join-Path $sb.WorkDir 'work')); New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work\lsp-rules-request.json') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work\lsp-rules-request.json')) } })
    foreach ($c in $wcCases) {
        $sb = New-RulesSandbox
        $out = Join-Path $sb.Root 'outside'; [void][IO.Directory]::CreateDirectory((Join-Path $out 'lsp-rules')); [IO.File]::WriteAllText((Join-Path $out 'keep.txt'), 'must survive', $Utf8); [IO.File]::WriteAllText((Join-Path $out 'lsp-rules\inner.txt'), 'inner', $Utf8)
        & $c.make $sb $out
        $print0 = Get-TreePrint $out
        $fake0 = [IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json'))
        $log0 = (Get-CallsLog $sb).Split("`n").Count
        $rx = Invoke-Rules $sb
        $rd = Invoke-Rules $sb -Dry
        $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
        $print1 = Get-TreePrint $out
        $rep = Get-RulesReport $sb
        $linkStillThere = $true
        try { & $c.unlink $sb } catch { $linkStillThere = $false }
        Assert-That "work-chain-$($c.id)" '-Execute 도 dry-run 도 사전 조건 T08 실패, 종료 50' (($rx.exit -eq 50) -and ($rx.out -match '\[FAIL\] T08 ') -and ($rd.exit -eq 50) -and ($rd.out -match '\[FAIL\] T08 ')) "exec=$($rx.exit) dry=$($rd.exit)`n$($rx.out)"
        Assert-That "work-chain-$($c.id)" '링크 대상 폴더의 파일·목록·바이트가 거절 전후로 같다(삭제·복사·쓰기가 대상으로 새지 않았다)' (($print0 -eq $print1) -and ($print1 -ne 'ABSENT')) "before=$print0`nafter=$print1"
        Assert-That "work-chain-$($c.id)" '계정 켜기·감사 변경·러너 실행·프로세스 시작·종료가 없고 모의 상태(계정·규칙·감사·ACL)가 그대로다. 보고서를 만들지 않았다(변경 전 거절)' (($new -notmatch 'Enable-LocalUser|Disable-LocalUser|Invoke-AuditPol /set|LspRunner|Start-Process|Stop-Process') -and ([IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json')) -eq $fake0) -and ($null -eq $rep)) $new
        Assert-That "work-chain-$($c.id)" '링크는 따라가지 않고 링크 자체만 지울 수 있었고, 그 뒤에도 대상은 그대로다' ($linkStillThere -and ((Get-TreePrint $out) -eq $print0))
        [void](Remove-Stragglers $sb)
    }
    # 관문 2: 첫 확인과 계정 켜기를 통과한 뒤, 첫 복사·쓰기 직전에 work 가 정션으로 바뀌면 쓰지 않고 멈춘다(NOT_ATTEMPTED:WORK_PATH_UNSAFE).
    $sb = New-Sandbox -Scenario @{ lsp = @{} }
    $out = Join-Path $sb.Root 'outside'; [void][IO.Directory]::CreateDirectory((Join-Path $out 'lsp-rules')); [IO.File]::WriteAllText((Join-Path $out 'keep.txt'), 'must survive', $Utf8)
    $sc = @{ lsp = @{ swapWorkAfterEnable = @{ work = (Join-Path $sb.WorkDir 'work'); target = $out } } }
    [IO.File]::WriteAllText($sb.ScenarioFile, ($sc | ConvertTo-Json -Depth 6), $Utf8)
    $ap = Invoke-Apply $sb
    if ($ap.exit -ne 0) { throw "적용 단계가 실패했다: $($ap.out)" }
    $auditBefore = Get-AuditValue $sb
    $print0 = Get-TreePrint $out
    $r = Invoke-Rules $sb
    $rep = Get-RulesReport $sb
    $log = Get-CallsLog $sb
    $gates = @(Get-Prop $rep 'workPath.gates')
    $linkGone = $true; try { [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work')) } catch { $linkGone = $false }
    Assert-That 'work-chain-late-swap' '계정을 켠 뒤 work 가 정션으로 바뀌면 판정 STUB_NOT_ATTEMPTED:WORK_PATH_UNSAFE, 종료 60, runnerLaunched=false' (($r.exit -eq 60) -and ((Get-Prop $rep 'verdict') -ceq 'STUB_NOT_ATTEMPTED:WORK_PATH_UNSAFE') -and ((Get-Prop $rep 'observation.failure') -eq 'WORK_PATH_UNSAFE') -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $false)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')`n$($r.out)"
    Assert-That 'work-chain-late-swap' '관문 1 은 통과(문제 없음), 관문 2 에서 LINK 를 찾았다' (($gates.Count -eq 2) -and (@($gates[0].problems).Count -eq 0) -and (@(@($gates[1].problems) | Where-Object { $_ -like 'LINK:*' }).Count -ge 1)) (($gates | ConvertTo-Json -Depth 5 -Compress))
    Assert-That 'work-chain-late-swap' '러너를 띄우지 않았고 링크 대상 폴더는 파일·목록·바이트가 그대로다(요청 파일·복사본이 새지 않았다)' (($log -notmatch 'LspRunner') -and ((Get-TreePrint $out) -eq $print0) -and $linkGone) "log=$log"
    Assert-That 'work-chain-late-swap' '정리는 끝났다: 계정은 다시 꺼졌고 감사 값은 복구됐으며 프로세스 정리·시스템 복구 모두 ok' (((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq $auditBefore) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
    [void](Remove-Stragglers $sb)
}

# ── 한도·필수 인자 거부(30)와 실제 모드 사전 조건 ──────────────────────────────
function New-FakeDist {
    param([string]$Base)
    $dist = Join-Path $Base 'semgrep-dist\1.180.0'
    $scripts = Join-Path $dist 'venv\Scripts'; $coreDir = Join-Path $dist 'venv\Lib\site-packages\semgrep\bin'; $basePy = Join-Path $Base 'basepy'; $wheelDir = Join-Path $dist 'dist'
    foreach ($d in $scripts, $coreDir, $basePy, $wheelDir) { [void][IO.Directory]::CreateDirectory($d) }
    $exe = Join-Path $scripts 'semgrep.exe'; $vpy = Join-Path $scripts 'python.exe'; $bpy = Join-Path $basePy 'python.exe'; $core = Join-Path $coreDir 'semgrep-core.exe'; $wheel = Join-Path $wheelDir 'semgrep-1.180.0-fake.whl'
    # 아래 파일들은 내용이 있는 흉내 파일이다. 실행 파일이 아니며 이 시험 어디에서도 실행하지 않는다(dry-run 과 거절 경로, 그리고 모의가 막는 실행 경로뿐).
    [IO.File]::WriteAllBytes($exe, [Text.Encoding]::ASCII.GetBytes('FAKE-NOT-AN-EXECUTABLE-semgrep'))
    [IO.File]::WriteAllBytes($vpy, [Text.Encoding]::ASCII.GetBytes('FAKE-venv-python')); [IO.File]::WriteAllBytes($bpy, [Text.Encoding]::ASCII.GetBytes('FAKE-base-python'))
    [IO.File]::WriteAllBytes($core, [Text.Encoding]::ASCII.GetBytes('FAKE-core-bytes-0123456789')); [IO.File]::WriteAllBytes($wheel, [Text.Encoding]::ASCII.GetBytes('FAKE-wheel-bytes'))
    [IO.File]::WriteAllText((Join-Path $dist 'venv\pyvenv.cfg'), "home = $basePy`r`nversion = 3.12.9`r`n", $Utf8)
    $h = { param($p) Get-LrSha256Hex ([IO.File]::ReadAllBytes($p)) }
    $bq = [string][char]96
    $fmt = { param($n) $n.ToString('N0', [Globalization.CultureInfo]::InvariantCulture) }
    $exeH = & $h $exe; $coreH = & $h $core; $wheelH = & $h $wheel
    $text = ("- 이진 파일: {0}semgrep-core.exe{0}($(& $fmt (Get-Item $core).Length)바이트, SHA-256 {0}$coreH{0})`n" -f $bq) + ("- 실행 파일: {0}venv\Scripts\semgrep.exe{0}($(& $fmt (Get-Item $exe).Length)바이트, SHA-256 {0}$exeH{0}), {0}venv\Scripts\pysemgrep.exe{0}(108,455바이트, {0}$('7' * 64){0})`n" -f $bq) + ("| win_amd64 | 58,108,036 | {0}$wheelH{0} | 2026-10-07T23:24:52Z |`n" -f $bq)
    $report = Join-Path $Base 'dist-report.md'
    [IO.File]::WriteAllText($report, $text, $Utf8)
    [pscustomobject]@{ Base = $Base; Dist = $dist; Exe = $exe; ExeHash = $exeH; Core = $core; CoreHash = $coreH; Wheel = $wheel; WheelHash = $wheelH; Report = $report; VenvPython = $vpy; BasePython = $bpy; BaseHome = $basePy; Venv = (Join-Path $dist 'venv') }
}
function Grant-FakeAcl {
    param($Sb, $D)
    $mf = Join-Path $Sb.RunDir 'resources.json'
    $m = [IO.File]::ReadAllText($mf, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $steps = New-Object System.Collections.ArrayList; foreach ($s in @($m.steps)) { [void]$steps.Add($s) }
    foreach ($p in $D.Venv, $D.BaseHome) { [void]$steps.Add([pscustomobject]@{ kind = 'aclGrant'; name = $p; state = 'created'; detail = [pscustomobject]@{}; utc = [DateTime]::UtcNow.ToString('o') }) }
    $m.steps = @($steps)
    [IO.File]::WriteAllText($mf, ($m | ConvertTo-Json -Depth 10), $Utf8)
    $fs = [IO.File]::ReadAllText((Join-Path $Sb.Root 'fake-state.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
    $sddl = "D:(A;;0x1200a9;;;$RealSid)"
    foreach ($p in $D.Exe, $D.VenvPython, $D.BasePython) { $fs.acl | Add-Member -NotePropertyName ([IO.Path]::GetFullPath($p)) -NotePropertyValue $sddl -Force }
    [IO.File]::WriteAllText((Join-Path $Sb.Root 'fake-state.json'), ($fs | ConvertTo-Json -Depth 10), $Utf8)
}
function Invoke-RulesReal {
    param($Sb, $D, [hashtable]$Over = @{}, [switch]$Execute, [string[]]$Extra = @())
    $v = @{ DistRoot = $D.Dist; SemgrepExe = $D.Exe; ExpectedExeSha256 = $D.ExeHash; WheelPath = $D.Wheel; ExpectedWheelSha256 = $D.WheelHash; DistReport = $D.Report; ProbeFile = $ProbeFile }
    foreach ($k in $Over.Keys) { $v[$k] = $Over[$k] }
    $a = @('-RunDir', $Sb.RunDir, '-CancelFile', $Sb.Cancel)
    foreach ($k in $v.Keys) { if ($null -ne $v[$k]) { $a += @("-$k", [string]$v[$k]) } }
    if ($Execute) { $a += '-Execute'; if ($toolsReady) { $a += @('-TsxCmd', $TsxCmd, '-ReinterpretCli', $ReinterpretCli); if ($NodeDir) { $a += @('-NodeDir', $NodeDir) } } }
    Invoke-Entry $Sb 'lsp' 'Test-LspRulesObservation.ps1' ($a + $Extra)
}
if (Test-Selected 'limits') {
    Write-Host '[limits] 한도는 늘릴 수 없다(스텁 모드): 거부 30'
    $sb = New-RulesSandbox
    foreach ($c in @(@('전체 상한 위', @('-TotalMs', '999999999')), @('장벽 한도 위', @('-RulesMs', '120000')), @('장벽 뒤 감시 위', @('-SettleMs', '5000')), @('초기화 한도 위', @('-InitMs', '70000')), @('종료 한도 위', @('-ExitMs', '31000')), @('표본 간격 0', @('-SampleIntervalMs', '0')), @('장벽 한도 0', @('-RulesMs', '0')), @('기동 허용 0', @('-StartAllowanceMs', '0')))) {
        $rs = Invoke-Rules $sb -Dry -Limits @() -Extra $c[1]
        Assert-That 'limits' "스텁 모드라도 $($c[0])의 값은 거부(종료 30)" ($rs.exit -eq 30) "exit=$($rs.exit)`n$($rs.out)"
    }
    $rl = Invoke-Rules $sb -Dry -Limits @('-RulesMs', '1500', '-SettleMs', '300', '-TotalMs', '5000')
    Assert-That 'limits' '줄이는 것은 받는다(장벽 한도 1500·장벽 뒤 감시 300·전체 5000): dry-run 종료 0' ($rl.exit -eq 0) "exit=$($rl.exit)`n$($rl.out)"
}
if (Test-Selected 'real-mode') {
    Write-Host '[real-mode] 설치 경로·전체 해시·배포물 보고서 대조(흉내 설치물, 실행하지 않는다)'
    $sb = New-RulesSandbox
    $d = New-FakeDist (Join-Path $sb.Root 'fake')
    Grant-FakeAcl $sb $d
    $fake0 = [IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json'))
    $log0 = (Get-CallsLog $sb).Split("`n").Count
    $r = Invoke-RulesReal $sb $d
    $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
    Assert-That 'real-mode' '모두 맞으면 dry-run 은 종료 0 이고 사전 조건 P01·L01~L08·L10·L11·A01 이 통과' (($r.exit -eq 0) -and ($r.out -match 'NOT_EXECUTED') -and (@(@('P01', 'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L10', 'L11', 'A01') | Where-Object { $r.out -notmatch "\[PASS\] $_ " }).Count -eq 0)) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'real-mode' 'dry-run 은 상태를 바꾸지 않고 아무것도 실행하지 않는다' (([IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json')) -eq $fake0) -and ($new -notmatch 'Enable-LocalUser|LspRunner|Start-Process|Invoke-AuditPol /set'))
    $variants = @(
        @{ id = 'wrong-path'; over = @{ SemgrepExe = (Join-Path $d.Base 'elsewhere\semgrep.exe') }; fail = 'L01'; pre = { New-Item -ItemType Directory -Path (Join-Path $d.Base 'elsewhere') -Force | Out-Null; Copy-Item -LiteralPath $d.Exe -Destination (Join-Path $d.Base 'elsewhere\semgrep.exe') } },
        @{ id = 'name-only'; over = @{ ExpectedExeSha256 = ('e' * 64) }; fail = 'L03' },
        @{ id = 'wheel-hash'; over = @{ ExpectedWheelSha256 = ('d' * 64) }; fail = 'L04' },
        @{ id = 'core-hash'; over = @{ ExpectedCoreSha256 = ('c' * 64) }; fail = 'L05' },
        @{ id = 'report-missing'; over = @{ DistReport = (Join-Path $d.Base 'no-such-report.md') }; fail = 'L06' },
        @{ id = 'probe-tampered'; over = @{ ProbeFile = (Join-Path $d.Base 'no-such-probe.yaml') }; fail = 'P01' })
    foreach ($v in $variants) {
        if ($v.ContainsKey('pre')) { & $v.pre }
        $rr = Invoke-RulesReal $sb $d $v.over
        Assert-That "real-$($v.id)" "사전 조건 $($v.fail) 실패, 종료 50, 아무것도 실행하지 않음" (($rr.exit -eq 50) -and ($rr.out -match "\[FAIL\] $($v.fail) ")) "exit=$($rr.exit)`n$($rr.out)"
    }
    $tampered = (Get-Content -LiteralPath $d.Report -Raw -Encoding UTF8).Replace($d.ExeHash, ('f' * 64))
    $tr = Join-Path $d.Base 'tampered-report.md'; [IO.File]::WriteAllText($tr, $tampered, $Utf8)
    $rr = Invoke-RulesReal $sb $d @{ DistReport = $tr }
    Assert-That 'real-report-mismatch' '보고서의 값이 현재 파일과 다르면 L06 실패, 종료 50' (($rr.exit -eq 50) -and ($rr.out -match '\[FAIL\] L06 ')) "exit=$($rr.exit)`n$($rr.out)"
    $jd = New-FakeDist (Join-Path $sb.Root 'fakej')
    Grant-FakeAcl $sb $jd
    $real = Join-Path $jd.Venv 'Scripts'; $moved = Join-Path $jd.Base 'Scripts-real'
    Move-Item -LiteralPath $real -Destination $moved
    New-Item -ItemType Junction -Path $real -Target $moved | Out-Null
    $rr = Invoke-RulesReal $sb $jd
    [IO.Directory]::Delete($real)
    Assert-That 'real-junction' '경로 조각이 정션이면 L02 실패, 종료 50' (($rr.exit -eq 50) -and ($rr.out -match '\[FAIL\] L02 ')) "exit=$($rr.exit)`n$($rr.out)"
    foreach ($c in @(
            @{ id = 'short-hash'; over = @{ ExpectedExeSha256 = ('a' * 12) } },
            @{ id = 'no-report-arg'; over = @{ DistReport = $null } },
            @{ id = 'no-root'; over = @{ DistRoot = $null } },
            @{ id = 'short-wheel'; over = @{ ExpectedWheelSha256 = ('a' * 63) } },
            @{ id = 'short-core'; over = @{ ExpectedCoreSha256 = ('a' * 12) } })) {
        $rr = Invoke-RulesReal $sb $d $c.over
        Assert-That "real-refuse-$($c.id)" '거부: 종료 30 (앞부분만 쓴 해시·빠진 필수 인자)' ($rr.exit -eq 30) "exit=$($rr.exit)`n$($rr.out)"
    }
    foreach ($c in @(@('전체 상한 낮춤', @('-TotalMs', '1000')), @('장벽 한도 낮춤', @('-RulesMs', '1000')), @('장벽 뒤 감시 낮춤', @('-SettleMs', '100')), @('장벽 한도 올림', @('-RulesMs', '120000')), @('장벽 뒤 감시 올림', @('-SettleMs', '5000')), @('기동 허용 바꿈', @('-StartAllowanceMs', '1000')), @('감독 유예 바꿈', @('-SupervisorGraceMs', '1000')))) {
        $rr = Invoke-RulesReal $sb $d @{} -Extra $c[1]
        Assert-That 'real-refuse-limit' "실제 모드에서 $($c[0]) → 거부(종료 30): 실제 모드의 한도는 계약 값 그대로다" ($rr.exit -eq 30) "exit=$($rr.exit)"
    }
    # 실제 모드 -Execute: 모의가 실제 Semgrep 실행을 막는다(MOCK GUARD). 러너를 띄우지 못한 것이므로 NOT_ATTEMPTED 이고, 예외 뒤에도 정리가 끝까지 돈다.
    if ($toolsReady) {
        $sbx = New-RulesSandbox
        $dx = New-FakeDist (Join-Path $sbx.Root 'fake')
        Grant-FakeAcl $sbx $dx
        $before = Get-AuditValue $sbx
        $rr = Invoke-RulesReal $sbx $dx @{} -Execute
        $repx = Get-RulesReport $sbx
        $logx = Get-CallsLog $sbx
        Assert-That 'real-execute-guard' '실제 모드 -Execute 는 모의가 러너 실행 전에 막는다: 러너가 띄워지지 않았다(LspRunner 기록 없음), 판정 NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED' (($logx -notmatch 'LspRunner kind=') -and ([string](Get-Prop $repx 'error') -match 'MOCK GUARD') -and ((Get-Prop $repx 'verdict') -ceq 'NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED') -and ((Get-Prop $repx 'observation.runnerLaunched') -eq $false)) "error=$(Get-Prop $repx 'error') verdict=$(Get-Prop $repx 'verdict')`n$($rr.out)"
        Assert-That 'real-execute-guard' '예외 뒤에도 정리가 끝까지 돌았다(감사 복구·계정 비활성화·수신기 정지), 관측은 성립하지 않는다(종료 60)' (($rr.exit -eq 60) -and ((Get-AuditValue $sbx) -eq $before) -and ((Get-UserEnabled $sbx) -eq $false) -and ((Get-Prop $repx 'processCleanup.ok') -eq $true) -and ((Get-Prop $repx 'systemRecovery.ok') -eq $true) -and ((Get-Prop $repx 'observation.established') -eq $false)) "exit=$($rr.exit)"
        Assert-That 'real-execute-guard' '보고서의 모드는 semgrep-lsp 이고 요청 인자는 정확히 lsp --debug, 환경 이름은 11개, 한도는 계약 값 그대로(장벽 60000·감시 2000·전체 150000)이다' (((Get-Prop $repx 'mode') -eq 'semgrep-lsp') -and ((@(Get-Prop $repx 'request.args')) -join ' ') -eq 'lsp --debug' -and ((Get-List $repx 'request.envNames').Count -eq 11) -and ((Get-Prop $repx 'request.limits.rulesMs') -eq 60000) -and ((Get-Prop $repx 'request.limits.settleMs') -eq 2000) -and ((Get-Prop $repx 'request.limits.totalMs') -eq 150000))
        Assert-That 'real-execute-guard' '남은 프로세스 없음' ((Remove-Stragglers $sbx) -eq 0)
    } else { Skip-That 'real-execute-guard' '실제 모드 -Execute 는 재해석 도구(L09)가 사전 조건이라 -TsxCmd 가 있어야 한다' }
}

# ═══ (D) TS ↔ PS 일치: 관리자 문맥을 PS 계약 함수로 만들어 실제 TS 재해석 CLI 에 넣는다 ═══════════════════
function Invoke-TsRecord {
    param([string]$RunnerResult, [string]$Context, [string]$Out)
    $ErrorActionPreference = 'Continue'
    $oldPath = $env:PATH
    if ($NodeDir) { $env:PATH = $NodeDir + ';' + $env:PATH }
    try { $o = & $TsxCmd $ReinterpretCli '--runner-result' $RunnerResult '--context' $Context '--out' $Out 2>&1; $code = $LASTEXITCODE } finally { $env:PATH = $oldPath }
    $doc = $null
    if ($code -eq 0 -and (Test-Path -LiteralPath $Out)) { $doc = [IO.File]::ReadAllText($Out, [Text.Encoding]::UTF8) | ConvertFrom-Json }
    [pscustomobject]@{ exit = $code; text = ($o | Out-String); doc = $doc }
}
if (Test-Selected 'agree') {
    Write-Host '[agree] 관리자 문맥(PS 계약 함수) → 실제 TS 재해석 CLI: 같은 입력에서 판정이 기대와 같다'
    if (-not $toolsReady) { Skip-That 'agree' '실제 TS 재해석 CLI(-TsxCmd)가 필요하다' }
    else {
        if ($null -eq $Script:Control) { $sbc = New-RulesSandbox; $rc = Invoke-Rules $sbc; $Script:Control = [pscustomobject]@{ Sb = $sbc; Out = $rc } }
        $cs = $Script:Control.Sb
        $rrFile = Get-RunFile $cs 'lsp-rules-runner-result-*.json'
        $ctxFile0 = Get-RunFile $cs 'lsp-rules-admin-context-*.json'
        if (-not $rrFile -or -not $ctxFile0) { Assert-That 'agree' '정상 대조군의 러너 결과·문맥 파일이 있다' $false "rr=$rrFile ctx=$ctxFile0" }
        else {
            $agDir = Join-Path ([IO.Path]::GetTempPath()) ('lsprules-agree-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
            [void][IO.Directory]::CreateDirectory($agDir)
            try {
                $ctx0 = [IO.File]::ReadAllText($ctxFile0, [Text.Encoding]::UTF8) | ConvertFrom-Json
                $E = $Script:LrProbeSha256
                $limC = [ordered]@{}; foreach ($pp in $ctx0.limits.PSObject.Properties) { $limC[$pp.Name] = [int]$pp.Value }
                $defaults = [ordered]@{
                    RunId = [string]$ctx0.runId; Token = [string]$ctx0.runToken; Mode = 'stub'; Work = [string]$ctx0.work; ExpectedVersion = '9.9.9'; Limits = $limC
                    RunnerLaunched = $true; Refusals = $null; ReceiverBaseline = 0; ReceiverFinal = 0; ReceiverSamples = 5; ReceiverFailures = 0
                    Probe = [ordered]@{ sourceSha256 = $E; afterCopySha256 = $E; afterRunSha256 = $E }
                    IdentityOk = $true; IdentityFailures = @(); BindingOk = $true; BindingFailures = @()
                    AbortRequested = $false; AbortReason = $null; AbortDelivered = $null; ForcedKill = $false; DeadlineReached = $false; ResultMissing = $false
                    DescendantPathViolations = @(); HashesUnchanged = $true; OsBlock = [ordered]@{ usable = $true; attributed = 0 }
                }
                $Script:AgreeCounter = 0
                $runCase = {
                    param([hashtable]$Over, [string]$RunnerPath)
                    $a = @{}; foreach ($k in $defaults.Keys) { $a[$k] = $defaults[$k] }; foreach ($k in $Over.Keys) { $a[$k] = $Over[$k] }
                    $ctxObj = New-LrAdminContext @a
                    $Script:AgreeCounter++
                    $cf = Join-Path $agDir ("ctx$($Script:AgreeCounter).json"); $of = Join-Path $agDir ("out$($Script:AgreeCounter).json")
                    [IO.File]::WriteAllText($cf, ($ctxObj | ConvertTo-Json -Depth 8), $Utf8)
                    Invoke-TsRecord -RunnerResult $RunnerPath -Context $cf -Out $of
                }
                # 정상 대조군이 보관한 문맥 그대로: 기록은 OBSERVED
                $o0 = Invoke-TsRecord -RunnerResult $rrFile -Context $ctxFile0 -Out (Join-Path $agDir 'out0.json')
                Assert-That 'agree' '보관한 러너 결과 + 보관한 문맥을 TS CLI 에 다시 넣으면 기록은 OBSERVED / RULES_LOAD_OBSERVED (진입점이 쓴 판정과 같다)' (($o0.exit -eq 0) -and ((Get-Prop $o0.doc 'record.status') -eq 'OBSERVED') -and ((Get-Prop $o0.doc 'record.verdict') -ceq 'RULES_LOAD_OBSERVED')) (Limit-Text $o0.text)
                $o1 = & $runCase @{} $rrFile
                Assert-That 'agree' 'PS 계약 함수(New-LrAdminContext)로 만든 정상 문맥은 TS 에서 OBSERVED 다(문맥의 JSON 모양이 TS 가 읽는 모양과 맞는다)' (($o1.exit -eq 0) -and ((Get-Prop $o1.doc 'record.status') -eq 'OBSERVED') -and ((Get-List $o1.doc 'admin.contextProblems').Count -eq 0) -and ((Get-List $o1.doc 'admin.externalReasons').Count -eq 0)) (Limit-Text $o1.text)
                $acases = @(
                    @{ n = '프로브 실행 뒤 해시가 null(관리자 재확인 실패)'; over = @{ Probe = [ordered]@{ sourceSha256 = $E; afterCopySha256 = $E; afterRunSha256 = $null } }; status = 'NOT_OBSERVED'; reason = 'PROBE_CHANGED_DURING_RUN' },
                    @{ n = '프로브 복사 직후 해시가 다름'; over = @{ Probe = [ordered]@{ sourceSha256 = $E; afterCopySha256 = ('0' * 64); afterRunSha256 = $E } }; status = 'NOT_OBSERVED'; reason = 'PROBE_COPY_HASH_UNEXPECTED' },
                    @{ n = '프로브 원본 해시가 다름'; over = @{ Probe = [ordered]@{ sourceSha256 = ('0' * 64); afterCopySha256 = $E; afterRunSha256 = $E } }; status = 'NOT_OBSERVED'; reason = 'PROBE_SOURCE_HASH_UNEXPECTED' },
                    @{ n = '프로브 해시 셋이 모두 null'; over = @{ Probe = $null }; status = 'NOT_OBSERVED'; reason = 'PROBE_SOURCE_HASH_UNEXPECTED' },
                    @{ n = '신원 교차 확인 실패(띄운 뒤라 NOT_ATTEMPTED 가 아니다)'; over = @{ IdentityOk = $false; IdentityFailures = @('CHILD_OWNER_MISMATCH') }; status = 'NOT_OBSERVED'; admin = 'ADMIN_IDENTITY_UNVERIFIED'; sentInitialized = $true },
                    @{ n = '결합 실패'; over = @{ BindingOk = $false; BindingFailures = @('MODE_MISMATCH') }; status = 'NOT_OBSERVED'; admin = 'ADMIN_BINDING_FAILED' },
                    @{ n = '토큰이 요청과 다름'; over = @{ Token = ('lsp-' + $RunId + '-' + ('d' * 32)) }; status = 'NOT_OBSERVED'; admin = 'ADMIN_TOKEN_MISMATCH' },
                    @{ n = '설치물 해시가 바뀜(또는 확인 못 함)'; over = @{ HashesUnchanged = $false }; status = 'NOT_OBSERVED'; admin = 'ADMIN_HASH_CHANGED' },
                    @{ n = '5157 요약을 주지 않음(확인 못 함)'; over = @{ OsBlock = $null }; status = $null; admin = 'ADMIN_OS_BLOCK_UNCONFIRMED' },
                    @{ n = '5157 수집이 확실하지만 귀속된 건이 있음'; over = @{ OsBlock = [ordered]@{ usable = $true; attributed = 2 } }; status = $null; admin = 'ADMIN_OS_BLOCK_ATTRIBUTED' },
                    @{ n = '5157 수집이 확실하다는데 건수가 null'; over = @{ OsBlock = [ordered]@{ usable = $true; attributed = $null } }; status = $null; admin = 'ADMIN_OS_BLOCK_UNCONFIRMED' },
                    @{ n = '수신기 최종 건수가 늘었다'; over = @{ ReceiverFinal = 1 }; status = $null; reason = 'RECEIVER_HITS_INCREASED' },
                    @{ n = '수신기 최종 건수를 읽지 못함(null)'; over = @{ ReceiverFinal = $null; ReceiverFailures = 1 }; status = $null; reason = 'RECEIVER_UNOBSERVABLE' },
                    @{ n = '감독이 강제 종료함'; over = @{ ForcedKill = $true }; status = 'NOT_OBSERVED'; admin = 'ADMIN_SUPERVISOR_FORCED_KILL' },
                    @{ n = '감독 마감에 닿음'; over = @{ DeadlineReached = $true }; status = 'NOT_OBSERVED'; admin = 'ADMIN_SUPERVISOR_DEADLINE' },
                    @{ n = '중단을 요청했지만 전달하지 못함'; over = @{ AbortRequested = $true; AbortReason = 'A3:RECEIVER_HIT'; AbortDelivered = $false }; status = 'NOT_OBSERVED'; admin = 'ADMIN_ABORT_DELIVERY_FAILED' },
                    @{ n = '결과 파일이 없었다고 알림'; over = @{ ResultMissing = $true }; status = 'NOT_OBSERVED'; admin = 'ADMIN_RESULT_MISSING' },
                    @{ n = '후손 프로세스가 허용 폴더 밖'; over = @{ DescendantPathViolations = @('pid=5') }; status = 'NOT_OBSERVED'; admin = 'ADMIN_DESCENDANT_PATH_UNEXPECTED' })
                foreach ($c in $acases) {
                    $o = & $runCase $c.over $rrFile
                    $okStatus = $true; if ($null -ne $c.status) { $okStatus = ((Get-Prop $o.doc 'record.status') -eq $c.status) } else { $okStatus = ((Get-Prop $o.doc 'record.status') -ne 'OBSERVED') }
                    $okAdmin = $true; if ($c.ContainsKey('admin')) { $okAdmin = ((Get-List $o.doc 'admin.externalReasons') -contains $c.admin) }
                    $okReason = $true; if ($c.ContainsKey('reason')) { $okReason = ((Get-List $o.doc 'record.verdict_reasons') -contains $c.reason) }
                    $okSent = $true; if ($c.ContainsKey('sentInitialized')) { $okSent = (@(Get-Prop $o.doc 'record.sent' | ForEach-Object { $_.label }) -contains 'initialized') }
                    Assert-That 'agree' "$($c.n) → TS 기록이 성립하지 않는다 (상태 $(if ($c.status) { $c.status } else { 'OBSERVED 아님' }))" (($o.exit -eq 0) -and $okStatus -and $okAdmin -and $okReason -and $okSent) "status=$(Get-Prop $o.doc 'record.status') admin=$((Get-List $o.doc 'admin.externalReasons') -join ',') reasons=$((Get-List $o.doc 'record.verdict_reasons') -join ',')`n$(Limit-Text $o.text)"
                }
                # 서버를 띄우지 못함: 러너 결과 파일이 없어도 문맥만으로 NOT_ATTEMPTED 기록을 만든다
                $o = & $runCase @{ RunnerLaunched = $false; Refusals = 'RECEIVER_NOT_READY'; Probe = [ordered]@{ sourceSha256 = $E; afterCopySha256 = $null; afterRunSha256 = $null }; IdentityOk = $false; BindingOk = $false; ResultMissing = $true; HashesUnchanged = $false; OsBlock = $null } (Join-Path $agDir 'no-such-runner-result.json')
                Assert-That 'agree' '서버를 띄우지 못함(runnerLaunched=false, 러너 결과 파일 없음) → TS 기록은 NOT_ATTEMPTED / NOT_ATTEMPTED:RECEIVER_NOT_READY' (($o.exit -eq 0) -and ((Get-Prop $o.doc 'record.status') -eq 'NOT_ATTEMPTED') -and ((Get-Prop $o.doc 'record.verdict') -ceq 'NOT_ATTEMPTED:RECEIVER_NOT_READY')) "status=$(Get-Prop $o.doc 'record.status') verdict=$(Get-Prop $o.doc 'record.verdict')`n$(Limit-Text $o.text)"
                $o = & $runCase @{ RunnerLaunched = $false; Refusals = $null } (Join-Path $agDir 'no-such-runner-result.json')
                Assert-That 'agree' '사유를 주지 않은 runnerLaunched=false 도 NOT_ATTEMPTED 다(ADMIN_RUNNER_NOT_LAUNCHED)' (($o.exit -eq 0) -and ((Get-Prop $o.doc 'record.status') -eq 'NOT_ATTEMPTED') -and ((Get-Prop $o.doc 'record.verdict') -ceq 'NOT_ATTEMPTED:ADMIN_RUNNER_NOT_LAUNCHED'))
                # 러너 결과를 읽지 못해도(없음) 띄웠다고 하면 NOT_ATTEMPTED 가 아니다
                $o = & $runCase @{} (Join-Path $agDir 'no-such-runner-result.json')
                Assert-That 'agree' '띄웠다고 알렸는데 러너 결과가 없으면 NOT_ATTEMPTED 가 아니라 성립하지 않는 기록이다(실행 사실을 지우지 않는다)' (($o.exit -eq 0) -and ((Get-Prop $o.doc 'record.status') -ne 'OBSERVED') -and ((Get-Prop $o.doc 'record.status') -ne 'NOT_ATTEMPTED')) "status=$(Get-Prop $o.doc 'record.status')"
            } finally { Remove-Item -LiteralPath $agDir -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }
}

# ═══ (E) 진짜 시스템 상태 불변 확인(읽기 전용) ═══════════════════════════════════
if (-not $SkipRealStateCheck) {
    $realAfter = Get-RealStateSnapshot
    foreach ($k in $realBefore.Keys) {
        # 읽지 못한 값(관리자 권한이 아니면 auditpol 이 실패한다)은 "전후가 같다"로 통과시키지 않고 건너뜀으로 표시한다.
        if ([string]$realBefore[$k] -eq 'UNREADABLE' -or [string]$realAfter[$k] -eq 'UNREADABLE') { Skip-That 'real-state' "읽지 못해 비교할 수 없다: $k (관리자 권한 필요)"; continue }
        Assert-That 'real-state' "진짜 시스템 상태 불변: $k" ([string]$realBefore[$k] -eq [string]$realAfter[$k]) "before=$($realBefore[$k]) after=$($realAfter[$k])"
    }
    Assert-That 'real-state' '진짜 전용 계정(bsi*)·방화벽 규칙(bosang-semgrep-iso*)이 이번 시험으로 생기지 않았다' ((-not ([string]$realAfter.users).Contains($UserName)) -and (-not ([string]$realAfter.rules).Contains($UserName)))
}

# ── 정리와 요약 ────────────────────────────────────────────────────────────
if (-not $KeepSandbox) { foreach ($s in $Sandboxes) { Remove-LinksUnder $s; Remove-Item -LiteralPath $s -Recurse -Force -ErrorAction SilentlyContinue } }
$pass = @($Results | Where-Object { $_.pass -eq $true }).Count; $fail = @($Results | Where-Object { $_.pass -eq $false }).Count; $skip = @($Results | Where-Object { $null -eq $_.pass }).Count
Write-Host ('LspRulesAdmin [{0}]: {1}/{2} 통과, {3} 실패, {4} 건너뜀' -f $Engine, $pass, ($pass + $fail), $fail, $skip)
if ($skip -gt 0) { Write-Host ('  건너뛴 {0}건은 통과로 세지 않았다. 재해석 도구(-TsxCmd)가 없으면 "관측이 성립하는" 경로는 확인되지 않은 것이다.' -f $skip) -ForegroundColor Yellow }
if ($fail -gt 0) { exit 1 }
exit 0
