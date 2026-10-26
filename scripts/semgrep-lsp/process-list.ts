// 운영체제 프로세스 목록의 **해석** (순수). 읽어 오는 일은 process-list-node.ts가 하고, 이 파일은 받은 바이트·문자열을 ProcessRow로 바꾼다.
// 해석하지 못하면 부분 결과를 만들지 않고 실패(null)를 돌려준다 — 파손된 출력으로 "다른 서버 없음"을 만들지 않는다.
//
// 공개 API:
//   WINDOWS_LIST_SCRIPT / windowsListArgs(): Windows 조회 스크립트(읽기 전용 Get-CimInstance 하나)와 그 인자
//   parseWindowsListing(bytes, limits): { ok, rows } | { ok:false }      스크립트 출력(탭 구분, 문자열은 base64) 해석
//   splitWindowsCommandLine(text): string[]                               CommandLineToArgvW 규칙
//   parseProcStatus(text): { name, ppid } | null                          /proc/<pid>/status
//   splitProcCmdline(bytes): string[]                                     /proc/<pid>/cmdline (NUL 구분)

import type { ProcessRow } from "./types";

// ── Windows ──────────────────────────────────────────────────────

// 조회 스크립트: Win32_Process를 **읽기만** 한다(Get-CimInstance 하나, 변경·종료 cmdlet 없음). 출력은 ASCII뿐이라 콘솔 인코딩과 무관하다:
// 한 줄에 `P<TAB>PID<TAB>부모PID<TAB>시작시각(ms)<TAB>이름<TAB>실행파일<TAB>명령줄`, 문자열은 값이 없으면 `-`, 있으면 `=`+UTF-8 base64.
// 마지막 줄 `END<TAB>건수`가 없거나 건수가 다르면 출력이 잘린 것이다. 권한 오류는 종료 코드 5, 그 밖의 오류는 6이다.
export const WINDOWS_LIST_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$ProgressPreference = 'SilentlyContinue'",
  "function E($s) { if ($null -eq $s) { '-' } else { '=' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$s)) } }",
  "try {",
  "  $n = 0",
  "  foreach ($p in Get-CimInstance -ClassName Win32_Process) {",
  "    $pp = if ($null -eq $p.ParentProcessId) { '-' } else { [string]$p.ParentProcessId }",
  "    $st = if ($null -eq $p.CreationDate) { '-' } else { [string]([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() }",
  "    $line = @('P', [string]$p.ProcessId, $pp, $st, (E $p.Name), (E $p.ExecutablePath), (E $p.CommandLine)) -join \"`t\"",
  "    [Console]::Out.WriteLine($line)",
  "    $n++",
  "  }",
  '  [Console]::Out.WriteLine("END`t$n")',
  "} catch {",
  "  if ($_.CategoryInfo.Category -eq 'PermissionDenied' -or $_.FullyQualifiedErrorId -match 'AccessDenied') { exit 5 }",
  "  exit 6",
  "}",
].join("\n");

/** PowerShell에 넘길 인자(셸 문자열이 아니라 배열). 스크립트는 UTF-16LE base64로 넘겨 따옴표 처리를 피한다. */
export function windowsListArgs(): string[] {
  const encoded = Buffer.from(WINDOWS_LIST_SCRIPT, "utf16le").toString("base64");
  return ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded];
}

/** 스크립트가 권한 오류를 알리는 종료 코드. */
export const WINDOWS_EXIT_PERMISSION_DENIED = 5;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const DIGITS = /^\d+$/;
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

type Parsed<T> = { ok: true; value: T } | { ok: false };

function optionalInt(text: string): Parsed<number | null> {
  if (text === "-") return { ok: true, value: null };
  if (!DIGITS.test(text)) return { ok: false };
  const value = Number(text);
  return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false };
}

function optionalString(text: string): Parsed<string | null> {
  if (text === "-") return { ok: true, value: null };
  if (!text.startsWith("=")) return { ok: false };
  const body = text.slice(1);
  if (body.length % 4 !== 0 || !BASE64.test(body)) return { ok: false };
  try {
    return { ok: true, value: strictUtf8.decode(Buffer.from(body, "base64")) };
  } catch {
    return { ok: false };
  }
}

export interface WindowsListingLimits {
  /** 행 수 한도. 넘으면 파손으로 본다(비정상 출력). */
  maxRows: number;
}

/**
 * CommandLineToArgvW 규칙으로 명령줄을 나눈다. 첫 요소(프로그램)는 따옴표 안에서 백슬래시를 특별히 다루지 않고, 나머지는 `2n개의 `\`+`"` →
 * n개의 `\`와 따옴표 토글`, `2n+1개의 `\`+`"` → n개의 `\`와 글자 `"``, 따옴표 안의 `""`은 글자 `"`이다. 던지지 않는다.
 */
export function splitWindowsCommandLine(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = text.length;
  const isSpace = (c: string): boolean => c === " " || c === "\t";
  while (i < n && isSpace(text[i])) i++;
  if (i >= n) return out;

  // 프로그램 이름
  let first = "";
  if (text[i] === '"') {
    i++;
    while (i < n && text[i] !== '"') first += text[i++];
    if (i < n) i++;
  } else {
    while (i < n && !isSpace(text[i])) first += text[i++];
  }
  out.push(first);

  while (i < n) {
    while (i < n && isSpace(text[i])) i++;
    if (i >= n) break;
    let arg = "";
    let quoted = false;
    while (i < n) {
      const c = text[i];
      if (c === "\\") {
        let slashes = 0;
        while (i < n && text[i] === "\\") {
          slashes++;
          i++;
        }
        if (i < n && text[i] === '"') {
          arg += "\\".repeat(Math.floor(slashes / 2));
          if (slashes % 2 === 1) {
            arg += '"';
            i++;
          }
          // 짝수: 따옴표는 아래 반복에서 토글로 처리한다.
        } else {
          arg += "\\".repeat(slashes);
        }
      } else if (c === '"') {
        if (quoted && text[i + 1] === '"') {
          arg += '"';
          i += 2;
        } else {
          quoted = !quoted;
          i++;
        }
      } else if (isSpace(c) && !quoted) {
        break;
      } else {
        arg += c;
        i++;
      }
    }
    out.push(arg);
  }
  return out;
}

/** 조회 스크립트의 출력을 해석한다. 형식이 하나라도 어긋나거나 끝 표지·건수가 맞지 않으면 실패다(부분 결과 없음). */
export function parseWindowsListing(
  bytes: Uint8Array,
  limits: WindowsListingLimits
): Parsed<ProcessRow[]> {
  let text: string;
  try {
    text = strictUtf8.decode(bytes);
  } catch {
    return { ok: false };
  }
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return { ok: false };

  const end = lines[lines.length - 1].split("\t");
  if (end.length !== 2 || end[0] !== "END" || !DIGITS.test(end[1])) return { ok: false };
  const declared = Number(end[1]);
  const body = lines.slice(0, -1);
  if (body.length !== declared || body.length > limits.maxRows) return { ok: false };

  const rows: ProcessRow[] = [];
  for (const line of body) {
    const f = line.split("\t");
    if (f.length !== 7 || f[0] !== "P" || !DIGITS.test(f[1])) return { ok: false };
    const pid = Number(f[1]);
    if (!Number.isSafeInteger(pid)) return { ok: false };
    const ppid = optionalInt(f[2]);
    const start = optionalInt(f[3]);
    const name = optionalString(f[4]);
    const exe = optionalString(f[5]);
    const cmd = optionalString(f[6]);
    if (!ppid.ok || !start.ok || !name.ok || !exe.ok || !cmd.ok) return { ok: false };
    rows.push({
      pid,
      ppid: ppid.value,
      startTime: start.value,
      name: name.value,
      executable: exe.value,
      args: cmd.value === null ? null : splitWindowsCommandLine(cmd.value),
      cwd: null, // CIM은 작업 폴더를 알려 주지 않는다.
      vanished: false,
    });
  }
  return { ok: true, value: rows };
}

// ── Linux /proc ──────────────────────────────────────────────────

/** /proc/<pid>/status에서 Name과 PPid를 뽑는다. 둘 중 하나라도 없거나 PPid가 정수가 아니면 null. */
export function parseProcStatus(text: string): { name: string; ppid: number } | null {
  let name: string | null = null;
  let ppid: number | null = null;
  for (const line of text.split("\n")) {
    const tab = line.indexOf(":");
    if (tab < 0) continue;
    const key = line.slice(0, tab);
    const value = line.slice(tab + 1).trim();
    if (key === "Name" && name === null) name = value;
    else if (key === "PPid" && ppid === null) {
      if (!DIGITS.test(value)) return null;
      ppid = Number(value);
    }
  }
  return name === null || ppid === null || !Number.isSafeInteger(ppid) ? null : { name, ppid };
}

/** /proc/<pid>/cmdline(NUL 구분)을 인자 배열로. 비어 있으면(커널 스레드·좀비) 빈 배열이다. 잘못된 UTF-8은 대체 문자로 읽는다. */
export function splitProcCmdline(bytes: Uint8Array): string[] {
  if (bytes.byteLength === 0) return [];
  const parts = new TextDecoder("utf-8").decode(bytes).split("\0");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}
