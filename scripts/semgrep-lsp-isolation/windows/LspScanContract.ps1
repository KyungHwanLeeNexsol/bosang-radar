# LSP-SCAN-1 합성 파일 반응 관측의 계약(PowerShell 이식본). scripts/semgrep-lsp/{lsp-scan,scan-uri,scan-log,lsp-scan-watch}.ts 와 lsp-scan-record.ts 의 증거 추적기(deriveScanEvidence, ScanEvidenceTracker)를 옮긴 것이다.
# 같은 입력에서 TS 와 같은 결과를 내는지는 tests/lsp-scan-parity.json(TS 가 만든 골든)과 tests/Test-LspScanRunner.ps1 이 대조해서 확인한다.
# 이 계약은 하네스가 정한 것이며 실제 Semgrep 으로 확인한 형식이 아니다. 실제 출력을 보고 계약을 고치지 않는다.
#
# 이 파일은 부작용이 없다: 불러와도 아무것도 실행하지 않고, 파일·프로세스·네트워크·환경에 닿지 않는다. LspRulesContract.ps1(LspMinContract.ps1 포함)을 읽기 전용으로 다시 쓴다. 그쪽은 바꾸지 않았다.
# 판정은 이 파일의 일이 아니다. 러너는 일정(initialized·didOpen·settle·shutdown)과 위험 차단만 정하고, 판정은 관리자 쪽 TS 모듈이 원문 바이트·청크 시간표·표시에서 다시 한다.
#
# 계약 정정(브리프 4절): stdout 과 stderr 는 독립된 파이프라 수신 시각이 서버 내부 순서를 말해 주지 않는다. 그래서 스트림 사이의 순서 주장이 어디에도 없고, 순서는 각 스트림 안에서만 본다.
# 사전/사후 구간은 didOpen 송신 시점의 스트림별 바이트 위치로 나누고(줄·프레임의 첫 바이트가 소속을 정한다), settle 창은 늦은 묶음이 완성된 청크의 시각에서 시작한다.
# 문자열 비교: 서버·파일에서 온 값은 Test-LrOrdinalEqual / Test-LrOrdinalIn(서수 비교)으로 본다. -ceq/-cne 는 5.1 에서 서수 비교가 아니므로(소프트 하이픈·NUL 을 무시한다),
# 이 파일의 -ceq/-cne 는 내부 열거값·상수 키·정규식으로 이미 좁혀진 값에 한정하는 것을 원칙으로 한다. 모든 사용처를 이 원칙으로 전수 검토하지는 않았다(독립 검토에서 악용 경로를 찾지 못했을 뿐이다).
# Sort-Object -CaseSensitive 는 서수 정렬이 아니다: 같은 정렬로 양쪽을 맞춰 비교하는 곳(Test-LsSameKeys)에서만 쓴다.

. (Join-Path $PSScriptRoot 'LspRulesContract.ps1')

$Script:LsSchema = 'semgrep-lsp-scan-observation/1'
$Script:LsArgs = @($Script:LspMinArgs)
$Script:LsInitId = 'lsp-scan-init-1'
$Script:LsShutdownId = 'lsp-scan-shutdown-1'
# 프로브 규칙은 LSP-RULES-1 과 같은 233바이트 파일이다.
$Script:LsProbeFile = $Script:LrProbeFile
$Script:LsProbeSha256 = $Script:LrProbeSha256
$Script:LsProbeBytes = $Script:LrProbeBytes
# 합성 대상 파일(D7): 바이트가 계약이다.
$Script:LsTargetFile = 'lsp-scan-1-target.txt'
$Script:LsTargetBytes = 135
$Script:LsTargetSha256 = '097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba'
$Script:LsTargetToken = 'LSP_RULES_1_PROBE_TOKEN_THAT_IS_NEVER_PRESENT'
$Script:LsDidOpenMethod = 'textDocument/didOpen'
$Script:LsDidOpenLanguageId = 'plaintext'
$Script:LsDidOpenVersion = 1
$Script:LsJobs = 1
# 보낼 수 있는 메시지는 이 다섯뿐이고, 이 순서로만 보낸다. didOpen 은 정확히 한 번이고 규칙 장벽 뒤에만 보낸다.
$Script:LsSendOrder = @('initialize', 'initialized', 'didOpen', 'shutdown', 'exit')
$Script:LsOutboundMethods = [ordered]@{ initialize = 'initialize'; initialized = 'initialized'; didOpen = 'textDocument/didOpen'; shutdown = 'shutdown'; exit = 'exit' }
# 한도: RULES 의 한도에 scanMs(didOpen 송신부터 두 묶음이 완성돼야 하는 한도, 30초 고정)를 더했다. 요청은 이 값 이하로만 줄일 수 있다.
$Script:LsLimits = [ordered]@{}
foreach ($lsKey in $Script:LrLimits.Keys) { $Script:LsLimits[$lsKey] = $Script:LrLimits[$lsKey] }
$Script:LsLimits['scanMs'] = 30000
$Script:LsExpectedCodes = @('rules-probe.lsp-rules-1-probe', 'lsp-rules-1-probe')
$Script:LsExpectedSource = 'Semgrep'
$Script:LsExpectedMessage = 'LSP-RULES-1 probe rule. It is loaded but is not expected to match any target.'
$Script:LsExpectedSeverity = 3
$Script:LsAbortNames = [ordered]@{ A1 = 'FORBIDDEN_SIGNAL'; A2 = 'FORBIDDEN_SIGNAL'; A3 = 'FORBIDDEN_SIGNAL'; A4 = 'UNEXPECTED_IMAGE'; A5 = 'FILES_CHANGED'; A6 = 'SERVER_REQUEST_NOT_ALLOWED'; A7 = 'CANCELLED'; A9 = 'BARRIER_TIMEOUT'; A10 = 'SEND_REFUSED' }

# ── 배치 ─────────────────────────────────────────────────────────────────────

# 작업 폴더 아래 배치. work 는 이 관측 전용 잎 폴더(`<작업 폴더>\lsp-scan`)다. RULES 배치(규칙 폴더 이름 포함)에 합성 대상 파일의 전체 경로만 더한다.
function Get-LsLayout {
    param([Parameter(Mandatory)][string]$Work)
    $l = Get-LrLayout -Work $Work
    $l['targetPath'] = Join-LmPath ([string]$l['workspace']) $Script:LsTargetFile
    $l
}
function Get-LsRootPath { param($Layout, [Parameter(Mandatory)][string]$Role) Get-LrRootPath $Layout $Role }
function Get-LsProbePath { param($Layout) Get-LrProbePath $Layout }
function Get-LsRootUri { param($Layout) ConvertTo-LspMinFolderUri ([string](Get-LmProp $Layout 'workspace')) }
# didOpen 의 uri 이자 진단 URI 비교의 기대값: 작업 영역 URI + '/lsp-scan-1-target.txt'.
function Get-LsTargetUri { param($Layout) (Get-LsRootUri $Layout) + '/' + $Script:LsTargetFile }

# 감시 폴더 안의 한 파일이 금지된 변경인가(A5′). 작업 영역에는 합성 대상 파일 하나(이름 일치, 대소문자 무시)만, 규칙 폴더에는 프로브 하나만, 홈은 지문 폴더 아래만 허용한다.
function Test-LsRootViolation {
    param([Parameter(Mandatory)][string]$Role, [Parameter(Mandatory)][AllowEmptyString()][string]$RelativePath)
    if (Test-LrOrdinalEqual $Role 'WORKSPACE') { return (-not (Test-LrOrdinalEqual (ConvertTo-LrJsLower ($RelativePath.Replace('\', '/'))) $Script:LsTargetFile)) }
    Test-LrRootViolation -Role $Role -RelativePath $RelativePath
}

# ── 한도 ─────────────────────────────────────────────────────────────────────

# 알 수 없는 이름·0 이하·비수·기본값 초과는 거절 사유. 기본값 이하만 받는다(TS resolveScanLimits).
function Resolve-LsLimits {
    param($Over)
    $limits = [ordered]@{}
    foreach ($k in $Script:LsLimits.Keys) { $limits[$k] = $Script:LsLimits[$k] }
    $problems = New-Object System.Collections.ArrayList
    if ($null -ne $Over) {
        foreach ($name in (Get-LrMemberNames $Over)) {
            $known = $null
            foreach ($k in $Script:LsLimits.Keys) { if (Test-LrOrdinalEqual ([string]$k) ([string]$name)) { $known = $k } }
            $value = Get-LrMember $Over $name
            if ($null -eq $known) { [void]$problems.Add('LIMIT_UNKNOWN:' + ($name -replace '[^A-Za-z0-9_]', '?')) }
            elseif (-not (Test-LrNumber $value) -or [double]::IsNaN([double]$value) -or [double]::IsInfinity([double]$value) -or [double]$value -le 0) { [void]$problems.Add("LIMIT_INVALID:$known") }
            elseif ([double]$value -gt [double]$Script:LsLimits[$known]) { [void]$problems.Add("LIMIT_ABOVE_CAP:$known") }
            else { $limits[$known] = $value }
        }
    }
    [ordered]@{ limits = $limits; problems = @($problems) }
}

# ── 보내는 메시지 ────────────────────────────────────────────────────────────

# initialize: RULES 와 같은 내용에 scan.jobs = 1 만 더한다(id 는 lsp-scan-init-1).
function New-LsInitializeMessage {
    param([Parameter(Mandatory)]$Layout)
    $m = New-LspMinInitializeMessage -Layout $Layout
    $m['id'] = $Script:LsInitId
    $m['params']['initializationOptions']['scan']['jobs'] = $Script:LsJobs
    $m
}
function New-LsInitializedMessage { [ordered]@{ jsonrpc = '2.0'; method = 'initialized'; params = [ordered]@{} } }
function New-LsShutdownMessage { [ordered]@{ jsonrpc = '2.0'; id = $Script:LsShutdownId; method = 'shutdown' } }
function New-LsExitMessage { [ordered]@{ jsonrpc = '2.0'; method = 'exit' } }

# 대상 파일 바이트가 고정 계약(135바이트, 고정 sha256)과 어긋나면 사유('MISSING'|'SIZE'|'HASH'), 아니면 $null.
function Get-LsTargetBytesProblem {
    param($Bytes)
    if ($Bytes -isnot [byte[]]) { return 'MISSING' }
    if ($Bytes.Length -ne $Script:LsTargetBytes) { return 'SIZE' }
    if ((Get-LrSha256Hex $Bytes) -cne $Script:LsTargetSha256) { return 'HASH' }
    $null
}

# didOpen 알림. 본문은 파일의 실제 바이트를 UTF-8 로 풀어 그대로 쓴다(uri·languageId·version 은 계약 상수). 계약과 다른 바이트면 던진다.
function New-LsDidOpenMessage {
    param([Parameter(Mandatory)]$Layout, [Parameter(Mandatory)][byte[]]$TargetBytes)
    if ($null -ne (Get-LsTargetBytesProblem $TargetBytes)) { throw 'didOpen 대상 파일이 고정 계약(135바이트, 고정 sha256)과 다르다' }
    $text = (New-Object Text.UTF8Encoding($false, $true)).GetString($TargetBytes)
    [ordered]@{
        jsonrpc = '2.0'; method = $Script:LsDidOpenMethod
        params = [ordered]@{ textDocument = [ordered]@{ uri = (Get-LsTargetUri $Layout); languageId = $Script:LsDidOpenLanguageId; version = $Script:LsDidOpenVersion; text = $text } }
    }
}

function Test-LsSameKeys {
    param($Object, [string[]]$Keys)
    # Get-LrMemberNames 는 `, @(...)` 로 한 겹 감싸 돌려준다. 파이프에 바로 넘기면 배열 전체가 원소 하나가 되어 [string] 이 키를 공백으로 이어 붙인다. 변수에 받아서 푼다.
    $names = Get-LrMemberNames $Object
    $have = @($names | ForEach-Object { [string]$_ } | Sort-Object { $_ } -CaseSensitive)
    $want = @($Keys | Sort-Object { $_ } -CaseSensitive)
    if ($have.Count -ne $want.Count) { return $false }
    for ($i = 0; $i -lt $have.Count; $i++) { if (-not (Test-LrOrdinalEqual $have[$i] $want[$i])) { return $false } }
    $true
}

# 쓰기 직전의 마지막 방어선(TS assertAllowedScanOutbound). Ctx: barrierDone(bool), sent(이미 보낸 라벨 목록), expectedUri, expectedText. 어긋나면 던진다.
#  · didOpen 은 정확히 한 번, initialized 뒤 장벽을 넘은 다음에만 나가고, uri·본문·languageId·version 이 기대와 정확히 같고 params 에 다른 키가 없어야 한다.
#  · didSave·didChange·didClose·semgrep/scanWorkspace·semgrep/refreshRules·작업 영역 변경·파일 생성·서버 요청에 대한 응답은 메서드 이름 불일치로 막힌다.
function Assert-LsOutbound {
    param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)]$Message, [Parameter(Mandatory)]$Ctx)
    $known = $false; $allowedMethod = $null
    foreach ($k in $Script:LsOutboundMethods.Keys) { if (Test-LrOrdinalEqual ([string]$k) $Label) { $known = $true; $allowedMethod = [string]$Script:LsOutboundMethods[$k] } }
    $method = Get-LrMember $Message 'method'
    if (-not $known -or $method -isnot [string] -or -not (Test-LrOrdinalEqual $method $allowedMethod)) { throw "허용되지 않은 송신: $Label" }
    $sent = @($Ctx.sent | ForEach-Object { [string]$_ })
    if (Test-LrOrdinalIn $Label $sent) { throw "허용되지 않은 송신: ${Label}을(를) 두 번 보낼 수 없다" }
    $at = [Array]::IndexOf($Script:LsSendOrder, $Label)
    foreach ($earlier in $sent) { if ([Array]::IndexOf($Script:LsSendOrder, $earlier) -ge $at) { throw "허용되지 않은 송신 순서: $earlier 다음에 $Label" } }
    $hasId = Test-LrMember $Message 'id'
    $wantsId = ((Test-LrOrdinalEqual $Label 'initialize') -or (Test-LrOrdinalEqual $Label 'shutdown'))
    if ($hasId -ne $wantsId) { throw "허용되지 않은 송신 형태: $Label" }
    if ((Test-LrOrdinalEqual $Label 'initialized') -and -not ((Test-LrMember $Message 'params') -and (Test-LrEmptyObject (Get-LrMember $Message 'params')))) { throw '허용되지 않은 송신 형태: initialized의 params' }
    if (((Test-LrOrdinalEqual $Label 'shutdown') -or (Test-LrOrdinalEqual $Label 'exit')) -and (Test-LrMember $Message 'params')) { throw "허용되지 않은 송신 형태: ${Label}의 params" }
    if ((Test-LrOrdinalEqual $Label 'initialized') -and -not (Test-LrOrdinalIn 'initialize' $sent)) { throw '허용되지 않은 송신: initialize 전의 initialized' }
    if (Test-LrOrdinalEqual $Label 'didOpen') {
        if (-not (Test-LrOrdinalIn 'initialized' $sent)) { throw '허용되지 않은 송신: initialized 전의 didOpen' }
        if (-not [bool]$Ctx.barrierDone) { throw '허용되지 않은 송신: 규칙 로딩 장벽 앞의 didOpen' }
        $params = Get-LrMember $Message 'params'
        if (-not (Test-LrPlainObject $params) -or -not (Test-LsSameKeys $params @('textDocument'))) { throw '허용되지 않은 송신 형태: didOpen의 params' }
        $doc = Get-LrMember $params 'textDocument'
        if (-not (Test-LrPlainObject $doc) -or -not (Test-LsSameKeys $doc @('uri', 'languageId', 'version', 'text'))) { throw '허용되지 않은 송신 형태: didOpen의 textDocument' }
        $u = Get-LrMember $doc 'uri'; $tx = Get-LrMember $doc 'text'
        if ($u -isnot [string] -or -not (Test-LrOrdinalEqual $u ([string]$Ctx.expectedUri))) { throw '허용되지 않은 송신: didOpen uri가 기대와 다르다' }
        if ($tx -isnot [string] -or -not (Test-LrOrdinalEqual $tx ([string]$Ctx.expectedText))) { throw '허용되지 않은 송신: didOpen 본문이 기대와 다르다' }
        $lang = Get-LrMember $doc 'languageId'; $ver = Get-LrMember $doc 'version'
        if ($lang -isnot [string] -or -not (Test-LrOrdinalEqual $lang $Script:LsDidOpenLanguageId) -or -not (Test-LrNumber $ver) -or $ver -ne $Script:LsDidOpenVersion) { throw '허용되지 않은 송신: didOpen languageId·version이 기대와 다르다' }
    }
}

# ── initializationOptions 검사(TS validateScanInitializationOptions) ────────────

function Format-LsKeyToken { param([string]$Key) $t = [regex]::Replace($Key, '[^A-Za-z0-9_]', '?'); if ($t.Length -gt 40) { $t = $t.Substring(0, 40) }; $t }

function Test-LsInitializationOptions {
    param($Opts)
    $out = New-Object System.Collections.ArrayList
    if (-not (Test-LrPlainObject $Opts)) { return , @('SETTINGS_NOT_OBJECT') }
    foreach ($key in (Get-LrMemberNames $Opts)) { if (-not (Test-LrOrdinalIn ([string]$key) @('scan', 'metrics'))) { [void]$out.Add('SETTINGS_KEY_NOT_ALLOWED:' + (Format-LsKeyToken ([string]$key))) } }
    $allowedScan = @('ci', 'configuration', 'maxTargetBytes', 'onlyGitDirty', 'pro_intrafile', 'timeout', 'timeoutThreshold', 'jobs')
    $scan = Get-LrMember $Opts 'scan'
    if (-not (Test-LrMember $Opts 'scan')) { [void]$out.Add('SETTINGS_SCAN_MISSING') }
    elseif (-not (Test-LrPlainObject $scan)) { [void]$out.Add('SETTINGS_SCAN_NOT_OBJECT') }
    else {
        foreach ($key in (Get-LrMemberNames $scan)) {
            if (-not (Test-LrOrdinalIn ([string]$key) $allowedScan)) { [void]$out.Add('SETTINGS_KEY_NOT_ALLOWED:scan.' + (Format-LsKeyToken ([string]$key))) }
            elseif (Test-LrPlainObject (Get-LrMember $scan ([string]$key))) { [void]$out.Add('SETTINGS_NESTED_OBJECT:scan.' + (Format-LsKeyToken ([string]$key))) }
        }
        if (-not (Test-LrMember $scan 'jobs')) { [void]$out.Add('SCAN_JOBS_MISSING') }
        else { $j = Get-LrMember $scan 'jobs'; if (-not (Test-LrNumber $j) -or $j -is [bool] -or $j -ne $Script:LsJobs) { [void]$out.Add('SCAN_JOBS_INVALID') } }
        if ((Get-LrMember $scan 'ci') -isnot [bool] -or (Get-LrMember $scan 'ci') -ne $false) { [void]$out.Add('SCAN_CI_NOT_FALSE') }
        if ((Get-LrMember $scan 'onlyGitDirty') -isnot [bool] -or (Get-LrMember $scan 'onlyGitDirty') -ne $false) { [void]$out.Add('SCAN_ONLY_GIT_DIRTY_NOT_FALSE') }
        $cfg = Get-LrMember $scan 'configuration'
        $bad = (-not (Test-LrArrayMember $scan 'configuration')) -or @($cfg).Count -eq 0
        if (-not $bad) { foreach ($e in @($cfg)) { if ($e -isnot [string] -or $e -eq '' -or (Test-LrNetworkRuleSource $e)) { $bad = $true } } }
        if ($bad) { [void]$out.Add('SCAN_CONFIGURATION_INVALID') }
    }
    $metrics = Get-LrMember $Opts 'metrics'
    if (-not (Test-LrMember $Opts 'metrics')) { [void]$out.Add('SETTINGS_METRICS_MISSING') }
    elseif (-not (Test-LrPlainObject $metrics)) { [void]$out.Add('SETTINGS_METRICS_NOT_OBJECT') }
    else {
        foreach ($key in (Get-LrMemberNames $metrics)) { if (-not (Test-LrOrdinalEqual ([string]$key) 'enabled')) { [void]$out.Add('SETTINGS_KEY_NOT_ALLOWED:metrics.' + (Format-LsKeyToken ([string]$key))) } }
        if ((Get-LrMember $metrics 'enabled') -isnot [bool] -or (Get-LrMember $metrics 'enabled') -ne $false) { [void]$out.Add('METRICS_ENABLED_NOT_FALSE') }
    }
    , @($out)
}

# ── 요청의 정적 검사(TS checkScanRequest) ─────────────────────────────────────

# 파일 시스템에 닿지 않는 요청 검사. 기존 RULES 검사(Get-LrStaticRefusals)를 그대로 거치되 scanMs 는 이쪽에서 따로 검사하고, 대상 파일(targetB64)과 배치의 targetPath 를 더한다.
# jobs 는 요청이 아니라 이 계약의 initialize 가 고정(1)한다. Req 의 필드: mode, exe, args, layout{...,targetPath}, env, limits, artifacts, probeB64, targetB64.
# 돌려주는 값: refusals, limits(해석됨, scanMs 포함), probeBytes, targetBytes.
function Get-LsStaticRefusals {
    param($Req)
    $limitsIn = Get-LmProp $Req 'limits'
    $stripped = [ordered]@{}
    if ($null -ne $limitsIn) { foreach ($n in (Get-LrMemberNames $limitsIn)) { if (-not (Test-LrOrdinalEqual ([string]$n) 'scanMs')) { $stripped[[string]$n] = Get-LrMember $limitsIn ([string]$n) } } }
    $rulesReq = [ordered]@{ mode = (Get-LmProp $Req 'mode'); exe = (Get-LmProp $Req 'exe'); args = (Get-LmProp $Req 'args'); layout = (Get-LmProp $Req 'layout'); env = (Get-LmProp $Req 'env'); limits = $stripped; artifacts = (Get-LmProp $Req 'artifacts'); probeB64 = (Get-LmProp $Req 'probeB64') }
    $base = Get-LrStaticRefusals $rulesReq
    $refusals = New-Object System.Collections.ArrayList
    foreach ($r in $base.refusals) { [void]$refusals.Add([string]$r) }
    # TS checkRulesRequest 는 SEMGREP_APP_URL 이 문자열이면(루프백이 아니어도) 기대 환경과 이름·값을 비교한다. RULES 의 PS 이식(Get-LrEnvRefusals)은 루프백 형식일 때만 비교해서 사유 목록이 달라진다. RULES 파일은 바꾸지 않고 같은 사유를 여기서 더한다.
    $envReq = Get-LmProp $Req 'env'
    $envUrl = Get-LrMember $envReq 'SEMGREP_APP_URL'; $envWin = Get-LrMember $envReq 'SYSTEMROOT'
    if ($envUrl -is [string] -and $envUrl -cnotmatch '^http://127\.0\.0\.1:[0-9]{1,5}\z' -and $envWin -is [string] -and $envWin -ne '') {
        $envNames = Get-LrMemberNames $envReq
        $wantEnv = New-LspMinChildEnv -WindowsDir $envWin -Layout (Get-LmProp $Req 'layout') -Url $envUrl
        foreach ($n in $Script:LspMinEnvNames) {
            if (-not (Test-LrOrdinalIn $n $envNames)) { [void]$refusals.Add("ENV_NAME_MISSING:$n") }
            elseif (-not (Test-LrOrdinalEqual ([string](Get-LrMember $envReq $n)) ([string]$wantEnv[$n]))) { [void]$refusals.Add("ENV_VALUE_UNEXPECTED:$n") }
        }
    }
    $resolved = Resolve-LsLimits $limitsIn
    foreach ($p in $resolved.problems) { if ($p.StartsWith('LIMIT_', [StringComparison]::Ordinal) -and $p.EndsWith(':scanMs', [StringComparison]::Ordinal)) { [void]$refusals.Add($p) } }
    $layout = Get-LmProp $Req 'layout'
    $want = Join-LmPath ([string](Get-LmProp $layout 'workspace')) $Script:LsTargetFile
    $tp = Get-LmProp $layout 'targetPath'
    if ($tp -isnot [string] -or -not (Test-LrOrdinalEqual $tp $want)) { [void]$refusals.Add('LAYOUT_MISMATCH') }
    $bytes = $null
    $b64 = Get-LmProp $Req 'targetB64'
    if ($b64 -is [string] -and $b64 -ne '') { try { $bytes = [Convert]::FromBase64String($b64) } catch { $bytes = $null } }
    $problem = Get-LsTargetBytesProblem $bytes
    if ($problem -ceq 'MISSING') { [void]$refusals.Add('TARGET_BYTES_MISSING') }
    elseif ($problem -ceq 'SIZE') { [void]$refusals.Add('TARGET_SIZE_MISMATCH') }
    elseif ($problem -ceq 'HASH') { [void]$refusals.Add('TARGET_HASH_MISMATCH') }
    [ordered]@{ refusals = @($refusals | Select-Object -Unique); limits = $resolved.limits; probeBytes = $base.probeBytes; targetBytes = $bytes }
}

# ── D9 진단 URI 비교(TS compareScanUri) ───────────────────────────────────────
# 같다고 보는 것: 스킴이 정확히 소문자 file, 권한이 비어 있음(file:///…), 퍼센트 인코딩은 조각마다 정확히 한 번 디코딩(유효한 %XX 만), 첫 조각이 드라이브면 드라이브 문자만 대소문자 무시.
# 거절하는 것: 호스트·UNC, 쿼리, 프래그먼트, 깨진 %, 이중 인코딩, 역슬래시, 빈 조각, . / .. 조각, 조각 안의 / \ NUL 제어 문자, 끝 슬래시, 비ASCII, 공백·제어 문자. 결과: MATCH | DIFFERENT | REJECTED(사유).

# 조각 하나를 정확히 한 번 디코딩한다. 깨진 %·유효하지 않은 UTF-8 이면 $null.
function ConvertFrom-LsPercentOnce {
    param([string]$Raw)
    $bytes = New-Object System.Collections.Generic.List[byte]
    for ($i = 0; $i -lt $Raw.Length; $i++) {
        $ch = $Raw[$i]
        if ($ch -eq '%') {
            if ($i + 3 -gt $Raw.Length) { return $null }
            $hex = $Raw.Substring($i + 1, 2)
            if (-not [regex]::IsMatch($hex, '^[0-9A-Fa-f]{2}\z')) { return $null }
            $bytes.Add([Convert]::ToByte($hex, 16))
            $i += 2
        } else { $bytes.Add([byte][int]$ch) }
    }
    try { (New-Object Text.UTF8Encoding($false, $true)).GetString($bytes.ToArray()) } catch { $null }
}

function ConvertFrom-LsUri {
    param([string]$Uri)
    $fail = { param($r) @{ ok = $false; reason = $r } }
    foreach ($ch in $Uri.ToCharArray()) { if ([int]$ch -gt 0x7f) { return (& $fail 'NON_ASCII') } }
    foreach ($ch in $Uri.ToCharArray()) { $c = [int]$ch; if ($c -le 0x20 -or $c -eq 0x7f) { return (& $fail 'CONTROL_CHAR') } }
    if ($Uri.Contains('\')) { return (& $fail 'BACKSLASH') }
    if (-not $Uri.StartsWith('file:', [StringComparison]::Ordinal)) { return (& $fail 'SCHEME') }
    $afterScheme = $Uri.Substring(5)
    if (-not $afterScheme.StartsWith('//', [StringComparison]::Ordinal)) { return (& $fail 'AUTHORITY') }
    $rest = $afterScheme.Substring(2)
    if (-not $rest.StartsWith('/', [StringComparison]::Ordinal)) { return (& $fail 'AUTHORITY') }
    if ($rest.Contains('?')) { return (& $fail 'QUERY') }
    if ($rest.Contains('#')) { return (& $fail 'FRAGMENT') }
    if ($rest -ceq '/') { return (& $fail 'EMPTY_PATH') }
    $rawSegments = @($rest.Substring(1).Split([char]'/'))
    if ($rawSegments.Count -gt 1 -and $rawSegments[$rawSegments.Count - 1] -ceq '') { return (& $fail 'TRAILING_SLASH') }
    $segments = New-Object System.Collections.ArrayList
    foreach ($raw in $rawSegments) {
        if ($raw -ceq '') { return (& $fail 'EMPTY_SEGMENT') }
        $decoded = ConvertFrom-LsPercentOnce $raw
        if ($null -eq $decoded) { return (& $fail 'MALFORMED_PERCENT') }
        if ([regex]::IsMatch($decoded, '%[0-9A-Fa-f]{2}')) { return (& $fail 'DOUBLE_ENCODED') }
        if ((Test-LrOrdinalEqual $decoded '.') -or (Test-LrOrdinalEqual $decoded '..')) { return (& $fail 'DOT_SEGMENT') }
        if ([regex]::IsMatch($decoded, '[/\\\u0000-\u001f\u007f]')) { return (& $fail 'SEGMENT_ESCAPE') }
        [void]$segments.Add($decoded)
    }
    @{ ok = $true; segments = @($segments) }
}

function Test-LsSameSegments {
    param($A, $B)
    $a = @($A); $b = @($B)
    if ($a.Count -ne $b.Count) { return $false }
    for ($i = 0; $i -lt $a.Count; $i++) {
        if ($i -eq 0 -and [regex]::IsMatch([string]$a[0], '^[A-Za-z]:\z') -and [regex]::IsMatch([string]$b[0], '^[A-Za-z]:\z')) {
            if (-not (Test-LrOrdinalEqual ([string]$a[0]).Substring(0, 1).ToLowerInvariant() ([string]$b[0]).Substring(0, 1).ToLowerInvariant())) { return $false }
        } elseif (-not (Test-LrOrdinalEqual ([string]$a[$i]) ([string]$b[$i]))) { return $false }
    }
    $true
}

# 받은 URI 를 기대 URI 와 비교한다. 원문(raw)은 그대로 돌려준다(정규화한 값을 원문 자리에 쓰지 않는다).
function Compare-LsUri {
    param($Actual, $Expected)
    if ($Actual -isnot [string]) { return [ordered]@{ result = 'REJECTED'; reason = 'NOT_STRING'; raw = $null } }
    $got = ConvertFrom-LsUri $Actual
    if (-not $got.ok) { return [ordered]@{ result = 'REJECTED'; reason = $got.reason; raw = $Actual } }
    $want = @{ ok = $false }
    if ($Expected -is [string]) { $want = ConvertFrom-LsUri $Expected }
    if (-not $want.ok) { return [ordered]@{ result = 'REJECTED'; reason = 'EXPECTED_INVALID'; raw = $Actual } }
    $res = 'DIFFERENT'; if (Test-LsSameSegments $got.segments $want.segments) { $res = 'MATCH' }
    [ordered]@{ result = $res; reason = $null; raw = $Actual }
}

# ── stdout 프레임 해석(바이트 구간을 함께 기록하는 증분 해석기) ─────────────────────────────────────────────
# LspMin 의 Step-LspMinFramer 와 같은 규칙으로 프레임을 풀되 프레임마다 첫 바이트·끝 바이트(배타)를 기록한다. 첫 위반에서 영구 실패하고 이후 바이트는 보지 않는다(재동기화 없음).
# 오류 문구(detail)의 TS 와의 일치는 골든이 덮지 않는다(종류 MALFORMED / TRUNCATED 와 위치만 의미가 있다).

function New-LsFrameDecoder {
    param([int]$MaxBody)
    @{ ms = (New-Object IO.MemoryStream); pos = 0; bodyLen = $null; headerEnd = 0; failed = $false; error = $null; maxBody = $MaxBody; frames = (New-Object System.Collections.ArrayList) }
}

function Set-LsFrameError {
    param($D, [string]$Kind, [string]$Detail)
    $D.failed = $true
    $D.error = [ordered]@{ kind = $Kind; detail = $Detail; atByte = $D.pos }
}

# 새 바이트를 먹이고 이번에 완성된 프레임 수를 돌려준다. 완성된 프레임은 $D.frames 에 {index,startByte,endByte,kind,method,message} 로 쌓인다.
function Add-LsFrameBytes {
    param($D, [byte[]]$Bytes)
    $before = $D.frames.Count
    if ($D.failed -or $Bytes.Length -eq 0) { return 0 }
    $D.ms.Write($Bytes, 0, $Bytes.Length)
    $buf = $D.ms.GetBuffer()
    $len = [int]$D.ms.Length
    while ($true) {
        if ($D.failed -or $D.pos -ge $len) { break }
        if ($null -eq $D.bodyLen) {
            $end = -1
            for ($i = $D.pos; $i + 3 -lt $len; $i++) {
                if ($buf[$i] -eq 13 -and $buf[$i + 1] -eq 10 -and $buf[$i + 2] -eq 13 -and $buf[$i + 3] -eq 10) { $end = $i; break }
            }
            if ($end -lt 0) {
                if (($len - $D.pos) -gt 8192 + 3) { Set-LsFrameError $D 'MALFORMED' '헤더가 끝나지 않는다'; break }
                $first = $buf[$D.pos]
                if (-not (($first -ge 0x30 -and $first -le 0x39) -or ($first -ge 0x41 -and $first -le 0x5a) -or ($first -ge 0x61 -and $first -le 0x7a))) { Set-LsFrameError $D 'MALFORMED' '헤더가 아닌 바이트'; break }
                break
            }
            $header = [Text.Encoding]::GetEncoding('latin1').GetString($buf, $D.pos, $end - $D.pos)
            $lengthValue = $null
            foreach ($line in $header.Split([string[]]@("`r`n"), [StringSplitOptions]::None)) {
                $colon = $line.IndexOf(':')
                if ($colon -lt 0) { Set-LsFrameError $D 'MALFORMED' '콜론이 없는 헤더 줄'; break }
                $name = $line.Substring(0, $colon)
                if ($name -cnotmatch "^[!#$%&'*+\-.^_``|~0-9A-Za-z]+$") { Set-LsFrameError $D 'MALFORMED' '헤더 이름이 올바르지 않다'; break }
                if ($name.ToLowerInvariant() -eq 'content-length') {
                    if ($null -ne $lengthValue) { Set-LsFrameError $D 'MALFORMED' 'Content-Length 중복'; break }
                    $lengthValue = $line.Substring($colon + 1).Trim(' ', "`t")
                }
            }
            if ($D.failed) { break }
            if ($null -eq $lengthValue -or $lengthValue -cnotmatch '^[0-9]+\z' -or $lengthValue.Length -gt 15) { Set-LsFrameError $D 'MALFORMED' 'Content-Length 가 올바르지 않다'; break }
            $n = [long]$lengthValue
            if ($n -eq 0 -or $n -gt $D.maxBody) { Set-LsFrameError $D 'MALFORMED' 'Content-Length 범위 밖'; break }
            $D.bodyLen = [int]$n
            $D.headerEnd = $end + 4
        }
        $total = $D.headerEnd + $D.bodyLen
        if ($len -lt $total) { break }
        $bodyText = $null
        try { $bodyText = (New-Object Text.UTF8Encoding($false, $true)).GetString($buf, $D.headerEnd, $D.bodyLen) } catch { Set-LsFrameError $D 'MALFORMED' '본문이 유효한 UTF-8 이 아니다'; break }
        $lead = $bodyText.TrimStart([char]32, [char]9, [char]13, [char]10)
        if ($lead.Length -eq 0 -or [string]$lead[0] -cne '{') { Set-LsFrameError $D 'MALFORMED' '최상위 값이 일반 객체가 아니다'; break }
        $msg = $null
        try { $msg = $bodyText | ConvertFrom-Json } catch { Set-LsFrameError $D 'MALFORMED' '본문이 유효한 JSON 이 아니다'; break }
        if ($msg -isnot [pscustomobject]) { Set-LsFrameError $D 'MALFORMED' '최상위 값이 일반 객체가 아니다'; break }
        $jr = Get-LmExactMember $msg 'jsonrpc'
        if ($jr -isnot [string] -or $jr -cne '2.0') { Set-LsFrameError $D 'MALFORMED' 'jsonrpc 가 2.0 이 아니다'; break }
        if ((Test-LmExactMember $msg 'method') -and (Get-LmExactMember $msg 'method') -isnot [string]) { Set-LsFrameError $D 'MALFORMED' 'method 가 문자열이 아니다'; break }
        if (Test-LmExactMember $msg 'id') {
            $mid = Get-LmExactMember $msg 'id'
            if ($null -ne $mid -and $mid -isnot [string] -and $mid -isnot [int] -and $mid -isnot [long] -and $mid -isnot [double] -and $mid -isnot [decimal]) { Set-LsFrameError $D 'MALFORMED' 'id 형식이 올바르지 않다'; break }
        }
        $kind = Get-LrMessageKind $msg
        $method = $null; $m0 = Get-LrMember $msg 'method'; if ($m0 -is [string]) { $method = $m0 }
        [void]$D.frames.Add(@{ index = $D.frames.Count; startByte = $D.pos; endByte = $total; kind = $kind; method = $method; message = $msg })
        $D.pos = $total
        $D.bodyLen = $null
    }
    $D.frames.Count - $before
}

# 스트림이 끝났다: 처리 중인 프레임이 남아 있으면 TRUNCATED 오류를 한 번 돌려준다(없으면 $null).
function Complete-LsFrameDecoder {
    param($D)
    if ($D.failed) { return $null }
    if ($D.pos -lt [int]$D.ms.Length) { $where = '헤더'; if ($null -ne $D.bodyLen) { $where = '본문' }; Set-LsFrameError $D 'TRUNCATED' ($where + ' 도중에 스트림이 끝났다'); return $D.error }
    $null
}

# ── stdout 추적기(TS ScanStdoutTracker) ───────────────────────────────────────

function New-LsStdoutTracker { @{ analysis = (New-LrStdoutAnalysis); initializedSent = $false; didOpenSent = $false; preOpenDiagnostics = 0; allowedRequests = 0 } }

# 메시지마다 중단 사유를 판단한다. 응답은 이 관측의 id(lsp-scan-init-1, lsp-scan-shutdown-1)로만 알아본다. 없으면 $null.
function Invoke-LsStdoutTracker {
    param($T, $Message)
    $kind = Get-LrMessageKind $Message
    if ($kind -ceq 'response') {
        $a = $T.analysis
        $a.frames += 1
        $id = Get-LrMember $Message 'id'
        if ($id -is [string] -and (Test-LrOrdinalEqual $id $Script:LsInitId)) { if ($null -eq $a.initMessage) { $a.initMessage = $Message } else { $a.initDuplicate = $true } }
        elseif ($id -is [string] -and (Test-LrOrdinalEqual $id $Script:LsShutdownId)) { $a.shutdownResponseSeen = $true }
        else { $a.unmatchedResponses += 1 }
        return $null
    }
    Add-LrStdoutMessage $T.analysis $Message
    if ($kind -ceq 'notification') {
        $method = [string](Get-LrMember $Message 'method')
        if (Test-LrOrdinalEqual $method $Script:LrPublishDiagnosticsMethod) {
            if (-not $T.initializedSent) { return [ordered]@{ condition = 'A1'; detail = ('PRE_INITIALIZED:' + $method.Split([char]'/')[1]) } }
            if (-not $T.didOpenSent) { $T.preOpenDiagnostics += 1 }
            return $null
        }
        if ((Test-LrOrdinalEqual $method $Script:LrRulesRefreshedMethod) -and -not $T.initializedSent) { return [ordered]@{ condition = 'A1'; detail = 'PRE_INITIALIZED:rulesRefreshed' } }
        return $null
    }
    if ($kind -ceq 'server-request') {
        if (-not (Test-LrValidProgressCreate $Message)) { return [ordered]@{ condition = 'A6'; detail = (Format-LrToken ([string](Get-LrMember $Message 'method'))) } }
        $T.allowedRequests += 1
        if ($T.didOpenSent) { return [ordered]@{ condition = 'A6'; detail = 'REQUEST_AFTER_DID_OPEN' } }
        if ($T.allowedRequests -gt $Script:LrMaxProgressCreate) { return [ordered]@{ condition = 'A6'; detail = 'TOO_MANY_PROGRESS_REQUESTS' } }
        if (-not $T.initializedSent) { return [ordered]@{ condition = 'A6'; detail = 'REQUEST_BEFORE_INITIALIZED' } }
    }
    $null
}

# ── stderr 로그 판독(TS scan-log.ts analyzeScanLog) ───────────────────────────────

$Script:LsBundleKeys = @('scanningSingleFile', 'scannedSingleFile', 'scanningTargets', 'runningRules', 'foundMatchesBefore', 'engineErrors', 'skippedRules', 'scannedFiles', 'foundMatches')
$Script:LsOrderKeys = @('scanningSingleFile', 'scanningTargets', 'runningRules', 'foundMatchesBefore', 'engineErrors', 'skippedRules', 'scannedFiles', 'foundMatches')
$Script:LsEvidenceKeys = @($Script:LsBundleKeys) + @('fileNotInTargets')
$Script:LsNetworkKeys = @('usingAuto', 'download', 'tokenFound', 'settingsFileFound')
$Script:LsWorkspaceKeys = @('scanningWorkspace', 'scannedWorkspace', 'scanningWorkspaceComplete', 'fullScan')
$Script:LsBareKeys = @('refreshingRules', 'rulesRefreshed', 'scanningOpenDocuments', 'scannedOpenDocuments')
$Script:LsReTargets = New-LrRegex ('^Scanning ' + $Script:LrNum + ' targets\z')
$Script:LsReMatchesBefore = New-LrRegex ('^Found ' + $Script:LrNum + ' matches before processing\z')
$Script:LsReNotInTargets = New-LrRegex ('^File ' + $Script:LrNotLine + '+ is not in the session targets recalculating targets just in case\z')
$Script:LsReFiveTokens = New-LrRegex '^"([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)"\z'

# 스캔 경로 키의 기대 모양(TS FORM). 표에 없는 키는 모양과 상관없다(any).
$Script:LsForm = @{
    refreshingRules = 'bare'; rulesRefreshed = 'bare'; scanningOpenDocuments = 'bare'; scannedOpenDocuments = 'bare'
    loading = 'INFO'; doneLoading = 'INFO'; gotErrors = 'INFO'; noTargets = 'WARNING'; ciDisabled = 'DEBUG|INFO'; noRules = 'WARNING'; rulesNotLoaded = 'bare'; lifecycle = 'bare'
    scanningSingleFile = 'bare'; scannedSingleFile = 'bare'; scanningTargets = 'INFO'; runningRules = 'DEBUG'; foundMatchesBefore = 'INFO'
    engineErrors = 'bare'; skippedRules = 'bare'; scannedFiles = 'bare'; foundMatches = 'bare'; externalCommand = 'INFO'; errorOutput = 'INFO'; fileNotInTargets = 'DEBUG'
}

function Get-LsShape {
    param([string]$Key, $Level)
    $form = 'any'; if ($Script:LsForm.ContainsKey($Key)) { $form = [string]$Script:LsForm[$Key] }
    if ($form -ceq 'any') { return 'OK' }
    if ($form -ceq 'bare') { if ($null -eq $Level) { return 'OK' } else { return 'SHAPE_MISMATCH' } }
    if ($null -eq $Level) { return 'SHAPE_MISMATCH' }
    if ($form -ceq 'DEBUG|INFO') { if ($Level -ceq 'DEBUG' -or $Level -ceq 'INFO') { return 'OK' } else { return 'SHAPE_MISMATCH' } }
    if ($form -ceq $Level) { return 'OK' }
    'SHAPE_MISMATCH'
}

function New-LsClass { param([string]$Key, $P = $null) if ($null -eq $P) { $P = @{} }; @{ key = $Key; params = $P } }

# 기존 규칙 분류기(TS classifyRulesMessage)와 같다. 단 매개변수(path·count·n·s·k·m·text)를 함께 돌려준다.
function Get-LsRulesClass {
    param([string]$Message)
    $text = Get-LrJsTrim $Message
    if (Test-LrOrdinalEqual $text $Script:LrNoTargets) { return (New-LsClass 'noTargets') }
    if (Test-LrOrdinalEqual $text $Script:LrNoRules) { return (New-LsClass 'noRules') }
    if (Test-LrOrdinalIn $text $Script:LrTokenBenign) { return (New-LsClass 'tokenBenign') }
    if (Test-LrOrdinalIn $text $Script:LrLifecycle) { return (New-LsClass 'lifecycle') }
    if (Test-LrAsciiPrefixCI $text 'rules not loaded yet') { return (New-LsClass 'rulesNotLoaded') }
    if (Test-LrAsciiPrefixCI $text 'found api token') { return (New-LsClass 'tokenFound') }
    if (Test-LrAsciiPrefixCI $text 'settings file found') { return (New-LsClass 'settingsFileFound') }
    $key = $null
    if ($Script:LrSimple.TryGetValue($text, [ref]$key)) { return (New-LsClass $key) }
    $m = $Script:LrReGot.Match($text)
    if ($m.Success) { $n = ConvertTo-LrSafeCount $m.Groups[1].Value; if ($null -ne $n) { return (New-LsClass 'gotErrors' @{ count = $n }) } }
        $m = $Script:LrReLoading.Match($text)
        if ($m.Success) { return (New-LsClass 'loading' @{ path = $m.Groups[1].Value }) }
        $m = $Script:LrReDone.Match($text)
        if ($m.Success) { return (New-LsClass 'doneLoading' @{ path = $m.Groups[1].Value }) }
        if ($Script:LrReSkipping.Match($text).Success) { return (New-LsClass 'skippingRule') }
        if ($Script:LrReDownload.Match($text).Success) { return (New-LsClass 'download') }
        $m = $Script:LrReRunning.Match($text)
        if ($m.Success) { $n = ConvertTo-LrSafeCount $m.Groups[1].Value; if ($null -ne $n) { return (New-LsClass 'runningRules' @{ n = $n }) } }
            $m = $Script:LrReEngine.Match($text)
            if ($m.Success) { return (New-LsClass 'engineErrors' @{ text = $m.Groups[1].Value }) }
            $m = $Script:LrReSkipped.Match($text)
            if ($m.Success) { $n = ConvertTo-LrSafeCount $m.Groups[1].Value; if ($null -ne $n) { return (New-LsClass 'skippedRules' @{ s = $n }) } }
                $m = $Script:LrReScanned.Match($text)
                if ($m.Success) { $n = ConvertTo-LrSafeCount $m.Groups[1].Value; if ($null -ne $n) { return (New-LsClass 'scannedFiles' @{ k = $n }) } }
                    $m = $Script:LrReFound.Match($text)
                    if ($m.Success) { $n = ConvertTo-LrSafeCount $m.Groups[1].Value; if ($null -ne $n) { return (New-LsClass 'foundMatches' @{ m = $n }) } }
    if ([regex]::IsMatch((ConvertTo-LrAsciiLower $text), '(?<![A-Za-z0-9_])using auto(?![A-Za-z0-9_])')) { return (New-LsClass 'usingAuto') }
    $null
}

# 본문(머리말을 벗긴 첫 줄)을 키로 분류한다. 이 단계의 새 문구를 먼저 보고, 나머지는 위의 규칙 분류기에 맡긴다. 알 수 없으면 $null.
function Get-LsMessageClass {
    param([string]$Message)
    $text = Get-LrJsTrim $Message
    if (Test-LrOrdinalEqual $text 'Scanned single file') { return (New-LsClass 'scannedSingleFile') }
    $m = $Script:LsReTargets.Match($text)
    if ($m.Success) { $n = ConvertTo-LrSafeCount $m.Groups[1].Value; if ($null -ne $n) { return (New-LsClass 'scanningTargets' @{ n = $n }) } }
    $m = $Script:LsReMatchesBefore.Match($text)
    if ($m.Success) { $n = ConvertTo-LrSafeCount $m.Groups[1].Value; if ($null -ne $n) { return (New-LsClass 'foundMatchesBefore' @{ m = $n }) } }
    $ext = 'Running external command:'
    if ($text.StartsWith($ext, [StringComparison]::Ordinal)) { return (New-LsClass 'externalCommand' @{ rest = $text.Substring($ext.Length) }) }
    if ($text.StartsWith('error output:', [StringComparison]::Ordinal)) { return (New-LsClass 'errorOutput') }
    if ($Script:LsReNotInTargets.IsMatch($text)) { return (New-LsClass 'fileNotInTargets') }
    Get-LsRulesClass $Message
}

# 로그의 작업 영역 경로가 설정된 작업 영역 폴더와 같은가(D3). 로그의 경로는 `\` 만 쓰고, 드라이브 문자(첫 글자)만 대소문자를 무시한다.
function Test-LsWorkspacePathMatches {
    param([string]$LogPath, $Configured)
    if ($Configured -isnot [string]) { return $false }
    $want = $Configured.Replace('/', '\')
    if (-not [regex]::IsMatch($want, '^[A-Za-z]:\\') -or -not [regex]::IsMatch($LogPath, '^[A-Za-z]:\\') -or $LogPath.Contains('/')) { return $false }
    Test-LrOrdinalEqual ($want.Substring(0, 1).ToLowerInvariant() + $want.Substring(1)) ($LogPath.Substring(0, 1).ToLowerInvariant() + $LogPath.Substring(1))
}

# 외부 명령 INFO 줄의 본문(접두 뒤)을 정확한 모양으로만 받는다: "git" "-C" "<작업 영역>" "rev-parse" "--show-toplevel".
function Get-LsExternalCommandShape {
    param($Level, [string]$Rest, $Workspace)
    if ($null -eq $Level -or $Level -cne 'INFO') { return 'BAD_LEVEL' }
    if (-not $Rest.StartsWith(' ', [StringComparison]::Ordinal)) { return 'BAD_TOKENS' }
    $m = $Script:LsReFiveTokens.Match($Rest.Substring(1))
    if (-not $m.Success) { return 'BAD_TOKENS' }
    if (-not (Test-LrOrdinalEqual $m.Groups[1].Value 'git')) { return 'BAD_COMMAND' }
    if (-not (Test-LrOrdinalEqual $m.Groups[2].Value '-C') -or -not (Test-LrOrdinalEqual $m.Groups[4].Value 'rev-parse') -or -not (Test-LrOrdinalEqual $m.Groups[5].Value '--show-toplevel')) { return 'BAD_ARGS' }
    if (Test-LsWorkspacePathMatches $m.Groups[3].Value $Workspace) { return 'OK' }
    'BAD_WORKSPACE'
}

function Get-LsSegmentOf {
    param([long]$StartByte, $DidOpenOffset)
    if ($null -ne $DidOpenOffset -and $StartByte -ge [long]$DidOpenOffset) { return 'POST_OPEN' }
    'PRE_OPEN'
}

function Add-LsLine {
    param($S, $Cls, $Header, [long]$Start, [long]$End, [bool]$Terminated, [int]$Index)
    $level = $null; if ($null -ne $Header) { $level = $Header.level }
    $line = [ordered]@{
        index = $Index; startByte = $Start; endByte = $End; terminated = $Terminated; segment = (Get-LsSegmentOf $Start $S.didOpenOffset); level = $level
        key = $Cls.key; shape = (Get-LsShape $Cls.key $level); params = $Cls.params
    }
    [void]$S.lines.Add($line)
    $line
}

function New-LsRecordIndex { param($S) $i = $S.recordCount; $S.recordCount += 1; $S.c.records += 1; $i }

function Invoke-LsLogLine {
    param($S, [byte[]]$Bytes, [int]$Start, [int]$End, [int]$LineEnd, [bool]$Terminated)
    $S.c.lines += 1
    $raw = ''; if ($End -gt $Start) { $raw = $Script:LrUtf8.GetString($Bytes, $Start, $End - $Start) }
    $text = $raw
    if ($raw.EndsWith("`r", [StringComparison]::Ordinal)) { $text = $raw.Substring(0, $raw.Length - 1) }
    $header = Get-LrHeader $text
    if ($null -ne $header) {
        if ($null -ne $header.malformed) { $S.c.malformedHeaders += 1; $S.current = $null; return }
        $index = New-LsRecordIndex $S
        $S.c.headedRecords += 1
        $cur = @{ index = $index; key = $null; line = $null; pendingBlock = (Get-LrJsTrimEnd $header.message).EndsWith(':', [StringComparison]::Ordinal); depth = [Math]::Max(0, (Get-LrBracketDelta $header.message)) }
        $S.current = $cur
        $cls = Get-LsMessageClass $header.message
        if ($null -ne $cls) { $cur.key = $cls.key; $cur.line = Add-LsLine $S $cls $header $Start $LineEnd $Terminated $index }
        elseif ($header.level -ceq 'ERROR') { $cur.key = 'errorRecord'; $cur.line = Add-LsLine $S (New-LsClass 'errorRecord' @{ message = $header.message }) $header $Start $LineEnd $Terminated $index }
        elseif ($header.level -ceq 'WARNING') { $cur.key = 'unexpectedWarning'; $cur.line = Add-LsLine $S (New-LsClass 'unexpectedWarning' @{ message = $header.message }) $header $Start $LineEnd $Terminated $index }
        elseif ($header.level -ceq 'INFO') { $S.c.unclassifiedInfo += 1 }
        else { $S.c.unclassifiedDebug += 1 }
        return
    }
    $cur = $S.current
    if ($null -ne $cur -and $cur.depth -gt 0) {
        if ($null -ne (Get-LsMessageClass $text)) { $S.c.embeddedSignalText += 1 }
        $cur.depth = [Math]::Max(0, $cur.depth + (Get-LrBracketDelta $text))
        return
    }
    $cls = $null
    if ((Get-LrJsTrim $text) -cne '') { $cls = Get-LsMessageClass $text }
    if ($null -ne $cls) {
        $index = New-LsRecordIndex $S
        $S.c.bareRecords += 1
        $line = Add-LsLine $S $cls $null $Start $LineEnd $Terminated $index
        $S.current = @{ index = $index; key = $cls.key; line = $line; pendingBlock = $false; depth = 0 }
        return
    }
    if ($null -eq $cur) { if ((Get-LrJsTrim $text) -cne '') { $S.c.orphanBareLines += 1 }; return }
    if ($cur.pendingBlock -and (Get-LrJsTrim $text) -cne '') { $cur.pendingBlock = $false; $cur.depth = [Math]::Max(0, (Get-LrBracketDelta $text)) }
    if ($cur.key -ceq 'engineErrors' -and $null -ne $cur.line -and (Get-LrJsTrim $text) -cne '') {
        $ix = [string]$cur.line.index
        if (-not $S.continuation.ContainsKey($ix)) { $t = Get-LrJsTrim $text; if ($t.Length -gt 200) { $t = $t.Substring(0, 200) }; $S.continuation[$ix] = $t }
    }
}

function Get-LsCountsOf {
    param($Lines, [string]$Segment)
    $out = [ordered]@{}
    foreach ($l in $Lines) {
        if ($l.segment -cne $Segment -or -not $l.terminated) { continue }
        if (-not $out.Contains($l.key)) { $out[$l.key] = [ordered]@{ ok = 0; mismatch = 0 } }
        if ($l.shape -ceq 'OK') { $out[$l.key].ok += 1 } else { $out[$l.key].mismatch += 1 }
    }
    $out
}

function Get-LsExtraKinds {
    param($Line, [string]$Segment, $Continuation)
    $out = New-Object System.Collections.ArrayList
    $key = [string]$Line.key
    $post = ($Segment -ceq 'POST_OPEN')
    if (Test-LrOrdinalIn $key $Script:LsWorkspaceKeys) { [void]$out.Add('WORKSPACE_SCAN') }
    if ($post -and ($key -ceq 'scanningOpenDocuments' -or $key -ceq 'scannedOpenDocuments')) { [void]$out.Add('OPEN_DOCUMENTS_SCAN') }
    if ($post -and ($key -ceq 'refreshingRules' -or $key -ceq 'rulesRefreshed')) { [void]$out.Add('RULES_REFRESH') }
    if ($post -and $key -ceq 'noTargets') { [void]$out.Add('NO_TARGETS') }
    if ($key -ceq 'noRules') { [void]$out.Add('NO_RULES') }
    if ($key -ceq 'rulesNotLoaded') { [void]$out.Add('RULES_NOT_LOADED') }
    if (($null -ne $Line.level -and $Line.level -ceq 'ERROR') -or $key -ceq 'errorRecord') { [void]$out.Add('ERROR_RECORD') }
    if ($key -ceq 'unexpectedWarning') { [void]$out.Add('UNEXPECTED_WARNING') }
    if ($key -ceq 'skippingRule') { [void]$out.Add('SKIPPING_RULE') }
    if (Test-LrOrdinalIn $key $Script:LsNetworkKeys) { [void]$out.Add('FORBIDDEN_NETWORK') }
    if ($key -ceq 'errorOutput') { [void]$out.Add('ERROR_OUTPUT') }
    if ($post -and $key -ceq 'fileNotInTargets') { [void]$out.Add('FILE_NOT_IN_TARGETS') }
    if ($post -and $key -ceq 'engineErrors') {
        $t = ''; if ($Line.params.ContainsKey('text')) { $t = (Get-LrJsTrim ([string]$Line.params.text)) }
        if ($t -cne '' -or $Continuation.ContainsKey([string]$Line.index)) { [void]$out.Add('ENGINE_ERRORS_NONEMPTY') }
    }
    if ($post -and $key -ceq 'skippedRules') { $s = $null; if ($Line.params.ContainsKey('s')) { $s = $Line.params.s }; if ($null -ne $s -and $s -ge 1) { [void]$out.Add('SKIPPED_RULES_NONZERO') } }
    , @($out)
}

# JS 의 안정 정렬을 따른다(PowerShell 의 Sort-Object 는 안정성을 보장하지 않는다). Items 의 각 원소에서 KeyName 의 숫자로 오름차순.
function Sort-LsStable {
    param($Items, [string]$KeyName)
    $a = New-Object System.Collections.ArrayList
    foreach ($x in $Items) { [void]$a.Add($x) }
    for ($i = 1; $i -lt $a.Count; $i++) {
        $cur = $a[$i]; $j = $i - 1
        while ($j -ge 0 -and $a[$j][$KeyName] -gt $cur[$KeyName]) { $a[$j + 1] = $a[$j]; $j-- }
        $a[$j + 1] = $cur
    }
    , @($a)
}

function Get-LsExtrasOf {
    param($S, [string]$Segment, $List)
    $out = New-Object System.Collections.ArrayList
    $seen = @{}
    foreach ($l in $List) {
        foreach ($kind in (Get-LsExtraKinds $l $Segment $S.continuation)) {
            [void]$out.Add([ordered]@{ kind = $kind; key = $l.key; segment = $Segment; startByte = $l.startByte; endByte = $l.endByte })
        }
        if ($Segment -ceq 'POST_OPEN' -and (Test-LrOrdinalIn ([string]$l.key) $Script:LsBundleKeys) -and $l.shape -ceq 'OK') {
            $n = 1; if ($seen.ContainsKey([string]$l.key)) { $n = $seen[[string]$l.key] + 1 }
            $seen[[string]$l.key] = $n
            if ($n -ge 2) { [void]$out.Add([ordered]@{ kind = 'DUPLICATE_LINE'; key = $l.key; segment = $Segment; startByte = $l.startByte; endByte = $l.endByte }) }
        }
    }
    Sort-LsStable $out 'startByte'
}

# 로그 전체 바이트를 해석한다. 같은 바이트와 옵션이면 같은 결과다. Workspace: 설정된 작업 영역 폴더, DidOpenOffset: didOpen 을 쓰기 직전까지 읽은 stderr 바이트 수($null 이면 전부 사전 구간).
function Get-LsLogAnalysis {
    param([byte[]]$Bytes, $Workspace, $DidOpenOffset)
    $S = @{
        lines = (New-Object System.Collections.ArrayList); continuation = @{}; current = $null; recordCount = 0; didOpenOffset = $DidOpenOffset
        c = [ordered]@{ lines = 0; records = 0; headedRecords = 0; bareRecords = 0; malformedHeaders = 0; orphanBareLines = 0; embeddedSignalText = 0; unclassifiedInfo = 0; unclassifiedDebug = 0; partialTail = $false; totalBytes = $Bytes.Length }
    }
    $start = 0
    while ($start -lt $Bytes.Length) {
        $nl = [Array]::IndexOf($Bytes, [byte]10, $start)
        if ($nl -lt 0) { $S.c.partialTail = $true; Invoke-LsLogLine $S $Bytes $start $Bytes.Length $Bytes.Length $false; break }
        Invoke-LsLogLine $S $Bytes $start $nl ($nl + 1) $true
        $start = $nl + 1
    }
    $lines = $S.lines
    $pre = New-Object System.Collections.ArrayList; $post = New-Object System.Collections.ArrayList
    foreach ($l in $lines) { if ($l.segment -ceq 'PRE_OPEN') { [void]$pre.Add($l) } else { [void]$post.Add($l) } }

    $firstOk = @{}; $occ = @{}
    foreach ($l in $post) {
        if (-not (Test-LrOrdinalIn ([string]$l.key) $Script:LsBundleKeys)) { continue }
        $k = [string]$l.key
        $occ[$k] = 1 + $(if ($occ.ContainsKey($k)) { $occ[$k] } else { 0 })
        if ($l.shape -ceq 'OK' -and $l.terminated -and -not $firstOk.ContainsKey($k)) { $firstOk[$k] = $l }
    }
    $missing = New-Object System.Collections.ArrayList
    foreach ($k in $Script:LsBundleKeys) { if (-not $firstOk.ContainsKey($k)) { [void]$missing.Add($k) } }
    $orderViolations = New-Object System.Collections.ArrayList
    $present = @($Script:LsOrderKeys | Where-Object { $firstOk.ContainsKey($_) })
    for ($i = 0; $i + 1 -lt $present.Count; $i++) {
        if ($firstOk[$present[$i]].startByte -ge $firstOk[$present[$i + 1]].startByte) { [void]$orderViolations.Add("ORDER:$($present[$i])>$($present[$i + 1])") }
    }
    if ($firstOk.ContainsKey('scanningSingleFile') -and $firstOk.ContainsKey('scannedSingleFile') -and $firstOk['scannedSingleFile'].startByte -le $firstOk['scanningSingleFile'].startByte) { [void]$orderViolations.Add('ORDER:scanningSingleFile>scannedSingleFile') }
    $seenAll = ($missing.Count -eq 0)
    $exactlyOnce = $true; foreach ($k in $Script:LsBundleKeys) { if (-not ($occ.ContainsKey($k) -and $occ[$k] -eq 1)) { $exactlyOnce = $false } }
    $completeEndByte = $null
    if ($seenAll) { $mx = [long]0; foreach ($k in $Script:LsBundleKeys) { if ($firstOk[$k].endByte -gt $mx) { $mx = [long]$firstOk[$k].endByte } }; $completeEndByte = $mx }
    $shapeMismatch = New-Object System.Collections.ArrayList
    foreach ($l in $post) { if ($l.shape -cne 'OK' -and -not (Test-LrOrdinalIn ([string]$l.key) @($shapeMismatch))) { [void]$shapeMismatch.Add([string]$l.key) } }
    $bundleShapeOk = $true; foreach ($k in $shapeMismatch) { if (Test-LrOrdinalIn $k $Script:LsBundleKeys) { $bundleShapeOk = $false } }

    # 외부 명령 시도
    $preAt = { param($key) foreach ($x in $pre) { if ($x.key -ceq $key -and $x.shape -ceq 'OK') { return [long]$x.startByte } }; $null }
    $scanningOpen = & $preAt 'scanningOpenDocuments'; $scannedOpen = & $preAt 'scannedOpenDocuments'
    $scanStart = $null; if ($firstOk.ContainsKey('scanningSingleFile')) { $scanStart = [long]$firstOk['scanningSingleFile'].startByte }
    $scanTargets = $null; if ($firstOk.ContainsKey('scanningTargets')) { $scanTargets = [long]$firstOk['scanningTargets'].startByte }
    $attempts = New-Object System.Collections.ArrayList
    foreach ($l in $lines) {
        if ($l.key -cne 'externalCommand') { continue }
        $window = 'OTHER'
        if ($l.segment -ceq 'PRE_OPEN') {
            if ($null -ne $scanningOpen -and $l.startByte -gt $scanningOpen -and ($null -eq $scannedOpen -or $l.startByte -lt $scannedOpen)) { $window = 'BARRIER' }
        } elseif ($null -ne $scanStart -and $l.startByte -gt $scanStart -and ($null -eq $scanTargets -or $l.startByte -lt $scanTargets)) { $window = 'SCAN' }
        $rest = ''; if ($l.params.ContainsKey('rest')) { $rest = [string]$l.params.rest }
        [void]$attempts.Add([ordered]@{ lineIndex = $l.index; segment = $l.segment; window = $window; shape = (Get-LsExternalCommandShape $l.level $rest $Workspace); startByte = $l.startByte; endByte = $l.endByte })
    }
    $inPre = @($attempts | Where-Object { $_.segment -ceq 'PRE_OPEN' }); $inPost = @($attempts | Where-Object { $_.segment -ceq 'POST_OPEN' })
    $problems = New-Object System.Collections.ArrayList
    $shapeOk = (@($attempts | Where-Object { $_.shape -cne 'OK' }).Count -eq 0)
    if (-not $shapeOk) { [void]$problems.Add('EXTERNAL_COMMAND_SHAPE') }
    $outOfPhase = (@($attempts | Where-Object { $_.window -ceq 'OTHER' }).Count -gt 0)
    if (@($inPre | Where-Object { $_.window -ceq 'BARRIER' }).Count -gt 1 -or @($inPost | Where-Object { $_.window -ceq 'SCAN' }).Count -gt 1 -or $outOfPhase) { [void]$problems.Add('EXTERNAL_COMMAND_COUNT') }
    if ($outOfPhase) { [void]$problems.Add('EXTERNAL_COMMAND_OUT_OF_PHASE') }

    $preEvidence = New-Object System.Collections.ArrayList
    foreach ($l in $pre) { if (Test-LrOrdinalIn ([string]$l.key) $Script:LsEvidenceKeys) { [void]$preEvidence.Add([string]$l.key) } }
    [ordered]@{
        didOpenOffset = $DidOpenOffset; lines = @($lines); counters = $S.c
        openBlockAtEnd = ($null -ne $S.current -and $S.current.depth -gt 0)
        pre = [ordered]@{ scanEvidence = @($preEvidence); counts = (Get-LsCountsOf $lines 'PRE_OPEN'); extras = (Get-LsExtrasOf $S 'PRE_OPEN' $pre) }
        post = [ordered]@{
            counts = (Get-LsCountsOf $lines 'POST_OPEN'); extras = (Get-LsExtrasOf $S 'POST_OPEN' $post); shapeMismatch = @($shapeMismatch)
            bundle = [ordered]@{ complete = ($seenAll -and $exactlyOnce -and $orderViolations.Count -eq 0 -and $bundleShapeOk); seenAll = $seenAll; missing = @($missing); orderViolations = @($orderViolations); completeEndByte = $completeEndByte }
        }
        externalCommand = [ordered]@{ preCount = $inPre.Count; postCount = $inPost.Count; attempts = @($attempts); shapeOk = $shapeOk; problems = @($problems) }
    }
}

# ── 장벽 평가(TS evaluateScanBarrier) ─────────────────────────────────────────

function Format-LsUpperKey { param([string]$Key) ([regex]::Replace($Key, '([A-Z])', { param($m) '_' + $m.Value })).ToUpperInvariant() }
function Get-LsComparableLoadingPath { param([string]$Path) ConvertTo-LrJsLower ([regex]::Replace($Path.Replace('\', '/'), '/{2,}', '/')) }

function Get-LsStderrBarrierProblems {
    param($Log, $ProbePath)
    $problems = New-Object System.Collections.ArrayList
    $pre = @($Log.lines | Where-Object { $_.segment -ceq 'PRE_OPEN' -and $_.terminated })
    $linesOf = { param($key) @($pre | Where-Object { $_.key -ceq $key }) }
    $okOf = { param($key) @($pre | Where-Object { $_.key -ceq $key -and $_.shape -ceq 'OK' }) }
    $okAt = New-Object System.Collections.ArrayList
    foreach ($key in $Script:LsBareKeys) {
        $ok = @(& $okOf $key)
        if ($ok.Count -ne 1 -or @(& $linesOf $key).Count -ne 1) { [void]$problems.Add("${key}_COUNT_$($ok.Count)") }
        if ($ok.Count -eq 1) { [void]$okAt.Add([long]$ok[0].startByte) } else { [void]$okAt.Add($null) }
    }
    $scannedSeen = (@(& $okOf 'scannedOpenDocuments').Count -ge 1)
    $allKnown = $true; foreach ($x in $okAt) { if ($null -eq $x) { $allKnown = $false } }
    if ($allKnown) { for ($i = 1; $i -lt $okAt.Count; $i++) { if ($okAt[$i] -le $okAt[$i - 1]) { [void]$problems.Add('ORDER') } } }
    $loading = @(& $okOf 'loading'); $done = @(& $okOf 'doneLoading')
    if ($loading.Count -ne 1) { [void]$problems.Add("LOADING_COUNT_$($loading.Count)") }
    if ($done.Count -ne 1) { [void]$problems.Add("DONE_LOADING_COUNT_$($done.Count)") }
    $want = $null; if ($ProbePath -is [string]) { $want = Get-LsComparableLoadingPath $ProbePath }
    if ($null -eq $want) { [void]$problems.Add('LOADING_PATH_UNVERIFIABLE') }
    foreach ($line in (@($loading) + @($done))) {
        if ($null -ne $want -and -not (Test-LrOrdinalEqual (Get-LsComparableLoadingPath ([string]$line.params.path)) $want)) { [void]$problems.Add('LOADING_PATH_UNEXPECTED'); break }
    }
    if ($loading.Count -eq 1 -and $done.Count -eq 1) {
        if ($loading[0].startByte -ge $done[0].startByte) { [void]$problems.Add('ORDER') }
        if ($null -ne $okAt[0] -and $null -ne $okAt[1]) {
            foreach ($line in @($loading[0], $done[0])) { if ($line.startByte -lt $okAt[0] -or $line.startByte -gt $okAt[1]) { [void]$problems.Add('ORDER') } }
        }
    }
    $got = @(& $okOf 'gotErrors')
    if ($got.Count -ne 1) { [void]$problems.Add("GOT_ERRORS_COUNT_$($got.Count)") } elseif ($got[0].params.count -ne 0) { [void]$problems.Add('GOT_ERRORS_NONZERO') }
    $noTargets = @(& $okOf 'noTargets')
    if ($noTargets.Count -ne 1) { [void]$problems.Add("NO_TARGETS_COUNT_$($noTargets.Count)") }
    elseif ($null -ne $okAt[2] -and $null -ne $okAt[3]) { if ($noTargets[0].startByte -lt $okAt[2] -or $noTargets[0].startByte -gt $okAt[3]) { [void]$problems.Add('ORDER') } }
    if (@(& $okOf 'ciDisabled').Count -lt 1) { [void]$problems.Add('CI_DISABLED_ABSENT') }
    if (@($Log.pre.scanEvidence).Count -gt 0) { [void]$problems.Add('PRE_OPEN_EVIDENCE') }
    foreach ($key in $Log.pre.counts.Keys) {
        if ($Log.pre.counts[$key].mismatch -gt 0 -and $key -cne 'externalCommand') { [void]$problems.Add('SHAPE_MISMATCH_' + (Format-LsUpperKey ([string]$key))) }
    }
    foreach ($e in @($Log.pre.extras)) { [void]$problems.Add('PRE_' + $e.kind) }
    $c = $Log.counters
    if ($c.malformedHeaders -gt 0 -or $c.orphanBareLines -gt 0 -or $Log.openBlockAtEnd) { [void]$problems.Add('LOG_SHAPE_UNRECOGNIZED') }
    $uniq = New-Object System.Collections.ArrayList
    foreach ($p in $problems) { if (-not (Test-LrOrdinalIn ([string]$p) @($uniq))) { [void]$uniq.Add([string]$p) } }
    @{ scannedSeen = $scannedSeen; problems = @($uniq) }
}

# 규칙 로딩 장벽을 평가한다. ready 는 기다림의 종료 조건이고, clean 은 didOpen 을 보내도 되는 조건이다.
function Get-LsBarrierStatus {
    param($Log, [int]$RulesRefreshedCount, $ProbePath)
    $half = Get-LsStderrBarrierProblems $Log $ProbePath
    $problems = New-Object System.Collections.ArrayList
    foreach ($p in $half.problems) { [void]$problems.Add($p) }
    if ($RulesRefreshedCount -ne 1) { [void]$problems.Add("RULES_REFRESHED_COUNT_$RulesRefreshedCount") }
    $seen = ($RulesRefreshedCount -ge 1)
    $ready = ($seen -and $half.scannedSeen)
    [ordered]@{ rulesRefreshedSeen = $seen; scannedOpenDocumentsSeen = [bool]$half.scannedSeen; ready = $ready; clean = ($ready -and $problems.Count -eq 0); problems = $problems }
}

# ── 증거 다시 만들기(TS deriveScanEvidence) ───────────────────────────────────

function Get-LsTimeOfEnd {
    param($Chunks, [string]$Stream, $EndExclusive)
    if ($null -eq $EndExclusive) { return $null }
    foreach ($c in $Chunks) { if ($c.stream -ceq $Stream -and ($c.offset + $c.length) -ge $EndExclusive) { return $c.tMs } }
    $null
}

# Input: stdoutDecoder(New-LsFrameDecoder 상태), stderr(byte[]), chunks(목록), didOpen({tMs,stdoutOffset,stderrOffset} 또는 $null), barrierDoneAtMs, workspace, scanMs, settleMs, stdoutLen.
function Get-LsEvidence {
    param($In)
    $didOpen = $In.didOpen
    $log = Get-LsLogAnalysis $In.stderr $In.workspace $(if ($null -eq $didOpen) { $null } else { $didOpen.stderrOffset })
    $deadlineAtMs = $null; if ($null -ne $didOpen -and $null -ne $In.scanMs) { $deadlineAtMs = $didOpen.tMs + $In.scanMs }
    $settleMs = $In.settleMs
    $stdoutOffset = $null; if ($null -ne $didOpen) { $stdoutOffset = $didOpen.stdoutOffset }
    $frames = @($In.frames)
    $isPost = { param($f) ($null -ne $stdoutOffset) -and ($f.startByte -ge $stdoutOffset) }
    $diagFrames = New-Object System.Collections.ArrayList
    foreach ($f in $frames) {
        if ($f.kind -ceq 'notification' -and $f.method -is [string] -and (Test-LrOrdinalEqual $f.method $Script:LrPublishDiagnosticsMethod)) {
            $params = Get-LrMember $f.message 'params'
            $plain = (Test-LrPlainObject $params) -and -not (Test-LrArrayMember $f.message 'params')
            $shapeOk = $plain -and (Test-LrArrayMember $params 'diagnostics')
            [void]$diagFrames.Add(@{ startByte = $f.startByte; endByte = $f.endByte; shapeOk = $shapeOk })
        }
    }
    $preDiag = @($diagFrames | Where-Object { -not (& $isPost $_) })
    $postD = @($diagFrames | Where-Object { & $isPost $_ })
    $validPost = @($postD | Where-Object { $_.shapeOk })
    $malformedPost = @($postD | Where-Object { -not $_.shapeOk })
    $at = { param($stream, $end) if ($null -eq $end) { return $null }; Get-LsTimeOfEnd $In.chunks $stream $end }
    $diagComplete = $null; if ($validPost.Count -gt 0) { $diagComplete = & $at 'stdout' $validPost[0].endByte }
    $diagState = 'NONE'; if ($validPost.Count -eq 1) { $diagState = 'ONE' } elseif ($validPost.Count -gt 1) { $diagState = 'MULTIPLE' }
    $bundle = $log.post.bundle
    $logState = 'INCOMPLETE'; if ($bundle.seenAll) { if ($bundle.complete) { $logState = 'COMPLETE' } else { $logState = 'VIOLATED' } }
    $logComplete = $null; if ($null -ne $bundle.completeEndByte) { $logComplete = & $at 'stderr' $bundle.completeEndByte }
    $both = $null; if ($null -ne $diagComplete -and $null -ne $logComplete) { $both = [Math]::Max($diagComplete, $logComplete) }
    $settleStart = $null; $settleEnd = $null
    if ($null -ne $both -and $null -ne $settleMs) { $settleStart = $both; $settleEnd = $both + $settleMs }
    $late = { param($t) ($null -ne $t) -and ($null -ne $deadlineAtMs) -and ($t -gt $deadlineAtMs) }
    $phaseOf = { param($atMs) if ($null -eq $atMs -or $null -eq $settleStart -or $null -eq $settleEnd) { return 'UNKNOWN' }; if ($atMs -le $settleStart) { return 'BEFORE_BOTH' }; if ($atMs -le $settleEnd) { return 'SETTLE' }; 'AFTER_SETTLE' }
    $extras = New-Object System.Collections.ArrayList
    $addExtra = { param($source, $kind, $key, $atMs) [void]$extras.Add([ordered]@{ source = $source; kind = $kind; key = $key; atMs = $atMs; phase = (& $phaseOf $atMs) }) }
    for ($i = 1; $i -lt $validPost.Count; $i++) { & $addExtra 'stdout' 'DUPLICATE_DIAGNOSTICS' $null (& $at 'stdout' $validPost[$i].endByte) }
    foreach ($f in $malformedPost) { & $addExtra 'stdout' 'DIAGNOSTIC_FRAME_MALFORMED' $null (& $at 'stdout' $f.endByte) }
    $postFrames = @($frames | Where-Object { & $isPost $_ })
    $requestsAfter = @($postFrames | Where-Object { $_.kind -ceq 'server-request' })
    foreach ($f in $requestsAfter) { & $addExtra 'stdout' 'SERVER_REQUEST_AFTER_DID_OPEN' $f.method (& $at 'stdout' $f.endByte) }
    $progressAfter = 0
    foreach ($f in $postFrames) {
        if ($f.kind -cne 'notification') { continue }
        if (Test-LrOrdinalEqual ([string]$f.method) $Script:LrProgressMethod) { $progressAfter += 1 }
        elseif (-not (Test-LrOrdinalEqual ([string]$f.method) $Script:LrPublishDiagnosticsMethod)) { & $addExtra 'stdout' 'UNEXPECTED_NOTIFICATION_AFTER_DID_OPEN' $f.method (& $at 'stdout' $f.endByte) }
    }
    foreach ($e in (@($log.pre.extras) + @($log.post.extras))) { & $addExtra 'stderr' $e.kind $e.key (& $at 'stderr' $e.endByte) }
    [ordered]@{
        didOpen = $didOpen; barrierDoneAtMs = $In.barrierDoneAtMs; deadlineAtMs = $deadlineAtMs; log = $log
        preOpen = [ordered]@{ evidence = (@($log.pre.scanEvidence).Count -gt 0 -or $preDiag.Count -gt 0); logKeys = @($log.pre.scanEvidence); stdoutDiagnosticFrames = $preDiag.Count }
        diagnostics = [ordered]@{ state = $diagState; count = $validPost.Count; completeAtMs = $diagComplete; late = [bool](& $late $diagComplete) }
        logBundle = [ordered]@{ state = $logState; seenAll = $bundle.seenAll; complete = $bundle.complete; completeAtMs = $logComplete; completeEndByte = $bundle.completeEndByte; late = [bool](& $late $logComplete) }
        bothCompleteAtMs = $both; settle = [ordered]@{ startMs = $settleStart; endMs = $settleEnd }; extras = $extras
        postOpenServerRequests = $requestsAfter.Count; postOpenProgressNotifications = $progressAfter
    }
}

$Script:LsViolationOfExtra = @{
    DUPLICATE_LINE = 'EXTRA_SCAN'; OPEN_DOCUMENTS_SCAN = 'EXTRA_SCAN'; RULES_REFRESH = 'EXTRA_SCAN'; DUPLICATE_DIAGNOSTICS = 'EXTRA_SCAN'; WORKSPACE_SCAN = 'FORBIDDEN_SIGNAL'; FORBIDDEN_NETWORK = 'FORBIDDEN_SIGNAL'
    SERVER_REQUEST_AFTER_DID_OPEN = 'SERVER_REQUEST_AFTER_DID_OPEN'; UNEXPECTED_NOTIFICATION_AFTER_DID_OPEN = 'UNEXPECTED_NOTIFICATION'; DIAGNOSTIC_FRAME_MALFORMED = 'DIAGNOSTIC_FRAME_MALFORMED'
    ERROR_RECORD = 'ENGINE_ERROR'; ENGINE_ERRORS_NONEMPTY = 'ENGINE_ERROR'; SKIPPED_RULES_NONZERO = 'ENGINE_ERROR'; SKIPPING_RULE = 'ENGINE_ERROR'; NO_TARGETS = 'NO_TARGET'; FILE_NOT_IN_TARGETS = 'NO_TARGET'
    NO_RULES = 'NO_RULES'; RULES_NOT_LOADED = 'RULES_NOT_LOADED'; UNEXPECTED_WARNING = 'UNEXPECTED_WARNING'; ERROR_OUTPUT = 'EXTERNAL_COMMAND_OUTPUT'
}

# 실시간에 알 수 있는 위반 토큰(정렬됨; 문자열의 서수 정렬).
function Get-LsLiveViolations {
    param($Ev)
    $out = New-Object System.Collections.ArrayList
    $add = { param($t) if (-not (Test-LrOrdinalIn $t @($out))) { [void]$out.Add($t) } }
    if ($Ev.preOpen.evidence) { & $add 'PRE_OPEN_EVIDENCE' }
    foreach ($e in $Ev.extras) { if ($Script:LsViolationOfExtra.ContainsKey([string]$e.kind)) { & $add ([string]$Script:LsViolationOfExtra[[string]$e.kind]) } }
    if (@($Ev.log.post.bundle.orderViolations).Count -gt 0) { & $add 'ORDER_VIOLATION' }
    foreach ($p in $Ev.log.externalCommand.problems) { if ($p -ceq 'EXTERNAL_COMMAND_SHAPE' -or $p -ceq 'EXTERNAL_COMMAND_COUNT') { & $add $p } }
    $arr = [string[]]@($out)
    [Array]::Sort($arr, [StringComparer]::Ordinal)
    , $arr
}

# ── 결합 감시기(TS ScanLiveWatch: 증거 추적기 + stdout 추적기 + stderr 감시기) ───────────────────────────────

$Script:LsTailKeep = $Script:LrTailKeep

function New-LsLiveWatch {
    param($Config)
    @{
        config = $Config
        decoder = (New-LsFrameDecoder -MaxBody ([int]$Config.maxStdoutBytes)); stdoutTracker = (New-LsStdoutTracker)
        stderrMs = (New-Object IO.MemoryStream); stderrLen = 0; stdoutLen = 0; chunks = (New-Object System.Collections.ArrayList)
        didOpen = $null; barrierDoneAtMs = $null; broken = $false; frameError = $null; framesChecked = 0
        # stderr 감시기
        sDecoder = $Script:LrUtf8.GetDecoder(); sTail = ''; sHit = $null; initErrorLogged = $false; initializedOffset = $null; sDidOpenOffset = $null; sLog = $null; sScannedSeen = $false
        memo = $null; evMemo = $null
    }
}

function Get-LsStderrBytes { param($W) $b = $W.stderrMs.ToArray(); , $b }

# 감시기의 stderr 쪽 완성된 줄 해석(마지막 LF 까지)을 다시 만든다.
function Update-LsStderrLog {
    param($W, [bool]$IncludeTail)
    $all = $W.stderrMs.ToArray()
    $end = $all.Length
    if (-not $IncludeTail) { $end = [Array]::LastIndexOf($all, [byte]10) + 1 }
    $cut = New-Object byte[] $end
    if ($end -gt 0) { [Array]::Copy($all, 0, $cut, 0, $end) }
    $W.sLog = Get-LsLogAnalysis $cut $W.config.workspace $W.sDidOpenOffset
    $seen = $false
    foreach ($l in $W.sLog.lines) { if ($l.segment -ceq 'PRE_OPEN' -and $l.terminated -and $l.key -ceq 'scannedOpenDocuments' -and $l.shape -ceq 'OK') { $seen = $true; break } }
    $W.sScannedSeen = $seen
}

# 줄 위치(첫 바이트)가 가장 앞선 위반 하나(TS ScanStderrWatcher.violationOf).
function Get-LsStderrViolation {
    param($W, $Log)
    $found = New-Object System.Collections.ArrayList
    foreach ($l in $Log.lines) {
        $key = [string]$l.key
        if (Test-LrOrdinalIn $key $Script:LrForbiddenNetworkKeys) { [void]$found.Add(@{ at = $l.startByte; abort = [ordered]@{ condition = 'A2'; detail = $key } }) }
        elseif (Test-LrOrdinalIn $key $Script:LsWorkspaceKeys) { [void]$found.Add(@{ at = $l.startByte; abort = [ordered]@{ condition = 'A1'; detail = $key } }) }
        elseif ((Test-LrOrdinalIn $key $Script:LrPreInitializedKeys) -and ($null -eq $W.initializedOffset -or $l.startByte -lt $W.initializedOffset)) { [void]$found.Add(@{ at = $l.startByte; abort = [ordered]@{ condition = 'A1'; detail = "PRE_INITIALIZED:$key" } }) }
    }
    $seen = @{}
    # Sort-LsStable 은 `, @(...)` 로 한 겹 감싸 돌려준다. 여기서 @() 로 다시 감싸면 빈 목록에서도 반복이 1번 생기고(.shape 가 $null 이라 거짓 중단) 원소 형식도 Object[] 가 된다. 반드시 변수에 받아서 돈다.
    $sortedAttempts = Sort-LsStable @($Log.externalCommand.attempts) 'startByte'
    foreach ($a in $sortedAttempts) {
        if ($a.shape -cne 'OK') { [void]$found.Add(@{ at = $a.startByte; abort = [ordered]@{ condition = 'A1'; detail = "EXTERNAL_COMMAND_SHAPE:$($a.shape)" } }); continue }
        $slot = "$($a.segment):$($a.window)"
        $n = 1; if ($seen.ContainsKey($slot)) { $n = $seen[$slot] + 1 }
        $seen[$slot] = $n
        if ($a.window -ceq 'OTHER' -or $n -gt 1) { [void]$found.Add(@{ at = $a.startByte; abort = [ordered]@{ condition = 'A1'; detail = 'EXTERNAL_COMMAND_COUNT' } }) }
    }
    if ($found.Count -eq 0) { return $null }
    $sorted = Sort-LsStable $found 'at'
    $sorted[0].abort
}

function Register-LsStderrHit {
    param($W, $Found)
    if ($null -ne $Found -and $null -eq $W.sHit) { $W.sHit = $Found; return $Found }
    $null
}

function Initialize-LsStderrLog {
    param($W)
    if ($null -eq $W.sLog) { $W.sLog = Get-LsLogAnalysis (New-Object byte[] 0) $W.config.workspace $null }
}

# 새 stdout 바이트. 돌려주는 값: abort, frameError, messages(이번 청크로 완성된 메시지 수), initArrived.
function Add-LsStdout {
    param($W, [byte[]]$Bytes, [double]$TMs)
    $r = [ordered]@{ abort = $null; frameError = $null; messages = 0; initArrived = $false }
    if ($Bytes.Length -eq 0) { return $r }
    [void]$W.chunks.Add(@{ stream = 'stdout'; offset = $W.stdoutLen; length = $Bytes.Length; tMs = $TMs })
    $W.stdoutLen += $Bytes.Length
    if (-not $W.broken) {
        $hadInit = ($null -ne $W.stdoutTracker.analysis.initMessage)
        $first = $W.decoder.frames.Count
        [void](Add-LsFrameBytes $W.decoder $Bytes)
        for ($i = $first; $i -lt $W.decoder.frames.Count; $i++) {
            $r.messages += 1; $W.framesChecked += 1
            $hit = Invoke-LsStdoutTracker $W.stdoutTracker $W.decoder.frames[$i].message
            if ($null -eq $r.abort) { $r.abort = $hit }
        }
        $r.initArrived = (-not $hadInit -and $null -ne $W.stdoutTracker.analysis.initMessage)
        if ($W.decoder.failed) { $W.broken = $true; $W.frameError = $W.decoder.error; $r.frameError = $W.decoder.error }
        if ($r.messages -gt 0) { $W.memo = $null; $W.evMemo = $null }
    }
    $r
}

function Complete-LsStdout {
    param($W)
    if ($W.broken) { return $null }
    $e = Complete-LsFrameDecoder $W.decoder
    if ($null -ne $e) { $W.broken = $true; $W.frameError = $e; return $e }
    $null
}

# 새 stderr 바이트. 이번에 처음 찾은 중단 사유를 돌려준다(이미 찾았다면 $null).
function Add-LsStderr {
    param($W, [byte[]]$Bytes, [double]$TMs)
    if ($Bytes.Length -eq 0) { return $null }
    Initialize-LsStderrLog $W
    [void]$W.chunks.Add(@{ stream = 'stderr'; offset = $W.stderrLen; length = $Bytes.Length; tMs = $TMs })
    $W.stderrMs.Write($Bytes, 0, $Bytes.Length)
    $W.stderrLen += $Bytes.Length
    $chars = New-Object char[] ($Bytes.Length + 4)
    $n = $W.sDecoder.GetChars($Bytes, 0, $Bytes.Length, $chars, 0, $false)
    $text = ''; if ($n -gt 0) { $text = New-Object string ($chars, 0, $n) }
    $window = ConvertTo-LrJsLower ($W.sTail + $text)
    if ($window.Contains($Script:LspMinInitErrorLogPattern)) { $W.initErrorLogged = $true }
    $W.sTail = $window.Substring([Math]::Max(0, $window.Length - $Script:LsTailKeep))
    $found = $null
    if ([Array]::IndexOf($Bytes, [byte]10) -ge 0) {
        $W.memo = $null; $W.evMemo = $null
        Update-LsStderrLog $W $false
        $found = Get-LsStderrViolation $W $W.sLog
    }
    if ($null -eq $found) {
        foreach ($pattern in $Script:LspMinNetworkPatterns) { if ($window.Contains($pattern)) { $found = [ordered]@{ condition = 'A2'; detail = $pattern }; break } }
    }
    Register-LsStderrHit $W $found
}

function Complete-LsStderr {
    param($W)
    Initialize-LsStderrLog $W
    Update-LsStderrLog $W $true
    Register-LsStderrHit $W (Get-LsStderrViolation $W $W.sLog)
}

function Set-LsInitializedSent {
    param($W)
    $W.stdoutTracker.initializedSent = $true
    if ($null -eq $W.initializedOffset) { $W.initializedOffset = $W.stderrLen }
}
function Set-LsBarrierDone { param($W, [double]$TMs) $W.barrierDoneAtMs = $TMs; $W.memo = $null; $W.evMemo = $null }

# didOpen 을 쓰기 직전에 부른다: 두 스트림에서 이미 읽은 바이트 수가 사전/사후의 경계가 된다(처음 한 번만 기록).
function Set-LsDidOpenSent {
    param($W, [double]$TMs)
    if ($null -ne $W.didOpen) { return }
    $W.didOpen = [ordered]@{ tMs = $TMs; stdoutOffset = $W.stdoutLen; stderrOffset = $W.stderrLen }
    $W.stdoutTracker.didOpenSent = $true
    if ($null -eq $W.sDidOpenOffset) { $W.sDidOpenOffset = $W.stderrLen; Initialize-LsStderrLog $W; Update-LsStderrLog $W $false }
    $W.memo = $null; $W.evMemo = $null
}

function Get-LsWatchEvidence {
    param($W)
    if ($null -eq $W.evMemo) {
        $W.evMemo = Get-LsEvidence ([ordered]@{
                frames = $W.decoder.frames; stderr = [byte[]]$W.stderrMs.ToArray(); chunks = $W.chunks; didOpen = $W.didOpen; barrierDoneAtMs = $W.barrierDoneAtMs
                workspace = $W.config.workspace; scanMs = $W.config.scanMs; settleMs = $W.config.settleMs
            })
    }
    $W.evMemo
}

# 장벽의 양쪽 절반이 모두 왔다 — 기다림의 종료 조건(싼 값).
function Test-LsBarrierReady {
    param($W)
    Initialize-LsStderrLog $W
    ($W.stdoutTracker.analysis.rulesRefreshedCount -ge 1) -and [bool]$W.sScannedSeen
}

function Get-LsWatchBarrier {
    param($W)
    Initialize-LsStderrLog $W
    $status = Get-LsBarrierStatus $W.sLog ([int]$W.stdoutTracker.analysis.rulesRefreshedCount) $W.config.probePath
    if ($W.stdoutTracker.preOpenDiagnostics -gt 0 -and -not (Test-LrOrdinalIn 'PRE_OPEN_EVIDENCE' @($status.problems))) { [void]$status.problems.Add('PRE_OPEN_EVIDENCE'); $status.clean = $false }
    $status
}

# 지금까지의 증거 보기. NowMs 를 주면 마감 만료·settle 만료를 그 시각으로 따진다.
function Get-LsWatchSnapshot {
    param($W, $NowMs = $null)
    if ($null -eq $W.memo) {
        $ev = Get-LsWatchEvidence $W
        $W.memo = [ordered]@{
            preOpenEvidence = $ev.preOpen.evidence; diagnosticsState = $ev.diagnostics.state; diagnosticsCompleteAtMs = $ev.diagnostics.completeAtMs
            logState = $ev.logBundle.state; logCompleteAtMs = $ev.logBundle.completeAtMs; bothCompleteAtMs = $ev.bothCompleteAtMs
            deadlineAtMs = $ev.deadlineAtMs; settleStartMs = $ev.settle.startMs; settleEndMs = $ev.settle.endMs; violations = (Get-LsLiveViolations $ev)
        }
    }
    $b = $W.memo
    $known = ($null -ne $NowMs)
    $s = [ordered]@{}
    foreach ($k in $b.Keys) { $s[$k] = $b[$k] }
    $s['deadlineExpired'] = [bool]($known -and $null -ne $b.deadlineAtMs -and $NowMs -gt $b.deadlineAtMs -and $null -eq $b.bothCompleteAtMs)
    $s['settleElapsed'] = [bool]($known -and $null -ne $b.settleEndMs -and $NowMs -ge $b.settleEndMs)
    $s['rulesRefreshedSeen'] = ($W.stdoutTracker.analysis.rulesRefreshedCount -ge 1)
    Initialize-LsStderrLog $W
    $s['scannedOpenDocumentsSeen'] = [bool]$W.sScannedSeen
    $s
}

# 사실(runner result 의 liveView)에 싣는 마지막 보기.
function Get-LsLiveView {
    param($W)
    $b = Get-LsWatchSnapshot $W $null
    [ordered]@{ preOpenEvidence = $b.preOpenEvidence; diagnosticsState = $b.diagnosticsState; diagnosticsCompleteAtMs = $b.diagnosticsCompleteAtMs; logState = $b.logState; logCompleteAtMs = $b.logCompleteAtMs; bothCompleteAtMs = $b.bothCompleteAtMs }
}

# ── JSON 대본(TS runScanWatchScript)과 골든 대조용 변환 ─────────────────────────────

function ConvertFrom-LsHex {
    param([string]$Hex)
    if ($Hex.Length % 2 -ne 0 -or [regex]::IsMatch($Hex, '[^0-9a-fA-F]')) { throw 'hex 조각이 올바르지 않다' }
    $out = New-Object byte[] ($Hex.Length / 2)
    for ($i = 0; $i -lt $out.Length; $i++) { $out[$i] = [Convert]::ToByte($Hex.Substring($i * 2, 2), 16) }
    , $out
}

function ConvertTo-LsSnapshotJson {
    param($W)
    $s = Get-LsWatchSnapshot $W $null
    [ordered]@{
        preOpenEvidence = $s.preOpenEvidence; diagnosticsState = $s.diagnosticsState; diagnosticsCompleteAtMs = $s.diagnosticsCompleteAtMs; logState = $s.logState; logCompleteAtMs = $s.logCompleteAtMs
        bothCompleteAtMs = $s.bothCompleteAtMs; deadlineAtMs = $s.deadlineAtMs; settleStartMs = $s.settleStartMs; settleEndMs = $s.settleEndMs; violations = @($s.violations)
    }
}

# 대본(config + events)을 순서대로 먹이고 단계마다의 보기를 돌려준다. 출력은 TS 의 ScanWatchTranscript 와 같은 모양이다.
function Invoke-LsWatchScript {
    param($ScriptObj)
    $cfg = $ScriptObj.config
    $config = [ordered]@{
        workspace = $(if ($null -eq $cfg.workspace) { $null } else { [string]$cfg.workspace }); expectedTargetUri = $cfg.expectedTargetUri; probePath = $(if ($null -eq $cfg.probePath) { $null } else { [string]$cfg.probePath })
        scanMs = [double]$cfg.scanMs; settleMs = [double]$cfg.settleMs; maxStdoutBytes = [int]$cfg.maxStdoutBytes
    }
    $w = New-LsLiveWatch $config
    $steps = New-Object System.Collections.ArrayList
    $i = 0
    foreach ($ev in @($ScriptObj.events)) {
        $abort = $null; $frameError = $null; $initArrived = $false
        switch -CaseSensitive ([string]$ev.op) {
            'stdout' { $r = Add-LsStdout $w (ConvertFrom-LsHex ([string]$ev.hex)) ([double]$ev.tMs); $abort = $r.abort; $frameError = $r.frameError; $initArrived = $r.initArrived }
            'stderr' { $abort = Add-LsStderr $w (ConvertFrom-LsHex ([string]$ev.hex)) ([double]$ev.tMs) }
            'initializedSent' { Set-LsInitializedSent $w }
            'barrierDone' { Set-LsBarrierDone $w ([double]$ev.tMs) }
            'didOpenSent' { Set-LsDidOpenSent $w ([double]$ev.tMs) }
            'stdoutEnd' { $frameError = Complete-LsStdout $w }
            'stderrEnd' { $abort = Complete-LsStderr $w }
        }
        $b = Get-LsWatchBarrier $w
        $fe = $null; if ($null -ne $frameError) { $fe = [ordered]@{ kind = $frameError.kind; detail = $frameError.detail; atByte = $frameError.atByte } }
        [void]$steps.Add([ordered]@{
                i = $i; op = [string]$ev.op; abort = $abort; frameError = $fe; initArrived = $initArrived
                barrier = [ordered]@{ rulesRefreshedSeen = $b.rulesRefreshedSeen; scannedOpenDocumentsSeen = $b.scannedOpenDocumentsSeen; ready = $b.ready; clean = $b.clean; problems = @($b.problems) }
                snapshot = (ConvertTo-LsSnapshotJson $w)
            })
        $i++
    }
    $w.evMemo = $null      # TS 의 tracker.evidence() 는 마지막 먹이기 뒤에 새로 만든다(스냅숏 메모와 따로)
    $evd = Get-LsWatchEvidence $w
    $extras = New-Object System.Collections.ArrayList
    foreach ($e in $evd.extras) { [void]$extras.Add([ordered]@{ source = $e.source; kind = $e.kind; key = $e.key; atMs = $e.atMs; phase = $e.phase }) }
    [ordered]@{ steps = @($steps); final = [ordered]@{ snapshot = (ConvertTo-LsSnapshotJson $w); extras = @($extras); stdoutBytes = $w.stdoutLen; stderrBytes = $w.stderrLen; initErrorLogged = [bool]$w.initErrorLogged } }
}
