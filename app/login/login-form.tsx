"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

// SPEC-UI-MIGRATION-001 M1 (REQ-002) — Pencil "03 · 테스터 로그인" 재스타일.
// authClient.signIn.email 호출 로직과 5개 기존 testid는 그대로 보존한다.
// 신규: 비밀번호 표시/숨김 토글(type state 전환만, 제출값 무영향) + 푸터
// 링크(정책 3종 비활성, "랜딩으로 돌아가기"만 활성).
//
// SPEC-PILOT-READY-001 M3(REQ-PILOT-READY-013, AC-PILOT-READY-013) — 실제
// 운영자 연락 이메일이 확정되어 `supportEmail` prop(서버 컴포넌트인
// app/login/page.tsx가 SUPPORT_CONTACT_EMAIL 환경변수로 전달)이 설정되면
// "고객지원" 항목이 그 주소로 실제로 클릭 가능한 mailto: 링크가 된다.
//
// v0.6.0(외부 구현 검토 5차 반영) — 이전 버전은 `supportEmail`이 아직
// 미확정인 기본 상태에서도 RFC 2606 예약 도메인(example.com) 자리표시자를
// 실제 mailto: 링크로 노출해, 실재하는 채널처럼 보이는 클릭 가능한 가짜
// 연락처를 보여주는 부작용이 있었다 — 외부 검토가 이를 정확히 지적했다.
// 정정된 동작: `supportEmail`이 없으면(미확정 기본 상태) 클릭 가능한 것처럼
// 보이는 가짜 링크를 노출하지 않고, 다른 2개 정책 링크와 동일한 방식으로
// aria-disabled 텍스트로 정직하게 미설정 상태를 드러낸다. 운영자가 실제
// 주소를 확정하면 SUPPORT_CONTACT_EMAIL 환경변수만 설정하면 된다(코드
// 변경 불필요).
const DISABLED_FOOTER_LINKS = ["이용약관", "개인정보처리방침"] as const;

interface LoginFormProps {
  supportEmail?: string;
}

export function LoginForm({ supportEmail }: LoginFormProps = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await authClient.signIn.email({ email, password });

    setIsSubmitting(false);

    if (signInError) {
      setError(signInError.message ?? "로그인에 실패했습니다.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-7"
        data-testid="login-form"
      >
        {/* Round5(외부 재검토) — 픽셀 실측 결과 우측 폼의 라벨-입력창-버튼
            세로 간격이 Pencil보다 30~55px 좁았다. 로그인 화면 전용 컴포넌트
            (다른 화면과 공유되지 않음)이므로 gap-4→gap-7, gap-1.5→gap-2.5로
            직접 확대한다. */}
        <div className="flex flex-col gap-2.5">
          <label htmlFor="email" className="text-body-s font-semibold text-bora-ink-2">
            업무용 이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 rounded-[4px] border border-app-line bg-app-surface px-3 text-body text-bora-ink"
            data-testid="login-email"
          />
        </div>
        <div className="flex flex-col gap-2.5">
          <label htmlFor="password" className="text-body-s font-semibold text-bora-ink-2">
            비밀번호
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-[4px] border border-app-line bg-app-surface px-3 pr-16 text-body text-bora-ink"
              data-testid="login-password"
            />
            {/* Round4: Pencil 정합 — 아이콘만이 아니라 "표시"/"숨기기" 텍스트도 함께 노출 */}
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
              data-testid="login-password-toggle"
              className="absolute inset-y-0 right-0 flex items-center gap-1 px-3 text-body-s text-bora-ink-4 transition-colors hover:text-bora-ink-2"
            >
              {showPassword ? (
                <>
                  <EyeOff aria-hidden="true" className="size-4" />
                  숨기기
                </>
              ) : (
                <>
                  <Eye aria-hidden="true" className="size-4" />
                  표시
                </>
              )}
            </button>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-bora-danger" data-testid="login-error">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={isSubmitting}
          data-testid="login-submit"
          className="h-11 rounded-[4px] bg-bora-accent text-white hover:bg-bora-accent-deep"
        >
          {isSubmitting ? "로그인 중..." : "로그인"}
        </Button>
      </form>

      <footer className="mt-6 flex w-full max-w-sm flex-col items-center gap-3 border-t border-app-line pt-4">
        <p className="text-meta text-bora-ink-4">
          테스터 계정은 운영자가 직접 발급합니다. 계정 문의는 담당자에게 연락해 주세요.
        </p>
        {/* Round4: Pencil 정합 — 링크 사이 "|" 구분선 추가 */}
        <div className="flex items-center gap-3 text-meta text-bora-ink-4">
          {DISABLED_FOOTER_LINKS.map((label, index) => (
            <span key={label} className="flex items-center gap-3">
              {index > 0 ? <span aria-hidden="true">|</span> : null}
              <span aria-disabled="true" className="cursor-not-allowed opacity-40">
                {label}
              </span>
            </span>
          ))}
          <span className="flex items-center gap-3">
            <span aria-hidden="true">|</span>
            {supportEmail ? (
              <a
                href={`mailto:${supportEmail}`}
                className="hover:text-bora-ink-2 hover:underline"
              >
                고객지원
              </a>
            ) : (
              <span aria-disabled="true" className="cursor-not-allowed opacity-40">
                고객지원
              </span>
            )}
          </span>
        </div>
        {/* Round4: Pencil 정합 — 뒤로가기 화살표 아이콘 추가 */}
        <Link
          href="/"
          className="flex items-center gap-1.5 text-body-s font-medium text-bora-accent hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          랜딩으로 돌아가기
        </Link>
      </footer>
    </>
  );
}
