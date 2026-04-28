import type { SuiteName } from "./config.js";
import type { Severity } from "./findings.js";

export interface SuiteResult {
  suite: SuiteName;
  verdict: Severity;
  score: number;
  findings: string[];
  details: Record<string, unknown>;
}

export interface ToolReport {
  tool: string;
  suiteResults: SuiteResult[];
  score: number;
}

export interface ServerReport {
  server: string;
  generatedAt: string;
  toolReports: ToolReport[];
  aggregateScore: number;
  summary: {
    totalTools: number;
    pass: number;
    warn: number;
    fail: number;
    indeterminate: number;
  };
}

export const SUITE_WEIGHTS: Record<SuiteName, number> = {
  idempotency: 30,
  "side-effects": 25,
  latency: 20,
  determinism: 15,
  dsgvo: 10
};

export function verdictToScore(verdict: Severity): number {
  switch (verdict) {
    case "PASS":
      return 100;
    case "WARN":
      return 60;
    case "INDETERMINATE":
      return 50;
    case "FAIL":
      return 0;
  }
}

export function scoreSuite(verdict: Severity): number {
  return verdictToScore(verdict);
}

export function scoreTool(suiteResults: SuiteResult[]): number {
  if (suiteResults.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const r of suiteResults) {
    const weight = SUITE_WEIGHTS[r.suite];
    weightedSum += r.score * weight;
    weightTotal += weight;
  }
  if (weightTotal === 0) return 0;
  return Math.round(weightedSum / weightTotal);
}

export function aggregateScore(toolReports: ToolReport[]): number {
  if (toolReports.length === 0) return 0;
  const sum = toolReports.reduce((acc, t) => acc + t.score, 0);
  return Math.round(sum / toolReports.length);
}

export function summarize(toolReports: ToolReport[]): ServerReport["summary"] {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  let indeterminate = 0;
  for (const t of toolReports) {
    for (const s of t.suiteResults) {
      if (s.verdict === "PASS") pass++;
      else if (s.verdict === "WARN") warn++;
      else if (s.verdict === "FAIL") fail++;
      else indeterminate++;
    }
  }
  return {
    totalTools: toolReports.length,
    pass,
    warn,
    fail,
    indeterminate
  };
}

export function buildServerReport(
  server: string,
  toolReports: ToolReport[]
): ServerReport {
  return {
    server,
    generatedAt: new Date().toISOString(),
    toolReports,
    aggregateScore: aggregateScore(toolReports),
    summary: summarize(toolReports)
  };
}
