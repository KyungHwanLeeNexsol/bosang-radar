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
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    if (Get-MockKnob 'abortWriteFails' $false) { Write-MockLog "Write-LspMinAbortFile(injected failure) $Text"; return [ordered]@{ ok = $false; error = 'mock: 중단 파일을 쓸 수 없다' } }
    Write-MockLog "Write-LspMinAbortFile $Text"
    & $Script:LspPortPrev['Write-LspMinAbortFile'] -Path $Path -Text $Text
}
function Invoke-LspMinReinterpret {
    param([Parameter(Mandatory)][string]$TsxCmd, [string]$NodeDir, [Parameter(Mandatory)][string]$CliTs, [Parameter(Mandatory)][string]$RunnerResultPath, [Parameter(Mandatory)][string]$ContextPath, [Parameter(Mandatory)][string]$OutPath)
    if ([string](Get-MockKnob 'reinterpret' 'real') -eq 'fail') { return [ordered]@{ ran = $true; exitCode = 3; output = 'mock: 재해석 도구 실패'; error = $null } }
    & $Script:LspPortPrev['Invoke-LspMinReinterpret'] -TsxCmd $TsxCmd -NodeDir $NodeDir -CliTs $CliTs -RunnerResultPath $RunnerResultPath -ContextPath $ContextPath -OutPath $OutPath
}
