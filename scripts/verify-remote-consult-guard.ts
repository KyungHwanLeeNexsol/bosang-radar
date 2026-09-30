// SPEC-B2C-CONSULT-001 Group 3a — 원격 검증 하네스의 안전 가드와 순수 헬퍼.
//
// 원격 DB에 쓰는 도구라서 "무엇에 연결하는지"를 사람이 명시적으로 확인하게 만든다:
// 원격 URL은 지문(URL sha256 앞 8자리)이 일치하고, 쓰기 명령이면 --allow-write-remote까지
// 있어야만 통과한다. 통과 못 하면 DB 클라이언트를 만들기 전에 종료 코드 2로 끝난다.
// 호스트 이름과 토큰은 어떤 출력에도 싣지 않는다(스킴, 가린 호스트, 지문만).

import { createHash } from "node:crypto";

export interface GuardFlags {
  readonly expectFingerprint?: string;
  readonly allowWriteRemote: boolean;
}

export interface GuardTarget {
  readonly url: string;
  readonly authToken: string | undefined;
  readonly isRemote: boolean;
  readonly scheme: string;
  readonly fingerprint: string;
  /** 출력용 — 호스트를 앞 3글자씩만 남기고 가린 문자열(로컬이면 "로컬 파일"). */
  readonly masked: string;
}

export type GuardResult =
  | { readonly ok: true; readonly target: GuardTarget }
  | { readonly ok: false; readonly exitCode: 2; readonly message: string };

const REMOTE_SCHEMES = new Set(["libsql:", "https:", "wss:", "http:", "ws:"]);

/** 앞뒤 공백을 뗀 URL 문자열의 sha256 앞 8자리 hex — 원격 대상 식별용 지문. */
export function fingerprintOf(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex").slice(0, 8);
}

export function urlScheme(url: string): string {
  const trimmed = url.trim();
  const index = trimmed.indexOf(":");
  return index < 0 ? "" : trimmed.slice(0, index + 1).toLowerCase();
}

/** 호스트 라벨 앞 두 개만 3글자씩 남긴다: bosang-x.aws-y.turso.io → bos***.aws*** */
export function maskHost(url: string): string {
  let hostname: string;
  try {
    hostname = new URL(url.trim()).hostname;
  } catch {
    return "(알 수 없음)";
  }
  if (!hostname) return "(알 수 없음)";
  const labels = hostname.split(".").slice(0, 2);
  return labels.map((label) => `${label.slice(0, 3)}***`).join(".");
}

export function hostOf(url: string): string {
  try {
    return new URL(url.trim()).hostname;
  } catch {
    return "";
  }
}

/** 로그·결과 파일에 들어가는 텍스트에서 URL·호스트·토큰·시크릿을 가린다. */
export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    out = out.split(secret).join("***");
  }
  return out;
}

/** 실행 식별자 — 이름·트리거·LIKE 패턴에 그대로 들어가므로 소문자·숫자 4~12자로 제한한다. */
export function isValidRunId(runId: string): boolean {
  return /^[a-z0-9]{4,12}$/.test(runId);
}

function refuse(message: string): GuardResult {
  return { ok: false, exitCode: 2, message: `[verify-remote-consult] 거부: ${message}` };
}

/**
 * 환경 변수와 플래그로 대상 DB를 판정한다. process.env를 읽지 않고 주입받은 env만 본다
 * (.env* 파일도 읽지 않는다). writes=true는 run/cleanup/revert-schema처럼 쓰는 명령이다.
 */
export function evaluateGuard(
  env: Readonly<Record<string, string | undefined>>,
  flags: GuardFlags,
  opts: { writes: boolean }
): GuardResult {
  const url = env.TURSO_DATABASE_URL?.trim();
  if (!url) {
    return refuse("TURSO_DATABASE_URL이 비어 있습니다.");
  }

  const scheme = urlScheme(url);
  const authToken = env.TURSO_AUTH_TOKEN?.trim() || undefined;
  const fingerprint = fingerprintOf(url);

  if (scheme === "file:") {
    return {
      ok: true,
      target: { url, authToken, isRemote: false, scheme, fingerprint, masked: "로컬 파일" },
    };
  }

  if (!REMOTE_SCHEMES.has(scheme)) {
    return refuse(
      `지원하지 않는 URL 스킴입니다(스킴 ${scheme || "(없음)"}). file:/libsql:/https:/wss:만 허용합니다.`
    );
  }

  if (!flags.expectFingerprint) {
    return refuse(
      `원격 DB(스킴 ${scheme})에는 --expect-fingerprint <8자리>가 필요합니다. ` +
        `대상 지문은 'fingerprint' 명령으로 확인하세요.`
    );
  }
  if (flags.expectFingerprint.toLowerCase() !== fingerprint) {
    return refuse("--expect-fingerprint가 현재 TURSO_DATABASE_URL의 지문과 일치하지 않습니다.");
  }
  if (opts.writes && !flags.allowWriteRemote) {
    return refuse("원격 DB에 쓰는 명령에는 --allow-write-remote가 필요합니다.");
  }

  return {
    ok: true,
    target: {
      url,
      authToken,
      isRemote: true,
      scheme,
      fingerprint,
      masked: maskHost(url),
    },
  };
}
