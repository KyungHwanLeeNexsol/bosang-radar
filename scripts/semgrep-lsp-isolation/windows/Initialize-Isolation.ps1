<#
.SYNOPSIS
  전용 비관리자 계정, 그 계정에만 걸리는 아웃바운드 차단 규칙, (선택) 경로 읽기·실행 권한을 만든다.
.DESCRIPTION
  기본은 계획만 출력한다(dry-run). 실제로 만들려면 -Apply 와 사전 점검의 -ConfirmSnapshot 이 모두 필요하다.
  만드는 것(모두 RunId 로 만든 고유 이름, 설명에 표식 bosang-semgrep-iso:<RunId>):
    1) 로컬 계정 bsi<8hex>  — Users 그룹만. 무작위 암호는 이 폴더의 credential.dpapi 에 현재 사용자 DPAPI 로만 보관. 만든 직후 비활성화한다.
    2) 작업 폴더 %ProgramData%\bosang-semgrep-iso\<RunId>  — SYSTEM·Administrators 전체, 새 계정 수정 권한(상속 끊음)
    3) (선택 -GrantReadExecute) 지정한 경로에 새 계정 SID 한 건의 읽기·실행 ACE
    4) 방화벽 규칙 bosang-semgrep-iso-<RunId>-out  — 아웃바운드 Block, LocalUser 조건 = 새 계정 SID. 꺼진 채로 만들어 범위를 다시 읽어 확인한 뒤 켠다.
  바꾸지 않는 것: 기존 계정·기존 방화벽 규칙·프로필 기본 정책·감사 정책(감사는 Test-IsolationEffect.ps1 이 실행 시간 동안만 켰다 끈다).
  실패하면 이 실행이 만든 것만 되돌린다(종료 코드 20, 되돌림도 불완전하면 21). 거부는 30.
  본문은 IsolationFlows.ps1 의 Invoke-IsoApply 에 있다.
.EXAMPLE
  .\Initialize-Isolation.ps1 -PreflightDir <RunDir>                              # 계획만 출력
  .\Initialize-Isolation.ps1 -PreflightDir <RunDir> -ConfirmSnapshot <12자리> -Apply -GrantReadExecute <venv>,<Python 폴더>
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PreflightDir,
    [string]$ConfirmSnapshot,
    [switch]$Apply,
    [string[]]$GrantReadExecute = @(),
    [ValidateSet('NonLoopback', 'Any')][string]$RemoteScope = 'NonLoopback'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
. (Join-Path $PSScriptRoot 'IsolationFlows.ps1')
$r = @(Invoke-IsoApply -PreflightDir $PreflightDir -ConfirmSnapshot $ConfirmSnapshot -Apply ([bool]$Apply) -GrantReadExecute $GrantReadExecute -RemoteScope $RemoteScope)[-1]
exit $r.exitCode
