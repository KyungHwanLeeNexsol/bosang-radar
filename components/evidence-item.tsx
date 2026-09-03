import { ExternalLink } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import type { EvidenceType, QueryIssueType } from "@/lib/pipeline/types";

// SPEC-PILOT-VISUAL-001 M3 (REQ-013) — Evidence Item 프레젠테이션 컴포넌트.
// design.md §3 "Evidence Item" 스펙(padding [13,0,13,16], 태그 행 + 타이틀
// 14/600 + 출처 행 11.5/500 ink-4 + "원문 보기" 링크 accent + 외부링크
// 아이콘)을 재현한다. app/cases/[caseId]/page.tsx의 renderEvidenceReference()
// 헬퍼가 사용한다. sourceUrl 링크의 target="_blank" rel="noopener noreferrer"
// 속성(AC-008)은 그대로 보존한다 — 이 컴포넌트는 lib/pipeline/types의
// 도메인 타입을 직접 다루므로 components/ui/(범용 shadcn 프리미티브)가
// 아닌 components/ 최상위에 위치한다.

interface EvidenceItemProps {
  title: string;
  sourceUrl: string | null;
  evidenceType: EvidenceType;
  issueTypes: QueryIssueType[];
  className?: string;
}

export function EvidenceItem({
  title,
  sourceUrl,
  evidenceType,
  issueTypes,
  className,
}: EvidenceItemProps) {
  return (
    <li className={cn("flex flex-col gap-1 border-l-2 border-app-line py-[13px] pl-4", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{evidenceType}</Chip>
        {issueTypes.map((issueType) => (
          <Chip key={issueType}>{issueType}</Chip>
        ))}
      </div>
      <p className="text-body font-semibold text-bora-ink">{title}</p>
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-[11.5px] font-medium text-bora-ink-4 hover:text-bora-accent"
        >
          원문 보기
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      ) : null}
    </li>
  );
}
