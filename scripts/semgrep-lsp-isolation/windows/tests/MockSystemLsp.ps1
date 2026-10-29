# LSP-MIN-1 관리자 진입점(Test-LspMinObservation.ps1) 흐름 시험용 모의 시스템 확장. 기존 MockSystem.ps1 위에 얹는다(그 파일은 바꾸지 않는다).
#
# 하는 일:
#  - 계정·방화벽·감사 정책·ACL·Security 로그는 기존 모의를 그대로 쓴다(진짜 시스템을 읽지도 바꾸지도 않는다. 대체하지 않은 변경 명령은 호출되면 예외).
#  - 전용 계정으로 부르는 lsp-min-runner.ps1 만 가로챈다. 요청이 stub 모드일 때에 한해 **현재 사용자로** 진짜 러너(와 무해한 스텁 서버)를 띄운다.
#    semgrep-lsp 모드 요청은 예외로 막는다(실제 Semgrep 을 띄울 수 없다). 러너가 만든 프로세스 트리는 모의 CIM 이 진짜 표를 읽어(읽기 전용) 보여 주고,
#    소유 SID 만 모의 전용 계정의 값으로 바꿔 준다. 진짜 종료는 이 시험이 띄운 트리의 프로세스에만 한다.
#  - 시나리오 lsp 절의 손잡이(runner, loopbackHit, cancelFile, identity, resultEdit, stopProcessFails …)로 실패와 불일치를 주입한다.
# 운영 스크립트에는 이 파일을 읽는 곳이 없다.
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'MockSystem.ps1')

$Script:LspMockPrev = @{}
foreach ($n in 'Start-Process', 'Get-CimInstance', 'Invoke-CimMethod', 'Get-ProcessRecord', 'Get-Process', 'Stop-Process', 'Read-IsoJson') { $Script:LspMockPrev[$n] = (Get-Item "function:$n").ScriptBlock }
$Script:LspMockReal = @{ runnerPid = $null; child = $null; launched = (New-Object System.Collections.ArrayList) }
$Script:LspMockPrev['Get-WfpBlockEvents'] = (Get-Item 'function:Get-WfpBlockEvents').ScriptBlock
$Script:LspMockRealSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value

# 모의 전용 계정은 현재 사용자와 같은 SID 를 갖는다: 진짜 러너가 자기 SID 를 보고하므로, 이렇게 해야 신원 교차 확인이 정상 경로에서 성립한다.
function New-LocalUser {
    [CmdletBinding()] param([string]$Name, $Password, [string]$Description, [switch]$PasswordNeverExpires, [switch]$UserMayNotChangePassword, [switch]$AccountNeverExpires)
    Write-MockLog "New-LocalUser $Name"
    $Script:Fake.users[$Name] = [ordered]@{ Name = $Name; Enabled = $true; Description = $Description; Sid = $Script:LspMockRealSid; Groups = @() }
    Save-MockState
    New-MockUserObject $Script:Fake.users[$Name]
}

function Get-LspMockUserSid { $k = @($Script:Fake.users.Keys) | Select-Object -First 1; if ($null -eq $k) { return $Script:LspMockRealSid }; [string]$Script:Fake.users[$k].Sid }
function Get-LspMockUserName { $k = @($Script:Fake.users.Keys) | Select-Object -First 1; [string]$k }

# 이 시험이 띄운 러너 트리(러너 자신 + 후손)의 진짜 프로세스 행. 읽기 전용 조회. pid → CIM 행.
function Get-LspMockRealRows {
    $rows = @{}
    $root = $Script:LspMockReal.runnerPid
    if ($null -eq $root) { return $rows }
    $all = @(CimCmdlets\Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate)
    $byParent = @{}
    foreach ($p in $all) { $k = [int]$p.ParentProcessId; if (-not $byParent.ContainsKey($k)) { $byParent[$k] = New-Object System.Collections.ArrayList }; [void]$byParent[$k].Add($p) }
    foreach ($p in $all) { if ([int]$p.ProcessId -eq [int]$root) { $rows[[int]$p.ProcessId] = $p } }
    # 5157 이벤트 주입이 자식이 끝난 뒤에도 자식의 PID·시작 시각을 알 수 있게 마지막으로 본 자식을 기억해 둔다.
    # 러너의 직계 자식에는 콘솔 호스트(conhost.exe)도 있다: 이벤트 주입 대상은 스텁 서버(실행 파일이 PowerShell 5.1)다.
    foreach ($p in $all) { if ([int]$p.ParentProcessId -eq [int]$root -and [string]$p.ExecutablePath -ieq [string]$Script:Ps51) { $Script:LspMockReal.child = @{ processId = [int]$p.ProcessId; start = [DateTime]$p.CreationDate } } }
    $queue = New-Object System.Collections.Queue; $queue.Enqueue([int]$root)
    $seen = @{ ([int]$root) = $true }
    while ($queue.Count -gt 0) {
        $cur = [int]$queue.Dequeue()
        if (-not $byParent.ContainsKey($cur)) { continue }
        foreach ($c in $byParent[$cur]) { $cid = [int]$c.ProcessId; if ($seen.ContainsKey($cid)) { continue }; $seen[$cid] = $true; $rows[$cid] = $c; $queue.Enqueue($cid) }
    }
    $rows
}
function Get-LspMockRole { param([int]$ProcId, [int]$ParentPid) if ($ProcId -eq [int]$Script:LspMockReal.runnerPid) { return 'runner' }; if ($ParentPid -eq [int]$Script:LspMockReal.runnerPid) { return 'child' }; 'descendant' }
function Get-LspMockIdentity { param([string]$Role) $id = Get-MockKnob 'identity'; if ($null -ne $id -and [string]$id.role -eq $Role) { return $id }; $null }
function Convert-LspMockRow {
    param($Row)
    $role = Get-LspMockRole -ProcId ([int]$Row.ProcessId) -ParentPid ([int]$Row.ParentProcessId)
    $o = [pscustomobject]@{ ProcessId = [int]$Row.ProcessId; ParentProcessId = [int]$Row.ParentProcessId; ExecutablePath = [string]$Row.ExecutablePath; CommandLine = [string]$Row.CommandLine; CreationDate = [DateTime]$Row.CreationDate }
    $ov = Get-LspMockIdentity -Role $role
    if ($ov) {
        switch ([string]$ov.field) {
            'exePath' { $o.ExecutablePath = [string]$ov.value }
            'parentProcessId' { $o.ParentProcessId = [int]$ov.value }
            'commandLine' { $o.CommandLine = [string]$ov.value }
            'startShiftSec' { $o.CreationDate = $o.CreationDate.AddSeconds([double]$ov.value) }
        }
    }
    $o
}
function Get-LspMockOwnerSid { param([int]$ProcId, [int]$ParentPid) $role = Get-LspMockRole -ProcId $ProcId -ParentPid $ParentPid; $ov = Get-LspMockIdentity -Role $role; if ($ov -and [string]$ov.field -eq 'ownerSid') { return [string]$ov.value }; Get-LspMockUserSid }

function Get-CimInstance {
    [CmdletBinding()] param([string]$ClassName, [string]$Filter, [string[]]$Property, [int]$OperationTimeoutSec = 0)
    if ($ClassName -eq 'Win32_Process' -and $null -ne $Script:LspMockReal.runnerPid) {
        $rows = Get-LspMockRealRows
        $mine = $Filter -and ($Filter -match 'ProcessId=(\d+)')
        if ($mine) { $want = [int]$Matches[1]; if ($rows.ContainsKey($want)) { return (Convert-LspMockRow $rows[$want]) } }
        elseif (-not $Filter) {
            foreach ($k in $rows.Keys) { Convert-LspMockRow $rows[$k] }
            & $Script:LspMockPrev['Get-CimInstance'] -ClassName $ClassName
            return
        }
    }
    & $Script:LspMockPrev['Get-CimInstance'] -ClassName $ClassName -Filter $Filter -Property $Property
}
function Invoke-CimMethod {
    [CmdletBinding()] param($InputObject, [string]$MethodName, [int]$OperationTimeoutSec = 0)
    if ($MethodName -eq 'GetOwnerSid' -and $null -ne $Script:LspMockReal.runnerPid) {
        $k = [int]$InputObject.ProcessId
        $rows = Get-LspMockRealRows
        if ($rows.ContainsKey($k)) { return [pscustomobject]@{ ReturnValue = 0; Sid = (Get-LspMockOwnerSid -ProcId $k -ParentPid ([int]$rows[$k].ParentProcessId)) } }
    }
    & $Script:LspMockPrev['Invoke-CimMethod'] -InputObject $InputObject -MethodName $MethodName
}
function Get-ProcessRecord {
    param([Parameter(Mandatory)][int]$ProcessId, [Parameter(Mandatory)][string]$Role)
    $rows = Get-LspMockRealRows
    if ($rows.ContainsKey($ProcessId)) {
        $r = Convert-LspMockRow $rows[$ProcessId]
        return [ordered]@{ role = $Role; processId = $ProcessId; parentProcessId = [int]$r.ParentProcessId; exePath = [string]$r.ExecutablePath; startUtc = $r.CreationDate.ToUniversalTime().ToString('o'); endUtc = $null; ownerSid = (Get-LspMockOwnerSid -ProcId $ProcessId -ParentPid ([int]$r.ParentProcessId)); snapshotUtc = [DateTime]::UtcNow.ToString('o') }
    }
    & $Script:LspMockPrev['Get-ProcessRecord'] -ProcessId $ProcessId -Role $Role
}
function Get-Process {
    [CmdletBinding()] param([switch]$IncludeUserName, [int[]]$Id)
    & $Script:LspMockPrev['Get-Process'] @PSBoundParameters
    $rows = Get-LspMockRealRows
    foreach ($k in @($rows.Keys)) { if ($Id -and @($Id) -notcontains [int]$k) { continue }; [pscustomobject]@{ ProcessName = 'powershell'; Id = [int]$k; UserName = ('MOCK-PC\' + (Get-LspMockUserName)) } }
}
function Stop-Process {
    [CmdletBinding()] param([int]$Id, [switch]$Force)
    if (Get-MockKnob 'stopProcessFails' $false) { Write-MockLog "Stop-Process(no-op,injected) $Id"; return }
    $rows = Get-LspMockRealRows
    if ($rows.ContainsKey($Id)) {
        # 이 시험이 띄운 러너 트리 안의 프로세스만 진짜로 끝낸다(다른 어떤 프로세스에도 닿지 않는다).
        Write-MockLog "Stop-Process(real,tree) $Id"
        Microsoft.PowerShell.Management\Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
        return
    }
    & $Script:LspMockPrev['Stop-Process'] -Id $Id -Force:$Force
}

# 5157(WFP 차단) 이벤트: LSP 흐름의 기본은 이벤트 없음(empty). 손잡이 events = matching(러너 트리의 자식 PID 에 귀속되는 이벤트 1건) | unrelated(어느 프로세스에도 귀속 안 되는 1건) | readFail.
function Get-WfpBlockEvents {
    param([Parameter(Mandatory)][long]$AfterRecordId)
    $mode = [string](Get-MockKnob 'events' 'empty')
    if ($null -eq $Script:LspMockReal.runnerPid) { return (& $Script:LspMockPrev['Get-WfpBlockEvents'] -AfterRecordId $AfterRecordId) }
    if ($mode -eq 'readFail') { return [ordered]@{ ok = $false; error = 'mock: 이벤트를 읽을 수 없다'; events = @() } }
    $child = $Script:LspMockReal.child
    if ($mode -eq 'empty' -or $null -eq $child) { return [ordered]@{ ok = $true; error = $null; events = @() } }
    $pidForEvent = [int]$child.processId; if ($mode -eq 'unrelated') { $pidForEvent = 9999 }
    $nt = '\Device\HarddiskVolume3' + $Script:Ps51.Substring(2)
    $ev = @{ recordId = [long]1001; timeUtc = ([DateTime]$child.start).ToUniversalTime().AddMilliseconds(40); processId = $pidForEvent; processIdRaw = "$pidForEvent"; processIdFormat = 'decimal'; application = $nt; direction = 'Outbound'; destAddress = '192.0.2.1'; destPort = '9'; sourceAddress = '10.0.0.2'; protocol = '6'; filterRtid = '1' }
    [ordered]@{ ok = $true; error = $null; events = @($ev) }
}

# 결과 파일을 읽을 때만 손잡이 resultEdit 로 메모리상의 객체를 고친다(디스크의 원문은 그대로라 TS 재해석은 원문을 본다).
function Read-IsoJson {
    param([Parameter(Mandatory)][string]$Path)
    $o = & $Script:LspMockPrev['Read-IsoJson'] -Path $Path
    $edit = Get-MockKnob 'resultEdit'
    if ($edit -and (Split-Path -Leaf $Path) -eq 'lsp-min-result.json') {
        if ($edit.PSObject.Properties['set']) { foreach ($s in @($edit.set)) { Set-LspMockPath -Root $o -Path ([string]$s.path) -Value $s.value } }
        if ($edit.PSObject.Properties['unset']) { foreach ($u in @($edit.unset)) { Set-LspMockPath -Root $o -Path ([string]$u) -Remove } }
    }
    $o
}
function Set-LspMockPath {
    param($Root, [string]$Path, $Value, [switch]$Remove)
    $segs = $Path.Split('.'); $cur = $Root
    for ($i = 0; $i -lt $segs.Count - 1; $i++) { $cur = $cur.PSObject.Properties[$segs[$i]].Value }
    $leaf = $segs[$segs.Count - 1]
    if ($Remove) { [void]$cur.PSObject.Properties.Remove($leaf) } elseif ($cur.PSObject.Properties[$leaf]) { $cur.$leaf = $Value } else { $cur | Add-Member -NotePropertyName $leaf -NotePropertyValue $Value }
}

# ── 전용 계정 러너 가로채기 ──────────────────────────────────────────────────
function Start-Process {
    [CmdletBinding()]
    param([string]$FilePath, [object]$ArgumentList, $Credential, [string]$WorkingDirectory, [switch]$LoadUserProfile, [switch]$PassThru, [switch]$Wait, [string]$WindowStyle)
    $argv = @($ArgumentList | ForEach-Object { [string]$_ })
    if ($Credential -and ($argv -join ' ') -match 'lsp-min-runner\.ps1') { return (Invoke-MockLspRunner -FilePath $FilePath -ArgumentList $ArgumentList -Argv $argv -WorkingDirectory $WorkingDirectory) }
    & $Script:LspMockPrev['Start-Process'] @PSBoundParameters
}
function Invoke-MockLspRunner {
    param([string]$FilePath, [object]$ArgumentList, [string[]]$Argv, [string]$WorkingDirectory)
    $ri = [Array]::IndexOf($Argv, '-RequestFile'); $reqFile = $Argv[$ri + 1].Trim('"')
    $req = [IO.File]::ReadAllText($reqFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ([string]$req.mode -ne 'stub') { throw 'MOCK GUARD: 모의 시험은 stub 모드의 러너만 띄운다. 실제 Semgrep 은 어떤 경로로도 띄우지 않는다.' }
    $Script:MockLaunched = $true
    $kind = [string](Get-MockKnob 'runner' 'real')
    Write-MockLog "LspRunner kind=$kind"
    $dead = [pscustomobject]@{ Id = 1; HasExited = $true; ExitCode = 0 }
    switch ($kind) {
        'none' { return $dead }
        'corrupt' { [IO.File]::WriteAllText([string]$req.resultFile, '{not json', $Script:MockUtf8); return $dead }
        'stale' {
            $old = [ordered]@{ schema = 1; kind = 'lsp-min-runner-result'; runToken = 'lsp-20200101T000000Z-00000000-' + ('0' * 32); mode = 'stub'; startedUtc = '2020-01-01T00:00:00.0000000Z'; error = $null; refused = $null }
            Write-MockJson ([string]$req.resultFile) $old; return $dead
        }
        'hang-real' {
            # 무해한 정지 스텁: 요청도 중단 파일도 읽지 않는 진짜 프로세스(러너가 동기 호출에 매달린 상황). 감독 종료가 실제로 끝낼 수 있는지 본다.
            $p = Microsoft.PowerShell.Management\Start-Process -FilePath $FilePath -ArgumentList @('-NoProfile', '-NonInteractive', '-Command', ('"Start-Sleep -Seconds 600 # sandbox ' + $Script:MockSandbox + '"')) -PassThru -WindowStyle Hidden
        }
        default {
            $p = Microsoft.PowerShell.Management\Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Hidden
        }
    }
    $Script:LspMockReal.runnerPid = [int]$p.Id
    [void]$Script:LspMockReal.launched.Add([int]$p.Id)
    $hitKnob = Get-MockKnob 'loopbackHit' $false
    if ($hitKnob) {
        # 기본: 러너가 스텁 서버(자식)를 띄운 뒤에 연결한다(실행 도중의 적중). 'early': 러너가 시작하기도 전에 연결한다(관리자가 중단 파일을 먼저 만들어 러너가 시작을 거절하는 경로).
        if ([string]$hitKnob -ne 'early') {
            $pidFile = Join-Path ([string]$req.layout.stateDir) 'pid.txt'
            $until = [DateTime]::UtcNow.AddSeconds(30)
            while (-not (Test-Path -LiteralPath $pidFile) -and [DateTime]::UtcNow -lt $until) { Microsoft.PowerShell.Utility\Start-Sleep -Milliseconds 100 }
        }
        $port = [int](([string]$req.env.SEMGREP_APP_URL) -replace '^.*:', '')
        try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $port); $c.Close() } catch { Write-MockLog "loopbackHit connect failed: $($_.Exception.Message)" }
    }
    $cf = Get-MockKnob 'cancelFile'
    if ($cf) { [IO.File]::WriteAllText([string]$cf, 'cancel', $Script:MockUtf8) }
    $p
}
