// evaluate.ts 시험의 시나리오 표(시험 지원). 한 시나리오 = 합성 트랜스크립트 + 입력 + 기대(대표 상태, 사유 코드의
// *정확한* 집합). 같은 표를 여러 시험 파일이 돌려 쓰고, 표 전체로 "evaluate가 만드는 모든 사유가 한 번은 나온다"를
// 확인한다. 모든 트랜스크립트는 합성이다(provenance 기본 stub) — 실제 Semgrep의 출력이 아니다.

import { expect } from "vitest";
import { evaluateTranscript, type EvaluateInputs } from "../evaluate";
import { expectedUri } from "../uri";
import type { ReasonCode } from "../status";
import type { MeasurementStatus } from "../status";
import { buildBinding } from "../fingerprint";
import { sha256Hex } from "../sha";
import type { Mode, Pin, ReferenceFingerprints, Transcript, Verdict } from "../types";
import {
  CONTROL_EXPECTATIONS,
  CONTROL_REFERENCE_PASS,
  EXPECTED_RULES,
  LOADING_PATHS,
  PIN,
  RAW_PIN,
  TARGET_PATHS,
  TARGET_SCAN_ROOT,
  assertConsistent,
  buildRecord,
  codesOf,
  controlInputs,
  fullFingerprints,
  happyControl,
  happyTarget,
  qualifiedReference,
  scopeOf,
  targetInputs,
} from "./evaluate-fixtures";
import {
  IDS,
  after,
  appendCancelled,
  appendCleanup,
  appendExit,
  appendKill,
  appendSpawnFailed,
  appendStdinError,
  appendTimeout,
  atEnd,
  before,
  cutAfter,
  cutAfterEvent,
  dropBarrier,
  dropCleanup,
  dropEchoResponse,
  dropEvents,
  dropExit,
  dropSend,
  dropStderrLine,
  duplicateEvent,
  duplicateStderrLine,
  endByTimeout,
  errorResponse,
  insertEvents,
  insertPublish,
  insertStderrLine,
  insertStdoutMessage,
  mapEvents,
  moveAcrossStreams,
  notification,
  pipe,
  replaceStderrLine,
  replaceStdoutMessage,
  responseIs,
  response,
  sendIs,
  stderrIs,
  stdoutMethodIs,
  stripEnding,
  truncateStdout,
  type Mutator,
} from "./transcript-builder";
import type { HappySpec } from "./transcript-builder";

export interface Built {
  transcript: Transcript;
  inputs: EvaluateInputs;
}

export interface Scenario {
  id: string;
  title: string;
  mode: Mode;
  build: () => Built;
  status: MeasurementStatus;
  /** 사유 코드의 정확한 집합(중복 제거, 정렬). */
  codes: readonly ReasonCode[];
  check?: (verdict: Verdict, built: Built) => void;
}

// ── 만드는 도구 ─────────────────────────────────────────────────

const PUBLISH = stdoutMethodIs("textDocument/publishDiagnostics");
const uri = (path: string) => expectedUri(TARGET_SCAN_ROOT, path);
const RULE_A = EXPECTED_RULES[0].finalId;
const RULE_B = EXPECTED_RULES[1].finalId;
const RULE_C = EXPECTED_RULES[2].finalId;

function target(
  mutators: Mutator[] = [],
  opts: { spec?: Partial<HappySpec>; inputs?: Partial<EvaluateInputs> } = {}
): Built {
  return {
    transcript: pipe(happyTarget(opts.spec), ...mutators),
    inputs: targetInputs(opts.inputs),
  };
}

/** 장벽 앞에서 서버가 끝난 실행(종료 코드를 고른다). */
const earlyExitBeforeBarrier =
  (code: number): Mutator =>
  (t) =>
    pipe(
      t,
      dropBarrier,
      dropSend("echo-post-barrier"),
      dropEchoResponse("post"),
      stripEnding,
      appendExit({ code }),
      appendCleanup()
    );

/**
 * 하네스가 끝낸 실행: 정리 후 원인 사건·kill·하네스 exit·정리 성공을 붙인다(원인이 timeout이 아닌 경우의 마무리).
 * 정리 성공(cleanup ok)을 함께 붙이는 이유: 다른 실패를 다루는 시나리오가 우연히 CLEANUP_FAILED를 얻지 않게 한다.
 */
const harnessKill: Mutator = (t) =>
  pipe(
    t,
    appendKill("SIGKILL", "abort"),
    appendExit({ code: null, signal: "SIGKILL", byHarness: true }),
    appendCleanup()
  );

const GOT_ERRORS_0 = "Got 0 errors while refreshing rules in language server";

const posRange = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 5 },
});

const OTHER_PIN = "f".repeat(64);

/** 결합을 다른 핀 해시로 만든 지문(나머지 값은 기본 지문과 같다). */
function fingerprintsForPin(pin: string): ReferenceFingerprints {
  const base = fullFingerprints();
  return {
    ...base,
    binding_sha256: buildBinding({
      tool_version: base.tool_version,
      wheel_sha256: base.wheel_sha256,
      pin_sha256: pin,
      rules_list_sha256: base.rules_list_sha256,
      rules_expected_sha256: base.rules_expected_sha256,
      harness_sha256: base.harness_sha256,
      control_sha256: base.control_sha256,
    }),
  };
}

function diag(severity: unknown, code: unknown, line: number) {
  return { severity, code, range: posRange(line), message: "m" };
}

// ── rev2 4.3 합성 메시지 S1~S19 ─────────────────────────────────

const bigPaths = Array.from({ length: 128 }, (_, i) => `src/file${i}.ts`);

const WIN_ROOT = "C:/Users/Test/scan";
const winPaths = [
  "app/page.tsx",
  "components/button.tsx",
  "lib/db.ts",
  "lib/util.ts",
  "next.config.ts",
  "app/my page.tsx",
];
function winTarget(variants: Record<number, string>, extra: Mutator[] = []): Built {
  const base = happyTarget({ scanRoot: WIN_ROOT, expectedPaths: winPaths, k: winPaths.length });
  let publishIndex = -1;
  const rewritten = mapEvents(PUBLISH, (e) => {
    publishIndex++;
    if (e.kind !== "stdout-message") return e;
    const replacement = variants[publishIndex];
    if (replacement === undefined) return e;
    return {
      ...e,
      message: { ...e.message, params: { ...(e.message.params as object), uri: replacement } },
    };
  })(base);
  return {
    transcript: pipe(rewritten, ...extra),
    inputs: targetInputs({ scope: scopeOf(winPaths), scanRoot: WIN_ROOT }),
  };
}

const S18_DIAGNOSTICS = [
  diag(1, RULE_A, 0),
  diag(2, RULE_A, 1),
  diag(3, RULE_B, 2),
  diag(4, RULE_A, 3),
  { code: RULE_B, range: posRange(4), message: "m" }, // 심각도 누락
  diag(99, RULE_A, 5), // 미상 심각도
  diag(2, RULE_C, 0), // 같은 위치, 다른 규칙
  diag(2, RULE_A, 1), // 같은 규칙, 같은 위치 → 중복
];

export const S_SCENARIOS: Scenario[] = [
  {
    id: "S1",
    title: "이전 실행의 빈 게시가 스캔 전 구간에 있고 스캔 구간에는 게시가 없다",
    mode: "target",
    build: () =>
      target([
        dropEvents(PUBLISH, "all"),
        ...TARGET_PATHS.map((p) => insertPublish(uri(p), [], "pre-scan")),
      ]),
    status: "CONTAMINATED",
    codes: ["PRE_SCAN_DIAGNOSTIC", "URI_EXPECTED_NOT_PUBLISHED"],
    check: (v) => {
      expect(v.candidate_gate.value).toBeNull();
      expect(v.observed.published.missing).toHaveLength(TARGET_PATHS.length);
    },
  },
  {
    id: "S2",
    title: "이전 실행의 빈 게시 128개 + 스캔 구간 게시 100개",
    mode: "target",
    build: () => {
      const drops = Array.from({ length: 28 }, () => dropEvents(PUBLISH, 100));
      return {
        transcript: pipe(
          happyTarget({ expectedPaths: bigPaths, k: 128 }),
          ...drops,
          ...bigPaths.map((p) => insertPublish(uri(p), [], "pre-scan"))
        ),
        inputs: targetInputs({ scope: scopeOf(bigPaths) }),
      };
    },
    status: "CONTAMINATED",
    codes: ["PRE_SCAN_DIAGNOSTIC", "URI_EXPECTED_NOT_PUBLISHED"],
    check: (v) => {
      expect(v.observed.published.uris).toHaveLength(100);
      expect(v.observed.published.missing).toHaveLength(28);
    },
  },
  {
    id: "S3",
    title: "두 번째 스캔 흔적: Scanning workspace 2회와 URI 재게시",
    mode: "target",
    build: () =>
      target([
        duplicateStderrLine("Scanning workspace"),
        insertPublish(uri(TARGET_PATHS[0]), [], "scan"),
      ]),
    status: "CONTAMINATED",
    codes: ["MULTI_SCAN_LOG", "DUPLICATE_URI"],
  },
  {
    id: "S4a",
    title: "같은 URI를 2회 게시(내용 동일)",
    mode: "target",
    build: () => target([insertPublish(uri(TARGET_PATHS[0]), [], after(PUBLISH, 0))]),
    status: "DUPLICATE_PUBLISH",
    codes: ["DUPLICATE_URI"],
  },
  {
    id: "S4b",
    title: "같은 URI 2회: 진단 있음 → 빈 목록 (마지막 게시를 채택하면 진단이 사라진다)",
    mode: "target",
    build: () =>
      target([insertPublish(uri(TARGET_PATHS[0]), [], after(PUBLISH, 0))], {
        spec: { diagnostics: { [TARGET_PATHS[0]]: [diag(2, RULE_A, 0)] }, m: 1 },
      }),
    status: "DUPLICATE_PUBLISH",
    codes: ["DUPLICATE_URI"],
    check: (v) => {
      // 첫 게시의 진단이 그대로 센다(마지막 게시 채택 금지).
      expect(v.observed.totals?.total).toBe(1);
      expect(v.candidate_gate.value).toBeNull();
    },
  },
  {
    id: "S5a",
    title: "늦은 진단(정상): 장벽 이후·echo 송신 이후, echo 응답 이전에 마지막 게시가 도착한다",
    mode: "target",
    build: () =>
      target([
        moveAcrossStreams(PUBLISH, after(sendIs("echo-post-barrier")), TARGET_PATHS.length - 1),
      ]),
    status: "COMPLETE",
    codes: [],
    check: (v) => {
      expect(v.observed.published.uris).toHaveLength(TARGET_PATHS.length);
      expect(v.observed.scan.postBarrierEchoSeen).toBe(true);
    },
  },
  {
    id: "S5b",
    title: "늦은 진단: echo 응답 이후에 도착한다",
    mode: "target",
    // 늦은 진단도 Found M matches의 몫이다(M = 1 = D). M = 0으로 두면 D > M이라 EXCESS가 함께 나온다.
    build: () =>
      target([insertPublish(uri(TARGET_PATHS[0]), [diag(2, RULE_A, 0)], "late")], {
        spec: { m: 1 },
      }),
    status: "LATE_DIAGNOSTIC",
    codes: ["DIAGNOSTIC_AFTER_ECHO"],
    check: (v) => {
      // 이미 센 합계에 늦은 진단은 들어가지 않는다(그래서 0이 틀린 값이 된다).
      expect(v.observed.totals?.total).toBe(0);
      expect(v.candidate_gate.value).toBeNull();
    },
  },
  {
    id: "S6",
    title: "누락 URI: E 중 1개 미게시, K = |P| 일치",
    mode: "target",
    build: () =>
      target([dropEvents(PUBLISH, TARGET_PATHS.length - 1)], {
        spec: { k: TARGET_PATHS.length - 1 },
      }),
    status: "TARGET_MISMATCH",
    codes: ["URI_EXPECTED_NOT_PUBLISHED"],
    check: (v) => {
      expect(v.observed.published.missing).toEqual([TARGET_PATHS[TARGET_PATHS.length - 1]]);
    },
  },
  {
    id: "S7",
    title: "초과 URI: E에 없는 URI를 게시(트리 오염)",
    mode: "target",
    build: () => target([insertPublish(uri("extra/evil.js"), [], "scan")]),
    status: "TARGET_MISMATCH",
    codes: ["URI_PUBLISHED_NOT_EXPECTED"],
    check: (v) => expect(v.observed.published.unexpected).toEqual(["extra/evil.js"]),
  },
  {
    id: "S8a",
    title: "조기 종료: 장벽 전에 프로세스 종료(코드 0)",
    mode: "target",
    build: () => target([earlyExitBeforeBarrier(0)]),
    status: "ENGINE_FAILED",
    codes: ["EXIT_BEFORE_BARRIER", "NO_BARRIER"],
  },
  {
    id: "S8b",
    title: "같은 상황, 종료 코드 ≠ 0",
    mode: "target",
    build: () => target([earlyExitBeforeBarrier(1)]),
    status: "ENGINE_FAILED",
    codes: ["EXIT_BEFORE_BARRIER", "NO_BARRIER", "EXIT_NONZERO"],
  },
  {
    id: "S8c",
    title: "일부 URI만 게시된 상태에서 종료",
    mode: "target",
    build: () =>
      target([
        dropEvents(PUBLISH, 4),
        dropEvents(PUBLISH, 3),
        dropEvents(PUBLISH, 2),
        earlyExitBeforeBarrier(0),
      ]),
    status: "ENGINE_FAILED",
    codes: ["EXIT_BEFORE_BARRIER", "NO_BARRIER"],
    check: (v) => expect(v.candidate_gate.value).toBeNull(),
  },
  {
    id: "S9",
    title: "모든 URI·K 일치, 장벽 줄 없음 → 한도 후 TIMEOUT",
    mode: "target",
    build: () =>
      target([
        dropBarrier,
        dropSend("echo-post-barrier"),
        dropEchoResponse("post"),
        stripEnding,
        endByTimeout("PH3", "barrier"),
      ]),
    status: "TIMEOUT",
    codes: ["NO_BARRIER", "TIMEOUT_SCAN"],
    check: (v) => {
      // K = |P|가 맞아도 완료가 아니다.
      expect(v.observed.published.uris).toHaveLength(TARGET_PATHS.length);
      expect(v.observed.scan.scannedFilesK).toBe(TARGET_PATHS.length);
    },
  },
  {
    id: "S10",
    title: "near-miss: Scanned workspace만 있고 Scanning workspace complete는 없다",
    mode: "target",
    build: () =>
      target([
        replaceStderrLine("Scanning workspace complete", "Scanning workspace completed"),
        dropSend("echo-post-barrier"),
        dropEchoResponse("post"),
        stripEnding,
        endByTimeout("PH3", "barrier"),
      ]),
    status: "TIMEOUT",
    codes: ["NO_BARRIER", "TIMEOUT_SCAN"],
    check: (v) => expect(v.observed.scan.barrierSeen).toBe(false),
  },
  {
    id: "S11",
    title: "장벽 있음, echo 응답 없음",
    mode: "target",
    build: () =>
      target([
        dropEchoResponse("post"),
        stripEnding,
        endByTimeout("PH4", "echo-post-barrier 응답"),
      ]),
    status: "TIMEOUT",
    codes: ["ECHO_MISSING", "TIMEOUT_SCAN"],
    check: (v) => {
      expect(v.observed.scan.barrierSeen).toBe(true);
      expect(v.observed.scan.postBarrierEchoSeen).toBe(false);
    },
  },
  {
    id: "S12",
    title: "stderr 우선 도착(정상): 장벽 줄이 마지막 진단 청크보다 먼저 처리된다",
    mode: "target",
    build: () =>
      target([
        moveAcrossStreams(
          stderrIs("Scanning workspace complete"),
          before(PUBLISH, TARGET_PATHS.length - 1)
        ),
      ]),
    status: "COMPLETE",
    codes: [],
  },
  {
    id: "S12-all",
    title: "stderr 우선 도착(정상): 장벽 줄이 모든 진단보다 먼저 처리된다",
    mode: "target",
    build: () =>
      target([moveAcrossStreams(stderrIs("Scanning workspace complete"), before(PUBLISH, 0))]),
    status: "COMPLETE",
    codes: [],
  },
  {
    id: "S13b",
    title: "프레이밍: EOF에서 잘린 마지막 메시지(장벽 뒤 echo 응답 자리)",
    mode: "target",
    build: () => target([truncateStdout(before(responseIs(IDS.echoPost)), "TRUNCATED")]),
    status: "ENGINE_FAILED",
    codes: ["TRUNCATED_FRAME", "ECHO_MISSING"],
  },
  {
    id: "S14-variants",
    title:
      "URI 변형(드라이브 문자 대소문자, 퍼센트 인코딩, 구분자, localhost)이 같은 파일로 매칭된다",
    mode: "target",
    build: () =>
      winTarget({
        0: "file:///C:/Users/Test/scan/app/page.tsx",
        1: "file:///c%3A/Users/Test/scan/components/button.tsx",
        2: "file:///c:/Users/Test/scan//lib/db.ts",
        3: "file:///C:\\Users\\Test\\scan\\lib\\util.ts",
        4: "file://localhost/C:/Users/Test/scan/next.config.ts",
        5: "file:///C:/Users/Test/scan/app/my%20page.tsx",
      }),
    status: "COMPLETE",
    codes: [],
    check: (v) => expect(v.observed.published.uris).toEqual([...winPaths].sort()),
  },
  {
    id: "S14-outside-root",
    title: "스캔 루트 밖 URI는 정규화되지 않아 TARGET_MISMATCH",
    mode: "target",
    build: () => winTarget({ 0: "file:///C:/Other/place/app/page.tsx" }),
    status: "TARGET_MISMATCH",
    codes: ["URI_UNNORMALIZABLE", "URI_EXPECTED_NOT_PUBLISHED"],
  },
  {
    id: "S14-bad-scheme",
    title: "file 스킴이 아닌 URI는 정규화되지 않는다",
    mode: "target",
    build: () => winTarget({ 2: "http://example.com/lib/db.ts" }),
    status: "TARGET_MISMATCH",
    codes: ["URI_UNNORMALIZABLE", "URI_EXPECTED_NOT_PUBLISHED"],
  },
  {
    id: "S14-extra-normalizable",
    title: "정규화되지만 E에 없는 경로",
    mode: "target",
    build: () =>
      winTarget({}, [insertPublish("file:///C:/Users/Test/scan/app/extra.ts", [], "scan")]),
    status: "TARGET_MISMATCH",
    codes: ["URI_PUBLISHED_NOT_EXPECTED"],
  },
  {
    id: "S15",
    title: "Semgrep errors:가 비어 있지 않음, 모든 URI 게시",
    mode: "target",
    build: () =>
      target([], { spec: { engineErrorsText: "Timeout when running rule x on file y" } }),
    status: "PARTIAL",
    codes: ["ENGINE_ERRORS_NONEMPTY"],
    check: (v) => expect(v.observed.scan.engineErrorsText).toContain("Timeout"),
  },
  {
    id: "S16-got-errors",
    title: "로딩 이상: Got 1 errors",
    mode: "target",
    build: () =>
      target([
        replaceStderrLine(GOT_ERRORS_0, "Got 1 errors while refreshing rules in language server"),
      ]),
    status: "RULE_LOAD_ERROR",
    codes: ["RULE_FILE_ERRORS_REPORTED"],
  },
  {
    id: "S16-skipping",
    title: "로딩 이상: skipping rule 경고(Got 0 errors여도)",
    mode: "target",
    build: () =>
      target([
        insertStderrLine(
          "skipping rule foo.bar, error = invalid pattern",
          after(stderrIs(GOT_ERRORS_0))
        ),
      ]),
    status: "RULE_INVALID",
    codes: ["SKIPPING_RULE_LOGGED"],
    check: (v) => expect(v.observed.rules.skippingRuleLogs).toEqual(["foo.bar"]),
  },
  {
    id: "S16-n-mismatch",
    title: "로딩 이상: Running Semgrep with N rules의 N ≠ 기대 규칙 수",
    mode: "target",
    build: () => target([], { spec: { n: EXPECTED_RULES.length - 1 } }),
    status: "RULE_COUNT_MISMATCH",
    codes: ["RULE_COUNT_N_MISMATCH"],
  },
  {
    id: "S16-n-distinct",
    title: "로딩 이상: N = 고유 원문 ID 수(접두어 없는 ID의 징후)",
    mode: "target",
    build: () => target([], { spec: { n: new Set(EXPECTED_RULES.map((r) => r.originalId)).size } }),
    status: "PREFIX_MISSING",
    codes: ["RULE_COUNT_IS_DISTINCT_ID_COUNT"],
  },
  {
    id: "S16-pair-missing",
    title: "로딩 이상: 한 파일의 loading·Done 줄이 둘 다 없다",
    mode: "target",
    build: () =>
      target([
        dropStderrLine(`loading local config from ${LOADING_PATHS[10]}`),
        dropStderrLine(`Done loading local config from ${LOADING_PATHS[10]}`),
      ]),
    status: "RULE_LOAD_ERROR",
    codes: ["LOADING_PAIR_MISSING"],
  },
  {
    id: "S16-pair-no-done",
    title: "로딩 이상: Done loading이 없는 loading",
    mode: "target",
    build: () => target([dropStderrLine(`Done loading local config from ${LOADING_PATHS[11]}`)]),
    status: "RULE_LOAD_ERROR",
    codes: ["LOADING_WITHOUT_DONE"],
  },
  {
    id: "S16-pair-no-loading",
    title: "로딩 이상: loading이 없는 Done loading",
    mode: "target",
    build: () => target([dropStderrLine(`loading local config from ${LOADING_PATHS[12]}`)]),
    status: "RULE_LOAD_ERROR",
    codes: ["LOADING_PAIR_MISSING"],
  },
  {
    id: "S16-pair-extra",
    title: "로딩 이상: 구성 디렉터리 안인데 기대 목록에 없는 쌍",
    mode: "target",
    build: () =>
      target([
        insertStderrLine(
          "loading local config from semgrep-rules/javascript/extra/new-rule.yaml",
          after(stderrIs(GOT_ERRORS_0), 0)
        ),
        insertStderrLine(
          "Done loading local config from semgrep-rules/javascript/extra/new-rule.yaml",
          after(stderrIs(GOT_ERRORS_0), 0)
        ),
      ]),
    status: "RULE_LOAD_ERROR",
    codes: ["LOADING_PAIR_UNEXPECTED"],
  },
  {
    id: "S16-pair-outside",
    title: "로딩 이상: 구성 디렉터리 밖의 쌍",
    mode: "target",
    build: () =>
      target([
        insertStderrLine(
          "loading local config from other/dir/x.yaml",
          after(stderrIs(GOT_ERRORS_0), 0)
        ),
        insertStderrLine(
          "Done loading local config from other/dir/x.yaml",
          after(stderrIs(GOT_ERRORS_0), 0)
        ),
      ]),
    status: "SETTINGS_MISMATCH",
    codes: ["LOADING_PATH_OUTSIDE_CONFIG"],
  },
  {
    id: "S16-pair-duplicate",
    title: "로딩 이상: 같은 쌍이 2회",
    mode: "target",
    build: () =>
      target([
        duplicateStderrLine(`loading local config from ${LOADING_PATHS[20]}`),
        duplicateStderrLine(`Done loading local config from ${LOADING_PATHS[20]}`),
      ]),
    status: "RULE_LOAD_ERROR",
    codes: ["LOADING_PAIR_DUPLICATE"],
  },
  {
    id: "S16-unprefixed",
    title: "로딩 이상: 접두어 없는 게시 ID",
    mode: "target",
    build: () =>
      target([], {
        spec: {
          diagnostics: { [TARGET_PATHS[0]]: [diag(2, EXPECTED_RULES[0].originalId, 0)] },
          m: 1,
        },
      }),
    status: "PREFIX_MISSING",
    codes: ["PUBLISHED_CODE_UNPREFIXED", "UNKNOWN_RULE_CODE"],
  },
  {
    id: "S17",
    title: "모든 조건 충족 + 진단 0건 + 대조 PASS 참조 → COMPLETE, value 0",
    mode: "target",
    build: () => target(),
    status: "COMPLETE",
    codes: [],
    check: (v) => {
      expect(v.candidate_gate.value).toBe(0);
      expect(v.candidate_gate.applicable).toBe(true);
      expect(v.observed.totals).toEqual({ error: 0, warning: 0, information: 0, total: 0 });
    },
  },
  {
    id: "S17-no-reference",
    title: "같은 입력에서 대조 참조가 없으면 CONTROL_MISSING, value null",
    mode: "target",
    build: () => target([], { inputs: { controlReference: null } }),
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_MISSING"],
    check: (v) => expect(v.candidate_gate.value).toBeNull(),
  },
  {
    id: "S18-mapping",
    title: "집계: 심각도 1·2·3·4·누락·미상, 같은 위치 다른 규칙, 같은 규칙 같은 위치 중복",
    mode: "target",
    build: () =>
      // 원시 진단은 8건(마지막은 하네스 집계 키가 같은 중복)이므로 M은 8이다. D ≤ M이어야 모순이 아니다.
      target([], {
        spec: { diagnostics: { [TARGET_PATHS[2]]: S18_DIAGNOSTICS }, m: S18_DIAGNOSTICS.length },
      }),
    status: "COMPLETE",
    codes: [],
    check: (v) => {
      expect(v.observed.totals).toEqual({ error: 4, warning: 2, information: 1, total: 7 });
      expect(v.observed.perRule).toEqual({ [RULE_A]: 4, [RULE_B]: 2, [RULE_C]: 1 });
      expect(v.candidate_gate.value).toBe(7);
      expect(v.candidate_gate.subtotals).toEqual({ error: 4, warning: 2, information: 1 });
      expect(v.observed.perFile[TARGET_PATHS[2]].codes).toEqual([RULE_A, RULE_B, RULE_C].sort());
    },
  },
  {
    id: "S18-unknown-id",
    title: "집계: 기대 목록에 없는 전체 ID는 UNKNOWN_RULE_ID",
    mode: "target",
    build: () =>
      target([], {
        spec: {
          diagnostics: {
            [TARGET_PATHS[1]]: [diag(2, "semgrep-rules.javascript.fake.not-a-rule", 0)],
          },
          m: 1,
        },
      }),
    status: "UNKNOWN_RULE_ID",
    codes: ["UNKNOWN_RULE_CODE"],
  },
  {
    id: "S18-no-code",
    title: "집계: code가 없는 진단도 UNKNOWN_RULE_ID",
    mode: "target",
    build: () =>
      target([], {
        spec: {
          diagnostics: { [TARGET_PATHS[1]]: [{ severity: 2, range: posRange(0), message: "m" }] },
          m: 1,
        },
      }),
    status: "UNKNOWN_RULE_ID",
    codes: ["UNKNOWN_RULE_CODE"],
  },
  {
    id: "S19",
    title: "scanWorkspace 직후 still loading rules 알림",
    mode: "target",
    build: () =>
      target([
        insertStdoutMessage(
          notification("window/showMessage", {
            type: 2,
            message: "The Semgrep Extension is still loading rules...",
          }),
          after(sendIs("scan-workspace"))
        ),
      ]),
    status: "RULES_NOT_LOADED",
    codes: ["STILL_LOADING_NOTICE"],
  },
  {
    id: "S19-unloaded",
    title: "규칙이 올라오지 않은 실행: rulesRefreshed 없음 + still loading 알림",
    mode: "target",
    build: () =>
      target([
        dropEvents(stdoutMethodIs("semgrep/rulesRefreshed")),
        insertStdoutMessage(
          notification("window/showMessage", { type: 2, message: "still loading rules" }),
          after(sendIs("scan-workspace"))
        ),
      ]),
    status: "RULES_NOT_LOADED",
    codes: ["RULES_REFRESHED_MISSING", "STILL_LOADING_NOTICE"],
  },
];

// ── ADR D4 겹침 표의 모든 행 ────────────────────────────────────

export const D4_SCENARIOS: Scenario[] = [
  {
    id: "D4-1",
    title: "rulesRefreshed 전에 서버 종료 (로딩 오류 증거 없음)",
    mode: "target",
    build: () =>
      target([
        cutAfterEvent(stderrIs("Refreshing rules")),
        appendExit({ code: 1 }),
        appendCleanup(),
      ]),
    status: "RULES_NOT_LOADED",
    codes: ["RULES_REFRESHED_MISSING", "EXIT_DURING_RULES"],
  },
  {
    id: "D4-2",
    title: "같은 종료가 initialize 응답 전",
    mode: "target",
    build: () =>
      target([cutAfterEvent(sendIs("initialize")), appendExit({ code: 1 }), appendCleanup()]),
    status: "INIT_FAILED",
    codes: ["INIT_RESPONSE_MISSING", "EXIT_DURING_INIT"],
  },
  {
    id: "D4-3",
    title: "로딩 오류 후 종료",
    mode: "target",
    build: () =>
      target([
        cutAfterEvent(stderrIs(`Done loading local config from ${LOADING_PATHS[2]}`)),
        insertStderrLine(`loading local config from ${LOADING_PATHS[3]}`, atEnd),
        insertStderrLine("Got 1 errors while refreshing rules in language server", atEnd),
        appendExit({ code: 1 }),
        appendCleanup(),
      ]),
    status: "RULE_LOAD_ERROR",
    codes: [
      "RULE_FILE_ERRORS_REPORTED",
      "LOADING_WITHOUT_DONE",
      "RULES_REFRESHED_MISSING",
      "EXIT_DURING_RULES",
    ],
  },
  {
    id: "D4-4",
    title: "장벽·echo 없이 시간 초과 (프로세스 생존)",
    mode: "target",
    build: () =>
      target([cutAfterEvent(stderrIs(/^Running Semgrep with/)), endByTimeout("PH3", "barrier")]),
    status: "TIMEOUT",
    codes: ["NO_BARRIER", "TIMEOUT_SCAN", "ENGINE_REPORT_LOG_MISSING"],
  },
  {
    id: "D4-5",
    title: "모든 URI 도착 후 장벽 누락",
    mode: "target",
    build: () =>
      target([
        dropBarrier,
        dropSend("echo-post-barrier"),
        dropEchoResponse("post"),
        stripEnding,
        endByTimeout("PH3", "barrier"),
      ]),
    status: "TIMEOUT",
    codes: ["NO_BARRIER", "TIMEOUT_SCAN"],
  },
  {
    id: "D4-6",
    title: "장벽 없이 프로세스 종료",
    mode: "target",
    build: () => target([earlyExitBeforeBarrier(0)]),
    status: "ENGINE_FAILED",
    codes: ["EXIT_BEFORE_BARRIER", "NO_BARRIER"],
  },
  {
    id: "D4-7",
    title: "장벽 도착 후 잘린 프레임",
    mode: "target",
    build: () => target([truncateStdout(before(responseIs(IDS.echoPost)), "TRUNCATED")]),
    status: "ENGINE_FAILED",
    codes: ["TRUNCATED_FRAME", "ECHO_MISSING"],
  },
  {
    id: "D4-8",
    title: "echo 이후 늦은 진단",
    mode: "target",
    build: () => target([insertPublish(uri(TARGET_PATHS[1]), [], "late")]),
    status: "LATE_DIAGNOSTIC",
    codes: ["DIAGNOSTIC_AFTER_ECHO"],
  },
  {
    id: "D4-9",
    title: "대조 참조 누락 + 진단 0건",
    mode: "target",
    build: () => target([], { inputs: { controlReference: null } }),
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_MISSING"],
    check: (v) => {
      expect(v.candidate_gate.value).toBeNull();
      expect(v.observed.totals?.total).toBe(0);
    },
  },
  {
    id: "D4-10",
    title: "대조 PASS 참조 + 진단 0건",
    mode: "target",
    build: () => target(),
    status: "COMPLETE",
    codes: [],
    check: (v) => expect(v.candidate_gate.value).toBe(0),
  },
  {
    id: "D4-11",
    title: "스캔 전 빈 게시 + 스캔 구간 게시 없음",
    mode: "target",
    build: () =>
      target([
        dropEvents(PUBLISH, "all"),
        ...TARGET_PATHS.map((p) => insertPublish(uri(p), [], "pre-scan")),
      ]),
    status: "CONTAMINATED",
    codes: ["PRE_SCAN_DIAGNOSTIC", "URI_EXPECTED_NOT_PUBLISHED"],
  },
  {
    id: "D4-12",
    title: "같은 URI 2회 게시 (내용이 다르다)",
    mode: "target",
    build: () =>
      target([insertPublish(uri(TARGET_PATHS[3]), [diag(2, RULE_B, 0)], "scan")], {
        spec: { m: 1 },
      }),
    status: "DUPLICATE_PUBLISH",
    codes: ["DUPLICATE_URI"],
  },
];

// ── 나머지 evaluate 사유를 한 번씩 만드는 시나리오 ─────────────

const truncatedAfterSend = (label: Parameters<typeof sendIs>[0]): Mutator =>
  pipe0(cutAfterEvent(sendIs(label)), truncateStdout(atEnd, "MALFORMED"), harnessKill);

function pipe0(...mutators: Mutator[]): Mutator {
  return (t) => pipe(t, ...mutators);
}

const INIT_CUT = cutAfterEvent(sendIs("initialize"));
const INITIALIZED_CUT = cutAfterEvent(sendIs("initialized"));

export const REASON_SCENARIOS: Scenario[] = [
  {
    id: "R-spawn-failed",
    title: "실행 파일을 띄우지 못했다",
    mode: "target",
    build: () => target([cutAfter(0), appendSpawnFailed()]),
    status: "INIT_FAILED",
    codes: ["SPAWN_FAILED"],
  },
  {
    id: "R-init-error",
    title: "initialize가 오류 응답",
    mode: "target",
    build: () =>
      target([
        replaceStdoutMessage(
          responseIs(IDS.initialize),
          errorResponse(IDS.initialize, -32603, "x")
        ),
      ]),
    status: "INIT_FAILED",
    codes: ["INIT_ERROR_RESPONSE"],
  },
  {
    id: "R-version-mismatch",
    title: "서버 버전이 핀과 다르다",
    mode: "target",
    build: () => target([], { spec: { serverVersion: "1.181.0" } }),
    status: "INIT_FAILED",
    codes: ["SERVER_VERSION_MISMATCH"],
  },
  {
    id: "R-version-unreported",
    title: "서버가 버전을 보고하지 않았다",
    mode: "target",
    build: () => target([], { spec: { serverVersion: null } }),
    status: "INIT_FAILED",
    codes: ["SERVER_VERSION_UNREPORTED"],
  },
  {
    id: "R-initialized-missing",
    title: "initialized 송신 기록이 없다",
    mode: "target",
    build: () => target([dropSend("initialized")]),
    status: "INIT_FAILED",
    codes: ["INITIALIZED_NOT_SENT"],
  },
  {
    id: "R-frame-error-init",
    title: "PH1에서 프레임이 깨졌다",
    mode: "target",
    build: () => target([truncatedAfterSend("initialize")]),
    status: "INIT_FAILED",
    codes: ["FRAME_ERROR_DURING_INIT", "INIT_RESPONSE_MISSING"],
  },
  {
    id: "R-timeout-init",
    title: "PH1 한도 초과",
    mode: "target",
    build: () => target([INIT_CUT, endByTimeout("PH1", "initialize 응답")]),
    status: "INIT_FAILED",
    codes: ["INIT_RESPONSE_MISSING", "TIMEOUT_INIT"],
  },
  {
    id: "R-cancelled-init",
    title: "PH1에서 취소",
    mode: "target",
    build: () => target([INIT_CUT, appendCancelled("PH1"), harnessKill]),
    status: "INIT_FAILED",
    codes: ["INIT_RESPONSE_MISSING", "CANCELLED_DURING_INIT"],
  },
  {
    id: "R-auto-fallback",
    title: "규칙 출처가 auto로 돌아갔다",
    mode: "target",
    build: () =>
      target([
        insertStderrLine("No rules source specified, using auto", after(stderrIs(GOT_ERRORS_0))),
      ]),
    status: "SETTINGS_MISMATCH",
    codes: ["AUTO_RULES_FALLBACK"],
  },
  {
    id: "R-registry-download",
    title: "레지스트리 접속 흔적",
    mode: "target",
    build: () =>
      target([
        insertStderrLine(
          "trying to download from https://semgrep.dev/c/auto",
          after(stderrIs(GOT_ERRORS_0))
        ),
      ]),
    status: "SETTINGS_MISMATCH",
    codes: ["REGISTRY_DOWNLOAD_ATTEMPT"],
  },
  {
    id: "R-ci-log-missing",
    title: "CI disabled 줄이 없다",
    mode: "target",
    build: () => target([dropStderrLine("CI disabled, not checking API token")]),
    status: "SETTINGS_MISMATCH",
    codes: ["CI_DISABLED_LOG_MISSING"],
  },
  {
    id: "R-full-log-missing",
    title: "Scanning workspace, full: true 줄이 없다",
    mode: "target",
    build: () => target([dropStderrLine("Scanning workspace, full: true")]),
    status: "SETTINGS_MISMATCH",
    codes: ["FULL_SCAN_LOG_MISSING"],
  },
  {
    id: "R-config-path-error",
    title: "경로 오류 알림 + rulesRefreshed 없음",
    mode: "target",
    build: () =>
      target([
        dropEvents(stdoutMethodIs("semgrep/rulesRefreshed")),
        insertStdoutMessage(
          notification("window/showMessage", { type: 1, message: "config path error" }),
          after(sendIs("initialized"))
        ),
      ]),
    status: "RULES_NOT_LOADED",
    codes: ["CONFIG_PATH_ERROR", "RULES_REFRESHED_MISSING"],
  },
  {
    id: "R-open-docs-marker",
    title: "Scanned open documents 표지가 없다",
    mode: "target",
    build: () => target([dropStderrLine("Scanned open documents")]),
    status: "RULES_NOT_LOADED",
    codes: ["OPEN_DOCS_MARKER_MISSING"],
  },
  {
    id: "R-errors-count-missing",
    title: "Got N errors 줄이 없다",
    mode: "target",
    build: () => target([dropStderrLine(GOT_ERRORS_0)]),
    status: "RULES_NOT_LOADED",
    codes: ["ERRORS_COUNT_LOG_MISSING"],
  },
  {
    id: "R-echo-pre-missing",
    title: "echo-pre-scan 응답이 없다",
    mode: "target",
    build: () => target([dropEchoResponse("pre")]),
    status: "RULES_NOT_LOADED",
    codes: ["ECHO_PRE_SCAN_MISSING"],
  },
  {
    id: "R-frame-error-rules",
    title: "PH2에서 프레임이 깨졌다",
    mode: "target",
    build: () => target([truncatedAfterSend("initialized")]),
    status: "RULES_NOT_LOADED",
    codes: ["FRAME_ERROR_DURING_RULES", "RULES_REFRESHED_MISSING"],
  },
  {
    id: "R-timeout-rules",
    title: "PH2 한도 초과",
    mode: "target",
    build: () => target([INITIALIZED_CUT, endByTimeout("PH2", "rulesRefreshed")]),
    status: "RULES_NOT_LOADED",
    codes: ["RULES_REFRESHED_MISSING", "TIMEOUT_RULES"],
  },
  {
    id: "R-cancelled-rules",
    title: "PH2에서 취소",
    mode: "target",
    build: () => target([INITIALIZED_CUT, appendCancelled("PH2"), harnessKill]),
    status: "RULES_NOT_LOADED",
    codes: ["RULES_REFRESHED_MISSING", "CANCELLED_DURING_RULES"],
  },
  {
    id: "R-rule-count-log-missing",
    title: "Running Semgrep with N rules 줄이 없다",
    mode: "target",
    build: () => target([dropStderrLine(/^Running Semgrep with/)]),
    status: "RULE_COUNT_MISMATCH",
    codes: ["RULE_COUNT_LOG_MISSING"],
  },
  {
    id: "R-extra-trigger",
    title: "단일 파일 스캔 흔적",
    mode: "target",
    build: () =>
      target([insertStderrLine("Scanning single file", after(stderrIs("Scanning workspace")))]),
    status: "CONTAMINATED",
    codes: ["EXTRA_SCAN_TRIGGER_LOG"],
  },
  {
    id: "R-scan-before-send",
    title: "스캔 송신보다 먼저 스캔 로그가 도착했다(서버가 스스로 스캔)",
    mode: "target",
    build: () => target([insertStderrLine("Scanning workspace", before(sendIs("scan-workspace")))]),
    status: "CONTAMINATED",
    codes: ["EXTRA_SCAN_TRIGGER_LOG", "MULTI_SCAN_LOG"],
  },
  {
    id: "R-barrier-before-send",
    title: "장벽 줄이 스캔 송신보다 먼저 도착했다(이전 스캔의 장벽): 이번 스캔의 장벽이 아니다",
    mode: "target",
    build: () =>
      target([
        dropBarrier,
        insertStderrLine("Scanning workspace complete", before(sendIs("scan-workspace"))),
      ]),
    status: "CONTAMINATED",
    codes: ["EXTRA_SCAN_TRIGGER_LOG", "NO_BARRIER"],
    check: (v) => expect(v.observed.scan.barrierSeen).toBe(false),
  },
  {
    id: "R-pair-order",
    title: "Done loading이 loading보다 앞선 쌍은 쌍으로 인정하지 않는다",
    mode: "target",
    build: () =>
      target([
        replaceStderrLine(`loading local config from ${LOADING_PATHS[30]}`, "__swap__"),
        replaceStderrLine(
          `Done loading local config from ${LOADING_PATHS[30]}`,
          `loading local config from ${LOADING_PATHS[30]}`
        ),
        replaceStderrLine("__swap__", `Done loading local config from ${LOADING_PATHS[30]}`),
      ]),
    status: "RULE_LOAD_ERROR",
    codes: ["LOADING_PAIR_MISSING"],
  },
  {
    id: "R-got-errors-twice",
    title: "Got N errors 줄이 2회(규칙 갱신이 두 번)",
    mode: "target",
    build: () => target([duplicateStderrLine(GOT_ERRORS_0)]),
    status: "CONTAMINATED",
    codes: ["MULTIPLE_RULES_REFRESHED"],
  },
  {
    id: "R-refresh-after-scan",
    title: "스캔 송신 뒤에 규칙 갱신 줄이 한 번 나왔다(PH2의 갱신 줄은 없다)",
    mode: "target",
    build: () =>
      target([
        dropStderrLine("Refreshing rules"),
        insertStderrLine("Refreshing rules", after(sendIs("scan-workspace"))),
      ]),
    status: "CONTAMINATED",
    codes: ["MULTIPLE_RULES_REFRESHED"],
  },
  {
    id: "R-initialized-repeated",
    title: "initialized를 2회 송신",
    mode: "target",
    build: () => target([duplicateEvent(sendIs("initialized"))]),
    status: "INIT_FAILED",
    codes: ["INITIALIZED_REPEATED"],
  },
  {
    id: "R-ci-twice",
    title: "CI disabled 줄이 2회",
    mode: "target",
    build: () => target([duplicateStderrLine("CI disabled, not checking API token")]),
    status: "SETTINGS_MISMATCH",
    codes: ["CI_DISABLED_LOG_MISSING"],
  },
  {
    id: "R-open-docs-again",
    title: "Scanned open documents 뒤에 열린 문서 스캔이 또 시작됐다",
    mode: "target",
    build: () =>
      target([
        insertStderrLine("Scanning open documents", after(stderrIs("Scanned open documents"))),
      ]),
    status: "CONTAMINATED",
    codes: ["EXTRA_SCAN_TRIGGER_LOG"],
  },
  {
    id: "R-didopen-sent",
    title: "스캔을 일으키는 다른 요청(textDocument/didOpen)을 보냈다",
    mode: "target",
    build: () =>
      target([
        insertEvents(after(sendIs("echo-pre-scan")), {
          seq: 0,
          t: 0,
          kind: "send",
          label: "shutdown",
          message: notification("textDocument/didOpen", { textDocument: { uri: "file:///x" } }),
          cursor: { stdout: 0, stderr: 0 },
        }),
      ]),
    status: "CONTAMINATED",
    codes: ["EXTRA_SCAN_TRIGGER_LOG"],
  },
  {
    id: "R-found-twice",
    title: "Found M matches 줄이 2회(두 번째 스캔 흔적)",
    mode: "target",
    build: () => target([duplicateStderrLine("Found 0 matches")]),
    status: "CONTAMINATED",
    codes: ["MULTI_SCAN_LOG"],
  },
  {
    id: "R-exit-signal",
    title: "서버가 신호로 죽었다(종료 코드 없음, 하네스가 끝낸 것이 아님)",
    mode: "target",
    build: () => target([dropExit, appendExit({ code: null, signal: "SIGSEGV" })]),
    status: "ENGINE_FAILED",
    codes: ["EXIT_NONZERO"],
  },
  {
    id: "R-errors-line-with-exception-word",
    title: "인식된 Semgrep errors: 줄의 본문에 예외 단어가 있어도 예외 흔적으로 세지 않는다",
    mode: "target",
    build: () => target([], { spec: { engineErrorsText: "uncaught exception Foo in rule" } }),
    status: "PARTIAL",
    codes: ["ENGINE_ERRORS_NONEMPTY"],
  },
  {
    id: "R-unknown-line-harmless",
    title: "인식되지 않는 평범한 줄은 무시한다",
    mode: "target",
    build: () =>
      target([
        insertStderrLine("some unrelated debug output", after(stderrIs("Scanned workspace"))),
      ]),
    status: "COMPLETE",
    codes: [],
  },
  {
    id: "R-refresh-twice",
    title: "rulesRefreshed 알림이 2회",
    mode: "target",
    build: () => target([duplicateEvent(stdoutMethodIs("semgrep/rulesRefreshed"))]),
    status: "CONTAMINATED",
    codes: ["MULTIPLE_RULES_REFRESHED"],
  },
  {
    id: "R-scan-twice",
    title: "scanWorkspace를 2회 송신",
    mode: "target",
    build: () => target([duplicateEvent(sendIs("scan-workspace"))]),
    status: "CONTAMINATED",
    codes: ["SCAN_REQUEST_REPEATED"],
  },
  {
    id: "R-diag-before-init",
    title: "initialize 응답 전에 게시",
    mode: "target",
    build: () => target([insertPublish(uri(TARGET_PATHS[0]), [], "init")]),
    status: "CONTAMINATED",
    codes: ["DIAGNOSTIC_BEFORE_INIT"],
  },
  {
    id: "R-exit-nonzero",
    title: "정상 순서로 끝났지만 종료 코드가 0이 아니다",
    mode: "target",
    build: () => target([dropExit, appendExit({ code: 3 })]),
    status: "ENGINE_FAILED",
    codes: ["EXIT_NONZERO"],
  },
  {
    id: "R-malformed-publish",
    title: "publishDiagnostics 페이로드의 모양이 깨졌다(diagnostics가 배열이 아님)",
    mode: "target",
    build: () =>
      target([
        mapEvents(
          (e) => PUBLISH(e),
          (e) =>
            e.kind === "stdout-message" &&
            (e.message.params as { uri: string }).uri === uri(TARGET_PATHS[0])
              ? {
                  ...e,
                  message: {
                    ...e.message,
                    params: { uri: uri(TARGET_PATHS[0]), diagnostics: "oops" },
                  },
                }
              : e
        ),
      ]),
    status: "ENGINE_FAILED",
    codes: ["MALFORMED_FRAME", "URI_EXPECTED_NOT_PUBLISHED"],
  },
  {
    id: "R-malformed-frame",
    title: "echo 응답 자리에서 프레임이 깨졌다",
    mode: "target",
    build: () => target([truncateStdout(before(responseIs(IDS.echoPost)), "MALFORMED")]),
    status: "ENGINE_FAILED",
    codes: ["MALFORMED_FRAME", "ECHO_MISSING"],
  },
  {
    id: "R-exception-log",
    title: "stderr에 예외 흔적",
    mode: "target",
    build: () =>
      target([
        insertStderrLine("Fatal error: exception Not_found", after(stderrIs("Scanned workspace"))),
      ]),
    status: "ENGINE_FAILED",
    codes: ["ENGINE_EXCEPTION_LOG"],
  },
  {
    id: "R-cancelled-scan",
    title: "PH3에서 취소",
    mode: "target",
    build: () =>
      target([
        cutAfterEvent(stderrIs(/^Running Semgrep with/)),
        appendCancelled("PH3"),
        harnessKill,
      ]),
    status: "ENGINE_FAILED",
    codes: ["NO_BARRIER", "ENGINE_REPORT_LOG_MISSING", "CANCELLED_DURING_SCAN"],
  },
  {
    id: "R-stdin-error",
    title: "stdin 쓰기 실패",
    mode: "target",
    build: () => target([dropExit, appendStdinError(), appendExit({ code: 0 })]),
    status: "ENGINE_FAILED",
    codes: ["STDIN_WRITE_FAILED"],
  },
  {
    id: "R-response-unmatched",
    title: "보낸 적 없는 id의 응답",
    mode: "target",
    build: () =>
      target([insertStdoutMessage(response("bogus-9", {}), after(responseIs(IDS.echoPre)))]),
    status: "ENGINE_FAILED",
    codes: ["RESPONSE_ID_UNMATCHED"],
  },
  {
    id: "R-response-duplicate",
    title: "같은 id의 응답이 2회",
    mode: "target",
    build: () => target([duplicateEvent(responseIs(IDS.echoPre))]),
    status: "ENGINE_FAILED",
    codes: ["RESPONSE_ID_DUPLICATE"],
  },
  {
    id: "R-timeout-exit",
    title: "종료 한도 초과",
    mode: "target",
    build: () =>
      target([
        dropExit,
        appendTimeout("PH4", "프로세스 종료(exit)"),
        appendKill(),
        appendExit({ code: null, signal: "SIGKILL", byHarness: true }),
      ]),
    status: "TIMEOUT",
    codes: ["TIMEOUT_EXIT"],
  },
  {
    id: "R-cleanup-failed",
    title: "정상 종료했지만 자식 프로세스 정리가 실패로 보고됐다",
    mode: "target",
    build: () => target([dropCleanup, appendCleanup(false, "token=SECRET-DO-NOT-LEAK")]),
    status: "ENGINE_FAILED",
    codes: ["CLEANUP_FAILED"],
    check: (v) => {
      const detail = v.reasons.find((r) => r.code === "CLEANUP_FAILED")?.detail ?? "";
      expect(detail).toContain("실패");
      expect(detail).not.toContain("SECRET");
    },
  },
  {
    id: "R-cleanup-missing",
    title: "자식 프로세스를 띄웠는데 정리 기록이 없다",
    mode: "target",
    build: () => target([dropCleanup]),
    status: "ENGINE_FAILED",
    codes: ["CLEANUP_FAILED"],
    check: (v) => {
      expect(v.reasons.find((r) => r.code === "CLEANUP_FAILED")?.detail).toContain("기록이 없다");
    },
  },
  {
    id: "R-cleanup-duplicate",
    title: "정리 기록이 두 건이다(둘 다 성공이어도 증거가 아니다)",
    mode: "target",
    build: () => target([appendCleanup()]),
    status: "ENGINE_FAILED",
    codes: ["CLEANUP_FAILED"],
    check: (v, built) => {
      expect(built.transcript.events.filter((e) => e.kind === "cleanup")).toHaveLength(2);
      expect(v.reasons.find((r) => r.code === "CLEANUP_FAILED")?.detail).toContain("2건");
    },
  },
  {
    id: "R-cleanup-not-required-on-spawn-failed",
    title: "프로세스를 띄우지 못했으면 정리 기록은 필요 없다",
    mode: "target",
    build: () => target([cutAfter(0), appendSpawnFailed()]),
    status: "INIT_FAILED",
    codes: ["SPAWN_FAILED"],
    check: (v, built) => {
      expect(built.transcript.events.some((e) => e.kind === "cleanup")).toBe(false);
      expect(v.reasons.map((r) => r.code)).not.toContain("CLEANUP_FAILED");
    },
  },
  {
    id: "R-exit-missing",
    title: "exit 사건도 timeout 사건도 없다",
    mode: "target",
    build: () => target([dropExit]),
    status: "TIMEOUT",
    codes: ["TIMEOUT_EXIT"],
  },
  {
    id: "R-k-mismatch",
    title: "Scanned K files의 K가 게시 수·E와 다르다(집합은 같다)",
    mode: "target",
    build: () => target([], { spec: { k: TARGET_PATHS.length - 1 } }),
    status: "TARGET_MISMATCH",
    codes: ["K_NE_PUBLISHED", "K_NE_EXPECTED"],
  },
  {
    id: "R-skipped-unexplained",
    title: "Semgrep skipped S rules, S > 0 설명 없음",
    mode: "target",
    build: () => target([], { spec: { s: 3 } }),
    status: "PARTIAL",
    codes: ["ENGINE_SKIPPED_RULES_UNEXPLAINED"],
  },
  {
    id: "R-skipped-explained",
    title: "S > 0이지만 핀의 s0가 같은 값으로 설명한다",
    mode: "target",
    build: () =>
      target([], {
        spec: { s: 3 },
        inputs: { pin: { ...PIN, s0: { observed: 3, explained: true } } as Pin },
      }),
    status: "COMPLETE",
    codes: [],
    check: (v) => expect(v.observed.rules.skippedRulesS).toBe(3),
  },
  {
    id: "R-skipped-other-count",
    title: "핀의 s0가 확정한 값(3)과 S = 4가 다르면 S0 불일치다(확정된 S0는 정확히 같아야 한다)",
    mode: "target",
    build: () =>
      target([], {
        spec: { s: 4 },
        inputs: { pin: { ...PIN, s0: { observed: 3, explained: true } } as Pin },
      }),
    status: "PARTIAL",
    codes: ["SKIPPED_RULES_S0_MISMATCH"],
    check: (v) =>
      expect(v.reasons.find((r) => r.code === "SKIPPED_RULES_S0_MISMATCH")?.detail).toBe(
        "S=4, S0=3"
      ),
  },
  {
    id: "R-skipped-s0-zero-regression",
    title: "핀의 s0가 확정한 값(2)인데 S = 0이다(건너뜀이 사라진 것도 불일치다)",
    mode: "target",
    build: () =>
      target([], {
        spec: { s: 0 },
        inputs: { pin: { ...PIN, s0: { observed: 2, explained: true } } as Pin },
      }),
    status: "PARTIAL",
    codes: ["SKIPPED_RULES_S0_MISMATCH"],
  },
  {
    id: "R-extra-uri-no-echo",
    title: "echo 없이 끝나도 E 밖의 URI 게시는 양의 증거로 남는다",
    mode: "target",
    build: () =>
      target([insertPublish(uri("extra/evil.js"), [], "scan"), earlyExitBeforeBarrier(0)]),
    status: "ENGINE_FAILED",
    codes: ["EXIT_BEFORE_BARRIER", "NO_BARRIER", "URI_PUBLISHED_NOT_EXPECTED"],
  },
  {
    id: "R-init-response-dropped",
    title: "initialize 응답이 없으면 그 뒤의 모든 게시는 초기화 전 게시로 센다",
    mode: "target",
    build: () => target([dropEvents(responseIs(IDS.initialize))]),
    status: "INIT_FAILED",
    codes: ["INIT_RESPONSE_MISSING", "DIAGNOSTIC_BEFORE_INIT", "URI_EXPECTED_NOT_PUBLISHED"],
  },
  {
    id: "R-ref-not-pass",
    title: "대조 참조의 단언이 PASS가 아니다",
    mode: "target",
    build: () =>
      target([], {
        inputs: {
          controlReference: { ...CONTROL_REFERENCE_PASS, control_assertions_status: "FAIL" },
        },
      }),
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_NOT_PASS"],
  },
  {
    id: "R-ref-not-complete",
    title: "대조 참조의 측정이 COMPLETE가 아니다",
    mode: "target",
    build: () =>
      target([], {
        inputs: { controlReference: { ...CONTROL_REFERENCE_PASS, status: "PARTIAL" } },
      }),
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_NOT_PASS"],
  },
  {
    id: "R-ref-pin-mismatch",
    title: "대조 참조의 pin 해시가 이번 실행과 다르다",
    mode: "target",
    // 참조가 다른 핀 해시로 만든 결합까지 자기 안에서 일관된 경우(핀 해시 불일치만 격리한다). 현실에서는 핀이 다르면 이번 실행의
    // 결합도 달라져 R-ref-pin-mismatch-binding처럼 결합 불일치가 함께 나온다.
    build: () => {
      const fp = fingerprintsForPin(OTHER_PIN);
      return target([], {
        inputs: {
          controlReference: qualifiedReference(fp, { pin_sha256: OTHER_PIN }),
          currentFingerprints: fp,
        },
      });
    },
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_PIN_MISMATCH"],
  },
  {
    id: "R-ref-synthetic",
    title: "대조 참조가 합성(stub) 실행이다",
    mode: "target",
    build: () =>
      target([], {
        inputs: { controlReference: { ...CONTROL_REFERENCE_PASS, provenance: "stub" } },
      }),
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_SYNTHETIC"],
  },
  {
    id: "R-n0-ref",
    title: "대조 참조가 N0를 확정하지 못했다",
    mode: "target",
    build: () =>
      target([], {
        inputs: { controlReference: { ...CONTROL_REFERENCE_PASS, n0_confirmed: false } },
      }),
    status: "CONTROL_MISSING",
    codes: ["N0_UNCONFIRMED"],
  },
  {
    id: "R-n0-pin",
    title: "핀의 n0가 확정되지 않았다(실제 data/pin.json 그대로)",
    mode: "target",
    build: () => target([], { inputs: { pin: RAW_PIN } }),
    status: "CONTROL_MISSING",
    codes: ["N0_UNCONFIRMED"],
  },
  {
    id: "R-metrics-hit",
    title: "메트릭 수신기에 요청이 왔다",
    mode: "target",
    build: () => target([], { inputs: { metricsReceiverHits: 2 } }),
    status: "ISOLATION_VIOLATION",
    codes: ["METRICS_RECEIVER_HIT"],
  },
  {
    id: "R-metrics-not-observing",
    title: "수신기가 관찰 중임을 증명하지 못했다",
    mode: "target",
    build: () => target([], { inputs: { metricsReceiverHits: null } }),
    status: "ISOLATION_VIOLATION",
    codes: ["METRICS_RECEIVER_NOT_OBSERVING"],
  },
  {
    id: "R-precheck-verbatim",
    title: "사전 검사 사유는 그대로 합쳐진다",
    mode: "target",
    build: () =>
      target([], {
        inputs: {
          precheckReasons: [
            { code: "RULES_FILE_ADDED", detail: "extra.yaml" },
            { code: "SETTINGS_KEY_NOT_ALLOWED", detail: "scan.bogus" },
          ],
        },
      }),
    status: "MANIFEST_MISMATCH",
    codes: ["RULES_FILE_ADDED", "SETTINGS_KEY_NOT_ALLOWED"],
    check: (v) =>
      expect(v.reasons).toEqual([
        { code: "RULES_FILE_ADDED", detail: "extra.yaml" },
        { code: "SETTINGS_KEY_NOT_ALLOWED", detail: "scan.bogus" },
      ]),
  },
  {
    id: "R-control-missing-detect",
    title: "control: 양성 파일의 필수 ID가 게시되지 않았다(측정은 완료, 단언은 FAIL)",
    mode: "control",
    build: () => {
      const first = CONTROL_EXPECTATIONS.cases.find((c) => c.kind === "positive");
      if (!first) throw new Error("no positive case");
      return {
        transcript: happyControl({
          diagnostics: Object.fromEntries(
            CONTROL_EXPECTATIONS.cases.map((c) => [
              c.path,
              c.path === first.path ? [] : c.required.map((code) => diag(2, code, 0)),
            ])
          ),
          m:
            CONTROL_EXPECTATIONS.cases.reduce((n, c) => n + c.required.length, 0) -
            first.required.length,
        }),
        inputs: controlInputs(),
      };
    },
    status: "COMPLETE",
    codes: [],
    check: (v) => expect(v.control_assertions.status).toBe("FAIL"),
  },

  // ── PR #28 검토: M과 게시 진단 수, 대조 참조의 사실 확인 ──────────────────────
  {
    id: "R-match-diagnostics-missing",
    title: "Found 1 matches인데 스캔 이후 게시된 진단이 없다(M > 0, D = 0)",
    mode: "target",
    build: () => target([], { spec: { m: 1 } }),
    status: "PARTIAL",
    codes: ["MATCH_COUNT_DIAGNOSTICS_MISSING"],
    check: (v) => {
      expect(v.observed.published.diagnosticCount).toBe(0);
      expect(v.observed.scan.matchesDeduplicated).toBeNull();
      expect(v.candidate_gate.value).toBeNull();
    },
  },
  {
    id: "R-match-diagnostics-excess",
    title: "Found 0 matches인데 진단이 한 건 게시됐다(D > M)",
    mode: "target",
    build: () =>
      target([], { spec: { m: 0, diagnostics: { [TARGET_PATHS[0]]: [diag(2, RULE_A, 0)] } } }),
    status: "PARTIAL",
    codes: ["MATCH_COUNT_DIAGNOSTICS_EXCESS"],
    check: (v) => {
      expect(v.observed.published.diagnosticCount).toBe(1);
      expect(v.observed.scan.matchesDeduplicated).toBeNull();
      expect(v.candidate_gate.value).toBeNull();
    },
  },
  {
    id: "R-match-diagnostics-merged",
    title: "M = 3, D = 2: 서버가 JSON이 같은 진단을 합친 정상 경우는 M = D를 요구하지 않는다",
    mode: "target",
    build: () =>
      target([], {
        spec: {
          m: 3,
          diagnostics: { [TARGET_PATHS[0]]: [diag(2, RULE_A, 0), diag(2, RULE_A, 1)] },
        },
      }),
    status: "COMPLETE",
    codes: [],
    check: (v) => {
      expect(v.observed.published.diagnosticCount).toBe(2);
      expect(v.observed.scan.matchesDeduplicated).toBe(1);
    },
  },
  {
    id: "R-ref-fingerprint-missing",
    title: "대조 참조의 하네스 지문을 확인하지 못했다(null은 null과도 일치하지 않는다)",
    mode: "target",
    build: () => {
      const ref = qualifiedReference({ ...fullFingerprints(), harness_sha256: null });
      return target([], { inputs: { controlReference: ref } });
    },
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_FINGERPRINT_MISSING", "CONTROL_REFERENCE_NOT_ELIGIBLE"],
  },
  {
    id: "R-ref-current-fingerprints-null",
    title: "이번 실행의 지문을 하나도 계산하지 못했다(currentFingerprints = null)",
    mode: "target",
    build: () => target([], { inputs: { currentFingerprints: null } }),
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_FINGERPRINT_MISSING", "CONTROL_REFERENCE_NOT_ELIGIBLE"],
  },
  {
    id: "R-ref-harness-mismatch",
    title: "핀 해시가 같아도 하네스 구현 지문이 다르다",
    mode: "target",
    build: () =>
      target([], {
        inputs: {
          currentFingerprints: fullFingerprints({ harness_sha256: sha256Hex("other-harness") }),
        },
      }),
    status: "CONTROL_MISSING",
    codes: [
      "CONTROL_REFERENCE_HARNESS_MISMATCH",
      "CONTROL_REFERENCE_BINDING_MISMATCH",
      "CONTROL_REFERENCE_NOT_ELIGIBLE",
    ],
  },
  {
    id: "R-ref-control-mismatch",
    title: "핀 해시가 같아도 대조 지문(기대 파일·고정 입력)이 다르다",
    mode: "target",
    build: () =>
      target([], {
        inputs: {
          currentFingerprints: fullFingerprints({ control_sha256: sha256Hex("other-control") }),
        },
      }),
    status: "CONTROL_MISSING",
    codes: [
      "CONTROL_REFERENCE_CONTROL_MISMATCH",
      "CONTROL_REFERENCE_BINDING_MISMATCH",
      "CONTROL_REFERENCE_NOT_ELIGIBLE",
    ],
  },
  {
    id: "R-ref-tool-mismatch",
    title: "핀 해시가 같아도 도구 버전이 다르다",
    mode: "target",
    build: () =>
      target([], { inputs: { currentFingerprints: fullFingerprints({ tool_version: "9.9.9" }) } }),
    status: "CONTROL_MISSING",
    codes: [
      "CONTROL_REFERENCE_TOOL_MISMATCH",
      "CONTROL_REFERENCE_BINDING_MISMATCH",
      "CONTROL_REFERENCE_NOT_ELIGIBLE",
    ],
  },
  {
    id: "R-ref-binding-mismatch",
    title: "구성 요소 지문은 같지만 이번 실행의 결합 값만 다르다",
    mode: "target",
    build: () =>
      target([], {
        inputs: {
          currentFingerprints: fullFingerprints({ binding_sha256: sha256Hex("other-binding") }),
        },
      }),
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_BINDING_MISMATCH", "CONTROL_REFERENCE_NOT_ELIGIBLE"],
  },
  {
    id: "R-ref-pin-mismatch-binding",
    title: "참조의 핀 해시가 다르면 이번 실행의 결합도 달라 핀·결합 불일치가 함께 나온다",
    mode: "target",
    build: () => {
      const fp = fingerprintsForPin(OTHER_PIN);
      return target([], {
        inputs: { controlReference: qualifiedReference(fp, { pin_sha256: OTHER_PIN }) },
      });
    },
    status: "CONTROL_MISSING",
    codes: [
      "CONTROL_REFERENCE_PIN_MISMATCH",
      "CONTROL_REFERENCE_BINDING_MISMATCH",
      "CONTROL_REFERENCE_NOT_ELIGIBLE",
    ],
  },
  {
    id: "R-ref-negative-incomplete",
    title: "대조 참조의 엔진 음성 대조가 실행되지 않았다(NOT_RUN)",
    mode: "target",
    build: () => {
      const ref = qualifiedReference();
      ref.negative_controls = ref.negative_controls.map((n) =>
        n.layer === "engine" ? { ...n, status: "NOT_RUN", binding_sha256: null } : n
      );
      return target([], { inputs: { controlReference: ref } });
    },
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_NEGATIVE_INCOMPLETE", "CONTROL_REFERENCE_NOT_ELIGIBLE"],
    check: (v) =>
      expect(
        v.reasons.find((r) => r.code === "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE")?.detail
      ).toContain("R3:engine(NOT_RUN)"),
  },
  {
    id: "R-ref-not-eligible",
    title: "사실은 모두 맞지만 참조가 eligible:false를 선언했다",
    mode: "target",
    build: () =>
      target([], {
        inputs: { controlReference: qualifiedReference(undefined, { eligible: false }) },
      }),
    status: "CONTROL_MISSING",
    codes: ["CONTROL_REFERENCE_NOT_ELIGIBLE"],
  },
];

export const ALL_SCENARIOS: Scenario[] = [...S_SCENARIOS, ...D4_SCENARIOS, ...REASON_SCENARIOS];

/** 시나리오 하나를 돌려 기대(대표 상태·정확한 사유 집합·공유 일관성·buildRunRecord 호환)를 확인한다. */
export function runScenario(sc: Scenario): Verdict {
  const built = sc.build();
  const verdict = evaluateTranscript(built.transcript, built.inputs);
  assertConsistent(verdict);
  expect(verdict.status).toBe(sc.status);
  expect(codesOf(verdict)).toEqual([...sc.codes].sort());
  sc.check?.(verdict, built);
  buildRecord(verdict, built.transcript, built.inputs);
  return verdict;
}
