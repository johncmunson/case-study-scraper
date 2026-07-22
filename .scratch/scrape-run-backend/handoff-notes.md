# Phase 1 handoff

Implemented the trusted create-run boundary and pure scrape-run domain contracts.

- `newScrapeRunSchema` now enforces all agreed limits and cross-field rules, then returns a deeply frozen, normalized `RunConfiguration`. `NewScrapeRunInput` remains the raw frontend/wire type; normalized fields gain their stable Field Key.
- Added pure URL helpers for target-origin and Canonical Page URL normalization, exact-host checks, duplicate detection support, public-host syntax checks, and rejection of IP/local/special-use hosts. Query/fragment/default-port/trailing-slash and unreserved percent-encoding variants are canonicalized consistently.
- Added shared lifecycle/status/stage/error-code constants, Zod schemas, configuration types, and Extraction Result/failure contracts in `lib/scrape-runs/contracts.ts`.
- Expanded unit coverage to 65 passing tests, including all input boundaries, URL canonicalization, public/exact host rules, duplicate examples, Field Label/Key rules, and raw-input versus normalized-output typing. `pnpm test`, `pnpm typecheck`, and `pnpm lint` all pass.

Notes for Phase 2:

- Public-host validation is intentionally deterministic and does not perform DNS lookups. It rejects single-label names, IPs, malformed DNS labels, common internal suffixes, and standardized special-use suffixes.
- Example URLs with credentials are rejected too, although the plan explicitly called this out only for the target URL; silently dropping credentials during canonicalization was judged unsafe.
- `RunConfiguration` represents the normalized user-owned configuration. `PersistedRunConfiguration` adds the server-owned immutable `filteringModel`; creation-time config validation/attachment remains for the persistence/API phases.
- The current POST route is still the pre-existing logging stub, but it now logs normalized schema output (including Field Keys). Removal of payload logging remains scheduled for Phase 9.

# Phase 2 handoff

Implemented the authoritative Drizzle/PostgreSQL persistence model and generated `db/migrations/0001_tiresome_outlaw_kid.sql`.

- Added separate run, job, stage-status, stage-name, and failure-code PostgreSQL enums plus all four scrape-run tables, inferred record types, schema exports, and Drizzle relations.
- Added the one-active-run-per-user partial unique index, owner/configuration indexes, per-run field/stage/job uniqueness, unique Workflow run IDs, primary-implies-required, cascade deletes, lifecycle defaults, nonnegative counters, and successful-result consistency checks.
- Added integration coverage for enum/type exports, defaults, constraints, active-run behavior, successful-result storage, and user-to-result cascade deletion. The migration is reapplied from scratch by the integration global setup.
- `pnpm test` passes 73 tests; `pnpm typecheck`, `pnpm lint`, and Prettier checks pass.

Notes for Phase 3:

- Drizzle wraps PostgreSQL constraint errors in `DrizzleQueryError`; the PostgreSQL code and constraint name are on `error.cause` (for example, `23505` / `scrape_runs_one_active_per_user_idx`). Conflict translation should inspect the cause rather than the top-level error.
- The database enforces at most one primary field, while transactional creation must still enforce exactly one primary field and exactly three stages as planned.
- The JSONB check guarantees complete jobs have an object and non-complete jobs have no result. Field membership and string-or-null value validation remain application/provider responsibilities for later phases.

# Phase 3 handoff

Implemented the server-only scrape-run repository and its database integration coverage.

- Run creation now writes the run, ordered fields, and all three pending stages in one transaction, checks for exactly one required Primary Identifier, and translates the active-run partial-index violation into `ActiveScrapeRunConflictError`.
- Added an owner-scoped read that returns the persisted run with ordered fields and canonical stage ordering; cross-owner reads return `null`.
- Added idempotent Workflow run-ID attachment and an atomic claim that only transitions a pending, non-cancelling run for the matching/unattached Workflow ID, starts Mapping with the same timestamp, and returns the complete persisted configuration. Competing and repeated claims exit with `null`.
- Integration tests cover successful creation, rollback, concurrent active-run creation, owner isolation, attachment idempotency, and competing/mismatched/repeated claims.

Notes for Phase 4:

- `claimScrapeRun` already owns the `pending → in_progress` run transition and `mapping: pending → in_progress` transition; Phase 4 lifecycle operations should build from that boundary rather than start Mapping a second time.
- Workflow attachment returns `true` for a new or already-identical attachment and `false` for a missing run or conflicting ID. Claim returns the claimed record or `null` when it cannot claim.
- The repository imports `server-only`; the direct dependency and a Vitest-only no-op alias were added because the marker intentionally throws outside a React Server environment. No database migration was needed in this phase.
