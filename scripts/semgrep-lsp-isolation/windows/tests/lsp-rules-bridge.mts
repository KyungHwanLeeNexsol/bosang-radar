// tests/Test-LspRulesRunner.ps1 이 tsx 로 부르는 작은 다리. 실제 TS 모듈(scripts/semgrep-lsp)을 읽어서
//  · verdicts : 러너 결과 JSON 들을 실제 어댑터(factsFromRulesRunnerResult)와 기록 만들기(buildRulesRecord)에 통과시켜 판정을 돌려준다.
//  · contract : PowerShell 계약 이식본(LspRulesContract.ps1)과 대조할 TS 쪽 값(상수, 메시지, 환경, 한도 해석, 경로 검사 표)을 돌려준다.
// 인자: <tsDir> <verdicts|contract> <입력 파일 또는 작업 폴더>. 결과는 표준 출력에 JSON 한 줄이다. 이 파일은 시험 전용이며 아무것도 쓰지 않는다.

import { readFileSync } from "node:fs";
import * as lm from "../../../semgrep-lsp/lsp-min";
import * as lr from "../../../semgrep-lsp/lsp-rules";
import * as rec from "../../../semgrep-lsp/lsp-rules-record";
import * as rr from "../../../semgrep-lsp/lsp-rules-runner-result";
import * as rl from "../../../semgrep-lsp/rules-log";
import * as st from "../../../semgrep-lsp/settings";

// argv[2] 는 예전 호출 형태와 맞추려고 남긴 자리다(TS 폴더). 모듈은 정적으로 가져오므로 쓰지 않는다.
const mode = process.argv[3];
const arg = process.argv[4] ?? "";

if (mode === "verdicts") {
  const items: { name: string; path: string; ctx: rr.RulesRunnerContext }[] = JSON.parse(
    readFileSync(arg, "utf8")
  );
  const out = items.map((item) => {
    const json = JSON.parse(readFileSync(item.path, "utf8").replace(/^\uFEFF/, ""));
    const facts = rr.factsFromRulesRunnerResult(json, item.ctx);
    const r = rec.buildRulesRecord(facts);
    return {
      name: item.name,
      status: r.status,
      verdict: r.verdict,
      reasons: r.verdict_reasons,
      cleanupOk: r.cleanup.ok,
      trigger: r.termination.trigger,
      abort: r.termination.abort ? r.termination.abort.condition : null,
      sent: r.sent.map((s) => s.label),
      external: facts.externalReasons ?? [],
    };
  });
  console.log(JSON.stringify(out));
} else if (mode === "contract") {
  const work = arg;
  const layout = lr.rulesLayout(work);
  const overrides = [
    {},
    { rulesMs: 1000 },
    { rulesMs: 120000 },
    { settleMs: 5000 },
    { settleMs: 0 },
    { totalMs: 999999 },
    { barrierMs: 10 },
    { initMs: "x" },
    { exitMs: 30000, settleMs: 2000 },
  ];
  const sources = [
    "auto",
    "AUTO",
    "r2c",
    "policy",
    "supply-chain",
    "hooks",
    "r/python",
    "P/security",
    "s/x",
    "http://x",
    "HTTPS://x",
    "C:\\rules",
    "semgrep-rules/javascript",
    "autox",
    "",
  ];
  const fragments = [
    "C:\\work\\downloads\\x",
    "C:\\a\\Registry",
    "C:\\Scanning",
    "C:\\ok\\path",
    "C:\\x\\No Rules\\y",
    "C:\\x\\error initializing server",
  ];
  const drives = ["C:\\a", "c:/a", "\\\\srv\\share", "\\a", "a\\b", "C:a", "Z:\\"];
  console.log(
    JSON.stringify({
      consts: {
        args: [...lr.LSP_RULES_ARGS],
        initId: lr.LSP_RULES_INIT_ID,
        shutdownId: lr.LSP_RULES_SHUTDOWN_ID,
        probeFile: lr.LSP_RULES_PROBE_FILE,
        probeSha: lr.LSP_RULES_PROBE_SHA256,
        probeBytes: lr.LSP_RULES_PROBE_BYTES,
        sendOrder: [...lr.LSP_RULES_SEND_ORDER],
        limits: lr.LSP_RULES_LIMITS,
        progressMethod: lr.PROGRESS_CREATE_METHOD,
        maxProgress: lr.MAX_PROGRESS_CREATE,
        refreshedMethod: lr.RULES_REFRESHED_METHOD,
        progressNote: lr.PROGRESS_METHOD,
        diagnostics: lr.PUBLISH_DIAGNOSTICS_METHOD,
        forbiddenFragments: [...lr.PATH_FORBIDDEN_FRAGMENTS],
        requiredBare: [...rl.REQUIRED_BARE_KEYS],
        forbiddenScan: [...rl.FORBIDDEN_SCAN_KEYS],
        forbiddenNetwork: [...rl.FORBIDDEN_NETWORK_KEYS],
        preInitialized: [...rl.PRE_INITIALIZED_KEYS],
        envNames: [...lm.LSP_MIN_ENV_NAMES],
      },
      layout,
      init: lr.buildRulesInitializeMessage(layout),
      initialized: lr.buildRulesInitializedMessage(),
      shutdown: lr.buildRulesShutdownMessage(),
      exit: lr.buildRulesExitMessage(),
      env: lm.buildLspMinEnv(layout, "C:\\Windows", "http://127.0.0.1:41999"),
      limits: overrides.map((o) => {
        // 일부러 잘못된 값(문자열, 모르는 이름)도 넣는다: 해석기가 거절하는지를 PS 이식본과 대조한다.
        const r = lr.resolveRulesLimits(o as Parameters<typeof lr.resolveRulesLimits>[0]);
        return { limits: r.limits, problems: r.problems };
      }),
      network: sources.map((s) => ({ s, v: st.isNetworkRuleSource(s) })),
      fragments: fragments.map((s) => ({ s, v: lr.forbiddenFragmentIn(s) })),
      drives: drives.map((s) => ({ s, v: lr.isDriveAbsolute(s) })),
    })
  );
} else {
  console.error("unknown mode");
  process.exit(2);
}
