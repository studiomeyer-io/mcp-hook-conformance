import { describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { auditServer } from "../../src/audit.js";
import type { Config } from "../../src/config.js";

interface ToolSpec {
  name: string;
  description?: string;
  annotations?: Record<string, unknown>;
}

/**
 * Fake MCP client driving auditServer end-to-end without spawning a real
 * server (so this runs everywhere, unlike the tsx-gated integration tests).
 * `behaviors` maps a tool name to the list of responses it returns; a missing
 * entry or `throws` simulates a call failure.
 */
function fakeClient(
  tools: ToolSpec[],
  behaviors: Record<string, { responses?: unknown[]; throws?: boolean }>
): Client {
  const idx: Record<string, number> = {};
  return {
    listTools: async () => ({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: { type: "object", properties: {} },
        annotations: t.annotations ?? {}
      }))
    }),
    callTool: async ({ name }: { name: string }) => {
      const b = behaviors[name];
      if (!b || b.throws) throw new Error(`call failed for ${name}`);
      const responses = b.responses ?? [{ content: [{ type: "text", text: "{}" }] }];
      const i = idx[name] ?? 0;
      idx[name] = i + 1;
      return responses[Math.min(i, responses.length - 1)];
    }
  } as unknown as Client;
}

const baseConfig: Config = {
  server: { name: "srv", transport: "stdio", command: "node", args: [], env: {} },
  suites: ["idempotency", "latency", "determinism", "side-effects", "dsgvo"],
  tries: 3,
  thresholds: { latencyP50Ms: 30000, latencyP95Ms: 60000 },
  probes: []
};

describe("auditServer", () => {
  it("produces a report covering every tool and configured suite", async () => {
    const client = fakeClient(
      [
        { name: "get_a", description: "in-memory only, no retention", annotations: {} },
        { name: "get_b", description: "in-memory only, no retention", annotations: {} }
      ],
      {
        get_a: { responses: [{ v: 1 }, { v: 1 }, { v: 1 }] },
        get_b: { responses: [{ v: 2 }, { v: 2 }, { v: 2 }] }
      }
    );
    const report = await auditServer(client, "srv", baseConfig);
    expect(report.server).toBe("srv");
    expect(report.toolReports).toHaveLength(2);
    for (const tr of report.toolReports) {
      expect(tr.suiteResults).toHaveLength(5);
    }
    expect(report.summary.totalTools).toBe(2);
    expect(report.aggregateScore).toBeGreaterThan(0);
    expect(report.aggregateScore).toBeLessThanOrEqual(100);
  });

  it("honours toolFilter and only audits the named tools", async () => {
    const client = fakeClient(
      [
        { name: "keep", description: "in-memory only" },
        { name: "drop", description: "in-memory only" }
      ],
      {
        keep: { responses: [{ v: 1 }, { v: 1 }, { v: 1 }] },
        drop: { responses: [{ v: 1 }, { v: 1 }, { v: 1 }] }
      }
    );
    const cfg: Config = { ...baseConfig, toolFilter: ["keep"] };
    const report = await auditServer(client, "srv", cfg);
    expect(report.toolReports).toHaveLength(1);
    expect(report.toolReports[0]?.tool).toBe("keep");
  });

  it("runs only the suites listed in config", async () => {
    const client = fakeClient(
      [{ name: "only", description: "in-memory only" }],
      { only: { responses: [{ v: 1 }, { v: 1 }, { v: 1 }] } }
    );
    const cfg: Config = { ...baseConfig, suites: ["idempotency", "determinism"] };
    const report = await auditServer(client, "srv", cfg);
    const suites = report.toolReports[0]?.suiteResults.map((s) => s.suite);
    expect(suites).toEqual(["idempotency", "determinism"]);
  });

  it("does not crash when a tool's calls fail — verdicts go INDETERMINATE", async () => {
    const client = fakeClient(
      [{ name: "broken", description: "in-memory only" }],
      { broken: { throws: true } }
    );
    // dsgvo never calls the tool, so it still produces a real verdict.
    const cfg: Config = {
      ...baseConfig,
      suites: ["idempotency", "latency", "determinism"]
    };
    const report = await auditServer(client, "srv", cfg);
    const results = report.toolReports[0]?.suiteResults ?? [];
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.verdict).toBe("INDETERMINATE");
    }
    // A fully-indeterminate tool must not produce NaN / out-of-range scores.
    const score = report.toolReports[0]?.score ?? -1;
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("scores a clean tool higher than a divergent one in the aggregate", async () => {
    const client = fakeClient(
      [
        { name: "clean", description: "in-memory only, no retention" },
        { name: "flaky", description: "in-memory only, no retention" }
      ],
      {
        clean: { responses: [{ v: 1 }, { v: 1 }, { v: 1 }] },
        flaky: { responses: [{ v: 1 }, { v: 2 }, { v: 3 }] }
      }
    );
    const cfg: Config = { ...baseConfig, suites: ["idempotency"] };
    const report = await auditServer(client, "srv", cfg);
    const clean = report.toolReports.find((t) => t.tool === "clean");
    const flaky = report.toolReports.find((t) => t.tool === "flaky");
    expect(clean?.score).toBeGreaterThan(flaky?.score ?? 100);
    expect(
      flaky?.suiteResults.find((s) => s.suite === "idempotency")?.findings
    ).toContain("IDEMP-001");
  });

  it("returns an empty report for a server with no tools", async () => {
    const client = fakeClient([], {});
    const report = await auditServer(client, "srv", baseConfig);
    expect(report.toolReports).toHaveLength(0);
    expect(report.aggregateScore).toBe(0);
    expect(report.summary.totalTools).toBe(0);
  });
});
