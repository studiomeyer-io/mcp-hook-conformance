# Smoke Tests

Opt-in real-API tests against production tenants of `mcp-nex` (and later
`mcp-crm`). Excluded from default `npm test` runs.

## Run

```bash
RUN_SMOKE_TESTS=1 \
  FACTORY_SAAS_MEMORY_API_KEY=<bearer-token> \
  FACTORY_SAAS_MEMORY_URL=https://memory.studiomeyer.io/mcp \
  FACTORY_SAAS_MEMORY_TENANT=<your-tenant-email-for-log-output> \
  npm run test:smoke
```

If `RUN_SMOKE_TESTS=1` is set but the API key is missing, the suite is
auto-skipped with a console warning so CI logs make the reason obvious.

## What it covers

- **factory-memory.smoke.test.ts** — connects to `memory.studiomeyer.io/mcp` via
  Streamable HTTP, lists tools (≥20 expected), then runs `auditServer` against
  `nex_search` with `idempotency` + `latency` suites and `tries=2`. Verifies
  the report shape (score 0-100, every requested suite produces a verdict).

## What it does NOT do

- No write operations. The smoke calls the read-only `nex_search` tool with a
  canary query so no user data is mutated.
- No CI gating. A red smoke run is a manual review trigger, not a deploy
  blocker. The default `npm test` (56/56 unit + integration) stays green.
- No snapshot enforcement. Snapshot baselines are advisory; structural
  differences against `tests/smoke/snapshots/*.json` should be reviewed but not
  auto-failed.

## Roadmap

- `factory-crm.smoke.test.ts` will follow once an `mcp-crm` tenant Bearer
  token is provisioned. The smoke shape mirrors `factory-memory.smoke.test.ts`
  with read-only tool calls only.
