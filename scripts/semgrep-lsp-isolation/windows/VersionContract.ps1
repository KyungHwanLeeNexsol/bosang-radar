# 버전 확인의 한도와 stdout 해석 계약. scripts/semgrep-lsp/tool-observation.ts 의 DEFAULT_VERSION_LIMITS·VERSION_ARGS·parseVersionStdout 를 그대로 옮긴 것이다.
# 같은 입력에서 TS 함수와 같은 결과를 내는지는 tests/Test-VersionRunner.ps1 이 실제 TS 함수(tsx)와 대조해서 확인한다.
# 이 계약은 하네스가 정한 것이며 실제 Semgrep 으로 확인한 형식이 아니다. 실제 출력을 보고 계약을 고치지 않는다.

$Script:VersionArgs = @('--version')
$Script:VersionLimits = [ordered]@{ timeoutMs = 30000; maxStdoutBytes = 4096; maxStderrBytes = 16384; killWaitMs = 5000 }

# 던지지 않는다. 결과: ok, version(ok 일 때만), failure(토큰). TextDecoder("utf-8", { fatal: true, ignoreBOM: true }) 와 같게 BOM 을 지우지 않고 그대로 둔다.
function ConvertFrom-VersionStdout {
    param([Parameter(Mandatory)][AllowEmptyCollection()][byte[]]$Bytes)
    $text = $null
    try { $text = (New-Object Text.UTF8Encoding($false, $true)).GetString($Bytes) }
    catch { return [ordered]@{ ok = $false; version = $null; failure = 'OUTPUT_NOT_UTF8' } }
    $body = $text
    if ($text.EndsWith("`r`n", [StringComparison]::Ordinal)) { $body = $text.Substring(0, $text.Length - 2) }
    elseif ($text.EndsWith("`n", [StringComparison]::Ordinal)) { $body = $text.Substring(0, $text.Length - 1) }
    if ($body.Length -eq 0) { return [ordered]@{ ok = $false; version = $null; failure = 'OUTPUT_EMPTY' } }
    if ($body.IndexOf("`r") -ge 0 -or $body.IndexOf("`n") -ge 0) { return [ordered]@{ ok = $false; version = $null; failure = 'OUTPUT_NOT_SINGLE_LINE' } }
    # [0-9] 로 쓴다: .NET 의 \d 는 유니코드 숫자도 맞추지만 JS 의 \d 는 ASCII 만 맞춘다. $ 대신 \z: 끝의 개행을 허용하지 않는다.
    if ($body -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\z') { return [ordered]@{ ok = $false; version = $null; failure = 'OUTPUT_UNRECOGNIZED' } }
    [ordered]@{ ok = $true; version = $body; failure = $null }
}

# 속성 하나를 읽는다(없으면 $null). 해시테이블·객체 모두 받고, StrictMode 에서도 던지지 않는다.
function Get-VcProp {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) { if ($Object.Contains($Name)) { return $Object[$Name] }; return $null }
    $p = $Object.PSObject.Properties[$Name]
    if ($p) { return $p.Value }
    $null
}

# 실행기가 남긴 결과(JSON 을 읽은 객체)가 "버전을 사용 가능한 관측으로 확정해도 되는 수집"인지 정한다. 던지지 않고 부작용이 없다.
# stdout 해석(ConvertFrom-VersionStdout)은 수집이 온전할 때만 시도한다. 정규식·기대 버전·한도는 이 함수가 바꾸지 않는다.
# 필수 상태(읽기 실패 여부, 스트림 종료, 자식 상태 등)가 없거나 불리언이 아니면 정상으로 보지 않는다(COLLECTION_STATE_UNKNOWN).
# 우선순위(첫 토큰이 주 토큰, 해당하는 것은 모두 failures 에 남긴다):
#   RUNNER_NO_RESULT, RUNNER_REFUSED, SPAWN_FAILED, RUNNER_ERROR, STREAM_READ_FAILED, TIMEOUT, OUTPUT_LIMIT_EXCEEDED, KILLED,
#   STREAMS_NOT_CLOSED, COLLECTION_STATE_UNKNOWN, CHILD_NOT_EXITED, NONZERO_EXIT, OUTPUT_* (해석 실패)
# 결과: failure(주 토큰, 없으면 $null), failures(전부), parsed(수집이 온전해 해석을 시도했을 때의 결과),
#       diagnosticParse(수집에 문제가 있어도 이미 받은 stdout 을 계약으로 읽어 본 참고 결과. 사용 가능한 관측이 아니다)
function Get-VersionObservationFailures {
    param($RunnerResult, [AllowEmptyCollection()][byte[]]$StdoutBytes = @())
    $f = New-Object System.Collections.ArrayList
    $add = { param([string]$Token) if (-not $f.Contains($Token)) { [void]$f.Add($Token) } }
    $result = { param($Parsed, $Diag) [ordered]@{ failure = $(if ($f.Count -gt 0) { $f[0] } else { $null }); failures = @($f); parsed = $Parsed; diagnosticParse = $Diag } }
    if ($null -eq $RunnerResult) { & $add 'RUNNER_NO_RESULT'; return (& $result $null $null) }

    $ci = Get-VcProp $RunnerResult 'child'
    $so = Get-VcProp $RunnerResult 'stdout'; $se = Get-VcProp $RunnerResult 'stderr'
    $refused = Get-VcProp $RunnerResult 'refused'
    if ($null -ne $refused -and -not [string]::IsNullOrEmpty([string]$refused)) { & $add 'RUNNER_REFUSED' }
    $unknown = $false
    if ($null -eq $ci) { $unknown = $true }
    elseif ((Get-VcProp $ci 'started') -isnot [bool]) { $unknown = $true }
    elseif ((Get-VcProp $ci 'started') -ne $true) { & $add 'SPAWN_FAILED' }
    $err = Get-VcProp $RunnerResult 'error'
    if ($null -ne $err -and -not [string]::IsNullOrEmpty([string]$err)) { & $add 'RUNNER_ERROR' }

    # 스트림 기록: 두 개 모두 있어야 하고, readFailed·overflow 는 불리언, b64 는 문자열(빈 문자열 가능)이어야 한다.
    foreach ($s in @($so, $se)) {
        if ($null -eq $s) { $unknown = $true; continue }
        if ((Get-VcProp $s 'readFailed') -isnot [bool] -or (Get-VcProp $s 'overflow') -isnot [bool] -or (Get-VcProp $s 'b64') -isnot [string]) { $unknown = $true }
    }
    if ((Get-VcProp $so 'readFailed') -eq $true -or (Get-VcProp $se 'readFailed') -eq $true) { & $add 'STREAM_READ_FAILED' }
    foreach ($pair in @(@('timedOut', 'TIMEOUT'), @('outputLimitExceeded', 'OUTPUT_LIMIT_EXCEEDED'), @('killed', 'KILLED'))) {
        $v = Get-VcProp $ci $pair[0]
        if ($v -is [bool]) { if ($v) { & $add $pair[1] } } else { $unknown = $true }
    }
    if ((Get-VcProp $so 'overflow') -eq $true -or (Get-VcProp $se 'overflow') -eq $true) { & $add 'OUTPUT_LIMIT_EXCEEDED' }
    $closed = Get-VcProp $RunnerResult 'streamsClosed'
    if ($closed -is [bool]) { if (-not $closed) { & $add 'STREAMS_NOT_CLOSED' } } else { $unknown = $true }
    if ($unknown) { & $add 'COLLECTION_STATE_UNKNOWN' }

    $state = Get-VcProp $RunnerResult 'childState'
    if ($state -isnot [string] -or [string]::IsNullOrEmpty($state)) { & $add 'COLLECTION_STATE_UNKNOWN' }
    elseif ($state -ne 'EXITED' -or (Get-VcProp $ci 'hasExited') -ne $true) { & $add 'CHILD_NOT_EXITED' }
    $exit = Get-VcProp $ci 'exitCode'
    $exitIsZero = ($exit -is [int] -or $exit -is [long]) -and ([long]$exit -eq 0)
    if (-not $exitIsZero) { & $add 'NONZERO_EXIT' }

    if ($f.Count -gt 0) {
        $diag = $null
        if ($StdoutBytes.Length -gt 0) {
            $d = ConvertFrom-VersionStdout -Bytes $StdoutBytes
            $diag = [ordered]@{ ok = $d.ok; version = $d.version; failure = $d.failure; usable = $false; note = '수집 또는 종료 상태에 문제가 있어 사용 가능한 관측이 아니다. 이미 받은 stdout 을 계약으로 읽어 본 참고 결과일 뿐이다.' }
        }
        return (& $result $null $diag)
    }
    $parsed = ConvertFrom-VersionStdout -Bytes $StdoutBytes
    if (-not $parsed.ok) { & $add ([string]$parsed.failure) }
    & $result $parsed $null
}

# 버전 확인 자식 프로세스의 전용 홈 폴더(Windows 에서 Path.home() 이 읽는 USERPROFILE 의 값). 부모 사용자 환경에서 복사하지 않고 이 실행의 상태 폴더 아래로 정한다.
function Get-VersionChildHome {
    param([Parameter(Mandatory)][string]$StateDir)
    Join-Path $StateDir 'home'
}

# 자식 프로세스에 줄 Windows 환경 전체(부모 환경을 물려주지 않는다). TS 의 buildChildEnv(win32)와 같은 이름 집합이다:
#   PATH·SYSTEMROOT·TEMP·TMP + USERPROFILE + SEMGREP_APP_URL/METRICS_URL/VERSION_CHECK_URL + SEMGREP_LOG_FILE/SETTINGS_FILE/VERSION_CACHE_PATH
#   + SEMGREP_ENABLE_VERSION_CHECK(온라인 최신 버전 조회를 끄는 고정값 0. 부모 환경에서 읽지 않는 상수이고 설치 버전 출력은 바꾸지 않는다. TS 의 buildVersionChildEnv 와 같다).
# TS 와 값의 출처만 다르다(더 좁게 한 것): PATH 는 Windows 폴더로 고정, TEMP/TMP 는 작업 폴더 안. HOME·HOMEDRIVE·HOMEPATH·APPDATA 는 주지 않는다(Python 의 Path.home() 은 USERPROFILE 하나면 된다).
function New-VersionChildEnv {
    param(
        [Parameter(Mandatory)][string]$WindowsDir,
        [Parameter(Mandatory)][string]$TmpDir,
        [Parameter(Mandatory)][string]$StateDir,
        [Parameter(Mandatory)][string]$Url
    )
    [ordered]@{
        PATH = "$WindowsDir\System32;$WindowsDir"; SYSTEMROOT = $WindowsDir; TEMP = $TmpDir; TMP = $TmpDir
        USERPROFILE = (Get-VersionChildHome -StateDir $StateDir)
        SEMGREP_APP_URL = $Url; SEMGREP_METRICS_URL = $Url; SEMGREP_VERSION_CHECK_URL = $Url
        SEMGREP_ENABLE_VERSION_CHECK = '0'
        SEMGREP_LOG_FILE = (Join-Path $StateDir 'semgrep.log'); SEMGREP_SETTINGS_FILE = (Join-Path $StateDir 'settings.yml'); SEMGREP_VERSION_CACHE_PATH = (Join-Path $StateDir 'version-cache')
    }
}
