import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { connectToServer } from "../../src/spawn.js";
import { auditServer } from "../../src/audit.js";
import { ALL_SUITES } from "../../src/config.js";
import type { Config } from "../../src/config.js";

const TSX_BIN = resolve("node_modules/.bin/tsx");
const TSX_AVAILABLE = existsSync(TSX_BIN);
const FIXTURE = resolve("tests/fixtures/mock-server.ts");

const skipIfNoTsx = TSX_AVAILABLE ? describe : describe.skip;

function makeConfig(behavior: string): Config {
  return {
    server: {
      name: `mock-${behavior}`,
      transport: "stdio",
      command: TSX_BIN,
      args: [FIXTURE],
      env: { MOCK_BEHAVIOR: behavior }
    },
    suites: [...ALL_SUITES],
    tries: 3,
    thresholds: { latencyP50Ms: 30000, latencyP95Ms: 60000 },
    probes: [
      {
        name: "get_count",
        args: {},
        stateProbe: { tool: "get_count", args: {} }
      }
    ]
  };
}

skipIfNoTsx("mock-server integration", () => {
  it("audits an idempotent mock server", async () => {
    const cfg = makeConfig("idempotent");
    const conn = await connectToServer(cfg.server);
    try {
      const report = await auditServer(conn.client, cfg.server.name, cfg);
      expect(report.toolReports.length).toBeGreaterThan(0);
      const get = report.toolReports.find((t) => t.tool === "get_count");
      expect(get).toBeDefined();
      const idempVerdict = get?.suiteResults.find(
        (s) => s.suite === "idempotency"
      )?.verdict;
      expect(idempVerdict).toBe("PASS");
    } finally {
      await conn.close();
    }
  }, 30000);

  it("flags a non-idempotent mock server", async () => {
    const cfg = makeConfig("nonidempotent");
    const conn = await connectToServer(cfg.server);
    try {
      const report = await auditServer(conn.client, cfg.server.name, cfg);
      const get = report.toolReports.find((t) => t.tool === "get_count");
      const idempResult = get?.suiteResults.find(
        (s) => s.suite === "idempotency"
      );
      expect(idempResult?.verdict).toBe("FAIL");
      expect(idempResult?.findings).toContain("IDEMP-001");
    } finally {
      await conn.close();
    }
  }, 30000);

  it("flags destructive tool without dsgvo docs", async () => {
    const cfg = makeConfig("destructive-no-doc");
    const conn = await connectToServer(cfg.server);
    try {
      const report = await auditServer(conn.client, cfg.server.name, cfg);
      const del = report.toolReports.find((t) => t.tool === "delete_user");
      const dsgvoResult = del?.suiteResults.find((s) => s.suite === "dsgvo");
      expect(dsgvoResult?.verdict).toBe("FAIL");
      expect(dsgvoResult?.findings).toContain("DSGVO-001");
    } finally {
      await conn.close();
    }
  }, 30000);
});
