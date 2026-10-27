<#
.SYNOPSIS
  Initialize-Isolation.ps1 / Test-IsolationEffect.ps1 이 만든 것만 되돌린다. 정상 종료·실패·중단 어느 경우에도 쓴다.
.DESCRIPTION
  기본은 dry-run(지울 것을 출력만 한다). 실제로 지우려면 -Apply.
  복구 대상 = 실행 기록(resources.json)에 적힌 자원, 또는 -RunId 로 이름이 정해지는 자원. 지우기 전에 각각 소유 확인을 한다:
    - 방화벽 규칙: 이름 + Group + 설명 표식(bosang-semgrep-iso:<RunId>)이 모두 맞아야 한다.
    - 계정: 이름 + 설명 표식 + (기록돼 있으면) SID 가 맞아야 한다.
    - 작업 폴더: %ProgramData%\bosang-semgrep-iso 아래이고 .owner 파일 내용이 표식과 같아야 한다.
    - ACL: 기록된 계정 SID 의 ACE 만 제거한다(다른 ACE 는 그대로).
    - 감사 정책: 우리가 설정한 값(set)일 때만 원래 값(original)으로 되돌린다. 그 사이에 다른 값이 되었으면 건드리지 않고 DRIFT 로 보고한다.
  하나라도 소유 확인에 실패하면 그 자원은 건드리지 않고 REFUSED_NOT_OURS 로 남긴다. 지울 것이 이미 없으면 SKIPPED_ABSENT.
  결과는 구분해서 기록한다: OK(실제로 읽어 확인한 복구) / ALREADY_RESTORED(읽어 보니 이미 원래 값) / FAILED(읽기 실패·설정 실패·확인 실패) /
  DRIFT_NOT_RESTORED / REFUSED_NOT_OURS / SKIPPED_ABSENT / DRYRUN. 되돌렸는지 읽어서 확인하기 전에는 OK 로 쓰지 않는다.
  순서: 계정 사용 중지·남은 프로세스 종료 → 감사 → 방화벽 규칙 → ACL → 계정(+선택 프로필) → 작업 폴더 → 암호 파일. 한 항목이 실패해도 나머지는 계속한다.
  종료 코드: 0 정상 / 30 거부 / 40 건드리지 않았거나 실패한 항목이 있다.
  본문은 IsolationFlows.ps1 의 Invoke-IsoRecover 에 있다.
.EXAMPLE
  .\Remove-Isolation.ps1 -Discover                         # 이름 접두로 남은 것 찾기(지우지 않음)
  .\Remove-Isolation.ps1 -RunDir <RunDir>                  # dry-run
  .\Remove-Isolation.ps1 -RunDir <RunDir> -Apply [-RemoveProfile]
  .\Remove-Isolation.ps1 -RunId <RunId> -Apply             # 실행 기록 없이 이름으로만(감사 원래 값은 모르므로 복구하지 못한다)
#>
[CmdletBinding()]
param(
    [string]$RunDir,
    [string]$RunId,
    [switch]$Apply,
    [switch]$RemoveProfile,
    [switch]$Discover
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
. (Join-Path $PSScriptRoot 'IsolationFlows.ps1')
$r = @(Invoke-IsoRecover -RunDir $RunDir -RunId $RunId -Apply ([bool]$Apply) -RemoveProfile ([bool]$RemoveProfile) -Discover ([bool]$Discover))[-1]
exit $r.exitCode
