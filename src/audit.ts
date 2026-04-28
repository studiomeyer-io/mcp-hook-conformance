import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Config, SuiteName } from "./config.js";
import { listTools, type ToolDescriptor } from "./introspect.js";
import { runIdempotencySuite } from "./suites/idempotency.js";
import { runLatencySuite } from "./suites/latency.js";
import { runDeterminismSuite } from "./suites/determinism.js";
import { runSideEffectsSuite } from "./suites/side-effects.js";
import { runDsgvoSuite } from "./suites/dsgvo.js";
import {
  buildServerReport,
  scoreTool,
  type ServerReport,
  type SuiteResult,
  type ToolReport
} from "./scoring.js";

export type SuiteRunner = (
  client: Client,
  tool: ToolDescriptor,
  config: Config
) => Promise<SuiteResult>;

export const SUITE_RUNNERS: Record<SuiteName, SuiteRunner> = {
  idempotency: runIdempotencySuite,
  latency: runLatencySuite,
  determinism: runDeterminismSuite,
  "side-effects": runSideEffectsSuite,
  dsgvo: runDsgvoSuite
};

export async function auditServer(
  client: Client,
  serverName: string,
  config: Config
): Promise<ServerReport> {
  const tools = await listTools(client);
  const filtered = config.toolFilter
    ? tools.filter((t) => config.toolFilter!.includes(t.name))
    : tools;

  const toolReports: ToolReport[] = [];
  for (const tool of filtered) {
    const suiteResults: SuiteResult[] = [];
    for (const suite of config.suites) {
      const runner = SUITE_RUNNERS[suite];
      const result = await runner(client, tool, config);
      suiteResults.push(result);
    }
    toolReports.push({
      tool: tool.name,
      suiteResults,
      score: scoreTool(suiteResults)
    });
  }

  return buildServerReport(serverName, toolReports);
}
