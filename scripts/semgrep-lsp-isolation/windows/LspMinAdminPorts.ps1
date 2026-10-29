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
# -TrustedRoot 를 주면 쓰기 전에 그 루트부터 이 파일까지 이미 있는 경로 조각에 링크가 없는지 확인하고, 확인하지 못하거나 링크가 있으면 쓰지 않는다.
# 러너가 살아 있는 동안 쓰는 관리자 쓰기라서 전용 계정이 폴더를 바꿔 치울 수 있는 때다(확인 뒤에 바뀌는 경쟁 상태까지 막지는 못한다).
function Write-LspMinAbortFile {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text, [string]$TrustedRoot)
    $res = [ordered]@{ ok = $false; error = $null }
    if ($TrustedRoot) {
        $pb = Get-LspMinWorkPathProblems -TrustedRoot $TrustedRoot -Targets @($Path)
        if ($pb.Count -gt 0) { $res.error = 'WORK_PATH_UNSAFE: ' + ($pb -join ' ; '); return $res }
    }
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

# 경로 조각 하나의 상태(링크는 따라가지 않는다): MISSING(없다) | LINK(재해석 지점) | DIR | FILE | UNREADABLE(없는 것과 다르게, 읽지 못했다).
function Get-LspMinPieceState {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $a = [IO.File]::GetAttributes($Path)
        if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return 'LINK' }
        if (($a -band [IO.FileAttributes]::Directory) -ne 0) { return 'DIR' }
        return 'FILE'
    } catch [System.IO.FileNotFoundException] { return 'MISSING' } catch [System.IO.DirectoryNotFoundException] { return 'MISSING' } catch { return 'UNREADABLE' }
}

# 신뢰하는 작업 루트(TrustedRoot, 루트 자신 포함)부터 각 목적지까지, 이미 있는 경로 조각을 위에서 아래로 하나씩 확인한다.
# - 조각이 링크(정션·심볼릭 링크)면 LINK:<조각>, 읽지 못하면 UNREADABLE:<조각>, 중간 조각이 폴더가 아니면 NOT_A_DIRECTORY:<조각> 으로 센다. 링크는 따라가지 않고 거기서 멈춘다.
# - 아직 없는 조각에서 멈춘다: 없는 경로는 위쪽 기존 조각이 모두 검증된 경우에만 그 아래에 만들 수 있으므로 문제로 세지 않는다.
# - 루트 밖 목적지(OUTSIDE_ROOT)와 루트 자체의 문제(없음·링크·읽지 못함)도 문제다. 확인하지 못한 것은 깨끗하다고 하지 않는다(호출자가 변경 전에 거절한다).
# 한계: 확인한 시점의 상태일 뿐이다(확인 뒤에 링크로 바뀌는 경쟁 상태는 막지 못한다). 하드 링크는 재해석 지점이 아니라서 찾지 못한다.
function Get-LspMinWorkPathProblems {
    param([Parameter(Mandatory)][string]$TrustedRoot, [Parameter(Mandatory)][string[]]$Targets)
    $problems = New-Object System.Collections.ArrayList
    $rootFull = $null
    try { $rootFull = [IO.Path]::GetFullPath($TrustedRoot).TrimEnd('\') } catch { [void]$problems.Add('UNREADABLE:' + $TrustedRoot); return , @($problems) }
    $rs = Get-LspMinPieceState -Path $rootFull
    if ($rs -ne 'DIR') {
        $tag = 'ROOT_NOT_A_DIRECTORY:'; if ($rs -eq 'LINK') { $tag = 'LINK:' } elseif ($rs -eq 'UNREADABLE') { $tag = 'UNREADABLE:' } elseif ($rs -eq 'MISSING') { $tag = 'ROOT_MISSING:' }
        [void]$problems.Add($tag + $rootFull)
        return , @($problems)
    }
    foreach ($target in $Targets) {
        $full = $null
        try { $full = [IO.Path]::GetFullPath($target) } catch { $t0 = 'UNREADABLE:' + $target; if (-not $problems.Contains($t0)) { [void]$problems.Add($t0) }; continue }
        if (-not $full.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) { $t1 = 'OUTSIDE_ROOT:' + $target; if (-not $problems.Contains($t1)) { [void]$problems.Add($t1) }; continue }
        $segs = @($full.Substring($rootFull.Length + 1).Split('\') | Where-Object { $_ -ne '' })
        $cur = $rootFull
        for ($i = 0; $i -lt $segs.Count; $i++) {
            $cur = $cur + '\' + $segs[$i]
            $st = Get-LspMinPieceState -Path $cur
            if ($st -eq 'MISSING') { break }
            $bad = $null
            if ($st -eq 'LINK') { $bad = 'LINK:' + $cur } elseif ($st -eq 'UNREADABLE') { $bad = 'UNREADABLE:' + $cur } elseif ($st -eq 'FILE' -and $i -lt $segs.Count - 1) { $bad = 'NOT_A_DIRECTORY:' + $cur }
            if ($bad) { if (-not $problems.Contains($bad)) { [void]$problems.Add($bad) }; break }
        }
    }
    , @($problems)
}

# 이번 진입점의 작업 파일과 복사 목적지에 대한 변경 전 안전 확인 한 묶음: (1) 작업 루트부터 모든 목적지까지의 경로 조각, (2) 이전 실행의 lsp 작업 배치 안의 링크.
# lsp 폴더 안은 상위 경로가 깨끗할 때만 본다(링크를 지나 바깥을 훑지 않는다). 빈 목록이면 안전하다고 본다.
function Get-LspMinWorkSafetyProblems {
    param([Parameter(Mandatory)][string]$TrustedRoot, [Parameter(Mandatory)][string]$WorkDir, [Parameter(Mandatory)][string]$LspWork)
    $out = New-Object System.Collections.ArrayList
    $chain = Get-LspMinWorkPathProblems -TrustedRoot $TrustedRoot -Targets (Get-LspMinWorkTargets -WorkDir $WorkDir -LspWork $LspWork)
    foreach ($c in $chain) { [void]$out.Add([string]$c) }
    if ($out.Count -eq 0 -and (Test-Path -LiteralPath $LspWork)) {
        $tree = Find-LspMinReparseInTree -Root $LspWork
        foreach ($t in $tree) { [void]$out.Add([string]$t) }
    }
    , @($out)
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

# ── 재해석 도구 호출 ─────────────────────────────────────────────────────────
# 실행과 출력 수집을 하나의 마감(TimeoutMs)으로 묶는다. 부모 프로세스가 끝난 것을 출력 끝(EOF)으로 보지 않는다: 두 파이프가 모두 닫혀야 끝난 것이다.
# 마감 안에 못 끝나거나, 읽기가 실패하거나, 취소되면 도구가 만든 후손까지 작업 개체(Job Object)로 한꺼번에 끝내고, 그 정리의 성패를 관측 결과와 따로 적는다.

# 작업 개체 도우미(C#). 후손이 부모보다 오래 살아 출력 파이프를 붙잡고 있어도(부모가 먼저 끝나도) 개체에 속한 프로세스를 모두 끝낼 수 있다.
# 개체의 마지막 핸들이 닫히면 남은 프로세스도 끝난다. 한계: 프로세스를 시작한 뒤 개체에 넣기 전에 이미 만든 후손은 개체에 속하지 못한다(그 틈은 아주 짧지만 0 은 아니다).
$Script:LspMinJobSource = @'
using System;
using System.Runtime.InteropServices;

public sealed class LspMinJob : IDisposable
{
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong A; public ulong B; public ulong C; public ulong D; public ulong E; public ulong F; }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimit
    {
        public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
        public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimit
    {
        public BasicLimit Basic; public IoCounters Io;
        public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicAccounting
    {
        public long TotalUserTime; public long TotalKernelTime; public long ThisPeriodTotalUserTime; public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount; public uint TotalProcesses; public uint ActiveProcesses; public uint TotalTerminatedProcesses;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool QueryInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length, IntPtr returnLength);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);

    private IntPtr handle;

    public LspMinJob()
    {
        handle = CreateJobObject(IntPtr.Zero, null);
        if (handle == IntPtr.Zero) { throw new InvalidOperationException("CreateJobObject failed: " + Marshal.GetLastWin32Error()); }
        ExtendedLimit info = new ExtendedLimit();
        info.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        int size = Marshal.SizeOf(typeof(ExtendedLimit));
        IntPtr buf = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(info, buf, false);
            if (!SetInformationJobObject(handle, 9, buf, (uint)size)) { throw new InvalidOperationException("SetInformationJobObject failed: " + Marshal.GetLastWin32Error()); }
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    public void Assign(IntPtr processHandle)
    {
        if (!AssignProcessToJobObject(handle, processHandle)) { throw new InvalidOperationException("AssignProcessToJobObject failed: " + Marshal.GetLastWin32Error()); }
    }

    public void Terminate()
    {
        if (!TerminateJobObject(handle, 1)) { throw new InvalidOperationException("TerminateJobObject failed: " + Marshal.GetLastWin32Error()); }
    }

    public int ActiveProcesses()
    {
        int size = Marshal.SizeOf(typeof(BasicAccounting));
        IntPtr buf = Marshal.AllocHGlobal(size);
        try
        {
            if (!QueryInformationJobObject(handle, 1, buf, (uint)size, IntPtr.Zero)) { throw new InvalidOperationException("QueryInformationJobObject failed: " + Marshal.GetLastWin32Error()); }
            BasicAccounting acc = (BasicAccounting)Marshal.PtrToStructure(buf, typeof(BasicAccounting));
            return (int)acc.ActiveProcesses;
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    public void Dispose()
    {
        if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; }
    }
}
'@

# 작업 개체 형식을 한 번 만든다(컴파일에 시간이 걸리므로 마감을 세기 전에 한다). 만들 수 없으면 $false.
function Initialize-LspMinJobType {
    if ('LspMinJob' -as [type]) { return $true }
    try { Add-Type -TypeDefinition $Script:LspMinJobSource -ErrorAction Stop; return $true } catch { return $false }
}

# 비동기 읽기 한 조각을 처리한다. 아직 안 끝났으면 같은 읽기를 돌려주고, 끝났으면 내용을 상한까지 모으고 다음 읽기를 건다. EOF(0자)나 실패면 $null.
function Step-LspMinRead {
    param($Reader, $Task, [char[]]$Buffer, [Text.StringBuilder]$Sink, [int]$Cap, $State)
    if ($null -eq $Task) { return $null }
    if (-not $Task.IsCompleted) { return $Task }
    if ($Task.IsFaulted -or $Task.IsCanceled) {
        $State.faulted = $true
        $State.error = $(if ($Task.Exception) { $Task.Exception.GetBaseException().Message } else { 'CANCELED' })
        return $null
    }
    $n = [int]$Task.Result
    if ($n -le 0) { $State.eof = $true; return $null }
    $room = $Cap - $Sink.Length
    if ($room -gt 0) { [void]$Sink.Append($Buffer, 0, [Math]::Min($n, $room)); if ($n -gt $room) { $State.truncated = $true } } else { $State.truncated = $true }
    $Reader.ReadAsync($Buffer, 0, $Buffer.Length)
}

# 도구 실행 하나의 뒤처리: 개체에 남은 프로세스를 끝내고, 남은 읽기를 확인 시간 안에서 끝까지 비우고, 정말 비었는지 읽어서 확인한다.
# 결과는 관측과 따로 쓰는 정리 기록이다: ok(남은 프로세스·읽기 없음이 확인됐나), outcome(NOT_NEEDED | TERMINATED | FAILED), 개체에 남은 수, 끝나지 않은 읽기 수, 오류.
function Close-LspMinToolRun {
    param($Ctx, [int]$KillConfirmMs)
    $cl = [ordered]@{ attempted = $true; ok = $true; outcome = 'NOT_NEEDED'; jobActiveBefore = $null; jobActiveAfter = $null; readTasksPending = 0; error = $null }
    $errs = New-Object System.Collections.ArrayList
    $job = $Ctx.job; $p = $Ctx.p
    $needKill = $false
    if ($job) {
        try { $cl.jobActiveBefore = [int]$job.ActiveProcesses(); if ($cl.jobActiveBefore -gt 0) { $needKill = $true } } catch { [void]$errs.Add('QUERY_FAILED: ' + $_.Exception.Message); $needKill = $true }
    }
    if ($Ctx.assignError) {
        # 개체에 넣지 못했다: 도구 본체만 끝낼 수 있고 후손은 확인할 수 없다.
        [void]$errs.Add('DESCENDANTS_UNCONFIRMED: ' + $Ctx.assignError)
        if ($p) { try { if (-not $p.HasExited) { $p.Kill() } } catch { [void]$errs.Add('ROOT_KILL_FAILED: ' + $_.Exception.Message) } }
    }
    if ($job -and $needKill) {
        try { $job.Terminate(); $cl.outcome = 'TERMINATED' } catch { [void]$errs.Add('TERMINATE_FAILED: ' + $_.Exception.Message); $cl.outcome = 'FAILED' }
    }
    $confirm = [Diagnostics.Stopwatch]::StartNew()
    $act = $null; $pending = 0
    while ($true) {
        if ($p) {
            $Ctx.outTask = Step-LspMinRead $p.StandardOutput $Ctx.outTask $Ctx.outCh $Ctx.outSb $Ctx.cap $Ctx.outSt
            $Ctx.errTask = Step-LspMinRead $p.StandardError $Ctx.errTask $Ctx.errCh $Ctx.errSb $Ctx.cap $Ctx.errSt
        }
        $pending = 0; if ($null -ne $Ctx.outTask) { $pending++ }; if ($null -ne $Ctx.errTask) { $pending++ }
        $act = $null; if ($job) { try { $act = [int]$job.ActiveProcesses() } catch { $act = $null } }
        $rootGone = ((-not $p) -or $p.HasExited)
        $jobEmpty = ((-not $job) -or ($act -eq 0))
        if (($pending -eq 0 -and $jobEmpty -and $rootGone) -or $confirm.ElapsedMilliseconds -ge $KillConfirmMs) { break }
        Start-Sleep -Milliseconds 20
    }
    $cl.jobActiveAfter = $act; $cl.readTasksPending = $pending
    if ($job -and $null -eq $act) { [void]$errs.Add('JOB_STATE_UNREADABLE') } elseif ($job -and $act -gt 0) { [void]$errs.Add("PROCESSES_REMAIN: $act") }
    if ($pending -gt 0) { [void]$errs.Add("READS_PENDING: $pending") }
    if ($p -and -not $p.HasExited) { [void]$errs.Add('ROOT_STILL_RUNNING') }
    if ($errs.Count -gt 0) { $cl.ok = $false; $cl.outcome = 'FAILED'; $cl.error = ($errs -join ' ; ') }
    $cl
}

# TS 재해석 도구(lsp-min-reinterpret-cli.ts)를 부른다. 러너 결과와 관리자 문맥을 읽고 기록 JSON 을 쓸 뿐이다(Semgrep 과 무관).
# 마감: TimeoutMs 는 프로세스를 시작한 때부터 두 파이프가 모두 닫힐 때까지의 전체다. 마감을 넘기면 도구 트리를 끝내고 정리를 확인하느라 KillConfirmMs 까지 더 쓸 수 있다.
# 결과: ran(도구가 정상적으로 끝나고 출력도 끝까지 받았나), exitCode, output, error(TIMEOUT | PIPE_NOT_CLOSED | STREAM_READ_FAILED | CANCELLED | JOB_UNAVAILABLE | JOB_ASSIGN_FAILED | 예외 문구),
#       exited, stdoutClosed, stderrClosed, truncated, elapsedMs(판단 시점), totalMs(정리 뒤), cleanup(관측과 따로 적는 정리 기록).
# -CancelFile: 도구를 시작할 때 없던 이 파일이 실행 중에 생기면 취소한다(이미 있던 파일은 취소로 보지 않는다).
function Invoke-LspMinReinterpret {
    param(
        [Parameter(Mandatory)][string]$TsxCmd, [string]$NodeDir, [Parameter(Mandatory)][string]$CliTs, [Parameter(Mandatory)][string]$RunnerResultPath, [Parameter(Mandatory)][string]$ContextPath, [Parameter(Mandatory)][string]$OutPath,
        [int]$TimeoutMs = 120000, [int]$KillConfirmMs = 5000, [int]$MaxOutputChars = 262144, [string]$CancelFile
    )
    $r = [ordered]@{ ran = $false; exitCode = $null; output = $null; error = $null; exited = $false; stdoutClosed = $false; stderrClosed = $false; truncated = $false; elapsedMs = $null; totalMs = $null; cleanup = $null }
    if (-not (Initialize-LspMinJobType)) {
        $r.error = 'JOB_UNAVAILABLE'
        $r.cleanup = [ordered]@{ attempted = $false; ok = $true; outcome = 'NOT_NEEDED'; jobActiveBefore = $null; jobActiveAfter = $null; readTasksPending = 0; error = $null }
        return $r
    }
    $ctx = @{
        job = $null; p = $null; assignError = $null; cap = $MaxOutputChars
        outTask = $null; errTask = $null; outCh = (New-Object 'char[]' 4096); errCh = (New-Object 'char[]' 4096)
        outSb = (New-Object Text.StringBuilder); errSb = (New-Object Text.StringBuilder)
        outSt = @{ eof = $false; faulted = $false; error = $null; truncated = $false }; errSt = @{ eof = $false; faulted = $false; error = $null; truncated = $false }
    }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $reason = $null
    try {
        $ctx.job = New-Object LspMinJob
        $psi = New-Object Diagnostics.ProcessStartInfo
        $psi.FileName = $TsxCmd
        $psi.Arguments = ((@($CliTs, '--runner-result', $RunnerResultPath, '--context', $ContextPath, '--out', $OutPath) | ForEach-Object { '"' + $_ + '"' }) -join ' ')
        $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
        $psi.StandardOutputEncoding = [Text.Encoding]::UTF8; $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
        if ($NodeDir) { $psi.EnvironmentVariables['PATH'] = $NodeDir + ';' + $psi.EnvironmentVariables['PATH'] }
        $cancelAtStart = [bool]($CancelFile -and (Test-Path -LiteralPath $CancelFile))
        $sw.Restart()
        $ctx.p = [Diagnostics.Process]::Start($psi)
        try { $ctx.job.Assign($ctx.p.Handle) } catch { $ctx.assignError = $_.Exception.Message }
        if ($ctx.assignError) { $reason = 'JOB_ASSIGN_FAILED: ' + $ctx.assignError }
        else {
            $ctx.outTask = $ctx.p.StandardOutput.ReadAsync($ctx.outCh, 0, $ctx.outCh.Length)
            $ctx.errTask = $ctx.p.StandardError.ReadAsync($ctx.errCh, 0, $ctx.errCh.Length)
            while ($true) {
                $ctx.outTask = Step-LspMinRead $ctx.p.StandardOutput $ctx.outTask $ctx.outCh $ctx.outSb $ctx.cap $ctx.outSt
                $ctx.errTask = Step-LspMinRead $ctx.p.StandardError $ctx.errTask $ctx.errCh $ctx.errSb $ctx.cap $ctx.errSt
                if ($ctx.outSt.faulted -or $ctx.errSt.faulted) { $reason = 'STREAM_READ_FAILED'; break }
                if ($ctx.p.HasExited -and $ctx.outSt.eof -and $ctx.errSt.eof) { break }
                if ($CancelFile -and -not $cancelAtStart -and (Test-Path -LiteralPath $CancelFile)) { $reason = 'CANCELLED'; break }
                if ($sw.ElapsedMilliseconds -ge $TimeoutMs) { $reason = $(if ($ctx.p.HasExited) { 'PIPE_NOT_CLOSED' } else { 'TIMEOUT' }); break }
                Start-Sleep -Milliseconds 20
            }
        }
        $r.elapsedMs = [int]$sw.ElapsedMilliseconds
        $r.exited = [bool]$ctx.p.HasExited
        if ($r.exited) { $r.exitCode = $ctx.p.ExitCode }
        $r.stdoutClosed = [bool]$ctx.outSt.eof; $r.stderrClosed = [bool]$ctx.errSt.eof
        if ($null -eq $reason) { $r.ran = $true } else { $r.error = $reason }
    } catch {
        $r.ran = $false; if (-not $r.error) { $r.error = $_.Exception.Message }
        if ($null -eq $r.elapsedMs) { $r.elapsedMs = [int]$sw.ElapsedMilliseconds }
    } finally {
        # 어떤 경로로 나오든(정상·마감·읽기 실패·취소·예외) 같은 뒤처리를 한다. 개체와 프로세스 핸들은 정리가 확인된 뒤에만 닫는다.
        $r.cleanup = Close-LspMinToolRun -Ctx $ctx -KillConfirmMs $KillConfirmMs
        if ($ctx.job) { $ctx.job.Dispose() }
        if ($ctx.p -and $r.cleanup.ok) { $ctx.p.Dispose() }
    }
    $r.truncated = [bool]($ctx.outSt.truncated -or $ctx.errSt.truncated)
    $r.output = ([string]$ctx.outSb.ToString() + [string]$ctx.errSb.ToString())
    $r.totalMs = [int]$sw.ElapsedMilliseconds
    $r
}
