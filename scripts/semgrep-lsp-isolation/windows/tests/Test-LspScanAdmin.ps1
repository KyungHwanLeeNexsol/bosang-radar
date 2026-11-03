<#
.SYNOPSIS
  LSP-SCAN-1 관리자 진입점(Test-LspScanObservation.ps1)을 모의 시스템과 무해한 스텁으로 끝까지 돌려 보는 시험. 실제 Semgrep 은 실행하지도 임포트하지도 않는다. 이 시험은 RULES 쪽(Test-LspRulesAdmin.ps1)보다 좁다.
.DESCRIPTION
  구성:
   (A) 정적 점검: 구문·BOM·LF·금지 명령(Invoke-Expression, 내려받기, semgrep·git 호출).
   (B) 순수 계약(LspScanAdminContract.ps1) 단위 시험: 관리자 문맥(합성 파일 해시 포함), 판정 이름, 요청 자기 점검, 감시 폴더 문제, 해시 합치기.
   (C) 흐름 시험: 임시 샌드박스에 코드 사본과 모의 시스템(MockSystem + MockSystemLsp + MockPortsLsp + MockSystemScan + MockPortsScan)을 끼워 넣고, 적용(Initialize-Isolation.ps1 -Apply) 뒤 진입점을 자식 프로세스로 실행한다.
       계정·방화벽·감사 정책·ACL·Security 로그는 모의라서 진짜 시스템은 읽지도 바꾸지도 않는다. 러너는 stub 모드일 때에 한해 **현재 사용자로** 진짜 러너(lsp-scan-runner.ps1)와 스텁 서버(lsp-scan-stub.ps1)를 띄운다.
       semgrep-lsp 모드 요청은 모의가 예외로 막는다. 정상, dry-run, 서버를 띄우지 못한 경우(NOT_ATTEMPTED), 띄운 뒤의 결합 실패·해시 변경·수신기 적중·관리자 사후 확인(프로브·합성 파일·감시 폴더)·한도 거부(종료 30)를 포함한다.
   (E) 진짜 시스템 상태 불변 확인: 시험 전후에 읽기 전용으로 전용 계정(bsi*)·방화벽 규칙(bosang-semgrep-iso*)·감사 값·작업 폴더 루트를 비교한다.
  TS 재해석이 필요한 사례는 -TsxCmd(와 -NodeDir)가 있을 때만 판정 전체를 확인한다. 없으면 그 사례는 SKIPPED 로 표시하고 통과로 세지 않는다.
  RULES 시험(Test-LspRulesAdmin.ps1)의 나머지 사례(정리 부분 실패, 5157 불확실성, 이전 배치 정리, 상위 링크, 실제 모드 사전 조건 등)는 같은 진입점 틀을 쓰지만 이 시험에서 다시 돌리지 않았다.
  이 시험의 통과는 "합성 환경에서 진입점의 감독·결합·판정·정리가 의도대로 동작한다"까지만 뜻한다. 실제 Semgrep·전용 계정·방화벽·감사·ACL 아래의 동작은 뜻하지 않는다.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\tests\Test-LspScanAdmin.ps1 -Engine powershell -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -NodeDir C:\node -SkipRealStateCheck
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
    [string]$TargetFile,
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
if (-not $ReinterpretCli) { $ReinterpretCli = Join-Path $TsDir 'lsp-scan-reinterpret-cli.ts' }
if (-not $ProbeFile) { $ProbeFile = Join-Path $TsDir 'data\lsp-rules-1-probe.yaml' }
if (-not $TargetFile) { $TargetFile = Join-Path $TsDir 'data\lsp-scan-1-target.txt' }
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
. (Join-Path $CodeDir 'LspScanContract.ps1')
. (Join-Path $CodeDir 'LspMinAdminContract.ps1')
. (Join-Path $CodeDir 'LspScanAdminContract.ps1')
# 포트 함수(함수 정의뿐이라 불러와도 아무것도 실행하지 않는다): 실행 시도 표지의 배타 생성·기존 산출물 조회를 진짜 파일 시스템(임시 폴더)에서 직접 시험한다.
. (Join-Path $CodeDir 'LspMinAdminPorts.ps1')
. (Join-Path $CodeDir 'LspScanAdminPorts.ps1')

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
    Write-Host '[static] 구문·BOM·LF·금지 명령'
    $allFiles = @('LspScanContract.ps1', 'lsp-scan-runner.ps1', 'lsp-scan-stub.ps1', 'LspScanAdminContract.ps1', 'LspScanAdminPorts.ps1', 'Test-LspScanObservation.ps1', 'tests\MockSystemScan.ps1', 'tests\MockPortsScan.ps1', 'tests\Test-LspScanAdmin.ps1', 'tests\Test-LspScanRunner.ps1')
    $forbiddenCmd = @('Invoke-Expression', 'iex', 'Invoke-WebRequest', 'Invoke-RestMethod', 'Start-BitsTransfer', 'curl', 'wget', 'git', 'git.exe')
    foreach ($f in $allFiles) {
        $p = Join-Path $CodeDir $f
        if (-not (Test-Path -LiteralPath $p)) { Assert-That 'static' "파일 있음 ($f)" $false $p; continue }
        $errs = $null; $tokens = $null
        $ast = [Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errs)
        Assert-That 'static' "구문 $f ($($PSVersionTable.PSVersion))" ($errs.Count -eq 0) (($errs | ForEach-Object { "$($_.Message)@$($_.Extent.StartLineNumber)" }) -join '; ')
        $b = [IO.File]::ReadAllBytes($p)
        Assert-That 'static' "BOM $f" ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)
        Assert-That 'static' "줄바꿈이 LF 뿐이다 ($f)" (-not ([Text.Encoding]::UTF8.GetString($b).Contains("`r")))
        $names = Get-CommandNames $ast
        $bad = @($names | Where-Object { $forbiddenCmd -contains $_ -or $_ -match '(?i)^(semgrep|pysemgrep|semgrep-core)(\.exe)?$' })
        Assert-That 'static' "금지 명령 호출 없음 ($f)" ($bad.Count -eq 0) ($bad -join ',')
    }
    $entrySrc = [IO.File]::ReadAllText((Join-Path $CodeDir 'Test-LspScanObservation.ps1'), [Text.Encoding]::UTF8)
    # 독립 검토 F2: $TargetFile 기본값이 P02 가 읽은 뒤에 채워져 -TargetFile 없는 호출이 항상 거절됐다. 흐름 시험은 샌드박스 복사본에서 돌아 기본 경로(저장소 상대)를 가리킬 수 없으므로(RULES 선례도 -ProbeFile 을 늘 명시한다) 소스상 순서로 고정한다.
    # 줄 시작이 곧바로 if 인 줄만 인정한다(주석 처리된 줄은 기본값을 채우지 않는다).
    $mTargetDefault = [regex]::Match($entrySrc, '(?m)^[ \t]*if \(-not \$TargetFile\) \{ \$TargetFile = ')
    $iTargetDefault = -1; if ($mTargetDefault.Success) { $iTargetDefault = $mTargetDefault.Index }
    $iTargetUse = $entrySrc.IndexOf('Read-LsAdminTargetSource -Path $TargetFile', [StringComparison]::Ordinal)
    Assert-That 'static' '진입점은 $TargetFile 기본값을 P02 가 읽기 전에 채운다 (-TargetFile 없는 호출이 사전 조건에서 거절되지 않는다; 끝에서 끝까지 실행으로 확인한 것은 아니다)' (($iTargetDefault -ge 0) -and ($iTargetUse -ge 0) -and ($iTargetDefault -lt $iTargetUse)) "default=$iTargetDefault use=$iTargetUse"
    Assert-That 'static' '진입점은 SEMGREP_LOG_SRCS·토큰·SEMGREP_ENABLE_VERSION_CHECK 이름을 어디에도 쓰지 않는다' ($entrySrc -notmatch 'LOG_SRCS|SEMGREP_APP_TOKEN|ENABLE_VERSION_CHECK')
    Assert-That 'static' '진입점은 4688(프로세스 생성 감사)을 켜지 않는다 — 감사 창은 5157(차단된 연결) 하나뿐이다' (([regex]::Matches($entrySrc, 'Open-IsoAuditWindow')).Count -eq 1 -and $entrySrc -notmatch '4688|ProcessCreation|Process Creation')
    # 주석 줄은 호출이 아니다(지원 파일의 1번째 줄 설명이 진입점 이름을 말한다). 주석을 뺀 코드 줄에 진입점 이름이 나오는 다른 스크립트만 "이어져 있다"로 센다.
    $mentionsOutsideComments = { param($Path) foreach ($ln in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) { $t = $ln.TrimStart([char]0xFEFF).TrimStart(); if (-not $t.StartsWith('#') -and $t.Contains('Test-LspScanObservation')) { return $true } }; $false }
    $linkedFiles = @(Get-ChildItem -LiteralPath $CodeDir -Filter *.ps1 -File | Where-Object { $_.Name -ne 'Test-LspScanObservation.ps1' -and (& $mentionsOutsideComments $_.FullName) })
    Assert-That 'static' '진입점은 어떤 기본 경로에도 이어져 있지 않다 (다른 스크립트가 코드에서 이 진입점을 부르지 않는다; 주석의 언급은 세지 않는다)' ($linkedFiles.Count -eq 0) (($linkedFiles | ForEach-Object { $_.Name }) -join ',')

    # F5: 확인 인자와 실행 시도 표지의 소스상 순서와 "없는 것"을 고정한다 (끝에서 끝까지 실행으로 확인한 것은 아니다; 흐름 시험이 따로 있다).
    $codeLines = @([IO.File]::ReadAllLines((Join-Path $CodeDir 'Test-LspScanObservation.ps1'), [Text.Encoding]::UTF8) | Where-Object { -not $_.TrimStart([char]0xFEFF).TrimStart().StartsWith('#') })
    $codeOnly = $codeLines -join "`n"
    $ix = { param($s) $codeOnly.IndexOf($s, [StringComparison]::Ordinal) }
    $iConfirm = & $ix 'Test-LsAdminExecuteConfirmation -Given'
    $iPreFirst = & $ix 'T01'
    $iDryReturn = & $ix "NOT_EXECUTED'"
    $iFind = & $ix 'Find-LsAdminScanRecords'
    $iMarker = & $ix 'New-LsAdminAttemptMarker -Path'
    $iReceiver = & $ix 'New-LspMinReceiver'
    $iEnable = & $ix 'Enable-LocalUser'
    $iAuditOpen = & $ix 'Open-IsoAuditWindow -Guid'
    $iFirstDelete = & $ix 'Remove-Item -LiteralPath $ap'
    Assert-That 'static' 'F5 순서: 확인 인자 거부 < 사전 조건 읽기 < dry-run 반환 < 기존 산출물 검사 < 표지 확보 < 수신기·감사 창·계정 켜기·작업 배치 삭제 (표지가 첫 실행 부작용보다 앞이다)' (($iConfirm -ge 0) -and ($iConfirm -lt $iPreFirst) -and ($iPreFirst -lt $iDryReturn) -and ($iDryReturn -lt $iFind) -and ($iFind -lt $iMarker) -and ($iMarker -lt $iReceiver) -and ($iMarker -lt $iAuditOpen) -and ($iMarker -lt $iEnable) -and ($iMarker -lt $iFirstDelete)) "confirm=$iConfirm pre=$iPreFirst dry=$iDryReturn find=$iFind marker=$iMarker receiver=$iReceiver audit=$iAuditOpen enable=$iEnable delete=$iFirstDelete"
    $paramBlock = [regex]::Match($entrySrc, '(?s)\[CmdletBinding\(\)\]\s*param\((.*?)\n\)').Groups[1].Value
    Assert-That 'static' 'F5: 진입점에 -ConfirmRunId 가 있고 -Force·덮어쓰기·표지 복구·삭제 같은 매개변수는 없다' (($paramBlock -match '\$ConfirmRunId') -and ($paramBlock -notmatch '(?i)\$(Force|Overwrite|ClearMarker|ResetMarker|RemoveMarker|Retry|Resume)')) $paramBlock.Substring(0, [Math]::Min(120, $paramBlock.Length))
    $portsSrc = [IO.File]::ReadAllText((Join-Path $CodeDir 'LspScanAdminPorts.ps1'), [Text.Encoding]::UTF8)
    $markerFn = [regex]::Match($portsSrc, '(?s)function New-LsAdminAttemptMarker \{.*?\n\}\n').Value
    Assert-That 'static' 'F5: 표지 포트는 배타 생성(CreateNew)만 쓰고 지우기·덮어쓰기·이름 바꾸기·Truncate·Create(덮어쓰기 모드)가 없다' (($markerFn -match 'FileMode\]::CreateNew') -and ($markerFn -notmatch 'Remove-Item|\.Delete\(|File\]::Delete|FileMode\]::(Create|Truncate|OpenOrCreate|Append)\b|\.Move\(|Rename') -and ($markerFn.Length -gt 200))
    Assert-That 'static' 'F5: 진입점·포트·계약 어디에도 표지를 지우거나 복구하는 코드가 없다 (표지 이름 근처의 Remove-Item·Delete·Clear)' (($codeOnly -notmatch '(?i)(Remove-Item|Delete|Clear-Content)[^\n]*(marker|attempt)') -and ($codeOnly -notmatch '(?i)(marker|attempt)[^\n]*(Remove-Item|\.Delete\()'))
    $recoverySrc = (@('Remove-Isolation.ps1', 'Initialize-Isolation.ps1', 'IsolationFlows.ps1', 'IsolationCommon.ps1') | ForEach-Object { $pp = Join-Path $CodeDir $_; if (Test-Path -LiteralPath $pp) { [IO.File]::ReadAllText($pp, [Text.Encoding]::UTF8) } }) -join "`n"
    Assert-That 'static' 'F5: 격리 자원 복구·적용 스크립트는 실행 시도 표지를 읽지도 확인하지도 않는다 (표지가 복구를 막지 않는다)' ($recoverySrc -notmatch 'lsp-scan-attempt|AttemptMarker')
}

# ═══ (B) 순수 계약 단위 시험 ═════════════════════════════════════════════════
if (Test-Selected 'unit') {
    Write-Host '[unit] LspScanAdminContract.ps1'
    $E = $Script:LsTargetSha256
    $w = 'C:\ProgramData\bosang-semgrep-iso\run-1\work'
    $rw = Join-LmPath $w $Script:LsAdminWorkLeaf
    Assert-That 'unit' '작업 배치 잎 폴더는 lsp-scan 이고, 한도 이름은 열한 개(scanMs 포함)다' (($Script:LsAdminWorkLeaf -ceq 'lsp-scan') -and (@($Script:LsAdminLimitNames).Count -eq 11) -and (@($Script:LsAdminLimitNames) -ccontains 'scanMs'))
    $targets = Get-LsAdminWorkTargets -WorkDir $w -RulesWork $rw
    Assert-That 'unit' '쓰기 목적지 목록에 합성 파일 자리·프로브 자리·요청·결과·중단 표지·러너 사본이 모두 들어 있다' ((@($targets) -contains (Join-LmPath (Join-LmPath $rw 'ws') 'lsp-scan-1-target.txt')) -and (@($targets | Where-Object { $_ -like '*lsp-rules-1-probe.yaml' }).Count -eq 1) -and (@($targets | Where-Object { $_ -like '*lsp-scan-request.json' }).Count -eq 1) -and (@($targets | Where-Object { $_ -like '*lsp-scan-runner.ps1' }).Count -eq 1) -and (@($targets | Where-Object { $_ -like '*lsp-scan-abort.flag' }).Count -eq 1))
    Assert-That 'unit' '러너 사본 목록: 스캔 러너와 그것이 불러오는 RULES·MIN·버전 러너, 스텁이 모두 있다' (@(@('lsp-scan-runner.ps1', 'LspScanContract.ps1', 'lsp-rules-runner.ps1', 'LspRulesContract.ps1', 'lsp-min-runner.ps1', 'LspMinContract.ps1', 'version-runner.ps1', 'lsp-scan-stub.ps1') | Where-Object { $Script:LsAdminWorkCopyFiles -notcontains $_ }).Count -eq 0)
    $good = [IO.File]::ReadAllBytes($TargetFile)
    $t1 = Test-LsAdminTargetBytes $good
    Assert-That 'unit' '합성 파일 바이트 검증: 저장소의 파일은 통과하고, 한 바이트 바뀌거나 길이가 다르거나 없으면 거절한다' ($t1.ok -and $t1.size -eq 135 -and $t1.sha256 -ceq $E -and -not (Test-LsAdminTargetBytes $null).ok -and ((Test-LsAdminTargetBytes (New-Object byte[] 135)).problems -contains 'TARGET_HASH_MISMATCH') -and ((Test-LsAdminTargetBytes (New-Object byte[] 3)).problems -contains 'TARGET_SIZE_MISMATCH'))
    $h1 = Resolve-LsAdminHash $E $E $E; $h2 = Resolve-LsAdminHash $E $E ('f' * 64); $h3 = Resolve-LsAdminHash $E $null $E
    Assert-That 'unit' '해시 합치기: 같으면 그 값, 다르면 기대값이 아닌 쪽, 하나라도 읽지 못했으면 $null' ($h1 -ceq $E -and $h2 -cne $E -and $null -eq $h3)
    $rootsOk = [ordered]@{ WORKSPACE = @('lsp-scan-1-target.txt'); RULES_DIR = @('lsp-rules-1-probe.yaml'); HOME_DIR = @() }
    Assert-That 'unit' '감시 폴더 문제: 작업 영역=합성 파일 하나, 규칙 폴더=프로브 하나, 홈=비어 있음이면 문제가 없다' ((Get-LsAdminRootProblems -Roots $rootsOk).Count -eq 0)
    foreach ($t in @(
            @('작업 영역이 비었다(합성 파일이 없어졌다)', { param($r) $r.WORKSPACE = @() }, 'ROOT_CHANGED:WORKSPACE'),
            @('작업 영역에 파일이 더 있다', { param($r) $r.WORKSPACE = @('lsp-scan-1-target.txt', 'x.txt') }, 'ROOT_CHANGED:WORKSPACE'),
            @('작업 영역의 파일 이름이 다르다', { param($r) $r.WORKSPACE = @('other.txt') }, 'ROOT_CHANGED:WORKSPACE'),
            @('규칙 폴더에 파일이 더 있다', { param($r) $r.RULES_DIR = @('lsp-rules-1-probe.yaml', 'extra.yaml') }, 'ROOT_CHANGED:RULES_DIR'),
            @('홈에 지문 폴더 밖 파일', { param($r) $r.HOME_DIR = @('settings.yml') }, 'ROOT_CHANGED:HOME_DIR'),
            @('작업 영역 목록을 읽지 못함', { param($r) $r.WORKSPACE = $null }, 'ROOT_UNREADABLE:WORKSPACE'))) {
        $r2 = [ordered]@{ WORKSPACE = @($rootsOk.WORKSPACE); RULES_DIR = @($rootsOk.RULES_DIR); HOME_DIR = @() }
        & $t[1] $r2
        Assert-That 'unit' "감시 폴더 문제: $($t[0]) → $($t[2])" ((Get-LsAdminRootProblems -Roots $r2) -ccontains $t[2])
    }
    $ctx = New-LsAdminContext -RunId 'run-1' -Token 'tok' -Mode 'stub' -Work $rw -ExpectedVersion '9.9.9' -Limits ([ordered]@{ totalMs = 1 }) -RunnerLaunched $true -Refusals $null -ReceiverBaseline 0 -ReceiverFinal 0 -ReceiverSamples 3 -ReceiverFailures 0 `
        -Probe ([ordered]@{ sourceSha256 = $Script:LrProbeSha256; afterCopySha256 = $Script:LrProbeSha256; afterRunSha256 = $Script:LrProbeSha256 }) -Target ([ordered]@{ sourceSha256 = $E; afterWriteSha256 = $E; afterRunSha256 = $E }) `
        -IdentityOk $true -IdentityFailures $null -BindingOk $true -BindingFailures $null -AbortRequested $false -AbortReason $null -AbortDelivered $null -ForcedKill $false -DeadlineReached $false -ResultMissing $false -DescendantPathViolations $null -HashesUnchanged $true
    Assert-That 'unit' '관리자 문맥: 스키마·종류가 lsp-scan-admin-context 이고 프로브·합성 파일 해시 셋이 따로 실린다' ($ctx.schema -ceq 'lsp-scan-admin-context/1' -and $ctx.kind -ceq 'lsp-scan-admin-context' -and $ctx.target.afterRunSha256 -ceq $E -and $ctx.target.afterWriteSha256 -ceq $E -and $ctx.probe.afterRunSha256 -ceq $Script:LrProbeSha256 -and $ctx.runnerLaunched -eq $true)
    Assert-That 'unit' '판정 이름: 성립이면 SCAN_RESPONSE_OBSERVED, 스텁이면 STUB_ 를 붙이고, 서버를 띄우지 못했으면 NOT_ATTEMPTED:<사유>, 기록의 SCAN_FAILED 는 그대로' ((Get-LsAdminVerdict -Established $true -NotAttempted $null -RecordStatus 'OBSERVED' -RecordVerdict 'SCAN_RESPONSE_OBSERVED' -PrimaryFailure $null -Stub $false) -ceq 'SCAN_RESPONSE_OBSERVED' -and (Get-LsAdminVerdict -Established $true -NotAttempted $null -RecordStatus 'OBSERVED' -RecordVerdict 'x' -PrimaryFailure $null -Stub $true) -ceq 'STUB_SCAN_RESPONSE_OBSERVED' -and (Get-LsAdminVerdict -Established $false -NotAttempted 'RUNNER_NOT_LAUNCHED' -RecordStatus $null -RecordVerdict $null -PrimaryFailure $null -Stub $true) -ceq 'STUB_NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED' -and (Get-LsAdminVerdict -Established $false -NotAttempted $null -RecordStatus 'SCAN_FAILED' -RecordVerdict 'SCAN_FAILED:NO_MATCH' -PrimaryFailure 'X' -Stub $false) -ceq 'SCAN_FAILED:NO_MATCH')
    $layoutU = Get-LsLayout -Work $rw
    $envU = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $layoutU -Url 'http://127.0.0.1:41999'
    $limU = [ordered]@{}; foreach ($k in $Script:LsAdminLimitNames) { $limU[$k] = [int]$Script:LsLimits[$k] }
    $stubArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-LmPath $w 'lsp-scan-stub.ps1'), 'ok')
    $reqU = New-LsAdminRunnerRequest -Token 'tok' -Mode 'stub' -Exe $Script:Ps51 -ArgList $stubArgs -Layout $layoutU -Env $envU -Limits $limU -ExpectedVersion '9.9.9' -ProbeB64 ([Convert]::ToBase64String([IO.File]::ReadAllBytes($ProbeFile))) -TargetB64 ([Convert]::ToBase64String($good)) -AbortFile (Join-LmPath $w 'lsp-scan-abort.flag') -ResultFile (Join-LmPath $w 'lsp-scan-result.json')
    Assert-That 'unit' '요청 문서는 targetB64 를 담고 자기 점검을 통과한다 (문제 없음)' ($reqU.Contains('targetB64') -and (Test-LsAdminRunnerRequest -Request $reqU).Count -eq 0) ((Test-LsAdminRunnerRequest -Request $reqU) -join ',')
    $reqBad = New-LsAdminRunnerRequest -Token 'tok' -Mode 'stub' -Exe $Script:Ps51 -ArgList $stubArgs -Layout $layoutU -Env $envU -Limits $limU -ExpectedVersion '9.9.9' -ProbeB64 ([Convert]::ToBase64String([IO.File]::ReadAllBytes($ProbeFile))) -TargetB64 ([Convert]::ToBase64String((New-Object byte[] 135))) -AbortFile (Join-LmPath $w 'lsp-scan-abort.flag') -ResultFile (Join-LmPath $w 'lsp-scan-result.json')
    Assert-That 'unit' '요청 자기 점검: 합성 파일 해시가 다르면 TARGET_HASH_MISMATCH 로 보내기 전에 거절한다' ((Test-LsAdminRunnerRequest -Request $reqBad) -ccontains 'TARGET_HASH_MISMATCH')

    # ── F5 확인 인자: 서수 비교 ──
    $shy = [string][char]0x00AD; $nul = [string][char]0
    $okC = Test-LsAdminExecuteConfirmation -Given $RunId -RunId $RunId
    Assert-That 'unit' 'F5 확인 인자: RunId 와 정확히 같으면 통과(reason 없음)' ($okC.ok -and $null -eq $okC.reason)
    foreach ($m in @(@('없음($null)', $null), @('빈 문자열', ''), @('문자열이 아님(숫자)', 7), @('문자열이 아님(배열)', @($RunId)))) {
        $r0 = Test-LsAdminExecuteConfirmation -Given $m[1] -RunId $RunId
        Assert-That 'unit' "F5 확인 인자: $($m[0]) → 거부(CONFIRM_MISSING)" ((-not $r0.ok) -and $r0.reason -ceq 'CONFIRM_MISSING')
    }
    foreach ($m in @(
            @('다른 RunId', '20261029T120000Z-ffffffff'), @('대소문자만 다름(소문자)', $RunId.ToLowerInvariant()), @('대소문자만 다름(대문자)', $RunId.ToUpperInvariant()), @('끝 공백', ($RunId + ' ')), @('앞 공백', (' ' + $RunId)), @('접두만 같음', $RunId.Substring(0, 12)),
            @('소프트 하이픈이 낀 값(문화권 비교는 같다고 본다)', $RunId.Insert(5, $shy)), @('NUL 이 낀 값', $RunId.Insert(5, $nul)), @('줄바꿈이 붙은 값', ($RunId + "`n")))) {
        $r1 = Test-LsAdminExecuteConfirmation -Given $m[1] -RunId $RunId
        Assert-That 'unit' "F5 확인 인자: $($m[0]) → 거부(CONFIRM_MISMATCH)" ((-not $r1.ok) -and $r1.reason -ceq 'CONFIRM_MISMATCH')
    }
    Assert-That 'unit' 'F5 확인 인자: 기대 RunId 가 비었거나 문자열이 아니면 같은 빈 값끼리도 통과시키지 않는다' ((-not (Test-LsAdminExecuteConfirmation -Given 'x' -RunId '').ok) -and (-not (Test-LsAdminExecuteConfirmation -Given 'x' -RunId $null).ok))
    Assert-That 'unit' 'F5 확인 인자: 거부 결과에 기대 RunId 를 싣지 않는다 (복사해 붙이는 확인이 되지 않는다)' (-not (((Test-LsAdminExecuteConfirmation -Given 'nope' -RunId $RunId) | ConvertTo-Json -Depth 3).Contains($RunId)))

    # ── F5 이전 SCAN 산출물 이름 / 표지 경로·본문 ──
    foreach ($n in 'lsp-scan-observation-20261029T120000Z.json', 'lsp-scan-observation-20261029T120000Z.json.tmp', 'lsp-scan-record-x.json', 'lsp-scan-runner-result-x.json', 'lsp-scan-admin-context-x.json', 'lsp-scan-stdout-x.bin', 'lsp-scan-stderr-x.bin', 'LSP-SCAN-OBSERVATION-x.JSON') {
        Assert-That 'unit' "F5 SCAN 산출물 이름: $n 는 이전 SCAN 기록이다" (Test-LsAdminScanRecordName $n)
    }
    foreach ($n in 'lsp-min-observation-x.json', 'lsp-min-record-x.json', 'lsp-rules-observation-x.json', 'lsp-rules-record-x.json', 'lsp-rules-runner-result-x.json', 'lsp-scan-attempt.marker', 'lsp-scan-cancel.flag', 'resources.json', 'log.jsonl', 'preflight.json', '') {
        Assert-That 'unit' "F5 SCAN 산출물 이름: '$n' 는 이전 SCAN 기록이 아니다 (MIN·RULES 기록, 표지, 취소 표지와 섞지 않는다)" (-not (Test-LsAdminScanRecordName $n))
    }
    Assert-That 'unit' 'F5 SCAN 산출물 이름: 문자열이 아니면(null) 기록이 아니다' (-not (Test-LsAdminScanRecordName $null))
    Assert-That 'unit' 'F5 표지 경로: 실행 기록 폴더 바로 아래의 고정 이름이다' ((Get-LsAdminAttemptMarkerPath -RunDir 'C:\x\run-1') -ceq 'C:\x\run-1\lsp-scan-attempt.marker' -and (Get-LsAdminAttemptMarkerPath -RunDir 'C:\x\run-1\') -ceq 'C:\x\run-1\lsp-scan-attempt.marker')
    $mtext = New-LsAdminAttemptMarkerText -RunId $RunId -Mode 'semgrep-lsp' -StartedUtc '2026-11-03T00:00:00.0000000Z' -ProcessId 4242
    $mdoc = $mtext | ConvertFrom-Json
    Assert-That 'unit' 'F5 표지 본문: 스키마·RunId·종류를 싣고 자동 삭제·재시도가 없다는 사실과 D2 승인이 아니라는 사실을 적는다' (($mdoc.schema -ceq 'lsp-scan-attempt-marker/1') -and ($mdoc.runId -ceq $RunId) -and ($mdoc.mode -ceq 'semgrep-lsp') -and ($mdoc.meaning -match '자동으로 지워지지 않고') -and ($mdoc.notD2Approval -match 'D2'))

    # ── F6a PowerShell 결합 검사: 요청 mode 와 결과 mode ──
    $tokB = New-LspMinRunToken -RunId $RunId -Nonce ([guid]::NewGuid().ToString('N'))
    $launchedB = [DateTime]::UtcNow.AddSeconds(-1)
    $bindOf = {
        param($ResMode, $ReqMode, [switch]$NoResMode)
        $res = [ordered]@{ schema = 1; kind = 'lsp-scan-runner-result'; runToken = $tokB; startedUtc = [DateTime]::UtcNow.ToString('o'); refused = 'TEST' }
        if (-not $NoResMode) { $res['mode'] = $ResMode }
        $req = [ordered]@{ runToken = $tokB; mode = $ReqMode; limits = [ordered]@{} }
        Test-LsAdminResultBinding -Result $res -Request $req -RunId $RunId -LaunchedUtc $launchedB
    }
    $b1 = & $bindOf 'stub' 'stub'; $b2 = & $bindOf 'semgrep-lsp' 'semgrep-lsp'
    Assert-That 'unit' 'F6a 결합 검사: 정상 두 종류(stub/stub, semgrep-lsp/semgrep-lsp)는 mode 실패가 없다' ((@($b1) -notcontains 'MODE_MISMATCH') -and (@($b1) -notcontains 'MODE_INVALID') -and (@($b2) -notcontains 'MODE_MISMATCH') -and (@($b2) -notcontains 'MODE_INVALID')) "$(@($b1) -join ',') | $(@($b2) -join ',')"
    $b3 = & $bindOf 'semgrep-lsp' 'stub'; $b4 = & $bindOf 'stub' 'semgrep-lsp'
    Assert-That 'unit' 'F6a 결합 검사: 양방향 불일치(요청 stub·결과 semgrep-lsp, 요청 semgrep-lsp·결과 stub)는 MODE_MISMATCH' ((@($b3) -contains 'MODE_MISMATCH') -and (@($b4) -contains 'MODE_MISMATCH')) "$(@($b3) -join ',') | $(@($b4) -join ',')"
    foreach ($bad in @(@('누락', $null), @('빈 문자열', ''), @('대소문자 다름', 'Stub'), @('모르는 값', 'other'), @('끝 공백', 'stub '), @('소프트 하이픈', "stu${shy}b"), @('NUL', "stub$nul"))) {
        $bb = $(if ($bad[0] -ceq '누락') { & $bindOf $null 'stub' -NoResMode } else { & $bindOf $bad[1] 'stub' })
        Assert-That 'unit' "F6a 결합 검사: 결과 mode $($bad[0]) → 실패(MODE_MISMATCH)" (@($bb) -contains 'MODE_MISMATCH') (@($bb) -join ',')
        Assert-That 'unit' "F6a 결합 검사: 결과 mode $($bad[0]) → MODE_INVALID 도 남는다 (요청과 같은 값이어도 모르는 값은 통과가 아니다)" (@($bb) -contains 'MODE_INVALID') (@($bb) -join ',')
    }
    $bsame = & $bindOf 'other' 'other'
    Assert-That 'unit' 'F6a 결합 검사: 요청과 결과가 같은 모르는 값(other)이어도 MODE_INVALID' (@($bsame) -contains 'MODE_INVALID') (@($bsame) -join ',')

    # ── F5 포트: 진짜 파일 시스템(임시 폴더)에서의 배타 생성·조회·링크·동시성 ──
    $tmpRoot = Join-Path ([IO.Path]::GetTempPath()) ('iso-scanmarker-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
    [void][IO.Directory]::CreateDirectory($tmpRoot); [void]$Sandboxes.Add($tmpRoot)
    $runA = Join-Path $tmpRoot 'runA'; [void][IO.Directory]::CreateDirectory($runA)
    foreach ($n in 'resources.json', 'lsp-min-observation-x.json', 'lsp-rules-observation-x.json', 'lsp-scan-cancel.flag') { [IO.File]::WriteAllText((Join-Path $runA $n), '{}') }
    $fa = Find-LsAdminScanRecords -RunDir $runA
    Assert-That 'unit' 'F5 조회 포트: MIN·RULES 기록과 취소 표지만 있으면 SCAN 산출물은 없다 (ok, 빈 목록)' ($fa.ok -and @($fa.files).Count -eq 0) (@($fa.files) -join ',')
    foreach ($n in 'lsp-scan-observation-20261029T120000Z.json', 'lsp-scan-stdout-20261029T120000Z.bin') { [IO.File]::WriteAllText((Join-Path $runA $n), 'x') }
    $fb = Find-LsAdminScanRecords -RunDir $runA
    Assert-That 'unit' 'F5 조회 포트: SCAN 산출물 두 개를 이름 순으로 찾고 다른 기록은 섞지 않는다' ($fb.ok -and (@($fb.files) -join ',') -ceq 'lsp-scan-observation-20261029T120000Z.json,lsp-scan-stdout-20261029T120000Z.bin') (@($fb.files) -join ',')
    $fc = Find-LsAdminScanRecords -RunDir (Join-Path $tmpRoot 'missing-run')
    Assert-That 'unit' 'F5 조회 포트: 폴더를 읽지 못하면 ok=false (없다고 하지 않는다)' ((-not $fc.ok) -and $fc.error)

    $runB = Join-Path $tmpRoot 'runB'; [void][IO.Directory]::CreateDirectory($runB)
    $mp = Get-LsAdminAttemptMarkerPath -RunDir $runB
    $m1 = New-LsAdminAttemptMarker -Path $mp -Text $mtext -TrustedRoot $runB
    $h1 = Get-LrSha256Hex ([IO.File]::ReadAllBytes($mp))
    Assert-That 'unit' 'F5 표지 포트: 첫 호출은 만들고(ok, created) 본문이 그대로 기록된다' ($m1.ok -and $m1.created -and (-not $m1.exists) -and ([IO.File]::ReadAllText($mp, [Text.Encoding]::UTF8).TrimEnd() -ceq $mtext.TrimEnd())) ($m1 | ConvertTo-Json -Compress)
    $m2 = New-LsAdminAttemptMarker -Path $mp -Text 'OTHER' -TrustedRoot $runB
    Assert-That 'unit' 'F5 표지 포트: 두 번째 호출은 이미 있다고 거절하고(exists) 아무것도 바꾸지 않는다 (덮어쓰기 없음)' ((-not $m2.ok) -and $m2.exists -and (-not $m2.created) -and ((Get-LrSha256Hex ([IO.File]::ReadAllBytes($mp))) -ceq $h1)) ($m2 | ConvertTo-Json -Compress)
    Assert-That 'unit' 'F5 표지 포트: 표지는 그대로 남고 폴더에 다른 파일이 생기지 않았다' ((@(Get-ChildItem -LiteralPath $runB -Force).Count -eq 1))
    $f1 = Find-LsAdminScanRecords -RunDir $runB
    Assert-That 'unit' 'F5 조회 포트: 표지 파일은 SCAN 산출물로 세지 않는다' ($f1.ok -and @($f1.files).Count -eq 0)

    # 링크 우회: 표지 자리에 (대상이 바깥인) 정션이 이미 있으면 따라가지 않고 거절하며 바깥에 아무것도 만들지 않는다.
    $outside = Join-Path $tmpRoot 'outside'; [void][IO.Directory]::CreateDirectory($outside)
    $runC = Join-Path $tmpRoot 'runC'; [void][IO.Directory]::CreateDirectory($runC)
    $linkOk = $true
    try { [void](New-Item -ItemType Junction -Path (Get-LsAdminAttemptMarkerPath -RunDir $runC) -Target $outside -ErrorAction Stop) } catch { $linkOk = $false }
    if (-not $linkOk) { Skip-That 'unit' '이 환경에서는 정션을 만들 수 없어 표지 자리 링크 시험을 건너뛴다' }
    else {
        $m3 = New-LsAdminAttemptMarker -Path (Get-LsAdminAttemptMarkerPath -RunDir $runC) -Text $mtext -TrustedRoot $runC
        Assert-That 'unit' 'F5 표지 포트: 표지 자리에 링크가 있으면 거절(exists, 경로 안전하지 않음)하고 링크 대상 바깥에 아무것도 만들지 않는다' ((-not $m3.ok) -and $m3.exists -and ([string]$m3.error).StartsWith('MARKER_PATH_UNSAFE') -and (@(Get-ChildItem -LiteralPath $outside -Force).Count -eq 0)) ($m3 | ConvertTo-Json -Compress)
    }
    # 실행 기록 폴더 자체가 링크이면 그 아래(대상 폴더)에 만들지 않는다.
    $runD = Join-Path $tmpRoot 'runD-link'
    $linkOk2 = $true
    try { [void](New-Item -ItemType Junction -Path $runD -Target $outside -ErrorAction Stop) } catch { $linkOk2 = $false }
    if ($linkOk2) {
        $m4 = New-LsAdminAttemptMarker -Path (Get-LsAdminAttemptMarkerPath -RunDir $runD) -Text $mtext -TrustedRoot $runD
        Assert-That 'unit' 'F5 표지 포트: 실행 기록 폴더(신뢰 루트) 자체가 링크이면 거절하고(exists=false, 아무것도 만들지 않음) 대상 폴더에 만들지 않는다' ((-not $m4.ok) -and (-not $m4.created) -and (-not $m4.exists) -and (@(Get-ChildItem -LiteralPath $outside -Force).Count -eq 0)) ($m4 | ConvertTo-Json -Compress)
    }
    # 동시 배타 생성: 여덟 실행 공간이 한 문(ManualResetEvent)에서 동시에 출발해 같은 표지를 만든다 → 정확히 하나만 만든다.
    $runE = Join-Path $tmpRoot 'runE'; [void][IO.Directory]::CreateDirectory($runE)
    $mpE = Get-LsAdminAttemptMarkerPath -RunDir $runE
    $fnDefs = ''; foreach ($fn in 'Get-LspMinPieceState', 'Get-LspMinWorkPathProblems', 'New-LsAdminAttemptMarker') { $fnDefs += "function $fn {`n" + (Get-Item "function:$fn").ScriptBlock.ToString() + "`n}`n" }
    $raceScript = 'param($P, $T, $R, $G)' + "`n" + $fnDefs + "`n" + '[void]$G.WaitOne(); New-LsAdminAttemptMarker -Path $P -Text $T -TrustedRoot $R'
    $gate = New-Object System.Threading.ManualResetEvent($false)
    $pool = [runspacefactory]::CreateRunspacePool(1, 8); $pool.Open()
    $racers = New-Object System.Collections.ArrayList
    foreach ($i in 1..8) {
        $ps = [powershell]::Create(); $ps.RunspacePool = $pool
        [void]$ps.AddScript($raceScript).AddArgument($mpE).AddArgument(("RACER-$i`n" + $mtext)).AddArgument($runE).AddArgument($gate)
        [void]$racers.Add([pscustomobject]@{ Ps = $ps; Handle = $ps.BeginInvoke() })
    }
    Start-Sleep -Milliseconds 600; [void]$gate.Set()
    $won = 0; $lost = 0; $other = 0
    foreach ($rc in $racers) {
        $out = @($rc.Ps.EndInvoke($rc.Handle)); $d = $null
        if ($out.Count -eq 1 -and $null -ne $out[0]) { $d = $out[0].PSObject.BaseObject }
        if ($null -ne $d -and $d['ok'] -eq $true) { $won++ } elseif ($null -ne $d -and $d['exists'] -eq $true) { $lost++ } else { $other++ }
        $rc.Ps.Dispose()
    }
    $pool.Close(); $pool.Dispose(); $gate.Dispose()
    $bodyE = [IO.File]::ReadAllText($mpE, [Text.Encoding]::UTF8)
    Assert-That 'unit' 'F5 표지 포트: 여덟 개가 동시에 배타 생성을 시도하면 정확히 하나만 성공하고 나머지 일곱은 exists 로 거절된다' (($won -eq 1) -and ($lost -eq 7) -and ($other -eq 0)) "won=$won lost=$lost other=$other"
    Assert-That 'unit' 'F5 표지 포트: 동시 시도 뒤에도 표지 본문은 이긴 한 호출의 것 하나뿐이다 (섞이거나 덮이지 않는다)' (([regex]::Matches($bodyE, 'RACER-')).Count -eq 1 -and ($bodyE -match '"schema"') -and (@(Get-ChildItem -LiteralPath $runE -Force).Count -eq 1)) $bodyE.Substring(0, [Math]::Min(80, $bodyE.Length))
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
    $root = Join-Path ([IO.Path]::GetTempPath()) ('iso-scanflows-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
    $code = Join-Path $root 'code'
    [void][IO.Directory]::CreateDirectory($code)
    foreach ($f in Get-ChildItem -LiteralPath $CodeDir -Filter *.ps1 -File) { [IO.File]::Copy($f.FullName, (Join-Path $code $f.Name)) }
    foreach ($f in 'MockSystem.ps1', 'MockSystemLsp.ps1', 'MockPortsLsp.ps1', 'MockSystemScan.ps1', 'MockPortsScan.ps1') { [IO.File]::Copy((Join-Path $PSScriptRoot $f), (Join-Path $root $f)) }
    # 모의 시스템 확장은 (a) 적용·복구 진입점이 읽는 IsolationFlows.ps1, (b) LSP-MIN-1 포트(LspMinAdminPorts.ps1), (c) 이 관측의 포트(LspScanAdminPorts.ps1) 바로 뒤에 읽히게 한다. 5.1 이 한글을 읽도록 BOM 을 붙인다.
    $stubs = @{ 'IsolationFlows.ps1' = @('..\MockSystemLsp.ps1'); 'LspMinAdminPorts.ps1' = @('..\MockSystemLsp.ps1', '..\MockPortsLsp.ps1'); 'LspScanAdminPorts.ps1' = @('..\MockSystemScan.ps1', '..\MockPortsScan.ps1') }
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
$GOODLIM = @('-TotalMs', '20000', '-InitMs', '8000', '-RulesMs', '8000', '-SettleMs', '400', '-ScanMs', '3000', '-ExitMs', '6000', '-StdinCloseGraceMs', '3000', '-KillConfirmMs', '3000', '-StartAllowanceMs', '15000', '-SupervisorGraceMs', '5000')
$FASTLIM = @('-TotalMs', '3000', '-InitMs', '1500', '-RulesMs', '1500', '-SettleMs', '300', '-ScanMs', '1500', '-ExitMs', '1000', '-StdinCloseGraceMs', '800', '-KillConfirmMs', '1500', '-StartAllowanceMs', '4000', '-SupervisorGraceMs', '2000')
$BARLIM = @('-TotalMs', '20000', '-InitMs', '8000', '-RulesMs', '1500', '-SettleMs', '400', '-ScanMs', '3000', '-ExitMs', '6000', '-StdinCloseGraceMs', '1500', '-KillConfirmMs', '5000', '-StartAllowanceMs', '15000', '-SupervisorGraceMs', '5000')
function Invoke-Rules {
    param($Sb, [switch]$Dry, [string]$StubScenario = 'ok', [string[]]$Limits = $GOODLIM, [switch]$NoTools, [string[]]$Extra = @(), [string]$ExpectedVersion = '9.9.9', [string]$Probe)
    $probeArg = $ProbeFile; if ($Probe) { $probeArg = $Probe }
    $a = @('-RunDir', $Sb.RunDir, '-Mode', 'stub', '-StubScenario', $StubScenario, '-ExpectedVersion', $ExpectedVersion, '-ProbeFile', $probeArg, '-TargetFile', $TargetFile, '-CancelFile', $Sb.Cancel) + $Limits
    if (-not $NoTools -and $toolsReady) { $a += @('-TsxCmd', $TsxCmd, '-ReinterpretCli', $ReinterpretCli); if ($NodeDir) { $a += @('-NodeDir', $NodeDir) } }
    if (-not $Dry) { $a += '-Execute' }
    Invoke-Entry $Sb 'lsp' 'Test-LspScanObservation.ps1' ($a + $Extra)
}
function Invoke-Recover { param($Sb) Invoke-Entry $Sb 'recover' 'Remove-Isolation.ps1' @('-RunDir', $Sb.RunDir, '-Apply') }
function Get-Fake { param($Sb) $f = Join-Path $Sb.Root 'fake-state.json'; if (Test-Path -LiteralPath $f) { [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-AuditValue { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; Get-Prop $s.audit $FpcGuid }
function Get-UserEnabled { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; $u = Get-Prop $s.users $UserName; if ($null -eq $u) { return $null }; $u.Enabled }
function Get-RunJson { param($Sb, [string]$Filter) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter $Filter -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-RunFile { param($Sb, [string]$Filter) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter $Filter -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { $f.FullName } else { $null } }
function Get-RulesReport { param($Sb) Get-RunJson $Sb 'lsp-scan-observation-*.json' }
function Get-CallsLog { param($Sb) $lf = Join-Path $Sb.Root 'calls.log'; if (-not (Test-Path -LiteralPath $lf)) { return '' }; [IO.File]::ReadAllText($lf) }
# 이 샌드박스가 띄운 프로세스가 남아 있는지(있으면 끝낸다). 남은 개수를 돌려준다.
function Remove-Stragglers {
    param($Sb)
    $left = @(Get-CimInstance Win32_Process -Property ProcessId, CommandLine -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($Sb.Root, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    foreach ($p in $left) { Stop-Process -Id ([int]$p.ProcessId) -Force -ErrorAction SilentlyContinue }
    $left.Count
}
function New-RulesSandbox { param([hashtable]$Lsp = @{}, [hashtable]$Top = @{}) $sc = @{ lsp = $Lsp }; foreach ($k in $Top.Keys) { $sc[$k] = $Top[$k] }; $sb = New-Sandbox -Scenario $sc; $r = Invoke-Apply $sb; if ($r.exit -ne 0) { throw "적용 단계가 실패했다(exit $($r.exit)): $($r.out)" }; $sb }
$RulesWorkOf = { param($Sb) Join-Path $Sb.WorkDir 'work\lsp-scan' }


# ═══ (C) 흐름 시험(LSP-SCAN-1 고유 사례) ═════════════════════════════════════
$BADSCAN = @('-TotalMs', '20000', '-InitMs', '8000', '-RulesMs', '8000', '-SettleMs', '400', '-ScanMs', '60000', '-ExitMs', '6000', '-StdinCloseGraceMs', '3000', '-KillConfirmMs', '3000', '-StartAllowanceMs', '15000', '-SupervisorGraceMs', '5000')
# Get-List 는 `, 배열` 로 한 겹 감싸 돌려준다. 여기서 @() 로 다시 감싸면 원소 1개짜리가 되어 -ccontains 가 토큰을 못 찾는다. 그대로 넘기고, 받는 쪽이 먼저 변수에 받는다.
function Get-FailTokens { param($Rep) Get-List $Rep 'observation.failures' }

if (Test-Selected 'control') {
    Write-Host '[control] 정상 흐름(진짜 러너 + 스텁 서버, 모의 시스템)'
    if (-not $toolsReady) { Skip-That 'control' 'TS 재해석 도구(-TsxCmd)가 없다: 관측 성립 판정을 확인할 수 없다' }
    else {
        $sb = New-RulesSandbox
        $auditBefore = Get-AuditValue $sb
        $r = Invoke-Rules $sb
        $rep = Get-RulesReport $sb
        $Script:Control = [pscustomobject]@{ Sb = $sb; Out = $r }
        $E = $Script:LsTargetSha256; $P = $Script:LrProbeSha256
        Assert-That 'control' '종료 코드 0' ($r.exit -eq 0) "exit=$($r.exit)`n$($r.out)"
        Assert-That 'control' '판정 STUB_SCAN_RESPONSE_OBSERVED' ((Get-Prop $rep 'verdict') -ceq 'STUB_SCAN_RESPONSE_OBSERVED') (Get-Prop $rep 'verdict')
        Assert-That 'control' '관측 성립: 재해석 기록 상태 OBSERVED, 판정 SCAN_RESPONSE_OBSERVED, 종료 경로 NORMAL, 서버를 띄웠다' (((Get-Prop $rep 'observation.established') -eq $true) -and ((Get-Prop $rep 'observation.recordStatus') -ceq 'OBSERVED') -and ((Get-Prop $rep 'observation.recordVerdict') -ceq 'SCAN_RESPONSE_OBSERVED') -and ((Get-Prop $rep 'observation.trigger') -ceq 'NORMAL') -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $true) -and ($null -eq (Get-Prop $rep 'observation.notAttempted')))
        Assert-That 'control' '결과 결합과 신원 교차 확인이 통과' (((Get-Prop $rep 'binding.ok') -eq $true) -and ((Get-Prop $rep 'identity.ok') -eq $true) -and ((Get-Prop $rep 'binding.resultState') -eq 'ACCEPTED'))
        Assert-That 'control' '보낸 것은 initialize, initialized(정확히 1회), didOpen(정확히 1회), shutdown, exit 순서다' (((Get-List $rep 'runnerResult.sentLabels') -join ',') -ceq 'initialize,initialized,didOpen,shutdown,exit') ((Get-List $rep 'runnerResult.sentLabels') -join ',')
        Assert-That 'control' '프로브·합성 파일 해시: 문맥에 실린 원본·복사/쓰기 직후·실행 뒤가 모두 고정값이다' (((Get-Prop $rep 'probe.contextValues.afterRunSha256') -ceq $P) -and ((Get-Prop $rep 'probe.contextValues.afterCopySha256') -ceq $P) -and ((Get-Prop $rep 'target.contextValues.sourceSha256') -ceq $E) -and ((Get-Prop $rep 'target.contextValues.afterWriteSha256') -ceq $E) -and ((Get-Prop $rep 'target.contextValues.afterRunSha256') -ceq $E))
        Assert-That 'control' '관리자 사후 확인: 읽어도 되는지 확인했고, 합성 파일·프로브를 직접 다시 읽어 잰 해시가 고정값이며, 작업 영역은 합성 파일 하나, 규칙 폴더는 프로브 하나뿐이다' (((Get-Prop $rep 'adminPostRun.readAllowed') -eq $true) -and ((Get-Prop $rep 'adminPostRun.probe.sha256') -ceq $P) -and ((Get-Prop $rep 'adminPostRun.target.sha256') -ceq $E) -and ((Get-List $rep 'adminPostRun.roots.WORKSPACE') -join ',') -ceq 'lsp-scan-1-target.txt' -and ((Get-List $rep 'adminPostRun.roots.RULES_DIR') -join ',') -ceq 'lsp-rules-1-probe.yaml') ("readAllowed=$(Get-Prop $rep 'adminPostRun.readAllowed') probe=$(Get-Prop $rep 'adminPostRun.probe.sha256') target=$(Get-Prop $rep 'adminPostRun.target.sha256') ws=[$((Get-List $rep 'adminPostRun.roots.WORKSPACE') -join ',')] rules=[$((Get-List $rep 'adminPostRun.roots.RULES_DIR') -join ',')]")
        $tOnDisk = Join-Path $sb.WorkDir 'work\lsp-scan\ws\lsp-scan-1-target.txt'
        Assert-That 'control' '디스크: 작업 영역에는 합성 파일 한 개뿐이고 바이트가 고정 해시와 같다' ((Test-Path -LiteralPath $tOnDisk) -and (@(Get-ChildItem -LiteralPath (Split-Path $tOnDisk -Parent) -Force).Count -eq 1) -and ((Get-LrSha256Hex ([IO.File]::ReadAllBytes($tOnDisk))) -ceq $E))
        $reqOnDisk = Get-Content -LiteralPath (Join-Path $sb.WorkDir 'work\lsp-scan-request.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        Assert-That 'control' '디스크의 요청: 합성 파일 바이트(135바이트로 풀린다)와 프로브 바이트(233바이트), 같은 토큰, 한도 열한 개(scanMs 3000)' (([Convert]::FromBase64String([string]$reqOnDisk.targetB64).Length -eq 135) -and ([Convert]::FromBase64String([string]$reqOnDisk.probeB64).Length -eq 233) -and ([string]$reqOnDisk.runToken -ceq [string](Get-Prop $rep 'runToken')) -and (@($reqOnDisk.limits.PSObject.Properties).Count -eq 11) -and ($reqOnDisk.limits.scanMs -eq 3000))
        $ctxMode = Get-RunJson $sb 'lsp-scan-admin-context-*.json'
        Assert-That 'control' 'F6a: 스텁 모드에서는 관리자 문맥의 mode 가 stub 이고 재해석 기록의 출처도 stub 이며 아무것도 세우지 않는다 (SYNTHETIC_STUB_ONLY)' (((Get-Prop $ctxMode 'mode') -ceq 'stub') -and ((Get-Prop (Get-RunJson $sb 'lsp-scan-record-*.json') 'record.provenance') -ceq 'stub') -and ((Get-List (Get-RunJson $sb 'lsp-scan-record-*.json') 'record.established').Count -eq 0) -and ((Get-Prop (Get-RunJson $sb 'lsp-scan-record-*.json') 'record.evidence_scope') -ceq 'SYNTHETIC_STUB_ONLY'))
        Assert-That 'control' 'F5: 스텁 모드는 확인 인자도 실행 시도 표지도 요구하지 않는다 (표지 파일 없음, 보고서의 표지 기록은 applicable=false)' ((-not (Test-Path -LiteralPath (Join-Path $sb.RunDir 'lsp-scan-attempt.marker'))) -and ((Get-Prop $rep 'attemptMarker.applicable') -eq $false) -and (-not ((Get-CallsLog $sb) -match 'New-LsAdminAttemptMarker')))
        Assert-That 'control' '정리: 감사 값 복구, 계정 비활성화, 세 결과가 따로 있고 모두 성공' (((Get-AuditValue $sb) -eq $auditBefore) -and ((Get-UserEnabled $sb) -eq $false) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
        Assert-That 'control' '원시 stdout·stderr, 러너 결과 원문, 문맥, 기록 파일이 실행 기록 폴더에 하나씩 있다' ((@(Get-ChildItem $sb.RunDir -Filter 'lsp-scan-stdout-*.bin').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-scan-stderr-*.bin').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-scan-runner-result-*.json').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-scan-admin-context-*.json').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-scan-record-*.json').Count -eq 1))
        $ctxDoc = Get-RunJson $sb 'lsp-scan-admin-context-*.json'
        Assert-That 'control' '문맥 파일: 스키마 lsp-scan-admin-context/1, 작업 폴더가 lsp-scan 배치, 합성 파일 해시 셋, 한도 열한 개' (((Get-Prop $ctxDoc 'schema') -eq 'lsp-scan-admin-context/1') -and ((Get-Prop $ctxDoc 'work') -eq (& $RulesWorkOf $sb)) -and ((Get-Prop $ctxDoc 'target.afterRunSha256') -ceq $E) -and (@((Get-Prop $ctxDoc 'limits').PSObject.Properties).Count -eq 11))
        $recDoc = Get-RunJson $sb 'lsp-scan-record-*.json'
        Assert-That 'control' '기록 파일: 상태 OBSERVED, 보낸 순서에 didOpen 이 한 번' (((Get-Prop $recDoc 'record.status') -eq 'OBSERVED') -and ((@(Get-Prop $recDoc 'record.sent') | ForEach-Object { $_.label }) -join ',') -ceq 'initialize,initialized,didOpen,shutdown,exit')
        $recover = Invoke-Recover $sb
        Assert-That 'control' '이어서 복구 스크립트가 정상 종료(0)' ($recover.exit -eq 0) "exit=$($recover.exit)"
        Assert-That 'control' '남은 프로세스 없음' ((Remove-Stragglers $sb) -eq 0)
    }
}

if (Test-Selected 'dry-run') {
    Write-Host '[dry-run] 계획만'
    $sb = New-RulesSandbox
    $r = Invoke-Rules $sb -Dry
    Assert-That 'dry-run' '종료 0, NOT_EXECUTED, 요청·러너 사본을 쓰지 않고 계정은 꺼진 채다' ($r.exit -eq 0 -and $r.out.Contains('NOT_EXECUTED') -and -not (Test-Path -LiteralPath (Join-Path $sb.WorkDir 'work\lsp-scan-request.json')) -and ((Get-UserEnabled $sb) -eq $false)) "exit=$($r.exit)`n$($r.out)"
}

if (Test-Selected 'limits') {
    Write-Host '[limits] 한도 거부(30)'
    $sb = New-RulesSandbox
    $r = Invoke-Rules $sb -Limits $BADSCAN
    Assert-That 'limits' 'scanMs 를 기본 상한 위로 올리면 거부(종료 30)하고 아무것도 바꾸지 않는다' ($r.exit -eq 30 -and ((Get-UserEnabled $sb) -eq $false) -and -not (Test-Path -LiteralPath (Join-Path $sb.WorkDir 'work\lsp-scan-request.json'))) "exit=$($r.exit)`n$($r.out)"
}

if (Test-Selected 'not-attempted') {
    Write-Host '[not-attempted] 러너를 띄우지 못함'
    $sb = New-RulesSandbox -Lsp @{ startProcessFails = $true }
    $r = Invoke-Rules $sb
    $rep = Get-RulesReport $sb
    Assert-That 'not-attempted' '종료 60, 판정 STUB_NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED, 서버를 띄우지 않았음, 정리는 완료' ($r.exit -eq 60 -and ((Get-Prop $rep 'verdict') -ceq 'STUB_NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED') -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $false) -and ((Get-UserEnabled $sb) -eq $false)) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
}

# ═══ (C) 흐름 시험: 실제 모드(semgrep-lsp)의 확인 인자와 실행 시도 표지 (F5) ═══════════════════════════════
# 설치물 확인(Test-LsAdminInstall)만 모의 포트가 대체하고(installOk), 러너를 띄우는 모의는 semgrep-lsp 요청을 MOCK GUARD 로 막는다: 진짜 Semgrep 은 어떤 경로로도 실행되지 않는다.
$MUTATORS = 'Enable-LocalUser|Disable-LocalUser|Start-Process|Stop-Process|Remove-Item|New-Item|Set-Acl|Set-AuditSubcategory|Invoke-AuditPol /set|New-LspMinReceiver|New-LsAdminAttemptMarker'
function Invoke-RealScan {
    param($Sb, [switch]$Dry, [string]$Confirm, [string]$ExpectedVersion = '9.9.9')
    $dist = Join-Path $Sb.Root 'fake-dist'
    $a = @('-RunDir', $Sb.RunDir, '-Mode', 'semgrep-lsp', '-DistRoot', $dist, '-SemgrepExe', (Join-Path $dist 'venv\Scripts\semgrep.exe'), '-ExpectedExeSha256', ('a' * 64), '-WheelPath', (Join-Path $Sb.Root 'fake.whl'), '-ExpectedWheelSha256', ('b' * 64), '-DistReport', (Join-Path $Sb.Root 'fake-dist-report.md'), '-ExpectedVersion', $ExpectedVersion, '-ProbeFile', $ProbeFile, '-TargetFile', $TargetFile, '-CancelFile', $Sb.Cancel)
    # 거절 경로에서는 재해석 도구를 부르지 않는다. 도구가 없으면 L09(도구 존재 확인)를 통과할 자리표시 경로를 준다.
    if ($toolsReady) { $a += @('-TsxCmd', $TsxCmd, '-ReinterpretCli', $ReinterpretCli); if ($NodeDir) { $a += @('-NodeDir', $NodeDir) } } else { $a += @('-TsxCmd', $EnginePath, '-ReinterpretCli', $ReinterpretCli) }
    if ($PSBoundParameters.ContainsKey('Confirm')) { $a += @('-ConfirmRunId', $Confirm) }
    if (-not $Dry) { $a += '-Execute' }
    Invoke-Entry $Sb 'lsp' 'Test-LspScanObservation.ps1' $a
}
function Get-LspCallLines { param($Sb) @(((Get-CallsLog $Sb) -split "`n") | Where-Object { $_.StartsWith('[lsp]') }) }
function Get-NewMutators { param($Sb, [int]$Before) $all = @(Get-LspCallLines $Sb); if ($all.Count -le $Before) { return @() }; @($all[$Before..($all.Count - 1)] | Where-Object { $_ -match $MUTATORS }) }
function Get-MarkerFile { param($Sb) Join-Path $Sb.RunDir 'lsp-scan-attempt.marker' }
function Test-RequestWritten { param($Sb) Test-Path -LiteralPath (Join-Path $Sb.WorkDir 'work\lsp-scan-request.json') }

if (Test-Selected 'confirm') {
    Write-Host '[confirm] 실제 모드 -Execute 의 확인 인자'
    $sb = New-RulesSandbox -Lsp @{ installOk = $true }
    $auditBefore = Get-AuditValue $sb
    $shyS = [string][char]0x00AD
    $variants = @(
        @('인자 없음', $null), @('다른 RunId', '20261029T120000Z-ffffffff'), @('소문자로만 다름', $RunId.ToLowerInvariant()), @('끝 공백', ($RunId + ' ')), @('접두만 같음', $RunId.Substring(0, 12)), @('소프트 하이픈이 낀 값', $RunId.Insert(5, $shyS)))   # 빈 문자열은 5.1 이 자식에게 넘기지 않아 흐름으로는 못 보낸다: 단위 시험에서 본다
    foreach ($v in $variants) {
        $before = @(Get-LspCallLines $sb).Count
        if ($null -eq $v[1]) { $r = Invoke-RealScan $sb } else { $r = Invoke-RealScan $sb -Confirm $v[1] }
        $mut = Get-NewMutators $sb $before
        Assert-That 'confirm' "확인 인자 $($v[0]): 종료 30 으로 거부한다" ($r.exit -eq 30 -and $r.out.Contains('-ConfirmRunId')) "exit=$($r.exit)`n$($r.out)"
        Assert-That 'confirm' "확인 인자 $($v[0]): 계정 켜기·감사 변경·수신기·작업 배치·러너 호출이 0건이고 표지·요청 파일도 없다" ((@($mut).Count -eq 0) -and ((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq $auditBefore) -and (-not (Test-Path -LiteralPath (Get-MarkerFile $sb))) -and (-not (Test-RequestWritten $sb))) "mutators=[$(@($mut) -join ' | ')]"
        Assert-That 'confirm' "확인 인자 $($v[0]): 거부 메시지에 기대 RunId 를 적지 않는다" (-not $r.out.Contains($RunId)) $r.out
    }
    # dry-run: 확인 인자가 없어도, 맞게 줘도 실행하지 않고 표지도 만들지 않는다 (인자를 줬다는 이유만으로 실행하지 않는다).
    foreach ($dry in @(@('인자 없음', $null), @('맞는 인자', $RunId), @('틀린 인자', 'wrong'))) {
        $before = @(Get-LspCallLines $sb).Count
        if ($null -eq $dry[1]) { $r = Invoke-RealScan $sb -Dry } else { $r = Invoke-RealScan $sb -Dry -Confirm $dry[1] }
        $mut = Get-NewMutators $sb $before
        Assert-That 'confirm' "dry-run($($dry[0])): 종료 0, NOT_EXECUTED, 표지·요청 파일 없음, 변경 호출 0건" ($r.exit -eq 0 -and $r.out.Contains('NOT_EXECUTED') -and (-not (Test-Path -LiteralPath (Get-MarkerFile $sb))) -and (-not (Test-RequestWritten $sb)) -and (@($mut).Count -eq 0) -and ((Get-UserEnabled $sb) -eq $false)) "exit=$($r.exit) mutators=[$(@($mut) -join ' | ')]`n$($r.out)"
    }
    $rDry = Invoke-RealScan $sb -Dry -Confirm $RunId
    Assert-That 'confirm' 'dry-run 계획에 확인 인자와 실행 시도 표지 안내가 들어 있다 (D2 승인이 아니라는 문구 포함)' ($rDry.out.Contains('-ConfirmRunId') -and $rDry.out.Contains('lsp-scan-attempt.marker') -and $rDry.out.Contains('D2')) $rDry.out
    # 읽기 전용 사전 조건 실패(설치물 확인 모의 없음 → 진짜 읽기 전용 확인이 가짜 경로를 보고 실패): 맞는 확인 인자여도 표지를 만들지 않고 종료 50.
    $sb2 = New-RulesSandbox
    $before = @(Get-LspCallLines $sb2).Count
    $r = Invoke-RealScan $sb2 -Confirm $RunId
    $mut = Get-NewMutators $sb2 $before
    Assert-That 'confirm' '사전 조건 실패(설치물 확인): 맞는 확인 인자여도 종료 50, 표지 없음, 변경 호출 0건' ($r.exit -eq 50 -and (-not (Test-Path -LiteralPath (Get-MarkerFile $sb2))) -and (@($mut).Count -eq 0) -and ((Get-UserEnabled $sb2) -eq $false)) "exit=$($r.exit) mutators=[$(@($mut) -join ' | ')]`n$($r.out)"
    [void](Remove-Stragglers $sb); [void](Remove-Stragglers $sb2)
}

if (Test-Selected 'marker') {
    Write-Host '[marker] 실행 시도 표지 — 거절 경로'
    # 표지가 이미 있다: 다른 호출이 먼저 만든 것. 본문을 덮어쓰지 않고, 표지 포트 말고는 어떤 변경도 없다.
    $sb = New-RulesSandbox -Lsp @{ installOk = $true }
    $mkf = Get-MarkerFile $sb
    [IO.File]::WriteAllText($mkf, '{"preexisting":true}', $Utf8)
    $hPre = Get-LrSha256Hex ([IO.File]::ReadAllBytes($mkf))
    $before = @(Get-LspCallLines $sb).Count
    $r = Invoke-RealScan $sb -Confirm $RunId
    $mut = @(Get-NewMutators $sb $before | Where-Object { $_ -notmatch 'New-LsAdminAttemptMarker' })
    Assert-That 'marker' '표지가 이미 있다: 종료 30, 표지 본문 그대로, 표지 포트 외에 계정·감사·수신기·작업 배치·러너 호출 0건' ($r.exit -eq 30 -and ((Get-LrSha256Hex ([IO.File]::ReadAllBytes($mkf))) -ceq $hPre) -and (@($mut).Count -eq 0) -and ((Get-UserEnabled $sb) -eq $false) -and (-not (Test-RequestWritten $sb)) -and $r.out.Contains('표지가 이미')) "exit=$($r.exit) mutators=[$(@($mut) -join ' | ')]`n$($r.out)"
    Assert-That 'marker' '표지가 이미 있다: 관측 보고서도 새로 남지 않는다 (사전 거절은 새 기록을 만들지 않는다)' (@(Get-ChildItem $sb.RunDir -Filter 'lsp-scan-observation-*.json').Count -eq 0)
    $recSb = Invoke-Recover $sb
    Assert-That 'marker' '표지가 있어도 격리 자원 복구(Remove-Isolation.ps1)는 막히지 않고, 복구가 표지를 지우지 않는다' ($recSb.exit -eq 0 -and (Test-Path -LiteralPath $mkf) -and ((Get-LrSha256Hex ([IO.File]::ReadAllBytes($mkf))) -ceq $hPre)) "exit=$($recSb.exit)`n$($recSb.out)"

    # 같은 RunId 의 SCAN 산출물이 이미 있다: 표지를 만들지 않고 거절. 이름 하나씩 따로 확인한다.
    $sb3 = New-RulesSandbox -Lsp @{ installOk = $true }
    foreach ($n in 'lsp-scan-observation-20261029T130000Z.json', 'lsp-scan-record-20261029T130000Z.json', 'lsp-scan-stdout-20261029T130000Z.bin') {
        $pf = Join-Path $sb3.RunDir $n
        [IO.File]::WriteAllText($pf, 'x', $Utf8)
        $before = @(Get-LspCallLines $sb3).Count
        $r = Invoke-RealScan $sb3 -Confirm $RunId
        $mut = Get-NewMutators $sb3 $before
        Assert-That 'marker' "기존 SCAN 산출물($n): 종료 30, 표지 없음, 표지 포트·계정·감사·수신기·러너 호출 0건" ($r.exit -eq 30 -and (-not (Test-Path -LiteralPath (Get-MarkerFile $sb3))) -and (@($mut).Count -eq 0) -and ((Get-UserEnabled $sb3) -eq $false) -and $r.out.Contains('SCAN 산출물이 이미')) "exit=$($r.exit) mutators=[$(@($mut) -join ' | ')]`n$($r.out)"
        Remove-Item -LiteralPath $pf -Force
    }

    # 표지 포트 실패 주입: 만들지 못함(아무것도 남지 않음) / 만들었으나 본문을 쓰지 못함(빈 표지가 남고 이 RunId 는 소모) / 사전 검사 뒤 다른 호출이 먼저 만듦(경쟁).
    $faults = @(
        @('create-fails', 50, $false, '표지를 만들지 못했다'),
        @('write-fails', 50, $true, '본문을 쓰지 못했다'),
        @('race', 30, $true, '표지가 이미'))
    foreach ($ft in $faults) {
        $sbf = New-RulesSandbox -Lsp @{ installOk = $true; markerFault = $ft[0] }
        $before = @(Get-LspCallLines $sbf).Count
        $r = Invoke-RealScan $sbf -Confirm $RunId
        $mut = @(Get-NewMutators $sbf $before | Where-Object { $_ -notmatch 'New-LsAdminAttemptMarker' })
        $mkx = Get-MarkerFile $sbf
        $bodyOk = $true
        if ($ft[0] -eq 'race') { $bodyOk = ([IO.File]::ReadAllText($mkx, [Text.Encoding]::UTF8) -ceq '{"other":"session"}') }
        if ($ft[0] -eq 'write-fails') { $bodyOk = ((Get-Item -LiteralPath $mkx).Length -eq 0) }
        Assert-That 'marker' "표지 포트 $($ft[0]): 종료 $($ft[1]), 표지 $(if ($ft[2]) { '남음(지우지 않음)' } else { '없음' }), 표지 포트 외 변경 호출 0건, 메시지에 사유" (($r.exit -eq $ft[1]) -and ((Test-Path -LiteralPath $mkx) -eq $ft[2]) -and $bodyOk -and (@($mut).Count -eq 0) -and ((Get-UserEnabled $sbf) -eq $false) -and (-not (Test-RequestWritten $sbf)) -and $r.out.Contains($ft[3])) "exit=$($r.exit) mutators=[$(@($mut) -join ' | ')]`n$($r.out)"
        [void](Remove-Stragglers $sbf)
    }
    [void](Remove-Stragglers $sb); [void](Remove-Stragglers $sb3)
}

if (Test-Selected 'marker-run') {
    Write-Host '[marker-run] 실행 시도 표지 — 첫 시도와 재사용 방지 (러너는 MOCK GUARD 가 막는다)'
    if (-not $toolsReady) { Skip-That 'marker-run' 'TS 재해석 도구(-TsxCmd)가 없다: 표지를 확보한 뒤의 마무리(재해석·보고서)를 확인할 수 없다' }
    else {
        $sb = New-RulesSandbox -Lsp @{ installOk = $true }
        $auditBefore = Get-AuditValue $sb
        $before = @(Get-LspCallLines $sb).Count
        $r = Invoke-RealScan $sb -Confirm $RunId
        $rep = Get-RulesReport $sb
        $mkf = Get-MarkerFile $sb
        $allNow = @(Get-LspCallLines $sb); $newLines = @($allNow[$before..($allNow.Count - 1)])
        $iMk = -1; $iRc = -1; $iEn = -1
        for ($i = 0; $i -lt $newLines.Count; $i++) {
            if ($iMk -lt 0 -and $newLines[$i] -match 'New-LsAdminAttemptMarker') { $iMk = $i }
            if ($iRc -lt 0 -and $newLines[$i] -match 'New-LspMinReceiver') { $iRc = $i }
            if ($iEn -lt 0 -and $newLines[$i] -match 'Enable-LocalUser') { $iEn = $i }
        }
        $mdoc = $null; if (Test-Path -LiteralPath $mkf) { $mdoc = [IO.File]::ReadAllText($mkf, [Text.Encoding]::UTF8) | ConvertFrom-Json }
        Assert-That 'marker-run' '첫 시도: 확인 인자가 맞으면 표지를 만들고 진행한다 (러너는 MOCK GUARD 로 막혀 종료 60, 판정 NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED)' ($r.exit -eq 60 -and (Test-Path -LiteralPath $mkf) -and ((Get-Prop $rep 'verdict') -ceq 'NOT_ATTEMPTED:RUNNER_NOT_LAUNCHED')) "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')`n$($r.out)"
        Assert-That 'marker-run' '첫 시도: 표지 포트 호출은 정확히 한 번이고 수신기 생성·계정 켜기보다 먼저다 (첫 실행 부작용 앞에서 확보)' ((@($newLines | Where-Object { $_ -match 'New-LsAdminAttemptMarker' }).Count -eq 1) -and ($iMk -ge 0) -and ($iRc -gt $iMk) -and ($iEn -gt $iMk)) "marker@$iMk receiver@$iRc enable@$iEn"
        Assert-That 'marker-run' '첫 시도: 표지 본문에 RunId·종류·시각이 있고 보고서에는 표지 기록(acquired, autoDelete=false, retryable=false)이 관측·정리 결과와 별도로 남는다' (($null -ne $mdoc) -and ($mdoc.runId -ceq $RunId) -and ($mdoc.mode -ceq 'semgrep-lsp') -and ((Get-Prop $rep 'attemptMarker.acquired') -eq $true) -and ((Get-Prop $rep 'attemptMarker.autoDelete') -eq $false) -and ((Get-Prop $rep 'attemptMarker.retryable') -eq $false) -and ((Get-Prop $rep 'attemptMarker.path') -ceq $mkf)) "marker=$mkf"
        Assert-That 'marker-run' '표지 확보 뒤 실패해도 정리(프로세스·시스템 복구)는 표지와 무관하게 끝까지 돈다: 계정 비활성화, 감사 값 복구, 두 결과 모두 완료' (((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq $auditBefore) -and ((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true))
        $hRun = Get-LrSha256Hex ([IO.File]::ReadAllBytes($mkf))
        # 같은 RunId 로 다시: 거절. 변경 호출 0건이고 표지는 그대로. (관측 보고서가 이미 있어 기존 산출물 검사에서 거절된다)
        $before2 = @(Get-LspCallLines $sb).Count
        $r2 = Invoke-RealScan $sb -Confirm $RunId
        $mut2 = Get-NewMutators $sb $before2
        Assert-That 'marker-run' '같은 RunId 재시도: 종료 30, 변경 호출 0건, 표지 그대로 (자동 삭제·재시도 가능 상태로 돌리기 없음)' ($r2.exit -eq 30 -and (@($mut2).Count -eq 0) -and ((Get-LrSha256Hex ([IO.File]::ReadAllBytes($mkf))) -ceq $hRun) -and ((Get-UserEnabled $sb) -eq $false)) "exit=$($r2.exit) mutators=[$(@($mut2) -join ' | ')]`n$($r2.out)"
        # 보고서를 치워도(= 관측 기록이 없는 상태) 표지 하나만으로 거절한다.
        Get-ChildItem -LiteralPath $sb.RunDir -Filter 'lsp-scan-*' -File | Where-Object { $_.Name -ne 'lsp-scan-attempt.marker' } | Remove-Item -Force
        $before3 = @(Get-LspCallLines $sb).Count
        $r3 = Invoke-RealScan $sb -Confirm $RunId
        $mut3 = @(Get-NewMutators $sb $before3 | Where-Object { $_ -notmatch 'New-LsAdminAttemptMarker' })
        Assert-That 'marker-run' '산출물이 없어도 표지만으로 재시도를 거절한다 (종료 30, 표지 그대로, 표지 포트 외 호출 0건)' ($r3.exit -eq 30 -and (@($mut3).Count -eq 0) -and ((Get-LrSha256Hex ([IO.File]::ReadAllBytes($mkf))) -ceq $hRun) -and $r3.out.Contains('표지가 이미')) "exit=$($r3.exit)`n$($r3.out)"
        $rc = Invoke-Recover $sb
        Assert-That 'marker-run' '표지가 있어도 복구 스크립트가 정상 종료(0)하고 표지는 그대로 남는다 (복구가 표지를 지우지 않는다)' ($rc.exit -eq 0 -and (Test-Path -LiteralPath $mkf) -and ((Get-LrSha256Hex ([IO.File]::ReadAllBytes($mkf))) -ceq $hRun)) "exit=$($rc.exit)"
        [void](Remove-Stragglers $sb)

        # 과거 MIN·RULES 기록은 SCAN 재사용으로 세지 않는다: 그런 기록이 있어도 첫 시도는 진행하고 표지를 만든다.
        $sb4 = New-RulesSandbox -Lsp @{ installOk = $true }
        foreach ($n in 'lsp-min-observation-20261029T130000Z.json', 'lsp-rules-observation-20261029T130000Z.json', 'lsp-rules-record-20261029T130000Z.json', 'lsp-min-stdout-20261029T130000Z.bin') { [IO.File]::WriteAllText((Join-Path $sb4.RunDir $n), 'x', $Utf8) }
        $r4 = Invoke-RealScan $sb4 -Confirm $RunId
        Assert-That 'marker-run' '과거 MIN·RULES 기록이 있어도 SCAN 첫 시도는 거절되지 않고 표지를 만든다' ($r4.exit -eq 60 -and (Test-Path -LiteralPath (Get-MarkerFile $sb4))) "exit=$($r4.exit)`n$($r4.out)"
        [void](Remove-Stragglers $sb4)
    }
}

# 띄운 뒤의 관리자 쪽 사후 확인과 결합 실패는 실행 사실을 지우지 않고 관측을 성립시키지 않는다(NOT_OBSERVED 쪽). 도구가 없어도 관리자 쪽 실패 토큰은 확인된다.
$postRunCases = @(
    @{ id = 'hash-changed'; lsp = @{ hashChange = 'changed' }; token = 'HASH_CHANGED' },
    @{ id = 'hash-unreadable'; lsp = @{ hashChange = 'unreadable' }; token = 'HASH_CHANGED' },
    @{ id = 'probe-wrong'; lsp = @{ adminProbe = 'wrong' }; token = 'PROBE_HASH_NOT_CONFIRMED:afterRunSha256' },
    @{ id = 'probe-reread-failed'; lsp = @{ adminProbe = 'fail' }; token = 'PROBE_HASH_NOT_CONFIRMED:afterRunSha256' },
    @{ id = 'target-wrong'; lsp = @{ adminProbe = 'target-wrong' }; token = 'TARGET_HASH_NOT_CONFIRMED:afterRunSha256' },
    @{ id = 'target-missing'; lsp = @{ adminProbe = 'target-missing' }; token = 'ROOT_CHANGED:WORKSPACE' },
    @{ id = 'workspace-extra-file'; lsp = @{ adminProbe = 'workspace-file' }; token = 'ROOT_CHANGED:WORKSPACE' },
    @{ id = 'rules-extra-file'; lsp = @{ adminProbe = 'rules-extra' }; token = 'ROOT_CHANGED:RULES_DIR' },
    @{ id = 'roots-unreadable'; lsp = @{ adminProbe = 'roots-unreadable' }; token = 'ROOT_UNREADABLE:HOME_DIR' },
    @{ id = 'post-run-link'; lsp = @{ adminProbe = 'link' }; token = 'POST_RUN_READ_NOT_ALLOWED' },
    @{ id = 'receiver-hit'; lsp = @{ loopbackHit = $true }; token = 'RECEIVER_HIT' },
    @{ id = 'token-mismatch'; lsp = @{ resultEdit = @{ set = @(@{ path = 'runToken'; value = 'other-token' }) } }; token = 'RESULT_BINDING_FAILED' },
    # F6a: 관리자가 읽은 러너 결과의 mode 가 요청(stub)과 다르거나 없거나 모르는 값이면 결합 실패다. 디스크의 원문은 그대로라 TS 쪽은 별도로 본다(vitest 의 mode 교차 확인).
    @{ id = 'mode-mismatch'; lsp = @{ resultEdit = @{ set = @(@{ path = 'mode'; value = 'semgrep-lsp' }) } }; token = 'RESULT_BINDING_FAILED'; bind = @('MODE_MISMATCH') },
    @{ id = 'mode-missing'; lsp = @{ resultEdit = @{ unset = @('mode') } }; token = 'RESULT_BINDING_FAILED'; bind = @('MODE_MISMATCH', 'MODE_INVALID') },
    @{ id = 'mode-unknown'; lsp = @{ resultEdit = @{ set = @(@{ path = 'mode'; value = 'other' }) } }; token = 'RESULT_BINDING_FAILED'; bind = @('MODE_MISMATCH', 'MODE_INVALID') }
)
foreach ($pc in $postRunCases) {
    if (-not (Test-Selected $pc.id) -and -not (Test-Selected 'postrun')) { continue }
    Write-Host "[postrun:$($pc.id)]"
    $sb = New-RulesSandbox -Lsp $pc.lsp
    $r = Invoke-Rules $sb
    $rep = Get-RulesReport $sb
    $toksRaw = Get-FailTokens $rep
    $toks = @($toksRaw)
    $verdict = [string](Get-Prop $rep 'verdict')
    Assert-That "postrun:$($pc.id)" "관측이 성립하지 않는다: 종료 60, 실패 토큰 $($pc.token), 판정은 STUB_SCAN_RESPONSE_OBSERVED 가 아니다" ($r.exit -eq 60 -and ($toks -ccontains $pc.token) -and ((Get-Prop $rep 'observation.established') -eq $false) -and ($verdict -cne 'STUB_SCAN_RESPONSE_OBSERVED')) "exit=$($r.exit) tokens=$($toks -join ',') verdict=$verdict"
    if ($pc.ContainsKey('bind')) {
        $bf = Get-List $rep 'binding.failures'
        $missingBind = @($pc.bind | Where-Object { $bf -cnotcontains $_ })
        Assert-That "postrun:$($pc.id)" "결합 실패 사유에 $($pc.bind -join ', ') 가 남는다 (실행 사실은 지우지 않는다: 서버를 띄웠다)" (($missingBind.Count -eq 0) -and ((Get-Prop $rep 'observation.runnerLaunched') -eq $true)) "failures=$($bf -join ',')"
    }
    Assert-That "postrun:$($pc.id)" '프로세스 정리와 시스템 복구는 관측 결과와 따로 완료로 남는다 (계정은 꺼졌다)' (((Get-Prop $rep 'processCleanup.ok') -eq $true) -and ((Get-Prop $rep 'systemRecovery.ok') -eq $true) -and ((Get-UserEnabled $sb) -eq $false))
    [void](Remove-Stragglers $sb)
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
Write-Host ('LspScanAdmin [{0}]: {1}/{2} 통과, {3} 실패, {4} 건너뜀' -f $Engine, $pass, ($pass + $fail), $fail, $skip)
if ($skip -gt 0) { Write-Host ('  건너뛴 {0}건은 통과로 세지 않았다. 재해석 도구(-TsxCmd)가 없으면 "관측이 성립하는" 경로는 확인되지 않은 것이다.' -f $skip) -ForegroundColor Yellow }
if ($fail -gt 0) { exit 1 }
exit 0
