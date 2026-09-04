"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

// SPEC-UI-MIGRATION-001 M1 (REQ-002) — Pencil "03 · 테스터 로그인" 재스타일.
// authClient.signIn.email 호출 로직과 5개 기존 testid는 그대로 보존한다.
// 신규: 비밀번호 표시/숨김 토글(type state 전환만, 제출값 무영향) + 푸터
// 링크(정책 3종 비활성, "랜딩으로 돌아가기"만 활성).
const FOOTER_LINKS = ["이용약관", "개인정보처리방침", "고객지원"] as const;

export function LoginForm() {
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
        className="flex w-full max-w-sm flex-col gap-4"
        data-testid="login-form"
      >
        <div className="flex flex-col gap-1.5">
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
            className="h-9 rounded-[4px] border border-app-line bg-app-surface px-3 text-body text-bora-ink"
            data-testid="login-email"
          />
        </div>
        <div className="flex flex-col gap-1.5">
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
              className="h-9 w-full rounded-[4px] border border-app-line bg-app-surface px-3 pr-10 text-body text-bora-ink"
              data-testid="login-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
              data-testid="login-password-toggle"
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-bora-ink-4 transition-colors hover:text-bora-ink-2"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
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
          className="rounded-[4px] bg-bora-accent text-white hover:bg-bora-accent-deep"
        >
          {isSubmitting ? "로그인 중..." : "로그인"}
        </Button>
      </form>

      <footer className="mt-6 flex w-full max-w-sm flex-col items-center gap-3 border-t border-app-line pt-4">
        <p className="text-meta text-bora-ink-4">
          테스터 계정은 운영자가 직접 발급합니다. 계정 문의는 담당자에게 연락해 주세요.
        </p>
        <div className="flex items-center gap-3 text-meta text-bora-ink-4">
          {FOOTER_LINKS.map((label) => (
            <span key={label} aria-disabled="true" className="cursor-not-allowed opacity-40">
              {label}
            </span>
          ))}
        </div>
        <Link href="/" className="text-body-s font-medium text-bora-accent hover:underline">
          랜딩으로 돌아가기
        </Link>
      </footer>
    </>
  );
}
