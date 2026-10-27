<#
.SYNOPSIS
  적용된 격리가 "무해한 프로브"에 실제로 걸리는지 관측한다. semgrep 계열은 실행하지 않는다.
.DESCRIPTION
  기본은 사전 조건 확인과 계획 출력만 한다. 실제 실행은 -Execute.
  실행 순서(-Execute):
    1. 감사 창 열기: "Filtering Platform Connection" 실패 감사를 이 실행 동안만 켠다(원래 값은 켜기 직전에 새로 읽어 기록). 설정을 시도하기 전에
       그 단계를 복구 목록에 넣으므로, 설정 직후 오류가 나도 끝에서 복구한다.
    2. 실행 직전 Security 로그 기준점(마지막 RecordId) 기록, 전용 계정 사용 켜기(끝나면 다시 끈다), 이전 실행의 프로브 파일 삭제.
    3. 루프백 수신기(127.0.0.1)를 연다. 전용 계정으로 부모 powershell.exe → 자식 powershell.exe 를 이번 실행의 토큰(runToken)과 함께 띄워 TCP 연결을 시도한다:
         loopback          127.0.0.1:<수신기 포트>      기대: 허용(수신기가 받아야 한다)
         external-reserved 192.0.2.1:9 (RFC 5737 문서용 주소, 실제 서비스 아님)  기대: 차단
         (선택 -IncludeSelfAddressProbe) 이 PC 의 비루프백 주소의 수신기. 관리자 계정의 같은 연결을 대조군으로 쓴다.
    4. 신원 교차 확인(통과해야만 성공 판정에 쓴다): 부모·자식의 CIM 기록 존재, 소유 SID = 전용 계정, 실행 파일 = 기대한 powershell.exe,
       자식의 부모 PID = 부모 프로브, 부모가 보고한 자식 PID = CIM 자식, 자기 보고(PID·경로·SID·시작 시각) = CIM, 결과 파일의 토큰 = 이번 실행.
       하나라도 어긋나거나 필수 기록이 없으면 연결 결과·시각을 검증된 사실로 쓰지 않고(unverifiedProbeReports 에 진단용으로만 남김) 성공할 수 없다.
    5. 신원이 확인되면 Security 로그의 5157 을 기준점 이후로 읽어, PID·실행 파일 경로·시각 구간이 모두 맞는 것만 "이번 실행의 OS 차단 관측"으로 센다.
    6. 정리(항목마다 독립 실행, 읽어서 확인): 수신기 정지, 남은 프로브 종료, 계정 비활성화, 감사 값 복구. 하나가 실패해도 나머지를 건너뛰지 않는다.
  보고는 서로 다른 항목으로 나눈다:
    A. 연결 시도 결과   B. 루프백 수신기 수신 건수   C. OS 차단 관측(5157 대조)   D. 판정   E. 정리 결과(cleanup)
  판정 규칙: 연결 실패만으로 차단이라고 하지 않는다. 로그를 못 읽었거나 감사가 꺼져 있었거나 로그가 밀렸거나 필수 프로세스 기록이 없으면 FAILED_EVIDENCE_UNAVAILABLE 이고 0건이 아니다.
  종료 코드: 0 프로브 관측 + 정리 완료 / 50 사전 조건 실패 / 60 관측 안 됨(정리는 완료) / 70 정리 불완전(관측 결과와 무관, 보고서에 둘이 따로 남는다).
  PROBE_ISOLATION_OBSERVED 여도 의미는 "이 프로브 두 종류에 대해 관측됨"뿐이다. semgrep·가상환경 python·UDP·ICMP·IPv6·DNS 로는 확장하지 않는다.
  본문은 IsolationFlows.ps1 의 Invoke-IsoVerify 에 있다.
.EXAMPLE
  .\Test-IsolationEffect.ps1 -RunDir <RunDir>                 # 계획·사전 조건만
  .\Test-IsolationEffect.ps1 -RunDir <RunDir> -Execute
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RunDir,
    [switch]$Execute,
    [string]$VenvPython,
    [switch]$IncludeSelfAddressProbe,
    [switch]$IncludeProcessCreationAudit,
    [int]$ConnectTimeoutSec = 3,
    [int]$HoldSeconds = 3,
    [int]$LaunchTimeoutSec = 30,
    [int]$ResultExtraSec = 20,
    [int]$DoneTimeoutSec = 10
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
. (Join-Path $PSScriptRoot 'IsolationFlows.ps1')
$r = @(Invoke-IsoVerify -RunDir $RunDir -Execute ([bool]$Execute) -VenvPython $VenvPython -IncludeSelfAddressProbe ([bool]$IncludeSelfAddressProbe) -IncludeProcessCreationAudit ([bool]$IncludeProcessCreationAudit) -ConnectTimeoutSec $ConnectTimeoutSec -HoldSeconds $HoldSeconds -LaunchTimeoutSec $LaunchTimeoutSec -ResultExtraSec $ResultExtraSec -DoneTimeoutSec $DoneTimeoutSec)[-1]
exit $r.exitCode
