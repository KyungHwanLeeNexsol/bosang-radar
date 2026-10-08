import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseItemTable } from "./item-table";

// SPEC-B2C-LAUNCH-001 M6 — 런북이 가리키는 것이 실제로 있는지만 보는 구조 시험이다.
// 항목 식별자, 파일 경로, 실행 명령의 스크립트, 절 제목 참조, REQ·AC·형제 식별자가 낡거나 틀리면 실패한다.
// 런북의 문장이 사실인지(예: 점검 결과의 현황)는 보지 않는다. 표의 내용 대조는 stage-table.test.ts 등이 한다.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string =>
  readFileSync(join(ROOT, relative), "utf-8").replace(/\r\n/g, "\n");

const RUNBOOK = read(".moai/docs/launch-gate-runbook.md");

/** `REQ-X-001·002` 같은 줄임 표기를 펼쳐 전체 식별자 목록으로 만든다. */
function expandIds(text: string, pattern: RegExp, prefix: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    for (const number of match[1].split("·")) ids.add(`${prefix}${number}`);
  }
  return [...ids];
}

function sectionOf(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

describe("런북이 말하는 항목 식별자", () => {
  const parsed = parseItemTable(RUNBOOK);
  const rows = parsed.ok ? parsed.rows : [];
  const itemIds = rows.map((row) => row.id);
  const mentioned = [...new Set(RUNBOOK.match(/(?<![A-Za-z0-9-])[LR]-\d{2}(?!\d)/g) ?? [])];

  it("항목 정의표가 파서를 통과한다", () => {
    expect(parsed.ok).toBe(true);
    expect(itemIds.length).toBeGreaterThan(0);
  });

  it("본문이 적은 L-nn·R-nn은 모두 항목 정의표에 있다", () => {
    expect(mentioned.length).toBeGreaterThan(0);
    const unknown = mentioned.filter((id) => !itemIds.includes(id));
    expect(unknown, `항목 정의표에 없는 식별자: ${unknown.join(", ")}`).toEqual([]);
  });

  it("단계 이행 절차가 EV-L2 직후 강등된다고 적은 항목은 정의표에서 EV-L2를 가진 항목과 같다", () => {
    const line = sectionOf(RUNBOOK, "## 단계 이행 절차")
      .split("\n")
      .find((text) => text.startsWith("9. "));
    expect(line, "순서 9를 찾지 못했다").toBeDefined();
    const named = [...new Set(line?.match(/(?<![A-Za-z0-9-])[LR]-\d{2}(?!\d)/g) ?? [])].sort();
    const expected = rows
      .filter((row) => row.events.includes("EV-L2"))
      .map((row) => row.id)
      .sort();
    expect(named).toEqual(expected);
  });
});

describe("런북이 말하는 파일과 명령", () => {
  const PATH =
    /(?<![\w-])(?:\.\/)?((?:lib|scripts|components|app|\.moai|\.github)\/[\w./()[\]-]*\.(?:tsx?|md|ya?ml|json))(?!\w)/g;
  const paths = [...new Set([...RUNBOOK.matchAll(PATH)].map((match) => match[1]))];

  it("런북이 이름을 댄 파일 경로는 모두 저장소에 있다", () => {
    expect(paths.length).toBeGreaterThan(20);
    const missing = paths.filter((path) => !existsSync(join(ROOT, path)));
    expect(missing, `없는 파일: ${missing.join(", ")}`).toEqual([]);
  });

  const fenced = [...RUNBOOK.matchAll(/^```text\n([\s\S]*?)\n```$/gm)].map((match) => match[1]);
  const commandLines = fenced.flatMap((block) =>
    block.split("\n").filter((line) => line.startsWith("pnpm exec "))
  );

  it("명령 줄의 스크립트와 시험 파일은 모두 저장소에 있다", () => {
    expect(commandLines.length).toBeGreaterThan(5);
    const targets = commandLines.flatMap(
      (line) => line.match(/(?:lib|scripts|components)\/[\w./-]+\.tsx?/g) ?? []
    );
    expect(targets.length).toBeGreaterThan(10);
    const missing = targets.filter((path) => !existsSync(join(ROOT, path)));
    expect(missing, `없는 파일: ${missing.join(", ")}`).toEqual([]);
  });

  it("런북이 npm 스크립트로 등록되지 않았다고 적은 스크립트는 package.json에 등록되어 있지 않다", () => {
    const registered = Object.values(
      (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts
    );
    const run = commandLines
      .filter((line) => line.startsWith("pnpm exec tsx scripts/"))
      .map((line) => line.split(" ")[3]);
    expect(run.length).toBeGreaterThan(4);
    const nowRegistered = run.filter((script) => registered.some((cmd) => cmd.includes(script)));
    expect(
      nowRegistered,
      `등록된 스크립트가 생겼다 — 런북의 "등록되어 있지 않다" 문장과 명령을 고친다: ${nowRegistered.join(", ")}`
    ).toEqual([]);
  });

  it("`## 절` 참조는 모두 런북의 절 제목이다", () => {
    const headings = RUNBOOK.split("\n").filter((line) => /^#{2,3} /.test(line));
    const refs = [...RUNBOOK.matchAll(/`(#{2,3}) ([^`\n]+)`/g)];
    expect(refs.length).toBeGreaterThan(10);
    const unknown = refs
      .filter((ref) => !headings.some((heading) => heading.startsWith(`${ref[1]} ${ref[2]}`)))
      .map((ref) => `${ref[1]} ${ref[2]}`);
    expect(unknown, `없는 절 제목: ${unknown.join(", ")}`).toEqual([]);
  });
});

describe("런북이 말하는 요구사항·AC·형제 식별자", () => {
  it("REQ-B2CLAUNCH·AC-B2CLAUNCH 식별자는 spec.md·acceptance.md에 정의돼 있다", () => {
    const spec = read(".moai/specs/SPEC-B2C-LAUNCH-001/spec.md");
    const acceptance = read(".moai/specs/SPEC-B2C-LAUNCH-001/acceptance.md");
    const reqs = expandIds(RUNBOOK, /REQ-B2CLAUNCH-(\d{3}(?:·\d{3})*)/g, "REQ-B2CLAUNCH-");
    const acs = expandIds(RUNBOOK, /AC-B2CLAUNCH-(\d{3}(?:·\d{3})*)/g, "AC-B2CLAUNCH-");
    expect(reqs.length).toBeGreaterThan(10);
    expect(acs.length).toBeGreaterThan(5);
    expect(reqs.filter((id) => !spec.includes(`**${id}**`))).toEqual([]);
    expect(acs.filter((id) => !acceptance.includes(`**${id}**`))).toEqual([]);
  });

  it("형제 SPEC의 식별자는 그 SPEC 문서에 있다(참조 줄이 낡으면 잡는다)", () => {
    const sibling = (spec: string, files: string[]): string =>
      files.map((file) => read(`.moai/specs/${spec}/${file}`)).join("\n");
    const consultops = sibling("SPEC-B2C-CONSULTOPS-001", ["spec.md"]);
    const engine = sibling("SPEC-B2C-ENGINE-001", ["spec.md", "design.md"]);
    const diagnosis = sibling("SPEC-B2C-DIAGNOSIS-001", ["spec.md", "acceptance.md"]);
    const consult = sibling("SPEC-B2C-CONSULT-001", ["spec.md"]);
    const result = sibling("SPEC-B2C-RESULT-001", ["spec.md"]);

    const checks: [string, string[], string][] = [
      ["CONSULTOPS-001", expandIds(RUNBOOK, /(REQ-B2CCONSULTOPS-\d{3})/g, ""), consultops],
      ["CONSULTOPS-001", expandIds(RUNBOOK, /(?<![A-Za-z-])(D-OPS-\d{2})/g, ""), consultops],
      [
        "CONSULTOPS-001",
        [...new Set(RUNBOOK.match(/(?<![A-Za-z0-9-])E-\d{2}(?!\d)/g) ?? [])].map(
          (id) => `| ${id} |`
        ),
        consultops,
      ],
      ["ENGINE-001", expandIds(RUNBOOK, /(REQ-B2CENGINE-\d{3})/g, ""), engine],
      ["ENGINE-001", expandIds(RUNBOOK, /(D-ENGINE-\d{2})/g, ""), engine],
      [
        "DIAGNOSIS-001",
        expandIds(RUNBOOK, /REQ-B2CDIAG-(\d{3}(?:·\d{3})*)/g, "REQ-B2CDIAG-"),
        diagnosis,
      ],
      ["DIAGNOSIS-001", expandIds(RUNBOOK, /(AC-B2CDIAG-\d{3})/g, ""), diagnosis],
      ["CONSULT-001", expandIds(RUNBOOK, /(REQ-B2CCONSULT-\d{3})/g, ""), consult],
      ["RESULT-001", expandIds(RUNBOOK, /(REQ-B2CRESULT-\d{3})/g, ""), result],
    ];
    for (const [spec, ids, text] of checks) {
      expect(ids.length, `${spec}: 식별자 추출이 비었다`).toBeGreaterThan(0);
      const missing = ids.filter((id) => !text.includes(id));
      expect(missing, `${spec}에 없는 식별자: ${missing.join(", ")}`).toEqual([]);
    }
  });
});
