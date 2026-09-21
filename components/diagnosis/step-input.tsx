"use client";

import * as React from "react";
import {
  Clock,
  Layers,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
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
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    // M8 (design.md §18.1 input 상태 "접근성 요구사항" — 검색창에 초기
    // 포커스) — M-fix-2: 이 컴포넌트는 consent 오버레이 아래 배경으로도
    // 계속 마운트되므로, 오버레이의 포커스 트랩과 경쟁하지 않도록 실제
    // "input" 스텝일 때만(autoFocus=true) 포커스를 이동한다.
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    // AC-B2CDIAG-022 — 네이티브 maxLength는 사용자 타이핑에만 적용되고
    // 프로그램적 value 대입에는 적용되지 않으므로, 여기서도 명시적으로
    // 200자로 자른다.
    const next = event.target.value.slice(0, MAX_LENGTH);
    if (error) {
      setError(null);
    }
    onChange(next);
  };

  // D2(5차 재작업) — design/exports/M01의 검색창은 실제로 2줄 높이(약
  // 95px)이고 placeholder도 줄바꿈된다. "한 줄로 적어주세요" 안내
  // 문구와의 의미 일치를 위해 Enter 키로 줄바꿈이 생기지 않도록 막는다
  // (제출은 기존처럼 버튼 클릭만 — Enter-투-submit은 이전에도 없었으므로
  // 새로 추가하지 않는다).
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
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
    // D2(4차 재작업) — design/exports/01(1440×940) 세그먼트 재실측: 첫
    // 콘텐츠(부제) 상단 y≈154(헤더 63px 기준 pt-[91px]). M01(390×1110)은
    // y≈82(헤더 59px 기준 pt-[23px]). 폭(max-w-3xl=768px)은 실측 p90(758)과
    // 이미 근접해 유지한다.
    // D2(5차 재작업) — 4차의 균일한 gap(mobile gap-5/desktop gap-8)은
    // 디자인의 실제 요소 간 간격(17~55px로 요소쌍마다 크게 다름)과
    // 맞지 않아 안내 배너/칩 행/카드 행/푸터가 디자인보다 수십 px
    // 아래로 처짐이 확인됐다(_tmp-full-measure-result.json vs
    // _tmp-design-blocks.json 실측 대조). 부모 gap을 없애고 자식마다
    // 디자인 세그먼트 간격에서 역산한 개별 margin-top으로 대체한다.
    // D2(7차) — design/exports/M01은 히어로(부제·제목·설명)가 화면 좌측에
    // 정렬돼 있다(x≈20). 6차까지는 Desktop의 중앙 정렬을 Mobile에도 그대로
    // 적용해 부제 좌표가 디자인보다 78px 어긋나 있었다.
    <div className="flex w-full max-w-md flex-col items-start pt-[20px] text-left md:max-w-[762px] md:items-center md:pt-[87px] md:text-center">
      {/* D2(7차) — 히어로 3요소의 간격은 폭마다 다르므로 공통 gap 대신
          요소별 margin-top으로 디자인 실측 간격을 직접 재현한다. */}
      <div className="flex flex-col items-start gap-0 md:items-center">
        <p
          data-testid="diagnosis-hero-subtitle"
          className="text-body-s font-semibold text-bora-accent md:text-[14px]"
        >
          놓치기 쉬운 보상 항목을 확인해 보세요
        </p>
        {/* D2(7차) — Pretendard를 실제로 로드한 뒤 동일 문자열의 잉크 폭을
            재측정해 디자인의 글자 크기를 역산했다(Desktop 제목 40px). Mobile은
            design/exports/M01처럼 "이거, 보상 받을 수" / "있나요?"로 2줄
            줄바꿈되도록 폭을 제한한다. */}
        <h1
          data-testid="diagnosis-hero-title"
          className="mt-[7px] max-w-[200px] text-[28px] font-bold text-bora-ink md:mt-[11px] md:max-w-none md:text-[40px]"
        >
          이거, 보상 받을 수 있나요?
        </h1>
        {/* D2(7차) — design/exports/M01의 설명 문구는 Desktop(01)보다 짧다
            ("입력하신 내용을 바탕으로"·"보상"이 빠진 2줄). 같은 문구를 좁은
            폭에 넣으면 3줄이 되어 이후 요소가 전부 아래로 밀린다. 로딩 화면
            설명과 동일한 반응형 분리 방식을 쓴다(`hidden`은 display:none
            이므로 접근성 트리에는 보이는 쪽만 노출된다). */}
        <p
          data-testid="diagnosis-hero-description"
          className="mt-[7px] text-[14.35px] leading-[24px] text-bora-ink-2 md:hidden"
        >
          {/* 줄바꿈 지점은 디자인과 정확히 일치해야 하므로 자동 줄바꿈에
              맡기지 않고 명시적으로 끊는다. */}
          사고 경위나 진단명을 한 줄로 적어주세요. 실손 · 정액 담보 ·
          <br /> 후유장해 · 배상책임에서 검토해 볼 항목을 알려드립니다.
        </p>
        {/* D2(8차) — 7차는 줄 "수"(2줄)만 검사해서, 실제 줄바꿈 지점이
            "…바탕으로 실손 · 정액 담보 · 후유" / "장해 · …"로 단어 한가운데가
            끊기고 있던 것을 통과시켰다. design/exports/01은 "…바탕으로" 뒤에서
            끊긴다 — Mobile 설명과 같은 방식으로 명시적 줄바꿈을 둔다. */}
        {/* D2(8차) — 글자 크기도 함께 틀려 있었다. 7차는 이 문단이
            max-w-[496px]에 꽉 차서 폭이 디자인(496)과 "우연히" 일치했고,
            그 일치가 글자 크기 오차를 가렸다. 명시적 줄바꿈으로 폭 고정이
            풀리자 둘째 줄 실측이 432px로 드러났다 — 디자인 496px에 맞추려면
            14px가 아니라 16.07px다. max-w는 줄바꿈을 br이 책임지므로 폭을
            다시 고정하지 않도록 넉넉히 둔다. */}
        <p
          data-testid="diagnosis-hero-description"
          className="hidden text-bora-ink-2 md:mt-[15px] md:block md:max-w-[560px] md:text-[16.07px]"
        >
          사고 경위나 진단명을 한 줄로 적어주세요. 입력하신 내용을 바탕으로
          <br /> 실손 · 정액 담보 · 후유장해 · 배상책임에서 검토해 볼 보상 항목을 알려드립니다.
        </p>
      </div>

      {/* Desktop — Clock/Lock 2개 항목이 검색창 위에 별도로 표시된다. */}
      <div
        data-testid="diagnosis-trust-row"
        className="hidden items-center gap-4 text-body-s text-bora-ink-3 md:mt-[30px] md:flex"
      >
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          회원가입 없이 약 1분
        </span>
        <span className="flex items-center gap-1.5">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          입력 내용은 보상 가능성 분석에만 사용됩니다
        </span>
      </div>

      {/* D2(6차 재작업) — 디자인·구현 캡처를 동일 크기로 맞춰 동일
          ink-pixel 세그먼트로 직접 비교한 결과, Mobile(M01)의 검색
          영역~카드~푸터 사이 모든 간격이 균일 mt-5(20px)로는 디자인과
          맞지 않았다(검색창 y=253 vs 목표266, 카드 top 누적 Δ21~26,
          푸터 하단이 디자인(y≈1054)보다 66px 아래). 개별 값으로
          재조정한다. 카운터도 디자인처럼 검색창 바로 아래·CTA 위에
          위치하도록 DOM 순서를 옮긴다(Desktop은 결합 컨트롤 유지를
          위해 md:hidden으로 접고, 기존 위치의 desktop 전용 카운터를
          별도로 둔다). */}
      <div className="mt-[24px] flex w-full flex-col gap-1.5 text-left md:mt-[12px]">
        {/* D2(5차 재작업) — design/exports/01은 검색 영역과 CTA가 하나의
            결합된 컨트롤처럼 보인다(간격 없이 맞닿고, 바깥쪽 모서리만
            radius). Desktop에서 md:gap-0 + 안쪽 모서리 radius 제거로
            재현한다. Mobile은 세로 스택 유지(디자인도 세로 배치). */}
        <div
          data-testid="diagnosis-search-row"
          className="flex w-full flex-col gap-2 md:flex-row md:items-stretch md:gap-0"
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-bora-ink-4 md:top-4"
              aria-hidden="true"
            />
            {/* D2(5차 재작업) — design/exports/M01의 검색창은 실제로 2줄
                높이(~95px)이고 placeholder도 줄바꿈된다. `<textarea>`로
                교체해 재현한다(4차에서 D1 테스트 충돌로 보류했던 사항 —
                이번 라운드는 "D1 테스트 selector를 의미 기반으로
                리팩터링하는 것은 허용"이라는 명시적 지시에 따라 재시도).
                data-testid로 테스트에서 안정적으로 조회한다. */}
            <Textarea
              ref={inputRef}
              data-testid="diagnosis-search-textbox"
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              maxLength={MAX_LENGTH}
              rows={2}
              placeholder="예) 3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? SEARCH_ERROR_ID : undefined}
              // field-sizing-content(Textarea 기본, 콘텐츠에 맞춰 자동
              // 높이 조절)를 꺼서 고정 높이가 실제로 적용되게 한다.
              className="h-[95px] resize-none rounded-[12px] rounded-b-none border-app-line pt-3.5 pl-10 text-sm [field-sizing:fixed] focus-visible:border-bora-accent-line focus-visible:ring-bora-accent-line/25 md:h-[76px] md:rounded-b-[12px] md:rounded-r-none md:border-r-0 md:py-5 md:pt-5 md:text-base"
            />
          </div>
          {/* D2(6차 재작업) — Mobile 전용 카운터: 디자인은 검색창과 CTA
              사이에 카운터가 위치한다. Desktop은 결합 컨트롤(검색창+CTA가
              한 행)을 유지해야 하므로 이 위치의 카운터는 md:hidden으로
              접고, 기존 desktop 카운터(행 바깥)를 그대로 둔다. */}
          {/* D2(6차 재작업 2차 보정) — 1차 시도(mt-11)는 CTA가 디자인보다
              27px 아래로 처지게 만들었다(실측 기반 재조정). */}
          <span aria-live="polite" className="self-end text-meta text-bora-ink-3 md:hidden">
            {value.length} / {MAX_LENGTH}자
          </span>
          <Button
            data-testid="diagnosis-submit-cta"
            variant="diagnosis"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="-mt-[1px] h-12 w-full rounded-[12px] rounded-t-none px-6 text-sm md:mt-0 md:h-[76px] md:w-auto md:rounded-t-[12px] md:rounded-l-none md:px-8 md:text-base"
          >
            보상 진단
          </Button>
        </div>
        <span aria-live="polite" className="hidden self-end text-meta text-bora-ink-3 md:inline">
          {value.length} / {MAX_LENGTH}자
        </span>
        {error ? (
          <p id={SEARCH_ERROR_ID} role="alert" className="text-meta font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {/* D2(7차) — design/exports/01·M01의 주의 배너에는 "입력 시 주의해
          주세요"라는 제목 줄이 없다. 강조(앰버·굵게)되는 부분은 문장 앞
          절("이름 · 전화번호 · 주민등록번호 등")이고 나머지가 본문이다 —
          Notice의 title/children 슬롯을 디자인 그대로 나눠 쓴다. */}
      {/* D2(9차) — design/exports/01·M01의 주의 배너 아이콘은 Notice 기본값인
          삼각형 경고(AlertTriangle)가 아니라 느낌표가 들어간 방패
          (ShieldAlert)다. Notice는 이 화면 밖에서도 쓰이는 공유 컴포넌트라
          기본 아이콘은 그대로 두고, 진단 호출부에서 icon prop으로만
          덮어쓴다(다른 소비자에게 영향 없음). */}
      <Notice
        data-testid="diagnosis-notice"
        icon={<ShieldAlert className="size-4" />}
        title="이름 · 전화번호 · 주민등록번호 등"
        className="mt-[17px] w-full text-left md:mt-[1px] md:px-5 md:py-[11px]"
      >
        개인 식별정보는 입력하지 마세요
      </Notice>

      {/* Mobile — Clock 항목 1개(결합 문구)가 안내 배너 아래로 이동한다. */}
      <span className="mt-[14px] flex items-center gap-1.5 self-start text-meta text-bora-ink-3 md:hidden">
        <Clock className="size-3.5 shrink-0" aria-hidden="true" />
        회원가입 없이 약 1분 · 분석 목적으로만 사용
      </span>

      <div
        data-testid="diagnosis-chip-row"
        className="mt-[18px] flex w-full flex-col items-start gap-2 md:mt-[29px] md:flex-row md:items-center md:justify-center md:gap-2.5"
      >
        <span className="shrink-0 text-body-s text-bora-ink-3 md:text-base">많이 찾는 사례</span>
        <div className="flex flex-wrap gap-2 md:gap-2.5">
          {FREQUENT_CASES.map((text) => (
            <Chip
              key={text}
              className="px-[7px] py-[8px] text-[10.5px] md:px-2.5 md:py-1.5 md:text-[13.5px]"
              onClick={() => handleChipClick(text)}
            >
              {text}
            </Chip>
          ))}
        </div>
      </div>

      {/* D2(5차 재작업) — design/exports/01(Desktop) 카드는 아이콘+번호
          행/제목/설명 3단 구조(102px 실측)지만, design/exports/M01
          (Mobile) 카드는 아이콘+제목이 같은 첫 행, 설명이 둘째 행인 2단
          구조(62px 실측)로 구조 자체가 다르다 — 번호(index)도 Mobile
          export에는 보이지 않는다. 반응형 클래스만으로는 이 구조 차이를
          표현할 수 없어 Mobile 전용 마크업을 별도로 둔다(Desktop 구조는
          기존 그대로 유지). */}
      {/* Mobile 전용 — 아이콘+제목 한 행, 설명 다음 행, 번호 숨김. */}
      <div
        data-testid="diagnosis-card-grid"
        className="mt-[23px] flex w-full flex-col gap-2 text-left md:hidden"
      >
        {CATEGORY_PREVIEWS.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="flex flex-col gap-0.5 rounded-xl bg-card px-4 py-2.5 text-card-foreground ring-1 ring-app-line"
          >
            <span className="flex items-center gap-2 text-bora-ink">
              <Icon className="size-4 shrink-0 text-bora-accent" aria-hidden="true" />
              <span className="text-sm font-semibold">{title}</span>
            </span>
            <p className="text-body-s text-bora-ink-3">{description}</p>
          </div>
        ))}
      </div>
      {/* Desktop 전용 — 기존 아이콘+번호/제목/설명 3단 구조 유지. */}
      <div
        data-testid="diagnosis-card-grid"
        className="hidden w-full grid-cols-4 gap-4 text-left md:mt-[49px] md:grid"
      >
        {CATEGORY_PREVIEWS.map(({ index, icon: Icon, title, description }) => (
          <Card key={title} className="gap-1.5 py-4 ring-app-line [--card-spacing:14px]">
            <CardHeader className="gap-1.5">
              <span className="flex items-center gap-2 text-bora-accent">
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="text-meta font-medium text-bora-ink-4">{index}</span>
              </span>
              <CardTitle className="text-[15px] font-semibold text-bora-ink">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[12px] text-bora-ink-3">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
