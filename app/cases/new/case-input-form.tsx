"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// bare UI — 사건 입력 폼(M5, design.md §2). 필드는
// lib/validation/case-input.ts의 caseInputSchema와 그대로 매핑된다
// (주민등록번호/전화번호/상세주소/의료기록 원본 필드는 애초에 존재하지 않음).
export function CaseInputForm() {
  const router = useRouter();
  const [incidentDescription, setIncidentDescription] = useState("");
  const [diagnosisName, setDiagnosisName] = useState("");
  const [disabilityBodyPart, setDisabilityBodyPart] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>사건 입력</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="case-input-form">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="incidentDescription">상해/질병 경위</Label>
            <Textarea
              id="incidentDescription"
              name="incidentDescription"
              required
              value={incidentDescription}
              onChange={(event) => setIncidentDescription(event.target.value)}
              disabled={isSubmitting}
              data-testid="case-incident-description"
            />
            {fieldErrors.incidentDescription?.map((message) => (
              <p key={message} className="text-sm text-destructive">
                {message}
              </p>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="diagnosisName">진단명</Label>
            <Input
              id="diagnosisName"
              name="diagnosisName"
              required
              value={diagnosisName}
              onChange={(event) => setDiagnosisName(event.target.value)}
              disabled={isSubmitting}
              data-testid="case-diagnosis-name"
            />
            {fieldErrors.diagnosisName?.map((message) => (
              <p key={message} className="text-sm text-destructive">
                {message}
              </p>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="disabilityBodyPart">장해 부위</Label>
            <Input
              id="disabilityBodyPart"
              name="disabilityBodyPart"
              required
              value={disabilityBodyPart}
              onChange={(event) => setDisabilityBodyPart(event.target.value)}
              disabled={isSubmitting}
              data-testid="case-disability-body-part"
            />
            {fieldErrors.disabilityBodyPart?.map((message) => (
              <p key={message} className="text-sm text-destructive">
                {message}
              </p>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="incidentDate">사고/발병 일자</Label>
            <Input
              id="incidentDate"
              name="incidentDate"
              type="date"
              required
              value={incidentDate}
              onChange={(event) => setIncidentDate(event.target.value)}
              disabled={isSubmitting}
              data-testid="case-incident-date"
            />
            {fieldErrors.incidentDate?.map((message) => (
              <p key={message} className="text-sm text-destructive">
                {message}
              </p>
            ))}
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          {isSubmitting ? (
            <span
              data-testid="case-pending-indicator"
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              처리 중입니다. 잠시만 기다려 주세요...
            </span>
          ) : null}

          <Button type="submit" disabled={isSubmitting} data-testid="case-submit">
            {isSubmitting ? "제출 중..." : "제출"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
