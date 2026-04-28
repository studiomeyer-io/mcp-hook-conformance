import { describe, expect, it } from "vitest";
import { FINDINGS, explainFinding, listFindingCodes } from "../../src/findings.js";

describe("FINDINGS registry", () => {
  it("has at least one code per suite", () => {
    const suites = new Set(Object.values(FINDINGS).map((f) => f.suite));
    expect(suites.has("idempotency")).toBe(true);
    expect(suites.has("latency")).toBe(true);
    expect(suites.has("determinism")).toBe(true);
    expect(suites.has("side-effects")).toBe(true);
    expect(suites.has("dsgvo")).toBe(true);
  });

  it("every code has non-empty title and remediation", () => {
    for (const [code, def] of Object.entries(FINDINGS)) {
      expect(def.code).toBe(code);
      expect(def.title.length).toBeGreaterThan(5);
      expect(def.remediation.length).toBeGreaterThan(20);
    }
  });

  it("explainFinding returns the def", () => {
    expect(explainFinding("IDEMP-001")?.suite).toBe("idempotency");
  });

  it("explainFinding returns undefined for unknown codes", () => {
    expect(explainFinding("NOPE-999")).toBeUndefined();
  });

  it("listFindingCodes is sorted", () => {
    const codes = listFindingCodes();
    const sorted = [...codes].sort();
    expect(codes).toEqual(sorted);
  });
});
