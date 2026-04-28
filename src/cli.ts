#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { auditServer } from "./audit.js";
import { ALL_SUITES, parseConfig, type Config, type SuiteName } from "./config.js";
import { connectToServer } from "./spawn.js";
import { renderHuman } from "./report/human.js";
import { renderJson } from "./report/json.js";
import { renderJunit } from "./report/junit.js";
import { explainFinding, listFindingCodes } from "./findings.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };
const VERSION = pkg.version;
const MCP_SPEC = "2025-06-18";
const CLAUDE_CODE_MIN = "2.1.118";

const EXIT_OK = 0;
const EXIT_AUDIT_FAIL = 1;
const EXIT_CONFIG_ERROR = 2;

function parseSuiteOption(value: string): SuiteName[] {
  if (value === "all") return [...ALL_SUITES];
  const parts = value.split(",").map((s) => s.trim()) as SuiteName[];
  for (const p of parts) {
    if (!ALL_SUITES.includes(p)) {
      throw new Error(`Unknown suite: ${p}. Valid: ${ALL_SUITES.join(", ")}`);
    }
  }
  return parts;
}

const program = new Command();
program
  .name("mcp-hook-conformance")
  .description(
    "Audit any MCP server for Claude Code v" +
      CLAUDE_CODE_MIN +
      " mcp_tool lifecycle-hook readiness."
  )
  .version(VERSION);

program
  .command("check")
  .description("Run hook-conformance audit against a configured MCP server.")
  .argument("<config-path>", "Path to hook-conformance.config.json")
  .option("-o, --output <fmt>", "Output format: human | json | junit", "human")
  .option(
    "-s, --suite <names>",
    "Comma-separated suite names or 'all'",
    "all"
  )
  .option("-t, --tool <name>", "Audit only one tool (overrides toolFilter in config)")
  .option("--tries <n>", "Override tries-per-tool", (v: string) => parseInt(v, 10))
  .action(async (configPath: string, opts: {
    output: string;
    suite: string;
    tool?: string;
    tries?: number;
  }) => {
    const absPath = resolve(configPath);
    if (!existsSync(absPath)) {
      console.error(`Config file not found: ${absPath}`);
      process.exit(EXIT_CONFIG_ERROR);
    }
    let raw: unknown;
    try {
      const text = await readFile(absPath, "utf8");
      raw = JSON.parse(text);
    } catch (err) {
      console.error(
        `Failed to read/parse config: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(EXIT_CONFIG_ERROR);
    }

    let config: Config;
    try {
      config = parseConfig(raw);
    } catch (err) {
      console.error(
        `Config validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(EXIT_CONFIG_ERROR);
    }

    try {
      const suites = parseSuiteOption(opts.suite);
      config = { ...config, suites };
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(EXIT_CONFIG_ERROR);
    }

    if (opts.tool !== undefined) {
      config = { ...config, toolFilter: [opts.tool] };
    }
    if (opts.tries !== undefined && Number.isFinite(opts.tries)) {
      config = { ...config, tries: opts.tries };
    }

    const conn = await connectToServer(config.server);
    let exitCode = EXIT_OK;
    let shutdownErr: Error | undefined;
    try {
      const report = await auditServer(conn.client, config.server.name, config);
      let rendered: string;
      switch (opts.output) {
        case "json":
          rendered = renderJson(report);
          break;
        case "junit":
          rendered = renderJunit(report);
          break;
        case "human":
        default:
          rendered = renderHuman(report);
          break;
      }
      process.stdout.write(rendered + "\n");
      if (report.summary.fail > 0) {
        exitCode = EXIT_AUDIT_FAIL;
      }
    } catch (err) {
      console.error(
        `Audit failed: ${err instanceof Error ? err.message : String(err)}`
      );
      exitCode = EXIT_AUDIT_FAIL;
    } finally {
      try {
        await conn.close();
      } catch (err) {
        shutdownErr = err instanceof Error ? err : new Error(String(err));
      }
    }
    if (shutdownErr) {
      console.error(`Warning: shutdown error: ${shutdownErr.message}`);
    }
    process.exit(exitCode);
  });

program
  .command("init")
  .description("Scaffold an example hook-conformance.config.json in the current directory.")
  .option("-n, --server-name <name>", "Server name", "my-mcp-server")
  .option("-f, --force", "Overwrite existing file", false)
  .action(async (opts: { serverName: string; force: boolean }) => {
    const target = resolve(process.cwd(), "hook-conformance.config.json");
    if (existsSync(target) && !opts.force) {
      console.error(
        `Refusing to overwrite ${target}. Use --force to overwrite.`
      );
      process.exit(EXIT_CONFIG_ERROR);
    }
    const example = {
      $schema:
        "https://studiomeyer-io.github.io/mcp-hook-conformance/config.schema.json",
      server: {
        name: opts.serverName,
        transport: "stdio",
        command: "npx",
        args: ["-y", opts.serverName],
        env: {}
      },
      suites: ALL_SUITES,
      tries: 3,
      thresholds: {
        latencyP50Ms: 30000,
        latencyP95Ms: 60000
      },
      probes: []
    };
    await writeFile(target, JSON.stringify(example, null, 2) + "\n", "utf8");
    console.log(`Wrote ${target}`);
    process.exit(EXIT_OK);
  });

program
  .command("explain")
  .description("Explain a finding code (e.g. IDEMP-001) and show remediation.")
  .argument("<code>", "Finding code")
  .action((code: string) => {
    const def = explainFinding(code.toUpperCase());
    if (def === undefined) {
      console.error(`Unknown finding code: ${code}`);
      console.error(`Known codes: ${listFindingCodes().join(", ")}`);
      process.exit(EXIT_CONFIG_ERROR);
    }
    console.log(`Code:     ${def.code}`);
    console.log(`Suite:    ${def.suite}`);
    console.log(`Severity: ${def.severity}`);
    console.log(`Title:    ${def.title}`);
    console.log("");
    console.log("Remediation:");
    console.log(`  ${def.remediation}`);
    process.exit(EXIT_OK);
  });

program
  .command("version-info")
  .alias("version")
  .description("Print tool version and supported MCP-spec range.")
  .action(() => {
    console.log(`mcp-hook-conformance v${VERSION}`);
    console.log(`MCP spec:        ${MCP_SPEC}`);
    console.log(`Claude Code min: ${CLAUDE_CODE_MIN} (mcp_tool hooks)`);
    process.exit(EXIT_OK);
  });

let sigintCount = 0;
process.on("SIGINT", () => {
  sigintCount++;
  if (sigintCount >= 2) process.exit(130);
  console.error("Press Ctrl+C again to force exit.");
});
process.on("SIGTERM", () => {
  process.exit(143);
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(EXIT_CONFIG_ERROR);
});
