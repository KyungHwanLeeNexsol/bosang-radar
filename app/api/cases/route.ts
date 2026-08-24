import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createCase } from "@/lib/cases/create-case";

// 사건 입력 폼(app/cases/new/)이 호출하는 route handler(design.md §2).
// proxy.ts가 이미 /api/cases/*를 비로그인 접근으로부터 보호하지만, 세션의
// 실제 유효성(서명/만료/allowlist)은 이 지점에서 getCurrentSession()으로
// 재확인한다(lib/auth/session.ts의 계층 구조를 그대로 따름).
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body: unknown = await request.json();
  const result = await createCase(session.user.id, body);

  if (!result.success) {
    return NextResponse.json(
      { error: "입력값 검증에 실패했습니다.", fieldErrors: result.fieldErrors },
      { status: 400 }
    );
  }

  return NextResponse.json({ caseId: result.caseId }, { status: 201 });
}
