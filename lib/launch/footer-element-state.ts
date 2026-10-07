// SPEC-B2C-LAUNCH-001 M2: 푸터 요소 분류기 (REQ-B2CLAUNCH-015, AC-B2CLAUNCH-015 시나리오 1).

/** 푸터 요소의 상태 분류 넷. spec.md REQ-B2CLAUNCH-015가 적은 열거 그대로다. */
export const FOOTER_ELEMENT_STATES = ["목적지 있음", "# 앵커", "비활성 표시", "텍스트만"] as const;
export type FooterElementState = (typeof FOOTER_ELEMENT_STATES)[number];

interface AttributeReader {
  getAttribute(name: string): string | null;
}

/**
 * 렌더링된 푸터 요소를 속성만 보고 넷 중 하나로 분류한다.
 * - `aria-disabled="true"`이면 href가 있어도 `비활성 표시`다(비활성이 목적지보다 먼저다).
 * - href가 없으면 링크가 아니므로 `텍스트만`이다.
 * - href가 비었거나(공백 포함) 정확히 `#`이면 `# 앵커`다. 빈 값의 이름을 spec이 정하지 않아 목적지 없음 쪽으로 닫는다.
 * - 그 밖의 href는 `목적지 있음`이다. 이 분류기는 href가 가리키는 곳이 실제로 있는지·내용이 맞는지 보지 않는다.
 */
export function classifyFooterElement(element: AttributeReader): FooterElementState {
  if (element.getAttribute("aria-disabled") === "true") return "비활성 표시";

  const href = element.getAttribute("href");
  if (href === null) return "텍스트만";

  const trimmed = href.trim();
  return trimmed === "" || trimmed === "#" ? "# 앵커" : "목적지 있음";
}

/** 렌더링 결과에서 화면 라벨로 시작하는 링크 후보를 하나만 찾는다. 하나가 아니면 푸터 구조가 바뀐 것이므로 던진다. */
export function findFooterElement(root: ParentNode, label: string): Element {
  const matches = Array.from(root.querySelectorAll('a, [role="link"], span')).filter((element) =>
    (element.textContent ?? "").trim().startsWith(label)
  );
  if (matches.length !== 1) {
    throw new Error(
      `푸터에서 "${label}" 요소를 정확히 하나 찾지 못했다(찾은 수: ${matches.length})`
    );
  }
  return matches[0];
}
