import { describe, expect, it } from "vitest";

import type { ItemStatus } from "./gate-record";
import {
  SIGNATURE_ENVIRONMENTS,
  SIGNER_COLUMNS,
  SNAPSHOT_COLUMNS,
  judgeSignature,
  parseSignatureRecord,
  type SignatureContext,
  type SignatureRecord,
} from "./signature";

// 값은 모두 눈에 띄게 합성한 것이다. 역할 이름은 D-LAUNCH-04 결정 기록의 세 역할(시험 입력으로만 쓴다)이다.
const ALLOWED_ROLES = ["제품 책임자", "운영 책임자", "법무"];

function table(columns: readonly string[], rows: readonly string[][]): string {
  return [
    `| ${columns.join(" | ")} |`,
    `|${columns.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function signatureDoc(signers: readonly string[][], snapshot: readonly string[][]): string {
  return `${table(SIGNER_COLUMNS, signers)}\n\n${table(SNAPSHOT_COLUMNS, snapshot)}`;
}

const GOOD_SIGNER = ["제품 책임자", "날짜-예시", "production"];
const GOOD_SNAPSHOT = [
  ["L-04", "READY", "대상-L-04"],
  ["R-05", "READY", "대상-R-05"],
];

function parsed(markdown: string): SignatureRecord {
  const result = parseSignatureRecord(markdown);
  if (!result.ok) throw new Error(`서명 기록이 통과해야 한다: ${result.errors.join("|")}`);
  return result.record;
}

function errorsOf(markdown: string): string[] {
  const result = parseSignatureRecord(markdown);
  if (result.ok) throw new Error("오류가 있어야 하는 서명 기록이 통과했다");
  return result.errors;
}

function context(overrides: Partial<SignatureContext> = {}): SignatureContext {
  return {
    allowedRoles: ALLOWED_ROLES,
    requestEnvironment: "production",
    currentStatus: () => "READY",
    // 기본 현재 유효 대상 값은 서명 시점 대상 값과 같다(대상이 바뀌지 않은 경우).
    currentTarget: (id) => GOOD_SNAPSHOT.find(([snapshotId]) => snapshotId === id)?.[2],
    // 기본 필수 항목 집합은 GOOD_SNAPSHOT이 덮는 두 항목과 정확히 같다.
    requiredItemIds: GOOD_SNAPSHOT.map(([id]) => id),
    ...overrides,
  };
}

describe("parseSignatureRecord — 서명 기록 양식", () => {
  it("서명 행(역할·날짜·실행 환경)과 서명 시점 항목 표(식별자·상태·대상)를 읽는다", () => {
    const record = parsed(signatureDoc([GOOD_SIGNER], GOOD_SNAPSHOT));

    expect(record.signers).toEqual([
      { role: "제품 책임자", date: "날짜-예시", environment: "production" },
    ]);
    expect(record.snapshot).toEqual([
      { id: "L-04", status: "READY", target: "대상-L-04" },
      { id: "R-05", status: "READY", target: "대상-R-05" },
    ]);
  });

  it("실행 환경은 local·production 둘뿐이다", () => {
    expect([...SIGNATURE_ENVIRONMENTS]).toEqual(["local", "production"]);
    expect(
      parsed(signatureDoc([["법무", "날짜-예시", "local"]], GOOD_SNAPSHOT)).signers[0]
    ).toEqual({ role: "법무", date: "날짜-예시", environment: "local" });
  });

  it("실행 환경 칸이 비어 있거나 열거 밖이면 거부하고 서명 행 번호를 적되 칸의 값은 적지 않는다", () => {
    for (const environment of ["", "staging"]) {
      const errors = errorsOf(
        signatureDoc([GOOD_SIGNER, ["운영 책임자", "날짜-예시", environment]], GOOD_SNAPSHOT)
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("서명 행 2");
      expect(errors[0]).toContain("실행 환경");
      expect(errors[0]).not.toContain("staging");
    }
  });

  it("서명 역할·날짜 칸이 비어 있으면 거부한다", () => {
    const errors = errorsOf(
      signatureDoc(
        [
          ["", "날짜-예시", "production"],
          ["법무", "", "local"],
        ],
        GOOD_SNAPSHOT
      )
    );

    expect(errors.join("\n")).toContain('서명 행 1의 "서명 역할" 칸이 비어 있다');
    expect(errors.join("\n")).toContain('서명 행 2의 "날짜" 칸이 비어 있다');
  });

  it("서명 표나 서명 시점 항목 표가 없으면 표를 찾지 못했다고 거부한다", () => {
    expect(errorsOf(table(SNAPSHOT_COLUMNS, GOOD_SNAPSHOT)).join("\n")).toContain("서명 표");
    expect(errorsOf(table(SIGNER_COLUMNS, [GOOD_SIGNER])).join("\n")).toContain(
      "서명 시점 항목 표"
    );
    expect(errorsOf("# 표 없음")).toHaveLength(2);
  });

  it("서명 시점 항목의 상태가 열거 밖이면 항목 식별자를 적어 거부한다", () => {
    const errors = errorsOf(signatureDoc([GOOD_SIGNER], [["L-04", "GO", "대상-L-04"]]));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("L-04");
    expect(errors[0]).not.toContain("GO");
  });

  it("같은 식별자가 두 번 나오거나 READY 항목의 대상 값이 비어 있으면 거부한다", () => {
    const duplicated = errorsOf(signatureDoc([GOOD_SIGNER], [GOOD_SNAPSHOT[0], GOOD_SNAPSHOT[0]]));
    const emptyTarget = errorsOf(signatureDoc([GOOD_SIGNER], [["L-04", "READY", ""]]));

    expect(duplicated.join("\n")).toContain('"L-04" 항목이 서명 시점 항목 표에 2번 나온다');
    expect(emptyTarget.join("\n")).toContain('"L-04" 항목은 READY인데 "대상" 칸이 비어 있다');
  });

  it("서명 시점 항목 표의 식별자 칸이 비었거나 열 수가 틀린 행은 거부한다", () => {
    const errors = errorsOf(
      signatureDoc(
        [GOOD_SIGNER],
        [
          ["", "READY", "대상-예시"],
          ["L-04", "READY"],
        ]
      )
    );

    expect(errors).toContain("서명 시점 항목 표에 식별자 칸이 비어 있는 행이 있다");
    expect(errors).toContain('"L-04" 항목 행의 칸이 2개다(3개여야 한다)');
  });

  it("서명 행이 없는 표는 읽히고(서명 없음 판정은 judgeSignature의 몫) 열 수가 틀린 행은 거부한다", () => {
    expect(parsed(signatureDoc([], GOOD_SNAPSHOT)).signers).toEqual([]);
    expect(
      errorsOf(signatureDoc([["제품 책임자", "날짜-예시"]], GOOD_SNAPSHOT)).join("\n")
    ).toContain("서명 행 1의 칸이 2개다");
  });
});

describe("judgeSignature — 서명 점검", () => {
  const record = parsed(signatureDoc([GOOD_SIGNER], GOOD_SNAPSHOT));

  it("서명 기록이 없으면 서명 없음이다", () => {
    expect(judgeSignature(undefined, context())).toEqual([
      "서명 없음 — 서명 기록이 넘어오지 않았다",
    ]);
  });

  it("서명 행이 하나도 없는 기록도 서명 없음이다", () => {
    const problems = judgeSignature(parsed(signatureDoc([], GOOD_SNAPSHOT)), context());

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("서명 없음");
  });

  it("허용 역할 목록 안의 역할이고 실행 환경이 같고 모든 항목이 그대로면 문제가 없다", () => {
    expect(judgeSignature(record, context())).toEqual([]);
  });

  it("허용 목록은 호출하는 쪽의 입력이다 — 같은 서명이 목록에 따라 통과하거나 거부된다", () => {
    expect(judgeSignature(record, context({ allowedRoles: ["법무"] }))).toHaveLength(1);
    expect(judgeSignature(record, context({ allowedRoles: ["제품 책임자"] }))).toEqual([]);
    expect(judgeSignature(record, context({ allowedRoles: [] }))).toHaveLength(1);
  });

  it("허용 목록에 없는 역할은 서명 행 번호만 적고 역할 칸의 값은 적지 않는다", () => {
    const stranger = parsed(
      signatureDoc([["역할-밖-예시", "날짜-예시", "production"]], GOOD_SNAPSHOT)
    );

    const problems = judgeSignature(stranger, context());

    expect(problems).toEqual(["서명 행 1의 역할이 허용 역할 목록에 없다"]);
    expect(problems.join("\n")).not.toContain("역할-밖-예시");
  });

  it("서명의 실행 환경이 요청 형태와 다르면 두 환경을 적고 거부한다", () => {
    const localSignature = parsed(
      signatureDoc([["제품 책임자", "날짜-예시", "local"]], GOOD_SNAPSHOT)
    );

    expect(judgeSignature(localSignature, context({ requestEnvironment: "production" }))).toEqual([
      "서명 행 1의 실행 환경(local)이 요청 형태(production)와 다르다",
    ]);
    expect(judgeSignature(record, context({ requestEnvironment: "local" }))).toEqual([
      "서명 행 1의 실행 환경(production)이 요청 형태(local)와 다르다",
    ]);
  });

  it("서명 뒤 UNVERIFIED가 된 항목은 식별자를 적어 거부한다", () => {
    const status = (id: string): ItemStatus => (id === "R-05" ? "UNVERIFIED" : "READY");

    expect(judgeSignature(record, context({ currentStatus: status }))).toEqual([
      "서명 뒤 R-05가 UNVERIFIED가 되었다",
    ]);
  });

  it("지금 BLOCKED인 항목은 UNVERIFIED가 아니므로 서명 점검이 거르지 않는다(필수 항목이면 항목 점검의 몫이다)", () => {
    expect(judgeSignature(record, context({ currentStatus: () => "BLOCKED" }))).toEqual([]);
  });

  it("서명 시점 항목이 현재 기록에 없으면 거부한다", () => {
    const problems = judgeSignature(
      record,
      context({ currentStatus: (id) => (id === "L-04" ? undefined : "READY") })
    );

    expect(problems).toEqual(["서명 대상 항목 L-04가 현재 기록에 없다"]);
  });

  it("서명이 덮는 항목이 하나도 없으면 거부한다", () => {
    const problems = judgeSignature(parsed(signatureDoc([GOOD_SIGNER], [])), context());

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("서명이 덮는 항목이 없다");
  });

  it("서명 행이 여럿이면 행마다 점검하고 문제 있는 행의 번호를 적는다", () => {
    const two = parsed(
      signatureDoc(
        [GOOD_SIGNER, ["역할-밖-예시", "날짜-예시", "production"], ["법무", "날짜-예시", "local"]],
        GOOD_SNAPSHOT
      )
    );

    expect(judgeSignature(two, context())).toEqual([
      "서명 행 2의 역할이 허용 역할 목록에 없다",
      "서명 행 3의 실행 환경(local)이 요청 형태(production)와 다르다",
    ]);
  });

  it("서명자 구성(세 역할 전부가 서명해야 하는지)은 확인 대기라 강제하지 않는다 — 한 역할의 서명만으로도 역할 점검을 통과한다", () => {
    const single = parsed(signatureDoc([["법무", "날짜-예시", "production"]], GOOD_SNAPSHOT));

    expect(judgeSignature(single, context())).toEqual([]);
  });
});

// REQ-B2CLAUNCH-008 (PR #24 재현 결함 2): 서명이 덮은 필수 항목은 서명 시점에 READY였어야 하고, 서명 시점의
// 대상 값이 현재 유효 항목의 대상 값과 같아야 한다. 이유에는 식별자와 상태 이름만 적고 대상 값은 적지 않는다.
describe("judgeSignature — 서명 시점 상태와 대상 값", () => {
  const snapshotWith = (rows: string[][]) => parsed(signatureDoc([GOOD_SIGNER], rows));

  it("서명 시점에 BLOCKED였던 필수 항목은 현재 READY여도 거부한다", () => {
    const record = snapshotWith([
      ["L-04", "BLOCKED", "대상-L-04"],
      ["R-05", "READY", "대상-R-05"],
    ]);

    expect(judgeSignature(record, context())).toEqual([
      "서명 시점 L-04의 상태가 READY가 아니다(서명 시점 상태: BLOCKED)",
    ]);
  });

  it("서명 시점에 UNVERIFIED였던 필수 항목도 같은 이유로 거부한다", () => {
    const record = snapshotWith([
      ["L-04", "READY", "대상-L-04"],
      ["R-05", "UNVERIFIED", "대상-R-05"],
    ]);

    expect(judgeSignature(record, context())).toEqual([
      "서명 시점 R-05의 상태가 READY가 아니다(서명 시점 상태: UNVERIFIED)",
    ]);
  });

  it("서명 시점 대상 값이 현재 유효 항목의 대상 값과 다르면 식별자만 적고 두 값은 적지 않는다", () => {
    const record = snapshotWith([
      ["L-04", "READY", "대상-L-04-이전"],
      ["R-05", "READY", "대상-R-05"],
    ]);

    const problems = judgeSignature(record, context());

    expect(problems).toEqual([
      "서명 시점 L-04의 대상 값이 현재 유효 항목의 대상 값과 다르다 — 이전 대상에 대한 서명은 새 대상에 쓸 수 없다",
    ]);
    expect(problems.join("\n")).not.toContain("대상-L-04");
  });

  it("현재 유효 대상 값을 알 수 없으면(undefined) 같다고 확인할 수 없어 거부한다(fail-closed)", () => {
    const problems = judgeSignature(
      snapshotWith(GOOD_SNAPSHOT),
      context({ currentTarget: () => undefined })
    );

    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.includes("대상 값이 현재 유효 항목의 대상 값과 다르다"))).toBe(
      true
    );
  });

  it("필수 항목 집합 밖의 항목은 집합 불일치로만 거부하고 상태·대상 값 이유를 더하지 않는다", () => {
    const record = snapshotWith([
      ["L-04", "READY", "대상-L-04"],
      ["R-05", "BLOCKED", "대상-R-05-이전"],
    ]);

    expect(judgeSignature(record, context({ requiredItemIds: ["L-04"] }))).toEqual([
      "서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: R-05",
    ]);
  });

  it("현재 기록에 없는 항목은 현재 기록에 없다는 이유만 적는다(대상 값 이유를 겹치지 않는다)", () => {
    const problems = judgeSignature(
      snapshotWith(GOOD_SNAPSHOT),
      context({
        currentStatus: (id) => (id === "L-04" ? undefined : "READY"),
        currentTarget: (id) => (id === "L-04" ? undefined : "대상-R-05"),
      })
    );

    expect(problems).toEqual(["서명 대상 항목 L-04가 현재 기록에 없다"]);
  });

  it("상태가 READY이고 대상 값이 현재와 같으면 문제가 없다(양성)", () => {
    expect(judgeSignature(snapshotWith(GOOD_SNAPSHOT), context())).toEqual([]);
  });
});

// REQ-B2CLAUNCH-008·AC-B2CLAUNCH-008 (카): 서명이 담은 항목 집합은 요청이 읽는 필수 항목 집합과 같아야 한다.
describe("judgeSignature — 서명이 필수 항목 전체를 덮는지", () => {
  const record = parsed(signatureDoc([GOOD_SIGNER], GOOD_SNAPSHOT));

  it("필수 항목을 하나 빠뜨린 서명은 덮지 않은 필수 항목 식별자를 적어 거부한다", () => {
    const problems = judgeSignature(record, context({ requiredItemIds: ["L-04", "R-05", "L-06"] }));

    expect(problems).toEqual(["서명이 덮지 않은 필수 항목 식별자: L-06"]);
  });

  it("빠뜨린 필수 항목이 여럿이면 식별자를 모두 적고 서명 시점 값은 적지 않는다", () => {
    const problems = judgeSignature(
      record,
      context({ requiredItemIds: ["L-04", "R-05", "L-06", "R-03"] })
    );

    expect(problems).toEqual(["서명이 덮지 않은 필수 항목 식별자: L-06, R-03"]);
    expect(problems.join("\n")).not.toContain("대상-");
  });

  it("필수 항목 집합 밖의 항목을 덮은 서명도 집합이 같지 않으므로 거부하고 식별자를 적는다", () => {
    const problems = judgeSignature(record, context({ requiredItemIds: ["L-04"] }));

    expect(problems).toEqual(["서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: R-05"]);
  });

  it("빠뜨린 항목과 넘치는 항목이 함께 있으면 두 이유를 모두 적는다", () => {
    const problems = judgeSignature(record, context({ requiredItemIds: ["L-04", "L-06"] }));

    expect(problems).toEqual([
      "서명이 덮지 않은 필수 항목 식별자: L-06",
      "서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: R-05",
    ]);
  });

  it("필수 항목 집합과 서명이 덮는 항목이 순서만 다르면 같은 집합이다", () => {
    expect(judgeSignature(record, context({ requiredItemIds: ["R-05", "L-04"] }))).toEqual([]);
  });

  it("서명이 덮는 항목이 하나도 없으면 그 이유 하나만 적는다(필수 항목마다 덮지 않았다고 되풀이하지 않는다)", () => {
    const problems = judgeSignature(parsed(signatureDoc([GOOD_SIGNER], [])), context());

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("서명이 덮는 항목이 없다");
  });
});
