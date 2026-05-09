<!-- studiomeyer-mcp-stack-banner:start -->
> **Part of the [StudioMeyer MCP Stack](https://studiomeyer.io)** — Built in Mallorca 🌴 · ⭐ if you use it
<!-- studiomeyer-mcp-stack-banner:end -->

# mcp-hook-conformance


<!-- badges -->
[![npm version](https://img.shields.io/npm/v/mcp-hook-conformance?style=flat-square&color=cb3837&logo=npm&label=npm)](https://www.npmjs.com/package/mcp-hook-conformance)
[![npm downloads](https://img.shields.io/npm/dm/mcp-hook-conformance?style=flat-square&color=cb3837&logo=npm&label=installs%2Fmo)](https://www.npmjs.com/package/mcp-hook-conformance)
![License](https://img.shields.io/github/license/studiomeyer-io/mcp-hook-conformance?style=flat-square&color=22c55e&label=license)
![Last commit](https://img.shields.io/github/last-commit/studiomeyer-io/mcp-hook-conformance?style=flat-square&color=88c0d0&label=updated)
![GitHub stars](https://img.shields.io/github/stars/studiomeyer-io/mcp-hook-conformance?style=flat-square&color=ffd700&logo=github&label=stars)
<!-- /badges -->Test-harness CLI that audits any MCP server for Claude Code v2.1.118 `mcp_tool` lifecycle-hook readiness.

The third foundation pillar:
- `mcp-protocol-conformance` says: does the server speak the protocol?
- `mcp-server-attestation` says: who signed this server?
- `mcp-hook-conformance` says: is it safe to call this tool from a Stop, PreCompact, or UserPromptSubmit hook?

## A note from us

We have been building tools and systems for ourselves for the past two years. The fact that this repo is small and has few stars is not because it is new. It is because we only just decided to share what we have built. It is not a fresh experiment, it is a long story with a recent commit.

We love building things and sharing them. We do not love social media tactics, growth hacks, or chasing stars and followers. So this repo is small. The code is real, it gets used, issues get answered. Judge for yourself.

If it helps you, sharing, testing, and feedback help us. If it could be better, an issue is more useful. If you build something with it, tell us at hello@studiomeyer.io. That genuinely makes our day.

From a small studio in Palma de Mallorca.

## Install

```bash
npm install -g mcp-hook-conformance
```

Or run without install:

```bash
npx mcp-hook-conformance check ./hook-conformance.config.json
```

## Quick start

```bash
# 1. Scaffold a config
npx mcp-hook-conformance init --server-name my-mcp-server

# 2. Edit hook-conformance.config.json (point command/args at your server)

# 3. Run the audit
npx mcp-hook-conformance check ./hook-conformance.config.json
```

Exit codes:
- `0` audit passed (no FAILs)
- `1` audit produced at least one FAIL
- `2` config error (missing file, invalid schema, unknown suite name)

## Subcommands

| Subcommand | Args | Description |
|---|---|---|
| `check` | `<config-path> [--output=human\|json\|junit] [--suite=...] [--tool=<name>] [--tries=<n>]` | Run audit; emits report to stdout. |
| `init` | `[--server-name=<name>] [--force]` | Write example `hook-conformance.config.json` to cwd. |
| `explain` | `<finding-code>` | Print full explanation and remediation for a finding (e.g. `IDEMP-001`). |
| `version-info` | — | Print tool version and supported MCP-spec range. (Alias: `version`.) |

> **This is a CLI, not an MCP server.** Do NOT run `mcp-hook-conformance` via `mcp-inspector` — the package declares `mcp.specVersion` for the targets it audits, not because it speaks MCP itself. Inspector will EACCES on `dist/index.js` (which is the library export) by design.

## Audit suites

| Suite | What it checks | Weight |
|---|---|---|
| `idempotency` | Same input N times produces same output, no UUIDs/timestamps unless annotated. | 30 |
| `side-effects` | Read-only tools must not mutate server state. Requires `stateProbe` config. | 25 |
| `latency` | p50 < 30s, p95 < 60s (configurable). 5 samples after 1 warmup call. | 20 |
| `determinism` | Response shape stable across calls; no float drift. | 15 |
| `dsgvo` | Tool description mentions data flow / retention / deletion (heuristic). | 10 |

Suite scoring: `PASS = 100`, `WARN = 60`, `INDETERMINATE = 50`, `FAIL = 0`.
Tool score = weighted average across configured suites.
Aggregate score = mean of tool scores.

## Config format

```json
{
  "$schema": "https://studiomeyer-io.github.io/mcp-hook-conformance/config.schema.json",
  "server": {
    "name": "my-mcp-server",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "my-mcp-server"],
    "env": {}
  },
  "suites": ["idempotency", "latency", "determinism", "side-effects", "dsgvo"],
  "tries": 3,
  "thresholds": {
    "latencyP50Ms": 30000,
    "latencyP95Ms": 60000
  },
  "probes": [
    {
      "name": "search_things",
      "args": { "query": "audit-fixed-input" },
      "stateProbe": {
        "tool": "list_things",
        "args": {}
      }
    }
  ],
  "toolFilter": ["search_things", "get_thing"]
}
```

`probes` lets you pin specific arguments per tool and (for read-only tools) a `stateProbe` so the side-effects suite can detect mutations. Without a stateProbe the side-effects suite returns `INDETERMINATE` for that tool.

## Finding codes

| Code | Suite | Severity | Title |
|---|---|---|---|
| IDEMP-001 | idempotency | FAIL | Tool output diverges across identical calls |
| IDEMP-002 | idempotency | WARN | Response contains timestamps without `nondeterministic` annotation |
| IDEMP-003 | idempotency | WARN | Response contains UUID/random IDs without `nondeterministic` annotation |
| LAT-001 | latency | FAIL | Tool exceeded p95 latency budget |
| LAT-002 | latency | WARN | Tool p50 latency above 30 seconds |
| DET-001 | determinism | FAIL | Floating-point output drift between calls |
| DET-002 | determinism | WARN | Response shape varies between calls |
| SIDE-001 | side-effects | FAIL | Read-only tool produced state delta |
| SIDE-002 | side-effects | INDETERMINATE | No state-probe configured for side-effect detection |
| DSGVO-001 | dsgvo | FAIL | Destructive tool lacks deletion / retention documentation |
| DSGVO-002 | dsgvo | WARN | Tool description missing data-flow keywords |

Run `mcp-hook-conformance explain <code>` for full remediation text.

## Compatibility

| Component | Version |
|---|---|
| MCP spec | 2025-06-18 |
| Claude Code | >= 2.1.118 (mcp_tool lifecycle hooks) |
| Node | >= 20.0.0 |
| `@modelcontextprotocol/sdk` | ^1.29.0 |

Tested transports:
- stdio (primary)
- HTTP streamable (experimental, audit semantics same as stdio)

## Reference smoke tests

The `tests/smoke/` suite runs the audit against production tenants of mcp-nex and mcp-crm. Opt-in:

```bash
RUN_SMOKE_TESTS=1 npm run test:smoke
```

Snapshot drift triggers a manual review, not a CI fail.

## Limitations (read these)

- **Side-effect detection is not hermetic.** Without a `stateProbe` we cannot black-box prove a read-only tool is pure. We return `INDETERMINATE` instead of false-positive FAIL.
- **Latency is end-to-end stdio roundtrip.** Includes JSON-RPC framing, not pure compute.
- **DSGVO suite is keyword heuristic.** It catches missing docs reliably; "looks compliant" is not legal advice.
- **No auto-fix.** This tool reports findings; you fix them.

## About StudioMeyer

[StudioMeyer](https://studiomeyer.io) is an AI and design studio based in Palma de Mallorca, working with clients worldwide. We build custom websites and AI infrastructure for small and medium businesses. Production stack on Claude Agent SDK, MCP and n8n, with Sentry, Langfuse and LangGraph for observability and an in-house guard layer.

## License

[MIT](./LICENSE) &copy; 2026 Matthias Meyer (StudioMeyer)