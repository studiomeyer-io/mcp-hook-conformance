import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Config } from "../config.js";
import type { ToolDescriptor } from "../introspect.js";
import type { SuiteResult } from "../scoring.js";
import { scoreSuite } from "../scoring.js";
import type { Severity } from "../findings.js";

const DATA_KEYWORDS = [
  "data flow",
  "data-flow",
  "retention",
  "delete",
  "deletion",
  "gdpr",
  "dsgvo",
  "personal data",
  "stored",
  "storage",
  "purged",
  "anonymized"
];

function descriptionMentionsDataHandling(description: string): boolean {
  const lower = description.toLowerCase();
  return DATA_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function runDsgvoSuite(
  _client: Client,
  tool: ToolDescriptor,
  _config: Config
): Promise<SuiteResult> {
  const findings: string[] = [];
  let verdict: Severity = "PASS";
  const description = tool.description;
  const isDestructive = tool.annotations.destructiveHint === true;
  const mentionsData = descriptionMentionsDataHandling(description);

  if (isDestructive && !mentionsData) {
    findings.push("DSGVO-001");
    verdict = "FAIL";
  } else if (!mentionsData) {
    findings.push("DSGVO-002");
    verdict = "WARN";
  }

  return {
    suite: "dsgvo",
    verdict,
    score: scoreSuite(verdict),
    findings,
    details: {
      destructive: isDestructive,
      descriptionLength: description.length,
      mentionsDataHandling: mentionsData
    }
  };
}
