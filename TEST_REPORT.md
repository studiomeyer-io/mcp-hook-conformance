<!-- Verdict: PARTIAL -->
# TEST REPORT — mcp-hook-conformance

> **Verdict:** PARTIAL
> **Tester:** mcp-factory-tester (Session 915)
> **Date:** 2026-04-28
> **Reviewer-Verdict:** AMBER

## Kurz

Static-Analysis-Layer (tsc + vitest) ist sauber: `tsc --noEmit` clean, 56/56 Tests gruen in 1.63s ueber 7 Files (5 unit + 2 integration). MCP-Inspector tools/list crasht — by design, weil dieser Build ein CLI-Tool ist, kein MCP-Server (Plan-Section "Distribution" und "MCP-Inspector Smoke: N/A" dokumentieren das). Real-API-Smoke gegen factory-tenants per `--skip-real-tenant` ueberspringt; ohne diese Smoke kann die Suite "echtes Audit gegen mcp-nex Production" nicht verifiziert werden — genau das macht der Build aber aus. Beide Reviewer-MEDIUMs (F1 `version-info` Drift, F2 404-Repo-URLs) sind weiterhin valid (kein File-Diff seit REVIEW.md). Verdict PARTIAL: Build ist code-gesund, aber zwei nicht-durchfuehrbare Tests verhindern echtes PASS.

## Test-Suite Ergebnisse

### tsc --noEmit
- Status: PASS
- Errors: 0

### vitest run
- Status: PASS
- Tests: 56 passed, 0 failed
- Duration: 1.63s
- Files: tests/unit/{findings,scoring,report,config,suites}.test.ts (47 unit-tests), tests/integration/{mock-server,cli}.test.ts (9 integration-tests)
- Notable: tests/integration/cli.test.ts spawnt echte CLI gegen Mock-Server-Fixture — End-to-End-Pfad covered.

### MCP-Inspector tools/list
- Status: Crash (erwartet)
- Tools listed: 0 (PLAN sagte: N/A — CLI-Build, kein MCP-Server)
- Primary attempt: `spawn dist/index.js EACCES` — package.json `main` zeigt auf `dist/index.js` (Library-Export), nicht auf MCP-Server-Entry. Korrekt fuer Library + CLI-Bin Pattern.
- Fallback attempt: `MCP error -32000: Connection closed` — index.js ist Library-Export-Surface (`runHookConformanceCheck` etc.), spricht kein MCP-Stdio.
- **Bewertung:** Kein Bug. Plan-Section 92 ("Server-Type: Library + CLI-Binary"), Section 102 ("Section daher leer ... keine MCP-Tools") und Section 122 ("MCP-Inspector Smoke: N/A") deklarieren das. Inspector-Roundtrip ist fuer diesen Build der falsche Test.

### Real-API-Tests
- Status: SKIPPED (per `--skip-real-tenant` flag im Test-Auftrag)
- Tenants nicht angesprochen: factory-memory@aklow-labs.com, factory-crm@aklow-labs.com, factory-geo@aklow-labs.com
- Smoke-Suite (`tests/smoke/placeholder.test.ts`) ist gated auf `RUN_SMOKE_TESTS=1` — Stub, nicht ausgefuehrt.

### Source-Diff seit REVIEW.md
- Status: 0 Files geaendert seit 2026-04-28T06:11:52Z (alle 5 Reviewer-Findings still-valid).

## Was geskippt (PARTIAL-Begruendung)

| Test-Schritt | Geskippt? | Grund |
|--------------|-----------|-------|
| MCP-Inspector tools/list | Crash (kein echter Test) | Build ist CLI-only Library, kein MCP-Server. Plan deklariert N/A. Inspector-Crash ist by-design. |
| Real-API gegen factory-memory@aklow-labs.com | JA | User-Auftrag enthielt `--skip-real-tenant`. Smoke-Suite gegen mcp-nex@3.16.5 / mcp-crm@2.8.1 ist Plan-Success-Criteria #4 — ohne diesen Lauf ist die End-to-End-Audit-Faehigkeit unverifiziert. |
| Real-API gegen factory-crm@aklow-labs.com | JA | dito |
| Real-API gegen factory-geo@aklow-labs.com | JA | dito |
| JSON/Junit-Output Schema-Probe gegen echten Server | JA | benoetigt Real-API |
| Determinism-Drift-Test (Live-Search-Tool) | JA | benoetigt Real-API |

## Issues

### I1: F1 + F2 aus REVIEW.md unveraendert — MEDIUM (still-valid)
- Wo: `src/cli.ts:202-210` (version-info statt version), `package.json:8-15` + README header (404-Repo-URLs)
- Was: Beide Reviewer-MEDIUMs sind weiterhin valid (verifiziert via check_source_diff_since_review: 0 Files geaendert seit Review).
- Reproduzierbar: ja
- **Verifiziert via:** package.json gelesen — `homepage`, `repository.url`, `bugs.url` zeigen alle auf `studiomeyer-io/mcp-hook-conformance` (in REVIEW als 404 belegt).

### I2: Plan-Success-Criteria #4 nicht erreichbar ohne Smoke-Run — MEDIUM
- Wo: PLAN.md Zeile 202 ("Mindestens 1 erfolgreicher Smoke-Test gegen mcp-nex Production-Tenant")
- Was: Der Test-Auftrag hat Real-API explizit geskippt. Damit kann die zentrale Build-Faehigkeit (Audit eines lebenden MCP-Servers) nicht bestaetigt werden. Mock-Integration-Test deckt CLI-Pfad, aber nicht Production-Realitaet (z.B. Memory-Server-Timestamp-Drift, CRM-tenant-Isolation, GEO-rate-limits).
- Reproduzierbar: ja (jeder Run ohne `RUN_SMOKE_TESTS=1` ueberspringt es)

### I3: package.json `main` + Inspector-Pattern Mismatch — LOW
- Wo: `package.json:31` (`"main": "dist/index.js"`)
- Was: Wenn jemand kuenftig denkt der Build sei ein MCP-Server (z.B. weil `mcp.specVersion` im package.json deklariert ist), wird er Inspector werfen und EACCES kriegen. Ein expliziter Hint im README ("This is a CLI, not a server — do not run via mcp-inspector") wuerde Verwirrung verhindern.
- Reproduzierbar: ja
- Severity: nur kosmetisch.

## Empfehlung

**ZURUECK ZUM BUILDER** fuer Round 2 (nicht zum CEO):

1. **F1 fix** (REVIEW): `version` als Alias auf `version-info` registrieren (5-Zeilen-Diff in `src/cli.ts`).
2. **F2 fix** (REVIEW): OS-Repo `studiomeyer-io/mcp-hook-conformance` anlegen ODER URLs auf `studiomeyer-io/mcp-factory#tree/main/builds/mcp-hook-conformance` umbiegen bis Repo-Split.
3. **Smoke-Implementation:** `tests/smoke/placeholder.test.ts` durch echten factory-memory-Roundtrip ersetzen, Snapshot-Baseline committen.
4. **Re-Test mit Real-API** (ohne `--skip-real-tenant`) gegen mcp-nex / mcp-crm / mcp-geo factory-Tenants. Erwartung Plan-Section-Test-Plan: nex high side-effect-free + low determinism, crm high idempotency + correct destructive flags.

Erst nach erfolgreichem Real-API-Smoke + F1/F2-Fix kann der Build PASS bekommen und zum CEO/Promotion. Architect-Decision F5 (INDETERMINATE-50 fuer side-effects ohne stateProbe) ist sauber implementiert und needs no change.

## Logs

```
vitest run (last 12 lines):
 ✓ tests/unit/findings.test.ts (5 tests) 4ms
 ✓ tests/unit/scoring.test.ts (10 tests) 7ms
 ✓ tests/unit/report.test.ts (5 tests) 5ms
 ✓ tests/unit/config.test.ts (10 tests) 9ms
 ✓ tests/unit/suites.test.ts (17 tests) 47ms
 ✓ tests/integration/mock-server.test.ts (3 tests) 620ms
 ✓ tests/integration/cli.test.ts (6 tests) 1521ms
 Test Files  7 passed (7)
      Tests  56 passed (56)
   Duration  1.63s
```

```
mcp-inspector (primary + fallback both crash, expected for CLI build):
[primary]  Failed to connect to MCP server: spawn dist/index.js EACCES (exit 1)
[fallback] Failed to connect to MCP server: MCP error -32000: Connection closed (exit 1)
NOTE: Per PLAN.md "MCP-Inspector Smoke: N/A (kein MCP-Server, sondern CLI)" — crash is expected.
```

```
check_source_diff_since_review:
reviewMtime: 2026-04-28T06:11:52Z
changedFilesCount: 0
findings still-valid: F1 MEDIUM, F2 MEDIUM, F3 INFO, F4 INFO, F5 INFO
```

