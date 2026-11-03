<#
.SYNOPSIS
  LspScanContract.ps1 의 stdout 프레임 파서(Add-LsFrameBytes)를 TS FrameDecoder 와 **같은 바이트**로 대조하고, 잘못된 초기화 응답이 실행 중 송신 판단까지 가지 못하는지 확인한다.
.DESCRIPTION
  시스템 설정을 바꾸지 않고 프로세스도 띄우지 않는다(tsx 가 있을 때 TS 쪽 다리 한 번만 부른다). 확인 항목:
    - 파서 사례: 한 가지 입력(바이트)을 정해진 조각 나눔으로 PS 파서에 먹여 프레임 수·실패 여부·오류 종류·오류 위치가 **이 파일에 적은 기대값**과 같은가.
      기대값은 TS 디코더가 내는 값과 같아야 하는 명세다(근거는 scripts/semgrep-lsp/framing.ts). tsx 가 있으면 같은 바이트를 TS FrameDecoder 에도 먹여 TS 결과가 기대값이자 PS 결과와 같은지 한 번 더 본다.
        · jsonrpc 값은 정확히 "2.0" 문자열이어야 한다(끝의 소프트 하이픈 U+00AD·NUL, 앞뒤 공백, 숫자, 없음은 거절). 키 이름도 서수로 읽는다("jsonrpc"+U+00AD 는 jsonrpc 가 아니다).
        · 헤더(현재 프레임 시작부터 종결자 CRLFCRLF 직전까지)는 8192바이트까지 허용하고 8193바이트부터 거절한다. 한 청크로 와도, 종결자 앞뒤로 쪼개져도, 두 번째 프레임이어도 같다.
        · 헤더 이름 끝에 LF 가 붙은 줄은 거절한다(정규식 $ 는 끝의 줄바꿈 앞에서도 맞는다).
        · 첫 위반 뒤에는 영구 실패이고 재동기화하지 않는다(뒤에 정상 프레임을 붙여도 받지 않는다).
    - 실행 중 판단 사슬(Add-LsStdout → 추적기 → 초기화 게이트): 거절돼야 할 초기화 응답은 초기화 응답으로 저장되지 않으므로 게이트까지 가지 않는다(그래서 러너는 initialized 를 보내지 않는다). 정상 대조군은 게이트를 통과한다.
  진짜 러너와 스텁 서버로 "송신 0건"을 확인하는 것은 tests/Test-LspScanRunner.ps1 의 init-* 시나리오가 한다.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\tests\Test-LspScanFrame.ps1 -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -NodeDir C:\node
#>
[CmdletBinding()]
param([string]$TsxCmd, [string]$NodeDir, [string]$TsDir)
$ErrorActionPreference = 'Stop'
$windowsDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $windowsDir 'LspScanContract.ps1')
. (Join-Path $windowsDir 'lsp-rules-runner.ps1') -LoadFunctionsOnly
if (-not $TsDir) { $TsDir = Join-Path $windowsDir '..\..\semgrep-lsp' }
$tsReady = $false
if ($TsxCmd -and (Test-Path -LiteralPath $TsxCmd) -and (Test-Path -LiteralPath (Join-Path $TsDir 'framing.ts'))) { $tsReady = $true; $TsDir = (Resolve-Path -LiteralPath $TsDir).Path }
$bridge = Join-Path $PSScriptRoot 'lsp-scan-bridge.mts'

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
function Invoke-Tsx([string[]]$ScriptArgs) {
    $oldPath = $env:PATH
    if ($NodeDir) { $env:PATH = $NodeDir + ';' + $env:PATH }
    try { $o = & $TsxCmd @ScriptArgs 2>&1; $code = $LASTEXITCODE } finally { $env:PATH = $oldPath }
    [pscustomobject]@{ exit = $code; text = ($o | Out-String) }
}

# ── 바이트 도구 ──────────────────────────────────────────────────────────────
function Join-Bytes {
    $ms = New-Object IO.MemoryStream
    foreach ($p in $args) { $b = [byte[]]$p; $ms.Write($b, 0, $b.Length) }
    , $ms.ToArray()
}
function New-Frame([string[]]$HeaderLines, [byte[]]$Body) {
    $head = [Text.Encoding]::ASCII.GetBytes((($HeaderLines -join "`r`n") + "`r`n`r`n"))
    Join-Bytes $head $Body
}
# 헤더(종결자 CRLFCRLF 직전까지)가 정확히 $HeaderBytes 바이트가 되도록 X-Pad 헤더로 채운 프레임. $HeaderBytes 가 0 이면 Content-Length 한 줄뿐이다.
function New-InitFrame([string]$Json, [int]$HeaderBytes = 0) {
    $body = [Text.Encoding]::UTF8.GetBytes($Json)
    $first = "Content-Length: $($body.Length)"
    if ($HeaderBytes -le 0) { return (New-Frame @($first) $body) }
    $pad = $HeaderBytes - ($first.Length + 2 + 'X-Pad: '.Length)
    New-Frame @($first, ('X-Pad: ' + ('a' * $pad))) $body
}
function Split-At([byte[]]$B, [int[]]$Cuts) {
    $out = New-Object System.Collections.ArrayList
    $prev = 0
    foreach ($c in $Cuts) {
        if ($c -le $prev -or $c -ge $B.Length) { continue }
        $seg = New-Object byte[] ($c - $prev); [Array]::Copy($B, $prev, $seg, 0, $seg.Length); [void]$out.Add($seg); $prev = $c
    }
    $seg = New-Object byte[] ($B.Length - $prev); [Array]::Copy($B, $prev, $seg, 0, $seg.Length); [void]$out.Add($seg)
    , $out
}
function Split-Every([byte[]]$B, [int]$Size) {
    $cuts = New-Object System.Collections.ArrayList
    for ($i = $Size; $i -lt $B.Length; $i += $Size) { [void]$cuts.Add($i) }
    Split-At $B ([int[]]$cuts.ToArray())
}
function Convert-ToHex([byte[]]$B) { ([BitConverter]::ToString($B)).Replace('-', '').ToLowerInvariant() }
function One([byte[]]$B) { $l = New-Object System.Collections.ArrayList; [void]$l.Add($B); , $l }

# 초기화 응답 본문. $Members 는 맨 앞에 두는 최상위 멤버(들)이다(비면 생략). 값에 넣는 특수 문자는 JSON 이스케이프(\u00ad, \u0000)로 적어 코드 자체는 ASCII 다.
function Get-InitJson([string]$Members = '"jsonrpc":"2.0"') {
    $rest = '"id":"lsp-scan-init-1","result":{"capabilities":{"textDocumentSync":1},"serverInfo":{"name":"Semgrep","version":"9.9.9"}}}'
    if ($Members -eq '') { return ('{' + $rest) }
    '{' + $Members + ',' + $rest
}
$shyChar = [string][char]0x00AD

# ── 사례 ────────────────────────────────────────────────────────────────────
# 기대값: frames(이번 입력 전체에서 완성된 프레임 수), kind(첫 오류 종류, 오류 없으면 $null), at(첫 오류 위치 = 문제가 된 프레임이 시작하는 바이트, 오류 없으면 $null).
$cases = New-Object System.Collections.ArrayList
function Add-Case([string]$Id, $Chunks, [int]$Frames, $Kind = $null, $At = $null) {
    [void]$cases.Add(@{ id = $Id; chunks = $Chunks; frames = $Frames; kind = $Kind; at = $At })
}

# (1) jsonrpc 값과 키 이름
$good = New-InitFrame (Get-InitJson)
Add-Case 'jsonrpc:정상(대조군)' (One $good) 1
$badJsonrpc = [ordered]@{
    'shy-escaped'      = '"jsonrpc":"2.0\u00ad"'
    'shy-raw'          = ('"jsonrpc":"2.0' + $shyChar + '"')
    'nul'              = '"jsonrpc":"2.0\u0000"'
    'leading-space'    = '"jsonrpc":" 2.0"'
    'trailing-space'   = '"jsonrpc":"2.0 "'
    'number'           = '"jsonrpc":2'
    'missing'          = ''
    'key-shy-only'     = '"jsonrpc\u00ad":"2.0"'
}
foreach ($k in $badJsonrpc.Keys) { Add-Case ("jsonrpc:$k") (One (New-InitFrame (Get-InitJson $badJsonrpc[$k]))) 0 'MALFORMED' 0 }
# 이름이 비슷한 멤버가 따로 있어도 진짜 "jsonrpc" 가 "2.0" 이면 받는다(순서와 무관해야 한다).
Add-Case 'jsonrpc:진짜 키 뒤에 비슷한 키(대조군)' (One (New-InitFrame (Get-InitJson '"jsonrpc":"2.0","jsonrpc\u00ad":"x"'))) 1
Add-Case 'jsonrpc:비슷한 키 뒤에 진짜 키(대조군)' (One (New-InitFrame (Get-InitJson '"jsonrpc\u00ad":"x","jsonrpc":"2.0"'))) 1
# 본문 한가운데서 쪼개져도 같다.
$shyFrame = New-InitFrame (Get-InitJson '"jsonrpc":"2.0\u00ad"')
Add-Case 'jsonrpc:shy 본문 도중에 쪼개짐' (Split-At $shyFrame @(($shyFrame.Length - 40))) 0 'MALFORMED' 0

# (2) 헤더 크기: 종결자까지 한 청크로 와도, 종결자 앞뒤에서 쪼개져도, 여러 청크여도 같은 결과여야 한다.
foreach ($n in 8192, 8193, 8228) {
    $f = New-InitFrame (Get-InitJson) $n
    $okSize = ($n -le 8192)
    $plans = [ordered]@{ '한 청크' = (One $f); '8195에서 쪼갬(종결자 도착 전)' = (Split-At $f @(8195)); '8196에서 쪼갬' = (Split-At $f @(8196)); '2048씩' = (Split-Every $f 2048) }
    foreach ($p in $plans.Keys) {
        if ($okSize) { Add-Case "헤더 ${n}바이트:$p" $plans[$p] 1 }
        else { Add-Case "헤더 ${n}바이트:$p" $plans[$p] 0 'MALFORMED' 0 }
    }
}
# 두 번째 프레임: 헤더 길이는 **현재 프레임 시작**부터 센다(앞 프레임 길이가 들어가면 안 된다).
$small = $good
foreach ($n in 8192, 8193) {
    $second = New-InitFrame (Get-InitJson) $n
    $all = Join-Bytes $small $second
    $cut = $small.Length + 8196
    if ($n -le 8192) {
        Add-Case "두 번째 프레임 헤더 ${n}바이트:한 청크" (One $all) 2
        Add-Case "두 번째 프레임 헤더 ${n}바이트:쪼갬" (Split-At $all @($cut)) 2
    } else {
        Add-Case "두 번째 프레임 헤더 ${n}바이트:한 청크" (One $all) 1 'MALFORMED' $small.Length
        Add-Case "두 번째 프레임 헤더 ${n}바이트:쪼갬" (Split-At $all @($cut)) 1 'MALFORMED' $small.Length
    }
}

# (3) 헤더 이름 끝의 LF(정규식 $ 가 끝의 줄바꿈 앞에서도 맞는 문제)
$lfBody = [Text.Encoding]::UTF8.GetBytes((Get-InitJson))
$lfFrame = New-Frame @("Content-Length: $($lfBody.Length)", "X-A`n: v") $lfBody
Add-Case '헤더 이름 끝 LF:한 청크' (One $lfFrame) 0 'MALFORMED' 0
Add-Case '헤더 이름 끝 LF:콜론 앞에서 쪼갬' (Split-At $lfFrame @(($lfFrame.Length - $lfBody.Length - 4 - 4))) 0 'MALFORMED' 0
$okName = New-Frame @("Content-Length: $($lfBody.Length)", 'X-Custom_1.a~: v') $lfBody
Add-Case '헤더 이름 정상 토큰 문자(대조군)' (One $okName) 1

# (4) 첫 위반 뒤에는 영구 실패: 뒤에 정상 프레임을 붙여도, 나중 청크로 와도 받지 않는다.
Add-Case '영구 실패:나쁜 jsonrpc 뒤 정상 프레임(같은 청크)' (One (Join-Bytes $shyFrame $good)) 0 'MALFORMED' 0
Add-Case '영구 실패:나쁜 jsonrpc 뒤 정상 프레임(다음 청크)' (Split-At (Join-Bytes $shyFrame $good) @($shyFrame.Length)) 0 'MALFORMED' 0
$overFrame = New-InitFrame (Get-InitJson) 8193
Add-Case '영구 실패:헤더 8193 뒤 정상 프레임(다음 청크)' (Split-At (Join-Bytes $overFrame $good) @($overFrame.Length)) 0 'MALFORMED' 0
Add-Case '영구 실패:정상, 나쁜 것, 정상' (Split-At (Join-Bytes $good $shyFrame $good) @($good.Length, ($good.Length + $shyFrame.Length))) 1 'MALFORMED' $good.Length

# (5) 대조군: 정상 프레임 둘
Add-Case '정상 프레임 둘(한 청크)' (One (Join-Bytes $good $good)) 2
Add-Case '정상 프레임 둘(두 번째 도중에 쪼갬)' (Split-At (Join-Bytes $good $good) @(($good.Length + 30))) 2

# ── PS 파서 실행 ────────────────────────────────────────────────────────────
function Invoke-PsDecode($Chunks) {
    $d = New-LsFrameDecoder 1048576
    foreach ($c in $Chunks) { [void](Add-LsFrameBytes $d ([byte[]]$c)) }
    $kind = $null; $at = $null
    if ($d.failed) { $kind = [string]$d.error.kind; $at = [int]$d.error.atByte }
    [pscustomobject]@{ frames = [int]$d.frames.Count; failed = [bool]$d.failed; kind = $kind; at = $at }
}
function Test-Result($R, $Case) {
    $failedExp = ($null -ne $Case.kind)
    ($R.frames -eq $Case.frames) -and ($R.failed -eq $failedExp) -and
    ((($null -eq $R.kind) -and ($null -eq $Case.kind)) -or (($R.kind -is [string]) -and ($Case.kind -is [string]) -and [string]::Equals($R.kind, $Case.kind, [StringComparison]::Ordinal))) -and
    ((($null -eq $R.at) -and ($null -eq $Case.at)) -or (($null -ne $R.at) -and ($null -ne $Case.at) -and ([int]$R.at -eq [int]$Case.at)))
}
function Format-Result($R) { "frames=$($R.frames) failed=$($R.failed) kind=$($R.kind) at=$($R.at)" }

$psResults = @{}
foreach ($c in $cases) {
    $r = Invoke-PsDecode $c.chunks
    $psResults[$c.id] = $r
    $exp = "frames=$($c.frames) failed=$($null -ne $c.kind) kind=$($c.kind) at=$($c.at)"
    Assert-That "PS 파서: $($c.id)" (Test-Result $r $c) ("실제 " + (Format-Result $r) + " / 기대 " + $exp)
}

# ── 같은 바이트를 TS FrameDecoder 에도 ───────────────────────────────────────
if (-not $tsReady) {
    Skip-Test 'TS FrameDecoder 대조(같은 바이트)' 'tsx 또는 scripts/semgrep-lsp 경로가 없어 실행하지 않았다(통과로 세지 않는다)'
} else {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('lsp-scan-frame-' + [guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($tmp)
    try {
        # 사례 이름에 한글이 있어 콘솔 코드페이지를 지나며 깨지므로 TS 와 주고받는 id 는 ASCII 번호(c000...)로 한다.
        $items = @(); $idxOf = @{}; $n0 = 0
        foreach ($c in $cases) { $key = 'c{0:D3}' -f $n0; $idxOf[[string]$c.id] = $key; $n0++; $items += , ([ordered]@{ id = $key; chunks = @($c.chunks | ForEach-Object { Convert-ToHex ([byte[]]$_) }) }) }
        $inFile = Join-Path $tmp 'frames.json'
        [IO.File]::WriteAllText($inFile, (ConvertTo-Json -InputObject $items -Depth 4), (New-Object Text.UTF8Encoding($false)))
        $tr = Invoke-Tsx @($bridge, $TsDir, 'frames', $inFile)
        # 5.1 의 ConvertFrom-Json 은 최상위 배열을 한 개체로 내보낸다(7 은 푼다). 변수에 받은 뒤 @() 로 감싸면 두 엔진 모두 배열이 된다.
        $rows = $null; try { $rowsParsed = ConvertFrom-Json -InputObject $tr.text; $rows = @($rowsParsed) } catch { }
        Assert-That 'TS 대조: tsx 로 FrameDecoder 를 돌렸다' ($tr.exit -eq 0 -and $null -ne $rows -and @($rows).Count -eq $cases.Count) ("exit=$($tr.exit) " + (Limit-Text $tr.text 400))
        if ($rows) {
            $by = @{}; foreach ($row in @($rows)) { $by[[string]$row.id] = $row }
            foreach ($c in $cases) {
                $row = $by[$idxOf[[string]$c.id]]
                if ($null -eq $row) { Assert-That "TS 대조: $($c.id)" $false 'TS 결과 없음'; continue }
                $tsR = [pscustomobject]@{ frames = [int]$row.frames; failed = [bool]$row.failed; kind = $(if ($null -eq $row.kind) { $null } else { [string]$row.kind }); at = $(if ($null -eq $row.atByte) { $null } else { [int]$row.atByte }) }
                $psR = $psResults[$c.id]
                $sameAsPs = ($tsR.frames -eq $psR.frames) -and ($tsR.failed -eq $psR.failed) -and ([string]$tsR.kind -ceq [string]$psR.kind) -and ([string]$tsR.at -ceq [string]$psR.at)
                Assert-That "TS 대조: $($c.id) — 같은 바이트에서 TS 결과가 기대값과 같다" (Test-Result $tsR $c) ("TS " + (Format-Result $tsR) + " / 기대 frames=$($c.frames) kind=$($c.kind) at=$($c.at)")
                Assert-That "TS 대조: $($c.id) — PS 와 TS 의 결과가 같다" $sameAsPs ("PS " + (Format-Result $psR) + " / TS " + (Format-Result $tsR))
            }
        }
    } finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

# ── 실행 중 판단 사슬: Add-LsStdout → 추적기 → 초기화 게이트 ───────────────────────
function New-TestWatch {
    New-LsLiveWatch ([ordered]@{ workspace = 'C:\w\ws'; expectedTargetUri = 'file:///c%3A/w/ws/lsp-scan-1-target.txt'; probePath = 'C:\w\rules\p.yaml'; scanMs = 3000; settleMs = 400; maxStdoutBytes = 1048576 })
}
$w = New-TestWatch
$r = Add-LsStdout $w $good 100.0
$gate = Test-LrInitGate $w.stdoutTracker.analysis.initMessage '9.9.9' $false
Assert-That '판단 사슬(대조군): 정상 초기화 응답은 초기화 응답으로 저장되고 게이트를 통과한다 (러너가 initialized 를 보낼 수 있는 상태)' ($r.initArrived -and $null -eq $r.frameError -and $null -ne $w.stdoutTracker.analysis.initMessage -and $gate.ok) ("initArrived=$($r.initArrived) gate=" + ($gate.reasons -join ','))
foreach ($ch in @(
        @('jsonrpc 끝에 소프트 하이픈', $shyFrame), @('jsonrpc 끝에 NUL', (New-InitFrame (Get-InitJson '"jsonrpc":"2.0\u0000"'))),
        @('키 이름 jsonrpc+소프트 하이픈', (New-InitFrame (Get-InitJson '"jsonrpc\u00ad":"2.0"'))),
        @('헤더 8193바이트(한 청크)', $overFrame), @('헤더 8228바이트(한 청크)', (New-InitFrame (Get-InitJson) 8228)), @('헤더 이름 끝 LF', $lfFrame))) {
    $w = New-TestWatch
    $r = Add-LsStdout $w ([byte[]]$ch[1]) 100.0
    Assert-That "판단 사슬: $($ch[0]) → 프레임 오류(MALFORMED)로 끊기고 초기화 응답으로 저장되지 않는다 (게이트에 닿지 않는다)" ($null -ne $r.frameError -and [string]$r.frameError.kind -ceq 'MALFORMED' -and $w.broken -and $r.messages -eq 0 -and -not $r.initArrived -and $null -eq $w.stdoutTracker.analysis.initMessage) ("kind=$($r.frameError.kind) messages=$($r.messages) initMessage=" + ($null -ne $w.stdoutTracker.analysis.initMessage))
    $r2 = Add-LsStdout $w $good 200.0
    Assert-That "판단 사슬: $($ch[0]) → 뒤에 정상 초기화 응답이 와도 받지 않는다 (재동기화 없음)" ($r2.messages -eq 0 -and -not $r2.initArrived -and $null -eq $w.stdoutTracker.analysis.initMessage -and $w.broken)
}

$pass = @($results | Where-Object { $_.pass -eq $true }).Count
$fail = @($results | Where-Object { $_.pass -eq $false }).Count
$skip = @($results | Where-Object { $null -eq $_.pass }).Count
Write-Host ("{0}/{1} 통과, 실패 {2}, 건너뜀 {3}  (엔진 {4})" -f $pass, ($pass + $fail), $fail, $skip, $PSVersionTable.PSVersion)
if ($fail -gt 0) { exit 1 }
exit 0
