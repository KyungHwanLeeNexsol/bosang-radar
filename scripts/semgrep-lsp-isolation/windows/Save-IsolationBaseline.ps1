<#
.SYNOPSIS
  격리 적용·복구가 건드리는 상태만 읽어서 (1) 적용 전 기준을 저장하고 (2) 적용 직후 임시 상태가 실제로 있는지 직접 확인하고 (3) 복구 뒤 기준과 같은지 비교한다. 읽기 전용.
.DESCRIPTION
  일반 시스템 점검 도구가 아니다. 아래 항목만 읽는다. 시스템은 읽기만 하고, 쓰는 파일은 -OutFile 로 받은 JSON 하나뿐이다
  (계정·방화벽·감사·ACL·레지스트리를 바꾸는 명령은 이 파일에도 IsolationBaselineCore.ps1 에도 없다).

  모드
    -Mode Save     적용 전에 기준을 -OutFile 에 저장한다.      종료 0 저장 완료 / 2 저장했지만 읽지 못한 항목이 있다 / 3 오류(키 중복·경로 문제 등)
    -Mode Verify   적용 직후, 기준 + 이번 실행의 예상 변화와 지금 상태를 비교한다.   종료 0 EQUAL / 1 DIFFERENT / 2 UNVERIFIABLE / 3 오류
    -Mode Compare  복구 뒤, 지금 상태가 기준과 같은지 비교한다.   종료 0 EQUAL / 1 DIFFERENT / 2 UNVERIFIABLE / 3 오류
  비교는 fail-closed 다: 양쪽이 모두 읽혔고(OK) 값이 비어 있지 않고 같을 때, 또는 양쪽이 근거 있는 NOT_PRESENT 일 때만 "같다".
  READ_FAILED·null·빈 문자열·한쪽에만 있는 키는 절대 같다고 세지 않는다(UNVERIFIABLE). EQUAL 은 확인 불가 0개일 때만이다.

  읽는 항목(키 → 내용). 모든 키는 소문자이고, 경로 키는 전체 정규화 경로다. 파일 이름만으로 키를 만들지 않는다.
  두 python.exe 는 경로가 다르므로 file:/acl:/ace:/owner: 키가 다르고, role:venv-python.exe 와 role:base-python.exe 로도 따로 남는다.
    layout:resolution                    가상환경 루트·기반 Python 폴더를 정했는가(pyvenv.cfg 의 home)
    role:<역할>                          역할 → 전체 경로. 역할: venv-root, base-python-root, venv-python.exe, base-python.exe, semgrep.exe, semgrep-core.exe
    file:<전체 경로>                     설치 파일 4개(semgrep.exe, 가상환경 python.exe, 기반 python.exe, semgrep-core.exe)의 크기·SHA-256(.NET)
    acl:<전체 경로>                      위 4개 파일과 권한을 주는 두 폴더(가상환경 루트, 기반 Python 폴더)의 SDDL(소유자·그룹·DACL)
    ace:<전체 경로>                      같은 여섯 경로의 ACE 줄 목록(종류|SID|권한|상속|전파|상속됨)
    owner:<전체 경로>                    같은 여섯 경로의 소유자·그룹 SID
    tree:<전체 경로>                     (-TreeStats 일 때만) 두 폴더의 파일 수·바이트
    accounts:local-users                 로컬 계정 전부(이름|SID|사용 여부|설명)
    accounts:bsi-matching                그 중 이름이 bsi<8hex> 인 것(전용 계정 접두)
    group:s-1-5-32-544, group:s-1-5-32-545   Administrators / Users 구성원 SID
    fw:rule-names                        방화벽 규칙 이름 전체
    fw:prefix-rules                      그 중 접두 bosang-semgrep-iso 인 것
    audit:{0cce9226-…}, audit:{0cce922b-…}   감사 하위 범주(Filtering Platform Connection, Process Creation)의 auditpol 데이터 행 원문 (관리자 권한 필요)
    profiles:profilelist-sids            ProfileList 하위 SID
    profiles:dir-listing                 프로필 루트 폴더(C:\Users)의 최상위 목록
    workroot:listing                     %ProgramData%\bosang-semgrep-iso 존재 여부와 최상위 목록
    proc:semgrep-running                 이름이 semgrep 으로 시작하는 실행 중 프로세스
    (-RunId 또는 -RunDir 를 주면 이 실행의 자원도 읽는다. 기준 시점에는 모두 "없음"이어야 한다)
    run-account:<bsi…>                   이 실행의 전용 계정
    run-rule:<bosang-semgrep-iso-<RunId>-out>   이 실행의 방화벽 규칙(속성 한 줄)
    run-workdir:<RunId>, run-workdir-owner:<RunId>   이 실행의 작업 폴더와 .owner 표식
    run-profiledir:<bsi…>                전용 계정의 프로필 폴더(C:\Users\bsi…)
  Verify 는 위에 더해 판정 항목(vfy:*)을 만든다: vfy:run-status, vfy:runid-match, vfy:grant-paths, vfy:baseline-run-absent, vfy:run-account, vfy:run-rule,
  경로마다 따로 vfy-ace-run:<전체 경로>(전용 SID ACE 정확히 1건: 폴더 0x1200a9·CI+OI·비상속, 파일은 상속) 와 vfy-ace-others:<전체 경로>(나머지 ACE 는 기준과 같음).

.EXAMPLE
  # 적용 전 (사전 점검 폴더에 preflight.json 이 있다)
  .\Save-IsolationBaseline.ps1 -Mode Save -DistRoot D:\dist -RunDir <RunDir> -OutFile <저장소 밖>\baseline-pre.json
  # 적용 직후
  .\Save-IsolationBaseline.ps1 -Mode Verify -BaselineFile <저장소 밖>\baseline-pre.json -RunDir <RunDir> -OutFile <저장소 밖>\verify-applied.json
  # 복구 뒤
  .\Save-IsolationBaseline.ps1 -Mode Compare -BaselineFile <저장소 밖>\baseline-pre.json -OutFile <저장소 밖>\compare-post.json
#>
[CmdletBinding()]
param(
    [string]$Mode,
    [string]$OutFile,
    [string]$BaselineFile,
    [string]$DistRoot,
    [string]$VenvRoot,
    [string]$BasePythonHome,
    [string]$RunDir,
    [string]$RunId,
    [switch]$TreeStats,
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
# 점 읽기 전에 자기 매개변수를 저장한다. 5.1 에서는 param 기본값 안의 $PSScriptRoot 가 비어 있으므로 본문에서 정한다.
$entryArgs = @{
    Mode = $Mode; OutFile = $OutFile; BaselineFile = $BaselineFile; DistRoot = $DistRoot; VenvRoot = $VenvRoot; BasePythonHome = $BasePythonHome
    RunDir = $RunDir; RunId = $RunId; TreeStats = [bool]$TreeStats; Force = [bool]$Force
}
. (Join-Path $PSScriptRoot 'IsolationBaselineCore.ps1')
$codes = @(Invoke-BaselineMain @entryArgs)
exit ([int]$codes[-1])
