// 시험 전용: 대상의 모든 메서드 호출을 `<label>.<이름>`으로 기록하고 그대로 넘긴다. 자원을 얻거나 만졌는지(파일 시스템·잠금·포트) 확인하는 용도.

export function recorded<T extends object>(target: T, calls: string[], label: string): T {
  return new Proxy(target, {
    get(t, prop) {
      const value = Reflect.get(t, prop, t) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls.push(`${label}.${String(prop)}`);
        return (value as (...a: unknown[]) => unknown).apply(t, args);
      };
    },
  });
}
