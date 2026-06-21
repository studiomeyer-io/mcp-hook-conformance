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

interface Shape {
  keys: string[];
  hasFloat: boolean;
}

function extractShape(value: unknown): Shape {
  const keys: Set<string> = new Set();
  let hasFloat = false;
  function walk(v: unknown, prefix: string): void {
    if (typeof v === "number" && !Number.isInteger(v)) {
      hasFloat = true;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${k}` : k;
        keys.add(path);
        walk(child, path);
      }
    } else if (Array.isArray(v) && v.length > 0) {
      walk(v[0], `${prefix}[0]`);
    }
  }
  walk(value, "");
  return { keys: [...keys].sort(), hasFloat };
}

/**
 * Collect every non-integer number keyed by its position in the structure.
 * Keying by path (and sorting by it) makes the comparison independent of
 * object key-insertion order: two responses with the same float values but
 * different key ordering must NOT be reported as drift. Array indices stay
 * positional because element order is semantically significant.
 */
function extractFloats(value: unknown): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  function walk(v: unknown, path: string): void {
    if (typeof v === "number") {
      if (!Number.isInteger(v)) out.push([path, v]);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (v && typeof v === "object") {
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        const child = (v as Record<string, unknown>)[key];
        walk(child, path ? `${path}.${key}` : key);
      }
    }
  }
  walk(value, "");
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

export async function runDeterminismSuite(
  client: Client,
  tool: ToolDescriptor,
  config: Config
): Promise<SuiteResult> {
  if (tool.annotations.nondeterministic === true) {
    return {
      suite: "determinism",
      verdict: "PASS",
      score: scoreSuite("PASS"),
      findings: [],
      details: { reason: "tool annotated nondeterministic, determinism check skipped" }
    };
  }

  const probe = findProbe(config.probes, tool.name);
  const args = probe?.args ?? {};

  const responses: unknown[] = [];
  for (let i = 0; i < config.tries; i++) {
    try {
      responses.push(await callTool(client, tool.name, args));
    } catch (err) {
      return {
        suite: "determinism",
        verdict: "INDETERMINATE",
        score: scoreSuite("INDETERMINATE"),
        findings: [],
        details: {
          error: err instanceof Error ? err.message : String(err)
        }
      };
    }
  }

  const shapes = responses.map(extractShape);
  const firstShape = shapes[0];
  const allShapesEqual =
    firstShape !== undefined &&
    shapes.every((s) => stableJoin(s.keys) === stableJoin(firstShape.keys));

  const floatSets = responses.map(extractFloats);
  const firstFloats = floatSets[0];
  const floatsDrift =
    firstFloats !== undefined &&
    floatSets.some(
      (set) =>
        set.length !== firstFloats.length ||
        set.some((entry, i) => {
          const ref = firstFloats[i];
          return ref === undefined || entry[0] !== ref[0] || entry[1] !== ref[1];
        })
    );

  const findings: string[] = [];
  let verdict: Severity = "PASS";

  if (floatsDrift) {
    findings.push("DET-001");
    verdict = "FAIL";
  } else if (!allShapesEqual) {
    findings.push("DET-002");
    verdict = "WARN";
  }

  return {
    suite: "determinism",
    verdict,
    score: scoreSuite(verdict),
    findings,
    details: {
      shapes: shapes.length,
      shapeStable: allShapesEqual,
      floatsDrift
    }
  };
}

function stableJoin(items: string[]): string {
  return items.join("|");
}
