<#
.SYNOPSIS
  적용된 격리 안에서 전용 계정이 설치된 semgrep 실행 파일을 ["--version"] 으로 딱 한 번 실행하는 것을 관측한다. LSP 서버·규칙 다운로드·스캔은 하지 않는다.
.DESCRIPTION
  기본은 사전 조건 확인과 계획 출력만 한다(dry-run). 실제 실행은 -Execute. 좁은 용도의 진입점이며 범용 실행기가 아니다.
  - 실행기(version-runner.ps1)는 mode 가 semgrep-version 이면 이름이 semgrep.exe 인 절대 경로 파일과 인자 ["--version"] 만, stub 이면 version-stub.ps1 의 고정 시나리오만 실행한다.
  - semgrep-version 모드의 한도는 scripts/semgrep-lsp/tool-observation.ts 의 DEFAULT_VERSION_LIMITS(30000ms / 4096B / 16384B / 5000ms)에 고정돼 있어 바꾸려 하면 거부한다. stub 모드만 한도를 바꿀 수 있다.
  - 환경은 계약대로 최소 목록(PATH·SYSTEMROOT·TEMP·TMP)과 SEMGREP_APP_URL/METRICS_URL/VERSION_CHECK_URL(= 이 스크립트가 연 루프백 수신기), SEMGREP_LOG_FILE/SETTINGS_FILE/VERSION_CACHE_PATH(작업 폴더 안)뿐이다.
    사용자 환경(토큰·프록시 자격증명 포함)을 물려주지 않는다. 계약과 다른 점: PATH 는 이 PC 사용자 PATH 가 아니라 Windows 폴더(System32;Windows)로 고정하고 TEMP/TMP 는 작업 폴더 안으로 둔다(더 좁게 한 것).
  - 실행 순서(-Execute): 사전 조건(휠·실행 파일 해시, 가상환경/기반 Python ACL 부여 확인) → 감사 창(Filtering Platform Connection 실패) → 로그 기준점 → 계정 켜기 → 루프백 수신기 →
    전용 계정으로 실행기 → 프로세스 트리 관측 → 신원 교차 확인 → 해석 계약 적용(VersionContract.ps1) → 5157 대조(이번 실행의 프로세스에 귀속된 것만) → 정리(독립 실행·읽어서 확인).
  - 보고는 항목을 섞지 않는다: [A] 실행 결과(종료 코드·stdout·stderr·소요 시간·실행 파일·인자·계정 SID), [B] 프로세스·자식 정리, [C] 루프백 수신기 수신, [D] OS 차단 관측(5157), [E] 해석·판정, [F] 정리.
  - 루프백 수신 0건이나 5157 0건을 "외부 통신이 없었다"로 해석하지 않는다. DNS 등 관측하지 못한 경로는 미확인이다.
  종료 코드: 0 관측 성립 + 정리 완료 / 30 거부 / 50 사전 조건 실패 / 60 관측 성립하지 않음(정리는 완료; 버전이 기대와 다르거나 형식이 계약과 다른 경우 포함) / 70 정리 불완전.
.EXAMPLE
  .\Test-VersionObservation.ps1 -RunDir <RunDir> -SemgrepExe <venv>\Scripts\semgrep.exe -ExpectedExeSha256 <hex> -WheelPath <whl> -ExpectedWheelSha256 <hex>              # 계획·사전 조건만
  .\Test-VersionObservation.ps1 -RunDir <RunDir> -Mode stub -StubScenario ok -Execute                                                                                  # 경로 점검(스텁)
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RunDir,
    [switch]$Execute,
    [ValidateSet('semgrep-version', 'stub')][string]$Mode = 'semgrep-version',
    [ValidateSet('ok', 'ok-stderr', 'nonzero', 'multiline', 'bom', 'prefixed', 'sleep', 'flood-out', 'flood-err', 'orphan', 'env-names', 'cwd', 'home')][string]$StubScenario = 'ok',
    [string]$SemgrepExe,
    [string]$ExpectedExeSha256,
    [string]$WheelPath,
    [string]$ExpectedWheelSha256,
    [string]$ExpectedVersion = '1.180.0',
    [int]$TimeoutMs = 30000,
    [int]$MaxStdoutBytes = 4096,
    [int]$MaxStderrBytes = 16384,
    [int]$KillWaitMs = 5000
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
. (Join-Path $PSScriptRoot 'VersionContract.ps1')
$Script:EntryDir = $PSScriptRoot

function Get-DescendantCim([int]$RootPid, $RootStart, $Table) {
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

function Invoke-VersionObservation {
    param(
        [string]$RunDir, [bool]$Execute, [string]$Mode, [string]$StubScenario, [string]$SemgrepExe, [string]$ExpectedExeSha256,
        [string]$WheelPath, [string]$ExpectedWheelSha256, [string]$ExpectedVersion, [int]$TimeoutMs, [int]$MaxStdoutBytes, [int]$MaxStderrBytes, [int]$KillWaitMs
    )
    if (-not (Test-Path -LiteralPath $RunDir)) { Write-Host "RunDir 가 없다: $RunDir"; return @{ exitCode = 30 } }
    $Script:IsoRunDir = (Resolve-Path -LiteralPath $RunDir).Path
    $Script:ApplyMode = $Execute
    $manifestFile = Join-Path $Script:IsoRunDir 'resources.json'
    if (-not (Test-Path -LiteralPath $manifestFile)) { Write-Host '실행 기록(resources.json)이 없다. Initialize-Isolation.ps1 -Apply 가 먼저 필요하다.'; return @{ exitCode = 50 } }

    # 실제 모드의 한도는 어댑터 계약 값에 고정한다.
    $limits = [ordered]@{ timeoutMs = $TimeoutMs; maxStdoutBytes = $MaxStdoutBytes; maxStderrBytes = $MaxStderrBytes; killWaitMs = $KillWaitMs }
    if ($Mode -eq 'semgrep-version') {
        foreach ($k in $Script:VersionLimits.Keys) { if ([int]$limits[$k] -ne [int]$Script:VersionLimits[$k]) { Write-Host "semgrep-version 모드의 한도는 어댑터 계약 값에 고정돼 있다($k): 거부한다."; return @{ exitCode = 30 } } }
        if (-not $SemgrepExe -or -not $ExpectedExeSha256 -or -not $WheelPath -or -not $ExpectedWheelSha256) { Write-Host 'semgrep-version 모드는 -SemgrepExe -ExpectedExeSha256 -WheelPath -ExpectedWheelSha256 이 모두 필요하다.'; return @{ exitCode = 30 } }
    }

    $m = Import-IsoManifest -Path $manifestFile
    $runId = [string]$m.runId
    $names = Get-IsoNames -RunId $runId
    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'")

    # ── 사전 조건(읽기) ──
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

    $inputs = [ordered]@{ mode = $Mode }
    $venvPython = $null; $basePython = $null
    if ($Mode -eq 'semgrep-version') {
        $exeOk = ([IO.Path]::IsPathRooted($SemgrepExe) -and -not $SemgrepExe.StartsWith('\\') -and (Split-Path -Leaf $SemgrepExe) -eq 'semgrep.exe' -and (Test-Path -LiteralPath $SemgrepExe -PathType Leaf))
        & $addPre 'V01' $exeOk "실행 파일이 로컬 절대 경로의 semgrep.exe 로 존재하는가 ($SemgrepExe)"
        $exeHash = $null; $exeSize = $null
        if ($exeOk) { $exeHash = Get-FileSha256Hex -Path $SemgrepExe; $exeSize = (Get-Item -LiteralPath $SemgrepExe).Length }
        & $addPre 'V02' ($exeOk -and $exeHash -eq $ExpectedExeSha256.ToLowerInvariant()) "semgrep.exe 의 SHA-256 이 기대값과 같은가 (실제 $exeHash, 크기 $exeSize)"
        $wheelHash = $null; $wheelSize = $null
        if ($WheelPath -and (Test-Path -LiteralPath $WheelPath -PathType Leaf)) { $wheelHash = Get-FileSha256Hex -Path $WheelPath; $wheelSize = (Get-Item -LiteralPath $WheelPath).Length }
        & $addPre 'V03' ($wheelHash -and $wheelHash -eq $ExpectedWheelSha256.ToLowerInvariant()) "원본 휠의 현재 SHA-256 이 기대값(보고서 값)과 같은가 (실제 $wheelHash, 크기 $wheelSize)"
        $venvRoot = $null; $home0 = $null
        if ($exeOk) {
            $scriptsDir = Split-Path -Parent $SemgrepExe
            if ((Split-Path -Leaf $scriptsDir) -eq 'Scripts') { $venvRoot = Split-Path -Parent $scriptsDir }
            $cfg = $null; if ($venvRoot) { $cfg = Join-Path $venvRoot 'pyvenv.cfg' }
            if ($cfg -and (Test-Path -LiteralPath $cfg)) { $line = @(Get-Content -LiteralPath $cfg | Where-Object { $_ -match '^\s*home\s*=' }) | Select-Object -First 1; if ($line) { $home0 = ($line -replace '^\s*home\s*=\s*', '').Trim() } }
        }
        $venvPython = $(if ($venvRoot) { Join-Path $venvRoot 'Scripts\python.exe' }); $basePython = $(if ($home0) { Join-Path $home0 'python.exe' })
        & $addPre 'V04' ([bool]($venvRoot -and $home0 -and (Test-Path -LiteralPath $venvPython) -and (Test-Path -LiteralPath $basePython))) "가상환경 루트와 기반 Python 폴더를 pyvenv.cfg 에서 확정했는가 (venv=$venvRoot, home=$home0)"
        # 권한 부여 기록: 가상환경 루트와 기반 Python 폴더가 이번 실행의 aclGrant 단계에 있어야 하고, 대상 파일의 ACL 에 전용 SID 의 읽기·실행 ACE 가 있어야 한다.
        $grants = @($m.steps | Where-Object { $_.kind -eq 'aclGrant' } | ForEach-Object { [IO.Path]::GetFullPath([string]$_.name).TrimEnd('\') })
        $grantOk = [bool]($venvRoot -and $home0 -and ($grants | Where-Object { $_.Equals($venvRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) }) -and ($grants | Where-Object { $_.Equals($home0.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) }))
        & $addPre 'V05' $grantOk "이번 실행의 권한 부여 기록이 가상환경 루트와 기반 Python 폴더 둘을 포함하는가 (기록: $($grants -join ' ; '))"
        $aceDetail = @()
        $aceOk = $false
        if ($grantOk) {
            $aceOk = $true
            foreach ($f in @($SemgrepExe, $venvPython, $basePython)) {
                $has = @((Get-Acl -LiteralPath $f).Access | Where-Object { $_.AccessControlType -eq 'Allow' -and (([int]$_.FileSystemRights -band 0xA9) -eq 0xA9) -and ($(try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { [string]$_.IdentityReference }) -eq $sid) }).Count
                $aceDetail += ("{0}={1}" -f (Split-Path -Leaf $f), $has); if ($has -lt 1) { $aceOk = $false }
            }
        }
        & $addPre 'V06' $aceOk "실행에 필요한 세 파일의 ACL 에 전용 SID 의 읽기·실행 ACE 가 있는가 ($($aceDetail -join ', '))"
        $inputs = [ordered]@{
            mode = $Mode; semgrepExe = $SemgrepExe; semgrepExeSha256 = $exeHash; semgrepExeSize = $exeSize; semgrepExeSha256Expected = $ExpectedExeSha256
            wheelPath = $WheelPath; wheelSha256 = $wheelHash; wheelSize = $wheelSize; wheelSha256Expected = $ExpectedWheelSha256
            venvRoot = $venvRoot; basePythonHome = $home0; grantedPaths = $grants
            venvPythonSha256 = $(if ($venvPython -and (Test-Path -LiteralPath $venvPython)) { Get-FileSha256Hex -Path $venvPython }); basePythonSha256 = $(if ($basePython -and (Test-Path -LiteralPath $basePython)) { Get-FileSha256Hex -Path $basePython })
        }
    } else {
        $inputs = [ordered]@{ mode = $Mode; stubScenario = $StubScenario }
    }
    $preFail = @($pre | Where-Object { -not $_.ok })
    if ($preFail.Count -gt 0) {
        Write-Host ('사전 조건 실패: ' + (($preFail | ForEach-Object { $_.id }) -join ', ') + ' — 실행하지 않는다.') -ForegroundColor Yellow
        return @{ exitCode = 50 }
    }

    $workDir = Join-Path $names.WorkDir 'work'
    $tmpDir = Join-Path $workDir 'tmp'; $stateDir = Join-Path $workDir 'state'
    $homeDir = Get-VersionChildHome -StateDir $stateDir       # 전용 USERPROFILE. 작업 폴더 안이라 복구가 작업 폴더(.owner 확인 뒤)를 지울 때 함께 지워진다
    $resultFile = Join-Path $workDir 'version-result.json'; $reqFile = Join-Path $workDir 'version-request.json'
    $exe = $SemgrepExe; $argv = @($Script:VersionArgs); $runnerMode = 'semgrep-version'
    if ($Mode -eq 'stub') { $exe = $Script:Ps51; $argv = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-Path $workDir 'version-stub.ps1'), $StubScenario); $runnerMode = 'stub'; if (-not $ExpectedVersion -or $ExpectedVersion -eq '1.180.0') { $ExpectedVersion = '0.0.0' } }

    $modeText = 'DRY-RUN(계획만)'; if ($Execute) { $modeText = 'EXECUTE(실제 실행)' }
    Write-IsoLog -Level 'INFO' -Message ("모드: {0}  실행 종류: {1}" -f $modeText, $Mode)
    if (-not $Execute) {
        Write-IsoLog -Level 'PLAN' -Message '감사 창 열기(Filtering Platform Connection 실패 감사) → 로그 기준점 기록 → 전용 계정 사용 켜기 → 이전 결과 파일 지우기 → 작업 폴더에 tmp·state·state\home(전용 USERPROFILE) 만들고 실행기 복사 → 루프백 수신기 열기'
        Write-IsoLog -Level 'PLAN' -Message ("전용 계정으로 실행기 실행 → 실행기가 셸 없이 한 번 실행: {0} {1}  (cwd={2}, 한도 {3}ms/{4}B/{5}B/{6}ms)" -f $exe, ($argv -join ' '), $workDir, $limits.timeoutMs, $limits.maxStdoutBytes, $limits.maxStderrBytes, $limits.killWaitMs)
        Write-IsoLog -Level 'PLAN' -Message '프로세스 트리를 관리자 쪽에서 직접 관측(CIM) → 신원 교차 확인 → 해석 계약 적용 → 5157 을 이번 실행의 프로세스에 귀속된 것만 대조 → 판정'
        Write-IsoLog -Level 'PLAN' -Message '정리(각각 독립 실행·읽어서 확인): 수신기 정지, 전용 계정의 남은 프로세스 종료, 계정 비활성화, 감사 값 복구'
        Write-Host 'dry-run 이라 아무것도 실행하지 않았다. 판정: NOT_EXECUTED'
        return @{ exitCode = 0 }
    }

    # ── 실행 ──
    $runToken = [guid]::NewGuid().ToString('N')
    $report = [ordered]@{
        schema = 1; runId = $runId; runToken = $runToken; startedUtc = [DateTime]::UtcNow.ToString('o'); mode = $Mode; stubScenario = $(if ($Mode -eq 'stub') { $StubScenario } else { $null }); verdict = $null; finalStatus = $null
        scope = 'semgrep 실행 파일을 ["--version"] 으로 한 번 실행한 결과만 관측한다(stub 모드는 실행 경로 점검). LSP 서버·규칙·스캔은 하지 않았다. DNS·UDP·ICMP·IPv6·서비스가 대신 수행하는 통신은 관측하지 않았다.'
        preconditions = $pre; inputs = $inputs; account = [ordered]@{ name = $names.UserName; sid = $sid }; rule = [ordered]@{ name = $names.RuleName; localUser = $ruleScope; remoteAddress = $ruleRemote }
        request = $null; runnerResult = $null; identity = $null; processes = $null; execution = $null; interpretation = $null
        loopbackReceiver = $null; osBlockObservation = $null; childCleanup = $null; cleanup = $null; auditWindows = $null; hashesAfter = $null; notes = (New-Object System.Collections.ArrayList); error = $null
    }
    $auditSteps = New-Object System.Collections.ArrayList
    $accountTouched = $false
    $listener = $null
    $tracked = New-Object System.Collections.ArrayList        # 이번 실행의 프로세스 기록(5157 대조용)
    $trackedKeys = @{}
    $verdict = 'NOT_ESTABLISHED'
    try {
        Open-IsoAuditWindow -Guid $Script:AuditGuid.FilteringPlatformConnection -EnableSuccess $false -EnableFailure $true -Registry $auditSteps -Why '5157(차단된 연결) 기록용, 이 실행 동안만' | Out-Null
        $base = Get-SecurityLogState
        if (-not $base.ok) { throw "실행 직전 Security 로그 기준점을 읽지 못했다: $($base.error)" }
        $accountTouched = $true
        Invoke-Mutation -Description "전용 계정 사용 켜기(끝나면 다시 끈다): $($names.UserName)" -Action { Enable-LocalUser -Name $names.UserName -ErrorAction Stop } | Out-Null
        $secure = ConvertTo-SecureString -String ([IO.File]::ReadAllText((Join-Path $Script:IsoRunDir 'credential.dpapi')).Trim())
        $cred = New-Object System.Management.Automation.PSCredential(('.\' + $names.UserName), $secure)

        foreach ($a in 'version-result.json', 'version-result.json.tmp', 'version-request.json') {
            $ap = Join-Path $workDir $a
            if (Test-Path -LiteralPath $ap) { Invoke-Mutation -Description "이전 실행의 파일 삭제: $a" -Action { Remove-Item -LiteralPath $ap -Force -ErrorAction Stop } | Out-Null }
        }
        foreach ($d in $tmpDir, $stateDir, $homeDir) { if (-not (Test-Path -LiteralPath $d)) { Invoke-Mutation -Description "작업 폴더 안에 폴더 만들기: $d" -Action { New-Item -ItemType Directory -Path $d -ErrorAction Stop | Out-Null } | Out-Null } }
        $toCopy = @('version-runner.ps1'); if ($Mode -eq 'stub') { $toCopy += 'version-stub.ps1' }
        foreach ($f in $toCopy) { $src = Join-Path $Script:EntryDir $f; Invoke-Mutation -Description "작업 폴더로 복사: $f" -Action { Copy-Item -LiteralPath $src -Destination (Join-Path $workDir $f) -Force -ErrorAction Stop } | Out-Null }

        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $listener.Start()
        $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
        $url = "http://127.0.0.1:$port"
        # 자식 환경은 이 함수가 만드는 것뿐이다(부모 환경·토큰·프록시를 물려주지 않는다). USERPROFILE 은 부모 값이 아니라 위에서 만든 전용 home 이다.
        $envTable = New-VersionChildEnv -WindowsDir $env:WINDIR -TmpDir $tmpDir -StateDir $stateDir -Url $url
        $reqDoc = [ordered]@{ runToken = $runToken; mode = $runnerMode; exe = $exe; args = $argv; cwd = $workDir; env = $envTable; limits = $limits; resultFile = $resultFile }
        $report.request = [ordered]@{ mode = $runnerMode; exe = $exe; args = $argv; cwd = $workDir; envNames = @($envTable.Keys); envValuesLoopbackUrl = $url; limits = $limits }
        Invoke-Mutation -Description '실행 요청 쓰기: version-request.json(이번 실행의 토큰 포함)' -Action { [IO.File]::WriteAllText($reqFile, ($reqDoc | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false))) } | Out-Null

        $argList = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"{0}"' -f (Join-Path $workDir 'version-runner.ps1')), '-RequestFile', ('"{0}"' -f $reqFile))
        $launchedUtc = [DateTime]::UtcNow
        $parent = Invoke-Mutation -Description "전용 계정으로 실행기 실행: $($Script:Ps51)" -Action { Start-Process -FilePath $Script:Ps51 -ArgumentList $argList -Credential $cred -WorkingDirectory $workDir -LoadUserProfile -PassThru -WindowStyle Hidden }
        $parentPid = [int]$parent.Id
        $runnerRec = Get-ProcessRecord -ProcessId $parentPid -Role 'runner'
        if ($runnerRec) { $runnerRec.commandLine = $null; [void]$tracked.Add($runnerRec); $trackedKeys["$parentPid|$($runnerRec.startUtc)"] = $runnerRec }
        $runnerStart = $null; if ($runnerRec) { $runnerStart = (ConvertTo-UtcDate $runnerRec.startUtc).ToLocalTime() }

        # ── 관측 루프: 수신기 비우기 + 프로세스 트리 기록 + 결과 파일 기다리기 ──
        $hits = New-Object System.Collections.ArrayList
        $resultObj = $null; $resultSeenAt = $null; $runnerGoneAt = $null; $adminTimedOut = $false
        $deadline = [DateTime]::UtcNow.AddMilliseconds([double]($limits.timeoutMs + $limits.killWaitMs + 25000))
        while ($true) {
            while ($listener.Pending()) { $c = $listener.AcceptTcpClient(); [void]$hits.Add([string]$c.Client.RemoteEndPoint); $c.Close() }
            $tbl = $null; try { $tbl = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate -ErrorAction Stop) } catch { $tbl = $null }
            if ($null -ne $tbl) {
                $present = @{}
                $desc = Get-DescendantCim $parentPid $runnerStart $tbl
                foreach ($d in $desc) {
                    $key = '{0}|{1}' -f $d.ProcessId, $d.CreationDate.ToUniversalTime().ToString('o')
                    $present[$key] = $true
                    if (-not $trackedKeys.ContainsKey($key)) {
                        $ownerSid = $null; try { $o = Invoke-CimMethod -InputObject $d -MethodName GetOwnerSid -ErrorAction Stop; if ($o.ReturnValue -eq 0) { $ownerSid = $o.Sid } } catch { }
                        $rec = [ordered]@{ role = 'descendant'; processId = [int]$d.ProcessId; parentProcessId = [int]$d.ParentProcessId; exePath = $d.ExecutablePath; commandLine = $d.CommandLine; startUtc = $d.CreationDate.ToUniversalTime().ToString('o'); endUtc = $null; ownerSid = $ownerSid; snapshotUtc = [DateTime]::UtcNow.ToString('o') }
                        [void]$tracked.Add($rec); $trackedKeys[$key] = $rec
                    }
                }
                foreach ($k in @($trackedKeys.Keys)) {
                    $rec = $trackedKeys[$k]
                    if ($null -eq $rec.endUtc -and -not $present.ContainsKey($k) -and $rec.role -eq 'descendant') { $rec.endUtc = [DateTime]::UtcNow.ToString('o') }
                }
            }
            if ($null -eq $resultObj -and (Test-Path -LiteralPath $resultFile)) {
                try { $o2 = Read-IsoJson -Path $resultFile; if ((Get-IsoProp $o2 'runToken') -eq $runToken) { $resultObj = $o2; $resultSeenAt = [DateTime]::UtcNow } } catch { }
            }
            $alive = [bool](Get-Process -Id $parentPid -ErrorAction SilentlyContinue)
            if (-not $alive -and $null -eq $runnerGoneAt) { $runnerGoneAt = [DateTime]::UtcNow }
            if ($resultObj -and -not $alive) { break }
            if ($resultObj -and ([DateTime]::UtcNow - $resultSeenAt).TotalSeconds -gt 5) { break }
            if (-not $alive -and -not $resultObj -and ([DateTime]::UtcNow - $runnerGoneAt).TotalSeconds -gt 3) { break }
            if ([DateTime]::UtcNow -gt $deadline) { $adminTimedOut = $true; break }
            Start-Sleep -Milliseconds 40
        }
        # 마지막으로 한 번 더 비우고, 남은 기록의 종료 시각을 채운다.
        Start-Sleep -Milliseconds 300
        while ($listener.Pending()) { $c = $listener.AcceptTcpClient(); [void]$hits.Add([string]$c.Client.RemoteEndPoint); $c.Close() }
        foreach ($rec in $tracked) {
            if ($null -eq $rec.endUtc -and -not (Get-Process -Id $rec.processId -ErrorAction SilentlyContinue)) { $rec.endUtc = [DateTime]::UtcNow.ToString('o') }
        }
        if ($runnerRec -and $null -eq $runnerRec.endUtc -and $resultObj) { $runnerRec.endUtc = (ConvertTo-UtcDate (Get-IsoProp $resultObj 'finishedUtc')).ToString('o') }
        $report.runnerResult = $resultObj
        if ($adminTimedOut) { [void]$report.notes.Add('관리자 쪽 대기 한도를 넘겼다(실행기 결과 파일이 제때 오지 않음). 아래 정리에서 전용 계정의 프로세스를 모두 끝낸다.') }
        if (-not $resultObj) { [void]$report.notes.Add('실행기 결과 파일을 받지 못했다(RUNNER_NO_RESULT). 이번 실행의 stdout·종료 코드는 없다.') }

        # ── 신원 교차 확인: 서로 다른 출처(관리자 CIM ↔ 실행기 자기 보고)가 모두 맞아야 한다. ──
        $fail = New-Object System.Collections.ArrayList
        $addF = { param([string]$Code, [string]$Msg); [void]$fail.Add([ordered]@{ code = $Code; message = $Msg }) }
        $same = { param($a, $b); ($null -ne $a) -and ($null -ne $b) -and ([string]$a).Equals([string]$b, [StringComparison]::OrdinalIgnoreCase) }
        $childRec = $null
        if (-not $resultObj) { & $addF 'NO_RUNNER_RESULT' '실행기 결과 파일(이번 실행의 토큰)이 없다' }
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
            if (-not [bool](Get-IsoProp $cinfo 'started')) { & $addF 'CHILD_NOT_STARTED' '실행기가 자식을 시작하지 못했다' }
            else {
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
                    if ($Mode -eq 'semgrep-version' -and -not $cl.Equals($wantCl, [StringComparison]::OrdinalIgnoreCase)) { & $addF 'CHILD_COMMANDLINE_MISMATCH' "자식 명령줄이 기대와 다르다(실제: $cl)" }
                    if ($Mode -eq 'stub' -and -not ($cl -like "*version-stub.ps1 $StubScenario")) { & $addF 'CHILD_COMMANDLINE_MISMATCH' "자식 명령줄이 기대와 다르다(실제: $cl)" }
                    $selfStart = Get-IsoProp $cinfo 'startUtc'
                    if ($selfStart) { $dt = [Math]::Abs(((ConvertTo-UtcDate $selfStart) - (ConvertTo-UtcDate $childRec.startUtc)).TotalSeconds); if ($dt -gt 3) { & $addF 'CHILD_START_MISMATCH' "자식 시작 시각이 자기 보고와 CIM 에서 ${dt}초 다르다" } }
                }
            }
        }
        $report.identity = [ordered]@{
            ok = ($fail.Count -eq 0); failures = @($fail)
            checked = @('실행기 결과 파일의 실행 토큰', '실행기 CIM 기록: 소유 SID = 전용 계정, 실행 파일 = powershell.exe 5.1, 시작 시각', '실행기 자기 보고(PID·SID·경로) = CIM', '자식 CIM 기록 존재·부모 = 실행기·소유 SID = 전용 계정·실행 파일 = 요청한 파일·명령줄 = 요청한 인자·시작 시각 = 자기 보고')
        }
        $report.processes = @($tracked)

        # ── 실행 결과(실행기가 적은 사실)와 해석 ──
        $stdoutBytes = [byte[]]@(); $stderrBytes = [byte[]]@()
        if ($resultObj) {
            $so = Get-IsoProp $resultObj 'stdout'; $se = Get-IsoProp $resultObj 'stderr'
            if ($so -and (Get-IsoProp $so 'b64')) { $stdoutBytes = [Convert]::FromBase64String([string](Get-IsoProp $so 'b64')) }
            if ($se -and (Get-IsoProp $se 'b64')) { $stderrBytes = [Convert]::FromBase64String([string](Get-IsoProp $se 'b64')) }
            $ci = Get-IsoProp $resultObj 'child'
            $report.execution = [ordered]@{
                exe = $exe; args = $argv; cwd = $workDir; accountSid = $sid; runnerPid = $parentPid; childPid = (Get-IsoProp $ci 'pid')
                exitCode = (Get-IsoProp $ci 'exitCode'); childState = (Get-IsoProp $resultObj 'childState'); killed = (Get-IsoProp $ci 'killed'); timedOut = (Get-IsoProp $ci 'timedOut'); outputLimitExceeded = (Get-IsoProp $ci 'outputLimitExceeded')
                durationMsObserved = (Get-IsoProp $resultObj 'durationMsObserved'); durationMsOs = (Get-IsoProp $resultObj 'durationMsOs'); streamsClosed = (Get-IsoProp $resultObj 'streamsClosed')
                runnerError = (Get-IsoProp $resultObj 'error'); runnerRefused = (Get-IsoProp $resultObj 'refused')       # 수집 상태: 실행기 오류와 스트림 읽기 실패·종료 여부는 판정(Get-VersionObservationFailures)이 쓴다
                stdout = [ordered]@{ bytes = $stdoutBytes.Length; bytesRead = (Get-IsoProp $so 'bytesRead'); overflow = (Get-IsoProp $so 'overflow'); readFailed = (Get-IsoProp $so 'readFailed'); readState = (Get-IsoProp $so 'state'); readError = (Get-IsoProp $so 'error'); hex = (($stdoutBytes | ForEach-Object { $_.ToString('x2') }) -join '') }
                stderr = [ordered]@{ bytes = $stderrBytes.Length; bytesRead = (Get-IsoProp $se 'bytesRead'); overflow = (Get-IsoProp $se 'overflow'); readFailed = (Get-IsoProp $se 'readFailed'); readState = (Get-IsoProp $se 'state'); readError = (Get-IsoProp $se 'error'); note = 'stderr 는 해석에 쓰지 않는다(바이트 수만 기록). 원문은 version-stderr.bin' }
                childEnvNamesPassed = @($envTable.Keys); runnerEnvNames = (Get-IsoProp (Get-IsoProp $resultObj 'runner') 'envNames')
            }
            $report.childCleanup = [ordered]@{
                descendantsSeenByRunner = @(Get-IsoProp $resultObj 'descendantsSeen'); leftoverKilledByRunner = @(Get-IsoProp $resultObj 'descendantsLeftoverKilled')
                aliveAfterRunnerCleanup = (Get-IsoProp $resultObj 'descendantsAliveAfterCleanup'); trackingOk = (Get-IsoProp $resultObj 'descendantTrackingOk')
            }
        }
        Invoke-Mutation -Description '원시 stdout·stderr 바이트를 실행 기록 폴더에 보관' -Action {
            [IO.File]::WriteAllBytes((Join-Path $Script:IsoRunDir "version-stdout-$stamp.bin"), $stdoutBytes)
            [IO.File]::WriteAllBytes((Join-Path $Script:IsoRunDir "version-stderr-$stamp.bin"), $stderrBytes)
        } | Out-Null

        # 수집이 온전한가(실행기 오류·스트림 읽기 실패·스트림 미종료·필수 상태 누락·자식 상태·종료 코드)와 stdout 해석은 VersionContract.ps1 의 한 함수가 정한다.
        # 이미 받은 바이트는 위에서 보관했고, 문제가 있어도 참고용 해석(diagnosticParse)만 남기며 사용 가능한 관측으로 확정하지 않는다.
        $judge = Get-VersionObservationFailures -RunnerResult $resultObj -StdoutBytes $stdoutBytes
        $failure = $judge.failure; $parsed = $judge.parsed
        $versionStr = $null; if ($parsed -and $parsed.ok -and -not $failure) { $versionStr = $parsed.version }
        $idOk = [bool]$report.identity.ok
        $report.interpretation = [ordered]@{
            contract = 'tool-observation.ts 해석 계약의 이식본(VersionContract.ps1): 종료 코드 0·신호 종료 아님, stdout 에서만 읽음, 유효 UTF-8(BOM 불허), 줄 끝 하나를 뺀 정확히 한 줄, 정확히 숫자.숫자.숫자. 거기에 수집이 온전해야 한다(실행기 오류·읽기 실패·스트림 미종료·필수 상태 누락이면 사용하지 않는다)'
            failure = $failure; failures = @($judge.failures); versionCandidate = $versionStr; identityOk = $idOk
            versionUsable = [bool]($idOk -and -not $failure -and $versionStr)
            expectedVersion = $ExpectedVersion; matchesExpected = [bool]($versionStr -and $versionStr -eq $ExpectedVersion)
            diagnosticParse = $judge.diagnosticParse
            note = '버전 문자열은 실행한 실행 파일의 자기 출력이다. 휠↔공개 소스 커밋 대응이나 배포물의 신뢰 검증을 뜻하지 않는다.'
        }
        if ($idOk -and -not $failure -and $versionStr) {
            if ($versionStr -eq $ExpectedVersion) { $verdict = 'VERSION_OBSERVED_AS_EXPECTED' } else { $verdict = 'VERSION_OBSERVED_DIFFERS_FROM_EXPECTED' }
        } elseif (-not $idOk -and -not $failure) { $verdict = 'IDENTITY_UNVERIFIED' }
        elseif ($failure) { $verdict = "NOT_OBSERVED:$failure" }
        if ($Mode -eq 'stub') { $verdict = 'STUB_' + $verdict }

        # ── 루프백 수신기(관리자 쪽에서 직접 센 값). 0건은 외부 통신이 없었다는 뜻이 아니다. ──
        $report.loopbackReceiver = [ordered]@{ hits = $hits.Count; remoteEndpoints = @($hits); listener = "127.0.0.1:$port"; attributedToDedicatedAccount = $(if ($idOk) { 'identity-verified' } else { 'unverified' }); meaning = '루프백 주소로 온 연결만 센다. 0건이라도 외부 통신이 없었다는 증거가 아니다. 수신기는 연결한 계정을 직접 볼 수 없다.' }

        # ── OS 차단 관측(5157): 이번 실행의 프로세스(PID·실행 파일 경로·시각 구간이 모두 맞는 것)에 귀속된 것만. 목적지는 미리 정하지 않았다. ──
        Start-Sleep -Seconds 2
        $auditNow = Get-IsoAuditFailureState
        $ev = [ordered]@{
            collection = [ordered]@{ ok = $false; error = $null; auditFailureEnabled = $auditNow; wrapped = $null }; processRecordsOk = ($tracked.Count -gt 0); countsUsable = $false
            attributedCount = $null; attributed = $null; unidentifiedCount = $null; unidentifiedSummary = $null
            caveat = '프로세스 기록은 관리자 쪽 CIM 폴링(약 40ms 간격 + 질의 시간)으로 모았다. 그 사이에 끝난 프로세스는 놓쳤을 수 있고, 그 프로세스의 5157 은 식별 불가로 남는다. 허용된 연결(루프백 등)은 이 로그에 남지 않는다.'
        }
        if ($ev.processRecordsOk) {
            $st = Get-SecurityLogState
            if (-not $st.ok) { $ev.collection.error = $st.error }
            else {
                $wrapped = ($null -ne $st.oldestRecordNumber -and [long]$st.oldestRecordNumber -gt ([long]$base.lastRecordId + 1))
                $ev.collection.wrapped = $wrapped
                $got = Get-WfpBlockEvents -AfterRecordId ([long]$base.lastRecordId)
                if (-not $got.ok) { $ev.collection.error = $got.error }
                else {
                    $ev.collection.ok = $true
                    $sel = Select-MatchingBlockEvents -Events @($got.events) -Processes @($tracked) -Probes @() -DosMap (Get-NtToDosMap)
                    $attributed = @($sel.runOtherDestination)
                    $ev.countsUsable = (($auditNow -eq $true) -and ($wrapped -eq $false))
                    $summ = { param($e) [ordered]@{ recordId = $e.recordId; processId = $e.processId; timeUtc = $e.timeUtc.ToString('o'); direction = $e.direction; protocol = $e.protocol; destAddress = $e.destAddress; destPort = $e.destPort; application = $e.application; filterRtid = $e.filterRtid } }
                    if ($ev.countsUsable) {
                        $ev.attributedCount = $attributed.Count
                        $ev.attributed = @($attributed | ForEach-Object { & $summ $_ })
                        $ev.unidentifiedCount = @($sel.unidentified).Count
                        $ev.unidentifiedSummary = @($sel.unidentified | ForEach-Object { [ordered]@{ recordId = $_.event.recordId; processId = $_.event.processId; direction = $_.event.direction; protocol = $_.event.protocol; destPort = $_.event.destPort; reasons = @($_.reasons) } })
                    } else {
                        $ev.unreliable = [ordered]@{ attributed = $attributed.Count; unidentified = @($sel.unidentified).Count; note = '실패 감사 상태가 확인되지 않았거나 로그가 밀려서 건수를 0건/N건으로 해석하지 않는다.' }
                    }
                }
            }
        } else { $ev.collection.error = '필수 프로세스 기록이 없다(이벤트 0건과 다르다)' }
        $report.osBlockObservation = $ev
    } catch {
        $report.error = $_.Exception.Message
        Write-IsoLog -Level 'FAIL' -Message ('실행 중 오류: ' + $_.Exception.Message)
        $verdict = 'NOT_ESTABLISHED'
    } finally {
        # ── 정리: 항목마다 독립 실행·결과 기록. 하나가 실패해도 나머지를 건너뛰지 않는다. ──
        $cleanup = New-Object System.Collections.ArrayList
        [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'listener-stop' -Action { if ($listener) { $listener.Stop() } }))
        [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'process-cleanup' -Action {
                    $uname = [string]$names.UserName
                    $find = { @(Get-Process -IncludeUserName -ErrorAction Stop | Where-Object { $_.UserName -and $_.UserName.EndsWith('\' + $uname, [StringComparison]::OrdinalIgnoreCase) }) }
                    $cand = & $find
                    foreach ($c in $cand) { $procId = [int]$c.Id; try { Invoke-Mutation -Description "전용 계정의 남은 프로세스 종료: pid=$procId $($c.ProcessName)" -Action { Stop-Process -Id $procId -Force -ErrorAction Stop } | Out-Null } catch { } }
                    Start-Sleep -Milliseconds 500
                    $still = & $find
                    $stillTracked = @(); foreach ($rec in $tracked) { $left = Get-ProcessRecord -ProcessId $rec.processId -Role 'cleanup'; if ($left -and $left.ownerSid -eq $sid) { $stillTracked += $rec.processId } }
                    $okP = (@($still).Count -eq 0 -and $stillTracked.Count -eq 0); $oc = 'NONE_LEFT'; if (-not $okP) { $oc = 'STILL_RUNNING' }
                    [ordered]@{ ok = $okP; outcome = $oc; error = $(if ($okP) { $null } else { '종료하지 못한 프로세스: ' + ((@($still | ForEach-Object { $_.Id }) + $stillTracked) -join ',') }); killedByAdminCleanup = @($cand | ForEach-Object { [ordered]@{ pid = $_.Id; name = $_.ProcessName } }) }
                }))
        if ($accountTouched) { [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'account-disable' -Action { Disable-IsoAccount -UserName $names.UserName })) }
        for ($i = $auditSteps.Count - 1; $i -ge 0; $i--) {
            $stp = $auditSteps[$i]
            [void]$cleanup.Add((Invoke-IsoCleanupStep -Name ('audit-restore ' + [string]$stp.name) -Action { Close-IsoAuditWindow -Step $stp }))
        }
        foreach ($ci in $cleanup) { if (-not $ci.ok) { Write-IsoLog -Level 'FAIL' -Message ("정리 실패: {0} → {1} {2}" -f $ci.name, $ci.outcome, $ci.error) } }
    }

    # 실행 뒤 파일 해시를 다시 읽어 실행 파일이 바뀌지 않았는지 본다(읽기).
    if ($Mode -eq 'semgrep-version') {
        $report.hashesAfter = [ordered]@{ semgrepExeSha256 = (Get-FileSha256Hex -Path $SemgrepExe); unchanged = ((Get-FileSha256Hex -Path $SemgrepExe) -eq $inputs.semgrepExeSha256) }
    }
    $cleanupOk = (@($cleanup | Where-Object { -not $_.ok }).Count -eq 0)
    $report.cleanup = [ordered]@{ ok = $cleanupOk; items = @($cleanup) }
    $report.verdict = $verdict
    $established = ($verdict -eq 'VERSION_OBSERVED_AS_EXPECTED' -or $verdict -eq 'STUB_VERSION_OBSERVED_AS_EXPECTED')
    # 관측의 성립 여부와 정리의 완료 여부는 따로 기록한다. 정리가 실패해도 관측 판정을 덮어쓰지 않고, 관측이 실패해도 정리는 위에서 끝까지 돌았다.
    $report.observation = [ordered]@{ established = [bool]$established; verdict = $verdict; failure = (Get-IsoProp $report.interpretation 'failure'); failures = @(Get-IsoProp $report.interpretation 'failures'); cleanupOk = [bool]$cleanupOk }
    $finalStatus = $(if ($established) { $verdict } else { 'NOT_ESTABLISHED' }); $exitCode = $(if ($established) { 0 } else { 60 })
    if (-not $cleanupOk) { $finalStatus = 'CLEANUP_INCOMPLETE'; $exitCode = 70 }
    $report.finalStatus = $finalStatus
    $report.finishedUtc = [DateTime]::UtcNow.ToString('o')
    $report.auditWindows = @($auditSteps | ForEach-Object { [ordered]@{ guid = $_.name; state = $_.state; original = (Get-IsoProp $_.detail 'original'); set = (Get-IsoProp $_.detail 'set') } })
    $out = Join-Path $Script:IsoRunDir ("version-observation-$stamp.json")
    try { Write-IsoJson -Path $out -Object $report -Depth 12 } catch { Write-IsoLog -Level 'FAIL' -Message ('보고서를 쓰지 못했다: ' + $_.Exception.Message); $exitCode = 70; $out = $null }

    Write-Host ''
    Write-Host "판정: $verdict   (범위: semgrep 실행 파일 ['--version'] 1회. LSP·규칙·스캔·DNS·UDP·ICMP·IPv6 는 관측하지 않았다)"
    Write-Host ("관측: {0}   실패 토큰: {1}" -f $(if ($established) { '성립' } else { '성립하지 않음' }), $(if ($report.observation.failure) { ((@($report.observation.failures)) -join ',') } else { '없음' }))
    Write-Host ("정리 결과: {0}   최종 상태: {1}" -f $(if ($cleanupOk) { '완료' } else { '불완전(위 FAIL 줄과 보고서 cleanup 항목을 확인한다)' }), $finalStatus)
    if ($report.identity) { Write-Host ("  신원 교차 확인: {0}{1}" -f $(if ($report.identity.ok) { '통과' } else { '실패' }), $(if (-not $report.identity.ok) { ' [' + ((@($report.identity.failures) | ForEach-Object { $_.code }) -join ', ') + ']' } else { '' })) }
    if ($report.execution) { Write-Host ("  [A] 종료 코드={0} 상태={1} 소요(관측)={2}ms stdout={3}B stderr={4}B" -f $report.execution.exitCode, $report.execution.childState, $report.execution.durationMsObserved, $report.execution.stdout.bytes, $report.execution.stderr.bytes) }
    if ($report.interpretation) { Write-Host ("  [E] 해석 실패 토큰={0} 버전 후보={1} 기대와 같은가={2}" -f $report.interpretation.failure, $report.interpretation.versionCandidate, $report.interpretation.matchesExpected) }
    if ($report.loopbackReceiver) { Write-Host ("  [C] 루프백 수신기 수신 건수: {0}  (외부 통신 여부와 무관)" -f $report.loopbackReceiver.hits) }
    if ($report.osBlockObservation) {
        $o = $report.osBlockObservation
        $ac = '수집 불가(0 아님)'; if ($null -ne $o.attributedCount) { $ac = [string]$o.attributedCount }
        $ui = '수집 불가'; if ($null -ne $o.unidentifiedCount) { $ui = [string]$o.unidentifiedCount }
        Write-Host ("  [D] OS 차단 관측: 수집 ok={0} 감사 켜짐={1} 로그 밀림={2}  이번 실행으로 귀속된 5157={3}  식별 불가={4}" -f $o.collection.ok, $o.collection.auditFailureEnabled, $o.collection.wrapped, $ac, $ui)
    }
    if ($out) { Write-Host "결과 파일: $out" }
    @{ exitCode = $exitCode; report = $report; reportFile = $out }
}

$r = @(Invoke-VersionObservation -RunDir $RunDir -Execute ([bool]$Execute) -Mode $Mode -StubScenario $StubScenario -SemgrepExe $SemgrepExe -ExpectedExeSha256 $ExpectedExeSha256 -WheelPath $WheelPath -ExpectedWheelSha256 $ExpectedWheelSha256 -ExpectedVersion $ExpectedVersion -TimeoutMs $TimeoutMs -MaxStdoutBytes $MaxStdoutBytes -MaxStderrBytes $MaxStderrBytes -KillWaitMs $KillWaitMs)[-1]
exit $r.exitCode
