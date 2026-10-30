<#
.SYNOPSIS
  LSP-RULES-1 규칙 로딩 관측의 관리자 진입점. 적용된 격리 안에서 전용 계정이 설치된 semgrep.exe 를 ["lsp","--debug"] 로 딱 한 번 띄워 initialize → initialized(정확히 1회) → 장벽 → 짧은 감시 → shutdown → exit 를 보내는 것을 감독하고 관측한다.
  내려받기 없이 해시 고정 프로브 규칙 파일 하나만 로컬 규칙으로 읽게 한다. 문서 알림·작업 영역 스캔·규칙 다운로드·대상 스캔은 하지 않는다. 좁은 용도의 진입점이며 범용 실행기가 아니다.
.DESCRIPTION
  기본은 읽기 전용 사전 확인과 계획 출력(dry-run)뿐이다. 계정 켜기·감사 창·수신기·자식 실행은 명시적 -Execute 없이는 하지 않는다. 이 스크립트는 서버와 직접 이야기하지 않는다: 보내는 일은 모두 러너(lsp-rules-runner.ps1)가 한다.
  LSP-MIN-1 진입점(Test-LspMinObservation.ps1)과 같은 틀이다(수신기, 감사 창, 5157 대조, 신원·결합 교차 확인, 중단 파일 전달, 부모 감독 루프, 세 결과의 분리). 다른 점:
  - 프로브: 저장소의 프로브 규칙 파일(-ProbeFile, 기본 scripts\semgrep-lsp\data\lsp-rules-1-probe.yaml)을 **아무것도 만들기 전에** 읽어 233바이트·고정 sha256 과 대조한다. 같은 바이트를 요청(probeB64)에 싣고, 러너가 규칙 폴더에 배타적으로 쓴다.
    복사 전 원본·복사 직후·실행 뒤 해시는 러너 결과에서 오고, 실행 뒤에는 관리자가 규칙 폴더의 그 파일을 직접 다시 읽어 잰 값과 합친다(읽지 못했거나 읽어도 되는지 확인하지 못했으면 해시를 모르는 것이고, 모르는 것은 성립하지 않는다).
  - 한도: 장벽 한도(-RulesMs 60000)·장벽 뒤 감시(-SettleMs 2000)·전체 150000ms 는 줄일 수만 있고 늘릴 수 없다. 실제 모드는 계약 값 그대로만 받는다. 자동 연장도 유예도 없다.
  - 작업 배치는 작업 폴더 아래 lsp-rules 다(LSP-MIN-1 의 lsp 와 섞지 않는다). 규칙 폴더·프로브 자리·상태 폴더를 포함한 모든 새 쓰기 목적지는 신뢰 루트부터 경로 조각마다 링크(정션·심볼릭 링크)가 없는지 확인한다. 이전 배치는 그 확인 뒤에만 지운다.
  - 판정의 본체는 TS 재해석(lsp-rules-reinterpret-cli.ts)이다: 러너 결과 원문 바이트와 이 스크립트가 모은 문맥(수신기·프로브 해시·신원·결합·감독·5157)을 다시 해석한다. 도구가 없으면 관측은 성립하지 않는다(REINTERPRETATION_NOT_RUN).
    서버를 띄우지 못한 경우(사전 조건·작업 경로·수신기·러너 실행 실패)에만 문맥의 runnerLaunched 가 false 이고 NOT_ATTEMPTED 다. 띄운 뒤의 신원·결합·해시 실패는 실행 사실을 지우지 않고 NOT_OBSERVED 로 남는다.
  - 보고는 섞지 않는다: 관측(observation) · 프로세스 정리(processCleanup) · 시스템 복구(systemRecovery) 는 서로의 결과를 바꾸지 않는다.
  종료 코드: 0 관측 성립 + 정리 완료 / 30 거부 / 50 사전 조건 실패 / 60 관측 성립하지 않음(정리는 완료) / 70 정리 불완전(프로세스 정리 또는 시스템 복구 실패).
  이 스크립트는 --help·--version 을 포함해 Semgrep 을 직접 실행하지 않는다. 실제 실행은 러너가 전용 계정으로 하며, 이 스크립트의 시험은 스텁 모드만 쓴다.
.EXAMPLE
  .\Test-LspRulesObservation.ps1 -RunDir <RunDir> -DistRoot <DistRoot> -SemgrepExe <DistRoot>\venv\Scripts\semgrep.exe -ExpectedExeSha256 <64hex> -WheelPath <whl> -ExpectedWheelSha256 <64hex> -DistReport <report.md>   # 사전 확인과 계획만
  .\Test-LspRulesObservation.ps1 -RunDir <RunDir> -Mode stub -StubScenario ok -ExpectedVersion 9.9.9 -Execute -TsxCmd <tsx.cmd> -NodeDir <node dir>                                                                  # 경로 점검(스텁)
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RunDir,
    [switch]$Execute,
    [ValidateSet('semgrep-lsp', 'stub')][string]$Mode = 'semgrep-lsp',
    [ValidateSet('ok', 'rules-zero', 'yaml-error', 'invalid-rule', 'wrong-file-loaded', 'notification-only', 'log-missing', 'log-variant', 'log-duplicate', 'order-violation', 'header-variants', 'json-dump-signal-text', 'engine-line-leak', 'download-line', 'registry-line', 'token-line', 'settings-line', 'publish-diagnostics', 'workspace-scan-line', 'early-signal', 'early-notification', 'initialize-error', 'error-response', 'version-mismatch', 'wrong-id', 'requests-2', 'request-disallowed', 'requests-3', 'request-malformed', 'delayed-forbidden', 'barrier-timeout', 'exit-ignored', 'exit-ignored-eof', 'nonzero-exit', 'stderr-split', 'stdout-split', 'flood-err', 'flood-out', 'orphan', 'write-ws', 'write-extra-rules', 'modify-probe', 'shutdown-reply', 'silent', 'silent-hold', 'exit-early', 'exit-during-refresh', 'garbage', 'env-names', 'spawn-disallowed', 'notification-twice', 'home-write')][string]$StubScenario = 'ok',
    [string]$DistRoot,
    [string]$SemgrepExe,
    [string]$ExpectedExeSha256,
    [string]$ExpectedCoreSha256,
    [string]$WheelPath,
    [string]$ExpectedWheelSha256,
    [string]$DistReport,
    [string]$ExpectedVersion = '1.180.0',
    [string]$ProbeFile,
    [string]$TsxCmd,
    [string]$NodeDir,
    [string]$ReinterpretCli,
    [string]$CancelFile,
    [int]$TotalMs = 150000,
    [int]$InitMs = 60000,
    [int]$RulesMs = 60000,
    [int]$SettleMs = 2000,
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
. (Join-Path $PSScriptRoot 'LspRulesContract.ps1')
. (Join-Path $PSScriptRoot 'LspMinAdminContract.ps1')
. (Join-Path $PSScriptRoot 'LspMinAdminPorts.ps1')
. (Join-Path $PSScriptRoot 'LspRulesAdminContract.ps1')
. (Join-Path $PSScriptRoot 'LspRulesAdminPorts.ps1')
$Script:EntryDir = $PSScriptRoot

function Invoke-LspRulesObservation {
    param(
        [string]$RunDir, [bool]$Execute, [string]$Mode, [string]$StubScenario, [string]$DistRoot, [string]$SemgrepExe, [string]$ExpectedExeSha256, [string]$ExpectedCoreSha256, [string]$WheelPath, [string]$ExpectedWheelSha256,
        [string]$DistReport, [string]$ExpectedVersion, [string]$ProbeFile, [string]$TsxCmd, [string]$NodeDir, [string]$ReinterpretCli, [string]$CancelFile, $Limits, [int]$StartAllowanceMs, [int]$SupervisorGraceMs
    )
    if (-not (Test-Path -LiteralPath $RunDir)) { Write-Host "RunDir 가 없다: $RunDir"; return @{ exitCode = 30 } }
    $Script:IsoRunDir = (Resolve-Path -LiteralPath $RunDir).Path
    $Script:ApplyMode = $Execute
    $manifestFile = Join-Path $Script:IsoRunDir 'resources.json'
    if (-not (Test-Path -LiteralPath $manifestFile)) { Write-Host '실행 기록(resources.json)이 없다. Initialize-Isolation.ps1 -Apply 가 먼저 필요하다.'; return @{ exitCode = 50 } }

    # ── 거부(30): 한도와 필수 인자. 실제 모드의 한도·감독 시간은 계약 값 그대로다(줄일 수도 없다). 어느 모드든 늘릴 수는 없다. ──
    if ($Mode -eq 'semgrep-lsp') {
        foreach ($k in $Script:LrAdminLimitNames) { if ([int]$Limits[$k] -ne [int]$Script:LrLimits[$k]) { Write-Host "semgrep-lsp 모드의 한도는 계약 값에 고정돼 있다($k): 거부한다."; return @{ exitCode = 30 } } }
        if ($StartAllowanceMs -ne $Script:LspMinAdminStartAllowanceMs -or $SupervisorGraceMs -ne $Script:LspMinAdminSupervisorGraceMs) { Write-Host 'semgrep-lsp 모드의 기동 허용·감독 유예는 계약 값에 고정돼 있다: 거부한다.'; return @{ exitCode = 30 } }
        if (-not $DistRoot -or -not $SemgrepExe -or -not $ExpectedExeSha256 -or -not $WheelPath -or -not $ExpectedWheelSha256 -or -not $DistReport) { Write-Host 'semgrep-lsp 모드는 -DistRoot -SemgrepExe -ExpectedExeSha256 -WheelPath -ExpectedWheelSha256 -DistReport 가 모두 필요하다.'; return @{ exitCode = 30 } }
        if ($null -eq (ConvertTo-LspMinSha256 $ExpectedExeSha256) -or $null -eq (ConvertTo-LspMinSha256 $ExpectedWheelSha256)) { Write-Host '기대 해시는 전체 64자리 16진수여야 한다(앞부분만 쓴 값은 거부한다).'; return @{ exitCode = 30 } }
        if ($ExpectedCoreSha256 -and $null -eq (ConvertTo-LspMinSha256 $ExpectedCoreSha256)) { Write-Host '-ExpectedCoreSha256 은 전체 64자리 16진수여야 한다.'; return @{ exitCode = 30 } }
    } else {
        foreach ($k in $Script:LrAdminLimitNames) { $v = [double]$Limits[$k]; if ($v -lt 1 -or $v -gt [double]$Script:LrLimits[$k]) { Write-Host "한도 값이 범위 밖이다($k): 거부한다."; return @{ exitCode = 30 } } }
        if ($StartAllowanceMs -lt 1 -or $SupervisorGraceMs -lt 1) { Write-Host '기동 허용·감독 유예는 1 이상이어야 한다.'; return @{ exitCode = 30 } }
    }

    $m = $null
    try { $m = Import-IsoManifest -Path $manifestFile } catch { Write-Host ('실행 기록(resources.json)을 읽지 못했다: ' + $_.Exception.Message) -ForegroundColor Yellow; return @{ exitCode = 50 } }
    $runId = [string]$m.runId
    $names = Get-IsoNames -RunId $runId
    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'")
    if ($runId -cnotmatch $Script:LspMinAdminRunIdPattern) { Write-Host 'RunId 형식이 올바르지 않다.'; return @{ exitCode = 30 } }
    if (-not $CancelFile) { $CancelFile = Join-Path $Script:IsoRunDir 'lsp-rules-cancel.flag' }
    if (-not $ProbeFile) { $ProbeFile = Join-Path (Join-Path (Join-Path $PSScriptRoot '..\..') 'semgrep-lsp') 'data\lsp-rules-1-probe.yaml' }
    $workDir = Join-Path $names.WorkDir 'work'
    $rulesWork = Join-LmPath $workDir $Script:LrAdminWorkLeaf
    $layout = Get-LrLayout -Work $rulesWork
    $reqFile = Join-Path $workDir 'lsp-rules-request.json'; $resultFile = Join-Path $workDir 'lsp-rules-result.json'; $abortFile = Join-Path $workDir 'lsp-rules-abort.flag'
    $limitsDoc = [ordered]@{}; foreach ($k in $Script:LrAdminLimitNames) { $limitsDoc[$k] = [int]$Limits[$k] }

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
    # 관리자 권한의 삭제·복사·쓰기는 신뢰하는 작업 루트(names.WorkDir, .owner 가 있는 곳) 아래에서만 한다. 전용 계정은 그 아래에 정션·링크를 만들 수 있으므로,
    # 작업 배치 안뿐 아니라 루트부터 모든 목적지(작업 폴더·작업 배치·상태 폴더들·규칙 폴더·프로브 자리·요청·결과·중단 표지·러너 사본)까지 이미 있는 경로 조각에 링크가 없고 읽을 수 있는지 먼저 본다.
    # 없는 경로는 검증한 기존 부모 아래에 만든다. 확인하지 못하면 아무것도 바꾸기 전에 거절한다(링크는 따라가지 않고 찾는다).
    $trustedRoot = $names.WorkDir
    $workProblems = Get-LrAdminWorkSafetyProblems -TrustedRoot $trustedRoot -WorkDir $workDir -RulesWork $rulesWork
    & $addPre 'T08' (@($workProblems).Count -eq 0) "작업 폴더 루트부터 목적지(규칙 폴더·프로브 자리 포함)까지 경로 조각과 이전 작업 배치에 정션·링크가 없고 모두 읽을 수 있는가 ($(@($workProblems) -join ' ; '))"
    # 러너는 경로에 중단 문구(download·registry·scanning·no rules 등)가 있으면 시작을 거절한다: 계정을 켜기 전에 미리 거른다.
    $pp0 = Find-LrForbiddenFragment $rulesWork
    & $addPre 'T09' ($null -eq $pp0) "작업 배치 경로에 러너가 거절할 문구가 없는가 ($pp0)"
    # 프로브 규칙 원본: 아무것도 만들기 전에 일반 파일인지, 233바이트인지, 고정 sha256 과 같은지 본다. 같은 바이트를 요청에 싣는다(다시 읽지 않는다).
    $probeSrc = Read-LrAdminProbeSource -Path $ProbeFile
    & $addPre 'P01' ([bool]$probeSrc.ok) "프로브 규칙 원본이 일반 파일이고 $($Script:LrProbeBytes)바이트이며 sha256 이 고정값과 같은가 (경로 $ProbeFile, 크기 $($probeSrc.size), sha256 $($probeSrc.sha256), 문제 $(@($probeSrc.problems) -join ','))"

    $inputs = [ordered]@{ mode = $Mode }
    $venvRoot = $null; $baseHome = $null; $hashesBefore = $null; $artifactPaths = $null
    $exe = $SemgrepExe
    $requiredKeys = $Script:LrAdminStubArtifactKeys
    if ($Mode -eq 'semgrep-lsp') {
        $inst = Test-LrAdminInstall -DistRoot $DistRoot -SemgrepExe $SemgrepExe -ExpectedExeSha256 $ExpectedExeSha256 -ExpectedCoreSha256 $ExpectedCoreSha256 -WheelPath $WheelPath -ExpectedWheelSha256 $ExpectedWheelSha256 -DistReport $DistReport -Manifest $m -Sid $sid
        foreach ($e in $inst.pre) { & $addPre ([string]$e.id) ([bool]$e.ok) ([string]$e.detail) }
        $venvRoot = $inst.venvRoot; $baseHome = $inst.baseHome; $hashesBefore = $inst.hashesBefore; $artifactPaths = $inst.artifactPaths; $inputs = $inst.inputs
        $requiredKeys = $Script:LrAdminRealArtifactKeys
    } else {
        $inputs = [ordered]@{ mode = $Mode; stubScenario = $StubScenario; launchedExe = $Script:Ps51 }
        $artifactPaths = [ordered]@{ launchedExe = $Script:Ps51 }
        $hashesBefore = Get-LrAdminArtifactHashes -Paths $artifactPaths
    }
    # 실행 전 해시는 모두 읽혀야 한다. 읽지 못한 값은 실행 뒤 값과 "같다"고 하지 않으므로, 읽지 못하면 시작하기 전에 멈춘다.
    $hashBeforeCheck = Test-LrAdminHashesUnchanged -Before $hashesBefore -After $hashesBefore -RequiredKeys $requiredKeys
    & $addPre 'A01' ([bool]$hashBeforeCheck.unchanged) "실행 전 파일 해시(설치물 또는 띄울 실행 파일)를 모두 읽었는가 ($(@($hashBeforeCheck.problems) -join ','))"
    # 재해석 도구: 실제 모드에서 -Execute 면 필수(자기 보고만으로는 관측을 성립시키지 않는다). 스텁 모드에서는 없어도 실행은 되지만 관측은 성립하지 않는다.
    if (-not $ReinterpretCli) { $ReinterpretCli = Join-Path (Join-Path (Join-Path $PSScriptRoot '..\..') 'semgrep-lsp') 'lsp-rules-reinterpret-cli.ts' }
    $toolsReady = [bool]($TsxCmd -and (Test-Path -LiteralPath $TsxCmd) -and (Test-Path -LiteralPath $ReinterpretCli))
    if ($Execute -and $Mode -eq 'semgrep-lsp') { & $addPre 'L09' $toolsReady "재해석 도구(tsx, lsp-rules-reinterpret-cli.ts)가 있는가 (tsx=$TsxCmd)" }
    $preFail = @($pre | Where-Object { -not $_.ok })
    if ($preFail.Count -gt 0) {
        Write-Host ('사전 조건 실패: ' + (($preFail | ForEach-Object { $_.id }) -join ', ') + ' — 실행하지 않는다.') -ForegroundColor Yellow
        return @{ exitCode = 50 }
    }

    $argv = @($Script:LrArgs)
    if ($Mode -eq 'stub') { $exe = $Script:Ps51; $argv = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-LmPath $workDir 'lsp-rules-stub.ps1'), $StubScenario) }
    $modeText = 'DRY-RUN(계획만)'; if ($Execute) { $modeText = 'EXECUTE(실제 실행)' }
    Write-IsoLog -Level 'INFO' -Message ("모드: {0}  실행 종류: {1}" -f $modeText, $Mode)
    if (-not $Execute) {
        Write-IsoLog -Level 'PLAN' -Message '루프백 수신기 열기(자식보다 먼저) → 감사 창 열기 → 로그 기준점 → 전용 계정 켜기 → 이전 요청·결과·중단 파일과 작업 배치 지우기 → 러너 파일 복사 → 실행 요청 쓰기(실행별 토큰, 검증한 프로브 바이트 포함)'
        Write-IsoLog -Level 'PLAN' -Message ("전용 계정으로 러너 실행 → 러너가 규칙 폴더에 프로브 한 개를 쓰고(해시 대조) 셸 없이 한 번 띄움: {0} {1}  (송신은 initialize → initialized(정확히 1회, 초기화 응답이 유효하고 버전이 같을 때만) → 장벽(rulesMs {2}ms) → 감시({3}ms) → shutdown → exit; 전체 {4}ms)" -f $exe, ($argv -join ' '), $limitsDoc.rulesMs, $limitsDoc.settleMs, $limitsDoc.totalMs)
        Write-IsoLog -Level 'PLAN' -Message ("부모 감독: 수신기 읽기 + 프로세스 트리 CIM + 결과 파일 확인을 이 스크립트 루프가 계속한다. 관측 마감({0}+{1}ms)에 중단 요청, 유예 {2}ms 뒤에도 매달려 있으면 전용 계정 프로세스 종료" -f $StartAllowanceMs, $limitsDoc.totalMs, ($limitsDoc.killConfirmMs + $SupervisorGraceMs))
        Write-IsoLog -Level 'PLAN' -Message '결과 결합·신원 교차 확인 → 정리(수신기, 전용 계정 프로세스, 계정 비활성화, 감사 값 복구: 각각 독립) → 실행 뒤 프로브 해시·감시 폴더·설치물 해시 재확인 → TS 재해석 → 5157 대조 요약(귀속·식별 불가·루프백 건수를 따로)'
        Write-Host 'dry-run 이라 아무것도 실행하지 않았다. 판정: NOT_EXECUTED'
        return @{ exitCode = 0 }
    }

    # ── 실행 ──
    $nonce = [guid]::NewGuid().ToString('N')
    $runToken = New-LspMinRunToken -RunId $runId -Nonce $nonce
    $report = [ordered]@{
        schema = $Script:LrAdminSchema; runId = $runId; runToken = $runToken; startedUtc = [DateTime]::UtcNow.ToString('o'); mode = $Mode; stubScenario = $(if ($Mode -eq 'stub') { $StubScenario } else { $null }); verdict = $null; finalStatus = $null
        scope = 'LSP-RULES-1 규칙 로딩 관측: initialize → initialized(정확히 1회) → 장벽 → 짧은 감시 → shutdown → exit. 문서 알림·작업 영역 스캔·규칙 다운로드·대상 스캔 없음. 로딩된 규칙의 개수와 프로브 규칙의 의미(탐지)는 관측하지 않는다. 정상 시작·보안 판정·대조 참조를 대신하지 않는다. DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않았다.'
        preconditions = $pre; inputs = $inputs; probeSource = [ordered]@{ path = $ProbeFile; ok = [bool]$probeSrc.ok; size = $probeSrc.size; sha256 = $probeSrc.sha256; problems = @($probeSrc.problems) }
        account = [ordered]@{ name = $names.UserName; sid = $sid }; rule = [ordered]@{ name = $names.RuleName; localUser = $ruleScope; remoteAddress = $ruleRemote }
        request = $null; binding = $null; identity = $null; supervisor = $null; receiver = $null; osBlockObservation = $null; processes = $null
        runnerResult = $null; adminPostRun = $null; probe = $null; reinterpretation = $null; hashes = $null
        observation = $null; processCleanup = $null; systemRecovery = $null; auditWindows = $null; notes = (New-Object System.Collections.ArrayList); error = $null
    }
    $auditSteps = New-Object System.Collections.ArrayList
    # 작업 경로 확인 기록(사전 조건 T08 과 같은 확인을 변경 전 관문 두 곳에서 다시 한 결과). 이 확인은 확인 시점의 상태만 본다.
    $workGates = New-Object System.Collections.ArrayList
    $report.workPath = [ordered]@{ trustedRoot = $trustedRoot; preconditionProblems = @($workProblems); gates = $workGates; limits = '확인 뒤에 링크로 바뀌는 경쟁 상태는 막지 못한다. 하드 링크는 재해석 지점이 아니라서 찾지 못한다. 실행 기록 폴더(관리자 증거 파일)는 이 확인의 범위 밖이다.' }
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
    # 러너를 띄웠는가(전용 계정의 러너 프로세스를 실제로 얻었는가)와, 띄우지 못했다면 그 사유. 서버를 띄우지 않았음(NOT_ATTEMPTED)은 이 둘로만 정한다.
    $launched = $false; $notAttempted = $null
    $launchedUtc = [DateTime]::UtcNow; $parentPid = 0; $runnerRec = $null
    $bindingFailures = @(); $identityFailures = @(); $identityOk = $false; $bindingOk = $false
    $resultState = 'NONE'; $resultObj = $null; $resultRawBytes = $null; $refused = $null
    $pathViol = @(); $cnt = $null
    $hashesAfter = [ordered]@{}; $hashesUnchanged = $false
    $rec = $null; $recordObj = $null; $ctxFile = $null; $recordFile = $null; $rrFile = $null
    $base = $null; $uname = [string]$names.UserName
    $verdict = 'NOT_ESTABLISHED'
    $established = $false
    $reint = [ordered]@{ status = 'NOT_RUN'; reason = $null; exitCode = $null; output = $null; recordFile = $null; contextFile = $null; recordStatus = $null; recordVerdict = $null; statusReasons = @(); adminReasons = @(); trigger = $null; tool = $null }
    $findAccountProcs = { @(Get-Process -IncludeUserName -ErrorAction Stop | Where-Object { $_.UserName -and $_.UserName.EndsWith('\' + $uname, [StringComparison]::OrdinalIgnoreCase) }) }
    try {
        # 변경 전 관문 1: 사전 조건 T08 은 읽은 시점의 값이므로, 첫 삭제·열기보다 앞서 같은 확인을 다시 한다. 문제가 있으면 수신기·감사 창·계정·복사·러너 어느 것도 시작하지 않는다.
        # (확인과 사용 사이에 링크로 바뀌는 경쟁 상태까지 막는다고 주장하지 않는다.)
        $gate1 = Get-LrAdminWorkSafetyProblems -TrustedRoot $trustedRoot -WorkDir $workDir -RulesWork $rulesWork
        [void]$workGates.Add([ordered]@{ stage = 'before-first-change'; problems = @($gate1) })
        if (@($gate1).Count -gt 0) {
            [void]$failTokens.Add('WORK_PATH_UNSAFE'); $notAttempted = 'WORK_PATH_UNSAFE'; $report.error = '작업 경로 확인에서 문제가 있어 아무것도 바꾸지 않고 멈춘다: ' + (@($gate1) -join ' ; ')
            throw 'WORK_PATH_UNSAFE'
        }
        # 수신기는 자식보다 먼저 준비한다. 준비하지 못하면 아무것도 시작하지 않는다.
        try {
            $receiver = New-LspMinReceiver
            $b0 = Read-LspMinReceiver -Receiver $receiver
            if (-not $b0.ok) { throw '기준점 읽기 실패' }
            $recv.baselineHits = $receiver.hits.Count; $recv.listener = "127.0.0.1:$($receiver.port)"
        } catch {
            [void]$failTokens.Add('RECEIVER_NOT_READY'); $notAttempted = 'RECEIVER_NOT_READY'; $report.error = '루프백 수신기를 준비하지 못했다: ' + $_.Exception.Message
            throw 'RECEIVER_NOT_READY'
        }
        # 이전 실행의 요청·결과·중단 파일과 작업 배치를 지운다. 전용 계정을 켜기 **전**이라 그 계정이 동시에 쓰는 일이 없다. 위 관문 1 이 이 삭제 목적지 전부의 경로 조각과 작업 배치 안을 이미 확인했다.
        foreach ($a in $Script:LrAdminWorkTransientFiles) {
            $ap = Join-Path $workDir $a
            if (Test-Path -LiteralPath $ap) { Invoke-Mutation -Description "이전 실행의 파일 삭제: $a" -Action { Remove-Item -LiteralPath $ap -Force -ErrorAction Stop } | Out-Null }
        }
        if ((Test-Path -LiteralPath $rulesWork) -and ([IO.Path]::GetFullPath($rulesWork)).StartsWith(([IO.Path]::GetFullPath($workDir).TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
            Invoke-Mutation -Description "이전 실행의 작업 배치 삭제: $rulesWork" -Action { Remove-Item -LiteralPath $rulesWork -Recurse -Force -ErrorAction Stop } | Out-Null
        }
        Open-IsoAuditWindow -Guid $Script:AuditGuid.FilteringPlatformConnection -EnableSuccess $false -EnableFailure $true -Registry $auditSteps -Why '5157(차단된 연결) 기록용, 이 실행 동안만' | Out-Null
        $base = Get-SecurityLogState
        if (-not $base.ok) { throw "실행 직전 Security 로그 기준점을 읽지 못했다: $($base.error)" }
        $accountTouched = $true
        Invoke-Mutation -Description "전용 계정 사용 켜기(끝나면 다시 끈다): $uname" -Action { Enable-LocalUser -Name $uname -ErrorAction Stop } | Out-Null
        $secure = ConvertTo-SecureString -String ([IO.File]::ReadAllText((Join-Path $Script:IsoRunDir 'credential.dpapi')).Trim())
        $cred = New-Object System.Management.Automation.PSCredential(('.\' + $uname), $secure)

        # 변경 전 관문 2: 계정을 켠 뒤 첫 복사·쓰기 직전에 한 번 더 확인한다(관문 1 과 같은 확인. 간격을 줄일 뿐 경쟁 상태를 없애지는 않는다). 문제가 있으면 쓰지 않고 멈추고, 정리가 계정과 감사 값을 되돌린다.
        $gate2 = Get-LrAdminWorkSafetyProblems -TrustedRoot $trustedRoot -WorkDir $workDir -RulesWork $rulesWork
        [void]$workGates.Add([ordered]@{ stage = 'before-copy-and-write'; problems = @($gate2) })
        if (@($gate2).Count -gt 0) {
            [void]$failTokens.Add('WORK_PATH_UNSAFE'); $notAttempted = 'WORK_PATH_UNSAFE'; $report.error = '계정을 켠 뒤 작업 경로 확인에서 문제가 있어 복사·쓰기 없이 멈춘다: ' + (@($gate2) -join ' ; ')
            throw 'WORK_PATH_UNSAFE'
        }
        if (-not (Test-Path -LiteralPath $workDir)) { Invoke-Mutation -Description "작업 폴더 만들기: $workDir" -Action { New-Item -ItemType Directory -Path $workDir -ErrorAction Stop | Out-Null } | Out-Null }
        $toCopy = @($Script:LrAdminWorkCopyFiles | Where-Object { $Mode -eq 'stub' -or $_ -ne 'lsp-rules-stub.ps1' })
        foreach ($f in $toCopy) { $src = Join-Path $Script:EntryDir $f; Invoke-Mutation -Description "작업 폴더로 복사: $f" -Action { Copy-Item -LiteralPath $src -Destination (Join-Path $workDir $f) -Force -ErrorAction Stop } | Out-Null }

        $envTable = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $layout -Url $receiver.url
        $artifacts = @(); if ($Mode -eq 'semgrep-lsp') { $artifacts = @([ordered]@{ label = 'semgrep.exe'; path = $SemgrepExe }) }
        $probeB64 = [Convert]::ToBase64String([byte[]]$probeSrc.bytes)
        $reqDoc = New-LrAdminRunnerRequest -Token $runToken -Mode $Mode -Exe $exe -ArgList $argv -Layout $layout -Env $envTable -Limits $limitsDoc -ExpectedVersion $ExpectedVersion -ProbeB64 $probeB64 -Artifacts $artifacts -AbortFile $abortFile -ResultFile $resultFile
        $selfCheck = Test-LrAdminRunnerRequest -Request $reqDoc
        $report.request = [ordered]@{ mode = $Mode; exe = $exe; args = $argv; layoutWork = $rulesWork; envNames = @($envTable.Keys); envValuesLoopbackUrl = $receiver.url; limits = $limitsDoc; expectedVersion = $ExpectedVersion; probeBytes = $probeSrc.size; probeSha256 = $probeSrc.sha256; abortFile = $abortFile; resultFile = $resultFile; selfCheckProblems = @($selfCheck) }
        if (@($selfCheck).Count -gt 0) { $notAttempted = 'REQUEST_SELF_CHECK_FAILED'; throw ('요청이 계약과 모순된다: ' + (@($selfCheck) -join ',')) }
        Invoke-Mutation -Description '실행 요청 쓰기: lsp-rules-request.json(이번 실행의 토큰 포함)' -Action { [IO.File]::WriteAllText($reqFile, ($reqDoc | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false))) } | Out-Null

        $argList = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"{0}"' -f (Join-Path $workDir 'lsp-rules-runner.ps1')), '-RequestFile', ('"{0}"' -f $reqFile))
        $launchedUtc = [DateTime]::UtcNow
        $sw = [Diagnostics.Stopwatch]::StartNew()
        $parent = $null
        try {
            $parent = Invoke-Mutation -Description "전용 계정으로 러너 실행: $($Script:Ps51)" -Action { Start-Process -FilePath $Script:Ps51 -ArgumentList $argList -Credential $cred -WorkingDirectory $workDir -LoadUserProfile -PassThru -WindowStyle Hidden }
        } catch { $notAttempted = 'RUNNER_NOT_LAUNCHED'; throw }
        if ($null -eq $parent) { $notAttempted = 'RUNNER_NOT_LAUNCHED'; throw '러너 프로세스를 얻지 못했다' }
        $launched = $true
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
            $w = Write-LspMinAbortFile -Path $abortFile -Text $Text -TrustedRoot $trustedRoot
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
                $desc = Get-LrAdminDescendantCim $parentPid $runnerStart $tbl
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
                    if (Test-LrOrdinalEqual ([string](Get-IsoProp $o2 'runToken')) ([string]$runToken)) { $resultObj = $o2; $resultState = 'ACCEPTED'; $resultSeenAt = [DateTime]::UtcNow }
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
        $rrFile = Join-Path $Script:IsoRunDir "lsp-rules-runner-result-$stamp.json"
        if ($resultState -ne 'NONE' -and (Test-Path -LiteralPath $resultFile)) {
            try { $resultRawBytes = [IO.File]::ReadAllBytes($resultFile); Invoke-Mutation -Description '러너 결과 원문을 실행 기록 폴더에 보관' -Action { [IO.File]::WriteAllBytes($rrFile, $resultRawBytes) } | Out-Null } catch { [void]$report.notes.Add('러너 결과 원문을 보관하지 못했다: ' + $_.Exception.Message); $rrFile = $null }
        } else { $rrFile = $null }
        if ($resultState -eq 'ACCEPTED') {
            $bindingFailures = Test-LrAdminResultBinding -Result $resultObj -Request $reqDoc -RunId $runId -LaunchedUtc $launchedUtc
        } elseif ($resultState -eq 'TOKEN_MISMATCH') { $bindingFailures = @('TOKEN_MISMATCH') }
        $bindingOk = ($resultState -eq 'ACCEPTED' -and @($bindingFailures).Count -eq 0)
        $report.binding = [ordered]@{ resultState = $resultState; ok = $bindingOk; failures = @($bindingFailures); token = $runToken }
        if ($resultObj) { $refused = [string](Get-IsoProp $resultObj 'refused') }

        $idFail = Get-LrAdminIdentityFailures -Result $resultObj -RunnerRec $runnerRec -Tracked $tracked -Sid $sid -ParentPid $parentPid -Ps51 $Script:Ps51 -Exe $exe -Argv $argv -LaunchedUtc $launchedUtc
        $identityFailures = @($idFail | ForEach-Object { $_.code })
        $identityOk = (@($idFail).Count -eq 0)
        $report.identity = [ordered]@{
            ok = $identityOk; failures = @($idFail)
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
                [IO.File]::WriteAllBytes((Join-Path $Script:IsoRunDir "lsp-rules-stdout-$stamp.bin"), $outBytes)
                [IO.File]::WriteAllBytes((Join-Path $Script:IsoRunDir "lsp-rules-stderr-$stamp.bin"), $errBytes)
            } | Out-Null
            $sentLabels = @((Get-IsoProp $resultObj 'sends') | Where-Object { $null -ne $_ } | ForEach-Object { [string](Get-IsoProp $_ 'label') })
            $report.runnerResult = [ordered]@{
                file = $rrFile; sha256 = $(if ($rrFile -and (Test-Path -LiteralPath $rrFile)) { Get-FileSha256Hex -Path $rrFile }); refused = (Get-IsoProp $resultObj 'refused'); refusals = @(Get-IsoProp $resultObj 'refusals'); error = (Get-IsoProp $resultObj 'error'); errorPhase = (Get-IsoProp $resultObj 'errorPhase')
                trigger = (Get-IsoProp $resultObj 'trigger'); also = @(Get-IsoProp $resultObj 'also'); abort = (Get-IsoProp $resultObj 'abort'); sentLabels = $sentLabels; initializedCount = @($sentLabels | Where-Object { Test-LrOrdinalEqual $_ 'initialized' }).Count
                barrier = (Get-IsoProp $resultObj 'barrier'); probe = (Get-IsoProp $resultObj 'probe'); roots = @(Get-IsoProp $resultObj 'roots')
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
        if ($bindingOk -ne $true -and $resultState -ne 'NONE' -and $resultState -ne 'UNREADABLE') { [void]$failTokens.Add('RESULT_BINDING_FAILED') }
        if ($resultState -eq 'ACCEPTED' -and -not $identityOk) { [void]$failTokens.Add('IDENTITY_UNVERIFIED') }
        if ($refused) { [void]$failTokens.Add('RUNNER_REFUSED') }
        if (@($pathViol).Count -gt 0) { [void]$failTokens.Add('DESCENDANT_PATH_UNEXPECTED') }
        $report.pathViolations = $pathViol

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
        $ev.countsUsable = $cnt.usable; $ev.attributedCount = $cnt.attributed; $ev.unidentifiedCount = $cnt.unidentified; $ev.unusableBecause = @($cnt.unusableBecause)
        if (-not $cnt.usable) { $ev.attributed = $null; $ev.unidentifiedSummary = $null }
        $ev.loopbackHits = $recv.finalHits
        $report.osBlockObservation = $ev
        # 차단 이벤트 증거가 확실하지 않거나 귀속된 이벤트가 있으면 관측은 성립하지 않는다(기록은 건수를 0 으로 채우지 않고 사유를 적는다).
        foreach ($tk in (Get-LspMinOsBlockFailureTokens -Counts $cnt)) { [void]$failTokens.Add($tk) }
    } catch {
        if (-not $report.error) { $report.error = $_.Exception.Message }
        Write-IsoLog -Level 'FAIL' -Message ('실행 중 오류: ' + $_.Exception.Message)
        if ($_.Exception.Message -ne 'RECEIVER_NOT_READY' -and $_.Exception.Message -ne 'WORK_PATH_UNSAFE') { [void]$failTokens.Add('ADMIN_ERROR') }
        # 러너를 띄우기 전에 던졌는데 사유를 정하지 못한 경우도 서버는 뜨지 않았다. 띄운 뒤의 오류는 실행 사실을 지우지 않는다.
        if (-not $launched -and $null -eq $notAttempted) { $notAttempted = 'ADMIN_ERROR_BEFORE_LAUNCH' }
        if (-not $launched -and $notAttempted -eq 'RUNNER_NOT_LAUNCHED') { [void]$failTokens.Add('RUNNER_NOT_LAUNCHED') }
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

    # ── 정리 뒤: 관리자가 직접 다시 읽는 사후 사실. 전용 계정의 프로세스를 끝내고 계정을 끈 뒤라서 읽는 도중 바뀌지 않는다(정리가 실패했으면 그 사실은 정리 결과에 따로 남는다).
    #    설치물 해시(읽지 못했거나 유효하지 않은 값은 "같다"가 아니다), 규칙 폴더의 프로브 파일 해시와 감시 폴더 셋의 파일 목록(경로 조각·배치 안에 링크가 없을 때만 읽는다). ──
    $adminState = $null
    $ctxProbe = [ordered]@{ sourceSha256 = (ConvertTo-LspMinSha256 $probeSrc.sha256); afterCopySha256 = $null; afterRunSha256 = $null }
    if ($launched) {
        $hashesAfter = Get-LrAdminArtifactHashes -Paths $artifactPaths
        $hashCmp = Test-LrAdminHashesUnchanged -Before $hashesBefore -After $hashesAfter -RequiredKeys $requiredKeys
        $hashesUnchanged = [bool]$hashCmp.unchanged
        $report.hashes = [ordered]@{ before = $hashesBefore; after = $hashesAfter; unchanged = $hashesUnchanged; problems = @($hashCmp.problems) }
        if (-not $hashesUnchanged) { [void]$failTokens.Add('HASH_CHANGED') }
        $adminState = Get-LrAdminAfterRunState -TrustedRoot $trustedRoot -WorkDir $workDir -RulesWork $rulesWork
        $runnerProbe = Get-IsoProp $resultObj 'probe'
        $adminRunSha = $null; if ($adminState.readAllowed) { $adminRunSha = $adminState.probe.sha256 }
        $ctxProbe.sourceSha256 = Resolve-LrAdminHash $Script:LrProbeSha256 $probeSrc.sha256 (Get-IsoProp $runnerProbe 'sourceSha256')
        $ctxProbe.afterCopySha256 = ConvertTo-LspMinSha256 (Get-IsoProp $runnerProbe 'afterCopySha256')
        $ctxProbe.afterRunSha256 = Resolve-LrAdminHash $Script:LrProbeSha256 (Get-IsoProp $runnerProbe 'afterRunSha256') $adminRunSha
        $report.adminPostRun = [ordered]@{ readAllowed = [bool]$adminState.readAllowed; problems = @($adminState.problems); probePath = $adminState.probePath; probe = $adminState.probe; roots = $adminState.roots; note = '정리가 끝난 뒤 관리자가 직접 읽은 값이다. 읽어도 되는지 확인하지 못했거나 읽지 못한 값은 null 이며 일치로 쓰지 않는다.' }
        # 러너가 받아들여졌고 거절하지 않았다면(서버를 띄웠다면) 프로브와 감시 폴더를 관리자 쪽에서도 확인해야 한다.
        if ($resultState -eq 'ACCEPTED' -and -not $refused) {
            foreach ($pk in 'sourceSha256', 'afterCopySha256', 'afterRunSha256') { if ($ctxProbe[$pk] -cne $Script:LrProbeSha256) { [void]$failTokens.Add("PROBE_HASH_NOT_CONFIRMED:$pk") } }
            if (-not $adminState.readAllowed) { [void]$failTokens.Add('POST_RUN_READ_NOT_ALLOWED') }
            else { foreach ($rp in (Get-LrAdminRootProblems -Roots $adminState.roots)) { [void]$failTokens.Add([string]$rp) } }
        }
    }
    $report.probe = [ordered]@{ expectedSha256 = $Script:LrProbeSha256; contextValues = $ctxProbe }

    # ── 관리자 문맥(러너 결과 원문과 짝). 서버를 띄우지 못했으면 runnerLaunched=false 와 사유만 의미가 있다. ──
    $resultMissing = ($resultState -eq 'NONE' -or $resultState -eq 'UNREADABLE')
    $ctxDoc = New-LrAdminContext -RunId $runId -Token $runToken -Mode $Mode -Work $rulesWork -ExpectedVersion $ExpectedVersion -Limits $limitsDoc -RunnerLaunched $launched -Refusals $notAttempted `
        -ReceiverBaseline $recv.baselineHits -ReceiverFinal $recv.finalHits -ReceiverSamples ([int]$recv.samples) -ReceiverFailures ([int]$recv.failures) -Probe $ctxProbe `
        -IdentityOk $identityOk -IdentityFailures $identityFailures -BindingOk $bindingOk -BindingFailures $bindingFailures `
        -AbortRequested ($null -ne $sup.abortRequestedAtMs) -AbortReason $sup.abortReason -AbortDelivered $sup.abortFile.delivered -ForcedKill ([bool]$sup.forcedKill) -DeadlineReached ([bool]$sup.deadlineReached) -ResultMissing $resultMissing `
        -DescendantPathViolations @($pathViol | ForEach-Object { 'pid=' + $_.processId }) -HashesUnchanged $hashesUnchanged -OsBlock $cnt
    $ctxFile = Join-Path $Script:IsoRunDir "lsp-rules-admin-context-$stamp.json"
    try { Invoke-Mutation -Description '관리자 문맥(수신기·프로브 해시·신원·결합·감독·5157 요약) 쓰기' -Action { Write-IsoJson -Path $ctxFile -Object $ctxDoc -Depth 8 } | Out-Null; $reint.contextFile = $ctxFile }
    catch { [void]$report.notes.Add('관리자 문맥을 쓰지 못했다: ' + $_.Exception.Message); $ctxFile = $null }

    # ── TS 재해석: 정리가 모두 끝난 뒤에 한다(도구가 오래 걸려도 계정·감사 창·수신기가 이미 되돌려졌다). 러너 결과 원문 + 관리자 문맥 → 기록. 도구가 없거나 결과가 없으면 관측은 성립하지 않는다. ──
    if ($ctxFile) {
        $recordFile = Join-Path $Script:IsoRunDir "lsp-rules-record-$stamp.json"
        if ($launched -and (-not $rrFile -or -not (Test-Path -LiteralPath $rrFile))) { $reint.reason = 'NO_RUNNER_RESULT_FILE' }
        elseif (-not $toolsReady) { $reint.reason = 'TOOLS_MISSING' }
        else {
            # 서버를 띄우지 못했으면 러너 결과 파일이 없다: 재해석은 결과 없이 문맥(runnerLaunched=false)만으로 기록을 만든다.
            $rrArg = $rrFile; if (-not $rrArg) { $rrArg = Join-Path $Script:IsoRunDir "lsp-rules-runner-result-$stamp.json" }
            $ri = Invoke-LspMinReinterpret -TsxCmd $TsxCmd -NodeDir $NodeDir -CliTs $ReinterpretCli -RunnerResultPath $rrArg -ContextPath $ctxFile -OutPath $recordFile -CancelFile $CancelFile
            $reint.exitCode = $ri.exitCode; $reint.output = $ri.output; if ($ri.error) { $reint.reason = $ri.error }
            # 도구 실행의 뒤처리(후손 정리·읽기 마무리)는 관측 결과와 따로 적고, 프로세스 정리 묶음에 항목으로 넣는다(정리가 실패하면 종료 70).
            $reint.tool = [ordered]@{ exited = (Get-IsoProp $ri 'exited'); stdoutClosed = (Get-IsoProp $ri 'stdoutClosed'); stderrClosed = (Get-IsoProp $ri 'stderrClosed'); truncated = (Get-IsoProp $ri 'truncated'); elapsedMs = (Get-IsoProp $ri 'elapsedMs'); totalMs = (Get-IsoProp $ri 'totalMs'); cleanup = (Get-IsoProp $ri 'cleanup') }
            $toolCleanup = Get-IsoProp $ri 'cleanup'
            if ($null -ne $toolCleanup) { [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'process-reinterpret-tool' -Action { $toolCleanup })) }
            if ($ri.ran -and $ri.exitCode -eq 0 -and (Test-Path -LiteralPath $recordFile)) {
                try { $recordObj = Read-IsoJson -Path $recordFile; $reint.status = 'RUN'; $reint.recordFile = $recordFile } catch { $reint.status = 'FAILED'; $reint.reason = '기록 파일을 읽지 못했다: ' + $_.Exception.Message }
            } else { $reint.status = 'FAILED'; if (-not $reint.reason) { $reint.reason = "도구 종료 코드 $($ri.exitCode)" } }
        }
    } else { $reint.reason = 'CONTEXT_NOT_WRITTEN' }
    if ($recordObj) { $rec = Get-IsoProp $recordObj 'record' }
    if ($reint.status -eq 'RUN' -and $rec) {
        $reint.recordStatus = Get-IsoProp $rec 'status'; $reint.recordVerdict = Get-IsoProp $rec 'verdict'; $reint.statusReasons = @(Get-IsoProp $rec 'verdict_reasons'); $reint.adminReasons = @(Get-IsoProp (Get-IsoProp $recordObj 'admin') 'externalReasons')
        $reint.trigger = Get-IsoProp (Get-IsoProp $rec 'termination') 'trigger'
        if ($reint.recordStatus -ne 'OBSERVED') { [void]$failTokens.Add('RECORD_' + [string]$reint.recordStatus); foreach ($sr in @($reint.statusReasons)) { [void]$failTokens.Add('REASON:' + [string]$sr) } }
    } elseif ($reint.status -eq 'RUN') { $reint.status = 'FAILED'; $reint.reason = '기록 파일에 record 가 없다'; [void]$failTokens.Add('REINTERPRETATION_FAILED') }
    elseif ($reint.status -eq 'FAILED') { [void]$failTokens.Add('REINTERPRETATION_FAILED') }
    elseif ($null -eq $notAttempted) { [void]$failTokens.Add('REINTERPRETATION_NOT_RUN') }
    $report.reinterpretation = $reint

    $fs0 = Get-LspMinFailureSummary -Tokens @($failTokens)
    $established = ($null -eq $notAttempted -and $fs0.all.Count -eq 0 -and $reint.status -eq 'RUN' -and $reint.recordStatus -eq 'OBSERVED')
    $verdict = Get-LrAdminVerdict -Established $established -NotAttempted $notAttempted -RecordStatus $reint.recordStatus -RecordVerdict $reint.recordVerdict -PrimaryFailure $fs0.primary -Stub ($Mode -eq 'stub')

    $groups = Group-LspMinCleanupItems -Items @($cleanup)
    $report.processCleanup = $groups.processCleanup
    $report.systemRecovery = $groups.systemRecovery
    $fsum = Get-LspMinFailureSummary -Tokens @($failTokens)
    # 관측의 성립 여부, 프로세스 정리, 시스템 복구는 따로 기록한다. 서로의 결과를 바꾸지 않는다.
    # 관측을 막지는 않지만 증거의 빈틈이 되는 신호(성립 여부와 따로 적는다): 관리자 쪽 프로세스 표 읽기 실패, 러너가 치우지 못해 관리자 정리가 끝낸 잔존 프로세스, 러너가 보고한 정리 문제.
    $caveats = New-Object System.Collections.ArrayList
    if ($sup.cimFailures -gt 0) { [void]$caveats.Add("PROCESS_TABLE_READ_FAILED:$($sup.cimFailures)") }
    $pcItem = @($groups.processCleanup.items | Where-Object { $_.name -eq 'process-cleanup' }) | Select-Object -First 1
    $killedAdmin = $null; if ($pcItem) { $killedAdmin = Get-IsoProp (Get-IsoProp $pcItem 'detail') 'killedByAdminCleanup' }
    if ($killedAdmin -and @($killedAdmin).Count -gt 0) { [void]$caveats.Add('LEFTOVER_PROCESSES_ENDED_BY_ADMIN_CLEANUP') }
    if ($rec -and (Get-IsoProp (Get-IsoProp $rec 'cleanup') 'ok') -eq $false) { [void]$caveats.Add('RUNNER_REPORTED_CLEANUP_PROBLEMS') }
    $report.observation = [ordered]@{ caveats = @($caveats); established = [bool]$established; verdict = $verdict; notAttempted = $notAttempted; runnerLaunched = $launched; failure = $fsum.primary; failures = @($fsum.all); recordStatus = $reint.recordStatus; recordVerdict = $reint.recordVerdict; trigger = $reint.trigger }
    $exitCode = Get-LspMinAdminExitCode -Established ([bool]$established) -ProcessCleanupOk ([bool]$groups.processCleanup.ok) -SystemRecoveryOk ([bool]$groups.systemRecovery.ok)
    $finalStatus = $(if ($exitCode -eq 70) { 'CLEANUP_INCOMPLETE' } elseif ($established) { $verdict } else { 'NOT_ESTABLISHED' })
    $report.verdict = $verdict; $report.finalStatus = $finalStatus
    $report.finishedUtc = [DateTime]::UtcNow.ToString('o')
    $report.auditWindows = @($auditSteps | ForEach-Object { [ordered]@{ guid = $_.name; state = $_.state; original = (Get-IsoProp $_.detail 'original'); set = (Get-IsoProp $_.detail 'set') } })
    # 목록 모양의 값은 보고서를 쓰기 전에 배열로 바꾼다(5.1 의 ConvertTo-Json 이 목록 객체를 Capacity·Count 속성으로 풀어 쓰지 않게).
    $sup.requests = @($sup.requests); $sup.killTargets = @($sup.killTargets); $report.notes = @($report.notes); $report.workPath.gates = @($workGates)
    $out = Join-Path $Script:IsoRunDir ("lsp-rules-observation-$stamp.json")
    try { Write-IsoJson -Path $out -Object $report -Depth 12 } catch { Write-IsoLog -Level 'FAIL' -Message ('보고서를 쓰지 못했다: ' + $_.Exception.Message); $exitCode = 70; $out = $null }

    Write-Host ''
    Write-Host "판정: $verdict   (범위: LSP-RULES-1 규칙 로딩 관측 1회. 규칙 개수·프로브 규칙의 탐지·스캔·DNS·UDP·ICMP·IPv6 는 관측하지 않았다)"
    Write-Host ("관측: {0}   실패 토큰: {1}" -f $(if ($established) { '성립' } else { '성립하지 않음' }), $(if ($report.observation.failure) { ((@($report.observation.failures)) -join ',') } else { '없음' }))
    Write-Host ("프로세스 정리: {0}   시스템 복구: {1}   최종 상태: {2}" -f $(if ($groups.processCleanup.ok) { '완료' } else { '불완전' }), $(if ($groups.systemRecovery.ok) { '완료' } else { '불완전' }), $finalStatus)
    if ($report.identity) { Write-Host ("  신원 교차 확인: {0}{1}" -f $(if ($report.identity.ok) { '통과' } else { '실패' }), $(if (-not $report.identity.ok) { ' [' + ((@($report.identity.failures) | ForEach-Object { $_.code }) -join ', ') + ']' } else { '' })) }
    if ($report.supervisor) { Write-Host ("  감독: 중단 요청={0} 강제 종료={1} 중단 파일 전달={2}" -f $report.supervisor.abortReason, $report.supervisor.forcedKill, $report.supervisor.abortFile.delivered) }
    if ($report.receiver) { Write-Host ("  루프백 수신기: 기준 {0} → 최종 {1} (읽기 실패 {2}회)" -f $report.receiver.baselineHits, $report.receiver.finalHits, $report.receiver.failures) }
    Write-Host ("  프로브 해시(문맥): 원본 {0} / 복사 직후 {1} / 실행 뒤 {2}" -f $ctxProbe.sourceSha256, $ctxProbe.afterCopySha256, $ctxProbe.afterRunSha256)
    if ($report.osBlockObservation) {
        $o = $report.osBlockObservation
        $ac = '수집 불가(0 아님)'; if ($null -ne $o.attributedCount) { $ac = [string]$o.attributedCount }
        $ui = '수집 불가'; if ($null -ne $o.unidentifiedCount) { $ui = [string]$o.unidentifiedCount }
        Write-Host ("  OS 차단 관측: 수집 ok={0} 감사 켜짐={1} 로그 밀림={2}  귀속된 5157={3}  식별 불가={4}" -f $o.collection.ok, $o.collection.auditFailureEnabled, $o.collection.wrapped, $ac, $ui)
    }
    if ($out) { Write-Host "결과 파일: $out" }
    @{ exitCode = $exitCode; report = $report; reportFile = $out }
}

$limitsIn = [ordered]@{ totalMs = $TotalMs; initMs = $InitMs; rulesMs = $RulesMs; settleMs = $SettleMs; exitMs = $ExitMs; stdinCloseGraceMs = $StdinCloseGraceMs; killConfirmMs = $KillConfirmMs; maxStdoutBytes = $MaxStdoutBytes; maxStderrBytes = $MaxStderrBytes; sampleIntervalMs = $SampleIntervalMs }
$r = @(Invoke-LspRulesObservation -RunDir $RunDir -Execute ([bool]$Execute) -Mode $Mode -StubScenario $StubScenario -DistRoot $DistRoot -SemgrepExe $SemgrepExe -ExpectedExeSha256 $ExpectedExeSha256 -ExpectedCoreSha256 $ExpectedCoreSha256 -WheelPath $WheelPath -ExpectedWheelSha256 $ExpectedWheelSha256 `
        -DistReport $DistReport -ExpectedVersion $ExpectedVersion -ProbeFile $ProbeFile -TsxCmd $TsxCmd -NodeDir $NodeDir -ReinterpretCli $ReinterpretCli -CancelFile $CancelFile -Limits $limitsIn -StartAllowanceMs $StartAllowanceMs -SupervisorGraceMs $SupervisorGraceMs)[-1]
exit $r.exitCode
