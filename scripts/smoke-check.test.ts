import { describe, expect, it } from "vitest";

import { main } from "./smoke-check";
import { startTempServer, type TempServerKind } from "./verify-smoke-check";

// SPEC-B2C-LAUNCH-001 M4 (AC-B2CLAUNCH-013) — smoke CLI의 종료 코드·출력 시험.
// 임시 HTTP 서버(루프백)에 실제 fetch로 요청한다. Next 서버를 띄우는 상태 관측은 verify-smoke-check.ts가 맡는다.

async function runAgainst(kind: TempServerKind, extraArgs: string[] = []) {
  const server = await startTempServer(kind);
  const lines: string[] = [];
  try {
    const code = await main(
      [`--base-url=${server.baseUrl}`, "--attempts=2", "--retry-delay-ms=0", ...extraArgs],
      {},
      (line) => lines.push(line)
    );
    return { code, output: lines.join("\n"), baseUrl: server.baseUrl };
  } finally {
    await server.stop();
  }
}

describe("smoke-check CLI main", () => {
  it("정상 응답은 열림·닫힘 표지 모두 종료 코드 0이다", async () => {
    for (const kind of ["ok-open", "ok-closed"] as const) {
      const { code, output } = await runAgainst(kind);
      expect(code).toBe(0);
      expect(output).toContain("판정: 통과");
    }
  });

  it("HTTP 500과 CSS 누락은 종료 코드 1이다", async () => {
    for (const kind of ["http-500", "no-css-reference", "css-404"] as const) {
      const { code, output } = await runAgainst(kind);
      expect(code).toBe(1);
      expect(output).toContain("판정: 실패");
    }
  });

  it("출력에 기준 주소와 응답 본문을 적지 않는다", async () => {
    const { output, baseUrl } = await runAgainst("ok-open");
    expect(output).not.toContain(baseUrl);
    expect(output).not.toContain("fixture-open");
  });

  it("기준 주소를 환경 입력 SMOKE_BASE_URL로도 받는다", async () => {
    const server = await startTempServer("ok-closed");
    try {
      const lines: string[] = [];
      const code = await main(["--attempts=1"], { SMOKE_BASE_URL: server.baseUrl }, (line) =>
        lines.push(line)
      );
      expect(code).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it("기준 주소가 없거나 인자가 틀리면 종료 코드 2이고 사용법 오류를 적는다", async () => {
    const lines: string[] = [];
    expect(await main([], {}, (line) => lines.push(line))).toBe(2);
    expect(lines.join("\n")).toContain("사용법 오류");
    expect(await main(["--base-url=not a url"], {}, () => {})).toBe(2);
    expect(await main(["--bogus=1"], {}, () => {})).toBe(2);
  });
});
