<#
.SYNOPSIS
  LSP-MIN-1 관리자 진입점(Test-LspMinObservation.ps1)을 모의 시스템과 무해한 스텁으로 끝까지 돌려 보는 시험. 실제 Semgrep 은 실행하지도 임포트하지도 않는다.
.DESCRIPTION
  구성:
   (A) 순수 계약(LspMinAdminContract.ps1) 단위 시험: 전체 해시·보고서 대조·경로·토큰·요청 자기 점검·결과 결합·감독 결정·경로 점검·5157 건수·판정 분리.
   (B) 흐름 시험: 임시 샌드박스에 코드 사본과 모의 시스템(MockSystem.ps1 + MockSystemLsp.ps1 + MockPortsLsp.ps1)을 끼워 넣고, 적용(Initialize-Isolation.ps1 -Apply) 뒤
       진입점을 자식 프로세스로 실행한다. 계정·방화벽·감사 정책·ACL 은 모의라서 진짜 시스템은 읽지도 바꾸지도 않는다. 러너는 stub 모드일 때에 한해 **현재 사용자로** 진짜 러너와
       스텁 서버(lsp-min-stub.ps1)를 띄운다(진입점 → 러너 → 결과 재해석 → 정리 전체 흐름). semgrep-lsp 모드 요청은 모의가 예외로 막는다.
       정상, 거절, dry-run, 토큰·신원 불일치, 결과 누락·손상, 수신기 실패·적중, 중단 파일 전달 실패, 러너 정체(진짜 정지 스텁), 취소, 정리 부분 실패를 포함한다.
   (C) 진짜 시스템 상태 불변 확인: 시험 전후에 읽기 전용으로 전용 계정(bsi*)·방화벽 규칙(bosang-semgrep-iso*)·감사 값·작업 폴더 루트를 비교한다.
  TS 재해석이 필요한 사례는 -TsxCmd(와 -NodeDir)가 있을 때만 판정 전체를 확인한다. 없으면 그 사례는 SKIPPED 로 표시하고 통과로 세지 않는다.
  이 시험의 통과는 "합성 환경에서 진입점의 감독·결합·판정·정리가 의도대로 동작한다"까지만 뜻한다. 실제 Semgrep·전용 계정·방화벽·감사·ACL 아래의 동작은 뜻하지 않는다.
.EXAMPLE
  pwsh -NoProfile -File .\tests\Test-LspMinAdmin.ps1 -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -NodeDir C:\node -ReinterpretCli C:\repo\scripts\semgrep-lsp\lsp-min-reinterpret-cli.ts
  pwsh -NoProfile -File .\tests\Test-LspMinAdmin.ps1 -Engine powershell -TsxCmd ... (안쪽 엔진을 5.1 로)
#>
[CmdletBinding()]
param(
    [string]$CodeDir = (Split-Path $PSScriptRoot -Parent),
    [ValidateSet('pwsh', 'powershell')][string]$Engine = 'pwsh',
    [string[]]$Only = @(),
    [string]$TsxCmd,
    [string]$NodeDir,
    [string]$ReinterpretCli,
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
$CodeDir = (Resolve-Path -LiteralPath $CodeDir).Path
$RunId = '20261029T120000Z-0a1b2c3d'
$UserName = 'bsi0a1b2c3d'
$FpcGuid = '{0CCE9226-69AE-11D9-BED3-505054503030}'
$Utf8 = New-Object Text.UTF8Encoding($false)
$RealSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$Results = New-Object System.Collections.ArrayList
$Sandboxes = New-Object System.Collections.ArrayList
$toolsReady = [bool]($TsxCmd -and (Test-Path -LiteralPath $TsxCmd) -and $ReinterpretCli -and (Test-Path -LiteralPath $ReinterpretCli))

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

# 진짜 시스템 상태 스냅샷(읽기 전용): 전용 계정(bsi*), 방화벽 규칙(bosang-semgrep-iso*), 감사 값 둘, 작업 폴더 루트. 시험이 이 중 어느 것도 바꾸지 않는지 전후로 비교한다.
function Get-RealStateSnapshot {
    $s = [ordered]@{}
    try { $s.users = (@(Get-LocalUser -ErrorAction Stop | Where-Object { $_.Name -like 'bsi*' } | ForEach-Object { $_.Name + ':' + $_.Enabled }) -join ',') } catch { $s.users = 'UNREADABLE' }
    try { $s.rules = (@(Get-NetFirewallRule -ErrorAction Stop | Where-Object { $_.Name -like 'bosang-semgrep-iso*' } | ForEach-Object { $_.Name }) -join ',') } catch { $s.rules = 'UNREADABLE' }
    $ap = Join-Path $env:WINDIR 'System32\auditpol.exe'
    foreach ($g in '{0CCE9226-69AE-11D9-BED3-505054503030}', '{0CCE922B-69AE-11D9-BED3-505054503030}') {
        try { $o = & $ap /get "/subcategory:$g" /r 2>&1 | Out-String; $line = ($o -split "`n" | Where-Object { $_ -match ',' } | Select-Object -Last 1); $s["audit$g"] = $(if ($line) { $line.Trim() } else { 'UNREADABLE' }) } catch { $s["audit$g"] = 'UNREADABLE' }
    }
    # 작업 폴더 루트: 있는지만이 아니라 그 안의 항목 이름까지 비교한다(루트가 이미 있어도 새로 샌 하위 폴더를 잡는다).
    $pd = Join-Path $env:ProgramData 'bosang-semgrep-iso'
    $s.programDataRoot = $(if (Test-Path -LiteralPath $pd) { 'EXISTS:' + ((@(Get-ChildItem -LiteralPath $pd -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) | Sort-Object) -join ',') } else { 'ABSENT' })
    $s
}
$realBefore = $null
if (-not $SkipRealStateCheck) { $realBefore = Get-RealStateSnapshot }

# ═══ (A) 순수 계약 단위 시험 ═══════════════════════════════════════════════════
. (Join-Path $CodeDir 'IsolationCommon.ps1')
. (Join-Path $CodeDir 'LspMinContract.ps1')
. (Join-Path $CodeDir 'LspMinAdminContract.ps1')

if (Test-Selected 'unit') {
    Write-Host "[unit] 순수 계약"
    $H = 'a' * 64
    # 전체 해시
    Assert-That 'unit' '64자리 소문자 16진수는 받는다' ((ConvertTo-LspMinSha256 $H) -ceq $H)
    Assert-That 'unit' '대문자는 소문자로 정규화한다' ((ConvertTo-LspMinSha256 ('A' * 64)) -ceq $H)
    foreach ($bad in @(('a' * 63), ('a' * 65), ('g' * 64), '', $null, 12345, ('a' * 12))) { Assert-That 'unit' "축약·비정상 해시를 거절한다: <$bad>" ($null -eq (ConvertTo-LspMinSha256 $bad)) }
    # 보고서 대조: 실제 보고서와 같은 모양의 문장
    $bt = [char]96
    $exeH = ('1' * 64); $coreH = ('2' * 64); $pyH = ('3' * 64); $whlH = ('4' * 64)
    $report = ("- 이진 파일 17개: {0}semgrep-core.exe{0}(246,296,090바이트, SHA-256 {0}$coreH{0})와 DLL 16개`n" -f $bt) +
    ("- 실행 파일: {0}venv\Scripts\semgrep.exe{0}(108,456바이트, SHA-256 {0}$exeH{0}), {0}venv\Scripts\pysemgrep.exe{0}(108,455바이트, {0}$pyH{0})`n" -f $bt) +
    ("| win_amd64 | 58,108,036 | {0}$whlH{0} | 2026-10-07T23:24:52Z |`n" -f $bt)
    $ents = Get-LspMinDistReportEntries -Text $report
    Assert-That 'unit' '보고서에서 경로·크기·해시 짝 셋을 뽑는다' ($ents.Count -eq 3) "count=$($ents.Count)"
    Assert-That 'unit' 'pysemgrep.exe 를 semgrep.exe 로 잘못 읽지 않는다' (@($ents | Where-Object { $_.leaf -ieq 'semgrep.exe' }).Count -eq 1 -and (@($ents | Where-Object { $_.leaf -ieq 'semgrep.exe' })[0].sha256 -eq $exeH))
    Assert-That 'unit' '크기의 쉼표를 푼다' (@($ents | Where-Object { $_.leaf -ieq 'semgrep-core.exe' })[0].size -eq 246296090)
    $ok = Test-LspMinReportCrossCheck -ReportText $report -ExeSha256 $exeH -ExeSize 108456 -CoreSha256 $coreH -CoreSize 246296090 -WheelSha256 $whlH
    Assert-That 'unit' '대조: 해시와 크기가 모두 같으면 통과' $ok.ok ((@($ok.items | ForEach-Object { $_.id + '=' + $_.ok })) -join ',')
    $x = Test-LspMinReportCrossCheck -ReportText $report -ExeSha256 ('9' * 64) -ExeSize 108456 -CoreSha256 $coreH -CoreSize 246296090 -WheelSha256 $whlH
    Assert-That 'unit' '대조: 실행 파일 해시가 다르면 거절(이름만으로 허용하지 않는다)' (-not $x.ok -and -not (@($x.items | Where-Object { $_.id -eq 'R1' })[0].ok))
    $x = Test-LspMinReportCrossCheck -ReportText $report -ExeSha256 $exeH -ExeSize 999 -CoreSha256 $coreH -CoreSize 246296090 -WheelSha256 $whlH
    Assert-That 'unit' '대조: 해시가 같아도 크기가 다르면 거절' (-not $x.ok)
    $x = Test-LspMinReportCrossCheck -ReportText $report -ExeSha256 $exeH -ExeSize $null -CoreSha256 $coreH -CoreSize 246296090 -WheelSha256 $whlH
    Assert-That 'unit' '대조: 현재 크기를 모르면(null) 통과가 아니다' (-not $x.ok)
    $x = Test-LspMinReportCrossCheck -ReportText $report -ExeSha256 $exeH -ExeSize 108456 -CoreSha256 $coreH -CoreSize 246296090 -WheelSha256 ('8' * 64)
    Assert-That 'unit' '대조: 휠 해시가 win_amd64 행과 다르면 거절' (-not $x.ok)
    $conflict = $report + ("- 다시: {0}venv\Scripts\semgrep.exe{0}(108,456바이트, SHA-256 {0}$('5' * 64){0})`n" -f $bt)
    $x = Test-LspMinReportCrossCheck -ReportText $conflict -ExeSha256 $exeH -ExeSize 108456 -CoreSha256 $coreH -CoreSize 246296090 -WheelSha256 $whlH
    Assert-That 'unit' '대조: 같은 파일 이름에 다른 해시가 하나라도 적혀 있으면 충돌로 거절' (-not $x.ok)
    $x = Test-LspMinReportCrossCheck -ReportText 'no pairs here' -ExeSha256 $exeH -ExeSize 1 -WheelSha256 $whlH
    Assert-That 'unit' '대조: 보고서에 짝이 없으면 거절' (-not $x.ok)
    $x = Test-LspMinReportCrossCheck -ReportText $report -ExeSha256 ('a' * 12) -ExeSize 108456 -WheelSha256 $whlH
    Assert-That 'unit' '대조: 축약 해시는 거절' (-not $x.ok)
    # 경로
    Assert-That 'unit' '경로: 같은 절대 경로(대소문자·끝 구분자 무시)는 같다' (Test-LspMinSamePath 'C:\A\b\semgrep.exe' 'c:\a\B\SEMGREP.exe')
    Assert-That 'unit' '경로: .. 조각이 있으면 다르다' (-not (Test-LspMinSamePath 'C:\A\x\..\b\s.exe' 'C:\A\b\s.exe'))
    Assert-That 'unit' '경로: 상대 경로는 다르다' (-not (Test-LspMinSamePath 'a\s.exe' 'a\s.exe'))
    Assert-That 'unit' '경로: UNC 는 다르다' (-not (Test-LspMinSamePath '\\h\s\s.exe' '\\h\s\s.exe'))
    Assert-That 'unit' '경로: 이름이 다르면 다르다' (-not (Test-LspMinSamePath 'C:\A\semgrep.exe' 'C:\A\pysemgrep.exe'))
    Assert-That 'unit' '경로: null 은 다르다' (-not (Test-LspMinSamePath $null 'C:\A'))
    Assert-That 'unit' '기대 실행 파일 경로는 설치 위치에서 도출한다' ((Get-LspMinExpectedExePath -DistRoot 'C:\D\1.180.0') -eq 'C:\D\1.180.0\venv\Scripts\semgrep.exe')
    # 토큰
    $nonce = 'b' * 32
    $tok = New-LspMinRunToken -RunId $RunId -Nonce $nonce
    Assert-That 'unit' '토큰은 RunId 와 무작위 값을 담는다' ($tok -eq "lsp-$RunId-$nonce")
    Assert-That 'unit' '토큰: 같은 RunId 면 통과' ((Test-LspMinTokenForRun $tok $RunId).ok)
    Assert-That 'unit' '토큰: 다른 RunId 의 토큰은 거절' (-not (Test-LspMinTokenForRun $tok '20261029T120000Z-ffffffff').ok)
    Assert-That 'unit' '토큰: 모양이 틀리면 거절' (-not (Test-LspMinTokenForRun 'stale' $RunId).ok -and -not (Test-LspMinTokenForRun $null $RunId).ok)
    $threw = $false; try { New-LspMinRunToken -RunId 'x' -Nonce $nonce | Out-Null } catch { $threw = $true }
    Assert-That 'unit' '토큰: 잘못된 RunId 로는 만들지 않는다' $threw
    # 요청 자기 점검
    $layout = Get-LspMinLayout -Work 'C:\W\work\lsp'
    $envT = New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layout -Url 'http://127.0.0.1:5555'
    $stubArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', 'C:\W\work\lsp-min-stub.ps1', 'ok')
    $lim = [ordered]@{}; foreach ($k in $Script:LspMinAdminLimitNames) { $lim[$k] = [int]$Script:LspMinLimits[$k] }
    $mk = { param($mode, $exe, $a, $l, $e) New-LspMinRunnerRequest -Token $tok -Mode $mode -Exe $exe -ArgList $a -Layout $layout -Env $e -Limits $l -AbortFile 'C:\W\work\abort.flag' -ResultFile 'C:\W\work\r.json' }
    $realReq = & $mk 'semgrep-lsp' 'C:\D\venv\Scripts\semgrep.exe' @('lsp', '--debug') $lim $envT
    Assert-That 'unit' '요청: 정상 실제 모드 요청은 문제 없음' ((Test-LspMinRunnerRequest $realReq).Count -eq 0) ((Test-LspMinRunnerRequest $realReq) -join ',')
    $stubLim = [ordered]@{}; foreach ($k in $lim.Keys) { $stubLim[$k] = $lim[$k] }; $stubLim.totalMs = 5000
    Assert-That 'unit' '요청: 정상 스텁 요청(낮춘 한도)은 문제 없음' ((Test-LspMinRunnerRequest (& $mk 'stub' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' $stubArgs $stubLim $envT)).Count -eq 0)
    Assert-That 'unit' '요청: 실제 모드에서 한도를 줄이면 거절' ((Test-LspMinRunnerRequest (& $mk 'semgrep-lsp' 'C:\D\venv\Scripts\semgrep.exe' @('lsp', '--debug') $stubLim $envT)) -contains 'LIMIT_NOT_CAP:totalMs')
    Assert-That 'unit' '요청: 인자가 고정과 다르면 거절' ((Test-LspMinRunnerRequest (& $mk 'semgrep-lsp' 'C:\D\venv\Scripts\semgrep.exe' @('lsp') $lim $envT)) -contains 'ARGS_NOT_FIXED')
    Assert-That 'unit' '요청: --version 같은 인자도 거절' ((Test-LspMinRunnerRequest (& $mk 'semgrep-lsp' 'C:\D\venv\Scripts\semgrep.exe' @('--version') $lim $envT)) -contains 'ARGS_NOT_FIXED')
    Assert-That 'unit' '요청: 이름이 semgrep.exe 가 아니면 거절' ((Test-LspMinRunnerRequest (& $mk 'semgrep-lsp' 'C:\D\venv\Scripts\pysemgrep.exe' @('lsp', '--debug') $lim $envT)) -contains 'EXE_NAME')
    $envV = [ordered]@{}; foreach ($k in $envT.Keys) { $envV[$k] = $envT[$k] }; $envV['SEMGREP_ENABLE_VERSION_CHECK'] = '0'
    $pv = Test-LspMinRunnerRequest (& $mk 'semgrep-lsp' 'C:\D\venv\Scripts\semgrep.exe' @('lsp', '--debug') $lim $envV)
    Assert-That 'unit' '요청: LSP 환경에 SEMGREP_ENABLE_VERSION_CHECK 를 더하면 거절' ($pv -contains 'ENV_NAME_NOT_ALLOWED')
    $envM = [ordered]@{}; foreach ($k in $envT.Keys) { if ($k -ne 'USERPROFILE') { $envM[$k] = $envT[$k] } }
    Assert-That 'unit' '요청: 환경 이름이 빠지면 거절' ((Test-LspMinRunnerRequest (& $mk 'semgrep-lsp' 'C:\D\venv\Scripts\semgrep.exe' @('lsp', '--debug') $lim $envM)) -contains 'ENV_NAME_MISSING:USERPROFILE')
    $badLayout = Get-LspMinLayout -Work 'C:\W\work\lsp'; $badLayout['homeDir'] = 'C:\Users\Someone'
    $rq = New-LspMinRunnerRequest -Token $tok -Mode 'semgrep-lsp' -Exe 'C:\D\venv\Scripts\semgrep.exe' -ArgList @('lsp', '--debug') -Layout $badLayout -Env $envT -Limits $lim -AbortFile 'C:\W\a.flag' -ResultFile 'C:\W\r.json'
    Assert-That 'unit' '요청: 감시 폴더가 작업 폴더에서 도출한 배치와 다르면 거절' ((Test-LspMinRunnerRequest $rq) -contains 'LAYOUT:homeDir')
    # 결과 결합
    $launched = [DateTime]::UtcNow.AddSeconds(-5)
    $reqObj = & $mk 'stub' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' $stubArgs $stubLim $envT
    $goodRes = [pscustomobject]@{
        schema = 1; kind = 'lsp-min-runner-result'; runToken = $tok; mode = 'stub'; startedUtc = [DateTime]::UtcNow.ToString('o'); refused = $null
        request = [pscustomobject]@{ exe = $reqObj.exe; args = @($reqObj.args); layoutWork = $layout.work; envNames = @($envT.Keys | Sort-Object); limits = [pscustomobject]$stubLim }
    }
    $bind = { param($r) Test-LspMinResultBinding -Result $r -Request $reqObj -RunId $RunId -LaunchedUtc $launched }
    Assert-That 'unit' '결합: 이번 요청의 결과는 문제 없음' ((& $bind $goodRes).Count -eq 0) ((& $bind $goodRes) -join ',')
    $mut = { param($edit) $c = $goodRes.PSObject.Copy(); & $edit $c; & $bind $c }
    Assert-That 'unit' '결합: 다른 토큰은 거절' ((& $mut { param($c) $c.runToken = "lsp-$RunId-$('c' * 32)" }) -contains 'TOKEN_MISMATCH')
    Assert-That 'unit' '결합: 다른 RunId 의 토큰은 거절' ((& $mut { param($c) $c.runToken = "lsp-20261029T120000Z-ffffffff-$nonce" }) -contains 'TOKEN_RUNID_MISMATCH')
    Assert-That 'unit' '결합: 모드가 다르면 거절' ((& $mut { param($c) $c.mode = 'semgrep-lsp' }) -contains 'MODE_MISMATCH')
    Assert-That 'unit' '결합: 스키마가 다르면 거절' ((& $mut { param($c) $c.kind = 'x' }) -contains 'RESULT_SCHEMA')
    Assert-That 'unit' '결합: 이전 실행의 시작 시각(실행 전)이면 거절' ((& $mut { param($c) $c.startedUtc = '2020-01-01T00:00:00.0000000Z' }) -contains 'STARTED_BEFORE_LAUNCH')
    Assert-That 'unit' '결합: 시작 시각을 못 읽으면 거절' ((& $mut { param($c) $c.startedUtc = 'zzz' }) -contains 'STARTED_UNPARSEABLE')
    Assert-That 'unit' '결합: 요청 반향의 실행 파일이 다르면 거절' ((& $mut { param($c) $c.request = [pscustomobject]@{ exe = 'C:\x.exe'; args = @($reqObj.args); layoutWork = $layout.work; envNames = @($envT.Keys | Sort-Object); limits = [pscustomobject]$stubLim } }) -contains 'ECHO_EXE')
    Assert-That 'unit' '결합: 요청 반향의 한도가 다르면 거절' ((& $mut { param($c) $l2 = [pscustomobject]$stubLim; $c.request = [pscustomobject]@{ exe = $reqObj.exe; args = @($reqObj.args); layoutWork = $layout.work; envNames = @($envT.Keys | Sort-Object); limits = ([pscustomobject]@{ totalMs = 1; initMs = 1; exitMs = 1; stdinCloseGraceMs = 1; killConfirmMs = 1; maxStdoutBytes = 1; maxStderrBytes = 1; sampleIntervalMs = 1 }) } }) -contains 'ECHO_LIMIT:totalMs')
    Assert-That 'unit' '결합: 반향이 없고 거절도 아니면 거절' ((& $mut { param($c) $c.PSObject.Properties.Remove('request') }) -contains 'ECHO_MISSING')
    Assert-That 'unit' '결합: 객체가 아니면 거절' ((Test-LspMinResultBinding -Result 'x' -Request $reqObj -RunId $RunId -LaunchedUtc $launched) -contains 'RESULT_NOT_OBJECT')
    Assert-That 'unit' '결합: null 이면 거절' ((Test-LspMinResultBinding -Result $null -Request $reqObj -RunId $RunId -LaunchedUtc $launched) -contains 'RESULT_NOT_OBJECT')
    # 송신 모양
    Assert-That 'unit' '송신 모양: 계약 순서의 앞부분은 통과' (Test-LspMinSendsShape ([pscustomobject]@{ sends = @([pscustomobject]@{ label = 'initialize' }, [pscustomobject]@{ label = 'shutdown' }) }))
    Assert-That 'unit' '송신 모양: initialized 는 거절' (-not (Test-LspMinSendsShape ([pscustomobject]@{ sends = @([pscustomobject]@{ label = 'initialize' }, [pscustomobject]@{ label = 'initialized' }) })))
    Assert-That 'unit' '송신 모양: 순서가 바뀌면 거절' (-not (Test-LspMinSendsShape ([pscustomobject]@{ sends = @([pscustomobject]@{ label = 'shutdown' }) })))
    # 감독 결정
    $L = [pscustomobject]@{ totalMs = 150000; killConfirmMs = 10000 }
    $act = { param($el, $res, $alive, $ab, $fk) Get-LspMinSupervisorAction -ElapsedMs $el -Limits $L -ResultSeen $res -RunnerAlive $alive -AbortRequestedAtMs $ab -ForceKilledAtMs $fk }
    Assert-That 'unit' '감독: 마감 전에는 아무것도 하지 않는다' ((& $act 100000 $false $true $null $null) -eq 'NONE')
    Assert-That 'unit' '감독: 기동 허용 + totalMs 에 닿으면 중단을 요청한다' ((& $act 170000 $false $true $null $null) -eq 'REQUEST_ABORT')
    Assert-That 'unit' '감독: 요청 직후에는 기다린다' ((& $act 171000 $false $true 170000 $null) -eq 'NONE')
    Assert-That 'unit' '감독: 요청 뒤 killConfirm + 유예가 지나도 러너가 있으면 강제 종료' ((& $act (170000 + 10000 + 15000) $false $true 170000 $null) -eq 'FORCE_KILL')
    Assert-That 'unit' '감독: 러너가 이미 없으면 강제 종료하지 않는다' ((& $act 300000 $false $false 170000 $null) -eq 'NONE')
    Assert-That 'unit' '감독: 강제 종료 뒤 안정 시간이 지나면 포기하고 정리로 간다' ((& $act 210000 $false $true 170000 205000) -eq 'GIVE_UP')
    Assert-That 'unit' '감독: 결과가 왔고 러너가 끝났으면 개입하지 않는다' ((& $act 999999 $true $false $null $null) -eq 'NONE')
    Assert-That 'unit' '감독: 결과가 왔어도 러너가 마감 뒤까지 살아 있으면 중단을 요청한다' ((& $act 170000 $true $true $null $null) -eq 'REQUEST_ABORT')
    # 후손 경로
    $tr = @(@{ role = 'descendant'; processId = 5; exePath = 'C:\D\venv\Scripts\python.exe' }, @{ role = 'descendant'; processId = 6; exePath = 'C:\Windows\System32\conhost.exe' }, @{ role = 'descendant'; processId = 7; exePath = 'C:\Evil\python.exe' }, @{ role = 'runner'; processId = 1; exePath = 'C:\Elsewhere\x.exe' }, @{ role = 'descendant'; processId = 8; exePath = $null })
    $v = Get-LspMinDescendantPathViolations -Tracked $tr -AllowedDirs @('C:\Windows\System32', 'C:\D\venv', 'C:\Base')
    Assert-That 'unit' '경로 점검: 허용 폴더 밖과 경로를 모르는 후손만 위반(러너 자신은 제외)' ($v.Count -eq 2 -and (@($v | ForEach-Object { $_.processId }) -join ',') -eq '7,8') ((@($v | ForEach-Object { $_.processId })) -join ',')
    Assert-That 'unit' '경로 점검: 폴더 이름 접두만 같은 경로(C:\D\venv-evil)는 위반' ((Get-LspMinDescendantPathViolations -Tracked @(@{ role = 'descendant'; processId = 9; exePath = 'C:\D\venv-evil\p.exe' }) -AllowedDirs @('C:\D\venv')).Count -eq 1)
    # 5157 건수
    $c1 = Get-LspMinOsBlockCounts -CollectionOk $true -AuditFailureEnabled $true -LogWrapped $false -AttributedCount 0 -UnidentifiedCount 3
    Assert-That 'unit' '5157: 수집·감사·로그가 모두 확실하면 건수를 쓴다(0 도 사실)' ($c1.usable -and $c1.attributed -eq 0 -and $c1.unidentified -eq 3)
    foreach ($case in @(@{ n = '수집 실패'; a = @($false, $true, $false) }, @{ n = '감사 미확인'; a = @($true, $null, $false) }, @{ n = '감사 꺼짐'; a = @($true, $false, $false) }, @{ n = '로그 밀림'; a = @($true, $true, $true) }, @{ n = '밀림 여부 모름'; a = @($true, $true, $null) })) {
        $c2 = Get-LspMinOsBlockCounts -CollectionOk $case.a[0] -AuditFailureEnabled $case.a[1] -LogWrapped $case.a[2] -AttributedCount 0 -UnidentifiedCount 0
        Assert-That 'unit' "5157: $($case.n)이면 0 으로 채우지 않고 null 이다" (-not $c2.usable -and $null -eq $c2.attributed -and $null -eq $c2.unidentified -and $c2.unusableBecause.Count -ge 1)
    }
    # 판정 분리
    $items = @((ConvertTo-IsoCleanupItem -Name 'listener-stop' -Ok $true -Outcome 'DONE'), (ConvertTo-IsoCleanupItem -Name 'process-cleanup' -Ok $false -Outcome 'STILL_RUNNING'), (ConvertTo-IsoCleanupItem -Name 'account-disable' -Ok $true -Outcome 'DISABLED'), (ConvertTo-IsoCleanupItem -Name 'audit-restore X' -Ok $true -Outcome 'RESTORED'))
    $g = Group-LspMinCleanupItems -Items $items
    Assert-That 'unit' '정리 묶기: 프로세스 정리는 실패, 시스템 복구는 성공으로 따로 나온다' ((-not $g.processCleanup.ok) -and $g.systemRecovery.ok -and $g.processCleanup.items.Count -eq 2 -and $g.systemRecovery.items.Count -eq 2)
    Assert-That 'unit' '종료 코드: 정리 실패는 관측 성립 여부와 상관없이 70' ((Get-LspMinAdminExitCode $true $false $true) -eq 70 -and (Get-LspMinAdminExitCode $false $true $false) -eq 70)
    Assert-That 'unit' '종료 코드: 정리 완료 + 관측 성립 0 / 불성립 60' ((Get-LspMinAdminExitCode $true $true $true) -eq 0 -and (Get-LspMinAdminExitCode $false $true $true) -eq 60)
    $fs = Get-LspMinFailureSummary -Tokens @('RECEIVER_HIT', 'RUNNER_NO_RESULT', 'RECEIVER_HIT', '')
    Assert-That 'unit' '실패 토큰: 우선순위대로 주 토큰을 정하고 중복을 없앤다' ($fs.primary -eq 'RUNNER_NO_RESULT' -and $fs.all.Count -eq 2)
    Assert-That 'unit' '실패 토큰: 없으면 주 토큰도 없다' ($null -eq (Get-LspMinFailureSummary -Tokens @()).primary)
    # 문맥 문서
    $cx = New-LspMinAdminContext -RunId $RunId -Token $tok -Mode 'stub' -ExpectedVersion '1.180.0' -Limits $lim -ReceiverBaseline 0 -ReceiverFinal $null -ReceiverSamples 4 -ReceiverFailures 2 -IdentityOk $true -IdentityFailures @() -BindingOk $true -BindingFailures @() -AbortRequested $false -AbortReason $null -AbortDelivered $null -ForcedKill $false -DeadlineReached $false -ResultMissing $false -DescendantPathViolations @() -HashesUnchanged $true
    Assert-That 'unit' '문맥: 스키마와 관측하지 못한 값(null)을 그대로 싣는다' ($cx.schema -eq 'lsp-min-admin-context/1' -and $null -eq $cx.receiver.finalHits -and $cx.receiver.failures -eq 2 -and $null -eq $cx.supervisor.abortDelivered)
    $ot = { param($u, $a) Get-LspMinOsBlockFailureTokens -Counts ([ordered]@{ usable = $u; attributed = $a }) }
    Assert-That 'unit' '5157 토큰: 확실하고 0건이면 없음' ((& $ot $true 0).Count -eq 0)
    Assert-That 'unit' '5157 토큰: 귀속 1건 이상이면 OS_BLOCK_ATTRIBUTED' ((& $ot $true 2) -contains 'OS_BLOCK_ATTRIBUTED')
    Assert-That 'unit' '5157 토큰: 확실하지 않으면(usable=false) 건수가 무엇이든 OS_BLOCK_EVIDENCE_UNAVAILABLE' ((& $ot $false 0) -contains 'OS_BLOCK_EVIDENCE_UNAVAILABLE' -and (& $ot $false $null) -contains 'OS_BLOCK_EVIDENCE_UNAVAILABLE')
    Assert-That 'unit' '5157 토큰: usable 인데 건수가 null 이면 확인 못 한 것' ((& $ot $true $null) -contains 'OS_BLOCK_EVIDENCE_UNAVAILABLE')
    $cx2 = New-LspMinAdminContext -RunId $RunId -Token $tok -Mode 'stub' -ExpectedVersion $null -Limits $lim -ReceiverBaseline 0 -ReceiverFinal 0 -ReceiverSamples 1 -ReceiverFailures 0 -IdentityOk $true -IdentityFailures @() -BindingOk $true -BindingFailures @() -AbortRequested $false -AbortReason $null -AbortDelivered $null -ForcedKill $false -DeadlineReached $false -ResultMissing $false -DescendantPathViolations @() -HashesUnchanged $true -OsBlock ([ordered]@{ usable = $true; attributed = 0 })
    Assert-That 'unit' '문맥: 5157 요약을 싣는다(주지 않으면 확인 못 한 것으로 쓴다)' ($cx2.osBlock.usable -eq $true -and $cx2.osBlock.attributedCount -eq 0 -and $cx.osBlock.usable -eq $false -and $null -eq $cx.osBlock.attributedCount)
    # 포트(읽기 전용 부분): 링크를 따라가지 않는 트리 검사
    . (Join-Path $CodeDir 'LspMinAdminPorts.ps1')
    $tmpU = Join-Path ([IO.Path]::GetTempPath()) ('lspmin-unit-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    try {
        $clean = Join-Path $tmpU 'clean'; [void][IO.Directory]::CreateDirectory((Join-Path $clean 'a\b')); [IO.File]::WriteAllText((Join-Path $clean 'a\b\f.txt'), 'x')
        Assert-That 'unit' '트리 검사: 링크가 없는 트리는 빈 목록' ((Find-LspMinReparseInTree -Root $clean).Count -eq 0)
        $target = Join-Path $tmpU 'target'; [void][IO.Directory]::CreateDirectory($target); [IO.File]::WriteAllText((Join-Path $target 'keep.txt'), 'keep')
        $withLink = Join-Path $tmpU 'withlink'; [void][IO.Directory]::CreateDirectory((Join-Path $withLink 'sub'))
        $jn = Join-Path $withLink 'sub\j'; New-Item -ItemType Junction -Path $jn -Target $target | Out-Null
        $found = Find-LspMinReparseInTree -Root $withLink
        Assert-That 'unit' '트리 검사: 하위 정션을 찾고 대상 안으로 따라 들어가지 않는다' ($found.Count -eq 1 -and $found[0] -eq $jn) ($found -join ',')
        $rootJn = Join-Path $tmpU 'rootlink'; New-Item -ItemType Junction -Path $rootJn -Target $target | Out-Null
        Assert-That 'unit' '트리 검사: 루트 자체가 정션이어도 찾는다' ((Find-LspMinReparseInTree -Root $rootJn).Count -eq 1)
        $unr = Find-LspMinReparseInTree -Root (Join-Path $tmpU 'nope')
        Assert-That 'unit' '트리 검사: 읽을 수 없는(없는) 루트는 UNREADABLE 로 센다(깨끗하다고 하지 않는다)' (($unr.Count -eq 1) -and ([string]$unr[0]).StartsWith('UNREADABLE:'))
        Assert-That 'unit' '트리 검사: 항목 수 상한을 넘으면 TOO_MANY_ENTRIES(확인 못 한 것은 깨끗하지 않다)' ((Find-LspMinReparseInTree -Root $clean -MaxEntries 1) -contains 'TOO_MANY_ENTRIES')
        Assert-That 'unit' '경로 조각 검사: 정션이 낀 경로의 조각을 찾는다' ((Get-LspMinReparseInChain -Path (Join-Path $jn 'x.txt') -Root $withLink).Count -ge 1)
        [IO.Directory]::Delete($jn); [IO.Directory]::Delete($rootJn)
        Assert-That 'unit' '링크를 지워도 대상 파일은 그대로' (Test-Path -LiteralPath (Join-Path $target 'keep.txt'))
    } finally { Remove-Item -LiteralPath $tmpU -Recurse -Force -ErrorAction SilentlyContinue }
    # 목록 일치: 스텁 시나리오 이름은 러너·계약·진입점이 같다
    $runnerText = [IO.File]::ReadAllText((Join-Path $CodeDir 'lsp-min-runner.ps1'), [Text.Encoding]::UTF8)
    $m = [regex]::Match($runnerText, '\$Script:LspMinStubScenarios = @\((?<l>[^)]*)\)')
    $runnerList = @([regex]::Matches($m.Groups['l'].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
    Assert-That 'unit' '스텁 시나리오 이름: 러너 목록 == 계약 목록' (($runnerList -join ',') -ceq ($Script:LspMinAdminStubScenarios -join ',')) "runner=$($runnerList.Count) contract=$($Script:LspMinAdminStubScenarios.Count)"
    $entryText = [IO.File]::ReadAllText((Join-Path $CodeDir 'Test-LspMinObservation.ps1'), [Text.Encoding]::UTF8)
    $vs = [regex]::Match($entryText, "\[ValidateSet\((?<l>'ok'[^)]*)\)\]\[string\]\`$StubScenario")
    $entryList = @([regex]::Matches($vs.Groups['l'].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
    Assert-That 'unit' '스텁 시나리오 이름: 진입점 ValidateSet == 계약 목록' (($entryList -join ',') -ceq ($Script:LspMinAdminStubScenarios -join ',')) "entry=$($entryList.Count)"
}

# 폴더 트리의 지문(경로·크기·SHA-256). 링크 대상 폴더가 시험 전후로 같은지 비교하는 데 쓴다. 대상 폴더 안에는 링크를 두지 않는다.
function Get-TreePrint {
    param([string]$Dir)
    if (-not (Test-Path -LiteralPath $Dir)) { return 'ABSENT' }
    $items = @(Get-ChildItem -LiteralPath $Dir -Recurse -Force -ErrorAction Stop | Sort-Object FullName)
    (@($items | ForEach-Object { $rel = $_.FullName.Substring($Dir.Length); if ($_.PSIsContainer) { 'D|' + $rel } else { 'F|' + $rel + '|' + $_.Length + '|' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } })) -join "`n"
}

# ═══ (A2) 작업 경로 확인: 실제 Windows 임시 폴더와 정션(관리자 권한 없이 만들 수 있다)으로 확인한다 ═══
if (Test-Selected 'workpath') {
    Write-Host '[workpath] 신뢰 루트부터 목적지까지 경로 조각 확인 (실제 Windows 임시 폴더, 정션 사용)'
    . (Join-Path $CodeDir 'LspMinAdminPorts.ps1')
    $tmpW = Join-Path ([IO.Path]::GetTempPath()) ('lspmin-wp-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    $wpLayout = {
        param([string]$Name)
        $root = Join-Path $tmpW $Name; $task = Join-Path $root 'task'; [void][IO.Directory]::CreateDirectory($task)
        $outside = Join-Path $root 'outside'; [void][IO.Directory]::CreateDirectory((Join-Path $outside 'lsp')); [IO.File]::WriteAllText((Join-Path $outside 'keep.txt'), 'keep'); [IO.File]::WriteAllText((Join-Path $outside 'lsp\inner.txt'), 'inner')
        [pscustomobject]@{ Root = $root; Task = $task; Work = (Join-Path $task 'work'); Lsp = (Join-Path (Join-Path $task 'work') 'lsp'); Outside = $outside }
    }
    $wpProblems = { param($L) Get-LspMinWorkSafetyProblems -TrustedRoot $L.Task -WorkDir $L.Work -LspWork $L.Lsp }
    try {
        # 정상 경로와 아직 없는 경로는 허용한다.
        $L = & $wpLayout 'normal-absent'
        Assert-That 'workpath' '허용: work 가 아직 없어도(검증한 기존 부모 task 아래에 만들 수 있다) 문제 없음' ((& $wpProblems $L).Count -eq 0)
        [void][IO.Directory]::CreateDirectory($L.Work)
        Assert-That 'workpath' '허용: work 만 있고 lsp 가 없어도 문제 없음' ((& $wpProblems $L).Count -eq 0)
        [void][IO.Directory]::CreateDirectory((Join-Path $L.Lsp 'ws\sub')); [IO.File]::WriteAllText((Join-Path $L.Lsp 'ws\sub\a.txt'), 'x'); foreach ($n in 'lsp-min-request.json', 'lsp-min-runner.ps1', 'version-runner.ps1') { [IO.File]::WriteAllText((Join-Path $L.Work $n), 'old') }
        Assert-That 'workpath' '허용: 일반 폴더·일반 파일이 이미 있는 정상 배치도 문제 없음' ((& $wpProblems $L).Count -eq 0)
        $tg = Get-LspMinWorkTargets -WorkDir $L.Work -LspWork $L.Lsp   # `, @(...)` 로 돌려주는 함수는 @() 로 다시 감싸지 않는다
        Assert-That 'workpath' '목적지 목록: work·lsp, 지우는 파일 넷, 복사 파일 넷을 모두 담는다(10개)' ($tg.Count -eq 10 -and ($tg -contains $L.Work) -and ($tg -contains $L.Lsp) -and @(@('lsp-min-request.json', 'lsp-min-result.json', 'lsp-min-result.json.tmp', 'lsp-min-abort.flag', 'lsp-min-runner.ps1', 'LspMinContract.ps1', 'version-runner.ps1', 'lsp-min-stub.ps1') | Where-Object { $tg -notcontains (Join-Path $L.Work $_) }).Count -eq 0)

        # 결함 재현과 수정: task\work -> outside 정션, outside\lsp 는 일반 폴더.
        $L = & $wpLayout 'work-junction'
        New-Item -ItemType Junction -Path $L.Work -Target $L.Outside | Out-Null
        $pr0 = Get-TreePrint $L.Outside
        $old = Find-LspMinReparseInTree -Root $L.Lsp
        Assert-That 'workpath' '재현: 예전 확인(lsp 폴더 안만 봄)은 상위 work 정션을 놓친다(0건) — 이 맹점이 결함이었다' ($old.Count -eq 0) "old=$($old -join ',')"
        $p = & $wpProblems $L
        Assert-That 'workpath' '수정: 새 확인은 상위 work 정션을 LINK 로 찾는다' (($p -contains ('LINK:' + $L.Work)) -and $p.Count -ge 1) ($p -join ' ; ')
        Assert-That 'workpath' '상위 정션 확인은 링크를 따라가지 않고 쓰지도 않는다: 대상 폴더의 파일·목록·바이트가 그대로' ((Get-TreePrint $L.Outside) -eq $pr0)
        # 중단 파일: 신뢰 루트를 주면 정션을 지나 쓰지 않는다.
        $ab = Join-Path $L.Work 'lsp-min-abort.flag'
        $w = Write-LspMinAbortFile -Path $ab -Text 'A3:RECEIVER_HIT' -TrustedRoot $L.Task
        Assert-That 'workpath' '중단 파일: work 가 정션이면 쓰지 않고 WORK_PATH_UNSAFE 로 실패한다(대상 폴더에 파일이 생기지 않는다)' ((-not $w.ok) -and ([string]$w.error).StartsWith('WORK_PATH_UNSAFE') -and -not (Test-Path -LiteralPath (Join-Path $L.Outside 'lsp-min-abort.flag')) -and ((Get-TreePrint $L.Outside) -eq $pr0)) "ok=$($w.ok) err=$($w.error)"
        [IO.Directory]::Delete($L.Work)
        Assert-That 'workpath' '링크를 지워도 대상 폴더는 그대로' ((Get-TreePrint $L.Outside) -eq $pr0)
        # 정상 work 에서는 같은 중단 파일 쓰기가 성공하고, 두 번째는 기존대로 실패한다(CreateNew).
        [void][IO.Directory]::CreateDirectory($L.Work)
        $w1 = Write-LspMinAbortFile -Path $ab -Text 'A3:RECEIVER_HIT' -TrustedRoot $L.Task; $w2 = Write-LspMinAbortFile -Path $ab -Text 'A3:RECEIVER_HIT' -TrustedRoot $L.Task
        Assert-That 'workpath' '중단 파일: 정상 경로에서는 쓰고(내용 확인), 이미 있으면 기존대로 실패한다' ($w1.ok -and (-not $w2.ok) -and (([IO.File]::ReadAllText($ab)).Trim() -eq 'A3:RECEIVER_HIT'))

        # lsp 자체가 정션
        $L = & $wpLayout 'lsp-junction'; [void][IO.Directory]::CreateDirectory($L.Work)
        New-Item -ItemType Junction -Path $L.Lsp -Target $L.Outside | Out-Null
        $pr0 = Get-TreePrint $L.Outside; $p = & $wpProblems $L
        Assert-That 'workpath' 'lsp 폴더 자체가 정션이면 LINK 로 찾는다' ($p -contains ('LINK:' + $L.Lsp)) ($p -join ' ; ')
        Assert-That 'workpath' 'lsp 가 정션이면 그 안을 훑지 않는다(대상 폴더 불변)' ((Get-TreePrint $L.Outside) -eq $pr0)
        [IO.Directory]::Delete($L.Lsp)

        # lsp 안쪽의 정션(상위 경로는 깨끗)은 트리 확인이 찾는다.
        $L = & $wpLayout 'nested-junction'; [void][IO.Directory]::CreateDirectory((Join-Path $L.Lsp 'ws'))
        $nj = Join-Path $L.Lsp 'ws\j'; New-Item -ItemType Junction -Path $nj -Target $L.Outside | Out-Null
        $p = & $wpProblems $L
        Assert-That 'workpath' 'lsp 안쪽 정션: 경로 조각은 깨끗해도 트리 확인이 찾는다' (($p -contains $nj) -and $p.Count -eq 1) ($p -join ' ; ')
        [IO.Directory]::Delete($nj)

        # 기존 복사·삭제 목적지가 링크
        foreach ($leaf in 'lsp-min-runner.ps1', 'LspMinContract.ps1', 'version-runner.ps1', 'lsp-min-stub.ps1', 'lsp-min-request.json', 'lsp-min-result.json', 'lsp-min-abort.flag') {
            $L = & $wpLayout ('dest-' + $leaf); [void][IO.Directory]::CreateDirectory($L.Work)
            $dj = Join-Path $L.Work $leaf; New-Item -ItemType Junction -Path $dj -Target $L.Outside | Out-Null
            $p = & $wpProblems $L
            Assert-That 'workpath' "기존 목적지 $leaf 가 정션이면 LINK 로 찾는다" ($p -contains ('LINK:' + $dj)) ($p -join ' ; ')
            [IO.Directory]::Delete($dj)
        }
        $L = & $wpLayout 'dest-filelink'; [void][IO.Directory]::CreateDirectory($L.Work)
        $realFile = Join-Path $L.Outside 'real-target.txt'; [IO.File]::WriteAllText($realFile, 'must not change')
        $fl = Join-Path $L.Work 'lsp-min-runner.ps1'; $madeFileLink = $false
        try { New-Item -ItemType SymbolicLink -Path $fl -Target $realFile -ErrorAction Stop | Out-Null; $madeFileLink = $true } catch { $madeFileLink = $false }
        if ($madeFileLink) {
            $p = & $wpProblems $L
            Assert-That 'workpath' '기존 복사 목적지 파일이 심볼릭 링크면 LINK 로 찾는다(링크를 따라 덮어쓰지 않는다)' ($p -contains ('LINK:' + $fl)) ($p -join ' ; ')
            [IO.File]::Delete($fl)
            Assert-That 'workpath' '파일 링크를 지워도 대상 파일은 그대로' (([IO.File]::ReadAllText($realFile)) -eq 'must not change')
        } else { Skip-That 'workpath' '이 계정으로는 파일 심볼릭 링크를 만들 수 없다(권한): 파일 링크 사례를 확인하지 못했다' }

        # 신뢰 루트 자체
        $L = & $wpLayout 'root-junction'
        $rj = Join-Path $L.Root 'taskjn'; New-Item -ItemType Junction -Path $rj -Target $L.Task | Out-Null
        $p = Get-LspMinWorkSafetyProblems -TrustedRoot $rj -WorkDir (Join-Path $rj 'work') -LspWork (Join-Path (Join-Path $rj 'work') 'lsp')
        Assert-That 'workpath' '신뢰 루트 자체가 정션이면 LINK 로 거절한다' ($p -contains ('LINK:' + $rj)) ($p -join ' ; ')
        [IO.Directory]::Delete($rj)
        $p = Get-LspMinWorkSafetyProblems -TrustedRoot (Join-Path $L.Root 'no-such-root') -WorkDir (Join-Path $L.Root 'no-such-root\work') -LspWork (Join-Path $L.Root 'no-such-root\work\lsp')
        Assert-That 'workpath' '신뢰 루트가 없으면 확인할 수 없으므로 거절한다(ROOT_MISSING)' (($p.Count -eq 1) -and ([string]$p[0]).StartsWith('ROOT_MISSING:')) ($p -join ' ; ')
        $p = Get-LspMinWorkPathProblems -TrustedRoot $L.Task -Targets @((Join-Path $L.Outside 'x.txt'), (Join-Path $L.Task '..\outside\y.txt'))
        Assert-That 'workpath' '루트 밖 목적지(.. 로 빠져나가는 것 포함)는 OUTSIDE_ROOT 로 거절한다' (@($p | Where-Object { $_.StartsWith('OUTSIDE_ROOT:') }).Count -eq 2) ($p -join ' ; ')
        # 중간 조각이 파일
        $L = & $wpLayout 'work-is-file'; [IO.File]::WriteAllText($L.Work, 'i am a file')
        $p = & $wpProblems $L
        Assert-That 'workpath' 'work 자리에 파일이 있으면 NOT_A_DIRECTORY 로 거절한다' ($p -contains ('NOT_A_DIRECTORY:' + $L.Work)) ($p -join ' ; ')

        # 읽지 못한 조각(모의): 확인할 수 없으면 깨끗하다고 하지 않는다. 실제 접근 거부는 이 계정으로 재현하지 못해 상태 함수를 대체해 흉내 낸다.
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
        if (Test-Path -LiteralPath $tmpW) {
            foreach ($i in @(Get-ChildItem -LiteralPath $tmpW -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })) { try { if ($i.PSIsContainer) { [IO.Directory]::Delete($i.FullName) } else { [IO.File]::Delete($i.FullName) } } catch { } }
            Remove-Item -LiteralPath $tmpW -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# ═══ (A3) 재해석 도구 호출: 실제 Windows 프로세스(무해한 .cmd 스텁)로 마감·파이프·후손 정리를 확인한다 ═══
# 스텁은 ping/powershell 로 잠깐 기다리는 것뿐이다(Semgrep 도 tsx 도 아니다). 후손 프로세스는 명령줄의 고유 표지로 찾아 끝났는지 본다.
function Get-MarkerPids {
    param([string]$Marker)
    @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($Marker, [StringComparison]::Ordinal) -ge 0 } | ForEach-Object { [int]$_.ProcessId })
}
if (Test-Selected 'reinterpret-io') {
    Write-Host '[reinterpret-io] 재해석 도구 호출: 하나의 마감, 파이프 EOF 대기, 후손 정리 (실제 Windows 프로세스, 공백이 있는 경로)'
    . (Join-Path $CodeDir 'LspMinAdminPorts.ps1')
    $tmpR = Join-Path ([IO.Path]::GetTempPath()) ('lspmin-io ' + [guid]::NewGuid().ToString('N').Substring(0, 8))   # 경로에 공백이 있다
    $toolDir = Join-Path $tmpR 'fake tool dir'; $dataDir = Join-Path $tmpR 'data dir'
    [void][IO.Directory]::CreateDirectory($toolDir); [void][IO.Directory]::CreateDirectory($dataDir)
    $ioMarkers = New-Object System.Collections.ArrayList
    $newStub = {
        param([string]$Name, [string]$Body)
        $p = Join-Path $toolDir $Name; [IO.File]::WriteAllText($p, ("@echo off`r`n" + $Body + "`r`n"), [Text.Encoding]::ASCII); $p
    }
    $ps51Exe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'   # 이 도구의 PATH 에는 System32 가 없을 수 있어 전체 경로로 부른다
    $sleeperLine = { param([string]$Marker, [int]$Sec) "`"$ps51Exe`" -NoProfile -NonInteractive -Command `"Start-Sleep -Seconds $Sec # $Marker`"" }
    $callTool = {
        param([string]$Stub, [hashtable]$Extra = @{})
        $a = @{ TsxCmd = $Stub; CliTs = (Join-Path $dataDir 'cli file.ts'); RunnerResultPath = (Join-Path $dataDir 'runner result.json'); ContextPath = (Join-Path $dataDir 'context file.json'); OutPath = (Join-Path $dataDir 'out file.json') }
        foreach ($k in $Extra.Keys) { $a[$k] = $Extra[$k] }
        Invoke-LspMinReinterpret @a
    }
    try {
        # 정상 EOF: 두 스트림의 내용을 모두 받고 정리할 것이 없다.
        $stub = & $newStub 'eof-ok.cmd' "echo hello-out`r`necho hello-err 1>&2`r`nexit /b 0"
        $r = & $callTool $stub @{ TimeoutMs = 20000 }
        Assert-That 'reinterpret-io' '정상 EOF: ran, 종료 코드 0, 두 스트림 닫힘, 출력 모두 수집, 정리할 것 없음(NOT_NEEDED)' ($r.ran -and $r.exitCode -eq 0 -and $r.stdoutClosed -and $r.stderrClosed -and $r.output -match 'hello-out' -and $r.output -match 'hello-err' -and $null -eq $r.error -and $r.cleanup.ok -and $r.cleanup.outcome -eq 'NOT_NEEDED') ($r | ConvertTo-Json -Depth 4 -Compress)
        # 인자 전달: 공백이 있는 도구 경로와 공백이 있는 인자 경로가 그대로 일곱 개로 도착한다.
        $stub = & $newStub 'args echo.cmd' "echo [%~1]`r`necho [%~2]`r`necho [%~3]`r`necho [%~4]`r`necho [%~5]`r`necho [%~6]`r`necho [%~7]`r`nexit /b 0"
        $r = & $callTool $stub @{ TimeoutMs = 20000 }
        $want = @((Join-Path $dataDir 'cli file.ts'), '--runner-result', (Join-Path $dataDir 'runner result.json'), '--context', (Join-Path $dataDir 'context file.json'), '--out', (Join-Path $dataDir 'out file.json')) | ForEach-Object { "[$_]" }
        $got = @(($r.output -split "`r?`n") | Where-Object { $_ -ne '' })
        Assert-That 'reinterpret-io' '공백이 있는 도구 경로(.cmd)로도 일곱 인자가 공백이 있는 경로 그대로 정확히 도착한다' ($r.ran -and $r.exitCode -eq 0 -and ($got -join '|') -ceq ($want -join '|')) ("got=" + ($got -join '|') + " error=$($r.error)")
        # 비정상 종료: 종료 코드와 stderr 를 그대로 돌려준다(ran 은 도구가 끝났다는 뜻이고 성공 여부는 호출자가 종료 코드로 본다).
        $stub = & $newStub 'fail.cmd' "echo bad-thing 1>&2`r`nexit /b 3"
        $r = & $callTool $stub @{ TimeoutMs = 20000 }
        Assert-That 'reinterpret-io' '비정상 종료: 종료 코드 3, stderr 수집, 오류 토큰 없음, 정리할 것 없음' ($r.ran -and $r.exitCode -eq 3 -and $r.output -match 'bad-thing' -and $null -eq $r.error -and $r.cleanup.ok -and $r.cleanup.outcome -eq 'NOT_NEEDED')

        # 부모 종료는 EOF 가 아니다: 부모는 곧바로 끝나지만 자손이 파이프를 2초 붙잡는다. 마감이 넉넉하면 EOF 까지 기다려 정상 완료한다.
        $m1 = 'LSPMINMARK' + [guid]::NewGuid().ToString('N').Substring(0, 8); [void]$ioMarkers.Add($m1)
        $stub = & $newStub 'holder-short.cmd' ("start `"`" /b " + (& $sleeperLine $m1 2) + "`r`nexit /b 0")
        $r = & $callTool $stub @{ TimeoutMs = 20000 }
        Assert-That 'reinterpret-io' '부모가 먼저 끝나도 EOF 로 보지 않는다: 자손이 파이프를 놓을 때까지(1.2초 이상) 기다렸다가 정상 완료' ($r.ran -and $r.exitCode -eq 0 -and $r.elapsedMs -ge 1200 -and $r.stdoutClosed -and $r.stderrClosed -and $null -eq $r.error) ($r | ConvertTo-Json -Depth 3 -Compress)
        # 마감이 짧으면: 파이프가 안 닫힌 채 마감 → PIPE_NOT_CLOSED, 자손 정리 확인, 정리 기록은 따로.
        $m2 = 'LSPMINMARK' + [guid]::NewGuid().ToString('N').Substring(0, 8); [void]$ioMarkers.Add($m2)
        $stub = & $newStub 'holder-long.cmd' ("start `"`" /b " + (& $sleeperLine $m2 40) + "`r`nexit /b 0")
        $r = & $callTool $stub @{ TimeoutMs = 400 }
        Start-Sleep -Milliseconds 400
        $left = @(Get-MarkerPids $m2)
        Assert-That 'reinterpret-io' '재현 수정: TimeoutMs=400 에 부모 종료·자손 파이프 점유 → PIPE_NOT_CLOSED, ran=false, 부모는 끝났음(exited), 마감 직후(수 초 안) 반환' ((-not $r.ran) -and $r.error -eq 'PIPE_NOT_CLOSED' -and $r.exited -and $r.elapsedMs -ge 400 -and $r.elapsedMs -lt 3000 -and $r.totalMs -lt 8000) ($r | ConvertTo-Json -Depth 3 -Compress)
        Assert-That 'reinterpret-io' '자손(파이프를 붙잡은 프로세스)이 정리됐고 정리 기록은 TERMINATED·ok 로 관측 결과와 따로 남는다' ($left.Count -eq 0 -and $r.cleanup.ok -and $r.cleanup.outcome -eq 'TERMINATED' -and $r.cleanup.jobActiveAfter -eq 0 -and $r.cleanup.readTasksPending -eq 0 -and $r.cleanup.jobActiveBefore -ge 1) ("left=$($left -join ',') cleanup=" + ($r.cleanup | ConvertTo-Json -Compress))
        # 도구 본체가 멈춤: TIMEOUT, 트리 전체 정리
        $m3 = 'LSPMINMARK' + [guid]::NewGuid().ToString('N').Substring(0, 8); [void]$ioMarkers.Add($m3)
        $stub = & $newStub 'hang.cmd' ((& $sleeperLine $m3 60) + "`r`nexit /b 0")
        $r = & $callTool $stub @{ TimeoutMs = 500 }
        Start-Sleep -Milliseconds 400
        $left = @(Get-MarkerPids $m3)
        Assert-That 'reinterpret-io' '도구 본체가 멈추면 TIMEOUT: 아직 끝나지 않았고(exited=false), 트리 전체가 정리되고, 마감 직후 반환' ((-not $r.ran) -and $r.error -eq 'TIMEOUT' -and (-not $r.exited) -and $r.elapsedMs -lt 3000 -and $r.cleanup.ok -and $r.cleanup.outcome -eq 'TERMINATED' -and $left.Count -eq 0) ("left=$($left -join ',') " + ($r | ConvertTo-Json -Depth 3 -Compress))
        # 취소: 시작 때 없던 취소 표지가 실행 중에 생기면 CANCELLED
        $m4 = 'LSPMINMARK' + [guid]::NewGuid().ToString('N').Substring(0, 8); [void]$ioMarkers.Add($m4)
        $cancel = Join-Path $tmpR 'cancel.flag'
        $stub = & $newStub 'cancel.cmd' ("echo x> `"$cancel`"`r`n" + (& $sleeperLine $m4 60) + "`r`nexit /b 0")
        $r = & $callTool $stub @{ TimeoutMs = 30000; CancelFile = $cancel }
        Start-Sleep -Milliseconds 400
        $left = @(Get-MarkerPids $m4)
        Assert-That 'reinterpret-io' '취소: 실행 중 생긴 취소 표지로 CANCELLED, 마감(30초)을 기다리지 않고 트리 전체를 정리한다' ((-not $r.ran) -and $r.error -eq 'CANCELLED' -and $r.elapsedMs -lt 10000 -and $r.cleanup.ok -and $left.Count -eq 0) ("left=$($left -join ',') " + ($r | ConvertTo-Json -Depth 3 -Compress))
        $stub = & $newStub 'eof-ok2.cmd' "echo again`r`nexit /b 0"
        $r = & $callTool $stub @{ TimeoutMs = 20000; CancelFile = $cancel }    # 표지가 이미 있는 채로 시작하면 취소로 보지 않는다
        Assert-That 'reinterpret-io' '시작할 때 이미 있던 취소 표지는 취소로 보지 않는다(운영자가 앞서 취소했어도 기록을 만든다)' ($r.ran -and $r.exitCode -eq 0 -and $null -eq $r.error)
        # 출력 상한
        $stub = & $newStub 'flood.cmd' "for /L %%i in (1,1,12000) do @echo 0123456789012345678901234567890123456789012345678901234567890123456789"
        $r = & $callTool $stub @{ TimeoutMs = 60000; MaxOutputChars = 50000 }
        Assert-That 'reinterpret-io' '출력 상한: 넘치면 잘라 모으되(truncated) 끝까지 비워서 도구가 멈추지 않고 정상 완료' ($r.ran -and $r.truncated -and $r.output.Length -le 50000 + 10 -and $r.exitCode -eq 0) ("len=$($r.output.Length) " + ($r | ConvertTo-Json -Depth 3 -Compress).Substring(0, 120))

        # 실제 문서의 호출 경로: tsx.cmd + 재해석 CLI, 공백이 있는 입출력 경로와 공백이 있는 node 폴더(PATH 앞에 붙는다).
        if ($toolsReady) {
            [IO.File]::WriteAllText((Join-Path $dataDir 'runner result.json'), '{}', $Utf8); [IO.File]::WriteAllText((Join-Path $dataDir 'context file.json'), '{}', $Utf8)
            $outReal = Join-Path $dataDir 'out file.json'; if (Test-Path -LiteralPath $outReal) { [IO.File]::Delete($outReal) }
            $r = Invoke-LspMinReinterpret -TsxCmd $TsxCmd -NodeDir $NodeDir -CliTs $ReinterpretCli -RunnerResultPath (Join-Path $dataDir 'runner result.json') -ContextPath (Join-Path $dataDir 'context file.json') -OutPath $outReal -TimeoutMs 120000
            Assert-That 'reinterpret-io' '실제 tsx.cmd + 재해석 CLI(공백 경로 입출력): 종료 0, RECORD_WRITTEN, 출력 파일이 공백 경로에 생겼고 정리할 것 없음' ($r.ran -and $r.exitCode -eq 0 -and $r.output -match 'RECORD_WRITTEN' -and (Test-Path -LiteralPath $outReal) -and $r.cleanup.ok -and $r.cleanup.outcome -eq 'NOT_NEEDED') ($r | ConvertTo-Json -Depth 3 -Compress)
            # 공백이 있는 tsx.cmd 경로(껍데기 .cmd 가 진짜 tsx.cmd 를 부른다)
            $spacedTsx = & $newStub 'tsx.cmd' ("`"$TsxCmd`" %*")
            if (Test-Path -LiteralPath $outReal) { [IO.File]::Delete($outReal) }
            $r = Invoke-LspMinReinterpret -TsxCmd $spacedTsx -NodeDir $NodeDir -CliTs $ReinterpretCli -RunnerResultPath (Join-Path $dataDir 'runner result.json') -ContextPath (Join-Path $dataDir 'context file.json') -OutPath $outReal -TimeoutMs 120000
            Assert-That 'reinterpret-io' '공백이 있는 폴더의 tsx.cmd 껍데기를 거쳐도 같은 결과(종료 0, RECORD_WRITTEN, 출력 파일 생성)' ($r.ran -and $r.exitCode -eq 0 -and $r.output -match 'RECORD_WRITTEN' -and (Test-Path -LiteralPath $outReal)) ($r | ConvertTo-Json -Depth 3 -Compress)
        } else { Skip-That 'reinterpret-io' '실제 tsx.cmd 호출 경로 시험은 -TsxCmd/-ReinterpretCli 가 있어야 한다' }
    } finally {
        foreach ($mk in $ioMarkers) { foreach ($pid2 in (Get-MarkerPids $mk)) { Stop-Process -Id $pid2 -Force -ErrorAction SilentlyContinue } }   # 이 시험이 띄운 표지 달린 스텁만
        Remove-Item -LiteralPath $tmpR -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ═══ (B) 흐름 시험 ═══════════════════════════════════════════════════════════
function New-Sandbox {
    param([hashtable]$Scenario = @{})
    $root = Join-Path ([IO.Path]::GetTempPath()) ('iso-lspflows-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
    $code = Join-Path $root 'code'
    [void][IO.Directory]::CreateDirectory($code)
    foreach ($f in Get-ChildItem -LiteralPath $CodeDir -Filter *.ps1 -File) { [IO.File]::Copy($f.FullName, (Join-Path $code $f.Name)) }
    foreach ($f in 'MockSystem.ps1', 'MockSystemLsp.ps1', 'MockPortsLsp.ps1') { [IO.File]::Copy((Join-Path $PSScriptRoot $f), (Join-Path $root $f)) }
    # 모의 시스템 확장은 (a) 적용·복구 진입점이 읽는 IsolationFlows.ps1, (b) LSP 진입점이 읽는 LspMinAdminPorts.ps1 바로 뒤에 읽히게 한다. 5.1 이 한글을 읽도록 BOM 을 붙인다.
    $stubs = @{ 'IsolationFlows.ps1' = @('..\MockSystemLsp.ps1'); 'LspMinAdminPorts.ps1' = @('..\MockSystemLsp.ps1', '..\MockPortsLsp.ps1') }
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
    $hash = (Get-FileHash -LiteralPath (Join-Path $runDir 'preflight.json') -Algorithm SHA256).Hash.ToLowerInvariant()
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
$GOODLIM = @('-TotalMs', '20000', '-InitMs', '8000', '-ExitMs', '6000', '-StdinCloseGraceMs', '3000', '-KillConfirmMs', '3000', '-StartAllowanceMs', '15000', '-SupervisorGraceMs', '5000')
$FASTLIM = @('-TotalMs', '3000', '-InitMs', '1500', '-ExitMs', '1000', '-StdinCloseGraceMs', '800', '-KillConfirmMs', '1500', '-StartAllowanceMs', '4000', '-SupervisorGraceMs', '2000')
function Invoke-Lsp {
    param($Sb, [switch]$Dry, [string]$StubScenario = 'ok', [string[]]$Limits = $GOODLIM, [switch]$NoTools, [string[]]$Extra = @())
    $a = @('-RunDir', $Sb.RunDir, '-Mode', 'stub', '-StubScenario', $StubScenario, '-CancelFile', $Sb.Cancel) + $Limits
    if (-not $NoTools -and $toolsReady) { $a += @('-TsxCmd', $TsxCmd, '-ReinterpretCli', $ReinterpretCli); if ($NodeDir) { $a += @('-NodeDir', $NodeDir) } }
    if (-not $Dry) { $a += '-Execute' }
    Invoke-Entry $Sb 'lsp' 'Test-LspMinObservation.ps1' ($a + $Extra)
}
function Invoke-Recover { param($Sb) Invoke-Entry $Sb 'recover' 'Remove-Isolation.ps1' @('-RunDir', $Sb.RunDir, '-Apply') }
function Get-Fake { param($Sb) $f = Join-Path $Sb.Root 'fake-state.json'; if (Test-Path -LiteralPath $f) { [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-AuditValue { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; Get-Prop $s.audit $FpcGuid }
function Get-UserEnabled { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; $u = Get-Prop $s.users $UserName; if ($null -eq $u) { return $null }; $u.Enabled }
function Get-LspReport { param($Sb) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter 'lsp-min-observation-*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-CallsLog { param($Sb) $lf = Join-Path $Sb.Root 'calls.log'; if (-not (Test-Path -LiteralPath $lf)) { return '' }; [IO.File]::ReadAllText($lf) }
# 이 샌드박스가 띄운 프로세스가 남아 있는지(있으면 끝낸다). 남은 개수를 돌려준다.
function Remove-Stragglers {
    param($Sb)
    $left = @(Get-CimInstance Win32_Process -Property ProcessId, CommandLine -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($Sb.Root, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    foreach ($p in $left) { Stop-Process -Id ([int]$p.ProcessId) -Force -ErrorAction SilentlyContinue }
    $left.Count
}
function New-LspSandbox { param([hashtable]$Lsp = @{}, [hashtable]$Top = @{}) $sc = @{ lsp = $Lsp }; foreach ($k in $Top.Keys) { $sc[$k] = $Top[$k] }; $sb = New-Sandbox -Scenario $sc; $r = Invoke-Apply $sb; if ($r.exit -ne 0) { throw "적용 단계가 실패했다(exit $($r.exit)): $($r.out)" }; $sb }

# ── 정상 대조군과 dry-run ─────────────────────────────────────────────────
if (Test-Selected 'control') {
    Write-Host '[control] 정상 흐름(진짜 러너 + 스텁 서버, 모의 시스템)'
    if (-not $toolsReady) { Skip-That 'control' 'TS 재해석 도구(-TsxCmd, -ReinterpretCli)가 없다: 관측 성립 판정을 확인할 수 없다' }
    else {
        $sb = New-LspSandbox
        $auditBefore = Get-AuditValue $sb
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        Assert-That 'control' '종료 코드 0' ($r.exit -eq 0) "exit=$($r.exit)`n$($r.out)"
        Assert-That 'control' '판정 STUB_LSP_MIN_OBSERVED' ((Get-Prop $rep 'verdict') -eq 'STUB_LSP_MIN_OBSERVED') (Get-Prop $rep 'verdict')
        Assert-That 'control' '관측 성립: 기록 상태 OBSERVED, 종료 경로 SELF_EXIT' ((Get-Prop $rep 'observation.established') -eq $true -and (Get-Prop $rep 'observation.recordStatus') -eq 'OBSERVED' -and (Get-Prop $rep 'observation.terminationPath') -eq 'SELF_EXIT')
        Assert-That 'control' '결과 결합과 신원 교차 확인이 통과' ((Get-Prop $rep 'binding.ok') -eq $true -and (Get-Prop $rep 'identity.ok') -eq $true -and (Get-Prop $rep 'binding.resultState') -eq 'ACCEPTED')
        Assert-That 'control' '토큰이 RunId 를 담는다' ([string](Get-Prop $rep 'runToken')).StartsWith("lsp-$RunId-")
        Assert-That 'control' '수신기: 기준 0, 최종 0, 읽기 실패 0' ((Get-Prop $rep 'receiver.baselineHits') -eq 0 -and (Get-Prop $rep 'receiver.finalHits') -eq 0 -and (Get-Prop $rep 'receiver.failures') -eq 0 -and (Get-Prop $rep 'receiver.samples') -ge 2)
        Assert-That 'control' '감독은 개입하지 않았다(중단 요청·강제 종료 없음)' ((Get-Prop $rep 'supervisor.forcedKill') -eq $false -and $null -eq (Get-Prop $rep 'supervisor.abortReason'))
        Assert-That 'control' '세 결과가 따로 있고 모두 성공' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true -and (Get-Prop $rep 'observation.established') -eq $true)
        Assert-That 'control' '5157: 수집이 확실하므로 건수는 숫자 0 이고 루프백 건수도 따로 있다' ((Get-Prop $rep 'osBlockObservation.countsUsable') -eq $true -and (Get-Prop $rep 'osBlockObservation.attributedCount') -eq 0 -and (Get-Prop $rep 'osBlockObservation.unidentifiedCount') -eq 0 -and (Get-Prop $rep 'osBlockObservation.loopbackHits') -eq 0)
        Assert-That 'control' '요청에 SEMGREP_ENABLE_VERSION_CHECK 가 없고 자기 점검 문제가 없다' ((@(Get-Prop $rep 'request.envNames') -notcontains 'SEMGREP_ENABLE_VERSION_CHECK') -and @(Get-Prop $rep 'request.selfCheckProblems').Count -eq 0 -and (Get-Prop $rep 'request.envNames').Count -eq 11)
        Assert-That 'control' '정리: 감사 값 복구, 계정 비활성화' ((Get-AuditValue $sb) -eq $auditBefore -and (Get-UserEnabled $sb) -eq $false)
        Assert-That 'control' '원시 stdout·stderr, 러너 결과 원문, 문맥, 기록 파일이 실행 기록 폴더에 있다' ((@(Get-ChildItem $sb.RunDir -Filter 'lsp-min-stdout-*.bin').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-min-runner-result-*.json').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-min-admin-context-*.json').Count -eq 1) -and (@(Get-ChildItem $sb.RunDir -Filter 'lsp-min-record-*.json').Count -eq 1))
        Assert-That 'control' '보고서의 러너 결과 해시가 보관한 원문과 같다' ((Get-Prop $rep 'runnerResult.sha256') -eq (Get-FileHash -LiteralPath (Get-ChildItem $sb.RunDir -Filter 'lsp-min-runner-result-*.json' | Select-Object -First 1).FullName -Algorithm SHA256).Hash.ToLowerInvariant())
        Assert-That 'control' '호출 기록: 진짜 러너는 stub 모드로 한 번만 띄웠고 MOCK GUARD 가 없다' (([regex]::Matches((Get-CallsLog $sb), 'LspRunner kind=real')).Count -eq 1 -and (Get-CallsLog $sb) -notmatch 'MOCK GUARD')
        $recover = Invoke-Recover $sb
        Assert-That 'control' '이어서 복구 스크립트가 정상 종료(0)' ($recover.exit -eq 0) "exit=$($recover.exit)"
        Assert-That 'control' '남은 프로세스 없음' ((Remove-Stragglers $sb) -eq 0)
    }
}

if (Test-Selected 'dry-run') {
    Write-Host '[dry-run] -Execute 없이는 상태를 바꾸지 않는다'
    $sb = New-LspSandbox
    $fake0 = [IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json'))
    $log0 = (Get-CallsLog $sb).Split("`n").Count
    $r = Invoke-Lsp $sb -Dry
    Assert-That 'dry-run' '종료 코드 0, NOT_EXECUTED' ($r.exit -eq 0 -and $r.out -match 'NOT_EXECUTED') "exit=$($r.exit)`n$($r.out)"
    Assert-That 'dry-run' '모의 상태(계정·규칙·감사)가 그대로' ([IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json')) -eq $fake0)
    $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
    Assert-That 'dry-run' '새 호출 기록에 계정 켜기·감사 설정·러너 실행이 없다' ($new -notmatch 'Enable-LocalUser|Invoke-AuditPol /set|LspRunner|Start-Process|Stop-Process|Write-LspMinAbortFile') $new
    Assert-That 'dry-run' '보고서·요청·결과·중단 파일을 만들지 않았다' ($null -eq (Get-LspReport $sb) -and -not (Test-Path (Join-Path $sb.WorkDir 'work\lsp-min-request.json')) -and -not (Test-Path (Join-Path $sb.WorkDir 'work\lsp-min-abort.flag')))
    Assert-That 'dry-run' '계획 줄에 initialized 가 없고 initialize → shutdown → exit 만 말한다' ($r.out -match 'initialize → shutdown → exit' -and $r.out -notmatch 'initialized')
    Assert-That 'dry-run' '감독 마감 계획이 출력된다' ($r.out -match '부모 감독')
    Assert-That 'dry-run' '자식 프로세스를 띄우지 않았다' ((Remove-Stragglers $sb) -eq 0)
}

# ── 도구 없음 / 수신기 준비 실패 / 재해석 실패 ──────────────────────────────
if (Test-Selected 'no-tools') {
    Write-Host '[no-tools] 재해석 도구가 없으면 관측은 성립하지 않는다(자기 보고만으로는 성립시키지 않는다)'
    $sb = New-LspSandbox
    $r = Invoke-Lsp $sb -NoTools
    $rep = Get-LspReport $sb
    Assert-That 'no-tools' '종료 60, REINTERPRETATION_NOT_RUN' ($r.exit -eq 60 -and (Get-Prop $rep 'observation.failure') -eq 'REINTERPRETATION_NOT_RUN' -and (Get-Prop $rep 'verdict') -eq 'STUB_NOT_OBSERVED:REINTERPRETATION_NOT_RUN') "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
    Assert-That 'no-tools' '러너는 실행됐고 결합·신원은 통과했으며 정리도 끝났다' ((Get-Prop $rep 'binding.ok') -eq $true -and (Get-Prop $rep 'identity.ok') -eq $true -and (Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true)
    [void](Remove-Stragglers $sb)
}
if (Test-Selected 'receiver-not-ready') {
    Write-Host '[receiver-not-ready] 수신기를 못 열면 아무것도 시작하지 않는다'
    $sb = New-LspSandbox @{ receiverNotReady = $true }
    $before = Get-AuditValue $sb
    $r = Invoke-Lsp $sb
    $rep = Get-LspReport $sb
    $log = Get-CallsLog $sb
    Assert-That 'receiver-not-ready' '판정 NOT_ATTEMPTED:RECEIVER_NOT_READY, 종료 60' ($r.exit -eq 60 -and (Get-Prop $rep 'verdict') -eq 'NOT_ATTEMPTED:RECEIVER_NOT_READY') "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')"
    Assert-That 'receiver-not-ready' '계정을 켜지 않았고 감사 창도 열지 않았으며 러너도 띄우지 않았다' ($log -notmatch 'Enable-LocalUser|LspRunner' -and (Get-AuditValue $sb) -eq $before -and (Get-UserEnabled $sb) -eq $false)
    Assert-That 'receiver-not-ready' '정리는 끝났다(프로세스 정리·시스템 복구 모두 ok)' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true)
}
if (Test-Selected 'reinterpret-fails') {
    Write-Host '[reinterpret-fails] 재해석 도구가 실패하면 관측은 성립하지 않는다'
    if (-not $toolsReady) { Skip-That 'reinterpret-fails' '도구 경로가 있어야 실패 주입을 확인한다' }
    else {
        $sb = New-LspSandbox @{ reinterpret = 'fail' }
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        Assert-That 'reinterpret-fails' '종료 60, REINTERPRETATION_FAILED' ($r.exit -eq 60 -and (Get-Prop $rep 'observation.failure') -eq 'REINTERPRETATION_FAILED' -and (Get-Prop $rep 'reinterpretation.status') -eq 'FAILED') "exit=$($r.exit)"
        [void](Remove-Stragglers $sb)
    }
}

if (Test-Selected 'reinterpret-tool') {
    Write-Host '[reinterpret-tool] 재해석 도구가 파이프를 붙잡거나 정리에 실패해도 관측·프로세스 정리·시스템 복구가 따로 남는다'
    if (-not $toolsReady) { Skip-That 'reinterpret-tool' '도구 경로가 있어야 재해석 단계로 들어간다(-TsxCmd, -ReinterpretCli)' }
    else {
        # (1) 진짜 포트를 무해한 스텁 도구로 돌린다: 부모는 곧바로 끝나고 자손이 출력 파이프를 40초 붙잡는다. 포트 마감을 0.7초로 줘서 PIPE_NOT_CLOSED 와 자손 정리를 진짜 프로세스로 본다.
        $sb = New-LspSandbox @{ reinterpret = 'hold-pipe' }
        $stubDir = Join-Path $sb.Root 'fake tool'; [void][IO.Directory]::CreateDirectory($stubDir)
        $mk = 'LSPMINMARK' + [guid]::NewGuid().ToString('N').Substring(0, 8)
        $ps51 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        [IO.File]::WriteAllText((Join-Path $stubDir 'fake-tsx.cmd'), ("@echo off`r`nstart `"`" /b `"$ps51`" -NoProfile -NonInteractive -Command `"Start-Sleep -Seconds 40 # $mk`"`r`nexit /b 0`r`n"), [Text.Encoding]::ASCII)
        $auditBefore = Get-AuditValue $sb
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        Start-Sleep -Milliseconds 400
        $held = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($mk, [StringComparison]::Ordinal) -ge 0 })
        $items = @(Get-Prop $rep 'processCleanup.items')
        $toolItem = @($items | Where-Object { $_.name -eq 'process-reinterpret-tool' })
        Assert-That 'reinterpret-tool-hold' '파이프를 붙잡는 도구: 종료 60, 관측 불성립(REINTERPRETATION_FAILED), 사유 PIPE_NOT_CLOSED — 성공으로 세지 않는다' ($r.exit -eq 60 -and (Get-Prop $rep 'observation.established') -eq $false -and (Get-Prop $rep 'observation.failure') -eq 'REINTERPRETATION_FAILED' -and (Get-Prop $rep 'reinterpretation.reason') -eq 'PIPE_NOT_CLOSED' -and (Get-Prop $rep 'reinterpretation.status') -eq 'FAILED') "exit=$($r.exit) reason=$(Get-Prop $rep 'reinterpretation.reason')`n$($r.out)"
        Assert-That 'reinterpret-tool-hold' '도구 정리는 따로 기록된다: 자손을 끝냈고(TERMINATED, ok) 프로세스 정리 묶음에 process-reinterpret-tool 항목이 있다' ($toolItem.Count -eq 1 -and $toolItem[0].ok -eq $true -and (Get-Prop $rep 'reinterpretation.tool.cleanup.outcome') -eq 'TERMINATED' -and (Get-Prop $rep 'reinterpretation.tool.cleanup.jobActiveAfter') -eq 0 -and $held.Count -eq 0) "held=$($held.Count) item=$(($toolItem | ConvertTo-Json -Depth 3 -Compress))"
        Assert-That 'reinterpret-tool-hold' '관측 실패가 정리 결과를 바꾸지 않는다: 프로세스 정리·시스템 복구는 ok, 계정은 꺼졌고 감사 값은 복구됐으며 보고서 도구 요약에 닫힘 상태가 있다' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true -and (Get-UserEnabled $sb) -eq $false -and (Get-AuditValue $sb) -eq $auditBefore -and (Get-Prop $rep 'reinterpretation.tool.exited') -eq $true -and (Get-Prop $rep 'reinterpretation.tool.stdoutClosed') -eq $false)
        foreach ($h in $held) { Stop-Process -Id ([int]$h.ProcessId) -Force -ErrorAction SilentlyContinue }
        [void](Remove-Stragglers $sb)
        # (2) 도구 뒤처리가 실패했다고 가정한 합성 결과: 프로세스 정리가 불완전이므로 종료 70, 시스템 복구는 그대로 ok, 관측은 성립하지 않는다.
        $sb = New-LspSandbox @{ reinterpret = 'cleanup-fail' }
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        $toolItem = @(@(Get-Prop $rep 'processCleanup.items') | Where-Object { $_.name -eq 'process-reinterpret-tool' })
        Assert-That 'reinterpret-tool-cleanup-fail' '(합성) 도구 정리 실패: 종료 70, 최종 상태 CLEANUP_INCOMPLETE, processCleanup.ok=false, systemRecovery.ok=true, 관측은 성립하지 않는다' ($r.exit -eq 70 -and (Get-Prop $rep 'finalStatus') -eq 'CLEANUP_INCOMPLETE' -and (Get-Prop $rep 'processCleanup.ok') -eq $false -and (Get-Prop $rep 'systemRecovery.ok') -eq $true -and (Get-Prop $rep 'observation.established') -eq $false) "exit=$($r.exit) final=$(Get-Prop $rep 'finalStatus')`n$($r.out)"
        Assert-That 'reinterpret-tool-cleanup-fail' '(합성) 실패한 항목이 process-reinterpret-tool 로 남고 오류 문구가 있다' ($toolItem.Count -eq 1 -and $toolItem[0].ok -eq $false -and [string]$toolItem[0].error -match 'PROCESSES_REMAIN')
        [void](Remove-Stragglers $sb)
    }
}

# ── 수신기 적중·읽기 실패·중단 전달 ────────────────────────────────────────
if (Test-Selected 'receiver') {
    Write-Host '[receiver] 적중이면 중단 파일을 전달하고, 읽기 실패와 전달 실패도 기록한다'
    # 적중
    $sb = New-LspSandbox @{ loopbackHit = $true }
    $r = Invoke-Lsp $sb -StubScenario 'silent-hold'
    $rep = Get-LspReport $sb
    $flagText = ''; $flag = Join-Path $sb.WorkDir 'work\lsp-min-abort.flag'; if (Test-Path -LiteralPath $flag) { $flagText = ([IO.File]::ReadAllText($flag)).Trim() }
    Assert-That 'receiver' '적중: 종료 60, 수신기 건수가 늘었다' ($r.exit -eq 60 -and (Get-Prop $rep 'receiver.finalHits') -ge 1 -and (Get-Prop $rep 'osBlockObservation.loopbackHits') -ge 1) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'receiver' '적중: 중단 파일 A3:RECEIVER_HIT 가 전달됐다' ($flagText -eq 'A3:RECEIVER_HIT' -and (Get-Prop $rep 'supervisor.abortFile.delivered') -eq $true -and (Get-Prop $rep 'supervisor.abortReason') -eq 'A3:RECEIVER_HIT') "flag=$flagText"
    Assert-That 'receiver' '적중: 러너가 중단 조건 A3 로 곧바로 끝냈다(관리자가 직접 죽이지 않았다)' ($toolsReady -eq $false -or ((Get-Prop $rep 'observation.recordStatus') -eq 'ABORTED' -and (Get-Prop $rep 'supervisor.forcedKill') -eq $false)) "record=$(Get-Prop $rep 'observation.recordStatus') forced=$(Get-Prop $rep 'supervisor.forcedKill')"
    Assert-That 'receiver' '적중: 실패 토큰에 RECEIVER_HIT, 관측 불성립, 정리는 완료' ((@(Get-Prop $rep 'observation.failures') -contains 'RECEIVER_HIT') -and (Get-Prop $rep 'observation.established') -eq $false -and (Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true)
    [void](Remove-Stragglers $sb)
    # 러너가 시작하기도 전에 수신기에 연결이 들어온 경우: 중단 파일이 먼저 생겨서 러너가 시작을 거절한다(자식을 띄우지 않는다)
    $sb = New-LspSandbox @{ loopbackHit = 'early' }
    $r = Invoke-Lsp $sb -StubScenario 'silent-hold' -Limits $FASTLIM
    $rep = Get-LspReport $sb
    Assert-That 'receiver-early' '러너 시작 전 적중: 러너가 ABORT_FILE_ALREADY_PRESENT 로 시작을 거절하고 자식을 띄우지 않는다' ($r.exit -eq 60 -and (@(Get-Prop $rep 'runnerResult.refusals') -contains 'ABORT_FILE_ALREADY_PRESENT') -and (Get-Prop $rep 'runnerResult.trigger') -eq $null) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'receiver-early' '러너 시작 전 적중: 토큰 RUNNER_REFUSED·RECEIVER_HIT, 관측 불성립, 정리 완료' ((@(Get-Prop $rep 'observation.failures') -contains 'RUNNER_REFUSED') -and (@(Get-Prop $rep 'observation.failures') -contains 'RECEIVER_HIT') -and (Get-Prop $rep 'observation.established') -eq $false -and (Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true)
    [void](Remove-Stragglers $sb)
    # 읽기 실패
    $sb = New-LspSandbox @{ receiverFailAfter = 2 }
    $r = Invoke-Lsp $sb -StubScenario 'silent-hold'
    $rep = Get-LspReport $sb
    Assert-That 'receiver' '읽기 실패: 폴러 실패가 기록되고 최종 건수는 0 이 아니라 null 이다' ($r.exit -eq 60 -and (Get-Prop $rep 'receiver.failures') -ge 1 -and $null -eq (Get-Prop $rep 'receiver.finalHits') -and (@(Get-Prop $rep 'observation.failures') -contains 'RECEIVER_UNREADABLE')) "exit=$($r.exit) final=$(Get-Prop $rep 'receiver.finalHits')"
    Assert-That 'receiver' '읽기 실패: 중단 A3:RECEIVER_UNREADABLE 이 전달됐다' ((Get-Prop $rep 'supervisor.abortReason') -eq 'A3:RECEIVER_UNREADABLE' -and (Get-Prop $rep 'supervisor.abortFile.delivered') -eq $true)
    Assert-That 'receiver' '읽기 실패: 루프백 건수도 null(0 으로 채우지 않는다)' ($null -eq (Get-Prop $rep 'osBlockObservation.loopbackHits'))
    [void](Remove-Stragglers $sb)
    # 중단 파일 전달 실패
    $sb = New-LspSandbox @{ loopbackHit = $true; abortWriteFails = $true }
    $r = Invoke-Lsp $sb -StubScenario 'silent-hold'
    $rep = Get-LspReport $sb
    Assert-That 'receiver' '전달 실패: 실패가 기록되고 관리자가 전용 계정 프로세스를 직접 끝냈다' ($r.exit -eq 60 -and (Get-Prop $rep 'supervisor.abortFile.delivered') -eq $false -and (Get-Prop $rep 'supervisor.forcedKill') -eq $true -and (Get-Prop $rep 'supervisor.forcedKillReason') -eq 'ABORT_DELIVERY_FAILED') "exit=$($r.exit)`n$($r.out)"
    Assert-That 'receiver' '전달 실패: 토큰 ABORT_DELIVERY_FAILED·SUPERVISOR_FORCED_KILL·RECEIVER_HIT 가 모두 남는다' ((@(Get-Prop $rep 'observation.failures') -contains 'ABORT_DELIVERY_FAILED') -and (@(Get-Prop $rep 'observation.failures') -contains 'SUPERVISOR_FORCED_KILL') -and (@(Get-Prop $rep 'observation.failures') -contains 'RECEIVER_HIT'))
    Assert-That 'receiver' '전달 실패: 그래도 정리는 끝났다' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true -and (Remove-Stragglers $sb) -eq 0)
}

# ── 취소 ──────────────────────────────────────────────────────────────────
if (Test-Selected 'cancel') {
    Write-Host '[cancel] 취소 표지가 생기면 중단을 전달하고 정리로 간다'
    $sb = New-Sandbox -Scenario @{ lsp = @{} }
    # 취소 표지 경로는 샌드박스 루트에 있다: 모의가 러너를 띄운 직후 만든다.
    $sc = @{ lsp = @{ cancelFile = (Join-Path $sb.Root 'cancel.flag') } }
    [IO.File]::WriteAllText($sb.ScenarioFile, ($sc | ConvertTo-Json -Depth 4), $Utf8)
    $ap = Invoke-Apply $sb
    $r = Invoke-Lsp $sb -StubScenario 'silent-hold'
    $rep = Get-LspReport $sb
    Assert-That 'cancel' '종료 60, 중단 A7:OPERATOR_CANCEL 이 전달됐고 토큰 OPERATOR_CANCELLED' ($ap.exit -eq 0 -and $r.exit -eq 60 -and (Get-Prop $rep 'supervisor.abortReason') -eq 'A7:OPERATOR_CANCEL' -and (Get-Prop $rep 'supervisor.abortFile.delivered') -eq $true -and (@(Get-Prop $rep 'observation.failures') -contains 'OPERATOR_CANCELLED')) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'cancel' '정리는 완료' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true -and (Remove-Stragglers $sb) -eq 0)
}

# ── 러너 정체(감독 경로) ──────────────────────────────────────────────────
if (Test-Selected 'hang') {
    Write-Host '[hang] 러너가 매달려도 관측 마감에 중단을 요청하고 정리로 넘어간다(진짜 정지 스텁 프로세스)'
    $sb = New-LspSandbox @{ runner = 'hang-real' }
    $t0 = [DateTime]::UtcNow
    $r = Invoke-Lsp $sb -Limits $FASTLIM
    $secs = ([DateTime]::UtcNow - $t0).TotalSeconds
    $rep = Get-LspReport $sb
    $runnerPid = [int](Get-Prop (@(Get-Prop $rep 'processes')[0]) 'processId')
    $flag = Join-Path $sb.WorkDir 'work\lsp-min-abort.flag'; $flagText = ''; if (Test-Path -LiteralPath $flag) { $flagText = ([IO.File]::ReadAllText($flag)).Trim() }
    Assert-That 'hang' '종료 60, 결과 파일이 없으므로 RUNNER_NO_RESULT 로 관측 실패' ($r.exit -eq 60 -and (Get-Prop $rep 'observation.failure') -eq 'RUNNER_NO_RESULT' -and (Get-Prop $rep 'binding.resultState') -eq 'NONE') "exit=$($r.exit)`n$($r.out)"
    Assert-That 'hang' '관측 마감(기동 허용 + totalMs)에 중단을 요청했다: A7:SUPERVISOR_DEADLINE 가 파일로 전달됐다' ($flagText -eq 'A7:SUPERVISOR_DEADLINE' -and (Get-Prop $rep 'supervisor.deadlineReached') -eq $true -and (Get-Prop $rep 'supervisor.abortFile.delivered') -eq $true)
    Assert-That 'hang' '유예 뒤에도 러너가 있어 전용 계정 프로세스를 직접 끝냈다(SUPERVISOR_DEADLINE)' ((Get-Prop $rep 'supervisor.forcedKill') -eq $true -and (Get-Prop $rep 'supervisor.forcedKillReason') -eq 'ABORT_NOT_FOLLOWED:A7:SUPERVISOR_DEADLINE' -and (@(Get-Prop $rep 'supervisor.killTargets')) -contains $runnerPid)
    Assert-That 'hang' '진짜 정지 스텁이 실제로 끝났다' ($null -eq (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue))
    Assert-That 'hang' '시간이 마감 계산 안에 든다(7초 마감 + 유예 + 안정 시간)' ($secs -lt 60 -and (Get-Prop $rep 'supervisor.elapsedAtEndMs') -ge 7000) "secs=$secs elapsed=$(Get-Prop $rep 'supervisor.elapsedAtEndMs')"
    Assert-That 'hang' '토큰 RUNNER_NO_RESULT·SUPERVISOR_FORCED_KILL·SUPERVISOR_DEADLINE_ABORT' ((@(Get-Prop $rep 'observation.failures') -contains 'SUPERVISOR_FORCED_KILL') -and (@(Get-Prop $rep 'observation.failures') -contains 'SUPERVISOR_DEADLINE_ABORT'))
    Assert-That 'hang' '복구는 계속됐다: 프로세스 정리·시스템 복구 모두 ok, 계정 비활성화, 감사 복구' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true -and (Get-UserEnabled $sb) -eq $false -and (Get-AuditValue $sb) -eq 0)
    [void](Remove-Stragglers $sb)
}

# ── 결과 누락·손상·재사용 ───────────────────────────────────────────────────
if (Test-Selected 'result') {
    Write-Host '[result] 결과 누락·손상·이전 결과 재사용은 관측 실패이고 복구는 계속한다'
    foreach ($c in @(
            @{ id = 'missing'; knob = @{ runner = 'none' }; token = 'RUNNER_NO_RESULT'; state = 'NONE' },
            @{ id = 'corrupt'; knob = @{ runner = 'corrupt' }; token = 'RESULT_UNREADABLE'; state = 'UNREADABLE' },
            @{ id = 'stale'; knob = @{ runner = 'stale' }; token = 'RESULT_BINDING_FAILED'; state = 'TOKEN_MISMATCH' })) {
        $sb = New-LspSandbox $c.knob
        $r = Invoke-Lsp $sb -Limits $FASTLIM
        $rep = Get-LspReport $sb
        Assert-That "result-$($c.id)" "종료 60, 주 토큰 $($c.token), 결과 상태 $($c.state)" ($r.exit -eq 60 -and (Get-Prop $rep 'observation.failure') -eq $c.token -and (Get-Prop $rep 'binding.resultState') -eq $c.state) "exit=$($r.exit) failure=$(Get-Prop $rep 'observation.failure') state=$(Get-Prop $rep 'binding.resultState')`n$($r.out)"
        Assert-That "result-$($c.id)" '관측 성립 아님, 정리는 완료(복구 계속)' ((Get-Prop $rep 'observation.established') -eq $false -and (Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true -and (Get-UserEnabled $sb) -eq $false -and (Get-AuditValue $sb) -eq 0)
        Assert-That "result-$($c.id)" '신원 교차 확인도 통과로 치지 않는다' ((Get-Prop $rep 'identity.ok') -eq $false)
        if ($c.id -eq 'stale') { Assert-That 'result-stale' '이전 실행의 토큰은 받아들이지 않았고 판정에 쓰지 않았다' ($null -eq (Get-Prop $rep 'runnerResult')) }
        [void](Remove-Stragglers $sb)
    }
}

# ── 신원·결합 불일치(결과의 자기 보고만 믿지 않는다) ─────────────────────────
if (Test-Selected 'identity') {
    Write-Host '[identity] 관리자 CIM 과 러너 자기 보고가 어긋나면 관측은 성립하지 않는다'
    if (-not $toolsReady) { Skip-That 'identity' '재해석 도구가 없어도 신원 코드는 확인할 수 있지만 판정 전체는 도구가 필요하다: 신원 코드만 확인한다' }
    $alt = 'S-1-5-21-9-9-9-9'
    $cases = @(
        @{ id = 'child-owner'; knob = @{ identity = @{ role = 'child'; field = 'ownerSid'; value = $alt } }; code = 'CHILD_OWNER_MISMATCH' },
        @{ id = 'runner-owner'; knob = @{ identity = @{ role = 'runner'; field = 'ownerSid'; value = $alt } }; code = 'RUNNER_OWNER_MISMATCH' },
        @{ id = 'child-exe'; knob = @{ identity = @{ role = 'child'; field = 'exePath'; value = 'C:\Evil\other.exe' } }; code = 'CHILD_EXE_MISMATCH'; also = 'DESCENDANT_PATH_UNEXPECTED' },
        @{ id = 'child-cmdline'; knob = @{ identity = @{ role = 'child'; field = 'commandLine'; value = 'C:\x.exe --other' } }; code = 'CHILD_COMMANDLINE_MISMATCH' },
        @{ id = 'child-start'; knob = @{ identity = @{ role = 'child'; field = 'startShiftSec'; value = 30 } }; code = 'CHILD_START_MISMATCH' },
        @{ id = 'runner-exe'; knob = @{ identity = @{ role = 'runner'; field = 'exePath'; value = 'C:\Evil\ps.exe' } }; code = 'RUNNER_EXE_MISMATCH' },
        @{ id = 'self-sid'; knob = @{ resultEdit = @{ set = @(@{ path = 'runner.sid'; value = $alt }) } }; code = 'SELF_SID_MISMATCH' },
        @{ id = 'self-pid'; knob = @{ resultEdit = @{ set = @(@{ path = 'runner.pid'; value = 1 }) } }; code = 'SELF_PID_MISMATCH' },
        @{ id = 'child-mainmodule'; knob = @{ resultEdit = @{ set = @(@{ path = 'child.mainModule'; value = 'C:\x\other.exe' }) } }; code = 'CHILD_MAINMODULE_MISMATCH' })
    foreach ($c in $cases) {
        $sb = New-LspSandbox $c.knob
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        $codes = @(Get-Prop $rep 'identity.failures' | ForEach-Object { $_.code })
        Assert-That "identity-$($c.id)" "코드 $($c.code) 로 신원 교차 확인 실패, 종료 60, 관측 불성립" ($r.exit -eq 60 -and $codes -contains $c.code -and (Get-Prop $rep 'identity.ok') -eq $false -and (Get-Prop $rep 'observation.established') -eq $false -and (@(Get-Prop $rep 'observation.failures') -contains 'IDENTITY_UNVERIFIED')) "exit=$($r.exit) codes=$($codes -join ',')`n$($r.out)"
        if ($c.ContainsKey('also')) { Assert-That "identity-$($c.id)" "허용 폴더 밖 후손도 $($c.also) 로 남는다" (@(Get-Prop $rep 'observation.failures') -contains $c.also) }
        if ($toolsReady) { Assert-That "identity-$($c.id)" '재해석 기록도 관리자 신원 사유로 NOT_OBSERVED' ((Get-Prop $rep 'reinterpretation.recordStatus') -eq 'NOT_OBSERVED' -and (@(Get-Prop $rep 'reinterpretation.statusReasons') -contains 'ADMIN_IDENTITY_UNVERIFIED')) }
        Assert-That "identity-$($c.id)" '정리는 완료' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true)
        [void](Remove-Stragglers $sb)
    }
    Write-Host '[binding] 결과가 요청과 맞지 않으면 결합 실패'
    $bcases = @(
        @{ id = 'mode'; edit = @{ set = @(@{ path = 'mode'; value = 'semgrep-lsp' }) }; code = 'MODE_MISMATCH' },
        @{ id = 'echo-exe'; edit = @{ set = @(@{ path = 'request.exe'; value = 'C:\x.exe' }) }; code = 'ECHO_EXE' },
        @{ id = 'old-start'; edit = @{ set = @(@{ path = 'startedUtc'; value = '2020-01-01T00:00:00.0000000Z' }) }; code = 'STARTED_BEFORE_LAUNCH' },
        @{ id = 'no-echo'; edit = @{ unset = @('request') }; code = 'ECHO_MISSING' })
    foreach ($c in $bcases) {
        $sb = New-LspSandbox @{ resultEdit = $c.edit }
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        Assert-That "binding-$($c.id)" "결합 실패 $($c.code), 종료 60" ($r.exit -eq 60 -and (@(Get-Prop $rep 'binding.failures') -contains $c.code) -and (Get-Prop $rep 'binding.ok') -eq $false -and (@(Get-Prop $rep 'observation.failures') -contains 'RESULT_BINDING_FAILED')) "exit=$($r.exit) failures=$(@(Get-Prop $rep 'binding.failures') -join ',')`n$($r.out)"
        [void](Remove-Stragglers $sb)
    }
    $sb = New-LspSandbox @{ resultEdit = @{ set = @(@{ path = 'runToken'; value = 'lsp-20200101T000000Z-00000000-' + ('0' * 32) }) } }
    $r = Invoke-Lsp $sb
    $rep = Get-LspReport $sb
    Assert-That 'binding-token' '러너가 다른 토큰을 되돌려 쓰면 받아들이지 않는다(TOKEN_MISMATCH)' ($r.exit -eq 60 -and (Get-Prop $rep 'binding.resultState') -eq 'TOKEN_MISMATCH' -and (@(Get-Prop $rep 'binding.failures') -contains 'TOKEN_MISMATCH')) "exit=$($r.exit)`n$($r.out)"
    [void](Remove-Stragglers $sb)
}

# ── 러너가 다룬 스텁 서버 변종(진짜 러너 + 재해석) ───────────────────────────
if (Test-Selected 'stub-variants') {
    Write-Host '[stub-variants] 정상이 아닌 서버 동작은 관측 불성립이고 정리는 끝난다'
    if (-not $toolsReady) { Skip-That 'stub-variants' '재해석 도구가 필요하다' }
    else {
        foreach ($c in @(
                @{ id = 'error'; scn = 'error'; status = 'NOT_OBSERVED' },
                @{ id = 'initialize-error'; scn = 'initialize-error'; status = 'NOT_OBSERVED' },
                @{ id = 'ignore-exit-eof'; scn = 'ignore-exit-eof'; status = 'NOT_OBSERVED' },
                @{ id = 'spawn-disallowed'; scn = 'spawn-disallowed'; status = 'ABORTED' },
                @{ id = 'stderr-scan'; scn = 'stderr-scan'; status = 'ABORTED' })) {
            $sb = New-LspSandbox
            $r = Invoke-Lsp $sb -StubScenario $c.scn -Limits $FASTLIM
            $rep = Get-LspReport $sb
            Assert-That "stub-$($c.id)" "기록 상태 $($c.status), 종료 60, 관측 불성립" ($r.exit -eq 60 -and (Get-Prop $rep 'observation.recordStatus') -eq $c.status -and (Get-Prop $rep 'observation.established') -eq $false) "exit=$($r.exit) status=$(Get-Prop $rep 'observation.recordStatus') failures=$(@(Get-Prop $rep 'observation.failures') -join ',')`n$($r.out)"
            Assert-That "stub-$($c.id)" '정리 완료' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true)
            [void](Remove-Stragglers $sb)
        }
    }
}

# ── 정리 부분 실패: 관측·프로세스 정리·시스템 복구는 서로를 바꾸지 않는다 ──────────
if (Test-Selected 'cleanup') {
    Write-Host '[cleanup] 정리 항목 하나의 실패가 뒤의 복구를 멈추지 않고, 관측 결과도 바꾸지 않는다'
    if ($toolsReady) {
        $sb = New-LspSandbox @{ disableUserFails = $true }
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        $audit = @(Get-Prop $rep 'systemRecovery.items' | Where-Object { $_.name -like 'audit-restore*' })
        Assert-That 'cleanup-account' '계정 비활성화 실패: 종료 70, 시스템 복구 ok=false, 프로세스 정리 ok' ($r.exit -eq 70 -and (Get-Prop $rep 'systemRecovery.ok') -eq $false -and (Get-Prop $rep 'processCleanup.ok') -eq $true) "exit=$($r.exit)`n$($r.out)"
        Assert-That 'cleanup-account' '관측 결과는 그대로 성립(정리 실패가 덮어쓰지 않는다)' ((Get-Prop $rep 'observation.established') -eq $true -and (Get-Prop $rep 'verdict') -eq 'STUB_LSP_MIN_OBSERVED')
        Assert-That 'cleanup-account' '뒤의 감사 복구는 계속 실행돼 값이 복구됐다' ($audit.Count -ge 1 -and $audit[0].ok -eq $true -and (Get-AuditValue $sb) -eq 0)
        [void](Remove-Stragglers $sb)
        $sb = New-LspSandbox @{ auditSetFailInClose = $true }
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        $acc = @(Get-Prop $rep 'systemRecovery.items' | Where-Object { $_.name -eq 'account-disable' })
        Assert-That 'cleanup-audit' '감사 복구 실패: 종료 70, 시스템 복구 ok=false, 계정은 비활성화됨' ($r.exit -eq 70 -and (Get-Prop $rep 'systemRecovery.ok') -eq $false -and $acc.Count -eq 1 -and $acc[0].ok -eq $true -and (Get-UserEnabled $sb) -eq $false) "exit=$($r.exit)`n$($r.out)"
        Assert-That 'cleanup-audit' '관측 결과는 그대로 성립' ((Get-Prop $rep 'observation.established') -eq $true)
        [void](Remove-Stragglers $sb)
    } else { Skip-That 'cleanup-account/audit' '관측 성립을 전제로 하는 사례라 재해석 도구가 필요하다' }
    $sb = New-LspSandbox @{ runner = 'hang-real'; stopProcessFails = $true }
    $r = Invoke-Lsp $sb -Limits $FASTLIM
    $rep = Get-LspReport $sb
    $runnerPid = [int](Get-Prop (@(Get-Prop $rep 'processes')[0]) 'processId')
    $aliveAtEnd = [bool](Get-Process -Id $runnerPid -ErrorAction SilentlyContinue)
    Assert-That 'cleanup-process' '프로세스 정리 실패(종료 호출이 듣지 않음): 종료 70, 프로세스 정리 ok=false, 시스템 복구 ok=true' ($r.exit -eq 70 -and (Get-Prop $rep 'processCleanup.ok') -eq $false -and (Get-Prop $rep 'systemRecovery.ok') -eq $true -and $aliveAtEnd) "exit=$($r.exit) alive=$aliveAtEnd`n$($r.out)"
    Assert-That 'cleanup-process' '프로세스 정리가 실패해도 계정 비활성화·감사 복구는 실행됐다' ((Get-UserEnabled $sb) -eq $false -and (Get-AuditValue $sb) -eq 0)
    # 일부러 살려 둔 시험용 정지 스텁을 시험이 직접 끝내고, 정말 사라졌는지 확인한다(명령줄에 샌드박스 경로가 있어 Remove-Stragglers 가 찾는다).
    Assert-That 'cleanup-process' '남아 있던 시험용 프로세스를 시험이 실제로 끝냈다(끝내기 전에는 살아 있었다)' ($aliveAtEnd -and ((Remove-Stragglers $sb) -ge 1) -and ($null -eq (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue)))
}

# ── 5157(OS 차단 이벤트): 귀속·식별 불가·수집 실패·로그 밀림·감사 미확인이 판정과 건수에 어떻게 반영되는가 ─────────────────
if (Test-Selected 'os-block') {
    Write-Host '[os-block] 5157 은 판정에 반영되고, 불확실하면 0 으로 채우지 않는다'
    $osCases = @(
        @{ id = 'attributed'; lsp = @{ events = 'matching' }; top = @{}; usable = $true; attr = 1; token = 'OS_BLOCK_ATTRIBUTED'; adminReason = 'ADMIN_OS_BLOCK_ATTRIBUTED' },
        @{ id = 'readfail'; lsp = @{ events = 'readFail' }; top = @{}; usable = $false; attr = $null; token = 'OS_BLOCK_EVIDENCE_UNAVAILABLE'; why = 'COLLECTION_FAILED'; adminReason = 'ADMIN_OS_BLOCK_UNCONFIRMED' },
        @{ id = 'wrapped'; lsp = @{}; top = @{ securityAfter = @{ oldest = 5000 } }; usable = $false; attr = $null; token = 'OS_BLOCK_EVIDENCE_UNAVAILABLE'; why = 'LOG_WRAPPED_OR_UNKNOWN'; adminReason = 'ADMIN_OS_BLOCK_UNCONFIRMED' },
        @{ id = 'audit-unconfirmed'; lsp = @{ auditReadFailInEvidenceCheck = $true }; top = @{}; usable = $false; attr = $null; token = 'OS_BLOCK_EVIDENCE_UNAVAILABLE'; why = 'AUDIT_NOT_CONFIRMED'; adminReason = 'ADMIN_OS_BLOCK_UNCONFIRMED' })
    foreach ($c in $osCases) {
        $sb = New-LspSandbox $c.lsp $c.top
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        Assert-That "os-$($c.id)" "종료 60, 관측 불성립, 토큰 $($c.token)" ($r.exit -eq 60 -and (Get-Prop $rep 'observation.established') -eq $false -and (@(Get-Prop $rep 'observation.failures') -contains $c.token)) "exit=$($r.exit) failures=$(@(Get-Prop $rep 'observation.failures') -join ',')`n$($r.out)"
        Assert-That "os-$($c.id)" "건수 사용 가능 여부 $($c.usable)" ((Get-Prop $rep 'osBlockObservation.countsUsable') -eq $c.usable)
        if ($c.usable) { Assert-That "os-$($c.id)" '귀속된 건수가 1 이고 이벤트 요약이 있다' ((Get-Prop $rep 'osBlockObservation.attributedCount') -eq $c.attr -and @(Get-Prop $rep 'osBlockObservation.attributed').Count -eq 1) }
        else { Assert-That "os-$($c.id)" "0 으로 채우지 않는다: 귀속·식별 불가 건수는 null 이고 사유 $($c.why) 가 남는다" ($null -eq (Get-Prop $rep 'osBlockObservation.attributedCount') -and $null -eq (Get-Prop $rep 'osBlockObservation.unidentifiedCount') -and (@(Get-Prop $rep 'osBlockObservation.unusableBecause') -contains $c.why)) "because=$(@(Get-Prop $rep 'osBlockObservation.unusableBecause') -join ',')" }
        if ($toolsReady) { Assert-That "os-$($c.id)" "TS 재해석 기록도 $($c.adminReason) 로 NOT_OBSERVED" ((Get-Prop $rep 'reinterpretation.recordStatus') -eq 'NOT_OBSERVED' -and (@(Get-Prop $rep 'reinterpretation.statusReasons') -contains $c.adminReason)) "reasons=$(@(Get-Prop $rep 'reinterpretation.statusReasons') -join ',')" }
        Assert-That "os-$($c.id)" '정리는 완료' ((Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true)
        [void](Remove-Stragglers $sb)
    }
    # 식별 불가 이벤트(시스템 프로세스의 UDP 등)는 관측을 막지 않고 건수만 따로 적는다.
    if ($toolsReady) {
        $sb = New-LspSandbox @{ events = 'unrelated' }
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        Assert-That 'os-unidentified' '식별 불가 1건은 관측을 막지 않는다: 성립, 귀속 0, 식별 불가 1' ($r.exit -eq 0 -and (Get-Prop $rep 'observation.established') -eq $true -and (Get-Prop $rep 'osBlockObservation.attributedCount') -eq 0 -and (Get-Prop $rep 'osBlockObservation.unidentifiedCount') -eq 1) "exit=$($r.exit) attr=$(Get-Prop $rep 'osBlockObservation.attributedCount') unid=$(Get-Prop $rep 'osBlockObservation.unidentifiedCount')`n$($r.out)"
        [void](Remove-Stragglers $sb)
    } else { Skip-That 'os-unidentified' '관측 성립 경로라 재해석 도구가 필요하다' }
}

# ── 이전 실행의 작업 배치: 관리자 권한 삭제 전에 링크를 확인한다 ──────────────────────
if (Test-Selected 'old-layout') {
    Write-Host '[old-layout] 이전 작업 배치의 일반 파일은 지우고, 정션·링크가 있으면 지우지 않고 멈춘다'
    # 정션이 있으면 지우지 않는다: 대상 폴더의 파일이 그대로여야 한다.
    $sb = New-LspSandbox
    $lspDir = Join-Path $sb.WorkDir 'work\lsp'
    $decoy = Join-Path $sb.Root 'decoy'; [void][IO.Directory]::CreateDirectory($decoy); [IO.File]::WriteAllText((Join-Path $decoy 'keep.txt'), 'must survive', $Utf8)
    [void][IO.Directory]::CreateDirectory($lspDir)
    $junction = Join-Path $lspDir 'x'
    New-Item -ItemType Junction -Path $junction -Target $decoy | Out-Null
    $log0 = (Get-CallsLog $sb).Split("`n").Count
    $r = Invoke-Lsp $sb
    $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
    $kept = Test-Path -LiteralPath (Join-Path $decoy 'keep.txt')
    [IO.Directory]::Delete($junction)         # 링크만 지운다
    Assert-That 'old-layout-junction' '사전 조건 T08 실패, 종료 50' ($r.exit -eq 50 -and $r.out -match '\[FAIL\] T08 ') "exit=$($r.exit)`n$($r.out)"
    Assert-That 'old-layout-junction' '아무것도 지우지 않았고 계정·감사도 건드리지 않았다(대상 파일이 그대로)' ($kept -and $new -notmatch 'Remove-Item|Enable-LocalUser|Invoke-AuditPol /set|LspRunner')
    # 정션 없이 일반 파일만 있으면 지우고 정상으로 간다(러너는 감시 폴더가 비어 있어야 시작한다).
    if ($toolsReady) {
        $sb = New-LspSandbox
        $stale = Join-Path $sb.WorkDir 'work\lsp\ws'; [void][IO.Directory]::CreateDirectory($stale); [IO.File]::WriteAllText((Join-Path $stale 'stale.txt'), 'old', $Utf8)
        $r = Invoke-Lsp $sb
        $rep = Get-LspReport $sb
        Assert-That 'old-layout-files' '이전 배치의 일반 파일은 지워지고 관측이 성립한다' ($r.exit -eq 0 -and (Get-Prop $rep 'observation.established') -eq $true -and -not (Test-Path -LiteralPath (Join-Path $stale 'stale.txt'))) "exit=$($r.exit)`n$($r.out)"
        [void](Remove-Stragglers $sb)
    } else { Skip-That 'old-layout-files' '관측 성립 경로라 재해석 도구가 필요하다' }
}

# ── 작업 경로의 상위 링크: 신뢰 루트부터 목적지까지 확인하고, 문제가 있으면 아무것도 바꾸기 전에 거절한다 ──
if (Test-Selected 'work-chain') {
    Write-Host '[work-chain] 상위 work 폴더·lsp·기존 복사 목적지가 링크면 계정 켜기·감사 변경·러너 실행·삭제·복사 없이 거절한다'
    $wcCases = @(
        @{ id = 'work-junction'; make = { param($sb, $out) New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work')) } },
        @{ id = 'lsp-junction'; make = { param($sb, $out) [void][IO.Directory]::CreateDirectory((Join-Path $sb.WorkDir 'work')); New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work\lsp') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work\lsp')) } },
        @{ id = 'copy-dest-junction'; make = { param($sb, $out) [void][IO.Directory]::CreateDirectory((Join-Path $sb.WorkDir 'work')); New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work\version-runner.ps1') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work\version-runner.ps1')) } },
        @{ id = 'request-dest-junction'; make = { param($sb, $out) [void][IO.Directory]::CreateDirectory((Join-Path $sb.WorkDir 'work')); New-Item -ItemType Junction -Path (Join-Path $sb.WorkDir 'work\lsp-min-request.json') -Target $out | Out-Null }; unlink = { param($sb) [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work\lsp-min-request.json')) } })
    foreach ($c in $wcCases) {
        $sb = New-LspSandbox
        $out = Join-Path $sb.Root 'outside'; [void][IO.Directory]::CreateDirectory((Join-Path $out 'lsp')); [IO.File]::WriteAllText((Join-Path $out 'keep.txt'), 'must survive', $Utf8); [IO.File]::WriteAllText((Join-Path $out 'lsp\inner.txt'), 'inner', $Utf8)
        & $c.make $sb $out
        $print0 = Get-TreePrint $out
        $fake0 = [IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json'))
        $log0 = (Get-CallsLog $sb).Split("`n").Count
        $rx = Invoke-Lsp $sb
        $rd = Invoke-Lsp $sb -Dry
        $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
        $print1 = Get-TreePrint $out
        $rep = Get-LspReport $sb
        $linkStillThere = $true
        try { & $c.unlink $sb } catch { $linkStillThere = $false }
        Assert-That "work-chain-$($c.id)" '-Execute 도 dry-run 도 사전 조건 T08 실패, 종료 50' ($rx.exit -eq 50 -and $rx.out -match '\[FAIL\] T08 ' -and $rd.exit -eq 50 -and $rd.out -match '\[FAIL\] T08 ') "exec=$($rx.exit) dry=$($rd.exit)`n$($rx.out)"
        Assert-That "work-chain-$($c.id)" '링크 대상 폴더의 파일·목록·바이트가 거절 전후로 같다(삭제·복사·쓰기가 대상으로 새지 않았다)' ($print0 -eq $print1 -and $print1 -ne 'ABSENT') "before=$print0`nafter=$print1"
        Assert-That "work-chain-$($c.id)" '계정 켜기·감사 변경·러너 실행·프로세스 시작·종료가 없고 모의 상태(계정·규칙·감사·ACL)가 그대로다' ($new -notmatch 'Enable-LocalUser|Disable-LocalUser|Invoke-AuditPol /set|LspRunner|Start-Process|Stop-Process' -and [IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json')) -eq $fake0) $new
        Assert-That "work-chain-$($c.id)" '관측 보고서를 만들지 않았다(변경 전 거절)' ($null -eq $rep)
        Assert-That "work-chain-$($c.id)" '링크는 따라가지 않고 링크 자체만 지울 수 있었고, 그 뒤에도 대상은 그대로다' ($linkStillThere -and (Get-TreePrint $out) -eq $print0)
        [void](Remove-Stragglers $sb)
    }

    # 관문 2: 첫 확인과 계정 켜기를 통과한 뒤, 첫 복사·쓰기 직전에 work 가 정션으로 바뀌면 쓰지 않고 멈춘다(정리가 계정·감사를 되돌린다).
    $sb = New-Sandbox -Scenario @{ lsp = @{} }
    $out = Join-Path $sb.Root 'outside'; [void][IO.Directory]::CreateDirectory((Join-Path $out 'lsp')); [IO.File]::WriteAllText((Join-Path $out 'keep.txt'), 'must survive', $Utf8)
    $sc = @{ lsp = @{ swapWorkAfterEnable = @{ work = (Join-Path $sb.WorkDir 'work'); target = $out } } }
    [IO.File]::WriteAllText($sb.ScenarioFile, ($sc | ConvertTo-Json -Depth 6), $Utf8)
    $ap = Invoke-Apply $sb
    if ($ap.exit -ne 0) { throw "적용 단계가 실패했다: $($ap.out)" }
    $auditBefore = Get-AuditValue $sb
    $print0 = Get-TreePrint $out
    $r = Invoke-Lsp $sb
    $rep = Get-LspReport $sb
    $log = Get-CallsLog $sb
    $gates = @(Get-Prop $rep 'workPath.gates')
    $linkGone = $true; try { [IO.Directory]::Delete((Join-Path $sb.WorkDir 'work')) } catch { $linkGone = $false }
    Assert-That 'work-chain-late-swap' '계정을 켠 뒤 work 가 정션으로 바뀌면 판정 NOT_ATTEMPTED:WORK_PATH_UNSAFE, 종료 60' ($r.exit -eq 60 -and (Get-Prop $rep 'verdict') -eq 'NOT_ATTEMPTED:WORK_PATH_UNSAFE' -and (Get-Prop $rep 'observation.failure') -eq 'WORK_PATH_UNSAFE') "exit=$($r.exit) verdict=$(Get-Prop $rep 'verdict')`n$($r.out)"
    Assert-That 'work-chain-late-swap' '관문 1 은 통과(문제 없음), 관문 2 에서 LINK 를 찾았다' ($gates.Count -eq 2 -and @($gates[0].problems).Count -eq 0 -and @(@($gates[1].problems) | Where-Object { $_ -like 'LINK:*' }).Count -ge 1) (($gates | ConvertTo-Json -Depth 5 -Compress))
    Assert-That 'work-chain-late-swap' '러너를 띄우지 않았고 링크 대상 폴더는 파일·목록·바이트가 그대로다(요청 파일·복사본이 새지 않았다)' ($log -notmatch 'LspRunner' -and (Get-TreePrint $out) -eq $print0 -and $linkGone) "log=$log"
    Assert-That 'work-chain-late-swap' '정리는 끝났다: 계정은 다시 꺼졌고 감사 값은 복구됐으며 프로세스 정리·시스템 복구 모두 ok' ((Get-UserEnabled $sb) -eq $false -and (Get-AuditValue $sb) -eq $auditBefore -and (Get-Prop $rep 'processCleanup.ok') -eq $true -and (Get-Prop $rep 'systemRecovery.ok') -eq $true)
    [void](Remove-Stragglers $sb)

    # 정상: 이전 배치가 일반 폴더·일반 파일이면 지우고 관문 둘 다 통과한다. (work 가 아직 없는 경우는 위 workpath 단위 시험이 확인한다. 적용 단계가 work 를 미리 만들어 두기 때문이다.)
    $sb = New-LspSandbox
    $oldDir = Join-Path $sb.WorkDir 'work\lsp\ws\old'; [void][IO.Directory]::CreateDirectory($oldDir); [IO.File]::WriteAllText((Join-Path $oldDir 'x.txt'), 'old', $Utf8); [IO.File]::WriteAllText((Join-Path $sb.WorkDir 'work\lsp-min-result.json'), '{}', $Utf8)
    $r = Invoke-Lsp $sb
    $rep = Get-LspReport $sb
    $gates = @(Get-Prop $rep 'workPath.gates')
    Assert-That 'work-chain-normal' '정상 배치: 사전 조건 T08 통과, 관문 1·2 모두 문제 없음, 이전 일반 파일은 지워졌다' ($r.out -match '\[PASS\] T08 ' -and $gates.Count -eq 2 -and @($gates[0].problems).Count -eq 0 -and @($gates[1].problems).Count -eq 0 -and -not (Test-Path -LiteralPath $oldDir)) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'work-chain-normal' '정상 배치: 보고서에 신뢰 루트와 확인의 한계가 적혀 있다' ((Get-Prop $rep 'workPath.trustedRoot') -eq $sb.WorkDir -and [string](Get-Prop $rep 'workPath.limits') -match '경쟁 상태')
    [void](Remove-Stragglers $sb)
}

# ── 실제 모드: 사전 조건과 거절 ─────────────────────────────────────────────
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
    $h = { param($p) (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }
    $bt = [string][char]96
    $fmt = { param($n) $n.ToString('N0', [Globalization.CultureInfo]::InvariantCulture) }
    $exeH = & $h $exe; $coreH = & $h $core; $wheelH = & $h $wheel
    $text = ("- 이진 파일: {0}semgrep-core.exe{0}($(& $fmt (Get-Item $core).Length)바이트, SHA-256 {0}$coreH{0})`n" -f $bt) + ("- 실행 파일: {0}venv\Scripts\semgrep.exe{0}($(& $fmt (Get-Item $exe).Length)바이트, SHA-256 {0}$exeH{0}), {0}venv\Scripts\pysemgrep.exe{0}(108,455바이트, {0}$('7' * 64){0})`n" -f $bt) + ("| win_amd64 | 58,108,036 | {0}$wheelH{0} | 2026-10-07T23:24:52Z |`n" -f $bt)
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
function Invoke-LspReal {
    param($Sb, $D, [hashtable]$Over = @{}, [switch]$Execute, [string[]]$Extra = @())
    $v = @{ DistRoot = $D.Dist; SemgrepExe = $D.Exe; ExpectedExeSha256 = $D.ExeHash; WheelPath = $D.Wheel; ExpectedWheelSha256 = $D.WheelHash; DistReport = $D.Report }
    foreach ($k in $Over.Keys) { $v[$k] = $Over[$k] }
    $a = @('-RunDir', $Sb.RunDir, '-CancelFile', $Sb.Cancel)
    foreach ($k in $v.Keys) { if ($null -ne $v[$k]) { $a += @("-$k", [string]$v[$k]) } }
    if ($Execute) { $a += '-Execute'; if ($toolsReady) { $a += @('-TsxCmd', $TsxCmd, '-ReinterpretCli', $ReinterpretCli); if ($NodeDir) { $a += @('-NodeDir', $NodeDir) } } }
    Invoke-Entry $Sb 'lsp' 'Test-LspMinObservation.ps1' ($a + $Extra)
}

if (Test-Selected 'real-mode') {
    Write-Host '[real-mode] 설치 경로·전체 해시·배포물 보고서 대조(흉내 설치물, 실행하지 않는다)'
    $sb = New-LspSandbox
    $d = New-FakeDist (Join-Path $sb.Root 'fake')
    Grant-FakeAcl $sb $d
    $fake0 = [IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json'))
    $log0 = (Get-CallsLog $sb).Split("`n").Count
    $r = Invoke-LspReal $sb $d
    $new = ((Get-CallsLog $sb).Split("`n") | Select-Object -Skip ($log0 - 1)) -join "`n"
    Assert-That 'real-mode' '모두 맞으면 dry-run 은 종료 0 이고 사전 조건 L01~L08 이 통과' ($r.exit -eq 0 -and $r.out -match 'NOT_EXECUTED' -and @(@('L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08') | Where-Object { $r.out -notmatch "\[PASS\] $_ " }).Count -eq 0) "exit=$($r.exit)`n$($r.out)"
    Assert-That 'real-mode' 'dry-run 은 상태를 바꾸지 않고 아무것도 실행하지 않는다' ([IO.File]::ReadAllText((Join-Path $sb.Root 'fake-state.json')) -eq $fake0 -and $new -notmatch 'Enable-LocalUser|LspRunner|Start-Process|Invoke-AuditPol /set')
    $variants = @(
        @{ id = 'wrong-path'; over = @{ SemgrepExe = (Join-Path $d.Base 'elsewhere\semgrep.exe') }; fail = 'L01'; pre = { New-Item -ItemType Directory -Path (Join-Path $d.Base 'elsewhere') -Force | Out-Null; Copy-Item -LiteralPath $d.Exe -Destination (Join-Path $d.Base 'elsewhere\semgrep.exe') } },
        @{ id = 'name-only'; over = @{ ExpectedExeSha256 = ('e' * 64) }; fail = 'L03' },
        @{ id = 'wheel-hash'; over = @{ ExpectedWheelSha256 = ('d' * 64) }; fail = 'L04' },
        @{ id = 'core-hash'; over = @{ ExpectedCoreSha256 = ('c' * 64) }; fail = 'L05' },
        @{ id = 'report-missing'; over = @{ DistReport = (Join-Path $d.Base 'no-such-report.md') }; fail = 'L06' })
    foreach ($v in $variants) {
        if ($v.ContainsKey('pre')) { & $v.pre }
        $rr = Invoke-LspReal $sb $d $v.over
        Assert-That "real-$($v.id)" "사전 조건 $($v.fail) 실패, 종료 50, 아무것도 실행하지 않음" ($rr.exit -eq 50 -and $rr.out -match "\[FAIL\] $($v.fail) ") "exit=$($rr.exit)`n$($rr.out)"
    }
    # 보고서가 실제와 다른 해시를 적고 있으면(대조 실패) 이름이 semgrep.exe 여도 거절
    $tampered = (Get-Content -LiteralPath $d.Report -Raw -Encoding UTF8).Replace($d.ExeHash, ('f' * 64))
    $tr = Join-Path $d.Base 'tampered-report.md'; [IO.File]::WriteAllText($tr, $tampered, $Utf8)
    $rr = Invoke-LspReal $sb $d @{ DistReport = $tr }
    Assert-That 'real-report-mismatch' '보고서의 값이 현재 파일과 다르면 L06 실패, 종료 50' ($rr.exit -eq 50 -and $rr.out -match '\[FAIL\] L06 ') "exit=$($rr.exit)`n$($rr.out)"
    # 정션: 경로 조각에 재해석 지점이 있으면 거절(관리자 권한 없이 만들 수 있는 junction)
    $jd = New-FakeDist (Join-Path $sb.Root 'fakej')
    Grant-FakeAcl $sb $jd
    $real = Join-Path $jd.Venv 'Scripts'; $moved = Join-Path $jd.Base 'Scripts-real'
    Move-Item -LiteralPath $real -Destination $moved
    New-Item -ItemType Junction -Path $real -Target $moved | Out-Null
    $rr = Invoke-LspReal $sb $jd
    [IO.Directory]::Delete($real)       # 링크만 지운다(대상 폴더는 건드리지 않는다)
    Assert-That 'real-junction' '경로 조각이 정션이면 L02 실패, 종료 50' ($rr.exit -eq 50 -and $rr.out -match '\[FAIL\] L02 ') "exit=$($rr.exit)`n$($rr.out)"
    # 거부(30)
    foreach ($c in @(
            @{ id = 'short-hash'; over = @{ ExpectedExeSha256 = ('a' * 12) } },
            @{ id = 'no-report-arg'; over = @{ DistReport = $null } },
            @{ id = 'no-root'; over = @{ DistRoot = $null } },
            @{ id = 'short-wheel'; over = @{ ExpectedWheelSha256 = ('a' * 63) } })) {
        $rr = Invoke-LspReal $sb $d $c.over
        Assert-That "real-refuse-$($c.id)" '거부: 종료 30' ($rr.exit -eq 30) "exit=$($rr.exit)`n$($rr.out)"
    }
    $rr = Invoke-LspReal $sb $d @{} -Extra @('-TotalMs', '1000')
    Assert-That 'real-refuse-limit' '실제 모드에서 한도를 줄이면 거부(종료 30)' ($rr.exit -eq 30) "exit=$($rr.exit)"
    $rr = Invoke-LspReal $sb $d @{} -Extra @('-StartAllowanceMs', '1000')
    Assert-That 'real-refuse-allowance' '실제 모드에서 기동 허용 시간을 바꾸면 거부(종료 30)' ($rr.exit -eq 30) "exit=$($rr.exit)"
    $rs = Invoke-Lsp $sb -Dry -Limits @('-TotalMs', '999999999')
    Assert-That 'stub-refuse-limit' '스텁 모드라도 계약 상한 위의 한도는 거부(종료 30)' ($rs.exit -eq 30) "exit=$($rs.exit)"
    # 실제 모드 -Execute: 모의가 실제 Semgrep 실행을 막는다(MOCK GUARD). 예외 뒤에도 정리가 끝까지 돈다.
    $sbx = New-LspSandbox
    $dx = New-FakeDist (Join-Path $sbx.Root 'fake')
    Grant-FakeAcl $sbx $dx
    $before = Get-AuditValue $sbx
    $rr = Invoke-LspReal $sbx $dx @{} -Execute
    $repx = Get-LspReport $sbx
    $logx = Get-CallsLog $sbx
    Assert-That 'real-execute-guard' '실제 모드 -Execute 는 모의가 러너 실행 전에 막는다: 러너가 띄워지지 않았다(LspRunner 기록 없음)' ($logx -notmatch 'LspRunner kind=' -and (Get-Prop $repx 'error') -match 'MOCK GUARD') "error=$(Get-Prop $repx 'error')`n$($rr.out)"
    Assert-That 'real-execute-guard' '예외 뒤에도 정리가 끝까지 돌았다(감사 복구·계정 비활성화·수신기 정지), 관측은 성립하지 않는다' ($rr.exit -eq 60 -and (Get-AuditValue $sbx) -eq $before -and (Get-UserEnabled $sbx) -eq $false -and (Get-Prop $repx 'processCleanup.ok') -eq $true -and (Get-Prop $repx 'systemRecovery.ok') -eq $true -and (Get-Prop $repx 'observation.established') -eq $false) "exit=$($rr.exit)"
    Assert-That 'real-execute-guard' '보고서의 모드는 semgrep-lsp 이고 요청 인자는 정확히 lsp --debug 이다' ((Get-Prop $repx 'mode') -eq 'semgrep-lsp' -and ((@(Get-Prop $repx 'request.args')) -join ' ') -eq 'lsp --debug')
    Assert-That 'real-execute-guard' '남은 프로세스 없음' ((Remove-Stragglers $sbx) -eq 0)
}

# ═══ (C) 진짜 시스템 상태 불변 확인(읽기 전용) ═══════════════════════════════════
# 스냅샷 함수와 시험 전 스냅샷은 이 파일 맨 앞에 있다(시험을 시작하기 전에 찍어야 하므로).
# 전후 비교(스냅샷 `$realBefore` 는 이 파일 맨 위, 시험을 시작하기 전에 찍었다).
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
if (-not $KeepSandbox) { foreach ($s in $Sandboxes) { Remove-Item -LiteralPath $s -Recurse -Force -ErrorAction SilentlyContinue } }
$pass = @($Results | Where-Object { $_.pass -eq $true }).Count; $fail = @($Results | Where-Object { $_.pass -eq $false }).Count; $skip = @($Results | Where-Object { $null -eq $_.pass }).Count
Write-Host ('LspMinAdmin [{0}]: {1}/{2} 통과, {3} 실패, {4} 건너뜀' -f $Engine, $pass, ($pass + $fail), $fail, $skip)
if ($skip -gt 0) { Write-Host ('  건너뛴 {0}건은 통과로 세지 않았다. 재해석 도구(-TsxCmd, -ReinterpretCli)가 없으면 "관측이 성립하는" 경로는 확인되지 않은 것이다.' -f $skip) -ForegroundColor Yellow }
if ($fail -gt 0) { exit 1 }
exit 0
