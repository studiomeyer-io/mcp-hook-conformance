import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Config, ToolProbe } from "../config.js";
import type { ToolDescriptor } from "../introspect.js";
import { callTool } from "../introspect.js";
import type { SuiteResult } from "../scoring.js";
import { scoreSuite } from "../scoring.js";
import type { Severity } from "../findings.js";

function findProbe(probes: ToolProbe[], toolName: string): ToolProbe | undefined {
  return probes.find((p) => p.name === toolName);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

export async function runSideEffectsSuite(
  client: Client,
  tool: ToolDescriptor,
  config: Config
): Promise<SuiteResult> {
  // We only audit tools that claim to be read-only.
  // Destructive tools are expected to mutate state and are out of this suite's scope.
  if (tool.annotations.readOnlyHint !== true) {
    return {
      suite: "side-effects",
      verdict: "PASS",
      score: scoreSuite("PASS"),
      findings: [],
      details: {
        reason: "tool not annotated readOnlyHint=true, side-effect-on-read not applicable"
      }
    };
  }

  const probe = findProbe(config.probes, tool.name);
  if (probe?.stateProbe === undefined) {
    return {
      suite: "side-effects",
      verdict: "INDETERMINATE",
      score: scoreSuite("INDETERMINATE"),
      findings: ["SIDE-002"],
      details: { reason: "no stateProbe configured" }
    };
  }

  const args = probe.args;
  const stateProbeName = probe.stateProbe.tool;
  const stateProbeArgs = probe.stateProbe.args;

  let before: unknown;
  let after: unknown;
  try {
    before = await callTool(client, stateProbeName, stateProbeArgs);
    await callTool(client, tool.name, args);
    after = await callTool(client, stateProbeName, stateProbeArgs);
  } catch (err) {
    return {
      suite: "side-effects",
      verdict: "INDETERMINATE",
      score: scoreSuite("INDETERMINATE"),
      findings: [],
      details: { error: err instanceof Error ? err.message : String(err) }
    };
  }

  const equal = stableStringify(before) === stableStringify(after);
  const findings: string[] = [];
  let verdict: Severity = "PASS";

  if (!equal) {
    findings.push("SIDE-001");
    verdict = "FAIL";
  }

  return {
    suite: "side-effects",
    verdict,
    score: scoreSuite(verdict),
    findings,
    details: {
      stateProbe: stateProbeName,
      stateChanged: !equal
    }
  };
}
