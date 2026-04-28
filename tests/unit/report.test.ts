import { describe, expect, it } from "vitest";
import { renderHuman } from "../../src/report/human.js";
import { renderJson } from "../../src/report/json.js";
import { renderJunit } from "../../src/report/junit.js";
import type { ServerReport } from "../../src/scoring.js";

const sample: ServerReport = {
  server: "test-server",
  generatedAt: "2026-04-28T00:00:00.000Z",
  aggregateScore: 70,
  summary: { totalTools: 1, pass: 3, warn: 1, fail: 1, indeterminate: 0 },
  toolReports: [
    {
      tool: "demo_tool",
      score: 70,
      suiteResults: [
        {
          suite: "idempotency",
          verdict: "FAIL",
          score: 0,
          findings: ["IDEMP-001"],
          details: {}
        },
        {
          suite: "latency",
          verdict: "PASS",
          score: 100,
          findings: [],
          details: {}
        },
        {
          suite: "dsgvo",
          verdict: "WARN",
          score: 60,
          findings: ["DSGVO-002"],
          details: {}
        }
      ]
    }
  ]
};

describe("renderJson", () => {
  it("emits parsable JSON", () => {
    const out = renderJson(sample);
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.aggregateScore).toBe(70);
  });
});

describe("renderHuman", () => {
  it("includes server name and aggregate score", () => {
    const out = renderHuman(sample);
    expect(out).toContain("test-server");
    expect(out).toContain("70");
    expect(out).toContain("demo_tool");
  });

  it("includes finding code and remediation snippet", () => {
    const out = renderHuman(sample);
    expect(out).toContain("IDEMP-001");
    expect(out).toContain("remediation");
  });
});

describe("renderJunit", () => {
  it("emits junit-xml with failure for FAIL verdicts", () => {
    const xml = renderJunit(sample);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<testsuite");
    expect(xml).toContain("<failure");
    expect(xml).toContain("idempotency");
  });

  it("escapes XML special chars", () => {
    const tricky: ServerReport = {
      ...sample,
      toolReports: [
        {
          tool: "weird<>&\"'",
          score: 0,
          suiteResults: [
            {
              suite: "dsgvo",
              verdict: "FAIL",
              score: 0,
              findings: ["DSGVO-001"],
              details: {}
            }
          ]
        }
      ]
    };
    const xml = renderJunit(tricky);
    expect(xml).toContain("weird&lt;&gt;&amp;&quot;&apos;");
  });
});
