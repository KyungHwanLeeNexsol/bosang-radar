# LSP-MIN-1 관리자 진입점이 시스템에 닿는 곳을 모은 포트 함수들. 불러올 때는 함수만 정의하고 아무것도 실행하지 않는다.
# 모의 시험(MockSystemLsp.ps1)이 이 파일 바로 뒤에서 같은 이름으로 대체할 수 있도록, 진입 스크립트는 이 이름으로만 해당 일을 한다.
# 여기 있는 일은 모두 이 실행 하나의 범위 안이다: 루프백 수신기, 중단 파일 하나, 읽기 전용 조회, 재해석 도구 호출.
# 계정·방화벽·감사·ACL 은 바꾸지 않는다(그것은 기존 격리 도구와 Invoke-Mutation 관문을 거치는 진입 스크립트의 일이다).

# 루프백 수신기: 127.0.0.1 의 임시 포트. 자식보다 먼저 열고, 연결이 들어오면 건수로만 센다(내용을 읽지 않는다).
function New-LspMinReceiver {
    $l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $l.Start()
    $port = ([Net.IPEndPoint]$l.LocalEndpoint).Port
    @{ listener = $l; port = $port; url = "http://127.0.0.1:$port"; hits = (New-Object System.Collections.ArrayList); samples = 0; failures = 0; lastError = $null; stopped = $false }
}

# 수신기를 한 번 비운다. 결과: ok(읽을 수 있었나), newHits(이번에 새로 센 연결 수), error. 읽기 실패는 0건으로 치지 않는다.
function Read-LspMinReceiver {
    param([Parameter(Mandatory)]$Receiver)
    $res = [ordered]@{ ok = $true; newHits = 0; error = $null }
    $Receiver.samples++
    try {
        # 한 번에 받는 연결 수에 상한을 둔다: 연결이 끝없이 들어와도 이 호출이 돌아와서 중단 요청이 미뤄지지 않는다(남은 연결은 다음 표본에서 센다).
        $taken = 0
        while ($taken -lt 256 -and $Receiver.listener.Pending()) {
            $taken++
            $c = $Receiver.listener.AcceptTcpClient()
            try { [void]$Receiver.hits.Add([string]$c.Client.RemoteEndPoint) } finally { $c.Close() }
            $res.newHits++
        }
    } catch {
        $res.ok = $false; $res.error = $_.Exception.Message
        $Receiver.failures++; $Receiver.lastError = $res.error
    }
    $res
}

function Stop-LspMinReceiver {
    param([Parameter(Mandatory)]$Receiver)
    if ($Receiver.stopped) { return }
    $Receiver.listener.Stop()
    $Receiver.stopped = $true
}

# 중단 파일을 새로 만든다(이미 있으면 실패). 러너는 이 파일의 존재와 첫 줄(A3:… 또는 A7:…)을 본다.
function Write-LspMinAbortFile {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    $res = [ordered]@{ ok = $false; error = $null }
    try {
        $fs = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
        try { $b = (New-Object Text.UTF8Encoding($false)).GetBytes($Text + "`n"); $fs.Write($b, 0, $b.Length); $fs.Flush() } finally { $fs.Dispose() }
        $res.ok = $true
    } catch { $res.error = $_.Exception.Message }
    $res
}

# 관리자 쪽 프로세스 표. 조회 한 번에 시간 제한을 둔다(멈추면 감독 루프가 마감을 못 지킨다). 읽지 못하면 $null.
function Get-LspMinCimTable {
    param([int]$TimeoutSec = 5)
    try { @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate -OperationTimeoutSec $TimeoutSec -ErrorAction Stop) } catch { $null }
}

# 프로세스 하나의 소유 SID. 조회 한 번에 제한 시간을 준다. 읽지 못하면 $null.
function Get-LspMinOwnerSid {
    param([Parameter(Mandatory)]$Process, [int]$TimeoutSec = 5)
    try { $o = Invoke-CimMethod -InputObject $Process -MethodName GetOwnerSid -OperationTimeoutSec $TimeoutSec -ErrorAction Stop; if ($o.ReturnValue -eq 0) { return [string]$o.Sid } } catch { }
    $null
}

# PID 하나의 프로세스 기록(IsolationCommon 의 Get-ProcessRecord 와 같은 모양). CIM 조회에 제한 시간이 있다. 없거나 읽지 못하면 $null.
function Get-LspMinProcessRecord {
    param([Parameter(Mandatory)][int]$ProcessId, [Parameter(Mandatory)][string]$Role, [int]$TimeoutSec = 5)
    $p = $null
    try { $p = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcessId" -OperationTimeoutSec $TimeoutSec -ErrorAction Stop } catch { return $null }
    if (-not $p) { return $null }
    [ordered]@{
        role = $Role; processId = $ProcessId; parentProcessId = [int]$p.ParentProcessId; exePath = $p.ExecutablePath
        startUtc = $p.CreationDate.ToUniversalTime().ToString('o'); endUtc = $null; ownerSid = (Get-LspMinOwnerSid -Process $p -TimeoutSec $TimeoutSec)
        snapshotUtc = [DateTime]::UtcNow.ToString('o')
    }
}

# 폴더 트리 안의 재해석 지점(정션·심볼릭 링크)을 찾는다. 링크는 따라가지 않는다(대상 안을 보지 않는다). 읽지 못한 곳은 UNREADABLE 로 센다. 너무 크면 TOO_MANY_ENTRIES.
function Find-LspMinReparseInTree {
    param([Parameter(Mandatory)][string]$Root, [int]$MaxEntries = 20000)
    $found = New-Object System.Collections.ArrayList
    try { if (([IO.File]::GetAttributes($Root) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { [void]$found.Add($Root); return , @($found) } } catch { [void]$found.Add('UNREADABLE:' + $Root); return , @($found) }
    $stack = New-Object System.Collections.Stack; $stack.Push($Root)
    $count = 0
    while ($stack.Count -gt 0) {
        $dir = [string]$stack.Pop()
        $entries = $null
        try { $entries = [IO.Directory]::GetFileSystemEntries($dir) } catch { [void]$found.Add('UNREADABLE:' + $dir); continue }
        foreach ($e in $entries) {
            $count++
            if ($count -gt $MaxEntries) { [void]$found.Add('TOO_MANY_ENTRIES'); return , @($found) }
            $a = $null
            try { $a = [IO.File]::GetAttributes($e) } catch { [void]$found.Add('UNREADABLE:' + $e); continue }
            if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { [void]$found.Add($e); continue }
            if (($a -band [IO.FileAttributes]::Directory) -ne 0) { $stack.Push($e) }
        }
    }
    , @($found)
}

# 경로 조각 중 재해석 지점(심볼릭 링크·정션)이 있는 것을 돌려준다. Root 에서 Path 까지(Root 포함). 읽지 못한 조각은 UNREADABLE 로 센다.
function Get-LspMinReparseInChain {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Root)
    $found = New-Object System.Collections.ArrayList
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $cur = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $guard = 0
    while ($cur.Length -ge $rootFull.Length -and $guard -lt 64) {
        $guard++
        try {
            $a = [IO.File]::GetAttributes($cur)
            if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { [void]$found.Add($cur) }
        } catch { [void]$found.Add('UNREADABLE:' + $cur) }
        if ($cur.Equals($rootFull, [StringComparison]::OrdinalIgnoreCase)) { break }
        $parent = Split-Path -Parent $cur
        if (-not $parent -or $parent.Length -ge $cur.Length) { break }
        $cur = $parent
    }
    , @($found)
}

# 파일의 전체 SHA-256(소문자)과 크기. 읽지 못하면 $null.
function Get-LspMinFileFacts {
    param([Parameter(Mandatory)][string]$Path)
    try {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
        [ordered]@{ sha256 = (Get-FileSha256Hex -Path $Path); size = (Get-Item -LiteralPath $Path).Length }
    } catch { $null }
}

# TS 재해석 도구(lsp-min-reinterpret-cli.ts)를 부른다. 러너 결과와 관리자 문맥을 읽고 기록 JSON 을 쓸 뿐이다(Semgrep 과 무관).
function Invoke-LspMinReinterpret {
    param([Parameter(Mandatory)][string]$TsxCmd, [string]$NodeDir, [Parameter(Mandatory)][string]$CliTs, [Parameter(Mandatory)][string]$RunnerResultPath, [Parameter(Mandatory)][string]$ContextPath, [Parameter(Mandatory)][string]$OutPath, [int]$TimeoutMs = 120000)
    $r = [ordered]@{ ran = $false; exitCode = $null; output = $null; error = $null }
    $p = $null
    try {
        $psi = New-Object Diagnostics.ProcessStartInfo
        $psi.FileName = $TsxCmd
        $psi.Arguments = ((@($CliTs, '--runner-result', $RunnerResultPath, '--context', $ContextPath, '--out', $OutPath) | ForEach-Object { '"' + $_ + '"' }) -join ' ')
        $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
        if ($NodeDir) { $psi.EnvironmentVariables['PATH'] = $NodeDir + ';' + $psi.EnvironmentVariables['PATH'] }
        $p = [Diagnostics.Process]::Start($psi)
        $outTask = $p.StandardOutput.ReadToEndAsync(); $errTask = $p.StandardError.ReadToEndAsync()
        # 제한 시간 안에 안 끝나면 이 호출이 매달리지 않도록 끊는다(도구 프로세스만. 결과 파일이 없으면 호출자가 재해석 실패로 센다).
        if (-not $p.WaitForExit($TimeoutMs)) { try { $p.Kill() } catch { }; $r.error = 'TIMEOUT'; return $r }
        $r.exitCode = $p.ExitCode; $r.output = ([string]$outTask.Result + [string]$errTask.Result); $r.ran = $true
    } catch { $r.error = $_.Exception.Message }
    finally { if ($p) { $p.Dispose() } }
    $r
}
