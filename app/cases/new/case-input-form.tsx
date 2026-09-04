"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// bare UI — 사건 입력 폼(SPEC-PILOT-VISUAL-001 M4, design.md §4 화면 01).
// 필드는 lib/validation/case-input.ts의 caseInputSchema와 그대로 매핑된다
// (주민등록번호/전화번호/상세주소/의료기록 원본 필드는 애초에 존재하지 않음).
// design.md §4의 "사건 개요" 패널(Header + Form Body + Footer) 구조를
// 재현하되, 4개 필드/검증/제출 가드/대기 상태 로직은 전혀 변경하지 않는다
// (design.md의 "비식별 확인 Check Row"는 현재 데이터 모델에 대응 상태가
// 없는 신규 필드라 REQ-011과 동일한 원칙으로 추가하지 않는다 — 우 레일
// Notice가 동일한 비식별 안내 역할을 대신한다).
export function CaseInputForm() {
  const router = useRouter();
  const [incidentDescription, setIncidentDescription] = useState("");
  const [diagnosisName, setDiagnosisName] = useState("");
  const [disabilityBodyPart, setDisabilityBodyPart] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // SPEC-UI-MIGRATION-001 Post-M8 Round2 (D3.5) — 개인정보 비식별 확인
  // 체크박스. 사용자 확인 UI일 뿐이며 선택 항목이다 — 제출을 막지 않고
  // 서버로 전송되지도 않는다(handleSubmit의 fetch body에 포함되지 않음).
  const [piiConfirmed, setPiiConfirmed] = useState(false);
  // SPEC-PILOT-UX-001 REQ-PILOT-UX-002/003 — 클라이언트 단일 흐름(single-flight)
  // 가드. handleSubmit 시작 시 동기적으로 설정되고, 실패(HTTP 비-201 또는
  // 네트워크 예외) 시에만 리셋된다 — 성공 시에는 유지되어(router.push로 곧
  // 언마운트되기 전까지) 재제출을 계속 막는다.
  const submitGuardRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitGuardRef.current) {
      return;
    }
    submitGuardRef.current = true;
    setFormError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          incidentDescription,
          diagnosisName,
          disabilityBodyPart,
          incidentDate,
        }),
      });

      if (response.status === 201) {
        const data = (await response.json()) as { caseId: string };
        router.push(`/cases/${data.caseId}`);
        return;
      }

      const data = (await response.json()) as {
        error?: string;
        fieldErrors?: Record<string, string[]>;
      };
      submitGuardRef.current = false;
      setFormError(data.error ?? "사건 입력을 저장하지 못했습니다.");
      setFieldErrors(data.fieldErrors ?? {});
    } catch {
      // 네트워크 수준 예외(fetch 자체가 reject) — REQ-PILOT-UX-014.
      // unhandled promise rejection으로 전파되지 않으며, 재제출이 허용된다.
      submitGuardRef.current = false;
      setFormError("네트워크 오류로 요청을 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[4px] bg-app-surface">
      <div className="flex flex-col gap-1 border-b border-app-line px-6 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-h2 font-semibold text-bora-ink">사건 정보 입력</h1>
          <Chip>필수 4개 항목</Chip>
        </div>
        <p className="text-body-s text-bora-ink-3">
          진단서·소견서에 기재된 표현을 그대로 입력할수록 쟁점 추출 정확도가 높아집니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} data-testid="case-input-form">
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label
                htmlFor="incidentDescription"
                className="text-body-s font-semibold text-bora-ink-2"
              >
                상해/질병 경위
              </Label>
              <span className="text-label-s text-bora-ink-4">육하원칙 중심 · 200자 내외 권장</span>
            </div>
            <Textarea
              id="incidentDescription"
              name="incidentDescription"
              required
              value={incidentDescription}
              onChange={(event) => setIncidentDescription(event.target.value)}
              disabled={isSubmitting}
              data-testid="case-incident-description"
              className="min-h-24 rounded-[4px] border-app-line bg-app-surface text-body text-bora-ink"
            />
            <p className="text-label-s text-bora-ink-4">
              치료 경과, 기왕증 유무, 사고 이전 유사 증상 여부를 함께 기재하면 반대 논리까지 함께
              검토됩니다.
            </p>
            {fieldErrors.incidentDescription?.map((message) => (
              <p key={message} className="text-sm text-bora-danger">
                {message}
              </p>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label
                  htmlFor="diagnosisName"
                  className="text-body-s font-semibold text-bora-ink-2"
                >
                  진단명
                </Label>
                <span className="text-label-s text-bora-ink-4">상병코드 포함 권장</span>
              </div>
              <Input
                id="diagnosisName"
                name="diagnosisName"
                required
                value={diagnosisName}
                onChange={(event) => setDiagnosisName(event.target.value)}
                disabled={isSubmitting}
                data-testid="case-diagnosis-name"
                className="rounded-[4px] border-app-line bg-app-surface text-body text-bora-ink"
              />
              <p className="text-label-s text-bora-ink-4">복수 진단 시 쉼표로 구분해 입력하세요.</p>
              {fieldErrors.diagnosisName?.map((message) => (
                <p key={message} className="text-sm text-bora-danger">
                  {message}
                </p>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label
                  htmlFor="disabilityBodyPart"
                  className="text-body-s font-semibold text-bora-ink-2"
                >
                  장해 부위
                </Label>
                <span className="text-label-s text-bora-ink-4">장해진단서 표기 그대로</span>
              </div>
              <Input
                id="disabilityBodyPart"
                name="disabilityBodyPart"
                required
                value={disabilityBodyPart}
                onChange={(event) => setDisabilityBodyPart(event.target.value)}
                disabled={isSubmitting}
                data-testid="case-disability-body-part"
                className="rounded-[4px] border-app-line bg-app-surface text-body text-bora-ink"
              />
              <p className="text-label-s text-bora-ink-4">복수 부위는 쉼표로 구분해 입력하세요.</p>
              {fieldErrors.disabilityBodyPart?.map((message) => (
                <p key={message} className="text-sm text-bora-danger">
                  {message}
                </p>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="incidentDate" className="text-body-s font-semibold text-bora-ink-2">
                사고·발병 일자
              </Label>
              <Input
                id="incidentDate"
                name="incidentDate"
                type="date"
                required
                value={incidentDate}
                onChange={(event) => setIncidentDate(event.target.value)}
                disabled={isSubmitting}
                data-testid="case-incident-date"
                className="w-fit rounded-[4px] border-app-line bg-app-surface text-body text-bora-ink"
              />
              <p className="text-label-s text-bora-ink-4">소멸시효·약관 버전 판별에 사용됩니다.</p>
              {fieldErrors.incidentDate?.map((message) => (
                <p key={message} className="text-sm text-bora-danger">
                  {message}
                </p>
              ))}
            </div>

            {/* SPEC-UI-MIGRATION-001 Post-M8 Round2 (D3.4) — 사고·발병 일자
                기준 자동 판별 안내. 신규 API/DB 조회 없이 순수 정적 안내
                텍스트만 표시한다. */}
            <div
              data-testid="incident-date-notice"
              className="flex gap-2.5 self-start rounded-[4px] bg-app-surface-inset px-3.5 py-3"
            >
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-bora-ink-3" />
              <div className="flex flex-col gap-1">
                <p className="text-body-s font-semibold text-bora-ink-2">
                  사고·발병 일자 기준 자동 판별
                </p>
                <p className="text-label-s text-bora-ink-4">
                  청구권 소멸시효 경과 여부, 해당 시점에 적용되는 약관 버전, 장해 평가 기준을 함께
                  대조합니다.
                </p>
              </div>
            </div>
          </div>

          {formError ? <p className="text-sm text-bora-danger">{formError}</p> : null}

          {/* SPEC-UI-MIGRATION-001 Post-M8 Round2 (D3.5) — 개인정보 비식별
              확인 체크박스. "(선택)"이며 제출을 막지 않고 서버로 전송되지도
              않는다(순수 사용자 확인용 로컬 state). */}
          <label className="flex items-start gap-2 text-body-s text-bora-ink-3">
            <input
              type="checkbox"
              checked={piiConfirmed}
              onChange={(event) => setPiiConfirmed(event.target.checked)}
              disabled={isSubmitting}
              data-testid="case-pii-confirm-checkbox"
              className="mt-0.5 size-4 shrink-0 rounded border-app-line"
            />
            <span>
              입력 전 확인 — 피보험자 성명·주민등록번호·연락처 등 개인 식별정보가 포함되지 않았는지
              확인했습니다. (선택)
            </span>
          </label>

          <div className="border-t border-app-line" />
        </div>

        <div className="flex items-center justify-between bg-app-surface-sub px-6 py-4">
          {isSubmitting ? (
            <span
              data-testid="case-pending-indicator"
              role="status"
              aria-live="polite"
              className="text-body-s text-bora-ink-3"
            >
              처리 중입니다. 잠시만 기다려 주세요...
            </span>
          ) : (
            <span className="text-body-s text-bora-ink-3">
              모든 필드를 입력한 뒤 제출해 주세요.
            </span>
          )}

          <div className="flex items-center gap-2">
            {/* SPEC-UI-MIGRATION-001 M6 (REQ-014) — 초안 저장 백엔드 로직
                없음. 비활성 렌더링 + "준비 중" Chip만 표시한다. */}
            <Button
              type="button"
              variant="outline"
              disabled
              data-testid="case-input-draft-save"
              className="rounded-[4px]"
            >
              임시 저장
              <Chip className="ml-1.5">준비 중</Chip>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="case-submit"
              className="rounded-[4px] bg-bora-accent px-5 text-white hover:bg-bora-accent-deep"
            >
              {isSubmitting ? "제출 중..." : "제출"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
