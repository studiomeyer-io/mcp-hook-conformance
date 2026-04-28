import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Config, ToolProbe } from "../config.js";
import type { ToolDescriptor } from "../introspect.js";
import { callTool } from "../introspect.js";
import type { SuiteResult } from "../scoring.js";
import { scoreSuite } from "../scoring.js";
import type { Severity } from "../findings.js";

const ISO_TIMESTAMP_REGEX =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/;
const UUID_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      const obj = v as Record<string, unknown>;
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
      }
      return sorted;
    }
    return v;
  });
}

function findProbe(
  probes: ToolProbe[],
  toolName: string
): ToolProbe | undefined {
  return probes.find((p) => p.name === toolName);
}

export async function runIdempotencySuite(
  client: Client,
  tool: ToolDescriptor,
  config: Config
): Promise<SuiteResult> {
  const probe = findProbe(config.probes, tool.name);
  const args = probe?.args ?? {};

  if (tool.annotations.nondeterministic === true) {
    return {
      suite: "idempotency",
      verdict: "PASS",
      score: scoreSuite("PASS"),
      findings: [],
      details: { reason: "tool annotated nondeterministic, idempotency check skipped" }
    };
  }

  const findings: string[] = [];
  const responses: string[] = [];
  const tries = config.tries;
  let callError: string | undefined;

  for (let i = 0; i < tries; i++) {
    try {
      const result = await callTool(client, tool.name, args);
      responses.push(stableStringify(result));
    } catch (err) {
      callError = err instanceof Error ? err.message : String(err);
      break;
    }
  }

  if (callError !== undefined) {
    return {
      suite: "idempotency",
      verdict: "INDETERMINATE",
      score: scoreSuite("INDETERMINATE"),
      findings: [],
      details: { error: callError }
    };
  }

  const first = responses[0];
  const allEqual = responses.every((r) => r === first);
  let verdict: Severity = "PASS";

  if (!allEqual) {
    findings.push("IDEMP-001");
    verdict = "FAIL";
  } else if (first !== undefined) {
    if (ISO_TIMESTAMP_REGEX.test(first) && tool.annotations.cacheable !== true) {
      findings.push("IDEMP-002");
      if (verdict === "PASS") verdict = "WARN";
    }
    if (UUID_REGEX.test(first) && tool.annotations.cacheable !== true) {
      findings.push("IDEMP-003");
      if (verdict === "PASS") verdict = "WARN";
    }
  }

  return {
    suite: "idempotency",
    verdict,
    score: scoreSuite(verdict),
    findings,
    details: { tries, allEqual }
  };
}
