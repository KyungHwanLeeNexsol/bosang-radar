# 전용 계정으로 실행되는 무해한 프로브(자식). TCP 연결 시도만 하고 결과를 JSON 파일로 남긴다.
# semgrep·semgrep-core·규칙·대상 코드와 아무 관련이 없다. Windows PowerShell 5.1 에서 돈다.
# 이 프로세스의 PID·시작 시각·실행 파일 경로·계정 SID 를 스스로 기록한다(실행기는 별도로 CIM 으로 같은 값을 기록해 교차 확인한다).
# RunToken: 이번 실행을 가리키는 값. 대상 파일의 토큰과 다르면 연결을 시도하지 않고, 결과 파일에 같은 토큰을 적는다
#           (실행기는 토큰이 다른 파일을 이번 실행의 결과로 받지 않는다. 서명이나 출처 인증이 아니라 이전 실행의 파일과 구분하기 위한 값이다).
param(
    [Parameter(Mandatory)][string]$Dir,
    [Parameter(Mandatory)][string]$TargetsFile,
    [Parameter(Mandatory)][string]$RunToken,
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

# 최상위를 객체({ runToken, targets: [...] })로 쓴다: 5.1 은 @(… | ConvertFrom-Json) 이 최상위 배열을 한 겹 더 감싸 항목마다 반복하는 코드가 깨진다.
$cfg = Get-Content -Raw -LiteralPath $TargetsFile | ConvertFrom-Json
$attempts = @()
if ([string]$cfg.runToken -eq $RunToken) {
    foreach ($t in @($cfg.targets)) {
        $attempts += , (Test-TcpConnect -Name $t.name -Address $t.address -Port ([int]$t.port) -TimeoutMs ($TimeoutSec * 1000))
    }
}
$result = [ordered]@{ runToken = $RunToken; self = $self; endUtc = [DateTime]::UtcNow.ToString('o'); attempts = $attempts }
[IO.File]::WriteAllText((Join-Path $Dir $ResultFile), ($result | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
