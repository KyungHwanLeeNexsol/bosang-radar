# LSP-MIN-1 관리자 진입점의 포트(LspMinAdminPorts.ps1) 중 실패를 주입해야 하는 것만 대체한다. MockSystemLsp.ps1 이 먼저 읽힌 뒤에 읽힌다.
# 기본 동작은 진짜 포트(루프백 수신기·중단 파일·진짜 재해석 도구)를 그대로 쓴다.
Set-StrictMode -Version 2.0
$Script:LspPortPrev = @{}
foreach ($n in 'New-LspMinReceiver', 'Read-LspMinReceiver', 'Write-LspMinAbortFile', 'Invoke-LspMinReinterpret') { $Script:LspPortPrev[$n] = (Get-Item "function:$n").ScriptBlock }
$Script:LspPortReadCalls = 0

function New-LspMinReceiver {
    if (Get-MockKnob 'receiverNotReady' $false) { Write-MockLog 'New-LspMinReceiver(injected failure)'; throw 'mock: 수신기를 열 수 없다' }
    & $Script:LspPortPrev['New-LspMinReceiver']
}
function Read-LspMinReceiver {
    param([Parameter(Mandatory)]$Receiver)
    $Script:LspPortReadCalls++
    $after = Get-MockKnob 'receiverFailAfter'
    if ($null -ne $after -and $Script:LspPortReadCalls -gt [int]$after) {
        $Receiver.samples++; $Receiver.failures++; $Receiver.lastError = 'mock: 수신기 읽기 실패'
        return [ordered]@{ ok = $false; newHits = 0; error = $Receiver.lastError }
    }
    & $Script:LspPortPrev['Read-LspMinReceiver'] -Receiver $Receiver
}
function Write-LspMinAbortFile {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text, [string]$TrustedRoot)
    if (Get-MockKnob 'abortWriteFails' $false) { Write-MockLog "Write-LspMinAbortFile(injected failure) $Text"; return [ordered]@{ ok = $false; error = 'mock: 중단 파일을 쓸 수 없다' } }
    Write-MockLog "Write-LspMinAbortFile $Text"
    & $Script:LspPortPrev['Write-LspMinAbortFile'] -Path $Path -Text $Text -TrustedRoot $TrustedRoot
}
function Invoke-LspMinReinterpret {
    param([Parameter(Mandatory)][string]$TsxCmd, [string]$NodeDir, [Parameter(Mandatory)][string]$CliTs, [Parameter(Mandatory)][string]$RunnerResultPath, [Parameter(Mandatory)][string]$ContextPath, [Parameter(Mandatory)][string]$OutPath, [string]$CancelFile)
    $mode = [string](Get-MockKnob 'reinterpret' 'real')
    if ($mode -eq 'fail') { return [ordered]@{ ran = $true; exitCode = 3; output = 'mock: 재해석 도구 실패'; error = $null } }
    # 'hold-pipe': 진짜 포트를 무해한 스텁 도구로 돌린다(스텁 도구는 곧바로 끝나고 후손이 출력 파이프를 몇 초 붙잡는다). 마감을 짧게 줘서 PIPE_NOT_CLOSED 와 후손 정리를 진짜 프로세스로 확인한다.
    if ($mode -eq 'hold-pipe') {
        $stub = Join-Path $Script:MockSandbox 'fake tool\fake-tsx.cmd'
        Write-MockLog "Invoke-LspMinReinterpret(hold-pipe stub) $stub"
        return (& $Script:LspPortPrev['Invoke-LspMinReinterpret'] -TsxCmd $stub -NodeDir $null -CliTs $CliTs -RunnerResultPath $RunnerResultPath -ContextPath $ContextPath -OutPath $OutPath -TimeoutMs 700 -KillConfirmMs 5000)
    }
    # 'cleanup-fail': 도구 자체는 정상 종료처럼 보이지만 뒤처리에서 남은 프로세스를 확인했다고 가정한 합성 결과(진짜 도구를 부르지 않는다).
    if ($mode -eq 'cleanup-fail') {
        return [ordered]@{ ran = $true; exitCode = 3; output = 'mock: 합성 결과'; error = $null; exited = $true; stdoutClosed = $true; stderrClosed = $true; truncated = $false; elapsedMs = 5; totalMs = 6
            cleanup = [ordered]@{ attempted = $true; ok = $false; outcome = 'FAILED'; jobActiveBefore = 1; jobActiveAfter = 1; readTasksPending = 0; error = 'PROCESSES_REMAIN: 1 (mock)' } }
    }
    & $Script:LspPortPrev['Invoke-LspMinReinterpret'] -TsxCmd $TsxCmd -NodeDir $NodeDir -CliTs $CliTs -RunnerResultPath $RunnerResultPath -ContextPath $ContextPath -OutPath $OutPath -CancelFile $CancelFile
}
