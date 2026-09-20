"use client";

import * as React from "react";
import { Clock, Layers, Lock, Search, ShieldCheck, Stethoscope, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { validateDiagnosisInput } from "@/lib/validation/diagnosis-input";

// SPEC-B2C-DIAGNOSIS-001 M3/M-fix-1 (design.md §2, §4; design/exports/01-*.png,
// M01-*.png) — 01/M01 화면: BORA 히어로 카피 + 검색창 + "많이 찾는 사례" 칩 +
// 200자 카운터 + PII 안내 배너 + 4개 보상 카테고리 미리보기 카드. 검증 실패
// 시 다음 단계(동의) 진행을 차단하고 인라인 오류를 표시한다(REQ-B2CDIAG-020,
// AC-B2CDIAG-019). value/onChange는 부모(diagnosis-flow.tsx)의 reducer
// 상태를 그대로 controlled로 전달받는다(design.md §5 — 상태는
// diagnosis-flow.tsx 한 곳에만 존재).
//
// M-fix-1 리마인더 — 이 컴포넌트는 diagnosis-flow.tsx의 consent 오버레이
// 아래 배경으로도 계속 마운트된 채 남아 있어야 한다(01-A2/M01-A2가 01/M01
// 위의 오버레이이기 때문). 따라서 검색창 자동 포커스는 "input" 스텝일
// 때만 실행되어야 하며(M-fix-2), 이 컴포넌트 자체는 자신이 배경으로
// 렌더링 중인지 알 수 없으므로 그 판단은 부모가 autoFocus prop으로
// 넘겨준다.

const MAX_LENGTH = 200;
const SEARCH_ERROR_ID = "diagnosis-search-error";

// design/exports/01-보상-진단-질문-입력.png, M01-질문-입력.png의 "많이 찾는
// 사례" 칩 전체 목록(B6 — 대표 예시로 축소하지 않고 캡처 원본 6개를 그대로
// 재현한다).
const FREQUENT_CASES = [
  "교통사고",
  "계단에서 낙상",
  "운동 중 부상",
  "허리 디스크",
  "어깨 회전근개",
  "암 진단",
] as const;

interface CategoryPreview {
  index: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

// design.md §3 — 4개 보상 카테고리 미리보기(components/ui/card.tsx 재사용).
// 이 SPEC은 매칭 엔진을 구현하지 않으므로 카드는 클릭 불가능한 정보성
// 프리뷰다(design/exports 캡처에도 인터랙션 표시 없음).
const CATEGORY_PREVIEWS: CategoryPreview[] = [
  { index: "1", icon: Stethoscope, title: "실손 의료비", description: "실제 지출한 병원비" },
  { index: "2", icon: Layers, title: "정액 담보", description: "진단·수술·입원별 가입 담보" },
  { index: "3", icon: TrendingUp, title: "후유장해", description: "치료 후 남은 장해 상태" },
  { index: "4", icon: ShieldCheck, title: "특별 보상", description: "시설·단체·상대방 보험 등" },
];

interface StepInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidSubmit: () => void;
  autoFocus: boolean;
}

export function StepInput({ value, onChange, onValidSubmit, autoFocus }: StepInputProps) {
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // M8 (design.md §18.1 input 상태 "접근성 요구사항" — 검색창에 초기
    // 포커스) — M-fix-2: 이 컴포넌트는 consent 오버레이 아래 배경으로도
    // 계속 마운트되므로, 오버레이의 포커스 트랩과 경쟁하지 않도록 실제
    // "input" 스텝일 때만(autoFocus=true) 포커스를 이동한다.
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // AC-B2CDIAG-022 — 네이티브 maxLength는 사용자 타이핑에만 적용되고
    // 프로그램적 value 대입에는 적용되지 않으므로, 여기서도 명시적으로
    // 200자로 자른다.
    const next = event.target.value.slice(0, MAX_LENGTH);
    if (error) {
      setError(null);
    }
    onChange(next);
  };

  const handleChipClick = (text: string) => {
    if (error) {
      setError(null);
    }
    onChange(text.slice(0, MAX_LENGTH));
  };

  const handleSubmit = () => {
    const result = validateDiagnosisInput({ searchText: value });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
      return;
    }
    setError(null);
    onValidSubmit();
  };

  const canSubmit = value.trim().length > 0;

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center md:gap-7">
      <div className="flex flex-col items-center gap-3">
        <p className="text-body-s font-semibold text-bora-accent">
          놓치기 쉬운 보상 항목을 확인해 보세요
        </p>
        <h1 className="text-h1 font-bold text-bora-ink">이거, 보상 받을 수 있나요?</h1>
        <p className="max-w-xl text-body text-bora-ink-2">
          사고 경위나 진단명을 한 줄로 적어주세요. 입력하신 내용을 바탕으로 실손·정액
          담보·후유장해·배상책임에서 검토해 볼 보상 항목을 알려드립니다.
        </p>
      </div>

      {/* Desktop — Clock/Lock 2개 항목이 검색창 위에 별도로 표시된다. */}
      <div className="hidden items-center gap-4 text-body-s text-bora-ink-3 md:flex">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          회원가입 없이 약 1분
        </span>
        <span className="flex items-center gap-1.5">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          입력 내용은 보상 가능성 분석에만 사용됩니다
        </span>
      </div>

      <div className="flex w-full flex-col gap-1.5 text-left">
        <div className="flex w-full flex-col gap-2 md:flex-row md:items-stretch md:gap-3">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-bora-ink-4"
              aria-hidden="true"
            />
            <Input
              ref={inputRef}
              value={value}
              onChange={handleChange}
              maxLength={MAX_LENGTH}
              placeholder="예) 3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? SEARCH_ERROR_ID : undefined}
              className="h-12 rounded-[12px] border-app-line pl-10 text-sm focus-visible:border-bora-accent-line focus-visible:ring-bora-accent-line/25 md:h-14"
            />
          </div>
          <Button
            variant="diagnosis"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-12 w-full rounded-[12px] px-6 text-sm md:h-14 md:w-auto"
          >
            보상 진단
          </Button>
        </div>
        <span aria-live="polite" className="self-end text-meta text-bora-ink-3">
          {value.length} / {MAX_LENGTH}자
        </span>
        {error ? (
          <p id={SEARCH_ERROR_ID} role="alert" className="text-meta font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Notice title="입력 시 주의해 주세요" className="w-full text-left">
        이름·전화번호·주민등록번호 등 개인 식별정보는 입력하지 마세요.
      </Notice>

      {/* Mobile — Clock 항목 1개(결합 문구)가 안내 배너 아래로 이동한다. */}
      <span className="flex items-center gap-1.5 self-start text-meta text-bora-ink-3 md:hidden">
        <Clock className="size-3.5 shrink-0" aria-hidden="true" />
        회원가입 없이 약 1분 · 분석 목적으로만 사용
      </span>

      <div className="flex w-full flex-col items-start gap-2 md:flex-row md:items-center md:justify-center md:gap-2.5">
        <span className="shrink-0 text-body-s text-bora-ink-3">많이 찾는 사례</span>
        <div className="flex flex-wrap gap-2">
          {FREQUENT_CASES.map((text) => (
            <Chip key={text} onClick={() => handleChipClick(text)}>
              {text}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2 md:grid-cols-4">
        {CATEGORY_PREVIEWS.map(({ index, icon: Icon, title, description }) => (
          <Card key={title} className="ring-app-line">
            <CardHeader className="gap-2">
              <span className="flex items-center gap-2 text-bora-accent">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="text-meta font-medium text-bora-ink-4">{index}</span>
              </span>
              <CardTitle className="text-sm font-semibold text-bora-ink">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body-s text-bora-ink-3">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
