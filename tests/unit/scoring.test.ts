import { describe, expect, it } from "vitest";
import {
  aggregateScore,
  buildServerReport,
  scoreSuite,
  scoreTool,
  SUITE_WEIGHTS,
  verdictToScore,
  summarize
} from "../../src/scoring.js";
import type { SuiteResult, ToolReport } from "../../src/scoring.js";

function suite(verdict: SuiteResult["verdict"], suiteName: SuiteResult["suite"]): SuiteResult {
  return {
    suite: suiteName,
    verdict,
    score: scoreSuite(verdict),
    findings: [],
    details: {}
  };
}

describe("verdictToScore", () => {
  it("maps verdicts to numeric scores", () => {
    expect(verdictToScore("PASS")).toBe(100);
    expect(verdictToScore("WARN")).toBe(60);
    expect(verdictToScore("INDETERMINATE")).toBe(50);
    expect(verdictToScore("FAIL")).toBe(0);
  });
});

describe("scoreTool", () => {
  it("returns 100 when all suites PASS", () => {
    const results: SuiteResult[] = [
      suite("PASS", "idempotency"),
      suite("PASS", "latency"),
      suite("PASS", "determinism"),
      suite("PASS", "side-effects"),
      suite("PASS", "dsgvo")
    ];
    expect(scoreTool(results)).toBe(100);
  });

  it("returns 0 when all suites FAIL", () => {
    const results: SuiteResult[] = [
      suite("FAIL", "idempotency"),
      suite("FAIL", "latency"),
      suite("FAIL", "determinism"),
      suite("FAIL", "side-effects"),
      suite("FAIL", "dsgvo")
    ];
    expect(scoreTool(results)).toBe(0);
  });

  it("weights idempotency higher than dsgvo", () => {
    const idempFailOnly: SuiteResult[] = [
      suite("FAIL", "idempotency"),
      suite("PASS", "latency"),
      suite("PASS", "determinism"),
      suite("PASS", "side-effects"),
      suite("PASS", "dsgvo")
    ];
    const dsgvoFailOnly: SuiteResult[] = [
      suite("PASS", "idempotency"),
      suite("PASS", "latency"),
      suite("PASS", "determinism"),
      suite("PASS", "side-effects"),
      suite("FAIL", "dsgvo")
    ];
    expect(scoreTool(idempFailOnly)).toBeLessThan(scoreTool(dsgvoFailOnly));
  });

  it("returns 0 for empty results", () => {
    expect(scoreTool([])).toBe(0);
  });
});

describe("aggregateScore", () => {
  it("averages tool scores", () => {
    const reports: ToolReport[] = [
      { tool: "a", suiteResults: [], score: 80 },
      { tool: "b", suiteResults: [], score: 40 }
    ];
    expect(aggregateScore(reports)).toBe(60);
  });

  it("returns 0 for no tools", () => {
    expect(aggregateScore([])).toBe(0);
  });
});

describe("summarize", () => {
  it("counts verdicts across all tools and suites", () => {
    const reports: ToolReport[] = [
      {
        tool: "a",
        score: 100,
        suiteResults: [suite("PASS", "idempotency"), suite("WARN", "latency")]
      },
      {
        tool: "b",
        score: 0,
        suiteResults: [suite("FAIL", "dsgvo"), suite("INDETERMINATE", "side-effects")]
      }
    ];
    const s = summarize(reports);
    expect(s.totalTools).toBe(2);
    expect(s.pass).toBe(1);
    expect(s.warn).toBe(1);
    expect(s.fail).toBe(1);
    expect(s.indeterminate).toBe(1);
  });
});

describe("buildServerReport", () => {
  it("produces a valid ServerReport with timestamp", () => {
    const r = buildServerReport("test", [
      { tool: "x", score: 100, suiteResults: [suite("PASS", "idempotency")] }
    ]);
    expect(r.server).toBe("test");
    expect(r.aggregateScore).toBe(100);
    expect(r.toolReports).toHaveLength(1);
    expect(r.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("SUITE_WEIGHTS", () => {
  it("sums to 100", () => {
    const total = Object.values(SUITE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});
