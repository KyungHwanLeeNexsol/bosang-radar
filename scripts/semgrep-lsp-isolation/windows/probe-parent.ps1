# 전용 계정으로 실행되는 무해한 프로브(부모). 자식 프로브(probe-child.ps1)를 띄우고 끝나길 기다린다.
# 부모→자식 관계에서도 같은 계정 범위의 차단이 적용되는지 보기 위한 것이다. semgrep 과 아무 관련이 없다.
# RunToken: 이번 실행을 가리키는 값. 쓰는 모든 파일에 같은 값을 적고 자식에게도 넘긴다(이전 실행의 파일과 구분하기 위한 값이며 서명이 아니다).
param(
    [Parameter(Mandatory)][string]$Dir,
    [Parameter(Mandatory)][string]$TargetsFile,
    [Parameter(Mandatory)][string]$RunToken,
    [int]$HoldSeconds = 3,
    [int]$TimeoutSec = 3
)
$ErrorActionPreference = 'Stop'
function Write-Json([string]$Name, $Obj) {
    [IO.File]::WriteAllText((Join-Path $Dir $Name), ($Obj | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
}
$me = Get-Process -Id $PID
Write-Json 'parent-self.json' ([ordered]@{
        runToken = $RunToken
        pid      = $PID
        startUtc = $me.StartTime.ToUniversalTime().ToString('o')
        exePath  = $me.Path
        sid      = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    })

$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$childArgs = @(
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f (Join-Path $Dir 'probe-child.ps1')),
    '-Dir', ('"{0}"' -f $Dir),
    '-TargetsFile', ('"{0}"' -f $TargetsFile),
    '-RunToken', $RunToken,
    '-ResultFile', 'child-result.json',
    '-HoldSeconds', $HoldSeconds,
    '-TimeoutSec', $TimeoutSec
)
$child = Start-Process -FilePath $ps -ArgumentList $childArgs -PassThru -WindowStyle Hidden
Write-Json 'parent-child.json' ([ordered]@{ runToken = $RunToken; childPid = $child.Id })
$child.WaitForExit()
Write-Json 'parent-done.json' ([ordered]@{ runToken = $RunToken; endUtc = [DateTime]::UtcNow.ToString('o'); childExitCode = $child.ExitCode })
