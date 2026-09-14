import { describe, expect, it } from "vitest";
import {
  BACKGROUND_LEASE_TTL_SECONDS,
  CLIENT_POLL_INTERVAL_MS,
  CLIENT_POLL_MAX_ATTEMPTS,
} from "./job-timing";

// SPEC-PILOT-READY-001 §Z(M3, readiness 항목 7 재정정) — 클라이언트 polling
// 상한이 backend 리스 TTL보다 먼저 끝나면, 실제로는 계속 처리 중인 job에
// 대해 클라이언트가 너무 이르게 "실패"를 선언하게 된다. 계약은 반대 방향:
// 클라이언트 polling 총 대기시간이 backend 리스 TTL보다 안전 여유만큼 더
// 길어야 한다(플랫폼 background 최대 실행시간 < 리스 TTL < 클라이언트 polling
// 상한). 이 값이 바뀌면(예: BACKGROUND_LEASE_TTL_SECONDS 조정) 이 테스트가
// 즉시 알려준다.
describe("lib/cases/job-timing", () => {
  it("클라이언트 polling 총 대기시간이 backend 리스 TTL보다 안전 여유만큼 길다", () => {
    const clientTotalMs = CLIENT_POLL_MAX_ATTEMPTS * CLIENT_POLL_INTERVAL_MS;
    const leaseTtlMs = BACKGROUND_LEASE_TTL_SECONDS * 1000;
    expect(clientTotalMs).toBeGreaterThan(leaseTtlMs);
    expect(clientTotalMs - leaseTtlMs).toBeGreaterThanOrEqual(30_000);
  });

  it("기존 6분(180회×2초) 상한보다 넉넉히 길다 — 예전 값으로 되돌아가지 않았는지 확인", () => {
    const previousCeilingMs = 180 * 2000;
    expect(CLIENT_POLL_MAX_ATTEMPTS * CLIENT_POLL_INTERVAL_MS).toBeGreaterThan(previousCeilingMs);
  });
});
