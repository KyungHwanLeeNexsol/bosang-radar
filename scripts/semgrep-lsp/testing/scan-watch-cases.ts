// 시험 전용: LSP-SCAN-1 실시간 감시기(lsp-scan-watch.ts)를 JSON 대본으로 먹이는 조립기. 실제 Semgrep이 아니다.
// 같은 대본을 PowerShell 러너의 감시 구현에도 먹여 골든 대조(TS ↔ PowerShell)를 만들 수 있도록 순수 JSON 값만 만든다.
//
// 시각 설계(ms): 서두 100 → 초기화 응답 200 → initialized 300 → 장벽 프레임 600 · 줄 650 → 장벽 끝 700 → didOpen 1000 → 진단 1400 · 엔진 로그 1500.

import type { ScanWatchConfigJson, ScanWatchEvent, ScanWatchScript } from "../lsp-scan-watch";
import { LSP_SCAN_LIMITS, scanTargetUri } from "../lsp-scan";
import { probePathOf } from "../lsp-rules";
import {
  barrierStdoutMessages,
  bytesOf,
  frames,
  goodNotification,
  scanLay,
  scanStderrParts,
} from "./scan-fixtures";
import { preambleLines } from "./rules-fixtures";

export const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export const watchConfig = (over: Partial<ScanWatchConfigJson> = {}): ScanWatchConfigJson => ({
  workspace: scanLay.workspace,
  expectedTargetUri: scanTargetUri(scanLay),
  probePath: probePathOf(scanLay),
  scanMs: LSP_SCAN_LIMITS.scanMs,
  settleMs: LSP_SCAN_LIMITS.settleMs,
  maxStdoutBytes: LSP_SCAN_LIMITS.maxStdoutBytes,
  ...over,
});

/** 한 덩어리를 `size` 바이트씩 잘라 같은 시각의 이벤트 여러 개로 만든다(size 가 없으면 한 덩어리). */
export function chunked(
  op: "stdout" | "stderr",
  bytes: Uint8Array,
  tMs: number,
  size?: number
): ScanWatchEvent[] {
  if (size === undefined || size >= bytes.byteLength) return [{ op, hex: toHex(bytes), tMs }];
  const out: ScanWatchEvent[] = [];
  for (let at = 0; at < bytes.byteLength; at += size) {
    out.push({ op, hex: toHex(bytes.subarray(at, at + size)), tMs });
  }
  return out;
}

export interface HappyOptions {
  /** 청크 크기(모든 조각에 적용). */
  chunkSize?: number;
  diagAtMs?: number;
  logAtMs?: number;
  didOpenAtMs?: number;
  /** 사후 stderr 줄을 바꾼다(줄 목록). */
  post?: string[];
  /** 사후 stdout 메시지를 바꾼다. */
  postMessages?: Parameters<typeof frames>[0];
  /** 진단/로그 도착 순서를 바꾼다(기본은 진단 먼저, 같은 시각이면 목록 순서). */
  logFirst?: boolean;
  pre?: string[];
}

/** 정상 경로의 감시 대본(장벽까지 + didOpen 이후). 마지막 이벤트는 로그 묶음 완성 뒤의 나머지 덤프 조각이다. */
export function happyWatchScript(o: HappyOptions = {}): ScanWatchScript {
  const parts = scanStderrParts();
  const pre = o.pre ?? parts.pre;
  const post = o.post ?? parts.post;
  const diagAt = o.diagAtMs ?? 1400;
  const logAt = o.logAtMs ?? 1500;
  const didOpenAt = o.didOpenAtMs ?? 1000;
  const preamble = bytesOf(preambleLines(scanLay.rulesDir));
  const barrierLines = bytesOf(pre).subarray(preamble.byteLength);
  const messages = barrierStdoutMessages();
  const initFrame = frames(messages.slice(0, 1));
  const restFrames = frames(messages.slice(1));
  const cut = post.indexOf("Found 1 matches") + 1;
  const logBundle = bytesOf(post.slice(0, cut));
  const logRest = bytesOf(post.slice(cut));
  const diag = frames(o.postMessages ?? [goodNotification()]);
  const size = o.chunkSize;
  const events: ScanWatchEvent[] = [
    ...chunked("stderr", preamble, 100, size),
    ...chunked("stdout", initFrame, 200, size),
    { op: "initializedSent" },
    ...chunked("stdout", restFrames, 600, size),
    ...chunked("stderr", barrierLines, 650, size),
    { op: "barrierDone", tMs: 700 },
    { op: "didOpenSent", tMs: didOpenAt },
  ];
  const diagEvents = chunked("stdout", diag, diagAt, size);
  const logEvents = [
    ...chunked("stderr", logBundle, logAt, size),
    ...(logRest.byteLength > 0 ? chunked("stderr", logRest, logAt + 10, size) : []),
  ];
  const ordered =
    o.logFirst === true ? [...logEvents, ...diagEvents] : [...diagEvents, ...logEvents];
  return { config: watchConfig(), events: [...events, ...ordered] };
}
