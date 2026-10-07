import { describe, expect, it } from "vitest";

import {
  DEFAULT_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  GATE_CLOSED_MARKER,
  formatSmokeReport,
  findCssChunkPath,
  observeGateState,
  parseSmokeArgs,
  runSmokeCheck,
  type SmokeFetch,
  type SmokeReport,
} from "./smoke-check";

// SPEC-B2C-LAUNCH-001 M4 (AC-B2CLAUNCH-013) — smoke 검사 로직 시험. 네트워크 없이 주입한 fetch로 돈다.
// 로컬 서버 일곱 상태의 실제 관측은 scripts/verify-smoke-check.ts가 맡는다.
// 예약 도메인(.invalid)만 쓴다 — 실제 호스트·주소 값을 시험에 두지 않는다.

const BASE = "http://smoke-fixture.invalid:3000";
const CSS = "/_next/static/chunks/fixture-asset.css";

const CLOSED_HTML = `<html><head><link rel="stylesheet" href="${CSS}"/></head><body><h1>${GATE_CLOSED_MARKER}</h1></body></html>`;
const OPEN_HTML = `<html><head><link rel="stylesheet" href="${CSS}"/></head><body><main>fixture-open</main></body></html>`;

type Step = number | Error | { status: number; body: string };

/** 주소별로 응답을 순서대로 돌려주는 가짜 fetch. 마지막 응답은 반복한다. 호출 기록을 남긴다. */
function scripted(routes: Record<string, Step[]>): { fetchImpl: SmokeFetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: SmokeFetch = async (url) => {
    calls.push(url);
    const queue = routes[url];
    if (!queue || queue.length === 0) throw new Error(`예상 밖의 요청: ${url}`);
    const step = queue.length > 1 ? (queue.shift() as Step) : queue[0];
    if (step instanceof Error) throw step;
    if (typeof step === "number") return { status: step, text: async () => "" };
    return { status: step.status, text: async () => step.body };
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};

/** 검사 이름·결과 쌍과 상세 문구를 TypeError 없이 읽는 도우미. */
const outcome = (report: SmokeReport) => report.checks.map((c) => [c.name, c.ok]);
const details = (report: SmokeReport) => report.checks.map((c) => c.detail).join(" | ");

function run(
  routes: Record<string, Step[]>,
  extra: { attempts?: number; baseUrl?: string; log?: (line: string) => void } = {}
) {
  const { fetchImpl, calls } = scripted(routes);
  const sleeps: number[] = [];
  const promise = runSmokeCheck({
    baseUrl: extra.baseUrl ?? BASE,
    attempts: extra.attempts ?? 3,
    retryDelayMs: 7,
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    log: extra.log,
  });
  return { promise, calls, sleeps };
}

describe("findCssChunkPath", () => {
  it("본문의 첫 CSS 청크 경로를 돌려준다", () => {
    expect(findCssChunkPath(OPEN_HTML)).toBe(CSS);
    expect(
      findCssChunkPath(
        `<link href="/_next/static/chunks/a.css"><link href="/_next/static/chunks/b.css">`
      )
    ).toBe("/_next/static/chunks/a.css");
  });

  it("참조가 없으면 null이다(js 청크·다른 경로는 CSS 청크가 아니다)", () => {
    expect(findCssChunkPath("<html></html>")).toBeNull();
    expect(findCssChunkPath(`<script src="/_next/static/chunks/a.js"></script>`)).toBeNull();
    expect(findCssChunkPath(`<link href="/other/a.css">`)).toBeNull();
  });
});

describe("observeGateState — 정보용 관측", () => {
  it("placeholder 문구가 있으면 닫힘, 없으면 열림", () => {
    expect(observeGateState(CLOSED_HTML)).toBe("closed");
    expect(observeGateState(OPEN_HTML)).toBe("open");
  });

  it("본문이 비어 있으면 알 수 없음", () => {
    expect(observeGateState("")).toBe("unknown");
  });
});

describe("runSmokeCheck — 두 상태 수용(D-LAUNCH-06 (a))", () => {
  it("닫힘 상태(placeholder 본문)는 통과한다", async () => {
    const { promise } = run({
      [`${BASE}/`]: [{ status: 200, body: CLOSED_HTML }],
      [`${BASE}${CSS}`]: [200],
    });
    const report = await promise;
    expect(report.ok).toBe(true);
    expect(report.gateState).toBe("closed");
    expect(outcome(report)).toEqual([
      ["home", true],
      ["css-referenced", true],
      ["css-served", true],
    ]);
  });

  it("열림 상태(placeholder 없는 본문)도 통과한다 — 게이트 상태는 판정에 쓰지 않는다", async () => {
    const { promise } = run({
      [`${BASE}/`]: [{ status: 200, body: OPEN_HTML }],
      [`${BASE}${CSS}`]: [200],
    });
    const report = await promise;
    expect(report.ok).toBe(true);
    expect(report.gateState).toBe("open");
  });

  it("2xx 아래 200~299 어느 상태든 통과하고 3xx·4xx는 실패한다", async () => {
    for (const status of [200, 204, 299]) {
      const { promise } = run({
        [`${BASE}/`]: [{ status, body: OPEN_HTML }],
        [`${BASE}${CSS}`]: [200],
      });
      expect((await promise).ok).toBe(true);
    }
    for (const status of [199, 300, 302, 404]) {
      const { promise } = run({
        [`${BASE}/`]: [{ status, body: OPEN_HTML }],
        [`${BASE}${CSS}`]: [200],
      });
      expect((await promise).ok).toBe(false);
    }
  });
});

describe("runSmokeCheck — 배포 건강(게이트 상태와 무관하게 실패)", () => {
  it("HTTP 500이 계속되면 시도 횟수만큼 요청하고 재시도 사이에만 기다린 뒤 실패한다", async () => {
    const { promise, calls, sleeps } = run(
      { [`${BASE}/`]: [{ status: 500, body: OPEN_HTML }] },
      { attempts: 4 }
    );
    const report = await promise;
    expect(report.ok).toBe(false);
    expect(calls).toEqual(Array(4).fill(`${BASE}/`));
    expect(sleeps).toEqual([7, 7, 7]);
    expect(outcome(report)).toEqual([["home", false]]);
    expect(details(report)).toContain("500");
    expect(report.gateState).toBe("unknown");
  });

  it("500이어도 본문이 닫힘 표지든 열림 표지든 똑같이 실패한다", async () => {
    for (const body of [CLOSED_HTML, OPEN_HTML]) {
      const { promise } = run({ [`${BASE}/`]: [{ status: 500, body }] });
      expect((await promise).ok).toBe(false);
    }
  });

  it("처음 500이어도 이후 2xx가 오면 통과한다(기동 직후 재시도)", async () => {
    const { promise, calls, sleeps } = run({
      [`${BASE}/`]: [500, { status: 200, body: OPEN_HTML }],
      [`${BASE}${CSS}`]: [200],
    });
    const report = await promise;
    expect(report.ok).toBe(true);
    expect(calls.filter((url) => url === `${BASE}/`)).toHaveLength(2);
    expect(sleeps).toEqual([7]);
  });

  it("전송 실패(연결 거부 등)도 재시도하고 끝까지 실패하면 상태 0으로 실패한다", async () => {
    const { promise, calls } = run({ [`${BASE}/`]: [new Error("연결 거부")] }, { attempts: 2 });
    const report = await promise;
    expect(report.ok).toBe(false);
    expect(calls).toHaveLength(2);
    expect(outcome(report)).toEqual([["home", false]]);
    expect(details(report)).toContain("0");
    expect(details(report)).not.toContain("연결 거부");
  });

  it("200이지만 CSS 청크 참조가 없으면 실패한다(닫힘·열림 모두)", async () => {
    for (const body of [
      `<html><body>${GATE_CLOSED_MARKER}</body></html>`,
      `<html><body>fixture-open</body></html>`,
    ]) {
      const { promise, calls } = run({ [`${BASE}/`]: [{ status: 200, body }] });
      const report = await promise;
      expect(report.ok).toBe(false);
      expect(outcome(report)).toEqual([
        ["home", true],
        ["css-referenced", false],
      ]);
      expect(calls).toEqual([`${BASE}/`]);
    }
  });

  it("참조한 CSS 청크가 404면 실패한다(닫힘·열림 모두)", async () => {
    for (const body of [CLOSED_HTML, OPEN_HTML]) {
      const { promise } = run({
        [`${BASE}/`]: [{ status: 200, body }],
        [`${BASE}${CSS}`]: [404],
      });
      const report = await promise;
      expect(report.ok).toBe(false);
      expect(outcome(report)).toEqual([
        ["home", true],
        ["css-referenced", true],
        ["css-served", false],
      ]);
      expect(details(report)).toContain("404");
    }
  });

  it("홈 본문을 읽다가 끊기면 본문이 없는 것으로 보고 실패한다(게이트 상태는 알 수 없음)", async () => {
    const report = await runSmokeCheck({
      baseUrl: BASE,
      attempts: 1,
      fetchImpl: async () => ({
        status: 200,
        text: async () => {
          throw new Error("본문 읽기 실패");
        },
      }),
    });
    expect(report.ok).toBe(false);
    expect(outcome(report)).toEqual([
      ["home", true],
      ["css-referenced", false],
    ]);
    expect(report.gateState).toBe("unknown");
  });

  it("CSS 청크 요청이 전송 실패면 실패한다", async () => {
    const { promise } = run({
      [`${BASE}/`]: [{ status: 200, body: OPEN_HTML }],
      [`${BASE}${CSS}`]: [new Error("시간 초과")],
    });
    const report = await promise;
    expect(report.ok).toBe(false);
    expect(outcome(report)).toEqual([
      ["home", true],
      ["css-referenced", true],
      ["css-served", false],
    ]);
  });
});

describe("runSmokeCheck — 주소 조합·기본값·로그", () => {
  it("기준 주소의 끝 슬래시 유무와 무관하게 같은 주소로 요청한다", async () => {
    for (const baseUrl of [BASE, `${BASE}/`]) {
      const { promise, calls } = run(
        {
          [`${BASE}/`]: [{ status: 200, body: OPEN_HTML }],
          [`${BASE}${CSS}`]: [200],
        },
        { baseUrl }
      );
      expect((await promise).ok).toBe(true);
      expect(calls).toEqual([`${BASE}/`, `${BASE}${CSS}`]);
    }
  });

  it("기본 시도 횟수·대기는 기존 인라인 검사와 같다(10회, 2초)", () => {
    expect(DEFAULT_ATTEMPTS).toBe(10);
    expect(DEFAULT_RETRY_DELAY_MS).toBe(2000);
  });

  it("시도 횟수를 주지 않으면 기본 10회까지 요청한다", async () => {
    const { fetchImpl, calls } = scripted({ [`${BASE}/`]: [503] });
    const report = await runSmokeCheck({
      baseUrl: BASE,
      fetchImpl,
      sleep: noSleep,
      retryDelayMs: 0,
    });
    expect(report.ok).toBe(false);
    expect(calls).toHaveLength(10);
  });

  it("재시도할 때마다 진행 줄을 log로 보낸다", async () => {
    const lines: string[] = [];
    const { promise } = run(
      { [`${BASE}/`]: [500, 500, { status: 200, body: OPEN_HTML }], [`${BASE}${CSS}`]: [200] },
      { log: (line) => lines.push(line) }
    );
    await promise;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("1/3");
    expect(lines[0]).toContain("500");
  });
});

describe("formatSmokeReport — 관측만 적고 본문은 적지 않는다", () => {
  const SECRET_IN_BODY = "body-secret-token-123";

  it("통과 보고는 상태 코드·CSS 청크 유무·게이트 상태(정보용)와 판정을 적는다", async () => {
    const { promise } = run({
      [`${BASE}/`]: [{ status: 200, body: `${OPEN_HTML}<!-- ${SECRET_IN_BODY} -->` }],
      [`${BASE}${CSS}`]: [200],
    });
    const lines = formatSmokeReport(await promise);
    const text = lines.join("\n");
    expect(text).toContain("200");
    expect(text).toContain(CSS);
    expect(text).toContain("열림");
    expect(text).toContain("정보");
    expect(text).toContain("판정: 통과");
    expect(text).not.toContain(SECRET_IN_BODY);
    expect(text).not.toContain("smoke-fixture.invalid");
  });

  it("실패 보고는 어느 검사가 왜 실패했는지와 판정 실패를 적는다", async () => {
    const { promise } = run({ [`${BASE}/`]: [{ status: 500, body: SECRET_IN_BODY }] });
    const text = formatSmokeReport(await promise).join("\n");
    expect(text).toContain("500");
    expect(text).toContain("판정: 실패");
    expect(text).not.toContain(SECRET_IN_BODY);
  });
});

describe("parseSmokeArgs", () => {
  it("--base-url 인자를 읽고 기본 시도 횟수·대기를 채운다", () => {
    expect(parseSmokeArgs([`--base-url=${BASE}`], {})).toEqual({
      ok: true,
      baseUrl: BASE,
      attempts: 10,
      retryDelayMs: 2000,
    });
  });

  it("인자가 없으면 환경 입력 SMOKE_BASE_URL을 읽고 인자가 환경보다 우선한다", () => {
    expect(parseSmokeArgs([], { SMOKE_BASE_URL: BASE })).toMatchObject({
      ok: true,
      baseUrl: BASE,
    });
    expect(
      parseSmokeArgs([`--base-url=${BASE}`], { SMOKE_BASE_URL: "http://other.invalid" })
    ).toMatchObject({ ok: true, baseUrl: BASE });
  });

  it("기준 주소가 없으면 거부한다(저장소에 기본 주소를 두지 않는다)", () => {
    const parsed = parseSmokeArgs([], {});
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("base-url");
    expect(parseSmokeArgs([], { SMOKE_BASE_URL: "" }).ok).toBe(false);
  });

  it("http/https 주소가 아니면 거부한다", () => {
    for (const bad of ["not a url", "ftp://x.invalid", "file:///x", "javascript:alert(1)"]) {
      expect(parseSmokeArgs([`--base-url=${bad}`], {}).ok).toBe(false);
    }
  });

  it("--attempts·--retry-delay-ms는 양의 정수·0 이상 정수만 받는다", () => {
    expect(
      parseSmokeArgs([`--base-url=${BASE}`, "--attempts=2", "--retry-delay-ms=0"], {})
    ).toMatchObject({ ok: true, attempts: 2, retryDelayMs: 0 });
    for (const bad of ["--attempts=0", "--attempts=-1", "--attempts=x", "--retry-delay-ms=-5"]) {
      expect(parseSmokeArgs([`--base-url=${BASE}`, bad], {}).ok).toBe(false);
    }
  });

  it("알 수 없는 인자는 거부하고 오류 문구가 주소 값을 되풀이하지 않는다", () => {
    const parsed = parseSmokeArgs([`--base-url=${BASE}`, "--unknown=1"], {});
    expect(parsed.ok).toBe(false);
    const bad = parseSmokeArgs(["--base-url=http://secret-host.invalid:9 bad"], {});
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).not.toContain("secret-host");
  });
});
