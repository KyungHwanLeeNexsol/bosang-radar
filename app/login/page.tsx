import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { GitCompare, Lock, Search, ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인",
};

// SPEC-UI-MIGRATION-001 Post-M8 Pencil 시각 정합성 보정(design/exports/03-테스터-로그인.png)
// — 다크 브랜드 패널이 좌측, 흰 폼 패널이 우측이다(M1 초기 구현은 순서가
// 반대였다). 반응형 시 태블릿 이하에서 브랜드 패널은 계속 생략된다
// (lg:flex는 그대로 유지 — 순서만 교체).
interface BrandFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const BRAND_FEATURES: BrandFeature[] = [
  {
    icon: Search,
    title: "쟁점 자동 추출",
    description: "사고 경위와 진단명에서 실무상 다투어질 쟁점을 먼저 뽑아냅니다.",
  },
  {
    icon: GitCompare,
    title: "근거 대조",
    description: "판례·약관·법령을 함께 검색해 근거와 반대 논리를 나란히 제시합니다.",
  },
  {
    icon: ShieldCheck,
    title: "검증 표기",
    description: "근거가 부족한 항목은 판단 불충분으로 명시하고 지급을 단정하지 않습니다.",
  },
];

export default function LoginPage() {
  return (
    <div className="flex flex-1">
      <div className="hidden shrink-0 flex-col justify-between bg-app-sidebar px-10 py-12 lg:flex lg:w-[42%]">
        <div>
          {/* Round3: Pencil 03-테스터-로그인.png — B 타일을 좌측 브랜드 패널에 추가 */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-8 items-center justify-center rounded-[6px] bg-bora-accent"
              aria-hidden="true"
            >
              <span className="text-[15px] font-extrabold text-white">B</span>
            </div>
            <span className="text-[19px] font-extrabold text-white [font-family:var(--font-manrope)]">
              BORA
            </span>
          </div>
          <p className="mt-1 text-meta tracking-[0.2em] text-app-sidebar-ink">보 상 레 이 더</p>
          <p className="mt-6 text-h2 font-semibold text-white">
            판례·약관·법령을 한 번에 대조하는
            <br />
            손해사정 리서치 워크스페이스
          </p>
          <p className="mt-4 text-body text-app-sidebar-ink">
            사건 정보를 입력하면 검토 쟁점을 추출하고, 각 주장에 대한 근거와 반대 논리를 함께
            제시합니다. 판단이 어려운 항목은 불충분으로 명시합니다.
          </p>
          <ul className="mt-6 flex flex-col gap-4">
            {BRAND_FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-2.5">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-bora-accent" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-body font-semibold text-white">{title}</span>
                  <span className="text-body-s text-app-sidebar-ink">{description}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-start gap-2 text-meta text-app-sidebar-ink">
          <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          손해사정 실무자 전용 서비스입니다. 접속 및 조회 기록이 저장되며 감사 목적으로 보관됩니다.
        </p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        {/* Round3: 우측 폼 패널 B 타일 제거 — Pencil 03-테스터-로그인.png 기준 */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-meta font-semibold uppercase tracking-wide text-bora-ink-4">
            TESTER LOGIN
          </span>
          <h1 className="text-h2 font-semibold text-bora-ink">테스터 로그인</h1>
          <p className="text-body-s text-bora-ink-3">
            운영자가 승인한 테스터 계정으로만 로그인할 수 있습니다.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
