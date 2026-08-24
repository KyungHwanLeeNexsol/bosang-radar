import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/auth/session";

// 로그인 세션에 따라 안내 링크가 달라지므로 정적 프리렌더링 대상에서
// 제외한다 — 빌드 시점에는 TURSO_* 환경변수가 없어 getCurrentSession()이
// 예외를 던진다(lib/db/client.ts와 동일한 지연 생성 제약).
export const dynamic = "force-dynamic";

// bare UI — 보상레이더 진입점(M5, plan.md §C M5). 로그인 여부에 따라
// /cases/new 또는 /login으로 안내하는 최소 랜딩 화면이며, 폴리시된
// UI/UX는 후속 SPEC으로 이연한다(spec.md §4 Out of Scope).
export default async function Home() {
  const session = await getCurrentSession();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-semibold">보상레이더</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        비식별 보험 사건 정보를 입력하면 추가로 검토할 담보·근거자료·반대 논리를 조사해 드립니다.
      </p>
      <Button render={<Link href={session?.user ? "/cases/new" : "/login"} />}>
        {session?.user ? "사건 입력 시작하기" : "로그인하고 시작하기"}
      </Button>
    </div>
  );
}
