# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
