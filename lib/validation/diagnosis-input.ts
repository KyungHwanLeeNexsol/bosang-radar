import { z } from "zod";

// SPEC-B2C-DIAGNOSIS-001 M3 (REQ-B2CDIAG-020) — 01 화면 검색어 단일 필드 검증
// 스키마. lib/validation/case-input.ts의 정규식 "패턴 스타일"만 참고했을 뿐
// import는 하지 않는다(design.md §4) — case-input.ts는 사건 접수용 필드
// 집합(주소·의료기록 등)을 다루는 다른 형태의 스키마이기 때문이다.
//
// 검증은 2단계로 나뉜다:
// (1) 자동 차단 — 전화번호·주민등록번호 형식만 정규식으로 구조적으로 거부한다.
//     두 패턴은 형식이 명확해 오탐 없이 신뢰성 있게 판별할 수 있다.
// (2) 안내만 제공 — 이름·주소 등 그 외 개인식별정보는 정규식으로 신뢰성 있게
//     판별할 수 없어(오탐 불가피) 구조적으로 거부하지 않는다. 대신 UI의
//     notice.tsx 경고 배너로 안내만 제공한다(입력 차단 없음).

// 주민등록번호 형식: 6자리-7자리(하이픈 선택) 또는 13자리 연속 숫자.
const RESIDENT_REGISTRATION_NUMBER_PATTERN = /\d{6}-?\d{7}/;

// 전화번호 형식: 01[0/1/6/7/8/9]로 시작, 하이픈 선택.
const PHONE_NUMBER_PATTERN = /01[016789]-?\d{3,4}-?\d{4}/;

export const diagnosisInputSchema = z
  .object({
    searchText: z
      .string()
      .min(1, "검색어를 입력해 주세요.")
      .max(200, "검색어는 200자 이내로 입력해 주세요.")
      .refine((value) => !PHONE_NUMBER_PATTERN.test(value), {
        message: "전화번호 형식의 값은 입력할 수 없습니다.",
      })
      .refine((value) => !RESIDENT_REGISTRATION_NUMBER_PATTERN.test(value), {
        message: "주민등록번호 형식의 값은 입력할 수 없습니다.",
      }),
  })
  .strict();

export type DiagnosisInput = z.infer<typeof diagnosisInputSchema>;

// 01 화면 "보상 진단" 클릭 시 사용할 단일 검증 엔트리 포인트.
export function validateDiagnosisInput(input: unknown) {
  return diagnosisInputSchema.safeParse(input);
}
