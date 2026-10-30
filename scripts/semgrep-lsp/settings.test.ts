import { describe, expect, it } from "vitest";
import {
  ALLOWED_METRICS_KEYS,
  ALLOWED_SCAN_KEYS,
  ALLOWED_TOP_LEVEL_KEYS,
  buildInitializationOptions,
  isNetworkRuleSource,
  requestedSettingsRecord,
  validateInitializationOptions,
} from "./settings";
import { REASON_STATUS } from "./status";

const PARAMS = {
  configuration: ["semgrep-rules/javascript", "semgrep-rules/typescript"],
  maxTargetBytes: 1_000_000,
  timeout: 30,
  timeoutThreshold: 3,
};

describe("buildInitializationOptions", () => {
  it("하네스가 의도적으로 정하는 키만 만든다(ci=false, onlyGitDirty=false, metrics.enabled=false)", () => {
    const opts = buildInitializationOptions(PARAMS);
    expect(opts).toEqual({
      scan: {
        ci: false,
        configuration: ["semgrep-rules/javascript", "semgrep-rules/typescript"],
        maxTargetBytes: 1_000_000,
        onlyGitDirty: false,
        pro_intrafile: false,
        timeout: 30,
        timeoutThreshold: 3,
      },
      metrics: { enabled: false },
    });
  });

  it("허용 목록 = 정확히 만들어내는 키 집합이다", () => {
    const opts = buildInitializationOptions(PARAMS);
    expect(Object.keys(opts).sort()).toEqual([...ALLOWED_TOP_LEVEL_KEYS]);
    expect(Object.keys(opts.scan).sort()).toEqual([...ALLOWED_SCAN_KEYS]);
    expect(Object.keys(opts.metrics).sort()).toEqual([...ALLOWED_METRICS_KEYS]);
  });

  it("만든 결과는 검증을 통과한다", () => {
    expect(validateInitializationOptions(buildInitializationOptions(PARAMS))).toEqual([]);
  });

  it("configuration 배열은 입력과 별개의 사본이다", () => {
    const configuration = [...PARAMS.configuration];
    const opts = buildInitializationOptions({ ...PARAMS, configuration });
    configuration.push("x");
    expect(opts.scan.configuration).toHaveLength(2);
  });

  it("레지스트리로 풀리는 규칙 출처는 만들기 전에 거부한다(fail-closed)", () => {
    for (const bad of ["auto", "r/javascript", "p/default", "s/abc", "https://x/y", "HTTP://x"]) {
      expect(() => buildInitializationOptions({ ...PARAMS, configuration: [bad] })).toThrow();
    }
  });

  it("서버가 특수 값으로 읽는 나머지 출처(r2c·policy·supply-chain·hooks)도 거부한다 (LSP-RULES-1 보완)", () => {
    for (const bad of [
      "r2c",
      "R2C",
      "policy",
      "supply-chain",
      "Supply-Chain",
      "hooks",
      "auto",
      "AUTO",
      "r/a",
      "p/a",
      "s/a",
      "http://x",
      "HTTPS://x",
    ]) {
      expect(isNetworkRuleSource(bad), bad).toBe(true);
      expect(
        () => buildInitializationOptions({ ...PARAMS, configuration: ["semgrep-rules/x", bad] }),
        bad
      ).toThrow(/네트워크/);
    }
  });

  it("로컬 상대 경로와 절대 경로는 그대로 통과한다 (기존 호출 계약 보존)", () => {
    for (const ok of [
      "semgrep-rules/javascript",
      "./rules",
      "../rules",
      "rules/hooks-dir",
      "policy-notes/x",
      "autofix",
      "r2c-extra",
      "supply-chain-x",
      "hooksdir",
      "C:\\ProgramData\\x\\rules-probe",
      "c:/x/y",
      "P:\\x",
      "/var/rules",
    ]) {
      expect(isNetworkRuleSource(ok), ok).toBe(false);
      expect(
        () => buildInitializationOptions({ ...PARAMS, configuration: [ok] }),
        ok
      ).not.toThrow();
    }
  });

  it("빈 configuration·빈 항목·유한하지 않은 숫자는 거부한다", () => {
    expect(() => buildInitializationOptions({ ...PARAMS, configuration: [] })).toThrow();
    expect(() => buildInitializationOptions({ ...PARAMS, configuration: [""] })).toThrow();
    expect(() => buildInitializationOptions({ ...PARAMS, maxTargetBytes: Number.NaN })).toThrow();
    expect(() => buildInitializationOptions({ ...PARAMS, timeout: Infinity })).toThrow();
    expect(() => buildInitializationOptions({ ...PARAMS, timeoutThreshold: -1 })).toThrow();
    expect(() => buildInitializationOptions({ ...PARAMS, maxTargetBytes: 1.5 })).toThrow();
  });
});

describe("validateInitializationOptions (rev2 R7·R9, ADR D9)", () => {
  it("R7: scan에 알 수 없는 키 하나가 있으면 SETTINGS_KEY_NOT_ALLOWED", () => {
    const opts = buildInitializationOptions(PARAMS) as unknown as Record<string, unknown>;
    (opts.scan as Record<string, unknown>).jobs = 4; // 서버 허용 키라도 하네스가 정하지 않았으면 거부
    const reasons = validateInitializationOptions(opts);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].code).toBe("SETTINGS_KEY_NOT_ALLOWED");
    expect(reasons[0].detail).toContain("scan.jobs");
    expect(REASON_STATUS[reasons[0].code]).toBe("SETTINGS_MISMATCH");
  });

  it("R9: metrics에 알 수 없는 키 하나가 있으면 SETTINGS_KEY_NOT_ALLOWED", () => {
    const opts = buildInitializationOptions(PARAMS) as unknown as Record<string, unknown>;
    (opts.metrics as Record<string, unknown>).machineId = "x";
    const reasons = validateInitializationOptions(opts);
    expect(reasons.map((r) => r.code)).toEqual(["SETTINGS_KEY_NOT_ALLOWED"]);
    expect(reasons[0].detail).toContain("metrics.machineId");
  });

  it("최상위의 알 수 없는 키도 거부한다", () => {
    const opts = { ...buildInitializationOptions(PARAMS), extra: 1 };
    const reasons = validateInitializationOptions(opts);
    expect(reasons.map((r) => r.detail)).toEqual([expect.stringContaining("extra")]);
  });

  it("키가 여러 개면 전부 모으고 순서가 결정적이다", () => {
    const opts = buildInitializationOptions(PARAMS) as unknown as Record<string, unknown>;
    (opts.scan as Record<string, unknown>).zzz = 1;
    (opts.scan as Record<string, unknown>).aaa = 1;
    (opts.metrics as Record<string, unknown>).bbb = 1;
    const details = validateInitializationOptions(opts).map((r) => r.detail);
    expect(details).toEqual([
      expect.stringContaining("scan.aaa"),
      expect.stringContaining("scan.zzz"),
      expect.stringContaining("metrics.bbb"),
    ]);
  });

  it("scan·metrics가 객체가 아니거나 안에 중첩 객체가 있어도 거부한다(어느 수준이든)", () => {
    const base = buildInitializationOptions(PARAMS) as unknown as Record<string, unknown>;
    expect(validateInitializationOptions({ ...base, scan: "x" })).toHaveLength(1);
    expect(validateInitializationOptions({ ...base, metrics: [] })).toHaveLength(1);
    expect(
      validateInitializationOptions({
        ...base,
        scan: { ...(base.scan as object), exclude: { a: 1 } },
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "SETTINGS_KEY_NOT_ALLOWED" })])
    );
    expect(validateInitializationOptions(null)).toHaveLength(1);
    expect(validateInitializationOptions("x")).toHaveLength(1);
  });

  it("값은 사유에 넣지 않는다(키 이름만)", () => {
    const opts = buildInitializationOptions(PARAMS) as unknown as Record<string, unknown>;
    (opts.scan as Record<string, unknown>).secretish = "TOP-SECRET-VALUE";
    expect(JSON.stringify(validateInitializationOptions(opts))).not.toContain("TOP-SECRET-VALUE");
  });
});

describe("requestedSettingsRecord", () => {
  it("요청한 값임을 명시하고 관측한 값이라고 하지 않는다", () => {
    const record = requestedSettingsRecord(buildInitializationOptions(PARAMS));
    expect(record.basis).toBe("requested");
    expect(record.observed).toBe(false);
    expect(record.scan.timeout).toBe(30);
    expect(record.metrics).toEqual({ enabled: false });
  });

  it("키가 정렬되어 같은 입력이면 직렬화가 같다", () => {
    const a = JSON.stringify(requestedSettingsRecord(buildInitializationOptions(PARAMS)));
    const b = JSON.stringify(requestedSettingsRecord(buildInitializationOptions(PARAMS)));
    expect(a).toBe(b);
    expect(Object.keys(requestedSettingsRecord(buildInitializationOptions(PARAMS)).scan)).toEqual([
      ...ALLOWED_SCAN_KEYS,
    ]);
  });

  it("허용되지 않는 키가 있는 옵션은 증거로 만들지 않는다", () => {
    const opts = { ...buildInitializationOptions(PARAMS), extra: 1 };
    expect(() => requestedSettingsRecord(opts)).toThrow();
  });
});
