<#
.SYNOPSIS
  lsp-min-runner.ps1 의 동작(표준 입력 송신, 응답 처리, 중단, 종료 정책, 정리)을 확인하는 무해한 스텁 서버. 실제 Semgrep 이 아니다.
.DESCRIPTION
  고정된 시나리오 이름만 받는다(lsp-min-runner.ps1 이 같은 목록으로 한 번 더 거른다). 네트워크·계정/방화벽 접근이 없다.
  하는 일은 표준 입출력과, 작업 폴더(cwd) 안의 기록 파일 쓰기(받은 메서드 `received.log`, `pid.txt`, `env.json`)와
  시나리오가 정한 시험용 파일 하나(`../ws/x.txt`)뿐이다. 서버 버전 자리에 찍는 값은 실제 도구와 헷갈리지 않도록 항상 9.9.9 이다.
  어떤 시나리오도 스스로 60초 안에 끝난다(정리가 실패해도 오래 남지 않는다).
    ok               유효한 initialize 응답, exit 를 받으면 종료 0, EOF 에도 종료
    error            initialize 에 JSON-RPC error 로 응답
    initialize-error 오류 로그 알림 뒤 result 에 {retry:false} 를 담아 응답(공개 소스가 초기화 예외 때 보내는 모양)
    wrong-id         id 가 다른 응답
    split            응답을 한 바이트씩 나눠 보낸다
    silent           응답하지 않는다(EOF 에는 종료)
    silent-hold      응답하지 않고 EOF 도 무시한다(죽지 않는 서버)
    ignore-exit      유효한 응답 뒤 exit 를 무시한다(EOF 에는 종료)
    ignore-exit-eof  유효한 응답 뒤 exit 도 EOF 도 무시한다
    exit-early       응답 없이 곧바로 종료 코드 3 으로 끝난다
    garbage          깨진 프레임을 보낸다
    server-request   응답 전에 서버 요청과 알림을 보낸다(답하지 않아야 한다)
    stderr-scan      응답하지 않고 0.3초 뒤 stderr 에 'Refreshing rules'
    stderr-split     응답하지 않고 stderr 에 'Refre' 와 'shing rules' 를 나눠 보낸다
    stderr-download  응답하지 않고 stderr 에 download 문구
    publish          응답하지 않고 0.3초 뒤 stdout 에 publishDiagnostics 알림
    write-ws         응답하지 않고 0.3초 뒤 작업 영역(../ws)에 파일을 쓴다
    flood-out        응답하지 않고 stdout 에 작은 알림을 450개 보낸다(합계가 상한을 넘는다. 프레임 하나가 한도를 넘는 경우와 구분된다)
    flood-err        응답하지 않고 stderr 에 상한을 넘는 출력
    orphan           유효한 응답 뒤 exit 를 받으면 자손을 남기고 종료 0
    env-names        받은 환경변수 이름과 일부 값을 env.json 에 적고 정상 응답
    spawn-disallowed 응답하지 않고 0.3초 뒤 허용 목록에 없는 이미지(ping.exe)를 자손으로 띄운다
    id-case          유효한 응답이지만 키 이름이 `Id`(대문자 I)다. JSON-RPC는 키 이름의 대소문자를 구분하므로 id 가 없는 메시지다
    jsonrpc-case     유효한 응답이지만 키 이름이 `JSONRPC`다. `jsonrpc` 필드가 없는 깨진 프레임이다
    method-case      유효한 응답에 모르는 멤버 `Method`가 더 붙어 있다. `method`가 아니므로 응답으로 읽혀야 한다
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Scenario)
$ErrorActionPreference = 'Stop'
$allowed = @('ok', 'error', 'initialize-error', 'wrong-id', 'split', 'silent', 'silent-hold', 'ignore-exit', 'ignore-exit-eof', 'exit-early', 'garbage', 'server-request', 'stderr-scan', 'stderr-split', 'stderr-download', 'publish', 'write-ws', 'flood-out', 'flood-err', 'orphan', 'env-names', 'spawn-disallowed', 'id-case', 'jsonrpc-case', 'method-case')
if ($allowed -notcontains $Scenario) { exit 9 }

$clock = [Diagnostics.Stopwatch]::StartNew()
$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()
$stderr = [Console]::OpenStandardError()
$Script:Cwd = (Get-Location).Path

function Write-Rec([string]$Name, [string]$Text) { [IO.File]::AppendAllText((Join-Path $Script:Cwd $Name), $Text, (New-Object Text.UTF8Encoding($false))) }
function Write-Bytes($Stream, [byte[]]$Bytes) { $Stream.Write($Bytes, 0, $Bytes.Length); $Stream.Flush() }
function Get-Frame($Object) {
    $body = [Text.Encoding]::UTF8.GetBytes(($Object | ConvertTo-Json -Depth 10 -Compress))
    $head = [Text.Encoding]::ASCII.GetBytes("Content-Length: $($body.Length)`r`n`r`n")
    $all = New-Object byte[] ($head.Length + $body.Length)
    [Array]::Copy($head, 0, $all, 0, $head.Length); [Array]::Copy($body, 0, $all, $head.Length, $body.Length)
    , $all
}
function Send-Msg($Object) { Write-Bytes $stdout (Get-Frame $Object) }
function Get-GoodResult { [ordered]@{ capabilities = [ordered]@{ textDocumentSync = 1 }; serverInfo = [ordered]@{ name = 'Semgrep'; version = '9.9.9' } } }

# 부모의 표준 핸들을 그대로 물려받는 자손(파이프 EOF 가 늦어지는 상황과 자손 정리를 확인하려고). 91초 뒤 스스로 끝난다.
function Start-Holder {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
    $psi.Arguments = '-NoProfile -NonInteractive -Command Start-Sleep -Seconds 91'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    [void][Diagnostics.Process]::Start($psi)
}

# 허용 목록에 없는 이미지(ping.exe, 약 8초 뒤 스스로 끝난다)를 자손으로 띄운다. 러너의 A4 가 이를 보고 중단하는지 확인하는 용도다.
function Start-Disallowed {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = (Join-Path $env:SystemRoot 'System32\PING.EXE')
    $psi.Arguments = '-n 8 127.0.0.1'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    [void][Diagnostics.Process]::Start($psi)
}

Write-Rec 'pid.txt' ([string]$PID)
if ($Scenario -eq 'env-names') {
    $vals = [ordered]@{}; foreach ($n in 'PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'SEMGREP_APP_URL') { $vals[$n] = [Environment]::GetEnvironmentVariable($n) }
    $homeIsDir = $false; if ($env:USERPROFILE) { $homeIsDir = Test-Path -LiteralPath $env:USERPROFILE -PathType Container }
    Write-Rec 'env.json' (([ordered]@{ names = @([Environment]::GetEnvironmentVariables().Keys | Sort-Object); values = $vals; homeIsDir = $homeIsDir; cwd = $Script:Cwd } | ConvertTo-Json -Depth 5 -Compress))
}

# 응답하지 않는 시나리오와 그 시간표(밀리초 → 동작)
$silentFamily = @('silent', 'silent-hold', 'stderr-scan', 'stderr-split', 'stderr-download', 'publish', 'write-ws', 'flood-out', 'flood-err', 'spawn-disallowed')
$ignoreEof = @('silent-hold', 'ignore-exit-eof') -contains $Scenario
$ignoreExit = @('ignore-exit', 'ignore-exit-eof') -contains $Scenario
$timeline = New-Object System.Collections.ArrayList
function Add-Event([int]$At, [scriptblock]$Do) { [void]$timeline.Add(@{ at = $At; do = $Do; done = $false }) }
switch ($Scenario) {
    'stderr-scan' { Add-Event 300 { Write-Bytes $stderr ([Text.Encoding]::UTF8.GetBytes("[00.04][INFO](default): Refreshing rules`n")) } }
    'stderr-split' { Add-Event 300 { Write-Bytes $stderr ([Text.Encoding]::UTF8.GetBytes('[00.04][INFO](default): Refre')) }; Add-Event 600 { Write-Bytes $stderr ([Text.Encoding]::UTF8.GetBytes("shing rules`n")) } }
    'stderr-download' { Add-Event 300 { Write-Bytes $stderr ([Text.Encoding]::UTF8.GetBytes("[00.04][INFO](default): Downloading rules`n")) } }
    'publish' { Add-Event 300 { Send-Msg ([ordered]@{ jsonrpc = '2.0'; method = 'textDocument/publishDiagnostics'; params = [ordered]@{} }) } }
    'write-ws' { Add-Event 300 { [IO.File]::WriteAllText((Join-Path (Split-Path -Parent $Script:Cwd) 'ws\x.txt'), 'x') } }
    'flood-out' { Add-Event 300 { $chunk = ('a' * 3000); for ($i = 0; $i -lt 450; $i++) { Send-Msg ([ordered]@{ jsonrpc = '2.0'; method = 'x/flood'; params = $chunk }) } } }
    'flood-err' { Add-Event 300 { Write-Bytes $stderr ([byte[]](, 0x61 * 300000)) } }
    'spawn-disallowed' { Add-Event 300 { Start-Disallowed } }
}

function Invoke-OnMessage($Msg) {
    Write-Rec 'received.log' ("$($Msg.method)`n")
    switch ([string]$Msg.method) {
        'initialize' {
            if ($silentFamily -contains $Scenario) { return }
            switch ($Scenario) {
                'exit-early' { exit 3 }
                'error' { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; error = [ordered]@{ code = -32602; message = 'stub invalid params' } }) }
                'initialize-error' {
                    Send-Msg ([ordered]@{ jsonrpc = '2.0'; method = 'window/logMessage'; params = [ordered]@{ type = 1; message = 'Error initializing server' } })
                    Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = [ordered]@{ retry = $false } })
                }
                'wrong-id' { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = 'other'; result = (Get-GoodResult) }) }
                'id-case' { Send-Msg ([ordered]@{ jsonrpc = '2.0'; Id = $Msg.id; result = (Get-GoodResult) }) }
                'jsonrpc-case' { Send-Msg ([ordered]@{ JSONRPC = '2.0'; id = $Msg.id; result = (Get-GoodResult) }) }
                'method-case' { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; Method = 'x/not-a-method-member'; result = (Get-GoodResult) }) }
                'garbage' { Write-Bytes $stdout ([Text.Encoding]::ASCII.GetBytes("garbage`r`n`r`n")) }
                'server-request' {
                    Send-Msg ([ordered]@{ jsonrpc = '2.0'; method = 'window/logMessage'; params = [ordered]@{ type = 3; message = 'hello' } })
                    Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = 7; method = 'client/registerCapability'; params = [ordered]@{} })
                    Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult) })
                }
                'split' {
                    foreach ($b in (Get-Frame ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult) }))) { Write-Bytes $stdout ([byte[]]@($b)); Start-Sleep -Milliseconds 2 }
                }
                default { Send-Msg ([ordered]@{ jsonrpc = '2.0'; id = $Msg.id; result = (Get-GoodResult) }) }
            }
        }
        'exit' {
            if ($ignoreExit) { return }
            if ($Scenario -eq 'orphan') { Start-Holder }
            exit 0
        }
    }
}

# 표준 입력을 비동기로 읽으며 시간표를 돌린다. 프레임은 Content-Length 헤더로 나눈다.
$acc = New-Object IO.MemoryStream
$readBuf = New-Object byte[] 65536
$ar = $stdin.BeginRead($readBuf, 0, $readBuf.Length, $null, $null)
$eof = $false
while ($clock.ElapsedMilliseconds -lt 60000) {
    foreach ($ev in $timeline) { if (-not $ev.done -and $clock.ElapsedMilliseconds -ge $ev.at) { $ev.done = $true; & $ev.do } }
    if (-not $eof -and $ar.IsCompleted) {
        $n = $stdin.EndRead($ar)
        if ($n -le 0) {
            $eof = $true
            Write-Rec 'received.log' "<stdin-end>`n"
            if (-not $ignoreEof) { exit 0 }
        } else {
            $acc.Write($readBuf, 0, $n)
            $ar = $stdin.BeginRead($readBuf, 0, $readBuf.Length, $null, $null)
            while ($true) {
                $bytes = $acc.ToArray()
                $text = [Text.Encoding]::GetEncoding('latin1').GetString($bytes)
                $end = $text.IndexOf("`r`n`r`n")
                if ($end -lt 0) { break }
                $m = [regex]::Match($text.Substring(0, $end), 'Content-Length:\s*(\d+)')
                if (-not $m.Success) { break }
                $len = [int]$m.Groups[1].Value
                if ($bytes.Length -lt $end + 4 + $len) { break }
                $json = [Text.Encoding]::UTF8.GetString($bytes, $end + 4, $len)
                $acc = New-Object IO.MemoryStream
                $rest = $bytes.Length - ($end + 4 + $len)
                if ($rest -gt 0) { $acc.Write($bytes, $end + 4 + $len, $rest) }
                Invoke-OnMessage ($json | ConvertFrom-Json)
            }
        }
    }
    Start-Sleep -Milliseconds 10
}
exit 0
