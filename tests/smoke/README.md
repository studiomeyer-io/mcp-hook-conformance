# Smoke Tests

Opt-in tests against production tenants of mcp-nex and mcp-crm.

Run:

```bash
RUN_SMOKE_TESTS=1 npm run test:smoke
```

Snapshot baselines live in `tests/smoke/snapshots/`. Drift is a manual review trigger, not a CI fail.

The `mcp-nex.test.ts` and `mcp-crm.test.ts` placeholder files are wired in once the factory tenants (`factory-memory@aklow-labs.com`, `factory-crm@aklow-labs.com`) are provisioned.
