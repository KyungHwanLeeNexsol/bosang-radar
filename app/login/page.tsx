import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인",
};

// SPEC-UI-MIGRATION-001 M1 (REQ-002) — Pencil "03 · 테스터 로그인" 프레임의
// 좌측 폼 컬럼 + 우측 브랜드 패널(다크 배경) 2컬럼 구조. 브랜드 패널은
// 반응형 시 태블릿 이하에서 생략된다(design.md §4).
const BRAND_FEATURES = [
  "비식별 사건 정보만으로 리서치를 수행합니다",
  "판례·약관·법령 근거를 자동으로 교차 검증합니다",
  "최종 판단은 항상 담당 손해사정사가 수행합니다",
];

export default function LoginPage() {
  return (
    <div className="flex flex-1">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        <div className="flex size-9 items-center justify-center rounded-[8px] bg-bora-accent">
          <span className="text-base font-extrabold text-white">B</span>
        </div>
        <h1 className="text-h2 font-semibold text-bora-ink">테스터 로그인</h1>
        <LoginForm />
      </div>
      <div className="hidden w-[420px] shrink-0 flex-col justify-between bg-app-sidebar px-10 py-12 lg:flex">
        <div>
          <span className="text-[19px] font-extrabold text-white [font-family:var(--font-manrope)]">
            BORA
          </span>
          <p className="mt-6 text-h2 font-semibold text-white">
            보험 사건 리서치를 더 정확하고 빠르게
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {BRAND_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-body text-app-sidebar-ink">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-bora-accent"
                />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-meta text-app-sidebar-ink">
          본 서비스는 참고용 리서치 결과를 제공하며, 보험금 지급 여부를 확정하지 않습니다.
        </p>
      </div>
    </div>
  );
}
