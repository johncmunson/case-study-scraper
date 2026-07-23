# Scrape Run Detail handoff notes

## Phase 1 — Detail contracts and backend read model

Phase 1 was completed as planned.

- The owner-scoped Run-detail repository now returns the existing persisted `failureCode` and `failureMessage` fields. No migration was needed because both columns already existed.
- `lib/scrape-runs/api-contracts.ts` now contains strict runtime schemas/types for Run detail, fields, stages, lightweight jobs, and cancellation success, plus validated GET/cancel fetchers and route builders.
- Contract validation enforces canonical three-stage ordering, ascending unique field positions and job IDs, exactly one required Primary Identifier, count totals, lifecycle enums, URL/timestamp shapes, IDs, and nonnegative positions/attempts/counts.
- `lib/scrape-runs/presentation.ts` now provides the pure lifecycle, label, timestamp, filtering, status-count, 25-row pagination, visible-range, page-clamping, progress, and Primary Identifier helpers needed by later phases.
- Repository and route regressions confirm that Workflow IDs, full Extraction Results, and job failure messages remain outside the lightweight Run-detail response.

One small deviation from the plan wording: no database/schema change was made, since the Run failure columns were already persisted and only missing from the read projection.

Verification completed with `pnpm typecheck`, `pnpm lint`, and `pnpm test` (352 tests passing). Phase 2 can build directly on `fetchScrapeRunDetail`, `getScrapeRunDetailApiPath`, the `ScrapeRunDetail` type, and the presentation helpers.

## Phase 2 — Dynamic route and lifecycle overview

Phase 2 was completed as planned.

- The Next.js 16 dynamic route now awaits generated `PageProps` params and passes only the serializable Run ID into a focused SWR client view. A shared structured skeleton covers both route transitions and the initial client fetch while preserving back navigation.
- The view distinguishes not-found, initial failure, and cached refresh-warning states; retries only network/`5xx` GET failures up to three times; and polls every three seconds only while the cached Run remains active, including while Cancelling.
- The read-only workspace now includes the breadcrumb/header, lifecycle timestamps and status, zero-job preparation copy, determinate active progress, terminal mixed outcomes, Run-level failure details, all ordered Run Stages, and collapsed immutable Run Configuration.
- Configuration expansion is local and request-free. It exposes only Target Site, Example Pages, Field Labels/descriptions, required state, and the Primary Identifier marker; Field Keys and filtering-model identifiers remain hidden.
- No direct `useEffect`, server-only client import, job table interaction, or cancellation behavior was introduced. Phase 3 can insert the Scrape Job browser between the existing Stage and Configuration sections.

Verification completed with `pnpm typecheck`, `pnpm lint`, and `pnpm test` (376 tests passing). `pnpm build` compiled and typechecked successfully but could not finish page-data collection because the local environment lacks `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; this was unrelated to the Phase 2 code.

## Phase 3 — Paginated Scrape Job summaries and navigation

Phase 3 was completed as planned.

- The Run detail workspace now includes a responsive lightweight Scrape Job table between Run Stages and Run Configuration. It uses the configured Primary Identifier Field Label, shows identifier values only for successful jobs, and presents Canonical Page URLs, textual status/failure code, attempts, and terminal finish times without requesting individual job detail.
- The browser has exact local status filtering with live counts, fixed 25-row pagination, visible ranges, filter-driven page reset, and render-time page clamping when polling shrinks a filtered collection. Preparation, terminal zero-job, and no-filter-match states are distinct.
- Primary Identifier and Page URL links target the future nested job route with prefetch disabled. Existing Run Summary cards are now full semantic Next.js Links with the prior content, progress behavior, and focus/hover treatment preserved.
- Focused tests cover responsive column priority, dynamic labels and values, failure diagnostics, stable filtering/pagination, polling-driven clamping, empty states, disabled job-link prefetch, the no-per-job-request boundary, and Run-list navigation.

The only implementation wrinkle was that adding job status badges and the Primary Identifier heading introduced intentional duplicate labels in a few Phase 2 integration tests; those assertions were scoped to the Run header or Configuration section rather than changing user-facing copy. No product-scope deviations were needed.

Verification completed with `pnpm typecheck`, `pnpm lint`, and `pnpm test` (384 tests passing). Phase 4 can add cancellation without changing the job browser's local state or data boundary.

## Phase 4 — Run cancellation and cache reconciliation

Phase 4 was completed as planned.

- Active Runs now expose an accessible AlertDialog confirmation for **Cancel Scrape Run**; Runs with a persisted but incomplete Cancellation Request expose **Retry cancellation** with recovery-specific copy. Duplicate submission, Escape, trigger, and cancel-button dismissal are blocked while the POST is in flight.
- Cancellation is owned by `useSWRMutation` and never retries automatically. A validated `202` projects only `status: "cancelled"` into the detail and Run-list caches, then explicitly refetches and runtime-validates both complete read models.
- `409`, `503`, `404`, network failures, malformed success bodies, and response-ID mismatches reconcile safely. Completion races load the persisted winner, incomplete cleanup remains active and retryable, confirmed missing Runs transition to the not-found state, and uncertain outcomes preserve cached content behind safe warnings.
- Failed post-cancellation GETs retain the confirmed Cancelled projection and stale ancillary detail. The normal refresh warning retries both read models, including the case where only Run-list reconciliation failed.
- Focused MSW/Testing Library coverage exercises confirmation and retry flows, in-flight dismissal protection, all required response outcomes, no automatic POST retry, detail/list cache projection, revalidation success and failure, and accessible dialog naming/description.

No backend or contract changes were needed in this phase; the cancellation endpoint and validated fetcher from earlier phases already matched the required mutation contract. Phase 5 can focus on integrated responsive/accessibility hardening and cross-feature race coverage.
