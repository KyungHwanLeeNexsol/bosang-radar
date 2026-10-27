# Semgrep 1.180.0 배포물 확보와 설치 환경 검증 보고서

- 작성일: 2026-10-27
- 기준: PR #34 HEAD `63835d189f3adaee07f8255c22927ea41a418e7a`(브랜치 `security/semgrep-lsp-negative-control`) 위의 별도 브랜치 `security/semgrep-lsp-dist-verify`
- 성격: **문서 전용**. 코드·`pin.json`·ADR·게이트 설정을 바꾸지 않았다.
- 이 보고서는 **실제 Semgrep 실행의 증거가 아니다.** `semgrep --version`을 포함해 `semgrep`·`semgrep-core`·`pysemgrep`을 한 번도 실행하지 않았고, `semgrep` 패키지를 임포트하지도 않았다.

## 1. 결론

| 항목                                  | 결과                                                                                                                                   | 확인 수준                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 버전 `1.180.0` ↔ 커밋 `a35fe83…`      | 공식 저장소 `semgrep/semgrep`의 태그 `v1.180.0`이 가리키는 커밋이 `pin.json`의 커밋과 같다                                             | **확인**(단, 태그는 서명되지 않음)          |
| 이 PC(Windows 11 x64, Python 3.12.9)용 공식 배포물 | PyPI에 `win_amd64` 휠이 있다(`cp312-none-win_amd64` 태그 포함)                                                                | **확인**                                    |
| 휠 파일의 무결성                      | 직접 계산한 SHA-256이 PyPI JSON·PyPI Simple·출처 증명의 주체 해시와 모두 같고, 크기도 같다                                             | **확인**                                    |
| 휠 ↔ 소스 커밋 `a35fe83…`             | 출처 증명이 가리키는 소스는 **다른 저장소**(`semgrep/semgrep-proprietary`)의 커밋 `037fc1d…`이며 이 환경에서 볼 수 없다               | **미확인**                                  |
| 독립 설치 환경                        | 전용 가상환경에 설치 성공. 바이너리 휠만 사용, 소스 빌드 없음                                                                          | **확인**(파일·메타데이터 수준)              |
| 설치된 `semgrep`이 동작하는가         | 실행하지 않았다                                                                                                                        | **미확인**                                  |
| 공식 지원 상태                        | 공식 퀵스타트는 Windows를 **beta**로 표기한다                                                                                          | 확인(문서 원문)                             |
| 설치 당시 pip 전역·가상환경 구성 파일 | `--isolated`는 환경변수와 사용자 구성만 무시하고 이 둘은 무시하지 않는다(pip 24.3.1 소스). 당시 존재 여부는 확인하지 않았다(4.1.1절)   | **미확인**(정정 시점의 현재 상태는 모두 없음) |

`pin.json`은 바꾸지 않았다. 바꿀 값과 근거는 8절에 제안으로만 적었다.

## 2. 하지 않은 것

LSP 서버 실행, `semgrep --version` 포함 모든 `semgrep` 계열 명령 실행, 규칙 내려받기, 대상 스캔, 음성 대조의 실제 실행, 엔진 관측 계약 확정, 보안 게이트 연결, ADR `Accepted` 전환, `pin.json`·`verified`·`policy_accepted` 변경, 기존 PR·`main`·`bodam` 변경, 병합·배포. WSL·Docker·가상머신도 설치하지 않았다. 배포물과 의존성 바이너리는 git에 넣지 않았다(저장 위치는 9절).

## 3. 확인한 사실

각 항목은 **주장 → 근거(명령·출처와 관측값) → 한계** 순서로 적었다.

### 3.1 실행 환경

- 주장: 이 PC는 Windows 11 Home(`10.0.26200`), x64(AMD64), Python 3.12.9(64비트)를 쓴다.
- 근거: `[Environment]::OSVersion`, `PROCESSOR_ARCHITECTURE=AMD64`, `Win32_Processor`(AMD Ryzen 5 5600G), 인터프리터 `…\Programs\Python\Python312\python.exe`의 `sys.version`(`3.12.9 … [MSC v.1942 64 bit (AMD64)]`, 시스템 Python). `uv 0.11.1`도 있으나 이번 설치에는 쓰지 않았다.
- 한계: Windows Store 별칭(0바이트 `python.exe`)은 실제 인터프리터가 아니어서 쓰지 않았다. `uv`가 Microsoft Store판 Python 3.13도 설치된 것으로 목록에 올렸으나 쓰지 않았다.

### 3.2 버전과 소스 커밋의 관계 (GitHub 공식 저장소)

- 주장: `pin.json`의 커밋 `a35fe8306115b3e55274969098cc46f8451d6b4d`는 공식 저장소 `semgrep/semgrep`의 `v1.180.0` 태그가 가리키는 커밋이다.
- 근거(`gh api`):
  - `git/ref/tags/v1.180.0` → 태그 객체 `2becbee039df34fd702e4838aae6ef0774c14734`(type `tag`, 주석 태그).
  - `git/tags/2becbee…` → `object.sha = a35fe8306115b3e55274969098cc46f8451d6b4d`(type `commit`), 메시지 `Release 1.180.0`, 태그 작성 시각 2026-10-07T23:16:36Z.
  - `commits/a35fe83…` → 메시지 `chore: release 1.180.0`, 커밋 시각 2026-10-07T22:50:13Z.
  - 저장소 `semgrep/semgrep`: `fork = false`, `archived = false`. GitHub 릴리스 `v1.180.0`(draft·prerelease 아님, 게시 2026-10-07T23:17:11Z, 첨부 자산 없음).
- 한계: 태그와 커밋 모두 서명 검증이 `false`(태그는 `unsigned`)다. 즉 **저장소가 말하는 대응 관계**일 뿐 서명으로 보증된 관계가 아니다.

### 3.3 PyPI의 1.180.0 배포 파일

PyPI JSON API(`/pypi/semgrep/1.180.0/json`)와 Simple API(PEP 691)가 같은 8개 파일을 공시한다(전체 목록과 공식 해시는 부록 A). `requires_python >=3.10`, yanked 없음, 프로젝트 상태 `active`. 휠 7개 중 Windows용은 `win_amd64` 하나다.

### 3.4 이 환경에 맞는 배포물의 선택

- 선택: `semgrep-1.180.0-cp310.cp311.cp312.cp313.cp314.py310.py311.py312.py313.py314-none-win_amd64.whl`
- 근거: 휠 내부 `WHEEL`의 `Tag:`에 `cp312-none-win_amd64`, `py312-none-win_amd64`가 있고, 전용 가상환경의 `pip debug --verbose`가 같은 두 태그를 호환 태그로 나열했다. 소스 배포(`.tar.gz`)와 다른 플랫폼 휠은 받지 않았다.

### 3.5 PyPI 출처 증명(PEP 740)이 말하는 것과 말하지 못하는 것

`https://pypi.org/integrity/semgrep/1.180.0/<휠>/provenance`가 증명 묶음 1개(10,218바이트)를 돌려줬다. 내용을 **읽기만 했고 서명 체인(Fulcio)과 투명성 로그(Rekor) 포함 증명은 이 환경에서 검증하지 않았다.** 아래는 증명서가 *주장하는* 값이다.

| 항목                      | 값                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 게시자                    | GitHub, 저장소 `semgrep/semgrep-proprietary`, 워크플로 `pro-release.yml`                                 |
| 주체(subject)             | 위 휠 파일 이름, SHA-256 `b403865e…fc6`(직접 계산한 값과 같다)                                           |
| 소스 커밋(인증서 확장)    | `037fc1defd47422849ce49028345a85dfbb6a7c7`, ref `refs/heads/develop`, 저장소 `semgrep-proprietary`      |
| 트리거·실행                | `workflow_dispatch`, GitHub 호스트 러너, 실행 `https://github.com/semgrep/semgrep-proprietary/actions/runs/37698236479/attempts/1` |
| 인증서 유효 기간          | 2026-10-07 23:23:52 ~ 23:33:52 GMT(발급자 `sigstore-intermediate`). PyPI 업로드 시각은 23:24:52Z        |

- 말해 주는 것: 이 휠은 Semgrep 쪽 게시 워크플로가 만든 것이고, 그 파일의 해시가 증명의 주체와 같다.
- **말해 주지 못하는 것**: 소스 커밋이 공개 저장소 `semgrep/semgrep`의 `a35fe83…`가 아니라 `semgrep-proprietary`의 `037fc1d…`다. 그 저장소와 커밋은 이 토큰으로 조회되지 않는다(404 — 비공개인지 존재하지 않는지는 구분되지 않는다). 공개 저장소에는 `037fc1d…`가 없다(422). 따라서 **휠 ↔ `a35fe83…`의 대응은 증명으로 세워지지 않는다.**

### 3.6 무결성: 해시와 크기

| 출처                                           | SHA-256                                                            | 크기       |
| ---------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| 직접 계산 1 (`sha256sum`, Git Bash)            | `b403865e64f5ba0691630adf9bc13592cc38830726d4a114960d7e2d3fb21fc6` | 58,108,036 |
| 직접 계산 2 (Node `crypto`)                    | 위와 같음                                                          | —          |
| 직접 계산 3 (PowerShell `Get-FileHash`)        | 위와 같음                                                          | —          |
| PyPI JSON API (`digests.sha256`)               | 위와 같음                                                          | 58,108,036 |
| PyPI Simple API (`hashes.sha256`)              | 위와 같음                                                          | 58,108,036 |
| PyPI 출처 증명의 주체                          | 위와 같음                                                          | —          |

- 다운로드: `https://files.pythonhosted.org/packages/82/75/3e3a75297e8f181e0a32b5691ee55c78a214d4a72a0370841f9c7674a5da/<휠 파일 이름>`(Simple API가 알려 준 URL), HTTP 200, TLS 1.2 이상 강제(`--proto '=https' --tlsv1.2`), 원격 IP `151.101.0.223`. 파일 이름·플랫폼 태그는 3.4절, PyPI 업로드 시각은 2026-10-07T23:24:52Z, MD5와 BLAKE2b-256은 PyPI JSON에 있다.
- **`pin.json`의 `sha256_rev1_reported`는 검증값으로 쓰지 않았다.** 해시는 위 세 도구로 직접 계산했고, 계산 *뒤에* `pin.json`을 읽어 비교했다. 관측: `sha256_rev1_reported`와 `size_bytes_rev1_reported`(58,108,036)는 이번에 계산한 값과 같다. 이것은 "rev1이 같은 파일을 가리켰다"는 관측이지 rev1의 근거가 확인되었다는 뜻이 아니다.
- 한계: PyPI 세 곳은 같은 서버가 공시한 값이라 서로 독립된 출처가 아니다. 독립된 확인은 직접 계산한 값과 PyPI 공시값의 일치뿐이다.

### 3.7 휠 내부 검사(압축 파일로만 읽음, 실행·임포트 없음)

- 항목 179개, `.dist-info` 1개, `.data/purelib` 아래에 패키지 파일이 있다. `Metadata-Version 2.4`, 이름 `semgrep`, 버전 `1.180.0`, `Requires-Python >=3.10`, 라이선스 표기 `LGPL-2.1-or-later`, 운영체제 분류자에 Windows 포함.
- `RECORD` 행 179개: 해시·크기를 확인한 178개 모두 일치, 목록에 있는데 없는 파일 0, 있는데 목록에 없는 파일 0.
- 콘솔 스크립트: `pysemgrep = semgrep.console_scripts.pysemgrep:main`, `semgrep = semgrep.console_scripts.entrypoint:main`.
- 이진 파일 17개: `semgrep-core.exe`(246,296,090바이트, SHA-256 `6790bb4a902c99a15a3356c082a66dee9edda80a2994f1964ab82ebacdfed116`)와 DLL 16개(`libcurl-4`, `libssl-3`, `libcrypto-3`, `libpcre2-8-0` 등).
- 서명: `semgrep-core.exe`, `semgrep.exe`, `libcurl-4.dll`의 Authenticode 상태가 모두 `NotSigned`다(서명 블록만 읽었다). Windows 코드 서명으로는 발행자를 확인할 수 없다는 뜻이다.
- 의존성 선언(`Requires-Dist` 27개)에 `pywin32==311; sys_platform == "win32"`, `mcp==1.29.0`, `opentelemetry-*` 묶음이 있다. 네트워크 격리를 정할 때 참고한다(7절).

### 3.8 공식 문서의 Windows 지원 상태

- `https://docs.semgrep.dev/getting-started/quickstart`(원문 확인): 절 제목이 "Windows (beta)", "Python 3.10 or later", `PYTHONUTF8`을 `1`로 두라는 안내, "python.exe를 PATH에 추가", 설치 명령은 `pipx install semgrep` 또는 `uv tool install semgrep`이며 Windows 절에는 `pip`이 없다.
- 검색 결과 요약에는 "Autumn '25 릴리스 노트가 Windows 네이티브 지원을 GA로 적는다"는 설명이 있었다. **그 원문은 확인하지 못했고**, 두 문서의 표기가 어긋난다. 이 보고서는 퀵스타트 원문의 "beta"를 따른다.
- 이번 설치는 문서가 권하는 `pipx`·`uv`가 아니라, **검증한 로컬 휠을 전용 가상환경에 `pip`으로 설치**했다. 공식 PyPI 휠을 쓴다는 점은 같고 방식만 다르다.

## 4. 설치

### 4.1 방법

전역 Python·사용자 설정·`PATH`를 바꾸지 않도록 전용 가상환경을 만들고 `pip`에 `--isolated` 옵션을 주었다(경로는 9절). 이 옵션이 무엇을 무시하고 무엇을 무시하지 않는지는 4.1.1절에서 구분한다.

1. 시스템 Python 3.12.9로 `python -I -m venv <venv>`(가상환경 생성).
2. `pip debug --verbose`로 호환 태그에 `cp312-none-win_amd64`가 있는지 확인.
3. `<venv>\Scripts\python.exe -I -m pip --isolated install --only-binary=:all: --no-compile --no-input --disable-pip-version-check --index-url https://pypi.org/simple --report <install-report.json> <검증한 휠 경로>`
   - `--isolated`: pip 공식 문서의 설명은 "환경변수와 사용자 구성을 무시"(원문: "ignoring environment variables and user configuration")이다. **모든 설정 파일을 무시한다는 뜻이 아니다**(4.1.1절). `--only-binary=:all:`: 소스 빌드(= 임의 `setup.py` 실행) 금지. `--no-compile`: 설치 중 `.pyc` 컴파일 생략. `--index-url https://pypi.org/simple`을 명령줄에 명시했다.

#### 4.1.1 `--isolated`가 막은 것과 막지 않은 것

근거: pip 공식 문서(`pip` CLI 참조의 `--isolated` 항목, 구성 문서의 파일 위치·읽는 순서)와, 설치에 쓴 pip 24.3.1의 소스 `pip/_internal/configuration.py`(이번 정정 때 읽었다). 소스에서 `--isolated`가 건너뛰는 것은 사용자 구성 파일(344행의 `should_load_user_config`)과 환경변수(125행의 `_load_environment_vars`)이고, 전역 구성 파일(341행)과 가상환경(site) 구성 파일(352행)은 `--isolated`와 상관없이 읽는다. `PIP_CONFIG_FILE`이 지정되어 있으면 그 파일을 읽는 경로도 있다(354행).

| 설정 출처                                          | `--isolated`의 효과      | 설치 당시 확인 여부 | 정정 시점(2026-10-27)의 읽기 확인 — 현재 상태일 뿐 설치 당시 상태의 증거가 아니다 |
| -------------------------------------------------- | ------------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| `PIP_*` 환경변수                                   | 무시                     | 확인하지 않았다     | 현재 세션에 `PIP_*` 변수 없음                                                       |
| 사용자 구성 `%APPDATA%\pip\pip.ini`, `%HOME%\pip\pip.ini` | 무시                | 확인하지 않았다     | 두 파일 모두 없음                                                                   |
| 전역 구성 `C:\ProgramData\pip\pip.ini`             | **무시하지 않는다**      | **확인하지 않았다** | 파일 없음                                                                           |
| 가상환경 구성 `<venv>\pip.ini`                     | **무시하지 않는다**      | **확인하지 않았다** | 파일 없음                                                                           |
| `PIP_CONFIG_FILE`이 가리키는 파일                  | 읽는 경로가 있다         | 확인하지 않았다     | 변수 없음                                                                           |

- 설치 당시 전역·가상환경 구성 파일이 있었는지는 **알 수 없다.** 위 표의 마지막 열은 정정 시점의 현재 상태이고, 설치 시점으로 소급해서 읽지 않는다.
- 설치 결과 자체에서 관측된 것은 따로 적는다. 명령줄에 `--index-url https://pypi.org/simple`을 명시했고, 설치 보고서의 다운로드 URL 66개가 모두 호스트 `files.pythonhosted.org`였으며, 설치된 파일의 `RECORD` 해시가 모두 일치했다(4.3절). 이것은 **실제로 쓰인 파일 출처**의 증거다. 프록시·인증서·`trusted-host` 같은 전송 설정은 URL에 드러나지 않으므로, 이 증거가 "설정이 없었다"를 뜻하지는 않는다.

### 4.2 결과

- 종료 코드 0. 설치된 배포물 68개(`pip` 포함), 설치 보고서의 항목 67개: 66개는 `files.pythonhosted.org`의 바이너리 휠, 1개는 로컬 `semgrep` 휠. 해시가 빠진 항목은 없다.
- `semgrep 1.180.0`: 설치자 `pip`, 요청 설치, `direct_url.json`의 출처가 로컬 파일 URL이고 `archive_info.hash = sha256=b403865e…fc6`(3.6절의 값과 같다).
- 해소된 주요 의존성: `mcp 1.29.0`, `opentelemetry-api/sdk/exporter-otlp-proto-http 1.37.0`, `opentelemetry-instrumentation(-requests/-threading) 0.58b0`, `pywin32 311`, `cryptography 50.0.2`, `pydantic 2.14.1`, `requests 2.34.2` 등(전체는 부록 B). `opentelemetry-instrumentation-requests`는 `~=0.58b0` 제약과 `opentelemetry-api~=1.37.0` 때문에 최신 `0.66b1`에서 `0.58b0`까지 후퇴해 해소되었다.
- 실행 파일: `venv\Scripts\semgrep.exe`(108,456바이트, SHA-256 `960388bc3dc6a6c38f84ffac1c38df434ff5d0a02c9c277ee214d88de9cb4013`), `venv\Scripts\pysemgrep.exe`(108,455바이트, `4061ec6d153172a0865f628fd490c3db3c015b8d0eb6391151440f266b9d089c`), `venv\Lib\site-packages\semgrep\bin\semgrep-core.exe`(3.7절과 같은 해시). 앞의 둘은 pip가 만든 실행기 래퍼라서 휠 안의 파일이 아니다.

### 4.3 설치 뒤 파일 검사(`semgrep` 미실행)

- `semgrep`의 `RECORD`: 해시·크기를 확인한 183개 모두 일치, 없는 파일 0. 설치된 배포물 68개 전체: 3,735개 해시 확인, 불일치 0, 누락 0. 설치된 `semgrep-core.exe`의 해시는 휠 안에서 계산한 값과 같다.
- `pip check`: `No broken requirements found.`
- `.pyc` 0개(`--no-compile`).

### 4.4 부수 효과

- 만든 것: 9절의 프로젝트 밖 폴더(약 379MB: 휠 55MB, 가상환경 323MB). 저장소 안에는 배포물·가상환경·의존성이 없다.
- **pip 사용자 캐시(`%LOCALAPPDATA%\pip\cache`)를 읽고 썼다.** 일부 의존성(`colorama`, `peewee`, `pywin32`, `httpx` 등)은 기존 캐시에서 왔고, 새로 받은 휠도 캐시에 남았다. 설정 변경은 아니지만 전역 사용자 폴더의 부수 효과다.
- 확인하지 않은 것: 설치 당시 pip 전역·가상환경 구성 파일의 존재 여부(4.1.1절). 이 항목은 5절 미확인 10에도 올렸다.
- 바꾸지 않은 것: 시스템 Python의 `site-packages`(`semgrep` 없음), 사용자 환경변수(`PYTHONUTF8` 미설정), `PATH`(`semgrep`이 `PATH`에 없음), 레지스트리(`pywin32_postinstall`은 실행하지 않았다).

## 5. 미확인 항목

1. **휠 ↔ 소스 커밋 `a35fe83…`의 대응.** 출처 증명의 소스는 비공개일 수 있는 `semgrep-proprietary@037fc1d…`다. 거기서 공개 저장소 `a35fe83…`를 가져오는지 알 수 없다. 휠의 버전 문자열이 `1.180.0`이라는 사실은 소스 커밋의 증거가 아니다.
2. 출처 증명의 **서명 체인·투명성 로그 포함 증명**(Sigstore 검증). 증명서의 주장만 읽었다.
3. 공개 태그와 커밋의 **서명**(둘 다 서명 없음).
4. 설치된 `semgrep`·`semgrep-core`의 **동작 전부**: `--version` 출력, LSP 서버 기동 인자(`lsp --debug`, ADR U3/U12), 환경변수 이름(`SEMGREP_*`), 로그·진단 형식(U3/U11), 네트워크 접근 여부.
5. 공식 지원 상태: 퀵스타트는 beta, 릴리스 노트의 GA 표기는 원문 미확인.
6. 의존성 휠 66개의 해시는 pip 설치 보고서가 인덱스에서 받은 값을 기록한 것이고, **각 파일을 직접 다시 계산하지 않았다.** 설치된 파일의 `RECORD` 일치만 확인했다.
7. 백신·EDR의 판정, Windows SmartScreen 동작.
8. `semgrep-core.exe`가 서명되지 않았다는 것 외의 바이너리 출처 분석(빌드 재현성, 소스 대조).
9. 휠 안 Windows 이진 17개가 `a35fe83…`의 소스에서 나왔는지.
10. 설치 당시 pip **전역**(`C:\ProgramData\pip\pip.ini`)·**가상환경**(`<venv>\pip.ini`) 구성 파일과 `PIP_CONFIG_FILE`의 존재 여부. `--isolated`는 이 중 환경변수와 사용자 구성만 무시한다(4.1.1절). 정정 시점에 읽은 현재 상태(모두 없음)는 설치 당시의 증거가 아니다.

미확인 1(휠 ↔ 소스 커밋)과 휠 파일 해시 확인(3.6절)은 서로 다른 질문이다. 해시 확인은 "받은 파일이 PyPI가 공시한 파일과 같다"까지만 말하고, "그 파일이 공개 소스 커밋 `a35fe83…`에서 만들어졌다"는 말하지 않는다. 이 정정에서도 둘을 합치지 않았다.

## 6. 잔여 위험

- 의존성이 인덱스 최신 해소에 따라 달라진다(부록 B로 고정하지 않으면 다른 날 다른 조합이 설치될 수 있다).
- `semgrep-core.exe`는 서명되지 않은 246MB 이진이다. 실행하는 순간부터의 행동(네트워크·파일 쓰기)은 이 단계에서 관측하지 않았다.
- 휠이 Windows용 하나뿐인 `pin.json` 구조에서는 Linux 실행의 도구 관측이 `MISMATCH`가 된다(8절).
- 같은 PyPI 서버가 공시한 해시를 서로 다른 출처처럼 읽지 않도록 주의해야 한다(3.6절 한계).

## 7. 다음 실제 실행 전에 필요한 네트워크 격리와 실행 환경 제안

### 7.1 먼저 짚을 점

- **루프백 수신기(`127.0.0.1`)는 격리가 아니다.** 하네스의 수신기는 "자기 주소로 온 요청"을 세는 *관측 장치*다. 다른 주소·DNS·다른 포트로 나가는 통신은 보지도 막지도 못한다. 수신기에 0건이 찍혀도 "외부 통신이 없었다"는 뜻이 아니다.
- 환경변수·명령줄 옵션(`SEMGREP_*`, `--metrics`, 프록시 변수 등)은 *프로세스가 따르기로 한 경우에만* 효과가 있다. 이름과 효과가 1.180.0에서 확인되지 않았고(미확인 4), 자식 프로세스나 라이브러리가 무시하면 우회된다. 보조 수단일 뿐이다.
- 가능성 있는 통신(추정, 미관측): 버전 확인, 규칙 레지스트리 내려받기(`--config`가 레지스트리 이름일 때), 지표 전송, 로그인·배포 앱 서버(`SEMGREP_APP_URL`), `opentelemetry-exporter-otlp-proto-http`가 있는 만큼 추적 내보내기. 이것은 의존성·구조에서 추정한 것이지 실행해서 본 것이 아니다.

### 7.2 선택지

| 선택지                                                                 | 격리 수준                                              | 이 PC에서 가능한가                                             | 비고                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A. 전용 로컬 사용자 계정 + 사용자 단위 아웃바운드 차단 방화벽 규칙(권장) | 그 계정이 띄운 **모든 프로세스**의 외부 송신을 OS가 차단하도록 한 **설계 의도**(이 PC에서 적용·관측하지 않았다) | 가능(관리자 권한 필요, 계정 생성과 규칙 추가는 시스템 변경)    | 프로그램 경로 규칙보다 우회가 어렵다(자식 프로세스 포함). 반드시 소유자 승인 후 진행                     |
| B. 프로그램 경로별 아웃바운드 차단 규칙                                | `semgrep.exe`·`pysemgrep.exe`·가상환경 `python.exe`·`semgrep-core.exe`만 차단 | 가능(관리자 권한 필요)                                         | 이 네 경로가 아닌 실행 파일이 낸 통신은 막지 못한다(`git`, `cmd` 등을 쓰는 경우)                         |
| C. 네트워크 없는 Linux 환경(네트워크 이름공간·NIC 없는 가상머신)에서 `manylinux_2_34_x86_64` 휠 사용 | 경로가 없으므로 가장 강하다                            | 이 PC에서는 자동 구성하지 않는다(WSL·Docker·가상머신 설치 금지) | 외부 검토 환경이 Linux다. PID 이름공간과 `/proc`이 어긋나면 다른 서버 프로세스 관측이 달라지므로(기존 7건 실패의 원인) 같은 PID 이름공간에서 실행해야 한다 |
| D. Windows Sandbox(네트워크 끔)                                        | 강함                                                   | 이 PC는 Windows 11 **Home**이라 기본 제공되지 않는 것으로 알려져 있다. 이 PC에서 직접 확인하지는 않았다 | 가능한 에디션이 있을 때만                                                                                |

권장은 **A를 기본으로, 가능하면 C를 더한 이중 구성**이다. 어느 쪽이든 *차단했다*고 쓰려면 아래 확인을 통과해야 한다.

### 7.3 격리를 주장하기 전에 통과해야 할 확인

1. 규칙이 실제로 걸렸는지 **정규 확인 도구가 아닌 같은 계정·같은 경로의 무해한 프로그램**으로 먼저 본다(예: 차단 대상 가상환경의 `python.exe`로 공개 주소에 짧은 연결 시도 → 실패해야 한다). `semgrep` 계열은 이 확인에 쓰지 않는다.
2. **OS 차단 관측은 방화벽 로그(`LogBlocked`)를 켠다고 해서 계정·경로별로 집계되지 않는다.** 증거는 "차단이 관측되었다 / 관측되지 않았다 / 관측할 수 없었다" 세 가지이고, 마지막을 0건으로 쓰지 않는다.
   - `LogBlocked`(버려진 패킷 기록, 기본 파일 `%windir%\system32\logfiles\firewall\pfirewall.log`, 기본 크기 4,096KB로 차면 오래된 줄부터 지워진다)는 보조 자료로만 쓴다. 공식 설정 문서(Configure Windows Firewall logging)는 기록 필드 목록을 싣지 않고, 버려진 패킷 설명도 "받는(incoming) 패킷" 기준으로 적혀 있다. 이 PC는 `LogBlocked`가 꺼져 있고 파일도 없어 `#Fields` 줄을 직접 확인하지 못했다. 그래서 나가는 연결의 차단이 어떤 필드로 남는지, 실행 파일·계정이 남는지는 **미확인**이다.
   - 주 증거는 Security 로그의 이벤트 **5157**("Windows Filtering Platform이 연결을 차단했다")이다. 감사 하위 범주 "Filtering Platform Connection"의 **실패** 감사를 켜야 기록된다. 이 PC에서는 2026-10-27 읽기 확인 시 그 하위 범주가 "No Auditing"이었다(현재 설정으로는 5157이 기록되지 않는다). 5157의 필드는 `ProcessID`, `Application`(`\device\harddiskvolumeN\…` 형식의 NT 경로), `Direction`, 주소·포트, `Protocol`, `FilterRTID`, `LayerName` 등이고, **실행 계정을 나타내는 필드는 공식 필드 설명에 없다.** 예시 XML의 `RemoteUserID`는 문서가 설명하지 않는 필드이므로 실행 계정으로 읽지 않는다.
   - 5157을 이번 실행과 연결하는 방법(계정·경로별 건수는 이 연결을 거친 것만 센다):
     1. 실행기가 시작할 때 부모·자식 프로세스의 PID, 시작 시각(FILETIME), 실행 파일 전체 경로, 실행 계정 SID를 직접 기록한다(자식이 스스로 보고하고, 살아 있는 동안 `Win32_Process` 스냅숏으로 부모 PID·경로를 교차 확인한다).
     2. 5157의 `ProcessID`를 기록한 PID와 같은 진수로 맞춰 비교한다. 공식 문서는 이 값을 16진수로 설명하고 4688의 New Process ID와 대조하라고 안내하므로, 이벤트 XML에서 실제로 읽히는 형식을 실측으로 먼저 확인해야 한다(미확인).
     3. `Application`의 NT 경로(`\device\harddiskvolumeN\…`)를 볼륨 번호 대응(`QueryDosDevice` 또는 `diskpart`의 `list volume`)으로 DOS 경로로 바꿔 기록한 실행 파일 경로와 비교한다.
     4. 이벤트 시각이 그 프로세스의 시작~종료 구간 안인지 확인한다(PID 재사용으로 다른 프로세스의 이벤트를 세는 것을 막는다).
     5. 선택: 감사 하위 범주 "Process Creation"(이벤트 4688)을 켜면 `NewProcessId`와 계정이 OS 기록으로 남아 1번의 직접 기록을 교차 확인할 수 있다. 이것도 감사 정책 변경이므로 별도 승인 대상이다.
     6. 위 네 가지(PID, 경로, 시각 구간, 목적지)가 모두 맞는 이벤트만 "이 실행의 OS 차단 관측"으로 센다. 하나라도 못 맞추는 이벤트는 "실행 식별 불가"로 따로 센다. 로그를 읽지 못했거나 감사가 꺼져 있었으면 "수집 불가"로 적고 0건으로 쓰지 않는다.
   - 연결 시도가 실패했다는 사실만으로는 방화벽 차단이라고 쓰지 않는다(네트워크 경로 없음·시간 초과·대상 부재도 같은 실패로 보인다). 5157 연결에 성공한 경우에만 "OS 차단 관측"이라고 쓴다.
3. 루프백 수신기의 관측값은 **별도 증거**로만 남긴다(격리 증거로 합치지 않는다). 결과를 보고할 때 "수신기 0건"과 "차단 로그 0건"을 서로 다른 행으로 적는다.
4. 규칙·설정은 로컬 고정 경로만 가리키게 하고(`--config <로컬 폴더>`), 레지스트리 이름(`auto`, `p/…`)을 쓰지 않는다.
5. 보조 수단(어느 것도 격리가 아니다): 프로세스 단위로만 `PYTHONUTF8=1`(사용자 환경변수는 건드리지 않는다), 지표·버전 확인을 끄는 옵션과 환경변수(이름은 먼저 확인), 앱 토큰 변수 제거, 상태·캐시 폴더를 증거 폴더로 돌리기.

### 7.4 다음 단계의 실행 환경

- 실행 파일: `…\venv\Scripts\semgrep.exe`(절대 경로 `--semgrep-bin`), 휠: `--wheel-artifact`에 위 휠의 절대 경로. 둘 다 이 보고서의 해시와 대조한다.
- 첫 실행은 `semgrep --version` 하나로 한정하고, 그 안에서 **어떤 네트워크 접근이 일어나는지 차단 로그로 관측**한다. 하네스의 버전 확인 관문(`metrics_hits_during`)은 수신기에 닿은 요청만 센다는 점을 보고에 함께 적는다.
- 규칙 내려받기는 별도 단계로 둔다(`pin.json`의 규칙 커밋 `16b9e6d…`를 `semgrep`이 아닌 도구로 받는다).
- 위 확인이 하나라도 통과하지 못하면 `semgrep` 계열을 실행하지 않는다.

## 8. `pin.json` 변경 제안 (이번에는 적용하지 않음)

`pin.json`, `verified`, `policy_accepted`는 바꾸지 않았다. 아래는 소유자가 결정할 제안이다.

| 필드                                  | 현재                          | 제안 값                                                                                                  | 근거와 조건                                                                                                         |
| ------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `semgrep.wheel.filename`              | `null`                        | `semgrep-1.180.0-cp310.cp311.cp312.cp313.cp314.py310.py311.py312.py313.py314-none-win_amd64.whl`        | 3.4·3.6절. Windows 실행에 한정                                                                                      |
| `semgrep.wheel.sha256`                | `null`                        | `b403865e64f5ba0691630adf9bc13592cc38830726d4a114960d7e2d3fb21fc6`                                       | 3.6절: 도구 3개로 직접 계산 + PyPI 3곳 공시값과 일치. `sha256_rev1_reported`를 복사한 것이 아니라 계산값이다       |
| `semgrep.wheel.size_bytes`            | (`size_bytes_rev1_reported`만 있음) | `58108036`                                                                                          | 파일 크기를 직접 관측했다                                                                                           |
| `semgrep.wheel.verified`              | `false`                       | **`false` 유지**                                                                                         | 파일 식별만 확인되었고 휠 ↔ 소스 커밋(미확인 1)이 남았다. `verified`가 어느 범위를 뜻하는지(파일 해시인가, 소스 대응까지인가) 먼저 정해야 한다 |
| 플랫폼 구조                           | 휠 1개(단수)                  | 플랫폼 태그를 키로 하는 목록(Windows `b403865e…`, Linux x86_64 `16db2e2706ab814a975eeec25debfad49abba846b7c513d88e041447152f8447`) | 하네스는 관측한 해시를 `pin`과 비교하므로 단수 구조는 다른 플랫폼에서 `MISMATCH`가 된다. Linux 값은 PyPI 공시값이며 이번에 받아서 계산하지 않았다 |
| 커밋 관계 메모(새 필드 제안)          | 없음                          | `commit_basis = "tag v1.180.0 → a35fe83 (주석 태그 2becbee…, 서명 없음)"`, `wheel_source_commit = "unverified"` | 3.2·3.5절을 한 곳에 고정해 읽는 사람이 오해하지 않게 한다                                                           |
| `policy_accepted`                     | `false`                       | `false` 유지                                                                                             | ADR이 `Proposed`인 동안                                                                                             |

## 9. 보관 위치와 재현

- 프로젝트 밖(깃에 넣지 않음): `%LOCALAPPDATA%\bosang-radar\semgrep-dist\1.180.0\` 아래 `dist\`(휠), `venv\`(가상환경), `install-report.json`(pip 설치 보고서).
- 재현: 3.6절의 URL로 휠을 받아 해시를 비교하고, 4.1절의 명령 3단계를 그대로 실행한다. 의존성은 인덱스 해소가 시점에 따라 달라질 수 있으므로 부록 B의 해시 목록으로 고정하는 것을 권한다(`pip install --require-hashes`; 이번에는 시도하지 않았다).
- 실행한 읽기 명령(출처 확인): `gh api`(태그·커밋·릴리스·저장소), PyPI JSON·Simple·integrity 엔드포인트, 퀵스타트 문서. 실행하지 않은 명령: `semgrep`·`semgrep-core`·`pysemgrep` 전부, `python -c "import semgrep"`, `pywin32_postinstall`.

## 10. 변경 확인 범위

문서 한 개만 추가했다. 전체 하네스·감사·변이 점검은 반복하지 않았고, 변경 파일 목록과 `pin.json` 불변 여부만 확인했다. 11절의 정정 커밋도 이 파일 하나만 고쳤다.

서식 검사에 대한 정정: 이전에는 이 파일에 `prettier --check`를 통과했다고 적었으나, `.moai/`가 `.prettierignore`에 있어 그 검사는 이 파일을 건너뛴다(`prettier --file-info`가 `ignored: true`). **이 파일의 서식은 검사된 적이 없다.**

## 11. 정정 기록 (2026-10-27, 같은 PR 브랜치)

| 위치 | 정정 전 | 정정 후 | 근거 |
| --- | --- | --- | --- |
| 4.1절 | `--isolated`가 pip 설정 파일·`PIP_*` 환경변수를 무시한다고 적음 | 환경변수와 사용자 구성만 무시하고 전역·가상환경 구성 파일은 무시하지 않는다고 구분(4.1.1절 신설) | pip 공식 `--isolated` 설명, pip 24.3.1 `configuration.py` 125·341·344·352행 |
| 4.4·5절·1절 | 설치 당시 전역·가상환경 pip 설정을 확인했는지 적지 않음 | 확인하지 않았다고 명시, 미확인 10 추가 | 설치 때 해당 파일을 확인한 기록이 없다. 정정 시점의 읽기 확인은 현재 상태로만 적었고 소급하지 않았다 |
| 7.3절 2번 | `LogBlocked`를 켜면 계정·경로의 차단 건수를 기록할 수 있다고 적음 | `LogBlocked`는 보조 자료, 계정·경로별 건수는 5157(PID·경로)을 실행 기록과 연결한 것만 센다. 수집 불가·식별 불가는 0건이 아니다 | 이벤트 5157·감사 하위 범주 문서의 필드 설명, 방화벽 로그 설정 문서 |
| 10절 | 이 파일에 `prettier --check`를 통과했다고 적음 | 검사된 적이 없다고 정정 | `.prettierignore`에 `.moai`가 있고 `prettier --file-info`가 `ignored: true`를 돌려준다 |

바뀌지 않은 것: 휠 파일의 SHA-256 확인(3.6절)과 휠 ↔ 소스 커밋 대응 미확인(5절 1)은 계속 분리되어 있고, 서로의 근거로 쓰지 않았다. 해시·크기·태그→커밋 값, `pin.json` 제안(8절)도 그대로다.

이 정정에서 새로 실행한 것은 읽기 확인뿐이다: 공식 문서 읽기, 설치에 쓴 pip의 소스 읽기, 구성 파일 존재 확인, 방화벽 프로필·감사 정책·보안 로그 상태 읽기. 시스템 설정·계정·방화벽 규칙·감사 정책은 바꾸지 않았고 `semgrep` 계열은 실행하지 않았다.

## 부록 A: PyPI `semgrep 1.180.0` 공식 배포 파일 8개

출처: `https://pypi.org/pypi/semgrep/1.180.0/json`의 `digests.sha256`(Simple API와 같은 값). 이번에 받은 것은 `win_amd64` 휠 하나뿐이고, 나머지는 공시값만 기록했다(받지도 계산하지도 않았다). 휠 이름의 공통 접두 `semgrep-1.180.0-cp310.cp311.cp312.cp313.cp314.py310.py311.py312.py313.py314-none-`는 줄였다.

| 플랫폼 태그 | 크기(바이트) | 공식 SHA-256 | 업로드 시각 |
| --- | --- | --- | --- |
| macosx_10_14_x86_64 | 45,810,903 | `f074dcfd6a56095fde32c354af27ef0cce6d15607bef42fa50964dd7042b667d` | 2026-10-07T23:24:26Z |
| macosx_11_0_arm64 | 49,794,130 | `9c61070eaa7de785a8318e1d00de6c9151efa660cc3e58c3e2ffd6f5e6180af7` | 2026-10-07T23:24:30Z |
| manylinux_2_34_aarch64 | 72,563,288 | `cba06f64b10e5ec86a0b3a9757cfdfdf3ce6c2bbdb5e98762aa2a4b0a296f8ca` | 2026-10-07T23:24:34Z |
| manylinux_2_34_x86_64 | 70,564,254 | `16db2e2706ab814a975eeec25debfad49abba846b7c513d88e041447152f8447` | 2026-10-07T23:24:38Z |
| musllinux_1_2_aarch64 | 79,472,194 | `1bab359e562f0af00217f9f827531c2e1375499b8559c90bed9690007e82565d` | 2026-10-07T23:24:43Z |
| musllinux_1_2_x86_64 | 77,124,939 | `d19b447b5d49c435dda099fd5f9d96ec7822e98a8ea6df16630f4f0596ed27ed` | 2026-10-07T23:24:47Z |
| win_amd64 | 58,108,036 | `b403865e64f5ba0691630adf9bc13592cc38830726d4a114960d7e2d3fb21fc6` | 2026-10-07T23:24:52Z |
| (소스 배포, sdist) | 518,569 | `14aee785d0bc9656027a33fca7f97e88e089dbc6c7ed3df47f454b0584b0a3d0` | 2026-10-07T23:22:36Z |

## 부록 B: 설치된 의존성 66개와 인덱스가 알려 준 휠 해시

`pip install --report`가 기록한 값(66개 모두 `https://files.pythonhosted.org/packages/…` 휠, `semgrep` 자신 제외). **인덱스가 알려 준 해시를 옮겼을 뿐 각 파일을 직접 다시 계산하지 않았다**(미확인 6). 다음 단계에서 `pip install --require-hashes`로 고정하려면 `semgrep==1.180.0`의 검증한 해시(`b403865e…fc6`)를 이 목록에 더해 쓴다. 이 목록은 제안일 뿐 어떤 파일에도 적용하지 않았다.

```text
annotated-types==0.8.0 --hash=sha256:f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0
anyio==4.15.1 --hash=sha256:6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101
attrs==26.1.0 --hash=sha256:c647aa4a12dfbad9333ca4e71fe62ddc36f4e63b2d260a37a8b83d2f043ac309
boltons==21.0.0 --hash=sha256:b9bb7b58b2b420bbe11a6025fdef6d3e5edc9f76a42fb467afe7ca212ef9948b
bracex==3.2 --hash=sha256:8f3e908a452f66707e1d6d91b3d7d7d4c649d248df18537c0dc710aeb9c30d87
certifi==2026.10.23 --hash=sha256:e9b54de76e530bb6cf0ccd036787103acb58fd42ba930ea8bf948ddbaa2f61d1
cffi==2.1.1 --hash=sha256:f53e442b08449d42821fa4a4fba000095af9f62742a500f978a9f557ec44339a
charset-normalizer==3.5.2 --hash=sha256:780fbe7cab297b81dad9fb8dc5eb003c0468ffb0d9e5f65068c53a34661a96bc
click==8.4.2 --hash=sha256:e6f9f66136c816745b9d65817da91d61d957fb16e02e4dcd0552553c5a197b76
click-option-group==0.5.9 --hash=sha256:ad2599248bd373e2e19bec5407967c3eec1d0d4fc4a5e77b08a0481e75991080
colorama==0.4.6 --hash=sha256:4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6
cryptography==50.0.2 --hash=sha256:7afa5a6602a9f29af1f3a2965f831bae7c9d5d597b7cbb716d41ab3b7d89879c
exceptiongroup==1.2.2 --hash=sha256:3111b9d131c238bec2f8f516e123e14ba243563fb135d3fe885990585aa7795b
face==26.0.1 --hash=sha256:ab0a83c37c9789dce658a67a9a80eafaa113c9ec37c5a9d950ff5480542a062d
glom==25.12.0 --hash=sha256:b9f21e77f71a6576a43864e85066b8cc3f0f778d0d50961563f8981377a6dcb1
googleapis-common-protos==1.76.0 --hash=sha256:59e13344a9f3651aa201a03e2bee815a3bf43a4baf1f9ff8a9b62a840ce25fac
h11==0.16.0 --hash=sha256:63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86
httpcore==1.0.9 --hash=sha256:2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55
httpx==0.28.1 --hash=sha256:d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad
httpx-sse==0.4.3 --hash=sha256:0ac1c9fe3c0afad2e0ebb25a934a59f4c7823b60792691f779fad2c5568830fc
idna==3.20 --hash=sha256:ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c
importlib_metadata==8.7.1 --hash=sha256:5a1f80bf1daa489495071efbb095d75a634cf28a8bc299581244063b53176151
jsonschema==4.25.1 --hash=sha256:3fba0169e345c7175110351d456342c364814cfcf3b964ba4587f22915230a63
jsonschema-specifications==2025.9.1 --hash=sha256:98802fee3a11ee76ecaca44429fda8a41bff98b00a0f2838151b113f210cc6fe
markdown-it-py==4.2.0 --hash=sha256:9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a
mcp==1.29.0 --hash=sha256:f5a075bb611f23d6f4d080c6a1699fa62772eebc562ba9e66b306ddde1c755f7
mdurl==0.1.2 --hash=sha256:84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8
opentelemetry-api==1.37.0 --hash=sha256:accf2024d3e89faec14302213bc39550ec0f4095d1cf5ca688e1bfb1c8612f47
opentelemetry-exporter-otlp-proto-common==1.37.0 --hash=sha256:53038428449c559b0c564b8d718df3314da387109c4d36bd1b94c9a641b0292e
opentelemetry-exporter-otlp-proto-http==1.37.0 --hash=sha256:54c42b39945a6cc9d9a2a33decb876eabb9547e0dcb49df090122773447f1aef
opentelemetry-instrumentation==0.58b0 --hash=sha256:50f97ac03100676c9f7fc28197f8240c7290ca1baa12da8bfbb9a1de4f34cc45
opentelemetry-instrumentation-requests==0.58b0 --hash=sha256:672a0be0bb5b52bea0c11820b35e27edcf4cd22d34abe4afc59a92a80519f8a8
opentelemetry-instrumentation-threading==0.58b0 --hash=sha256:eacc072881006aceb5b9b6831bcdce718c67ef6f31ac0b32bd6a23a94d979b4a
opentelemetry-proto==1.37.0 --hash=sha256:8ed8c066ae8828bbf0c39229979bdf583a126981142378a9cbe9d6fd5701c6e2
opentelemetry-sdk==1.37.0 --hash=sha256:8f3c3c22063e52475c5dbced7209495c2c16723d016d39287dfc215d1771257c
opentelemetry-semantic-conventions==0.58b0 --hash=sha256:5564905ab1458b96684db1340232729fce3b5375a06e140e8904c78e4f815b28
opentelemetry-util-http==0.58b0 --hash=sha256:6c6b86762ed43025fbd593dc5f700ba0aa3e09711aedc36fd48a13b23d8cb1e7
packaging==26.3 --hash=sha256:d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c
peewee==3.19.0 --hash=sha256:de220b94766e6008c466e00ce4ba5299b9a832117d9eb36d45d0062f3cfd7417
protobuf==6.33.6 --hash=sha256:0cd27b587afca21b7cfa59a74dcbd48a50f0a6400cfb59391340ad729d91d326
pycparser==3.12 --hash=sha256:a076f3f489b39b43ed13563a1dafe42447445bec2e294154ec5c57fcdda4c85e
pydantic==2.14.1 --hash=sha256:9195d967ec791692a04438115466764fb8b9a27b31f14a760437694f40d6b454
pydantic-settings==2.16.1 --hash=sha256:30f5313340da4e8f1b440d1910b92a5bc3ccbb6b4ba70ec2b8395bc921f418f5
pydantic_core==2.50.1 --hash=sha256:132529c83901437ff642f585216831bf5fd7a91df66829907e155192ead62498
Pygments==2.21.0 --hash=sha256:2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9
PyJWT==2.15.1 --hash=sha256:42d59d631f7768a1028a64c7ff581a9bf7519804daf91fc5b6c56e30eec5e193
python-dotenv==1.2.4 --hash=sha256:42269a8a5b3fd54ffa6f3d84b18abed50064717576b4ecf03dc4a55d8aa04fdc
python-multipart==0.0.32 --hash=sha256:ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23
pywin32==311 --hash=sha256:b8c095edad5c211ff31c05223658e71bf7116daa0ecf3ad85f3201ea3190d067
referencing==0.37.0 --hash=sha256:381329a9f99628c9069361716891d34ad94af76e461dcb0335825aecc7692231
requests==2.34.2 --hash=sha256:2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0
rich==15.0.0 --hash=sha256:33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb
rpds-py==2026.9.1 --hash=sha256:5ce8943f79c2210f7abcc28e86367b03b28d95027fd01c46d2472373ae70c86f
ruamel.yaml==0.19.1 --hash=sha256:27592957fedf6e0b62f281e96effd28043345e0e66001f97683aa9a40c667c93
ruamel.yaml.clib==0.2.15 --hash=sha256:2b216904750889133d9222b7b873c199d48ecbb12912aca78970f84a5aa1a4bc
semantic-version==2.10.0 --hash=sha256:de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177
sse-starlette==3.6.0 --hash=sha256:e4dfa4d237d2712cb2b4d4918eda9b457cd6b44bbecdc838af75de836565bafd
starlette==1.10.0 --hash=sha256:478c0ab3b4ced6e82719849c118fa406f0278a3499c1a898cd15cd31bdc38ce4
tomli==2.4.1 --hash=sha256:52c8ef851d9a240f11a88c003eacb03c31fc1c9c4ec64a99a0f922b93874fda9
typing-inspection==0.4.4 --hash=sha256:65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147
typing_extensions==4.16.0 --hash=sha256:481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8
urllib3==2.8.0 --hash=sha256:0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3
uvicorn==0.54.0 --hash=sha256:505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf
wcmatch==8.5.2 --hash=sha256:17d3ad3758f9d0b5b4dedc770b65420d4dac62e680229c287bf24c9db856a478
wrapt==1.17.3 --hash=sha256:e71d5c6ebac14875668a1e90baf2ea0ef5b7ac7918355850c0908ae82bcb297c
zipp==4.1.2 --hash=sha256:b30cb6cd253122169c47de245ca24a86bac2a5d3802ba15bf7ba6414eb9e144d
```

