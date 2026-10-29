<#
.SYNOPSIS
  LSP-MIN-1 최소 기동 관측의 관리자 진입점. 적용된 격리 안에서 전용 계정이 설치된 semgrep.exe 를 ["lsp","--debug"] 로 딱 한 번 띄워 initialize → shutdown → exit 만 보내는 것을 감독하고 관측한다.
  규칙 다운로드·스캔·`initialized`·문서 알림은 하지 않는다. 좁은 용도의 진입점이며 범용 실행기가 아니다.
.DESCRIPTION
  기본은 읽기 전용 사전 확인과 계획 출력(dry-run)뿐이다. 계정 켜기·감사 창·수신기·자식 실행은 명시적 -Execute 없이는 하지 않는다.
  - 실행 파일: -DistRoot 에서 도출한 정확한 경로(<DistRoot>\venv\Scripts\semgrep.exe)와 같아야 하고, 경로 조각에 심볼릭 링크·정션이 없어야 한다. 이름이 semgrep.exe 라는 이유만으로 허용하지 않는다.
    전체 64자리 SHA-256(-ExpectedExeSha256, -ExpectedWheelSha256)이 현재 파일과 같고 배포물 검증 보고서(-DistReport)의 값과도 같아야 한다. 핀 파일과 검증 표지는 읽지도 바꾸지도 않는다.
  - 요청과 결과는 실행별 토큰(RunId 포함)으로 결합한다. 이전 실행의 결과 파일은 시작 전에 지우고, 토큰·모드·요청 반향·시작 시각이 맞지 않는 결과는 받아들이지 않는다.
    실행기와 자식의 실제 경로·소유 SID·시작 시각·부모 관계는 관리자 쪽 CIM 으로 다시 확인한다(결과의 자기 보고만 믿지 않는다).
  - 루프백 수신기는 자식보다 먼저 열고 실행 중 계속 읽는다. 적중이나 읽기 실패가 생기면 중단 파일을 만들어 러너에 전달한다. 폴러 실패·중단 파일 전달 실패도 기록하고, 전달 실패면 전용 계정의 프로세스를 직접 끝낸다.
  - 부모 감독: 러너의 동기 CIM·파일 호출과 독립된 이 스크립트의 루프가 관측 마감(기동 허용 + totalMs)에 중단을 요청하고, 러너가 계속 매달려 있으면 유예 뒤 전용 계정의 프로세스를 끝내고 정리로 넘어간다.
    결과 파일이 없으면 관측 실패(RUNNER_NO_RESULT)로 남기고 복구는 계속한다.
  - 보고는 섞지 않는다: 관측(observation) · 프로세스 정리(processCleanup) · 시스템 복구(systemRecovery) 는 서로의 결과를 바꾸지 않는다. 귀속된 5157 · 식별 불가 이벤트 · 루프백 건수는 따로 적고,
    읽기 실패·로그 밀림·감사 미확인이면 0건으로 채우지 않고 null 과 사유를 적는다.
  - 판정의 본체는 TS 재해석(lsp-min-reinterpret-cli.ts)이다: 러너 결과의 원문 바이트와 이 스크립트가 모은 문맥(수신기·신원·결합·감독)을 다시 해석한다. 도구가 없으면 관측은 성립하지 않는다(REINTERPRETATION_NOT_RUN).
  종료 코드: 0 관측 성립 + 정리 완료 / 30 거부 / 50 사전 조건 실패 / 60 관측 성립하지 않음(정리는 완료) / 70 정리 불완전(프로세스 정리 또는 시스템 복구 실패).
  이 스크립트는 --help·--version 을 포함해 Semgrep 을 직접 실행하지 않는다. 실제 실행은 러너(lsp-min-runner.ps1)가 전용 계정으로 하며, 이 스크립트의 시험은 스텁 모드만 쓴다.
.EXAMPLE
  .\Test-LspMinObservation.ps1 -RunDir <RunDir> -DistRoot <DistRoot> -SemgrepExe <DistRoot>\venv\Scripts\semgrep.exe -ExpectedExeSha256 <64hex> -WheelPath <whl> -ExpectedWheelSha256 <64hex> -DistReport <report.md>   # 사전 확인과 계획만
  .\Test-LspMinObservation.ps1 -RunDir <RunDir> -Mode stub -StubScenario ok -Execute -TsxCmd <tsx.cmd> -NodeDir <node dir>                                                                                  # 경로 점검(스텁)
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RunDir,
    [switch]$Execute,
    [ValidateSet('semgrep-lsp', 'stub')][string]$Mode = 'semgrep-lsp',
    [ValidateSet('ok', 'error', 'initialize-error', 'wrong-id', 'split', 'silent', 'silent-hold', 'ignore-exit', 'ignore-exit-eof', 'exit-early', 'garbage', 'server-request', 'stderr-scan', 'stderr-split', 'stderr-download', 'publish', 'write-ws', 'flood-out', 'flood-err', 'orphan', 'env-names', 'spawn-disallowed', 'id-case', 'jsonrpc-case', 'method-case')][string]$StubScenario = 'ok',
    [string]$DistRoot,
    [string]$SemgrepExe,
    [string]$ExpectedExeSha256,
    [string]$ExpectedCoreSha256,
    [string]$WheelPath,
    [string]$ExpectedWheelSha256,
    [string]$DistReport,
    [string]$ExpectedVersion = '1.180.0',
    [string]$TsxCmd,
    [string]$NodeDir,
    [string]$ReinterpretCli,
    [string]$CancelFile,
    [int]$TotalMs = 150000,
    [int]$InitMs = 60000,
    [int]$ExitMs = 30000,
    [int]$StdinCloseGraceMs = 10000,
    [int]$KillConfirmMs = 10000,
    [int]$MaxStdoutBytes = 1048576,
    [int]$MaxStderrBytes = 262144,
    [int]$SampleIntervalMs = 40,
    [int]$StartAllowanceMs = 20000,
    [int]$SupervisorGraceMs = 15000
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
. (Join-Path $PSScriptRoot 'LspMinContract.ps1')
. (Join-Path $PSScriptRoot 'LspMinAdminContract.ps1')
. (Join-Path $PSScriptRoot 'LspMinAdminPorts.ps1')
$Script:EntryDir = $PSScriptRoot

function Get-LspMinDescendantCim([int]$RootPid, $RootStart, $Table) {
    $byParent = @{}
    foreach ($p in $Table) { $k = [int]$p.ParentProcessId; if (-not $byParent.ContainsKey($k)) { $byParent[$k] = New-Object System.Collections.ArrayList }; [void]$byParent[$k].Add($p) }
    $out = New-Object System.Collections.ArrayList
    $seen = @{ $RootPid = $true }
    $queue = New-Object System.Collections.Queue; $queue.Enqueue($RootPid)
    while ($queue.Count -gt 0) {
        $cur = [int]$queue.Dequeue()
        if (-not $byParent.ContainsKey($cur)) { continue }
        foreach ($c in $byParent[$cur]) {
            $cid = [int]$c.ProcessId
            if ($seen.ContainsKey($cid)) { continue }
            if ($null -ne $RootStart -and $c.CreationDate -lt $RootStart) { continue }
            $seen[$cid] = $true; [void]$out.Add($c); $queue.Enqueue($cid)
        }
    }
    , $out.ToArray()
}

function Invoke-LspMinObservation {
    param(
        [string]$RunDir, [bool]$Execute, [string]$Mode, [string]$StubScenario, [string]$DistRoot, [string]$SemgrepExe, [string]$ExpectedExeSha256, [string]$ExpectedCoreSha256, [string]$WheelPath, [string]$ExpectedWheelSha256,
        [string]$DistReport, [string]$ExpectedVersion, [string]$TsxCmd, [string]$NodeDir, [string]$ReinterpretCli, [string]$CancelFile, $Limits, [int]$StartAllowanceMs, [int]$SupervisorGraceMs
    )
    if (-not (Test-Path -LiteralPath $RunDir)) { Write-Host "RunDir 가 없다: $RunDir"; return @{ exitCode = 30 } }
    $Script:IsoRunDir = (Resolve-Path -LiteralPath $RunDir).Path
    $Script:ApplyMode = $Execute
    $manifestFile = Join-Path $Script:IsoRunDir 'resources.json'
    if (-not (Test-Path -LiteralPath $manifestFile)) { Write-Host '실행 기록(resources.json)이 없다. Initialize-Isolation.ps1 -Apply 가 먼저 필요하다.'; return @{ exitCode = 50 } }

    # ── 거부(30): 한도와 필수 인자. 실제 모드의 한도·감독 시간은 계약 값 그대로다. ──
    if ($Mode -eq 'semgrep-lsp') {
        foreach ($k in $Script:LspMinAdminLimitNames) { if ([int]$Limits[$k] -ne [int]$Script:LspMinLimits[$k]) { Write-Host "semgrep-lsp 모드의 한도는 계약 값에 고정돼 있다($k): 거부한다."; return @{ exitCode = 30 } } }
        if ($StartAllowanceMs -ne $Script:LspMinAdminStartAllowanceMs -or $SupervisorGraceMs -ne $Script:LspMinAdminSupervisorGraceMs) { Write-Host 'semgrep-lsp 모드의 기동 허용·감독 유예는 계약 값에 고정돼 있다: 거부한다.'; return @{ exitCode = 30 } }
        if (-not $DistRoot -or -not $SemgrepExe -or -not $ExpectedExeSha256 -or -not $WheelPath -or -not $ExpectedWheelSha256 -or -not $DistReport) { Write-Host 'semgrep-lsp 모드는 -DistRoot -SemgrepExe -ExpectedExeSha256 -WheelPath -ExpectedWheelSha256 -DistReport 가 모두 필요하다.'; return @{ exitCode = 30 } }
        if ($null -eq (ConvertTo-LspMinSha256 $ExpectedExeSha256) -or $null -eq (ConvertTo-LspMinSha256 $ExpectedWheelSha256)) { Write-Host '기대 해시는 전체 64자리 16진수여야 한다(앞부분만 쓴 값은 거부한다).'; return @{ exitCode = 30 } }
        if ($ExpectedCoreSha256 -and $null -eq (ConvertTo-LspMinSha256 $ExpectedCoreSha256)) { Write-Host '-ExpectedCoreSha256 은 전체 64자리 16진수여야 한다.'; return @{ exitCode = 30 } }
    } else {
        foreach ($k in $Script:LspMinAdminLimitNames) { $v = [double]$Limits[$k]; if ($v -lt 1 -or $v -gt [double]$Script:LspMinLimits[$k]) { Write-Host "한도 값이 범위 밖이다($k): 거부한다."; return @{ exitCode = 30 } } }
        if ($StartAllowanceMs -lt 1 -or $SupervisorGraceMs -lt 1) { Write-Host '기동 허용·감독 유예는 1 이상이어야 한다.'; return @{ exitCode = 30 } }
    }

    $m = $null
    try { $m = Import-IsoManifest -Path $manifestFile } catch { Write-Host ('실행 기록(resources.json)을 읽지 못했다: ' + $_.Exception.Message) -ForegroundColor Yellow; return @{ exitCode = 50 } }
    $runId = [string]$m.runId
    $names = Get-IsoNames -RunId $runId
    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'")
    if ($runId -cnotmatch $Script:LspMinAdminRunIdPattern) { Write-Host 'RunId 형식이 올바르지 않다.'; return @{ exitCode = 30 } }
    if (-not $CancelFile) { $CancelFile = Join-Path $Script:IsoRunDir 'lsp-min-cancel.flag' }
    $workDir = Join-Path $names.WorkDir 'work'
    $lspWork = Join-LmPath $workDir 'lsp'
    $layout = Get-LspMinLayout -Work $lspWork
    $reqFile = Join-Path $workDir 'lsp-min-request.json'; $resultFile = Join-Path $workDir 'lsp-min-result.json'; $abortFile = Join-Path $workDir 'lsp-min-abort.flag'
    $limitsDoc = [ordered]@{}; foreach ($k in $Script:LspMinAdminLimitNames) { $limitsDoc[$k] = [int]$Limits[$k] }

    # ── 사전 조건(읽기 전용) ──
    $pre = New-Object System.Collections.ArrayList
    $addPre = { param([string]$Id, [bool]$Ok, [string]$Detail); [void]$pre.Add([ordered]@{ id = $Id; ok = $Ok; detail = $Detail }); $lv = 'FAIL'; if ($Ok) { $lv = 'PASS' }; Write-IsoLog -Level $lv -Message "$Id $Detail" }
    & $addPre 'T01' ($m.status -eq 'applied') "실행 기록 상태가 applied 인가 (현재 $($m.status))"
    if ($Execute) { & $addPre 'T02' (Test-IsElevated) '관리자 권한(Security 로그·감사 정책·계정 사용 켜기)' }
    $userStep = @($m.steps | Where-Object { $_.kind -eq 'user' }) | Select-Object -First 1
    $sid = $null; if ($userStep) { $sid = [string](Get-IsoProp $userStep.detail 'sid') }
    $acct = Get-LocalUser -Name $names.UserName -ErrorAction SilentlyContinue
    & $addPre 'T03' ([bool]($acct -and $acct.Description -eq $names.Marker -and $sid -and $acct.SID.Value -eq $sid)) '전용 계정이 있고 표식·SID 가 기록과 같은가'
    $rule = Get-NetFirewallRule -Name $names.RuleName -ErrorAction SilentlyContinue
    $ruleOk = $false; $ruleScope = $null; $ruleRemote = $null
    if ($rule) {
        $sf = $rule | Get-NetFirewallSecurityFilter
        $ruleScope = [string]$sf.LocalUser
        $ruleRemote = @(($rule | Get-NetFirewallAddressFilter).RemoteAddress)
        $ruleOk = ($rule.Description -eq $names.Marker -and [string]$rule.Enabled -eq 'True' -and [string]$rule.Action -eq 'Block' -and [string]$rule.Direction -eq 'Outbound' -and $sid -and $ruleScope.Contains($sid))
    }
    & $addPre 'T04' ([bool]$ruleOk) "방화벽 규칙이 켜져 있고 Block/Outbound/계정 범위가 기록과 같은가 (LocalUser=$ruleScope, RemoteAddress=$($ruleRemote -join ','))"
    & $addPre 'T05' ((Test-Path -LiteralPath (Join-Path $names.WorkDir '.owner')) -and (Test-Path -LiteralPath (Join-Path $Script:IsoRunDir 'credential.dpapi'))) '작업 폴더(.owner)와 암호 파일이 있는가'
    $sl0 = Get-SecurityLogState
    & $addPre 'T06' ([bool]$sl0.ok) "Security 로그를 읽을 수 있는가 ($($sl0.error))"
    & $addPre 'T07' (-not (Test-Path -LiteralPath $CancelFile)) "이전 취소 표지가 없는가 ($CancelFile)"
    # 이전 실행의 작업 배치는 다음 실행 전에 관리자 권한으로 지운다. 그 안에 정션·링크가 있으면(전용 계정이 만들 수 있다) 대상을 지울 위험이 있으므로 지우지 않고 멈춘다(링크는 따라가지 않고 찾는다).
    $oldTree = @(); if (Test-Path -LiteralPath $lspWork) { $oldTree = Find-LspMinReparseInTree -Root $lspWork }
    & $addPre 'T08' ($oldTree.Count -eq 0) "이전 실행의 작업 배치에 정션·링크가 없고 읽을 수 있는가 ($($oldTree -join ' ; '))"
    # 러너는 경로에 중단 문구(download·registry 등)가 있으면 시작을 거절한다: 계정을 켜기 전에 미리 거른다.
    $pp0 = Find-LspMinPathPattern $lspWork
    & $addPre 'T09' ($null -eq $pp0) "작업 폴더 경로에 러너가 거절할 문구가 없는가 ($pp0)"

    $inputs = [ordered]@{ mode = $Mode }
    $venvRoot = $null; $baseHome = $null; $hashesBefore = [ordered]@{}
    $exe = $SemgrepExe
    if ($Mode -eq 'semgrep-lsp') {
        $expectedExe = Get-LspMinExpectedExePath -DistRoot $DistRoot
        $exePathOk = [bool](Test-LspMinSamePath $SemgrepExe $expectedExe)
        $exeExists = ($exePathOk -and (Test-Path -LiteralPath $SemgrepExe -PathType Leaf))
        & $addPre 'L01' ($exePathOk -and $exeExists) "실행 파일이 설치 위치에서 도출한 정확한 경로와 같고 존재하는가 (기대 $expectedExe, 받은 값 $SemgrepExe)"
        $venvRoot = [IO.Path]::Combine($DistRoot, 'venv')
        # `, @(...)` 로 돌려주는 함수는 @() 로 다시 감싸지 않는다(빈 배열이 원소 하나로 보이는 함정).
        $chain = @(); if ($exeExists) { $chain = Get-LspMinReparseInChain -Path $SemgrepExe -Root $DistRoot }
        & $addPre 'L02' ($exeExists -and $chain.Count -eq 0) "설치 위치에서 실행 파일까지 경로 조각에 심볼릭 링크·정션이 없는가 ($($chain -join ' ; '))"
        # 읽지 못한 파일의 사실은 "빈 사실"(해시·크기 null)로 둔다: 상세 문구를 만들 때 null 의 속성을 읽다 죽지 않고, 빈 해시는 어떤 기대값과도 같지 않다.
        $noFacts = [ordered]@{ sha256 = $null; size = $null }
        $exeFacts = $noFacts; if ($exeExists) { $f0 = Get-LspMinFileFacts -Path $SemgrepExe; if ($f0) { $exeFacts = $f0 } }
        $wantExe = ConvertTo-LspMinSha256 $ExpectedExeSha256
        & $addPre 'L03' ([bool]($exeFacts.sha256 -and $exeFacts.sha256 -eq $wantExe)) "semgrep.exe 전체 SHA-256 이 기대값과 같은가 (실제 $($exeFacts.sha256), 크기 $($exeFacts.size))"
        $wheelFacts = $noFacts; if ($WheelPath -and (Test-Path -LiteralPath $WheelPath -PathType Leaf)) { $f0 = Get-LspMinFileFacts -Path $WheelPath; if ($f0) { $wheelFacts = $f0 } }
        $wantWheel = ConvertTo-LspMinSha256 $ExpectedWheelSha256
        & $addPre 'L04' ([bool]($wheelFacts.sha256 -and $wheelFacts.sha256 -eq $wantWheel)) "원본 휠의 현재 SHA-256 이 기대값과 같은가 (실제 $($wheelFacts.sha256), 크기 $($wheelFacts.size))"
        $corePath = [IO.Path]::Combine($venvRoot, 'Lib', 'site-packages', 'semgrep', 'bin', 'semgrep-core.exe')
        $coreFacts = $noFacts; if (Test-Path -LiteralPath $corePath -PathType Leaf) { $f0 = Get-LspMinFileFacts -Path $corePath; if ($f0) { $coreFacts = $f0 } }
        $coreWant = $null; if ($ExpectedCoreSha256) { $coreWant = ConvertTo-LspMinSha256 $ExpectedCoreSha256 }
        $coreOk = [bool]($coreFacts.sha256 -and (($null -eq $coreWant) -or $coreFacts.sha256 -eq $coreWant))
        & $addPre 'L05' $coreOk "semgrep-core.exe 가 있고 (기대값을 줬다면) 전체 SHA-256 이 같은가 (실제 $($coreFacts.sha256), 크기 $($coreFacts.size))"
        $reportText = $null; $reportSha = $null
        if ($DistReport -and (Test-Path -LiteralPath $DistReport -PathType Leaf)) { try { $reportText = [IO.File]::ReadAllText($DistReport, [Text.Encoding]::UTF8); $reportSha = Get-FileSha256Hex -Path $DistReport } catch { $reportText = $null } }
        $cross = $null
        if ($null -ne $reportText) {
            $coreForReport = $null; if ($coreFacts) { $coreForReport = $coreFacts.sha256 }
            $cross = Test-LspMinReportCrossCheck -ReportText $reportText -ExeSha256 $(if ($exeFacts) { $exeFacts.sha256 }) -ExeSize $(if ($exeFacts) { $exeFacts.size }) -CoreSha256 $coreForReport -CoreSize $(if ($coreFacts) { $coreFacts.size }) -WheelSha256 $(if ($wheelFacts) { $wheelFacts.sha256 })
        }
        & $addPre 'L06' ([bool]($cross -and $cross.ok)) "배포물 검증 보고서의 값(실행 파일·core·휠 해시와 크기)이 현재 파일과 모두 같은가 ($(if ($cross) { (@($cross.items | ForEach-Object { $_.id + '=' + $_.ok }) -join ',') } else { '보고서를 읽지 못했다' }))"
        $cfg = Join-Path $venvRoot 'pyvenv.cfg'
        if (Test-Path -LiteralPath $cfg) { $line = @(Get-Content -LiteralPath $cfg | Where-Object { $_ -match '^\s*home\s*=' }) | Select-Object -First 1; if ($line) { $baseHome = ($line -replace '^\s*home\s*=\s*', '').Trim() } }
        $venvPython = [IO.Path]::Combine($venvRoot, 'Scripts', 'python.exe'); $basePython = $(if ($baseHome) { [IO.Path]::Combine($baseHome, 'python.exe') })
        & $addPre 'L07' ([bool]($baseHome -and (Test-Path -LiteralPath $venvPython) -and (Test-Path -LiteralPath $basePython))) "가상환경과 기반 Python 폴더를 pyvenv.cfg 에서 확정했는가 (venv=$venvRoot, home=$baseHome)"
        $grants = @($m.steps | Where-Object { $_.kind -eq 'aclGrant' } | ForEach-Object { [IO.Path]::GetFullPath([string]$_.name).TrimEnd('\') })
        $grantOk = [bool]($baseHome -and ($grants | Where-Object { $_.Equals($venvRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) }) -and ($grants | Where-Object { $_.Equals($baseHome.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) }))
        $aceDetail = @(); $aceOk = $false
        if ($grantOk) {
            $aceOk = $true
            foreach ($f in @($SemgrepExe, $venvPython, $basePython)) {
                # ACL 을 읽지 못하면(파일 없음·접근 거부) 던지지 않고 이 사전 조건의 실패로 센다(문서화된 종료 50).
                $has = 0
                try { $has = @((Get-Acl -LiteralPath $f -ErrorAction Stop).Access | Where-Object { $_.AccessControlType -eq 'Allow' -and (([int]$_.FileSystemRights -band 0xA9) -eq 0xA9) -and ($(try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { [string]$_.IdentityReference }) -eq $sid) }).Count } catch { $has = 0 }
                $aceDetail += ("{0}={1}" -f (Split-Path -Leaf $f), $has); if ($has -lt 1) { $aceOk = $false }
            }
        }
        & $addPre 'L08' ($grantOk -and $aceOk) "이번 실행의 권한 부여 기록이 가상환경 루트·기반 Python 폴더를 포함하고 세 파일 ACL 에 전용 SID 의 읽기·실행 ACE 가 있는가 ($($aceDetail -join ', '))"
        # 링크 점검은 실행 파일뿐 아니라 가상환경 python 과 기반 Python 폴더까지 본다. 러너가 거절할 경로 문구도 미리 거른다.
        $chainPy = @(); if (Test-Path -LiteralPath $venvPython) { $chainPy = Get-LspMinReparseInChain -Path $venvPython -Root $DistRoot }
        $chainBase = @(); if ($baseHome -and (Test-Path -LiteralPath $baseHome)) { $chainBase = Get-LspMinReparseInChain -Path $baseHome -Root $baseHome }
        & $addPre 'L10' ($chainPy.Count -eq 0 -and $chainBase.Count -eq 0 -and [bool]$baseHome) "가상환경 python 까지의 경로 조각과 기반 Python 폴더에 심볼릭 링크·정션이 없는가 ($(@($chainPy) + @($chainBase) -join ' ; '))"
        $ppHits = @(@($SemgrepExe, $DistRoot, $baseHome) | Where-Object { $_ } | ForEach-Object { $pp1 = Find-LspMinPathPattern $_; if ($pp1) { "$_ => $pp1" } })
        & $addPre 'L11' ($ppHits.Count -eq 0) "설치 경로에 러너가 시작을 거절할 문구(download·registry·scanning workspace 등)가 없는가 ($($ppHits -join ' ; '))"
        $hashesBefore = [ordered]@{ semgrepExe = $(if ($exeFacts) { $exeFacts.sha256 }); semgrepCore = $(if ($coreFacts) { $coreFacts.sha256 }); venvPython = $(if (Test-Path -LiteralPath $venvPython) { Get-FileSha256Hex -Path $venvPython }); basePython = $(if ($basePython -and (Test-Path -LiteralPath $basePython)) { Get-FileSha256Hex -Path $basePython }) }
        $inputs = [ordered]@{
            mode = $Mode; distRoot = $DistRoot; semgrepExe = $SemgrepExe; expectedExePath = $expectedExe; semgrepExeSha256 = $(if ($exeFacts) { $exeFacts.sha256 }); semgrepExeSize = $(if ($exeFacts) { $exeFacts.size }); semgrepExeSha256Expected = $wantExe
            semgrepCoreSha256 = $(if ($coreFacts) { $coreFacts.sha256 }); semgrepCoreSize = $(if ($coreFacts) { $coreFacts.size })
            wheelPath = $WheelPath; wheelSha256 = $(if ($wheelFacts) { $wheelFacts.sha256 }); wheelSha256Expected = $wantWheel
            distReport = $DistReport; distReportSha256 = $reportSha; reportCrossCheck = $cross; venvRoot = $venvRoot; basePythonHome = $baseHome; grantedPaths = $grants
            pinFile = '핀 파일은 읽지도 바꾸지도 않는다(검증 표지·정책 수락·ADR 상태도 마찬가지)'
        }
    } else {
        $inputs = [ordered]@{ mode = $Mode; stubScenario = $StubScenario }
    }
    # 재해석 도구: 실제 모드에서 -Execute 면 필수(자기 보고만으로는 관측을 성립시키지 않는다). 스텁 모드에서는 없어도 실행은 되지만 관측은 성립하지 않는다.
    if (-not $ReinterpretCli) { $ReinterpretCli = Join-Path (Join-Path (Join-Path $PSScriptRoot '..\..') 'semgrep-lsp') 'lsp-min-reinterpret-cli.ts' }
    $toolsReady = [bool]($TsxCmd -and (Test-Path -LiteralPath $TsxCmd) -and (Test-Path -LiteralPath $ReinterpretCli))
    if ($Execute -and $Mode -eq 'semgrep-lsp') { & $addPre 'L09' $toolsReady "재해석 도구(tsx, lsp-min-reinterpret-cli.ts)가 있는가 (tsx=$TsxCmd)" }
    $preFail = @($pre | Where-Object { -not $_.ok })
    if ($preFail.Count -gt 0) {
        Write-Host ('사전 조건 실패: ' + (($preFail | ForEach-Object { $_.id }) -join ', ') + ' — 실행하지 않는다.') -ForegroundColor Yellow
        return @{ exitCode = 50 }
    }

    $runnerMode = $Mode
    $argv = @($Script:LspMinArgs)
    if ($Mode -eq 'stub') { $exe = $Script:Ps51; $argv = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-LmPath $workDir 'lsp-min-stub.ps1'), $StubScenario) }
    $modeText = 'DRY-RUN(계획만)'; if ($Execute) { $modeText = 'EXECUTE(실제 실행)' }
    Write-IsoLog -Level 'INFO' -Message ("모드: {0}  실행 종류: {1}" -f $modeText, $Mode)
    if (-not $Execute) {
        Write-IsoLog -Level 'PLAN' -Message '루프백 수신기 열기(자식보다 먼저) → 감사 창 열기 → 로그 기준점 → 전용 계정 켜기 → 이전 결과·중단 파일·작업 배치 지우기 → 러너 파일 복사 → 실행 요청 쓰기(실행별 토큰)'
        Write-IsoLog -Level 'PLAN' -Message ("전용 계정으로 러너 실행 → 러너가 셸 없이 한 번 띄움: {0} {1}  (송신은 initialize → shutdown → exit 셋뿐; 한도 {2}ms 전체)" -f $exe, ($argv -join ' '), $limitsDoc.totalMs)
        Write-IsoLog -Level 'PLAN' -Message ("부모 감독: 수신기 읽기 + 프로세스 트리 CIM + 결과 파일 확인을 이 스크립트 루프가 계속한다. 관측 마감({0}+{1}ms)에 중단 요청, 유예 {2}ms 뒤에도 매달려 있으면 전용 계정 프로세스 종료" -f $StartAllowanceMs, $limitsDoc.totalMs, ($limitsDoc.killConfirmMs + $SupervisorGraceMs))
        Write-IsoLog -Level 'PLAN' -Message '결과 결합·신원 교차 확인 → TS 재해석 → 5157 대조(귀속·식별 불가·루프백 건수를 따로) → 정리(수신기, 전용 계정 프로세스, 계정 비활성화, 감사 값 복구: 각각 독립)'
        Write-Host 'dry-run 이라 아무것도 실행하지 않았다. 판정: NOT_EXECUTED'
        return @{ exitCode = 0 }
    }

    # ── 실행 ──
    $nonce = [guid]::NewGuid().ToString('N')
    $runToken = New-LspMinRunToken -RunId $runId -Nonce $nonce
    $report = [ordered]@{
        schema = $Script:LspMinAdminSchema; runId = $runId; runToken = $runToken; startedUtc = [DateTime]::UtcNow.ToString('o'); mode = $Mode; stubScenario = $(if ($Mode -eq 'stub') { $StubScenario } else { $null }); verdict = $null; finalStatus = $null
        scope = 'LSP-MIN-1 최소 기동 관측: initialize → shutdown → exit 만. 초기화 완료 알림·규칙 새로고침·스캔·문서 알림 없음. 정상 시작·보안 판정·대조 참조를 대신하지 않는다. DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않았다.'
        preconditions = $pre; inputs = $inputs; account = [ordered]@{ name = $names.UserName; sid = $sid }; rule = [ordered]@{ name = $names.RuleName; localUser = $ruleScope; remoteAddress = $ruleRemote }
        request = $null; binding = $null; identity = $null; supervisor = $null; receiver = $null; osBlockObservation = $null; processes = $null
        runnerResult = $null; reinterpretation = $null; hashes = $null
        observation = $null; processCleanup = $null; systemRecovery = $null; auditWindows = $null; notes = (New-Object System.Collections.ArrayList); error = $null
    }
    $auditSteps = New-Object System.Collections.ArrayList
    $accountTouched = $false
    $receiver = $null
    $tracked = New-Object System.Collections.ArrayList; $trackedKeys = @{}
    $failTokens = New-Object System.Collections.ArrayList
    $sup = [ordered]@{
        startAllowanceMs = $StartAllowanceMs; graceMs = $SupervisorGraceMs; observationDeadlineMs = ($StartAllowanceMs + [int]$limitsDoc.totalMs); abortRequestedAtMs = $null; abortReason = $null; requests = (New-Object System.Collections.ArrayList)
        abortFile = [ordered]@{ path = $abortFile; attempts = 0; delivered = $null; error = $null }; forcedKill = $false; forcedKillAtMs = $null; forcedKillReason = $null; killTargets = (New-Object System.Collections.ArrayList)
        deadlineReached = $false; loopIterations = 0; cimFailures = 0; elapsedAtEndMs = $null
    }
    $recv = [ordered]@{ baselineHits = $null; finalHits = $null; samples = 0; failures = 0; hitEndpoints = @(); lastError = $null; listener = $null }
    $bindingFailures = @(); $identityFailures = @(); $resultState = 'NONE'; $resultObj = $null; $resultRawBytes = $null
    $rec = $null; $recordObj = $null; $ctxFile = $null; $recordFile = $null; $rrFile = $null
    $base = $null; $uname = [string]$names.UserName
    $verdict = 'NOT_ESTABLISHED'
    $established = $false
    $reint = [ordered]@{ status = 'NOT_RUN'; reason = $null; exitCode = $null; output = $null; recordFile = $null; contextFile = $null; recordStatus = $null; statusReasons = @(); adminReasons = @(); terminationPath = $null }
    $findAccountProcs = { @(Get-Process -IncludeUserName -ErrorAction Stop | Where-Object { $_.UserName -and $_.UserName.EndsWith('\' + $uname, [StringComparison]::OrdinalIgnoreCase) }) }
    try {
        # 수신기는 자식보다 먼저 준비한다. 준비하지 못하면 아무것도 시작하지 않는다.
        try {
            $receiver = New-LspMinReceiver
            $b0 = Read-LspMinReceiver -Receiver $receiver
            if (-not $b0.ok) { throw '기준점 읽기 실패' }
            $recv.baselineHits = $receiver.hits.Count; $recv.listener = "127.0.0.1:$($receiver.port)"
        } catch {
            [void]$failTokens.Add('RECEIVER_NOT_READY'); $report.error = '루프백 수신기를 준비하지 못했다: ' + $_.Exception.Message
            throw 'RECEIVER_NOT_READY'
        }
        # 이전 실행의 요청·결과·중단 파일과 작업 배치를 지운다. 전용 계정을 켜기 **전**이라 그 계정이 동시에 쓰는 일이 없다.
        # 작업 배치는 관리자 권한으로 재귀 삭제하므로, 지우기 직전에 링크가 없는지 한 번 더 확인하고(사전 조건 T08 은 읽기 시점의 값) 있으면 지우지 않고 멈춘다.
        foreach ($a in 'lsp-min-request.json', 'lsp-min-result.json', 'lsp-min-result.json.tmp', 'lsp-min-abort.flag') {
            $ap = Join-Path $workDir $a
            if (Test-Path -LiteralPath $ap) { Invoke-Mutation -Description "이전 실행의 파일 삭제: $a" -Action { Remove-Item -LiteralPath $ap -Force -ErrorAction Stop } | Out-Null }
        }
        if ((Test-Path -LiteralPath $lspWork) -and ([IO.Path]::GetFullPath($lspWork)).StartsWith(([IO.Path]::GetFullPath($workDir).TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
            $linksNow = Find-LspMinReparseInTree -Root $lspWork
            if ($linksNow.Count -gt 0) { throw ('이전 작업 배치에 정션·링크가 있어 지우지 않는다: ' + ($linksNow -join ' ; ')) }
            Invoke-Mutation -Description "이전 실행의 작업 배치 삭제: $lspWork" -Action { Remove-Item -LiteralPath $lspWork -Recurse -Force -ErrorAction Stop } | Out-Null
        }
        Open-IsoAuditWindow -Guid $Script:AuditGuid.FilteringPlatformConnection -EnableSuccess $false -EnableFailure $true -Registry $auditSteps -Why '5157(차단된 연결) 기록용, 이 실행 동안만' | Out-Null
        $base = Get-SecurityLogState
        if (-not $base.ok) { throw "실행 직전 Security 로그 기준점을 읽지 못했다: $($base.error)" }
        $accountTouched = $true
        Invoke-Mutation -Description "전용 계정 사용 켜기(끝나면 다시 끈다): $uname" -Action { Enable-LocalUser -Name $uname -ErrorAction Stop } | Out-Null
        $secure = ConvertTo-SecureString -String ([IO.File]::ReadAllText((Join-Path $Script:IsoRunDir 'credential.dpapi')).Trim())
        $cred = New-Object System.Management.Automation.PSCredential(('.\' + $uname), $secure)

        if (-not (Test-Path -LiteralPath $workDir)) { Invoke-Mutation -Description "작업 폴더 만들기: $workDir" -Action { New-Item -ItemType Directory -Path $workDir -ErrorAction Stop | Out-Null } | Out-Null }
        $toCopy = @('lsp-min-runner.ps1', 'LspMinContract.ps1', 'version-runner.ps1'); if ($Mode -eq 'stub') { $toCopy += 'lsp-min-stub.ps1' }
        foreach ($f in $toCopy) { $src = Join-Path $Script:EntryDir $f; Invoke-Mutation -Description "작업 폴더로 복사: $f" -Action { Copy-Item -LiteralPath $src -Destination (Join-Path $workDir $f) -Force -ErrorAction Stop } | Out-Null }

        $envTable = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $layout -Url $receiver.url
        $artifacts = @(); if ($Mode -eq 'semgrep-lsp') { $artifacts = @([ordered]@{ label = 'semgrep.exe'; path = $SemgrepExe }) }
        $reqDoc = New-LspMinRunnerRequest -Token $runToken -Mode $runnerMode -Exe $exe -ArgList $argv -Layout $layout -Env $envTable -Limits $limitsDoc -Artifacts $artifacts -AbortFile $abortFile -ResultFile $resultFile
        $selfCheck = Test-LspMinRunnerRequest -Request $reqDoc
        $report.request = [ordered]@{ mode = $runnerMode; exe = $exe; args = $argv; layoutWork = $lspWork; envNames = @($envTable.Keys); envValuesLoopbackUrl = $receiver.url; limits = $limitsDoc; abortFile = $abortFile; resultFile = $resultFile; selfCheckProblems = $selfCheck }
        if ($selfCheck.Count -gt 0) { throw ('요청이 계약과 모순된다: ' + ($selfCheck -join ',')) }
        Invoke-Mutation -Description '실행 요청 쓰기: lsp-min-request.json(이번 실행의 토큰 포함)' -Action { [IO.File]::WriteAllText($reqFile, ($reqDoc | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false))) } | Out-Null

        $argList = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"{0}"' -f (Join-Path $workDir 'lsp-min-runner.ps1')), '-RequestFile', ('"{0}"' -f $reqFile))
        $launchedUtc = [DateTime]::UtcNow
        $sw = [Diagnostics.Stopwatch]::StartNew()
        $parent = Invoke-Mutation -Description "전용 계정으로 러너 실행: $($Script:Ps51)" -Action { Start-Process -FilePath $Script:Ps51 -ArgumentList $argList -Credential $cred -WorkingDirectory $workDir -LoadUserProfile -PassThru -WindowStyle Hidden }
        $parentPid = [int]$parent.Id
        $runnerRec = Get-LspMinProcessRecord -ProcessId $parentPid -Role 'runner' -TimeoutSec 5
        if ($runnerRec) { $runnerRec.commandLine = $null; [void]$tracked.Add($runnerRec); $trackedKeys["$parentPid|$($runnerRec.startUtc)"] = $runnerRec }
        $runnerStart = $null; if ($runnerRec) { $runnerStart = (ConvertTo-UtcDate $runnerRec.startUtc).ToLocalTime() }

        $forceKill = {
            param([string]$Reason)
            if ($sup.forcedKill) { return }
            $sup.forcedKill = $true; $sup.forcedKillAtMs = [int]$sw.ElapsedMilliseconds; $sup.forcedKillReason = $Reason
            # (1) 이미 추적한 PID 를 먼저 끝낸다: 계정 이름 열거(Get-Process -IncludeUserName)는 제한 시간을 줄 수 없어 걸릴 수 있으므로, 그것에 기대지 않는다.
            #     PID 재사용을 피하려고 소유 SID 와 시작 시각이 기록과 같은 것만 끝낸다(제한 시간이 있는 포트로 다시 읽는다).
            foreach ($tr in @($tracked)) {
                $left = Get-LspMinProcessRecord -ProcessId ([int]$tr.processId) -Role 'cleanup' -TimeoutSec 5
                if ($left -and $left.ownerSid -eq $sid -and $left.startUtc -eq $tr.startUtc) {
                    $procId = [int]$tr.processId; [void]$sup.killTargets.Add($procId)
                    try { Invoke-Mutation -Description "감독 종료: 추적한 전용 계정 프로세스 pid=$procId ($Reason)" -Action { Stop-Process -Id $procId -Force -ErrorAction Stop } | Out-Null } catch { }
                }
            }
            # (2) 그 밖에 전용 계정이 가진 프로세스(추적하지 못한 것)는 이름 열거로 찾아 끝낸다.
            try {
                foreach ($c in (& $findAccountProcs)) { $procId = [int]$c.Id; if ($sup.killTargets.Contains($procId)) { continue }; [void]$sup.killTargets.Add($procId); try { Invoke-Mutation -Description "감독 종료: 전용 계정 프로세스 pid=$procId ($Reason)" -Action { Stop-Process -Id $procId -Force -ErrorAction Stop } | Out-Null } catch { } }
            } catch { [void]$report.notes.Add('감독 종료 중 전용 계정 프로세스 목록을 읽지 못했다(추적한 PID 는 이미 끝냈다): ' + $_.Exception.Message) }
        }
        $requestAbort = {
            param([string]$Text)
            if (-not $sup.requests.Contains($Text)) { [void]$sup.requests.Add($Text) }
            if ($null -ne $sup.abortRequestedAtMs) { return }
            $sup.abortRequestedAtMs = [int]$sw.ElapsedMilliseconds; $sup.abortReason = $Text
            $w = Write-LspMinAbortFile -Path $abortFile -Text $Text
            $sup.abortFile.attempts++; $sup.abortFile.delivered = [bool]$w.ok; $sup.abortFile.error = $w.error
            if (-not $w.ok) { & $forceKill 'ABORT_DELIVERY_FAILED' }
        }

        # ── 부모 감독 루프: 수신기 읽기 + 취소 표지 + 프로세스 트리 기록 + 결과 파일 확인 + 마감 결정. 러너의 동기 호출과 무관하게 이 루프가 계속 돈다. ──
        $resultSeenAt = $null; $runnerGoneAt = $null; $giveUp = $false
        while ($true) {
            $sup.loopIterations++
            $rd = Read-LspMinReceiver -Receiver $receiver
            if (-not $rd.ok) { & $requestAbort 'A3:RECEIVER_UNREADABLE' }
            elseif ($rd.newHits -gt 0) { & $requestAbort 'A3:RECEIVER_HIT' }
            if (Test-Path -LiteralPath $CancelFile) { & $requestAbort 'A7:OPERATOR_CANCEL' }
            $tbl = Get-LspMinCimTable -TimeoutSec 5
            if ($null -eq $tbl) { $sup.cimFailures++ }
            else {
                $present = @{}
                $desc = Get-LspMinDescendantCim $parentPid $runnerStart $tbl
                foreach ($d in $desc) {
                    $key = '{0}|{1}' -f $d.ProcessId, $d.CreationDate.ToUniversalTime().ToString('o')
                    $present[$key] = $true
                    if (-not $trackedKeys.ContainsKey($key)) {
                        $ownerSid = Get-LspMinOwnerSid -Process $d -TimeoutSec 5
                        $r2 = [ordered]@{ role = 'descendant'; processId = [int]$d.ProcessId; parentProcessId = [int]$d.ParentProcessId; exePath = $d.ExecutablePath; commandLine = $d.CommandLine; startUtc = $d.CreationDate.ToUniversalTime().ToString('o'); endUtc = $null; ownerSid = $ownerSid; snapshotUtc = [DateTime]::UtcNow.ToString('o') }
                        [void]$tracked.Add($r2); $trackedKeys[$key] = $r2
                    }
                }
                foreach ($k in @($trackedKeys.Keys)) { $r3 = $trackedKeys[$k]; if ($null -eq $r3.endUtc -and -not $present.ContainsKey($k) -and $r3.role -eq 'descendant') { $r3.endUtc = [DateTime]::UtcNow.ToString('o') } }
            }
            if ($resultState -ne 'ACCEPTED' -and (Test-Path -LiteralPath $resultFile)) {
                $o2 = $null
                try { $o2 = Read-IsoJson -Path $resultFile } catch { if ($resultState -eq 'NONE') { $resultState = 'UNREADABLE' } }
                if ($null -ne $o2) {
                    if ([string](Get-IsoProp $o2 'runToken') -ceq $runToken) { $resultObj = $o2; $resultState = 'ACCEPTED'; $resultSeenAt = [DateTime]::UtcNow }
                    else { $resultState = 'TOKEN_MISMATCH' }
                }
            }
            $alive = [bool](Get-Process -Id $parentPid -ErrorAction SilentlyContinue)
            if (-not $alive -and $null -eq $runnerGoneAt) { $runnerGoneAt = [DateTime]::UtcNow }
            $act = Get-LspMinSupervisorAction -ElapsedMs ([int]$sw.ElapsedMilliseconds) -Limits $limitsDoc -ResultSeen ($resultState -eq 'ACCEPTED') -RunnerAlive $alive -AbortRequestedAtMs $sup.abortRequestedAtMs -ForceKilledAtMs $sup.forcedKillAtMs -StartAllowanceMs $StartAllowanceMs -GraceMs $SupervisorGraceMs
            if ($act -eq 'REQUEST_ABORT') { $sup.deadlineReached = $true; & $requestAbort 'A7:SUPERVISOR_DEADLINE' }
            elseif ($act -eq 'FORCE_KILL') { & $forceKill ('ABORT_NOT_FOLLOWED:' + [string]$sup.abortReason) }
            elseif ($act -eq 'GIVE_UP') { $giveUp = $true; break }
            if ($resultState -eq 'ACCEPTED' -and -not $alive) { break }
            if ($resultState -eq 'ACCEPTED' -and $null -ne $resultSeenAt -and ([DateTime]::UtcNow - $resultSeenAt).TotalSeconds -gt 5) { break }
            if (-not $alive -and $resultState -ne 'ACCEPTED' -and $null -ne $runnerGoneAt -and ([DateTime]::UtcNow - $runnerGoneAt).TotalSeconds -gt 3) { break }
            Start-Sleep -Milliseconds 40
        }
        $sup.elapsedAtEndMs = [int]$sw.ElapsedMilliseconds
        if ($giveUp) { [void]$report.notes.Add('감독 종료 뒤 안정 시간이 지났다. 아래 정리에서 전용 계정의 프로세스를 다시 확인한다.') }
        # 마지막으로 수신기를 한 번 더 비우고, 남은 기록의 종료 시각을 채운다.
        Start-Sleep -Milliseconds 300
        $rf = Read-LspMinReceiver -Receiver $receiver
        if (-not $rf.ok) { & $requestAbort 'A3:RECEIVER_UNREADABLE' } elseif ($rf.newHits -gt 0) { & $requestAbort 'A3:RECEIVER_HIT' }
        $recv.samples = $receiver.samples; $recv.failures = $receiver.failures; $recv.lastError = $receiver.lastError; $recv.hitEndpoints = @($receiver.hits)
        if ($rf.ok) { $recv.finalHits = $receiver.hits.Count }
        foreach ($t in $tracked) { if ($null -eq $t.endUtc -and -not (Get-Process -Id $t.processId -ErrorAction SilentlyContinue)) { $t.endUtc = [DateTime]::UtcNow.ToString('o') } }
        if ($runnerRec -and $null -eq $runnerRec.endUtc -and $resultObj) { $fu = Get-IsoProp $resultObj 'finishedUtc'; if ($fu) { try { $runnerRec.endUtc = (ConvertTo-UtcDate $fu).ToString('o') } catch { } } }
        $report.supervisor = $sup

        # ── 결과 결합과 신원 교차 확인(자기 보고 ↔ 요청 ↔ 관리자 CIM) ──
        $rrFile = Join-Path $Script:IsoRunDir "lsp-min-runner-result-$stamp.json"
        if ($resultState -ne 'NONE' -and (Test-Path -LiteralPath $resultFile)) {
            try { $resultRawBytes = [IO.File]::ReadAllBytes($resultFile); Invoke-Mutation -Description '러너 결과 원문을 실행 기록 폴더에 보관' -Action { [IO.File]::WriteAllBytes($rrFile, $resultRawBytes) } | Out-Null } catch { [void]$report.notes.Add('러너 결과 원문을 보관하지 못했다: ' + $_.Exception.Message); $rrFile = $null }
        } else { $rrFile = $null }
        if ($resultState -eq 'ACCEPTED') {
            $bindingFailures = Test-LspMinResultBinding -Result $resultObj -Request $reqDoc -RunId $runId -LaunchedUtc $launchedUtc
        } elseif ($resultState -eq 'TOKEN_MISMATCH') { $bindingFailures = @('TOKEN_MISMATCH') }
        $report.binding = [ordered]@{ resultState = $resultState; ok = ($resultState -eq 'ACCEPTED' -and $bindingFailures.Count -eq 0); failures = $bindingFailures; token = $runToken }
        $refused = $null; if ($resultObj) { $refused = [string](Get-IsoProp $resultObj 'refused') }

        $fail = New-Object System.Collections.ArrayList
        $addF = { param([string]$Code, [string]$Msg); [void]$fail.Add([ordered]@{ code = $Code; message = $Msg }) }
        $same = { param($a, $b); ($null -ne $a) -and ($null -ne $b) -and ([string]$a).Equals([string]$b, [StringComparison]::OrdinalIgnoreCase) }
        $childRec = $null
        if ($resultState -ne 'ACCEPTED') { & $addF 'NO_ACCEPTED_RESULT' "받아들일 러너 결과 파일이 없다(상태 $resultState)" }
        else {
            if (-not $runnerRec) { & $addF 'NO_RUNNER_CIM' '실행기 프로세스의 CIM 기록이 없다' }
            else {
                if ($runnerRec.ownerSid -ne $sid) { & $addF 'RUNNER_OWNER_MISMATCH' "실행기 소유 SID 가 전용 계정이 아니다($($runnerRec.ownerSid))" }
                if (-not (& $same $runnerRec.exePath $Script:Ps51)) { & $addF 'RUNNER_EXE_MISMATCH' "실행기 실행 파일이 기대와 다르다($($runnerRec.exePath))" }
                if ((ConvertTo-UtcDate $runnerRec.startUtc) -lt $launchedUtc.AddSeconds(-2)) { & $addF 'RUNNER_STARTED_BEFORE_LAUNCH' '실행기 시작 시각이 이번 실행 시작보다 이르다' }
            }
            $rself = Get-IsoProp $resultObj 'runner'
            if ([int](Get-IsoProp $rself 'pid') -ne $parentPid) { & $addF 'SELF_PID_MISMATCH' '실행기 자기 보고 PID 가 CIM 의 PID 와 다르다' }
            if ((Get-IsoProp $rself 'sid') -ne $sid) { & $addF 'SELF_SID_MISMATCH' '실행기 자기 보고 SID 가 전용 계정이 아니다' }
            if (-not (& $same (Get-IsoProp $rself 'exe') $Script:Ps51)) { & $addF 'SELF_EXE_MISMATCH' '실행기 자기 보고 실행 파일이 기대와 다르다' }
            $cinfo = Get-IsoProp $resultObj 'child'
            if (-not [bool](Get-IsoProp $cinfo 'started')) {
                if (-not $refused) { & $addF 'CHILD_NOT_STARTED' '실행기가 자식을 시작하지 못했다' }
            } else {
                $cpid = [int](Get-IsoProp $cinfo 'pid')
                $cands = @($tracked | Where-Object { $_.role -eq 'descendant' -and $_.processId -eq $cpid })
                if ($cands.Count -lt 1) { & $addF 'CHILD_CIM_MISSING' "자식(PID $cpid)의 CIM 기록을 관리자 쪽에서 잡지 못했다(너무 빨리 끝났거나 놓쳤다)" }
                else {
                    $childRec = $cands[0]
                    if ($childRec.parentProcessId -ne $parentPid) { & $addF 'CHILD_PARENT_MISMATCH' '자식의 부모 PID 가 실행기가 아니다' }
                    if ($childRec.ownerSid -ne $sid) { & $addF 'CHILD_OWNER_MISMATCH' "자식 소유 SID 가 전용 계정이 아니다($($childRec.ownerSid))" }
                    if (-not (& $same $childRec.exePath $exe)) { & $addF 'CHILD_EXE_MISMATCH' "자식 실행 파일이 기대와 다르다($($childRec.exePath))" }
                    $cl = ([string]$childRec.commandLine).Replace('"', '').Trim()
                    $wantCl = ($exe + ' ' + ($argv -join ' ')).Replace('"', '').Trim()
                    if (-not $cl.Equals($wantCl, [StringComparison]::OrdinalIgnoreCase)) { & $addF 'CHILD_COMMANDLINE_MISMATCH' "자식 명령줄이 기대와 다르다(실제: $cl)" }
                    $selfStart = Get-IsoProp $cinfo 'startUtc'
                    if ($selfStart) { $dt = [Math]::Abs(((ConvertTo-UtcDate $selfStart) - (ConvertTo-UtcDate $childRec.startUtc)).TotalSeconds); if ($dt -gt 3) { & $addF 'CHILD_START_MISMATCH' "자식 시작 시각이 자기 보고와 CIM 에서 ${dt}초 다르다" } }
                    $mm = Get-IsoProp $cinfo 'mainModule'
                    if ($mm -and -not (& $same $mm $exe)) { & $addF 'CHILD_MAINMODULE_MISMATCH' '자식 자기 보고 실행 파일이 요청과 다르다' }
                }
            }
        }
        $identityFailures = @($fail | ForEach-Object { $_.code })
        $report.identity = [ordered]@{
            ok = ($fail.Count -eq 0); failures = @($fail)
            checked = @('결과 토큰·모드·요청 반향·시작 시각(결합)', '실행기 CIM: 소유 SID = 전용 계정, 실행 파일 = powershell.exe 5.1, 시작 시각', '실행기 자기 보고(PID·SID·경로) = CIM', '자식 CIM: 존재·부모 = 실행기·소유 SID = 전용 계정·실행 파일 = 요청한 파일·명령줄 = 요청한 인자·시작 시각 = 자기 보고')
        }
        $report.processes = @($tracked)
        $allowedDirs = @((Join-Path $env:WINDIR 'System32')); if ($venvRoot) { $allowedDirs += $venvRoot }; if ($baseHome) { $allowedDirs += $baseHome }
        $pathViol = Get-LspMinDescendantPathViolations -Tracked @($tracked) -AllowedDirs $allowedDirs

        # 원시 stdout·stderr 바이트 보관과 러너 결과 요약
        if ($resultObj) {
            $so = Get-IsoProp $resultObj 'stdout'; $se = Get-IsoProp $resultObj 'stderr'
            $outBytes = [byte[]]@(); $errBytes = [byte[]]@()
            try { if ($so -and (Get-IsoProp $so 'b64')) { $outBytes = [Convert]::FromBase64String([string](Get-IsoProp $so 'b64')) } } catch { [void]$report.notes.Add('stdout b64 를 풀지 못했다') }
            try { if ($se -and (Get-IsoProp $se 'b64')) { $errBytes = [Convert]::FromBase64String([string](Get-IsoProp $se 'b64')) } } catch { [void]$report.notes.Add('stderr b64 를 풀지 못했다') }
            Invoke-Mutation -Description '원시 stdout·stderr 바이트를 실행 기록 폴더에 보관' -Action {
                [IO.File]::WriteAllBytes((Join-Path $Script:IsoRunDir "lsp-min-stdout-$stamp.bin"), $outBytes)
                [IO.File]::WriteAllBytes((Join-Path $Script:IsoRunDir "lsp-min-stderr-$stamp.bin"), $errBytes)
            } | Out-Null
            $report.runnerResult = [ordered]@{
                file = $rrFile; sha256 = $(if ($rrFile -and (Test-Path -LiteralPath $rrFile)) { Get-FileSha256Hex -Path $rrFile }); refused = (Get-IsoProp $resultObj 'refused'); refusals = @(Get-IsoProp $resultObj 'refusals'); error = (Get-IsoProp $resultObj 'error'); errorPhase = (Get-IsoProp $resultObj 'errorPhase')
                trigger = (Get-IsoProp $resultObj 'trigger'); also = @(Get-IsoProp $resultObj 'also'); abort = (Get-IsoProp $resultObj 'abort'); sendsShapeOk = [bool](Test-LspMinSendsShape $resultObj)
                kill = (Get-IsoProp $resultObj 'kill'); exit = (Get-IsoProp $resultObj 'exit'); stdoutBytes = $outBytes.Length; stderrBytes = $errBytes.Length
                cleanup = (Get-IsoProp $resultObj 'cleanup'); timeline = (Get-IsoProp $resultObj 'timeline'); descendantsSeen = @(Get-IsoProp $resultObj 'descendantsSeen')
                note = '러너의 자기 보고다. 판정은 아래 reinterpretation(TS 재해석)이 원문 바이트로 다시 한다.'
            }
        }
        if ($sup.forcedKill) { [void]$failTokens.Add('SUPERVISOR_FORCED_KILL') }
        if ($sup.deadlineReached) { [void]$failTokens.Add('SUPERVISOR_DEADLINE_ABORT') }
        if ($sup.abortReason -eq 'A7:OPERATOR_CANCEL' -or ($sup.requests -contains 'A7:OPERATOR_CANCEL')) { [void]$failTokens.Add('OPERATOR_CANCELLED') }
        if ($null -ne $recv.finalHits -and $null -ne $recv.baselineHits -and $recv.finalHits -gt $recv.baselineHits) { [void]$failTokens.Add('RECEIVER_HIT') }
        if ($recv.failures -gt 0 -or $null -eq $recv.finalHits) { [void]$failTokens.Add('RECEIVER_UNREADABLE') }
        if ($sup.abortFile.attempts -gt 0 -and $sup.abortFile.delivered -ne $true) { [void]$failTokens.Add('ABORT_DELIVERY_FAILED') }
        if ($resultState -eq 'NONE') { [void]$failTokens.Add('RUNNER_NO_RESULT') } elseif ($resultState -eq 'UNREADABLE') { [void]$failTokens.Add('RESULT_UNREADABLE') }
        if ($report.binding.ok -ne $true -and $resultState -ne 'NONE' -and $resultState -ne 'UNREADABLE') { [void]$failTokens.Add('RESULT_BINDING_FAILED') }
        if ($resultState -eq 'ACCEPTED' -and -not $report.identity.ok) { [void]$failTokens.Add('IDENTITY_UNVERIFIED') }
        if ($refused) { [void]$failTokens.Add('RUNNER_REFUSED') }
        if ($pathViol.Count -gt 0) { [void]$failTokens.Add('DESCENDANT_PATH_UNEXPECTED') }
        $report.pathViolations = $pathViol

        # 실행 뒤 파일 해시(읽기): 실행 파일·core·python 이 바뀌지 않았는지.
        $hashesAfter = [ordered]@{}
        if ($Mode -eq 'semgrep-lsp') {
            # 다시 읽지 못한 파일은 null 해시가 되어 실행 전 해시와 달라진다(= 바뀐 것으로 센다. 읽지 못했는데 같다고 하지 않는다).
            $shaNow = { param($p) $ff = Get-LspMinFileFacts -Path $p; if ($ff) { $ff.sha256 } else { $null } }
            $hashesAfter = [ordered]@{ semgrepExe = (& $shaNow $SemgrepExe); semgrepCore = (& $shaNow $corePath); venvPython = $(if (Test-Path -LiteralPath $venvPython) { Get-FileSha256Hex -Path $venvPython }); basePython = $(if ($basePython -and (Test-Path -LiteralPath $basePython)) { Get-FileSha256Hex -Path $basePython }) }
        }
        $hashesUnchanged = $true
        foreach ($k in $hashesBefore.Keys) { if ([string]$hashesBefore[$k] -ne [string]$hashesAfter[$k]) { $hashesUnchanged = $false } }
        $report.hashes = [ordered]@{ before = $hashesBefore; after = $hashesAfter; unchanged = $hashesUnchanged }
        if (-not $hashesUnchanged) { [void]$failTokens.Add('HASH_CHANGED') }

        # ── 루프백 수신 건수(관리자 쪽에서 직접 센 값). 0건은 외부 통신이 없었다는 뜻이 아니다. ──
        $report.receiver = [ordered]@{ baselineHits = $recv.baselineHits; finalHits = $recv.finalHits; samples = $recv.samples; failures = $recv.failures; lastError = $recv.lastError; hitEndpoints = $recv.hitEndpoints; listener = $recv.listener; meaning = '루프백 주소로 온 연결만 센다. 0건이라도 외부 통신이 없었다는 증거가 아니다. 읽기에 실패했으면 finalHits 는 null 이다(0 이 아니다).' }

        # ── OS 차단 관측(5157): 이번 실행의 프로세스에 귀속된 것, 식별 불가, 루프백 건수를 따로 적는다. ──
        Start-Sleep -Seconds 2
        $auditNow = Get-IsoAuditFailureState
        $ev = [ordered]@{ collection = [ordered]@{ ok = $false; error = $null; auditFailureEnabled = $auditNow; wrapped = $null }; processRecordsOk = ($tracked.Count -gt 0); countsUsable = $false; attributedCount = $null; attributed = $null; unidentifiedCount = $null; unidentifiedSummary = $null; unusableBecause = @()
            caveat = '프로세스 기록은 관리자 쪽 CIM 폴링으로 모았다. 그 사이에 끝난 프로세스의 5157 은 식별 불가로 남는다. 허용된 연결(루프백 등)은 이 로그에 남지 않는다.' }
        $attr = $null; $unid = $null
        if ($ev.processRecordsOk) {
            $st = Get-SecurityLogState
            if (-not $st.ok) { $ev.collection.error = $st.error }
            else {
                $ev.collection.wrapped = ($null -ne $st.oldestRecordNumber -and [long]$st.oldestRecordNumber -gt ([long]$base.lastRecordId + 1))
                $got = Get-WfpBlockEvents -AfterRecordId ([long]$base.lastRecordId)
                if (-not $got.ok) { $ev.collection.error = $got.error }
                else {
                    $ev.collection.ok = $true
                    $sel = Select-MatchingBlockEvents -Events @($got.events) -Processes @($tracked) -Probes @() -DosMap (Get-NtToDosMap)
                    $attributedEv = @($sel.runOtherDestination); $attr = $attributedEv.Count; $unid = @($sel.unidentified).Count
                    $summ = { param($e) [ordered]@{ recordId = $e.recordId; processId = $e.processId; timeUtc = $e.timeUtc.ToString('o'); direction = $e.direction; protocol = $e.protocol; destAddress = $e.destAddress; destPort = $e.destPort; application = $e.application; filterRtid = $e.filterRtid } }
                    $ev.attributed = @($attributedEv | ForEach-Object { & $summ $_ })
                    $ev.unidentifiedSummary = @($sel.unidentified | ForEach-Object { [ordered]@{ recordId = $_.event.recordId; processId = $_.event.processId; direction = $_.event.direction; protocol = $_.event.protocol; destPort = $_.event.destPort; reasons = @($_.reasons) } })
                }
            }
        } else { $ev.collection.error = '필수 프로세스 기록이 없다(이벤트 0건과 다르다)' }
        $cnt = Get-LspMinOsBlockCounts -CollectionOk ([bool]$ev.collection.ok) -AuditFailureEnabled $auditNow -LogWrapped $ev.collection.wrapped -AttributedCount $attr -UnidentifiedCount $unid
        $ev.countsUsable = $cnt.usable; $ev.attributedCount = $cnt.attributed; $ev.unidentifiedCount = $cnt.unidentified; $ev.unusableBecause = $cnt.unusableBecause
        if (-not $cnt.usable) { $ev.attributed = $null; $ev.unidentifiedSummary = $null }
        $ev.loopbackHits = $recv.finalHits
        $report.osBlockObservation = $ev
        # 차단 이벤트 증거가 확실하지 않거나 귀속된 이벤트가 있으면 관측은 성립하지 않는다(기록은 건수를 0 으로 채우지 않고 사유를 적는다).
        foreach ($tk in (Get-LspMinOsBlockFailureTokens -Counts $cnt)) { [void]$failTokens.Add($tk) }

        # ── 재해석에 넘길 관리자 문맥(러너 결과 원문과 짝). 재해석 도구 호출은 정리가 끝난 뒤에 한다(도구가 멈춰도 계정·감사 창·수신기가 열린 채 남지 않게). ──
        $ctxDoc = New-LspMinAdminContext -RunId $runId -Token $runToken -Mode $Mode -ExpectedVersion $ExpectedVersion -Limits $limitsDoc -ReceiverBaseline $recv.baselineHits -ReceiverFinal $recv.finalHits -ReceiverSamples $recv.samples -ReceiverFailures $recv.failures `
            -IdentityOk ([bool]$report.identity.ok) -IdentityFailures $identityFailures -BindingOk ([bool]$report.binding.ok) -BindingFailures $bindingFailures `
            -AbortRequested ($null -ne $sup.abortRequestedAtMs) -AbortReason $sup.abortReason -AbortDelivered $sup.abortFile.delivered -ForcedKill ([bool]$sup.forcedKill) -DeadlineReached ([bool]$sup.deadlineReached) -ResultMissing ($resultState -eq 'NONE' -or $resultState -eq 'UNREADABLE') `
            -DescendantPathViolations @($pathViol | ForEach-Object { 'pid=' + $_.processId }) -HashesUnchanged $hashesUnchanged -OsBlock $cnt
        $ctxFile = Join-Path $Script:IsoRunDir "lsp-min-admin-context-$stamp.json"
        Invoke-Mutation -Description '관리자 문맥(수신기·신원·결합·감독·5157 요약) 쓰기' -Action { Write-IsoJson -Path $ctxFile -Object $ctxDoc -Depth 8 } | Out-Null
        $reint.contextFile = $ctxFile
    } catch {
        if (-not $report.error) { $report.error = $_.Exception.Message }
        Write-IsoLog -Level 'FAIL' -Message ('실행 중 오류: ' + $_.Exception.Message)
        $verdict = 'NOT_ESTABLISHED'
        if ($_.Exception.Message -ne 'RECEIVER_NOT_READY') { [void]$failTokens.Add('ADMIN_ERROR') }
        if ($_.Exception.Message -eq 'RECEIVER_NOT_READY') { $verdict = 'NOT_ATTEMPTED:RECEIVER_NOT_READY' }
    } finally {
        # ── 정리: 항목마다 독립 실행·결과 기록. 하나가 실패해도 나머지를 건너뛰지 않는다. 프로세스 정리와 시스템 복구는 이름으로 구분한다. ──
        $cleanup = New-Object System.Collections.ArrayList
        [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'listener-stop' -Action { if ($receiver) { Stop-LspMinReceiver -Receiver $receiver } }))
        [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'process-cleanup' -Action {
                    # 추적한 PID(소유 SID·시작 시각이 기록과 같은 것)를 먼저 끝내고, 그다음 계정 이름 열거로 찾은 나머지를 끝낸다. 열거가 실패하면 확인하지 못한 것이므로 정리 실패다.
                    $killed = New-Object System.Collections.ArrayList
                    foreach ($tr in @($tracked)) {
                        $left0 = Get-LspMinProcessRecord -ProcessId ([int]$tr.processId) -Role 'cleanup' -TimeoutSec 5
                        if ($left0 -and $left0.ownerSid -eq $sid -and $left0.startUtc -eq $tr.startUtc) { $procId = [int]$tr.processId; [void]$killed.Add($procId); try { Invoke-Mutation -Description "전용 계정의 남은 프로세스 종료(추적): pid=$procId" -Action { Stop-Process -Id $procId -Force -ErrorAction Stop } | Out-Null } catch { } }
                    }
                    $cand = & $findAccountProcs
                    foreach ($c in $cand) { $procId = [int]$c.Id; if ($killed.Contains($procId)) { continue }; [void]$killed.Add($procId); try { Invoke-Mutation -Description "전용 계정의 남은 프로세스 종료: pid=$procId $($c.ProcessName)" -Action { Stop-Process -Id $procId -Force -ErrorAction Stop } | Out-Null } catch { } }
                    Start-Sleep -Milliseconds 500
                    $still = & $findAccountProcs
                    $stillTracked = @(); foreach ($t in $tracked) { $left = Get-LspMinProcessRecord -ProcessId ([int]$t.processId) -Role 'cleanup' -TimeoutSec 5; if ($left -and $left.ownerSid -eq $sid -and $left.startUtc -eq $t.startUtc) { $stillTracked += $t.processId } }
                    $okP = (@($still).Count -eq 0 -and $stillTracked.Count -eq 0); $oc = 'NONE_LEFT'; if (-not $okP) { $oc = 'STILL_RUNNING' }
                    [ordered]@{ ok = $okP; outcome = $oc; error = $(if ($okP) { $null } else { '종료하지 못한 프로세스: ' + ((@($still | ForEach-Object { $_.Id }) + $stillTracked) -join ',') }); killedByAdminCleanup = @($killed) }
                }))
        if ($accountTouched) { [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'account-disable' -Action { Disable-IsoAccount -UserName $uname })) }
        for ($i = $auditSteps.Count - 1; $i -ge 0; $i--) {
            $stp = $auditSteps[$i]
            [void]$cleanup.Add((Invoke-IsoCleanupStep -Name ('audit-restore ' + [string]$stp.name) -Action { Close-IsoAuditWindow -Step $stp }))
        }
        foreach ($ci in $cleanup) { if (-not $ci.ok) { Write-IsoLog -Level 'FAIL' -Message ("정리 실패: {0} → {1} {2}" -f $ci.name, $ci.outcome, $ci.error) } }
    }

    # ── TS 재해석: 정리가 모두 끝난 뒤에 한다(도구가 오래 걸려도 계정·감사 창·수신기가 이미 되돌려졌다). 러너 결과 원문 + 관리자 문맥 → 기록. 도구가 없거나 결과가 없으면 관측은 성립하지 않는다. ──
    if ($ctxFile) {
        $recordFile = Join-Path $Script:IsoRunDir "lsp-min-record-$stamp.json"
        if (-not $rrFile -or -not (Test-Path -LiteralPath $rrFile)) { $reint.reason = 'NO_RUNNER_RESULT_FILE' }
        elseif (-not $toolsReady) { $reint.reason = 'TOOLS_MISSING' }
        else {
            $ri = Invoke-LspMinReinterpret -TsxCmd $TsxCmd -NodeDir $NodeDir -CliTs $ReinterpretCli -RunnerResultPath $rrFile -ContextPath $ctxFile -OutPath $recordFile
            $reint.exitCode = $ri.exitCode; $reint.output = $ri.output; if ($ri.error) { $reint.reason = $ri.error }
            if ($ri.ran -and $ri.exitCode -eq 0 -and (Test-Path -LiteralPath $recordFile)) {
                try { $recordObj = Read-IsoJson -Path $recordFile; $reint.status = 'RUN'; $reint.recordFile = $recordFile } catch { $reint.status = 'FAILED'; $reint.reason = '기록 파일을 읽지 못했다: ' + $_.Exception.Message }
            } else { $reint.status = 'FAILED'; if (-not $reint.reason) { $reint.reason = "도구 종료 코드 $($ri.exitCode)" } }
        }
        if ($recordObj) { $rec = Get-IsoProp $recordObj 'record' }
        if ($reint.status -eq 'RUN' -and $rec) {
            $reint.recordStatus = Get-IsoProp $rec 'status'; $reint.statusReasons = @(Get-IsoProp $rec 'status_reasons'); $reint.adminReasons = @(Get-IsoProp (Get-IsoProp $recordObj 'admin') 'externalReasons')
            $reint.terminationPath = Get-IsoProp (Get-IsoProp $rec 'termination') 'path'
            if ($reint.recordStatus -ne 'OBSERVED') { [void]$failTokens.Add('RECORD_' + [string]$reint.recordStatus); foreach ($sr in @($reint.statusReasons)) { [void]$failTokens.Add('REASON:' + [string]$sr) } }
        } elseif ($reint.status -eq 'FAILED') { [void]$failTokens.Add('REINTERPRETATION_FAILED') }
        elseif ($resultState -eq 'ACCEPTED' -or $resultState -eq 'TOKEN_MISMATCH') { [void]$failTokens.Add('REINTERPRETATION_NOT_RUN') }
        $report.reinterpretation = $reint
        $fs0 = Get-LspMinFailureSummary -Tokens @($failTokens)
        $established = ($fs0.all.Count -eq 0 -and $reint.status -eq 'RUN' -and $reint.recordStatus -eq 'OBSERVED')
        $verdictCore = $(if ($established) { 'LSP_MIN_OBSERVED' } elseif ($reint.recordStatus -eq 'ABORTED') { 'LSP_MIN_ABORTED' } else { 'NOT_OBSERVED:' + $fs0.primary })
        if ($Mode -eq 'stub') { $verdict = 'STUB_' + $verdictCore } else { $verdict = $verdictCore }
    }

    $groups = Group-LspMinCleanupItems -Items @($cleanup)
    $report.processCleanup = $groups.processCleanup
    $report.systemRecovery = $groups.systemRecovery
    $fsum = Get-LspMinFailureSummary -Tokens @($failTokens)
    # 관측의 성립 여부, 프로세스 정리, 시스템 복구는 따로 기록한다. 서로의 결과를 바꾸지 않는다.
    # 관측을 막지는 않지만 증거의 빈틈이 되는 신호(성립 여부와 따로 적는다): 관리자 쪽 프로세스 표 읽기 실패, 러너가 치우지 못해 관리자 정리가 끝낸 잔존 프로세스.
    $caveats = New-Object System.Collections.ArrayList
    if ($sup.cimFailures -gt 0) { [void]$caveats.Add("PROCESS_TABLE_READ_FAILED:$($sup.cimFailures)") }
    $pcItem = @($groups.processCleanup.items | Where-Object { $_.name -eq 'process-cleanup' }) | Select-Object -First 1
    $killedAdmin = $null; if ($pcItem) { $killedAdmin = Get-IsoProp (Get-IsoProp $pcItem 'detail') 'killedByAdminCleanup' }
    if ($killedAdmin -and @($killedAdmin).Count -gt 0) { [void]$caveats.Add('LEFTOVER_PROCESSES_ENDED_BY_ADMIN_CLEANUP') }
    $report.observation = [ordered]@{ caveats = @($caveats); established = [bool]$established; verdict = $verdict; failure = $fsum.primary; failures = $fsum.all; recordStatus = $(if ($report.reinterpretation) { Get-IsoProp $report.reinterpretation 'recordStatus' }); terminationPath = $(if ($report.reinterpretation) { Get-IsoProp $report.reinterpretation 'terminationPath' }) }
    $exitCode = Get-LspMinAdminExitCode -Established ([bool]$established) -ProcessCleanupOk ([bool]$groups.processCleanup.ok) -SystemRecoveryOk ([bool]$groups.systemRecovery.ok)
    $finalStatus = $(if ($exitCode -eq 70) { 'CLEANUP_INCOMPLETE' } elseif ($established) { $verdict } else { 'NOT_ESTABLISHED' })
    $report.verdict = $verdict; $report.finalStatus = $finalStatus
    $report.finishedUtc = [DateTime]::UtcNow.ToString('o')
    $report.auditWindows = @($auditSteps | ForEach-Object { [ordered]@{ guid = $_.name; state = $_.state; original = (Get-IsoProp $_.detail 'original'); set = (Get-IsoProp $_.detail 'set') } })
    $out = Join-Path $Script:IsoRunDir ("lsp-min-observation-$stamp.json")
    try { Write-IsoJson -Path $out -Object $report -Depth 12 } catch { Write-IsoLog -Level 'FAIL' -Message ('보고서를 쓰지 못했다: ' + $_.Exception.Message); $exitCode = 70; $out = $null }

    Write-Host ''
    Write-Host "판정: $verdict   (범위: LSP-MIN-1 최소 기동 관측 1회. 규칙·스캔·DNS·UDP·ICMP·IPv6 는 관측하지 않았다)"
    Write-Host ("관측: {0}   실패 토큰: {1}" -f $(if ($established) { '성립' } else { '성립하지 않음' }), $(if ($report.observation.failure) { ((@($report.observation.failures)) -join ',') } else { '없음' }))
    Write-Host ("프로세스 정리: {0}   시스템 복구: {1}   최종 상태: {2}" -f $(if ($groups.processCleanup.ok) { '완료' } else { '불완전' }), $(if ($groups.systemRecovery.ok) { '완료' } else { '불완전' }), $finalStatus)
    if ($report.identity) { Write-Host ("  신원 교차 확인: {0}{1}" -f $(if ($report.identity.ok) { '통과' } else { '실패' }), $(if (-not $report.identity.ok) { ' [' + ((@($report.identity.failures) | ForEach-Object { $_.code }) -join ', ') + ']' } else { '' })) }
    if ($report.supervisor) { Write-Host ("  감독: 중단 요청={0} 강제 종료={1} 중단 파일 전달={2}" -f $report.supervisor.abortReason, $report.supervisor.forcedKill, $report.supervisor.abortFile.delivered) }
    if ($report.receiver) { Write-Host ("  루프백 수신기: 기준 {0} → 최종 {1} (읽기 실패 {2}회)" -f $report.receiver.baselineHits, $report.receiver.finalHits, $report.receiver.failures) }
    if ($report.osBlockObservation) {
        $o = $report.osBlockObservation
        $ac = '수집 불가(0 아님)'; if ($null -ne $o.attributedCount) { $ac = [string]$o.attributedCount }
        $ui = '수집 불가'; if ($null -ne $o.unidentifiedCount) { $ui = [string]$o.unidentifiedCount }
        Write-Host ("  OS 차단 관측: 수집 ok={0} 감사 켜짐={1} 로그 밀림={2}  귀속된 5157={3}  식별 불가={4}" -f $o.collection.ok, $o.collection.auditFailureEnabled, $o.collection.wrapped, $ac, $ui)
    }
    if ($out) { Write-Host "결과 파일: $out" }
    @{ exitCode = $exitCode; report = $report; reportFile = $out }
}

$limitsIn = [ordered]@{ totalMs = $TotalMs; initMs = $InitMs; exitMs = $ExitMs; stdinCloseGraceMs = $StdinCloseGraceMs; killConfirmMs = $KillConfirmMs; maxStdoutBytes = $MaxStdoutBytes; maxStderrBytes = $MaxStderrBytes; sampleIntervalMs = $SampleIntervalMs }
$r = @(Invoke-LspMinObservation -RunDir $RunDir -Execute ([bool]$Execute) -Mode $Mode -StubScenario $StubScenario -DistRoot $DistRoot -SemgrepExe $SemgrepExe -ExpectedExeSha256 $ExpectedExeSha256 -ExpectedCoreSha256 $ExpectedCoreSha256 -WheelPath $WheelPath -ExpectedWheelSha256 $ExpectedWheelSha256 `
        -DistReport $DistReport -ExpectedVersion $ExpectedVersion -TsxCmd $TsxCmd -NodeDir $NodeDir -ReinterpretCli $ReinterpretCli -CancelFile $CancelFile -Limits $limitsIn -StartAllowanceMs $StartAllowanceMs -SupervisorGraceMs $SupervisorGraceMs)[-1]
exit $r.exitCode
