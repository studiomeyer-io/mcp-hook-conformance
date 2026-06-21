import { describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { runIdempotencySuite } from "../../src/suites/idempotency.js";
import { runLatencySuite, percentile } from "../../src/suites/latency.js";
import { runDeterminismSuite } from "../../src/suites/determinism.js";
import { runSideEffectsSuite } from "../../src/suites/side-effects.js";
import { runDsgvoSuite } from "../../src/suites/dsgvo.js";
import type { ToolDescriptor } from "../../src/introspect.js";
import type { Config } from "../../src/config.js";

interface Behavior {
  responses?: unknown[];
  delayMs?: number;
  throws?: boolean;
}

function fakeClient(byTool: Record<string, Behavior>): Client {
  let callIdx: Record<string, number> = {};
  return {
    callTool: async ({
      name,
      arguments: _args
    }: {
      name: string;
      arguments?: Record<string, unknown>;
    }) => {
      const b = byTool[name];
      if (!b) throw new Error(`No mock for tool ${name}`);
      if (b.throws) throw new Error("mock failure");
      if (b.delayMs) await new Promise((r) => setTimeout(r, b.delayMs));
      const idx = callIdx[name] ?? 0;
      callIdx[name] = idx + 1;
      const responses = b.responses ?? [{ content: [{ type: "text", text: "{}" }] }];
      const at = Math.min(idx, responses.length - 1);
      return responses[at];
    }
  } as unknown as Client;
}

const baseConfig: Config = {
  server: { name: "x", transport: "stdio", command: "node", args: [], env: {} },
  suites: ["idempotency", "latency", "determinism", "side-effects", "dsgvo"],
  tries: 3,
  thresholds: { latencyP50Ms: 30000, latencyP95Ms: 60000 },
  probes: []
};

function tool(
  name: string,
  description = "Plain tool. Documents data flow: in-memory only, no retention.",
  ann: Partial<ToolDescriptor["annotations"]> = {}
): ToolDescriptor {
  return { name, description, inputSchema: {}, annotations: ann };
}

describe("idempotency suite", () => {
  it("PASS when responses are identical", async () => {
    const client = fakeClient({
      get_count: { responses: [{ count: 1 }, { count: 1 }, { count: 1 }] }
    });
    const r = await runIdempotencySuite(client, tool("get_count"), baseConfig);
    expect(r.verdict).toBe("PASS");
    expect(r.findings).toEqual([]);
  });

  it("FAIL with IDEMP-001 when responses differ", async () => {
    const client = fakeClient({
      get_count: { responses: [{ count: 1 }, { count: 2 }, { count: 3 }] }
    });
    const r = await runIdempotencySuite(client, tool("get_count"), baseConfig);
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("IDEMP-001");
  });

  it("WARN IDEMP-002 when timestamps detected without nondeterministic annotation", async () => {
    const ts = "2026-04-28T10:30:00Z";
    const client = fakeClient({
      get_now: { responses: [{ time: ts }, { time: ts }, { time: ts }] }
    });
    const r = await runIdempotencySuite(client, tool("get_now"), baseConfig);
    expect(r.verdict).toBe("WARN");
    expect(r.findings).toContain("IDEMP-002");
  });

  it("PASS when nondeterministic is annotated even with divergent output", async () => {
    const client = fakeClient({
      live: { responses: [{ x: 1 }, { x: 2 }, { x: 3 }] }
    });
    const r = await runIdempotencySuite(
      client,
      tool("live", "live data", { nondeterministic: true }),
      baseConfig
    );
    expect(r.verdict).toBe("PASS");
  });
});

describe("latency suite", () => {
  it("PASS when fast", async () => {
    const client = fakeClient({ fast: { delayMs: 1 } });
    const r = await runLatencySuite(client, tool("fast"), baseConfig);
    expect(r.verdict).toBe("PASS");
  });

  it("FAIL when p95 exceeds threshold", async () => {
    const client = fakeClient({ slow: { delayMs: 5 } });
    const tightConfig: Config = {
      ...baseConfig,
      thresholds: { latencyP50Ms: 1, latencyP95Ms: 2 }
    };
    const r = await runLatencySuite(client, tool("slow"), tightConfig);
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("LAT-001");
  });

  it("INDETERMINATE when warmup throws", async () => {
    const client = fakeClient({ broken: { throws: true } });
    const r = await runLatencySuite(client, tool("broken"), baseConfig);
    expect(r.verdict).toBe("INDETERMINATE");
  });

  it("reports p50/p95 and the per-sample timings in details", async () => {
    const client = fakeClient({ fast: { delayMs: 1 } });
    const r = await runLatencySuite(client, tool("fast"), baseConfig);
    expect(r.details.samples).toBe(5);
    expect(typeof r.details.p50Ms).toBe("number");
    expect(typeof r.details.p95Ms).toBe("number");
    expect(Array.isArray(r.details.timingsMs)).toBe(true);
    expect((r.details.timingsMs as number[]).length).toBe(5);
  });
});

describe("percentile (nearest-rank)", () => {
  it("returns 0 for an empty sample set", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([], 95)).toBe(0);
  });

  it("computes the median for an odd-length set", () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
  });

  it("uses nearest-rank for an even-length set (no off-by-one)", () => {
    // rank = ceil(0.5 * 4) = 2 -> index 1 -> value 20
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
  });

  it("selects the correct sample when p/100*N is an exact integer", () => {
    // p20 over 5 samples: rank = ceil(0.2 * 5) = 1 -> index 0 -> value 10
    expect(percentile([10, 20, 30, 40, 50], 20)).toBe(10);
    // p40 over 5 samples: rank = ceil(0.4 * 5) = 2 -> index 1 -> value 20
    expect(percentile([10, 20, 30, 40, 50], 40)).toBe(20);
  });

  it("returns the maximum for p95 and p100", () => {
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50);
    expect(percentile([10, 20, 30, 40, 50], 100)).toBe(50);
  });

  it("sorts unordered input before selecting", () => {
    expect(percentile([50, 10, 40, 20, 30], 50)).toBe(30);
  });

  it("handles a single-element set", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });
});

describe("determinism suite", () => {
  it("PASS when output is identical", async () => {
    const client = fakeClient({
      x: { responses: [{ a: 1 }, { a: 1 }, { a: 1 }] }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("PASS");
  });

  it("FAIL DET-001 when floats drift", async () => {
    const client = fakeClient({
      x: { responses: [{ p: 0.1 }, { p: 0.2 }, { p: 0.3 }] }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("DET-001");
  });

  it("WARN DET-002 when shape changes", async () => {
    const client = fakeClient({
      x: { responses: [{ a: 1 }, { a: 1, b: 2 }, { a: 1 }] }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("WARN");
    expect(r.findings).toContain("DET-002");
  });

  // Regression: identical float VALUES emitted in a different object key order
  // must not be reported as float drift. JSON object key ordering is not
  // guaranteed (DB rows, serializers), so this was a false-positive FAIL.
  it("PASS when float values are identical but object key order differs", async () => {
    const client = fakeClient({
      x: { responses: [{ a: 1.5, b: 2.5 }, { b: 2.5, a: 1.5 }, { a: 1.5, b: 2.5 }] }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("PASS");
    expect(r.findings).toEqual([]);
  });

  it("PASS when nested float values match across reordered keys", async () => {
    const client = fakeClient({
      x: {
        responses: [
          { outer: { lat: 39.5, lng: 2.6 } },
          { outer: { lng: 2.6, lat: 39.5 } }
        ]
      }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("PASS");
  });

  it("FAIL DET-001 when the same float moves to a different key (positional drift)", async () => {
    const client = fakeClient({
      x: { responses: [{ a: 1.5, b: 2 }, { a: 2, b: 1.5 }] }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("DET-001");
  });

  it("FAIL DET-001 when array element order changes (order is significant)", async () => {
    const client = fakeClient({
      x: { responses: [{ scores: [0.1, 0.2] }, { scores: [0.2, 0.1] }] }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("DET-001");
  });

  it("PASS when array of floats is stable", async () => {
    const client = fakeClient({
      x: { responses: [{ scores: [0.1, 0.2] }, { scores: [0.1, 0.2] }] }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("PASS");
  });

  it("FAIL DET-001 when one call emits an extra float", async () => {
    const client = fakeClient({
      x: { responses: [{ p: 0.1 }, { p: 0.1, q: 0.9 }] }
    });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("DET-001");
  });

  it("INDETERMINATE when a call throws mid-run", async () => {
    const client = fakeClient({ x: { throws: true } });
    const r = await runDeterminismSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("INDETERMINATE");
    expect(r.details.error).toBeDefined();
  });
});

describe("side-effects suite", () => {
  it("PASS when not annotated readOnly", async () => {
    const client = fakeClient({ x: {} });
    const r = await runSideEffectsSuite(client, tool("x"), baseConfig);
    expect(r.verdict).toBe("PASS");
  });

  it("INDETERMINATE SIDE-002 when no stateProbe configured", async () => {
    const client = fakeClient({ x: {} });
    const r = await runSideEffectsSuite(
      client,
      tool("x", "ro tool", { readOnlyHint: true }),
      baseConfig
    );
    expect(r.verdict).toBe("INDETERMINATE");
    expect(r.findings).toContain("SIDE-002");
  });

  it("FAIL SIDE-001 when state changes", async () => {
    let calls = 0;
    const client = {
      callTool: async ({ name }: { name: string }) => {
        if (name === "list") {
          calls++;
          return { count: calls };
        }
        return { content: [{ type: "text", text: "{}" }] };
      }
    } as unknown as Client;
    const cfg: Config = {
      ...baseConfig,
      probes: [
        {
          name: "ro_tool",
          args: {},
          stateProbe: { tool: "list", args: {} }
        }
      ]
    };
    const r = await runSideEffectsSuite(
      client,
      tool("ro_tool", "x", { readOnlyHint: true }),
      cfg
    );
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("SIDE-001");
  });

  it("PASS when stateProbe shows no change", async () => {
    const client = {
      callTool: async () => ({ count: 0 })
    } as unknown as Client;
    const cfg: Config = {
      ...baseConfig,
      probes: [
        { name: "ro", args: {}, stateProbe: { tool: "list", args: {} } }
      ]
    };
    const r = await runSideEffectsSuite(
      client,
      tool("ro", "x", { readOnlyHint: true }),
      cfg
    );
    expect(r.verdict).toBe("PASS");
  });
});

describe("dsgvo suite", () => {
  const fakeAny = {} as Client;

  it("PASS when description mentions data handling", async () => {
    const r = await runDsgvoSuite(
      fakeAny,
      tool("x", "writes user data, retention 30 days, gdpr-compliant deletion"),
      baseConfig
    );
    expect(r.verdict).toBe("PASS");
  });

  it("FAIL DSGVO-001 for destructive without docs", async () => {
    const r = await runDsgvoSuite(
      fakeAny,
      tool("delete", "removes a thing", { destructiveHint: true }),
      baseConfig
    );
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("DSGVO-001");
  });

  it("WARN DSGVO-002 when description lacks keywords", async () => {
    const r = await runDsgvoSuite(
      fakeAny,
      tool("noop", "does nothing of consequence"),
      baseConfig
    );
    expect(r.verdict).toBe("WARN");
    expect(r.findings).toContain("DSGVO-002");
  });

  // Regression: keywords were matched as raw substrings, so a destructive tool
  // with NO real data-handling docs slipped through whenever a keyword happened
  // to be a substring of an unrelated word ("stored" in "restored"). That is a
  // false negative — the worst kind for a conformance verdict.
  it("FAIL DSGVO-001 when keyword only appears as a substring of another word", async () => {
    const r = await runDsgvoSuite(
      fakeAny,
      tool("restore", "Restored the backup snapshot.", { destructiveHint: true }),
      baseConfig
    );
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("DSGVO-001");
  });

  it("FAIL DSGVO-001 for 'understorage' (no word-boundary keyword match)", async () => {
    const r = await runDsgvoSuite(
      fakeAny,
      tool("x", "Handles understorage edge cases.", { destructiveHint: true }),
      baseConfig
    );
    expect(r.verdict).toBe("FAIL");
    expect(r.findings).toContain("DSGVO-001");
  });

  it("WARN DSGVO-002 when a non-destructive tool only substring-matches a keyword", async () => {
    const r = await runDsgvoSuite(
      fakeAny,
      tool("x", "Restored the previous view."),
      baseConfig
    );
    expect(r.verdict).toBe("WARN");
    expect(r.findings).toContain("DSGVO-002");
  });

  it("PASS when a multi-word phrase keyword is present", async () => {
    const r = await runDsgvoSuite(
      fakeAny,
      tool("x", "Documents data-flow and personal data retention.", {
        destructiveHint: true
      }),
      baseConfig
    );
    expect(r.verdict).toBe("PASS");
    expect(r.findings).toEqual([]);
  });

  it("PASS when a real keyword appears as a standalone word", async () => {
    const r = await runDsgvoSuite(
      fakeAny,
      tool("x", "Data is stored in memory only; gdpr deletion supported.", {
        destructiveHint: true
      }),
      baseConfig
    );
    expect(r.verdict).toBe("PASS");
  });
});
