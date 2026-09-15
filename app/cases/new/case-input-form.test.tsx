// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseInputForm } from "./case-input-form";
import { CLIENT_POLL_INTERVAL_MS, CLIENT_POLL_MAX_ATTEMPTS } from "@/lib/cases/job-timing";

// SPEC-PILOT-UX-001 M3/M4 — case-input-form.tsx는 client component이므로
// react-dom/client로 직접 렌더링한다(@testing-library/react 미설치).

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fillField(input: HTMLElement, value: string) {
  // React의 onChange는 텍스트류 입력(input/textarea)에서 네이티브 "input"
  // 이벤트로 구동된다("change"가 아님 — select/checkbox/radio만 "change").
  const el = input as HTMLInputElement | HTMLTextAreaElement;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function click(el: Element) {
  // flushSync — 팝오버가 열리며 Portal로 새 DOM(달력)이 붙는 갱신은 다음
  // 줄에서 바로 querySelector로 찾아야 하므로, 커밋을 동기적으로 강제한다.
  flushSync(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

// DatePicker는 타이핑을 지원하지 않는 버튼 트리거다 — 값은 달력을 열고
// 월을 맞춘 뒤 해당 날짜 셀을 클릭해야만 채워진다. 팝오버는 Portal로
// document.body에 렌더링되므로 container가 아닌 document에서 찾는다.
function pickDate(container: HTMLElement, testId: string, isoDate: string) {
  const trigger = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!;
  click(trigger);

  const [, yearStr, monthStr] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)!;
  const targetYear = Number(yearStr);
  const targetMonth = Number(monthStr) - 1;

  for (let guard = 0; guard < 36; guard += 1) {
    const heading = Array.from(document.querySelectorAll("p")).find((p) =>
      /^\d{4}년 \d{1,2}월$/.test(p.textContent ?? "")
    );
    if (!heading) break;
    const [, shownYearStr, shownMonthStr] = /^(\d{4})년 (\d{1,2})월$/.exec(
      heading.textContent!.trim()
    )!;
    const shownYear = Number(shownYearStr);
    const shownMonth = Number(shownMonthStr) - 1;
    if (shownYear === targetYear && shownMonth === targetMonth) break;
    const forward =
      shownYear < targetYear || (shownYear === targetYear && shownMonth < targetMonth);
    const navButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === (forward ? "다음 달" : "이전 달")
    )!;
    click(navButton);
  }

  click(document.querySelector(`[data-testid="calendar-day-${isoDate}"]`)!);
}

function submitForm(container: HTMLElement) {
  // "제출" 버튼을 클릭하는 대신 form에 네이티브 submit 이벤트를 직접
  // dispatch한다. jsdom의 "submit 버튼 클릭 → form이 자동으로 submit
  // 이벤트를 낸다"는 활성화 동작이, 이 테스트에서 먼저 열고 닫는 Base UI
  // Popover(팝오버 콘텐츠는 Portal로 document.body에 별도로 렌더링됨)를
  // 거치고 나면 더 이상 신뢰할 수 없다(jsdom 자체의 한계 — 실제 브라우저와
  // React onSubmit 배선 자체는 이 파일 밖에서 별도로 확인했고 정상이다).
  // submit 이벤트를 직접 내면 그 활성화 동작 경로를 완전히 건너뛰고
  // <form onSubmit>이 실제로 호출되는지만 검증하므로, 이 테스트가 원래
  // 확인하려는 것(핸들러 로직)에는 차이가 없다.
  const form = container.querySelector("form");
  form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function fillAllFields(container: HTMLElement) {
  fillField(
    container.querySelector('[data-testid="case-incident-description"]')!,
    "계단에서 넘어짐"
  );
  fillField(container.querySelector('[data-testid="case-diagnosis-name"]')!, "발목 인대 파열");
  fillField(container.querySelector('[data-testid="case-disability-body-part"]')!, "발목");
  pickDate(container, "case-incident-date", "2026-01-15");
}

describe("app/cases/new/case-input-form — 대기 상태 + 단일 흐름 가드 + 네트워크 예외", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unhandledRejections: unknown[];
  let fetchMock: ReturnType<typeof vi.fn>;

  function onUnhandledRejection(event: PromiseRejectionEvent) {
    unhandledRejections.push(event.reason);
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    unhandledRejections = [];
    pushMock.mockReset();
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    act(() => {
      root.render(<CaseInputForm />);
    });
    fillAllFields(container);
  });

  afterEach(() => {
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("AC-014: '임시 저장' 버튼이 disabled 상태와 '준비 중' Chip을 가진 채로 존재하고 클릭해도 네트워크 요청이 없다", () => {
    const draftSaveButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="case-input-draft-save"]'
    );
    expect(draftSaveButton).not.toBeNull();
    expect(draftSaveButton?.disabled).toBe(true);
    expect(draftSaveButton?.textContent).toContain("준비 중");

    act(() => draftSaveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001: 제출이 대기 중이면 버튼 텍스트 변경과 별개로 시각적 진행 표시가 나타난다", async () => {
    const { promise } = deferred<Response>();
    fetchMock.mockReturnValue(promise);

    act(() => submitForm(container));

    const indicator = container.querySelector('[data-testid="case-pending-indicator"]');
    expect(indicator).not.toBeNull();
  });

  it("AC-002: 대기 상태에서는 네 개 입력 필드가 모두 disabled=true다", async () => {
    const { promise } = deferred<Response>();
    fetchMock.mockReturnValue(promise);

    act(() => submitForm(container));

    for (const testId of [
      "case-incident-description",
      "case-diagnosis-name",
      "case-disability-body-part",
      "case-incident-date",
    ]) {
      const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-testid="${testId}"]`
      );
      expect(el?.disabled).toBe(true);
    }
  });

  it("AC-003 (in-flight): 응답 전 연속 제출해도 fetch는 한 번만 호출된다", async () => {
    const { promise } = deferred<Response>();
    fetchMock.mockReturnValue(promise);

    act(() => {
      submitForm(container);
      submitForm(container);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-003 (post-success): 성공 제출 이후 재호출해도 fetch가 다시 호출되지 않는다", async () => {
    const response = {
      status: 201,
      json: () => Promise.resolve({ caseId: "case-1" }),
    } as Response;
    fetchMock.mockResolvedValue(response);

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/cases/case-1");

    act(() => submitForm(container));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("202 응답을 받으면 job 상태를 polling하고 완료된 case 페이지로 이동한다", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({
        status: 202,
        json: () => Promise.resolve({ jobId: "job-123" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "completed", caseId: "case-async" }),
      } as Response);

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/cases/status?jobId=job-123");
    expect(pushMock).toHaveBeenCalledWith("/cases/case-async");
  });

  it("SPEC-PILOT-READY-001 §Z: 예전 6분(180회) 상한을 지나도 계속 polling하고, 새 상한에서만 타임아웃을 안내한다", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({
        status: 202,
        json: () => Promise.resolve({ jobId: "job-slow" }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "processing" }),
      } as Response);

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
    });

    // 예전 고정 상한(180회×2초=6분)을 이미 지났어도 아직 타임아웃이 아니어야 한다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180 * CLIENT_POLL_INTERVAL_MS);
    });
    expect(container.textContent).not.toContain("분석이 예상보다 오래 걸리고 있습니다");

    // 새 상한까지 마저 진행하면 "실패"가 아니라 지연 안내 메시지가 뜨고,
    // 즉시 재제출을 유도하지 않는다.
    const remainingMs = (CLIENT_POLL_MAX_ATTEMPTS - 180) * CLIENT_POLL_INTERVAL_MS;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(remainingMs);
    });
    expect(container.textContent).toContain("분석이 예상보다 오래 걸리고 있습니다");
    expect(container.textContent).toContain("지금 다시 제출하지 말고");
  });

  it("AC-004: 실패(비-201) 후 재제출하면 fetch가 다시 호출된다", async () => {
    const failureResponse = {
      status: 400,
      json: () => Promise.resolve({ error: "검증 실패", fieldErrors: {} }),
    } as Response;
    fetchMock.mockResolvedValue(failureResponse);

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // jsdom + 컨트롤드 textarea/input이 disabled→재활성화 사이에 DOM value를
    // 보존하지 않는 테스트 환경 한계(실제 브라우저에서는 발생하지 않음)를
    // 우회하기 위해 재제출 전 필드를 다시 채운다 — 가드 리셋 자체(fetch
    // 재호출 여부)를 검증하는 이 AC의 취지와는 무관하다.
    act(() => fillAllFields(container));
    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("M3(readiness 항목 7 재정정): 서버가 409(이미 처리 중)를 반환하면 안내 메시지를 표시하고 즉시 재제출이 가능하도록 가드를 해제한다", async () => {
    const conflictResponse = {
      status: 409,
      json: () =>
        Promise.resolve({ error: "이미 처리 중인 요청이 있습니다. 잠시 후 다시 시도해 주세요." }),
    } as Response;
    fetchMock.mockResolvedValue(conflictResponse);

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("이미 처리 중인 요청이 있습니다");

    // 409 이후에도 submitGuardRef가 해제되어 재제출이 가능해야 한다(스턱 UI
    // 락 방지 — jsdom disabled/value 보존 한계 우회 사유는 AC-004 주석 참고).
    act(() => fillAllFields(container));
    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("AC-014 (네트워크 예외): fetch가 reject되면 사람이 읽을 수 있는 오류 메시지를 표시하고 unhandled rejection이 없다", async () => {
    fetchMock.mockRejectedValue(new TypeError("network error"));

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/오류|실패/);
    expect(unhandledRejections).toHaveLength(0);

    // 네트워크 예외 이후에도 재제출이 가능해야 한다(REQ-PILOT-UX-003 실패 시 리셋).
    // (필드 재입력 사유는 위 AC-004 주석 참고 — jsdom disabled/value 보존 한계 우회.)
    act(() => fillAllFields(container));
    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // SPEC-PILOT-LAUNCH-001 M2(REQ-PILOT-LAUNCH-003/004, AC-PILOT-LAUNCH-003/008)
  // — 파일럿 출시 전 사건 입력 화면 하단 안내 문구를 합성/비식별 데이터
  // 전용 지침 + 외부 AI 모델(Gemini) 전송 고지로 교체한다.
  it("REQ-PILOT-LAUNCH-003/004: 안내 문구가 합성/비식별 지침과 전송 고지로 교체되고 소요시간 안내는 그대로 유지된다", () => {
    const notice = container.querySelector('[data-testid="case-input-footer-notice"]')!;
    expect(notice.textContent).not.toContain(
      "입력 내용은 비식별 상태로 처리되며 리서치 목적 외에 사용되지 않습니다."
    );
    expect(notice.textContent).toContain("합성이거나 이미 비식별화된 사례만 입력해 주세요.");
    expect(notice.textContent).toContain(
      "입력한 정보는 AI 분석을 위해 외부 AI 모델 제공자(Google Gemini)에 전송됩니다."
    );
    expect(notice.textContent).toContain("평균 소요 시간 3~5분");
  });
});
