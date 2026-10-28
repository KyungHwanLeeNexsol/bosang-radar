<#
.SYNOPSIS
  version-runner.ps1 의 제한·정리·환경 격리·거부 경로와 VersionContract.ps1 의 해석 계약을 무해한 스텁으로 확인한다.
.DESCRIPTION
  시스템 설정(계정·방화벽·감사·ACL)을 바꾸지 않는다. 임시 샌드박스 폴더에서 현재 사용자로 실행기를 부르고, 스텁(version-stub.ps1)과 시스템 폴더의 실행 파일 하나(whoami.exe 사본)만 쓴다.
  semgrep 계열은 실행하지 않는다. 확인 항목:
    - 정상 종료·stderr 소음·비정상 종료 코드·여러 줄·BOM·접두 문자
    - 시간 제한 초과 시 자식과 자손이 끝나는가, 출력 한도(stdout 4096·stderr 16384) 초과 시 끝나는가
    - 자손을 남기고 정상 종료해도 남은 자손이 정리되는가
    - 자식에게 이 프로세스의 환경(canary 변수)이 새지 않는가, 작업 폴더가 요청대로인가
    - 허용되지 않은 모드·실행 파일 이름·인자·시나리오·상대 경로를 거부하는가
    - 이름이 semgrep.exe 인 파일을 ["--version"] 으로 셸 없이 부르는 경로(내용은 whoami.exe 사본이다)
    - 해석 계약: ConvertFrom-VersionStdout 의 결과가 실제 TS parseVersionStdout 과 같은가(tsx 가 있을 때만. 없으면 SKIPPED 로 표시하고 통과로 세지 않는다)
  이 시험의 통과는 "실행기와 계약 이식본이 스텁·합성 입력에서 의도대로 동작한다"까지만 뜻한다. 실제 Semgrep 의 동작은 뜻하지 않는다.
.EXAMPLE
  pwsh -NoProfile -File .\tests\Test-VersionRunner.ps1 -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -ToolObservationTs C:\repo\scripts\semgrep-lsp\tool-observation.ts
#>
[CmdletBinding()]
# 추가 선택 인자: -CliTs(cli.ts 경로. 있으면 TS buildChildEnv 와 PS 환경 계약을 tsx 로 대조), -PythonExe(기반 Python 실행 파일. 있으면 Path.home() 이 전용 홈을 돌려주는지만 확인한다. Semgrep 은 임포트하지 않는다).
# 없으면 해당 항목은 SKIPPED 로 표시한다(통과로 세지 않는다).
param([string]$TsxCmd, [string]$ToolObservationTs, [string]$NodeDir, [string]$CliTs, [string]$PythonExe)
$ErrorActionPreference = 'Stop'
$windowsDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $windowsDir 'VersionContract.ps1')
$ps51 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

$results = New-Object System.Collections.ArrayList
function Assert-That([string]$Name, [bool]$Condition, [string]$Detail = '') {
    [void]$results.Add([ordered]@{ name = $Name; pass = $Condition; detail = $Detail })
    if (-not $Condition) { Write-Host ("FAIL  {0}  {1}" -f $Name, $Detail) -ForegroundColor Red }
}
function Skip-Test([string]$Name, [string]$Why) {
    [void]$results.Add([ordered]@{ name = $Name; pass = $null; detail = $Why })
    Write-Host ("SKIPPED  {0}  {1}" -f $Name, $Why) -ForegroundColor Yellow
}

# ── 정적 점검: 구문, BOM, 금지된 명령 ───────────────────────────────────────────
$files = 'version-runner.ps1', 'version-stub.ps1', 'VersionContract.ps1', 'Test-VersionObservation.ps1', 'tests\Test-VersionRunner.ps1', 'tests\Test-VersionFlows.ps1'
$forbidden = 'Invoke-Expression', 'iex', 'Invoke-WebRequest', 'Invoke-RestMethod', 'Start-BitsTransfer', 'curl', 'wget'
foreach ($f in $files) {
    $p = Join-Path $windowsDir $f
    if (-not (Test-Path -LiteralPath $p)) { Assert-That "파일 있음 ($f)" $false $p; continue }
    $errs = $null; $tokens = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errs)
    Assert-That "구문 $f ($($PSVersionTable.PSVersion))" ($errs.Count -eq 0) (($errs | ForEach-Object { "$($_.Message)@$($_.Extent.StartLineNumber)" }) -join '; ')
    $b = [IO.File]::ReadAllBytes($p)
    Assert-That "BOM $f" ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) 'Windows PowerShell 5.1 이 한글을 읽으려면 UTF-8 BOM 이 필요하다'
    $hits = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | Where-Object {
            $nm = $_.GetCommandName(); $first = $_.CommandElements[0].Extent.Text.Trim('"', "'")
            ($nm -and ($forbidden -contains $nm -or $nm -match '(?i)^(semgrep|pysemgrep|semgrep-core)(\.exe)?$')) -or ($first -match '(?i)(^|[\\/])(semgrep|pysemgrep|semgrep-core)(\.exe)?$')
        } | ForEach-Object { $_.Extent.Text.Split("`n")[0].Trim() })
    Assert-That "내려받기·Invoke-Expression·semgrep 명령 호출 없음 ($f)" ($hits.Count -eq 0) ($hits -join ' | ')
}

# ── 해석 계약(합성 입력) ──────────────────────────────────────────────────────
function Get-Bytes([string]$Hex) { if ($Hex.Length -eq 0) { return , ([byte[]]@()) }; $o = New-Object byte[] ($Hex.Length / 2); for ($i = 0; $i -lt $o.Length; $i++) { $o[$i] = [Convert]::ToByte($Hex.Substring(2 * $i, 2), 16) }; , $o }
function ConvertTo-Hex([byte[]]$B) { (($B | ForEach-Object { $_.ToString('x2') }) -join '') }
function Utf8Hex([string]$S) { ConvertTo-Hex ([Text.Encoding]::UTF8.GetBytes($S)) }
$cases = @(
    @{ name = 'lf'; hex = (Utf8Hex "1.180.0`n") },
    @{ name = 'crlf'; hex = (Utf8Hex "1.180.0`r`n") },
    @{ name = 'no-newline'; hex = (Utf8Hex '1.180.0') },
    @{ name = 'zeros'; hex = (Utf8Hex "0.0.0`n") },
    @{ name = 'empty'; hex = '' },
    @{ name = 'newline-only'; hex = (Utf8Hex "`n") },
    @{ name = 'two-newlines'; hex = (Utf8Hex "1.180.0`n`n") },
    @{ name = 'two-lines'; hex = (Utf8Hex "1.180.0`r`nx") },
    @{ name = 'lone-cr'; hex = (Utf8Hex "1.180.0`r") },
    @{ name = 'v-prefix'; hex = (Utf8Hex "v1.180.0`n") },
    @{ name = 'leading-zero'; hex = (Utf8Hex "01.2.3`n") },
    @{ name = 'two-parts'; hex = (Utf8Hex "1.2`n") },
    @{ name = 'four-parts'; hex = (Utf8Hex "1.2.3.4`n") },
    @{ name = 'trailing-space'; hex = (Utf8Hex "1.2.3 `n") },
    @{ name = 'leading-space'; hex = (Utf8Hex " 1.2.3`n") },
    @{ name = 'suffix'; hex = (Utf8Hex "1.2.3-beta`n") },
    @{ name = 'bom'; hex = ('efbbbf' + (Utf8Hex "1.2.3`n")) },
    @{ name = 'invalid-utf8'; hex = 'c328' },
    @{ name = 'arabic-indic-digits'; hex = (Utf8Hex ([string]([char]0x0661) + '.' + [string]([char]0x0662) + '.' + [string]([char]0x0663) + "`n")) },
    @{ name = 'nul'; hex = '312e322e3300' }
)
$psParsed = @{}
foreach ($c in $cases) { $cb = Get-Bytes $c.hex; $psParsed[$c.name] = ConvertFrom-VersionStdout -Bytes $cb }
Assert-That '계약(PS): 정상 형식은 통과한다(lf, crlf, 개행 없음, 0.0.0)' ($psParsed['lf'].ok -and $psParsed['crlf'].ok -and $psParsed['no-newline'].ok -and $psParsed['zeros'].ok -and $psParsed['lf'].version -eq '1.180.0')
$expectFail = @{ 'empty' = 'OUTPUT_EMPTY'; 'newline-only' = 'OUTPUT_EMPTY'; 'two-newlines' = 'OUTPUT_NOT_SINGLE_LINE'; 'two-lines' = 'OUTPUT_NOT_SINGLE_LINE'; 'lone-cr' = 'OUTPUT_NOT_SINGLE_LINE'; 'v-prefix' = 'OUTPUT_UNRECOGNIZED'; 'leading-zero' = 'OUTPUT_UNRECOGNIZED'; 'two-parts' = 'OUTPUT_UNRECOGNIZED'; 'four-parts' = 'OUTPUT_UNRECOGNIZED'; 'trailing-space' = 'OUTPUT_UNRECOGNIZED'; 'leading-space' = 'OUTPUT_UNRECOGNIZED'; 'suffix' = 'OUTPUT_UNRECOGNIZED'; 'bom' = 'OUTPUT_UNRECOGNIZED'; 'invalid-utf8' = 'OUTPUT_NOT_UTF8'; 'arabic-indic-digits' = 'OUTPUT_UNRECOGNIZED'; 'nul' = 'OUTPUT_UNRECOGNIZED' }
foreach ($k in $expectFail.Keys) { Assert-That "계약(PS): $k → $($expectFail[$k])" ((-not $psParsed[$k].ok) -and $psParsed[$k].failure -eq $expectFail[$k]) ("실제: ok=$($psParsed[$k].ok) failure=$($psParsed[$k].failure)") }

# 실제 TS 함수와 대조(같은 입력 → 같은 결과). 비교 대상은 이 PC 의 tsx 가 읽는 현재 tool-observation.ts 다.
$tsReady = $TsxCmd -and $ToolObservationTs -and (Test-Path -LiteralPath $TsxCmd) -and (Test-Path -LiteralPath $ToolObservationTs)
if (-not $tsReady) { Skip-Test '계약(PS) ↔ 실제 TS parseVersionStdout 대조' 'tsx 또는 tool-observation.ts 경로가 없어 실행하지 않았다(통과로 세지 않는다)' }

# ── 가짜 스트림(읽기 함수 시험용) ─────────────────────────────────────────────
# 진짜 파이프로는 EndRead 예외를 만들기 어렵다. 정해진 덩어리를 주다가 N 번째 EndRead/BeginRead 에서 예외를 던지는 스트림으로 실행기의 읽기 함수를 직접 확인한다.
if (-not ('VrScriptedStream' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
public class VrAsyncDone : IAsyncResult {
    public object AsyncState { get { return null; } }
    public System.Threading.WaitHandle AsyncWaitHandle { get { return null; } }
    public bool CompletedSynchronously { get { return true; } }
    public bool IsCompleted { get { return true; } }
}
public class VrScriptedStream : Stream {
    byte[][] chunks; int next; int endReads; int beginReads; int throwAtEnd; int throwAtBegin; byte[] pbuf; int poff;
    public VrScriptedStream(byte[][] c, int throwAtEndRead, int throwAtBeginRead) { chunks = c; throwAtEnd = throwAtEndRead; throwAtBegin = throwAtBeginRead; }
    public override IAsyncResult BeginRead(byte[] buffer, int offset, int count, AsyncCallback cb, object state) {
        beginReads++;
        if (throwAtBegin > 0 && beginReads == throwAtBegin) throw new IOException("mock: BeginRead failed");
        pbuf = buffer; poff = offset; return new VrAsyncDone();
    }
    public override int EndRead(IAsyncResult ar) {
        endReads++;
        if (throwAtEnd > 0 && endReads == throwAtEnd) throw new IOException("mock: pipe broken");
        if (next >= chunks.Length) return 0;
        byte[] c = chunks[next++]; Array.Copy(c, 0, pbuf, poff, c.Length); return c.Length;
    }
    public override bool CanRead { get { return true; } }
    public override bool CanSeek { get { return false; } }
    public override bool CanWrite { get { return false; } }
    public override long Length { get { throw new NotSupportedException(); } }
    public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
    public override void Flush() { }
    public override int Read(byte[] b, int o, int c) { throw new NotSupportedException(); }
    public override long Seek(long o, SeekOrigin s) { throw new NotSupportedException(); }
    public override void SetLength(long v) { throw new NotSupportedException(); }
    public override void Write(byte[] b, int o, int c) { throw new NotSupportedException(); }
}
'@
}
function New-FakeStream([string[]]$Chunks = @(), [int]$ThrowAtEndRead = 0, [int]$ThrowAtBeginRead = 0) {
    $arr = New-Object 'byte[][]' @($Chunks).Count
    for ($i = 0; $i -lt @($Chunks).Count; $i++) { $arr[$i] = [Text.Encoding]::ASCII.GetBytes($Chunks[$i]) }
    [VrScriptedStream]::new($arr, $ThrowAtEndRead, $ThrowAtBeginRead)
}
# 실행기의 읽기 함수를 -LoadFunctionsOnly 로 읽어(프로세스를 시작하는 코드보다 앞에서 돌아온다) 가짜 스트림으로 확인한다.
function Invoke-StreamTests {
    . $runnerPath -LoadFunctionsOnly
    function Pump($St, [int]$Times = 6) { for ($i = 0; $i -lt $Times; $i++) { Step-StreamRead $St } }
    $eofStream = { New-StreamState 'stderr' (New-FakeStream @()) 16384 }

    $a = New-StreamState 'stdout' (New-FakeStream @("1.180.0`n")) 4096; Pump $a; $b = & $eofStream; Pump $b
    $ra = Get-StreamRecord $a
    Assert-That '읽기 함수: 데이터 뒤 정상 EOF → eof=true, readFailed=false, state EOF, 바이트 보존' ($a.eof -and -not $a.failed -and -not $a.overflow -and $ra.state -eq 'EOF' -and $ra.readFailed -eq $false -and $ra.eof -eq $true -and $ra.bytesKept -eq 8 -and $null -eq $ra.error) (($ra | ConvertTo-Json -Compress))
    Assert-That '읽기 함수: 두 스트림이 모두 정상 EOF 면 닫힌 것으로 센다' ((Test-StreamsClosed @($a, $b)) -eq $true)

    $c = New-StreamState 'stdout' (New-FakeStream @("1.180.0`n") 1) 4096; Pump $c
    $rc = Get-StreamRecord $c
    Assert-That '읽기 함수: 첫 EndRead 가 예외 → readFailed=true 이고 eof 는 false(EOF 로 바꾸지 않는다), 오류 문구 기록' ($c.failed -and -not $c.eof -and $rc.state -eq 'READ_FAILED' -and $rc.readFailed -eq $true -and $rc.eof -eq $false -and [string]$rc.error -match 'pipe broken' -and [string]$rc.error -match 'IOException') (($rc | ConvertTo-Json -Compress))
    Assert-That '읽기 함수: 읽기 실패가 있으면 닫힌 것으로 세지 않는다(수정 전에는 failed=true 인데 eof=true 라 닫힘으로 셌다)' ((Test-StreamsClosed @($c, $b)) -eq $false)

    $d = New-StreamState 'stdout' (New-FakeStream @("1.180.0`n") 2) 4096; Pump $d
    $rd = Get-StreamRecord $d
    Assert-That '읽기 함수: 데이터를 받은 뒤 EndRead 예외 → 이미 받은 8바이트는 보존하고 readFailed=true, eof=false' ($d.failed -and -not $d.eof -and $rd.bytesKept -eq 8 -and $rd.bytesRead -eq 8 -and $rd.state -eq 'READ_FAILED') (($rd | ConvertTo-Json -Compress))

    $e = New-StreamState 'stdout' (New-FakeStream @("1.180.0`n") 0 2) 4096; Pump $e
    $re = Get-StreamRecord $e
    Assert-That '읽기 함수: 데이터를 받은 뒤 다음 BeginRead 가 예외 → 받은 바이트 보존, readFailed=true, eof=false' ($e.failed -and -not $e.eof -and $re.bytesKept -eq 8 -and [string]$re.error -match 'BeginRead failed') (($re | ConvertTo-Json -Compress))

    $f = New-StreamState 'stdout' (New-FakeStream @("x") 0 1) 4096
    Pump $f
    Assert-That '읽기 함수: 첫 BeginRead 가 예외 → 시작하자마자 readFailed, 이후 호출은 상태를 바꾸지 않는다' ($f.failed -and -not $f.eof -and (Get-StreamRecord $f).bytesKept -eq 0 -and [string]$f.error -match 'BeginRead failed')

    $g = New-StreamState 'stdout' (New-FakeStream @("0123456789")) 4; Pump $g
    $rg = Get-StreamRecord $g
    Assert-That '읽기 함수: 한도 초과 → overflow=true, eof=false, 이번 덩어리는 쓰지 않는다(state LIMIT_EXCEEDED)' ($g.overflow -and -not $g.eof -and -not $g.failed -and $rg.bytesKept -eq 0 -and $rg.bytesRead -eq 10 -and $rg.state -eq 'LIMIT_EXCEEDED')
    Assert-That '읽기 함수: 한도 초과는 닫힌 것으로 세지 않는다' ((Test-StreamsClosed @($g, $b)) -eq $false)

    $h = @{ eof = $true; failed = $true; overflow = $false }
    Assert-That 'Test-StreamsClosed: eof=true 라도 failed=true 면 닫힘이 아니다(수정 전 실행기가 만들던 상태)' ((Test-StreamsClosed @($h, $b)) -eq $false)
    Assert-That 'Test-StreamsClosed: 스트림이 없으면 닫힘이 아니다' ((Test-StreamsClosed @()) -eq $false)
    $i = New-StreamState 'stdout' (New-FakeStream @("ab")) 4096; Pump $i 1
    Assert-That '읽기 함수: 아직 EOF 를 받지 못한 스트림은 닫힘이 아니다(state OPEN)' ((Get-StreamRecord $i).state -eq 'OPEN' -and (Test-StreamsClosed @($i, $b)) -eq $false)
}

# ── 판정(Get-VersionObservationFailures) 합성 시험: 수집 상태가 온전할 때만 버전을 사용 가능한 관측으로 확정한다 ─────────────────
function New-GoodRunnerResult {
    [ordered]@{
        runToken = 't'; refused = $null; error = $null
        child = [ordered]@{ started = $true; exitCode = 0; hasExited = $true; killed = $false; timedOut = $false; outputLimitExceeded = $false }
        stdout = [ordered]@{ b64 = ''; overflow = $false; readFailed = $false }; stderr = [ordered]@{ b64 = ''; overflow = $false; readFailed = $false }
        streamsClosed = $true; childState = 'EXITED'
    }
}
function Invoke-JudgeTests {
    $ok = [Text.Encoding]::UTF8.GetBytes("1.180.0`n")
    $good = Get-VersionObservationFailures -RunnerResult (New-GoodRunnerResult) -StdoutBytes $ok
    Assert-That '판정: 온전한 수집 + 종료 0 + 정상 stdout → 실패 없음, 1.180.0' ($null -eq $good.failure -and @($good.failures).Count -eq 0 -and $good.parsed.ok -and $good.parsed.version -eq '1.180.0')
    $warn = New-GoodRunnerResult; $warn.stderr.b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("warning: something`r`n"))
    Assert-That '판정: stderr 에 경고만 있고 stdout 이 정상이면 그대로 성립한다(대조군)' ($null -eq (Get-VersionObservationFailures -RunnerResult $warn -StdoutBytes $ok).failure)
    $table = @(
        @{ n = 'stdout.readFailed=true'; f = { param($r) $r.stdout.readFailed = $true }; t = 'STREAM_READ_FAILED' }
        @{ n = 'stderr.readFailed=true'; f = { param($r) $r.stderr.readFailed = $true }; t = 'STREAM_READ_FAILED' }
        @{ n = 'error 가 있다'; f = { param($r) $r.error = 'boom' }; t = 'RUNNER_ERROR' }
        @{ n = 'streamsClosed=false'; f = { param($r) $r.streamsClosed = $false }; t = 'STREAMS_NOT_CLOSED' }
        @{ n = 'streamsClosed 없음'; f = { param($r) $r.Remove('streamsClosed') }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'streamsClosed=null'; f = { param($r) $r.streamsClosed = $null }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'streamsClosed 가 문자열 "true"'; f = { param($r) $r.streamsClosed = 'true' }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'stdout.readFailed 없음'; f = { param($r) $r.stdout.Remove('readFailed') }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'stdout 기록 없음'; f = { param($r) $r.Remove('stdout') }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'stderr 기록 없음'; f = { param($r) $r.Remove('stderr') }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'stdout.b64 없음'; f = { param($r) $r.stdout.Remove('b64') }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'child 기록 없음'; f = { param($r) $r.Remove('child') }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'child.timedOut 없음'; f = { param($r) $r.child.Remove('timedOut') }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'childState 없음'; f = { param($r) $r.Remove('childState') }; t = 'COLLECTION_STATE_UNKNOWN' }
        @{ n = 'childState=RUNNING'; f = { param($r) $r.childState = 'RUNNING' }; t = 'CHILD_NOT_EXITED' }
        @{ n = 'child.hasExited=false'; f = { param($r) $r.child.hasExited = $false }; t = 'CHILD_NOT_EXITED' }
        @{ n = 'timedOut=true'; f = { param($r) $r.child.timedOut = $true }; t = 'TIMEOUT' }
        @{ n = 'outputLimitExceeded=true'; f = { param($r) $r.child.outputLimitExceeded = $true }; t = 'OUTPUT_LIMIT_EXCEEDED' }
        @{ n = 'stdout.overflow=true (플래그 없이)'; f = { param($r) $r.stdout.overflow = $true }; t = 'OUTPUT_LIMIT_EXCEEDED' }
        @{ n = 'killed=true'; f = { param($r) $r.child.killed = $true }; t = 'KILLED' }
        @{ n = '종료 코드 1'; f = { param($r) $r.child.exitCode = 1 }; t = 'NONZERO_EXIT' }
        @{ n = '종료 코드 null'; f = { param($r) $r.child.exitCode = $null }; t = 'NONZERO_EXIT' }
        @{ n = '종료 코드가 문자열 "0"'; f = { param($r) $r.child.exitCode = '0' }; t = 'NONZERO_EXIT' }
        @{ n = 'refused'; f = { param($r) $r.refused = '거부됨' }; t = 'RUNNER_REFUSED' }
        @{ n = 'child.started=false'; f = { param($r) $r.child.started = $false }; t = 'SPAWN_FAILED' }
    )
    foreach ($c in $table) {
        $r = New-GoodRunnerResult; & $c.f $r
        $j = Get-VersionObservationFailures -RunnerResult $r -StdoutBytes $ok
        Assert-That "판정: $($c.n) → $($c.t) (사용 불가)" ($j.failure -eq $c.t -and @($j.failures) -contains $c.t -and $null -eq $j.parsed) "실제 failure=$($j.failure) failures=$(@($j.failures) -join ',')"
        Assert-That "판정: $($c.n) → 이미 받은 stdout 을 읽은 참고 결과가 남고 usable=false" ($null -ne $j.diagnosticParse -and $j.diagnosticParse.usable -eq $false -and $j.diagnosticParse.version -eq '1.180.0') "diag=$($j.diagnosticParse | ConvertTo-Json -Compress)"
    }
    $none = Get-VersionObservationFailures -RunnerResult $null -StdoutBytes $ok
    Assert-That '판정: 실행기 결과가 없으면 RUNNER_NO_RESULT' ($none.failure -eq 'RUNNER_NO_RESULT' -and $null -eq $none.parsed)
    $multi = New-GoodRunnerResult; $multi.stdout.readFailed = $true; $multi.streamsClosed = $false
    $jm = Get-VersionObservationFailures -RunnerResult $multi -StdoutBytes $ok
    Assert-That '판정: 겹치면 우선순위 첫 토큰이 주 토큰이고 나머지도 모두 남는다(STREAM_READ_FAILED + STREAMS_NOT_CLOSED)' ($jm.failure -eq 'STREAM_READ_FAILED' -and @($jm.failures) -contains 'STREAMS_NOT_CLOSED') (@($jm.failures) -join ',')
    $both = New-GoodRunnerResult; $both.error = 'boom'; $both.stdout.readFailed = $true
    Assert-That '판정: 실행기 오류가 읽기 실패보다 앞선다(주 토큰 RUNNER_ERROR)' ((Get-VersionObservationFailures -RunnerResult $both -StdoutBytes $ok).failure -eq 'RUNNER_ERROR')
    # 해석 계약은 그대로다(정규식·기대 버전·한도를 바꾸지 않았다): 수집이 온전하면 예전과 같은 토큰이 나온다.
    foreach ($pc in @(@("v1.180.0`n", 'OUTPUT_UNRECOGNIZED'), @('', 'OUTPUT_EMPTY'), @("1.180.0`n1.180.0`n", 'OUTPUT_NOT_SINGLE_LINE'))) {
        $jp = Get-VersionObservationFailures -RunnerResult (New-GoodRunnerResult) -StdoutBytes ([Text.Encoding]::UTF8.GetBytes($pc[0]))
        Assert-That "판정: 수집이 온전해도 stdout 이 '$($pc[0].Trim())' 이면 $($pc[1])" ($jp.failure -eq $pc[1]) "실제 $($jp.failure)"
    }
    Assert-That '계약 상수: 한도·인자는 바뀌지 않았다(30000ms / 4096B / 16384B / 5000ms, ["--version"])' (($Script:VersionLimits.timeoutMs -eq 30000) -and ($Script:VersionLimits.maxStdoutBytes -eq 4096) -and ($Script:VersionLimits.maxStderrBytes -eq 16384) -and ($Script:VersionLimits.killWaitMs -eq 5000) -and (@($Script:VersionArgs).Count -eq 1) -and ($Script:VersionArgs[0] -eq '--version'))
}

# ── 샌드박스 ────────────────────────────────────────────────────────────────
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('bosang-vr-test-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($sandbox)
$cwdDir = Join-Path $sandbox 'cwd'; [void][IO.Directory]::CreateDirectory($cwdDir)
Copy-Item -LiteralPath (Join-Path $windowsDir 'version-runner.ps1') -Destination $sandbox
Copy-Item -LiteralPath (Join-Path $windowsDir 'version-stub.ps1') -Destination $sandbox
$runnerPath = Join-Path $sandbox 'version-runner.ps1'
$stubPath = Join-Path $sandbox 'version-stub.ps1'
$fakeBinDir = Join-Path $sandbox 'Scripts'; [void][IO.Directory]::CreateDirectory($fakeBinDir)
$fakeSemgrep = Join-Path $fakeBinDir 'semgrep.exe'
Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32\whoami.exe') -Destination $fakeSemgrep      # 내용은 whoami.exe. 이름만 semgrep.exe 인 무해한 사본

$sleeperMarker = 'Start-Sleep -Seconds 90'
function Get-SleeperPids { @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$sleeperMarker*" } | ForEach-Object { [int]$_.ProcessId }) }
$sleepersBefore = Get-SleeperPids

$baseEnv = [ordered]@{ PATH = "$env:WINDIR\System32;$env:WINDIR"; SYSTEMROOT = $env:WINDIR; TEMP = $cwdDir; TMP = $cwdDir }
function Invoke-Runner {
    param([string]$Mode, [string]$Exe, [string[]]$Args0, $Limits = $null, $EnvTable = $baseEnv, [string]$Cwd = $cwdDir, [hashtable]$Raw = @{})
    if ($null -eq $Limits) { $Limits = [ordered]@{ timeoutMs = 20000; maxStdoutBytes = 4096; maxStderrBytes = 16384; killWaitMs = 5000 } }
    $reqFile = Join-Path $sandbox 'request.json'; $resFile = Join-Path $sandbox 'version-result.json'
    if (Test-Path -LiteralPath $resFile) { [IO.File]::Delete($resFile) }
    $req = [ordered]@{ runToken = [guid]::NewGuid().ToString('N'); mode = $Mode; exe = $Exe; args = @($Args0); cwd = $Cwd; env = $EnvTable; limits = $Limits; resultFile = $resFile }
    foreach ($k in $Raw.Keys) { $req[$k] = $Raw[$k] }
    [IO.File]::WriteAllText($reqFile, ($req | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath $ps51 -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"{0}"' -f $runnerPath), '-RequestFile', ('"{0}"' -f $reqFile)) -PassThru -Wait -WindowStyle Hidden
    $sw.Stop()
    $r = $null; if (Test-Path -LiteralPath $resFile) { $r = Get-Content -LiteralPath $resFile -Raw -Encoding UTF8 | ConvertFrom-Json }
    [pscustomobject]@{ exit = $proc.ExitCode; wallMs = $sw.ElapsedMilliseconds; result = $r; token = $req.runToken }
}
function Get-StubArgs([string]$Scenario) { @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', $stubPath, $Scenario) }
function Get-OutBytes($Result, [string]$Which) { [Convert]::FromBase64String([string]$Result.$Which.b64) }
function Test-PidAlive([int]$ProcessId) { [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) }

try {
    # 환경 canary: 자식에게 새면 안 되는 변수(토큰 이름 흉내)를 이 프로세스에 심는다.
    $env:BOSANG_CANARY_SECRET = 'must-not-leak'; $env:GITHUB_TOKEN_CANARY = 'must-not-leak'; $env:HTTPS_PROXY = 'http://user:pass@127.0.0.1:9'

    # 정상 종료
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'ok')
    $o = Get-OutBytes $r.result 'stdout'
    Assert-That '스텁 ok: 종료 코드 0·상태 EXITED·거부/오류 없음' ($r.exit -eq 0 -and $r.result.childState -eq 'EXITED' -and $r.result.child.exitCode -eq 0 -and -not $r.result.refused -and -not $r.result.error) (($r.result | ConvertTo-Json -Depth 3 -Compress))
    Assert-That '스텁 ok: stdout 바이트가 "0.0.0\r\n" 그대로이고 해석이 통과한다' (((ConvertTo-Hex $o) -eq (Utf8Hex "0.0.0`r`n")) -and (ConvertFrom-VersionStdout -Bytes $o).ok) (ConvertTo-Hex $o)
    Assert-That '스텁 ok: 시간 제한 안에서 끝났고 소요 시간이 기록된다' ($r.result.child.timedOut -eq $false -and $r.result.durationMsObserved -gt 0 -and $r.result.stderr.bytesKept -eq 0)

    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'ok-stderr')
    $eb = [Text.Encoding]::ASCII.GetString((Get-OutBytes $r.result 'stderr'))
    Assert-That '스텁 ok-stderr: stderr 는 따로 기록되고 stdout 해석은 통과한다(stderr 는 해석에 쓰지 않는다)' ($eb -eq "stub warning`r`n" -and (ConvertFrom-VersionStdout -Bytes (Get-OutBytes $r.result 'stdout')).ok) $eb

    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'nonzero')
    Assert-That '스텁 nonzero: 종료 코드 3 이 그대로 기록된다' ($r.result.child.exitCode -eq 3 -and $r.result.childState -eq 'EXITED')

    foreach ($sc in @(@('multiline', 'OUTPUT_NOT_SINGLE_LINE'), @('bom', 'OUTPUT_UNRECOGNIZED'), @('prefixed', 'OUTPUT_UNRECOGNIZED'))) {
        $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs $sc[0])
        $pp = ConvertFrom-VersionStdout -Bytes (Get-OutBytes $r.result 'stdout')
        Assert-That "스텁 $($sc[0]): 해석이 $($sc[1]) 로 거절된다" ((-not $pp.ok) -and $pp.failure -eq $sc[1]) "실제 failure=$($pp.failure)"
    }

    # 시간 제한: 자손이 있는 대기. 3초 제한 → 자식과 자손이 끝나야 한다.
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'sleep') -Limits ([ordered]@{ timeoutMs = 3000; maxStdoutBytes = 4096; maxStderrBytes = 16384; killWaitMs = 5000 })
    $res = $r.result
    $grand = @($res.descendantsSeen | Where-Object { $_.commandLine -like "*$sleeperMarker*" })
    Assert-That '시간 제한: timedOut·killed·상태 KILLED, 종료 코드는 기록하지 않는다(null)' ($res.child.timedOut -eq $true -and $res.child.killed -eq $true -and $res.childState -eq 'KILLED' -and $null -eq $res.child.exitCode) (($res.child | ConvertTo-Json -Compress))
    Assert-That '시간 제한: 3초 근처에서 끝났다(무제한 대기 아님)' ($res.durationMsObserved -ge 3000 -and $res.durationMsObserved -le 4500 -and $r.wallMs -lt 15000) "관측 ${($res.durationMsObserved)}ms 전체 $($r.wallMs)ms"
    Assert-That '시간 제한: 자손이 관측됐고 실행기가 끝낸 뒤 살아 있지 않다' ($grand.Count -ge 1 -and (@($grand | Where-Object { Test-PidAlive $_.pid }).Count -eq 0) -and $res.descendantsAliveAfterCleanup -eq 0) "자손 $($grand.Count)개, 정리 후 생존 $($res.descendantsAliveAfterCleanup)"

    # 출력 한도
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'flood-out')
    Assert-That '출력 한도(stdout 4096) 초과: outputLimitExceeded·killed·상태 KILLED, 오래 기다리지 않는다' ($r.result.child.outputLimitExceeded -eq $true -and $r.result.childState -eq 'KILLED' -and $r.result.stdout.overflow -eq $true -and $r.result.stdout.bytesKept -le 4096 -and $r.wallMs -lt 15000) "kept=$($r.result.stdout.bytesKept) wall=$($r.wallMs)"
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'flood-err')
    Assert-That '출력 한도(stderr 16384) 초과: outputLimitExceeded·killed·상태 KILLED' ($r.result.child.outputLimitExceeded -eq $true -and $r.result.childState -eq 'KILLED' -and $r.result.stderr.overflow -eq $true -and $r.result.stderr.bytesKept -le 16384 -and $r.wallMs -lt 15000) "kept=$($r.result.stderr.bytesKept) wall=$($r.wallMs)"

    # 자손을 남기고 정상 종료
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'orphan')
    $res = $r.result
    $orph = @($res.descendantsSeen | Where-Object { $_.commandLine -like "*$sleeperMarker*" })
    Assert-That '자손을 남긴 정상 종료: 버전 해석은 통과하고(종료 0) 남은 자손이 정리된다' ($res.child.exitCode -eq 0 -and $res.childState -eq 'EXITED' -and (ConvertFrom-VersionStdout -Bytes (Get-OutBytes $res 'stdout')).ok -and @($res.descendantsLeftoverKilled).Count -ge 1 -and $res.descendantsAliveAfterCleanup -eq 0 -and $r.wallMs -lt 15000) "정리한 자손 $(@($res.descendantsLeftoverKilled).Count)개, 전체 $($r.wallMs)ms"
    Assert-That '자손을 남긴 정상 종료: 그 자손 프로세스가 실제로 사라졌다' ($orph.Count -ge 1 -and (@($orph | Where-Object { Test-PidAlive $_.pid }).Count -eq 0)) "관측 $($orph.Count)개"

    # 환경 격리와 작업 폴더
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'env-names')
    $names = @(([Text.Encoding]::ASCII.GetString((Get-OutBytes $r.result 'stdout'))).Trim() -split ',' | Where-Object { $_ })
    $allowed = @($baseEnv.Keys) + @('PSModulePath', 'PathExt', 'PSExecutionPolicyPreference')       # powershell.exe 5.1 이 시작할 때 스스로 채우는 변수(PSModulePath, PATHEXT, -ExecutionPolicy 가 만드는 PSExecutionPolicyPreference). 자식에게 준 것이 아니다
    $extra = @($names | Where-Object { $allowed -notcontains $_ })
    Assert-That '환경 격리: 자식 환경변수 이름이 요청한 것(+PS 가 스스로 채우는 PSModulePath)뿐이다' ($extra.Count -eq 0) ("예상 밖: " + ($extra -join ',') + " / 전체: " + ($names -join ','))
    Assert-That '환경 격리: 이 프로세스의 canary(토큰·프록시 이름)가 자식에게 없다' (@($names | Where-Object { $_ -match 'CANARY|PROXY|TOKEN' }).Count -eq 0 -and (@($r.result.runner.envNames) -contains 'BOSANG_CANARY_SECRET')) "실행기 환경에는 canary 가 있고(전제) 자식에는 없어야 한다"
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'cwd')
    Assert-That '작업 폴더: 요청한 폴더에서 실행된다' (([Text.Encoding]::UTF8.GetString((Get-OutBytes $r.result 'stdout'))).Trim() -eq $cwdDir)

    # semgrep-version 모드의 실행 경로(내용은 whoami.exe 사본): 셸 없이 절대 경로 + ["--version"]
    $r = Invoke-Runner -Mode 'semgrep-version' -Exe $fakeSemgrep -Args0 @('--version')
    Assert-That 'semgrep-version 모드 실행 경로: 절대 경로의 semgrep.exe 를 ["--version"] 으로 부른다(셸·PATH 탐색 없음)' ($r.result.child.started -eq $true -and -not $r.result.refused -and $r.result.childState -eq 'EXITED' -and ([string]$r.result.child.mainModule).Equals($fakeSemgrep, [StringComparison]::OrdinalIgnoreCase)) (($r.result | ConvertTo-Json -Depth 3 -Compress))
    Assert-That 'semgrep-version 모드: 대상이 알 수 없는 인자로 실패하면 종료 코드가 0 이 아닌 채로 그대로 기록된다(보정하지 않는다)' ($null -ne $r.result.child.exitCode -and $r.result.child.exitCode -ne 0) "exitCode=$($r.result.child.exitCode)"

    # 거부 경로
    $refusals = @(
        @{ name = 'semgrep-version 인데 실행 파일 이름이 semgrep.exe 가 아니다'; mode = 'semgrep-version'; exe = $ps51; args = @('--version') },
        @{ name = 'semgrep-version 인데 인자가 ["--version","--help"]'; mode = 'semgrep-version'; exe = $fakeSemgrep; args = @('--version', '--help') },
        @{ name = 'semgrep-version 인데 인자가 ["--help"]'; mode = 'semgrep-version'; exe = $fakeSemgrep; args = @('--help') },
        @{ name = 'semgrep-version 인데 인자가 없다'; mode = 'semgrep-version'; exe = $fakeSemgrep; args = @() },
        @{ name = 'semgrep-version 인데 실행 파일이 상대 경로'; mode = 'semgrep-version'; exe = 'Scripts\semgrep.exe'; args = @('--version') },
        @{ name = 'stub 인데 허용되지 않은 시나리오'; mode = 'stub'; exe = $ps51; args = @(Get-StubArgs 'format-disk') },
        @{ name = 'stub 인데 다른 스크립트'; mode = 'stub'; exe = $ps51; args = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-Path $sandbox 'other.ps1'), 'ok') },
        @{ name = 'stub 인데 실행 파일이 powershell 이 아니다'; mode = 'stub'; exe = (Join-Path $env:WINDIR 'System32\whoami.exe'); args = @(Get-StubArgs 'ok') },
        @{ name = '알 수 없는 mode'; mode = 'any-command'; exe = $ps51; args = @('-Command', 'whoami') }
    )
    foreach ($rf in $refusals) {
        $r = Invoke-Runner -Mode $rf.mode -Exe $rf.exe -Args0 $rf.args
        Assert-That "거부: $($rf.name)" ($r.exit -eq 2 -and [bool]$r.result.refused -and $r.result.child.started -eq $false) "exit=$($r.exit) refused=$($r.result.refused)"
    }
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'ok') -Limits ([ordered]@{ timeoutMs = 0; maxStdoutBytes = 4096; maxStderrBytes = 16384; killWaitMs = 5000 })
    Assert-That '거부: 한도가 1 미만이면 실행하지 않는다' ($r.exit -eq 2 -and $r.result.child.started -eq $false)
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'ok') -Cwd (Join-Path $sandbox 'no-such-dir')
    Assert-That '거부: 작업 폴더가 없으면 실행하지 않는다' ($r.exit -eq 2 -and $r.result.child.started -eq $false)

    # ── 읽기 함수·판정 함수(가짜 스트림·합성 결과) ──
    Invoke-StreamTests
    Invoke-JudgeTests

    # ── 진짜 실행기가 남긴 결과를 판정에 그대로 먹인다(실행기 ↔ 판정이 같은 모양으로 맞물리는지) ──
    $judgeLimits = [ordered]@{ timeoutMs = 3000; maxStdoutBytes = 4096; maxStderrBytes = 16384; killWaitMs = 5000 }
    foreach ($row in @(
            @{ sc = 'ok'; token = $null; version = '0.0.0' }, @{ sc = 'ok-stderr'; token = $null; version = '0.0.0' }, @{ sc = 'orphan'; token = 'STREAMS_NOT_CLOSED'; version = $null },
            @{ sc = 'nonzero'; token = 'NONZERO_EXIT'; version = $null }, @{ sc = 'multiline'; token = 'OUTPUT_NOT_SINGLE_LINE'; version = $null },
            @{ sc = 'sleep'; token = 'TIMEOUT'; version = $null }, @{ sc = 'flood-out'; token = 'OUTPUT_LIMIT_EXCEEDED'; version = $null })) {
        $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs $row.sc) -Limits $judgeLimits
        $j = Get-VersionObservationFailures -RunnerResult $r.result -StdoutBytes (Get-OutBytes $r.result 'stdout')
        Assert-That "실행기 결과 → 판정: 스텁 $($row.sc) → 주 토큰 $(if ($row.token) { $row.token } else { '없음(사용 가능)' })" ($j.failure -eq $row.token -and ($null -eq $row.version -or ($j.parsed -and $j.parsed.version -eq $row.version))) "실제 failure=$($j.failure) failures=$(@($j.failures) -join ',')"
        if ($row.sc -eq 'orphan') {
            # 자식은 0 으로 끝나고 stdout 도 온전해 보이지만 손자가 파이프를 쥐고 있어 EOF 를 보지 못했다: 수집이 끝났다고 확인할 수 없으므로 사용 불가. 정리는 그대로 일어난다.
            Assert-That '실행기 결과(orphan): 파이프가 EOF 에 닿지 못해 streamsClosed=false·state OPEN 이지만, 남은 자손은 정리된다' ($r.result.streamsClosed -eq $false -and $r.result.stdout.state -eq 'OPEN' -and $r.result.child.exitCode -eq 0 -and @($r.result.descendantsLeftoverKilled).Count -ge 1 -and $r.result.descendantsAliveAfterCleanup -eq 0) (($r.result.stdout | ConvertTo-Json -Compress))
        }
        if ($row.sc -in 'ok', 'ok-stderr') {
            Assert-That "실행기 결과($($row.sc)): 정상 EOF 로 기록된다(streamsClosed=true, state EOF, readFailed=false, schema 2)" ($r.result.streamsClosed -eq $true -and $r.result.stdout.state -eq 'EOF' -and $r.result.stderr.state -eq 'EOF' -and $r.result.stdout.readFailed -eq $false -and $r.result.stdout.eof -eq $true -and $r.result.schema -eq 2 -and $r.result.child.streamReadFailed -eq $false) (($r.result.stdout | ConvertTo-Json -Compress))
        }
        if ($row.sc -eq 'sleep') { Assert-That '실행기 결과(시간 초과): 스트림이 닫히지 않았다(streamsClosed=false, state OPEN)이고 판정이 사용 불가로 본다' ($r.result.streamsClosed -eq $false -and $r.result.stdout.state -eq 'OPEN') (($r.result.stdout | ConvertTo-Json -Compress)) }
    }
    $r = Invoke-Runner -Mode 'semgrep-version' -Exe $ps51 -Args0 @('--version')
    $j = Get-VersionObservationFailures -RunnerResult $r.result -StdoutBytes ([byte[]]@())
    Assert-That '실행기 결과 → 판정: 거부된 요청은 RUNNER_REFUSED 가 주 토큰이다(수집 기록이 없어도 정상으로 보지 않는다)' ($j.failure -eq 'RUNNER_REFUSED' -and $null -eq $j.parsed) "실제 $($j.failure) / $(@($j.failures) -join ',')"

    # ── Windows 환경 계약: 전용 USERPROFILE 만 더하고, 부모 환경은 물려주지 않는다 ──
    $stateDir = Join-Path $sandbox 'state'; $homeDir = Get-VersionChildHome -StateDir $stateDir
    [void][IO.Directory]::CreateDirectory($homeDir)
    $envA = New-VersionChildEnv -WindowsDir $env:WINDIR -TmpDir $cwdDir -StateDir $stateDir -Url 'http://127.0.0.1:5'
    $expectNames = @('PATH', 'SEMGREP_APP_URL', 'SEMGREP_ENABLE_VERSION_CHECK', 'SEMGREP_LOG_FILE', 'SEMGREP_METRICS_URL', 'SEMGREP_SETTINGS_FILE', 'SEMGREP_VERSION_CACHE_PATH', 'SEMGREP_VERSION_CHECK_URL', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE')
    Assert-That '환경 계약(PS): 이름 집합이 최소 목록 + USERPROFILE + SEMGREP_ENABLE_VERSION_CHECK 이다(HOME·HOMEDRIVE·HOMEPATH·APPDATA·PYTHONUNBUFFERED 없음)' ((($envA.Keys | Sort-Object) -join ',') -eq (($expectNames | Sort-Object) -join ',')) (($envA.Keys | Sort-Object) -join ',')
    Assert-That '환경 계약(PS): 온라인 최신 버전 조회를 끄는 고정값 SEMGREP_ENABLE_VERSION_CHECK 는 문자열 0 이다' ([string]$envA['SEMGREP_ENABLE_VERSION_CHECK'] -ceq '0') "실제 '$($envA['SEMGREP_ENABLE_VERSION_CHECK'])'"
    $prevVc = $env:SEMGREP_ENABLE_VERSION_CHECK
    try { $env:SEMGREP_ENABLE_VERSION_CHECK = '1'; $envParentOn = New-VersionChildEnv -WindowsDir $env:WINDIR -TmpDir $cwdDir -StateDir $stateDir -Url 'http://127.0.0.1:5' }
    finally { if ($null -eq $prevVc) { Remove-Item Env:\SEMGREP_ENABLE_VERSION_CHECK -ErrorAction SilentlyContinue } else { $env:SEMGREP_ENABLE_VERSION_CHECK = $prevVc } }
    Assert-That '환경 계약(PS): 부모 환경에 SEMGREP_ENABLE_VERSION_CHECK=1 이 있어도 자식 값은 0 이다(부모 값을 읽거나 복사하지 않는다)' ([string]$envParentOn['SEMGREP_ENABLE_VERSION_CHECK'] -ceq '0') "실제 '$($envParentOn['SEMGREP_ENABLE_VERSION_CHECK'])'"
    Assert-That '환경 계약(PS): USERPROFILE 은 상태 폴더 아래 전용 home 이고 부모 USERPROFILE 이 아니다' ($envA.USERPROFILE -eq (Join-Path $stateDir 'home') -and $envA.USERPROFILE -ne $env:USERPROFILE -and $envA.USERPROFILE.StartsWith($stateDir + '\', [StringComparison]::OrdinalIgnoreCase)) $envA.USERPROFILE
    $leak = @($envA.Values | Where-Object { ([string]$_) -match 'must-not-leak|user:pass' -or ([string]$_).TrimEnd('\') -ieq ([string]$env:USERPROFILE).TrimEnd('\') })
    Assert-That '환경 계약(PS): 부모의 canary(토큰·프록시)와 부모 프로필 폴더 자체가 값에 없다' ($leak.Count -eq 0) ($leak -join ',')
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'home') -EnvTable $envA
    Assert-That '환경 전달: 자식이 요청한 전용 USERPROFILE 값을 받는다(부모 값이 아니다)' ((([Text.Encoding]::UTF8.GetString((Get-OutBytes $r.result 'stdout'))).Trim()) -eq $homeDir -and ([Text.Encoding]::UTF8.GetString((Get-OutBytes $r.result 'stdout'))).Trim() -ne $env:USERPROFILE) "받은 값: $([Text.Encoding]::UTF8.GetString((Get-OutBytes $r.result 'stdout')).Trim())"
    # 실행기 → 자식: 요청한 값 0 이 그대로 도착하고, 요청에 없으면 부모에 1 이 있어도 도착하지 않는다(스텁은 받은 이 변수 값 한 줄만 찍는다).
    $prevVc = $env:SEMGREP_ENABLE_VERSION_CHECK
    try {
        $env:SEMGREP_ENABLE_VERSION_CHECK = '1'
        $rVc = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'version-check') -EnvTable $envA
        $envNoVc = [ordered]@{}; foreach ($k in $envA.Keys) { if ($k -ne 'SEMGREP_ENABLE_VERSION_CHECK') { $envNoVc[$k] = $envA[$k] } }
        $rVcNone = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'version-check') -EnvTable $envNoVc
    } finally { if ($null -eq $prevVc) { Remove-Item Env:\SEMGREP_ENABLE_VERSION_CHECK -ErrorAction SilentlyContinue } else { $env:SEMGREP_ENABLE_VERSION_CHECK = $prevVc } }
    $vcGot = ([Text.Encoding]::ASCII.GetString((Get-OutBytes $rVc.result 'stdout'))).Trim()
    $vcNone = ([Text.Encoding]::ASCII.GetString((Get-OutBytes $rVcNone.result 'stdout'))).Trim()
    Assert-That '환경 전달: 자식이 요청한 SEMGREP_ENABLE_VERSION_CHECK=0 을 받는다(부모 값은 1)' ($vcGot -ceq '0' -and $rVc.result.child.exitCode -eq 0) "받은 값: '$vcGot' exit=$($rVc.result.child.exitCode)"
    Assert-That '환경 전달: 요청에 없으면 부모에 1 이 있어도 자식은 받지 못한다(부모 환경 비상속)' ($vcNone -ceq '' -and $rVcNone.result.child.exitCode -eq 0) "받은 값: '$vcNone' exit=$($rVcNone.result.child.exitCode)"
    $r = Invoke-Runner -Mode 'stub' -Exe $ps51 -Args0 (Get-StubArgs 'env-names') -EnvTable $envA
    $namesA = @(([Text.Encoding]::ASCII.GetString((Get-OutBytes $r.result 'stdout'))).Trim() -split ',' | Where-Object { $_ })
    $extraA = @($namesA | Where-Object { ($expectNames + @('PSModulePath', 'PathExt', 'PSExecutionPolicyPreference')) -notcontains $_ })
    Assert-That '환경 전달: 자식 환경 이름이 요청한 것(+PS 가 스스로 채우는 변수)뿐이고 canary 이름이 없다' ($extraA.Count -eq 0 -and @($namesA | Where-Object { $_ -match 'CANARY|PROXY|TOKEN' }).Count -eq 0) ("예상 밖: " + ($extraA -join ','))

    # 기존 Python 으로 Path.home() 만 확인한다(Semgrep 은 임포트하지 않는다: -I -S 로 사이트·사용자 설정도 읽지 않는다).
    function Invoke-PyHome {
        param($EnvTable)
        $psi = New-Object Diagnostics.ProcessStartInfo
        $psi.FileName = $PythonExe; $psi.Arguments = '-I -S -c "import pathlib,sys; sys.stdout.write(str(pathlib.Path.home()))"'
        $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
        $psi.EnvironmentVariables.Clear(); foreach ($k in $EnvTable.Keys) { $psi.EnvironmentVariables[[string]$k] = [string]$EnvTable[$k] }
        $pp = [Diagnostics.Process]::Start($psi)
        $so = $pp.StandardOutput.ReadToEndAsync(); $se = $pp.StandardError.ReadToEndAsync()
        if (-not $pp.WaitForExit(20000)) { try { $pp.Kill() } catch { }; return [pscustomobject]@{ exit = $null; out = ''; err = 'timeout' } }
        [pscustomobject]@{ exit = $pp.ExitCode; out = $so.Result; err = $se.Result }
    }
    if ($PythonExe -and (Test-Path -LiteralPath $PythonExe -PathType Leaf)) {
        $py = Invoke-PyHome $envA
        Assert-That 'Path.home()(기존 Python, Semgrep 미임포트): 전용 USERPROFILE 을 돌려준다' ($py.exit -eq 0 -and $py.out.Trim() -eq $homeDir) "exit=$($py.exit) out='$($py.out)' err='$($py.err)'"
        $envNoHome = [ordered]@{}; foreach ($k in $envA.Keys) { if ($k -ne 'USERPROFILE') { $envNoHome[$k] = $envA[$k] } }
        $py2 = Invoke-PyHome $envNoHome
        Assert-That 'Path.home()(대조: USERPROFILE 이 없는 예전 환경): 실제 실패와 같은 오류 "Could not determine home directory." 로 실패한다' ($py2.exit -ne 0 -and $py2.err -match 'Could not determine home directory') "exit=$($py2.exit) err='$(($py2.err -split "`n" | Select-Object -Last 2) -join ' | ')'"
    } else { Skip-Test 'Path.home() 확인(기존 Python)' '-PythonExe 가 없어 실행하지 않았다(통과로 세지 않는다)' }

    # TS buildChildEnv(win32/linux)와 이름 집합·상태 폴더 배치를 대조한다.
    $cliReady = $tsReady -and $CliTs -and (Test-Path -LiteralPath $CliTs)
    if (-not $cliReady) { Skip-Test '환경 계약(PS) ↔ 실제 TS buildChildEnv 대조' 'tsx 또는 -CliTs 경로가 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        $envDriver = Join-Path $sandbox 'env-driver.mts'
        $envDriverText = @'
import { pathToFileURL } from "node:url";
const mod: any = await import(pathToFileURL(process.argv[2]).href);
const parent: Record<string, string> = { PATH: "C:/Windows/System32", SYSTEMROOT: "C:/Windows", TEMP: "C:/t", TMP: "C:/t", USERPROFILE: "C:/Users/parent", HOME: "/home/parent", HTTPS_PROXY: "http://user:pass@x", GITHUB_TOKEN: "tok", SEMGREP_ENABLE_VERSION_CHECK: "1" };
const getEnv = (n: string) => parent[n];
const win = mod.buildVersionChildEnv({ getEnv, platform: "win32" }, "C:/ev/run-1", "http://127.0.0.1:5");
const lin = mod.buildVersionChildEnv({ getEnv, platform: "linux" }, "/ev/run-1", "http://127.0.0.1:5");
const server = mod.buildChildEnv({ getEnv, platform: "win32" }, "C:/ev/run-1", "http://127.0.0.1:5");
console.log(JSON.stringify({ win, lin, server }));
'@
        [IO.File]::WriteAllText($envDriver, $envDriverText, (New-Object Text.UTF8Encoding($false)))
        $oldPath = $env:PATH
        if ($NodeDir) { $env:PATH = $NodeDir + ';' + $env:PATH }
        try { $tsEnvOut = & $TsxCmd $envDriver $CliTs 2>&1; $tsEnvExit = $LASTEXITCODE } finally { $env:PATH = $oldPath }
        $tsEnv = $null; try { $tsEnv = ($tsEnvOut | Out-String) | ConvertFrom-Json } catch { }
        Assert-That '환경 계약(PS) ↔ TS: tsx 로 buildChildEnv 실행 성공' ($tsEnvExit -eq 0 -and $null -ne $tsEnv) ("exit=$tsEnvExit " + (($tsEnvOut | Out-String).Trim().Substring(0, [Math]::Min(300, ($tsEnvOut | Out-String).Trim().Length))))
        if ($tsEnv) {
            $psWin = New-VersionChildEnv -WindowsDir 'C:/Windows' -TmpDir 'C:/t' -StateDir 'C:/ev/run-1/version-check-state' -Url 'http://127.0.0.1:5'
            $tsWinNames = @($tsEnv.win.PSObject.Properties.Name | Sort-Object)
            Assert-That '환경 계약(PS) ↔ TS(win32): 이름 집합이 같다' (($tsWinNames -join ',') -eq (($psWin.Keys | Sort-Object) -join ',')) ("TS: " + ($tsWinNames -join ',') + " / PS: " + (($psWin.Keys | Sort-Object) -join ','))
            Assert-That '환경 계약 TS(버전 관측): 부모에 SEMGREP_ENABLE_VERSION_CHECK=1 이 있어도 값은 0 이다(win32·linux). 서버 경로 환경에는 이 이름이 없다' (($tsEnv.win.SEMGREP_ENABLE_VERSION_CHECK -ceq '0') -and ($tsEnv.lin.SEMGREP_ENABLE_VERSION_CHECK -ceq '0') -and ($tsEnv.server.PSObject.Properties.Name -notcontains 'SEMGREP_ENABLE_VERSION_CHECK')) ("win=$($tsEnv.win.SEMGREP_ENABLE_VERSION_CHECK) lin=$($tsEnv.lin.SEMGREP_ENABLE_VERSION_CHECK) server에 있음=$($tsEnv.server.PSObject.Properties.Name -contains 'SEMGREP_ENABLE_VERSION_CHECK')")
            $diffVals = @(); foreach ($k in 'USERPROFILE', 'SEMGREP_ENABLE_VERSION_CHECK', 'SEMGREP_APP_URL', 'SEMGREP_METRICS_URL', 'SEMGREP_VERSION_CHECK_URL', 'SEMGREP_LOG_FILE', 'SEMGREP_SETTINGS_FILE', 'SEMGREP_VERSION_CACHE_PATH') { if (([string]$tsEnv.win.$k) -ne (([string]$psWin[$k]).Replace('\', '/'))) { $diffVals += "$k TS='$($tsEnv.win.$k)' PS='$($psWin[$k])'" } }
            Assert-That '환경 계약(PS) ↔ TS(win32): USERPROFILE·상태 파일 경로·URL 값이 같다(경로 구분자만 다름)' ($diffVals.Count -eq 0) ($diffVals -join ' | ')
            Assert-That '환경 계약 TS(win32): 부모의 USERPROFILE·HOME·프록시·토큰을 복사하지 않는다' (($tsEnv.win.USERPROFILE -ne 'C:/Users/parent') -and ($null -eq $tsEnv.win.HOME) -and ($null -eq $tsEnv.win.HTTPS_PROXY) -and ($null -eq $tsEnv.win.GITHUB_TOKEN) -and ($null -eq $tsEnv.win.HOMEDRIVE) -and ($null -eq $tsEnv.win.APPDATA))
            Assert-That '환경 계약 TS(linux): 예전과 같다(USERPROFILE 없음, PATH·HOME 만 복사, 상태 경로는 증거 폴더 안)' (($tsEnv.lin.PSObject.Properties.Name -notcontains 'USERPROFILE') -and $tsEnv.lin.HOME -eq '/home/parent' -and $tsEnv.lin.PATH -eq 'C:/Windows/System32' -and $tsEnv.lin.SEMGREP_LOG_FILE -eq '/ev/run-1/version-check-state/semgrep.log')
        }
    }

    # TS 대조
    if ($tsReady) {
        $driver = Join-Path $sandbox 'parse-driver.mts'
        $driverText = @'
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const mod: any = await import(pathToFileURL(process.argv[3]).href);
const cases: { name: string; hex: string }[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = cases.map((c) => {
  const bytes = Uint8Array.from(Buffer.from(c.hex, "hex"));
  const r = mod.parseVersionStdout(bytes);
  return { name: c.name, ok: r.ok, version: r.ok ? r.version : null, failure: r.ok ? null : r.failure };
});
console.log(JSON.stringify(out));
'@
        [IO.File]::WriteAllText($driver, $driverText, (New-Object Text.UTF8Encoding($false)))
        $casesFile = Join-Path $sandbox 'cases.json'
        [IO.File]::WriteAllText($casesFile, (ConvertTo-Json -InputObject @($cases | ForEach-Object { [ordered]@{ name = $_.name; hex = $_.hex } }) -Depth 4), (New-Object Text.UTF8Encoding($false)))
        $oldPath = $env:PATH
        if ($NodeDir) { $env:PATH = $NodeDir + ';' + $env:PATH }       # tsx.cmd 는 PATH 에서 node 를 찾는다. 이 호출 동안만 앞에 붙이고 곧 되돌린다
        try { $tsOut = & $TsxCmd $driver $casesFile $ToolObservationTs 2>&1; $tsExit = $LASTEXITCODE } finally { $env:PATH = $oldPath }
        $tsJson = $null; try { $tsJson = ($tsOut | Out-String) | ConvertFrom-Json } catch { }
        Assert-That '계약(PS) ↔ TS: tsx 실행 성공' ($tsExit -eq 0 -and $null -ne $tsJson -and @($tsJson).Count -eq $cases.Count) ("exit=$tsExit " + (($tsOut | Out-String).Trim().Substring(0, [Math]::Min(300, ($tsOut | Out-String).Trim().Length))))
        if ($tsJson) {
            $diff = @()
            foreach ($t in @($tsJson)) {
                $p = $psParsed[[string]$t.name]
                if (([bool]$t.ok) -ne ([bool]$p.ok) -or [string]$t.version -ne [string]$p.version -or [string]$t.failure -ne [string]$p.failure) { $diff += ("{0}: TS(ok={1},v={2},f={3}) PS(ok={4},v={5},f={6})" -f $t.name, $t.ok, $t.version, $t.failure, $p.ok, $p.version, $p.failure) }
            }
            Assert-That "계약(PS) ↔ TS: $($cases.Count)개 입력의 결과가 모두 같다" ($diff.Count -eq 0) ($diff -join ' | ')
        }
    }
} finally {
    Remove-Item Env:\BOSANG_CANARY_SECRET, Env:\GITHUB_TOKEN_CANARY, Env:\HTTPS_PROXY -ErrorAction SilentlyContinue
    # 시험이 남긴 스텁 자손이 없어야 한다(있으면 정리 실패이므로 실패로 센다). 남은 것은 치운다.
    $sleepersAfter = @(Get-SleeperPids | Where-Object { $sleepersBefore -notcontains $_ })
    Assert-That '시험 뒤 남은 스텁 자손 프로세스가 없다' ($sleepersAfter.Count -eq 0) ("남은 PID: " + ($sleepersAfter -join ','))
    foreach ($sp in $sleepersAfter) { Stop-Process -Id $sp -Force -ErrorAction SilentlyContinue }
    try { Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction Stop } catch { Write-Host "샌드박스를 지우지 못했다: $sandbox ($($_.Exception.Message))" -ForegroundColor Yellow }
}

$pass = @($results | Where-Object { $_.pass -eq $true }).Count
$fail = @($results | Where-Object { $_.pass -eq $false }).Count
$skip = @($results | Where-Object { $null -eq $_.pass }).Count
Write-Host ("{0}/{1} 통과, 실패 {2}, 건너뜀 {3}  (엔진 {4})" -f $pass, ($pass + $fail), $fail, $skip, $PSVersionTable.PSVersion)
if ($fail -gt 0) { exit 1 }
exit 0
