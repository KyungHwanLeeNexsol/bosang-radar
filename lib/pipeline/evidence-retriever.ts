import seedEvidence from "../../db/seed/evidence.json";
import type { EvidenceCandidate, ResearchQuery } from "./types";

// EvidenceRetriever (3/6) — 리서치 쿼리에 대응하는 근거자료 후보를 조회한다
// (REQ-SCAFFOLD-013, REQ-SCAFFOLD-015). 이번 마일스톤은 db/seed/evidence.json
// 의 소규모 seed 데이터셋을 근거자료 후보로 그대로 반환하는 trivial 구현체다
// (plan.md §D 목업 우선 파이프라인) — 실제 DB/외부 소스 조회는 out of scope
// (spec.md §4 대규모 근거자료 데이터 수집).
//
// @MX:WARN: [AUTO] 근거자료 후보 조회는 비동기 I/O이며, 추후 외부 판례/약관
// 소스가 추가되면 여러 소스에 대한 동시 비동기 요청으로 확장될 수 있다.
// @MX:REASON: 현재는 단일 seed 파일 읽기이지만, product.md 로드맵상 여러
// 외부 소스로 확장 시 동시성 제어가 필요해진다(plan.md §F).
export async function retrieveEvidence(
  _queries: ResearchQuery[],
  source: EvidenceCandidate[] = seedEvidence
): Promise<EvidenceCandidate[]> {
  return source;
}
