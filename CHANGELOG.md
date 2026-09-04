# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **`fast-uri` override corrected to `^3.1.7`.** It stood at `>=3.1.2`, an open
  lower bound that permitted exactly the versions four advisories were about
  (GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf,
  GHSA-jqff-g426-hqxp). The installed version was in the vulnerable range.

  The second effect was the more expensive one: Dependabot does not touch an
  override, so it could not open a PR here at all while twenty other
  repositories got theirs. A repository without a Dependabot PR can be worse
  off than one with.

  Measured before setting the new bound: across all 25 lockfiles in this
  organisation, `fast-uri` is requested by `ajv` and nothing else, with
  `^3.0.1`. `^3.1.7` is patched and stays inside that range, which the proposed
  jump to 4.1.4 would have left. Verified at runtime afterwards, not just in
  the lockfile: `ajv` resolves to 3.1.7, `parse()` runs.

- **`qs` raised to 6.16.0** in the same commit (GHSA-x5fp-wj9c-mxmx).

## [0.1.3] - 2026-07-05

### Fixed
- **determinism suite — false-positive `DET-001` on key-order changes.** Float
  values were collected in object key-insertion order and compared positionally,
  so a read-only tool returning identical numbers in a different key order
  (common: DB rows, JSON serializers) was wrongly flagged as floating-point
  drift. Floats are now keyed by their structural path and compared
  order-independently for object keys; array element order stays significant.
- **dsgvo suite — false-negative on substring keyword matches.** Data-handling
  keywords were matched as raw substrings, so a destructive tool with no real
  documentation could pass merely because a keyword appeared inside an unrelated
  word ("stored" in "restored", "delete" in "undeletable"). Keywords now match
  on word boundaries; the hyphen/space phrases (`data flow`, `personal data`)
  are unaffected.
- **latency suite — off-by-one percentile selection.** `percentile()` used
  `floor((p/100)*N)`, off by one on exact-integer ranks (p50 over 4 samples,
  p20 over 5) and reliant on the min-clamp for p=100. Now nearest-rank
  `ceil((p/100)*N)`. `percentile` is now exported.

### Changed
- Restored `mcpName: io.studiomeyer/hook-conformance` for the MCP Registry.
- Retains the `overrides.fast-uri >=3.1.2` supply-chain hardening (S1019b).

### Note
- Supersedes 0.1.2, which shipped the three fixes above to npm on 2026-06-21 but
  WITHOUT committing its TypeScript source back to the canonical
  `mcp-factory/builds/` tree (S1169-class publish-without-source-sync). 0.1.3
  re-implements those fixes from the 0.1.2 dist into the canonical source, keeps
  the local hardening, and reconciles the tree with npm. Source of truth is git again.

## [0.1.2] - 2026-06-21

### Fixed
- determinism DET-001 (key-order), dsgvo word-boundary matching, latency
  percentile off-by-one. **Published to npm without a source commit** (see the
  0.1.3 note) — the TypeScript source of this tag was not preserved in the
  canonical tree; build 0.1.3 or later instead.

## [0.1.1] - 2026-05-03

### Changed
- Patch release for MCP Registry submission (S977 mcpName + Sensitivity-Patches recipe).
- Published to npm 2026-05-03 12:33 UTC. Canonical bumped 2026-05-09 (S1019) to close
  CTO inventory drift report between canonical (was 0.1.0) and npm (0.1.1).
- No code changes vs 0.1.0; same 56/56 vitest suite, same MCP spec 2025-06-18 floor,
  same Claude Code minimum 2.1.118.

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
