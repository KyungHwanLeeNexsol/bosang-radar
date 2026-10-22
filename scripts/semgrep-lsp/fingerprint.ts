// 하네스·대조 지문과 결합(binding) — 대조 참조를 "이번 실행의 도구·규칙·하네스·대조 코드"에 묶는다(PR #28 검토 발견 3).
//
// 순수 함수(매니페스트·해시·결합)와, FsPort로만 읽는 두 계산 도우미로 이루어진다. 프로세스·환경변수·네트워크는 만지지 않는다.
// 읽기 실패는 던지지 않고 null을 돌려준다: null은 "확인하지 못함"이며 어떤 비교에서도 일치로 치지 않는다.
//
// 범위의 근거(하네스 지문):
//  · 포함: harnessRoot 아래의 .ts·.mjs 구현 파일. 제외: *.test.ts·*.test.mjs, 최상위 testing/·data/ 아래 전부, 그 밖의 확장자.
//    시험·스텁·고정 데이터는 운영 동작을 정의하지 않는다. data/pin.json과 규칙 목록은 pin_sha256·rules_*_sha256으로,
//    data/control-expectations.json과 고정 입력(.in)은 대조 지문으로 묶인다. data/scope.json은 target의 범위(E)에만 쓰여
//    대조 참조에는 영향이 없다.
//  · 제외가 구멍이 되지 않도록 구조 시험이 "운영 소스는 시험 지원 디렉터리를 가져오지 않는다"를 지킨다.
//  · 파일 해시는 원시 바이트의 sha256이다(줄바꿈 정규화 없음). CRLF로 체크아웃한 트리는 지문이 달라진다 — fail-closed.
//  · 포함 파일이 하나도 없으면 빈 집합의 해시를 지문으로 쓰지 않고 오류(null)로 본다.
//
// 공개 API:
//   HARNESS_FINGERPRINT_SCHEMA / CONTROL_FINGERPRINT_SCHEMA / BINDING_SCHEMA
//   isHarnessImplementationFile(relPath)
//   harnessManifest(files) / harnessFingerprintOf(files)
//   controlManifest(expectationsSha256, cases) / controlFingerprintOf(expectationsSha256, cases)
//   buildBinding(components)                       구성 요소가 하나라도 null이면 null
//   computeHarnessFingerprint(fs, harnessRoot) / computeControlFingerprint(fs, args)

import { canonicalJson } from "./canonical";
import { sha256Hex } from "./sha";
import type { ControlExpectations, FsPort } from "./types";

export const HARNESS_FINGERPRINT_SCHEMA = "semgrep-lsp-harness-fingerprint/1";
export const CONTROL_FINGERPRINT_SCHEMA = "semgrep-lsp-control-fingerprint/1";
export const BINDING_SCHEMA = "semgrep-lsp-binding/1";

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function joinPath(root: string, name: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${name}`;
}

// ── 하네스 지문 ─────────────────────────────────────────────────

/** harnessRoot 기준 상대 경로('/' 구분)가 하네스 구현 파일인가. 최상위 testing/·data/ 접두만 제외한다(중첩은 포함 — 더 많이 해시하는 쪽이 안전하다). */
export function isHarnessImplementationFile(relPath: string): boolean {
  if (!/\.(ts|mjs)$/.test(relPath)) return false;
  if (/\.test\.(ts|mjs)$/.test(relPath)) return false;
  if (relPath.startsWith("testing/") || relPath.startsWith("data/")) return false;
  return true;
}

export interface FileHash {
  path: string;
  sha256: string;
}

/** "<스키마>\n" + 경로 바이트순으로 "<경로>\t<파일 sha256>\n". 파일이 없으면 던진다. 입력을 바꾸지 않는다. */
export function harnessManifest(files: readonly FileHash[]): string {
  if (files.length === 0) throw new Error("하네스 지문에는 파일이 하나 이상 필요하다");
  const sorted = [...files].sort((a, b) => compareBytes(a.path, b.path));
  return `${HARNESS_FINGERPRINT_SCHEMA}\n` + sorted.map((f) => `${f.path}\t${f.sha256}\n`).join("");
}

export function harnessFingerprintOf(files: readonly FileHash[]): string {
  return sha256Hex(harnessManifest(files));
}

export async function computeHarnessFingerprint(
  fs: FsPort,
  harnessRoot: string
): Promise<{ sha256: string; manifest: string; files: FileHash[] } | null> {
  try {
    const listed = (await fs.listFilesRecursive(harnessRoot)).filter(isHarnessImplementationFile);
    if (listed.length === 0) return null;
    const files: FileHash[] = [];
    for (const path of listed) {
      files.push({ path, sha256: sha256Hex(await fs.readFile(joinPath(harnessRoot, path))) });
    }
    return { sha256: harnessFingerprintOf(files), manifest: harnessManifest(files), files };
  } catch {
    return null;
  }
}

// ── 대조 지문 ───────────────────────────────────────────────────

export interface ControlCaseHash {
  path: string;
  fixture: string;
  sha256: string;
}

/** "<스키마>\n" + "expectations\t<해시>\n" + 경로 바이트순으로 "case\t<경로>\t<고정 입력>\t<해시>\n". */
export function controlManifest(
  expectationsSha256: string,
  cases: readonly ControlCaseHash[]
): string {
  const sorted = [...cases].sort((a, b) => compareBytes(a.path, b.path));
  return (
    `${CONTROL_FINGERPRINT_SCHEMA}\n` +
    `expectations\t${expectationsSha256}\n` +
    sorted.map((c) => `case\t${c.path}\t${c.fixture}\t${c.sha256}\n`).join("")
  );
}

export function controlFingerprintOf(
  expectationsSha256: string,
  cases: readonly ControlCaseHash[]
): string {
  return sha256Hex(controlManifest(expectationsSha256, cases));
}

/**
 * 기대 파일의 바이트와, 각 사례가 가리키는 고정 입력을 실제로 읽은 바이트로 지문을 만든다.
 * 기대 목록 안의 sha256 값은 "주장"일 뿐이라 쓰지 않는다(사전 검사가 따로 대조한다).
 */
export async function computeControlFingerprint(
  fs: FsPort,
  args: { expectationsPath: string; fixturesRoot: string; expectations: ControlExpectations }
): Promise<{ sha256: string; manifest: string } | null> {
  try {
    const expectationsSha256 = sha256Hex(await fs.readFile(args.expectationsPath));
    const cases: ControlCaseHash[] = [];
    for (const c of args.expectations.cases) {
      const bytes = await fs.readFile(joinPath(args.fixturesRoot, c.fixture));
      cases.push({ path: c.path, fixture: c.fixture, sha256: sha256Hex(bytes) });
    }
    return {
      sha256: controlFingerprintOf(expectationsSha256, cases),
      manifest: controlManifest(expectationsSha256, cases),
    };
  } catch {
    return null;
  }
}

// ── 결합 ────────────────────────────────────────────────────────

export interface BindingComponents {
  tool_version: string | null;
  wheel_sha256: string | null;
  pin_sha256: string;
  rules_list_sha256: string;
  rules_expected_sha256: string;
  harness_sha256: string | null;
  control_sha256: string | null;
}

/**
 * 도구·규칙·핀·하네스·대조 지문을 하나로 묶은 해시. 구성 요소가 하나라도 문자열이 아니면 null이다 —
 * 검증하지 못한 두 실행이 "같은 결합"으로 보이지 않게 한다. 입력을 바꾸지 않는다.
 */
export function buildBinding(c: BindingComponents): string | null {
  const parts = [
    c.tool_version,
    c.wheel_sha256,
    c.pin_sha256,
    c.rules_list_sha256,
    c.rules_expected_sha256,
    c.harness_sha256,
    c.control_sha256,
  ];
  if (parts.some((p) => typeof p !== "string")) return null;
  return sha256Hex(
    canonicalJson({
      schema: BINDING_SCHEMA,
      tool: { version: c.tool_version, wheel_sha256: c.wheel_sha256 },
      pin_sha256: c.pin_sha256,
      rules: { list_sha256: c.rules_list_sha256, expected_sha256: c.rules_expected_sha256 },
      harness_sha256: c.harness_sha256,
      control_sha256: c.control_sha256,
    })
  );
}
