import chalk from "chalk";
import { FINDINGS } from "../findings.js";
import type { ServerReport } from "../scoring.js";

function colorVerdict(verdict: string): string {
  switch (verdict) {
    case "PASS":
      return chalk.green(verdict);
    case "WARN":
      return chalk.yellow(verdict);
    case "FAIL":
      return chalk.red(verdict);
    case "INDETERMINATE":
      return chalk.gray(verdict);
    default:
      return verdict;
  }
}

function colorScore(score: number): string {
  if (score >= 80) return chalk.green(score.toString());
  if (score >= 60) return chalk.yellow(score.toString());
  return chalk.red(score.toString());
}

export function renderHuman(report: ServerReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`MCP Hook Conformance Report`));
  lines.push(`Server:      ${report.server}`);
  lines.push(`Generated:   ${report.generatedAt}`);
  lines.push(`Aggregate:   ${colorScore(report.aggregateScore)} / 100`);
  lines.push(
    `Suites:      ${chalk.green("PASS=" + report.summary.pass)}  ` +
      `${chalk.yellow("WARN=" + report.summary.warn)}  ` +
      `${chalk.red("FAIL=" + report.summary.fail)}  ` +
      `${chalk.gray("INDET=" + report.summary.indeterminate)}`
  );
  lines.push("");

  for (const t of report.toolReports) {
    lines.push(chalk.bold(`Tool: ${t.tool}`) + `  score=${colorScore(t.score)}`);
    for (const s of t.suiteResults) {
      lines.push(`  [${s.suite}] ${colorVerdict(s.verdict)}  score=${s.score}`);
      for (const code of s.findings) {
        const def = FINDINGS[code];
        if (def !== undefined) {
          lines.push(`    - ${chalk.bold(code)}: ${def.title}`);
          lines.push(`      remediation: ${def.remediation}`);
        } else {
          lines.push(`    - ${code}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
