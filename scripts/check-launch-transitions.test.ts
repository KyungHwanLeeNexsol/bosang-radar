import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { STEP_COLUMNS } from "../lib/launch/procedure-steps";
import { ORDER_COLUMNS } from "../lib/launch/transition-list";
import { runCli } from "./check-launch-transitions";

// SPEC-B2C-LAUNCH-001 M3b (AC-B2CLAUNCH-011) — 전환 목록 점검기 CLI 시험.
// 파일 읽기는 주입한 함수로 대신하고(기본 위치가 없다), 실제 런북은 마지막 시험에서 한 번만 읽는다.

const V1 = "진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";
const V2 =
  "진단 게이트: 열림(production 경로), 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";
const V3 =
  "진단 게이트: 열림(production 경로), 상담 화면: 열림, 상담 접수: 닫힘, 시크릿: 설정되지 않음";

const ORDER = [
  `| ${ORDER_COLUMNS.join(" | ")} |`,
  `|${ORDER_COLUMNS.map(() => "---").join("|")}|`,
  `| 1 | ${V1} | 근거-예시 |`,
  `| 2 | ${V2} | 근거-예시 |`,
  `| 3 | ${V3} | 근거-예시 |`,
].join("\n");

function steps(second: { restarts: string }): string {
  return [
    `| ${STEP_COLUMNS.join(" | ")} |`,
    `|${STEP_COLUMNS.map(() => "---").join("|")}|`,
    `| 1 | 운영 호스트 | ENABLE_DIAGNOSIS_FLOW=true | 1 | ${V1} | ${V2} |`,
    `| 2 | 운영 호스트 | ENABLE_CONSULT_FLOW=true | ${second.restarts} | ${V2} | ${V3} |`,
  ].join("\n");
}

function reader(files: Record<string, string>): (file: string) => string {
  return (file) => {
    if (!(file in files)) throw new Error("없는 파일");
    return files[file];
  };
}

describe("runCli — 종료 코드", () => {
  const files = { "steps.md": steps({ restarts: "1" }), "order.md": ORDER };

  it("통과하면 0이고 판정 통과를 출력한다", () => {
    const result = runCli(["--steps", "steps.md", "--order", "order.md"], reader(files));
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("PASS");
    expect(result.output).toContain("판정: 통과");
  });

  it("위반이 있으면 1이고 위반한 전환 번호를 출력한다", () => {
    const result = runCli(
      ["--steps", "steps.md", "--order", "order.md"],
      reader({ ...files, "steps.md": steps({ restarts: "2" }) })
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("위반한 전환 번호: 2");
  });

  it("--order가 없으면 순서가 기록되지 않은 것이라 BLOCKED(3)이다 — 통과가 아니다", () => {
    const result = runCli(["--steps", "steps.md"], reader(files));
    expect(result.exitCode).toBe(3);
    expect(result.status).toBe("BLOCKED");
    expect(result.output).toContain("노출 순서가 기록되지 않았다");
  });

  it("순서 표가 없는 문서를 --order로 주어도 BLOCKED(3)이다", () => {
    const result = runCli(
      ["--steps", "steps.md", "--order", "empty.md"],
      reader({ ...files, "empty.md": "표 없음" })
    );
    expect(result.exitCode).toBe(3);
  });

  it("같은 문서를 --steps와 --order에 함께 줄 수 있다", () => {
    const combined = `${ORDER}\n\n${steps({ restarts: "1" })}`;
    const result = runCli(
      ["--steps", "both.md", "--order", "both.md"],
      reader({ "both.md": combined })
    );
    expect(result.exitCode).toBe(0);
  });

  it("단계 표나 순서 표의 칸 오류는 입력 거부(2)이다", () => {
    const badSteps = runCli(
      ["--steps", "s.md", "--order", "order.md"],
      reader({ ...files, "s.md": "표 없음" })
    );
    expect(badSteps.exitCode).toBe(2);
    expect(badSteps.status).toBe("INPUT_ERROR");

    const badOrder = runCli(
      ["--steps", "steps.md", "--order", "o.md"],
      reader({ ...files, "o.md": ORDER.replace(`| 1 | ${V1}`, `| 1 | 어휘 밖 벡터`) })
    );
    expect(badOrder.exitCode).toBe(2);
  });
});

describe("runCli — 사용법 오류는 종료 코드 2이고 기본 위치를 가정하지 않는다", () => {
  const read = reader({ "steps.md": steps({ restarts: "1" }) });

  it("알 수 없는 인자, 값 없는 인자, --steps 없음", () => {
    expect(runCli(["--unknown", "x"], read)).toEqual({
      exitCode: 2,
      output: '사용법 오류: 알 수 없는 인자 "--unknown"',
    });
    expect(runCli(["steps.md"], read).output).toContain("알 수 없는 인자");
    expect(runCli(["--steps"], read).output).toBe("사용법 오류: --steps에 값이 없다");
    expect(runCli([], read).output).toBe("사용법 오류: --steps 인자가 필요하다");
  });

  it("읽지 못하는 파일은 파일 경로와 함께 사용법 오류이다", () => {
    const result = runCli(["--steps", "missing.md"], read);
    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("사용법 오류: --steps 파일을 읽지 못했다(missing.md)");
    expect(runCli(["--steps", "steps.md", "--order", "missing.md"], read).output).toContain(
      "--order 파일을 읽지 못했다"
    );
  });
});

describe("실제 런북(기본 파일 읽기)", () => {
  it("런북 절차 절은 순서 기록이 없는 전환 때문에 BLOCKED(3)이다 — 거부(1)가 아니다", () => {
    const runbook = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      ".moai",
      "docs",
      "launch-gate-runbook.md"
    );
    const result = runCli(["--steps", runbook, "--order", runbook]);
    expect(result.exitCode).toBe(3);
    expect(result.status).toBe("BLOCKED");
  });
});
