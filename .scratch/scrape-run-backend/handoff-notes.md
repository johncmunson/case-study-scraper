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

# Phase 4 handoff

Implemented the conditional lifecycle repository and PostgreSQL integration coverage.

- Added transactional stage attempt/admission, Mapping-to-Filtering advancement, preparation failure/skipping, dispatch-failure compensation, idempotent job creation with atomic Scraping start, job attempt/completion/failure transitions, aggregate counts, and persisted-state finalization.
- Added two-phase owner-scoped cancellation primitives. Every mutating operation locks the parent run first, so cancellation, job responses, and finalization serialize consistently; terminal jobs and successful Extraction Results survive cleanup.
- Added unexpected Workflow failure cleanup that fails the active stage/run, skips future stages, fails only unfinished jobs after Scraping starts, and lets an existing Cancellation Request take precedence.
- Split the implementation behind `lifecycle-repository.ts` into stage, job, and cancellation modules to keep the public seam centralized without creating a large catch-all file. No schema migration was needed.
- Integration coverage exercises dispatch compensation, valid/invalid and replayed stage transitions, idempotent job creation, attempt counters, terminal-state protection, mixed/all-failed finalization, owner isolation, repeated cancellation, cancellation/finalization races, partial-success preservation, and unexpected-failure cleanup.

Notes for Phase 5:

- Attempt counts represent attempts admitted immediately before an external provider call. A crash after admission but before the request can overcount, but a completed request cannot be undercounted.
- `createScrapeJobsAndStartScraping` requires at least two distinct Canonical Page URLs on first application. It preserves the initially persisted job set on replay and will not append a different replay payload after Scraping has started.
- Lifecycle failure methods accept classified application failures and replace caller-provided text with a centralized, code-specific public message before persistence. Provider adapters should still classify raw errors without passing provider payloads or internal exception details.
- A Cancellation Request transitions a still-pending run to `in_progress` without starting Mapping, then holds the active-run uniqueness constraint until terminal cleanup.

# Phase 5 handoff

Implemented the provider-bound Run Preparation adapters and deterministic URL selection.

- Firecrawl Map now uses the agreed options, disables the SDK's hidden retry loop, canonicalizes and deduplicates links in provider order, and discards malformed, subdomain, and unrelated-host entries without retaining the Site URL Set.
- URL Filtering now makes one AI SDK structured-output call with the complete Site URL Set and all Example Pages, uses the supplied persisted model identifier, disables AI SDK retries, intersects model output with candidates, and orders selected Matching Page URLs by Site URL Set order before appending missing examples in user order.
- Added shared provider failure classification to sanitized Workflow `RetryableError`/`FatalError` values, including malformed output, transient status codes, network failures, and AI `Retry-After` metadata.
- Expanded AI Gateway preflight validation to require and return a trimmed `URL_FILTER_MODEL`; missing Gateway authentication and model configuration are represented as `503` deployment-configuration failures.
- Added mocked Firecrawl and AI model tests plus pure post-processing, configuration, privacy-boundary, and retry-classification coverage.

Notes for Phase 6/7:

- The installed Firecrawl SDK treats `maxRetries` as total attempts in its implementation, despite its option wording; the Map adapter deliberately sets it to `1` so Workflow owns retries. AI SDK uses `maxRetries: 0` to achieve the same result.
- These adapters are ordinary server-only functions, not standalone Workflow steps. Phase 7 should call them from step functions that admit/persist each attempt before the external call, so credentials and attempt bookkeeping stay inside the step boundary.
- Firecrawl's Map error type does not expose response headers, so `Retry-After` can only be honored when a provider error exposes it; AI SDK `APICallError` headers are handled.

# Phase 6 handoff

Implemented the single-page Firecrawl Scrape extraction boundary and its application result contract.

- Added the dynamic JSON Schema builder with nullable string properties, the exact null instruction, `additionalProperties: false`, and no JSON Schema `required` keyword. Application-required and Primary Identifier invariants are validated separately.
- Added the JSON-mode Scrape adapter with Firecrawl's default cache behavior and SDK retries disabled so Workflow remains the retry authority.
- Added strict output normalization for omitted/null/blank values, unknown and wrong-typed property rejection, and ordered missing-required Field Key diagnostics. Missing-required failures expose repository-ready failure data without exposing or retaining the partial normalized result.
- Extended shared provider error classification to Scraping and added mocked adapter coverage for schema/request shape, normalization, malformed output, fatal required-field outcomes, provider failures, and privacy boundaries.

Notes for Phase 7/8:

- `scrapePageForExtraction` returns an `ExtractionResult` on success, throws `RetryableError` for malformed/transient responses, and throws `MissingRequiredFieldsError` (a `FatalError`) with `failure` and `missingRequiredFieldKeys` for valid responses missing application-required values.
- Catch `MissingRequiredFieldsError` inside the eventual job step before crossing a Workflow serialization boundary, then pass its diagnostic fields to `failScrapeJob`. Other terminal provider failures should be persisted as `scrape_failed` by the orchestration layer.
- As with Mapping, Firecrawl is constructed with `maxRetries: 1`; in this installed SDK that means one total request. No `maxAge` is sent.
