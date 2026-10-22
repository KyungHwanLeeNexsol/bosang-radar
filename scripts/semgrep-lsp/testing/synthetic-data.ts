// 시험 지원: 합성 고정 입력 한 벌(핀·규칙 목록·규칙 캐시 자리표시 파일). 실제 규칙 YAML이 아니라 자리표시 줄 하나짜리
// 파일이고, 핀은 실제 data/pin.json에서 규칙 개수·해시·휠 확인 여부만 이 합성 목록에 맞춘 사본이다. 스텁 결과이므로
// 실제 Semgrep의 동작이나 탐지의 증거가 아니다.
//
// 공개 API:
//   buildSyntheticData(): SyntheticData
//   dataFileText(name): string            scripts/semgrep-lsp/data/<name> 원문(실제 고정 입력)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  deriveFinalId,
  expectedFinalIdsSha256,
  expectedRulesSha256,
  rulesListSha256,
} from "../rules-manifest";
import { gitBlobSha1, sha256Hex } from "../sha";
import type { ControlExpectations, ExpectedRule, Pin, RuleFileEntry, ScopeConfig } from "../types";

export function dataFileText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../data/${name}`, import.meta.url)), "utf8");
}

export const SYNTHETIC_CACHE_DIR = "semgrep-rules";
export const SYNTHETIC_WHEEL = "b".repeat(64);

export interface SyntheticData {
  pin: Pin;
  pinText: string;
  pinSha256: string;
  scopeConfig: ScopeConfig;
  controlExpectations: ControlExpectations;
  ruleModel: ExpectedRule[];
  rulesFiles: RuleFileEntry[];
  /** 데이터 폴더에 놓을 파일(이름 → 내용). */
  dataFiles: Record<string, string>;
  /** 규칙 캐시 폴더 아래에 놓을 파일(상대 경로 → 내용). */
  cacheFiles: Record<string, string>;
}

export function buildSyntheticData(): SyntheticData {
  const enc = new TextEncoder();
  const realPin = JSON.parse(dataFileText("pin.json")) as Pin;
  const scopeConfig = JSON.parse(dataFileText("scope.json")) as ScopeConfig;
  const controlExpectations = JSON.parse(
    dataFileText("control-expectations.json")
  ) as ControlExpectations;

  const requiredIds = [...new Set(controlExpectations.cases.flatMap((c) => c.required))].sort();
  const ruleModel: ExpectedRule[] = requiredIds
    .map((id) => {
      const rest = id.slice(`${SYNTHETIC_CACHE_DIR}.`.length);
      const dot = rest.lastIndexOf(".");
      const original = rest.slice(dot + 1);
      const file = `${rest.slice(0, dot).split(".").join("/")}/${original}.yaml`;
      return {
        file,
        originalId: original,
        finalId: deriveFinalId(file, original, SYNTHETIC_CACHE_DIR),
        languages: ["javascript", "typescript"],
        mode: "search",
        severity: "WARNING",
      } satisfies ExpectedRule;
    })
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  const ruleContent = (file: string): string => `# placeholder ${file}\n`;
  const rulesFiles: RuleFileEntry[] = ruleModel.map((r) => ({
    path: r.file,
    blobSha: gitBlobSha1(enc.encode(ruleContent(r.file))),
  }));

  const pin: Pin = {
    ...realPin,
    semgrep: {
      ...realPin.semgrep,
      wheel: { ...realPin.semgrep.wheel, sha256: SYNTHETIC_WHEEL, verified: true },
    },
    rules: {
      ...realPin.rules,
      yaml_files: rulesFiles.length,
      yaml_list_sha256: rulesListSha256(rulesFiles),
      expected_rules: ruleModel.length,
      expected_rules_sha256: expectedRulesSha256(ruleModel),
      expected_final_ids_sorted_sha256: expectedFinalIdsSha256(ruleModel),
      distinct_original_ids: new Set(ruleModel.map((r) => r.originalId)).size,
      duplicate_original_id_groups: 0,
    },
    n0: {
      expected: ruleModel.length,
      observed: ruleModel.length,
      confirmed: true,
      value: ruleModel.length,
    },
  };
  const pinText = JSON.stringify(pin, null, 2);

  const dataFiles: Record<string, string> = {
    "pin.json": pinText,
    "scope.json": dataFileText("scope.json"),
    "rules-files.tsv": rulesFiles.map((f) => `${f.path}\t${f.blobSha}\n`).join(""),
    "rules-expected.tsv": ruleModel
      .map(
        (r) =>
          [r.file, r.originalId, r.finalId, r.languages.join("+"), r.mode, r.severity].join("\t") +
          "\n"
      )
      .join(""),
    "control-expectations.json": dataFileText("control-expectations.json"),
  };
  const cacheFiles: Record<string, string> = {};
  for (const r of ruleModel) cacheFiles[r.file] = ruleContent(r.file);

  return {
    pin,
    pinText,
    pinSha256: sha256Hex(enc.encode(pinText)),
    scopeConfig,
    controlExpectations,
    ruleModel,
    rulesFiles,
    dataFiles,
    cacheFiles,
  };
}
