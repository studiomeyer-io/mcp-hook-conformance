import { describe, expect, it } from "vitest";
import { execa } from "execa";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const TSX_BIN = resolve("node_modules/.bin/tsx");
const TSX_AVAILABLE = existsSync(TSX_BIN);
const CLI = resolve("src/cli.ts");

const skipIfNoTsx = TSX_AVAILABLE ? describe : describe.skip;

skipIfNoTsx("CLI", () => {
  it("prints version-info", async () => {
    const r = await execa(TSX_BIN, [CLI, "version-info"]);
    expect(r.stdout).toContain("mcp-hook-conformance v");
    expect(r.stdout).toContain("MCP spec:");
    expect(r.exitCode).toBe(0);
  });

  it("explain returns code 0 for known finding", async () => {
    const r = await execa(TSX_BIN, [CLI, "explain", "IDEMP-001"]);
    expect(r.stdout).toContain("Code:     IDEMP-001");
    expect(r.stdout).toContain("Remediation:");
    expect(r.exitCode).toBe(0);
  });

  it("explain returns code 2 for unknown finding", async () => {
    const r = await execa(TSX_BIN, [CLI, "explain", "NOPE-999"], { reject: false });
    expect(r.exitCode).toBe(2);
  });

  it("init writes a config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mhc-"));
    try {
      await execa(TSX_BIN, [CLI, "init", "--server-name", "demo"], {
        cwd: dir
      });
      const text = await readFile(join(dir, "hook-conformance.config.json"), "utf8");
      const parsed = JSON.parse(text);
      expect(parsed.server.name).toBe("demo");
      expect(parsed.suites).toContain("idempotency");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("check returns 2 for missing config file", async () => {
    const r = await execa(TSX_BIN, [CLI, "check", "/no/such/file.json"], {
      reject: false
    });
    expect(r.exitCode).toBe(2);
  });

  it("check audits the mock server and returns 0 for an idempotent fixture", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mhc-"));
    try {
      const cfg = {
        server: {
          name: "mock",
          transport: "stdio",
          command: TSX_BIN,
          args: [resolve("tests/fixtures/mock-server.ts")],
          env: { MOCK_BEHAVIOR: "idempotent" }
        },
        suites: ["idempotency", "determinism"],
        tries: 2,
        toolFilter: ["get_count"],
        probes: [
          {
            name: "get_count",
            args: {},
            stateProbe: { tool: "get_count", args: {} }
          }
        ]
      };
      const cfgPath = join(dir, "config.json");
      await writeFile(cfgPath, JSON.stringify(cfg));
      const r = await execa(TSX_BIN, [CLI, "check", cfgPath, "--output", "json"], {
        reject: false
      });
      expect(r.exitCode).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.aggregateScore).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
