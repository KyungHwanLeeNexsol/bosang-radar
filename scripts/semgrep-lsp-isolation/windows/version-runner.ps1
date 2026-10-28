<#
.SYNOPSIS
  전용 계정으로 실행되는 버전 확인 실행기(좁은 용도). 실행 파일 하나를 인자 배열로 한 번 실행하고, 한도 안에서 결과를 파일에 남긴다.
.DESCRIPTION
  범용 실행기가 아니다. 요청의 mode 는 두 가지뿐이고 각각 실행 파일과 인자가 고정돼 있어 그 밖은 거부한다.
    semgrep-version : 실행 파일 이름이 semgrep.exe(절대 경로), 인자는 정확히 ["--version"] 하나
    stub            : System32 의 Windows PowerShell 5.1 로 이 폴더의 version-stub.ps1 을 허용된 시나리오로만 실행(제한·정리 확인용)
  한도(요청으로 받는다. 실제 실행은 tool-observation.ts 의 DEFAULT_VERSION_LIMITS 와 같은 값을 쓴다): timeoutMs, maxStdoutBytes, maxStderrBytes, killWaitMs.
  - 셸 문자열이 아니라 ProcessStartInfo(UseShellExecute=false)로 실행한다. PATH 를 탐색하지 않는다(FileName 은 절대 경로).
  - 환경은 요청의 env 만 쓴다. 이 실행기의 환경을 자식에게 물려주지 않는다(ProcessStartInfo.EnvironmentVariables 를 비우고 채운다).
  - stdin 은 바로 닫는다. stdout·stderr 는 원시 바이트로 한도까지만 읽는다. 한도를 넘으면 읽기를 그만두고 자식 트리를 끝낸다.
  - 시간 제한을 넘으면 자식 트리를 끝내고 killWaitMs 안에 종료를 관찰한다. 정상 종료 뒤에도 남은 자손은 끝낸다.
  - 결과(JSON)에는 종료 코드, 소요 시간, 원시 stdout·stderr(base64), 한도 초과 여부, 자손 프로세스 관측, 정리 결과, 이 실행기의 SID·경로를 적는다.
  버전 문자열의 해석은 하지 않는다(관리자 쪽이 한다). 이 실행기는 해석 계약을 모른다.
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RequestFile)
$ErrorActionPreference = 'Stop'

$Script:Ps51Path = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Script:StubScenarios = @('ok', 'ok-stderr', 'nonzero', 'multiline', 'bom', 'prefixed', 'sleep', 'flood-out', 'flood-err', 'orphan', 'env-names', 'cwd')

function Write-ResultFile([string]$Path, $Object) {
    $tmp = $Path + '.tmp'
    [IO.File]::WriteAllText($tmp, ($Object | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $Path) { [IO.File]::Delete($Path) }
    [IO.File]::Move($tmp, $Path)
}

function ConvertTo-ArgumentString([string[]]$Items) {
    (@($Items) | ForEach-Object { if ($_ -match '[\s"]') { '"' + $_.Replace('"', '\"') + '"' } else { $_ } }) -join ' '
}

function Get-ProcessTable {
    try { @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate -ErrorAction Stop) } catch { $null }
}

# 루트 프로세스의 자손. PID 재사용을 막으려고 루트보다 먼저 만들어진 프로세스는 자식으로 보지 않는다.
function Get-DescendantRecords([int]$RootPid, $RootStart, $Table) {
    $byParent = @{}
    foreach ($p in $Table) { $k = [int]$p.ParentProcessId; if (-not $byParent.ContainsKey($k)) { $byParent[$k] = New-Object System.Collections.ArrayList }; [void]$byParent[$k].Add($p) }
    $out = New-Object System.Collections.ArrayList
    $seen = @{ $RootPid = $true }
    $queue = New-Object System.Collections.Queue; $queue.Enqueue($RootPid)
    while ($queue.Count -gt 0) {
        $cur = [int]$queue.Dequeue()
        if (-not $byParent.ContainsKey($cur)) { continue }
        foreach ($c in $byParent[$cur]) {
            $cid = [int]$c.ProcessId
            if ($seen.ContainsKey($cid)) { continue }
            if ($null -ne $RootStart -and $c.CreationDate -lt $RootStart) { continue }
            $seen[$cid] = $true
            [void]$out.Add($c); $queue.Enqueue($cid)
        }
    }
    , $out.ToArray()      # 호출부는 @() 로 다시 감싸지 않고 그대로 받는다(빈 배열도 배열로 온다)
}

function Stop-ProcessTree([int]$RootPid, $RootStart) {
    $killed = New-Object System.Collections.ArrayList
    $tbl = Get-ProcessTable
    if ($null -ne $tbl) {
        $desc = Get-DescendantRecords $RootPid $RootStart $tbl
        [array]::Reverse($desc)
        foreach ($d in $desc) { try { Stop-Process -Id ([int]$d.ProcessId) -Force -ErrorAction Stop; [void]$killed.Add([int]$d.ProcessId) } catch { } }
    }
    try { Stop-Process -Id $RootPid -Force -ErrorAction Stop; [void]$killed.Add($RootPid) } catch { }
    , @($killed)
}

$resultPath = Join-Path (Split-Path -Parent $RequestFile) 'version-result.json'
$res = [ordered]@{
    schema = 1; runToken = $null; mode = $null; startedUtc = [DateTime]::UtcNow.ToString('o'); finishedUtc = $null
    runner = [ordered]@{ pid = $PID; sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; exe = $null; envNames = @([Environment]::GetEnvironmentVariables().Keys | Sort-Object) }
    request = $null; refused = $null; error = $null
    child = [ordered]@{ started = $false; pid = $null; startUtc = $null; exitCode = $null; hasExited = $null; killed = $false; timedOut = $false; outputLimitExceeded = $false; spawnError = $null; mainModule = $null }
    durationMsObserved = $null; durationMsOs = $null
    stdout = $null; stderr = $null; streamsClosed = $null
    descendantsSeen = @(); descendantsLeftoverKilled = @(); descendantsAliveAfterCleanup = $null; descendantTrackingOk = $true
    childState = 'NOT_SPAWNED'
}
try { $res.runner.exe = (Get-Process -Id $PID).Path } catch { }

$p = $null
try {
    $req = [IO.File]::ReadAllText($RequestFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $res.runToken = [string]$req.runToken
    $res.mode = [string]$req.mode
    if ($req.resultFile) { $resultPath = [string]$req.resultFile }
    $args0 = @($req.args | ForEach-Object { [string]$_ })
    $envNames = @(); if ($req.env) { $envNames = @($req.env.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object) }
    $res.request = [ordered]@{ exe = [string]$req.exe; args = $args0; cwd = [string]$req.cwd; envNames = $envNames; limits = $req.limits }

    # ── 요청 검증: 이 두 모드 밖은 거부한다(범용 실행기가 되지 않게). ──
    $exe = [string]$req.exe
    $refuse = $null
    if ([string]::IsNullOrWhiteSpace($req.runToken)) { $refuse = 'runToken 이 없다' }
    elseif (-not [IO.Path]::IsPathRooted($exe) -or $exe.StartsWith('\\')) { $refuse = '실행 파일은 로컬 절대 경로여야 한다' }
    elseif (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { $refuse = '실행 파일이 없다' }
    elseif (-not [IO.Path]::IsPathRooted([string]$req.cwd) -or -not (Test-Path -LiteralPath ([string]$req.cwd) -PathType Container)) { $refuse = '작업 폴더가 절대 경로이고 존재해야 한다' }
    elseif ($req.mode -eq 'semgrep-version') {
        if ((Split-Path -Leaf $exe) -ne 'semgrep.exe') { $refuse = 'semgrep-version 모드의 실행 파일 이름은 semgrep.exe 여야 한다' }
        elseif ($args0.Count -ne 1 -or $args0[0] -ne '--version') { $refuse = 'semgrep-version 모드의 인자는 정확히 ["--version"] 하나여야 한다' }
    }
    elseif ($req.mode -eq 'stub') {
        $here = Split-Path -Parent $PSCommandPath
        if (-not $exe.Equals($Script:Ps51Path, [StringComparison]::OrdinalIgnoreCase)) { $refuse = 'stub 모드의 실행 파일은 Windows PowerShell 5.1 이어야 한다' }
        elseif ($args0.Count -ne 7 -or ($args0[0..4] -join ' ') -ne '-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File') { $refuse = 'stub 모드의 인자 앞부분이 고정 형식과 다르다' }
        elseif ((Split-Path -Leaf $args0[5]) -ne 'version-stub.ps1' -or -not ((Split-Path -Parent $args0[5]).Equals($here, [StringComparison]::OrdinalIgnoreCase))) { $refuse = 'stub 스크립트는 이 폴더의 version-stub.ps1 이어야 한다' }
        elseif ($Script:StubScenarios -notcontains $args0[6]) { $refuse = '허용되지 않은 스텁 시나리오' }
    }
    else { $refuse = '알 수 없는 mode' }
    if ($refuse) { $res.refused = $refuse; throw "REFUSED: $refuse" }

    $lim = $req.limits
    foreach ($k in 'timeoutMs', 'maxStdoutBytes', 'maxStderrBytes', 'killWaitMs') { if ($null -eq $lim.$k -or [int]$lim.$k -lt 1) { $res.refused = "한도 $k 가 없거나 1 미만이다"; throw "REFUSED: $($res.refused)" } }

    # ── 시작: 환경은 요청의 것만. 이 프로세스의 환경을 물려주지 않는다. ──
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = ConvertTo-ArgumentString $args0
    $psi.WorkingDirectory = [string]$req.cwd
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.EnvironmentVariables.Clear()
    if ($req.env) { foreach ($pr in $req.env.PSObject.Properties) { $psi.EnvironmentVariables[[string]$pr.Name] = [string]$pr.Value } }

    $sw = [Diagnostics.Stopwatch]::StartNew()
    try { $p = [Diagnostics.Process]::Start($psi) } catch { $res.child.spawnError = $_.Exception.Message; $res.childState = 'NOT_SPAWNED'; throw }
    $res.child.started = $true; $res.child.pid = $p.Id; $res.childState = 'RUNNING'
    $childPid = $p.Id
    $childStart = $null; try { $childStart = $p.StartTime; $res.child.startUtc = $childStart.ToUniversalTime().ToString('o') } catch { }
    try { $res.child.mainModule = $p.MainModule.FileName } catch { $res.child.mainModule = $null }
    try { $p.StandardInput.Close() } catch { }

    $streams = @(
        @{ name = 'stdout'; s = $p.StandardOutput.BaseStream; limit = [int]$lim.maxStdoutBytes },
        @{ name = 'stderr'; s = $p.StandardError.BaseStream; limit = [int]$lim.maxStderrBytes }
    )
    foreach ($x in $streams) {
        $x.buf = New-Object byte[] 4096; $x.ms = New-Object IO.MemoryStream; $x.total = 0; $x.eof = $false; $x.overflow = $false; $x.failed = $false
        $x.ar = $x.s.BeginRead($x.buf, 0, $x.buf.Length, $null, $null)
    }

    $descSeen = @{}          # "pid|생성시각" → 관측 기록
    $trackOk = $true
    $track = {
        $tbl = Get-ProcessTable
        if ($null -eq $tbl) { $script:trackOk = $false; return }
        $items = Get-DescendantRecords $childPid $childStart $tbl
        foreach ($d in $items) {
            $key = '{0}|{1}' -f $d.ProcessId, $d.CreationDate.ToUniversalTime().ToString('o')
            if (-not $descSeen.ContainsKey($key)) {
                $descSeen[$key] = [ordered]@{ pid = [int]$d.ProcessId; parentPid = [int]$d.ParentProcessId; exe = $d.ExecutablePath; commandLine = $d.CommandLine; createdUtc = $d.CreationDate.ToUniversalTime().ToString('o'); firstSeenMs = $sw.ElapsedMilliseconds }
            }
        }
    }

    $exitedAt = $null; $lastTrack = -1000
    while ($true) {
        foreach ($x in $streams) {
            if (-not $x.eof -and $x.ar.IsCompleted) {
                $n = 0
                try { $n = $x.s.EndRead($x.ar) } catch { $x.failed = $true; $n = 0 }
                if ($n -le 0) { $x.eof = $true }
                else {
                    $x.total += $n
                    if ($x.total -gt $x.limit) { $x.overflow = $true; $x.eof = $true }       # 한도를 넘으면 읽기를 그만두고(이번 덩어리는 쓰지 않는다) 끝낸다
                    else { $x.ms.Write($x.buf, 0, $n); $x.ar = $x.s.BeginRead($x.buf, 0, $x.buf.Length, $null, $null) }
                }
            }
        }
        if ($streams[0].overflow -or $streams[1].overflow) { $res.child.outputLimitExceeded = $true; break }
        $now = $sw.ElapsedMilliseconds
        if ($p.HasExited -and $null -eq $exitedAt) { $exitedAt = $now }
        if ($p.HasExited -and $streams[0].eof -and $streams[1].eof) { break }
        if ($null -ne $exitedAt -and ($now - $exitedAt) -gt 2000) { break }               # 종료 뒤 파이프가 안 닫히면(자손이 쥐고 있음) 2초만 더 기다린다
        if ($null -eq $exitedAt -and $now -gt [int]$lim.timeoutMs) { $res.child.timedOut = $true; break }
        if (($now - $lastTrack) -ge 200) { $lastTrack = $now; & $track }
        Start-Sleep -Milliseconds 15
    }
    & $track
    $res.durationMsObserved = $(if ($null -ne $exitedAt) { $exitedAt } else { $sw.ElapsedMilliseconds })
    $res.streamsClosed = [bool]($streams[0].eof -and $streams[1].eof -and -not $streams[0].overflow -and -not $streams[1].overflow)

    # ── 끝내기: 시간 초과·출력 초과면 트리를 끝내고 종료를 관찰한다. ──
    if ($res.child.timedOut -or $res.child.outputLimitExceeded) {
        [void](Stop-ProcessTree $childPid $childStart)
        $res.child.killed = $true
        $gone = $p.WaitForExit([int]$lim.killWaitMs)
        $res.childState = $(if ($gone) { 'KILLED' } else { 'KILL_NOT_OBSERVED' })
    } else {
        $res.childState = 'EXITED'
    }
    $res.child.hasExited = [bool]$p.HasExited
    if ($p.HasExited) {
        if (-not $res.child.killed) { $res.child.exitCode = $p.ExitCode }
        try { $res.durationMsOs = [int](($p.ExitTime - $p.StartTime).TotalMilliseconds) } catch { }
    }

    # 정상 종료·강제 종료 어느 쪽이든 남은 자손은 끝낸다.
    $tbl2 = Get-ProcessTable
    if ($null -eq $tbl2) { $trackOk = $false }
    else {
        $left = Get-DescendantRecords $childPid $childStart $tbl2
        if ($left.Count -gt 0) {
            $res.descendantsLeftoverKilled = @($left | ForEach-Object { [ordered]@{ pid = [int]$_.ProcessId; exe = $_.ExecutablePath; commandLine = $_.CommandLine } })
            foreach ($l in @($left | Sort-Object { $_.CreationDate } -Descending)) { try { Stop-Process -Id ([int]$l.ProcessId) -Force -ErrorAction Stop } catch { } }
            Start-Sleep -Milliseconds 300
        }
        $tbl3 = Get-ProcessTable
        if ($null -eq $tbl3) { $trackOk = $false } else { $alive = Get-DescendantRecords $childPid $childStart $tbl3; $res.descendantsAliveAfterCleanup = $alive.Count }
    }
    $res.descendantTrackingOk = $trackOk
    $res.descendantsSeen = @($descSeen.Values | Sort-Object { $_.firstSeenMs })

    foreach ($x in $streams) {
        $bytes = $x.ms.ToArray()
        $res[$x.name] = [ordered]@{ b64 = [Convert]::ToBase64String($bytes); bytesKept = $bytes.Length; bytesRead = $x.total; limit = $x.limit; overflow = $x.overflow; readFailed = $x.failed }
    }
} catch {
    if (-not $res.error) { $res.error = $_.Exception.Message }
} finally {
    if ($p -and -not $p.HasExited -and $res.childState -eq 'RUNNING') {
        try { [void](Stop-ProcessTree $p.Id $childStart); $res.child.killed = $true; $res.childState = 'KILLED_AFTER_ERROR' } catch { }
    }
    $res.finishedUtc = [DateTime]::UtcNow.ToString('o')
    try { Write-ResultFile -Path $resultPath -Object $res } catch { }
}
if ($res.refused) { exit 2 }
if ($res.error) { exit 3 }
exit 0
