<#
.SYNOPSIS
  version-runner.ps1 의 제한·정리 동작을 확인하는 무해한 스텁. 네트워크·파일 쓰기·계정/방화벽 접근이 없다.
.DESCRIPTION
  고정된 시나리오 이름만 받는다(version-runner.ps1 이 같은 목록으로 한 번 더 거른다). 버전 자리에 찍는 값은 실제 도구와 헷갈리지 않도록 항상 0.0.0 이다.
  오래 도는 시나리오도 스스로 90초 안에 끝난다(정리가 실패해도 무한히 남지 않는다).
    ok         0.0.0 + CRLF, 종료 0                    ok-stderr  stderr 에 경고, stdout 0.0.0, 종료 0
    nonzero    stdout 0.0.0, 종료 3                    multiline  두 줄
    bom        UTF-8 BOM + 0.0.0                       prefixed   v0.0.0
    sleep      자손 하나를 띄우고 90초 대기(시간 제한 확인)  flood-out  stdout 에 10000바이트 뒤 대기(출력 한도 확인)
    flood-err  stderr 에 40000바이트 뒤 대기             orphan     자손을 남기고 0.0.0 을 찍은 뒤 바로 종료
    env-names  받은 환경변수 이름만 나열(값은 찍지 않는다)  cwd        현재 작업 폴더
    home       받은 USERPROFILE 값 한 줄(경로만. 다른 환경변수 값은 찍지 않는다)
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Scenario)
$ErrorActionPreference = 'Stop'
$allowed = @('ok', 'ok-stderr', 'nonzero', 'multiline', 'bom', 'prefixed', 'sleep', 'flood-out', 'flood-err', 'orphan', 'env-names', 'cwd', 'home')
if ($allowed -notcontains $Scenario) { exit 9 }

function Write-OutBytes([byte[]]$Bytes) { $o = [Console]::OpenStandardOutput(); $o.Write($Bytes, 0, $Bytes.Length); $o.Flush() }
function Write-ErrBytes([byte[]]$Bytes) { $o = [Console]::OpenStandardError(); $o.Write($Bytes, 0, $Bytes.Length); $o.Flush() }
function Get-Ascii([string]$Text) { [Text.Encoding]::ASCII.GetBytes($Text) }

# 부모의 표준 핸들을 그대로 물려받는 자손(파이프 EOF 가 늦어지는 상황과 자손 정리를 확인하려고). 90초 뒤 스스로 끝난다.
function Start-Sleeper {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')      # 실행기는 자식에게 SYSTEMROOT 만 준다(WINDIR 는 없다)
    $psi.Arguments = '-NoProfile -NonInteractive -Command Start-Sleep -Seconds 90'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    [void][Diagnostics.Process]::Start($psi)
}

switch ($Scenario) {
    'ok' { Write-OutBytes (Get-Ascii "0.0.0`r`n") }
    'ok-stderr' { Write-ErrBytes (Get-Ascii "stub warning`r`n"); Write-OutBytes (Get-Ascii "0.0.0`n") }
    'nonzero' { Write-OutBytes (Get-Ascii "0.0.0`n"); exit 3 }
    'multiline' { Write-OutBytes (Get-Ascii "0.0.0`n0.0.0`n") }
    'bom' { Write-OutBytes ([byte[]](0xEF, 0xBB, 0xBF) + (Get-Ascii "0.0.0`n")) }
    'prefixed' { Write-OutBytes (Get-Ascii "v0.0.0`n") }
    'sleep' { Start-Sleeper; Start-Sleep -Seconds 90 }
    'flood-out' { Write-OutBytes ([byte[]](, 0x61 * 10000)); Start-Sleep -Seconds 60 }
    'flood-err' { Write-ErrBytes ([byte[]](, 0x61 * 40000)); Write-OutBytes (Get-Ascii "0.0.0`n"); Start-Sleep -Seconds 60 }
    'orphan' { Start-Sleeper; Write-OutBytes (Get-Ascii "0.0.0`n") }
    'env-names' { Write-OutBytes (Get-Ascii ((([Environment]::GetEnvironmentVariables().Keys | Sort-Object) -join ',') + "`n")) }
    'cwd' { Write-OutBytes ([Text.Encoding]::UTF8.GetBytes(((Get-Location).Path) + "`n")) }
    'home' { Write-OutBytes ([Text.Encoding]::UTF8.GetBytes(([string]$env:USERPROFILE) + "`n")) }
}
exit 0
