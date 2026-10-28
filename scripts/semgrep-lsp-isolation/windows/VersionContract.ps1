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
