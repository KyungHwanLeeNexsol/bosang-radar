import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createCase } from "@/lib/cases/create-case";

// 사건 입력 폼(app/cases/new/)이 호출하는 route handler(design.md §2).
// proxy.ts가 이미 /api/cases/*를 비로그인 접근으로부터 보호하지만, 세션의
// 실제 유효성(서명/만료/allowlist)은 이 지점에서 getCurrentSession()으로
// 재확인한다(lib/auth/session.ts의 계층 구조를 그대로 따름).
//
// SPEC-PILOT-READY-001 M1(REQ-PILOT-READY-007, plan.md §A 결정 1) — 이
// route segment의 실행 시간 상한을 300초로 명시한다. lib/cases/create-case.ts
// 의 LEASE_TTL_SECONDS(최소 330초)는 이 상한보다 충분히 길게(약 30초 안전
// 여유) 설정되어, 정상 처리 중인 요청의 리스가 플랫폼 강제 종료보다 먼저
// 만료되는 일이 없도록 한다.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  // SPEC-PILOT-READY-001 M2(REQ-PILOT-READY-008) — 요청 시작 시점의 최소
  // 구조적 로그. ownerUserId 존재 여부만 기록하며(PII 없음), 사건 입력
  // 원문은 절대 로그에 포함하지 않는다.
  console.info(
    JSON.stringify({
      event: "case_request_received",
      timestamp: new Date().toISOString(),
      hasOwnerUserId: Boolean(session?.user?.id),
    })
  );

  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body: unknown = await request.json();
  const result = await createCase(session.user.id, body);

  if (!result.success) {
    if ("alreadyProcessing" in result) {
      return NextResponse.json(
        { error: "이미 처리 중인 요청이 있습니다. 잠시 후 다시 시도해 주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "입력값 검증에 실패했습니다.", fieldErrors: result.fieldErrors },
      { status: 400 }
    );
  }

  return NextResponse.json({ caseId: result.caseId }, { status: 201 });
}
