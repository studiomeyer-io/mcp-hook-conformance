# PLAN — mcp-hook-conformance

> **Slug:** mcp-hook-conformance
> **Kind:** foundation
> **Created:** 2026-04-28
> **Architect:** mcp-factory-architect (Session 915)

## Mission

Test-harness CLI, das einen beliebigen MCP-Server gegen die Hook-Tauglichkeits-Anforderungen aus Claude Code v2.1.118 (mcp_tool Lifecycle-Hooks) prueft. Ergaenzt [mcp-protocol-conformance](https://github.com/studiomeyer-io/mcp-protocol-conformance) (was sagt der Server) und [mcp-server-attestation](https://github.com/studiomeyer-io/mcp-server-attestation) (wer hat ihn gebaut) als 3. Foundation-Pillar mit der Frage: "Darf ich dieses Tool aus einem Lifecycle-Hook (Stop, PreCompact, UserPromptSubmit, ...) heraus aufrufen?"

Zielgruppe: MCP-Server-Autoren, die Hook-Recipes-Bundles fuer den studiomeyer-io Marketplace publishen wollen, und CI-Pipelines die Recipe-Tools vor Release validieren.

## Scope

**IST drin:**
- CLI-Befehl `mcp-hook-conformance check <server-config-path>` mit Exit-Code semantics (0 = pass, 1 = fail, 2 = config-error).
- Spawn des Ziel-Servers per stdio (commander config: `{ command, args, env }`) oder HTTP (URL).
- Introspect via `tools/list`, dann pro Tool fuenf Suites laufen.
- 5 Audit-Suites (idempotency / latency / determinism / no-side-effect-on-read / dsgvo-doc).
- Hook-Friendliness-Score 0-100 (Aggregat) + per-Suite Verdict (PASS/WARN/FAIL) + Per-Tool-Score.
- Output-Formats: human (chalk), json, junit-xml (CI).
- Remediation-Hints pro FAIL ("Tool X persistiert auf Disk obwohl readOnlyHint=true gesetzt ist — fix: persist hinter explicit user-trigger gate").
- Reference-Smoke-Test gegen [mcp-nex@3.16.5](https://memory.studiomeyer.io) + [mcp-crm@2.8.1](https://crm.studiomeyer.io).

**IST NICHT drin:**
- Kein eigener MCP-Server-Modus (CLI-only in v0.1, MCP-Wrapper kann v0.2 werden).
- Keine Auto-Fixes — nur Findings + Remediation-Text.
- Keine HTTP-Streamable-Hook-Tests (Claude Code v2.1.118 mcp_tool ist client-stdio-only).
- Kein Patching der Server-Source — pure Black-Box-Audit ueber MCP-Protokoll + Tool-Annotations + README/manifest-Lookup.
- Kein Live-Performance-Profiling (Latency-Suite misst end-to-end via stdio-roundtrip, kein V8-Profiler).

## Tools

CLI-Subcommands (intern via [commander@14.0.3](https://www.npmjs.com/package/commander)):

| # | Subcommand | Args | Output | ReadOnly | Destructive |
|---|------------|------|--------|----------|-------------|
| 1 | `check` | `<server-config-path> [--output=human\|json\|junit] [--suite=all\|idempotency\|latency\|determinism\|side-effects\|dsgvo] [--tool=<name>] [--tries=N]` | exit-code + report | yes | no |
| 2 | `init` | `[--server-name=<name>]` | scaffold `hook-conformance.config.json` Beispiel | no (writes file) | no |
| 3 | `explain` | `<finding-code>` (z.B. `IDEMP-001`) | Detail-Erklaerung + remediation | yes | no |
| 4 | `version` | — | Tool-Version + supported MCP-Spec range | yes | no |

Audit-Suites (intern als Module, ueber CLI flag `--suite` ausgewaehlt):

| # | Suite | What it checks | How |
|---|-------|----------------|-----|
| 1 | `idempotency` | Same input N-times → same output, no cumulative side-effects | Call tool N times (default 3) with identical args, compare results structurally; flag tools whose output diverges OR whose response includes timestamps/random IDs without `cacheable:true` annotation |
| 2 | `latency` | p50 < 30s (synchronous Stop+PreCompact), p95 < 60s (default-Timeout) | Run tool 5 times, measure roundtrip; PASS <30s, WARN 30-60s, FAIL >60s |
| 3 | `determinism` | Same input → same output without uncached randomness | Detect floats/UUIDs/timestamps in response; cross-check against tool annotation (`nondeterministic: true` excluded) |
| 4 | `side-effect-free-on-read` | Tools with `readOnlyHint=true` MUST NOT persist on UserPromptSubmit | Run readOnly-tool, then introspect server-state via control-tool (if exists) OR via filesystem-watcher OR via mcp-nex/mcp-crm reference-API; FAIL if delta detected |
| 5 | `dsgvo-doc` | Tool description must declare data-flow / storage / deletion | Static analysis of tool description string + linked README sections; check for keywords (data-flow, retention, gdpr, deletion); WARN if missing, FAIL if `destructiveHint=true` ohne deletion-doc |

## Architecture

- **Server-Type:** Library (`src/index.ts`) + CLI-Binary (`src/cli.ts` mit shebang `#!/usr/bin/env node`)
- **Auth:** keine — Client-Side, spricht Ziel-Server entweder via stdio-spawn oder via HTTP-URL-aus-config
- **DB:** keine
- **External APIs:** keine fuer das Tool selbst. Ziel-Server kann beliebige APIs callen — out-of-scope.
- **MCP-Spec:** [2025-06-18](https://spec.modelcontextprotocol.io/) — verified via verify_mcp_spec_version (`currentReference: true`, features: tools-with-annotations + elicitation)
- **Module-Layout:**
  - `src/cli.ts` — commander entry, parseConfig, dispatch
  - `src/config.ts` — Zod-Schema fuer `hook-conformance.config.json`
  - `src/spawn.ts` — Ziel-Server starten (stdio via execa, HTTP via fetch)
  - `src/introspect.ts` — `tools/list` Roundtrip
  - `src/suites/idempotency.ts`
  - `src/suites/latency.ts`
  - `src/suites/determinism.ts`
  - `src/suites/side-effects.ts`
  - `src/suites/dsgvo.ts`
  - `src/scoring.ts` — 5-Suite-Scores → 0-100 Aggregat (gewichtet: idempotency 30, side-effects 25, latency 20, determinism 15, dsgvo 10)
  - `src/report/human.ts`, `src/report/json.ts`, `src/report/junit.ts`
  - `src/findings.ts` — Finding-Code-Registry mit Remediation-Texten
- **Config-File-Format** (`hook-conformance.config.json`):
  ```json
  {
    "$schema": "https://studiomeyer-io.github.io/mcp-hook-conformance/config.schema.json",
    "server": {
      "name": "my-server",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "my-mcp-server"],
      "env": {}
    },
    "suites": ["idempotency", "latency", "determinism", "side-effects", "dsgvo"],
    "tries": 3,
    "thresholds": { "latencyP95Ms": 60000, "latencyP50Ms": 30000 }
  }
  ```

## Distribution

- **npm package:** `mcp-hook-conformance` ([scope-frei, public](https://www.npmjs.com/), parallel zu `mcp-protocol-conformance`)
- **Repo:** `studiomeyer-io/mcp-hook-conformance` (PUBLIC, MIT) — verified via verify_github_namespace (`available: true`)
- **Marketplaces:** [mcp.so](https://mcp.so/) submit + [FastMCP Directory](https://github.com/punkpeye/fastmcp) submit. Anthropic Connector NICHT — das ist ein CLI, kein Server.
- **Hosting:** keiner (CLI-Tool)
- **Hook-Recipes-Bundle:** entfaellt — dieses Tool IST das Tool, das Hook-Tauglichkeit prueft. Keine eigenen Hook-Recipes (Selbst-Bezug). Stattdessen: CI-GitHub-Action `studiomeyer-io/mcp-hook-conformance-action@v1` (separater Build, out-of-scope).
- **Provenance:** npm publish via GitHub Actions OIDC (`--provenance` flag)

## Recommended Hook Recipes

**Begruendung fuer Auslassung:** Dieser Build ist ein CLI-Tool, kein laufender MCP-Server. Es exponiert keine MCP-Tools die in Claude-Code-Hook-Lifecycle-Events triggerbar sind. Die einzige Schnittstelle ist `npx mcp-hook-conformance check ...` als Subprozess. Use-Case fuer einen Hook waere "after Stop, run conformance audit" — das ist aber via Bash-Hook trivial loesbar (`Stop: bash -c "npx mcp-hook-conformance check ./config.json"`) und braucht keinen mcp_tool-Wrapper. Section daher leer (alle Tools sind CLI-Subcommands, keine MCP-Tools).

## Test Plan

**Unit Tests** (`tests/unit/*.test.ts`):
- Config-Schema-Validation (valid + 5 invalid Mutationen)
- Scoring-Aggregator (5 Suite-Scores → 0-100, Edge-Cases: alle 100, alle 0, mixed)
- Finding-Code-Registry-Lookup (alle 30+ Codes haben Remediation-Text)
- Each Suite: 2 PASS-Mocks + 2 FAIL-Mocks per Suite (Mock-Server via simple stdio-Echo)

**Integration Tests** (`tests/integration/*.test.ts`):
- Echter Subprozess-Spawn von einem Mini-Mock-MCP-Server (`tests/fixtures/mock-server.ts`) mit injizierbaren Tool-Verhalten (idempotent / non-idempotent / slow / random / persisting)
- CLI-End-to-End: `npx ts-node src/cli.ts check tests/fixtures/configs/*.json` und Exit-Code + JSON-Report-Shape pruefen
- Output-Format-Test: human / json / junit alle drei produzieren parsable output

**Reference-Tenant-Smoke-Tests** (`tests/smoke/*.test.ts`, opt-in per `RUN_SMOKE_TESTS=1`):
- Gegen `mcp-nex@3.16.5` (memory.studiomeyer.io, Tenant: factory-memory@aklow-labs.com): erwartet hoeheren Score auf side-effect-free, niedrigeren auf determinism (timestamps in observations)
- Gegen `mcp-crm@2.8.1` (crm.studiomeyer.io, Tenant: factory-crm@aklow-labs.com): erwartet hoher Score auf idempotency fuer GET-Tools, FAIL auf side-effects fuer add-Tools (was korrekt ist — die haben destructiveHint=true)
- Snapshot-Tests der Reports gegen committete Baseline (`tests/smoke/snapshots/*.json`); Drift = Review-Trigger

**MCP-Inspector Smoke:** N/A (kein MCP-Server, sondern CLI). Stattdessen: `npx mcp-hook-conformance --help` + `--version` + `init` smoke in CI.

**Real-API-Calls:** Smoke gegen Production-SaaS factory-Tenants. KEINE Mocks fuer die Smoke-Suite. Mock-Suite separat fuer Unit/Integration.

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^4.3.6",
    "commander": "^14.0.3",
    "chalk": "^5.6.2",
    "execa": "^9.6.1"
  },
  "devDependencies": {
    "@types/node": "^25.6.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.5"
  }
}
```

Inline-Citations (alle verifiziert via verify_npm_package am 2026-04-28):
- [@modelcontextprotocol/sdk@1.29.0](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — verified, latest 1.29.0
- [zod@4.3.6](https://www.npmjs.com/package/zod) — verified, latest 4.3.6
- [commander@14.0.3](https://www.npmjs.com/package/commander) — verified, latest 14.0.3 (initial ^12 plan rejected, bumped to ^14)
- [chalk@5.6.2](https://www.npmjs.com/package/chalk) — verified, latest 5.6.2
- [execa@9.6.1](https://www.npmjs.com/package/execa) — verified, latest 9.6.1
- [@types/node@25.6.0](https://www.npmjs.com/package/@types/node) — verified, latest 25.6.0 (initial ^22 plan rejected, bumped to ^25)
- [typescript@6.0.3](https://www.npmjs.com/package/typescript) — verified, latest 6.0.3 (initial ^5.6 plan rejected, bumped to ^6)
- [vitest@4.1.5](https://www.npmjs.com/package/vitest) — verified, latest 4.1.5 (initial ^2 plan rejected, bumped to ^4)

## Build Steps

1. **Skeleton** (per `get_convention_template`):
   - `package.json` (CLI-bin entry: `mcp-hook-conformance` → `dist/cli.js`)
   - `tsconfig.json` (strict, ES2022, NodeNext)
   - `vitest.config.ts`
   - `.github/workflows/ci.yml` (Node 20.x + 22.x)
   - `.gitignore`, `CHANGELOG.md` (Keep-a-Changelog `[0.1.0] - 2026-04-28`)
   - `README.md` (Install + Usage + Tool-Liste + Compatibility)
   - `LICENSE` (MIT, copyright `<OWNER>` = Matthias Meyer)
2. **Config-Schema** (`src/config.ts`): Zod-Schema + JSON-Schema-Export nach `dist/config.schema.json` (fuer `$schema`-Referenz)
3. **Spawn + Introspect** (`src/spawn.ts`, `src/introspect.ts`): MCP-stdio-Client via @modelcontextprotocol/sdk, init → tools/list
4. **5 Suites** in `src/suites/*.ts`: jede Suite exportiert `runSuite(client, tools, config) → SuiteReport`
5. **Scoring + Findings** (`src/scoring.ts`, `src/findings.ts`)
6. **Report-Renderer** (`src/report/*.ts`)
7. **CLI** (`src/cli.ts`): commander setup, dispatch, exit-codes
8. **Tests:** Unit + Integration + Smoke (Smoke gated mit `RUN_SMOKE_TESTS=1` env)
9. **README:** Tool-Liste + Compatibility + Beispiel-Config + Smoke-Test-Beispiel
10. **CI:** GitHub Actions runt `npm ci && npm run build && npm test` auf Node 20.x + 22.x

## Risks

- **Side-effect-Detection ohne Server-Cooperation ist hart.** Reine Black-Box-Erkennung von "Tool persistiert" via stdio ist nicht moeglich. Loesung v0.1: Wir erlauben optional eine `state-probe`-Tool-Annotation (z.B. `nex_entity_search` mit specific args zaehlt vor + nach), und falls die fehlt, faelt Suite auf "INDETERMINATE / WARN" zurueck. Architect-Decision-Vorschlag: das ist OK fuer v0.1 — Suite gibt Hinweise, nicht Garantien. Reviewer soll dazu Stellung nehmen.
- **Latency-Suite misst stdio-roundtrip, nicht reine Tool-Compute-Zeit.** Erstes Spawn enthaelt Init-Overhead. Loesung: Warmup-Call vor Messung, dann 5 Messungen, p50/p95 berechnen.
- **DSGVO-Suite ist Heuristik (keyword-based).** Echte DSGVO-Compliance ist Legal-Review, nicht CLI-Check. Wir docs das klar — Suite findet "fehlt komplett" reliably, "ist sauber" nur indikativ. Klar im README + Output deklarieren.
- **Reference-Server-Smoke-Tests sind nicht hermetisch.** Production-Memory + CRM koennen Drift zeigen, was Snapshot-Tests brechen kann. Loesung: Smoke-Suite ist opt-in, nicht in CI default; CI verwendet Mock-Server. Snapshot-Drift-Trigger ist Review-Signal, nicht CI-FAIL.

## Open Items

- **Open Decision (offen, 70%):** [MCP Factory Pilot-Builds publish-ready](https://nex.studiomeyer.io/decisions/?date=2026-04-27) — beruehrt diesen Build INDIREKT (gleiche Distribution-Pipeline). Sobald Matthias publish-ready bestaetigt, kann mcp-hook-conformance in derselben Welle published werden.
- **Reviewer-Decision-Frage:** Akzeptieren wir "INDETERMINATE / WARN" als gueltigen Suite-State fuer side-effects wenn keine state-probe verfuegbar ist? Architect-Vorschlag: ja, weil der Alternativ-State (FAIL) zu viele False-Positives produziert.
- **Builder-Frage:** state-probe-Annotation als neue MCP-Annotation vorschlagen (Spec-PR) ODER als convention-only (in README dokumentieren, kein Spec-Change)? Architect-Vorschlag: convention-only fuer v0.1, Spec-PR wenn 3+ Server adoptieren.

## Out of Scope

- MCP-Wrapper-Modus (also dieses Tool selbst als MCP-Server fuer Claude-Code-Aufruf)
- Auto-Fix / PR-Generation gegen Audit-Findings
- Performance-Profiling (V8 inspector, flamegraphs)
- Streamable-HTTP-Server-Audit (Claude Code v2.1.118 mcp_tool ist stdio-only — wenn das aendert, v0.2)
- GitHub-Action-Wrapper (`mcp-hook-conformance-action`) — separater Build
- Sigstore-Bridge fuer den Audit-Report selbst (analog mcp-server-attestation D2)

## Success Criteria

- `tsc --noEmit` clean, `npm run build` clean
- Alle 4 CLI-Subcommands implementiert + Hilfe-Text vorhanden
- Alle 5 Suites implementiert + jede mit min. 4 Unit-Tests (2 PASS-Mocks + 2 FAIL-Mocks)
- Mindestens 1 erfolgreicher Smoke-Test gegen mcp-nex Production-Tenant (factory-memory@aklow-labs.com) mit committeter Snapshot-Baseline
- README mit kompletter Tool-Liste, Beispiel-Config, Compatibility-Matrix
- npm-Pack-Test: `npm pack && tar -tzf *.tgz` enthaelt nur `dist/`, `README.md`, `LICENSE` (kein `tests/`, kein `src/`)
- CI gruen auf Node 20.x + 22.x
- Repo studiomeyer-io/mcp-hook-conformance erstellt + initial commit gepusht (Builder-Job, nicht Architect)
