import { describe, expect, it } from "vitest";

import { findRemoteDatabaseViolation } from "./visual-verify-db-guard";

describe("findRemoteDatabaseViolation — visual:verify는 로컬 파일 DB에만 쓴다", () => {
  it("TURSO_DATABASE_URL이 없거나 빈 값이면 통과한다(스크립트가 로컬 file DB 기본값을 채운다)", () => {
    expect(findRemoteDatabaseViolation({})).toBeNull();
    expect(findRemoteDatabaseViolation({ TURSO_DATABASE_URL: "" })).toBeNull();
    expect(findRemoteDatabaseViolation({ TURSO_DATABASE_URL: "   " })).toBeNull();
  });

  it("file: URL이면 통과한다", () => {
    expect(
      findRemoteDatabaseViolation({ TURSO_DATABASE_URL: "file:./.tmp/visual-verify.db" })
    ).toBeNull();
    expect(findRemoteDatabaseViolation({ TURSO_DATABASE_URL: "file:./.tmp/group1.db" })).toBeNull();
  });

  it.each([
    "libsql://bosang-radar-prod.turso.io",
    "https://bosang-radar-prod.turso.io",
    "wss://bosang-radar-prod.turso.io",
    "http://127.0.0.1:8080",
    ":memory:",
  ])("file:이 아닌 URL(%s)은 거부하고 한국어 사유를 돌려준다", (url) => {
    const message = findRemoteDatabaseViolation({ TURSO_DATABASE_URL: url });

    expect(message).not.toBeNull();
    expect(message).toContain("TURSO_DATABASE_URL");
    expect(message).toContain("file:");
    // 원격 주소 전체를 로그에 남기지 않는다(호스트·토큰 노출 방지) — 스킴만 알려 준다.
    expect(message).not.toContain("bosang-radar-prod");
  });

  it("앞뒤 공백이 있어도 file:로 시작하는지 정확히 본다", () => {
    expect(
      findRemoteDatabaseViolation({ TURSO_DATABASE_URL: "  libsql://x.turso.io " })
    ).not.toBeNull();
    expect(findRemoteDatabaseViolation({ TURSO_DATABASE_URL: " file:./.tmp/a.db " })).toBeNull();
  });
});
