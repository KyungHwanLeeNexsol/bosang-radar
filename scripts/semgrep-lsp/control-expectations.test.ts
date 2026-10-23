import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTROL_EXPECTATIONS_FILE,
  controlExpectationsPath,
  parseControlExpectations,
  readControlExpectations,
} from "./control-expectations";
import { MemoryFs } from "./testing/memory-fs";
import { dataFileText } from "./testing/synthetic-data";
import type { FsPort } from "./types";

// 대조 기대 입력(data/control-expectations.json): 하네스와 대조 기록 어댑터가 같은 파일을 같은 방식으로 읽는다.

const encoder = new TextEncoder();
const REAL_TEXT = dataFileText("control-expectations.json");

describe("controlExpectationsPath", () => {
  it("dataDir 아래의 control-expectations.json이다(끝의 구분자는 정리한다)", () => {
    expect(CONTROL_EXPECTATIONS_FILE).toBe("control-expectations.json");
    expect(controlExpectationsPath("/data")).toBe("/data/control-expectations.json");
    expect(controlExpectationsPath("/data/")).toBe("/data/control-expectations.json");
    expect(controlExpectationsPath("C:\\harness\\data\\")).toBe(
      "C:\\harness\\data/control-expectations.json"
    );
  });
});

describe("parseControlExpectations", () => {
  it("실제 기대 입력을 파싱한다(사례 9개)", () => {
    const parsed = parseControlExpectations(encoder.encode(REAL_TEXT));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.expectations.schema).toBe("semgrep-lsp-control-expectations/1");
      expect(parsed.expectations.cases).toHaveLength(9);
    }
  });

  // 하네스가 고정 입력 단계에서 던지던 메시지와 같은 문구다(하네스 시험이 이 문구에 기대고 있다).
  it.each([
    ["JSON이 아님", "not json", "INVALID_JSON", "control-expectations.json: JSON이 아니다"],
    ["빈 입력", "", "INVALID_JSON", "control-expectations.json: JSON이 아니다"],
    [
      "최상위가 배열",
      "[]",
      "NOT_AN_OBJECT",
      "control-expectations.json: 최상위 값이 객체가 아니다",
    ],
    [
      "최상위가 null",
      "null",
      "NOT_AN_OBJECT",
      "control-expectations.json: 최상위 값이 객체가 아니다",
    ],
    [
      "스키마가 다름",
      JSON.stringify({ schema: "x", cases: [] }),
      "SCHEMA_UNSUPPORTED",
      "control-expectations.json: 스키마·필수 필드가 맞지 않는다",
    ],
    [
      "cases가 배열이 아님",
      JSON.stringify({ schema: "semgrep-lsp-control-expectations/1", cases: {} }),
      "SCHEMA_UNSUPPORTED",
      "control-expectations.json: 스키마·필수 필드가 맞지 않는다",
    ],
  ])("%s → 실패(던지지 않는다)", (_name, text, code, message) => {
    expect(parseControlExpectations(encoder.encode(text))).toEqual({ ok: false, code, message });
  });
});

describe("readControlExpectations", () => {
  it("dataDir의 파일을 읽어 파싱한다", async () => {
    const fs = new MemoryFs({ "/data/control-expectations.json": REAL_TEXT });
    const read = await readControlExpectations(fs, "/data");
    expect(read.ok).toBe(true);
  });

  it("파일이 없거나 읽기가 실패하면 READ_FAILED이고, 오류 메시지·경로는 돌려주지 않는다", async () => {
    const missing = await readControlExpectations(new MemoryFs({}), "/data");
    expect(missing).toMatchObject({ ok: false, code: "READ_FAILED" });
    const inner = new MemoryFs({});
    const failing: FsPort = {
      readFile: async () => {
        throw new Error("EACCES: /secret/path");
      },
      writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
      mkdirp: (p) => inner.mkdirp(p),
      listFilesRecursive: (p) => inner.listFilesRecursive(p),
      exists: (p) => inner.exists(p),
    };
    const result = await readControlExpectations(failing, "/data");
    expect(result).toMatchObject({ ok: false, code: "READ_FAILED" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("다른 위치(검사 대상 저장소 등)의 같은 이름 파일은 읽지 않는다", async () => {
    const fs = new MemoryFs({ "/repo/control-expectations.json": REAL_TEXT });
    expect(await readControlExpectations(fs, "/data")).toMatchObject({
      ok: false,
      code: "READ_FAILED",
    });
  });
});

describe("같은 입력 보증 — 파일 이름은 이 모듈에만 있다", () => {
  const BASE = fileURLToPath(new URL("./", import.meta.url));
  const stripComments = (text: string): string =>
    text
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !(trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*"));
      })
      .map((line) => line.replace(/\s\/\/.*$/, ""))
      .join("\n");

  it('비시험 운영 소스에서 "control-expectations.json" 리터럴을 쓰는 파일은 control-expectations.ts뿐이다', () => {
    const users = readdirSync(BASE)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) =>
        /["'`]control-expectations\.json["'`]/.test(stripComments(readFileSync(BASE + f, "utf8")))
      );
    expect(users).toEqual(["control-expectations.ts"]);
  });

  it("하네스와 어댑터는 이 모듈의 경로·파서를 가져다 쓴다", () => {
    const harness = readFileSync(`${BASE}harness.ts`, "utf8");
    expect(harness).toMatch(/controlExpectationsPath\(options\.dataDir\)/); // 지문 계산이 읽는 경로
    expect(harness).toMatch(/read\(CONTROL_EXPECTATIONS_FILE\)/); // 고정 입력 읽기
    expect(harness).toMatch(/parseControlExpectations\(/);
    const adapter = readFileSync(`${BASE}reference-record.ts`, "utf8");
    expect(adapter).toMatch(/readControlExpectations\(fs, dataDir\)/);
  });
});
