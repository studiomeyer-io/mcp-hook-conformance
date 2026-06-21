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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match keywords on word boundaries so substrings inside unrelated words don't
// count: "stored" must not match inside "restored", "delete" not inside
// "undeletable", "storage" not inside "understorage". A bare substring match
// caused false NEGATIVES — a destructive tool with no real data-handling docs
// could pass the suite just because its description happened to contain one of
// these letter-sequences. `\b` between digits/letters and word chars is fine
// for these lowercase keywords (including the hyphen/space phrases).
const DATA_KEYWORD_REGEX = new RegExp(
  `(?<![a-z0-9])(?:${DATA_KEYWORDS.map(escapeRegExp).join("|")})(?![a-z0-9])`,
  "i"
);

function descriptionMentionsDataHandling(description: string): boolean {
  return DATA_KEYWORD_REGEX.test(description);
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
