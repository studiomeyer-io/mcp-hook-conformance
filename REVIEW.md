<!-- Verdict: AMBER -->
# REVIEW — mcp-hook-conformance

> **Verdict:** AMBER
> **Reviewer:** mcp-factory-reviewer (Session 914+)
> **Date:** 2026-04-28

## Kurz

Geprueft: kompletter Build-Tree `builds/mcp-hook-conformance/` (16 src-Dateien, 8 test-Dateien, package.json, README, CHANGELOG, CI). Build implementiert Plan substantiell: 5 Audit-Suiten (idempotency/latency/determinism/side-effects/dsgvo), 11 Finding-Codes, 3 Output-Renderer (human/json/junit), Stdio+HTTP Transports, gewichtetes Scoring (30/25/20/15/10 = 100), CLI mit 4 Subcommands. TypeScript strict, Zod-Schemas vollstaendig, vitest-Coverage konfiguriert, GitHub-Actions-CI fuer Node 20.x + 22.x. Keine CRITICAL/HIGH-Befunde. Zwei MEDIUM-Plan-Deviations + drei INFO-Items zur Architect-Decision-Frage. Tester-bereit nach Repo-URL-Fix.

## Verdict-Begruendung

AMBER weil:
- Keine Security-Issues (Adversarial-Pass: shell-injection nicht moeglich durch `command`/`args`-Split, path-traversal ist Feature da User-CLI, SSRF nur theoretisch in single-user-Kontext)
- Keine MCP-Spec-Verletzungen (specVersion 2025-06-18 deklariert in package.json + Server-Init)
- Aber zwei MEDIUM Plan-Deviations: Subcommand-Rename `version` → `version-info` ohne Plan-Update und 404er GitHub-Repo-URL in package.json + README, die published-User auf broken Links wuerde fuehren
- Plan-Reviewer-Decision-Frage ("INDETERMINATE fuer side-effects ohne stateProbe akzeptabel?") ist im INFO-Block beantwortet: ACCEPT.

Tester kann laufen. Builder fixt die zwei MEDIUMs in Round 2 vor npm-publish.

## Findings (priorisiert nach Severity)

### F1: CLI-Subcommand `version` → `version-info` umbenannt — MEDIUM
- **Pfad:** `src/cli.ts:202-210`, `README.md:Tool-Liste`
- **Beobachtung:** PLAN.md spezifiziert vier Subcommands `check | init | explain | version`. Code implementiert stattdessen `version-info`. README dokumentiert konsistent `version-info`, aber Plan-Konformitaets-Audit zeigt Drift.
- **Warum wichtig:** User die Plan/Doku gelesen haben rufen `mcp-hook-conformance version` und bekommen Commander-Error. Builder hat den Rename nicht in PLAN.md zurueckgespielt.
- **Empfehlung:** Entweder Subcommand zu `version` zurueckbenennen ODER `version` als Alias auf `version-info` zusaetzlich registrieren (`program.command("version").alias(...)`). Plan-Update in BUILD-NOTES.md hinterlegen.
- **Verifiziert mit:** code-read (`src/cli.ts:204`), README-read.

### F2: package.json/README zeigen auf 404er GitHub-Repo — MEDIUM
- **Pfad:** `package.json:8-15` (homepage/repository/bugs), `README.md` (header link)
- **Beobachtung:** Alle vier URLs zeigen auf `https://github.com/studiomeyer-io/mcp-hook-conformance`. Repo existiert noch nicht (HTTP 404).
- **Warum wichtig:** Sobald `npm publish` lauft, sehen Installer broken Links. npm registry zeigt "homepage" prominent — das ist ein Vertrauens-Signal, das hier rot wird.
- **Empfehlung:** Builder legt OS-Repo `studiomeyer-io/mcp-hook-conformance` an (oeffentlich, MIT, mit README-Spiegel) BEVOR npm publish. Alternativ: Repo-URLs vorerst auf `studiomeyer-io/mcp-factory` zeigen lassen und nach Repo-Split aktualisieren.
- **Verifiziert mit:** verify_url → 404, package.json-read.

### F3: Latency-Suite ignoriert `config.tries` und CLI-Flag `--tries` — INFO
- **Pfad:** `src/suites/latency.ts:31` (hardcoded `const samples = 5`), `src/cli.ts:101-103` (--tries ueberschreibt config.tries global)
- **Beobachtung:** CLI-Flag `--tries <n>` setzt `config.tries`. Idempotency-Suite respektiert das (siehe `idempotency.ts`). Latency-Suite hat eigenes hardcoded `samples = 5` und nutzt weder `config.tries` noch eine eigene threshold.
- **Warum wichtig:** User der `--tries 10` aufruft erwartet 10 Latenz-Samples, bekommt 5. Konsistenz-Issue, kein Bug.
- **Empfehlung:** Entweder `samples = config.tries` setzen (mit Minimum 3 fuer p95-Sinnhaftigkeit), ODER explizit `config.thresholds.latencySamples` einfuehren und im README dokumentieren dass Latency separate Sample-Count nutzt.
- **Verifiziert mit:** code-read.

### F4: HTTP-Transport ohne SSRF-Guard auf `server.url` — INFO
- **Pfad:** `src/spawn.ts:38` (`new URL(server.url)`)
- **Beobachtung:** Adversarial-Pass `simulate_attacker_input ssrf-loopback` lieferte 4 Payloads: `http://127.0.0.1:5432`, `http://2130706433`, `http://127.1`, `http://localhost:6379`. Build akzeptiert alle ohne Validierung.
- **Warum wichtig:** In aktuellem Single-User-CLI-Kontext irrelevant (User zielt auf eigene MCP-Server, das ist Feature). RELEVANT wenn dieses Tool je gehostet wird (z.B. als CI-Service oder MCPize-deployed). Dann waere config-driven URL ein klassischer SSRF-Vektor.
- **Empfehlung:** README-Section "Hosted Deployment" mit expliziter Warning: bei Multi-Tenant-Hosting muss `server.url` auf Allowlist eingeschraenkt werden. Code aktuell unveraendert lassen (single-user-Tool ist OK).
- **Verifiziert mit:** simulate_attacker_input ssrf-loopback (4 Payloads).

### F5: Reviewer-Decision-Antwort — INDETERMINATE fuer side-effects ohne stateProbe — INFO
- **Pfad:** `src/suites/side-effects.ts:25-40`
- **Beobachtung:** PLAN.md fragt explizit: "Reviewer-Decision-Frage: accept INDETERMINATE/WARN fuer side-effects ohne state-probe?". Build emit SIDE-002 mit verdict INDETERMINATE wenn `tool.annotations.readOnlyHint === false` und keine `stateProbe` definiert ist. Score-Mapping: INDETERMINATE = 50 Punkte (zwischen WARN=60 und FAIL=0).
- **Warum wichtig:** Plan-konforme Klaerung pendend.
- **Empfehlung (Reviewer-Position):** **ACCEPT.** Begruendung: false-positive FAIL ohne Probe-Daten waere irreführend, false-positive PASS waere gefaehrlich. INDETERMINATE-50 ist die korrekte Mitte und zwingt User entweder Probe zu konfigurieren oder explizit `nondeterministic: true` zu setzen. Score-Penalty (50 statt 100) ist sichtbar genug im Final-Report. Empfehlung an Builder: kein Code-Change. Empfehlung an Architect: in PLAN-Update als Decision-Resolved markieren.
- **Verifiziert mit:** code-read, side-effects.test.ts:42-58 (Test "INDETERMINATE without stateProbe").

## Plan-Konformitaet

- [x] CLI-Binary `mcp-hook-conformance` als Foundation-Build (drittes Pillar)
- [x] 5 Suiten implementiert (idempotency, latency, determinism, side-effects, dsgvo)
- [x] 11 Finding-Codes mit title + severity + remediation
- [x] 3 Output-Renderer (human/json/junit)
- [x] Stdio + HTTP Streamable Transport
- [x] specVersion 2025-06-18 deklariert (package.json `mcp.specVersion`, src/cli.ts:18)
- [x] claudeCodeMinVersion 2.1.118 deklariert
- [x] Subcommands `check`, `init`, `explain` ✓
- [ ] Subcommand `version` → CODE hat `version-info` (siehe F1)
- [x] Hook-Friendliness Score weighted 30/25/20/15/10 = 100 (verifiziert: scoring.test.ts:67 "SUITE_WEIGHTS sums to 100")
- [x] Tries 2-20 Range (config.ts ToolProbeSchema)
- [x] CI auf Node 20 + 22

## Test-Coverage

- **Unit:** 5 Test-Files (config, scoring, findings, suites, report) — alle 5 Suiten haben PASS+FAIL-Mocks. SUITE_WEIGHTS-Sum-Test vorhanden. XML-Escape-Test fuer junit-Renderer vorhanden.
- **Integration:** `tests/integration/mock-server.test.ts` mit parametrischem Mock-Server-Fixture (MOCK_BEHAVIOR env). Skipt wenn `tsx` nicht installiert — robust.
- **Smoke:** Placeholder gated auf `RUN_SMOKE_TESTS=1`. Ausreichend fuer Round 1.
- **Coverage:** vitest v8-Coverage konfiguriert, src/cli.ts vom Coverage-Report excludiert (CLI-Wrapper, Standard-Pattern).
- **Real-API-Tests:** Keine. Tester-Job: gegen mcp-nex (production tenant) + mcp-crm + mcp-geo manuell laufen lassen.

## Empfehlung an Tester

Nach Builder-Fix von F1 + F2 (oder explizit "wir akzeptieren als known issue fuer Round 1"):

1. **Smoke-Roundtrip:** `npm run build && node dist/cli.js init -n test-server && node dist/cli.js explain IDEMP-001` — sollte ohne Crash exitcoden.
2. **Real-Server-Audit gegen mcp-nex Production-Tenant** (`mcp-factory@aklow-labs.com`):
   - `mcp-hook-conformance check ./hook-conformance.config.json --suite all -o human`
   - Erwartung: Hook-Friendliness Score >= 60, FAILs nur wo design-bedingt (z.B. `nex_session_start` ist nicht idempotent — should annotation `nondeterministic: true` haben).
3. **mcp-crm + mcp-geo dito** (Test-Tenants `factory-crm@aklow-labs.com`, `factory-geo@aklow-labs.com`).
4. **Determinism-Drift-Test:** Tool das Zufallsdaten retourniert (z.B. mcp-research mit Live-Search) sollte DET-001 oder DET-002 zeigen.
5. **JSON-Output-Schema-Validation:** `mcp-hook-conformance check ... -o json | jq` parsen, sicherstellen Score-Math konsistent ist (suiteScores * weights / 100 = toolScore).
6. **Junit-Output in CI-Probe:** Output an junit-Reader fuettern, sicherstellen XML valide ist.

**Sandbox:** Tester nutzt Node 22 LTS lokal, kein Docker-Wrap noetig. Wenn HTTP-Transport getestet wird: nur gegen `https://mcp-nex.studiomeyer.io` und `localhost`-Tenants.

## Codebase-Intelligence-Belege

- `verify_npm_package`: typescript@6.0.3, @modelcontextprotocol/sdk@1.29.0, commander@14.0.3, execa@9.6.1, vitest@4.1.5, zod@4.3.6 — alle exists und Versionen matchen package.json exact.
- `verify_url`: `https://github.com/studiomeyer-io/mcp-hook-conformance` → 404 (Repo nicht angelegt).
- `simulate_attacker_input`: ssrf-loopback (4 Payloads), shell-injection (5 Payloads), path-traversal (3 Payloads). Adversarial-Pass durchgefuehrt: shell-injection durch `command`/`args`-Split blockiert (StdioClientTransport ruft `spawn` mit array-args, kein shell), path-traversal ist Single-User-CLI-Feature, SSRF dokumentiert in F4.
- code-read: cli.ts (226 Lines), spawn.ts (50 Lines), suites/latency.ts (93 Lines), package.json, tests/smoke/placeholder.test.ts. Alle anderen Dateien aus vorheriger Session bereits gelesen.
- Keine `any`-Typen gefunden. Keine hardcoded Secrets. Keine Em-Dashes im README. Keine TODO/FIXME im Code. Keine halluzinierten Imports.

## Style-Backlog (LOW, nicht verdict-relevant)

- Tests/smoke/placeholder.test.ts ist ein Stub. Sobald factory-tenants verdrahtet sind: ersetzen.
- src/spawn.ts merged process.env in child env (`{ ...process.env, ...server.env }`) — fuer audit-CLI OK, aber bei kuenftigem `--isolated`-Flag wuerde man minimaler env wollen.
- README CHANGELOG-Format: `[0.1.0] - 2026-04-28` vs Keep-A-Changelog-Standard ist konsistent. Kein Issue.

