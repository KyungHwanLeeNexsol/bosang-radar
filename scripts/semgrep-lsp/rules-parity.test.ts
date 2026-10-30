import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parityCases, type ParityCase } from "./testing/rules-parity-cases";

// TS 쪽 절반: 골든 파일이 지금 TS 구현의 출력과 같다. 파일은 PowerShell 시험(tests/Test-LspRulesRunner.ps1)이 같은 입력으로 PS 이식본을 대조하는 기준이다.
// TS 구현을 바꾸면 이 시험이 실패한다 — 골든을 다시 만들고 PowerShell 시험도 통과시켜야 한다(어느 한쪽만 바뀐 채로 남을 수 없다).
const GOLDEN = new URL(
  "../semgrep-lsp-isolation/windows/tests/lsp-rules-parity.json",
  import.meta.url
);
const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as ParityCase[];
const current = JSON.parse(JSON.stringify(parityCases())) as ParityCase[];

describe("TS ↔ PowerShell 대조 골든", () => {
  it("사례 id가 겹치지 않고 종류별로 충분히 있다", () => {
    const ids = golden.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const kinds = new Set(golden.map((c) => c.kind));
    expect([...kinds].sort()).toEqual(
      [
        "log-scan",
        "outbound",
        "progress-create",
        "root-violation",
        "stderr-watch",
        "stdout-track",
      ].sort()
    );
    expect(golden.length).toBeGreaterThan(80);
  });

  it("골든 파일의 사례 id와 입력이 TS 사례 생성기와 같다", () => {
    expect(golden.map((c) => [c.id, c.kind, c.input])).toEqual(
      current.map((c) => [c.id, c.kind, c.input])
    );
  });

  for (const [i, c] of current.entries()) {
    it(`기대 출력이 TS 구현과 같다: ${c.id}`, () => {
      expect(golden[i]?.expected).toEqual(c.expected);
    });
  }
});
