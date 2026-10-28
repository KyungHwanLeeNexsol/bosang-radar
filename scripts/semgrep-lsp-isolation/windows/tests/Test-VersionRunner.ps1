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
param([string]$TsxCmd, [string]$ToolObservationTs, [string]$NodeDir)
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
$files = 'version-runner.ps1', 'version-stub.ps1', 'VersionContract.ps1', 'Test-VersionObservation.ps1', 'tests\Test-VersionRunner.ps1'
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
