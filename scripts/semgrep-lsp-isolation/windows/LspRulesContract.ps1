# LSP-RULES-1 규칙 로딩 관측의 계약(PowerShell 이식본). scripts/semgrep-lsp/lsp-rules.ts 와 rules-log.ts 의 상수와 순수 규칙을 그대로 옮긴 것이다.
# 같은 입력에서 TS 와 같은 결과를 내는지는 tests/lsp-rules-parity.json(TS 가 만든 골든)과 tests/Test-LspRulesRunner.ps1 이 대조해서 확인한다.
# 이 계약은 하네스가 정한 것이며 실제 Semgrep 으로 확인한 형식이 아니다. 실제 출력을 보고 계약을 고치지 않는다.
#
# 이 파일은 부작용이 없다: 불러와도 아무것도 실행하지 않고, 파일·프로세스·네트워크·환경에 닿지 않는다.
# LspMinContract.ps1 의 상수와 함수(환경, 초기화 응답 핵심 규칙, 프레임 만들기, 메시지 분류에 쓰는 멤버 읽기)를 읽기 전용으로 다시 쓴다. 그쪽은 바꾸지 않았다.
# `initialized` 는 이 계약에서 정확히 한 번, 초기화 응답이 완전히 유효하고 서버 버전이 핀과 같을 때만 보낸다(그 판단은 러너가 한다). SEMGREP_LOG_SRCS 는 어디에도 없다(소유자 결정 D5).
#
# 판정은 이 파일의 일이 아니다. 러너는 흐름만 정하고, 판정은 관리자 쪽 TS 모듈이 원문 바이트를 다시 풀어서 한다.
# JavaScript 와 .NET 정규식·문자열 규칙의 차이를 메우려고 일부러 풀어 쓴 곳이 있다(공백 집합, `.` 의 범위, 대소문자 접기, 안전 정수). 각 자리에 이유를 적었다.

. (Join-Path $PSScriptRoot 'LspMinContract.ps1')

$Script:LrSchema = 'semgrep-lsp-rules-observation/1'
$Script:LrArgs = @($Script:LspMinArgs)
$Script:LrInitId = 'lsp-rules-init-1'
$Script:LrShutdownId = 'lsp-rules-shutdown-1'
# 프로브 규칙(소유자 결정 D4): 바이트가 계약이다.
$Script:LrProbeFile = 'lsp-rules-1-probe.yaml'
$Script:LrProbeSha256 = 'd5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145'
$Script:LrProbeBytes = 233
# 보낼 수 있는 메시지는 이 넷뿐이고, 이 순서로만 보낸다. initialized 는 정확히 한 번이다.
$Script:LrSendOrder = @('initialize', 'initialized', 'shutdown', 'exit')
# 한도: LSP-MIN-1 의 상한에 장벽 한도(rulesMs 60초)와 장벽 뒤 감시(settleMs 2초)를 더했다(소유자 결정 D6). 요청은 이 값 이하로만 줄일 수 있다.
$Script:LrLimits = [ordered]@{}
foreach ($lrKey in $Script:LspMinLimits.Keys) { $Script:LrLimits[$lrKey] = $Script:LspMinLimits[$lrKey] }
$Script:LrLimits['rulesMs'] = 60000
$Script:LrLimits['settleMs'] = 2000

# 서버가 initialized 뒤 보내는 진행 요청은 이것 하나뿐이고 최대 2건이다. 응답하지 않는다.
$Script:LrProgressCreateMethod = 'window/workDoneProgress/create'
$Script:LrMaxProgressCreate = 2
$Script:LrRulesRefreshedMethod = 'semgrep/rulesRefreshed'
$Script:LrProgressMethod = '$/progress'
$Script:LrPublishDiagnosticsMethod = 'textDocument/publishDiagnostics'

# 맨줄(App 수준)이어야 하는 필요한 신호 네 개(순서가 이 배열의 순서).
$Script:LrRequiredBareKeys = @('refreshingRules', 'rulesRefreshed', 'scanningOpenDocuments', 'scannedOpenDocuments')
$Script:LrForbiddenScanKeys = @('scanningWorkspace', 'scannedWorkspace', 'scanningWorkspaceComplete', 'fullScan', 'scanningSingleFile', 'runningRules', 'engineErrors', 'skippedRules', 'scannedFiles', 'foundMatches')
$Script:LrForbiddenNetworkKeys = @('usingAuto', 'download', 'tokenFound', 'settingsFileFound')
$Script:LrPreInitializedKeys = @('refreshingRules', 'rulesRefreshed', 'scanningOpenDocuments', 'scannedOpenDocuments')

# 경로에 들어 있으면 서버 로그를 오염시킬 수 있는 문구(소문자 비교). --debug 가 경로를 로그에 찍으므로 시작 전에 거절한다.
$Script:LrPathForbiddenFragments = @('download', 'registry', 'using auto', 'api token', 'settings file', 'refreshing rules', 'rules refreshed', 'scanning', 'scanned', 'running semgrep', 'semgrep errors', 'no targets', 'no rules', 'rules not loaded', $Script:LspMinInitErrorLogPattern)

# ── JavaScript 호환 문자열 도구 ─────────────────────────────────────────────

$Script:LrUtf8 = New-Object Text.UTF8Encoding($false)
# JS String.prototype.trim 이 걷어내는 공백 집합(줄 끝 문자와 U+FEFF 를 포함, U+0085 는 제외). .NET 의 Trim() 기본값과 다르다.
$Script:LrJsWhitespace = [char[]]((9, 10, 11, 12, 13, 32, 160, 5760) + (8192..8202) + (8232, 8233, 8239, 8287, 12288, 65279))
# JS 정규식 \s 와 같은 집합(문자 클래스 안에 쓴다).
$Script:LrWsClass = '\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'

function Get-LrJsTrim { param([string]$Text) $Text.Trim($Script:LrJsWhitespace) }
function Get-LrJsTrimEnd { param([string]$Text) $Text.TrimEnd($Script:LrJsWhitespace) }

# 서수(ordinal) 비교. PowerShell 의 -ceq/-cne/-ccontains/-cnotcontains 는 대소문자만 구별할 뿐 서수 비교가 아니라 문화권 비교라서, 소프트 하이픈(U+00AD)이나 NUL 같은
# "무시되는 문자"가 끼어 있어도 같다고 본다(예: "ab" -ceq ("a"+[char]0x00AD+"b") 는 5.1 과 7 에서 모두 True). TS 의 ===·Set.has 는 서수 비교다.
# 서버·요청 파일·결과 파일·파일 시스템에서 온 문자열을 비교할 때는 -ceq 대신 이 함수를 쓴다. 둘 다 문자열이어야 하고, 아니면 같지 않다($null 끼리도 같다고 하지 않는다).
function Test-LrOrdinalEqual {
    param($A, $B)
    if ($A -isnot [string] -or $B -isnot [string]) { return $false }
    [string]::Equals($A, $B, [StringComparison]::Ordinal)
}
# 대소문자를 무시하는 서수 비교(Windows 파일 이름용). 문화권 비교가 아니다.
function Test-LrOrdinalEqualCI {
    param($A, $B)
    if ($A -isnot [string] -or $B -isnot [string]) { return $false }
    [string]::Equals($A, $B, [StringComparison]::OrdinalIgnoreCase)
}
# 목록 안에 서수로 같은 문자열이 있는가(-ccontains/-cnotcontains 대신). 목록 원소 중 문자열이 아닌 것은 건너뛴다.
function Test-LrOrdinalIn {
    param($Value, $List)
    if ($Value -isnot [string]) { return $false }
    foreach ($item in @($List)) {
        if ($item -is [string] -and [string]::Equals($Value, $item, [StringComparison]::Ordinal)) { return $true }
    }
    $false
}

# JS toLowerCase 중 이 계약의 ASCII 문구 비교에 영향을 주는 것만 옮긴다: A-Z → a-z, U+0130 → "i"+U+0307, U+212A(켈빈 기호) → "k". 그 밖의 비ASCII 는 그대로 둔다.
# .NET 의 ToLowerInvariant 는 U+0130 을 "i" 하나로 바꿔서 "regİstry" 가 "registry" 로 보이게 되므로 쓰지 않는다.
function ConvertTo-LrJsLower {
    param([string]$Text)
    if (-not [regex]::IsMatch($Text, '[^\x00-\x7f]')) { return $Text.ToLowerInvariant() }
    $sb = New-Object Text.StringBuilder
    foreach ($ch in $Text.ToCharArray()) {
        $c = [int]$ch
        if ($c -ge 65 -and $c -le 90) { [void]$sb.Append([char]($c + 32)) }
        elseif ($c -eq 0x130) { [void]$sb.Append('i'); [void]$sb.Append([char]0x307) }
        elseif ($c -eq 0x212A) { [void]$sb.Append('k') }
        else { [void]$sb.Append($ch) }
    }
    $sb.ToString()
}

# ASCII 대문자만 소문자로. JS 의 /i(유니코드 플래그 없음)가 ASCII 패턴에 대해 하는 일과 같다(ſ 같은 비ASCII 문자가 ASCII 로 접히지 않는다).
function ConvertTo-LrAsciiLower {
    param([string]$Text)
    if (-not [regex]::IsMatch($Text, '[A-Z]')) { return $Text }
    [regex]::Replace($Text, '[A-Z]', { param($m) $m.Value.ToLowerInvariant() })
}

function Test-LrAsciiPrefixCI {
    param([string]$Text, [string]$LowerPrefix)
    if ($Text.Length -lt $LowerPrefix.Length) { return $false }
    Test-LrOrdinalEqual (ConvertTo-LrAsciiLower $Text.Substring(0, $LowerPrefix.Length)) $LowerPrefix
}

# 사유 토큰용: 허용 문자 밖은 ?, 80자까지(TS tokenOf).
function Format-LrToken {
    param([string]$Text)
    $t = [regex]::Replace($Text, '[^A-Za-z0-9_.:/$ -]', '?')
    if ($t.Length -gt 80) { $t = $t.Substring(0, 80) }
    $t
}

# 멤버 읽기: 해시테이블(IDictionary)과 ConvertFrom-Json 객체를 모두 받고, 이름은 **서수로, 대소문자 그대로** 비교한다
# (LspMinContract.ps1 의 Test-LmExactMember 는 -ceq 라 소프트 하이픈·NUL 이 낀 이름을 같다고 보므로 이 계약에서는 쓰지 않는다).
function Test-LrMember {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $false }
    if ($Object -is [System.Collections.IDictionary]) {
        foreach ($k in $Object.Keys) { if (Test-LrOrdinalEqual ([string]$k) $Name) { return $true } }
        return $false
    }
    if ($null -eq $Object.PSObject) { return $false }
    foreach ($p in $Object.PSObject.Properties) { if (Test-LrOrdinalEqual ([string]$p.Name) $Name) { return $true } }
    $false
}
function Get-LrMember {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) {
        foreach ($k in $Object.Keys) { if (Test-LrOrdinalEqual ([string]$k) $Name) { return $Object[$k] } }
        return $null
    }
    if ($null -eq $Object.PSObject) { return $null }
    foreach ($p in $Object.PSObject.Properties) { if (Test-LrOrdinalEqual ([string]$p.Name) $Name) { return $p.Value } }
    $null
}
function Get-LrMemberNames {
    param($Object)
    if ($null -eq $Object) { return , @() }
    if ($Object -is [System.Collections.IDictionary]) { return , @($Object.Keys | ForEach-Object { [string]$_ }) }
    if ($null -eq $Object.PSObject) { return , @() }
    , @($Object.PSObject.Properties | ForEach-Object { $_.Name })
}
# 멤버 값이 배열인가(함수 반환은 배열을 풀어 버려서 원소 하나짜리 배열이 객체로 보이는 것을 막는다).
function Test-LrArrayMember {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $false }
    if ($Object -is [System.Collections.IDictionary]) {
        foreach ($k in $Object.Keys) { if (Test-LrOrdinalEqual ([string]$k) $Name) { return ($Object[$k] -is [System.Array]) } }
        return $false
    }
    if ($null -eq $Object.PSObject) { return $false }
    foreach ($p in $Object.PSObject.Properties) { if (Test-LrOrdinalEqual ([string]$p.Name) $Name) { return ($p.Value -is [System.Array]) } }
    $false
}
# TS isPlain: 객체이고 null 도 배열도 아니다.
function Test-LrPlainObject {
    param($Value)
    if ($null -eq $Value) { return $false }
    if ($Value -is [System.Collections.IDictionary]) { return $true }
    if ($Value -is [string] -or $Value -is [System.Collections.IEnumerable] -or $Value -is [ValueType]) { return $false }
    $Value -is [pscustomobject]
}
function Test-LrNumber {
    param($Value)
    if ($null -eq $Value) { return $false }
    ($Value -is [int]) -or ($Value -is [long]) -or ($Value -is [double]) -or ($Value -is [decimal]) -or ($Value -is [single]) -or ($Value.GetType().FullName -ceq 'System.Numerics.BigInteger')
}

# 서버 메시지의 분류. TS classifyServerMessage 와 같다(키 이름은 대소문자 그대로).
function Get-LrMessageKind {
    param($Message)
    $method = Get-LrMember $Message 'method'
    $id = Get-LrMember $Message 'id'
    $hasMethod = $method -is [string]
    $hasId = $null -ne $id
    if ($hasMethod -and $hasId) { return 'server-request' }
    if ($hasMethod) { return 'notification' }
    if ($hasId) { return 'response' }
    'invalid'
}

# ── 경로 배치와 감시 폴더 ───────────────────────────────────────────────────

# TS rulesLayout 과 같다. 규칙 폴더 이름이 LSP-MIN-1(rules-empty)과 다르다.
function Get-LrLayout {
    param([Parameter(Mandatory)][string]$Work)
    $state = Join-LmPath $Work 'lsp-state'
    [ordered]@{
        work = $Work
        workspace = (Join-LmPath $Work 'ws')
        stateDir = $state
        rulesDir = (Join-LmPath $state 'rules-probe')
        homeDir = (Join-LmPath $state 'home')
        tmpDir = (Join-LmPath $state 'tmp')
    }
}

function Get-LrRootPath {
    param($Layout, [Parameter(Mandatory)][string]$Role)
    Get-LspMinRootPath $Layout $Role
}

function Get-LrProbePath {
    param($Layout)
    Join-LmPath ([string](Get-LmProp $Layout 'rulesDir')) $Script:LrProbeFile
}

# 감시 폴더 안의 한 파일이 금지된 변경인가(A5′). 작업 영역은 비어 있어야 하고, 규칙 폴더에는 프로브 한 개(이름 일치, 대소문자 무시)만, 홈은 지문 폴더 아래만.
function Test-LrRootViolation {
    param([Parameter(Mandatory)][string]$Role, [Parameter(Mandatory)][AllowEmptyString()][string]$RelativePath)
    $n = $RelativePath.Replace('\', '/')
    if ($Role -ceq 'HOME_DIR') { return (-not $n.StartsWith($Script:LspMinHomeExpectedPrefix, [StringComparison]::Ordinal)) }
    if ($Role -ceq 'RULES_DIR') { return (-not (Test-LrOrdinalEqual (ConvertTo-LrJsLower $n) $Script:LrProbeFile)) }
    $true
}

# 이 경계에서만 요구하는 형태: 드라이브 문자로 시작하는 절대 경로. UNC 와 `/` 로 시작하는 경로, 상대 경로는 거절한다.
function Test-LrDriveAbsolute {
    param($Path)
    ($Path -is [string]) -and [regex]::IsMatch($Path, '^[A-Za-z]:[\\/]')
}

function Find-LrForbiddenFragment {
    param([string]$Path)
    $lower = ConvertTo-LrJsLower $Path
    foreach ($f in $Script:LrPathForbiddenFragments) { if ($lower.Contains($f)) { return $f } }
    $null
}

# 레지스트리·앱·내려받기로 풀리는 규칙 출처 문자열인가(TS isNetworkRuleSource; 대소문자 무시 = ASCII 접기).
function Test-LrNetworkRuleSource {
    param([string]$Entry)
    $e = ConvertTo-LrAsciiLower $Entry
    [regex]::IsMatch($e, '^(auto|r2c|policy|supply-chain|hooks)\z') -or [regex]::IsMatch($e, '^([rps]/|https?://)')
}

# 한도: 알 수 없는 이름·0 이하·비수·기본값 초과는 거절 사유. 기본값 이하만 받는다(TS resolveRulesLimits). Over: $null, 해시테이블, 또는 ConvertFrom-Json 객체.
function Resolve-LrLimits {
    param($Over)
    $limits = [ordered]@{}
    foreach ($k in $Script:LrLimits.Keys) { $limits[$k] = $Script:LrLimits[$k] }
    $problems = New-Object System.Collections.ArrayList
    if ($null -ne $Over) {
        foreach ($name in (Get-LrMemberNames $Over)) {
            $known = $null
            foreach ($k in $Script:LrLimits.Keys) { if (Test-LrOrdinalEqual ([string]$k) ([string]$name)) { $known = $k } }
            $value = Get-LrMember $Over $name
            if ($null -eq $known) { [void]$problems.Add('LIMIT_UNKNOWN:' + ($name -replace '[^A-Za-z0-9_]', '?')) }
            elseif (-not (Test-LrNumber $value) -or [double]::IsNaN([double]$value) -or [double]::IsInfinity([double]$value) -or [double]$value -le 0) { [void]$problems.Add("LIMIT_INVALID:$known") }
            elseif ([double]$value -gt [double]$Script:LrLimits[$known]) { [void]$problems.Add("LIMIT_ABOVE_CAP:$known") }
            else { $limits[$known] = $value }
        }
    }
    [ordered]@{ limits = $limits; problems = @($problems) }
}

# ── 보내는 메시지 ───────────────────────────────────────────────────────────

# initialize: 내용은 LSP-MIN-1 과 같고(규칙은 명시한 로컬 폴더 하나, 메트릭은 끈다) id 만 다르다. 규칙 폴더는 배치에서 온다.
function New-LrInitializeMessage {
    param([Parameter(Mandatory)]$Layout)
    $m = New-LspMinInitializeMessage -Layout $Layout
    $m['id'] = $Script:LrInitId
    $m
}
function New-LrInitializedMessage { [ordered]@{ jsonrpc = '2.0'; method = 'initialized'; params = [ordered]@{} } }
function New-LrShutdownMessage { [ordered]@{ jsonrpc = '2.0'; id = $Script:LrShutdownId; method = 'shutdown' } }
function New-LrExitMessage { [ordered]@{ jsonrpc = '2.0'; method = 'exit' } }

function Test-LrEmptyObject {
    param($Value)
    if ($null -eq $Value) { return $false }
    if ($Value -is [System.Collections.IDictionary]) { return ($Value.Count -eq 0) }
    if (-not (Test-LrPlainObject $Value)) { return $false }
    @($Value.PSObject.Properties).Count -eq 0
}

# 쓰기 직전의 마지막 방어선: 이 넷 말고는 stdin 에 쓰지 않는다. 어긋나면 던진다(프로그래머 오류). TS assertAllowedRulesOutbound 와 같다.
#  · initialized 는 params 가 정확히 {} 이고 id 가 없다. 문서 알림·작업 영역 변경·semgrep/scanWorkspace·semgrep/refreshRules·debug/echo 는 메서드 불일치로 막힌다.
#  · 서버 요청에 대한 응답(id 만 있고 method 가 없는 메시지)도 막힌다.
function Assert-LrOutbound {
    param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)]$Message)
    if (-not (Test-LrOrdinalIn $Label $Script:LrSendOrder)) { throw "허용되지 않은 송신: $Label" }
    $method = Get-LrMember $Message 'method'
    if ($method -isnot [string] -or -not (Test-LrOrdinalEqual $method $Label)) { throw "허용되지 않은 송신: $Label" }
    $hasId = Test-LrMember $Message 'id'
    $wantsId = ($Label -ceq 'initialize' -or $Label -ceq 'shutdown')
    if ($hasId -ne $wantsId) { throw "허용되지 않은 송신 형태: $Label" }
    if ($Label -ceq 'initialized' -and -not ((Test-LrMember $Message 'params') -and (Test-LrEmptyObject (Get-LrMember $Message 'params')))) { throw '허용되지 않은 송신 형태: initialized의 params' }
    if (($Label -ceq 'shutdown' -or $Label -ceq 'exit') -and (Test-LrMember $Message 'params')) { throw "허용되지 않은 송신 형태: ${Label}의 params" }
}

# ── 서버 stdout 분석 ────────────────────────────────────────────────────────

# 서버 요청이 허용된 진행 요청의 올바른 모양인가: { jsonrpc:"2.0", id: 문자열|숫자, method:"window/workDoneProgress/create", params:{ token: 문자열|숫자 } } 뿐.
function Test-LrValidProgressCreate {
    param($Message)
    if (-not (Test-LrPlainObject $Message)) { return $false }
    $jr = Get-LrMember $Message 'jsonrpc'
    $method = Get-LrMember $Message 'method'
    if ($jr -isnot [string] -or -not (Test-LrOrdinalEqual $jr '2.0') -or $method -isnot [string] -or -not (Test-LrOrdinalEqual $method $Script:LrProgressCreateMethod)) { return $false }
    $id = Get-LrMember $Message 'id'
    if ($id -isnot [string] -and -not (Test-LrNumber $id)) { return $false }
    foreach ($key in (Get-LrMemberNames $Message)) {
        if (-not (Test-LrOrdinalIn $key @('jsonrpc', 'id', 'method', 'params'))) { return $false }
    }
    $params = Get-LrMember $Message 'params'
    if ((Test-LrArrayMember $Message 'params') -or -not (Test-LrPlainObject $params)) { return $false }
    $keys = Get-LrMemberNames $params
    if (@($keys).Count -ne 1 -or -not (Test-LrOrdinalEqual ([string]$keys[0]) 'token')) { return $false }
    $token = Get-LrMember $params 'token'
    ($token -is [string]) -or (Test-LrNumber $token)
}

function New-LrStdoutAnalysis {
    @{
        frames = 0; initMessage = $null; initDuplicate = $false; shutdownResponseSeen = $false; unmatchedResponses = 0
        rulesRefreshedCount = 0; progressNotifications = 0; diagnosticsCount = 0
        otherNotifications = (New-Object 'System.Collections.Generic.Dictionary[string,int]')
        errorNotifications = 0; serverRequests = (New-Object System.Collections.ArrayList); serverRequestCount = 0; messagesWithoutMethodOrId = 0
    }
}

# 메시지 하나를 분석 결과에 더한다(TS absorbStdoutMessage).
function Add-LrStdoutMessage {
    param($A, $Message)
    $A.frames += 1
    $kind = Get-LrMessageKind $Message
    if ($kind -ceq 'response') {
        $id = Get-LrMember $Message 'id'
        if ($id -is [string] -and (Test-LrOrdinalEqual $id $Script:LrInitId)) {
            if ($null -eq $A.initMessage) { $A.initMessage = $Message } else { $A.initDuplicate = $true }
        } elseif ($id -is [string] -and (Test-LrOrdinalEqual $id $Script:LrShutdownId)) { $A.shutdownResponseSeen = $true }
        else { $A.unmatchedResponses += 1 }
    } elseif ($kind -ceq 'server-request') {
        $A.serverRequestCount += 1
        if ($A.serverRequests.Count -lt 20) {
            [void]$A.serverRequests.Add(@{ method = (Format-LrToken ([string](Get-LrMember $Message 'method'))); allowed = [bool](Test-LrValidProgressCreate $Message) })
        }
    } elseif ($kind -ceq 'notification') {
        $method = [string](Get-LrMember $Message 'method')
        if (Test-LrOrdinalEqual $method $Script:LrRulesRefreshedMethod) { $A.rulesRefreshedCount += 1 }
        elseif (Test-LrOrdinalEqual $method $Script:LrProgressMethod) { $A.progressNotifications += 1 }
        elseif (Test-LrOrdinalEqual $method $Script:LrPublishDiagnosticsMethod) { $A.diagnosticsCount += 1 }
        else {
            $token = Format-LrToken $method
            if ($A.otherNotifications.Count -lt 50 -or $A.otherNotifications.ContainsKey($token)) {
                $prev = 0; [void]$A.otherNotifications.TryGetValue($token, [ref]$prev)
                $A.otherNotifications[$token] = $prev + 1
            }
            $params = Get-LrMember $Message 'params'
            if (((Test-LrOrdinalEqual $method 'window/showMessage') -or (Test-LrOrdinalEqual $method 'window/logMessage')) -and -not (Test-LrArrayMember $Message 'params') -and (Test-LrPlainObject $params)) {
                $t = Get-LrMember $params 'type'
                if ((Test-LrNumber $t) -and $t -eq 1) { $A.errorNotifications += 1 }
            }
        }
    } else {
        $A.messagesWithoutMethodOrId += 1
    }
}

function New-LrStdoutTracker { @{ analysis = (New-LrStdoutAnalysis); initializedSent = $false; allowedRequests = 0 } }

# stdout 실시간 감시: 메시지마다 중단 사유를 판단한다. initialized 송신 전에 규칙 새로고침 알림이 오면 A1, 허용 밖 서버 요청은 A6. 없으면 $null.
function Invoke-LrStdoutTracker {
    param($T, $Message)
    Add-LrStdoutMessage $T.analysis $Message
    $kind = Get-LrMessageKind $Message
    if ($kind -ceq 'notification') {
        $method = [string](Get-LrMember $Message 'method')
        if (Test-LrOrdinalEqual $method $Script:LrPublishDiagnosticsMethod) { return [ordered]@{ condition = 'A1'; detail = $method } }
        if ((Test-LrOrdinalEqual $method $Script:LrRulesRefreshedMethod) -and -not $T.initializedSent) { return [ordered]@{ condition = 'A1'; detail = 'PRE_INITIALIZED:rulesRefreshed' } }
    } elseif ($kind -ceq 'server-request') {
        if (-not (Test-LrValidProgressCreate $Message)) { return [ordered]@{ condition = 'A6'; detail = (Format-LrToken ([string](Get-LrMember $Message 'method'))) } }
        $T.allowedRequests += 1
        if ($T.allowedRequests -gt $Script:LrMaxProgressCreate) { return [ordered]@{ condition = 'A6'; detail = 'TOO_MANY_PROGRESS_REQUESTS' } }
        if (-not $T.initializedSent) { return [ordered]@{ condition = 'A6'; detail = 'REQUEST_BEFORE_INITIALIZED' } }
    }
    $null
}

# 장벽의 stdout 쪽 절반.
function Test-LrRulesRefreshedSeen { param($T) $T.analysis.rulesRefreshedCount -ge 1 }

# ── 로그 판독(머리말을 벗기는 형식) ─────────────────────────────────────────

$Script:LrLevels = @('DEBUG', 'INFO', 'WARNING', 'ERROR')

function New-LrRegex {
    param([string]$Pattern)
    New-Object Text.RegularExpressions.Regex($Pattern, [Text.RegularExpressions.RegexOptions]::CultureInvariant)
}
# JS 의 `.` 은 \n \r U+2028 U+2029 에 맞지 않는다(.NET 은 \n 만 제외). \S 는 위의 JS 공백 집합 밖.
$Script:LrNotLine = '[^\n\r\u2028\u2029]'
$Script:LrNonWs = '[^' + $Script:LrWsClass + ']'
$Script:LrNum = '(0|[1-9][0-9]*)'
$Script:LrReHeaderLike = New-LrRegex '^\[[0-9]'
$Script:LrReHeader = New-LrRegex '^\[([0-9]+(?:\.[0-9]+)?)\]\[([A-Za-z]+)\]((?:\([^()]*\))*): ?([\s\S]*)\z'
$Script:LrReGot = New-LrRegex ('^Got ' + $Script:LrNum + ' errors while refreshing rules in language server\z')
$Script:LrReLoading = New-LrRegex ('^loading local config from (' + $Script:LrNotLine + '+)\z')
$Script:LrReDone = New-LrRegex ('^Done loading local config from (' + $Script:LrNotLine + '+)\z')
$Script:LrReSkipping = New-LrRegex ('^skipping rule (' + $Script:LrNonWs + '+), error = ([\s\S]*)\z')
$Script:LrReDownload = New-LrRegex ('^trying to download from (' + $Script:LrNotLine + '+)\z')
$Script:LrReRunning = New-LrRegex ('^Running Semgrep with ' + $Script:LrNum + ' rules\z')
$Script:LrReEngine = New-LrRegex '^Semgrep errors:(?: ([\s\S]*))?\z'
$Script:LrReSkipped = New-LrRegex ('^Semgrep skipped ' + $Script:LrNum + ' rules\z')
$Script:LrReScanned = New-LrRegex ('^Scanned ' + $Script:LrNum + ' files\z')
$Script:LrReFound = New-LrRegex ('^Found ' + $Script:LrNum + ' matches\z')

$Script:LrSimple = New-Object 'System.Collections.Generic.Dictionary[string,string]'
foreach ($lrPair in @(
        @('Refreshing rules', 'refreshingRules'), @('Rules refreshed', 'rulesRefreshed'), @('Scanning open documents', 'scanningOpenDocuments'), @('Scanned open documents', 'scannedOpenDocuments'),
        @('Scanning workspace', 'scanningWorkspace'), @('Scanned workspace', 'scannedWorkspace'), @('Scanning workspace complete', 'scanningWorkspaceComplete'),
        @('Scanning workspace, full: true', 'fullScan'), @('CI disabled, not checking API token', 'ciDisabled'), @('No rules source specified, using auto', 'usingAuto'), @('Scanning single file', 'scanningSingleFile'))) {
    $Script:LrSimple.Add($lrPair[0], $lrPair[1])
}
$Script:LrNoTargets = 'No targets to scan! Not scanning anything.'
$Script:LrNoRules = 'No rules to run! Not scanning anything.'
$Script:LrTokenBenign = @('Checking for API token in environment variables', 'No API token found in environment variables', 'No settings file found, using default settings')
$Script:LrLifecycle = @('Starting legacy language server', 'Initializing server', 'Caching workspace targets', 'Finished caching workspace targets', 'Server initialized', 'Shutting down server', 'Server stopped')

# 키가 어떤 모양으로 나와야 하는가. 'any' 는 모양과 상관없이 같은 뜻이다(나오면 안 되는 신호).
$Script:LrForm = @{
    refreshingRules = 'bare'; rulesRefreshed = 'bare'; scanningOpenDocuments = 'bare'; scannedOpenDocuments = 'bare'
    loading = 'INFO'; doneLoading = 'INFO'; gotErrors = 'INFO'; noTargets = 'WARNING'; ciDisabled = 'DEBUG|INFO'; noRules = 'WARNING'; rulesNotLoaded = 'bare'; skippingRule = 'any'
    scanningWorkspace = 'any'; scannedWorkspace = 'any'; scanningWorkspaceComplete = 'any'; fullScan = 'any'; scanningSingleFile = 'any'; runningRules = 'any'; engineErrors = 'any'; skippedRules = 'any'; scannedFiles = 'any'; foundMatches = 'any'
    usingAuto = 'any'; download = 'any'; tokenFound = 'any'; settingsFileFound = 'any'; tokenBenign = 'any'; lifecycle = 'bare'; errorRecord = 'any'; unexpectedWarning = 'any'
}

# 숫자는 정준 표기만 받는다. 안전 정수(2^53-1) 밖이면 $null — 그 줄은 인식하지 않는다. 17자리 이상은 항상 밖이다.
function ConvertTo-LrSafeCount {
    param([string]$Digits)
    if ($Digits.Length -gt 16) { return $null }
    $v = [decimal]$Digits
    if ($v -gt 9007199254740991) { return $null }
    [long]$v
}

function New-LrClass { param([string]$Key, $Path = $null, $Count = $null) @{ key = $Key; path = $Path; count = $Count } }

# 기존 log-matcher.ts 의 classifyMessage 와 같다. 본문(머리말을 벗기고 다듬은 첫 줄) 전체 일치만 인식한다.
function Get-LrBaseClass {
    param([string]$Message)
    $key = $null
    if ($Script:LrSimple.TryGetValue($Message, [ref]$key)) { return (New-LrClass $key) }
    $m = $Script:LrReGot.Match($Message)
    if ($m.Success) { $n = ConvertTo-LrSafeCount $m.Groups[1].Value; if ($null -eq $n) { return $null }; return (New-LrClass 'gotErrors' $null $n) }
    $m = $Script:LrReLoading.Match($Message)
    if ($m.Success) { return (New-LrClass 'loading' $m.Groups[1].Value) }
    $m = $Script:LrReDone.Match($Message)
    if ($m.Success) { return (New-LrClass 'doneLoading' $m.Groups[1].Value) }
    if ($Script:LrReSkipping.Match($Message).Success) { return (New-LrClass 'skippingRule') }
    if ($Script:LrReDownload.Match($Message).Success) { return (New-LrClass 'download') }
    $m = $Script:LrReRunning.Match($Message)
    if ($m.Success) { if ($null -eq (ConvertTo-LrSafeCount $m.Groups[1].Value)) { return $null }; return (New-LrClass 'runningRules') }
    if ($Script:LrReEngine.Match($Message).Success) { return (New-LrClass 'engineErrors') }
    $m = $Script:LrReSkipped.Match($Message)
    if ($m.Success) { if ($null -eq (ConvertTo-LrSafeCount $m.Groups[1].Value)) { return $null }; return (New-LrClass 'skippedRules') }
    $m = $Script:LrReScanned.Match($Message)
    if ($m.Success) { if ($null -eq (ConvertTo-LrSafeCount $m.Groups[1].Value)) { return $null }; return (New-LrClass 'scannedFiles') }
    $m = $Script:LrReFound.Match($Message)
    if ($m.Success) { if ($null -eq (ConvertTo-LrSafeCount $m.Groups[1].Value)) { return $null }; return (New-LrClass 'foundMatches') }
    $null
}

# 본문을 키로 분류한다(TS classifyRulesMessage). 알 수 없으면 $null. 이 단계의 새 키를 기존 분류기보다 먼저 본다.
function Get-LrMessageClass {
    param([string]$Message)
    $text = Get-LrJsTrim $Message
    if (Test-LrOrdinalEqual $text $Script:LrNoTargets) { return (New-LrClass 'noTargets') }
    if (Test-LrOrdinalEqual $text $Script:LrNoRules) { return (New-LrClass 'noRules') }
    if (Test-LrOrdinalIn $text $Script:LrTokenBenign) { return (New-LrClass 'tokenBenign') }
    if (Test-LrOrdinalIn $text $Script:LrLifecycle) { return (New-LrClass 'lifecycle') }
    if (Test-LrAsciiPrefixCI $text 'rules not loaded yet') { return (New-LrClass 'rulesNotLoaded') }
    if (Test-LrAsciiPrefixCI $text 'found api token') { return (New-LrClass 'tokenFound') }
    if (Test-LrAsciiPrefixCI $text 'settings file found') { return (New-LrClass 'settingsFileFound') }
    $base = Get-LrBaseClass $text
    if ($null -ne $base) { return $base }
    # "No rules source specified, using auto" 의 표현이 달라도 `using auto` 가 단어 경계로 보이면 레지스트리로 넘어간 것으로 본다(fail-closed).
    if ([regex]::IsMatch((ConvertTo-LrAsciiLower $text), '(?<![A-Za-z0-9_])using auto(?![A-Za-z0-9_])')) { return (New-LrClass 'usingAuto') }
    $null
}

function Get-LrShape {
    param([string]$Key, $Level)
    $form = [string]$Script:LrForm[$Key]
    if ($form -ceq 'any') { return 'OK' }
    if ($form -ceq 'bare') { if ($null -eq $Level) { return 'OK' } else { return 'SHAPE_MISMATCH' } }
    if ($null -eq $Level) { return 'SHAPE_MISMATCH' }
    if ($form -ceq 'DEBUG|INFO') { if ($Level -ceq 'DEBUG' -or $Level -ceq 'INFO') { return 'OK' } else { return 'SHAPE_MISMATCH' } }
    if ($form -ceq $Level) { return 'OK' }
    'SHAPE_MISMATCH'
}

# 머리말 한 줄 해석. 머리말 모양이 아니면 $null, 모양인데 읽지 못하거나 알 수 없는 수준이면 @{ malformed = 사유 }, 읽으면 @{ malformed = $null; seconds; level; tag; source; message }.
function Get-LrHeader {
    param([string]$Line)
    if (-not $Script:LrReHeaderLike.IsMatch($Line)) { return $null }
    $m = $Script:LrReHeader.Match($Line)
    if (-not $m.Success) { return @{ malformed = 'HEADER_SHAPE' } }
    $level = $m.Groups[2].Value
    if ($Script:LrLevels -cnotcontains $level) { return @{ malformed = 'HEADER_LEVEL' } }
    $parens = @([regex]::Matches($m.Groups[3].Value, '\(([^()]*)\)') | ForEach-Object { $_.Groups[1].Value })
    $tag = $null; $source = $null
    if ($level -ceq 'DEBUG') {
        if ($parens.Count -gt 2) { return @{ malformed = 'HEADER_PARENS' } }
        if ($parens.Count -ge 1) { $tag = $parens[0] }
        if ($parens.Count -ge 2) { $source = $parens[1] }
    } else {
        if ($parens.Count -gt 1) { return @{ malformed = 'HEADER_PARENS' } }
        if ($parens.Count -ge 1) { $source = $parens[0] }
    }
    @{ malformed = $null; seconds = $m.Groups[1].Value; level = $level; tag = $tag; source = $source; message = $m.Groups[4].Value }
}

# 한 줄이 괄호 깊이를 얼마나 바꾸는가. 큰따옴표 문자열(백슬래시 이스케이프 포함) 안의 괄호는 세지 않는다.
function Get-LrBracketDelta {
    param([string]$Line)
    $delta = 0; $inString = $false; $escaped = $false
    foreach ($ch in $Line.ToCharArray()) {
        $c = [string]$ch
        if ($inString) {
            if ($escaped) { $escaped = $false }
            elseif ($c -ceq '\') { $escaped = $true }
            elseif ($c -ceq '"') { $inString = $false }
        } elseif ($c -ceq '"') { $inString = $true }
        elseif ($c -ceq '{' -or $c -ceq '[') { $delta += 1 }
        elseif ($c -ceq '}' -or $c -ceq ']') { $delta -= 1 }
    }
    $delta
}

function New-LrLogScanner {
    @{
        carry = (New-Object IO.MemoryStream); carryStart = [long]0
        signals = (New-Object System.Collections.ArrayList); current = $null; recordCount = 0
        counters = [ordered]@{
            lines = 0; records = 0; headedRecords = 0; bareRecords = 0; malformedHeaders = 0; orphanBareLines = 0; embeddedSignalText = 0
            unclassifiedInfo = 0; unclassifiedDebug = 0; partialTail = $false; totalBytes = [long]0
        }
    }
}

function Add-LrSignal {
    param($S, $Class, $Header, [long]$ByteOffset, [int]$RecordIndex)
    $level = $null; $tag = $null; $source = $null
    if ($null -ne $Header) { $level = $Header.level; $tag = $Header.tag; $source = $Header.source }
    [void]$S.signals.Add([ordered]@{
            key = $Class.key; level = $level; tag = $tag; source = $source; shape = (Get-LrShape $Class.key $level)
            byteOffset = $ByteOffset; recordIndex = $RecordIndex; path = $Class.path; count = $Class.count
        })
}

function New-LrRecord {
    param($S)
    $index = $S.recordCount
    $S.recordCount += 1
    $S.counters.records += 1
    $index
}

# 한 줄을 처리한다(개행을 뺀 바이트). TS RulesLogScanner.line 과 같은 상태 기계.
function Invoke-LrLogLine {
    param($S, [byte[]]$Bytes, [long]$ByteOffset)
    $S.counters.lines += 1
    $raw = $Script:LrUtf8.GetString($Bytes)
    $text = $raw
    if ($raw.EndsWith("`r", [StringComparison]::Ordinal)) { $text = $raw.Substring(0, $raw.Length - 1) }
    $header = Get-LrHeader $text
    if ($null -ne $header) {
        if ($null -ne $header.malformed) {
            # 머리말처럼 보이지만 읽지 못한 줄: 블록을 끊되 신호로는 쓰지 않는다.
            $S.counters.malformedHeaders += 1
            $S.current = $null
            return
        }
        $index = New-LrRecord $S
        $S.counters.headedRecords += 1
        $S.current = @{
            index = $index
            pendingBlock = (Get-LrJsTrimEnd $header.message).EndsWith(':', [StringComparison]::Ordinal)
            depth = [Math]::Max(0, (Get-LrBracketDelta $header.message))
        }
        $cls = Get-LrMessageClass $header.message
        if ($null -ne $cls) { Add-LrSignal $S $cls $header $ByteOffset $index }
        if ($header.level -ceq 'ERROR') {
            # ERROR 수준 항목은 본문이 알려진 키여도 오류 기록이다(성공으로 읽지 않는다).
            Add-LrSignal $S (New-LrClass 'errorRecord') $header $ByteOffset $index
        } elseif ($null -ne $cls) {
            # 위에서 처리했다.
        } elseif ($header.level -ceq 'WARNING') {
            Add-LrSignal $S (New-LrClass 'unexpectedWarning') $header $ByteOffset $index
        } elseif ($header.level -ceq 'INFO') {
            $S.counters.unclassifiedInfo += 1
        } else {
            $S.counters.unclassifiedDebug += 1
        }
        return
    }
    $cur = $S.current
    # 열린 괄호 블록 안: 덤프의 일부다. 신호와 같은 텍스트가 나와도 신호로 세지 않는다.
    if ($null -ne $cur -and $cur.depth -gt 0) {
        if ($null -ne (Get-LrMessageClass $text)) { $S.counters.embeddedSignalText += 1 }
        $cur.depth = [Math]::Max(0, $cur.depth + (Get-LrBracketDelta $text))
        return
    }
    # 블록 밖에서 알려진 메시지와 전체 일치: 독립 항목(App 수준 신호).
    $cls = $null
    if ((Get-LrJsTrim $text) -cne '') { $cls = Get-LrMessageClass $text }
    if ($null -ne $cls) {
        $index = New-LrRecord $S
        $S.counters.bareRecords += 1
        $S.current = @{ index = $index; pendingBlock = $false; depth = 0 }
        Add-LrSignal $S $cls $null $ByteOffset $index
        return
    }
    # 나머지: 직전 항목의 이어지는 줄.
    if ($null -eq $cur) {
        if ((Get-LrJsTrim $text) -cne '') { $S.counters.orphanBareLines += 1 }
        return
    }
    if ($cur.pendingBlock -and (Get-LrJsTrim $text) -cne '') {
        $cur.pendingBlock = $false
        $cur.depth = [Math]::Max(0, (Get-LrBracketDelta $text))
    }
}

# 새 청크(앞 Count 바이트)를 먹인다. 줄은 개행(LF)이 온 뒤에야 처리한다. 새 신호는 $S.signals 의 뒤쪽에 붙는다(호출자가 전후 개수로 본다).
function Add-LrLogBytes {
    param($S, [byte[]]$Chunk, [int]$Count = -1)
    if ($Count -lt 0) { $Count = $Chunk.Length }
    $base = [long]$S.counters.totalBytes
    $S.counters.totalBytes = $base + $Count
    $i = 0
    while ($i -lt $Count) {
        $nl = [Array]::IndexOf($Chunk, [byte]10, $i, $Count - $i)
        if ($nl -lt 0) { $S.carry.Write($Chunk, $i, $Count - $i); break }
        $S.carry.Write($Chunk, $i, $nl - $i)
        Invoke-LrLogLine $S ($S.carry.ToArray()) $S.carryStart
        $S.carry.SetLength(0)
        $S.carryStart = $base + $nl + 1
        $i = $nl + 1
    }
}

# 스트림이 끝났다: 개행 없는 마지막 줄도 처리한다.
function Complete-LrLogScanner {
    param($S)
    if ($S.carry.Length -gt 0) {
        $S.counters.partialTail = $true
        Invoke-LrLogLine $S ($S.carry.ToArray()) $S.carryStart
        $S.carry.SetLength(0)
    }
}

# ── stderr 실시간 감시기 ────────────────────────────────────────────────────

# 청크 경계에 걸친 문구를 찾으려고 남기는 꼬리 길이: 감시하는 가장 긴 부분 문자열(초기화 오류 로그)보다 하나 짧다.
$Script:LrTailKeep = [int][Math]::Max(($Script:LspMinNetworkPatterns | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum, $Script:LspMinInitErrorLogPattern.Length) - 1

function New-LrStderrWatcher {
    @{
        scanner = (New-LrLogScanner); decoder = $Script:LrUtf8.GetDecoder(); tail = ''; hit = $null
        initErrorLogged = $false; checkedBytes = [long]0; initializedSent = $false; scannedOpenDocumentsSeen = $false
    }
}

function Get-LrAbortForSignal {
    param($W, $Signal)
    if (-not $W.initializedSent -and $Script:LrPreInitializedKeys -ccontains $Signal.key) { return [ordered]@{ condition = 'A1'; detail = "PRE_INITIALIZED:$($Signal.key)" } }
    if ($Script:LrForbiddenScanKeys -ccontains $Signal.key) { return [ordered]@{ condition = 'A1'; detail = $Signal.key } }
    if ($Script:LrForbiddenNetworkKeys -ccontains $Signal.key) { return [ordered]@{ condition = 'A2'; detail = $Signal.key } }
    $null
}

# 새로 들어온 신호들을 보고 장벽 절반을 채우고 첫 중단 사유를 돌려준다.
function Step-LrWatcherSignals {
    param($W, [int]$From)
    $found = $null
    for ($k = $From; $k -lt $W.scanner.signals.Count; $k++) {
        $sig = $W.scanner.signals[$k]
        if ($sig.key -ceq 'scannedOpenDocuments' -and $sig.shape -ceq 'OK' -and $W.initializedSent) { $W.scannedOpenDocumentsSeen = $true }
        if ($null -eq $found) { $found = Get-LrAbortForSignal $W $sig }
    }
    $found
}

# 새 청크를 먹이고, 이번에 처음 찾은 중단 사유가 있으면 돌려준다(이미 찾았다면 $null).
#  · A1 initialized 송신 **전**의 새로고침·열린 문서 스캔 신호, 그리고 언제든 엔진·작업 영역·단일 파일 스캔 신호
#  · A2 레지스트리·내려받기·토큰·설정 파일 신호, 그리고 LSP-MIN-1 과 같은 부분 문자열 감시(`download`·`registry`, 어디에 있든)
# 덤프 블록 안의 문자열은 신호로 보지 않는다. 모양과 상관없이 금지 키는 중단이다(fail-closed).
function Add-LrStderrChunk {
    param($W, [byte[]]$Chunk, [int]$Count = -1)
    if ($Count -lt 0) { $Count = $Chunk.Length }
    $W.checkedBytes += $Count
    $chars = New-Object char[] ($Count + 4)
    $n = $W.decoder.GetChars($Chunk, 0, $Count, $chars, 0, $false)
    $text = ''
    if ($n -gt 0) { $text = New-Object string ($chars, 0, $n) }
    $window = ConvertTo-LrJsLower ($W.tail + $text)
    if ($window.Contains($Script:LspMinInitErrorLogPattern)) { $W.initErrorLogged = $true }
    $W.tail = $window.Substring([Math]::Max(0, $window.Length - $Script:LrTailKeep))
    $before = $W.scanner.signals.Count
    Add-LrLogBytes $W.scanner $Chunk $Count
    $found = Step-LrWatcherSignals $W $before
    if ($null -eq $found) {
        foreach ($pattern in $Script:LspMinNetworkPatterns) {
            if ($window.Contains($pattern)) { $found = [ordered]@{ condition = 'A2'; detail = $pattern }; break }
        }
    }
    if ($null -ne $found -and $null -eq $W.hit) { $W.hit = $found; return $found }
    $null
}

# 스트림이 끝났다: 개행 없는 마지막 줄도 본다.
function Complete-LrStderrWatcher {
    param($W)
    $before = $W.scanner.signals.Count
    Complete-LrLogScanner $W.scanner
    $found = Step-LrWatcherSignals $W $before
    if ($null -ne $found -and $null -eq $W.hit) { $W.hit = $found; return $found }
    $null
}

# ── 요청의 정적 검사 ────────────────────────────────────────────────────────

function Get-LrSha256Hex {
    param([byte[]]$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($sha.ComputeHash($Bytes)) -replace '-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}

# 파일 시스템에 닿지 않는 요청 검사(TS checkRulesRequest 와 같은 사유 토큰). 값(경로·환경 값)은 사유에 싣지 않는다.
# Req 의 필드: mode, exe, args, layout{work,workspace,stateDir,rulesDir,homeDir,tmpDir}, env, limits, artifacts, probeB64. 돌려주는 값: refusals, limits(해석됨), probeBytes.
function Get-LrStaticRefusals {
    param($Req)
    $refusals = New-Object System.Collections.ArrayList
    $mode = [string](Get-LmProp $Req 'mode')
    $exe = Get-LmProp $Req 'exe'
    $args0 = @(Get-LmProp $Req 'args' | ForEach-Object { [string]$_ })
    $isLsp = Test-LrOrdinalEqual $mode 'semgrep-lsp'
    $isStub = Test-LrOrdinalEqual $mode 'stub'
    if (-not $isLsp -and -not $isStub) { [void]$refusals.Add('MODE_UNKNOWN') }
    if (-not (Test-LrDriveAbsolute $exe)) { [void]$refusals.Add('COMMAND_NOT_ABSOLUTE') }
    elseif ($isLsp) {
        $leaf = ([string]$exe -split '[\\/]+' | Select-Object -Last 1)
        if (-not (Test-LrOrdinalEqual (ConvertTo-LrJsLower $leaf) $Script:LspMinExeName)) { [void]$refusals.Add('COMMAND_NAME_NOT_ALLOWED') }
    }
    if ($isLsp) {
        if ($args0.Count -ne 2 -or -not (Test-LrOrdinalEqual $args0[0] 'lsp') -or -not (Test-LrOrdinalEqual $args0[1] '--debug')) { [void]$refusals.Add('ARGS_NOT_FIXED') }
    }
    if ($exe -is [string] -and $null -ne (Find-LrForbiddenFragment $exe)) { [void]$refusals.Add('PATH_CONTAINS_FORBIDDEN_FRAGMENT:COMMAND') }

    $layout = Get-LmProp $Req 'layout'
    $work = [string](Get-LmProp $layout 'work')
    if (-not (Test-LrDriveAbsolute $work)) { [void]$refusals.Add('WORK_DIR_NOT_DRIVE_ABSOLUTE') }
    else {
        $want = Get-LrLayout -Work $work
        foreach ($k in 'workspace', 'stateDir', 'rulesDir', 'homeDir', 'tmpDir') { if (-not (Test-LrOrdinalEqual ([string](Get-LmProp $layout $k)) ([string]$want[$k]))) { [void]$refusals.Add('LAYOUT_MISMATCH') } }
    }
    $rulesDir = [string](Get-LmProp $layout 'rulesDir')
    if (-not (Test-LrDriveAbsolute $rulesDir)) { [void]$refusals.Add('RULES_DIR_NOT_DRIVE_ABSOLUTE') }
    # 규칙 폴더 하나만 명시하고, 그것이 레지스트리·앱·내려받기로 풀리는 특수 값이 아니어야 한다.
    if (Test-LrNetworkRuleSource $rulesDir) { [void]$refusals.Add('RULES_DIR_IS_NETWORK_SOURCE') }
    foreach ($role in $Script:LspMinWatchedRoles) {
        if ($null -ne (Find-LrForbiddenFragment ([string](Get-LrRootPath $layout $role)))) { [void]$refusals.Add("PATH_CONTAINS_FORBIDDEN_FRAGMENT:$role") }
    }

    $resolved = Resolve-LrLimits (Get-LmProp $Req 'limits')
    foreach ($p in $resolved.problems) { [void]$refusals.Add($p) }

    foreach ($r in (Get-LrEnvRefusals (Get-LmProp $Req 'env') $layout)) { [void]$refusals.Add($r) }

    foreach ($a in @(Get-LmProp $Req 'artifacts')) {
        if ($null -eq $a) { continue }
        if ([string]::IsNullOrEmpty([string](Get-LmProp $a 'label'))) { [void]$refusals.Add('ARTIFACT_LABEL_INVALID') }
        $ap = Get-LmProp $a 'path'
        if (-not (Test-LrDriveAbsolute $ap)) { [void]$refusals.Add('ARTIFACT_PATH_NOT_DRIVE_ABSOLUTE') }
        elseif ($null -ne (Find-LrForbiddenFragment $ap)) { [void]$refusals.Add('PATH_CONTAINS_FORBIDDEN_FRAGMENT:ARTIFACT') }
    }

    # 프로브: 바이트 수와 해시가 고정값과 같아야 한다. 쓰기 전에 거절한다.
    $bytes = $null
    $b64 = Get-LmProp $Req 'probeB64'
    if ($b64 -is [string] -and $b64 -ne '') { try { $bytes = [Convert]::FromBase64String($b64) } catch { $bytes = $null } }
    if ($null -eq $bytes) { [void]$refusals.Add('PROBE_BYTES_MISSING') }
    elseif ($bytes.Length -ne $Script:LrProbeBytes) { [void]$refusals.Add('PROBE_SIZE_MISMATCH') }
    elseif ((Get-LrSha256Hex $bytes) -cne $Script:LrProbeSha256) { [void]$refusals.Add('PROBE_HASH_MISMATCH') }
    [ordered]@{ refusals = @($refusals | Select-Object -Unique); limits = $resolved.limits; probeBytes = $bytes }
}

# 환경: 이름 집합과 값이 계약 함수가 만든 것과 같아야 한다. SEMGREP_LOG_SRCS·토큰·프록시 이름은 허용 목록에 없어 거절된다.
function Get-LrEnvRefusals {
    param($EnvReq, $Layout)
    $out = New-Object System.Collections.ArrayList
    $names = Get-LrMemberNames $EnvReq
    foreach ($n in $names) { if (-not (Test-LrOrdinalIn $n $Script:LspMinEnvNames)) { [void]$out.Add('ENV_NAME_NOT_ALLOWED:' + ($n -replace '[^A-Za-z0-9_]', '?')) } }
    $url = Get-LrMember $EnvReq 'SEMGREP_APP_URL'
    $winDir = Get-LrMember $EnvReq 'SYSTEMROOT'
    # 끝 고정은 \z 다: .NET 의 $ 는 끝의 개행 하나 앞에서도 맞아서 "http://127.0.0.1:41999`n" 을 통과시킨다(TS 는 거절한다).
    if ($url -isnot [string] -or $url -cnotmatch '^http://127\.0\.0\.1:[0-9]{1,5}\z') { [void]$out.Add('ENV_URL_NOT_LOOPBACK') }
    if ($winDir -isnot [string] -or $winDir -eq '') { [void]$out.Add('ENV_NAME_MISSING:SYSTEMROOT') }
    if ($url -is [string] -and $url -cmatch '^http://127\.0\.0\.1:[0-9]{1,5}\z' -and $winDir -is [string] -and $winDir -ne '') {
        $want = New-LspMinChildEnv -WindowsDir $winDir -Layout $Layout -Url $url
        foreach ($n in $Script:LspMinEnvNames) {
            if (-not (Test-LrOrdinalIn $n $names)) { [void]$out.Add("ENV_NAME_MISSING:$n") }
            elseif (-not (Test-LrOrdinalEqual ([string](Get-LrMember $EnvReq $n)) ([string]$want[$n]))) { [void]$out.Add("ENV_VALUE_UNEXPECTED:$n") }
        }
    }
    , @($out)
}
