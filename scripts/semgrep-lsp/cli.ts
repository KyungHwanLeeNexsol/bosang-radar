// 명령줄 진입점(ADR D10). 모든 명령은 명시적으로 호출하며, 저장소·SHA·경로에는 기본값이 없다.
// 이 파일의 `main`은 환경(process.env·argv·exit)을 직접 만지지 않는다 — 모든 의존성(파일·git·프로세스 포트·시계·
// 출력·환경변수 조회)은 `CliDeps`로 주입된다. 실제 어댑터를 잇는 일은 맨 아래 진입점 한 곳에서만 하고, 그 진입점은
// 이 파일을 직접 실행할 때만 돈다(import만으로는 아무것도 하지 않는다).
//
// 공개 API:
//   main(argv, deps): Promise<number>      argv는 `node cli.ts` 뒤의 인자들
//   CliDeps / EXIT
//
// 명령:
//   precheck --rules-cache <dir> [--scan-tree <dir> --repo <dir> --target-sha <40hex>]
//   scope    --repo <dir> --target-sha <40hex> [--format json|tsv]
//   run      --mode control|target --run-id <id> --rules-cache <dir> --evidence-root <dir> ... (아래 usage)
//            실제 실행 방지 장치를 통과해야만 프로세스 포트를 만든다.
//   negative-control --suite-id <id> --rules-cache <dir> --evidence-root <dir> --work-root <dir> ... (아래 usage)
//            음성 대조(R1~R9)를 사례별 작업 공간에서 실행해 스위트 기록을 남긴다. 정상 실행(run)에 붙지 않는 별도 명령이며 같은
//            방지 장치를 통과해야만 프로세스 포트를 만든다. control 실행이 --negative-controls로 그 기록을 명시해야 이어진다.
//
// 종료 코드: 0 통과(run은 측정 COMPLETE일 때만), 1 불일치·거부·하드 실패, 2 사용법 오류, 3 NOT_RUN(방지 장치).
//
// 이 파일은 quality.yaml·lsp.yaml·임계값·훅을 읽지도 쓰지도 않는다. 출력은 기존 어떤 게이트도 소비하지 않는다.

import { isAbsolute, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { SystemClock } from "./clock";
import { createNodeArtifactHasher } from "./artifact-node";
import { SERVER_STATE_DIR, VERSION_STATE_DIR } from "./evidence";
import { createNodeFs } from "./fs-node";
import { createNodeGit } from "./git-node";
import { runHarness, type HarnessOptions } from "./harness";
import { failedMetricsReceiver, startMetricsReceiver, type MetricsReceiver } from "./metrics-node";
import {
  SUITE_RECORD_FILE,
  outputPathProblem,
  runNegativeControls,
  writePlanFor,
  type CaseResources,
  type RunKey,
} from "./negative-control";
import { loadNegativeControlSuite, serializeSuite } from "./negative-control-record";
import { evidenceInsideServerTree } from "./path-containment";
import { createNodeProcessLister } from "./process-list-node";
import { createNodeProcessPort } from "./process-node";
import { runForeignProcessObservation } from "./process-observation";
import { loadControlReference } from "./reference-record";
import {
  RulesManifestParseError,
  checkRulesPin,
  compareRulesTree,
  parseExpectedRules,
  parseRulesFiles,
  rulesTreeConfigFromPin,
} from "./rules-manifest";
import {
  RECOVERY_HINT,
  acquireRunLock,
  lockSummaryOf,
  releaseRunLock,
  type RunLockPort,
} from "./run-lock";
import { RUN_ID_RULE, isValidRunId } from "./run-id";
import { createNodeRunLockPort } from "./run-lock-node";
import { computeScope, resolveTarget, verifyScanTree } from "./scope";
import type { SessionLimits } from "./session";
import { representativeStatus, sortReasons, type Reason } from "./status";
import { runToolObservation, type ArtifactHashPort } from "./tool-observation";
import {
  SCHEMAS,
  type Clock,
  type FsPort,
  type GitPort,
  type Pin,
  type ProcessLister,
  type ProcessPort,
  type Provenance,
  type ScopeConfig,
  type SpawnSpec,
  type VersionCheckChildState,
} from "./types";

// ── 공개 타입 ───────────────────────────────────────────────────

export const EXIT = { ok: 0, failed: 1, usage: 2, notRun: 3 } as const;

export interface CliDeps {
  fs: FsPort;
  /** 저장소 폴더마다 읽기 전용 git 포트를 만든다. SHA 형식 검사를 통과하기 전에는 부르지 않는다. */
  makeGit(repoDir: string): GitPort;
  /** 실제 실행 방지 장치를 통과한 뒤에만 `run`이 "real"로 부른다. 그 밖의 경로는 부르지 않는다. */
  makeProcessPort(provenance: Provenance): ProcessPort;
  clock: Clock;
  /** 공유 실행 잠금의 파일 시스템 포트. 서버가 스캔하는 트리 하나를 범위로 한다(run-lock.ts). */
  runLock: RunLockPort;
  /**
   * 루프백 메트릭 수신기를 연다. 자식 프로세스를 띄우기 전에 준비되고 판정 시점까지 요청을 누적 관측한다. 열지 못해도 던지지
   * 않고 관측 실패 상태(hits=null)의 수신기를 돌려준다 — 실패를 0건으로 바꾸지 않는다.
   */
  startMetricsReceiver(): Promise<MetricsReceiver>;
  /** 명시한 휠 아티팩트 파일 하나의 실제 바이트로 SHA-256을 계산한다(읽기 전용). 경로를 찾거나 내려받지 않는다. */
  hashArtifact: ArtifactHashPort;
  /**
   * 운영체제 프로세스 목록을 읽는 어댑터를 만든다(읽기 전용). 방지 장치를 통과한 `run`이 버전 확인·LSP 서버와 **같은** 프로세스 포트를
   * 넘겨 부른다(조회 자식을 띄우는 Windows 어댑터가 그 포트를 쓴다). 지원하지 않는 환경이면 UNSUPPORTED_PLATFORM으로 끝나는 어댑터다.
   */
  makeProcessLister(port: ProcessPort): ProcessLister;
  /** 이 하네스(검사 프로그램 자신)의 PID. 목록에서 자기 자신·조상·자손을 가려내는 데 쓴다. */
  ownPid: number;
  stdout(text: string): void;
  stderr(text: string): void;
  /** 환경변수 한 개를 조회한다(없으면 undefined). main은 이 함수로만 환경을 본다. */
  getEnv(name: string): string | undefined;
  /** pin.json·scope.json·rules-*.tsv·control-expectations.json이 있는 폴더(고정 입력). */
  dataDir: string;
  /** "win32" 등. 자식 환경 허용 목록을 고르는 데만 쓴다. */
  platform: string;
  /** 중단 신호(선택). run이 하네스에 넘긴다. */
  signal?: AbortSignal;
}

// ── 상수 ────────────────────────────────────────────────────────

const ENV_ALLOW_REAL = "MOAI_SEMGREP_LSP_ALLOW_REAL";
const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * 수신기를 열지 못했을 때의 자리표시: 아무것도 듣지 않는 루프백 주소(포트 9). 이때 metricsReceiverHits는 관측 실패(null)라
 * 실행은 사전 검사가 아니라 판정에서 ISOLATION_VIOLATION으로 끝난다. 열었다면 환경에는 수신기의 실제 주소가 들어간다.
 */
const LOOPBACK_URL = "http://127.0.0.1:9";

// UNVERIFIED(ADR U3/U12): 실제 서버가 이 인자로 LSP를 여는지는 실행해 보지 않았다.
const SERVER_ARGS = ["lsp", "--debug"] as const;

// UNVERIFIED: 실제 실행의 한도와 시간 제한 요청값은 실측하지 못한 추정이다(ms, 초). 근거 없이 줄이지 않는다.
const REAL_LIMITS: SessionLimits = {
  init: 60_000,
  rules: 600_000,
  scan: 1_800_000,
  echo: 60_000,
  exit: 30_000,
  killGrace: 10_000,
};
const REAL_SETTINGS = { timeout: 30, timeoutThreshold: 3 } as const;

/** 실제 실행이 COMPLETE에 이르기 전에 구현·확인되어야 하는 것(항상 출력에 싣는다). */
const NOT_VERIFIED = [
  "도구 버전 관측: --semgrep-bin을 `--version` 인자 배열로 한 번 실행해(서버가 아니다) stdout의 한 줄 `숫자.숫자.숫자`만 버전으로 받는다. 실패·형식 불일치·미시도는 toolVersionObserved=null이며 핀 값으로 채우지 않는다. 이 해석 계약은 실제 Semgrep으로 확인하지 않았다(미확인)",
  "휠 sha256 관측: --wheel-artifact로 명시한 파일의 바이트 해시다. 주지 않거나 읽지 못하면 wheelSha256Observed=null. 핀의 휠 해시가 null이거나 verified가 아니면 관측해도 비교할 기준이 없어 WHEEL_HASH_UNVERIFIED로 거부된다. 이 해시는 그 파일의 바이트에 대한 사실일 뿐 실행 파일의 설치 출처(그 휠에서 설치되었는지)를 확인하지 않았다",
  "같은 트리의 다른 서버 프로세스 관측: 운영체제 프로세스 목록을 조회한 **그 시점**의 읽기 전용 관측이다(Windows는 PowerShell CIM, Linux는 /proc, 그 밖은 미지원=null). 조회 이후 하네스 밖에서 시작되는 프로세스는 막지 못하고, 어떤 프로세스도 끝내거나 정리하지 않는다. 목록을 읽지 못했거나 후보를 판별하지 못하면 foreignServerProcesses=null이며 0으로 채우지 않는다(공유 잠금을 얻었다는 이유로도). 식별 규칙(프로그램 이름·`lsp` 인자)은 실제 Semgrep으로 확인하지 않았고, LSP 서버의 작업 폴더는 목록에서 보이지 않아, 같은 트리로 확인되지 않은 보이는 서버는 '다른 트리'가 아니라 판별 불가(null)로 둔다. 건수 0은 식별 규칙에 맞는 다른 서버 후보가 보이지 않았다는 뜻이지 다른 서버가 없다는 증명이 아니다. 다른 사용자·컨테이너·다른 호스트의 프로세스는 관측하지 않는다. 합성 자료나 Node 스텁의 결과는 실제 Semgrep 프로세스 식별의 증거가 아니다. macOS는 지원·검증하지 않았다",
  "루프백 메트릭 수신기: 127.0.0.1의 OS 할당 포트에 열어 판정 시점까지 누적 관측한다 — metricsReceiverHits는 그 관측이다(열지 못하면 null). 0건은 이 수신기에서 관찰한 요청이 없다는 뜻일 뿐 다른 목적지로의 통신이 없었다는 증거가 아니며, 실제 Semgrep이 SEMGREP_METRICS_URL 등을 읽는지는 미확인",
  "대조 참조(control_reference): --control-record로 명시한 control run.json만 읽어 잇는다(자동 탐색 없음), 생략하면 controlReference=null",
  "음성 대조(negative-control 명령): R1~R9를 사례별 작업 공간에서 실행해 스위트 기록을 남기고, control 실행이 --negative-controls로 명시한 기록만 증거에서 다시 도출해 잇는다. 정상 run에 자동으로 붙지 않는다. 표의 R9 엔진 층은 기대 상태(ISOLATION_VIOLATION)가 같은 변형이 반드시 내는 SETTINGS_MISMATCH에 가려져 실행하지 않고 NOT_RUN(BLOCKED_CONTRACT_CONFLICT)으로 남기므로, 이 결정이 내려지기 전에는 어떤 기록도 자격을 갖출 수 없다. 이 결과는 스텁이면 SYNTHETIC이고 실제 엔진이 변형에 어떻게 반응하는지는 미확인이다",
  "공유 실행 잠금: 서버가 스캔하는 트리 하나를 범위로 한 배타 생성(O_EXCL) 파일이다. 오래된 잠금은 자동으로 지우지 않고 거절한다(복구는 README). 겹치는 트리·배타 생성을 보장하지 않는 파일 시스템은 보증하지 않는다. run.marker는 잠금이 아니라 실행별 증거 표지다",
  "서버 인자 `lsp --debug`: 미확인(ADR U3/U12)",
  "자식 환경변수 이름(SEMGREP_*): 하네스가 정한 이름이며 실제 서버가 읽는 이름과 같다는 것은 미확인",
  "SEMGREP_METRICS 계열 값: 필요하다고 확인된 것이 없어 보내지 않는다(메트릭은 initializationOptions로 끈다)",
  "세션 한도와 시간 제한 요청값: 실측하지 않은 추정값",
] as const;

// ── 사용법 ──────────────────────────────────────────────────────

const USAGE = `semgrep-lsp 하네스 CLI (ADR-001, Proposed) — Semgrep을 설치하거나 찾지 않는다.

사용법:
  cli.ts precheck --rules-cache <dir> [--scan-tree <dir> --repo <dir> --target-sha <40자 SHA>]
  cli.ts scope --repo <dir> --target-sha <40자 SHA> [--format json|tsv]
  cli.ts run --mode control|target --run-id <id> --rules-cache <dir> --evidence-root <dir>
             --repo <dir> --target-sha <40자 SHA> --scan-root <dir>
                 [--control-fixtures-root <dir>] [--control-record <run.json>]  (target)
             --control-fixtures-root <dir> --control-tree-root <dir>           (control)
             --allow-real-semgrep --semgrep-bin <절대 경로> [--wheel-artifact <절대 경로>]
             [--negative-controls <negative-controls.json>]                    (control)
  cli.ts negative-control --suite-id <id> --rules-cache <dir> --evidence-root <dir>
             --work-root <절대 경로> --control-fixtures-root <dir>
             --allow-real-semgrep --semgrep-bin <절대 경로> [--wheel-artifact <절대 경로>]
  cli.ts --help

run은 아래 셋이 모두 있을 때만 프로세스를 띄운다. 하나라도 없으면 NOT_RUN(종료 코드 3)이다.
  1. --allow-real-semgrep
  2. 환경변수 ${ENV_ALLOW_REAL}=1
  3. --semgrep-bin <존재하는 절대 경로>   (PATH 탐색·자동 설치·기본값 없음)

--run-id: 영숫자로 시작하고 영숫자·.·_·-만 쓴 1~128자(증거 폴더 이름). 어긋나면 경로를 만들거나 잠금 등을 얻기 전에 종료 코드 2로 끝난다.
  단, 위 실행 방지 장치는 인자 검사보다 먼저 보므로 장치를 통과하지 못하면 --run-id와 관계없이 NOT_RUN(3)이다.

도구 관측(run): 잠금과 증거 표지를 얻은 실행에서만, 서버를 띄우기 전에 두 가지를 관측한다. 관측하지 못한 값은 null이라 사전 검사가 거부한다.
  · 버전: --semgrep-bin을 셸 없이 인자 배열 ["--version"]으로 한 번 실행한다(LSP 서버 프로세스가 아니다). 시간 제한·출력 크기 제한·취소를
    지키고 끝나면 자식을 정리한다. 종료 코드 0이고 stdout이 정확히 한 줄 \`숫자.숫자.숫자\`일 때만 그 문자열을 버전으로 받는다(stderr는
    해석하지 않는다). 그 밖의 출력은 관측 실패다. 이 해석 계약은 실제 Semgrep으로 확인하지 않았다.
  · 휠: --wheel-artifact로 명시한 절대 경로 파일 하나의 실제 바이트로 SHA-256을 계산한다. 생략하거나 읽지 못하면 관측 실패(null)다. 기본 경로·
    자동 탐색·내려받기는 없다. 이 해시는 그 파일의 바이트에 대한 사실이며 실행 파일이 그 휠에서 설치되었다는 확인이 아니다.
  관측값은 핀의 기대값·verified 상태와 따로 기록한다. 관측했다는 이유로 pin.json을 바꾸지 않는다.

다른 서버 프로세스 관측(run): 잠금과 증거 표지를 얻은 실행에서만, 도구 관측 뒤 서버를 띄우기 전에 운영체제 프로세스 목록을 **읽기만** 한다.
  · 조회 시점의 관측이다. 조회 이후 하네스 밖에서 시작되는 프로세스까지 막는다는 뜻이 아니다. 다른 프로세스를 끝내거나 정리하지 않는다.
  · 하네스 자신·조상·자손, 버전 확인(\`--version\`) 프로세스, 서버(\`lsp\`) 프로세스를 인자 배열로 구분한다. 프로세스 이름 한 가지만으로 판정하지 않는다.
  · 서버 후보는 작업 폴더·인자 속 경로를 실제 위치(별칭·링크 해석)로 풀어 서버 트리와 견준다. 같은 트리면 건수에 세고, 관계를 확인하지 못하면
    (작업 폴더를 알 수 없음·경로를 풀 수 없음·트리를 감싸는 폴더·역할 불명·읽는 도중 사라짐) 건수를 0으로 채우지 않고 null이다.
  · 목록을 읽지 못하면(미지원 환경·실행 실패·권한 부족·시간 초과·출력 파손·취소) null이다. null이거나 1 이상이면 서버 트리를 준비하지 않고 서버를 띄우지 않는다.
  · 요약(상태·건수·이유 토큰)만 증거에 싣는다. 명령줄·환경변수·경로·PID는 싣지 않는다.

--control-fixtures-root: 대조 예제(.in)가 놓인 저장소 루트. 두 모드 모두 대조 지문을 이 위치의 파일 바이트로 계산한다.
  target에서는 검사 대상인 --repo와 별개의 경로다(대상 SHA에는 예제가 없을 수 있다). target에서 생략하거나 읽을 수 없으면
  대조 지문은 null(확인하지 못함)이고 대조 참조는 거절된다. --control-tree-root는 control에서만 쓴다.

--control-record: 대조(control) 실행이 남긴 run.json 하나를 명시한다(target 전용). 최신 기록 자동 탐색도 기본 경로도 없다.
  검사 대상(--repo), 대조 예제(--control-fixtures-root), 대조 기록(--control-record)은 서로 다른 세 경로다.
  생략하면 대조 참조가 없어 CONTROL_REFERENCE_MISSING이다(기존 동작).
  기록은 구조가 맞는 control 실행 기록이어야 하고, 저장된 eligible 선언은 믿지 않고 기록의 사실로 자격을 다시 계산한다:
  출처 real, 측정 COMPLETE, 대조 단언 PASS, N0 확정, 지문 값과 결합이 모두 있고, 음성 대조 두 층 16쌍이 PASS이며 같은 결합이다.
  음성 대조 PASS는 expected가 현재 표의 기준과 같고 observed가 null이 아니며 그 기대와 같아야 한다(보정하지 않고 거절한다).
  검사 목록은 완전해야 한다: 기록의 checks가 기대 사례(하네스가 쓰는 data/control-expectations.json, 대조 지문과 같은 입력)에서
  도출한 필요한 검사(사례별 A1 또는 A3, 적용되는 A2·A4, 정상 쌍 PAIR)와 id·kind·file까지 같아야 한다(순서는 상관없다).
  누락·중복·예상 밖 검사·잘못된 조합은 거절하고, 기대 입력을 읽거나 검증하지 못하면 EXPECTATIONS_UNAVAILABLE로 거절한다.
  세부 결과와 요약이 모순이면 거절한다: COMPLETE 측정의 reasons·design_errors는 비어 있고, checks는 항목별 구조가 맞으며,
  저장된 대조 단언 상태는 세부 결과로 계산한 값과 같아야 한다(기록의 자기 일관성이며 서명·출처 인증은 아니다).
  target 기록과 stub(SYNTHETIC) 기록은 참조가 될 수 없다. 수락한 기록도 이번 실행의 핀·도구·규칙·하네스·대조 지문 및 결합과 다시 맞춘다.
  명시했는데 수락하지 못하면(없음·읽기 실패·깨진 JSON·스키마나 필드 오류·자격 불충족·기록 내부 모순) 참조 없이 진행하고
  CONTROL_REFERENCE_RECORD_REJECTED(이유 토큰)와 CONTROL_REFERENCE_MISSING을 남기며 COMPLETE가 될 수 없다. control 모드에서는 쓸 수 없다.

음성 대조(negative-control): 정상 run과 별개의 명령이다. 같은 실행 방지 장치를 통과해야 하고, 정상 실행에 자동으로 붙지 않는다.
  · 변하지 않은 입력의 기준 실행 하나와, NEGATIVE_CONTROL_TABLE의 (id, 층)마다 입력을 변형한 실행을 사례별 작업 공간(--work-root 아래)에서
    돌린다. 원본 규칙 캐시·대조 예제는 읽기만 하고 사본을 변형한다. 사례마다 증거 폴더가 따로이고 서버 트리마다 공유 잠금·루프백
    수신기·다른 서버 프로세스 관측을 쥔다(run과 같은 계약).
  · 사전 검사 층은 엔진을 띄우지 못하게 감싼 포트로 정상 진입점을 돌려 거부를 관측한다. 엔진 층은 엔진 진단 진입점으로 돌리며, 엔진이 실제로
    떴을 때만 관측이 성립한다(미기동은 NOT_RUN). 변형이 부른 사전 검사 사유만 있을 때 사유를 판정에 담은 채 띄우고, 도구·휠·환경변수·잠금·
    다른 서버 같은 사유가 있으면 정상 실행처럼 띄우지 않는다.
  · observed는 하네스가 낸 판정이다. 기대와 같고 표의 사유가 있고 결합이 기준과 같을 때만 PASS이며, 미실행·취소·실패·증거 누락은 NOT_RUN이다.
    엔진 층은 대표 상태가 아니라 사유와 도달한 단계를 본다: 규칙 로딩(PH2)에 이르기 전의 초기화·전송 실패는 NOT_RUN이고, 사전 검사 사유가
    상태를 가리는 id(R1~R5·R7)는 엔진 고유 관측의 계약이 확정되지 않아 실행해도 NOT_RUN이다.
  · 기준 실행이 COMPLETE가 아니면(도구·휠 관측 실패 등) 변형의 효과를 가릴 수 없어 전부 NOT_RUN이다.
  · 도구 관측 단계(버전 확인)에서 루프백 수신기가 요청을 본 것이 0건으로 확인되지 않으면(1건 이상·관측 실패·요약 없음) 기준·변형 서버를
    하나도 시작하지 않고 전부 NOT_RUN이다(출력의 blocked). 관측값은 바꾸지 않는다.
  · --evidence-root·--work-root 아래에 쓰게 될 경로가 원본(--rules-cache·--control-fixtures-root·고정 데이터·하네스) 안이면, 포트·잠금·표지·
    상태 폴더를 만들기 전에 사용법 오류로 거절한다(링크·별칭·..를 푼 실제 위치 기준).
  · 표에서 도출한 계약 충돌(엔진 기대가 같은 변형이 반드시 내는 사전 검사 사유에 가려지는 (id, 엔진))은 실행하지 않고 NOT_RUN으로 남긴다.
    현재 표에서는 R9 엔진이 여기에 해당하므로, 이 결정이 내려지기 전에는 어떤 실행에서도 종료 코드가 0이 될 수 없다(출력의 conflicts).
  · 결과는 <evidence-root>/<suite-id>/negative-controls.json에 쓴다. 16개가 모두 PASS일 때만 종료 코드 0이다.
--negative-controls: control 실행이 위 스위트 기록 하나를 명시한다(control 전용, 자동 탐색·기본 경로 없음). 저장된 항목 선언은 읽지 않고
  사례별 증거(run.json)를 같은 --evidence-root에서 다시 읽어 항목을 재도출한다. 이번 실행의 결합·출처와 다르면 항목을 쓰지 않는다.

실행 자원(run): 서버가 스캔하는 트리(target은 --scan-root, control은 --control-tree-root) 하나를 범위로 공유 실행 잠금을 얻는다.
  잠금 파일은 그 트리의 부모 폴더에 semgrep-lsp-tree-<키>.lock으로 만들고, 같은 트리면 --run-id·--evidence-root가 달라도 충돌한다.
  오래된 잠금(해제하지 못하고 끝난 실행)은 소유자 상태를 확인하지 않고 자동으로 지우지 않는다 — 거절하고 출력의 lock.path·lock.holder를
  알려 준다. 소유자가 끝났음을 확인한 뒤 운영자가 직접 지운다(README '오래된 잠금 복구'). 증거 폴더의 run.marker는 잠금이 아니라 표지다.
  루프백 메트릭 수신기는 127.0.0.1의 OS 할당 포트에 자식 프로세스보다 먼저 열고, 판정 시점까지 요청 건수만 센다(본문·헤더 없음).
  열지 못하거나 관측이 깨지면 0건이 아니라 관측 실패다. 끝나면 수신기를 닫고 잠금을 해제한다(출력의 cleanup).

종료 코드: 0 통과 / 1 불일치·거부·실패 / 2 사용법 오류 / 3 NOT_RUN(실행 방지 장치)
`;

// ── 인자 해석 ───────────────────────────────────────────────────

const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  precheck: ["rules-cache", "scan-tree", "repo", "target-sha"],
  scope: ["repo", "target-sha", "format"],
  run: [
    "mode",
    "run-id",
    "rules-cache",
    "evidence-root",
    "semgrep-bin",
    "repo",
    "target-sha",
    "scan-root",
    "control-fixtures-root",
    "control-tree-root",
    "control-record",
    "negative-controls",
    "wheel-artifact",
  ],
  "negative-control": [
    "suite-id",
    "rules-cache",
    "evidence-root",
    "work-root",
    "semgrep-bin",
    "control-fixtures-root",
    "wheel-artifact",
  ],
};
const FLAGS: Record<string, readonly string[]> = {
  precheck: [],
  scope: [],
  run: ["allow-real-semgrep"],
  "negative-control": ["allow-real-semgrep"],
};

interface Parsed {
  command: string;
  options: Map<string, string>;
  flags: Set<string>;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): Parsed | "help" {
  if (argv.length === 0) throw new UsageError("명령이 없다");
  if (argv[0] === "help" || argv.some((a) => a === "--help" || a === "-h")) return "help";
  const [command, ...rest] = argv;
  const valueOptions = COMMAND_OPTIONS[command];
  if (valueOptions === undefined) throw new UsageError(`알 수 없는 명령: ${command}`);
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--")) throw new UsageError(`예상하지 못한 인자: ${token}`);
    const eq = token.indexOf("=");
    const name = token.slice(2, eq === -1 ? undefined : eq);
    if (FLAGS[command].includes(name)) {
      if (eq !== -1) throw new UsageError(`--${name}은 값을 받지 않는다`);
      if (flags.has(name)) throw new UsageError(`--${name}이 중복됐다`);
      flags.add(name);
      continue;
    }
    if (!valueOptions.includes(name))
      throw new UsageError(`${command}에서 쓸 수 없는 옵션: --${name}`);
    if (options.has(name)) throw new UsageError(`--${name}이 중복됐다`);
    let value: string | undefined;
    if (eq !== -1) value = token.slice(eq + 1);
    else {
      value = rest[i + 1];
      i++;
    }
    if (value === undefined || value === "" || (eq === -1 && value.startsWith("--"))) {
      throw new UsageError(`--${name}에 값이 없다`);
    }
    options.set(name, value);
  }
  return { command, options, flags };
}

function need(parsed: Parsed, name: string): string {
  const value = parsed.options.get(name);
  if (value === undefined) throw new UsageError(`--${name}이 필요하다`);
  return value;
}

function needSha(parsed: Parsed, name = "target-sha"): string {
  const value = need(parsed, name);
  if (!FULL_SHA.test(value)) {
    throw new UsageError(`--${name}은 소문자 40자 16진수 커밋 SHA여야 한다(브랜치·약식 SHA 불가)`);
  }
  return value;
}

// ── 공통 도구 ───────────────────────────────────────────────────

const decoder = new TextDecoder();

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function joinPath(root: string, name: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${name}`;
}

/** 경로의 부모 폴더. 드라이브 루트("C:")는 "C:/"로, 최상위는 "/" 또는 "."로 돌려준다. */
function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (cut < 0) return ".";
  if (cut === 0) return "/";
  const parent = trimmed.slice(0, cut);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}

function reasonList(reasons: readonly Reason[]): { code: string; detail: string | null }[] {
  return reasons.map((r) => ({ code: r.code, detail: r.detail ?? null }));
}

async function readText(deps: CliDeps, name: string): Promise<string> {
  try {
    return decoder.decode(await deps.fs.readFile(joinPath(deps.dataDir, name)));
  } catch (error) {
    throw new Error(`고정 입력 ${name}을(를) 읽지 못했다: ${errorText(error)}`);
  }
}

async function readJson<T>(deps: CliDeps, name: string, schema: string): Promise<T> {
  let value: unknown;
  try {
    value = JSON.parse(await readText(deps, name));
  } catch (error) {
    throw new Error(`${name}: ${errorText(error)}`);
  }
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { schema?: unknown }).schema !== schema
  ) {
    throw new Error(`${name}: 스키마가 ${schema}이 아니다`);
  }
  return value as T;
}

// ── precheck ────────────────────────────────────────────────────

async function cmdPrecheck(parsed: Parsed, deps: CliDeps): Promise<number> {
  const rulesCache = need(parsed, "rules-cache");
  const group = ["scan-tree", "repo", "target-sha"].filter((n) => parsed.options.has(n));
  if (group.length !== 0 && group.length !== 3) {
    throw new UsageError("--scan-tree, --repo, --target-sha는 함께 주거나 모두 생략해야 한다");
  }
  const withScanTree = group.length === 3;
  const targetSha = withScanTree ? needSha(parsed) : null;

  let pin: Pin;
  let reasons: Reason[] = [];
  const details: Record<string, unknown> = {};
  try {
    pin = await readJson<Pin>(deps, "pin.json", SCHEMAS.pin);
    const rulesFiles = parseRulesFiles(await readText(deps, "rules-files.tsv"));
    const expectedRules = parseExpectedRules(await readText(deps, "rules-expected.tsv"));
    details.rules_files_expected = rulesFiles.length;
    details.expected_rules = expectedRules.length;

    // 이 CLI가 서버 없이 확인할 수 있는 PH0 검사: 고정 목록의 자기 일관성과 규칙 캐시 내용.
    // 도구 버전·휠·환경·잠금·다른 서버 프로세스는 실행 중에만 관측되므로 여기서 보지 않는다.
    reasons.push(...checkRulesPin(rulesFiles, expectedRules, pin.rules));
    reasons.push(
      ...(await compareRulesTree(
        deps.fs,
        rulesCache,
        rulesFiles,
        rulesTreeConfigFromPin(pin.rules)
      ))
    );

    if (withScanTree) {
      const git = deps.makeGit(need(parsed, "repo"));
      const scopeConfig = await readJson<ScopeConfig>(deps, "scope.json", SCHEMAS.scope);
      const target = await resolveTarget(git, targetSha as string);
      if (!target.ok) reasons.push(...target.reasons);
      else {
        const scope = await computeScope(git, target.sha, scopeConfig);
        details.target_sha = target.sha;
        details.scope_sha256 = scope.scopeSha256;
        details.scope_included = scope.included.length;
        details.scope_excluded_counts = scope.excludedCounts;
        reasons.push(
          ...(await verifyScanTree(deps.fs, scope, need(parsed, "scan-tree"), scopeConfig))
        );
      }
    }
  } catch (error) {
    const message = error instanceof RulesManifestParseError ? error.message : errorText(error);
    deps.stderr(`precheck를 끝까지 수행하지 못했다: ${message}\n`);
    return EXIT.failed;
  }

  reasons = sortReasons(reasons);
  deps.stdout(
    json({
      command: "precheck",
      ok: reasons.length === 0,
      representative_status: reasons.length === 0 ? null : representativeStatus(reasons),
      reasons: reasonList(reasons),
      checked: { rules_pin: true, rules_tree: true, scan_tree: withScanTree },
      not_checked: ["도구 버전·휠 sha256", "자식 환경변수", "실행 잠금", "다른 서버 프로세스"],
      details,
    })
  );
  return reasons.length === 0 ? EXIT.ok : EXIT.failed;
}

// ── scope ───────────────────────────────────────────────────────

async function cmdScope(parsed: Parsed, deps: CliDeps): Promise<number> {
  const repo = need(parsed, "repo");
  const sha = needSha(parsed);
  const format = parsed.options.get("format") ?? "json";
  if (format !== "json" && format !== "tsv") throw new UsageError("--format은 json 또는 tsv다");

  try {
    const git = deps.makeGit(repo);
    const scopeConfig = await readJson<ScopeConfig>(deps, "scope.json", SCHEMAS.scope);
    const target = await resolveTarget(git, sha);
    if (!target.ok) {
      deps.stderr(
        `대상 SHA를 해석하지 못했다: ${target.reasons.map((r) => r.detail).join("; ")}\n`
      );
      return EXIT.failed;
    }
    const scope = await computeScope(git, target.sha, scopeConfig);
    if (format === "json") {
      deps.stdout(
        json({
          command: "scope",
          target_sha: scope.targetSha,
          scope_sha256: scope.scopeSha256,
          included: scope.included.length,
          total: scope.entries.length,
          excluded_counts: scope.excludedCounts,
          files: scope.entries.map((e) => ({
            path: e.path,
            blob: e.blobSha,
            decision: e.decision,
            reason: e.reason,
          })),
        })
      );
    } else {
      const lines = [
        `# target_sha\t${scope.targetSha}`,
        `# scope_sha256\t${scope.scopeSha256}`,
        `# included\t${scope.included.length}`,
        ...Object.entries(scope.excludedCounts).map(([reason, n]) => `# excluded\t${reason}\t${n}`),
        ...scope.entries.map((e) => `${e.path}\t${e.blobSha}\t${e.decision}\t${e.reason ?? ""}`),
      ];
      deps.stdout(`${lines.join("\n")}\n`);
    }
    return EXIT.ok;
  } catch (error) {
    deps.stderr(`scope를 계산하지 못했다: ${errorText(error)}\n`);
    return EXIT.failed;
  }
}

// ── run ─────────────────────────────────────────────────────────

/** 실제 실행 방지 장치: 셋 중 빠진 조건의 이름을 돌려준다(비어 있으면 통과). 프로세스 포트는 만들지 않는다. */
async function missingGuardConditions(parsed: Parsed, deps: CliDeps): Promise<string[]> {
  const missing: string[] = [];
  if (!parsed.flags.has("allow-real-semgrep")) missing.push("flag:--allow-real-semgrep");
  if (deps.getEnv(ENV_ALLOW_REAL) !== "1") missing.push(`env:${ENV_ALLOW_REAL}=1`);
  const bin = parsed.options.get("semgrep-bin");
  if (bin === undefined) missing.push("arg:--semgrep-bin(not-given)");
  else if (!isAbsolute(bin)) missing.push("arg:--semgrep-bin(not-absolute)");
  else {
    let exists = false;
    try {
      exists = await deps.fs.exists(bin);
    } catch {
      exists = false;
    }
    if (!exists) missing.push("arg:--semgrep-bin(missing)");
  }
  return missing;
}

/** 자식 환경: 최소 허용 목록 + 루프백 URL + 증거 폴더 안의 상태 파일 경로. 토큰·기밀은 복사하지 않는다. */
/**
 * 자식 프로세스 환경. 메트릭·버전 확인·앱 URL은 모두 하네스가 연 수신기의 실제 주소로 돌린다(metricsUrl). 수신기를 열지 못했으면
 * 자리표시 주소(LOOPBACK_URL)를 쓰며, 이 경우 판정은 관측 실패로 끝난다.
 */
export function buildChildEnv(
  deps: Pick<CliDeps, "getEnv" | "platform">,
  evidenceDir: string,
  metricsUrl: string | null,
  /** 상태·로그 파일을 둘 증거 폴더 안의 하위 폴더. 버전 확인 프로세스는 LSP 서버와 섞이지 않게 따로 쓴다. */
  stateDirName: string = SERVER_STATE_DIR
): Record<string, string> {
  const names =
    deps.platform === "win32" ? ["PATH", "SYSTEMROOT", "TEMP", "TMP"] : ["PATH", "HOME"];
  const env: Record<string, string> = {};
  for (const name of names) {
    const value = deps.getEnv(name);
    if (value !== undefined && value !== "") env[name] = value;
  }
  const state = joinPath(evidenceDir, stateDirName);
  const url = metricsUrl ?? LOOPBACK_URL;
  return {
    ...env,
    SEMGREP_APP_URL: url,
    SEMGREP_METRICS_URL: url,
    SEMGREP_VERSION_CHECK_URL: url,
    SEMGREP_LOG_FILE: joinPath(state, "semgrep.log"),
    SEMGREP_SETTINGS_FILE: joinPath(state, "settings.yml"),
    SEMGREP_VERSION_CACHE_PATH: joinPath(state, "version-cache"),
  };
}

/** control 모드는 git을 쓰지 않는다. 쓰려 하면 던지는 포트로 막는다. */
const refusingGit: GitPort = {
  async resolveCommit() {
    throw new Error("control 모드에서는 git을 쓰지 않는다");
  },
  async lsTree() {
    throw new Error("control 모드에서는 git을 쓰지 않는다");
  },
  async readBlob() {
    throw new Error("control 모드에서는 git을 쓰지 않는다");
  },
};

async function cmdRun(parsed: Parsed, deps: CliDeps): Promise<number> {
  // 1. 방지 장치. 인자 검증보다 먼저 보고, 하나라도 빠지면 어떤 포트도 만들지 않고 끝난다.
  const missing = await missingGuardConditions(parsed, deps);
  if (missing.length > 0) {
    deps.stdout(
      json({
        command: "run",
        status: "NOT_RUN",
        reason: "실제 실행 방지 장치를 통과하지 못했다 — 아무것도 시작하지 않았다",
        missing_conditions: missing,
      })
    );
    return EXIT.notRun;
  }

  // 2. 인자
  const mode = need(parsed, "mode");
  if (mode !== "control" && mode !== "target")
    throw new UsageError("--mode는 control 또는 target이다");
  const runId = need(parsed, "run-id");
  // --run-id는 증거 폴더 이름이 되어 아래 모든 경로(증거·상태 폴더·표지)에 들어간다. 경로를 만들거나 읽기·잠금·수신기·프로세스
  // 포트 같은 자원을 얻기 전에, 하네스와 같은 순수 규칙(run-id.ts)으로 거절한다. 값은 오류에 되풀이하지 않는다.
  if (!isValidRunId(runId)) throw new UsageError(`--run-id는 ${RUN_ID_RULE}여야 한다`);
  const rulesCache = need(parsed, "rules-cache");
  const evidenceRoot = need(parsed, "evidence-root");
  const bin = need(parsed, "semgrep-bin");
  // 휠 아티팩트는 명시한 절대 경로 하나뿐이다(기본 경로·자동 탐색·내려받기 없음). 생략하면 휠 해시는 관측하지 않는다(null).
  const wheelArtifact = parsed.options.get("wheel-artifact") ?? null;
  if (wheelArtifact !== null && !isAbsolute(wheelArtifact)) {
    throw new UsageError("--wheel-artifact는 절대 경로여야 한다(상대 경로·자동 탐색 없음)");
  }
  // 대조 기록은 target에서 경로를 명시했을 때만 읽는다(자동 탐색·기본 경로 없음). control 실행은 대조 참조를 가질 수 없다.
  const recordPath = parsed.options.get("control-record");
  if (mode === "control" && recordPath !== undefined) {
    throw new UsageError(
      "--control-record는 target 모드에서만 쓴다(control 실행은 대조 참조를 가질 수 없다)"
    );
  }
  // 음성 대조 스위트 기록은 control에서 경로를 명시했을 때만 읽는다(자동 탐색·기본 경로 없음, target 실행에는 붙지 않는다).
  const negativeControlsPath = parsed.options.get("negative-controls");
  if (mode === "target" && negativeControlsPath !== undefined) {
    throw new UsageError(
      "--negative-controls는 control 모드에서만 쓴다(target 실행은 음성 대조를 가지지 않는다)"
    );
  }
  let targetSha: string | null = null;
  let git: GitPort = refusingGit;
  let scanRoot: string;
  let controlFixturesRoot: string;
  let controlTreeRoot: string;
  // 사용하지 않는 모드의 경로는 하네스가 만지지 않는다. 혹시 만지더라도 증거 폴더 밖을 건드리지 않도록 그 안을 가리킨다.
  const unused = joinPath(joinPath(evidenceRoot, runId), "UNUSED-IN-THIS-MODE");
  if (mode === "target") {
    targetSha = needSha(parsed);
    scanRoot = need(parsed, "scan-root");
    // 하네스는 target에서도 대조 지문을 계산하므로 대조 예제의 실제 위치가 필요하다. 이 위치는 --repo(검사 대상)와 별개다:
    // 대상 SHA에는 예제가 없을 수 있어 --repo 아래에 있다고 가정하지 않는다. 주지 않으면 존재하지 않는 자리표시 경로를 넘겨
    // 지문이 null(확인하지 못함)이 되고 대조 참조는 거절된다 — 거짓 지문도, 참조 값 복사도 없다.
    controlFixturesRoot =
      parsed.options.get("control-fixtures-root") ??
      joinPath(joinPath(evidenceRoot, runId), "CONTROL-FIXTURES-NOT-GIVEN");
    controlTreeRoot = unused; // target은 대조 트리를 쓰지 않는다.
    git = deps.makeGit(need(parsed, "repo"));
  } else {
    scanRoot = unused;
    controlFixturesRoot = need(parsed, "control-fixtures-root");
    controlTreeRoot = need(parsed, "control-tree-root");
  }

  const evidenceDir = joinPath(evidenceRoot, runId);
  // 공유 잠금의 범위는 서버가 스캔하는 트리 하나다: target은 스캔 트리, control은 대조 트리.
  const serverTree = mode === "target" ? scanRoot : controlTreeRoot;
  // 증거(run.marker·semgrep-state 포함)는 서버 트리 밖에 쓴다. 잠금을 얻기 전, 아무것도 만들기 전에 거절한다. 포함 관계는 문자열이
  // 아니라 증거를 쓰게 될 파일 시스템 포트가 실제로 접근할 자리(링크·junction·`..`·상대 경로를 푼 자리)로 판단하고, 안전하게 풀 수
  // 없으면 거절한다. 확인은 읽기만 한다 — 보호 트리 안에 폴더나 탐침 파일을 만들지 않는다. (runHarness가 같은 검사를 독립적으로 한다.)
  let overlaps: boolean;
  try {
    overlaps = await evidenceInsideServerTree(deps.fs, evidenceDir, serverTree);
  } catch (error) {
    throw new UsageError(
      `증거 폴더(--evidence-root)와 서버 트리(--scan-root·--control-tree-root)의 위치 관계를 안전하게 판별하지 못했다: ${errorText(error)}`
    );
  }
  if (overlaps) {
    throw new UsageError(
      "--evidence-root 아래의 실행 폴더가 서버 트리(--scan-root·--control-tree-root)와 같거나 그 안에 있다 (링크·`..`·상대 경로를 푼 실제 위치 기준)"
    );
  }

  // 3. 자원: 공유 실행 잠금 → 실행별 증거 표지 → 루프백 수신기. 어떤 경로(정상·사전 검사 거부·예외·취소)로 끝나도 finally가
  // 정리한다. 잠금은 얻은 실행만 자기 토큰으로 해제하고, 오래된 잠금을 자동으로 지우지 않는다.
  const lock = await acquireRunLock(deps.runLock, { treePath: serverTree, runId, mode });
  let markerCreated = false;
  let receiver: MetricsReceiver = failedMetricsReceiver("BIND_FAILED");
  let judgedHits: number | null | undefined;
  const cleanup = {
    lock: {
      state: (lock.state === "ACQUIRED" ? "NOT_RELEASED" : "NOT_ACQUIRED") as
        "RELEASED" | "NOT_RELEASED" | "NOT_ACQUIRED",
      reason: null as string | null,
      /** 해제하지 못했을 때만: 남은 잠금 파일의 경로와 복구 안내(자동으로 지우지 않는다). */
      path: null as string | null,
      recovery: null as string | null,
    },
    metrics_receiver: {
      closed: false,
      final_hits: null as number | null,
      hits_after_judgment: null as number | null,
    },
    /** 버전 확인 자식 프로세스(LSP 서버가 아니다)의 정리 결과. 시작하지 않았으면 NOT_SPAWNED. */
    version_check_process: {
      state: "NOT_SPAWNED" as VersionCheckChildState,
    },
  };
  const releaseAll = async (): Promise<void> => {
    try {
      await receiver.close();
      cleanup.metrics_receiver.closed = true;
    } catch {
      cleanup.metrics_receiver.closed = false;
    }
    // 판정 뒤 닫기까지 들어온 요청도 알린다(판정에는 반영하지 못한 건수).
    // 정리는 던지지 않는다: 관측하지 못하면 null로 남긴다(0건으로 간주하지 않는다).
    let finalHits: number | null = null;
    try {
      finalHits = receiver.observe().hits;
    } catch {
      finalHits = null;
    }
    cleanup.metrics_receiver.final_hits = finalHits;
    if (typeof judgedHits === "number" && finalHits !== null) {
      cleanup.metrics_receiver.hits_after_judgment = Math.max(0, finalHits - judgedHits);
    }
    if (lock.state === "ACQUIRED") {
      const released = await releaseRunLock(deps.runLock, lock.handle);
      cleanup.lock.state = released.state === "RELEASED" ? "RELEASED" : "NOT_RELEASED";
      cleanup.lock.reason = released.state === "RELEASED" ? null : released.reason;
      if (released.state !== "RELEASED") {
        cleanup.lock.path = lock.handle.lockPath;
        cleanup.lock.recovery = RECOVERY_HINT;
      }
    }
  };

  let body: Record<string, unknown>;
  let complete = false;
  try {
    if (lock.state === "ACQUIRED") {
      // 실행별 증거 표지: 같은 증거 폴더를 두 번 쓰지 않게 한다. 공유 잠금이 아니다.
      try {
        await deps.fs.mkdirp(joinPath(evidenceDir, "semgrep-state"));
        await deps.fs.writeFileExclusive(
          joinPath(evidenceDir, "run.marker"),
          new TextEncoder().encode(`${JSON.stringify({ run_id: runId, mode })}\n`)
        );
        markerCreated = true;
      } catch {
        markerCreated = false;
      }
    }
    // 잠금을 얻었고 표지도 만든 경우에만 true다. 못 얻었거나 확인하지 못했으면 값을 보정하지 않는다.
    const lockHeld = lock.state === "ACQUIRED" && markerCreated;
    const lockRefusal =
      lock.state !== "ACQUIRED"
        ? lock.reason
        : markerCreated
          ? null
          : "EVIDENCE_MARKER_NOT_CREATED";

    // 수신기는 자식 프로세스를 띄우기 전에 준비한다.
    try {
      receiver = await deps.startMetricsReceiver();
    } catch {
      receiver = failedMetricsReceiver("BIND_FAILED");
    }

    // 명시한 기록을 읽고 구조·자격을 다시 확인한다(던지지 않는다). 수락하지 못하면 참조 없이 진행하고 이유를 판정에 남긴다.
    let controlReference: HarnessOptions["controlReference"] = null;
    let controlReferenceRejection: string | null = null;
    if (recordPath !== undefined) {
      const loaded = await loadControlReference(deps.fs, recordPath, deps.dataDir);
      controlReference = loaded.reference;
      controlReferenceRejection = loaded.rejection;
    }

    // 명시한 음성 대조 스위트 기록을 읽는다(던지지 않는다). 저장된 항목 선언은 읽지 않고 사례별 증거에서 다시 도출한다. 하네스는 이번
    // 실행의 결합·출처와 맞을 때만 항목을 쓴다. 명시하지 않았으면 16개 전부 NOT_RUN이다.
    const negativeControlSuite =
      negativeControlsPath === undefined
        ? null
        : await loadNegativeControlSuite(deps.fs, negativeControlsPath, evidenceRoot);

    // 프로세스 포트는 방지 장치를 통과한 이 경로에서 한 번만 만들고, 버전 확인과 하네스(LSP 서버)가 같은 포트를 쓴다. 출처(provenance)가
    // 한 곳에서 정해지므로 stub 포트의 관측이 real로 기록되지 않는다.
    const port = deps.makeProcessPort("real");

    // 도구 버전(`--version`을 한 번 실행)과 휠 해시를 관측한다. 공유 잠금과 증거 표지를 얻은 실행에서만 시작한다. 관측하지 못한 값은
    // null이고 사전 검사가 거부한다. 대조 기록의 도구 버전·휠 값은 여기에 쓰이지 않는다(현재 실행의 관측만 쓴다).
    const versionStateDir = joinPath(evidenceDir, VERSION_STATE_DIR);
    const tools = await runToolObservation({
      fs: deps.fs,
      process: port,
      clock: deps.clock,
      hasher: deps.hashArtifact,
      lockHeld,
      version: {
        command: bin,
        cwd: versionStateDir,
        stateDir: versionStateDir,
        env: buildChildEnv(deps, evidenceDir, receiver.url, VERSION_STATE_DIR),
      },
      wheelPath: wheelArtifact,
      receiver,
      ...(deps.signal ? { signal: deps.signal } : {}),
    });
    cleanup.version_check_process.state = tools.versionChildProcess;

    // 같은 서버 트리의 다른 Semgrep LSP 프로세스를 **조회 시점에** 관측한다(읽기만 한다 — 아무 프로세스도 끝내지 않는다). 공유 잠금과
    // 증거 표지를 얻은 실행에서만 시작하고, 잠금을 얻었다는 이유로 건수를 0으로 채우지 않는다. 읽지 못하거나 판별하지 못하면 null이다.
    // 이 건수가 0으로 확정되지 않으면 하네스는 서버 트리를 준비하지 않고 서버도 띄우지 않는다.
    const foreign = await runForeignProcessObservation({
      lister: deps.makeProcessLister(port),
      fs: deps.fs,
      lockHeld,
      context: { ownPid: deps.ownPid, serverTree, semgrepBin: bin },
      ...(deps.signal ? { signal: deps.signal } : {}),
    });

    const spawn: SpawnSpec = {
      command: bin,
      args: [...SERVER_ARGS],
      cwd: parentOf(rulesCache),
      env: buildChildEnv(deps, evidenceDir, receiver.url),
    };

    const options: HarnessOptions = {
      mode,
      targetSha,
      runId,
      dataDir: deps.dataDir,
      // 하네스 구현 파일이 있는 폴더 = 고정 입력 폴더(data/)의 부모. 하네스 지문을 계산할 때 읽는다.
      harnessRoot: parentOf(deps.dataDir),
      evidenceRoot,
      rulesCacheRoot: rulesCache,
      scanRoot,
      controlFixturesRoot,
      controlTreeRoot,
      spawn,
      limits: REAL_LIMITS,
      settings: REAL_SETTINGS,
      controlReference,
      controlReferenceRejection,
      negativeControlSuite,
      // 이 실행이 직접 관측한 값만 넘긴다. 관측하지 못했으면 null이고 사전 검사가 사유로 읽는다(핀 값으로 채우지 않는다).
      toolVersionObserved: tools.toolVersionObserved,
      wheelSha256Observed: tools.wheelSha256Observed,
      toolObservation: tools.summary,
      lockHeld,
      lockRefusal,
      lockSummary: lockSummaryOf(lock, markerCreated),
      // 조회 시점의 관측 결과만 넘긴다. 잠금을 얻었다는 이유로 0으로 채우지 않으며, 읽지 못했거나 판별하지 못했으면 null이다.
      foreignServerProcesses: foreign.foreignServerProcesses,
      foreignProcessObservation: foreign.summary,
      // 시작 시점의 스냅샷이 아니라, 하네스가 판정하는 시점에 수신기에서 읽은 누적 관측을 쓴다.
      metricsReceiverHits: null,
      metricsReceiver: receiver,
      ...(deps.signal ? { signal: deps.signal } : {}),
    };

    // 4. 방지 장치를 통과한 이 경로에서만 "real" 포트를 만든다.
    const result = await runHarness(
      { fs: deps.fs, git, process: port, clock: deps.clock },
      options
    );
    const record = result.record;
    complete = result.ok && record !== null && record.measurement.complete;
    judgedHits = record?.resources?.metrics_receiver?.hits;
    body = {
      command: "run",
      status: record?.measurement.status ?? "HARD_FAILURE",
      ok: result.ok,
      started: result.started,
      complete,
      failure: result.failure ?? null,
      record:
        record === null
          ? null
          : {
              run_id: record.run_id,
              mode: record.mode,
              provenance: record.provenance,
              trust: record.trust,
              measurement: record.measurement,
              candidate_gate: record.candidate_gate,
              resources: record.resources ?? null,
            },
      control_record:
        recordPath === undefined
          ? { given: false }
          : {
              given: true,
              path: recordPath,
              accepted: controlReference !== null,
              run_id: controlReference?.run_id ?? null,
              rejection: controlReferenceRejection,
            },
      // 음성 대조 스위트: 읽는 쪽의 결과. 하네스가 결합·출처를 맞춰 본 최종 수락 여부는 record.resources.negative_control_suite에 있다.
      negative_controls:
        negativeControlSuite === null
          ? { given: false }
          : { given: true, path: negativeControlsPath, loaded: negativeControlSuite.summary },
      // 잠금 파일의 경로와 다른 실행의 소유자 정보는 운영자가 복구할 때 필요해서 여기(출력)에만 싣는다. 증거에는 싣지 않는다.
      lock: {
        state: lock.state,
        reason: lock.state === "ACQUIRED" ? null : lock.reason,
        scope: "server-tree",
        tree_key_sha256: lock.keySha256,
        path: lock.state === "ACQUIRED" ? lock.handle.lockPath : lock.lockPath,
        evidence_marker: markerCreated ? "CREATED" : "NOT_CREATED",
        holder: lock.state === "REFUSED" ? lock.holder : null,
        error_code: lock.state === "ERROR" ? lock.code : null,
        recovery: lock.state === "ACQUIRED" ? null : RECOVERY_HINT,
      },
      // 도구 버전·휠 해시 관측(출력 전용: 아티팩트 경로는 증거에 싣지 않는다). 시작하지 않았거나 실패했으면 값은 null이다.
      tool_observation: { ...tools.summary, wheel_artifact: wheelArtifact },
      // 같은 트리의 다른 서버 프로세스 관측(조회 시점). 증거(run.json)에 싣는 것과 같은 요약이다.
      foreign_server_observation: foreign.summary,
      // 자식 환경에 연결한 수신기의 실제 주소(루프백, OS 할당 포트). 열지 못했으면 null이다.
      metrics_receiver_url: receiver.url,
      evidence_dir: evidenceDir,
      not_implemented_or_not_verified: NOT_VERIFIED,
    };
  } finally {
    await releaseAll();
  }
  // 정리에 실패하면(잠금을 해제하지 못함) 측정이 끝났어도 실패로 끝낸다 — 오래된 잠금을 남겼다는 뜻이다.
  const cleanedUp =
    cleanup.lock.state !== "NOT_RELEASED" &&
    cleanup.metrics_receiver.closed &&
    cleanup.version_check_process.state !== "KILL_NOT_OBSERVED";
  deps.stdout(json({ ...body, cleanup }));
  return complete && cleanedUp ? EXIT.ok : EXIT.failed;
}

// ── negative-control ────────────────────────────────────────────

/** 서버 트리 하나를 쥔 동안의 자원(공유 잠금·증거 표지·루프백 수신기). */
interface HeldResources {
  evidenceDir: string;
  lock: Awaited<ReturnType<typeof acquireRunLock>>;
  lockHeld: boolean;
  markerCreated: boolean;
  receiver: MetricsReceiver;
}

/**
 * 음성 대조 스위트를 실행한다(R1~R9). 정상 `run`과 별개의 명령이며 정상 실행에서 자동으로 불리지 않는다. 같은 실행 방지 장치를 통과해야만
 * 프로세스 포트를 만든다. 사례마다 자기 서버 트리를 범위로 공유 잠금 → 증거 표지 → 루프백 수신기 → 다른 서버 프로세스 관측 순서로
 * 자원을 쥐고(run과 같은 계약), 끝나면 어떤 경로로든 수신기를 닫고 잠금을 해제한다. 도구 버전·휠 관측은 스위트 전체에서 한 번 하고 모든
 * 사례의 결합에 쓴다. 결과(스위트 기록)는 증거 폴더에 쓰고, control 실행이 --negative-controls로 명시해야 이어진다.
 */
async function cmdNegativeControl(parsed: Parsed, deps: CliDeps): Promise<number> {
  // 1. 방지 장치. 인자 검증보다 먼저 보고, 하나라도 빠지면 어떤 포트도 만들지 않고 끝난다.
  const missing = await missingGuardConditions(parsed, deps);
  if (missing.length > 0) {
    deps.stdout(
      json({
        command: "negative-control",
        status: "NOT_RUN",
        reason: "실제 실행 방지 장치를 통과하지 못했다 — 아무것도 시작하지 않았다",
        missing_conditions: missing,
      })
    );
    return EXIT.notRun;
  }

  // 2. 인자
  const suiteId = need(parsed, "suite-id");
  if (!isValidRunId(suiteId)) throw new UsageError(`--suite-id는 ${RUN_ID_RULE}여야 한다`);
  const rulesCache = need(parsed, "rules-cache");
  const evidenceRoot = need(parsed, "evidence-root");
  const workRoot = need(parsed, "work-root");
  const bin = need(parsed, "semgrep-bin");
  const controlFixturesRoot = need(parsed, "control-fixtures-root");
  const wheelArtifact = parsed.options.get("wheel-artifact") ?? null;
  if (wheelArtifact !== null && !isAbsolute(wheelArtifact)) {
    throw new UsageError("--wheel-artifact는 절대 경로여야 한다(상대 경로·자동 탐색 없음)");
  }
  if (!isAbsolute(workRoot)) {
    throw new UsageError(
      "--work-root는 절대 경로여야 한다(사례별 작업 공간과 잠금 파일이 이 아래에 놓인다)"
    );
  }
  const suiteDir = joinPath(evidenceRoot, suiteId);
  const suiteTree = joinPath(workRoot, suiteId);
  let overlaps: boolean;
  try {
    overlaps = await evidenceInsideServerTree(deps.fs, suiteDir, suiteTree);
  } catch (error) {
    throw new UsageError(
      `증거 폴더(--evidence-root)와 작업 공간(--work-root)의 위치 관계를 안전하게 판별하지 못했다: ${errorText(error)}`
    );
  }
  if (overlaps) {
    throw new UsageError("--evidence-root 아래의 스위트 폴더가 작업 공간(--work-root)과 겹친다");
  }
  // 쓰게 될 경로 전부가 원본(규칙 캐시·대조 예제·고정 데이터·하네스) 안에 들어가지 않는지 본다: 스위트·사례별 증거 폴더와 그 안의 표지·상태
  // 폴더, 작업 공간, 그리고 규칙 사본·밖 사본·대조 트리 안의 파일 경로까지(사례 폴더는 정상이어도 그 아래가 링크일 수 있다). 포트·잠금·표지·
  // 상태 폴더·수신기를 만들기 전에, 읽기만으로 거절한다. runNegativeControls도 같은 검사를 독립적으로 한다.
  const outputInputs = {
    suiteId,
    workRoot,
    evidenceRoot,
    rulesCacheRoot: rulesCache,
    controlFixturesRoot,
    dataDir: deps.dataDir,
    harnessRoot: parentOf(deps.dataDir),
  };
  const writePlan = await writePlanFor(deps.fs, outputInputs);
  const outputProblem = await outputPathProblem(deps.fs, {
    ...outputInputs,
    ...(writePlan === null ? {} : { plan: writePlan }),
  });
  if (outputProblem !== null) {
    throw new UsageError(
      `--evidence-root·--work-root가 원본(규칙 캐시·대조 예제·고정 데이터·하네스)과 겹치거나 그 안에 있다 (${outputProblem}) — 증거와 작업 공간은 원본 밖의 별도 폴더여야 한다`
    );
  }

  // 3. 방지 장치를 통과한 이 경로에서만 "real" 포트를 만든다(사례 실행과 도구 관측이 같은 포트를 쓴다).
  const port = deps.makeProcessPort("real");

  const cleanups: {
    run_id: string;
    lock: "RELEASED" | "NOT_RELEASED" | "NOT_ACQUIRED";
    receiver_closed: boolean;
  }[] = [];
  /** 서버 트리 하나를 쥐고 fn을 부른다. 어떤 경로(정상·예외·취소)로 끝나도 수신기를 닫고 얻은 잠금만 자기 토큰으로 해제한다. */
  const holding = async <T>(
    runId: string,
    serverTree: string,
    fn: (held: HeldResources) => Promise<T>
  ): Promise<T> => {
    const evidenceDir = joinPath(evidenceRoot, runId);
    const lock = await acquireRunLock(deps.runLock, {
      treePath: serverTree,
      runId,
      mode: "control",
    });
    const note: (typeof cleanups)[number] = {
      run_id: runId,
      lock: lock.state === "ACQUIRED" ? "NOT_RELEASED" : "NOT_ACQUIRED",
      receiver_closed: false,
    };
    cleanups.push(note);
    let markerCreated = false;
    let receiver: MetricsReceiver = failedMetricsReceiver("BIND_FAILED");
    try {
      if (lock.state === "ACQUIRED") {
        try {
          await deps.fs.mkdirp(joinPath(evidenceDir, SERVER_STATE_DIR));
          await deps.fs.writeFileExclusive(
            joinPath(evidenceDir, "run.marker"),
            new TextEncoder().encode(`${JSON.stringify({ run_id: runId, mode: "control" })}\n`)
          );
          markerCreated = true;
        } catch {
          markerCreated = false;
        }
      }
      try {
        receiver = await deps.startMetricsReceiver();
      } catch {
        receiver = failedMetricsReceiver("BIND_FAILED");
      }
      return await fn({
        evidenceDir,
        lock,
        lockHeld: lock.state === "ACQUIRED" && markerCreated,
        markerCreated,
        receiver,
      });
    } finally {
      try {
        await receiver.close();
        note.receiver_closed = true;
      } catch {
        note.receiver_closed = false;
      }
      if (lock.state === "ACQUIRED") {
        const released = await releaseRunLock(deps.runLock, lock.handle);
        note.lock = released.state === "RELEASED" ? "RELEASED" : "NOT_RELEASED";
      }
    }
  };

  // 4. 도구 버전·휠 해시: 스위트 전체에서 한 번 관측한다(모든 사례의 결합에 같은 값이 쓰인다). 관측하지 못하면 null이고, 그러면 기준 실행이
  // 깨끗하지 않아 모든 항목이 NOT_RUN이다.
  const versionStateDir = joinPath(suiteDir, VERSION_STATE_DIR);
  const tools = await holding(suiteId, suiteTree, (held) =>
    runToolObservation({
      fs: deps.fs,
      process: port,
      clock: deps.clock,
      hasher: deps.hashArtifact,
      lockHeld: held.lockHeld,
      version: {
        command: bin,
        cwd: versionStateDir,
        stateDir: versionStateDir,
        env: buildChildEnv(deps, held.evidenceDir, held.receiver.url, VERSION_STATE_DIR),
      },
      wheelPath: wheelArtifact,
      receiver: held.receiver,
      ...(deps.signal ? { signal: deps.signal } : {}),
    })
  );

  // 5. 사례 실행. 기준 실행 하나와 표의 (id, 층)마다의 변형 실행이 각자의 작업 공간·증거 폴더·자원으로 돈다.
  const suite = await runNegativeControls(
    {
      fs: deps.fs,
      git: refusingGit,
      clock: deps.clock,
      processFor: () => port,
      withResources: <T>(key: RunKey, fn: (resources: CaseResources) => Promise<T>): Promise<T> =>
        holding(key.runId, key.treeRoot, async (held) => {
          // 같은 트리의 다른 서버 프로세스를 조회 시점에 관측한다(읽기만). 잠금을 얻었다는 이유로 0으로 채우지 않는다.
          const foreign = await runForeignProcessObservation({
            lister: deps.makeProcessLister(port),
            fs: deps.fs,
            lockHeld: held.lockHeld,
            context: { ownPid: deps.ownPid, serverTree: key.treeRoot, semgrepBin: bin },
            ...(deps.signal ? { signal: deps.signal } : {}),
          });
          const lockRefusal =
            held.lock.state !== "ACQUIRED"
              ? held.lock.reason
              : held.markerCreated
                ? null
                : "EVIDENCE_MARKER_NOT_CREATED";
          return fn({
            lockHeld: held.lockHeld,
            lockRefusal,
            lockSummary: lockSummaryOf(held.lock, held.markerCreated),
            foreignServerProcesses: foreign.foreignServerProcesses,
            foreignProcessObservation: foreign.summary,
            // 시작 시점의 스냅샷이 아니라, 하네스가 판정하는 시점에 수신기에서 읽은 누적 관측을 쓴다.
            metricsReceiverHits: null,
            metricsReceiver: held.receiver,
            spawnEnv: buildChildEnv(deps, held.evidenceDir, held.receiver.url),
          });
        }),
    },
    {
      suiteId,
      workRoot,
      evidenceRoot,
      dataDir: deps.dataDir,
      harnessRoot: parentOf(deps.dataDir),
      rulesCacheRoot: rulesCache,
      controlFixturesRoot,
      spawn: { command: bin, args: [...SERVER_ARGS] },
      limits: REAL_LIMITS,
      settings: REAL_SETTINGS,
      toolVersionObserved: tools.toolVersionObserved,
      wheelSha256Observed: tools.wheelSha256Observed,
      toolObservation: tools.summary,
      ...(deps.signal ? { signal: deps.signal } : {}),
    }
  );

  // 6. 스위트 기록. 이미 있으면 덮어쓰지 않는다. control 실행이 --negative-controls로 이 경로를 명시해야 이어진다.
  const recordPath = joinPath(suiteDir, SUITE_RECORD_FILE);
  let recordWritten = false;
  try {
    await deps.fs.mkdirp(suiteDir);
    await deps.fs.writeFileExclusive(recordPath, new TextEncoder().encode(serializeSuite(suite)));
    recordWritten = true;
  } catch {
    recordWritten = false;
  }

  const counts = {
    pass: suite.entries.filter((e) => e.status === "PASS").length,
    fail: suite.entries.filter((e) => e.status === "FAIL").length,
    not_run: suite.entries.filter((e) => e.status === "NOT_RUN").length,
  };
  const cleanedUp =
    cleanups.every((c) => c.lock !== "NOT_RELEASED" && c.receiver_closed) &&
    tools.versionChildProcess !== "KILL_NOT_OBSERVED";
  const complete = counts.pass === suite.entries.length;
  deps.stdout(
    json({
      command: "negative-control",
      suite_id: suiteId,
      // 16개가 모두 PASS일 때만 COMPLETE다. 그 밖에는 INCOMPLETE이며 control 실행의 자격 계산이 NOT_RUN·FAIL을 막는다.
      status: complete ? "COMPLETE" : "INCOMPLETE",
      provenance: suite.provenance,
      binding_sha256: suite.binding_sha256,
      baseline: suite.baseline,
      counts,
      entries: suite.entries,
      cases: suite.cases.map((c) => ({ id: c.id, layer: c.layer, outcome: c.outcome })),
      conflicts: suite.conflicts,
      // 사례를 하나도 시작하지 못하게 막은 사유(없으면 null). 도구 관측 단계의 관측값은 바꾸지 않고 그대로 싣는다.
      blocked: suite.blocked,
      record: { written: recordWritten, path: recordPath },
      tool_observation: { ...tools.summary, wheel_artifact: wheelArtifact },
      cleanup: cleanups,
      not_established: suite.not_established,
      not_implemented_or_not_verified: NOT_VERIFIED,
    })
  );
  return complete && recordWritten && cleanedUp ? EXIT.ok : EXIT.failed;
}

// ── main ────────────────────────────────────────────────────────

// @MX:ANCHOR: [AUTO] CLI의 유일한 진입 함수 — 시험과 실제 진입점이 모두 이 함수를 부른다.
// @MX:REASON: "방지 장치를 통과하기 전에는 프로세스 포트를 만들지 않는다"가 cmdRun 한 곳에서만 지켜진다.
export async function main(argv: readonly string[], deps: CliDeps): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed === "help") {
      deps.stdout(USAGE);
      return EXIT.ok;
    }
    switch (parsed.command) {
      case "precheck":
        return await cmdPrecheck(parsed, deps);
      case "scope":
        return await cmdScope(parsed, deps);
      case "negative-control":
        return await cmdNegativeControl(parsed, deps);
      default:
        return await cmdRun(parsed, deps);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      deps.stderr(`${error.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    deps.stderr(`예상하지 못한 오류: ${errorText(error)}\n`);
    return EXIT.failed;
  }
}

// ── 진입점(직접 실행할 때만) ─────────────────────────────────────
// 아래는 이 파일을 직접 실행했을 때만 돈다. process.env·argv·exitCode를 만지는 곳은 여기뿐이다.

async function runEntry(): Promise<void> {
  const controller = new AbortController();
  // 취소(Ctrl+C·종료 요청)는 하네스를 멈추고 cmdRun의 finally가 잠금을 해제하고 수신기를 닫게 한다. 강제 종료(SIGKILL)·정전은
  // 정리할 수 없어 잠금이 남는다 — README '오래된 잠금 복구'. Windows는 SIGTERM을 전달하지 않는다.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => controller.abort());
  }
  // 출력 파이프를 읽는 쪽이 먼저 닫혀도(`| head`) 충돌하지 않는다. 그 밖의 쓰기 오류는 그대로 올린다.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") throw error;
    });
  }
  const code = await main(process.argv.slice(2), {
    fs: createNodeFs(),
    makeGit: (repoDir) => createNodeGit({ repoDir, env: process.env }),
    makeProcessPort: (provenance) => createNodeProcessPort({ provenance }),
    clock: new SystemClock(),
    runLock: createNodeRunLockPort(),
    startMetricsReceiver: () => startMetricsReceiver(),
    hashArtifact: createNodeArtifactHasher(),
    makeProcessLister: (port) =>
      createNodeProcessLister({
        platform: process.platform,
        process: port,
        clock: new SystemClock(),
        systemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT ?? null,
        env: Object.fromEntries(
          ["PATH", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"].flatMap((name) => {
            const value = process.env[name];
            return value === undefined || value === "" ? [] : [[name, value]];
          })
        ),
      }),
    ownPid: process.pid,
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    getEnv: (name) => process.env[name],
    dataDir: fileURLToPath(new URL("./data", import.meta.url)),
    platform: process.platform,
    signal: controller.signal,
  });
  process.exitCode = code;
}

const invokedPath = typeof process.argv[1] === "string" ? resolvePath(process.argv[1]) : "";
if (invokedPath.toLowerCase() === resolvePath(fileURLToPath(import.meta.url)).toLowerCase()) {
  void runEntry();
}
