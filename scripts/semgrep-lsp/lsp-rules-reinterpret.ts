// LSP-RULES-1 관리자 진입점(Test-LspRulesObservation.ps1)이 모은 러너 결과 원문과 관리자 문맥을 하나의 관측 기록으로 다시 해석하는 순수 모듈.
//
// 러너의 자기 보고(결과 JSON)를 그대로 믿지 않는다: 초기화 응답·로그 신호·13개 조건의 판정은 lsp-rules-runner-result(factsFromRulesRunnerResult)와
// lsp-rules-record(buildRulesRecord)가 원문 바이트로 다시 한다. 여기서는 그 위에 관리자 쪽에서만 알 수 있는 사실(토큰 결합, 신원 교차 확인, 수신기 읽기,
// 중단 전달, 감독 종료, 설치물·프로브 해시, OS 차단 이벤트)을 관측 성립을 막는 사유(`ADMIN_*`)로 더한다. 문맥이 없거나 형식이 틀려도 던지지 않고 관측 불성립
// 쪽으로 기운다.
//
// 서버를 띄우지 않았음(NOT_ATTEMPTED)은 관리자 문맥의 `runnerLaunched === false` 또는 러너가 스스로 거절했을 때만이다. 러너를 띄운 뒤의 신원·결합·해시 실패는
// 실행 사실을 지우지 않고 NOT_OBSERVED로 남는다.
//
// 이 모듈은 node:* 를 가져오지 않는다(파일은 CLI 래퍼가 읽고 쓴다). 평가기·하네스·세션·대조 참조·음성 대조와 이어지지 않는다.
//
// 공개 API:
//   reinterpretRulesRun(runnerResult, adminContext): RulesReinterpretation
//   runRulesReinterpretCli(argv, io): { exitCode, message }

import { LSP_RULES_LIMITS, type RulesLimits } from "./lsp-rules";
import { parseReinterpretArgs, type ReinterpretIo } from "./lsp-min-reinterpret";
import { buildRulesRecord, type RulesObservation } from "./lsp-rules-record";
import { factsFromRulesRunnerResult, type RulesRunnerContext } from "./lsp-rules-runner-result";

export const RULES_ADMIN_CONTEXT_SCHEMA = "lsp-rules-admin-context/1";
export const RULES_ADMIN_CONTEXT_KIND = "lsp-rules-admin-context";
export const RULES_REINTERPRETATION_SCHEMA = "lsp-rules-reinterpretation/1";

export interface RulesReinterpretation {
  schema: typeof RULES_REINTERPRETATION_SCHEMA;
  record: RulesObservation;
  admin: {
    /** 관리자 문맥에서 도출한, 관측 성립을 막는 사유 토큰. */
    externalReasons: string[];
    /** 문맥 자체의 형식 문제(필드 이름). 값은 싣지 않는다. */
    contextProblems: string[];
  };
}

type Dict = Record<string, unknown>;

function dict(value: unknown): Dict | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Dict)
    : null;
}
function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
function arrOfStrings(value: unknown): string[] {
  // PowerShell 5.1 의 ConvertTo-Json 은 원소 하나짜리 배열을 스칼라로, 빈 배열을 null 이나 빈 객체로 쓸 수 있다.
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined) return [];
  if (dict(value) !== null && Object.keys(value as Dict).length === 0) return [];
  return [String(value)];
}

const LIMIT_KEYS: readonly (keyof RulesLimits)[] = [
  "totalMs",
  "initMs",
  "rulesMs",
  "settleMs",
  "exitMs",
  "stdinCloseGraceMs",
  "killConfirmMs",
  "maxStdoutBytes",
  "maxStderrBytes",
  "sampleIntervalMs",
];

function limitsFrom(value: unknown): RulesLimits | undefined {
  const d = dict(value);
  if (d === null) return undefined;
  const out: Partial<RulesLimits> = {};
  for (const key of LIMIT_KEYS) {
    const v = numOrNull(d[key]);
    if (v === null || v < 1 || v > LSP_RULES_LIMITS[key]) return undefined;
    out[key] = v;
  }
  return out as RulesLimits;
}

function sha(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

/**
 * 러너 결과(JSON을 읽은 값)와 관리자 문맥(JSON을 읽은 값)에서 관측 기록을 만든다. 던지지 않는다.
 * 문맥이 맞지 않으면 `ADMIN_CONTEXT_MALFORMED:<필드>` 로 관측 불성립이다(관측하지 못한 값을 채우지 않는다).
 */
export function reinterpretRulesRun(
  runnerResult: unknown,
  adminContext: unknown
): RulesReinterpretation {
  const problems: string[] = [];
  const reasons: string[] = [];
  const ctx = dict(adminContext);
  if (
    ctx === null ||
    ctx.schema !== RULES_ADMIN_CONTEXT_SCHEMA ||
    ctx.kind !== RULES_ADMIN_CONTEXT_KIND
  ) {
    problems.push("schema");
  }
  const runId = ctx !== null && typeof ctx.runId === "string" ? ctx.runId : "";
  if (runId === "") problems.push("runId");
  const token = ctx !== null && typeof ctx.runToken === "string" ? ctx.runToken : "";
  if (token === "") problems.push("runToken");
  const work = ctx === null ? null : strOrNull(ctx.work);
  if (work === null) problems.push("work");

  const receiverRaw = ctx === null ? null : dict(ctx.receiver);
  let receiver: RulesRunnerContext["receiver"];
  if (receiverRaw === null) {
    problems.push("receiver");
    receiver = undefined;
  } else {
    receiver = {
      baselineHits: numOrNull(receiverRaw.baselineHits),
      finalHits: numOrNull(receiverRaw.finalHits),
      samples: numOrNull(receiverRaw.samples) ?? 0,
      failures: numOrNull(receiverRaw.failures) ?? 0,
    };
  }
  const probeRaw = ctx === null ? null : dict(ctx.probe);
  if (probeRaw === null) problems.push("probe");

  // 한도: 없거나 상한을 넘거나 숫자가 아니면 기본 상한으로 덮지 않는다(어떤 한도로 실행했는지 모르는 관측은 성립하지 않는다).
  const limits = ctx === null ? undefined : limitsFrom(ctx.limits);
  if (ctx !== null && limits === undefined) problems.push("limits");

  const rctx: RulesRunnerContext = {
    runId,
    work,
    expectedVersion:
      ctx !== null && typeof ctx.expectedVersion === "string" ? ctx.expectedVersion : null,
    limits,
    receiver,
    probe:
      probeRaw === null
        ? undefined
        : {
            sourceSha256: sha(probeRaw.sourceSha256),
            afterCopySha256: sha(probeRaw.afterCopySha256),
            afterRunSha256: sha(probeRaw.afterRunSha256),
          },
  };
  let facts = factsFromRulesRunnerResult(runnerResult, rctx);

  // 러너를 띄우지 않았음을 관리자가 알린 경우(사전 조건 실패): 서버는 뜨지 않았다. 러너 결과가 없어도 NOT_ATTEMPTED다.
  const launched = ctx !== null ? ctx.runnerLaunched : undefined;
  if (launched === false) {
    const refusals = arrOfStrings(ctx?.refusals);
    facts = {
      ...facts,
      refusals: refusals.length > 0 ? refusals : ["ADMIN_RUNNER_NOT_LAUNCHED"],
      spawn: { attempted: false, ok: false, pid: null },
      externalReasons: [],
    };
  } else if (launched !== true) {
    problems.push("runnerLaunched");
  }

  // 결과가 이번 실행의 것인가: 러너가 되돌려 쓴 토큰이 관리자가 요청에 넣은 토큰과 같아야 한다.
  const rr = dict(runnerResult);
  if (launched !== false && token !== "" && (rr === null || rr.runToken !== token)) {
    reasons.push("ADMIN_TOKEN_MISMATCH");
  }

  if (ctx !== null && launched !== false) {
    const identity = dict(ctx.identity);
    if (identity === null || identity.ok !== true) reasons.push("ADMIN_IDENTITY_UNVERIFIED");
    const binding = dict(ctx.binding);
    if (binding === null || binding.ok !== true) reasons.push("ADMIN_BINDING_FAILED");
    const sup = dict(ctx.supervisor);
    if (sup === null) {
      problems.push("supervisor");
    } else {
      // 빠지거나 불리언이 아닌 필드는 "그런 일이 없었다"로 읽지 않는다(문자열 "false"도 마찬가지다).
      for (const field of ["forcedKill", "deadlineReached", "abortRequested", "resultMissing"]) {
        if (typeof sup[field] !== "boolean") problems.push(`supervisor.${field}`);
      }
      if (sup.abortRequested === true && typeof sup.abortDelivered !== "boolean") {
        problems.push("supervisor.abortDelivered");
      }
      if (sup.forcedKill === true) reasons.push("ADMIN_SUPERVISOR_FORCED_KILL");
      if (sup.deadlineReached === true) reasons.push("ADMIN_SUPERVISOR_DEADLINE");
      if (sup.abortRequested === true && sup.abortDelivered !== true) {
        reasons.push("ADMIN_ABORT_DELIVERY_FAILED");
      }
      if (sup.resultMissing === true) reasons.push("ADMIN_RESULT_MISSING");
    }
    if (arrOfStrings(ctx.descendantPathViolations).length > 0) {
      reasons.push("ADMIN_DESCENDANT_PATH_UNEXPECTED");
    }
    if (ctx.hashesUnchanged !== true) reasons.push("ADMIN_HASH_CHANGED");
    // OS 차단 이벤트(5157): 수집·감사·로그가 확실하지 않으면 "차단된 연결이 없었다"고 말할 증거가 없으므로 성립시키지 않는다.
    // 귀속된 이벤트가 1건이라도 있으면 막는다. 건수가 숫자가 아니면(null) 확인 못 한 것으로 본다.
    const os = dict(ctx.osBlock);
    const attributed = os === null ? null : numOrNull(os.attributedCount);
    if (os === null || os.usable !== true || attributed === null) {
      reasons.push("ADMIN_OS_BLOCK_UNCONFIRMED");
    } else if (attributed > 0) reasons.push("ADMIN_OS_BLOCK_ATTRIBUTED");
  }
  for (const field of problems) reasons.push(`ADMIN_CONTEXT_MALFORMED:${field}`);

  const merged = { ...facts, externalReasons: [...(facts.externalReasons ?? []), ...reasons] };
  return {
    schema: RULES_REINTERPRETATION_SCHEMA,
    record: buildRulesRecord(merged),
    admin: { externalReasons: reasons, contextProblems: problems },
  };
}

/**
 * 종료 코드: 0 기록을 썼다(기록의 판정이 무엇이든), 2 인자 오류, 3 입력을 읽거나 JSON 으로 풀지 못했다 또는 출력을 쓰지 못했다.
 * 메시지에는 경로나 입력 내용을 싣지 않는다. 인자 해석은 LSP-MIN-1 재해석 CLI 와 같다(--runner-result, --context, --out).
 */
export function runRulesReinterpretCli(
  argv: readonly string[],
  io: ReinterpretIo
): { exitCode: number; message: string } {
  const args = parseReinterpretArgs(argv);
  if ("error" in args) {
    return { exitCode: 2, message: "USAGE: --runner-result <file> --context <file> --out <file>" };
  }
  let runner: unknown;
  let context: unknown;
  try {
    runner = JSON.parse(io.read(args.runnerResult));
  } catch {
    runner = null; // 러너 결과를 읽지 못하거나 깨졌으면 기록은 RUNNER_RESULT_MALFORMED 로 관측 불성립이 된다.
  }
  try {
    context = JSON.parse(io.read(args.context));
  } catch {
    return { exitCode: 3, message: "CONTEXT_UNREADABLE" };
  }
  const result = reinterpretRulesRun(runner, context);
  try {
    io.write(args.out, `${JSON.stringify(result, null, 2)}\n`);
  } catch {
    return { exitCode: 3, message: "OUTPUT_NOT_WRITTEN" };
  }
  return { exitCode: 0, message: `RECORD_WRITTEN verdict=${result.record.verdict}` };
}
