# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **determinism suite — false-positive `DET-001` on key-order changes.** Float
  values were collected in object key-insertion order and compared positionally,
  so a read-only tool returning identical numbers in a different key order
  (common: DB rows, JSON serializers) was wrongly flagged as floating-point
  drift. Floats are now keyed by their structural path and compared
  order-independently for object keys, while array element order stays
  significant. Genuine value drift, differing float counts, and array reorders
  still `FAIL`.
- **dsgvo suite — false-negative on substring keyword matches.** Data-handling
  keywords were matched as raw substrings, so a destructive tool with no real
  documentation could pass merely because a keyword appeared inside an unrelated
  word ("stored" in "restored", "delete" in "undeletable"). Keywords now match
  on word boundaries; multi-word phrases (`data flow`, `personal data`) are
  unaffected.
- **latency suite — off-by-one percentile selection.** `percentile()` used
  `floor(p/100 * N)` which selected the wrong nearest-rank sample whenever
  `p/100 * N` was an exact integer (e.g. p50 over 4 samples, p20/p40 over 5),
  shifting the p50/p95 verdict against the configured thresholds. Switched to the
  standard nearest-rank `ceil(p/100 * N)` definition.

### Added
- Test coverage for `auditServer` aggregation and error robustness (a tool whose
  calls fail now provably yields `INDETERMINATE` verdicts with finite scores
  instead of crashing), plus regression tests for all three fixes above and
  direct unit tests for the nearest-rank `percentile` helper. 56 → 82 tests.

## [0.1.1] - 2026-05-03

### Added
- `mcpName: "io.studiomeyer/hook-conformance"` field in `package.json` — required for MCP Registry publish (HTTP 400 without it).

### Notes
- No code changes. Pure metadata patch to enable Official MCP Registry listing.

## [0.1.0] - 2026-04-28

### Added
- Initial release.
- CLI binary `mcp-hook-conformance` with subcommands: `check`, `init`, `explain`, `version`.
- Five audit suites: `idempotency`, `latency`, `determinism`, `side-effects`, `dsgvo`.
- Output formats: `human`, `json`, `junit`.
- Hook-friendliness scoring 0-100, weighted across suites.
- Finding-code registry with remediation hints (codes IDEMP-*, LAT-*, DET-*, SIDE-*, DSGVO-*).
- Stdio transport via `@modelcontextprotocol/sdk` 1.29.0.
- Mock MCP server fixture for unit and integration tests.
- Reference smoke-tests against `mcp-nex@3.16.5` and `mcp-crm@2.8.1`, opt-in via `RUN_SMOKE_TESTS=1`.
- MCP spec version 2025-06-18, Claude Code mcp_tool lifecycle-hook compatibility starting v2.1.118.
