import { describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { runIdempotencySuite } from "../../src/suites/idempotency.js";
import { runLatencySuite } from "../../src/suites/latency.js";
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
});
