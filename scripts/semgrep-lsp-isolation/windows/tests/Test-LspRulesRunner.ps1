<#
.SYNOPSIS
  lsp-rules-runner.ps1 의 송신 제한·initialized 조건·장벽·중단 조건·종료 정책·환경 격리·거부 경로와 LspRulesContract.ps1 의 계약 이식본을 무해한 스텁으로 확인한다.
.DESCRIPTION
  시스템 설정(계정·방화벽·감사·ACL)을 바꾸지 않는다. 임시 샌드박스 폴더에서 현재 사용자로 러너를 부르고, 스텁(lsp-rules-stub.ps1)과 시스템 폴더의 실행 파일 하나(whoami.exe 사본)만 쓴다.
  semgrep 계열은 실행하지 않는다. 확인 항목:
    - 구문, BOM, 금지된 명령(Invoke-Expression, 내려받기, semgrep 계열 호출)
    - TS ↔ PS 골든 대조(tsx 없이 돈다): tests/lsp-rules-parity.json 의 모든 사례(로그 판독, stderr 감시, stdout 감시, 진행 요청 검사, 감시 폴더 위반, 송신 방어선)에서 PS 이식본의 출력이 TS 가 계산한 기대값과 같다
    - 계약 자체 점검(TS 없이)과, tsx 가 있을 때만 계약(PS) ↔ 실제 TS 모듈 대조(상수, 메시지, 환경, 한도 해석, 경로 검사). tsx 가 없으면 SKIPPED 로 표시하고 통과로 세지 않는다
    - Send-LrMessage·Test-LrInitGate 단위 확인(가짜 stdin 스트림)
    - 러너 end-to-end: 스텁 시나리오마다 송신 순서(initialized 가 정확히 1번 또는 0번), 중단 조건, 강제 종료, 종료 코드, 시간 한도가 늘어나지 않음
    - 요청 거부 경로(한도 상향·모르는 한도, 모르는 mode·인자·환경 이름(SEMGREP_LOG_SRCS·토큰 포함), 드라이브 문자가 아닌 절대 경로, 작업 영역·규칙 폴더, 프로브 바이트·해시, 링크)
    - 러너 결과 → 실제 TS 어댑터(factsFromRulesRunnerResult)·기록 만들기(buildRulesRecord): 시나리오마다 판정이 기대와 같은가(tsx 가 있을 때만)
  이 시험의 통과는 "러너와 계약 이식본이 스텁·합성 입력에서 의도대로 동작한다"까지만 뜻한다. 실제 Semgrep 의 동작은 뜻하지 않는다.
.EXAMPLE
  pwsh -NoProfile -File .\tests\Test-LspRulesRunner.ps1 -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -NodeDir C:\node
#>
[CmdletBinding()]
param([string]$TsxCmd, [string]$NodeDir, [string]$TsDir)
$ErrorActionPreference = 'Stop'
$windowsDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $windowsDir 'LspRulesContract.ps1')
$ps51 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not $TsDir) { $TsDir = Join-Path $windowsDir '..\..\semgrep-lsp' }
$tsReady = $false
if ($TsxCmd -and (Test-Path -LiteralPath $TsxCmd) -and (Test-Path -LiteralPath (Join-Path $TsDir 'lsp-rules.ts'))) { $tsReady = $true; $TsDir = (Resolve-Path -LiteralPath $TsDir).Path }

$results = New-Object System.Collections.ArrayList
function Assert-That([string]$Name, [bool]$Condition, [string]$Detail = '') {
    [void]$results.Add([ordered]@{ name = $Name; pass = $Condition; detail = $Detail })
    if (-not $Condition) { Write-Host ("FAIL  {0}  {1}" -f $Name, $Detail) -ForegroundColor Red }
}
function Skip-Test([string]$Name, [string]$Why) {
    [void]$results.Add([ordered]@{ name = $Name; pass = $null; detail = $Why })
    Write-Host ("SKIPPED  {0}  {1}" -f $Name, $Why) -ForegroundColor Yellow
}
function Limit-Text([string]$Text, [int]$Max = 300) { if ($Text.Length -le $Max) { $Text } else { $Text.Substring(0, $Max) + '...' } }

# ── 정적 점검: 구문, BOM, 금지된 명령 ───────────────────────────────────────────
$files = 'LspRulesContract.ps1', 'lsp-rules-runner.ps1', 'lsp-rules-stub.ps1', 'tests\Test-LspRulesRunner.ps1'
$forbidden = 'Invoke-Expression', 'iex', 'Invoke-WebRequest', 'Invoke-RestMethod', 'Start-BitsTransfer', 'curl', 'wget'
foreach ($f in $files) {
    $p = Join-Path $windowsDir $f
    if (-not (Test-Path -LiteralPath $p)) { Assert-That "파일 있음 ($f)" $false $p; continue }
    $errs = $null; $tokens = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errs)
    Assert-That "구문 $f ($($PSVersionTable.PSVersion))" ($errs.Count -eq 0) (($errs | ForEach-Object { "$($_.Message)@$($_.Extent.StartLineNumber)" }) -join '; ')
    $b = [IO.File]::ReadAllBytes($p)
    Assert-That "BOM $f" ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) 'Windows PowerShell 5.1 이 한글을 읽으려면 UTF-8 BOM 이 필요하다'
    Assert-That "줄바꿈이 LF 뿐이다 ($f)" (-not ([Text.Encoding]::UTF8.GetString($b).Contains("`r")))
    $hits = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | Where-Object {
            $nm = $_.GetCommandName(); $first = $_.CommandElements[0].Extent.Text.Trim('"', "'")
            ($nm -and ($forbidden -contains $nm -or $nm -match '(?i)^(semgrep|pysemgrep|semgrep-core)(\.exe)?$')) -or ($first -match '(?i)(^|[\\/])(semgrep|pysemgrep|semgrep-core)(\.exe)?$')
        } | ForEach-Object { $_.Extent.Text.Split("`n")[0].Trim() })
    Assert-That "내려받기·Invoke-Expression·semgrep 명령 호출 없음 ($f)" ($hits.Count -eq 0) ($hits -join ' | ')
}

# ── 도구 ────────────────────────────────────────────────────────────────────
function ConvertTo-SortedJson($Obj) {
    if ($null -eq $Obj) { return 'null' }
    if ($Obj -is [string]) { return (ConvertTo-Json -InputObject $Obj -Compress) }
    if ($Obj -is [bool]) { if ($Obj) { return 'true' } else { return 'false' } }
    if ($Obj -is [int] -or $Obj -is [long] -or $Obj -is [double] -or $Obj -is [decimal]) { return ([string]$Obj) }
    if ($Obj -is [System.Collections.IDictionary]) {
        $keys = @($Obj.Keys | ForEach-Object { [string]$_ } | Sort-Object { $_ } -CaseSensitive)
        $parts = New-Object System.Collections.ArrayList
        foreach ($k in $keys) { [void]$parts.Add((ConvertTo-Json -InputObject $k -Compress) + ':' + (ConvertTo-SortedJson $Obj[$k])) }
        return '{' + ($parts -join ',') + '}'
    }
    # 배열(ArrayList 포함)을 객체보다 먼저 본다: 함수가 돌려준 ArrayList 는 PSObject 로 감싸져 `-is [pscustomobject]` 도 참이 되므로 순서가 바뀌면 Capacity·Count 속성으로 풀린다.
    if ($Obj -is [System.Collections.IEnumerable]) {
        $parts = New-Object System.Collections.ArrayList
        foreach ($x in $Obj) { [void]$parts.Add((ConvertTo-SortedJson $x)) }
        return '[' + ($parts -join ',') + ']'
    }
    if ($Obj -is [pscustomobject]) {
        $keys = @($Obj.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object { $_ } -CaseSensitive)
        $parts = New-Object System.Collections.ArrayList
        foreach ($k in $keys) { [void]$parts.Add((ConvertTo-Json -InputObject $k -Compress) + ':' + (ConvertTo-SortedJson $Obj.PSObject.Properties[$k].Value)) }
        return '{' + ($parts -join ',') + '}'
    }
    return (ConvertTo-Json -InputObject ([string]$Obj) -Compress)
}
function Invoke-Tsx([string[]]$ScriptArgs) {
    $oldPath = $env:PATH
    if ($NodeDir) { $env:PATH = $NodeDir + ';' + $env:PATH }
    try { $o = & $TsxCmd @ScriptArgs 2>&1; $code = $LASTEXITCODE } finally { $env:PATH = $oldPath }
    [pscustomobject]@{ exit = $code; text = ($o | Out-String) }
}

# ═══ 1. TS ↔ PS 골든 대조 (tsx 없이): 모든 사례 ═══════════════════════════════════
$goldenPath = Join-Path $PSScriptRoot 'lsp-rules-parity.json'
# Windows PowerShell 5.1 의 ConvertFrom-Json 은 최상위 배열을 풀지 않고 한 개체로 내보낸다(7 은 푼다). -InputObject 로 받아 대입하면 두 엔진 모두 배열이 된다.
$goldenParsed = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($goldenPath, [Text.Encoding]::UTF8))
$golden = @($goldenParsed)
Assert-That '골든: 파일을 읽었고 사례가 80개를 넘으며 여섯 종류가 모두 있다' ($golden.Count -gt 80 -and @($golden | ForEach-Object { $_.kind } | Sort-Object -Unique).Count -eq 6) "count=$($golden.Count)"

function Get-ScanActual($Case) {
    $bytes = [byte[]][Convert]::FromBase64String([string]$Case.input.b64)
    $chunk = [int]$Case.input.chunk
    $s = New-LrLogScanner
    if ($bytes.Length -gt 0) {
        $step = $bytes.Length; if ($chunk -gt 0) { $step = $chunk }
        for ($at = 0; $at -lt $bytes.Length; $at += $step) {
            $n = [Math]::Min($step, $bytes.Length - $at)
            $slice = New-Object byte[] $n
            [Array]::Copy($bytes, $at, $slice, 0, $n)
            Add-LrLogBytes $s $slice $n
        }
    }
    Complete-LrLogScanner $s
    [ordered]@{ signals = @($s.signals); counters = $s.counters }
}
function Get-WatchActual($Case) {
    $w = New-LrStderrWatcher; $w.initializedSent = [bool]$Case.input.initializedSent
    $returned = New-Object System.Collections.ArrayList
    foreach ($text in @($Case.input.chunks)) { $b = [Text.Encoding]::UTF8.GetBytes([string]$text); [void]$returned.Add((Add-LrStderrChunk $w $b $b.Length)) }
    if ($Case.input.end) { [void]$returned.Add((Complete-LrStderrWatcher $w)) }
    [ordered]@{ returned = $returned; hit = $w.hit; scannedOpenDocumentsSeen = [bool]$w.scannedOpenDocumentsSeen; initErrorLogged = [bool]$w.initErrorLogged }
}
function Get-TrackActual($Case) {
    $t = New-LrStdoutTracker; $t.initializedSent = [bool]$Case.input.initializedSent
    $aborts = New-Object System.Collections.ArrayList
    foreach ($m in @($Case.input.messages)) { [void]$aborts.Add((Invoke-LrStdoutTracker $t $m)) }
    $a = $t.analysis
    $allowed = 0; foreach ($r in $a.serverRequests) { if ($r.allowed) { $allowed++ } }
    [ordered]@{
        aborts = $aborts; rulesRefreshedCount = $a.rulesRefreshedCount; rulesRefreshedSeen = [bool](Test-LrRulesRefreshedSeen $t); serverRequestCount = $a.serverRequestCount; allowedRequests = $allowed
        diagnosticsCount = $a.diagnosticsCount; progressNotifications = $a.progressNotifications; otherNotifications = $a.otherNotifications; errorNotifications = $a.errorNotifications
        initResponseSeen = ($null -ne $a.initMessage); initDuplicate = [bool]$a.initDuplicate; shutdownResponseSeen = [bool]$a.shutdownResponseSeen
        unmatchedResponses = $a.unmatchedResponses; messagesWithoutMethodOrId = $a.messagesWithoutMethodOrId
    }
}
function Get-OutboundActual($Case) {
    $label = [string]$Case.input.label
    try { Assert-LrOutbound -Label $label -Message $Case.input.message; 'ok' } catch { 'throws' }
}

$mismatch = 0
foreach ($c in $golden) {
    $actual = $null
    try {
        switch -CaseSensitive ([string]$c.kind) {
            'log-scan' { $actual = Get-ScanActual $c }
            'stderr-watch' { $actual = Get-WatchActual $c }
            'stdout-track' { $actual = Get-TrackActual $c }
            'progress-create' { $actual = [bool](Test-LrValidProgressCreate $c.input) }
            'root-violation' { $actual = [bool](Test-LrRootViolation ([string]$c.input.role) ([string]$c.input.relativePath)) }
            'outbound' { $actual = Get-OutboundActual $c }
        }
    } catch { $actual = "EXCEPTION: $($_.Exception.Message)" }
    $a = ConvertTo-SortedJson $actual; $e = ConvertTo-SortedJson $c.expected
    $same = ($a -ceq $e)
    if (-not $same) { $mismatch++ }
    Assert-That "골든 대조: $($c.id)" $same ("PS: " + (Limit-Text $a) + " / TS: " + (Limit-Text $e))
}
Assert-That "골든: 모든 사례(총 $($golden.Count))에서 PS 출력이 TS 기대값과 같다" ($mismatch -eq 0) "불일치 $mismatch 건"

# ═══ 2. 계약 자체 점검 (TS 없이) ═════════════════════════════════════════════════
$workA = 'C:\work\rules-1'
$layoutA = Get-LrLayout -Work $workA
Assert-That '계약: 한도 — 150초 / 초기화 60초 / 장벽 60초 / 장벽 뒤 감시 2초 / 종료 30초 / stdout 1 MiB / stderr 256 KiB' (($Script:LrLimits.totalMs -eq 150000) -and ($Script:LrLimits.initMs -eq 60000) -and ($Script:LrLimits.rulesMs -eq 60000) -and ($Script:LrLimits.settleMs -eq 2000) -and ($Script:LrLimits.exitMs -eq 30000) -and ($Script:LrLimits.maxStdoutBytes -eq 1048576) -and ($Script:LrLimits.maxStderrBytes -eq 262144))
Assert-That '계약: 인자는 [lsp,--debug], 보내는 순서는 initialize→initialized→shutdown→exit, 프로브는 233바이트·고정 해시' (($Script:LrArgs -join ',') -ceq 'lsp,--debug' -and ($Script:LrSendOrder -join ',') -ceq 'initialize,initialized,shutdown,exit' -and $Script:LrProbeBytes -eq 233 -and $Script:LrProbeSha256 -ceq 'd5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145' -and $Script:LrProbeFile -ceq 'lsp-rules-1-probe.yaml')
$envA = New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layoutA -Url 'http://127.0.0.1:41999'
Assert-That '계약: 환경 이름은 11개 그대로이고 SEMGREP_LOG_SRCS·토큰·SEMGREP_ENABLE_* 가 없다 (소유자 결정 D5)' ($envA.Count -eq 11 -and @($envA.Keys | Where-Object { $_ -match 'LOG_SRCS|TOKEN|ENABLE_' }).Count -eq 0 -and @($Script:LspMinEnvNames | Where-Object { $_ -match 'LOG_SRCS|TOKEN|ENABLE_' }).Count -eq 0)
Assert-That '계약: initialize 메시지는 규칙 폴더 하나(rules-probe)를 configuration 으로 주고 id 가 lsp-rules-init-1 이다' ((New-LrInitializeMessage -Layout $layoutA).id -ceq 'lsp-rules-init-1' -and (New-LrInitializeMessage -Layout $layoutA).params.initializationOptions.scan.configuration[0] -ceq 'C:\work\rules-1\lsp-state\rules-probe' -and @((New-LrInitializeMessage -Layout $layoutA).params.initializationOptions.scan.configuration).Count -eq 1)
$okAll = $true
foreach ($pair in @(@('initialize', (New-LrInitializeMessage -Layout $layoutA)), @('initialized', (New-LrInitializedMessage)), @('shutdown', (New-LrShutdownMessage)), @('exit', (New-LrExitMessage)))) {
    try { Assert-LrOutbound -Label $pair[0] -Message $pair[1] } catch { $okAll = $false }
}
Assert-That '쓰기 방어선: 계약 함수가 만든 네 메시지는 모두 통과한다' $okAll
$badOut = @(
    @{ n = 'initialized 에 params 없음'; l = 'initialized'; m = [ordered]@{ jsonrpc = '2.0'; method = 'initialized' } },
    @{ n = 'initialized 에 비지 않은 params'; l = 'initialized'; m = [ordered]@{ jsonrpc = '2.0'; method = 'initialized'; params = [ordered]@{ a = 1 } } },
    @{ n = 'initialized 에 id'; l = 'initialized'; m = [ordered]@{ jsonrpc = '2.0'; id = 1; method = 'initialized'; params = [ordered]@{} } },
    @{ n = 'didOpen'; l = 'initialized'; m = [ordered]@{ jsonrpc = '2.0'; method = 'textDocument/didOpen'; params = [ordered]@{} } },
    @{ n = 'workspace 폴더 변경'; l = 'initialized'; m = [ordered]@{ jsonrpc = '2.0'; method = 'workspace/didChangeWorkspaceFolders'; params = [ordered]@{} } },
    @{ n = 'semgrep/scanWorkspace'; l = 'initialized'; m = [ordered]@{ jsonrpc = '2.0'; method = 'semgrep/scanWorkspace'; params = [ordered]@{} } },
    @{ n = 'semgrep/refreshRules'; l = 'initialized'; m = [ordered]@{ jsonrpc = '2.0'; method = 'semgrep/refreshRules'; params = [ordered]@{} } },
    @{ n = 'debug/echo'; l = 'shutdown'; m = [ordered]@{ jsonrpc = '2.0'; id = 'x'; method = 'debug/echo' } },
    @{ n = '서버 요청에 대한 응답 (id 만 있는 결과)'; l = 'exit'; m = [ordered]@{ jsonrpc = '2.0'; id = 7; result = $null } },
    @{ n = '서버 요청에 대한 오류 응답'; l = 'exit'; m = [ordered]@{ jsonrpc = '2.0'; id = 7; error = [ordered]@{ code = -32601; message = 'no' } } },
    @{ n = 'exit 에 params'; l = 'exit'; m = [ordered]@{ jsonrpc = '2.0'; method = 'exit'; params = [ordered]@{} } },
    @{ n = '알 수 없는 라벨'; l = 'initialised'; m = [ordered]@{ jsonrpc = '2.0'; method = 'initialised'; params = [ordered]@{} } }
)
foreach ($o in $badOut) {
    $threw = $false; try { Assert-LrOutbound -Label $o.l -Message $o.m } catch { $threw = $true }
    Assert-That "쓰기 방어선이 거절한다: $($o.n)" $threw
}
$lim = Resolve-LrLimits ([ordered]@{ rulesMs = 120000 }); Assert-That '한도 해석: 장벽 한도를 올리면 LIMIT_ABOVE_CAP:rulesMs' (@($lim.problems) -ccontains 'LIMIT_ABOVE_CAP:rulesMs')
$lim = Resolve-LrLimits ([ordered]@{ settleMs = 5000 }); Assert-That '한도 해석: 장벽 뒤 감시를 늘리면 LIMIT_ABOVE_CAP:settleMs' (@($lim.problems) -ccontains 'LIMIT_ABOVE_CAP:settleMs')
$lim = Resolve-LrLimits ([ordered]@{ barrierMs = 10 }); Assert-That '한도 해석: 모르는 한도는 LIMIT_UNKNOWN' (@($lim.problems) -ccontains 'LIMIT_UNKNOWN:barrierMs')
$lim = Resolve-LrLimits ([ordered]@{ rulesMs = 1500; settleMs = 400 }); Assert-That '한도 해석: 낮추는 것은 받는다' (@($lim.problems).Count -eq 0 -and $lim.limits.rulesMs -eq 1500 -and $lim.limits.settleMs -eq 400 -and $lim.limits.totalMs -eq 150000)
foreach ($t in @(@('auto', $true), @('AUTO', $true), @('r2c', $true), @('policy', $true), @('supply-chain', $true), @('hooks', $true), @('r/python', $true), @('P/security', $true), @('s/x', $true), @('http://x', $true), @('HTTPS://x', $true), @('C:\rules', $false), @('semgrep-rules/javascript', $false), @('autox', $false))) {
    Assert-That "규칙 출처 검사: '$($t[0])' → 네트워크 출처 $($t[1])" ([bool](Test-LrNetworkRuleSource $t[0]) -eq $t[1])
}
Assert-That '경로 검사: 드라이브 문자로 시작하는 절대 경로만 받는다 (UNC·루트 상대·상대 경로·`C:a` 거절)' ((Test-LrDriveAbsolute 'C:\a') -and (Test-LrDriveAbsolute 'c:/a') -and -not (Test-LrDriveAbsolute '\\srv\share') -and -not (Test-LrDriveAbsolute '\a') -and -not (Test-LrDriveAbsolute 'a\b') -and -not (Test-LrDriveAbsolute 'C:a'))
Assert-That '경로 검사: 금지 문구(download·registry·scanning·no rules 등)가 든 경로는 거절한다' (($null -ne (Find-LrForbiddenFragment 'C:\work\Downloads\x')) -and ($null -ne (Find-LrForbiddenFragment 'C:\a\Registry')) -and ($null -ne (Find-LrForbiddenFragment 'C:\x\No Rules\y')) -and ($null -eq (Find-LrForbiddenFragment 'C:\ok\path')))

# 서수 비교. PowerShell 의 -ceq/-cne/-ccontains 는 서수 비교가 아니라서 소프트 하이픈(U+00AD)·NUL 이 낀 문자열을 같다고 본다. 서버·요청·결과·파일 시스템에서 온 문자열은 이 함수들로 비교한다.
# 소스에는 이상한 문자를 직접 쓰지 않고 [char] 로 만든다.
$shy = [string][char]0x00AD
$nulChar = [string][char]0
Assert-That '서수 비교(Test-LrOrdinalEqual): 같은 문자열은 같고, 대소문자·길이가 다르면 다르다' ((Test-LrOrdinalEqual 'ab' 'ab') -and -not (Test-LrOrdinalEqual 'ab' 'aB') -and -not (Test-LrOrdinalEqual 'ab' 'abc') -and (Test-LrOrdinalEqual '' ''))
Assert-That '서수 비교(Test-LrOrdinalEqual): 소프트 하이픈·NUL 이 끼어 있으면 같지 않다' (-not (Test-LrOrdinalEqual 'ab' ('a' + $shy + 'b')) -and -not (Test-LrOrdinalEqual ('a' + $shy + 'b') 'ab') -and -not (Test-LrOrdinalEqual 'ab' ('a' + $nulChar + 'b')) -and -not (Test-LrOrdinalEqual 'ab' ('ab' + $nulChar)))
Assert-That '서수 비교(Test-LrOrdinalEqual): 둘 다 문자열이어야 한다 — $null·숫자는 서로도 같다고 하지 않는다' (-not (Test-LrOrdinalEqual $null $null) -and -not (Test-LrOrdinalEqual 1 1) -and -not (Test-LrOrdinalEqual 'a' $null) -and -not (Test-LrOrdinalEqual $null 'a'))
Assert-That '서수 비교(Test-LrOrdinalEqualCI): 대소문자는 무시하고 소프트 하이픈·NUL 은 무시하지 않는다' ((Test-LrOrdinalEqualCI 'Lsp-Rules' 'lsp-rules') -and -not (Test-LrOrdinalEqualCI 'ab' ('a' + $shy + 'b')) -and -not (Test-LrOrdinalEqualCI 'ab' ('ab' + $nulChar)) -and -not (Test-LrOrdinalEqualCI $null 'a'))
Assert-That '서수 소속(Test-LrOrdinalIn): 목록 안의 문자열만 참이고, 소프트 하이픈·NUL 이 낀 것·대소문자가 다른 것·$null·빈 목록은 거짓이다' ((Test-LrOrdinalIn 'initialized' $Script:LrSendOrder) -and -not (Test-LrOrdinalIn ('init' + $shy + 'ialized') $Script:LrSendOrder) -and -not (Test-LrOrdinalIn ('exit' + $nulChar) $Script:LrSendOrder) -and -not (Test-LrOrdinalIn 'Initialized' $Script:LrSendOrder) -and -not (Test-LrOrdinalIn $null $Script:LrSendOrder) -and -not (Test-LrOrdinalIn 'x' @()) -and -not (Test-LrOrdinalIn 'x' $null))
$jsonShyName = ConvertFrom-Json -InputObject ('{"jsonrpc":"2.0","met' + $shy + 'hod":"initialized","id":"x"}')
Assert-That '멤버 이름(Get-LrMember·Test-LrMember): 소프트 하이픈이 낀 이름은 같은 이름이 아니다 (JSON 객체와 해시테이블 모두)' (($null -eq (Get-LrMember $jsonShyName 'method')) -and -not (Test-LrMember $jsonShyName 'method') -and (Test-LrMember $jsonShyName 'id') -and ($null -eq (Get-LrMember ([ordered]@{ ('me' + $nulChar + 'thod') = 'x' }) 'method')) -and (Get-LrMessageKind $jsonShyName) -ceq 'response')
Assert-That '멤버 이름: 정확한 이름은 읽는다' ((Get-LrMember (ConvertFrom-Json -InputObject '{"method":"exit","id":7}') 'method') -ceq 'exit' -and (Test-LrMember ([ordered]@{ method = 'x' }) 'method'))

# 끝 고정: .NET 의 `$` 는 끝의 개행 하나 앞에서도 맞는다(TS 는 거절한다). 요청의 수신기 주소 검사는 \z 라서 개행이 붙은 주소를 거절한다.
$nl = [string][char]10
$envClean = New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layoutA -Url 'http://127.0.0.1:41999'
$envNewline = New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layoutA -Url ('http://127.0.0.1:41999' + $nl)
$envLongPort = New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layoutA -Url 'http://127.0.0.1:419999'
$envWithPath = New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layoutA -Url 'http://127.0.0.1:41999/x'
# Get-LrEnvRefusals 는 `, @(...)` 로 돌려주므로 @(...) 로 다시 감싸지 않고 그대로 받는다(감싸면 배열 안의 배열이 된다).
$refClean = Get-LrEnvRefusals $envClean $layoutA
$refNewline = Get-LrEnvRefusals $envNewline $layoutA
$refLongPort = Get-LrEnvRefusals $envLongPort $layoutA
$refWithPath = Get-LrEnvRefusals $envWithPath $layoutA
Assert-That '수신기 주소 검사: 정상 주소는 ENV_URL_NOT_LOOPBACK 이 아니다' ($refClean -cnotcontains 'ENV_URL_NOT_LOOPBACK') ($refClean -join ',')
Assert-That '수신기 주소 검사: 주소 뒤에 개행이 붙으면 거절한다 (끝 고정이 $ 가 아니라 \z 다)' ($refNewline -ccontains 'ENV_URL_NOT_LOOPBACK') ($refNewline -join ',')
Assert-That '수신기 주소 검사: 포트가 6자리이거나 경로가 붙어도 거절한다' (($refLongPort -ccontains 'ENV_URL_NOT_LOOPBACK') -and ($refWithPath -ccontains 'ENV_URL_NOT_LOOPBACK')) (($refLongPort -join ',') + ' / ' + ($refWithPath -join ','))

# ═══ 3. 계약(PS) ↔ 실제 TS 모듈 대조 (tsx 가 있을 때만) ═══════════════════════════
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('bosang-lr-test-' + [guid]::NewGuid().ToString('N').Substring(0, 12))
[void][IO.Directory]::CreateDirectory($sandbox)
$bridge = Join-Path $PSScriptRoot 'lsp-rules-bridge.mts'
if (-not $tsReady) { Skip-Test '계약(PS) ↔ 실제 TS lsp-rules.ts 대조' 'tsx 또는 scripts/semgrep-lsp 경로가 없어 실행하지 않았다(통과로 세지 않는다)' }
else {
    $r = Invoke-Tsx @($bridge, $TsDir, 'contract', $workA)
    $ts = $null; try { $ts = $r.text | ConvertFrom-Json } catch { }
    Assert-That '계약(PS) ↔ TS: tsx 로 lsp-rules.ts 를 불러 값을 얻었다' ($r.exit -eq 0 -and $null -ne $ts) ("exit=$($r.exit) " + (Limit-Text $r.text))
    if ($ts) {
        $psConsts = [ordered]@{
            args = @($Script:LrArgs); initId = $Script:LrInitId; shutdownId = $Script:LrShutdownId; probeFile = $Script:LrProbeFile; probeSha = $Script:LrProbeSha256; probeBytes = $Script:LrProbeBytes
            sendOrder = @($Script:LrSendOrder); limits = $Script:LrLimits; progressMethod = $Script:LrProgressCreateMethod; maxProgress = $Script:LrMaxProgressCreate; refreshedMethod = $Script:LrRulesRefreshedMethod
            progressNote = $Script:LrProgressMethod; diagnostics = $Script:LrPublishDiagnosticsMethod; forbiddenFragments = @($Script:LrPathForbiddenFragments); requiredBare = @($Script:LrRequiredBareKeys)
            forbiddenScan = @($Script:LrForbiddenScanKeys); forbiddenNetwork = @($Script:LrForbiddenNetworkKeys); preInitialized = @($Script:LrPreInitializedKeys); envNames = @($Script:LspMinEnvNames)
        }
        $pairs = @(
            @('consts', $psConsts), @('layout', $layoutA), @('init', (New-LrInitializeMessage -Layout $layoutA)), @('initialized', (New-LrInitializedMessage)), @('shutdown', (New-LrShutdownMessage)), @('exit', (New-LrExitMessage)),
            @('env', (New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layoutA -Url 'http://127.0.0.1:41999'))
        )
        foreach ($pr in $pairs) { $a = ConvertTo-SortedJson $pr[1]; $b = ConvertTo-SortedJson $ts.($pr[0]); Assert-That "계약(PS) ↔ TS: $($pr[0]) 가 같다" ($a -ceq $b) ("PS: " + (Limit-Text $a) + " / TS: " + (Limit-Text $b)) }
        $overrides = @([ordered]@{}, [ordered]@{ rulesMs = 1000 }, [ordered]@{ rulesMs = 120000 }, [ordered]@{ settleMs = 5000 }, [ordered]@{ settleMs = 0 }, [ordered]@{ totalMs = 999999 }, [ordered]@{ barrierMs = 10 }, [ordered]@{ initMs = 'x' }, [ordered]@{ exitMs = 30000; settleMs = 2000 })
        $psLimits = @(); foreach ($o in $overrides) { $x = Resolve-LrLimits $o; $psLimits += , ([ordered]@{ limits = $x.limits; problems = @($x.problems) }) }
        $a = ConvertTo-SortedJson $psLimits; $b = ConvertTo-SortedJson $ts.limits; Assert-That '계약(PS) ↔ TS: 한도 해석 표가 같다 (상향·0·모르는 이름·문자열)' ($a -ceq $b) ("PS: " + (Limit-Text $a) + " / TS: " + (Limit-Text $b))
        $psNet = @(); foreach ($row in $ts.network) { $psNet += , ([ordered]@{ s = [string]$row.s; v = [bool](Test-LrNetworkRuleSource ([string]$row.s)) }) }
        $a = ConvertTo-SortedJson $psNet; $b = ConvertTo-SortedJson $ts.network; Assert-That '계약(PS) ↔ TS: 네트워크 규칙 출처 표가 같다' ($a -ceq $b) ("PS: " + (Limit-Text $a) + " / TS: " + (Limit-Text $b))
        $psFrag = @(); foreach ($row in $ts.fragments) { $psFrag += , ([ordered]@{ s = [string]$row.s; v = (Find-LrForbiddenFragment ([string]$row.s)) }) }
        $a = ConvertTo-SortedJson $psFrag; $b = ConvertTo-SortedJson $ts.fragments; Assert-That '계약(PS) ↔ TS: 금지 문구 검사 표가 같다' ($a -ceq $b) ("PS: " + (Limit-Text $a) + " / TS: " + (Limit-Text $b))
        $psDrv = @(); foreach ($row in $ts.drives) { $psDrv += , ([ordered]@{ s = [string]$row.s; v = [bool](Test-LrDriveAbsolute ([string]$row.s)) }) }
        $a = ConvertTo-SortedJson $psDrv; $b = ConvertTo-SortedJson $ts.drives; Assert-That '계약(PS) ↔ TS: 드라이브 절대 경로 표가 같다' ($a -ceq $b) ("PS: " + (Limit-Text $a) + " / TS: " + (Limit-Text $b))
    }
}

# ═══ 4. 함수 단위 확인: Send-LrMessage, Test-LrInitGate ═══════════════════════════
$runnerPath = Join-Path $sandbox 'lsp-rules-runner.ps1'
foreach ($f in 'LspMinContract.ps1', 'LspRulesContract.ps1', 'lsp-min-runner.ps1', 'lsp-rules-runner.ps1', 'lsp-rules-stub.ps1', 'version-runner.ps1', 'version-stub.ps1') { Copy-Item -LiteralPath (Join-Path $windowsDir $f) -Destination $sandbox }
$probeSource = Join-Path $windowsDir '..\..\semgrep-lsp\data\lsp-rules-1-probe.yaml'
$probeBytes = $null; if (Test-Path -LiteralPath $probeSource) { $probeBytes = [IO.File]::ReadAllBytes($probeSource) }
Assert-That '프로브: 저장소의 프로브 규칙 파일이 233바이트이고 해시가 계약의 고정값과 같다' ($null -ne $probeBytes -and $probeBytes.Length -eq 233 -and (Get-LrSha256Hex $probeBytes) -ceq $Script:LrProbeSha256) "path=$probeSource"
if ($null -eq $probeBytes) { $probeBytes = New-Object byte[] 233 }
$probeB64 = [Convert]::ToBase64String($probeBytes)

function Invoke-UnitTests {
    . $runnerPath -LoadFunctionsOnly
    function New-FakeStdin([string]$FailAt) {
        $o = New-Object psobject -Property @{ WriteCalls = 0; FlushCalls = 0; Fail = $FailAt }
        $o | Add-Member -MemberType ScriptMethod -Name Write -Value { param($b, $off, $n) $this.WriteCalls++; if ($this.Fail -eq 'write') { throw (New-Object IO.IOException 'The pipe is being closed.') } }
        $o | Add-Member -MemberType ScriptMethod -Name Flush -Value { $this.FlushCalls++ }
        $o
    }
    function New-FakeCtx($Stdin) {
        @{ sw = [Diagnostics.Stopwatch]::StartNew(); sends = (New-Object System.Collections.ArrayList); also = (New-Object System.Collections.ArrayList); trigger = $null; abort = $null; immediate = $false; stdinStream = $Stdin; errState = @{ total = 1234 }; outState = @{ total = 56 } }
    }
    $lay = Get-LrLayout -Work 'C:\work\run-1'
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake
    $s1 = Send-LrMessage 'initialized' (New-LrInitializedMessage)
    Assert-That 'Send-LrMessage: initialized 를 보내면 한 번 쓰고 기록한다 (쓰기 직전 읽은 stderr·stdout 바이트 수 포함)' ($s1 -eq $true -and $fake.WriteCalls -eq 1 -and $Ctx.sends.Count -eq 1 -and $Ctx.sends[0].ok -eq $true -and $Ctx.sends[0].stderrBytesAtSend -eq 1234 -and $Ctx.sends[0].stdoutBytesAtSend -eq 56)
    $threw = $false; try { [void](Send-LrMessage 'initialized' (New-LrInitializedMessage)) } catch { $threw = $true }
    Assert-That 'Send-LrMessage: initialized 를 두 번째로 보내려 하면 던지고 아무것도 더 쓰지 않는다' ($threw -and $fake.WriteCalls -eq 1 -and $Ctx.sends.Count -eq 1)
    foreach ($bad in @(@('exit', [ordered]@{ jsonrpc = '2.0'; id = 7; result = $null }, '서버 요청에 대한 응답'), @('initialized', [ordered]@{ jsonrpc = '2.0'; method = 'textDocument/didOpen'; params = [ordered]@{} }, 'didOpen'), @('initialized', [ordered]@{ jsonrpc = '2.0'; method = 'semgrep/scanWorkspace'; params = [ordered]@{} }, 'scanWorkspace'))) {
        $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake
        $threw = $false; try { [void](Send-LrMessage $bad[0] $bad[1]) } catch { $threw = $true }
        Assert-That "Send-LrMessage: 허용 밖 메시지($($bad[2]))는 방어선이 던지고 스트림에 아무것도 쓰지 않는다" ($threw -and $fake.WriteCalls -eq 0 -and $Ctx.sends.Count -eq 0)
    }
    $fake = New-FakeStdin 'write'; $Ctx = New-FakeCtx $fake
    $sent = Send-LrMessage 'initialize' (New-LrInitializeMessage -Layout $lay)
    Assert-That 'Send-LrMessage: 쓰기가 실패하면 false 를 돌려주고 STDIN_ERROR 로 곧바로 끝내기로 한다' ($sent -eq $false -and $Ctx.trigger -ceq 'STDIN_ERROR' -and $Ctx.immediate -eq $true -and $Ctx.sends[0].ok -eq $false)
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake; Add-LspMinTrigger 'LIVE_ABORT' 'A7' 'CANCELLED'
    $sent = Send-LrMessage 'shutdown' (New-LrShutdownMessage)
    Assert-That 'Send-LrMessage: 즉시 종료 사유가 이미 걸렸으면 아무것도 쓰지 않고 송신 기록도 남기지 않는다' ($sent -eq $false -and $fake.WriteCalls -eq 0 -and $Ctx.sends.Count -eq 0)

    $goodBody = '{"jsonrpc":"2.0","id":"lsp-rules-init-1","result":{"capabilities":{"textDocumentSync":1},"serverInfo":{"name":"Semgrep","version":"9.9.9"}}}'
    $gateCases = @(
        @{ n = '정상 + 버전 일치'; j = $goodBody; v = '9.9.9'; log = $false; ok = $true },
        @{ n = '서버 버전이 핀과 다르다'; j = $goodBody; v = '1.0.0'; log = $false; ok = $false },
        @{ n = '핀 버전을 받지 못했다'; j = $goodBody; v = $null; log = $false; ok = $false },
        @{ n = '초기화 오류 로그가 있다'; j = $goodBody; v = '9.9.9'; log = $true; ok = $false },
        @{ n = 'serverInfo 가 없어 버전을 알 수 없다'; j = '{"jsonrpc":"2.0","id":"lsp-rules-init-1","result":{"capabilities":{}}}'; v = '9.9.9'; log = $false; ok = $false },
        @{ n = 'serverInfo.version 이 문자열이 아니다'; j = '{"jsonrpc":"2.0","id":"lsp-rules-init-1","result":{"capabilities":{},"serverInfo":{"name":"Semgrep","version":9}}}'; v = '9'; log = $false; ok = $false },
        @{ n = 'serverInfo.name 이 없다'; j = '{"jsonrpc":"2.0","id":"lsp-rules-init-1","result":{"capabilities":{},"serverInfo":{"version":"9.9.9"}}}'; v = '9.9.9'; log = $false; ok = $false },
        @{ n = 'result 안의 InitializeError'; j = '{"jsonrpc":"2.0","id":"lsp-rules-init-1","result":{"retry":false}}'; v = '9.9.9'; log = $false; ok = $false },
        @{ n = 'JSON-RPC error'; j = '{"jsonrpc":"2.0","id":"lsp-rules-init-1","error":{"code":-1,"message":"x"}}'; v = '9.9.9'; log = $false; ok = $false },
        @{ n = 'capabilities 가 객체가 아니다'; j = '{"jsonrpc":"2.0","id":"lsp-rules-init-1","result":{"capabilities":[],"serverInfo":{"name":"Semgrep","version":"9.9.9"}}}'; v = '9.9.9'; log = $false; ok = $false },
        @{ n = '응답이 아직 없다'; j = $null; v = '9.9.9'; log = $false; ok = $false },
        # 서수 비교: 소프트 하이픈(U+00AD)·NUL 이 끼어 있으면 핀과 같은 버전이 아니다(-cne 는 같다고 본다). 소스에는 이상한 문자를 쓰지 않고 [char] 로 만든다.
        @{ n = '서버 버전 끝에 소프트 하이픈이 붙었다 (9.9.9 + U+00AD) — 핀 9.9.9 와 다르다'; j = $goodBody.Replace('"version":"9.9.9"', ('"version":"9.9.9' + [string][char]0x00AD + '"')); v = '9.9.9'; log = $false; ok = $false },
        @{ n = '서버 버전 가운데 NUL 이 끼었다 (9.9, U+0000, .9) — 핀 9.9.9 와 다르다'; j = $goodBody.Replace('"version":"9.9.9"', ('"version":"9.9' + [string][char]92 + 'u0000.9"')); v = '9.9.9'; log = $false; ok = $false },
        @{ n = '핀 버전 끝에 소프트 하이픈이 붙었다 — 서버 9.9.9 와 다르다'; j = $goodBody; v = ('9.9.9' + [string][char]0x00AD); log = $false; ok = $false },
        @{ n = '핀 버전 끝에 NUL 이 붙었다 — 서버 9.9.9 와 다르다'; j = $goodBody; v = ('9.9.9' + [string][char]0); log = $false; ok = $false }
    )
    foreach ($g in $gateCases) {
        $msg = $null; if ($g.j) { $msg = $g.j | ConvertFrom-Json }
        $r = Test-LrInitGate $msg $g.v $g.log
        Assert-That "initialized 조건(Test-LrInitGate): $($g.n) → $($g.ok)" ([bool]$r.ok -eq $g.ok) (@($r.reasons) -join ',')
    }
    Remove-Variable Ctx -ErrorAction SilentlyContinue

    # 만들기 전 검사 함수 자체(Test-LrChainHasReparsePoint): 이미 있는 조각 중 하나라도 junction 이면 참, 없는 조각에서는 멈추고 거짓, 작업 폴더 밖의 대상은 참.
    $cw = Join-Path $sandbox 'chain-unit'; $cl = Get-LrLayout -Work $cw
    Assert-That '만들기 전 검사: 아직 아무것도 없는 배치에는 junction 이 없다' (-not (Test-LrChainHasReparsePoint $cw $cl.rulesDir))
    Assert-That '만들기 전 검사: 대상이 작업 폴더 아래가 아니면 거절한다 (다른 폴더, 이름만 같은 형제 폴더)' ((Test-LrChainHasReparsePoint $cw (Join-Path $sandbox 'elsewhere\x')) -and (Test-LrChainHasReparsePoint $cw ($cw + '-sibling\x')))
    [void][IO.Directory]::CreateDirectory($cw)
    $cOut = Join-Path $sandbox 'chain-unit-outside'; [void][IO.Directory]::CreateDirectory($cOut)
    $cLinkOk = $true; try { [void](New-Item -ItemType Junction -Path $cl.stateDir -Target $cOut -ErrorAction Stop) } catch { $cLinkOk = $false }
    if (-not $cLinkOk) { Skip-Test '만들기 전 검사: 중간 조각(lsp-state)이 junction 인 배치' 'junction 을 만들 수 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        Assert-That '만들기 전 검사: 중간 조각(lsp-state)이 junction 이면 그 아래 대상(rules-probe·home·tmp)에 대해 참이다' ((Test-LrChainHasReparsePoint $cw $cl.rulesDir) -and (Test-LrChainHasReparsePoint $cw $cl.homeDir) -and (Test-LrChainHasReparsePoint $cw $cl.tmpDir))
        Assert-That '만들기 전 검사: junction 인 조각 자신도 참이고, 그 조각을 지나지 않는 대상(ws)은 거짓이다' ((Test-LrChainHasReparsePoint $cw $cl.stateDir) -and -not (Test-LrChainHasReparsePoint $cw $cl.workspace))
        Assert-That '만들기 전 검사는 아무것도 만들지 않는다 (junction 의 대상 폴더가 비어 있고 ws 도 없다)' ((@(Get-ChildItem -LiteralPath $cOut -Force).Count -eq 0) -and -not (Test-Path -LiteralPath $cl.workspace))
    }
}
Invoke-UnitTests

# ═══ 5. 러너 end-to-end ═════════════════════════════════════════════════════════
$holderMarker = 'Start-Sleep -Seconds 91'
function Get-HolderPids { @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$holderMarker*" } | ForEach-Object { [int]$_.ProcessId }) }
function Get-PingPids { @(Get-CimInstance Win32_Process -Filter "Name='PING.EXE'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*-n 8 127.0.0.1*' } | ForEach-Object { [int]$_.ProcessId }) }
$holdersBefore = Get-HolderPids; $pingsBefore = Get-PingPids

$fakeBinDir = Join-Path $sandbox 'Scripts'; [void][IO.Directory]::CreateDirectory($fakeBinDir)
$fakeSemgrep = Join-Path $fakeBinDir 'semgrep.exe'
Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32\whoami.exe') -Destination $fakeSemgrep      # 내용은 whoami.exe. 이름만 semgrep.exe 인 무해한 사본
$Script:RunCounter = 0
$collected = New-Object System.Collections.ArrayList
$URL = 'http://127.0.0.1:41999'
$stubScript = Join-Path $sandbox 'lsp-rules-stub.ps1'

function Invoke-Rules {
    param(
        [string]$Mode = 'stub', [string]$Scenario = 'ok', $Limits = $null, [scriptblock]$Mutate = $null, [int]$AbortAfterMs = 0, [string]$AbortContent = '',
        [string]$Exe = $ps51, $Args0 = $null, [string]$Name = '', $ExpectedVersion = '9.9.9', [switch]$FullLimits
    )
    $Script:RunCounter++
    $work = Join-Path $sandbox ('w' + $Script:RunCounter)
    $reqDir = Join-Path $sandbox ('r' + $Script:RunCounter); [void][IO.Directory]::CreateDirectory($reqDir)
    $layout = Get-LrLayout -Work $work
    $envT = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $layout -Url $URL
    # 시험을 빠르게 하려고 장벽 뒤 감시를 줄인다(줄이는 것은 허용된다). -FullLimits 는 한도를 하나도 주지 않아 기본값(장벽 뒤 2초 포함)을 그대로 쓴다.
    $lim = [ordered]@{}
    if (-not $FullLimits) { $lim['settleMs'] = 400 }
    if ($Limits) { foreach ($k in $Limits.Keys) { $lim[$k] = $Limits[$k] } }
    if ($null -eq $Args0) { $Args0 = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', $stubScript, $Scenario) }
    $resFile = Join-Path $reqDir 'lsp-rules-result.json'
    $req = [ordered]@{ runToken = [guid]::NewGuid().ToString('N'); mode = $Mode; exe = $Exe; args = @($Args0); layout = $layout; env = $envT; limits = $lim; expectedVersion = $ExpectedVersion; probeB64 = $probeB64; resultFile = $resFile }
    $abortFile = Join-Path $reqDir 'abort.flag'
    if ($AbortAfterMs -gt 0) { $req.abortFile = $abortFile }
    if ($Mutate) { & $Mutate $req }
    $reqFile = Join-Path $reqDir 'request.json'
    [IO.File]::WriteAllText($reqFile, ($req | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath $ps51 -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"{0}"' -f $runnerPath), '-RequestFile', ('"{0}"' -f $reqFile)) -PassThru -WindowStyle Hidden
    if ($AbortAfterMs -gt 0) { Start-Sleep -Milliseconds $AbortAfterMs; [IO.File]::WriteAllText($abortFile, $AbortContent + "`n") }
    $proc.WaitForExit()
    $sw.Stop()
    $r = $null; if (Test-Path -LiteralPath $resFile) { $r = Get-Content -LiteralPath $resFile -Raw -Encoding UTF8 | ConvertFrom-Json }
    if ($Name -and $r) { [void]$collected.Add([ordered]@{ name = $Name; path = $resFile; work = $work }) }
    [pscustomobject]@{ exit = $proc.ExitCode; wallMs = $sw.ElapsedMilliseconds; result = $r; layout = $layout; work = $work; token = $req.runToken }
}
function Get-Received($Run) { $f = Join-Path $Run.layout.stateDir 'received.log'; if (Test-Path -LiteralPath $f) { @(Get-Content -LiteralPath $f -Encoding UTF8 | Where-Object { $_ }) } else { @() } }
function Get-SentLabels($Run) { (@($Run.result.sends | ForEach-Object { $_.label }) -join ',') }
function Test-PidAlive([int]$ProcessId) { [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) }
function Get-Sent($Run, [string]$Label) { @($Run.result.sends | Where-Object { $_.label -ceq $Label })[0] }

$happySent = 'initialize,initialized,shutdown,exit'
$onlyInit = 'initialize'
$initAndInitialized = 'initialize,initialized'
# 시나리오 표. sent: 러너가 보낸 메시지(이 순서). trig: 러너의 trigger. abort: 중단 조건. kill: 강제 종료 횟수. close: 러너가 stdin 을 닫았는가. exit: 서버 종료 코드. verdict/verdictLike: TS 판정.
$cases = @(
    # 정상과 정상 종료까지 가는 로그 변형
    @{ s = 'ok'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'RULES_LOAD_OBSERVED' },
    @{ s = 'requests-2'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'RULES_LOAD_OBSERVED' },
    @{ s = 'stdout-split'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'RULES_LOAD_OBSERVED' },
    @{ s = 'shutdown-reply'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'RULES_LOAD_OBSERVED' },
    @{ s = 'header-variants'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'RULES_LOAD_OBSERVED' },
    @{ s = 'json-dump-signal-text'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'RULES_LOAD_OBSERVED' },
    @{ s = 'env-names'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'RULES_LOAD_OBSERVED' },
    @{ s = 'rules-zero'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'LOAD_FAILED:NO_RULES_TO_RUN' },
    @{ s = 'invalid-rule'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'LOAD_FAILED:NO_RULES_TO_RUN' },
    @{ s = 'yaml-error'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'LOAD_FAILED:LOCAL_CONFIG_ERRORS' },
    @{ s = 'wrong-file-loaded'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:LOADING_PATH_UNEXPECTED' },
    @{ s = 'log-missing'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:SIGNAL_ABSENT' },
    @{ s = 'log-variant'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED' },
    @{ s = 'log-duplicate'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:SIGNAL_DUPLICATED' },
    @{ s = 'notification-twice'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:SIGNAL_DUPLICATED' },
    @{ s = 'order-violation'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:ORDER_VIOLATION' },
    @{ s = 'nonzero-exit'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 1; verdict = 'NOT_OBSERVED:EXIT_CODE_NOT_ZERO' },
    @{ s = 'orphan'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0 },
    # 종료 단계
    @{ s = 'exit-ignored'; lim = @{ exitMs = 2000; stdinCloseGraceMs = 1500; killConfirmMs = 5000 }; sent = $happySent; trig = 'EXIT_TIMEOUT'; kill = 0; close = $true; exit = 0; verdict = 'NOT_OBSERVED:EXIT_TIMEOUT' },
    @{ s = 'exit-ignored-eof'; lim = @{ exitMs = 2000; stdinCloseGraceMs = 1000; killConfirmMs = 5000 }; sent = $happySent; trig = 'EXIT_TIMEOUT'; kill = 1; close = $true; verdict = 'NOT_OBSERVED:EXIT_TIMEOUT' },
    @{ s = 'exit-during-refresh'; sent = $initAndInitialized; trig = 'CHILD_EXITED_EARLY'; kill = 0; close = $false; exit = 1; verdict = 'LOAD_FAILED:RULES_REFRESH_INCOMPLETE' },
    # 장벽 한도: 알림만 있거나 줄이 모자라 장벽에 닿지 못한다. shutdown·exit 를 보내지 않고 stdin 을 닫는다.
    @{ s = 'notification-only'; lim = @{ rulesMs = 1500; stdinCloseGraceMs = 1500; killConfirmMs = 5000 }; sent = $initAndInitialized; trig = 'RULES_TIMEOUT'; abort = 'A9'; kill = 0; close = $true; verdict = 'NOT_OBSERVED:RULES_TIMEOUT'; obsMin = 1500; obsMax = 6500 },
    @{ s = 'barrier-timeout'; lim = @{ rulesMs = 1500; stdinCloseGraceMs = 1500; killConfirmMs = 5000 }; sent = $initAndInitialized; trig = 'RULES_TIMEOUT'; abort = 'A9'; kill = 0; close = $true; verdict = 'NOT_OBSERVED:RULES_TIMEOUT'; obsMin = 1500; obsMax = 6500 },
    # initialized 를 받기 전의 신호: initialized 를 보내서는 안 된다
    @{ s = 'early-signal'; sent = $onlyInit; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:A1' },
    @{ s = 'early-notification'; sent = $onlyInit; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:A1' },
    # 초기화 응답이 조건을 못 채운다: initialized 는 단 한 번도 가지 않는다
    @{ s = 'initialize-error'; sent = $onlyInit; trig = 'INIT_INVALID'; kill = 0; close = $true; recv = 'initialize,<stdin-end>'; verdictLike = 'NOT_OBSERVED:*' },
    @{ s = 'error-response'; sent = $onlyInit; trig = 'INIT_INVALID'; kill = 0; close = $true; recv = 'initialize,<stdin-end>'; verdictLike = 'NOT_OBSERVED:*' },
    @{ s = 'version-mismatch'; sent = $onlyInit; trig = 'INIT_INVALID'; kill = 0; close = $true; recv = 'initialize,<stdin-end>'; verdictLike = 'NOT_OBSERVED:*' },
    @{ s = 'wrong-id'; lim = @{ initMs = 2000; stdinCloseGraceMs = 1500 }; sent = $onlyInit; trig = 'INIT_TIMEOUT'; kill = 0; close = $true; verdict = 'NOT_OBSERVED:INIT_NO_RESPONSE' },
    @{ s = 'silent'; lim = @{ initMs = 1500; stdinCloseGraceMs = 1500 }; sent = $onlyInit; trig = 'INIT_TIMEOUT'; kill = 0; close = $true; verdict = 'NOT_OBSERVED:INIT_NO_RESPONSE' },
    @{ s = 'silent-hold'; lim = @{ initMs = 1500; stdinCloseGraceMs = 1000; killConfirmMs = 5000 }; sent = $onlyInit; trig = 'INIT_TIMEOUT'; kill = 1; close = $true; verdict = 'NOT_OBSERVED:INIT_NO_RESPONSE' },
    @{ s = 'exit-early'; sent = $onlyInit; trig = 'CHILD_EXITED_EARLY'; kill = 0; close = $false; exit = 3; verdictLike = 'NOT_OBSERVED:*' },
    @{ s = 'garbage'; sent = $onlyInit; trig = 'FRAME_ERROR'; kill = 1; close = $false; verdictLike = 'NOT_OBSERVED:*' },
    # 실시간 중단: stdin 닫기 없이 곧바로 강제 종료 한 번. shutdown·exit 는 가지 않는다.
    @{ s = 'engine-line-leak'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:A1' },
    @{ s = 'publish-diagnostics'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:A1' },
    @{ s = 'workspace-scan-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:A1' },
    @{ s = 'delayed-forbidden'; lim = @{ settleMs = 2000 }; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:A1'; lateAbort = $true },
    @{ s = 'download-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:A2' },
    @{ s = 'registry-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:A2' },
    @{ s = 'token-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:A2' },
    @{ s = 'settings-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:A2' },
    @{ s = 'stderr-split'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:A2' },
    @{ s = 'request-disallowed'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A6'; kill = 1; close = $false; verdict = 'ABORTED:A6' },
    @{ s = 'requests-3'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A6'; kill = 1; close = $false; verdict = 'ABORTED:A6' },
    @{ s = 'request-malformed'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A6'; kill = 1; close = $false; verdict = 'ABORTED:A6' },
    @{ s = 'write-ws'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:A5' },
    @{ s = 'write-extra-rules'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:A5' },
    @{ s = 'modify-probe'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:A5'; probeChanged = $true },
    @{ s = 'home-write'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:A5' },
    @{ s = 'spawn-disallowed'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A4'; kill = 1; close = $false; verdict = 'ABORTED:A4' },
    # 출력 상한
    @{ s = 'flood-err'; lim = @{ settleMs = 2000 }; sent = $initAndInitialized; trig = 'OUTPUT_LIMIT'; kill = 1; close = $false; verdictLike = 'NOT_OBSERVED:*' },
    @{ s = 'flood-out'; lim = @{ settleMs = 2000 }; sent = $initAndInitialized; trig = 'OUTPUT_LIMIT'; kill = 1; close = $false; verdictLike = 'NOT_OBSERVED:*' }
)

try {
    $env:BOSANG_CANARY_SECRET = 'must-not-leak'; $env:GITHUB_TOKEN_CANARY = 'must-not-leak'; $env:HTTPS_PROXY = 'http://user:pass@127.0.0.1:9'

    $expectedByName = @{}
    foreach ($c in $cases) {
        $limits = $null; if ($c.lim) { $limits = $c.lim }
        $r = Invoke-Rules -Scenario $c.s -Limits $limits -Name $c.s
        $x = $r.result
        $expectedByName[$c.s] = $c
        if ($null -eq $x) { Assert-That "[$($c.s)] 결과 파일이 있다" $false "exit=$($r.exit)"; continue }
        $recv = @(Get-Received $r)
        $initializedCount = @($recv | Where-Object { $_ -ceq 'initialized' }).Count
        $expectInitialized = $(if (($c.sent -split ',') -contains 'initialized') { 1 } else { 0 })
        Assert-That "[$($c.s)] 러너 종료 코드 0, 거부·오류 없음" ($r.exit -eq 0 -and -not $x.refused -and -not $x.error) ("exit=$($r.exit) refused=$($x.refused) error=$($x.error)")
        Assert-That "[$($c.s)] 보낸 것은 정확히 [$($c.sent)] 이다" ((Get-SentLabels $r) -ceq $c.sent -and @($x.sends | Where-Object { -not $_.ok }).Count -eq 0) (Get-SentLabels $r)
        Assert-That "[$($c.s)] 서버가 받은 initialized 는 정확히 $expectInitialized 번이고 허용 밖 메시지·서버 요청에 대한 응답이 한 번도 가지 않았다" ($initializedCount -eq $expectInitialized -and -not (Test-Path -LiteralPath (Join-Path $r.layout.stateDir 'unexpected.log'))) ($recv -join ',')
        Assert-That "[$($c.s)] trigger 는 $($c.trig) 이다" ($x.trigger -ceq $c.trig) "trigger=$($x.trigger) also=$(@($x.also) -join ',')"
        if ($c.abort) { Assert-That "[$($c.s)] 중단 조건이 $($c.abort) 이다" ($x.abort.condition -ceq $c.abort) (($x.abort | ConvertTo-Json -Compress)) }
        elseif ($c.trig -ceq 'LIVE_ABORT') { Assert-That "[$($c.s)] 중단 조건이 기록된다" ($null -ne $x.abort) }
        else { Assert-That "[$($c.s)] 중단 조건이 없다" ($null -eq $x.abort) (($x.abort | ConvertTo-Json -Compress)) }
        Assert-That "[$($c.s)] 강제 종료 신호는 $($c.kill) 번이다" ($x.kill.count -eq $c.kill) (($x.kill | ConvertTo-Json -Compress))
        Assert-That "[$($c.s)] stdin 을 닫은 것은 $($c.close) 이다" ([bool]$x.stdinClosed.byHarness -eq $c.close)
        if ($c.ContainsKey('exit')) { Assert-That "[$($c.s)] 서버 종료 코드는 $($c.exit) 이다" ($x.exit.observed -and $x.exit.code -eq $c.exit) (($x.exit | ConvertTo-Json -Compress)) }
        if ($c.recv) { Assert-That "[$($c.s)] 서버가 받은 것은 [$($c.recv)] 이다" (($recv -join ',') -ceq $c.recv) ($recv -join ',') }
        if ($c.sent -ceq $happySent -and $c.trig -ceq 'NORMAL' -and $c.s -ne 'orphan' -and $c.s -ne 'nonzero-exit') {
            Assert-That "[$($c.s)] 정리가 깔끔하다 — 종료 확인, 스트림 닫힘, 남은 자손 0, 문제 없음, 프로브 해시 불변" ($x.cleanup.childExitConfirmed -and $x.cleanup.streamsClosed -and $x.cleanup.descendantsAliveAfter -eq 0 -and @($x.cleanup.problems).Count -eq 0 -and $x.probe.afterRunSha256 -ceq $Script:LrProbeSha256 -and $x.probe.afterCopySha256 -ceq $Script:LrProbeSha256) (($x.cleanup | ConvertTo-Json -Compress))
        }
        if ($c.sent -ceq $happySent -and $c.trig -ceq 'NORMAL') {
            Assert-That "[$($c.s)] 장벽에 닿았고 그 뒤 감시를 마친 뒤 shutdown 이 갔다 (initialize < initialized < 장벽 ≤ settle < shutdown < exit)" ($null -ne $x.barrier.reachedAtMs -and $null -ne $x.barrier.settledAtMs -and (Get-Sent $r 'initialize').tMs -lt (Get-Sent $r 'initialized').tMs -and $null -ne $x.initResponseAtMs -and $x.initResponseAtMs -le (Get-Sent $r 'initialized').tMs -and (Get-Sent $r 'initialized').tMs -le $x.barrier.reachedAtMs -and $x.barrier.settledAtMs -ge ($x.barrier.reachedAtMs + 350) -and $x.barrier.settledAtMs -le (Get-Sent $r 'shutdown').tMs -and (Get-Sent $r 'shutdown').tMs -le (Get-Sent $r 'exit').tMs) (($x.barrier | ConvertTo-Json -Compress))
        }
        if ($c.lateAbort) {
            Assert-That "[$($c.s)] 장벽 뒤 감시 구간에서 늦게 온 금지 신호를 잡았다 (장벽 뒤 한참 지난 뒤: 표본 간격 40ms 보다 훨씬 뒤)" ($null -ne $x.barrier.reachedAtMs -and $x.abort.tMs -gt ($x.barrier.reachedAtMs + 700) -and $null -eq $x.barrier.settledAtMs) "barrier=$($x.barrier.reachedAtMs) abort=$($x.abort.tMs)"
        }
        if ($c.probeChanged) { Assert-That "[$($c.s)] 프로브가 바뀐 것이 장벽의 해시와 실행 뒤 해시에 드러난다" ($x.probe.barrierSha256 -cne $Script:LrProbeSha256 -and $x.probe.afterRunSha256 -cne $Script:LrProbeSha256) (($x.probe | ConvertTo-Json -Compress)) }
        if ($c.obsMin) { Assert-That "[$($c.s)] 장벽 한도는 늘어나지 않는다 — 관측 구간이 $($c.obsMin) ~ $($c.obsMax) ms" ($x.timeline.observationMs -ge $c.obsMin -and $x.timeline.observationMs -lt $c.obsMax) "obs=$($x.timeline.observationMs)" }
        if ($c.trig -ceq 'LIVE_ABORT' -or $c.trig -ceq 'OUTPUT_LIMIT') {
            Assert-That "[$($c.s)] 강제 종료 뒤 서버 프로세스가 사라졌고 종료 확인이 됐다" ($x.cleanup.childExitConfirmed -and -not (Test-PidAlive ([int](Get-Content -LiteralPath (Join-Path $r.layout.stateDir 'pid.txt'))))) (($x.cleanup | ConvertTo-Json -Compress))
        }
    }

    # ── 장벽 뒤 감시(기본 2초)가 실제로 지켜진다: 한도를 하나도 주지 않은 기본 실행 ──
    $r = Invoke-Rules -Scenario 'ok' -FullLimits -Name 'ok-full-settle'
    $x = $r.result
    Assert-That '기본 한도(장벽 뒤 감시 2초): 장벽에 닿은 뒤 2초가 지난 다음에야 shutdown 을 보낸다' ($r.exit -eq 0 -and $x.trigger -ceq 'NORMAL' -and $x.barrier.settledAtMs -ge ($x.barrier.reachedAtMs + 1950) -and (Get-Sent $r 'shutdown').tMs -ge ($x.barrier.reachedAtMs + 1950)) (($x.barrier | ConvertTo-Json -Compress) + ' shutdown=' + (Get-Sent $r 'shutdown').tMs)

    # ── 전체 상한: 단계 한도가 남아 있어도 전체 마감에서 곧바로 끝난다(유예를 붙이지 않는다) ──
    $r = Invoke-Rules -Scenario 'silent-hold' -Limits @{ totalMs = 2500; initMs = 60000; stdinCloseGraceMs = 10000; killConfirmMs = 5000 } -Name 'total-timeout'
    Assert-That '전체 상한: 닿으면 stdin 닫기·유예 없이 곧바로 강제 종료한다 (단계 한도 60초가 남아도)' ($r.result.trigger -ceq 'TOTAL_TIMEOUT' -and -not $r.result.stdinClosed.byHarness -and $r.result.kill.count -eq 1 -and $r.result.timeline.observationMs -ge 2400 -and $r.result.timeline.observationMs -lt 5000) "obs=$($r.result.timeline.observationMs) trigger=$($r.result.trigger)"
    $r = Invoke-Rules -Scenario 'notification-only' -Limits @{ totalMs = 1200; rulesMs = 60000; stdinCloseGraceMs = 10000; killConfirmMs = 5000 } -Name 'total-before-barrier'
    Assert-That '전체 상한이 장벽 한도(60초)보다 먼저 닿으면 TOTAL_TIMEOUT 이고 장벽 한도로 늘어나지 않는다' ($r.result.trigger -ceq 'TOTAL_TIMEOUT' -and $r.result.timeline.observationMs -ge 1100 -and $r.result.timeline.observationMs -lt 4500 -and (Get-SentLabels $r) -ceq $initAndInitialized) "obs=$($r.result.timeline.observationMs) trigger=$($r.result.trigger) sent=$(Get-SentLabels $r)"

    # ── 외부 중단 파일(A3 수신기 적중, A7 취소) ──
    foreach ($ab in @(@('A3:HITS_INCREASED', 'A3'), @('cancel', 'A7'))) {
        $r = Invoke-Rules -Scenario 'silent-hold' -AbortAfterMs 1500 -AbortContent $ab[0] -Name "abort-file-$($ab[1])"
        Assert-That "외부 중단 파일($($ab[1])): 곧바로 강제 종료하고 조건이 기록된다" ($r.result.trigger -ceq 'LIVE_ABORT' -and $r.result.abort.condition -ceq $ab[1] -and $r.result.kill.count -eq 1 -and -not $r.result.stdinClosed.byHarness) (($r.result.abort | ConvertTo-Json -Compress))
    }

    # ── 환경 격리 ──
    $r = Invoke-Rules -Scenario 'env-names'
    $envJson = Get-Content -LiteralPath (Join-Path $r.layout.stateDir 'env.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $names = @($envJson.names | ForEach-Object { [string]$_ })
    $psOwn = @('PSModulePath', 'PathExt', 'PSExecutionPolicyPreference')
    $extra = @($names | Where-Object { (@($Script:LspMinEnvNames) -notcontains $_) -and ($psOwn -notcontains $_) })
    Assert-That '환경 격리: 자식 환경변수 이름이 요청한 것(+PowerShell 이 스스로 채우는 몇 개)뿐이다' ($extra.Count -eq 0) ("예상 밖: " + ($extra -join ',') + " / 전체: " + ($names -join ','))
    Assert-That '환경 격리: 부모의 canary·프록시·토큰 이름이 없고 SEMGREP_LOG_SRCS·SEMGREP_ENABLE_* 도 없다 (러너 자신의 환경에는 canary 가 있었다)' (@($names | Where-Object { $_ -match 'CANARY|PROXY|TOKEN|LOG_SRCS|ENABLE_' }).Count -eq 0 -and (@($r.result.runner.envNames) -contains 'BOSANG_CANARY_SECRET'))
    Assert-That '환경 전달: 자식이 받은 USERPROFILE 은 요청한 전용 홈이고 부모의 것이 아니다' ([string]$envJson.values.USERPROFILE -ceq $r.layout.homeDir -and [string]$envJson.values.USERPROFILE -ne $env:USERPROFILE)

    # ── 거부 경로 ──
    $refusals = @(
        @{ n = '알 수 없는 mode'; mut = { param($q) $q.mode = 'any-command' }; tok = 'MODE_UNKNOWN' },
        @{ n = 'semgrep-lsp 인데 실행 파일 이름이 semgrep.exe 가 아님'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = $ps51; $q.args = @('lsp', '--debug') }; tok = 'COMMAND_NAME_NOT_ALLOWED' },
        @{ n = 'semgrep-lsp 인데 인자가 [lsp,--debug,--legacy]'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = $fakeSemgrep; $q.args = @('lsp', '--debug', '--legacy') }; tok = 'ARGS_NOT_FIXED' },
        @{ n = 'semgrep-lsp 인데 인자가 [--version]'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = $fakeSemgrep; $q.args = @('--version') }; tok = 'ARGS_NOT_FIXED' },
        @{ n = 'semgrep-lsp 인데 인자 순서가 바뀜'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = $fakeSemgrep; $q.args = @('--debug', 'lsp') }; tok = 'ARGS_NOT_FIXED' },
        @{ n = '실행 파일 경로에 금지 문구(downloads)'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = 'C:\downloads\Scripts\semgrep.exe'; $q.args = @('lsp', '--debug') }; tok = 'PATH_CONTAINS_FORBIDDEN_FRAGMENT:COMMAND' },
        @{ n = '실행 파일이 UNC 경로 (드라이브 문자가 아닌 절대 경로)'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = '\\server\share\semgrep.exe'; $q.args = @('lsp', '--debug') }; tok = 'COMMAND_NOT_ABSOLUTE' },
        @{ n = '실행 파일이 루트 상대 경로 (\Scripts\semgrep.exe)'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = '\Scripts\semgrep.exe'; $q.args = @('lsp', '--debug') }; tok = 'COMMAND_NOT_ABSOLUTE' },
        @{ n = '실행 파일이 상대 경로'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = 'Scripts\semgrep.exe'; $q.args = @('lsp', '--debug') }; tok = 'COMMAND_NOT_ABSOLUTE' },
        @{ n = 'stub 인데 허용되지 않은 시나리오'; mut = { param($q) $q.args = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', $stubScript, 'format-disk') }; tok = 'STUB_SCENARIO_NOT_ALLOWED' },
        @{ n = 'stub 인데 다른 스크립트'; mut = { param($q) $q.args = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-Path $sandbox 'other.ps1'), 'ok') }; tok = 'STUB_SCRIPT_NOT_ALLOWED' },
        @{ n = '환경에 SEMGREP_LOG_SRCS (소유자 결정 D5)'; mut = { param($q) $q.env['SEMGREP_LOG_SRCS'] = 'semgrep.parsing' }; tok = 'ENV_NAME_NOT_ALLOWED:SEMGREP_LOG_SRCS' },
        @{ n = '환경에 SEMGREP_APP_TOKEN'; mut = { param($q) $q.env['SEMGREP_APP_TOKEN'] = 'x' }; tok = 'ENV_NAME_NOT_ALLOWED:SEMGREP_APP_TOKEN' },
        @{ n = '환경에 프록시 이름(HTTPS_PROXY)'; mut = { param($q) $q.env.HTTPS_PROXY = 'http://user:pass@x' }; tok = 'ENV_NAME_NOT_ALLOWED:HTTPS_PROXY' },
        @{ n = '환경에 SEMGREP_ENABLE_*'; mut = { param($q) $q.env[('SEMGREP_ENABLE_' + 'VERSION_CHECK')] = '0' }; tok = ('ENV_NAME_NOT_ALLOWED:SEMGREP_ENABLE_' + 'VERSION_CHECK') },
        @{ n = '환경의 USERPROFILE 이 부모 값'; mut = { param($q) $q.env.USERPROFILE = $env:USERPROFILE }; tok = 'ENV_VALUE_UNEXPECTED:USERPROFILE' },
        @{ n = '환경에서 USERPROFILE 이 빠짐'; mut = { param($q) $q.env.Remove('USERPROFILE') }; tok = 'ENV_NAME_MISSING:USERPROFILE' },
        @{ n = '수신기 주소가 루프백이 아님'; mut = { param($q) foreach ($k in 'SEMGREP_APP_URL', 'SEMGREP_METRICS_URL', 'SEMGREP_VERSION_CHECK_URL') { $q.env[$k] = 'http://example.com:80' } }; tok = 'ENV_URL_NOT_LOOPBACK' },
        @{ n = '장벽 한도(rulesMs)를 기본 상한 위로 올림'; mut = { param($q) $q.limits.rulesMs = 120000 }; tok = 'LIMIT_ABOVE_CAP:rulesMs' },
        @{ n = '장벽 뒤 감시(settleMs)를 늘림'; mut = { param($q) $q.limits.settleMs = 5000 }; tok = 'LIMIT_ABOVE_CAP:settleMs' },
        @{ n = '전체 상한을 올림'; mut = { param($q) $q.limits.totalMs = 999999 }; tok = 'LIMIT_ABOVE_CAP:totalMs' },
        @{ n = '모르는 한도(barrierMs)'; mut = { param($q) $q.limits.barrierMs = 10 }; tok = 'LIMIT_UNKNOWN:barrierMs' },
        @{ n = '한도가 0'; mut = { param($q) $q.limits.initMs = 0 }; tok = 'LIMIT_INVALID:initMs' },
        @{ n = '한도가 문자열'; mut = { param($q) $q.limits.exitMs = 'x' }; tok = 'LIMIT_INVALID:exitMs' },
        @{ n = '배치가 작업 폴더에서 도출한 것과 다름'; mut = { param($q) $q.layout.workspace = (Join-Path $sandbox 'elsewhere') }; tok = 'LAYOUT_MISMATCH' },
        @{ n = '규칙 폴더가 rules-empty (LSP-MIN-1 배치)'; mut = { param($q) $q.layout.rulesDir = (Join-Path $q.layout.stateDir 'rules-empty') }; tok = 'LAYOUT_MISMATCH' },
        @{ n = '작업 폴더가 드라이브 문자가 아닌 경로'; mut = { param($q) $lay = Get-LrLayout -Work '\\server\share\run'; $q.layout = $lay; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $lay -Url $URL }; tok = 'WORK_DIR_NOT_DRIVE_ABSOLUTE' },
        @{ n = '작업 폴더 경로에 금지 문구(downloads)'; mut = { param($q) $w = Join-Path $sandbox 'downloads\run'; $lay = Get-LrLayout -Work $w; $q.layout = $lay; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $lay -Url $URL }; tok = 'PATH_CONTAINS_FORBIDDEN_FRAGMENT:WORKSPACE' },
        @{ n = '중단 파일이 이미 있음'; mut = { param($q) $af = Join-Path $sandbox 'preexisting.flag'; [IO.File]::WriteAllText($af, 'x'); $q.abortFile = $af }; tok = 'ABORT_FILE_ALREADY_PRESENT' },
        @{ n = '설치물 경로가 상대 경로'; mut = { param($q) $q.artifacts = @(@{ label = 'w'; path = 'rel\a.whl' }) }; tok = 'ARTIFACT_PATH_NOT_DRIVE_ABSOLUTE' },
        @{ n = '설치물 경로에 금지 문구(downloads)'; mut = { param($q) $q.artifacts = @(@{ label = 'w'; path = 'C:\downloads\a.whl' }) }; tok = 'PATH_CONTAINS_FORBIDDEN_FRAGMENT:ARTIFACT' },
        @{ n = '프로브 바이트가 없음'; mut = { param($q) $q.Remove('probeB64') }; tok = 'PROBE_BYTES_MISSING' },
        @{ n = '프로브 바이트 수가 다름'; mut = { param($q) $q.probeB64 = [Convert]::ToBase64String((New-Object byte[] 10)) }; tok = 'PROBE_SIZE_MISMATCH' },
        @{ n = '프로브 해시가 다름(한 바이트만 바뀜)'; mut = { param($q) $bb = [byte[]][Convert]::FromBase64String($probeB64); $bb[0] = $bb[0] -bxor 1; $q.probeB64 = [Convert]::ToBase64String($bb) }; tok = 'PROBE_HASH_MISMATCH' }
    )
    foreach ($rf in $refusals) {
        $r = Invoke-Rules -Scenario 'ok' -Mutate $rf.mut
        $refusedText = [string]$r.result.refused
        Assert-That "거부: $($rf.n)" ($r.exit -eq 2 -and $refusedText.Contains($rf.tok) -and $r.result.child.started -eq $false -and @($r.result.sends).Count -eq 0) "exit=$($r.exit) refused=$refusedText"
        $leaked = ($r.result | ConvertTo-Json -Depth 6 -Compress) -match 'user:pass|must-not-leak'
        Assert-That "거부: $($rf.n) — 사유에 환경 값(토큰·프록시)을 싣지 않는다" (-not $leaked)
    }
    $pre = Invoke-Rules -Scenario 'ok' -Mutate { param($q) $q.args = @('x') }
    Assert-That '거부된 요청은 아무 폴더도 만들지 않고 아무 프로세스도 띄우지 않는다' (-not (Test-Path -LiteralPath $pre.layout.workspace) -and -not (Test-Path -LiteralPath $pre.layout.homeDir) -and $pre.result.child.started -eq $false)

    # 감시 폴더가 비어 있지 않으면 프로브를 쓰지 않고 시작하지 않는다.
    foreach ($nonEmpty in @(@('WORKSPACE', 'workspace'), @('RULES_DIR', 'rulesDir'), @('HOME_DIR', 'homeDir'))) {
        $pw = Join-Path $sandbox ('nonempty-' + $nonEmpty[0]); $pl = Get-LrLayout -Work $pw
        [void][IO.Directory]::CreateDirectory($pl[$nonEmpty[1]]); [IO.File]::WriteAllText((Join-Path $pl[$nonEmpty[1]] 'leftover.txt'), 'x')
        $r = Invoke-Rules -Scenario 'ok' -Mutate { param($q) $q.layout = $pl; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl -Url $URL }
        Assert-That "거부: $($nonEmpty[0]) 가 비어 있지 않으면 시작하지 않는다 (WATCHED_ROOT_NOT_EMPTY:$($nonEmpty[0]))" ($r.exit -eq 2 -and ([string]$r.result.refused).Contains("WATCHED_ROOT_NOT_EMPTY:$($nonEmpty[0])") -and $r.result.child.started -eq $false -and -not (Test-Path -LiteralPath (Join-Path $pl.rulesDir 'lsp-rules-1-probe.yaml'))) "refused=$($r.result.refused)"
    }
    # 규칙 폴더에 이미 프로브와 같은 이름의 다른 내용이 있어도(규칙 폴더가 프로브 하나가 아니다) 거절한다.
    $pw = Join-Path $sandbox 'preplanted'; $pl = Get-LrLayout -Work $pw; [void][IO.Directory]::CreateDirectory($pl.rulesDir); [IO.File]::WriteAllText((Join-Path $pl.rulesDir 'lsp-rules-1-probe.yaml'), 'tampered')
    $r = Invoke-Rules -Scenario 'ok' -Mutate { param($q) $q.layout = $pl; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl -Url $URL }
    Assert-That '거부: 규칙 폴더에 이미 다른 내용의 프로브 이름 파일이 있으면 시작하지 않고 덮어쓰지 않는다' ($r.exit -eq 2 -and ([string]$r.result.refused).Contains('WATCHED_ROOT_NOT_EMPTY:RULES_DIR') -and (Get-Content -LiteralPath (Join-Path $pl.rulesDir 'lsp-rules-1-probe.yaml') -Raw) -ceq 'tampered')

    # 링크(junction)로 쓰기 경로가 작업 폴더 밖으로 새면 프로브를 쓰기 전에 거절한다.
    $pw = Join-Path $sandbox 'linked'; $pl = Get-LrLayout -Work $pw; $outside = Join-Path $sandbox 'outside'
    [void][IO.Directory]::CreateDirectory($pl.stateDir); [void][IO.Directory]::CreateDirectory($outside)
    $linkOk = $true; try { [void](New-Item -ItemType Junction -Path $pl.rulesDir -Target $outside -ErrorAction Stop) } catch { $linkOk = $false }
    if (-not $linkOk) { Skip-Test '거부: 규칙 폴더가 junction 이면 거절한다' 'junction 을 만들 수 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        $r = Invoke-Rules -Scenario 'ok' -Mutate { param($q) $q.layout = $pl; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl -Url $URL }
        Assert-That '거부: 규칙 폴더가 junction 이면 PATH_ESCAPES_WORK 로 거절하고 밖으로 아무것도 쓰지 않는다' ($r.exit -eq 2 -and ([string]$r.result.refused).Contains('PATH_ESCAPES_WORK') -and @(Get-ChildItem -LiteralPath $outside -Force).Count -eq 0 -and $r.result.child.started -eq $false) "refused=$($r.result.refused)"
    }

    # 한 단계 위(lsp-state)가 junction 이면 그 아래 폴더(rules-probe·home·tmp)를 **만드는 것** 자체가 작업 폴더 밖으로 샌다. 만들기 전에 이미 있는 조각을 보고 거절해야 한다:
    # 거절 뒤 밖의 폴더는 비어 있어야 하고(아무것도 만들지 않았다), 작업 폴더 안에도 ws 가 생기지 않는다.
    $pw2 = Join-Path $sandbox 'linked-state'; $pl2 = Get-LrLayout -Work $pw2; $outside2 = Join-Path $sandbox 'outside-state'
    [void][IO.Directory]::CreateDirectory($pw2); [void][IO.Directory]::CreateDirectory($outside2)
    $linkOk2 = $true; try { [void](New-Item -ItemType Junction -Path $pl2.stateDir -Target $outside2 -ErrorAction Stop) } catch { $linkOk2 = $false }
    if (-not $linkOk2) { Skip-Test '거부: 상태 폴더(lsp-state)가 junction 이면 아무것도 만들기 전에 거절한다' 'junction 을 만들 수 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        $r = Invoke-Rules -Scenario 'ok' -Mutate { param($q) $q.layout = $pl2; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl2 -Url $URL }
        Assert-That '거부: 상태 폴더(lsp-state)가 junction 이면 PATH_ESCAPES_WORK 로 거절하고, 밖의 폴더에 rules-probe·home·tmp 를 만들지 않는다 (밖은 비어 있다)' ($r.exit -eq 2 -and ([string]$r.result.refused).Contains('PATH_ESCAPES_WORK') -and @(Get-ChildItem -LiteralPath $outside2 -Force).Count -eq 0 -and $r.result.child.started -eq $false) ("refused=$($r.result.refused) outsideCount=" + @(Get-ChildItem -LiteralPath $outside2 -Force).Count)
        Assert-That '거부: 상태 폴더가 junction 이면 작업 폴더 안에도 아무 폴더를 만들지 않는다 (ws 가 없다)' (-not (Test-Path -LiteralPath $pl2.workspace)) "workspace=$($pl2.workspace)"
    }

    # semgrep-lsp 모드의 실제 실행 경로(내용은 whoami.exe 사본): 셸 없이 드라이브 문자 절대 경로 + [lsp, --debug]
    $r = Invoke-Rules -Mode 'semgrep-lsp' -Exe $fakeSemgrep -Args0 @('lsp', '--debug') -Limits @{ initMs = 2500; stdinCloseGraceMs = 1000; killConfirmMs = 5000 } -Name 'fake-semgrep'
    Assert-That 'semgrep-lsp 모드 실행 경로: 이름이 semgrep.exe 인 절대 경로를 [lsp,--debug] 로 셸 없이 부르고, 응답 없이 끝난 자식은 CHILD_EXITED_EARLY 로 기록한다 (initialized 는 가지 않는다)' ($r.result.child.started -eq $true -and -not $r.result.refused -and ([string]$r.result.child.mainModule).Equals($fakeSemgrep, [StringComparison]::OrdinalIgnoreCase) -and @('CHILD_EXITED_EARLY', 'INIT_TIMEOUT') -contains $r.result.trigger -and (Get-SentLabels $r) -ceq $onlyInit) (Limit-Text ($r.result | ConvertTo-Json -Depth 5 -Compress))

    # ═══ 6. 러너 결과 → 실제 TS 어댑터와 기록 만들기 (tsx 가 있을 때만) ═══════════════
    if (-not $tsReady) { Skip-Test '러너 결과 → 실제 TS factsFromRulesRunnerResult·buildRulesRecord (시나리오별 판정)' 'tsx 또는 scripts/semgrep-lsp 경로가 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        $items = @()
        foreach ($item in $collected) {
            $x = Get-Content -LiteralPath $item.path -Raw -Encoding UTF8 | ConvertFrom-Json
            # 한도: 이 실행이 실제로 쓴 한도(요청의 한도를 기본 상한 위에 얹은 것). 판정은 "장벽 뒤 감시를 settleMs 만큼 이었는가"를 이 값으로 확인하므로 기본값으로 덮어 두지 않는다.
            $reqLimits = $null; if ($x.request) { $reqLimits = $x.request.limits }
            $ctxLimits = (Resolve-LrLimits $reqLimits).limits
            $ctx = [ordered]@{
                runId = 'lr-test'; work = $item.work; expectedVersion = '9.9.9'; limits = $ctxLimits
                receiver = [ordered]@{ baselineHits = 0; finalHits = 0; samples = 3; failures = 0 }
                probe = [ordered]@{ sourceSha256 = $x.probe.sourceSha256; afterCopySha256 = $x.probe.afterCopySha256; afterRunSha256 = $x.probe.afterRunSha256 }
            }
            $items += , ([ordered]@{ name = $item.name; path = $item.path; ctx = $ctx })
        }
        $listFile = Join-Path $sandbox 'verdict-list.json'
        [IO.File]::WriteAllText($listFile, (ConvertTo-Json -InputObject $items -Depth 6), (New-Object Text.UTF8Encoding($false)))
        $vr = Invoke-Tsx @($bridge, $TsDir, 'verdicts', $listFile)
        $rows = $null; try { $rows = $vr.text | ConvertFrom-Json } catch { }
        Assert-That '러너 결과 → TS: tsx 로 어댑터·기록 만들기 실행 성공' ($vr.exit -eq 0 -and $null -ne $rows -and @($rows).Count -eq $collected.Count) ("exit=$($vr.exit) " + (Limit-Text $vr.text 400))
        if ($rows) {
            $by = @{}; foreach ($row in @($rows)) { $by[[string]$row.name] = $row }
            foreach ($c in $cases) {
                $row = $by[$c.s]
                if ($c.verdict) { Assert-That "러너 결과 → TS 판정: $($c.s) → $($c.verdict)" ($null -ne $row -and [string]$row.verdict -ceq $c.verdict) ("실제: " + (Limit-Text ($row | ConvertTo-Json -Compress -Depth 4) 500)) }
                elseif ($c.verdictLike) { Assert-That "러너 결과 → TS 판정: $($c.s) → $($c.verdictLike)" ($null -ne $row -and [string]$row.verdict -clike $c.verdictLike) ("실제: " + (Limit-Text ($row | ConvertTo-Json -Compress -Depth 4) 500)) }
            }
            Assert-That '러너 결과 → TS: 정상 실행의 정리 결과가 깔끔하다 (cleanup.ok) 이고 어댑터가 형식 오류를 하나도 보고하지 않는다' ($by['ok'].cleanupOk -eq $true -and @($by['ok'].external).Count -eq 0) (($by['ok'] | ConvertTo-Json -Compress -Depth 4))
            Assert-That '러너 결과 → TS: orphan(자손이 파이프를 쥠)은 관측과 정리를 따로 기록한다 — 정리는 실패(cleanup.ok=false)' ($by['orphan'].cleanupOk -eq $false) (($by['orphan'] | ConvertTo-Json -Compress -Depth 4))
            Assert-That '러너 결과 → TS: 초기화 실패 세 경로(initialize-error, error-response, version-mismatch)는 initialized 가 한 번도 기록되지 않는다' ((@('initialize-error', 'error-response', 'version-mismatch') | Where-Object { @($by[$_].sent) -contains 'initialized' }).Count -eq 0)
            Assert-That '러너 결과 → TS: shutdown 에 서버가 응답해도 판정은 달라지지 않는다 (shutdown-reply = ok)' ($by['shutdown-reply'].verdict -ceq $by['ok'].verdict)
            Assert-That '러너 결과 → TS: 기본 한도(장벽 뒤 2초) 정상 실행도 RULES_LOAD_OBSERVED' ($by['ok-full-settle'].verdict -ceq 'RULES_LOAD_OBSERVED') (($by['ok-full-settle'] | ConvertTo-Json -Compress -Depth 4))
        }
    }
} finally {
    Remove-Item Env:\BOSANG_CANARY_SECRET, Env:\GITHUB_TOKEN_CANARY, Env:\HTTPS_PROXY -ErrorAction SilentlyContinue
    # 시험이 남긴 스텁 자손·ping 이 없어야 한다(있으면 정리 실패이므로 실패로 센다). 남은 것은 치운다.
    $holdersAfter = @(Get-HolderPids | Where-Object { $holdersBefore -notcontains $_ })
    $pingsAfter = @(Get-PingPids | Where-Object { $pingsBefore -notcontains $_ })
    Assert-That '시험 뒤 남은 스텁 자손(대기자)이 없다' ($holdersAfter.Count -eq 0) ("남은 PID: " + ($holdersAfter -join ','))
    foreach ($sp in ($holdersAfter + $pingsAfter)) { Stop-Process -Id $sp -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 300
    try { Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction Stop } catch { Write-Host "샌드박스를 지우지 못했다: $sandbox ($($_.Exception.Message))" -ForegroundColor Yellow }
}

$pass = @($results | Where-Object { $_.pass -eq $true }).Count
$fail = @($results | Where-Object { $_.pass -eq $false }).Count
$skip = @($results | Where-Object { $null -eq $_.pass }).Count
Write-Host ("{0}/{1} 통과, 실패 {2}, 건너뜀 {3}  (엔진 {4})" -f $pass, ($pass + $fail), $fail, $skip, $PSVersionTable.PSVersion)
if ($fail -gt 0) { exit 1 }
exit 0
