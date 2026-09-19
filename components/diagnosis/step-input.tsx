"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { validateDiagnosisInput } from "@/lib/validation/diagnosis-input";

// SPEC-B2C-DIAGNOSIS-001 M3 (design.md §2, §4) — 01/M01 화면: 검색창 + "많이
// 찾는 사례" 칩 + 200자 카운터 + PII 안내 배너. 검증 실패 시 다음 단계(동의)
// 진행을 차단하고 인라인 오류를 표시한다(REQ-B2CDIAG-020, AC-B2CDIAG-019).
// value/onChange는 부모(diagnosis-flow.tsx)의 reducer 상태를 그대로
// controlled로 전달받는다(design.md §5 — 상태는 diagnosis-flow.tsx 한 곳에만
// 존재).

const MAX_LENGTH = 200;
const SEARCH_ERROR_ID = "diagnosis-search-error";

// design.md §3 — "많이 찾는 사례" 칩 예시 목록.
const FREQUENT_CASES = ["교통사고", "계단에서 낙상", "실손 진단서 반려", "후유장해 등급"] as const;

interface StepInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidSubmit: () => void;
}

export function StepInput({ value, onChange, onValidSubmit }: StepInputProps) {
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // M8 (design.md §18.1 input 상태 "접근성 요구사항" — 검색창에 초기
    // 포커스) — 키보드 전용 플로우의 시작점이 마운트 직후 검색창이 되도록
    // 명시적으로 포커스를 이동한다.
    inputRef.current?.focus();
  }, []);

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
    <div className="flex w-full max-w-md flex-col gap-4">
      <h1 className="text-h2 font-semibold text-bora-ink">어떤 사고였나요?</h1>

      <div className="flex flex-col gap-1.5">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          maxLength={MAX_LENGTH}
          placeholder="예: 계단에서 넘어져 발목을 다쳤어요"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? SEARCH_ERROR_ID : undefined}
        />
        <span aria-live="polite" className="text-meta text-bora-ink-3">
          {value.length} / {MAX_LENGTH}자
        </span>
        {error ? (
          <p id={SEARCH_ERROR_ID} role="alert" className="text-meta font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {FREQUENT_CASES.map((text) => (
          <Chip
            key={text}
            role="button"
            tabIndex={0}
            onClick={() => handleChipClick(text)}
            className="cursor-pointer"
          >
            {text}
          </Chip>
        ))}
      </div>

      <Notice title="입력 시 주의해 주세요">
        이름·전화번호 등 개인 식별정보는 입력하지 마세요.
      </Notice>

      <Button onClick={handleSubmit} disabled={!canSubmit}>
        보상 진단
      </Button>
    </div>
  );
}
