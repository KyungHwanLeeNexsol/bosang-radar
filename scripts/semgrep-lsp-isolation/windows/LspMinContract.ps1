# LSP-MIN-1 최소 기동 관측의 계약(PowerShell 이식본). scripts/semgrep-lsp/lsp-min.ts 의 상수와 핵심 규칙을 그대로 옮긴 것이다.
# 같은 입력에서 TS 와 같은 결과를 내는지는 tests/Test-LspMinRunner.ps1 이 실제 TS 모듈(tsx)과 대조해서 확인한다.
# 이 계약은 하네스가 정한 것이며 실제 Semgrep 으로 확인한 형식이 아니다. 실제 출력을 보고 계약을 고치지 않는다.
#
# 이 파일은 부작용이 없다: 불러와도 아무것도 실행하지 않고, 파일·프로세스·네트워크·환경에 닿지 않는다.
# `initialized` 는 이 계약 어디에도 없다. SEMGREP_ENABLE_VERSION_CHECK 도 없다(소유자 결정: LSP 환경에 더하지 않는다).

$Script:LspMinArgs = @('lsp', '--debug')
$Script:LspMinExeName = 'semgrep.exe'
$Script:LspMinInitId = 'lsp-min-init-1'
$Script:LspMinShutdownId = 'lsp-min-shutdown-1'
$Script:LspMinSendOrder = @('initialize', 'shutdown', 'exit')
# 새 실행기 전용 상한(소유자 결정). 요청은 이 값 이하로만 줄일 수 있다.
$Script:LspMinLimits = [ordered]@{
    totalMs = 150000; initMs = 60000; exitMs = 30000; stdinCloseGraceMs = 10000; killConfirmMs = 10000
    maxStdoutBytes = 1048576; maxStderrBytes = 262144; sampleIntervalMs = 40
}
# 중단 문구(소문자, 부분 문자열). A1: 규칙 새로고침·스캔, A2: 내려받기 시도.
$Script:LspMinScanPatterns = @('refreshing rules', 'rules refreshed', 'scanning workspace', 'scanning open documents', 'scanning single file', 'scanned workspace', 'scanned open documents')
$Script:LspMinNetworkPatterns = @('download', 'registry')
$Script:LspMinInitErrorLogPattern = 'error initializing server'
$Script:LspMinAbortMethods = @('semgrep/rulesRefreshed', 'textDocument/publishDiagnostics')
$Script:LspMinAllowedImages = @('semgrep.exe', 'python.exe', 'semgrep-core.exe', 'pysemgrep.exe', 'conhost.exe')
$Script:LspMinHomeExpectedPrefix = '.semgrep/cache/fingerprinted_ignored_findings/'
$Script:LspMinEnvNames = @('PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'SEMGREP_APP_URL', 'SEMGREP_METRICS_URL', 'SEMGREP_VERSION_CHECK_URL', 'SEMGREP_LOG_FILE', 'SEMGREP_SETTINGS_FILE', 'SEMGREP_VERSION_CACHE_PATH')
$Script:LspMinWatchedRoles = @('WORKSPACE', 'RULES_DIR', 'HOME_DIR')

# 속성 하나를 읽는다(없으면 $null). 해시테이블·객체 모두 받고, StrictMode 에서도 던지지 않는다.
function Get-LmProp {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) { if ($Object.Contains($Name)) { return $Object[$Name] }; return $null }
    $p = $Object.PSObject.Properties[$Name]
    if ($p) { return $p.Value }
    $null
}

# 서버가 보낸 메시지의 멤버는 키 이름을 **대소문자 그대로** 읽는다. JSON-RPC 의 멤버 이름은 대소문자를 구분하고 TS(framing.ts, classifyServerMessage)도 그렇게 읽는다.
# PowerShell 의 `$obj.Prop`·`PSObject.Properties[name]`·Get-LmProp 는 대소문자를 무시해서 `Id`·`JSONRPC` 를 `id`·`jsonrpc` 로 읽으므로 서버 메시지에는 쓰지 않는다.
function Test-LmExactMember {
    param($Object, [string]$Name)
    if ($null -eq $Object -or $null -eq $Object.PSObject) { return $false }
    foreach ($p in $Object.PSObject.Properties) { if ($p.Name -ceq $Name) { return $true } }
    $false
}

function Get-LmExactMember {
    param($Object, [string]$Name)
    if ($null -eq $Object -or $null -eq $Object.PSObject) { return $null }
    foreach ($p in $Object.PSObject.Properties) { if ($p.Name -ceq $Name) { return $p.Value } }
    $null
}

# 서버 메시지의 분류. TS classifyServerMessage 와 같다: method 가 문자열이면 요청(id 도 있음)이나 알림, 아니면 id 가 있을 때만 응답, 둘 다 없으면 invalid.
function Get-LspMinMessageKind {
    param($Message)
    $method = Get-LmExactMember $Message 'method'
    $id = Get-LmExactMember $Message 'id'
    $hasMethod = $method -is [string]
    $hasId = $null -ne $id
    if ($hasMethod -and $hasId) { return 'server-request' }
    if ($hasMethod) { return 'notification' }
    if ($hasId) { return 'response' }
    'invalid'
}

# 프로세스 표본 한 번에 줘도 되는 시간(초). 전체 마감까지 남은 시간(ms)에서 정한다: 1초 미만이면 0(표본을 시작하지 않는다), 아니면 남은 초 수와 5 중 작은 값.
# 표본(CIM 조회)이 마감을 넘겨 실행을 늘리지 못하게 하려는 것이다. 정확한 상한이 아니라 조회 한 번을 묶는 값이다.
function Get-LspMinSampleTimeoutSec {
    param([int]$RemainingMs)
    if ($RemainingMs -lt 1000) { return 0 }
    [Math]::Min(5, [int][Math]::Floor($RemainingMs / 1000))
}

# 경로를 합친다. 구분자는 기준 경로가 쓰는 것을 따른다(TS joinLayoutPath 와 같다).
function Join-LmPath {
    param([Parameter(Mandatory)][string]$Base, [Parameter(Mandatory)][string]$Name)
    $root = $Base.TrimEnd('\', '/')
    $sep = '/'
    if ($root.Contains('\') -and -not $root.Contains('/')) { $sep = '\' }
    $root + $sep + $Name
}

# 작업 폴더에서 모든 경로를 도출한다(TS lspMinLayout 과 같다). 요청이 감시 폴더를 다른 곳으로 가리키지 못하게 하려고 러너가 이 함수로 다시 도출해 비교한다.
function Get-LspMinLayout {
    param([Parameter(Mandatory)][string]$Work)
    $state = Join-LmPath $Work 'lsp-state'
    [ordered]@{
        work = $Work
        workspace = (Join-LmPath $Work 'ws')
        stateDir = $state
        rulesDir = (Join-LmPath $state 'rules-empty')
        homeDir = (Join-LmPath $state 'home')
        tmpDir = (Join-LmPath $state 'tmp')
    }
}

function Get-LspMinRootPath {
    param($Layout, [Parameter(Mandatory)][string]$Role)
    switch ($Role) {
        'WORKSPACE' { return [string](Get-LmProp $Layout 'workspace') }
        'RULES_DIR' { return [string](Get-LmProp $Layout 'rulesDir') }
        'HOME_DIR' { return [string](Get-LmProp $Layout 'homeDir') }
    }
    $null
}

# 자식에 줄 Windows 환경 전체(부모 환경을 물려주지 않는다). TS 의 buildLspMinEnv 와 같은 이름·같은 값이다. SEMGREP_ENABLE_VERSION_CHECK 는 넣지 않는다.
function New-LspMinChildEnv {
    param(
        [Parameter(Mandatory)][string]$WindowsDir,
        [Parameter(Mandatory)]$Layout,
        [Parameter(Mandatory)][string]$Url
    )
    $win = $WindowsDir.TrimEnd('\', '/')
    $state = [string](Get-LmProp $Layout 'stateDir')
    [ordered]@{
        PATH = "$win\System32;$win"; SYSTEMROOT = $win
        TEMP = [string](Get-LmProp $Layout 'tmpDir'); TMP = [string](Get-LmProp $Layout 'tmpDir')
        USERPROFILE = [string](Get-LmProp $Layout 'homeDir')
        SEMGREP_APP_URL = $Url; SEMGREP_METRICS_URL = $Url; SEMGREP_VERSION_CHECK_URL = $Url
        SEMGREP_LOG_FILE = (Join-LmPath $state 'semgrep.log'); SEMGREP_SETTINGS_FILE = (Join-LmPath $state 'settings.yml'); SEMGREP_VERSION_CACHE_PATH = (Join-LmPath $state 'version-cache')
    }
}

# 감시 폴더 안의 한 파일이 금지된 변경인가(A5). 경로는 폴더 기준 상대 경로(구분자 '/' 또는 '\').
function Test-LspMinRootViolation {
    param([Parameter(Mandatory)][string]$Role, [Parameter(Mandatory)][string]$RelativePath)
    $n = $RelativePath.Replace('\', '/')
    if ($Role -eq 'HOME_DIR') { return (-not $n.StartsWith($Script:LspMinHomeExpectedPrefix, [StringComparison]::Ordinal)) }
    $true
}

# 소문자로 바꾼 텍스트에서 중단 문구를 찾는다. A1 이 A2 보다 먼저다. 결과: condition, pattern (없으면 $null).
function Find-LspMinAbortPattern {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$TextLower)
    foreach ($p in $Script:LspMinScanPatterns) { if ($TextLower.Contains($p)) { return [ordered]@{ condition = 'A1'; pattern = $p } } }
    foreach ($p in $Script:LspMinNetworkPatterns) { if ($TextLower.Contains($p)) { return [ordered]@{ condition = 'A2'; pattern = $p } } }
    $null
}

# 경로·문자열에 중단 문구(또는 초기화 오류 로그 문구)가 들어 있으면 그 문구를, 없으면 $null. 스스로 중단되는 사고를 막는 요청 검사에 쓴다.
function Find-LspMinPathPattern {
    param([Parameter(Mandatory)][string]$Path)
    $lower = $Path.ToLowerInvariant()
    foreach ($p in @($Script:LspMinScanPatterns) + @($Script:LspMinNetworkPatterns) + @($Script:LspMinInitErrorLogPattern)) { if ($lower.Contains($p)) { return $p } }
    $null
}

# 이미지 이름(소문자). 이름이 우선, 없으면 실행 파일 경로의 끝, 둘 다 없으면 $null.
function Get-LspMinImageName {
    param($Name, $ExecutablePath)
    if ($Name -is [string] -and $Name.Length -gt 0) { return $Name.ToLowerInvariant() }
    if ($ExecutablePath -is [string] -and $ExecutablePath.Length -gt 0) {
        $parts = $ExecutablePath.Split([char[]]@('\', '/'))      # 파일 시스템을 만지지 않는 순수 문자열 분리(경로 끝 조각)
        return $parts[$parts.Length - 1].ToLowerInvariant()
    }
    $null
}

# initialize 응답의 핵심 규칙(V2·V4~V8). 호출자가 id 일치(V3)를 이미 확인한 메시지(ConvertFrom-Json 결과)에만 쓴다. 던지지 않는다.
# TS classifyInitResponseCore 와 같은 토큰을 같은 순서로 낸다. 결과: ok, reasons.
function Get-LspMinInitCore {
    param($Message)
    $reasons = New-Object System.Collections.ArrayList
    $names = @()
    if ($null -ne $Message -and $Message.PSObject) { $names = @($Message.PSObject.Properties | ForEach-Object { $_.Name }) }
    $hasMethod = $names -ccontains 'method'
    $hasError = $names -ccontains 'error'
    $hasResult = $names -ccontains 'result'
    if ($hasMethod) { [void]$reasons.Add('INIT_MESSAGE_HAS_METHOD') }
    if ($hasError) { if ($hasResult) { [void]$reasons.Add('INIT_RESULT_AND_ERROR') } else { [void]$reasons.Add('INIT_ERROR_RESPONSE') } }
    if (-not $hasResult) {
        if (-not $hasError) { [void]$reasons.Add('INIT_RESULT_MISSING') }
    } elseif (-not $hasError) {
        $result = $Message.result
        if ($result -isnot [pscustomobject]) {
            [void]$reasons.Add('INIT_RESULT_NOT_OBJECT')
        } else {
            $rn = @($result.PSObject.Properties | ForEach-Object { $_.Name })
            if ($rn -ccontains 'retry') { [void]$reasons.Add('INIT_RESULT_IS_INITIALIZE_ERROR') }
            if (-not ($rn -ccontains 'capabilities')) { [void]$reasons.Add('INIT_CAPABILITIES_MISSING') }
            elseif ($result.capabilities -isnot [pscustomobject]) { [void]$reasons.Add('INIT_CAPABILITIES_NOT_OBJECT') }
        }
    }
    [ordered]@{ ok = ($reasons.Count -eq 0); reasons = @($reasons) }
}

# file:// URI 의 폴더 형태. TS 의 expectedUri(path, '_').slice(0, -2) 와 같다: 드라이브 대문자, 조각마다 퍼센트 인코딩.
function ConvertTo-LspMinFolderUri {
    param([Parameter(Mandatory)][string]$Path)
    $n = ($Path.Replace('\', '/') -replace '/{2,}', '/').TrimEnd('/')
    $m = [regex]::Match($n, '^([A-Za-z]):(/.*)?$')
    $drive = $null
    if ($m.Success) { $drive = $m.Groups[1].Value.ToUpperInvariant(); $rest = $m.Groups[2].Value } else { $rest = $n }
    $segments = @($rest.Split('/') | Where-Object { $_ -ne '' } | ForEach-Object { [Uri]::EscapeDataString($_) })
    $joined = $segments -join '/'
    if ($null -eq $drive) { return "file:///$joined" }
    "file:///${drive}:/$joined"
}

# initialize 요청(TS buildInitializeMessage 와 같은 내용). 규칙은 빈 로컬 폴더 하나, 메트릭은 끈다. 반환은 JSON 으로 직렬화할 순서 있는 해시테이블.
function New-LspMinInitializeMessage {
    param([Parameter(Mandatory)]$Layout)
    $uri = ConvertTo-LspMinFolderUri ([string](Get-LmProp $Layout 'workspace'))
    $opts = [ordered]@{
        scan = [ordered]@{ ci = $false; configuration = @([string](Get-LmProp $Layout 'rulesDir')); maxTargetBytes = 1000000; onlyGitDirty = $false; pro_intrafile = $false; timeout = 30; timeoutThreshold = 3 }
        metrics = [ordered]@{ enabled = $false }
    }
    [ordered]@{
        jsonrpc = '2.0'; id = $Script:LspMinInitId; method = 'initialize'
        params = [ordered]@{ processId = $null; rootUri = $uri; workspaceFolders = @([ordered]@{ uri = $uri; name = 'ws' }); capabilities = [ordered]@{}; initializationOptions = $opts }
    }
}

function New-LspMinShutdownMessage { [ordered]@{ jsonrpc = '2.0'; id = $Script:LspMinShutdownId; method = 'shutdown' } }
function New-LspMinExitMessage { [ordered]@{ jsonrpc = '2.0'; method = 'exit' } }

# 메시지를 Content-Length 프레임 바이트로 만든다(헤더의 길이는 본문의 UTF-8 바이트 수).
function ConvertTo-LspMinFrame {
    param([Parameter(Mandatory)]$Message)
    $json = $Message | ConvertTo-Json -Depth 10 -Compress
    $body = [Text.Encoding]::UTF8.GetBytes($json)
    $header = [Text.Encoding]::ASCII.GetBytes("Content-Length: $($body.Length)`r`n`r`n")
    $out = New-Object byte[] ($header.Length + $body.Length)
    [Array]::Copy($header, 0, $out, 0, $header.Length)
    [Array]::Copy($body, 0, $out, $header.Length, $body.Length)
    , $out
}

# 쓰기 직전의 마지막 방어선: 이 셋 말고는 stdin 에 쓰지 않는다. 어긋나면 던진다(프로그래머 오류).
function Assert-LspMinOutbound {
    param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)]$Message)
    $method = [string](Get-LmProp $Message 'method')
    if ($Script:LspMinSendOrder -cnotcontains $Label -or $method -cne $Label) { throw "허용되지 않은 송신: $Label" }
    $hasId = ($null -ne (Get-LmProp $Message 'id'))
    $wantsId = ($Label -ne 'exit')
    if ($hasId -ne $wantsId) { throw "허용되지 않은 송신 형태: $Label" }
}
