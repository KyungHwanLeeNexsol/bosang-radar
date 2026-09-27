// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsultChannelSelector } from "./consult-channel-selector";
import type { ConsultationChannel } from "@/lib/consult/types";

// SPEC-B2C-CONSULT-001 M4 (design.md §2, REQ-B2CCONSULT-004/010; acceptance
// AC-B2CCONSULT-010) — 카카오톡/전화 라디오 선택. 네이티브 <input
// type="radio">를 같은 name으로 그룹화해 방향키 탐색을 브라우저 기본 동작에
// 위임한다(design.md §11 "라디오는 방향키").

function Harness({
  initialValue = "kakao",
  onChange,
}: {
  initialValue?: ConsultationChannel;
  onChange: (channel: ConsultationChannel) => void;
}) {
  const [value, setValue] = React.useState<ConsultationChannel>(initialValue);
  return (
    <ConsultChannelSelector
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("components/consult/ConsultChannelSelector", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("카카오톡·전화 두 라디오가 렌더링되고 동일 name으로 그룹화된다", () => {
    act(() => {
      root.render(<Harness onChange={vi.fn()} />);
    });

    const radios = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    );
    expect(radios).toHaveLength(2);
    expect(radios[0].name).toBe(radios[1].name);
    expect(radios[0].name.length).toBeGreaterThan(0);
  });

  it("value=kakao일 때 카카오 라디오만 체크되어 있다", () => {
    act(() => {
      root.render(<Harness initialValue="kakao" onChange={vi.fn()} />);
    });

    const kakaoRadio = container.querySelector<HTMLInputElement>('input[value="kakao"]');
    const phoneRadio = container.querySelector<HTMLInputElement>('input[value="phone"]');
    expect(kakaoRadio?.checked).toBe(true);
    expect(phoneRadio?.checked).toBe(false);
  });

  it("전화 라디오를 클릭하면 onChange('phone')가 호출되고 체크 상태가 바뀐다", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<Harness onChange={onChange} />);
    });

    const phoneRadio = container.querySelector<HTMLInputElement>('input[value="phone"]');
    act(() => {
      phoneRadio?.click();
    });

    expect(onChange).toHaveBeenCalledWith("phone");
    expect(
      container.querySelector<HTMLInputElement>('input[value="phone"]')?.checked
    ).toBe(true);
  });

  it("카카오 채널 선택 시 안내 문구는 '카카오톡으로 상담 내용을 안내'를 포함한다", () => {
    act(() => {
      root.render(<Harness initialValue="kakao" onChange={vi.fn()} />);
    });

    expect(container.textContent).toContain("카카오톡으로 상담 내용을 안내");
  });

  it("전화 채널 선택 시 안내 문구는 특정 시간을 약속하지 않는 중립 표현이다(design.md §1 D6)", () => {
    act(() => {
      root.render(<Harness initialValue="phone" onChange={vi.fn()} />);
    });

    expect(container.textContent).toContain("접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다");
    expect(container.textContent).not.toContain("영업일 기준 1일 이내");
  });
});
