# 전용 계정으로 실행되는 무해한 프로브(자식). TCP 연결 시도만 하고 결과를 JSON 파일로 남긴다.
# semgrep·semgrep-core·규칙·대상 코드와 아무 관련이 없다. Windows PowerShell 5.1 에서 돈다.
# 이 프로세스의 PID·시작 시각·실행 파일 경로·계정 SID 를 스스로 기록한다(실행기는 별도로 CIM 으로 같은 값을 기록해 교차 확인한다).
param(
    [Parameter(Mandatory)][string]$Dir,
    [Parameter(Mandatory)][string]$TargetsFile,
    [string]$ResultFile = 'child-result.json',
    [int]$HoldSeconds = 3,
    [int]$TimeoutSec = 3
)
$ErrorActionPreference = 'Stop'
$me = Get-Process -Id $PID
$self = [ordered]@{
    pid      = $PID
    startUtc = $me.StartTime.ToUniversalTime().ToString('o')
    exePath  = $me.Path
    sid      = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
}
# 실행기가 이 프로세스를 CIM 으로 기록할 시간을 준다.
if ($HoldSeconds -gt 0) { Start-Sleep -Seconds $HoldSeconds }

function Test-TcpConnect {
    param([string]$Name, [string]$Address, [int]$Port, [int]$TimeoutMs)
    $start = [DateTime]::UtcNow
    $outcome = 'exception'
    $detail = $null
    $c = New-Object Net.Sockets.TcpClient
    try {
        $ar = $c.BeginConnect($Address, $Port, $null, $null)
        if (-not $ar.AsyncWaitHandle.WaitOne($TimeoutMs)) {
            $outcome = 'timeout'
        } else {
            try { $c.EndConnect($ar); $outcome = 'connected' }
            catch [Net.Sockets.SocketException] { $outcome = 'socket-error'; $detail = $_.Exception.SocketErrorCode.ToString() }
        }
    } catch {
        $outcome = 'exception'
        $detail = $_.Exception.GetType().Name + ': ' + $_.Exception.Message
    } finally {
        $c.Close()
    }
    [ordered]@{ name = $Name; address = $Address; port = $Port; startUtc = $start.ToString('o'); endUtc = [DateTime]::UtcNow.ToString('o'); outcome = $outcome; detail = $detail }
}

$targets = @(Get-Content -Raw -LiteralPath $TargetsFile | ConvertFrom-Json)
$attempts = @()
foreach ($t in $targets) {
    $attempts += , (Test-TcpConnect -Name $t.name -Address $t.address -Port ([int]$t.port) -TimeoutMs ($TimeoutSec * 1000))
}
$result = [ordered]@{ self = $self; endUtc = [DateTime]::UtcNow.ToString('o'); attempts = $attempts }
[IO.File]::WriteAllText((Join-Path $Dir $ResultFile), ($result | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
