# Scrape Run Backend Design and Phased Implementation Plan

## 1. Purpose

Implement the backend lifecycle for user-created scrape runs. A run maps one website, uses one LLM call to identify URLs matching user-provided examples, creates one persisted scrape job per selected URL, and extracts user-defined values from those pages through Firecrawl.

This document is standalone and covers backend behavior only.

## 2. Scope

### In scope

- Persisted scrape runs, immutable run configuration, stages, fields, jobs, statuses, failures, and successful extraction results.
- Firecrawl Map for obtaining the complete site URL set.
- One structured-output LLM call for URL selection.
- Firecrawl Scrape JSON extraction for each selected URL.
- Vercel Workflow orchestration, retries, cancellation, and five-job concurrency.
- One active scrape run per user.
- Authenticated create, read, job-detail, and cancellation APIs.
- Polling-friendly read models.
- Unit, database integration, route, provider-adapter, and Workflow integration tests.

### Out of scope

- Frontend changes.
- Editing, deleting, cloning, or manually retrying a run.
- A separate Vercel Queues integration or application queue table.
- Pagination.
- Automatic data retention or cleanup.
- Raw HTML, markdown, screenshots, full Firecrawl responses, or Firecrawl response metadata.
- Persisting the mapped URL set or a second copy of the filtered URL list.
- Cross-run analytics over extracted fields.
- A transactional dispatch outbox or runtime reconciler.
- Per-run URL, job-count, token, or spend caps.
- Streaming progress through SSE or WebSockets.

## 3. Canonical concepts

- **Scrape Run:** One user-initiated attempt to find matching pages on one target site and extract the same fields from each page.
- **Active Scrape Run:** A run with `pending` or `in_progress` status. A user may have at most one.
- **Run Configuration:** The immutable target site, example pages, extraction fields, and filtering model captured at creation.
- **Run Stage:** One of `mapping`, `filtering`, or `scraping`.
- **Target Site:** The exact hostname from the target URL. Subdomains are out of scope.
- **Site URL Set:** The complete set of URLs returned by Firecrawl Map for this product's purposes.
- **Canonical Page URL:** A normalized HTTP(S) origin and path. Query strings and fragments do not distinguish pages.
- **Example Page:** A user-confirmed matching page. Every example always becomes a scrape job.
- **Matching Page:** A page whose URL pattern matches the examples and is selected for extraction.
- **Scrape Job:** The extraction attempt for one matching page.
- **Extraction Field:** A user-defined string-or-null value to extract.
- **Field Label:** The user-facing field name.
- **Field Key:** The stable `snake_case` JSON property derived from a label at run creation.
- **Required Extraction Field:** An application-level requirement. It is not represented through JSON Schema's `required` keyword.
- **Missing Value:** `null`; omitted, empty, and whitespace-only values normalize to `null`.
- **Extraction Result:** Only the normalized user-defined values from a successful scrape job.
- **Primary Identifier:** The required extracted value used to name/reference a result. It is not a uniqueness constraint.

## 4. Architectural decision

PostgreSQL is the product system of record for runs, stages, jobs, and results. Vercel Workflow provides durable orchestration, step retries, and cancellation. Workflow history is not business storage.

All Workflow steps that mutate PostgreSQL must be idempotent and use conditional state transitions. Individual scrape jobs are persisted before processing and scheduled as Workflow steps; they are not copied into a separate queue system.

See `docs/adr/0001-postgres-authority-workflow-orchestration.md`.

## 5. Input contract and normalization

The existing create payload remains conceptually:

```ts
type NewScrapeRunInput = {
  name: string
  url: string
  exampleUrls: string[]
  fields: Array<{
    label: string
    description: string
    required: boolean
    primaryIdentifier: boolean
  }>
}
```

### Limits

- Name: 1–100 trimmed characters.
- Any submitted URL: at most 2,048 characters and valid HTTP or HTTPS.
- Example pages: 2–5 distinct canonical URLs.
- Extraction fields: 1–10.
- Field label: 2–30 characters.
- Field description: 2–100 trimmed characters.
- Exactly one field is the primary identifier.
- The primary identifier must be application-required.

### Target URL

- Reject URL credentials.
- Reject `localhost`, IP-address hosts, and local/internal hostnames.
- Accept only public DNS hostnames.
- Normalize the target to its origin, for example `https://example.com/`.
- Ignore the submitted target path, query, and fragment; mapping is hostname-wide.

### Example URLs

- Must use the exact target hostname; subdomains and unrelated hosts are rejected.
- Strip query strings and fragments.
- Normalize default ports and trailing slash behavior consistently.
- Treat trailing slash variants as the same page, except that the origin remains `/`.
- Require 2–5 distinct URLs after normalization.

### Field labels and keys

After trimming, labels must match:

```regex
^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$
```

This allows only ASCII letters, numbers, and a single space between words. Generate a Field Key by lowercasing and replacing spaces with underscores. Numeric-leading keys are allowed.

Labels must be unique case-insensitively. Generated Field Keys must be unique. Reject collisions rather than adding suffixes.

## 6. Persistence design

Use PostgreSQL enums for constrained lifecycle values.

### Status values

Run and job statuses:

- `pending`
- `in_progress`
- `complete`
- `failed`
- `cancelled`

Stage statuses add:

- `skipped`

Stage names:

- `mapping`
- `filtering`
- `scraping`

### `scrape_runs`

Required data:

- Identity primary key.
- `user_id`, referencing `users` with cascade delete.
- Display `name`.
- Normalized target origin.
- Ordered canonical example URLs as `text[]`.
- Immutable filtering model identifier.
- Persisted run status.
- Nullable Workflow run ID.
- Nullable `cancellation_requested_at`.
- Nullable terminal failure code and sanitized message.
- Created, updated, started, and finished timestamps.

Constraints and indexes:

- Partial unique index on `user_id` where status is `pending` or `in_progress`.
- Index for user-owned run listing ordered by creation time.
- Workflow run ID should be unique when present.

### `scrape_run_fields`

Required data:

- Identity primary key.
- Parent run ID with cascade delete.
- Stable position.
- Original display label.
- Stable Field Key.
- User description, without the Firecrawl suffix.
- Application-required boolean.
- Primary-identifier boolean.
- Standard timestamps if consistent with repository conventions.

Constraints:

- Unique `(scrape_run_id, position)`.
- Unique `(scrape_run_id, key)`.
- At most one primary field per run through a partial unique index.
- Primary implies required through a check constraint where practical.
- Application validation and transactional creation ensure exactly one primary field.

### `scrape_run_stages`

Create exactly three rows in the run-creation transaction.

Required data:

- Identity primary key.
- Parent run ID with cascade delete.
- Stage name.
- Stage status, initially `pending`.
- Attempt count, initially zero.
- Nullable failure code and sanitized message.
- Created, updated, started, and finished timestamps.

Constraint:

- Unique `(scrape_run_id, stage)`.

### `scrape_jobs`

Create every selected job in one transaction at the end of Filtering, before Scraping begins.

Required data:

- Identity primary key.
- Parent run ID with cascade delete.
- Canonical page URL.
- Job status, initially `pending`.
- Attempt count.
- Nullable JSONB Extraction Result typed as `Record<string, string | null>`.
- Nullable missing-required Field Key array for diagnostics.
- Nullable failure code and sanitized message.
- Created, updated, started, and finished timestamps.

Constraints and indexes:

- Unique `(scrape_run_id, url)`.
- Index `(scrape_run_id, status)` for finalization and progress counts.
- Successful jobs have a result; failed or unfinished jobs do not persist partial values.

### Deliberately absent persistence

Do not add tables or columns for:

- The Site URL Set.
- A separate filtered URL list.
- Queue messages.
- Raw provider requests or responses.
- Partial extraction output from failed jobs.
- Firecrawl metadata.
- Soft deletion.

The persisted scrape-job URLs are the authoritative final selected URL set.

## 7. Lifecycle and status derivation

Run status is a persisted projection of stage and job state. It is updated transactionally during lifecycle transitions rather than recomputed on every read. Repository reconciliation is permitted later but is not part of this scope.

### Creation and dispatch

1. Validate deployment configuration before creating a run.
2. Validate and normalize the request.
3. In one database transaction:
   - Insert the `pending` run.
   - Insert ordered field definitions.
   - Insert three `pending` stage rows.
4. Commit.
5. Start the Workflow with only the application run ID.
6. Save the Workflow run ID. The Workflow's claim step should also self-attach its own Workflow run ID idempotently by using `getWorkflowMetadata()`.
7. Return `201 Created`.

If another active run exists, the partial unique index must atomically reject creation and the API returns `409 Conflict`.

If Workflow dispatch rejects:

- Conditionally mark the still-pending run `failed` with `workflow_dispatch_failed`.
- Mark all stages `skipped`.
- Return `503 Service Unavailable` with the persisted run ID.

There is intentionally no transactional outbox. A narrow crash window exists after database commit and before Workflow start; this is an accepted initial-version tradeoff.

### Workflow claim

The first Workflow step atomically claims `pending → in_progress`, stores the Workflow run ID if missing, sets `started_at`, and starts Mapping. A duplicate Workflow start that cannot claim the run exits without side effects.

### Mapping

- `mapping: pending → in_progress → complete|failed|cancelled`.
- Call Firecrawl Map using the normalized target origin.
- On terminal mapping failure, mark Mapping `failed`, later stages `skipped`, and the run `failed`.

### Filtering

- Start only after Mapping completes.
- `filtering: pending → in_progress → complete|failed|cancelled`.
- Make exactly one LLM call for the entire Site URL Set.
- Validate the LLM output, union Example Pages, and persist every job in one transaction.
- Completing job creation completes Filtering and starts Scraping atomically.
- On terminal filtering or job-creation failure, mark Filtering `failed`, Scraping `skipped`, and the run `failed`.

### Scraping

- `scraping: pending → in_progress → complete|failed|cancelled`.
- Process persisted jobs in deterministic batches of at most five.
- Use `Promise.allSettled` so one job failure does not abort siblings.
- Query persisted terminal job state to derive the final outcome.

Final rules:

- At least one job succeeds: Scraping and the run are `complete`.
- All jobs fail: Scraping and the run are `failed`.
- Mixed successes and failures: Scraping and the run are `complete`.
- User cancellation: Scraping and the run are `cancelled`.

A valid run always has at least two jobs because Example Pages are always included. A zero-job completion is therefore unreachable.

### Unexpected orchestration failure

A top-level Workflow failure boundary handles uncategorized errors:

- Conditionally fail the active stage and run with `unexpected_workflow_failure`.
- Mark nonterminal jobs failed when Scraping had begun.
- Preserve already-terminal jobs and successful Extraction Results.
- Do not add a separate runtime reconciler in this scope.

This operational failure may fail the run even if an earlier job succeeded; it is distinct from ordinary mixed job outcomes.

## 8. Firecrawl Map contract

Use the installed Firecrawl SDK from a `"use step"` function.

Recommended options:

```ts
{
  sitemap: "include",
  includeSubdomains: false,
  ignoreQueryParameters: true,
  limit: 100_000,
}
```

Product assumptions and processing:

- Treat Map as returning the complete Site URL Set.
- Retain Firecrawl's default cache behavior.
- Read only returned URLs; titles and descriptions are not used for filtering.
- Normalize and deduplicate every returned URL.
- Defensively discard malformed URLs, subdomains, and unrelated hosts.
- Pass only the canonical URL strings to Filtering.
- Do not persist the mapped set or mapped count.

## 9. LLM URL-filtering contract

Use AI SDK structured output through Vercel AI Gateway. The model identifier is read from required `URL_FILTER_MODEL` configuration at run creation and persisted on the run. The persisted identifier, not the current environment value, is used during Filtering.

### Input

One call receives:

- All canonical URLs in the Site URL Set.
- All Example Page URLs.
- Instructions to select URLs that are structurally similar to the examples and to copy exact candidate URLs.

Do not chunk, truncate, sample, or preflight model context size. Context overflow is accepted as an edge case and, if it occurs, becomes a Filtering failure after retries.

### Output

Use a structured object such as:

```ts
{
  urls: string[]
}
```

The model returns URLs directly, never candidate indices.

Post-processing:

1. Parse each returned string as a URL.
2. Canonicalize it.
3. Keep it only if it belongs to the supplied Site URL Set.
4. Silently discard malformed, rewritten, or out-of-set URLs.
5. Deduplicate accepted URLs.
6. Union every Example Page, even if absent from Map or LLM output.
7. Produce jobs in deterministic order, preferring Site URL Set order and then missing examples in user-provided order.

A structurally malformed LLM response is retryable. Individual out-of-set URL entries are discarded rather than causing a retry.

Do not persist the prompt, complete response, or intermediate accepted URL array. The resulting job rows are authoritative.

## 10. Firecrawl Scrape extraction contract

Each job performs one Firecrawl Scrape JSON extraction per attempt from a `"use step"` function.

### Generated JSON Schema

For every configured field, use its stable Field Key and append exactly this instruction to the user description:

> Return null if not found on the page.

Construct this shape:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "client": {
      "type": ["string", "null"],
      "description": "The client who funded the project. Return null if not found on the page."
    }
  }
}
```

Rules:

- Every field type is `["string", "null"]`.
- Omit the JSON Schema `required` keyword entirely.
- Include `additionalProperties: false`.
- Retain Firecrawl's default cache behavior; do not set `maxAge: 0`.
- User/application requiredness never changes the Firecrawl schema.

### Application validation and normalization

Independently validate `document.json`:

- It must be an object.
- Unknown properties and non-string/non-null values make the provider output malformed and retryable.
- Omitted configured properties normalize to `null`.
- Trim string values.
- Empty or whitespace-only strings normalize to `null`.
- If any application-required field is `null`, fail the job without another scrape attempt and record the missing Field Keys.
- Because the Primary Identifier is required, a missing primary value fails the job.
- Duplicate Primary Identifier values across successful jobs are allowed.

Persist the normalized JSONB result only after all required fields pass. Do not persist partial values for a failed job.

## 11. Retry policy

Allow three total attempts for:

- Mapping.
- URL Filtering.
- Each individual Firecrawl Scrape call.

Persist attempt counts on the relevant stage or job. Keep the entity `in_progress` while retrying and mark it failed only after attempts are exhausted or a fatal failure occurs.

### Retryable

- Network failures and timeouts.
- Rate limits; honor `Retry-After` when available.
- HTTP `408`, `429`, `500`, `502`, `503`, and `504`.
- Structurally malformed/non-conforming LLM or Firecrawl output.

### Not retryable

- Invalid user input.
- Invalid generated schema or application configuration.
- Authentication/billing failures that cannot succeed without configuration changes.
- A valid extraction response with a `null` application-required field.
- Other deterministic `4xx` failures.

Use Workflow `RetryableError` and `FatalError` where appropriate. Configure two retries to produce three total attempts.

## 12. Concurrency and queueing

- Only one run per user may be active.
- Different users may have active runs concurrently.
- Within a run, process jobs in strict deterministic batches of five or fewer.
- Await each batch with `Promise.allSettled` before scheduling the next batch.
- Do not create a custom semaphore in the first version.
- Do not use direct Vercel Queues APIs.
- Firecrawl account-level concurrency and rate limits remain provider concerns.

Every job row exists before the first scrape call. A pending row is the application's durable backlog; Workflow step scheduling is the execution mechanism.

## 13. Idempotency and race safety

All mutations use conditional transitions. Important cases:

- Only `pending` runs can be claimed.
- Terminal runs, stages, and jobs cannot be rewritten by late responses.
- A retry observing an already-completed job returns its existing terminal outcome without re-scraping.
- If a scrape succeeded and its result commit completed before a step replay, replay does not call Firecrawl again.
- If the process failed after Firecrawl responded but before the result committed, repeating the external call is acceptable.
- Job creation is an upsert/no-op under the unique `(run_id, url)` constraint.
- Run finalization queries persisted job counts instead of trusting only in-memory counters.
- Cancellation guards exist before each batch and before each external scrape call.

## 14. Cancellation

Cancellation is two-phase.

### Request flow

1. Authenticate and verify ownership.
2. Atomically set `cancellation_requested_at` only on an active run.
3. Call `getRun(workflowRunId).cancel()` when a Workflow run ID exists.
4. After Workflow cancellation succeeds, transactionally:
   - Preserve completed and failed jobs.
   - Mark pending/in-progress jobs `cancelled`.
   - Preserve completed stages.
   - Mark current/future unfinished stages `cancelled`.
   - Mark the run `cancelled` and set its finish timestamp.
5. Return `202 Accepted`.

While cleanup is pending, status remains `in_progress` and `cancellation_requested_at` allows the client to render “Cancelling.” The run still blocks creation of another run.

### Failure and idempotency

- If Workflow cancellation fails, retain the cancellation request, keep the run active, and return `503`. A repeated request retries cancellation.
- Repeating cancellation for a requested or cancelled run is idempotent.
- Return `409` when attempting to cancel a run already `complete` or `failed`.
- Late provider responses cannot change cancelled jobs because completion updates are conditional.

### Completion race

The first atomic transition wins:

- If completion commits first, cancellation returns `409`.
- If `cancellation_requested_at` commits first, finalization must produce `cancelled`, even if the final scrape response arrives immediately afterward.

Successful results completed before cancellation remain available.

## 15. HTTP API

All endpoints require the current Better Auth session and enforce ownership. Return `404`, not `403`, for a missing or non-owned run/job.

No endpoint is paginated in this version.

### `POST /api/scrape-runs`

Responsibilities:

- Validate deployment configuration before persistence.
- Parse, validate, and normalize unknown JSON.
- Atomically enforce one active run per user through the database.
- Persist run configuration and stages.
- Dispatch Workflow and attach its run ID.

Responses:

- `201` with the created run summary after Workflow accepts dispatch.
- `400` for malformed JSON or request validation errors.
- `401` without a session.
- `409` when the user already has an active run.
- `503` for missing provider configuration or Workflow dispatch failure. A dispatch-failure response includes the persisted failed run ID.

### `GET /api/scrape-runs`

Return all current-user run summaries, newest first. A summary includes:

- Run ID and name.
- Target URL.
- Run status and cancellation-request timestamp.
- Aggregate job counts by status.
- Created, started, and finished timestamps.

Do not include fields, examples, stage details, job lists, or results.

### `GET /api/scrape-runs/:runId`

Return:

- Run summary and immutable configuration.
- Ordered extraction-field definitions.
- All three stage states and sanitized failures.
- Aggregate job counts.
- Lightweight summaries for all jobs.

Each lightweight job summary includes:

- Job ID.
- Canonical URL.
- Status.
- Primary Identifier value when successful.
- Failure code when failed.
- Attempt count.
- Lifecycle timestamps.

Do not include full Extraction Results or full failure messages in job summaries.

### `GET /api/scrape-runs/:runId/scrape-jobs/:jobId`

Verify both ownership and that the job belongs to the route's run. Return:

- Full job lifecycle state.
- URL and attempt count.
- Successful Extraction Result, if present.
- Missing-required Field Keys, if applicable.
- Sanitized failure code/message.
- Lifecycle timestamps.

### `POST /api/scrape-runs/:runId/cancel`

Use the cancellation contract above. Return `202`, `401`, `404`, `409`, or `503` as appropriate.

### Progress delivery

The frontend will poll run detail while the run is active and stop at a terminal status. Do not add backend streaming transports.

## 16. Deployment configuration

Required before accepting a run:

- `FIRECRAWL_API_KEY`.
- `URL_FILTER_MODEL`.
- Either `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`.
- Existing environment-specific database configuration.

Missing configuration returns `503` without creating a run.

Enable Workflow's Next.js integration through `withWorkflow` in `next.config.ts`. Keep Workflow functions thin and sandbox-safe; place PostgreSQL, Firecrawl, AI SDK, and other Node.js-dependent work in `"use step"` functions.

Do not persist API keys, OIDC tokens, provider credentials, or the contents of environment variables.

## 17. Errors, privacy, and observability

Persist and expose only:

- A stable application error code.
- A sanitized human-readable message.
- Attempt count.
- Failure timestamp through lifecycle timestamps.
- Missing-required Field Keys where applicable.

Provider payloads, stack traces, and internal exception details belong only in server logs.

Use structured logs containing application run ID, stage/job ID, Workflow run ID, transition, duration, attempt, and provider status code. Never log:

- Extraction Results.
- Full LLM prompts or responses.
- Complete Site URL Sets.
- Provider credentials.

Retain runs and successful results indefinitely in this version. User deletion cascades through all owned runs, fields, stages, jobs, and results. A Workflow that encounters a deleted run exits without recreating data.

## 18. Testing strategy

Use the existing Vitest projects and database-test infrastructure. Add `@workflow/vitest` when Workflow integration tests are introduced. Mock all Firecrawl and AI Gateway network traffic; tests must never consume provider credits.

### Unit tests

Cover:

- Input limits and cross-field validation.
- Target and page URL canonicalization.
- Exact-host enforcement and public-host rejection.
- Distinct example enforcement.
- Label validation and Field Key generation/collision handling.
- Firecrawl JSON Schema construction.
- LLM returned-URL filtering, discarding, ordering, and Example Page union.
- Extraction output normalization and required-field decisions.
- Retry classification.
- Run/stage outcome derivation.

### Database integration tests

Cover:

- One-active-run partial unique index under concurrent insert attempts.
- Run/config/stage creation transaction.
- Field and stage uniqueness constraints.
- Job URL uniqueness and idempotent creation.
- Conditional lifecycle transitions.
- Terminal-state protection against late updates.
- Mixed/all-failed finalization.
- Cancellation/completion race behavior.
- Cascade deletion.

### Route tests

Cover authentication, ownership, validation, conflict responses, dispatch success/failure, lightweight response boundaries, nested job membership, and cancellation status codes.

### Workflow integration tests

Cover:

- Successful Mapping → Filtering → Scraping.
- Mapping failure and skipped downstream stages.
- Filtering failure and skipped Scraping.
- LLM selecting nothing while Example Pages still create jobs.
- Out-of-set LLM URLs being discarded.
- Three-attempt retry behavior.
- Missing required fields failing a job without retry.
- Mixed job results completing the run.
- All jobs failing the run.
- At most five simultaneous scrape calls and strict batch behavior.
- Cancellation during preparation and Scraping.
- Late result protection after cancellation.
- Duplicate Workflow claim exiting harmlessly.
- Unexpected Workflow failure cleanup.

## 19. Phased implementation plan

Each phase is intended to fit within one focused coding session. Do not begin a phase until the preceding phase passes its declared tests.

### Phase 1 — Backend contracts and normalization

**Goal:** Finalize trusted backend inputs and pure domain helpers before persistence.

**Deliverables:**

- Expand the shared create-run Zod schema with agreed limits.
- Add target/example URL normalization and public-host checks.
- Add exact-host and distinct-example validation.
- Add Field Label validation and stable Field Key generation.
- Define shared status, stage, error-code, configuration, and result types.
- Keep helpers provider- and database-independent.

**Testing requirements:**

- Unit tests for every valid/invalid boundary.
- Canonicalization cases for queries, fragments, default ports, and trailing slashes.
- Exact-host/subdomain cases.
- Duplicate examples and label/key collisions.
- Existing create-dialog payload tests continue to pass or are deliberately updated.

**Exit condition:** A valid payload deterministically produces one normalized immutable Run Configuration.

### Phase 2 — Database schema and migration

**Goal:** Establish the authoritative persistence model and database invariants.

**Deliverables:**

- Add lifecycle and stage enums.
- Add `scrape_runs`, `scrape_run_fields`, `scrape_run_stages`, and `scrape_jobs` Drizzle tables.
- Add relations, indexes, checks, cascade behavior, and the one-active-run partial unique index.
- Generate a Drizzle migration with pnpm scripts.

**Testing requirements:**

- Apply migration to the integration test database.
- Integration tests for uniqueness, partial uniqueness, primary-implies-required, and cascades.
- Verify schema exports and TypeScript inferred types.

**Exit condition:** The database independently prevents the most important duplicate and ownership invariants.

### Phase 3 — Run/configuration repository

**Goal:** Persist and retrieve immutable runs without Workflow integration.

**Deliverables:**

- Transactionally create a run, ordered fields, and three pending stages.
- Translate the active-run unique violation into a domain conflict.
- Add owner-scoped run/configuration reads.
- Add Workflow run-ID attachment and idempotent run claim.

**Testing requirements:**

- Integration tests for atomic creation and rollback.
- Concurrent creation test proving one active run per user.
- Idempotent Workflow attachment/claim tests.
- Owner isolation tests.

**Exit condition:** Tests can seed and claim a complete persisted run configuration safely.

### Phase 4 — Lifecycle repository

**Goal:** Centralize all conditional state transitions before external providers are introduced.

**Deliverables:**

- Stage start/success/failure/skipped transitions.
- Idempotent job creation and job claim/completion/failure transitions.
- Attempt counters and sanitized failure storage.
- Database-derived job aggregates and run finalization.
- Cancellation request, cleanup, and completion-race primitives.
- Unexpected Workflow failure cleanup.

**Testing requirements:**

- Integration tests for valid and invalid transitions.
- Terminal-state immutability and late-update tests.
- Mixed/all-failed finalization tests.
- Cancellation race and partial-success preservation tests.

**Exit condition:** Every lifecycle path can be exercised against PostgreSQL without Firecrawl, AI, or Workflow.

### Phase 5 — Mapping and URL-filtering adapters

**Goal:** Implement provider-bound Run Preparation as independently testable steps.

**Deliverables:**

- Firecrawl Map adapter with agreed options and URL normalization.
- AI Gateway configuration validation.
- Single-call AI SDK structured URL filtering using the persisted model.
- Returned-URL intersection/discard logic, deterministic ordering, deduplication, and Example Page union.
- Retry/fatal error classification for both providers.

**Testing requirements:**

- Unit tests for prompt input and post-processing.
- Mocked adapter tests for Firecrawl success/errors and AI structured output/errors.
- Assert only exact-host canonical URLs survive.
- Assert no mapped list or LLM response is written to PostgreSQL or logs.

**Exit condition:** A normalized Run Configuration plus mocked Map response deterministically produces a validated job URL list.

### Phase 6 — Scrape extraction adapter

**Goal:** Implement one scrape attempt and its application-level result contract.

**Deliverables:**

- Dynamic Firecrawl JSON Schema builder.
- Firecrawl Scrape JSON-mode adapter.
- Output shape validation and normalization.
- Required-field and Primary Identifier checks.
- Retryable malformed-output and fatal missing-required outcomes.
- Result/error structures suitable for lifecycle repository calls.

**Testing requirements:**

- Exact schema snapshot/assertion: no `required`, all `["string", "null"]`, appended description, and `additionalProperties: false`.
- Tests for omitted, null, empty, whitespace, unknown, and wrong-typed properties.
- Tests proving optional null succeeds and required null fails without retaining partial values.
- Mocked provider error classification tests.

**Exit condition:** One mocked page scrape produces either a normalized complete result or an explicit retryable/fatal job outcome.

### Phase 7 — Workflow setup and Run Preparation orchestration

**Goal:** Enable Workflow and durably orchestrate claim, Mapping, Filtering, and job creation.

**Deliverables:**

- Enable `withWorkflow` in Next.js configuration.
- Add the scrape-run Workflow with only orchestration logic in the `"use workflow"` function.
- Add Node.js provider/database work as `"use step"` functions.
- Self-attach Workflow metadata and claim the run.
- Implement Mapping and Filtering stage transitions and retries.
- Persist all jobs transactionally before Scraping.
- Add the top-level unexpected-failure boundary.

**Testing requirements:**

- Add/configure `@workflow/vitest` integration support.
- Workflow tests for duplicate claims, preparation success, mapping failure, filtering failure, retries, skipped stages, and Example Page union.
- Assert preparation never begins for a cancelled/deleted/unclaimable run.

**Exit condition:** A seeded pending run reaches Scraping with the correct persisted jobs or reaches the correct terminal preparation failure.

### Phase 8 — Workflow job processing and finalization

**Goal:** Complete durable extraction with per-run concurrency five.

**Deliverables:**

- Process jobs in strict batches of up to five with `Promise.allSettled`.
- Add pre-batch and pre-call cancellation guards.
- Integrate scrape adapter outcomes with idempotent job transitions.
- Finalize Scraping and run state from persisted counts.
- Protect terminal/cancelled jobs from late responses.

**Testing requirements:**

- Workflow tests for all-success, mixed, and all-failed runs.
- Instrument mocked scrapes to prove maximum concurrency is five and batches do not overlap.
- Three-attempt transient retry test.
- Missing-required no-retry test.
- Replay/idempotency and late-response tests.

**Exit condition:** A seeded run can complete its full backend lifecycle with correct job and run outcomes.

### Phase 9 — Create and dispatch API

**Goal:** Replace the current logging stub with authenticated persistence and Workflow dispatch.

**Deliverables:**

- Preflight provider/model configuration.
- Persist normalized run configuration.
- Start the Workflow and save its run ID.
- Return the created run summary.
- Handle active-run conflicts and compensated dispatch failures.
- Remove payload logging.

**Testing requirements:**

- Route tests for `201`, `400`, `401`, `409`, and `503` paths.
- Assert no run is created for deployment misconfiguration.
- Assert dispatch failure produces a failed run and skipped stages.
- Assert valid normalized values—not raw request strings—are persisted.

**Exit condition:** The existing frontend POST can create and dispatch a real backend run without frontend changes.

### Phase 10 — Cancellation API

**Goal:** Add owner-scoped two-phase cancellation.

**Deliverables:**

- Add nested run cancellation route.
- Record cancellation intent atomically.
- Cancel Workflow through `workflow/api`.
- Clean unfinished stages/jobs and terminalize the run.
- Implement idempotency, terminal conflicts, and Workflow-cancellation failure handling.

**Testing requirements:**

- Route tests for `202`, `401`, `404`, `409`, and `503`.
- Integration tests for repeated cancellation and completion races.
- Workflow tests for cancellation during Mapping, Filtering, and Scraping.
- Assert successful pre-cancellation results remain intact.

**Exit condition:** An active run can be cancelled without late provider responses reviving work.

### Phase 11 — Read APIs and polling read models

**Goal:** Expose lightweight owner-scoped run and job state.

**Deliverables:**

- Implement run list, run detail, and nested job detail endpoints.
- Add efficient aggregate job-count queries.
- Add Primary Identifier projection to lightweight job summaries.
- Keep full results limited to job detail.
- Return cancellation-request state for polling clients.

**Testing requirements:**

- Authentication and cross-user isolation tests for every endpoint.
- Nested run/job membership tests.
- Response-shape tests proving heavyweight results are omitted from list/detail summaries.
- Aggregate-count and Primary Identifier tests.
- Confirm no pagination parameters or hidden limits are introduced.

**Exit condition:** A polling client can render run progress and fetch individual results without reading Workflow state.

### Phase 12 — End-to-end hardening

**Goal:** Validate the complete backend as one coherent system and document operations.

**Deliverables:**

- Add missing environment-variable examples without secrets.
- Add structured logging with privacy boundaries.
- Standardize stable error codes and sanitization.
- Run Workflow validation/health tooling required by the installed SDK.
- Document the accepted no-outbox crash window and manual diagnosis using Workflow tooling.
- Remove obsolete test mocks or stub expectations.

**Testing requirements:**

- Full lint, typecheck, unit, integration, and Workflow integration suites.
- One mocked end-to-end lifecycle from POST through run/job GETs.
- One mocked cancellation lifecycle.
- Assertions that logs never contain extracted values, full prompts/responses, or provider credentials.
- Production build with required non-secret environment placeholders.

**Exit condition:** All backend acceptance criteria below pass and the system is ready for frontend progress/result work.

## 20. Backend acceptance criteria

The backend scope is complete when:

1. A valid authenticated request persists an immutable run before dispatch.
2. Concurrent attempts cannot create two active runs for one user.
3. Mapping and Filtering each retry transient failures up to three total attempts.
4. Filtering uses one LLM call, accepts exact returned URLs, discards out-of-set URLs, and always includes examples.
5. All selected URLs exist as persisted jobs before the first scrape begins.
6. No more than five Firecrawl Scrape calls run concurrently within one run.
7. Every Firecrawl schema uses string-or-null properties, omits `required`, and appends the null instruction.
8. Missing/blank/omitted values normalize to null; any null required field fails its job.
9. Failed jobs do not retain partial extraction values.
10. Any successful job makes an ordinarily finalized run complete; all failed jobs make it failed.
11. Mapping, Filtering/setup, dispatch, or unexpected orchestration failure fails the run with a distinguishable code.
12. Cancellation is race-safe, preserves existing successes, and blocks a new run until terminal cleanup.
13. PostgreSQL—not Workflow history—is sufficient to serve all product read APIs.
14. No mapped set, duplicate filtered list, raw provider response, or extracted value in logs is retained.
15. Every route enforces session ownership and the declared HTTP behavior.
16. All declared unit, integration, route, provider, and Workflow tests pass.

## 21. Explicitly accepted tradeoffs

These are deliberate initial-version decisions, not omissions to “fix” during implementation:

- Firecrawl Map is trusted as the full site URL list.
- URL Filtering is one LLM call; there is no chunking or context-size guard.
- There is no maximum matching-page/job cap.
- Firecrawl's default cache behavior is retained.
- Strict five-job batches may experience head-of-line blocking.
- Read APIs are not paginated.
- Dispatch does not use a transactional outbox.
- There is no separate runtime reconciler.
- There is no direct Vercel Queues integration.
- Runs and results are retained indefinitely until their owning user is deleted.
