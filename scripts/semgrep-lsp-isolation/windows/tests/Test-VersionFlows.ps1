<#
.SYNOPSIS
  관리자 진입점(Test-VersionObservation.ps1)의 판정을 모의 시스템 위에서 끝까지 돌려 보는 흐름 시험. 실제 Windows 의 계정·방화벽·감사 정책·ACL 은 읽지도 바꾸지도 않고, semgrep 은 실행하지 않는다.
.DESCRIPTION
  - 임시 샌드박스에 코드 사본(-CodeDir)과 MockSystem.ps1 을 끼워 넣고(IsolationFlows.ps1·VersionContract.ps1 뒤에 읽히게 한다), 적용(Initialize-Isolation.ps1 -Apply) 뒤
    Test-VersionObservation.ps1 -Mode stub -Execute 를 자식 프로세스로 실행한다. 실행기(version-runner.ps1)는 돌리지 않는다: 모의 Start-Process 가 실행기가 남길 수 있는 결과 파일을
    시나리오대로 만든다(정상, 읽기 실패, 실행기 오류, 스트림 미종료, 필수 상태 누락 등). 판정은 진입 스크립트의 진짜 코드가 한다. 파서만 따로 시험하는 것이 아니다.
  - 확인하는 것: 종료 코드, 보고서의 판정·버전 사용 가능 여부·실패 토큰, 이미 받은 바이트의 보존, 관측 실패와 정리 실패의 구분, 실패 뒤에도 정리가 계속되는지,
    자식에게 간 환경(전용 USERPROFILE·유출 없음), 홈 폴더가 복구 때 지워지는 작업 폴더 안에 있는지.
  - -CodeDir 로 수정 전 코드를 가리키면 같은 시나리오가 그 코드에서 어떻게 실패하는지(재현)를 볼 수 있다. 그 경우 FAIL 이 나오는 것이 정상이다.
  stub 모드로 시험한다(진짜 semgrep.exe 파일·해시·ACL 사전 조건이 필요 없다). 판정 코드는 모드와 무관하게 같은 경로이고 stub 모드는 판정 이름에 STUB_ 가 붙을 뿐이다.
  이 시험의 통과는 "합성 환경에서 진입 스크립트의 판정과 정리가 의도대로 동작한다"까지만 뜻한다. 실제 Windows·실제 실행기·실제 Semgrep 의 동작은 뜻하지 않는다.
#>
[CmdletBinding()]
param(
    [string]$CodeDir = (Split-Path $PSScriptRoot -Parent),
    [ValidateSet('pwsh', 'powershell')][string]$Engine = 'pwsh',
    [string[]]$Only = @(),
    [string]$Label = 'current',
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
$RunId = '20261028T120000Z-0a1b2c3d'
$UserName = 'bsi0a1b2c3d'
$FpcGuid = '{0CCE9226-69AE-11D9-BED3-505054503030}'
$Results = New-Object System.Collections.ArrayList
$Sandboxes = New-Object System.Collections.ArrayList
$Utf8 = New-Object Text.UTF8Encoding($false)

function Assert-Flow {
    param([string]$Case, [string]$Name, [bool]$Cond, [string]$Detail = '')
    [void]$Results.Add([ordered]@{ case = $Case; name = $Name; pass = $Cond; detail = $Detail })
    if (-not $Cond) { Write-Host ("  FAIL  [{0}] {1}  {2}" -f $Case, $Name, $Detail) -ForegroundColor Red }
}
function Get-Prop { param($Object, [string]$Path)
    $cur = $Object
    foreach ($seg in $Path.Split('.')) {
        if ($null -eq $cur) { return $null }
        $p = $cur.PSObject.Properties[$seg]
        if (-not $p) { return $null }
        $cur = $p.Value
    }
    $cur
}

# ── 샌드박스 ────────────────────────────────────────────────────────────────
function New-Sandbox {
    param([hashtable]$Scenario = @{})
    $root = Join-Path ([IO.Path]::GetTempPath()) ('iso-vflows-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
    $code = Join-Path $root 'code'
    [void][IO.Directory]::CreateDirectory($code)
    foreach ($f in Get-ChildItem -LiteralPath $CodeDir -Filter *.ps1 -File) { [IO.File]::Copy($f.FullName, (Join-Path $code $f.Name)) }
    [IO.File]::Copy((Join-Path $PSScriptRoot 'MockSystem.ps1'), (Join-Path $root 'MockSystem.ps1'))
    # 모의 시스템은 (a) 적용·복구 진입 스크립트가 읽는 IsolationFlows.ps1, (b) 버전 진입 스크립트가 읽는 VersionContract.ps1 바로 뒤에 읽히게 한다. 엔진 5.1 이 한글을 읽도록 BOM 을 붙인다.
    foreach ($target in 'IsolationFlows.ps1', 'VersionContract.ps1') {
        $real = $target -replace '\.ps1$', '.real.ps1'
        [IO.File]::Move((Join-Path $code $target), (Join-Path $code $real))
        $stub = ". (Join-Path `$PSScriptRoot '$real')`r`n. (Join-Path `$PSScriptRoot '..\MockSystem.ps1')`r`n"
        [IO.File]::WriteAllText((Join-Path $code $target), $stub, (New-Object Text.UTF8Encoding($true)))
    }
    $runDir = Join-Path $root "state\$RunId"
    [void][IO.Directory]::CreateDirectory($runDir)
    $pf = [ordered]@{ schema = 1; runId = $RunId; createdUtc = [DateTime]::UtcNow.ToString('o'); applyBlockers = @(); checks = @() }
    [IO.File]::WriteAllText((Join-Path $runDir 'preflight.json'), ($pf | ConvertTo-Json -Depth 4), $Utf8)
    $hash = (Get-FileHash -LiteralPath (Join-Path $runDir 'preflight.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    $scenarioFile = Join-Path $root 'scenario.json'
    [IO.File]::WriteAllText($scenarioFile, ($Scenario | ConvertTo-Json -Depth 8), $Utf8)
    $sb = [pscustomobject]@{ Root = $root; Code = $code; RunDir = $runDir; Hash12 = $hash.Substring(0, 12); ScenarioFile = $scenarioFile; WorkDir = (Join-Path $root "work\$RunId") }
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
function Invoke-Version { param($Sb, [switch]$Dry, [string]$StubScenario = 'ok')
    $a = @('-RunDir', $Sb.RunDir, '-Mode', 'stub', '-StubScenario', $StubScenario)
    if (-not $Dry) { $a += '-Execute' }
    Invoke-Entry $Sb 'version' 'Test-VersionObservation.ps1' $a
}
function Invoke-Recover { param($Sb) Invoke-Entry $Sb 'recover' 'Remove-Isolation.ps1' @('-RunDir', $Sb.RunDir, '-Apply') }
function Get-Fake { param($Sb) $f = Join-Path $Sb.Root 'fake-state.json'; if (Test-Path -LiteralPath $f) { [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-AuditValue { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; Get-Prop $s.audit $FpcGuid }
function Get-UserEnabled { param($Sb) $s = Get-Fake $Sb; if ($null -eq $s) { return $null }; $u = Get-Prop $s.users $UserName; if ($null -eq $u) { return $null }; $u.Enabled }
function Get-VersionReport { param($Sb) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter 'version-observation-*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null } }
function Get-StdoutBin { param($Sb) $f = Get-ChildItem -LiteralPath $Sb.RunDir -Filter 'version-stdout-*.bin' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($f.FullName)) } else { $null } }
function Get-CallsLog { param($Sb, [string]$Phase = '') $lf = Join-Path $Sb.Root 'calls.log'; if (-not (Test-Path -LiteralPath $lf)) { return '' }; $t = [IO.File]::ReadAllText($lf); if (-not $Phase) { return $t }; (($t -split "`n") | Where-Object { $_.StartsWith("[$Phase") }) -join "`n" }

# 적용까지 마친 샌드박스 + 버전 단계 시나리오(runner 손잡이)
function New-VersionSandbox {
    param([hashtable]$Version = @{})
    $sb = New-Sandbox -Scenario @{ version = $Version }
    $r = Invoke-Apply $sb
    if ($r.exit -ne 0) { throw "적용 단계가 실패했다(exit $($r.exit)): $($r.out)" }
    $sb
}
function Test-Selected { param([string]$Id) ($Only.Count -eq 0) -or ($Only -contains $Id) }

# ── 사례 표 ─────────────────────────────────────────────────────────────────
# runner: 모의 실행기가 남길 결과 파일을 바꾸는 손잡이. expect: 기대하는 판정.
#   verdict 는 STUB_ 접두를 포함한 보고서의 verdict. established = 관측이 성립했는가(종료 코드 0 + 버전 사용 가능).
$GOOD = 'STUB_VERSION_OBSERVED_AS_EXPECTED'
$cases = @(
    # 정상 대조군: 수정 뒤에도 그대로 성립해야 한다(수정 전 코드에서도 통과한다).
    @{ id = 'control'; why = '정상: stdout 0.0.0, 종료 0, 스트림 닫힘'; runner = @{}; verdict = $GOOD; exit = 0; usable = $true; failure = $null }
    @{ id = 'control-stderr-warning'; why = '정상 대조군: stderr 에 경고만 있고 stdout 은 정상'; runner = @{ stderr = "stub warning`r`n" }; verdict = $GOOD; exit = 0; usable = $true; failure = $null }
    @{ id = 'nonzero-exit'; why = '종료 코드 3(기존 동작 유지)'; runner = @{ exitCode = 3 }; verdict = 'STUB_NOT_OBSERVED:NONZERO_EXIT'; exit = 60; usable = $false; failure = 'NONZERO_EXIT' }
    @{ id = 'no-result'; why = '실행기 결과 파일이 없다(기존 동작 유지)'; runner = @{ noResult = $true }; verdict = 'STUB_NOT_OBSERVED:RUNNER_NO_RESULT'; exit = 60; usable = $false; failure = 'RUNNER_NO_RESULT' }
    # 결함 재현: 신원 정상 + 종료 0 + stdout 정상인데 수집이 불완전한 경우. 수정 전 코드는 모두 성공으로 판정한다.
    @{ id = 'stdout-read-failed'; why = 'stdout.readFailed=true'; runner = @{ set = @(@{ path = 'stdout.readFailed'; value = $true }) }; verdict = 'STUB_NOT_OBSERVED:STREAM_READ_FAILED'; exit = 60; usable = $false; failure = 'STREAM_READ_FAILED' }
    @{ id = 'stderr-read-failed'; why = 'stderr.readFailed=true'; runner = @{ set = @(@{ path = 'stderr.readFailed'; value = $true }) }; verdict = 'STUB_NOT_OBSERVED:STREAM_READ_FAILED'; exit = 60; usable = $false; failure = 'STREAM_READ_FAILED' }
    @{ id = 'runner-error'; why = '실행기 error 가 비어 있지 않다'; runner = @{ set = @(@{ path = 'error'; value = 'mock: runner failed after reading stdout' }) }; verdict = 'STUB_NOT_OBSERVED:RUNNER_ERROR'; exit = 60; usable = $false; failure = 'RUNNER_ERROR' }
    @{ id = 'streams-not-closed'; why = 'streamsClosed=false'; runner = @{ set = @(@{ path = 'streamsClosed'; value = $false }) }; verdict = 'STUB_NOT_OBSERVED:STREAMS_NOT_CLOSED'; exit = 60; usable = $false; failure = 'STREAMS_NOT_CLOSED' }
    # 필수 상태 누락·미확인은 정상으로 간주하지 않는다.
    @{ id = 'streams-closed-missing'; why = 'streamsClosed 가 결과에 없다'; runner = @{ unset = @('streamsClosed') }; verdict = 'STUB_NOT_OBSERVED:COLLECTION_STATE_UNKNOWN'; exit = 60; usable = $false; failure = 'COLLECTION_STATE_UNKNOWN' }
    @{ id = 'streams-closed-null'; why = 'streamsClosed 가 null'; runner = @{ set = @(@{ path = 'streamsClosed'; value = $null }) }; verdict = 'STUB_NOT_OBSERVED:COLLECTION_STATE_UNKNOWN'; exit = 60; usable = $false; failure = 'COLLECTION_STATE_UNKNOWN' }
    @{ id = 'stdout-readfailed-missing'; why = 'stdout.readFailed 가 결과에 없다'; runner = @{ unset = @('stdout.readFailed') }; verdict = 'STUB_NOT_OBSERVED:COLLECTION_STATE_UNKNOWN'; exit = 60; usable = $false; failure = 'COLLECTION_STATE_UNKNOWN' }
    @{ id = 'stderr-object-missing'; why = 'stderr 기록 전체가 없다'; runner = @{ unset = @('stderr') }; verdict = 'STUB_NOT_OBSERVED:COLLECTION_STATE_UNKNOWN'; exit = 60; usable = $false; failure = 'COLLECTION_STATE_UNKNOWN' }
    @{ id = 'child-state-running'; why = '자식 상태가 EXITED 가 아니다(RUNNING)'; runner = @{ childState = 'RUNNING' }; verdict = 'STUB_NOT_OBSERVED:CHILD_NOT_EXITED'; exit = 60; usable = $false; failure = 'CHILD_NOT_EXITED' }
    # 여러 결함이 겹치면 첫 토큰이 주 토큰이고 모두 기록한다.
    @{ id = 'combined'; why = 'stdout.readFailed + streamsClosed=false'; runner = @{ set = @(@{ path = 'stdout.readFailed'; value = $true }, @{ path = 'streamsClosed'; value = $false }) }; verdict = 'STUB_NOT_OBSERVED:STREAM_READ_FAILED'; exit = 60; usable = $false; failure = 'STREAM_READ_FAILED'; alsoContains = @('STREAMS_NOT_CLOSED') }
)

Write-Host ("[{0}] 엔진 {1}  코드 {2}" -f $Label, $PSVersionTable.PSVersion, $CodeDir)

foreach ($case in $cases) {
    if (-not (Test-Selected $case.id)) { continue }
    $sb = New-VersionSandbox -Version @{ events = 'empty'; runner = $case.runner }
    $r = Invoke-Version $sb
    $rep = Get-VersionReport $sb
    $id = $case.id
    $why = [string]$case.why
    Assert-Flow $id "[$why] 종료 코드 $($case.exit)" ($r.exit -eq $case.exit) "실제 $($r.exit)"
    Assert-Flow $id "[$why] 보고서가 만들어졌다" ($null -ne $rep) $r.out
    Assert-Flow $id "[$why] 판정 $($case.verdict)" ((Get-Prop $rep 'verdict') -eq $case.verdict) "실제 $(Get-Prop $rep 'verdict')"
    Assert-Flow $id "[$why] versionUsable=$($case.usable)" ((Get-Prop $rep 'interpretation.versionUsable') -eq $case.usable) "실제 $(Get-Prop $rep 'interpretation.versionUsable')"
    $fail = Get-Prop $rep 'interpretation.failure'
    Assert-Flow $id "[$why] 주 실패 토큰=$($case.failure)" ($fail -eq $case.failure) "실제 $fail"
    if ($case.failure) {
        $all = @(Get-Prop $rep 'interpretation.failures')
        Assert-Flow $id "[$why] failures 목록에 주 토큰이 있다" ($all -contains $case.failure) "실제 $($all -join ',')"
        $also = @(); if ($case.ContainsKey('alsoContains')) { $also = @($case['alsoContains']) }
        foreach ($t in $also) { Assert-Flow $id "[$why] failures 목록에 $t 도 남는다" ($all -contains $t) "실제 $($all -join ',')" }
    }
    $est = (Get-Prop $rep 'observation.established')
    Assert-Flow $id "[$why] observation.established=$($case.usable)" ($est -eq $case.usable) "실제 $est"
    # 정리는 관측과 무관하게 끝까지 돌았다(관측 실패여도 계정·감사 값이 원래대로).
    Assert-Flow $id "[$why] 정리 완료: 계정 비활성·감사 값 원래대로·cleanup.ok" (((Get-UserEnabled $sb) -eq $false) -and ((Get-AuditValue $sb) -eq 0) -and ((Get-Prop $rep 'cleanup.ok') -eq $true)) "enabled=$(Get-UserEnabled $sb) audit=$(Get-AuditValue $sb) cleanup=$(Get-Prop $rep 'cleanup.ok')"
    if ($id -like 'stdout-read-failed' -or $id -eq 'combined' -or $id -eq 'runner-error' -or $id -eq 'streams-not-closed') {
        # 이미 받은 바이트와 오류는 진단 증거로 남는다.
        Assert-Flow $id "[$why] 이미 받은 stdout 바이트가 보관된다" ((Get-StdoutBin $sb) -eq "0.0.0`r`n") "실제 '$(Get-StdoutBin $sb)'"
        Assert-Flow $id "[$why] 보고서 execution 에 수집 상태가 기록된다(readFailed·streamsClosed)" (($null -ne (Get-Prop $rep 'execution.stdout.readFailed')) -and ($null -ne (Get-Prop $rep 'execution.streamsClosed'))) "readFailed=$(Get-Prop $rep 'execution.stdout.readFailed') closed=$(Get-Prop $rep 'execution.streamsClosed')"
    }
    if ($id -eq 'runner-error') { Assert-Flow $id "[$why] 실행기 오류 문구가 보고서에 남는다" ([string](Get-Prop $rep 'execution.runnerError') -like '*runner failed*') "실제 '$(Get-Prop $rep 'execution.runnerError')'" }
}

# 관측 실패와 정리 실패는 따로 보인다: 계정 비활성화 실패 주입(예외).
if (Test-Selected 'cleanup-fails') {
    $sb = New-VersionSandbox -Version @{ events = 'empty'; disableUserFails = $true; runner = @{} }
    $r = Invoke-Version $sb; $rep = Get-VersionReport $sb
    Assert-Flow 'cleanup-fails' '관측은 성립했고 정리만 실패: 종료 코드 70' ($r.exit -eq 70) "실제 $($r.exit)"
    Assert-Flow 'cleanup-fails' '관측 판정은 그대로 성립(verdict)' ((Get-Prop $rep 'verdict') -eq $GOOD) "실제 $(Get-Prop $rep 'verdict')"
    Assert-Flow 'cleanup-fails' 'observation.established=true 이고 cleanup.ok=false 로 따로 기록된다' (((Get-Prop $rep 'observation.established') -eq $true) -and ((Get-Prop $rep 'cleanup.ok') -eq $false)) "established=$(Get-Prop $rep 'observation.established') cleanup=$(Get-Prop $rep 'cleanup.ok')"
    Assert-Flow 'cleanup-fails' '최종 상태 CLEANUP_INCOMPLETE' ((Get-Prop $rep 'finalStatus') -eq 'CLEANUP_INCOMPLETE') "실제 $(Get-Prop $rep 'finalStatus')"
}
if (Test-Selected 'both-fail') {
    $sb = New-VersionSandbox -Version @{ events = 'empty'; disableUserFails = $true; runner = @{ set = @(@{ path = 'stdout.readFailed'; value = $true }) } }
    $r = Invoke-Version $sb; $rep = Get-VersionReport $sb
    Assert-Flow 'both-fail' '관측 실패 + 정리 실패: 종료 코드 70(정리 불완전이 우선)' ($r.exit -eq 70) "실제 $($r.exit)"
    Assert-Flow 'both-fail' '관측 판정은 NOT_OBSERVED:STREAM_READ_FAILED 로 남는다(정리 실패가 덮지 않는다)' ((Get-Prop $rep 'verdict') -eq 'STUB_NOT_OBSERVED:STREAM_READ_FAILED') "실제 $(Get-Prop $rep 'verdict')"
    Assert-Flow 'both-fail' 'observation.established=false 와 cleanup.ok=false 가 따로 기록된다' (((Get-Prop $rep 'observation.established') -eq $false) -and ((Get-Prop $rep 'cleanup.ok') -eq $false)) "established=$(Get-Prop $rep 'observation.established') cleanup=$(Get-Prop $rep 'cleanup.ok')"
    Assert-Flow 'both-fail' '감사 값은 정리 실패와 무관하게 원래대로 복구됐다(정리가 항목별로 독립 실행)' ((Get-AuditValue $sb) -eq 0) "audit=$(Get-AuditValue $sb)"
}

# dry-run: 아무것도 바꾸지 않는다.
if (Test-Selected 'dry-run') {
    $sb = New-VersionSandbox -Version @{ events = 'empty'; runner = @{} }
    $before = Get-CallsLog $sb 'apply'
    $r = Invoke-Version $sb -Dry
    $vlog = Get-CallsLog $sb 'version'
    Assert-Flow 'dry-run' 'dry-run: 종료 코드 0, NOT_EXECUTED' (($r.exit -eq 0) -and ($r.out -match 'NOT_EXECUTED')) "exit=$($r.exit)"
    Assert-Flow 'dry-run' 'dry-run: 계정 켜기·프로세스 실행·감사 변경·파일 쓰기 호출이 없다' (($vlog -notmatch 'Enable-LocalUser|Start-Process|Invoke-AuditPol /set|Copy-Item|Remove-Item|Stop-Process')) $vlog
    Assert-Flow 'dry-run' 'dry-run: 작업 폴더에 tmp·state·home 이 만들어지지 않는다' (-not (Test-Path -LiteralPath (Join-Path $sb.WorkDir 'work\state'))) ''
    Assert-Flow 'dry-run' 'dry-run: 보고서를 쓰지 않는다' ($null -eq (Get-VersionReport $sb)) ''
}

# 환경과 홈 폴더: 부모 환경의 canary 가 새지 않고, 전용 USERPROFILE 이 상태 폴더 아래에 있고, 복구 때 지워지는 작업 폴더 안에 있다.
if (Test-Selected 'home-env') {
    # SEMGREP_ENABLE_VERSION_CHECK=1 은 "조회를 켜는" 부모 값이다. 자식 요청에는 부모 값이 아니라 고정값 0 이 가야 한다.
    $canaries = @{ BOSANG_CANARY_SECRET = 'must-not-leak-secret'; GITHUB_TOKEN = 'must-not-leak-token'; HTTPS_PROXY = 'http://user:pass@127.0.0.1:9'; SEMGREP_APP_TOKEN = 'must-not-leak-app-token'; SEMGREP_ENABLE_VERSION_CHECK = '1' }
    $parentProfile = $env:USERPROFILE
    foreach ($k in $canaries.Keys) { Set-Item -Path "Env:\$k" -Value $canaries[$k] }
    try {
        $sb = New-VersionSandbox -Version @{ events = 'empty'; runner = @{} }
        $r = Invoke-Version $sb
    } finally { foreach ($k in $canaries.Keys) { Remove-Item "Env:\$k" -ErrorAction SilentlyContinue } }
    $workDir = Join-Path $sb.WorkDir 'work'
    $reqFile = Join-Path $workDir 'version-request.json'
    $req = $null; if (Test-Path -LiteralPath $reqFile) { $req = [IO.File]::ReadAllText($reqFile, [Text.Encoding]::UTF8) | ConvertFrom-Json }
    $envObj = Get-Prop $req 'env'
    $names = @(); if ($envObj) { $names = @($envObj.PSObject.Properties.Name | Sort-Object) }
    $homeWant = Join-Path (Join-Path $workDir 'state') 'home'
    $expectNames = @('PATH', 'SEMGREP_APP_URL', 'SEMGREP_ENABLE_VERSION_CHECK', 'SEMGREP_LOG_FILE', 'SEMGREP_METRICS_URL', 'SEMGREP_SETTINGS_FILE', 'SEMGREP_VERSION_CACHE_PATH', 'SEMGREP_VERSION_CHECK_URL', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE') | Sort-Object
    Assert-Flow 'home-env' '실행 요청의 환경에 USERPROFILE 이 있다' ($names -contains 'USERPROFILE') ($names -join ',')
    Assert-Flow 'home-env' 'USERPROFILE 은 이 실행의 상태 폴더 아래 전용 home 이다(부모 값 복사 아님)' (([string](Get-Prop $envObj 'USERPROFILE')) -eq $homeWant) "실제 '$(Get-Prop $envObj 'USERPROFILE')' 기대 '$homeWant'"
    Assert-Flow 'home-env' '환경 변수 이름이 최소 목록 + USERPROFILE + SEMGREP_ENABLE_VERSION_CHECK 뿐이다(HOME·HOMEDRIVE·HOMEPATH·APPDATA·PYTHONUNBUFFERED 등 없음)' (($names -join ',') -eq ($expectNames -join ',')) ("실제: " + ($names -join ','))
    Assert-Flow 'home-env' '온라인 최신 버전 조회 끄기: 실행 요청의 SEMGREP_ENABLE_VERSION_CHECK 는 부모 값(1)이 아니라 고정값 0 이다' (([string](Get-Prop $envObj 'SEMGREP_ENABLE_VERSION_CHECK')) -ceq '0') "실제 '$(Get-Prop $envObj 'SEMGREP_ENABLE_VERSION_CHECK')'"
    $allValues = if ($envObj) { ($envObj.PSObject.Properties | ForEach-Object { [string]$_.Value }) -join "`n" } else { '' }
    # 샌드박스가 부모의 %TEMP%(= 부모 프로필 폴더 아래)에 있어서 "문자열을 포함하지 않는다"는 성립할 수 없다. 값 자체가 부모 프로필 폴더인지를 본다.
    $valueList = @(); if ($envObj) { $valueList = @($envObj.PSObject.Properties | ForEach-Object { [string]$_.Value }) }
    $isParentProfile = @($valueList | Where-Object { $parentProfile -and ($_.TrimEnd('\') -ieq $parentProfile.TrimEnd('\')) })
    Assert-Flow 'home-env' '자식 환경의 어떤 값도 부모의 USERPROFILE(프로필 폴더 자체)이 아니다' ($isParentProfile.Count -eq 0) ($isParentProfile -join ',')
    Assert-Flow 'home-env' '토큰·프록시 canary 가 자식 환경에 없다(이름도 값도)' (($names -notmatch 'CANARY|TOKEN|PROXY').Count -eq $names.Count -and ($allValues -notmatch 'must-not-leak|user:pass')) ($names -join ',')
    Assert-Flow 'home-env' '전용 home 폴더가 만들어졌다' (Test-Path -LiteralPath $homeWant -PathType Container) "없음: $homeWant"
    $vlog = Get-CallsLog $sb 'version'
    # 복구: 작업 폴더(.owner 확인 뒤 통째로 삭제)가 지워지면 home 도 함께 지워진다.
    $rr = Invoke-Recover $sb
    Assert-Flow 'home-env' '복구가 끝난다(종료 코드 0)' ($rr.exit -eq 0) "실제 $($rr.exit) $($rr.out)"
    Assert-Flow 'home-env' '복구 뒤 작업 폴더와 그 안의 home 이 없다' ((-not (Test-Path -LiteralPath $sb.WorkDir)) -and (-not (Test-Path -LiteralPath $homeWant))) "WorkDir 있음=$(Test-Path -LiteralPath $sb.WorkDir)"
}

# ── 정리 ────────────────────────────────────────────────────────────────────
if (-not $KeepSandbox) { foreach ($s in $Sandboxes) { try { Remove-Item -LiteralPath $s -Recurse -Force -ErrorAction Stop } catch { Write-Host "샌드박스를 지우지 못했다: $s ($($_.Exception.Message))" -ForegroundColor Yellow } } }
else { Write-Host ("샌드박스 보존: " + ($Sandboxes -join '; ')) }

$pass = @($Results | Where-Object { $_.pass }).Count
$total = $Results.Count
$failed = @($Results | Where-Object { -not $_.pass })
Write-Host ("[{0}] {1}/{2} 통과, 실패 {3}  (엔진 {4})" -f $Label, $pass, $total, $failed.Count, $PSVersionTable.PSVersion)
if ($failed.Count -gt 0) { exit 1 }
exit 0
