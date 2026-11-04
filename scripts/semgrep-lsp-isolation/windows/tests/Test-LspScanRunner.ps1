<#
.SYNOPSIS
  lsp-scan-runner.ps1 의 송신 제한·initialized 조건·장벽·didOpen 조건·두 묶음 대기와 settle·중단 조건·종료 정책·환경 격리·거부 경로와 LspScanContract.ps1 의 계약 이식본을 무해한 스텁으로 확인한다.
.DESCRIPTION
  시스템 설정(계정·방화벽·감사·ACL)을 바꾸지 않는다. 임시 샌드박스 폴더에서 현재 사용자로 러너를 부르고, 스텁(lsp-scan-stub.ps1)과 시스템 폴더의 실행 파일 하나(whoami.exe 사본)만 쓴다.
  semgrep 과 git 은 실행하지 않는다. 확인 항목:
    - 구문, BOM, 금지된 명령(Invoke-Expression, 내려받기, semgrep·git 호출)
    - TS ↔ PS 골든 대조(tsx 없이 돈다): tests/lsp-scan-parity.json 의 모든 사례(URI 비교, 감시 대본(도착 순서·청크·사전 증거·settle 변형), 요청 검사, 송신 방어선, 한도 해석)에서 PS 이식본의 출력이 TS 가 계산한 기대값과 같다
    - 계약 자체 점검(TS 없이)과, tsx 가 있을 때만 계약(PS) ↔ 실제 TS 모듈 대조와 골든이 낡지 않았는지 대조. tsx 가 없으면 SKIPPED 로 표시하고 통과로 세지 않는다
    - Send-LsMessage 단위 확인(가짜 stdin 스트림): 장벽 앞의 didOpen·두 번째 didOpen·내용이 다른 didOpen 은 쓰지 않고 A10 으로 끝낸다
    - 러너 end-to-end: 스텁 시나리오마다 송신 순서, 중단 조건, 강제 종료, 종료 코드, 시간 한도가 늘어나지 않음
    - 필수 도착 순서 행렬: 진단이 먼저 / 로그가 먼저 / 1바이트씩 / 동시에 → 같은 SCAN_RESPONSE_OBSERVED, settle 은 늦은 묶음에서 시작
    - 요청 거부 경로(한도 상향, 모르는 mode·인자·환경 이름, 드라이브 문자가 아닌 경로, 합성 파일·프로브 바이트·해시, 배치, 링크)
    - 러너 결과 → 실제 TS 어댑터(factsFromScanRunnerResult)·기록 만들기(buildScanRecord): 시나리오마다 판정이 기대와 같은가(tsx 가 있을 때만)
  이 시험의 통과는 "러너와 계약 이식본이 스텁·합성 입력에서 의도대로 동작한다"까지만 뜻한다. 실제 Semgrep 의 동작은 뜻하지 않는다.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\tests\Test-LspScanRunner.ps1 -TsxCmd C:\repo\node_modules\.bin\tsx.cmd -NodeDir C:\node
#>
[CmdletBinding()]
param(
    [string]$TsxCmd, [string]$NodeDir, [string]$TsDir,
    # 분할 실행(시스템 메모리가 모자랄 때). 기본값 All 은 예전과 똑같이 전부 돈다. 단언은 하나도 빠지거나 느슨해지지 않고, 어느 묶음에서 세는지만 나뉜다.
    #   Pre = 정적 점검·골든·계약·TS 대조·단위(1~4절) / Cases = 5절 시나리오 중 -CaseFrom..-CaseTo 번째(1부터, 표 순서) / Post = 도착 순서 행렬·기본 한도·전체 상한·중단 파일·환경 격리·거부 경로·semgrep-lsp 모드(5절 뒷부분)
    #   Aggregate = 6절(러너 결과 → TS 판정; 앞 묶음이 -StateFile 에 남긴 결과 파일 전체를 쓴다).
    # Cases·Post 묶음은 -StateFile 에 결과 파일 위치를 이어 적고, 그 결과 파일이 있는 샌드박스를 지우지 않는다(-KeepSandbox 를 함께 준다). 지우는 것은 Aggregate 뒤에 시험 소유자가 한다.
    [ValidateSet('All', 'Pre', 'Cases', 'Post', 'Aggregate')][string]$Part = 'All',
    [int]$CaseFrom = 1, [int]$CaseTo = 0,
    [string]$StateFile, [string]$ResultsFile, [switch]$KeepSandbox
)
$ErrorActionPreference = 'Stop'
$windowsDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $windowsDir 'LspScanContract.ps1')
$ps51 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not $TsDir) { $TsDir = Join-Path $windowsDir '..\..\semgrep-lsp' }
$tsReady = $false
if ($TsxCmd -and (Test-Path -LiteralPath $TsxCmd) -and (Test-Path -LiteralPath (Join-Path $TsDir 'lsp-scan.ts'))) { $tsReady = $true; $TsDir = (Resolve-Path -LiteralPath $TsDir).Path }

$runPre = $Part -in 'All', 'Pre'
$runCases = $Part -in 'All', 'Cases'
$runPost = $Part -in 'All', 'Post'
$runAgg = $Part -in 'All', 'Aggregate'
# 비-Pre 묶음은 2절(정의와 섞여 있어 건너뛸 수 없는 계약 점검)을 다시 계산만 하고 그 단언은 세지 않는다. Pre 묶음(와 All)이 센다.
$Script:Recording = $runPre
$results = New-Object System.Collections.ArrayList
function Assert-That([string]$Name, [bool]$Condition, [string]$Detail = '') {
    if (-not $Script:Recording) { return }
    [void]$results.Add([ordered]@{ name = $Name; pass = $Condition; detail = $Detail })
    if (-not $Condition) { Write-Host ("FAIL  {0}  {1}" -f $Name, $Detail) -ForegroundColor Red }
}
function Skip-Test([string]$Name, [string]$Why) {
    if (-not $Script:Recording) { return }
    [void]$results.Add([ordered]@{ name = $Name; pass = $null; detail = $Why })
    Write-Host ("SKIPPED  {0}  {1}" -f $Name, $Why) -ForegroundColor Yellow
}
function Limit-Text([string]$Text, [int]$Max = 300) { if ($Text.Length -le $Max) { $Text } else { $Text.Substring(0, $Max) + '...' } }

# ── 정적 점검: 구문, BOM, LF, 금지된 명령 ──────────────────────────────────────
if ($runPre) {
$files = 'LspScanContract.ps1', 'lsp-scan-runner.ps1', 'lsp-scan-stub.ps1', 'LspScanAdminContract.ps1', 'LspScanAdminPorts.ps1', 'Test-LspScanObservation.ps1', 'tests\Test-LspScanRunner.ps1', 'tests\Test-LspScanFrame.ps1', 'tests\Test-LspScanAdmin.ps1', 'tests\MockPortsScan.ps1', 'tests\MockSystemScan.ps1'
$forbidden = 'Invoke-Expression', 'iex', 'Invoke-WebRequest', 'Invoke-RestMethod', 'Start-BitsTransfer', 'curl', 'wget', 'git', 'git.exe'
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
            ($nm -and ($forbidden -contains $nm -or $nm -match '(?i)^(semgrep|pysemgrep|semgrep-core)(\.exe)?$')) -or ($first -match '(?i)(^|[\\/])(semgrep|pysemgrep|semgrep-core|git)(\.exe)?$')
        } | ForEach-Object { $_.Extent.Text.Split("`n")[0].Trim() })
    Assert-That "내려받기·Invoke-Expression·semgrep·git 명령 호출 없음 ($f)" ($hits.Count -eq 0) ($hits -join ' | ')
}
# 원문 grep 으로도 한 번 더: 러너와 스텁에 git 을 실행하는 문구가 없다(외부 명령 줄은 문자열 데이터일 뿐이다).
foreach ($f in 'lsp-scan-runner.ps1', 'lsp-scan-stub.ps1', 'LspScanContract.ps1') {
    $txt = [IO.File]::ReadAllText((Join-Path $windowsDir $f), [Text.Encoding]::UTF8)
    Assert-That "git 실행 문구 없음 ($f): Start-Process·& git·git.exe 호출이 없다" ($txt -notmatch '(?i)(Start-Process[^\n]*git|&\s*git\b|\bgit\.exe\b|ProcessStartInfo[^\n]*git)') ''
}
Assert-That '허용 이미지 목록에 git 이 없다 (ALLOWED_IMAGES 불변)' (@($Script:LspMinAllowedImages | Where-Object { $_ -match 'git' }).Count -eq 0) ($Script:LspMinAllowedImages -join ',')
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
    # 배열(ArrayList 포함)을 객체보다 먼저 본다: ArrayList 는 PSObject 로 감싸져 `-is [pscustomobject]` 도 참이라 순서가 바뀌면 Capacity·Count 속성으로 풀린다.
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
if ($runPre) {
$goldenPath = Join-Path $PSScriptRoot 'lsp-scan-parity.json'
# Windows PowerShell 5.1 의 ConvertFrom-Json 은 최상위 배열을 풀지 않고 한 개체로 내보낸다(7 은 푼다). -InputObject 로 받아 대입하면 두 엔진 모두 배열이 된다.
$goldenParsed = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($goldenPath, [Text.Encoding]::UTF8))
$golden = @($goldenParsed)
$kinds = @($golden | ForEach-Object { $_.kind } | Sort-Object -Unique)
Assert-That '골든: 파일을 읽었고 사례가 100개를 넘으며 여섯 종류가 모두 있다' ($golden.Count -gt 100 -and $kinds.Count -eq 6 -and ($kinds -join ',') -ceq 'limits,outbound,progress-analysis,request-check,uri-compare,watch-script') "count=$($golden.Count) kinds=$($kinds -join ',')"

function Get-GoldenActual($Case) {
    switch -CaseSensitive ([string]$Case.kind) {
        'uri-compare' { return (Compare-LsUri $Case.input.actual $Case.input.expected) }
        'watch-script' { return (Invoke-LsWatchScript $Case.input) }
        'request-check' {
            $r = Get-LsStaticRefusals $Case.input
            $s = [string[]]@($r.refusals)
            [Array]::Sort($s, [StringComparer]::Ordinal)
            return , $s
        }
        'outbound' {
            try { Assert-LsOutbound -Label ([string]$Case.input.label) -Message $Case.input.message -Ctx $Case.input.ctx; return 'ok' } catch { return 'throws' }
        }
        'limits' { $x = Resolve-LsLimits $Case.input; return ([ordered]@{ limits = $x.limits; problems = @($x.problems) }) }
        'progress-analysis' {
            # 메시지는 JSON 에서 읽은 그대로(디코더가 만드는 것과 같은 모양)이고 바이트 구간은 없다.
            $fr = New-Object System.Collections.ArrayList; $n = 0
            foreach ($msg in @($Case.input.messages)) { [void]$fr.Add(@{ index = $n; startByte = $null; endByte = $null; message = $msg }); $n++ }
            return (ConvertTo-LsProgressSummary (Get-LsProgressAnalysis @($fr)))
        }
    }
}
$mismatch = 0
foreach ($c in $golden) {
    $actual = $null
    try { $actual = Get-GoldenActual $c } catch { $actual = "EXCEPTION: $($_.Exception.Message)" }
    $a = ConvertTo-SortedJson $actual; $e = ConvertTo-SortedJson $c.expected
    $same = ($a -ceq $e)
    if (-not $same) { $mismatch++ }
    Assert-That "골든 대조: $($c.id)" $same ("PS: " + (Limit-Text $a) + " / TS: " + (Limit-Text $e))
}
Assert-That "골든: 모든 사례(총 $($golden.Count))에서 PS 출력이 TS 기대값과 같다" ($mismatch -eq 0) "불일치 $mismatch 건"

# 러너가 실제로 부르는 가벼운 판정(Test-LsBarrierReady·Test-LsProgressComplete)은 골든이 비교하는 평가 함수(Get-LsBarrierStatus)와 따로 있다.
# 골든의 지연 사례를 감시기에 직접 되감아, 두 번째 초기 진행 묶음이 다 읽히기 전에는 기다림이 끝나지 않고(ready 아님) 다 읽힌 뒤에야 끝나는지 본다.
function Invoke-GoldenWatchState($Case) {
    $cfg = $Case.input.config
    $config = [ordered]@{ workspace = [string]$cfg.workspace; expectedTargetUri = $cfg.expectedTargetUri; probePath = [string]$cfg.probePath; scanMs = [double]$cfg.scanMs; settleMs = [double]$cfg.settleMs; maxStdoutBytes = [int]$cfg.maxStdoutBytes }
    $w = New-LsLiveWatch $config
    foreach ($ev in @($Case.input.events)) {
        switch -CaseSensitive ([string]$ev.op) {
            'stdout' { [void](Add-LsStdout $w (ConvertFrom-LsHex ([string]$ev.hex)) ([double]$ev.tMs)) }
            'stderr' { [void](Add-LsStderr $w (ConvertFrom-LsHex ([string]$ev.hex)) ([double]$ev.tMs)) }
            'initializedSent' { Set-LsInitializedSent $w }
            'barrierDone' { Set-LsBarrierDone $w ([double]$ev.tMs) }
            'didOpenSent' { Set-LsDidOpenSent $w ([double]$ev.tMs) }
        }
    }
    $w
}
$lateById = @{}; foreach ($c in $golden) { if ([string]$c.id -like 'watch:late-second-progress-*') { $lateById[[string]$c.id] = $c } }
$readyOk = ($lateById.Count -ge 8)
foreach ($id in 'none', 'create-only', 'create-begin', 'end-partial') {
    $w = Invoke-GoldenWatchState $lateById["watch:late-second-progress-$id"]
    if ((Test-LsBarrierReady $w) -or (Test-LsProgressComplete $w)) { $readyOk = $false; Write-Host "FAIL  늦은 두 번째 진행 묶음($id): 아직 기다림이 끝나면 안 된다" -ForegroundColor Red }
}
$w = Invoke-GoldenWatchState $lateById['watch:late-second-progress-complete']
if (-not ((Test-LsBarrierReady $w) -and (Test-LsProgressComplete $w))) { $readyOk = $false; Write-Host 'FAIL  늦은 두 번째 진행 묶음(complete): 다 읽힌 뒤에는 기다림이 끝나야 한다' -ForegroundColor Red }
$w = Invoke-GoldenWatchState $lateById['watch:late-second-progress-wrong-token']
if (-not (Test-LsBarrierReady $w) -or (Test-LsProgressComplete $w) -or (Get-LsWatchBarrier $w).clean) { $readyOk = $false; Write-Host 'FAIL  늦은 두 번째 진행 묶음(wrong-token): 더 기다려도 달라지지 않는 위반이라 기다림은 끝나되 clean 이 아니어야 한다' -ForegroundColor Red }
Assert-That '러너가 쓰는 판정(Test-LsBarrierReady·Test-LsProgressComplete): 두 번째 초기 진행 묶음이 없거나 create·begin 까지거나 end 가 일부만 왔으면 기다림이 끝나지 않고, 다 읽히면 끝나며, 위반(wrong-token)이면 끝나되 clean 이 아니다' $readyOk
}

# ═══ 2. 계약 자체 점검 (TS 없이) ═════════════════════════════════════════════════
$workA = 'C:\work\scan-1'
$layoutA = Get-LsLayout -Work $workA
Assert-That '계약: 한도 — 150초 / 초기화 60초 / 장벽 60초 / 장벽 뒤 감시 2초 / 두 묶음 scanMs 30초 / 종료 30초 / stdout 1 MiB / stderr 256 KiB' (($Script:LsLimits.totalMs -eq 150000) -and ($Script:LsLimits.initMs -eq 60000) -and ($Script:LsLimits.rulesMs -eq 60000) -and ($Script:LsLimits.settleMs -eq 2000) -and ($Script:LsLimits.scanMs -eq 30000) -and ($Script:LsLimits.exitMs -eq 30000) -and ($Script:LsLimits.maxStdoutBytes -eq 1048576) -and ($Script:LsLimits.maxStderrBytes -eq 262144) -and @($Script:LsLimits.Keys).Count -eq 11)
Assert-That '계약: 인자는 [lsp,--debug], 보내는 순서는 initialize→initialized→didOpen→shutdown→exit, 프로브 233바이트·합성 파일 135바이트(고정 해시)' (($Script:LsArgs -join ',') -ceq 'lsp,--debug' -and ($Script:LsSendOrder -join ',') -ceq 'initialize,initialized,didOpen,shutdown,exit' -and $Script:LsProbeBytes -eq 233 -and $Script:LsTargetBytes -eq 135 -and $Script:LsTargetSha256 -ceq '097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba')
$envA = New-LspMinChildEnv -WindowsDir 'C:\Windows' -Layout $layoutA -Url 'http://127.0.0.1:41999'
Assert-That '계약: 환경 이름은 11개 그대로이고 PATH 는 <WinDir>\System32;<WinDir> 이며 SEMGREP_LOG_SRCS·토큰·SEMGREP_ENABLE_* 가 없다' ($envA.Count -eq 11 -and [string]$envA['PATH'] -ceq 'C:\Windows\System32;C:\Windows' -and @($envA.Keys | Where-Object { $_ -match 'LOG_SRCS|TOKEN|ENABLE_' }).Count -eq 0)
$initA = New-LsInitializeMessage -Layout $layoutA
Assert-That '계약: initialize 는 규칙 폴더 하나(rules-probe)를 configuration 으로 주고 id 가 lsp-scan-init-1 이며 scan.jobs 가 정수 1 이다' ($initA.id -ceq 'lsp-scan-init-1' -and $initA.params.initializationOptions.scan.configuration[0] -ceq 'C:\work\scan-1\lsp-state\rules-probe' -and @($initA.params.initializationOptions.scan.configuration).Count -eq 1 -and $initA.params.initializationOptions.scan.jobs -eq 1)
Assert-That '계약: 대상 경로와 URI — 작업 영역 아래 lsp-scan-1-target.txt, 기대 URI 는 작업 영역 URI + /lsp-scan-1-target.txt' ($layoutA.targetPath -ceq 'C:\work\scan-1\ws\lsp-scan-1-target.txt' -and (Get-LsTargetUri $layoutA) -ceq ((Get-LsRootUri $layoutA) + '/lsp-scan-1-target.txt'))
$targetFile = Join-Path $windowsDir '..\..\semgrep-lsp\data\lsp-scan-1-target.txt'
$probeFile = Join-Path $windowsDir '..\..\semgrep-lsp\data\lsp-rules-1-probe.yaml'
$targetBytes = $null; if (Test-Path -LiteralPath $targetFile) { $targetBytes = [IO.File]::ReadAllBytes($targetFile) }
$probeBytes = $null; if (Test-Path -LiteralPath $probeFile) { $probeBytes = [IO.File]::ReadAllBytes($probeFile) }
Assert-That '합성 파일: 저장소의 파일이 135바이트이고 해시가 계약의 고정값과 같으며 LF 줄 끝이다' ($null -ne $targetBytes -and $targetBytes.Length -eq 135 -and (Get-LrSha256Hex $targetBytes) -ceq $Script:LsTargetSha256 -and [Array]::IndexOf($targetBytes, [byte]13) -lt 0) "path=$targetFile"
Assert-That '프로브: 저장소의 프로브 규칙 파일이 233바이트이고 해시가 고정값과 같다 (바뀌지 않았다)' ($null -ne $probeBytes -and $probeBytes.Length -eq 233 -and (Get-LrSha256Hex $probeBytes) -ceq 'd5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145') "path=$probeFile"
if ($null -eq $targetBytes) { $targetBytes = New-Object byte[] 135 }
if ($null -eq $probeBytes) { $probeBytes = New-Object byte[] 233 }
$goodDid = New-LsDidOpenMessage -Layout $layoutA -TargetBytes $targetBytes
Assert-That '계약: didOpen 은 languageId plaintext, version 1, uri 는 기대 URI, 본문은 파일 바이트의 UTF-8 이다' ($goodDid.params.textDocument.languageId -ceq 'plaintext' -and $goodDid.params.textDocument.version -eq 1 -and $goodDid.params.textDocument.uri -ceq (Get-LsTargetUri $layoutA) -and $goodDid.params.textDocument.text -ceq [Text.Encoding]::UTF8.GetString($targetBytes))
$threw = $false; try { [void](New-LsDidOpenMessage -Layout $layoutA -TargetBytes (New-Object byte[] 135)) } catch { $threw = $true }
Assert-That '계약: 고정 계약과 다른 바이트로는 didOpen 을 만들지 않는다 (던진다)' $threw
$guardOk = @{ barrierDone = $true; progressComplete = $true; sent = @('initialize', 'initialized'); expectedUri = (Get-LsTargetUri $layoutA); expectedText = $goodDid.params.textDocument.text }
$okSeq = $true
foreach ($step in @(@('initialize', $initA, @{ barrierDone = $false; sent = @(); expectedUri = ''; expectedText = '' }), @('initialized', (New-LsInitializedMessage), @{ barrierDone = $false; sent = @('initialize'); expectedUri = ''; expectedText = '' }), @('didOpen', $goodDid, $guardOk), @('shutdown', (New-LsShutdownMessage), @{ barrierDone = $true; sent = @('initialize', 'initialized', 'didOpen'); expectedUri = ''; expectedText = '' }), @('exit', (New-LsExitMessage), @{ barrierDone = $true; sent = @('initialize', 'initialized', 'didOpen', 'shutdown'); expectedUri = ''; expectedText = '' }))) {
    try { Assert-LsOutbound -Label $step[0] -Message $step[1] -Ctx $step[2] } catch { $okSeq = $false }
}
Assert-That '쓰기 방어선: 계약 함수가 만든 다섯 메시지는 이 순서에서 모두 통과한다' $okSeq
# 초기 진행 메시지를 다 읽기 전의 didOpen 은 장벽을 넘었어도 거절한다. true 가 아닌 값(없음·문자열·0)도 확인되지 않은 것이다.
$progressRefused = $true
foreach ($pc in @($false, $null, 'true', 1)) {
    $g = @{ barrierDone = $true; progressComplete = $pc; sent = @('initialize', 'initialized'); expectedUri = (Get-LsTargetUri $layoutA); expectedText = $goodDid.params.textDocument.text }
    $threw = $false; try { Assert-LsOutbound -Label 'didOpen' -Message $goodDid -Ctx $g } catch { $threw = $true }
    if (-not $threw) { $progressRefused = $false }
}
$g2 = @{ barrierDone = $true; sent = @('initialize', 'initialized'); expectedUri = (Get-LsTargetUri $layoutA); expectedText = $goodDid.params.textDocument.text }
$threw = $false; try { Assert-LsOutbound -Label 'didOpen' -Message $goodDid -Ctx $g2 } catch { $threw = $true }
Assert-That '쓰기 방어선: 초기 진행 메시지를 다 읽기 전의 didOpen 은 거절한다 (false·없음·문자열·숫자 모두)' ($progressRefused -and $threw)
# initializationOptions 검사
$optsGood = $initA.params.initializationOptions
Assert-That 'SCAN 설정 검사: 계약이 만든 initializationOptions 는 문제가 없다' ((Test-LsInitializationOptions $optsGood).Count -eq 0) ((Test-LsInitializationOptions $optsGood) -join ',')
foreach ($t in @(@('jobs 2', { param($o) $o.scan.jobs = 2 }, 'SCAN_JOBS_INVALID'), @('jobs 문자열 "1"', { param($o) $o.scan.jobs = '1' }, 'SCAN_JOBS_INVALID'), @('jobs 없음', { param($o) $o.scan.Remove('jobs') }, 'SCAN_JOBS_MISSING'), @('알 수 없는 scan 키', { param($o) $o.scan['retry'] = 3 }, 'SETTINGS_KEY_NOT_ALLOWED:scan.retry'), @('ci true', { param($o) $o.scan.ci = $true }, 'SCAN_CI_NOT_FALSE'), @('metrics 켬', { param($o) $o.metrics.enabled = $true }, 'METRICS_ENABLED_NOT_FALSE'))) {
    $copy = $initA | ConvertTo-Json -Depth 10 | ConvertFrom-Json
    $o2 = [ordered]@{ scan = [ordered]@{}; metrics = [ordered]@{} }
    foreach ($pr in $copy.params.initializationOptions.scan.PSObject.Properties) { $o2.scan[$pr.Name] = $pr.Value }
    foreach ($pr in $copy.params.initializationOptions.metrics.PSObject.Properties) { $o2.metrics[$pr.Name] = $pr.Value }
    & $t[1] $o2
    Assert-That "SCAN 설정 검사: $($t[0]) → $($t[2])" ((Test-LsInitializationOptions $o2) -ccontains $t[2]) ((Test-LsInitializationOptions $o2) -join ',')
}
$lim = Resolve-LsLimits ([ordered]@{ scanMs = 60000 }); Assert-That '한도 해석: scanMs 를 올리면 LIMIT_ABOVE_CAP:scanMs' (@($lim.problems) -ccontains 'LIMIT_ABOVE_CAP:scanMs')
$lim = Resolve-LsLimits ([ordered]@{ scanMs = 1500; settleMs = 400 }); Assert-That '한도 해석: 낮추는 것은 받고 나머지는 기본값이다' (@($lim.problems).Count -eq 0 -and $lim.limits.scanMs -eq 1500 -and $lim.limits.settleMs -eq 400 -and $lim.limits.totalMs -eq 150000)
# 서수 비교: 소프트 하이픈이 낀 조각은 같은 조각이 아니다 (-ceq 는 같다고 본다).
$shy = [string][char]0x00AD
Assert-That 'URI 비교는 서수다: 퍼센트 인코딩된 소프트 하이픈(%C2%AD)이 낀 조각은 다른 파일이고, 같은 문자의 원문(비ASCII)은 거절한다' ((Compare-LsUri 'file:///c%3A/a%C2%ADb' 'file:///c%3A/ab').result -ceq 'DIFFERENT' -and (Compare-LsUri ('file:///c%3A/a' + $shy + 'b') 'file:///c%3A/ab').reason -ceq 'NON_ASCII' -and -not (Test-LsSameSegments @('ab') @('a' + $shy + 'b')))
Assert-That 'URI 비교는 정규화하지 않는다: 원문(raw)을 그대로 돌려주고 쿼리·프래그먼트는 벗기지 않고 거절한다' ((Compare-LsUri 'file:///C:/a/b' 'file:///c%3A/a/b').raw -ceq 'file:///C:/a/b' -and (Compare-LsUri 'file:///c%3A/a/b?x=1' 'file:///c%3A/a/b').reason -ceq 'QUERY')

# ═══ 3. 계약(PS) ↔ 실제 TS 모듈 대조와 골든 신선도 (tsx 가 있을 때만) ═══════════════════
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('bosang-ls-test-' + [guid]::NewGuid().ToString('N').Substring(0, 12))
[void][IO.Directory]::CreateDirectory($sandbox)
$bridge = Join-Path $PSScriptRoot 'lsp-scan-bridge.mts'
if ($runPre) {
if (-not $tsReady) {
    Skip-Test '계약(PS) ↔ 실제 TS lsp-scan.ts 대조' 'tsx 또는 scripts/semgrep-lsp 경로가 없어 실행하지 않았다(통과로 세지 않는다)'
    Skip-Test '골든이 낡지 않았다 (현재 TS 구현이 만든 사례와 파일이 같다)' 'tsx 가 없어 실행하지 않았다(통과로 세지 않는다)'
} else {
    $r = Invoke-Tsx @($bridge, $TsDir, 'contract', $workA)
    $ts = $null; try { $ts = $r.text | ConvertFrom-Json } catch { }
    Assert-That '계약(PS) ↔ TS: tsx 로 lsp-scan.ts 를 불러 값을 얻었다' ($r.exit -eq 0 -and $null -ne $ts) ("exit=$($r.exit) " + (Limit-Text $r.text))
    if ($ts) {
        $psConsts = [ordered]@{
            args = @($Script:LsArgs); initId = $Script:LsInitId; shutdownId = $Script:LsShutdownId; probeFile = $Script:LsProbeFile; probeSha = $Script:LsProbeSha256; probeBytes = $Script:LsProbeBytes
            targetFile = $Script:LsTargetFile; targetSha = $Script:LsTargetSha256; targetBytes = $Script:LsTargetBytes; targetToken = $Script:LsTargetToken; sendOrder = @($Script:LsSendOrder); limits = $Script:LsLimits; jobs = $Script:LsJobs
            codes = @($Script:LsExpectedCodes); source = $Script:LsExpectedSource; message = $Script:LsExpectedMessage; severity = $Script:LsExpectedSeverity; didOpenLanguage = $Script:LsDidOpenLanguageId; didOpenVersion = $Script:LsDidOpenVersion
            envNames = @($Script:LspMinEnvNames); abortNames = $Script:LsAbortNames; progressMethod = $Script:LrProgressCreateMethod
        }
        $pairs = @(
            @('consts', $psConsts), @('layout', $layoutA), @('rootUri', (Get-LsRootUri $layoutA)), @('targetUri', (Get-LsTargetUri $layoutA)), @('init', $initA), @('initialized', (New-LsInitializedMessage)),
            @('didOpen', $goodDid), @('shutdown', (New-LsShutdownMessage)), @('exit', (New-LsExitMessage)), @('env', $envA), @('text', [Text.Encoding]::UTF8.GetString($targetBytes))
        )
        foreach ($pr in $pairs) { $a = ConvertTo-SortedJson $pr[1]; $b = ConvertTo-SortedJson $ts.($pr[0]); Assert-That "계약(PS) ↔ TS: $($pr[0]) 가 같다" ($a -ceq $b) ("PS: " + (Limit-Text $a) + " / TS: " + (Limit-Text $b)) }
    }
    $gr = Invoke-Tsx @($bridge, $TsDir, 'golden')
    # 5.1 의 ConvertFrom-Json 은 배열을 한 개체로 내보낸다: @(ConvertFrom-Json ...) 로 바로 감싸면 원소 1개짜리가 된다. 먼저 대입한 뒤 감싼다.
    $fresh = $null; try { $freshParsed = ConvertFrom-Json -InputObject $gr.text; $fresh = @($freshParsed) } catch { }
    Assert-That '골든 신선도: 현재 TS 구현으로 골든을 다시 만들 수 있다' ($gr.exit -eq 0 -and $null -ne $fresh) ("exit=$($gr.exit) " + (Limit-Text $gr.text))
    if ($fresh) {
        $stale = 0
        if ($fresh.Count -ne $golden.Count) { $stale = -1 }
        else { for ($i = 0; $i -lt $fresh.Count; $i++) { if ((ConvertTo-SortedJson $fresh[$i]) -cne (ConvertTo-SortedJson $golden[$i])) { $stale++ } } }
        Assert-That '골든 신선도: 파일(tests/lsp-scan-parity.json)이 현재 TS 구현이 만든 사례와 모든 사례에서 같다 (낡았으면 다리로 다시 만든다)' ($stale -eq 0) "낡은 사례 $stale 건 (fresh=$($fresh.Count), file=$($golden.Count))"
    }
}
}

# ═══ 4. 함수 단위 확인: Send-LsMessage (가짜 stdin) ═══════════════════════════════
$runnerPath = Join-Path $sandbox 'lsp-scan-runner.ps1'
foreach ($f in 'LspMinContract.ps1', 'LspRulesContract.ps1', 'LspScanContract.ps1', 'lsp-min-runner.ps1', 'lsp-rules-runner.ps1', 'lsp-scan-runner.ps1', 'lsp-scan-stub.ps1', 'version-runner.ps1', 'version-stub.ps1') { Copy-Item -LiteralPath (Join-Path $windowsDir $f) -Destination $sandbox }
$probeB64 = [Convert]::ToBase64String($probeBytes)
$targetB64 = [Convert]::ToBase64String($targetBytes)

function Invoke-UnitTests {
    . $runnerPath -LoadFunctionsOnly
    function New-FakeStdin([string]$FailAt) {
        $o = New-Object psobject -Property @{ WriteCalls = 0; FlushCalls = 0; Fail = $FailAt }
        $o | Add-Member -MemberType ScriptMethod -Name Write -Value { param($b, $off, $n) $this.WriteCalls++; if ($this.Fail -eq 'write') { throw (New-Object IO.IOException 'The pipe is being closed.') } }
        $o | Add-Member -MemberType ScriptMethod -Name Flush -Value { $this.FlushCalls++ }
        $o
    }
    $lay = Get-LsLayout -Work 'C:\work\run-1'
    $didMsg = New-LsDidOpenMessage -Layout $lay -TargetBytes $targetBytes
    # 초기 진행 메시지(두 수명주기 + rulesRefreshed)를 stdout 에서 다 읽은 상태로 만든다. 쓰기 직전 방어선은 이것까지 확인한다.
    function Add-FakeInitialProgress($Watch, [switch]$SecondOnlyCreate) {
        $msgs = @(
            [ordered]@{ jsonrpc = '2.0'; id = 'req-a'; method = 'window/workDoneProgress/create'; params = [ordered]@{ token = 'tok-a' } },
            [ordered]@{ jsonrpc = '2.0'; method = '$/progress'; params = [ordered]@{ token = 'tok-a'; value = [ordered]@{ kind = 'begin'; title = 'Semgrep'; message = 'Refreshing Rules' } } },
            [ordered]@{ jsonrpc = '2.0'; method = '$/progress'; params = [ordered]@{ token = 'tok-a'; value = [ordered]@{ kind = 'end' } } },
            [ordered]@{ jsonrpc = '2.0'; method = 'semgrep/rulesRefreshed'; params = [ordered]@{} },
            [ordered]@{ jsonrpc = '2.0'; id = 'req-b'; method = 'window/workDoneProgress/create'; params = [ordered]@{ token = 'tok-b' } }
        )
        if (-not $SecondOnlyCreate) {
            $msgs += [ordered]@{ jsonrpc = '2.0'; method = '$/progress'; params = [ordered]@{ token = 'tok-b'; value = [ordered]@{ kind = 'begin'; title = 'Semgrep Scan in Progress'; message = 'Scanning Open Documents' } } }
            $msgs += [ordered]@{ jsonrpc = '2.0'; method = '$/progress'; params = [ordered]@{ token = 'tok-b'; value = [ordered]@{ kind = 'end' } } }
        }
        foreach ($m in $msgs) { Add-LsProgressFrame $Watch $m }
    }
    function New-FakeCtx($Stdin, $BarrierAt) {
        $watch = New-LsLiveWatch ([ordered]@{ workspace = $lay.workspace; expectedTargetUri = (Get-LsTargetUri $lay); probePath = (Get-LsProbePath $lay); scanMs = 30000; settleMs = 2000; maxStdoutBytes = 1048576 })
        @{ sw = [Diagnostics.Stopwatch]::StartNew(); sends = (New-Object System.Collections.ArrayList); also = (New-Object System.Collections.ArrayList); trigger = $null; abort = $null; immediate = $false; stdinStream = $Stdin; watch = $watch; barrierAt = $BarrierAt; expectedUri = (Get-LsTargetUri $lay); expectedText = $didMsg.params.textDocument.text }
    }
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake $null
    $s1 = Send-LsMessage 'initialize' (New-LsInitializeMessage -Layout $lay)
    $s2 = Send-LsMessage 'initialized' (New-LsInitializedMessage)
    Assert-That 'Send-LsMessage: initialize·initialized 는 쓰고 기록한다 (쓰기 직전 읽은 stderr·stdout 바이트 수 포함)' ($s1 -and $s2 -and $fake.WriteCalls -eq 2 -and $Ctx.sends.Count -eq 2 -and $Ctx.sends[1].stderrBytesAtSend -eq 0 -and $Ctx.sends[1].stdoutBytesAtSend -eq 0)
    $s3 = Send-LsMessage 'didOpen' $didMsg
    Assert-That 'didOpen 은 규칙 장벽 앞에서는 쓰지 않는다: A10 SEND_REFUSED(DID_OPEN_BEFORE_BARRIER)로 곧바로 끝내기로 하고 스트림에 아무것도 쓰지 않는다' ($s3 -eq $false -and $fake.WriteCalls -eq 2 -and $Ctx.immediate -and $Ctx.abort.condition -ceq 'A10' -and $Ctx.abort.detail -ceq 'didOpen:DID_OPEN_BEFORE_BARRIER' -and $Ctx.trigger -ceq 'LIVE_ABORT') (($Ctx.abort | ConvertTo-Json -Compress))
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake 100
    [void](Send-LsMessage 'initialize' (New-LsInitializeMessage -Layout $lay)); [void](Send-LsMessage 'initialized' (New-LsInitializedMessage))
    Set-LsInitializedSent $Ctx.watch
    # 장벽을 넘었어도 초기 진행 메시지를 다 읽기 전에는 didOpen 을 쓰지 않는다(두 번째 묶음의 end 가 아직 안 왔다).
    Add-FakeInitialProgress $Ctx.watch -SecondOnlyCreate
    $w0 = $fake.WriteCalls
    $s3b = Send-LsMessage 'didOpen' $didMsg
    Assert-That 'didOpen: 장벽을 넘었어도 초기 진행 메시지를 다 읽기 전에는 쓰지 않는다 — A10 SEND_REFUSED(DID_OPEN_BEFORE_PROGRESS), 스트림에 아무것도 쓰지 않고 감시기에 didOpen 표시도 남지 않는다' ($s3b -eq $false -and $fake.WriteCalls -eq $w0 -and $Ctx.abort.condition -ceq 'A10' -and $Ctx.abort.detail -ceq 'didOpen:DID_OPEN_BEFORE_PROGRESS' -and $null -eq $Ctx.watch.didOpen) (($Ctx.abort | ConvertTo-Json -Compress))
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake 100
    [void](Send-LsMessage 'initialize' (New-LsInitializeMessage -Layout $lay)); [void](Send-LsMessage 'initialized' (New-LsInitializedMessage))
    Set-LsInitializedSent $Ctx.watch
    Add-FakeInitialProgress $Ctx.watch
    $s4 = Send-LsMessage 'didOpen' $didMsg
    Assert-That 'didOpen: 장벽 뒤에는 한 번 쓰고, 송신 기록에 uri·languageId·version·본문 해시가 남고, 감시기에 사전/사후 경계가 표시된다' ($s4 -and $fake.WriteCalls -eq 3 -and $Ctx.sends[2].label -ceq 'didOpen' -and $Ctx.sends[2].didOpen.uri -ceq (Get-LsTargetUri $lay) -and $Ctx.sends[2].didOpen.textSha256 -ceq $Script:LsTargetSha256 -and $null -ne $Ctx.watch.didOpen)
    $s5 = Send-LsMessage 'didOpen' $didMsg
    Assert-That '두 번째 didOpen 은 쓰지 않는다: A10(DUPLICATE_SEND), 쓰기 횟수 그대로' ($s5 -eq $false -and $fake.WriteCalls -eq 3 -and $Ctx.abort.detail -ceq 'didOpen:DUPLICATE_SEND') ($Ctx.abort.detail)
    foreach ($bad in @(
            @('uri 가 다른 didOpen', { $m = $didMsg | ConvertTo-Json -Depth 8 | ConvertFrom-Json; $m.params.textDocument.uri = 'file:///c%3A/other/x.txt'; $m }),
            @('본문이 다른 didOpen', { $m = $didMsg | ConvertTo-Json -Depth 8 | ConvertFrom-Json; $m.params.textDocument.text = $m.params.textDocument.text + 'x'; $m }),
            @('didSave', { [ordered]@{ jsonrpc = '2.0'; method = 'textDocument/didSave'; params = [ordered]@{} } }),
            @('semgrep/scanWorkspace', { [ordered]@{ jsonrpc = '2.0'; method = 'semgrep/scanWorkspace'; params = [ordered]@{} } }))) {
        $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake 100
        [void](Send-LsMessage 'initialize' (New-LsInitializeMessage -Layout $lay)); [void](Send-LsMessage 'initialized' (New-LsInitializedMessage))
        Add-FakeInitialProgress $Ctx.watch
        $w0 = $fake.WriteCalls
        $sent = Send-LsMessage 'didOpen' (& $bad[1])
        Assert-That "Send-LsMessage: 허용 밖 송신($($bad[0]))은 방어선이 거절하고 스트림에 아무것도 쓰지 않는다 (A10)" ($sent -eq $false -and $fake.WriteCalls -eq $w0 -and $Ctx.abort.condition -ceq 'A10' -and $Ctx.immediate)
    }
    $fake = New-FakeStdin 'write'; $Ctx = New-FakeCtx $fake $null
    $sent = Send-LsMessage 'initialize' (New-LsInitializeMessage -Layout $lay)
    Assert-That 'Send-LsMessage: 쓰기가 실패하면 false 를 돌려주고 STDIN_ERROR 로 곧바로 끝내기로 한다' ($sent -eq $false -and $Ctx.trigger -ceq 'STDIN_ERROR' -and $Ctx.immediate -eq $true -and $Ctx.sends[0].ok -eq $false)
    $fake = New-FakeStdin 'none'; $Ctx = New-FakeCtx $fake $null; Add-LspMinTrigger 'LIVE_ABORT' 'A7' 'CANCELLED'
    $sent = Send-LsMessage 'initialize' (New-LsInitializeMessage -Layout $lay)
    Assert-That 'Send-LsMessage: 즉시 종료 사유가 이미 걸렸으면 아무것도 쓰지 않고 송신 기록도 남기지 않는다' ($sent -eq $false -and $fake.WriteCalls -eq 0 -and $Ctx.sends.Count -eq 0)
    Remove-Variable Ctx -ErrorAction SilentlyContinue
}
if ($runPre) { Invoke-UnitTests }
$Script:Recording = $true

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
# 분할 실행: 앞 묶음이 남긴 결과 파일 위치(이름·경로·작업 폴더·PATH 값·한도)를 되살린다. 결과 파일은 앞 묶음의 샌드박스에 남아 있다.
$collectedBase = 0
if ($StateFile -and ($Part -in 'Post', 'Aggregate') -and (Test-Path -LiteralPath $StateFile)) {
    $stParsed = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($StateFile, [Text.Encoding]::UTF8))
    foreach ($stItem in @($stParsed)) { if ($stItem) { [void]$collected.Add($stItem) } }
    $collectedBase = $collected.Count
}
$URL = 'http://127.0.0.1:41999'
$stubScript = Join-Path $sandbox 'lsp-scan-stub.ps1'

function Invoke-Scan {
    param(
        [string]$Mode = 'stub', [string]$Scenario = 'ok', $Limits = $null, [scriptblock]$Mutate = $null, [int]$AbortAfterMs = 0, [string]$AbortContent = '',
        [string]$Exe = $ps51, $Args0 = $null, [string]$Name = '', $ExpectedVersion = '9.9.9', [switch]$FullLimits
    )
    $Script:RunCounter++
    $work = Join-Path $sandbox ('w' + $Script:RunCounter)
    $reqDir = Join-Path $sandbox ('r' + $Script:RunCounter); [void][IO.Directory]::CreateDirectory($reqDir)
    $layout = Get-LsLayout -Work $work
    $envT = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $layout -Url $URL
    # 시험을 빠르게 하려고 장벽 뒤 감시와 두 묶음 한도를 줄인다(줄이는 것은 허용된다). -FullLimits 는 한도를 하나도 주지 않아 기본값(settleMs 2초, scanMs 30초)을 그대로 쓴다.
    $lim = [ordered]@{}
    if (-not $FullLimits) { $lim['settleMs'] = 400; $lim['scanMs'] = 3000 }
    if ($Limits) { foreach ($k in $Limits.Keys) { $lim[$k] = $Limits[$k] } }
    if ($null -eq $Args0) { $Args0 = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', $stubScript, $Scenario) }
    $resFile = Join-Path $reqDir 'lsp-scan-result.json'
    $req = [ordered]@{ runToken = [guid]::NewGuid().ToString('N'); mode = $Mode; exe = $Exe; args = @($Args0); layout = $layout; env = $envT; limits = $lim; expectedVersion = $ExpectedVersion; probeB64 = $probeB64; targetB64 = $targetB64; resultFile = $resFile }
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
    if ($Name -and $r) { [void]$collected.Add([ordered]@{ name = $Name; path = $resFile; work = $work; envPath = [string]$envT['PATH']; limits = (Resolve-LsLimits $lim).limits }) }
    [pscustomobject]@{ exit = $proc.ExitCode; wallMs = $sw.ElapsedMilliseconds; result = $r; layout = $layout; work = $work; token = $req.runToken }
}
function Get-Received($Run) { $f = Join-Path $Run.layout.stateDir 'received.log'; if (Test-Path -LiteralPath $f) { @(Get-Content -LiteralPath $f -Encoding UTF8 | Where-Object { $_ }) } else { @() } }
function Get-SentLabels($Run) { (@($Run.result.sends | ForEach-Object { $_.label }) -join ',') }
function Test-PidAlive([int]$ProcessId) { [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) }

$happySent = 'initialize,initialized,didOpen,shutdown,exit'
$noOpenSent = 'initialize,initialized,shutdown,exit'
$onlyInit = 'initialize'
$initAndInitialized = 'initialize,initialized'
$openedNoClose = 'initialize,initialized,didOpen'
$OK = 'SCAN_RESPONSE_OBSERVED'
$exitLim = @{ exitMs = 2000; stdinCloseGraceMs = 1500; killConfirmMs = 5000 }
# 시나리오 표. sent: 러너가 보낸 메시지(이 순서; sentLike 는 와일드카드). trig: 러너의 trigger. abort: 중단 조건. kill: 강제 종료 횟수. close: 러너가 stdin 을 닫았는가. exit: 서버 종료 코드.
# verdict: TS 판정(정확히), notOk: 성공이 아님(정확한 이름은 요구하지 않는다), verdictLike: 와일드카드.
$cases = @(
    # 정상과 도착 순서 변형: 증거가 완전하고 일관되면 어느 스트림이 먼저 오든 같은 성공이다.
    @{ s = 'ok'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'ok-diag-first'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'ok-log-first'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'ok-split-chunks'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'ok-simultaneous'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'code-short'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'stdout-split'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'requests-2'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'env-names'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    @{ s = 'shutdown-reply'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    # 초기 진행 메시지 장벽: 두 번째 묶음(create·begin·end)이 stderr 의 Scanned open documents 줄보다 한참 늦게 와도 didOpen 은 그 묶음을 다 읽은 뒤 한 번만 나가고,
    # 완성되지 않거나(INCOMPLETE → 장벽 한도 안에서만 기다리고 RULES_TIMEOUT) 계약을 어기면(INVALID → 장벽이 열리지 않고 정상 종료) didOpen 은 나가지 않는다.
    # 2026-11-03 실제 1회 관측이 ABORTED 로 끝난 경위(늦게 읽힌 초기 진행 요청이 didOpen 뒤로 분류됨)의 방어다.
    @{ s = 'late-initial-progress'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK; lateProgressMs = 1450 },
    @{ s = 'late-initial-progress-split'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK; lateProgressMs = 1450 },
    @{ s = 'initial-progress-incomplete'; lim = @{ rulesMs = 4000; stdinCloseGraceMs = 1500; killConfirmMs = 5000 }; sent = $initAndInitialized; trig = 'RULES_TIMEOUT'; abort = 'A9'; kill = 0; close = $true; verdict = 'NOT_OBSERVED:RULES_TIMEOUT'; obsMin = 4000; obsMax = 9500 },
    @{ s = 'initial-progress-wrong-token'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:BARRIER_PROGRESS_INVALID' },
    # 한쪽 증거만, 마감, 늦은 증거, 사전 증거
    @{ s = 'diag-only'; sent = $happySent; trig = 'SCAN_TIMEOUT'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:ENGINE_LOG_MISSING' },
    @{ s = 'log-only'; sent = $happySent; trig = 'SCAN_TIMEOUT'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:NO_DIAGNOSTIC_NOTIFICATION' },
    @{ s = 'timeout'; lim = @{ scanMs = 1200 }; sent = $happySent; trig = 'SCAN_TIMEOUT'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:SCAN_TIMEOUT' },
    # 늦은 로그: 마감에서 기다림을 끝내고 shutdown 을 보내 settle 감시는 하지 않는다. 그래도 판정은 "늦었다"(EVIDENCE_AFTER_DEADLINE)를 가려내야 하고 "아무것도 안 옴"(SCAN_TIMEOUT)과 달라야 한다(독립 검토 F1 로 판정을 고쳤다: 늦은 묶음이 settle 감시 미확인 사유에 가려지지 않는다).
    @{ s = 'late-log'; lim = @{ scanMs = 1000; exitMs = 8000 }; sent = $happySent; trig = 'SCAN_TIMEOUT'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE' },
    @{ s = 'pre-open-evidence'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:PRE_OPEN_EVIDENCE' },
    # 진단 내용
    @{ s = 'duplicate-notification'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS' },
    @{ s = 'two-diagnostics'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; notOk = $true },
    @{ s = 'other-uri'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:WRONG_URI' },
    @{ s = 'extra-uri'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:EXTRA_URI' },
    @{ s = 'wrong-code'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'SCAN_FAILED:WRONG_RULE' },
    @{ s = 'wrong-message'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH' },
    @{ s = 'wrong-severity'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH' },
    @{ s = 'range-start-shift'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:RANGE_MISMATCH' },
    @{ s = 'range-end-plus1'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:RANGE_MISMATCH' },
    @{ s = 'range-end-minus1'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:RANGE_MISMATCH' },
    # 엔진 로그 내용
    @{ s = 'wrong-log-order'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:ORDER_VIOLATION' },
    @{ s = 'engine-error-line'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'SCAN_FAILED:ENGINE_ERROR' },
    @{ s = 'skipped-rule'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'SCAN_FAILED:ENGINE_ERROR' },
    # 두 묶음이 마감(scanMs)까지 채워지지 않으면 러너는 기다림을 끝내고 정상 종료한다(트리거 SCAN_TIMEOUT, TS 실행기와 같다). 구체 사유(NO_TARGET·RULES_NOT_LOADED)는 판정이 가려낸다.
    @{ s = 'no-targets'; sent = $happySent; trig = 'SCAN_TIMEOUT'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:NO_TARGET' },
    @{ s = 'rules-not-loaded'; sent = $happySent; trig = 'SCAN_TIMEOUT'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:RULES_NOT_LOADED' },
    @{ s = 'extra-scan-during-settle'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:EXTRA_SCAN' },
    @{ s = 'exit-during-settle'; sent = $openedNoClose; trig = 'CHILD_EXITED_EARLY'; kill = 0; close = $false; exit = 1; notOk = $true },
    # 외부 명령 시도 줄(D3): 정확한 모양·건수만 받는다.
    @{ s = 'ext-ok-x2'; sent = $openedNoClose; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'ext-wrong-command'; sent = $openedNoClose; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'ext-wrong-args'; sent = $openedNoClose; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'ext-wrong-path'; sent = $openedNoClose; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'ext-third-attempt'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'ext-missing-post'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = 'NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT' },
    # didOpen 뒤의 실시간 중단
    @{ s = 'server-request-after-didopen'; sent = $openedNoClose; trig = 'LIVE_ABORT'; abort = 'A6'; kill = 1; close = $false; verdict = 'ABORTED:SERVER_REQUEST_NOT_ALLOWED' },
    @{ s = 'forbidden-signal'; sent = $openedNoClose; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'modify-target'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:FILES_CHANGED'; targetChanged = $true },
    # 장벽이 계약대로가 아니면 didOpen 을 보내지 않는다 (shutdown·exit 로 정상 종료)
    @{ s = 'rules-zero'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; notOk = $true },
    @{ s = 'yaml-error'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; notOk = $true },
    @{ s = 'invalid-rule'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; notOk = $true },
    @{ s = 'wrong-file-loaded'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; notOk = $true },
    @{ s = 'log-missing'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; notOk = $true },
    @{ s = 'log-variant'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; notOk = $true },
    @{ s = 'order-violation'; sent = $noOpenSent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; notOk = $true },
    @{ s = 'nonzero-exit'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 1; notOk = $true },
    @{ s = 'orphan'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0 },
    # 종료 단계
    @{ s = 'exit-ignored'; lim = $exitLim; sent = $happySent; trig = 'EXIT_TIMEOUT'; kill = 0; close = $true; exit = 0; notOk = $true },
    @{ s = 'exit-ignored-eof'; lim = @{ exitMs = 2000; stdinCloseGraceMs = 1000; killConfirmMs = 5000 }; sent = $happySent; trig = 'EXIT_TIMEOUT'; kill = 1; close = $true; notOk = $true },
    # 장벽 한도: shutdown·exit·didOpen 을 보내지 않고 stdin 을 닫는다.
    @{ s = 'notification-only'; lim = @{ rulesMs = 1500; stdinCloseGraceMs = 1500; killConfirmMs = 5000 }; sent = $initAndInitialized; trig = 'RULES_TIMEOUT'; abort = 'A9'; kill = 0; close = $true; verdict = 'NOT_OBSERVED:RULES_TIMEOUT'; obsMin = 1500; obsMax = 6500 },
    @{ s = 'barrier-timeout'; lim = @{ rulesMs = 1500; stdinCloseGraceMs = 1500; killConfirmMs = 5000 }; sent = $initAndInitialized; trig = 'RULES_TIMEOUT'; abort = 'A9'; kill = 0; close = $true; verdict = 'NOT_OBSERVED:RULES_TIMEOUT'; obsMin = 1500; obsMax = 6500 },
    # initialized 를 받기 전의 신호
    @{ s = 'early-signal'; sent = $onlyInit; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'early-notification'; sent = $onlyInit; trig = 'LIVE_ABORT'; abort = 'A1'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    # 초기화 응답이 조건을 못 채운다: initialized 는 단 한 번도 가지 않는다
    @{ s = 'initialize-error'; sent = $onlyInit; trig = 'INIT_INVALID'; kill = 0; close = $true; recv = 'initialize,<stdin-end>'; notOk = $true },
    @{ s = 'error-response'; sent = $onlyInit; trig = 'INIT_INVALID'; kill = 0; close = $true; recv = 'initialize,<stdin-end>'; notOk = $true },
    @{ s = 'version-mismatch'; sent = $onlyInit; trig = 'INIT_INVALID'; kill = 0; close = $true; recv = 'initialize,<stdin-end>'; notOk = $true },
    @{ s = 'wrong-id'; lim = @{ initMs = 2000; stdinCloseGraceMs = 1500 }; sent = $onlyInit; trig = 'INIT_TIMEOUT'; kill = 0; close = $true; notOk = $true },
    @{ s = 'silent'; lim = @{ initMs = 1500; stdinCloseGraceMs = 1500 }; sent = $onlyInit; trig = 'INIT_TIMEOUT'; kill = 0; close = $true; notOk = $true },
    @{ s = 'silent-hold'; lim = @{ initMs = 1500; stdinCloseGraceMs = 1000; killConfirmMs = 5000 }; sent = $onlyInit; trig = 'INIT_TIMEOUT'; kill = 1; close = $true; notOk = $true },
    @{ s = 'exit-early'; sent = $onlyInit; trig = 'CHILD_EXITED_EARLY'; kill = 0; close = $false; exit = 3; notOk = $true },
    @{ s = 'garbage'; sent = $onlyInit; trig = 'FRAME_ERROR'; kill = 1; close = $false; notOk = $true },
    # 초기화 응답의 프레임 경계(프레임 파서): TS 의 FrameDecoder 가 거절하는 응답이면 러너도 그 자리에서 프레임 오류로 끝내고 initialized·didOpen 을 단 한 번도 보내지 않는다.
    # 응답 내용은 그 밖에는 정상이라 파서가 받아들이면 초기화 게이트를 통과해 initialized 가 나간다(수정 전 재현). init-header-max(헤더 8192바이트)는 경계 대조군으로 정상 경로를 그대로 간다.
    @{ s = 'init-jsonrpc-shy'; sent = $onlyInit; trig = 'FRAME_ERROR'; kill = 1; close = $false; recv = 'initialize'; frameKind = 'MALFORMED'; notOk = $true },
    @{ s = 'init-jsonrpc-nul'; sent = $onlyInit; trig = 'FRAME_ERROR'; kill = 1; close = $false; recv = 'initialize'; frameKind = 'MALFORMED'; notOk = $true },
    @{ s = 'init-jsonrpc-key-shy'; sent = $onlyInit; trig = 'FRAME_ERROR'; kill = 1; close = $false; recv = 'initialize'; frameKind = 'MALFORMED'; notOk = $true },
    @{ s = 'init-header-over'; sent = $onlyInit; trig = 'FRAME_ERROR'; kill = 1; close = $false; recv = 'initialize'; frameKind = 'MALFORMED'; notOk = $true },
    @{ s = 'init-header-name-lf'; sent = $onlyInit; trig = 'FRAME_ERROR'; kill = 1; close = $false; recv = 'initialize'; frameKind = 'MALFORMED'; notOk = $true },
    @{ s = 'init-header-max'; sent = $happySent; trig = 'NORMAL'; kill = 0; close = $false; exit = 0; verdict = $OK },
    # 장벽 구간의 실시간 중단: stdin 닫기 없이 곧바로 강제 종료 한 번
    @{ s = 'download-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'registry-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'token-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'settings-line'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'stderr-split'; sentLike = 'initialize,initialized*'; trig = 'LIVE_ABORT'; abort = 'A2'; kill = 1; close = $false; verdict = 'ABORTED:FORBIDDEN_SIGNAL' },
    @{ s = 'request-disallowed'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A6'; kill = 1; close = $false; verdict = 'ABORTED:SERVER_REQUEST_NOT_ALLOWED' },
    @{ s = 'requests-3'; sentLike = 'initialize,initialized*'; trig = 'LIVE_ABORT'; abort = 'A6'; kill = 1; close = $false; verdict = 'ABORTED:SERVER_REQUEST_NOT_ALLOWED' },
    @{ s = 'request-malformed'; sent = $initAndInitialized; trig = 'LIVE_ABORT'; abort = 'A6'; kill = 1; close = $false; verdict = 'ABORTED:SERVER_REQUEST_NOT_ALLOWED' },
    @{ s = 'write-ws'; sentLike = 'initialize,initialized*'; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:FILES_CHANGED' },
    @{ s = 'write-extra-rules'; sentLike = 'initialize,initialized*'; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:FILES_CHANGED' },
    @{ s = 'modify-probe'; sentLike = 'initialize,initialized*'; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:FILES_CHANGED'; probeChanged = $true },
    @{ s = 'home-write'; sentLike = 'initialize,initialized*'; trig = 'LIVE_ABORT'; abort = 'A5'; kill = 1; close = $false; verdict = 'ABORTED:FILES_CHANGED' },
    @{ s = 'spawn-disallowed'; sentLike = 'initialize,initialized*'; trig = 'LIVE_ABORT'; abort = 'A4'; kill = 1; close = $false; verdict = 'ABORTED:UNEXPECTED_IMAGE' },
    # 출력 상한
    @{ s = 'flood-err'; lim = @{ settleMs = 2000 }; sentLike = 'initialize,initialized*'; trig = 'OUTPUT_LIMIT'; kill = 1; close = $false; notOk = $true },
    @{ s = 'flood-out'; lim = @{ settleMs = 2000 }; sentLike = 'initialize,initialized*'; trig = 'OUTPUT_LIMIT'; kill = 1; close = $false; notOk = $true }
)

# 이번 묶음이 돌릴 시나리오(표 순서, 1부터 센다). All·Cases 가 아니면 비어 있고, All 은 전부다.
$casesToRun = New-Object System.Collections.ArrayList
$caseIndex = 0
foreach ($cc in $cases) { $caseIndex++; if ($runCases -and $caseIndex -ge $CaseFrom -and ($CaseTo -le 0 -or $caseIndex -le $CaseTo)) { [void]$casesToRun.Add($cc) } }
Write-Host ("[분할] Part={0} 시나리오 {1}..{2} → 이번 묶음 {3}건 / 표 전체 {4}건" -f $Part, $CaseFrom, $CaseTo, $casesToRun.Count, @($cases).Count)

try {
    $env:BOSANG_CANARY_SECRET = 'must-not-leak'; $env:GITHUB_TOKEN_CANARY = 'must-not-leak'; $env:HTTPS_PROXY = 'http://user:pass@127.0.0.1:9'

    foreach ($c in $casesToRun) {
        $limits = $null; if ($c.lim) { $limits = $c.lim }
        $r = Invoke-Scan -Scenario $c.s -Limits $limits -Name $c.s
        $x = $r.result
        if ($null -eq $x) { Assert-That "[$($c.s)] 결과 파일이 있다" $false "exit=$($r.exit)"; continue }
        $recv = @(Get-Received $r)
        $initializedCount = @($recv | Where-Object { $_ -ceq 'initialized' }).Count
        $didOpenCount = @($recv | Where-Object { $_ -ceq 'textDocument/didOpen' }).Count
        $sentText = Get-SentLabels $r
        $expectInitialized = 1; if (-not ((($c.sent) -and $c.sent -match 'initialized') -or $c.sentLike)) { $expectInitialized = 0 }
        Assert-That "[$($c.s)] 러너 종료 코드 0, 거부·오류 없음" ($r.exit -eq 0 -and -not $x.refused -and -not $x.error) ("exit=$($r.exit) refused=$($x.refused) error=$($x.error)")
        if ($c.sent) { Assert-That "[$($c.s)] 보낸 것은 정확히 [$($c.sent)] 이다" ($sentText -ceq $c.sent -and @($x.sends | Where-Object { -not $_.ok }).Count -eq 0) $sentText }
        else { Assert-That "[$($c.s)] 보낸 것은 [$($c.sentLike)] 꼴이다" ($sentText -clike $c.sentLike) $sentText }
        Assert-That "[$($c.s)] 서버가 받은 initialized 는 $expectInitialized 번 이하이고 didOpen 은 한 번 이하이며, 허용 밖 메시지·서버 요청에 대한 응답·두 번째 didOpen 이 가지 않았다" ($initializedCount -le 1 -and $didOpenCount -le 1 -and -not (Test-Path -LiteralPath (Join-Path $r.layout.stateDir 'unexpected.log'))) ($recv -join ',')
        if ($sentText -cmatch 'didOpen') { Assert-That "[$($c.s)] didOpen 은 initialized 와 규칙 장벽 뒤에 갔다 (송신 시각 순서, 표시)" ($null -ne $x.markers.barrierDoneAtMs -and $null -ne $x.markers.didOpenSent -and [double]$x.markers.didOpenSent.tMs -ge [double]$x.markers.barrierDoneAtMs -and [double]$x.markers.barrierDoneAtMs -ge [double]((@($x.sends | Where-Object { $_.label -ceq 'initialized' }))[0].tMs)) (($x.markers | ConvertTo-Json -Compress -Depth 4)) }
        else { Assert-That "[$($c.s)] didOpen 은 가지 않았고 서버도 받지 않았다" ($didOpenCount -eq 0 -and $null -eq $x.markers.didOpenSent) "recv=$($recv -join ',')" }
        Assert-That "[$($c.s)] trigger 는 $($c.trig) 이다" ($x.trigger -ceq $c.trig) "trigger=$($x.trigger) also=$(@($x.also) -join ',')"
        if ($c.abort) { Assert-That "[$($c.s)] 중단 조건이 $($c.abort) 이다" ($x.abort.condition -ceq $c.abort) (($x.abort | ConvertTo-Json -Compress)) }
        elseif ($c.trig -ceq 'LIVE_ABORT') { Assert-That "[$($c.s)] 중단 조건이 기록된다" ($null -ne $x.abort) }
        else { Assert-That "[$($c.s)] 중단 조건이 없다" ($null -eq $x.abort) (($x.abort | ConvertTo-Json -Compress)) }
        Assert-That "[$($c.s)] 강제 종료 신호는 $($c.kill) 번이다" ($x.kill.count -eq $c.kill) (($x.kill | ConvertTo-Json -Compress))
        Assert-That "[$($c.s)] stdin 을 닫은 것은 $($c.close) 이다" ([bool]$x.stdinClosed.byHarness -eq $c.close)
        if ($c.ContainsKey('exit')) { Assert-That "[$($c.s)] 서버 종료 코드는 $($c.exit) 이다" ($x.exit.observed -and $x.exit.code -eq $c.exit) (($x.exit | ConvertTo-Json -Compress)) }
        if ($c.recv) { Assert-That "[$($c.s)] 서버가 받은 것은 [$($c.recv)] 이다" (($recv -join ',') -ceq $c.recv) ($recv -join ',') }
        if ($c.frameKind) { Assert-That "[$($c.s)] 프레임 오류가 기록되고 종류는 $($c.frameKind) 이다 (최종 TS 판정에서만 거절하는 것이 아니라 실행 중에 이미 막았다)" ($null -ne $x.frameError -and [string]$x.frameError.kind -ceq $c.frameKind) (($x.frameError | ConvertTo-Json -Compress)) }
        if ($c.sent -ceq $happySent -and $c.trig -ceq 'NORMAL' -and $c.s -ne 'orphan' -and $c.s -ne 'nonzero-exit') {
            Assert-That "[$($c.s)] 정리가 깔끔하다 — 종료 확인, 스트림 닫힘, 남은 자손 0, 문제 없음, 프로브·합성 파일 해시 불변" ($x.cleanup.childExitConfirmed -and $x.cleanup.streamsClosed -and $x.cleanup.descendantsAliveAfter -eq 0 -and @($x.cleanup.problems).Count -eq 0 -and $x.files.probe.afterRunSha256 -ceq $Script:LsProbeSha256 -and $x.files.probe.afterCopySha256 -ceq $Script:LsProbeSha256 -and $x.files.target.afterRunSha256 -ceq $Script:LsTargetSha256 -and $x.files.target.afterWriteSha256 -ceq $Script:LsTargetSha256) (($x.cleanup | ConvertTo-Json -Compress))
            Assert-That "[$($c.s)] 자식에게 준 PATH 값과 작업 폴더가 기록된다 (이름만이 아니다)" ($x.request.envPath -ceq ('{0}\System32;{0}' -f $env:WINDIR) -and $x.request.workingDirectory -ceq $r.layout.stateDir) (($x.request | ConvertTo-Json -Compress -Depth 3))
            Assert-That "[$($c.s)] 청크 시간표가 두 스트림의 원문 전체를 빈틈 없이 덮는다 (스트림별 offset 이 이어지고 시각이 줄지 않는다)" ((& { $nx = @{ stdout = 0; stderr = 0 }; $lt = @{ stdout = -1; stderr = -1 }; $good = $true; foreach ($ch in @($x.chunks)) { $st = [string]$ch.stream; if ([long]$ch.offset -ne $nx[$st] -or [double]$ch.tMs -lt $lt[$st] -or [long]$ch.length -le 0) { $good = $false }; $nx[$st] = [long]$ch.offset + [long]$ch.length; $lt[$st] = [double]$ch.tMs }; $good -and $nx.stdout -eq [long]$x.stdout.bytesRead -and $nx.stderr -eq [long]$x.stderr.bytesRead })) "stdout=$($x.stdout.bytesRead) stderr=$($x.stderr.bytesRead) chunks=$(@($x.chunks).Count)"
        }
        if ($c.targetChanged) { Assert-That "[$($c.s)] 합성 파일이 바뀐 것이 장벽의 해시와 실행 뒤 해시에 드러난다" ($x.files.target.barrierSha256 -cne $Script:LsTargetSha256 -and $x.files.target.afterRunSha256 -cne $Script:LsTargetSha256) (($x.files | ConvertTo-Json -Compress -Depth 4)) }
        if ($c.probeChanged) { Assert-That "[$($c.s)] 프로브가 바뀐 것이 장벽의 해시와 실행 뒤 해시에 드러난다" ($x.files.probe.barrierSha256 -cne $Script:LsProbeSha256 -and $x.files.probe.afterRunSha256 -cne $Script:LsProbeSha256) (($x.files | ConvertTo-Json -Compress -Depth 4)) }
        if ($c.lateProgressMs) {
            $initSend = @($x.sends | Where-Object { $_.label -ceq 'initialized' })[0]
            $gap = [double]$x.markers.didOpenSent.tMs - [double]$initSend.tMs
            Assert-That "[$($c.s)] didOpen 은 두 번째 초기 진행 묶음이 도착한 뒤에야 나갔다 (initialized 로부터 $([int]$gap)ms, 최소 $($c.lateProgressMs)ms)" ($gap -ge $c.lateProgressMs) "gap=$gap"
        }
        if ($c.obsMin) { Assert-That "[$($c.s)] 장벽 한도는 늘어나지 않는다 — 관측 구간이 $($c.obsMin) ~ $($c.obsMax) ms" ($x.timeline.observationMs -ge $c.obsMin -and $x.timeline.observationMs -lt $c.obsMax) "obs=$($x.timeline.observationMs)" }
        if ($c.trig -ceq 'LIVE_ABORT' -or $c.trig -ceq 'OUTPUT_LIMIT') {
            Assert-That "[$($c.s)] 강제 종료 뒤 서버 프로세스가 사라졌고 종료 확인이 됐다" ($x.cleanup.childExitConfirmed -and -not (Test-PidAlive ([int](Get-Content -LiteralPath (Join-Path $r.layout.stateDir 'pid.txt'))))) (($x.cleanup | ConvertTo-Json -Compress))
        }
    }

    if ($runPost) {
    # ── 필수 도착 순서 행렬: 같은 증거를 서로 다른 순서·쪼개기·동시 도착으로 보내도 같은 성공이다. settle 은 늦은 묶음에서 시작한다. ──
    $byName = @{}
    foreach ($item in $collected) { $byName[[string]$item.name] = Get-Content -LiteralPath $item.path -Raw -Encoding UTF8 | ConvertFrom-Json }
    foreach ($n in 'ok-diag-first', 'ok-log-first', 'ok-split-chunks', 'ok-simultaneous', 'ok') {
        $x = $byName[$n]; $lv = $x.liveView
        Assert-That "[도착 순서:$n] 실시간 보기: 사전 증거 없음, 진단 한 건, 로그 묶음 완성, 두 묶음 완성 시각이 있고 settle 이 그 시각에서 settleMs(400) 이상 이어졌다" ($null -ne $lv -and -not $lv.preOpenEvidence -and $lv.diagnosticsState -ceq 'ONE' -and $lv.logState -ceq 'COMPLETE' -and $null -ne $lv.bothCompleteAtMs -and $null -ne $x.settle.endedAtMs -and ([double]$x.settle.endedAtMs - [double]$lv.bothCompleteAtMs) -ge 400) (($lv | ConvertTo-Json -Compress) + ' settle=' + $x.settle.endedAtMs)
    }
    $lf = $byName['ok-log-first'].liveView; $df = $byName['ok-diag-first'].liveView
    Assert-That '[도착 순서] 로그 묶음이 먼저 완성되는 실행(ok-log-first)에서는 늦은 쪽이 진단이다 → 두 묶음 완성 시각 = 진단 완성 시각 (> 로그 완성 시각)' ([double]$lf.diagnosticsCompleteAtMs -gt [double]$lf.logCompleteAtMs -and [double]$lf.bothCompleteAtMs -eq [double]$lf.diagnosticsCompleteAtMs) (($lf | ConvertTo-Json -Compress))
    Assert-That '[도착 순서] 진단이 먼저 오는 실행(ok-diag-first)에서는 늦은 쪽이 로그 묶음이다 → 두 묶음 완성 시각 = 로그 완성 시각 (> 진단 완성 시각)' ([double]$df.logCompleteAtMs -gt [double]$df.diagnosticsCompleteAtMs -and [double]$df.bothCompleteAtMs -eq [double]$df.logCompleteAtMs) (($df | ConvertTo-Json -Compress))
    $sf = $byName['ok-split-chunks']
    Assert-That '[도착 순서] 1바이트씩 쓴 실행(ok-split-chunks)은 청크가 훨씬 많고 (stdout 청크 수 > 일반 실행) 판정 증거는 같다' (@($sf.chunks).Count -gt @($byName['ok'].chunks).Count -and $sf.liveView.diagnosticsState -ceq 'ONE' -and $sf.liveView.logState -ceq 'COMPLETE') "split=$(@($sf.chunks).Count) normal=$(@($byName['ok'].chunks).Count)"

    # ── 기본 한도(장벽 뒤 감시 2초, scanMs 30초): settle 은 늦은 묶음 완성 시각에서 2초다 ──
    $r = Invoke-Scan -Scenario 'ok-log-first' -FullLimits -Name 'ok-full-settle'
    $x = $r.result
    Assert-That '기본 한도(settle 2초): 늦은 묶음 완성 뒤 2초가 지난 다음에야 shutdown 을 보낸다 (이른 증거에서 거꾸로 세지 않는다)' ($r.exit -eq 0 -and $x.trigger -ceq 'NORMAL' -and [double]$x.settle.endedAtMs -ge ([double]$x.liveView.bothCompleteAtMs + 1950) -and [double]((@($x.sends | Where-Object { $_.label -ceq 'shutdown' }))[0].tMs) -ge ([double]$x.liveView.bothCompleteAtMs + 1950)) (($x.liveView | ConvertTo-Json -Compress) + ' settle=' + $x.settle.endedAtMs)

    # ── 전체 상한: 단계 한도가 남아 있어도 전체 마감에서 곧바로 끝난다(유예를 붙이지 않는다) ──
    $r = Invoke-Scan -Scenario 'silent-hold' -Limits @{ totalMs = 2500; initMs = 60000; stdinCloseGraceMs = 10000; killConfirmMs = 5000 } -Name 'total-timeout'
    Assert-That '전체 상한: 닿으면 stdin 닫기·유예 없이 곧바로 강제 종료한다 (단계 한도 60초가 남아도)' ($r.result.trigger -ceq 'TOTAL_TIMEOUT' -and -not $r.result.stdinClosed.byHarness -and $r.result.kill.count -eq 1 -and $r.result.timeline.observationMs -ge 2400 -and $r.result.timeline.observationMs -lt 5000) "obs=$($r.result.timeline.observationMs) trigger=$($r.result.trigger)"
    # ── 외부 중단 파일(A3 수신기 적중, A7 취소) ──
    foreach ($ab in @(@('A3:HITS_INCREASED', 'A3'), @('cancel', 'A7'))) {
        $r = Invoke-Scan -Scenario 'silent-hold' -AbortAfterMs 1500 -AbortContent $ab[0] -Name "abort-file-$($ab[1])"
        Assert-That "외부 중단 파일($($ab[1])): 곧바로 강제 종료하고 조건이 기록된다" ($r.result.trigger -ceq 'LIVE_ABORT' -and $r.result.abort.condition -ceq $ab[1] -and $r.result.kill.count -eq 1 -and -not $r.result.stdinClosed.byHarness) (($r.result.abort | ConvertTo-Json -Compress))
    }

    # ── 환경 격리 ──
    $r = Invoke-Scan -Scenario 'env-names'
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
        @{ n = '실행 파일 경로에 금지 문구(downloads)'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = 'C:\downloads\Scripts\semgrep.exe'; $q.args = @('lsp', '--debug') }; tok = 'PATH_CONTAINS_FORBIDDEN_FRAGMENT:COMMAND' },
        @{ n = '실행 파일이 UNC 경로'; mut = { param($q) $q.mode = 'semgrep-lsp'; $q.exe = '\\server\share\semgrep.exe'; $q.args = @('lsp', '--debug') }; tok = 'COMMAND_NOT_ABSOLUTE' },
        @{ n = 'stub 인데 허용되지 않은 시나리오'; mut = { param($q) $q.args = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', $stubScript, 'format-disk') }; tok = 'STUB_SCENARIO_NOT_ALLOWED' },
        @{ n = 'stub 인데 다른 스크립트'; mut = { param($q) $q.args = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', (Join-Path $sandbox 'other.ps1'), 'ok') }; tok = 'STUB_SCRIPT_NOT_ALLOWED' },
        @{ n = '환경에 SEMGREP_LOG_SRCS'; mut = { param($q) $q.env['SEMGREP_LOG_SRCS'] = 'semgrep.parsing' }; tok = 'ENV_NAME_NOT_ALLOWED:SEMGREP_LOG_SRCS' },
        @{ n = '환경에 SEMGREP_APP_TOKEN'; mut = { param($q) $q.env['SEMGREP_APP_TOKEN'] = 'x' }; tok = 'ENV_NAME_NOT_ALLOWED:SEMGREP_APP_TOKEN' },
        @{ n = '환경에 프록시 이름(HTTPS_PROXY)'; mut = { param($q) $q.env.HTTPS_PROXY = 'http://user:pass@x' }; tok = 'ENV_NAME_NOT_ALLOWED:HTTPS_PROXY' },
        @{ n = '환경의 PATH 가 다른 값'; mut = { param($q) $q.env.PATH = ($env:WINDIR + '\System32;' + $env:WINDIR + ';C:\extra') }; tok = 'ENV_VALUE_UNEXPECTED:PATH' },
        @{ n = '환경의 USERPROFILE 이 부모 값'; mut = { param($q) $q.env.USERPROFILE = $env:USERPROFILE }; tok = 'ENV_VALUE_UNEXPECTED:USERPROFILE' },
        @{ n = '환경에서 USERPROFILE 이 빠짐'; mut = { param($q) $q.env.Remove('USERPROFILE') }; tok = 'ENV_NAME_MISSING:USERPROFILE' },
        @{ n = '수신기 주소가 루프백이 아님'; mut = { param($q) foreach ($k in 'SEMGREP_APP_URL', 'SEMGREP_METRICS_URL', 'SEMGREP_VERSION_CHECK_URL') { $q.env[$k] = 'http://example.com:80' } }; tok = 'ENV_URL_NOT_LOOPBACK' },
        @{ n = 'scanMs 를 기본 상한 위로 올림'; mut = { param($q) $q.limits.scanMs = 60000 }; tok = 'LIMIT_ABOVE_CAP:scanMs' },
        @{ n = 'scanMs 가 0'; mut = { param($q) $q.limits.scanMs = 0 }; tok = 'LIMIT_INVALID:scanMs' },
        @{ n = '장벽 뒤 감시(settleMs)를 늘림'; mut = { param($q) $q.limits.settleMs = 5000 }; tok = 'LIMIT_ABOVE_CAP:settleMs' },
        @{ n = '장벽 한도(rulesMs)를 올림'; mut = { param($q) $q.limits.rulesMs = 120000 }; tok = 'LIMIT_ABOVE_CAP:rulesMs' },
        @{ n = '전체 상한을 올림'; mut = { param($q) $q.limits.totalMs = 999999 }; tok = 'LIMIT_ABOVE_CAP:totalMs' },
        @{ n = '모르는 한도(retryMs) — 재시도 한도는 없다'; mut = { param($q) $q.limits.retryMs = 10 }; tok = 'LIMIT_UNKNOWN:retryMs' },
        @{ n = '배치가 작업 폴더에서 도출한 것과 다름'; mut = { param($q) $q.layout.workspace = (Join-Path $sandbox 'elsewhere') }; tok = 'LAYOUT_MISMATCH' },
        @{ n = '합성 파일 경로(targetPath)가 다름'; mut = { param($q) $q.layout.targetPath = (Join-Path $sandbox 'elsewhere\lsp-scan-1-target.txt') }; tok = 'LAYOUT_MISMATCH' },
        @{ n = '규칙 폴더가 rules-empty (LSP-MIN-1 배치)'; mut = { param($q) $q.layout.rulesDir = (Join-Path $q.layout.stateDir 'rules-empty') }; tok = 'LAYOUT_MISMATCH' },
        @{ n = '작업 폴더가 드라이브 문자가 아닌 경로'; mut = { param($q) $lay = Get-LsLayout -Work '\\server\share\run'; $q.layout = $lay; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $lay -Url $URL }; tok = 'WORK_DIR_NOT_DRIVE_ABSOLUTE' },
        @{ n = '작업 폴더 경로에 금지 문구(downloads)'; mut = { param($q) $w = Join-Path $sandbox 'downloads\run'; $lay = Get-LsLayout -Work $w; $q.layout = $lay; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $lay -Url $URL }; tok = 'PATH_CONTAINS_FORBIDDEN_FRAGMENT:WORKSPACE' },
        @{ n = '중단 파일이 이미 있음'; mut = { param($q) $af = Join-Path $sandbox 'preexisting.flag'; [IO.File]::WriteAllText($af, 'x'); $q.abortFile = $af }; tok = 'ABORT_FILE_ALREADY_PRESENT' },
        @{ n = '프로브 바이트가 없음'; mut = { param($q) $q.Remove('probeB64') }; tok = 'PROBE_BYTES_MISSING' },
        @{ n = '프로브 해시가 다름(한 바이트만 바뀜)'; mut = { param($q) $bb = [byte[]][Convert]::FromBase64String($probeB64); $bb[0] = $bb[0] -bxor 1; $q.probeB64 = [Convert]::ToBase64String($bb) }; tok = 'PROBE_HASH_MISMATCH' },
        @{ n = '합성 파일 바이트가 없음'; mut = { param($q) $q.Remove('targetB64') }; tok = 'TARGET_BYTES_MISSING' },
        @{ n = '합성 파일 바이트 수가 다름'; mut = { param($q) $q.targetB64 = [Convert]::ToBase64String((New-Object byte[] 10)) }; tok = 'TARGET_SIZE_MISMATCH' },
        @{ n = '합성 파일 해시가 다름(한 바이트만 바뀜)'; mut = { param($q) $bb = [byte[]][Convert]::FromBase64String($targetB64); $bb[0] = $bb[0] -bxor 1; $q.targetB64 = [Convert]::ToBase64String($bb) }; tok = 'TARGET_HASH_MISMATCH' },
        @{ n = '합성 파일이 한 바이트 더 길다'; mut = { param($q) $q.targetB64 = [Convert]::ToBase64String(([byte[]]([IO.File]::ReadAllBytes($targetFile)) + [byte[]]@(10))) }; tok = 'TARGET_SIZE_MISMATCH' }
    )
    foreach ($rf in $refusals) {
        $r = Invoke-Scan -Scenario 'ok' -Mutate $rf.mut
        $refusedText = [string]$r.result.refused
        Assert-That "거부: $($rf.n)" ($r.exit -eq 2 -and $refusedText.Contains($rf.tok) -and $r.result.child.started -eq $false -and @($r.result.sends).Count -eq 0) "exit=$($r.exit) refused=$refusedText"
        $leaked = ($r.result | ConvertTo-Json -Depth 6 -Compress) -match 'user:pass|must-not-leak'
        Assert-That "거부: $($rf.n) — 사유에 환경 값(토큰·프록시)을 싣지 않는다" (-not $leaked)
    }
    $pre = Invoke-Scan -Scenario 'ok' -Mutate { param($q) $q.args = @('x') }
    Assert-That '거부된 요청은 아무 폴더도 만들지 않고 아무 파일도 쓰지 않고 아무 프로세스도 띄우지 않는다' (-not (Test-Path -LiteralPath $pre.layout.workspace) -and -not (Test-Path -LiteralPath $pre.layout.homeDir) -and -not (Test-Path -LiteralPath $pre.layout.targetPath) -and $pre.result.child.started -eq $false)

    # 감시 폴더가 비어 있지 않으면 합성 파일·프로브를 쓰지 않고 시작하지 않는다.
    foreach ($nonEmpty in @(@('WORKSPACE', 'workspace'), @('RULES_DIR', 'rulesDir'), @('HOME_DIR', 'homeDir'))) {
        $pw = Join-Path $sandbox ('nonempty-' + $nonEmpty[0]); $pl = Get-LsLayout -Work $pw
        [void][IO.Directory]::CreateDirectory($pl[$nonEmpty[1]]); [IO.File]::WriteAllText((Join-Path $pl[$nonEmpty[1]] 'leftover.txt'), 'x')
        $r = Invoke-Scan -Scenario 'ok' -Mutate { param($q) $q.layout = $pl; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl -Url $URL }
        Assert-That "거부: $($nonEmpty[0]) 가 비어 있지 않으면 시작하지 않는다 (WATCHED_ROOT_NOT_EMPTY:$($nonEmpty[0]))" ($r.exit -eq 2 -and ([string]$r.result.refused).Contains("WATCHED_ROOT_NOT_EMPTY:$($nonEmpty[0])") -and $r.result.child.started -eq $false -and -not (Test-Path -LiteralPath $pl.targetPath) -and -not (Test-Path -LiteralPath (Join-Path $pl.rulesDir 'lsp-rules-1-probe.yaml'))) "refused=$($r.result.refused)"
    }
    # 합성 파일 이름의 파일이 이미 다른 내용으로 있어도 거절하고 덮어쓰지 않는다.
    $pw = Join-Path $sandbox 'preplanted'; $pl = Get-LsLayout -Work $pw; [void][IO.Directory]::CreateDirectory($pl.workspace); [IO.File]::WriteAllText($pl.targetPath, 'tampered')
    $r = Invoke-Scan -Scenario 'ok' -Mutate { param($q) $q.layout = $pl; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl -Url $URL }
    Assert-That '거부: 작업 영역에 이미 다른 내용의 합성 파일 이름 파일이 있으면 시작하지 않고 덮어쓰지 않는다' ($r.exit -eq 2 -and ([string]$r.result.refused).Contains('WATCHED_ROOT_NOT_EMPTY:WORKSPACE') -and (Get-Content -LiteralPath $pl.targetPath -Raw) -ceq 'tampered')

    # 링크(junction)로 쓰기 경로가 작업 폴더 밖으로 새면 아무것도 쓰기 전에 거절한다. 합성 파일이 놓일 작업 영역(ws)이 링크인 경우도 포함한다.
    foreach ($lk in @(@('rulesDir', 'linked-rules'), @('workspace', 'linked-ws'))) {
        $pw = Join-Path $sandbox $lk[1]; $pl = Get-LsLayout -Work $pw; $outside = Join-Path $sandbox ('outside-' + $lk[1])
        [void][IO.Directory]::CreateDirectory($pl.stateDir); [void][IO.Directory]::CreateDirectory($outside)
        $linkOk = $true; try { [void](New-Item -ItemType Junction -Path $pl[$lk[0]] -Target $outside -ErrorAction Stop) } catch { $linkOk = $false }
        if (-not $linkOk) { Skip-Test "거부: $($lk[0]) 가 junction 이면 거절한다" 'junction 을 만들 수 없어 실행하지 않았다(통과로 세지 않는다)' }
        else {
            $r = Invoke-Scan -Scenario 'ok' -Mutate { param($q) $q.layout = $pl; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl -Url $URL }
            Assert-That "거부: $($lk[0]) 가 junction 이면 PATH_ESCAPES_WORK 로 거절하고 밖으로 아무것도 쓰지 않는다 (합성 파일 포함)" ($r.exit -eq 2 -and ([string]$r.result.refused).Contains('PATH_ESCAPES_WORK') -and @(Get-ChildItem -LiteralPath $outside -Force).Count -eq 0 -and $r.result.child.started -eq $false) "refused=$($r.result.refused)"
        }
    }
    # 한 단계 위(lsp-state)가 junction 이면 그 아래 폴더를 만드는 것 자체가 밖으로 샌다: 만들기 전에 거절한다.
    $pw2 = Join-Path $sandbox 'linked-state'; $pl2 = Get-LsLayout -Work $pw2; $outside2 = Join-Path $sandbox 'outside-state'
    [void][IO.Directory]::CreateDirectory($pw2); [void][IO.Directory]::CreateDirectory($outside2)
    $linkOk2 = $true; try { [void](New-Item -ItemType Junction -Path $pl2.stateDir -Target $outside2 -ErrorAction Stop) } catch { $linkOk2 = $false }
    if (-not $linkOk2) { Skip-Test '거부: 상태 폴더(lsp-state)가 junction 이면 아무것도 만들기 전에 거절한다' 'junction 을 만들 수 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        $r = Invoke-Scan -Scenario 'ok' -Mutate { param($q) $q.layout = $pl2; $q.env = New-LspMinChildEnv -WindowsDir $env:WINDIR -Layout $pl2 -Url $URL }
        Assert-That '거부: 상태 폴더가 junction 이면 PATH_ESCAPES_WORK 로 거절하고 밖에 아무것도 만들지 않으며 작업 폴더 안에 ws 도 만들지 않는다' ($r.exit -eq 2 -and ([string]$r.result.refused).Contains('PATH_ESCAPES_WORK') -and @(Get-ChildItem -LiteralPath $outside2 -Force).Count -eq 0 -and -not (Test-Path -LiteralPath $pl2.workspace)) "refused=$($r.result.refused)"
    }

    # semgrep-lsp 모드의 실제 실행 경로(내용은 whoami.exe 사본): 셸 없이 드라이브 문자 절대 경로 + [lsp, --debug]
    $r = Invoke-Scan -Mode 'semgrep-lsp' -Exe $fakeSemgrep -Args0 @('lsp', '--debug') -Limits @{ initMs = 2500; stdinCloseGraceMs = 1000; killConfirmMs = 5000 } -Name 'fake-semgrep'
    Assert-That 'semgrep-lsp 모드 실행 경로: 이름이 semgrep.exe 인 절대 경로를 [lsp,--debug] 로 셸 없이 부르고, 응답 없이 끝난 자식은 CHILD_EXITED_EARLY 로 기록한다 (initialized·didOpen 은 가지 않는다)' ($r.result.child.started -eq $true -and -not $r.result.refused -and ([string]$r.result.child.mainModule).Equals($fakeSemgrep, [StringComparison]::OrdinalIgnoreCase) -and @('CHILD_EXITED_EARLY', 'INIT_TIMEOUT') -contains $r.result.trigger -and (Get-SentLabels $r) -ceq $onlyInit) (Limit-Text ($r.result | ConvertTo-Json -Depth 5 -Compress))

    }

    # ═══ 6. 러너 결과 → 실제 TS 어댑터와 기록 만들기 (tsx 가 있을 때만) ═══════════════
    if ($runAgg) {
    if ($Part -eq 'Aggregate') {
        # 분할 실행의 마지막 묶음: 도착 순서 행렬이 쓰던 이름 → 결과 표를, 앞 묶음이 남긴 결과 파일로 다시 만든다.
        $byName = @{}
        foreach ($item in $collected) { $byName[[string]$item.name] = Get-Content -LiteralPath $item.path -Raw -Encoding UTF8 | ConvertFrom-Json }
    }
    if (-not $tsReady) { Skip-Test '러너 결과 → 실제 TS factsFromScanRunnerResult·buildScanRecord (시나리오별 판정)' 'tsx 또는 scripts/semgrep-lsp 경로가 없어 실행하지 않았다(통과로 세지 않는다)' }
    else {
        $items = @()
        foreach ($item in $collected) {
            $ctx = [ordered]@{
                runId = 'ls-test'; work = $item.work; expectedVersion = '9.9.9'; limits = $item.limits; expectedPath = $item.envPath
                receiver = [ordered]@{ baselineHits = 0; finalHits = 0; samples = 3; failures = 0 }
            }
            $items += , ([ordered]@{ name = $item.name; path = $item.path; ctx = $ctx })
        }
        $listFile = Join-Path $sandbox 'verdict-list.json'
        [IO.File]::WriteAllText($listFile, (ConvertTo-Json -InputObject $items -Depth 6), (New-Object Text.UTF8Encoding($false)))
        $vr = Invoke-Tsx @($bridge, $TsDir, 'verdicts', $listFile)
        $rows = $null; try { $rowsParsed = ConvertFrom-Json -InputObject $vr.text; $rows = @($rowsParsed) } catch { }
        Assert-That '러너 결과 → TS: tsx 로 어댑터·기록 만들기 실행 성공' ($vr.exit -eq 0 -and $null -ne $rows -and @($rows).Count -eq $collected.Count) ("exit=$($vr.exit) " + (Limit-Text $vr.text 400))
        if ($rows) {
            $by = @{}; foreach ($row in @($rows)) { $by[[string]$row.name] = $row }
            foreach ($c in $cases) {
                $row = $by[$c.s]
                if ($c.verdict) { Assert-That "러너 결과 → TS 판정: $($c.s) → $($c.verdict)" ($null -ne $row -and [string]$row.verdict -ceq $c.verdict) ("실제: " + (Limit-Text ($row | ConvertTo-Json -Compress -Depth 4) 500)) }
                elseif ($c.notOk) { Assert-That "러너 결과 → TS 판정: $($c.s) → 성공이 아니다" ($null -ne $row -and [string]$row.verdict -cne $OK) ("실제: " + (Limit-Text ($row | ConvertTo-Json -Compress -Depth 4) 500)) }
            }
            # 필수 도착 순서 행렬: 같은 판정
            foreach ($n in 'ok-diag-first', 'ok-log-first', 'ok-split-chunks', 'ok-simultaneous', 'ok') {
                Assert-That "[도착 순서:$n] 러너 결과 → 실제 TS 어댑터·기록: SCAN_RESPONSE_OBSERVED (스트림 사이의 순서는 판정에 쓰이지 않는다)" ($by[$n].verdict -ceq $OK -and $by[$n].status -ceq 'OBSERVED' -and $by[$n].cleanupOk -eq $true -and @($by[$n].external).Count -eq 0) (($by[$n] | ConvertTo-Json -Compress -Depth 4))
            }
            Assert-That '러너 결과 → TS: TS 가 다시 만든 두 묶음 완성 시각이 러너의 실시간 보기와 같다 (TRACKER_DISAGREEMENT 가 없다)' ((@($by.Values | Where-Object { $_.name -like 'ok*' -and (@($_.reasons) -contains 'TRACKER_DISAGREEMENT') }).Count -eq 0)) ''
            Assert-That '러너 결과 → TS: 늦은 묶음에서 settle 이 시작됐다 — ok-log-first 의 두 묶음 완성 시각은 진단 쪽이다 (러너 보기와 일치)' ($null -ne $by['ok-log-first'].bothCompleteAtMs -and [double]$by['ok-log-first'].bothCompleteAtMs -eq [double]$byName['ok-log-first'].liveView.bothCompleteAtMs) ''
            Assert-That '러너 결과 → TS: orphan(자손이 파이프를 쥠)은 관측과 정리를 따로 기록한다 — 정리는 실패(cleanup.ok=false)' ($by['orphan'].cleanupOk -eq $false) (($by['orphan'] | ConvertTo-Json -Compress -Depth 4))
            Assert-That '러너 결과 → TS: 초기화 실패 세 경로(initialize-error, error-response, version-mismatch)는 initialized·didOpen 이 한 번도 기록되지 않는다' ((@('initialize-error', 'error-response', 'version-mismatch') | Where-Object { (@($by[$_].sent) -contains 'initialized') -or (@($by[$_].sent) -contains 'didOpen') }).Count -eq 0)
            Assert-That '러너 결과 → TS: 장벽이 계약대로가 아닌 실행(rules-zero 등)은 didOpen 이 기록되지 않는다' ((@('rules-zero', 'yaml-error', 'invalid-rule', 'wrong-file-loaded', 'log-missing', 'log-variant', 'order-violation', 'pre-open-evidence') | Where-Object { @($by[$_].sent) -contains 'didOpen' }).Count -eq 0)
            Assert-That '러너 결과 → TS: 기본 한도(settle 2초) 정상 실행도 SCAN_RESPONSE_OBSERVED' ($by['ok-full-settle'].verdict -ceq $OK) (($by['ok-full-settle'] | ConvertTo-Json -Compress -Depth 4))
        }
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
    # 분할 실행: 이번 묶음이 새로 만든 결과 파일 위치를 -StateFile 에 이어 적는다(같은 이름은 바꿔 쓴다: 같은 묶음을 다시 돌려도 겹치지 않는다).
    if ($StateFile -and ($Part -in 'Cases', 'Post')) {
        try {
            $newNames = @{}; $merged = New-Object System.Collections.ArrayList
            for ($ni = $collectedBase; $ni -lt $collected.Count; $ni++) { $newNames[[string]$collected[$ni].name] = $true }
            if (Test-Path -LiteralPath $StateFile) {
                $oldParsed = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($StateFile, [Text.Encoding]::UTF8))
                foreach ($oi in @($oldParsed)) { if ($oi -and -not $newNames.ContainsKey([string]$oi.name)) { [void]$merged.Add($oi) } }
            }
            for ($ni = $collectedBase; $ni -lt $collected.Count; $ni++) { [void]$merged.Add($collected[$ni]) }
            [IO.File]::WriteAllText($StateFile, (ConvertTo-Json -InputObject ([object[]]$merged.ToArray()) -Depth 6), (New-Object Text.UTF8Encoding($false)))
        } catch { Write-Host "상태 파일을 쓰지 못했다: $StateFile ($($_.Exception.Message))" -ForegroundColor Yellow }
    }
    if ($ResultsFile) {
        try {
            $resRows = @($results | ForEach-Object { [ordered]@{ name = $_.name; pass = $_.pass; detail = (Limit-Text ([string]$_.detail) 200) } })
            [IO.File]::WriteAllText($ResultsFile, (ConvertTo-Json -InputObject ([object[]]$resRows) -Depth 4), (New-Object Text.UTF8Encoding($false)))
        } catch { Write-Host "결과 파일을 쓰지 못했다: $ResultsFile ($($_.Exception.Message))" -ForegroundColor Yellow }
    }
    if ($KeepSandbox) { Write-Host "샌드박스를 남긴다(-KeepSandbox): $sandbox" }
    else { try { Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction Stop } catch { Write-Host "샌드박스를 지우지 못했다: $sandbox ($($_.Exception.Message))" -ForegroundColor Yellow } }
}

$pass = @($results | Where-Object { $_.pass -eq $true }).Count
$fail = @($results | Where-Object { $_.pass -eq $false }).Count
$skip = @($results | Where-Object { $null -eq $_.pass }).Count
Write-Host ("{0}/{1} 통과, 실패 {2}, 건너뜀 {3}  (엔진 {4})" -f $pass, ($pass + $fail), $fail, $skip, $PSVersionTable.PSVersion)
if ($fail -gt 0) { exit 1 }
exit 0
