import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";

// 로그인 세션에 따라 리다이렉트 대상이 달라지므로 정적 프리렌더링 대상에서
// 제외한다 — 빌드 시점에는 TURSO_* 환경변수가 없어 getCurrentSession()이
// 예외를 던진다(lib/db/client.ts와 동일한 지연 생성 제약).
export const dynamic = "force-dynamic";

// 보상레이더 진입점. 별도 랜딩 UI 없이 로그인 여부에 따라 /cases/new 또는
// /login으로 즉시 리다이렉트한다(app/cases/new/page.tsx와 동일한 세션 확인
// 패턴).
export default async function Home() {
  const session = await getCurrentSession();

  if (session?.user) {
    redirect("/cases/new");
  }

  redirect("/login");
}
