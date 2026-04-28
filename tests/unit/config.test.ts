import { describe, expect, it } from "vitest";
import { ConfigSchema, parseConfig, ALL_SUITES } from "../../src/config.js";

describe("ConfigSchema", () => {
  it("accepts a minimal valid stdio config", () => {
    const cfg = parseConfig({
      server: {
        name: "mock",
        transport: "stdio",
        command: "node",
        args: ["fixture.js"]
      }
    });
    expect(cfg.suites).toEqual(ALL_SUITES);
    expect(cfg.tries).toBe(3);
    expect(cfg.thresholds.latencyP50Ms).toBe(30000);
    expect(cfg.thresholds.latencyP95Ms).toBe(60000);
  });

  it("accepts a valid http config", () => {
    const cfg = parseConfig({
      server: {
        name: "mock",
        transport: "http",
        url: "https://example.invalid/mcp"
      }
    });
    expect(cfg.server.transport).toBe("http");
  });

  it("rejects when server is missing", () => {
    expect(() => parseConfig({})).toThrow();
  });

  it("rejects an unknown transport", () => {
    expect(() =>
      parseConfig({
        server: { name: "mock", transport: "carrier-pigeon" }
      })
    ).toThrow();
  });

  it("rejects an unknown suite name", () => {
    expect(() =>
      parseConfig({
        server: {
          name: "mock",
          transport: "stdio",
          command: "node"
        },
        suites: ["not-a-suite"]
      })
    ).toThrow();
  });

  it("rejects tries below 2", () => {
    expect(() =>
      parseConfig({
        server: { name: "mock", transport: "stdio", command: "node" },
        tries: 1
      })
    ).toThrow();
  });

  it("rejects http config without a URL", () => {
    expect(() =>
      parseConfig({
        server: { name: "mock", transport: "http" }
      })
    ).toThrow();
  });

  it("accepts probes with stateProbe", () => {
    const cfg = parseConfig({
      server: { name: "mock", transport: "stdio", command: "node" },
      probes: [
        {
          name: "search",
          args: { query: "x" },
          stateProbe: { tool: "list", args: {} }
        }
      ]
    });
    expect(cfg.probes).toHaveLength(1);
    expect(cfg.probes[0]?.stateProbe?.tool).toBe("list");
  });
});

describe("ConfigSchema introspection", () => {
  it("schema includes all 5 suite names", () => {
    expect(ALL_SUITES).toEqual([
      "idempotency",
      "latency",
      "determinism",
      "side-effects",
      "dsgvo"
    ]);
  });

  it("ConfigSchema is a Zod schema", () => {
    expect(typeof ConfigSchema.parse).toBe("function");
  });
});
