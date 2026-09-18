import type { Metadata } from "next";

// SPEC-B2C-FOUNDATION-001 M2 (REQ-B2CFOUND-002/003/013) — B2C 01 화면(질문
// 입력 진입점)이 아직 구현되지 않은 상태에서 `app/` 루트가 항상 정적으로
// 접근 가능하도록 마련한 최소 placeholder. M3에서 app/cases/*, app/login/*,
// lib/auth/*를 제거하기 전에 선행되어야 하며(REQ-B2CFOUND-003), 세션 확인이나
// 다른 런타임 의존성 없이 빌드 시점에 완전히 정적으로 렌더링된다. 이름·
// 연락처 등 PII 필드는 수집하지 않는다(REQ-B2CFOUND-013) — 실제 01 화면
// 구현은 이 SPEC의 범위 밖이며 후속 SPEC에서 대체된다.
export const metadata: Metadata = {
  title: "서비스 준비 중",
};

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-h2 font-semibold text-bora-ink">서비스 준비 중입니다</h1>
      <p className="max-w-sm text-body text-bora-ink-3">
        보상레이더는 현재 새로운 서비스를 준비하고 있습니다. 곧 다시 찾아주세요.
      </p>
    </div>
  );
}
