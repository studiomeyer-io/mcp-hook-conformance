# Builder Notes — mcp-hook-conformance

Stand: 2026-04-28, branch `builder/mcp-hook-conformance`.

## Status nach Continue-Run

- 56/56 Tests gruen (vitest run): 5 unit suites + 2 integration suites
- TypeScript clean (`tsc --noEmit`, strict + noUncheckedIndexedAccess)
- npm install: ok
- Plan vollstaendig implementiert (alle 5 Suites, CLI, 3 Renderer, mock-fixture, README, CI)

## Offen: build_smoke_spawn nicht ausfuehrbar

`build_smoke_spawn entrypoint=cli` schlaegt fehl mit:

```
/home/simple/mcp-factory/builds/mcp-hook-conformance/dist/bin.js not found — run build_tsc_check first
```

Zwei Probleme:

1. **Pfad-Mismatch**: Tool sucht `dist/bin.js`, package.json bin entry zeigt aber auf `dist/cli.js`.
   Build-Skript ist `tsc -p tsconfig.json` → emittiert `dist/cli.js`.
2. **Kein Emit-Tool**: `build_tsc_check` ist `tsc --noEmit`. Es gibt kein
   `build_npm_run_build` (oder analog) das `npm run build` aufruft.
   Daher ist `dist/` nach den verfuegbaren Tools immer leer.

### Vorschlag fuer Reviewer / Inline-Tool

Entweder:

- **Inline-Tool `build_npm_run` mit script-Whitelist** (`build`, `prepack`) — generisch
  brauchbar fuer alle TS-Builds in der Factory.
- **Oder `build_smoke_spawn` muss vorher emit triggern** und idealerweise den Pfad aus
  `package.json` `bin`-Field ableiten statt `dist/bin.js` hardcoded.

Bis dahin: Smoke-Test kann lokal manuell laufen (`npm run build && node dist/cli.js version-info`).

## Naechster Schritt

Reviewer audit (build/{slug}/REVIEW.md), dann Tester. Kein commit, kein push.
