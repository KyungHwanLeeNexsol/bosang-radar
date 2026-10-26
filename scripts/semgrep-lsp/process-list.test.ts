import { describe, expect, it } from "vitest";
import {
  WINDOWS_LIST_SCRIPT,
  parseProcStatus,
  parseWindowsListing,
  splitProcCmdline,
  splitWindowsCommandLine,
  windowsListArgs,
} from "./process-list";

// 순수 해석 시험. 입력은 모두 합성 문자열·바이트다(실제 운영체제 출력이 아니다).

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const b64 = (text: string): string => `=${Buffer.from(text, "utf8").toString("base64")}`;
const LIMITS = { maxRows: 1000 };

function line(
  pid: number | string,
  ppid: number | string | null,
  start: number | string | null,
  name: string | null,
  exe: string | null,
  cmd: string | null
): string {
  const s = (v: string | null): string => (v === null ? "-" : b64(v));
  const n = (v: number | string | null): string => (v === null ? "-" : String(v));
  return ["P", String(pid), n(ppid), n(start), s(name), s(exe), s(cmd)].join("\t");
}

const listing = (...lines: string[]): string =>
  `${[...lines, `END\t${lines.length}`].join("\r\n")}\r\n`;

describe("splitWindowsCommandLine — CommandLineToArgvW 규칙", () => {
  it("공백으로 나누고 따옴표 안의 공백은 지킨다", () => {
    expect(splitWindowsCommandLine("semgrep lsp --debug")).toEqual(["semgrep", "lsp", "--debug"]);
    expect(splitWindowsCommandLine('"C:\\Program Files\\x\\semgrep.exe" lsp "a b" c')).toEqual([
      "C:\\Program Files\\x\\semgrep.exe",
      "lsp",
      "a b",
      "c",
    ]);
    expect(splitWindowsCommandLine("a\t\tb   c")).toEqual(["a", "b", "c"]);
  });

  it("프로그램 이름은 따옴표 안에서 백슬래시를 특별히 다루지 않는다", () => {
    expect(splitWindowsCommandLine('"C:\\dir\\" arg')).toEqual(["C:\\dir\\", "arg"]);
  });

  it("백슬래시와 따옴표: 2n개 뒤의 따옴표는 토글, 2n+1개 뒤의 따옴표는 글자", () => {
    expect(splitWindowsCommandLine('p a\\\\"b c"')).toEqual(["p", "a\\b c"]);
    expect(splitWindowsCommandLine('p a\\"b')).toEqual(["p", 'a"b']);
    expect(splitWindowsCommandLine('p "C:\\dir\\" next')).toEqual(["p", 'C:\\dir" next']);
    expect(splitWindowsCommandLine("p C:\\dir\\sub")).toEqual(["p", "C:\\dir\\sub"]);
    expect(splitWindowsCommandLine("p a\\\\\\\\")).toEqual(["p", "a\\\\\\\\"]);
  });

  it("빈 인자와 따옴표 안의 연속 따옴표", () => {
    expect(splitWindowsCommandLine('p "" x')).toEqual(["p", "", "x"]);
    expect(splitWindowsCommandLine('p "a""b"')).toEqual(["p", 'a"b']);
  });

  it("빈 문자열·공백뿐인 문자열은 빈 배열이고, 닫히지 않은 따옴표도 던지지 않는다", () => {
    expect(splitWindowsCommandLine("")).toEqual([]);
    expect(splitWindowsCommandLine("   \t ")).toEqual([]);
    expect(splitWindowsCommandLine('p "abc def')).toEqual(["p", "abc def"]);
    expect(splitWindowsCommandLine('"unterminated')).toEqual(["unterminated"]);
  });

  it("유니코드 경로를 그대로 둔다", () => {
    expect(splitWindowsCommandLine('"C:\\사용자\\도구\\semgrep.exe" lsp')).toEqual([
      "C:\\사용자\\도구\\semgrep.exe",
      "lsp",
    ]);
  });
});

describe("parseWindowsListing — 조회 스크립트 출력 해석", () => {
  it("정상 출력을 행으로 바꾼다(값이 없는 칸은 null, 빈 명령줄은 빈 배열)", () => {
    const text = listing(
      line(4, 0, 1792973268088, "System", null, null),
      line(
        120,
        4,
        1792973268999,
        "semgrep.exe",
        "C:\\Py\\Scripts\\semgrep.exe",
        '"C:\\Py\\Scripts\\semgrep.exe" lsp --debug'
      ),
      line(121, null, null, "x", "", "")
    );
    const parsed = parseWindowsListing(enc(text), LIMITS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual([
      {
        pid: 4,
        ppid: 0,
        startTime: 1792973268088,
        name: "System",
        executable: null,
        args: null,
        cwd: null,
        vanished: false,
      },
      {
        pid: 120,
        ppid: 4,
        startTime: 1792973268999,
        name: "semgrep.exe",
        executable: "C:\\Py\\Scripts\\semgrep.exe",
        args: ["C:\\Py\\Scripts\\semgrep.exe", "lsp", "--debug"],
        cwd: null,
        vanished: false,
      },
      {
        pid: 121,
        ppid: null,
        startTime: null,
        name: "x",
        executable: "",
        args: [],
        cwd: null,
        vanished: false,
      },
    ]);
  });

  it("줄 끝이 LF뿐이어도, 한글 경로여도 읽는다", () => {
    const text = listing(
      line(7, 1, 1, "도구.exe", "C:\\사용자\\도구.exe", "C:\\사용자\\도구.exe 인자")
    ).replace(/\r\n/g, "\n");
    const parsed = parseWindowsListing(enc(text), LIMITS);
    expect(parsed.ok && parsed.value[0].args).toEqual(["C:\\사용자\\도구.exe", "인자"]);
  });

  it("작업 폴더는 항상 null이고 vanished는 false다(CIM은 알려 주지 않는다)", () => {
    const parsed = parseWindowsListing(enc(listing(line(1, 0, 1, "a", null, null))), LIMITS);
    expect(parsed.ok && parsed.value[0]).toMatchObject({ cwd: null, vanished: false });
  });

  const bad: [string, string | Uint8Array][] = [
    ["빈 출력", ""],
    ["끝 표지 없음(잘림)", `${line(1, 0, 1, "a", null, null)}\r\n`],
    ["끝 표지 건수 불일치", `${line(1, 0, 1, "a", null, null)}\r\nEND\t2\r\n`],
    ["끝 표지 건수가 숫자가 아님", `${line(1, 0, 1, "a", null, null)}\r\nEND\tx\r\n`],
    [
      "끝 표지의 이름이 END가 아님(건수만 맞음)",
      `${line(1, 0, 1, "a", null, null)}\r\nDONE\t1\r\n`,
    ],
    ["끝 표지가 행 표지(P)와 같은 모양", `${line(1, 0, 1, "a", null, null)}\r\nP\t1\r\n`],
    [
      "끝 표지 뒤에 행이 더 있음",
      `${line(1, 0, 1, "a", null, null)}\r\nEND\t1\r\n${line(2, 0, 1, "b", null, null)}\r\nEND\t2\r\nEND\t2\r\n`,
    ],
    ["잘린 행(칸 부족)", `P\t1\t0\t1\t${b64("a")}\r\nEND\t1\r\n`],
    ["칸이 많음", `${line(1, 0, 1, "a", null, null)}\textra\r\nEND\t1\r\n`],
    ["행 표지가 P가 아님", `${line(1, 0, 1, "a", null, null).replace(/^P/, "X")}\r\nEND\t1\r\n`],
    ["PID가 숫자가 아님", `${line("abc", 0, 1, "a", null, null)}\r\nEND\t1\r\n`],
    ["음수 PID", `${line("-1", 0, 1, "a", null, null)}\r\nEND\t1\r\n`],
    ["부모 PID가 숫자가 아님", `${line(1, "x", 1, "a", null, null)}\r\nEND\t1\r\n`],
    ["시작 시각이 숫자가 아님", `${line(1, 0, "t", "a", null, null)}\r\nEND\t1\r\n`],
    ["base64가 아님", `P\t1\t0\t1\t=!!!!\t-\t-\r\nEND\t1\r\n`],
    ["base64 길이가 4의 배수가 아님", `P\t1\t0\t1\t=YQ\t-\t-\r\nEND\t1\r\n`],
    ["= 표지가 없는 문자열", `P\t1\t0\t1\tplain\t-\t-\r\nEND\t1\r\n`],
    [
      "잘못된 UTF-8을 담은 base64",
      `P\t1\t0\t1\t=${Buffer.from([0xff, 0xfe, 0xfd, 0xfc]).toString("base64")}\t-\t-\r\nEND\t1\r\n`,
    ],
    ["출력 전체가 잘못된 UTF-8", new Uint8Array([0xff, 0xfe, 0x50])],
    ["맨 앞에 BOM", `\uFEFF${listing(line(1, 0, 1, "a", null, null))}`],
    [
      "안전하지 않은 큰 PID",
      `${line("99999999999999999999", 0, 1, "a", null, null)}\r\nEND\t1\r\n`,
    ],
  ];
  it.each(bad)("파손: %s → 부분 결과 없이 실패", (_label, input) => {
    const bytes = typeof input === "string" ? enc(input) : input;
    expect(parseWindowsListing(bytes, LIMITS)).toEqual({ ok: false });
  });

  it("행 수 한도를 넘으면 실패다", () => {
    const lines = Array.from({ length: 5 }, (_, i) => line(i + 1, 0, 1, "a", null, null));
    expect(parseWindowsListing(enc(listing(...lines)), { maxRows: 4 })).toEqual({ ok: false });
    expect(parseWindowsListing(enc(listing(...lines)), { maxRows: 5 }).ok).toBe(true);
  });
});

describe("조회 스크립트와 인자", () => {
  it("인자는 배열이고 스크립트는 -EncodedCommand(UTF-16LE base64)로 넘어간다 — 셸 문자열·따옴표 처리가 없다", () => {
    const args = windowsListArgs();
    expect(args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-EncodedCommand"]);
    expect(args).toHaveLength(4);
    expect(Buffer.from(args[3], "base64").toString("utf16le")).toBe(WINDOWS_LIST_SCRIPT);
  });

  it("스크립트는 읽기 전용 CIM 조회 하나이고, 권한 오류는 종료 코드 5로 알린다", () => {
    expect(WINDOWS_LIST_SCRIPT).toContain("Get-CimInstance -ClassName Win32_Process");
    expect(WINDOWS_LIST_SCRIPT).toContain("exit 5");
    expect(WINDOWS_LIST_SCRIPT).toContain("exit 6");
    expect(WINDOWS_LIST_SCRIPT).toMatch(/END`t\$n/);
  });
});

describe("parseProcStatus — /proc/<pid>/status", () => {
  it("Name과 PPid를 읽는다", () => {
    expect(parseProcStatus("Name:\tsemgrep\nUmask:\t0022\nPPid:\t77\nTracerPid:\t0\n")).toEqual({
      name: "semgrep",
      ppid: 77,
    });
  });

  it("이름에 공백·콜론이 있어도 첫 콜론까지가 키다", () => {
    expect(parseProcStatus("Name:\tmy proc: v2\nPPid:\t1\n")).toEqual({
      name: "my proc: v2",
      ppid: 1,
    });
  });

  it("Name이나 PPid가 없거나 PPid가 정수가 아니면 null(파손)", () => {
    expect(parseProcStatus("Name:\tx\n")).toBeNull();
    expect(parseProcStatus("PPid:\t1\n")).toBeNull();
    expect(parseProcStatus("Name:\tx\nPPid:\tabc\n")).toBeNull();
    expect(parseProcStatus("Name:\tx\nPPid:\t-4\n")).toBeNull();
    expect(parseProcStatus("garbage")).toBeNull();
  });
});

describe("splitProcCmdline — /proc/<pid>/cmdline", () => {
  it("NUL로 나누고 끝의 NUL 하나는 버린다", () => {
    expect(splitProcCmdline(enc("semgrep\0lsp\0--debug\0"))).toEqual(["semgrep", "lsp", "--debug"]);
    expect(splitProcCmdline(enc("a\0b"))).toEqual(["a", "b"]);
  });

  it("빈 인자는 보존하고, 비어 있으면(커널 스레드·좀비) 빈 배열이다", () => {
    expect(splitProcCmdline(enc("a\0\0b\0"))).toEqual(["a", "", "b"]);
    expect(splitProcCmdline(new Uint8Array())).toEqual([]);
  });

  it("공백이 들어 있는 인자를 나누지 않는다 — 인자 경계가 정확하다", () => {
    expect(splitProcCmdline(enc("/opt/my tools/semgrep\0lsp\0"))).toEqual([
      "/opt/my tools/semgrep",
      "lsp",
    ]);
  });

  it("잘못된 UTF-8도 던지지 않는다", () => {
    expect(() => splitProcCmdline(new Uint8Array([0x61, 0xff, 0x00, 0x62, 0x00]))).not.toThrow();
  });
});
