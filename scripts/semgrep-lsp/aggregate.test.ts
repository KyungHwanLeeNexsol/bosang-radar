import { describe, expect, it } from "vitest";
import { aggregateDiagnostics, type PublishedDiagnostics } from "./aggregate";
import { representativeStatus } from "./status";

const P = "semgrep-rules.javascript.lang.security.";
const R1 = `${P}rule-one`;
const R2 = `${P}rule-two`;
const R3 = `${P}rule-three`;
const EXPECTED = new Set([R1, R2, R3]);

const F1 = "file:///C:/scan/src/a.ts";
const F2 = "file:///C:/scan/src/b.ts";

function range(line = 0, ch = 0, endLine = line, endCh = ch + 5) {
  return { start: { line, character: ch }, end: { line: endLine, character: endCh } };
}

function diag(code: unknown, severity: unknown, r = range()) {
  return { range: r, severity, code, message: "m" } as PublishedDiagnostics["diagnostics"][number];
}

function run(published: PublishedDiagnostics[], expected: Iterable<string> = EXPECTED) {
  return aggregateDiagnostics(published, expected);
}

describe("aggregateDiagnostics: 심각도 (S18)", () => {
  it("1=error, 2=warning, 3=information", () => {
    const out = run([
      {
        uri: F1,
        diagnostics: [diag(R1, 1, range(1)), diag(R1, 2, range(2)), diag(R1, 3, range(3))],
      },
    ]);
    expect(out.totals).toEqual({ error: 1, warning: 1, information: 1, total: 3 });
    expect(out.reasons).toEqual([]);
  });

  it("4(hint)·누락·미상은 error로 센다", () => {
    const out = run([
      {
        uri: F1,
        diagnostics: [
          diag(R1, 4, range(1)),
          diag(R1, undefined, range(2)),
          diag(R1, 0, range(3)),
          diag(R1, 99, range(4)),
          diag(R1, "1", range(5)),
          diag(R1, null, range(6)),
          diag(R1, 1.5, range(7)),
        ],
      },
    ]);
    expect(out.totals).toEqual({ error: 7, warning: 0, information: 0, total: 7 });
  });

  it("합계 = error + warning + information이고 information을 빼지 않는다", () => {
    const out = run([{ uri: F1, diagnostics: [diag(R1, 3, range(1)), diag(R2, 3, range(2))] }]);
    expect(out.totals.total).toBe(2);
    expect(out.totals.information).toBe(2);
  });
});

describe("aggregateDiagnostics: 중복 제거 (S18)", () => {
  it("같은 위치·다른 규칙은 중복이 아니다", () => {
    const out = run([{ uri: F1, diagnostics: [diag(R1, 2), diag(R2, 2)] }]);
    expect(out.totals.total).toBe(2);
    expect(out.perRule).toEqual({ [R1]: 1, [R2]: 1 });
  });

  it("같은 규칙·같은 위치 두 번은 중복이다(한 번만 센다)", () => {
    const out = run([{ uri: F1, diagnostics: [diag(R1, 2), diag(R1, 2)] }]);
    expect(out.totals.total).toBe(1);
    expect(out.perRule).toEqual({ [R1]: 1 });
  });

  it("같은 규칙·다른 위치는 중복이 아니다(시작·끝 어느 한쪽만 달라도)", () => {
    const out = run([
      {
        uri: F1,
        diagnostics: [
          diag(R1, 2, range(1, 0, 1, 5)),
          diag(R1, 2, range(1, 0, 1, 6)),
          diag(R1, 2, range(1, 1, 1, 5)),
          diag(R1, 2, range(2, 0, 2, 5)),
        ],
      },
    ]);
    expect(out.totals.total).toBe(4);
  });

  it("같은 규칙·같은 위치라도 파일이 다르면 중복이 아니다", () => {
    const out = run([
      { uri: F1, diagnostics: [diag(R1, 2)] },
      { uri: F2, diagnostics: [diag(R1, 2)] },
    ]);
    expect(out.totals.total).toBe(2);
    expect(Object.keys(out.perFile).sort()).toEqual([F1, F2]);
  });

  it("중복 키는 code 전체다: 마지막 조각이 같아도 최종 ID가 다르면 다른 진단이다", () => {
    const a = `${P}same-tail`;
    const b = "semgrep-rules.typescript.other.same-tail";
    const out = run([{ uri: F1, diagnostics: [diag(a, 2), diag(b, 2)] }], [a, b]);
    expect(out.totals.total).toBe(2);
    expect(out.perRule).toEqual({ [a]: 1, [b]: 1 });
  });

  it("같은 키가 서로 다른 게시 항목에 나뉘어 와도 한 번만 센다", () => {
    const out = run([
      { uri: F1, diagnostics: [diag(R1, 2)] },
      { uri: F1, diagnostics: [diag(R1, 2)] },
    ]);
    expect(out.totals.total).toBe(1);
  });

  it("중복의 심각도가 다르면 먼저 온 것을 센다(키에 심각도는 없다)", () => {
    const out = run([{ uri: F1, diagnostics: [diag(R1, 3), diag(R1, 1)] }]);
    expect(out.totals).toEqual({ error: 0, warning: 0, information: 1, total: 1 });
  });

  it("범위가 없는 진단은 같은 규칙이어도 합치지 않는다(더 많이 센다)", () => {
    const noRange = {
      code: R1,
      severity: 2,
      message: "m",
    } as PublishedDiagnostics["diagnostics"][number];
    const out = run([{ uri: F1, diagnostics: [noRange, { ...noRange }] }]);
    expect(out.totals.total).toBe(2);
  });
});

describe("aggregateDiagnostics: code 모양", () => {
  it("숫자 code는 문자열로 센다(그리고 접두어가 없다)", () => {
    const out = run([{ uri: F1, diagnostics: [diag(123, 2)] }]);
    expect(out.perRule).toEqual({ "123": 1 });
    expect(out.reasons.map((r) => r.code)).toContain("PUBLISHED_CODE_UNPREFIXED");
  });

  it("{ value } 객체 code도 받는다", () => {
    const out = run([
      { uri: F1, diagnostics: [diag({ value: R1, target: "https://example.invalid" }, 2)] },
    ]);
    expect(out.perRule).toEqual({ [R1]: 1 });
    expect(out.reasons).toEqual([]);
  });

  it("{ value: 숫자 }도 문자열로 센다", () => {
    const out = run([{ uri: F1, diagnostics: [diag({ value: 7 }, 2)] }]);
    expect(out.perRule).toEqual({ "7": 1 });
  });

  it("문자열 code와 {value} code가 같은 규칙이면 중복이다", () => {
    const out = run([{ uri: F1, diagnostics: [diag(R1, 2), diag({ value: R1 }, 2)] }]);
    expect(out.totals.total).toBe(1);
  });

  it("code가 없으면(누락·null·빈 문자열·객체 모양 오류) 진단은 세되 UNKNOWN_RULE_CODE 사유", () => {
    const out = run([
      {
        uri: F1,
        diagnostics: [
          diag(undefined, 2, range(1)),
          diag(null, 2, range(2)),
          diag("", 2, range(3)),
          diag({ nothing: 1 }, 2, range(4)),
          diag([R1], 2, range(5)),
        ],
      },
    ]);
    expect(out.totals.total).toBe(5);
    expect(out.reasons.filter((r) => r.code === "UNKNOWN_RULE_CODE").length).toBeGreaterThan(0);
    expect(out.reasons.some((r) => r.code === "PUBLISHED_CODE_UNPREFIXED")).toBe(false);
    expect(out.perRule).toEqual({});
  });
});

describe("aggregateDiagnostics: 사유", () => {
  it("접두어가 없는 code → PUBLISHED_CODE_UNPREFIXED (대표 상태 PREFIX_MISSING)", () => {
    const out = run([{ uri: F1, diagnostics: [diag("rule-one", 2)] }]);
    expect(out.reasons.map((r) => r.code)).toContain("PUBLISHED_CODE_UNPREFIXED");
    expect(representativeStatus(out.reasons)).toBe("PREFIX_MISSING");
    expect(out.reasons.find((r) => r.code === "PUBLISHED_CODE_UNPREFIXED")?.detail).toContain(
      "rule-one"
    );
  });

  it("접두어가 있어도 기대 목록에 없으면 UNKNOWN_RULE_CODE만 (대표 상태 UNKNOWN_RULE_ID)", () => {
    const out = run([{ uri: F1, diagnostics: [diag(`${P}not-expected`, 2)] }]);
    expect(out.reasons.map((r) => r.code)).toEqual(["UNKNOWN_RULE_CODE"]);
    expect(representativeStatus(out.reasons)).toBe("UNKNOWN_RULE_ID");
  });

  it("접두어도 없고 기대 목록에도 없으면 두 사유가 함께 남는다", () => {
    const out = run([{ uri: F1, diagnostics: [diag("rule-one", 2)] }]);
    expect(out.reasons.map((r) => r.code).sort()).toEqual([
      "PUBLISHED_CODE_UNPREFIXED",
      "UNKNOWN_RULE_CODE",
    ]);
  });

  it("같은 잘못된 code가 여러 번 나와도 사유는 code마다 하나다", () => {
    const out = run([
      {
        uri: F1,
        diagnostics: [diag(`${P}bogus`, 2, range(1)), diag(`${P}bogus`, 2, range(2))],
      },
      { uri: F2, diagnostics: [diag(`${P}bogus`, 2)] },
    ]);
    expect(out.reasons).toHaveLength(1);
  });

  it("마지막 조각만 같은 ID는 기대 목록과 일치로 보지 않는다(전체 최종 ID로만 비교)", () => {
    const out = run([{ uri: F1, diagnostics: [diag("semgrep-rules.other.dir.rule-one", 2)] }]);
    expect(out.reasons.map((r) => r.code)).toEqual(["UNKNOWN_RULE_CODE"]);
  });

  it("기대 목록은 배열이나 집합 어느 쪽이든 받는다", () => {
    const published = [{ uri: F1, diagnostics: [diag(R1, 2)] }];
    expect(aggregateDiagnostics(published, [R1]).reasons).toEqual([]);
    expect(aggregateDiagnostics(published, new Set([R1])).reasons).toEqual([]);
    expect(aggregateDiagnostics(published, []).reasons.map((r) => r.code)).toEqual([
      "UNKNOWN_RULE_CODE",
    ]);
  });

  it("사유 상세에 진단 메시지 본문을 넣지 않는다", () => {
    const secret = "SECRET-TOKEN-VALUE";
    const d = { range: range(), severity: 2, code: "bad", message: secret };
    const out = run([{ uri: F1, diagnostics: [d] }]);
    expect(JSON.stringify(out.reasons)).not.toContain(secret);
  });
});

describe("aggregateDiagnostics: perFile / perRule", () => {
  it("파일별 소계와 code 목록(중복 제거, 정렬)", () => {
    const out = run([
      {
        uri: F1,
        diagnostics: [diag(R2, 1, range(1)), diag(R1, 2, range(2)), diag(R1, 3, range(3))],
      },
      { uri: F2, diagnostics: [diag(R3, 2)] },
    ]);
    expect(out.perFile[F1]).toEqual({
      error: 1,
      warning: 1,
      information: 1,
      codes: [R1, R2],
    });
    expect(out.perFile[F2]).toEqual({ error: 0, warning: 1, information: 0, codes: [R3] });
    expect(out.perRule).toEqual({ [R1]: 2, [R2]: 1, [R3]: 1 });
  });

  it("진단이 없는 게시도 파일 항목으로 남는다(0건은 '측정 없음'이 아니다)", () => {
    const out = run([{ uri: F1, diagnostics: [] }]);
    expect(out.perFile[F1]).toEqual({ error: 0, warning: 0, information: 0, codes: [] });
    expect(out.totals).toEqual({ error: 0, warning: 0, information: 0, total: 0 });
    expect(out.reasons).toEqual([]);
  });

  it("게시 자체가 없으면 빈 결과(사유 없음 — 부재는 호출자가 판단한다)", () => {
    expect(run([])).toEqual({
      totals: { error: 0, warning: 0, information: 0, total: 0 },
      perFile: {},
      perRule: {},
      reasons: [],
    });
  });

  it("perFile의 합 = perRule의 합 = total (모든 진단에 code가 있을 때)", () => {
    const out = run([
      { uri: F1, diagnostics: [diag(R1, 1, range(1)), diag(R2, 2, range(2))] },
      { uri: F2, diagnostics: [diag(R3, 3), diag(R3, 3)] },
    ]);
    const fileSum = Object.values(out.perFile).reduce(
      (n, f) => n + f.error + f.warning + f.information,
      0
    );
    const ruleSum = Object.values(out.perRule).reduce((n, c) => n + c, 0);
    expect(fileSum).toBe(out.totals.total);
    expect(ruleSum).toBe(out.totals.total);
  });

  it("diagnostics가 배열이 아니면 예외(조용히 0건으로 만들지 않는다)", () => {
    const bad = [{ uri: F1, diagnostics: "oops" }] as unknown as PublishedDiagnostics[];
    expect(() => run(bad)).toThrow(/diagnostics/);
  });

  it("입력을 바꾸지 않는다", () => {
    const published = [{ uri: F1, diagnostics: [diag(R1, 2), diag(R1, 2)] }];
    const snapshot = JSON.stringify(published);
    run(published);
    expect(JSON.stringify(published)).toBe(snapshot);
  });
});
