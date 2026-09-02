"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SPEC-PILOT-UX-001 REQ-PILOT-UX-015 — app/cases/[caseId]/ 라우트 세그먼트의
// Next.js App Router 오류 경계. 렌더링/데이터 조회 중 발생하는 예외가 빈
// 화면이 아닌 복구 안내 화면으로 노출되도록 한다.
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>문제가 발생했습니다</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            사건 상세 화면을 표시하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <Button
            type="button"
            className="self-start"
            data-testid="case-error-retry"
            onClick={() => reset()}
          >
            다시 시도
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
