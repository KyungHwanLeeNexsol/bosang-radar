import { z } from "zod";

// 사건 입력 검증 스키마 (REQ-SCAFFOLD-012, AC-SCAFFOLD-011)
//
// 이 검증은 CaseNormalizer 호출 이전, 즉 app/api/cases/ route handler(M4/M5
// 예정)의 진입점에서 실행되어야 한다 — 아직 route handler는 존재하지 않으며
// (M3 범위 밖), 이 파일은 스키마와 검증 엔트리 포인트만을 제공한다.
//
// 주민등록번호·전화번호는 정규식으로 형식이 명확히 정의되어 있어 구조적으로
// 거부(reject)할 수 있다. 반면 상세주소·의료기록 원본은 자유 형식 텍스트라서
// 정규식으로 안정적으로 걸러내기 어렵다(research.md §6-D9, plan-audit
// iteration 2 피드백). 이 두 카테고리는 정규식 대신 field-omission 방식을
// 채택한다 — 스키마에 해당 필드를 아예 정의하지 않고, .strict()로 스키마에
// 없는 키(address, medicalRecordRaw 등)를 구조적으로 거부한다.

// 주민등록번호 형식: 6자리-7자리(하이픈 선택) 또는 13자리 연속 숫자.
const RESIDENT_REGISTRATION_NUMBER_PATTERN = /\d{6}-?\d{7}/;

// 전화번호 형식: 01[0/1/6/7/8/9]로 시작, 하이픈 선택.
const PHONE_NUMBER_PATTERN = /01[016789]-?\d{3,4}-?\d{4}/;

function piiFreeText(fieldLabel: string) {
  return z
    .string()
    .min(1, `${fieldLabel}은(는) 비어 있을 수 없습니다.`)
    .refine((value) => !RESIDENT_REGISTRATION_NUMBER_PATTERN.test(value), {
      message: `${fieldLabel}에 주민등록번호 형식의 값을 포함할 수 없습니다.`,
    })
    .refine((value) => !PHONE_NUMBER_PATTERN.test(value), {
      message: `${fieldLabel}에 전화번호 형식의 값을 포함할 수 없습니다.`,
    });
}

// 사건 입력 스키마. .strict()로 여기에 정의되지 않은 키(예: address,
// medicalRecordRaw)가 포함되면 검증이 구조적으로 실패한다.
export const caseInputSchema = z
  .object({
    incidentDescription: piiFreeText("상해/질병 경위"),
    diagnosisName: piiFreeText("진단명"),
    disabilityBodyPart: piiFreeText("장해 부위"),
    incidentDate: z.string().min(1, "사고/발병 일자는 비어 있을 수 없습니다."),
  })
  .strict();

export type CaseInput = z.infer<typeof caseInputSchema>;

// route handler 진입점(M4/M5)에서 사용할 단일 검증 엔트리 포인트.
export function validateCaseInput(input: unknown) {
  return caseInputSchema.safeParse(input);
}
