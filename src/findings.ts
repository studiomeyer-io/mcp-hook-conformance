export type Severity = "PASS" | "WARN" | "FAIL" | "INDETERMINATE";

export interface FindingDef {
  code: string;
  suite: "idempotency" | "latency" | "determinism" | "side-effects" | "dsgvo";
  severity: Severity;
  title: string;
  remediation: string;
}

export const FINDINGS: Record<string, FindingDef> = {
  "IDEMP-001": {
    code: "IDEMP-001",
    suite: "idempotency",
    severity: "FAIL",
    title: "Tool output diverges across identical calls",
    remediation:
      "The tool returned different results for identical inputs across N runs. " +
      "If divergence is expected (live data), set the annotation `nondeterministic: true` " +
      "in the tool's metadata so hook orchestrators can opt out of caching."
  },
  "IDEMP-002": {
    code: "IDEMP-002",
    suite: "idempotency",
    severity: "WARN",
    title: "Response contains timestamps without `nondeterministic` annotation",
    remediation:
      "Detected ISO timestamps in response payload. Either remove timestamps " +
      "from response, or annotate the tool with `nondeterministic: true`. " +
      "Without the annotation, hook caching layers may serve stale data."
  },
  "IDEMP-003": {
    code: "IDEMP-003",
    suite: "idempotency",
    severity: "WARN",
    title: "Response contains UUID/random IDs without `nondeterministic` annotation",
    remediation:
      "Detected UUID-shaped strings in response. Hooks rerunning this tool " +
      "will see different IDs each call. Annotate as nondeterministic or " +
      "make IDs derivable from inputs (deterministic hashing)."
  },
  "LAT-001": {
    code: "LAT-001",
    suite: "latency",
    severity: "FAIL",
    title: "Tool exceeded p95 latency budget",
    remediation:
      "p95 roundtrip exceeded the configured threshold (default 60000 ms). " +
      "Claude Code v2.1.118 mcp_tool hooks default-timeout is 60s and the " +
      "user-blocking Stop+PreCompact path is sensitive to latency. Consider " +
      "splitting into setup+poll, returning early, or caching."
  },
  "LAT-002": {
    code: "LAT-002",
    suite: "latency",
    severity: "WARN",
    title: "Tool p50 latency above 30 seconds",
    remediation:
      "p50 roundtrip above 30 seconds. Acceptable for non-blocking events " +
      "(SessionStart) but blocks UserPromptSubmit and Stop. Document the " +
      "expected runtime in the tool description and avoid using this tool " +
      "from synchronous lifecycle events."
  },
  "DET-001": {
    code: "DET-001",
    suite: "determinism",
    severity: "FAIL",
    title: "Floating-point output drift between calls",
    remediation:
      "Floating-point values diverged across runs (likely time-derived). " +
      "Either round to a stable precision in the tool, or annotate as " +
      "nondeterministic so hooks know not to compare directly."
  },
  "DET-002": {
    code: "DET-002",
    suite: "determinism",
    severity: "WARN",
    title: "Response shape varies between calls",
    remediation:
      "The set of keys in the response object changed between calls. " +
      "Stabilize the schema (always emit all keys, use null for missing) so " +
      "downstream hook consumers can rely on the shape."
  },
  "SIDE-001": {
    code: "SIDE-001",
    suite: "side-effects",
    severity: "FAIL",
    title: "Read-only tool produced state delta",
    remediation:
      "Tool is annotated `readOnlyHint: true` but the state-probe detected " +
      "a delta after the call. Either remove the readOnlyHint annotation " +
      "(if writes are intentional) or move the write behind an explicit " +
      "user-trigger gate."
  },
  "SIDE-002": {
    code: "SIDE-002",
    suite: "side-effects",
    severity: "INDETERMINATE",
    title: "No state-probe configured for side-effect detection",
    remediation:
      "No `stateProbe` was configured for this tool, so we cannot verify " +
      "whether the call mutated server state. Add a probe entry to the " +
      "config, or accept this as INDETERMINATE for v0.1."
  },
  "DSGVO-001": {
    code: "DSGVO-001",
    suite: "dsgvo",
    severity: "FAIL",
    title: "Destructive tool lacks deletion / retention documentation",
    remediation:
      "Tool is annotated `destructiveHint: true` but the description does " +
      "not document data flow, retention, or deletion. GDPR Article 5 + 17 " +
      "require this for any user-data-touching tool. Add a 'Data handling' " +
      "section to the tool description."
  },
  "DSGVO-002": {
    code: "DSGVO-002",
    suite: "dsgvo",
    severity: "WARN",
    title: "Tool description missing data-flow keywords",
    remediation:
      "Tool description lacks keywords like 'data', 'storage', 'retention', " +
      "'gdpr', 'dsgvo', 'deletion'. Heuristic only; not legal advice. " +
      "Consider adding explicit data-handling docs."
  }
};

export function explainFinding(code: string): FindingDef | undefined {
  return FINDINGS[code];
}

export function listFindingCodes(): string[] {
  return Object.keys(FINDINGS).sort();
}
