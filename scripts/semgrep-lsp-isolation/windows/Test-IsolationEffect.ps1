<#
.SYNOPSIS
  적용된 격리가 "무해한 프로브"에 실제로 걸리는지 관측한다. semgrep 계열은 실행하지 않는다.
.DESCRIPTION
  기본은 사전 조건 확인과 계획 출력만 한다. 실제 실행은 -Execute.
  실행 순서(-Execute):
    1. 감사 창 열기: "Filtering Platform Connection" 실패 감사를 이 실행 동안만 켠다(원래 값은 켜기 직전에 새로 읽어 기록). 끝나면 우리가 바꾼 것만 되돌린다.
    2. 실행 직전 Security 로그 기준점(마지막 RecordId) 기록, 전용 계정 사용 켜기(끝나면 다시 끈다).
    3. 루프백 수신기(127.0.0.1)를 연다. 전용 계정으로 부모 powershell.exe → 자식 powershell.exe 를 띄워 TCP 연결을 시도한다:
         loopback          127.0.0.1:<수신기 포트>      기대: 허용(수신기가 받아야 한다)
         external-reserved 192.0.2.1:9 (RFC 5737 문서용 주소, 실제 서비스 아님)  기대: 차단
         (선택 -IncludeSelfAddressProbe) 이 PC 의 비루프백 주소의 수신기. 관리자 계정의 같은 연결을 대조군으로 쓴다.
    4. 실행기가 부모·자식의 PID·시작 시각·경로·계정 SID 를 CIM 으로 기록하고, 프로브가 스스로 보고한 값과 교차 확인한다.
    5. Security 로그의 5157 이벤트를 기준점 이후로 읽어, PID·실행 파일 경로·시각 구간이 모두 맞는 것만 "이번 실행의 OS 차단 관측"으로 센다.
  보고는 서로 다른 항목으로 나눈다:
    A. 연결 시도 결과(프로브가 본 것)   B. 루프백 수신기 수신 건수   C. OS 차단 관측(5157 대조)   D. 판정
  판정 규칙: 연결 실패만으로 차단이라고 하지 않는다. 로그를 못 읽었거나 감사가 꺼져 있었거나 로그가 밀렸으면 FAILED_EVIDENCE_UNAVAILABLE 이고 0건이 아니다.
  최종 판정이 PROBE_ISOLATION_OBSERVED 여도 의미는 "이 프로브 두 종류에 대해 관측됨"뿐이다. semgrep·가상환경 python·UDP·ICMP·IPv6·DNS 로는 확장하지 않는다.
.EXAMPLE
  .\Test-IsolationEffect.ps1 -RunDir <RunDir>                 # 계획·사전 조건만
  .\Test-IsolationEffect.ps1 -RunDir <RunDir> -Execute
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RunDir,
    [switch]$Execute,
    [string]$VenvPython,
    [switch]$IncludeSelfAddressProbe,
    [switch]$IncludeProcessCreationAudit,
    [int]$ConnectTimeoutSec = 3,
    [int]$HoldSeconds = 3
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')

if (-not (Test-Path -LiteralPath $RunDir)) { Write-Host "RunDir 가 없다: $RunDir"; exit 30 }
$Script:IsoRunDir = (Resolve-Path -LiteralPath $RunDir).Path
$Script:ApplyMode = [bool]$Execute
$manifestFile = Join-Path $Script:IsoRunDir 'resources.json'
if (-not (Test-Path -LiteralPath $manifestFile)) { Write-Host '실행 기록(resources.json)이 없다. Initialize-Isolation.ps1 -Apply 가 먼저 필요하다.'; exit 50 }
$m = Import-IsoManifest -Path $manifestFile
$runId = [string]$m.runId
$names = Get-IsoNames -RunId $runId
$stamp = [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'")

# ── 사전 조건(읽기) ─────────────────────────────────────────────────────────
$pre = New-Object System.Collections.ArrayList
function Add-Pre([string]$Id, [bool]$Ok, [string]$Detail) { [void]$pre.Add([ordered]@{ id = $Id; ok = $Ok; detail = $Detail }); Write-IsoLog -Level $(if ($Ok) { 'PASS' } else { 'FAIL' }) -Message "$Id $Detail" }

Add-Pre 'T01' ($m.status -eq 'applied') "실행 기록 상태가 applied 인가 (현재 $($m.status))"
if ($Execute) { Add-Pre 'T02' (Test-IsElevated) '관리자 권한(Security 로그·감사 정책·계정 사용 켜기)' }
$userStep = @($m.steps | Where-Object { $_.kind -eq 'user' }) | Select-Object -First 1
$ruleStep = @($m.steps | Where-Object { $_.kind -eq 'firewallRule' }) | Select-Object -First 1
$sid = $null; if ($userStep) { $sid = [string]$userStep.detail['sid'] }
$acct = Get-LocalUser -Name $names.UserName -ErrorAction SilentlyContinue
Add-Pre 'T03' ([bool]($acct -and $acct.Description -eq $names.Marker -and $sid -and $acct.SID.Value -eq $sid)) '전용 계정이 있고 표식·SID 가 기록과 같은가'
$rule = Get-NetFirewallRule -Name $names.RuleName -ErrorAction SilentlyContinue
$ruleOk = $false; $ruleScope = $null
if ($rule) {
    $sf = $rule | Get-NetFirewallSecurityFilter
    $ruleScope = [string]$sf.LocalUser
    $ruleOk = ($rule.Description -eq $names.Marker -and [string]$rule.Enabled -eq 'True' -and [string]$rule.Action -eq 'Block' -and [string]$rule.Direction -eq 'Outbound' -and $sid -and $ruleScope.Contains($sid))
}
Add-Pre 'T04' ([bool]$ruleOk) "방화벽 규칙이 켜져 있고 Block/Outbound/계정 범위가 기록과 같은가 (LocalUser=$ruleScope)"
Add-Pre 'T05' ((Test-Path -LiteralPath (Join-Path $names.WorkDir '.owner')) -and (Test-Path -LiteralPath (Join-Path $Script:IsoRunDir 'credential.dpapi'))) '작업 폴더(.owner)와 암호 파일이 있는가'
$sl0 = Get-SecurityLogState
Add-Pre 'T06' ([bool]$sl0.ok) "Security 로그를 읽을 수 있는가 ($($sl0.error))"
$preFail = @($pre | Where-Object { -not $_.ok })
if ($preFail.Count -gt 0) {
    Write-Host ('사전 조건 실패: ' + (($preFail | ForEach-Object { $_.id }) -join ', ') + ' — 실행하지 않는다.') -ForegroundColor Yellow
    exit 50
}

$workDir = Join-Path $names.WorkDir 'work'
$selfIp = $null
if ($IncludeSelfAddressProbe) {
    $selfIp = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress }) | Select-Object -First 1
    if (-not $selfIp) { Write-IsoLog -Level 'WARN' -Message '비루프백 IPv4 주소가 없어 self-address 프로브를 건너뛴다(SKIPPED_NO_ADDRESS).' }
}

Write-IsoLog -Level 'INFO' -Message ("모드: {0}" -f $(if ($Execute) { 'EXECUTE(실제 프로브 실행)' } else { 'DRY-RUN(계획만)' }))
if (-not $Execute) {
    Write-IsoLog -Level 'PLAN' -Message '감사 창 열기(Filtering Platform Connection 실패 감사) → 로그 기준점 기록 → 전용 계정 사용 켜기 → 루프백 수신기 열기'
    Write-IsoLog -Level 'PLAN' -Message "전용 계정으로 부모→자식 powershell.exe 실행: loopback(허용 기대), external-reserved 192.0.2.1:9(차단 기대)$(if ($selfIp) { ', self-address ' + $selfIp })"
    Write-IsoLog -Level 'PLAN' -Message '5157 이벤트를 PID·실행 파일 경로·시각 구간으로 이번 실행과 대조 → 판정 → 감사 창 닫기·계정 비활성화'
    Write-Host 'dry-run 이라 아무것도 실행하지 않았다. 판정: NOT_EXECUTED'
    exit 0
}

# ── 실행 ────────────────────────────────────────────────────────────────────
$verdict = 'NOT_ESTABLISHED'
$report = [ordered]@{
    schema = 1; runId = $runId; startedUtc = [DateTime]::UtcNow.ToString('o'); verdict = $null; scope = 'powershell.exe 5.1 부모→자식의 TCP 연결 두 종류(loopback, 192.0.2.1:9)만 관측한다. semgrep·semgrep-core·가상환경 python·UDP·ICMP·IPv6·DNS 는 관측하지 않았다.'
    preconditions = $pre; connectionAttempts = $null; loopbackReceiver = $null; osBlockObservation = $null; probeVerdicts = $null
    controlSelfAddress = $null; venvPythonAccess = $null; notes = New-Object System.Collections.ArrayList
}
$auditSteps = New-Object System.Collections.ArrayList
$accountEnabledByRun = $false
$listeners = @()
$knownPids = New-Object System.Collections.ArrayList
try {
    # 1) 감사 창
    [void]$auditSteps.Add((Open-IsoAuditWindow -Guid $Script:AuditGuid.FilteringPlatformConnection -EnableSuccess $false -EnableFailure $true -Why '5157(차단된 연결) 기록용, 이 실행 동안만'))
    if ($IncludeProcessCreationAudit) { [void]$auditSteps.Add((Open-IsoAuditWindow -Guid $Script:AuditGuid.ProcessCreation -EnableSuccess $true -EnableFailure $false -Why '4688(프로세스 만들기) 교차 확인용, 이 실행 동안만')) }
    $fpcStep = $auditSteps[0]
    $auditFailureOn = [bool]((ConvertTo-AuditFlags -Value ([int]$fpcStep.detail.set)).Failure)

    # 2) 기준점, 계정 켜기
    $base = Get-SecurityLogState
    if (-not $base.ok) { throw "실행 직전 Security 로그 기준점을 읽지 못했다: $($base.error)" }
    Invoke-Mutation -Description "전용 계정 사용 켜기(끝나면 다시 끈다): $($names.UserName)" -Action { Enable-LocalUser -Name $names.UserName -ErrorAction Stop } | Out-Null
    $accountEnabledByRun = $true
    $secure = ConvertTo-SecureString -String ([IO.File]::ReadAllText((Join-Path $Script:IsoRunDir 'credential.dpapi')).Trim())
    $cred = New-Object System.Management.Automation.PSCredential(('.\' + $names.UserName), $secure)

    # 3) 프로브 파일, 수신기
    foreach ($f in 'probe-parent.ps1', 'probe-child.ps1') {
        $src = Join-Path $PSScriptRoot $f
        Invoke-Mutation -Description "프로브 스크립트를 작업 폴더로 복사: $f" -Action { Copy-Item -LiteralPath $src -Destination (Join-Path $workDir $f) -Force -ErrorAction Stop } | Out-Null
    }
    $l1 = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $l1.Start(); $listeners += $l1
    $l1Port = ([Net.IPEndPoint]$l1.LocalEndpoint).Port
    $targets = @(
        [ordered]@{ name = 'loopback'; address = '127.0.0.1'; port = $l1Port; expectation = 'allowed' },
        [ordered]@{ name = 'external-reserved'; address = '192.0.2.1'; port = 9; expectation = 'blocked' }
    )
    $l2 = $null
    if ($selfIp) {
        $l2 = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Parse($selfIp), 0); $l2.Start(); $listeners += $l2
        $targets += [ordered]@{ name = 'self-address'; address = $selfIp; port = ([Net.IPEndPoint]$l2.LocalEndpoint).Port; expectation = 'blocked' }
    }
    $targetsFile = Join-Path $workDir 'targets.json'
    Invoke-Mutation -Description '프로브 대상 목록 쓰기: targets.json' -Action { [IO.File]::WriteAllText($targetsFile, ($targets | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false))) } | Out-Null

    # 4) 전용 계정으로 부모→자식 실행
    $argList = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f (Join-Path $workDir 'probe-parent.ps1')), '-Dir', ('"{0}"' -f $workDir), '-TargetsFile', ('"{0}"' -f $targetsFile), '-HoldSeconds', $HoldSeconds, '-TimeoutSec', $ConnectTimeoutSec)
    $parent = Invoke-Mutation -Description "전용 계정으로 부모 프로브 실행: $($Script:Ps51)" -Action { Start-Process -FilePath $Script:Ps51 -ArgumentList $argList -Credential $cred -WorkingDirectory $workDir -LoadUserProfile -PassThru -WindowStyle Hidden }
    $parentPid = [int]$parent.Id
    [void]$knownPids.Add($parentPid)

    function Wait-ForFile([string]$Path, [int]$TimeoutSec) {
        $end = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
        while ([DateTime]::UtcNow -lt $end) { if (Test-Path -LiteralPath $Path) { Start-Sleep -Milliseconds 200; return $true }; Start-Sleep -Milliseconds 200 }
        $false
    }
    $procRecords = @()
    $parentRec = Get-ProcessRecord -ProcessId $parentPid -Role 'parent'
    if ($parentRec) { $procRecords += , $parentRec } else { [void]$report.notes.Add('부모 프로세스를 CIM 으로 기록하지 못했다(이미 끝났거나 접근 불가). 자기 보고 값만 쓴다.') }
    $childPid = $null
    if (Wait-ForFile (Join-Path $workDir 'parent-child.json') 30) {
        $childPid = [int](Read-IsoJson -Path (Join-Path $workDir 'parent-child.json')).childPid
        [void]$knownPids.Add($childPid)
        $childRec = Get-ProcessRecord -ProcessId $childPid -Role 'child'
        if ($childRec) { $procRecords += , $childRec } else { [void]$report.notes.Add('자식 프로세스를 CIM 으로 기록하지 못했다. 자기 보고 값만 쓴다.') }
    } else { [void]$report.notes.Add('30초 안에 자식 프로세스 PID 를 알지 못했다.') }
    $totalWait = $HoldSeconds + ($targets.Count * ($ConnectTimeoutSec + 2)) + 20
    $gotChild = Wait-ForFile (Join-Path $workDir 'child-result.json') $totalWait
    [void](Wait-ForFile (Join-Path $workDir 'parent-done.json') 10)

    # 자기 보고 값으로 CIM 기록을 보강·교차 확인한다.
    $childRes = $null
    if ($gotChild) { $childRes = Read-IsoJson -Path (Join-Path $workDir 'child-result.json') }
    foreach ($rec in $procRecords) {
        if ($rec.role -eq 'child' -and $childRes) {
            $rec.endUtc = [string]$childRes.endUtc
            $rec['selfReportMatchesCim'] = (([int]$childRes.self.pid -eq [int]$rec.processId) -and (([string]$childRes.self.exePath) -ieq ([string]$rec.exePath)) -and ([string]$childRes.self.sid -eq [string]$rec.ownerSid))
        }
        if ($rec.role -eq 'parent' -and (Test-Path -LiteralPath (Join-Path $workDir 'parent-done.json'))) { $rec.endUtc = [string](Read-IsoJson -Path (Join-Path $workDir 'parent-done.json')).endUtc }
    }
    $wrongUser = @($procRecords | Where-Object { $_.ownerSid -ne $sid })
    if ($wrongUser.Count -gt 0) { [void]$report.notes.Add('기록된 프로세스 중 소유 SID 가 전용 계정과 다른 것이 있다. 이번 실행 식별을 신뢰하지 않는다: ' + (($wrongUser | ForEach-Object { "$($_.role)=$($_.ownerSid)" }) -join ', ')) }
    $report.processes = $procRecords

    # A. 연결 시도 결과
    $attempts = @(); if ($childRes) { $attempts = @($childRes.attempts) }
    $report.connectionAttempts = $attempts
    # B. 루프백 수신기(OS 차단 관측과 섞지 않는다)
    $hits = @()
    while ($l1.Pending()) { $c = $l1.AcceptTcpClient(); $hits += [string]$c.Client.RemoteEndPoint; $c.Close() }
    $report.loopbackReceiver = [ordered]@{ hits = $hits.Count; remoteEndpoints = $hits; listener = "127.0.0.1:$l1Port"; meaning = '루프백 주소로 온 연결만 센다. 외부 통신이 없었다는 뜻이 아니다.' }

    # 선택: self-address 대조군(관리자 계정의 같은 연결)
    $selfHitsIsolated = $null
    if ($l2) {
        $selfHitsIsolated = 0; while ($l2.Pending()) { $c = $l2.AcceptTcpClient(); $selfHitsIsolated++; $c.Close() }
        $ctlTargets = Join-Path $workDir 'control-targets.json'
        $ctl = @([ordered]@{ name = 'self-address-control'; address = $selfIp; port = ([Net.IPEndPoint]$l2.LocalEndpoint).Port })
        Invoke-Mutation -Description '대조군 대상 목록 쓰기' -Action { [IO.File]::WriteAllText($ctlTargets, ($ctl | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false))) } | Out-Null
        $ctlArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f (Join-Path $workDir 'probe-child.ps1')), '-Dir', ('"{0}"' -f $workDir), '-TargetsFile', ('"{0}"' -f $ctlTargets), '-ResultFile', 'control-result.json', '-HoldSeconds', 0, '-TimeoutSec', $ConnectTimeoutSec)
        Invoke-Mutation -Description '대조군: 관리자 계정으로 같은 연결 시도' -Action { Start-Process -FilePath $Script:Ps51 -ArgumentList $ctlArgs -Wait -WindowStyle Hidden } | Out-Null
        $selfHitsControl = 0; while ($l2.Pending()) { $c = $l2.AcceptTcpClient(); $selfHitsControl++; $c.Close() }
        $ctlRes = $null; if (Test-Path -LiteralPath (Join-Path $workDir 'control-result.json')) { $ctlRes = Read-IsoJson -Path (Join-Path $workDir 'control-result.json') }
        $report.controlSelfAddress = [ordered]@{ listenerHitsFromIsolatedAccount = $selfHitsIsolated; listenerHitsFromControl = $selfHitsControl; controlOutcome = $(if ($ctlRes) { [string]@($ctlRes.attempts)[0].outcome } else { 'no-result' }) }
    }

    # 선택: 가상환경 python 접근 확인(semgrep 아님)
    if ($VenvPython) {
        $outFile = Join-Path $workDir 'venv-python.txt'
        $pyArgs = @('-I', '-c', ('"import sys; open(r\"{0}\",\"w\").write(sys.prefix)"' -f $outFile))
        $vp = $null; $vpErr = $null
        try { $vp = Invoke-Mutation -Description "전용 계정으로 가상환경 python 실행(접근 확인): $VenvPython" -Action { Start-Process -FilePath $VenvPython -ArgumentList $pyArgs -Credential $cred -WorkingDirectory $workDir -LoadUserProfile -PassThru -Wait -WindowStyle Hidden } } catch { $vpErr = $_.Exception.Message }
        $report.venvPythonAccess = [ordered]@{ python = $VenvPython; started = ($null -ne $vp); exitCode = $(if ($vp) { $vp.ExitCode } else { $null }); wroteOutput = (Test-Path -LiteralPath $outFile); error = $vpErr; meaning = 'semgrep 이 아니라 python -I 한 줄. ACL·실행 경로 확인용.' }
    }

    # C. OS 차단 관측: 로그가 반영될 시간을 조금 주고 읽는다.
    Start-Sleep -Seconds 2
    $blockedProbes = @($targets | Where-Object { $_.expectation -eq 'blocked' } | ForEach-Object { [ordered]@{ name = $_.name; destAddress = $_.address; destPort = $_.port } })
    $ev = Get-BlockEvidence -Baseline @{ lastRecordId = $base.lastRecordId; oldestRecordNumber = $base.oldestRecordNumber } -Processes $procRecords -Probes $blockedProbes -AuditFailureEnabled $auditFailureOn
    $report.osBlockObservation = $ev

    # D. 판정
    $pv = [ordered]@{}
    foreach ($t in $targets) {
        $att = @($attempts | Where-Object { $_.name -eq $t.name }) | Select-Object -First 1
        $connected = ($att -and $att.outcome -eq 'connected')
        $mc = $null; if ($ev.matchedCount) { $mc = $ev.matchedCount[$t.name] }
        $e = @{ collectionOk = [bool]$ev.collection.ok; auditFailureEnabled = $ev.collection.auditFailureEnabled; wrapped = $ev.collection.wrapped; matchedCount = $(if ($null -ne $mc) { [int]$mc } else { 0 }) }
        $pv[$t.name] = [ordered]@{ expectation = $t.expectation; attemptOutcome = $(if ($att) { $att.outcome } else { 'no-attempt-recorded' }); verdict = $(if ($att) { Get-ProbeVerdict -Expectation $t.expectation -Connected $connected -Evidence $e } else { 'NO_ATTEMPT_RECORDED' }) }
    }
    $report.probeVerdicts = $pv
    $established = ($pv['loopback'].verdict -eq 'ALLOWED_AS_EXPECTED') -and ($pv['external-reserved'].verdict -eq 'OS_BLOCK_OBSERVED') -and ($report.loopbackReceiver.hits -ge 1) -and ($wrongUser.Count -eq 0)
    if ($established) { $verdict = 'PROBE_ISOLATION_OBSERVED' }
    if ($report.controlSelfAddress -and $pv.Contains('self-address')) {
        if ($pv['self-address'].verdict -eq 'NOT_BLOCKED') { [void]$report.notes.Add('self-address 연결이 차단되지 않았다: 이 PC 자신의 주소로 가는 연결은 이 규칙의 대상이 아닐 수 있다(관측). 이것만으로 외부 차단 판정을 바꾸지 않는다.') }
        if ($report.controlSelfAddress.listenerHitsFromControl -lt 1) { [void]$report.notes.Add('대조군(관리자 계정)의 self-address 연결이 수신기에 닿지 않았다. 이 프로브는 판별력이 없다.') }
    }
} catch {
    $report.error = $_.Exception.Message
    Write-IsoLog -Level 'FAIL' -Message ('검증 중 오류: ' + $_.Exception.Message)
    $verdict = 'NOT_ESTABLISHED'
} finally {
    foreach ($l in $listeners) { try { $l.Stop() } catch { } }
    # 남은 프로세스: 이번에 기록한 PID 중 소유 SID 가 전용 계정인 것만 종료한다.
    foreach ($procId in $knownPids) {
        $left = Get-ProcessRecord -ProcessId $procId -Role 'cleanup'
        if ($left -and $left.ownerSid -eq $sid) { Invoke-Mutation -Description "남은 프로브 프로세스 종료: pid=$procId" -Action { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } | Out-Null }
    }
    if ($accountEnabledByRun) { try { Invoke-Mutation -Description "전용 계정 다시 비활성화: $($names.UserName)" -Action { Disable-LocalUser -Name $names.UserName -ErrorAction Stop } | Out-Null } catch { Write-IsoLog -Level 'FAIL' -Message ('계정 비활성화 실패: ' + $_.Exception.Message) } }
    for ($i = $auditSteps.Count - 1; $i -ge 0; $i--) { try { Close-IsoAuditWindow -Step $auditSteps[$i] } catch { Write-IsoLog -Level 'FAIL' -Message ('감사 창 닫기 실패(Remove-Isolation.ps1 로 복구): ' + $_.Exception.Message) } }
}
$report.verdict = $verdict
$report.finishedUtc = [DateTime]::UtcNow.ToString('o')
$report.auditWindows = @($auditSteps | ForEach-Object { [ordered]@{ guid = $_.name; state = $_.state; original = $_.detail.original; set = $_.detail.set } })
$out = Join-Path $Script:IsoRunDir ("verification-$stamp.json")
Write-IsoJson -Path $out -Object $report -Depth 12

Write-Host ''
Write-Host "판정: $verdict   (이 프로브 두 종류에 한정. semgrep·python·UDP·IPv6·DNS 는 관측하지 않았다)"
if ($report.probeVerdicts) { $report.probeVerdicts.Keys | ForEach-Object { Write-Host ('  {0,-18} 시도={1,-14} 판정={2}' -f $_, $report.probeVerdicts[$_].attemptOutcome, $report.probeVerdicts[$_].verdict) } }
if ($report.loopbackReceiver) { Write-Host ("  [B] 루프백 수신기 수신 건수: {0}  (OS 차단 관측과 별개)" -f $report.loopbackReceiver.hits) }
if ($report.osBlockObservation) {
    $o = $report.osBlockObservation
    Write-Host ("  [C] OS 차단 관측: 수집 ok={0} 감사 켜짐={1} 로그 밀림={2}  이번 실행으로 맞춘 이벤트={3}  식별 불가 이벤트={4}" -f $o.collection.ok, $o.collection.auditFailureEnabled, $o.collection.wrapped, $(if ($o.matchedCount) { ($o.matchedCount.Keys | ForEach-Object { "$_=$($o.matchedCount[$_])" }) -join ',' } else { '수집 불가(0 아님)' }), $(if ($null -ne $o.unidentifiedCount) { $o.unidentifiedCount } else { '수집 불가' }))
}
Write-Host "결과 파일: $out"
if ($verdict -eq 'PROBE_ISOLATION_OBSERVED') { exit 0 } else { exit 60 }
