import { performance } from "node:perf_hooks";
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

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length)
  );
  return sorted[idx] ?? 0;
}

export async function runLatencySuite(
  client: Client,
  tool: ToolDescriptor,
  config: Config
): Promise<SuiteResult> {
  const probe = findProbe(config.probes, tool.name);
  const args = probe?.args ?? {};
  const samples = 5;

  // Warmup call to amortize spawn / first-init overhead.
  try {
    await callTool(client, tool.name, args);
  } catch (err) {
    return {
      suite: "latency",
      verdict: "INDETERMINATE",
      score: scoreSuite("INDETERMINATE"),
      findings: [],
      details: {
        error: `warmup failed: ${err instanceof Error ? err.message : String(err)}`
      }
    };
  }

  const timings: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      await callTool(client, tool.name, args);
    } catch (err) {
      return {
        suite: "latency",
        verdict: "INDETERMINATE",
        score: scoreSuite("INDETERMINATE"),
        findings: [],
        details: {
          error: err instanceof Error ? err.message : String(err)
        }
      };
    }
    timings.push(performance.now() - start);
  }

  const p50 = percentile(timings, 50);
  const p95 = percentile(timings, 95);

  const findings: string[] = [];
  let verdict: Severity = "PASS";

  if (p95 > config.thresholds.latencyP95Ms) {
    findings.push("LAT-001");
    verdict = "FAIL";
  } else if (p50 > config.thresholds.latencyP50Ms) {
    findings.push("LAT-002");
    verdict = "WARN";
  }

  return {
    suite: "latency",
    verdict,
    score: scoreSuite(verdict),
    findings,
    details: {
      samples,
      p50Ms: Math.round(p50),
      p95Ms: Math.round(p95),
      timingsMs: timings.map((t) => Math.round(t))
    }
  };
}
