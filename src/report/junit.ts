import type { ServerReport } from "../scoring.js";
import { FINDINGS } from "../findings.js";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderJunit(report: ServerReport): string {
  const totalTests = report.toolReports.reduce(
    (acc, t) => acc + t.suiteResults.length,
    0
  );
  const failures = report.summary.fail;
  const skipped = report.summary.indeterminate;

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<testsuites name="mcp-hook-conformance" tests="${totalTests}" failures="${failures}" skipped="${skipped}">`
  );
  for (const t of report.toolReports) {
    lines.push(
      `  <testsuite name="${escapeXml(t.tool)}" tests="${t.suiteResults.length}">`
    );
    for (const s of t.suiteResults) {
      const testName = `${t.tool}.${s.suite}`;
      lines.push(`    <testcase classname="${escapeXml(t.tool)}" name="${escapeXml(s.suite)}">`);
      if (s.verdict === "FAIL") {
        const codeMessages = s.findings
          .map((c) => FINDINGS[c]?.title ?? c)
          .join("; ");
        lines.push(
          `      <failure message="${escapeXml(codeMessages)}">${escapeXml(JSON.stringify(s.findings))}</failure>`
        );
      } else if (s.verdict === "INDETERMINATE") {
        lines.push(`      <skipped/>`);
      } else if (s.verdict === "WARN") {
        const codeMessages = s.findings
          .map((c) => FINDINGS[c]?.title ?? c)
          .join("; ");
        lines.push(
          `      <system-out>WARN: ${escapeXml(codeMessages)} (${escapeXml(testName)})</system-out>`
        );
      }
      lines.push(`    </testcase>`);
    }
    lines.push(`  </testsuite>`);
  }
  lines.push(`</testsuites>`);
  return lines.join("\n");
}
