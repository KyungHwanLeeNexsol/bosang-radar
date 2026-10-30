import { describe, expect, it } from "vitest";
import { LSP_RULES_PROBE_SHA256 } from "./lsp-rules";
import { buildRulesRecord, judgeRulesLoad, type RulesFacts } from "./lsp-rules-record";
import {
  crlf,
  enc,
  frames,
  happyStderrLines,
  progressCreate,
  progressNotification,
  RULES_REFRESHED,
} from "./testing/rules-fixtures";
import {
  HOME_OK,
  happyFacts,
  happyStdoutMessages,
  initResponse,
  layout,
  preambleByteLength,
} from "./testing/rules-facts";
import type { JsonRpcMessage } from "./types";

// ── 시험 장치 ───────────────────────────────────────────────────

const lines = (): string[] => happyStderrLines(layout.rulesDir);
const is = (text: string) => (line: string) => line === text;
const startsWith = (text: string) => (line: string) => line.startsWith(text);
const REFRESHING = is("Refreshing rules");
const REFRESHED = is("Rules refreshed");
const SCANNING_OPEN = is("Scanning open documents");
const SCANNED_OPEN = is("Scanned open documents");
const NO_TARGETS = startsWith("[00.83][WARNING]: No targets");
const GOT_ERRORS = startsWith("[00.82][INFO]: Got ");
const CI_DISABLED = startsWith("[00.81][DEBUG](default): CI disabled");
const LOADING = startsWith("[00.81][INFO]: loading local config");
const DONE_LOADING = startsWith("[00.82][INFO]: Done loading");

function stderrFacts(l: string[], over: Partial<RulesFacts> = {}): RulesFacts {
  const bytes = enc(crlf(l));
  return happyFacts({
    stderr: { bytes, total: bytes.byteLength, overflow: false, eof: true, readFailed: false },
    ...over,
  });
}
const edit = (fn: (l: string[]) => string[], over: Partial<RulesFacts> = {}): RulesFacts =>
  stderrFacts(fn(lines()), over);
const drop = (pred: (line: string) => boolean) => (l: string[]) => l.filter((x) => !pred(x));
const replace = (pred: (line: string) => boolean, text: string) => (l: string[]) =>
  l.map((x) => (pred(x) ? text : x));
const after =
  (pred: (line: string) => boolean, ...extra: string[]) =>
  (l: string[]) =>
    l.flatMap((x) => (pred(x) ? [x, ...extra] : [x]));
const duplicate = (pred: (line: string) => boolean) => (l: string[]) =>
  l.flatMap((x) => (pred(x) ? [x, x] : [x]));

function stdoutFacts(messages: JsonRpcMessage[], over: Partial<RulesFacts> = {}): RulesFacts {
  const bytes = frames(messages);
  return happyFacts({
    stdout: { bytes, total: bytes.byteLength, overflow: false, eof: true, readFailed: false },
    ...over,
  });
}

const verdictOf = (f: RulesFacts): string => judgeRulesLoad(f).verdict;
const rootsWith = (role: string, patch: Record<string, unknown>) =>
  happyFacts().roots.map((r) => (r.role === role ? { ...r, ...patch } : r));

// ── 성공과 13개 조건 ───────────────────────────────────────────

describe("정상 사실", () => {
  it("13개 조건이 모두 PASS이고 RULES_LOAD_OBSERVED다", () => {
    const j = judgeRulesLoad(happyFacts());
    expect(j.verdict).toBe("RULES_LOAD_OBSERVED");
    expect(j.status).toBe("OBSERVED");
    expect(j.reasons).toEqual([]);
    expect(j.conditions).toHaveLength(13);
    expect(j.conditions.map((c) => c.result)).toEqual(Array(13).fill("PASS"));
    expect(j.conditions.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("기록은 성공이어도 규칙 개수·의미·탐지를 세워 주지 않는다", () => {
    const r = buildRulesRecord(happyFacts());
    expect(r.verdict).toBe("RULES_LOAD_OBSERVED");
    expect(r.evidence_scope).toBe("INDIRECT_SIGNALS_ONLY");
    expect(r.not_established).toEqual({
      complete: "NOT_ESTABLISHED",
      security_pass: "NOT_ESTABLISHED",
      control_reference: "NOT_ESTABLISHED",
      scanning: "NOT_ESTABLISHED",
      pin_verification: "NOT_ESTABLISHED",
      loaded_rule_count: "NOT_OBSERVED",
      probe_rule_semantics_and_detection: "NOT_ESTABLISHED",
    });
    expect(r.coverage.unobserved).toContain("LOADED_RULE_COUNT");
    expect(r.coverage.unobserved).toContain("PROBE_RULE_SEMANTICS_AND_DETECTION");
    expect(r.coverage.unobserved).toContain("PROVENANCE_STUB_NOT_REAL_SEMGREP");
    expect(r.log.loading_paths_match_probe).toBe(true);
    expect(r.barrier.stdout_rules_refreshed_count).toBe(1);
    expect(r.barrier.stderr_scanned_open_documents_count).toBe(1);
    expect(r.server_messages.server_requests).toEqual({
      count: 2,
      allowed: 2,
      methods: ["window/workDoneProgress/create", "window/workDoneProgress/create"],
    });
  });

  it("같은 사실이면 같은 기록이다", () => {
    expect(JSON.stringify(buildRulesRecord(happyFacts()))).toBe(
      JSON.stringify(buildRulesRecord(happyFacts()))
    );
  });

  it("알림이 오기만 하고 나머지 신호가 없으면 성공이 아니다 — rulesRefreshed만으로 성공하지 않는다", () => {
    const f = edit((l) =>
      l.filter(
        (x) =>
          !(
            REFRESHING(x) ||
            REFRESHED(x) ||
            SCANNING_OPEN(x) ||
            SCANNED_OPEN(x) ||
            NO_TARGETS(x) ||
            GOT_ERRORS(x) ||
            LOADING(x) ||
            DONE_LOADING(x)
          )
      )
    );
    const j = judgeRulesLoad(f);
    expect(f.stdout.bytes.byteLength).toBeGreaterThan(0);
    expect(j.verdict).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
  });
});

// ── 서버를 띄우지 않은 경우와 띄운 뒤의 실패 ──────────────────────

describe("NOT_ATTEMPTED는 서버 기동이 없을 때만이다", () => {
  it("요청 거절 + 기동 없음 → NOT_ATTEMPTED", () => {
    const f = happyFacts({
      refusals: ["PROBE_HASH_MISMATCH"],
      spawn: { attempted: false, ok: false, pid: null },
      sends: [],
    });
    expect(judgeRulesLoad(f).verdict).toBe("NOT_ATTEMPTED:PROBE_HASH_MISMATCH");
  });

  it("기동한 뒤의 신원·결합·OS 차단 실패는 실행 사실을 지우지 않고 NOT_OBSERVED다", () => {
    for (const reason of [
      "ADMIN_IDENTITY_UNVERIFIED",
      "ADMIN_BINDING_FAILED",
      "ADMIN_TOKEN_MISMATCH",
      "ADMIN_HASH_CHANGED",
      "ADMIN_OS_BLOCK_UNCONFIRMED",
      "ADMIN_OS_BLOCK_ATTRIBUTED",
    ]) {
      const j = judgeRulesLoad(happyFacts({ externalReasons: [reason] }));
      expect(j.verdict, reason).toBe(`NOT_OBSERVED:${reason}`);
      expect(j.status, reason).not.toBe("NOT_ATTEMPTED");
    }
  });

  it("기동했는데 거절 사유가 함께 있으면 NOT_ATTEMPTED가 아니라 REFUSAL_AFTER_START다", () => {
    const j = judgeRulesLoad(happyFacts({ refusals: ["X"] }));
    expect(j.status).toBe("NOT_OBSERVED");
    expect(j.reasons[0]).toBe("REFUSAL_AFTER_START");
  });

  it("기동에 실패했으면 NOT_OBSERVED:SPAWN_FAILED다", () => {
    const f = happyFacts({
      spawn: { attempted: true, ok: false, pid: null },
      sends: [],
      trigger: "SPAWN_FAILED",
    });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:SPAWN_FAILED");
  });
});

// ── 조건 2·3: initialize와 initialized ─────────────────────────

describe("initialize 응답과 initialized (조건 2·3)", () => {
  it("초기화 응답이 오류면 NOT_OBSERVED:INIT_INVALID, initialized는 보내지 않은 상태", () => {
    const f = stdoutFacts(
      [{ jsonrpc: "2.0", id: "lsp-rules-init-1", error: { code: -32602, message: "x" } }],
      {
        sends: [
          { label: "initialize", tMs: 0, ok: true, stderrBytesAtSend: 0, stdoutBytesAtSend: 0 },
        ],
        trigger: "INIT_INVALID",
      }
    );
    const j = judgeRulesLoad(f);
    expect(j.verdict).toBe("NOT_OBSERVED:INIT_INVALID");
    expect(f.sends.some((s) => s.label === "initialized")).toBe(false);
  });

  it("응답이 없으면 NOT_OBSERVED:INIT_NO_RESPONSE", () => {
    const f = stdoutFacts([], { trigger: "INIT_TIMEOUT" });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:INIT_NO_RESPONSE");
  });

  it("result 안에 InitializeError({retry})가 담겨 와도 VALID가 아니다", () => {
    const f = stdoutFacts([{ jsonrpc: "2.0", id: "lsp-rules-init-1", result: { retry: false } }]);
    expect(verdictOf(f)).toBe("NOT_OBSERVED:INIT_INVALID");
  });

  it("초기화 오류가 로그에 남았으면 응답 모양이 멀쩡해도 VALID가 아니다", () => {
    const f = edit(
      after(is("Server initialized"), "[00.2][ERROR]: Error initializing server: boom")
    );
    expect(verdictOf(f)).toBe("NOT_OBSERVED:INIT_INVALID");
  });

  it("서버 버전이 핀과 다르면 initialized를 보냈다는 사실과 함께 NOT_OBSERVED다", () => {
    const f = stdoutFacts(
      happyStdoutMessages().map((m, i) => (i === 0 ? initResponse("1.0.0") : m))
    );
    const j = judgeRulesLoad(f);
    expect(j.verdict).toBe("NOT_OBSERVED:INIT_VERSION_MISMATCH");
    expect(j.reasons).toContain("INITIALIZED_SENT_WITHOUT_VALID_INIT");
  });

  it("핀 버전을 받지 못했으면 성공할 수 없다", () => {
    expect(verdictOf(happyFacts({ expectedVersion: null }))).toBe(
      "NOT_OBSERVED:INIT_VERSION_NOT_GIVEN"
    );
  });

  it("초기화 응답이 두 번 오면 NOT_OBSERVED:INIT_RESPONSE_DUPLICATE", () => {
    const messages = happyStdoutMessages();
    expect(verdictOf(stdoutFacts([...messages, initResponse()]))).toBe(
      "NOT_OBSERVED:INIT_RESPONSE_DUPLICATE"
    );
  });

  it("initialized가 두 번이거나, 응답보다 먼저이거나, 쓰기에 실패하면 무결성 문제다", () => {
    const base = happyFacts();
    const init = base.sends.find((s) => s.label === "initialized");
    if (init === undefined) throw new Error("fixture");
    expect(verdictOf({ ...base, sends: [...base.sends, { ...init, tMs: 310 }] })).toBe(
      "NOT_OBSERVED:INITIALIZED_SENT_MORE_THAN_ONCE"
    );
    expect(
      verdictOf({
        ...base,
        sends: base.sends.map((s) => (s.label === "initialized" ? { ...s, tMs: 100 } : s)),
      })
    ).toBe("NOT_OBSERVED:INITIALIZED_BEFORE_INIT_RESPONSE");
    expect(
      verdictOf({
        ...base,
        sends: base.sends.map((s) => (s.label === "initialized" ? { ...s, ok: false } : s)),
      })
    ).toBe("NOT_OBSERVED:INITIALIZED_WRITE_FAILED");
  });

  it("initialized 이전에 읽은 줄 중에 새로고침·스캔 신호가 있으면 NOT_OBSERVED (실시간에 못 잡은 경우)", () => {
    const f = happyFacts({
      sends: happyFacts().sends.map((s) =>
        s.label === "initialized" ? { ...s, stderrBytesAtSend: happyFacts().stderr.total } : s
      ),
    });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:PRE_INITIALIZED_SIGNAL_NOT_CAUGHT_LIVE");
  });
});

// ── 조건 4~8: 알림과 로그 신호 ─────────────────────────────────

describe("stdout 알림과 맨줄 4개 (조건 4·5)", () => {
  it("rulesRefreshed 알림이 없으면 SIGNAL_ABSENT, 두 번이면 SIGNAL_DUPLICATED", () => {
    expect(verdictOf(stdoutFacts(happyStdoutMessages().filter((m) => m !== RULES_REFRESHED)))).toBe(
      "NOT_CONFIRMED:SIGNAL_ABSENT"
    );
    expect(verdictOf(stdoutFacts([...happyStdoutMessages(), RULES_REFRESHED]))).toBe(
      "NOT_CONFIRMED:SIGNAL_DUPLICATED"
    );
  });

  it("맨줄 4개 중 하나라도 없으면 SIGNAL_ABSENT", () => {
    for (const pred of [REFRESHING, REFRESHED, SCANNING_OPEN, SCANNED_OPEN]) {
      expect(verdictOf(edit(drop(pred)))).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
    }
  });

  it("맨줄 4개 중 하나라도 두 번이면 SIGNAL_DUPLICATED", () => {
    for (const pred of [REFRESHING, REFRESHED, SCANNING_OPEN, SCANNED_OPEN]) {
      expect(verdictOf(edit(duplicate(pred)))).toBe("NOT_CONFIRMED:SIGNAL_DUPLICATED");
    }
  });

  it("순서가 어긋나면 ORDER_VIOLATION", () => {
    const swapped = (l: string[]): string[] =>
      l.map((x) => (REFRESHING(x) ? "Rules refreshed" : REFRESHED(x) ? "Refreshing rules" : x));
    expect(verdictOf(edit(swapped))).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
    const scanSwapped = (l: string[]): string[] =>
      l.map((x) =>
        SCANNING_OPEN(x)
          ? "Scanned open documents"
          : SCANNED_OPEN(x)
            ? "Scanning open documents"
            : x
      );
    expect(verdictOf(edit(scanSwapped))).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
  });

  it("JSON·세션 덤프 안에 들어 있는 같은 문구는 신호로 세지 않는다", () => {
    const hidden = [
      "[00.5][DEBUG](default): Handling request:",
      "{",
      '  "note": "Scanned open documents",',
      "Scanned open documents",
      "}",
    ];
    const f = edit((l) => after(REFRESHED, ...hidden)(drop(SCANNED_OPEN)(l)));
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
    expect(buildRulesRecord(f).log.embedded_signal_text).toBe(1);
  });
});

describe("로딩 쌍·오류 수·대상 없음 (조건 6·7·8)", () => {
  it("다른 파일을 로딩했으면 LOADING_PATH_UNEXPECTED", () => {
    const f = edit((l) =>
      l.map((x) =>
        LOADING(x) || DONE_LOADING(x) ? x.replace("lsp-rules-1-probe.yaml", "other.yaml") : x
      )
    );
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:LOADING_PATH_UNEXPECTED");
    expect(buildRulesRecord(f).log.loading_paths_match_probe).toBe(false);
  });

  it("프로브 경로에 더해 다른 경로의 로딩 줄이 하나 더 있어도 성공이 아니다", () => {
    const extra =
      "[00.82][INFO]: loading local config from C:\\ProgramData\\x\\other-rules\\y.yaml";
    expect(verdictOf(edit(after(LOADING, extra)))).toBe("NOT_CONFIRMED:SIGNAL_DUPLICATED");
  });

  it("경로 구분자·대소문자만 다른 같은 파일은 같은 경로로 본다", () => {
    const f = edit((l) =>
      l.map((x) =>
        LOADING(x) || DONE_LOADING(x)
          ? x.replace(/\\/g, "/").replace("ProgramData", "PROGRAMDATA")
          : x
      )
    );
    expect(verdictOf(f)).toBe("RULES_LOAD_OBSERVED");
  });

  it("로딩 시작 또는 완료가 없으면 SIGNAL_ABSENT", () => {
    expect(verdictOf(edit(drop(DONE_LOADING)))).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
    expect(verdictOf(edit(drop(LOADING)))).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
  });

  it("로딩 줄이 새로고침 구간 밖에 있으면 ORDER_VIOLATION", () => {
    const moved = (l: string[]): string[] => {
      const loading = l.find(LOADING) as string;
      return after(SCANNED_OPEN, loading)(drop(LOADING)(l));
    };
    expect(verdictOf(edit(moved))).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
  });

  it("Got N errors가 없으면 SIGNAL_ABSENT, 0이 아니면 설정 오류로 LOAD_FAILED", () => {
    expect(verdictOf(edit(drop(GOT_ERRORS)))).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
    expect(
      verdictOf(
        edit(
          replace(
            GOT_ERRORS,
            "[00.82][INFO]: Got 1 errors while refreshing rules in language server"
          )
        )
      )
    ).toBe("LOAD_FAILED:LOCAL_CONFIG_ERRORS");
  });

  it("No targets가 없으면 SIGNAL_ABSENT, 두 번이면 SIGNAL_DUPLICATED", () => {
    expect(verdictOf(edit(drop(NO_TARGETS)))).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
    expect(verdictOf(edit(duplicate(NO_TARGETS)))).toBe("NOT_CONFIRMED:SIGNAL_DUPLICATED");
  });

  it("No targets가 스캔 구간 밖에 있으면 ORDER_VIOLATION", () => {
    const moved = (l: string[]): string[] => {
      const line = l.find(NO_TARGETS) as string;
      return after(REFRESHING, line)(drop(NO_TARGETS)(l));
    };
    expect(verdictOf(edit(moved))).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
  });
});

describe("로딩 실패의 부정적 증거 (규칙 0개·YAML 오류·무효 규칙)", () => {
  const noRulesLine = "[00.83][WARNING]: No rules to run! Not scanning anything.";

  it("규칙 0개: Got 0 errors + No rules to run! → LOAD_FAILED:NO_RULES_TO_RUN", () => {
    expect(verdictOf(edit(replace(NO_TARGETS, noRulesLine)))).toBe("LOAD_FAILED:NO_RULES_TO_RUN");
  });

  it("무효 규칙: Done loading + Got 0 errors + No rules → LOAD_FAILED:NO_RULES_TO_RUN", () => {
    const j = judgeRulesLoad(edit(replace(NO_TARGETS, noRulesLine)));
    expect(j.status).toBe("LOAD_FAILED");
    expect(j.conditions[7].result).toBe("FAIL");
  });

  it("YAML 오류: 로딩 시작·Got 1 errors·No rules → LOCAL_CONFIG_ERRORS가 NO_RULES_TO_RUN보다 앞선다", () => {
    const f = edit((l) =>
      replace(
        NO_TARGETS,
        noRulesLine
      )(
        replace(
          GOT_ERRORS,
          "[00.82][INFO]: Got 1 errors while refreshing rules in language server"
        )(drop(DONE_LOADING)(l))
      )
    );
    const j = judgeRulesLoad(f);
    expect(j.verdict).toBe("LOAD_FAILED:LOCAL_CONFIG_ERRORS");
    expect(j.reasons).toContain("NO_RULES_TO_RUN");
  });

  it("로딩 완료 줄이 없는 것만으로는 설정 오류로 단정하지 않는다 (Got 0 errors와 모순이라 확인 불가), 시간 초과로 끊긴 경우는 부재일 뿐이다", () => {
    expect(verdictOf(edit(drop(DONE_LOADING)))).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
    // 로딩 시작 줄까지만 나오고 장벽 한도에서 끊었다: 완료 줄이 없는 것은 부재이지 설정 오류의 관측이 아니다.
    const all = lines();
    const cutBytes = enc(crlf(all.slice(0, all.findIndex(LOADING) + 1)));
    const stdoutBytes = frames(happyStdoutMessages().slice(0, 2));
    const f = happyFacts({
      stdout: {
        bytes: stdoutBytes,
        total: stdoutBytes.byteLength,
        overflow: false,
        eof: true,
        readFailed: false,
      },
      stderr: {
        bytes: cutBytes,
        total: cutBytes.byteLength,
        overflow: false,
        eof: true,
        readFailed: false,
      },
      trigger: "RULES_TIMEOUT",
      abort: { condition: "A9", detail: "BARRIER_LIMIT", tMs: 60300 },
      sends: happyFacts().sends.filter(
        (s) => s.label === "initialize" || s.label === "initialized"
      ),
      stdinClosed: { byHarness: true, ok: true, tMs: 60300 },
      kill: { count: 1, firstTMs: 70300, confirmed: true },
      exit: { observed: true, code: null, signal: "SIGKILL", tMs: 70310 },
    });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:RULES_TIMEOUT");
  });

  it("Rules not loaded yet → LOAD_FAILED:RULES_NOT_LOADED", () => {
    expect(verdictOf(edit(after(REFRESHING, "Rules not loaded yet")))).toBe(
      "LOAD_FAILED:RULES_NOT_LOADED"
    );
  });

  it("규칙을 건너뛴다는 경고가 보이면 LOAD_FAILED:INVALID_RULE_SKIPPED", () => {
    const f = edit(
      after(
        LOADING,
        "[00.81][WARNING](semgrep.parsing): skipping rule lsp-rules-1-probe, error = x"
      )
    );
    expect(verdictOf(f)).toBe("LOAD_FAILED:INVALID_RULE_SKIPPED");
  });

  it("ERROR 항목은 다른 신호가 다 좋아도 LOAD_FAILED:SERVER_ERROR_LOGGED", () => {
    expect(verdictOf(edit(after(REFRESHED, "[00.9][ERROR]: Unhandled message")))).toBe(
      "LOAD_FAILED:SERVER_ERROR_LOGGED"
    );
    expect(
      verdictOf(
        stdoutFacts([
          ...happyStdoutMessages(),
          {
            jsonrpc: "2.0",
            method: "window/showMessage",
            params: { type: 1, message: "boom" },
          },
        ])
      )
    ).toBe("LOAD_FAILED:SERVER_ERROR_NOTIFIED");
  });

  it("서버가 새로고침 도중 스스로 끝났으면(우리가 죽이지 않았다) LOAD_FAILED:RULES_REFRESH_INCOMPLETE", () => {
    const l = lines();
    const cut = l.slice(0, l.findIndex(LOADING) + 1);
    const f = stderrFacts(cut, {
      trigger: "CHILD_EXITED_EARLY",
      sends: happyFacts().sends.filter((s) => s.label !== "shutdown" && s.label !== "exit"),
      exit: { observed: true, code: 1, signal: null, tMs: 900 },
    });
    expect(verdictOf({ ...f, stdout: stdoutFacts(happyStdoutMessages().slice(0, 3)).stdout })).toBe(
      "LOAD_FAILED:RULES_REFRESH_INCOMPLETE"
    );
  });
});

// ── 조건 9·10: 나오면 안 되는 신호 ─────────────────────────────

describe("금지 신호 (조건 9·10) — 실시간에 못 잡았어도 성공이 아니다", () => {
  const cases: [string, string][] = [
    ["엔진 실행", "Running Semgrep with 1 rules"],
    ["엔진 오류 줄", "Semgrep errors: "],
    ["스캔 파일 수", "Scanned 3 files"],
    ["일치 수", "Found 0 matches"],
    ["작업 영역 스캔", "Scanning workspace"],
    ["단일 파일 스캔", "Scanning single file"],
    ["레지스트리", "[00.8][INFO]: No rules source specified, using auto"],
    ["내려받기", "[00.8][INFO]: trying to download from https://example.invalid/x"],
    ["토큰 발견", "[00.8][INFO]: Found API token in environment variables"],
    ["설정 파일 발견", "[00.8][INFO]: Settings file found at C:\\x\\settings.yml"],
  ];
  for (const [name, line] of cases) {
    it(`${name}: ${line}`, () => {
      const j = judgeRulesLoad(edit(after(REFRESHED, line)));
      expect(j.status).toBe("NOT_OBSERVED");
      expect(j.verdict).toMatch(/_NOT_CAUGHT_LIVE$/);
    });
  }

  it("토큰이 없을 때의 정상 줄(No settings file found)은 금지 줄이 아니다", () => {
    expect(verdictOf(happyFacts())).toBe("RULES_LOAD_OBSERVED");
  });

  it("CI disabled 줄이 없으면 SIGNAL_ABSENT", () => {
    expect(verdictOf(edit(drop(CI_DISABLED)))).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
  });

  it("raw 문자열 download·registry가 어디에든 보이면 NOT_OBSERVED (LSP-MIN-1과 같은 감시)", () => {
    expect(
      judgeRulesLoad(edit(after(REFRESHED, "[00.8][DEBUG](default): registry lookup"))).status
    ).toBe("NOT_OBSERVED");
  });

  it("publishDiagnostics, 허용 밖 서버 요청, 서버 요청 3건 이상은 성공이 아니다", () => {
    const diag: JsonRpcMessage = {
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: "file:///x", diagnostics: [] },
    };
    expect(verdictOf(stdoutFacts([...happyStdoutMessages(), diag]))).toBe(
      "NOT_OBSERVED:DIAGNOSTICS_SEEN_NOT_CAUGHT_LIVE"
    );
    const config: JsonRpcMessage = {
      jsonrpc: "2.0",
      id: 9,
      method: "workspace/configuration",
      params: { items: [] },
    };
    expect(verdictOf(stdoutFacts([...happyStdoutMessages(), config]))).toMatch(
      /^NOT_OBSERVED:SERVER_REQUEST/
    );
    expect(verdictOf(stdoutFacts([...happyStdoutMessages(), progressCreate(3, "third")]))).toMatch(
      /^NOT_OBSERVED:SERVER_REQUEST/
    );
    const badShape: JsonRpcMessage = {
      jsonrpc: "2.0",
      id: 5,
      method: "window/workDoneProgress/create",
      params: {},
    };
    expect(verdictOf(stdoutFacts([...happyStdoutMessages().slice(0, 4), badShape]))).toBe(
      "NOT_OBSERVED:SERVER_REQUEST_NOT_ALLOWED_NOT_CAUGHT_LIVE"
    );
  });

  it("허용 밖 알림은 NOT_CONFIRMED:UNEXPECTED_NOTIFICATION, 알 수 없는 WARNING은 UNEXPECTED_WARNING", () => {
    const odd: JsonRpcMessage = { jsonrpc: "2.0", method: "custom/telemetry", params: {} };
    expect(verdictOf(stdoutFacts([...happyStdoutMessages(), odd]))).toBe(
      "NOT_CONFIRMED:UNEXPECTED_NOTIFICATION"
    );
    expect(verdictOf(edit(after(REFRESHED, "[00.9][WARNING]: something odd")))).toBe(
      "NOT_CONFIRMED:UNEXPECTED_WARNING"
    );
  });

  it("shutdown 응답이 와도(소스상 오지 않는다) 기록에 남기기만 하고 판정을 바꾸지 않는다", () => {
    const f = stdoutFacts([
      ...happyStdoutMessages(),
      { jsonrpc: "2.0", id: "lsp-rules-shutdown-1", result: null },
    ]);
    expect(verdictOf(f)).toBe("RULES_LOAD_OBSERVED");
    expect(buildRulesRecord(f).server_messages.shutdown_response_seen).toBe(true);
  });

  it("진행 요청에 쓴 토큰 모양(숫자 id·문자열 id)은 둘 다 허용한다", () => {
    const f = stdoutFacts([
      ...happyStdoutMessages().slice(0, 4),
      progressCreate("req-b", 7 as unknown as string),
      progressNotification("t", "end"),
    ]);
    expect(buildRulesRecord(f).server_messages.server_requests.allowed).toBe(2);
  });
});

describe("모르는 로그 형태는 성공으로 보정하지 않는다", () => {
  it("알 수 없는 수준의 머리말은 LOG_SHAPE_UNRECOGNIZED", () => {
    const f = edit(
      replace(GOT_ERRORS, "[00.82][NOTICE]: Got 0 errors while refreshing rules in language server")
    );
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED");
  });

  it("수준이 기대와 다르면(No targets가 INFO, 로딩이 DEBUG) LOG_SHAPE_UNRECOGNIZED", () => {
    expect(
      verdictOf(
        edit(replace(NO_TARGETS, "[00.83][INFO]: No targets to scan! Not scanning anything."))
      )
    ).toBe("NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED");
    expect(
      verdictOf(
        edit(
          replace(
            LOADING,
            "[00.81][DEBUG](default): loading local config from C:\\ProgramData\\x\\work\\lsp\\lsp-state\\rules-probe\\lsp-rules-1-probe.yaml"
          )
        )
      )
    ).toBe("NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED");
  });

  it("맨줄이어야 할 신호에 머리말이 붙으면 LOG_SHAPE_UNRECOGNIZED", () => {
    expect(verdictOf(edit(replace(REFRESHED, "[00.82][INFO]: Rules refreshed")))).toBe(
      "NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED"
    );
  });

  it("읽지 못하는 머리말이 섞여 있으면 다른 신호가 다 좋아도 성공이 아니다", () => {
    expect(verdictOf(edit(after(REFRESHED, "[00.9] mystery line")))).toBe(
      "NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED"
    );
  });

  it("머리말도 알려진 메시지도 아닌 고아 맨줄이 앞에 있으면 성공이 아니다", () => {
    expect(verdictOf(edit((l) => ["stray text with no record", ...l]))).toBe(
      "NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED"
    );
  });
});

// ── 조건 11·12: 파일·수신기 ────────────────────────────────────

describe("파일 변화와 수신기 (조건 11·12)", () => {
  it("작업 영역에 파일이 생기면 NOT_OBSERVED:WORKSPACE_NOT_EMPTY_THROUGHOUT", () => {
    const f = happyFacts({ roots: rootsWith("WORKSPACE", { filesAfter: 1, added: ["x.txt"] }) });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:WORKSPACE_NOT_EMPTY_THROUGHOUT");
  });

  it("규칙 폴더에 파일이 늘거나 프로브가 없어지면 NOT_OBSERVED:RULES_DIR_NOT_EXACTLY_PROBE", () => {
    expect(
      verdictOf(happyFacts({ roots: rootsWith("RULES_DIR", { filesAfter: 2, added: ["b.yaml"] }) }))
    ).toBe("NOT_OBSERVED:RULES_DIR_NOT_EXACTLY_PROBE");
    expect(
      verdictOf(
        happyFacts({
          roots: rootsWith("RULES_DIR", { filesAfter: 0, removed: ["lsp-rules-1-probe.yaml"] }),
        })
      )
    ).toBe("NOT_OBSERVED:RULES_DIR_NOT_EXACTLY_PROBE");
  });

  it("규칙 폴더가 처음부터 프로브 하나가 아니었으면 성립하지 않는다", () => {
    expect(verdictOf(happyFacts({ roots: rootsWith("RULES_DIR", { filesBefore: 0 }) }))).toBe(
      "NOT_OBSERVED:RULES_DIR_NOT_EXACTLY_PROBE"
    );
  });

  it("홈에서는 지문 폴더 밖에 쓰면 위반, 읽지 못하면 확인 불가", () => {
    expect(
      verdictOf(
        happyFacts({ roots: rootsWith("HOME_DIR", { filesAfter: 1, added: ["settings.yml"] }) })
      )
    ).toBe("NOT_OBSERVED:HOME_UNEXPECTED_WRITE");
    expect(
      verdictOf(happyFacts({ roots: rootsWith("HOME_DIR", { filesAfter: null, added: [] }) }))
    ).toBe("NOT_OBSERVED:HOME_UNEXPECTED_WRITE");
    expect(
      verdictOf(happyFacts({ roots: rootsWith("HOME_DIR", { filesAfter: 0, added: [] }) }))
    ).toBe("RULES_LOAD_OBSERVED");
    expect(HOME_OK.startsWith(".semgrep/cache/fingerprinted_ignored_findings/")).toBe(true);
  });

  it("프로브 해시: 원본·복사 직후·실행 뒤 중 하나라도 고정값과 다르면 성립하지 않는다", () => {
    const wrong = "0".repeat(64);
    expect(verdictOf(happyFacts({ probe: { ...happyFacts().probe, sourceSha256: wrong } }))).toBe(
      "NOT_OBSERVED:PROBE_SOURCE_HASH_UNEXPECTED"
    );
    expect(
      verdictOf(happyFacts({ probe: { ...happyFacts().probe, afterCopySha256: wrong } }))
    ).toBe("NOT_OBSERVED:PROBE_COPY_HASH_UNEXPECTED");
    expect(verdictOf(happyFacts({ probe: { ...happyFacts().probe, afterRunSha256: wrong } }))).toBe(
      "NOT_OBSERVED:PROBE_CHANGED_DURING_RUN"
    );
    expect(verdictOf(happyFacts({ probe: { ...happyFacts().probe, afterRunSha256: null } }))).toBe(
      "NOT_OBSERVED:PROBE_CHANGED_DURING_RUN"
    );
    expect(LSP_RULES_PROBE_SHA256).toHaveLength(64);
  });

  it("설치물 해시가 달라졌거나 비교하지 못했으면 성립하지 않는다", () => {
    expect(
      verdictOf(happyFacts({ artifacts: [{ label: "semgrep-core", before: "a", after: "b" }] }))
    ).toBe("NOT_OBSERVED:ARTIFACT_HASH_UNCHANGED_NOT_CONFIRMED");
    expect(
      verdictOf(happyFacts({ artifacts: [{ label: "semgrep-core", before: "a", after: null }] }))
    ).toBe("NOT_OBSERVED:ARTIFACT_HASH_UNCHANGED_NOT_CONFIRMED");
  });

  it("수신기: 건수 증가·읽기 불가·OS 차단은 성립하지 않는다", () => {
    const live = happyFacts().live;
    expect(
      verdictOf(happyFacts({ live: { ...live, receiver: { ...live.receiver, finalHits: 1 } } }))
    ).toBe("NOT_OBSERVED:RECEIVER_HITS_INCREASED");
    expect(
      verdictOf(happyFacts({ live: { ...live, receiver: { ...live.receiver, finalHits: null } } }))
    ).toBe("NOT_OBSERVED:RECEIVER_UNOBSERVABLE");
    expect(
      verdictOf(
        happyFacts({ live: { ...live, receiver: { ...live.receiver, baselineHits: null } } })
      )
    ).toBe("NOT_OBSERVED:RECEIVER_UNOBSERVABLE");
  });

  it("허용 밖 이미지가 보였으면 성립하지 않는다", () => {
    const live = happyFacts().live;
    expect(
      verdictOf(
        happyFacts({
          live: { ...live, processes: { ...live.processes, disallowed: ["curl.exe"] } },
        })
      )
    ).toBe("NOT_OBSERVED:DISALLOWED_IMAGE_SEEN");
  });
});

// ── 조건 13과 정리 ────────────────────────────────────────────

describe("종료 경로 (조건 13)", () => {
  it("종료 코드가 0이 아니거나 신호로 끝났거나 강제 종료·stdin 닫기가 있었으면 NOT_OBSERVED", () => {
    expect(verdictOf(happyFacts({ exit: { observed: true, code: 1, signal: null, tMs: 1 } }))).toBe(
      "NOT_OBSERVED:EXIT_CODE_NOT_ZERO"
    );
    expect(
      verdictOf(happyFacts({ exit: { observed: true, code: null, signal: "SIGKILL", tMs: 1 } }))
    ).toBe("NOT_OBSERVED:EXIT_CODE_NOT_ZERO");
    expect(verdictOf(happyFacts({ kill: { count: 1, firstTMs: 5, confirmed: true } }))).toBe(
      "NOT_OBSERVED:FORCE_KILLED"
    );
    expect(verdictOf(happyFacts({ stdinClosed: { byHarness: true, ok: true, tMs: 5 } }))).toBe(
      "NOT_OBSERVED:STDIN_CLOSED_BY_HARNESS"
    );
    expect(
      verdictOf(happyFacts({ exit: { observed: false, code: null, signal: null, tMs: null } }))
    ).toBe("NOT_OBSERVED:EXIT_NOT_OBSERVED");
  });

  it("shutdown 또는 exit를 보내지 못했으면 NOT_OBSERVED:SHUTDOWN_EXIT_NOT_SENT", () => {
    const sends = happyFacts().sends.filter((s) => s.label !== "exit");
    expect(verdictOf(happyFacts({ sends }))).toBe("NOT_OBSERVED:SHUTDOWN_EXIT_NOT_SENT");
  });

  it("시간 초과 종류는 NOT_OBSERVED로 남는다 (장벽 한도 A9는 중단이 아니라 시간 초과다)", () => {
    expect(verdictOf(happyFacts({ also: ["EXIT_TIMEOUT"] }))).toBe("NOT_OBSERVED:EXIT_TIMEOUT");
    expect(verdictOf(happyFacts({ also: ["TOTAL_TIMEOUT"] }))).toBe("NOT_OBSERVED:TOTAL_TIMEOUT");
    expect(
      verdictOf(
        happyFacts({
          trigger: "RULES_TIMEOUT",
          abort: { condition: "A9", detail: "BARRIER_LIMIT", tMs: 60400 },
        })
      )
    ).toBe("NOT_OBSERVED:RULES_TIMEOUT");
  });

  it("스트림 읽기 실패·출력 상한·프레임 오류는 로그가 좋아도 NOT_OBSERVED (읽기 실패가 나중에 와도 마찬가지)", () => {
    const f = happyFacts();
    expect(
      verdictOf({
        ...f,
        stderr: { ...f.stderr, readFailed: true, eof: false, readError: "Error: x" },
      })
    ).toBe("NOT_OBSERVED:STREAM_READ_FAILED");
    expect(verdictOf({ ...f, stdout: { ...f.stdout, readFailed: true, eof: false } })).toBe(
      "NOT_OBSERVED:STREAM_READ_FAILED"
    );
    expect(verdictOf({ ...f, stderr: { ...f.stderr, overflow: true } })).toBe(
      "NOT_OBSERVED:OUTPUT_LIMIT"
    );
    expect(verdictOf({ ...f, frameError: { kind: "MALFORMED", detail: "x", atByte: 3 } })).toBe(
      "NOT_OBSERVED:FRAME_ERROR:MALFORMED"
    );
    expect(verdictOf({ ...f, trigger: "STDIN_ERROR" })).toBe("NOT_OBSERVED:STDIN_ERROR");
  });

  it("정리가 실패해도 관측 판정은 따로다", () => {
    const f = happyFacts({
      cleanup: { ...happyFacts().cleanup, dispose: "FAILED", problems: ["DISPOSE_FAILED"] },
    });
    const r = buildRulesRecord(f);
    expect(r.verdict).toBe("RULES_LOAD_OBSERVED");
    expect(r.cleanup.ok).toBe(false);
  });
});

// ── 우선순위: 후속 사유가 판정을 뒤집지 않는다 ─────────────────

describe("판정 우선순위", () => {
  it("실시간 중단은 뒤따른 시간 초과·강제 종료·읽기 실패가 있어도 ABORTED로 남는다", () => {
    const f = happyFacts({
      trigger: "LIVE_ABORT",
      also: ["TOTAL_TIMEOUT", "STREAM_READ_FAILED"],
      abort: { condition: "A1", detail: "runningRules", tMs: 700 },
      kill: { count: 1, firstTMs: 701, confirmed: true },
      exit: { observed: true, code: null, signal: "SIGKILL", tMs: 710 },
    });
    const j = judgeRulesLoad(f);
    expect(j.verdict).toBe("ABORTED:A1");
    expect(j.status).toBe("ABORTED");
    expect(j.reasons[0]).toBe("ABORT:A1");
  });

  it("중단 기록이 있으면 로그가 완벽해도 성공이 될 수 없다", () => {
    for (const condition of ["A1", "A2", "A3", "A4", "A5", "A6", "A7"] as const) {
      const j = judgeRulesLoad(
        happyFacts({ trigger: "LIVE_ABORT", abort: { condition, detail: "x", tMs: 9 } })
      );
      expect(j.verdict).toBe(`ABORTED:${condition}`);
    }
  });

  it("관측된 부정적 증거는 종료 단계의 시간 초과·강제 종료보다 우선한다", () => {
    const f = edit(after(REFRESHED, "[00.9][ERROR]: Unhandled message"), {
      also: ["EXIT_TIMEOUT"],
      kill: { count: 1, firstTMs: 5, confirmed: true },
      exit: { observed: true, code: null, signal: "SIGKILL", tMs: 9 },
    });
    expect(verdictOf(f)).toBe("LOAD_FAILED:SERVER_ERROR_LOGGED");
  });

  it("무결성 문제는 부정적 증거보다 우선한다 (로그를 믿을 수 없으므로)", () => {
    const f = edit(after(REFRESHED, "[00.9][ERROR]: Unhandled message"), {
      artifacts: [{ label: "semgrep-core", before: "a", after: "b" }],
    });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:ARTIFACT_HASH_UNCHANGED_NOT_CONFIRMED");
  });

  it("준비 단계에서 거절돼 서버가 안 떴으면 로그가 있어도 NOT_ATTEMPTED가 이긴다", () => {
    const f = happyFacts({
      refusals: ["PATH_ESCAPES_WORK"],
      spawn: { attempted: false, ok: false, pid: null },
    });
    expect(verdictOf(f)).toBe("NOT_ATTEMPTED:PATH_ESCAPES_WORK");
  });
});

describe("기록의 모양", () => {
  it("로그 요약에는 신호별 개수와 형태 사실이 들어가고 원문 줄은 들어가지 않는다", () => {
    const r = buildRulesRecord(happyFacts());
    expect(r.log.signals.refreshingRules).toEqual({ ok: 1, shape_mismatch: 0 });
    expect(r.log.signals.noTargets).toEqual({ ok: 1, shape_mismatch: 0 });
    expect(r.log.malformed_headers).toBe(0);
    expect(JSON.stringify(r)).not.toContain("Refreshing rules");
    expect(r.streams.stderr.bytes).toBe(happyFacts().stderr.total);
    expect(r.sent.map((s) => s.label)).toEqual(["initialize", "initialized", "shutdown", "exit"]);
    expect(r.sent[1].stderrBytesAtSend).toBe(preambleByteLength());
  });

  it("거절된 요청의 기록은 trigger가 null이고 조건은 평가하지 않는다", () => {
    const r = buildRulesRecord(
      happyFacts({
        refusals: ["PROBE_HASH_MISMATCH"],
        spawn: { attempted: false, ok: false, pid: null },
        sends: [],
        stdout: {
          bytes: new Uint8Array(0),
          total: 0,
          overflow: false,
          eof: false,
          readFailed: false,
        },
        stderr: {
          bytes: new Uint8Array(0),
          total: 0,
          overflow: false,
          eof: false,
          readFailed: false,
        },
      })
    );
    expect(r.status).toBe("NOT_ATTEMPTED");
    expect(r.termination.trigger).toBeNull();
    expect(r.conditions.every((c) => c.result === "NOT_EVALUATED")).toBe(true);
  });
});
