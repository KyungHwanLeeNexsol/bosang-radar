// 정규 JSON 직렬화(순수). 키는 UTF-8 바이트순, 2칸 들여쓰기, LF. evidence.ts가 다시 내보낸다 — 지문 모듈(fingerprint.ts)이
// 증거 모듈과 순환하지 않으면서 같은 직렬화를 쓰도록 따로 두었다.

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function serialize(
  value: unknown,
  pretty: boolean,
  level: number,
  stack: object[],
  where: string
): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error(`정규 JSON에 쓸 수 없는 숫자다: ${where}`);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      // undefined, function, symbol, bigint
      throw new Error(`정규 JSON에 쓸 수 없는 값(${typeof value})이다: ${where}`);
  }

  const obj = value as object;
  if (stack.includes(obj)) throw new Error(`순환 참조다: ${where}`);
  const pad = (n: number) => (pretty ? "  ".repeat(n) : "");
  const nl = pretty ? "\n" : "";
  const sep = pretty ? ": " : ":";

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const next = [...stack, obj];
    const items: string[] = [];
    for (let i = 0; i < obj.length; i++) {
      items.push(
        `${pad(level + 1)}${serialize(obj[i], pretty, level + 1, next, `${where}[${i}]`)}`
      );
    }
    return `[${nl}${items.join(`,${nl}`)}${nl}${pad(level)}]`;
  }

  const proto = Object.getPrototypeOf(obj);
  if (
    (proto !== Object.prototype && proto !== null) ||
    Object.getOwnPropertySymbols(obj).length > 0
  ) {
    throw new Error(`평범한 객체가 아니다: ${where}`);
  }
  const keys = Object.keys(obj).sort(compareBytes);
  if (keys.length === 0) return "{}";
  const next = [...stack, obj];
  const items = keys.map(
    (key) =>
      `${pad(level + 1)}${JSON.stringify(key)}${sep}${serialize(
        (obj as Record<string, unknown>)[key],
        pretty,
        level + 1,
        next,
        `${where}.${key}`
      )}`
  );
  return `{${nl}${items.join(`,${nl}`)}${nl}${pad(level)}}`;
}

/** 키 정렬, 2칸 들여쓰기, LF, 끝 줄바꿈. undefined·NaN·Infinity·함수 등은 던진다(fail-closed). */
export function canonicalJson(value: unknown): string {
  return `${serialize(value, true, 0, [], "$")}\n`;
}

/** JSONL 한 줄용: 키 정렬, 들여쓰기·끝 줄바꿈 없음. */
export function canonicalJsonLine(value: unknown): string {
  return serialize(value, false, 0, [], "$");
}

/** 값마다 한 줄. 빈 목록은 빈 문자열. */
export function toJsonl(values: readonly unknown[]): string {
  return values.map((v) => `${canonicalJsonLine(v)}\n`).join("");
}
