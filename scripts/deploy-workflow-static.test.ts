import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// SPEC-B2C-LAUNCH-001 M4 (AC-B2CLAUNCH-013) — 배포 워크플로의 정적 점검.
// 워크플로를 실행하거나 흉내 내지 않는다. 파일을 YAML로 읽어 구조와 단계 순서만 확인한다.
// GitHub Actions에서의 실제 실행 결과는 이 시험이 보지 못한다.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_FILE = path.join(ROOT, ".github", "workflows", "deploy.yml");

// 저장소에 YAML 파서가 직접 의존성으로 없다. eslint가 의존하는 js-yaml을 eslint 쪽에서 해석해 쓴다
// (새 의존성을 추가하지 않는다). 해석에 실패하면 시험이 실패한다 — 조용히 건너뛰지 않는다.
const requireFromHere = createRequire(import.meta.url);
function loadYaml(text: string): unknown {
  const fromEslint = createRequire(requireFromHere.resolve("eslint/package.json"));
  const yaml = fromEslint("js-yaml") as { load: (source: string) => unknown };
  return yaml.load(text);
}

interface WorkflowStep {
  name?: string;
  uses?: string;
  with?: { script?: string };
}
interface Workflow {
  on: { push: { branches: string[] }; workflow_dispatch: unknown };
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: { deploy: { "runs-on": string; steps: WorkflowStep[] } };
}

const text = readFileSync(WORKFLOW_FILE, "utf-8");
const workflow = loadYaml(text) as Workflow;
const script = workflow.jobs.deploy.steps[0].with?.script ?? "";
// 주석 줄을 뺀 실행 줄. 호출·순서 점검은 주석이 아니라 실제로 실행되는 줄만 본다.
const codeScript = script
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

/** 순서를 확인할 실행 줄 마커의 위치. 없으면 -1이라 순서 시험이 실패한다. */
function position(marker: string): number {
  return codeScript.indexOf(marker);
}

describe("deploy.yml — 파서로 읽힌다", () => {
  it("YAML이 파싱되고 트리거·동시성·단일 배포 단계 구조가 그대로다", () => {
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.concurrency).toEqual({ group: "oracle-deploy", "cancel-in-progress": false });
    expect(workflow.jobs.deploy["runs-on"]).toBe("ubuntu-latest");
    expect(workflow.jobs.deploy.steps).toHaveLength(1);
    expect(workflow.jobs.deploy.steps[0].uses).toBe("appleboy/ssh-action@v1.2.0");
    expect(script.length).toBeGreaterThan(0);
  });

  it("시크릿 참조는 기존 다섯 개 그대로이고 새로 늘지 않았다", () => {
    const names = [...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect([...new Set(names)].sort()).toEqual([
      "ORACLE_APP_PATH",
      "ORACLE_HOST",
      "ORACLE_PM2_APP",
      "ORACLE_SSH_PRIVATE_KEY",
      "ORACLE_USER",
    ]);
  });
});

describe("deploy.yml — smoke 검사는 저장소 스크립트를 부른다", () => {
  it("저장소의 smoke 스크립트를 pnpm exec tsx로 호출한다", () => {
    expect(codeScript).toMatch(/^\s*pnpm exec tsx scripts\/smoke-check\.ts\b/m);
  });

  it("호출 줄이 실패를 삼키지 않는다(파이프·|| true·& 없음) — 실패하면 set -e로 배포가 실패한다", () => {
    const callLine = codeScript.split("\n").find((line) => line.includes("scripts/smoke-check.ts"));
    expect(callLine).toBeDefined();
    expect(callLine).not.toMatch(/\|\||\||&\s*$|;\s*true/);
    expect(codeScript).toMatch(/set -euo pipefail/);
  });

  it("기준 주소는 인자로 넘긴다(스크립트에 기본 주소를 두지 않는다)", () => {
    expect(codeScript).toMatch(/scripts\/smoke-check\.ts[^\n]*--base-url=/);
  });

  it("예전 인라인 검사(placeholder 문구 grep·본문 임시 파일·CSS 경로 추출)가 남아 있지 않다", () => {
    expect(text).not.toContain("서비스 준비 중입니다");
    expect(script).not.toContain("smoke-body.html");
    expect(script).not.toMatch(/grep\s+-q/);
    expect(script).not.toContain("CSS_PATH");
    expect(script).not.toMatch(/\bSMOKE_URL\b/);
    expect(script).not.toContain("placeholder page content");
  });
});

describe("deploy.yml — 단계 순서(재시작 뒤에 smoke)", () => {
  it("빌드 → 정적 자산 복사 → pm2 확인 → 재시작 → 저장 → smoke 순서가 그대로다", () => {
    const markers = [
      "git reset --hard origin/main",
      "pnpm install --frozen-lockfile",
      "pnpm run db:migrate",
      "pnpm run build",
      "cp -r .next/static .next/standalone/.next/static",
      'pm2 describe "$PM2_APP"',
      'pm2 restart "$PM2_APP"',
      "pm2 save",
      "scripts/smoke-check.ts",
    ];
    const positions = markers.map(position);
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("smoke 호출은 정확히 한 번이고, 정보용 제거 라우트 확인은 smoke 뒤에 그대로 있다", () => {
    expect(codeScript.match(/scripts\/smoke-check\.ts/g) ?? []).toHaveLength(1);
    const smoke = position("scripts/smoke-check.ts");
    const informational = position("informational only: confirm removed B2B routes stay gone");
    expect(informational).toBeGreaterThan(smoke);
  });
});
