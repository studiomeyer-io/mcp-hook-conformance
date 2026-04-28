import type { ServerReport } from "../scoring.js";

export function renderJson(report: ServerReport): string {
  return JSON.stringify(report, null, 2);
}
