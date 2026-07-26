# Scrape Run Detail Frontend Design and Phased Implementation Plan

## 1. Purpose

Implement the lifecycle-aware Scrape Run workspace at `/app/scrape-runs/:id`, represented by the Next.js route `app/app/scrape-runs/[runId]/page.tsx`.

The page lets a user monitor an Active Scrape Run, understand preparation and terminal failures, review aggregate progress, browse lightweight Scrape Job summaries, cancel active work, and inspect the immutable Run Configuration. It does not display full per-job Extraction Results. Each Scrape Job links to a separate future detail route.

This document is standalone. It defines the relevant backend contracts, frontend behavior, component responsibilities, error handling, testing strategy, and phased implementation plan.

## 2. Goals

- Give one owned Scrape Run a durable, lifecycle-aware workspace.
- Explain what the Run is doing or why it stopped, including failures before Scrape Jobs exist.
- Keep active state current through polling without replacing usable cached content.
- Present all lightweight Scrape Job summaries with status filtering and client-side pagination.
- Link each Scrape Job to its future dedicated detail route without fetching full job detail on this page.
- Expose the immutable user-facing Run Configuration without allowing edits.
- Let the user request or retry cancellation safely.
- Make the existing Scrape Run list the in-app entry point to the detail route.
- Validate all API success data at runtime before it enters the SWR cache.
- Add focused frontend and backend read-contract tests without disturbing existing Workflow behavior.

## 3. Scope

### 3.1 In scope

- Dynamic frontend route `/app/scrape-runs/:runId`.
- A thin Server Component page and focused client-side SWR view.
- A small additive change to `GET /api/scrape-runs/:runId` exposing nullable Run-level failure code/message.
- Runtime-validated frontend contracts for Run detail and cancellation responses.
- Initial loading, not-found, initial-error, cached-data warning, and manual retry states.
- Three-second polling while the cached Run is active.
- Run identity, status, lifecycle timestamps, aggregate progress, and terminal failure presentation.
- Ordered Mapping, Filtering, and Scraping stage presentation.
- Lightweight Scrape Job summaries already returned by the Run-detail endpoint.
- Client-side status filtering and fixed 25-row pagination.
- Links to `/app/scrape-runs/:runId/scrape-jobs/:jobId`.
- Run cancellation and retrying an incomplete Cancellation Request.
- Collapsed immutable Run Configuration.
- Making existing Scrape Run list items link to their Run detail routes.
- Responsive and accessible behavior using existing shadcn/ui components.
- Unit, repository integration, route, contract, helper, and frontend component tests.

### 3.2 Out of scope

- Implementing `/app/scrape-runs/:runId/scrape-jobs/:jobId`.
- Calling the per-job detail endpoint from this page.
- Displaying complete Extraction Results or per-job failure messages.
- Job search.
- User-controlled sorting.
- Server-side job pagination or filtering.
- URL-backed filter or pagination state.
- Exports, downloads, bulk selection, or bulk actions.
- Retrying, cancelling, editing, cloning, or deleting individual Scrape Jobs.
- Retrying, cloning, editing, or deleting a Scrape Run.
- Editing immutable Run Configuration.
- Streaming through SSE or WebSockets.
- Server-side detail prefetching or SWR fallback hydration.
- Backend lifecycle, Workflow, persistence-schema, or provider changes beyond the additive Run-detail read field.
- New domain terminology or architectural decisions.

## 4. Domain language

The page uses these canonical concepts:

- **Scrape Run:** A user-initiated attempt to identify matching pages on one Target Site and extract the same structured fields from each page.
- **Active Scrape Run:** A Scrape Run with `pending` or `in_progress` status. A Cancellation Request does not make it terminal.
- **Run Configuration:** The immutable Target Site, Example Pages, and Extraction Fields captured when the Scrape Run was accepted.
- **Run Preparation:** Mapping and Filtering work that occurs before Scrape Jobs are established.
- **Run Stage:** One of Mapping, Filtering, or Scraping.
- **Cancellation Request:** The user's instruction to stop an Active Scrape Run. The Run remains active until cancellation cleanup finishes.
- **Scrape Job:** The extraction attempt for one Matching Page.
- **Extraction Result:** The complete normalized field set produced by a successful Scrape Job. This page does not display it.
- **Primary Identifier:** The required extracted field used to name and reference a successful result. The job table labels this value with the configured Field Label; it must not call the value a “Result.”
- **Skipped Stage:** A stage that could not execute because an earlier stage failed. It is distinct from cancellation.

The root `CONTEXT.md` remains authoritative. This feature does not require a glossary update.

## 5. Existing backend behavior relevant to the page

### 5.1 Ownership and authentication

All endpoints require the current Better Auth session and enforce ownership. Missing and non-owned Runs or jobs return `404`, not `403`. The authenticated `/app` layout already requires a session.

### 5.2 Run and job lifecycle

Run and job statuses are:

```ts
type ScrapeRunStatus =
  "pending" | "in_progress" | "complete" | "failed" | "cancelled"
```

Run Stage statuses add `"skipped"`. Run Stages are always ordered:

```ts
;["mapping", "filtering", "scraping"]
```

Relevant guarantees:

- `pending` and `in_progress` are active; all other Run statuses are terminal.
- Scrape Jobs do not exist during early Run Preparation, so an active Run may legitimately have zero jobs.
- Every selected Scrape Job exists before Scraping begins.
- A normally prepared Run has at least two jobs because Example Pages are always selected.
- Ordinary Scraping finalization marks the Run `complete` when at least one job succeeds, including mixed successful and failed jobs.
- A Run is ordinarily `failed` when all jobs fail.
- Dispatch, Mapping, Filtering, job-creation, or unexpected orchestration failures may produce a failed Run with zero jobs.
- Cancellation preserves already-complete and already-failed jobs and marks unfinished jobs cancelled.
- A Cancellation Request keeps the Run active and continues blocking another Run until cleanup finishes.
- PostgreSQL, not Workflow history, serves every read on this page.

### 5.3 Aggregate job counts

```ts
type ScrapeRunJobCounts = {
  total: number
  pending: number
  inProgress: number
  complete: number
  failed: number
  cancelled: number
}
```

All counts are nonnegative integers. Status-specific counts are mutually exclusive and sum to `total`.

The finished count is:

```ts
jobCounts.complete + jobCounts.failed + jobCounts.cancelled
```

## 6. HTTP contracts

Dates are PostgreSQL `Date` values internally and ISO date-time strings on the wire.

### 6.1 `GET /api/scrape-runs/:runId`

The existing response is extended with nullable `failureCode` and `failureMessage` at the Run level:

```ts
type ScrapeRunDetail = {
  id: number
  name: string
  targetUrl: string
  status: ScrapeRunStatus
  cancellationRequestedAt: string | null
  failureCode: ScrapeRunErrorCode | null
  failureMessage: string | null
  jobCounts: ScrapeRunJobCounts
  createdAt: string
  startedAt: string | null
  finishedAt: string | null

  exampleUrls: string[]
  filteringModel: string
  fields: Array<{
    position: number
    label: string
    key: string
    description: string
    required: boolean
    primaryIdentifier: boolean
  }>

  stages: Array<{
    stage: "mapping" | "filtering" | "scraping"
    status: ScrapeRunStatus | "skipped"
    attemptCount: number
    failureCode: ScrapeRunErrorCode | null
    failureMessage: string | null
    createdAt: string
    updatedAt: string
    startedAt: string | null
    finishedAt: string | null
  }>

  jobs: Array<{
    id: number
    url: string
    status: ScrapeRunStatus
    primaryIdentifier: string | null
    failureCode: ScrapeRunErrorCode | null
    attemptCount: number
    createdAt: string
    updatedAt: string
    startedAt: string | null
    finishedAt: string | null
  }>
}
```

Stable error codes are:

```ts
type ScrapeRunErrorCode =
  | "workflow_dispatch_failed"
  | "mapping_failed"
  | "filtering_failed"
  | "job_creation_failed"
  | "scrape_failed"
  | "missing_required_fields"
  | "unexpected_workflow_failure"
```

Responses:

- `200`: owned Run detail.
- `401`: no valid session.
- `404`: malformed positive-integer ID, missing Run, or non-owned Run.

The response ordering contract is deterministic: fields are ordered by ascending `position`, stages use canonical Mapping → Filtering → Scraping order, and jobs are ordered by ascending job ID. Polling must preserve that job order as statuses change.

The repository must add only `scrape_runs.failure_code` and `scrape_runs.failure_message` to the existing owner-scoped read projection. No provider detail, Workflow detail, Extraction Result, or per-job failure message is added.

### 6.2 Why Run-level failure is required

Stage failures explain Mapping, Filtering, and Scraping failures. They do not explain every terminal Run outcome. A dispatch failure can fail a Run and mark all stages skipped, and an unexpected orchestration failure may need a Run-level explanation. The page therefore needs the already-persisted, sanitized Run failure fields.

### 6.3 `POST /api/scrape-runs/:runId/cancel`

The endpoint records a Cancellation Request, asks Workflow to cancel when applicable, completes database cleanup, and only then returns `202`:

```ts
type CancelScrapeRunResponse = {
  id: number
  status: "cancelled"
}
```

Responses:

- `202`: cancellation cleanup completed; the Run is cancelled.
- `401`: no valid session.
- `404`: malformed ID, missing Run, or non-owned Run.
- `409`: the Run completed or failed before cancellation won the race.
- `503`: Workflow cancellation did not finish. The Cancellation Request remains recorded and a repeated POST retries cleanup.

A `202` must display **Cancelled**, not **Cancelling**. **Cancelling** is the visible label only while an otherwise active Run has non-null `cancellationRequestedAt`, including a request initiated elsewhere or a `503` that persisted intent without finishing cleanup.

### 6.4 Future job-detail route

Every job summary links to:

```text
/app/scrape-runs/:runId/scrape-jobs/:jobId
```

That frontend route is intentionally not implemented in this scope. Dead links are accepted temporarily. Use `prefetch={false}` for these links so a page containing up to 25 currently visible jobs does not prefetch an unimplemented dynamic route.

The existing backend job-detail endpoint is not called by this page.

### 6.5 Error response shape

Handled route errors use a safe JSON object:

```ts
type ScrapeRunApiErrorResponse = {
  error: string
}
```

Frontend behavior depends on HTTP status, not exact message matching. Unknown, malformed, or non-JSON error bodies use a generic safe fallback.

## 7. Frontend runtime contracts

Extend the shared frontend API contract surface with strict Zod schemas and inferred types for:

- Extraction-field definitions.
- Run Stage states.
- Lightweight Scrape Job summaries.
- Complete Run detail.
- Cancellation success response.

Reuse existing shared schemas for Run Status, job counts, errors, normalized Target Site URLs, positive IDs, and ISO date-times where practical.

Validation should enforce:

- Positive integer Run and job IDs.
- Nonnegative integer positions, attempts, and counts.
- Known status, stage, and failure-code values.
- Valid normalized Target Site origin.
- Valid HTTP(S) Example Page and job URLs.
- Nullable timestamps exactly where declared.
- Exactly three unique Run Stages in canonical order.
- At least one Extraction Field and exactly one Primary Identifier field.
- The Primary Identifier field is required.
- Status-specific job counts sum to `total`.
- Every success body is parsed from `unknown` before entering the SWR cache.

The API continues returning `filteringModel` and Field Keys, so the schema validates them. Presentation components intentionally do not display them.

A nonconforming `200` or `202` response is an API failure and must not partially populate or mutate a cache.

## 8. Page and component architecture

### 8.1 Dynamic route

Create:

```text
app/app/scrape-runs/[runId]/page.tsx
```

The page remains a Server Component. In Next.js 16, `params` is a Promise; the page awaits `params`, obtains `runId`, and passes the serializable string into a focused client view. Prefer the generated route-aware `PageProps<"/app/scrape-runs/[runId]">` type after `next typegen`.

Use a static application-header title such as **Scrape Run**, because this design deliberately avoids a duplicate server fetch merely to obtain the Run name. The loaded Run name is the main content heading.

A route-level `loading.tsx` may reuse the page skeleton so navigation to the dynamic route has immediate feedback. The client view still owns the initial API-loading state because data is fetched only after hydration.

Do not add `generateStaticParams`; Runs are authenticated, user-owned runtime data.

### 8.2 Client boundary

A focused client component owns:

- `useSWR` for Run detail.
- `useSWRMutation` for cancellation.
- Conditional polling and bounded retry behavior.
- Local job-status filter and page state.
- Derived active, cancelling, progress, filtered-job, and pagination values.
- Revalidation of Run-detail and Run-list cache entries.
- Composition of page states and sections.

Keep the client boundary as deep as practical. Do not import server-only repositories into the client graph. Do not add a global `SWRConfig` for this feature; tests may provide isolated caches.

Direct `useEffect` usage is prohibited. Derive filtered and paginated jobs during render, reset pagination in filter event handlers, use SWR for network synchronization, and use mutation handlers for cancellation.

### 8.3 Stable section order

The page must not reorder itself when polling changes the Run from active to terminal. Use this stable order:

1. Breadcrumb and Run header.
2. Run-level status/progress or failure alert.
3. Ordered Run Stage timeline.
4. Paginated Scrape Job summaries.
5. Collapsed Run Configuration.

Status-dependent content may change in place, but sections do not move.

### 8.4 Suggested module responsibilities

Exact filenames may follow implementation ergonomics, but keep responsibilities focused:

```text
app/app/scrape-runs/[runId]/page.tsx
  Dynamic Server Component shell; awaits params and passes runId.

app/app/scrape-runs/[runId]/loading.tsx
  Optional route-transition skeleton.

components/scrape-runs/scrape-run-detail-view.tsx
  SWR ownership, cancellation mutation, local list state, and composition.

components/scrape-runs/scrape-run-detail-header.tsx
  Breadcrumb, identity, status, timestamps, and cancellation action.

components/scrape-runs/scrape-run-overview.tsx
  Aggregate progress, terminal outcomes, and Run-level failure alert.

components/scrape-runs/scrape-run-stage-list.tsx
  Ordered Mapping, Filtering, and Scraping presentation.

components/scrape-runs/scrape-job-summary-table.tsx
  Status filter, linked rows, responsive table, empty states, and pagination.

components/scrape-runs/scrape-run-configuration.tsx
  Collapsible Target Site, Example Pages, and Extraction Fields.

components/scrape-runs/cancel-scrape-run-dialog.tsx
  Confirmation, retry-cancellation copy, and mutation state.

lib/scrape-runs/api-contracts.ts
  Shared wire schemas, fetchers, safe API errors, and path builders.

lib/scrape-runs/presentation.ts
  Pure lifecycle, formatting, progress, filter, and pagination derivations.
```

Prefer existing shadcn/ui components from `components/ui`, including Breadcrumb, Badge, Alert, Progress, Card, Collapsible, Table, Select, Pagination, AlertDialog, Skeleton, Tooltip, and Button. Do not create replacements for primitives already present.

## 9. Run detail data behavior

### 9.1 SWR key and fetcher

Use the exact owner-scoped endpoint as the cache key:

```ts
;`/api/scrape-runs/${runId}`
```

The fetcher must:

1. Perform a same-origin GET.
2. Parse non-success responses into the existing typed frontend API error.
3. Parse successful JSON as `unknown` through the Run-detail schema.
4. Return only validated detail data.

### 9.2 Conditional polling

Poll every three seconds while the latest cached Run status is `pending` or `in_progress`. A Run labeled **Cancelling** remains active and therefore continues polling.

Stop interval polling when the cached Run becomes `complete`, `failed`, or `cancelled`. Retain focus and network-reconnect revalidation so a terminal cached view can still be refreshed when the user returns.

Use default hidden-tab behavior to avoid interval polling while the document is hidden. Avoid overlapping ordinary polling with an active error-retry loop; resume the normal interval after a successful request or manual retry.

### 9.3 GET retries

- Retry network and `5xx` failures up to three times using SWR backoff.
- Do not automatically retry `4xx` responses, including `404`.
- A manual **Retry** action invokes bound revalidation.

### 9.4 Loading and failure states

- **Route transition:** show a route skeleton if `loading.tsx` is included.
- **Initial client load:** show a structured detail-page skeleton while keeping back navigation available.
- **404 without cached data:** show **Scrape Run not found** and a link back to `/app/scrape-runs`.
- **Other initial failure:** show an inline safe error and **Retry** action.
- **Background failure with cached data:** keep every cached section visible and show a compact **Couldn’t refresh scrape run** warning with Retry.
- Do not replace cached data with skeletons during polling.
- Do not show an ordinary background-refresh spinner.
- Do not emit toasts for polling or revalidation failures.

Use appropriate alert/live-region semantics without repeatedly announcing unchanged polling failures.

## 10. Run header and lifecycle overview

### 10.1 Breadcrumb and identity

Show a breadcrumb back to **Scrape Runs**, followed by the loaded Run name. The main content header includes:

- Run name.
- Target Site hostname and normalized origin link.
- Textual Run Status badge.
- Lifecycle timestamps.
- Cancellation action when applicable.

Do not show the numeric Run ID.

### 10.2 Visible status labels

| Condition                             | Label       |
| ------------------------------------- | ----------- |
| `pending`                             | Pending     |
| `in_progress`                         | In progress |
| Active with `cancellationRequestedAt` | Cancelling  |
| `complete`                            | Complete    |
| `failed`                              | Failed      |
| `cancelled`                           | Cancelled   |

A Cancellation Request overrides the visible label only while the Run is active. Include text in every status badge; color or motion must never be the sole signal. Decorative spinners are hidden from assistive technology.

### 10.3 Run timestamps

Show localized timestamps with semantic `<time dateTime>` elements:

- **Created** always.
- **Started** when available.
- **Finished** for a terminal Run when available.
- **Cancellation requested** when present.

Use a stable `Intl.DateTimeFormat` configuration with medium date and short time styles. Do not display a continuously updating duration or relative time.

### 10.4 Aggregate progress

Use the same lifecycle semantics as the Run Summary list:

- Active with zero jobs: **Preparing matching pages…**; never show `0 of 0` or a determinate progress bar.
- Active with jobs: **X of Y jobs finished** and an accessible determinate progress bar.
- Terminal with jobs: show complete, failed, and cancelled counts; omit the cancelled phrase only when zero.
- Terminal with zero jobs: **No scrape jobs created**.

Progress is:

```ts
;(finishedCount / jobCounts.total) * 100
```

Mixed job outcomes remain explicit even when the Run status is **Complete**.

### 10.5 Run-level failure alert

When a Run has a terminal failure code/message, show a prominent but sanitized alert containing:

- A concise failure heading.
- The sanitized failure message.
- The stable failure code as secondary diagnostic information.

Do not expose stack traces, provider payloads, prompts, credentials, or raw internal exceptions.

## 11. Run Stage presentation

Show all three Run Stages in canonical order as a compact timeline or ordered list:

1. Mapping.
2. Filtering.
3. Scraping.

For each stage show:

- Human-readable stage name.
- Textual status badge.
- Attempt count when greater than zero.
- Start and finish timestamps when available.
- Sanitized failure message and stable failure code when failed.

Visually and textually distinguish:

- `pending` from `in_progress`.
- `failed` from `skipped`.
- `skipped` from `cancelled`.
- `complete` from the Run-level mixed-outcome semantics.

Do not infer Workflow state or fetch Workflow history.

## 12. Scrape Job summary browser

### 12.1 Data boundary

Use only the `jobs` array already present in Run detail. Do not call:

```text
GET /api/scrape-runs/:runId/scrape-jobs/:jobId
```

Consequently, this page displays no complete Extraction Result, missing-required Field Key list, or sanitized per-job failure message.

### 12.2 Table columns

Use a responsive shadcn Table. Each job exposes:

1. **Primary Identifier Field Label** — the column heading is the configured Primary Identifier's user-facing Field Label, such as **Client**. Show the projected value for a successful job and an em dash otherwise.
2. **Page URL** — truncated Canonical Page URL with the full text available to pointer and keyboard users.
3. **Status** — textual badge; failed jobs also show their stable `failureCode` as secondary diagnostic text.
4. **Attempts** — nonnegative attempt count.
5. **Finished** — localized `finishedAt` for a terminal job, otherwise an em dash.

Do not label the Primary Identifier column **Result**, because an Extraction Result is the complete field set.

On narrow layouts, combine identifier and URL information in the primary cell and hide lower-priority Attempts and Finished columns rather than forcing unusable horizontal width. Status remains visible.

### 12.3 Job navigation

Provide semantic Next.js Links to:

```ts
;`/app/scrape-runs/${runId}/scrape-jobs/${job.id}`
```

Both the Primary Identifier value when present and the Page URL may provide the detail link. Do not implement navigation through an `onClick`-only table row. Give the row/link clear hover and keyboard-focus treatment.

Set `prefetch={false}` until the nested frontend route exists. Temporary `404` navigation is an explicitly accepted product state.

### 12.4 Status filtering

Use one locally controlled shadcn Select labeled **Filter by status**. Options show their current counts:

- All.
- Pending.
- In progress.
- Complete.
- Failed.
- Cancelled.

Filtering is exact by canonical job status. It does not change backend order. Changing the filter resets pagination to page 1 in the change handler.

Do not add text search, multi-select status filtering, user sorting, or URL query parameters.

### 12.5 Client-side pagination

- Fixed page size: 25 jobs.
- Preserve the API's stable job order.
- Apply status filtering before pagination.
- Hide pagination controls when the filtered collection has one page or fewer.
- Show the visible range and filtered total where useful, for example **26–50 of 83 jobs**.
- Disable previous/next controls at their bounds.
- When polling reduces the filtered page count, derive a clamped visible page without `useEffect` synchronization.

### 12.6 Job-list empty states

- Active Run with zero total jobs: explain that Run Preparation is establishing matching pages.
- Terminal Run with zero total jobs: **No scrape jobs created**.
- Non-`All` filter with no matches: explain that no jobs have the selected status and offer a local **Show all jobs** action.

Do not imply that zero jobs during Run Preparation means completion.

### 12.7 Explicit client-pagination tradeoff

Client-side pagination limits rendered rows but not response size. The backend has no job-count cap, and `GET /api/scrape-runs/:runId` returns every lightweight job summary. An active Run with a very large job set may therefore resend and validate a large array every three seconds.

This performance risk is explicitly accepted for the initial version. Do not introduce hidden backend limits, server pagination, truncation, sampling, or a separate polling endpoint while implementing this spec.

## 13. Run Configuration

Render the immutable Run Configuration in a shadcn Collapsible that starts closed. Expanding it is local UI state and performs no request.

Show:

- Target Site as the normalized origin and an external link.
- Ordered Example Pages as external links.
- Ordered Extraction Fields with:
  - Field Label.
  - Description.
  - Required or optional state.
  - Primary Identifier marker.

Do not show:

- Field Keys.
- Filtering-model identifier.
- Workflow run ID.
- Provider configuration.
- Credentials.
- Any editing controls.

External links should be identifiable as leaving the application and use safe new-tab behavior when opened in a new tab.

## 14. Cancellation behavior

### 14.1 Action availability

Show **Cancel Scrape Run** while a Run is active and no Cancellation Request is recorded.

When an active Run has `cancellationRequestedAt`, show **Retry cancellation** with a short explanation that the earlier request has not finished cleanup. The Run remains active and polling continues.

Do not show either action for `complete`, `failed`, or `cancelled` Runs.

### 14.2 Confirmation

Use shadcn AlertDialog:

- Initial cancellation explains that unfinished work will stop while already-finished outcomes remain.
- Retry confirmation explains that it is retrying incomplete cancellation cleanup.
- The destructive action has explicit text.
- While the POST is in flight, disable duplicate submission and dismissal paths that could imply the action stopped.
- Do not automatically retry the non-idempotent POST from the client, even though the backend operation itself is idempotent.

### 14.3 Mutation outcomes

**On `202`:**

- Treat the validated response as authoritative confirmation that cleanup finished.
- Close the dialog.
- Project only the confirmed `status: "cancelled"` into the existing Run-detail and matching Run-list cache entries, then revalidate both keys to obtain final stages, job counts, timestamps, and other cleanup results.
- Do not synthesize stage states, job counts, or timestamps from the minimal mutation response.
- Present **Cancelled**, not **Cancelling**, immediately after the validated `202`.
- If either revalidation fails, retain the confirmed Cancelled status alongside the prior cached ancillary detail and show the normal stale-data refresh warning until a GET succeeds.

**On `409`:**

- The Run completed or failed before cancellation won.
- Close or leave the dialog in a resolved state.
- Revalidate both detail and list caches.
- Show a safe, non-destructive explanation rather than treating the race as an unknown failure.

**On `503`:**

- The Cancellation Request may now be persisted even though cleanup failed.
- Keep the page usable and show a safe warning.
- Revalidate both caches.
- Once detail reports an active Run with `cancellationRequestedAt`, show **Cancelling** and **Retry cancellation**.

**On `404`:**

- Revalidate detail; if it remains missing, transition to the not-found state.

**On network or malformed-response failure:**

- Preserve cached detail.
- Show a safe warning.
- Do not infer whether the backend received the request; revalidation is allowed to reconcile authoritative state.

### 14.4 Cache ownership

The cancellation mutation key differs from the Run-detail GET key. Cancellation handlers must explicitly reconcile:

- `/api/scrape-runs/:runId`.
- `/api/scrape-runs`.

Do not mutate lifecycle counts, stage states, or lifecycle timestamps by hand from the minimal `202` response. The validated mutation response is authoritative only for the Run's Cancelled status; PostgreSQL-backed GET responses remain authoritative for the complete read model.

## 15. Existing Scrape Run list integration

Change each existing Run Summary item on `/app/scrape-runs` from informational content into a semantic Next.js Link to:

```ts
;`/app/scrape-runs/${run.id}`
```

Preserve all existing list content, polling, creation, active-run disabling, responsive layout, and status semantics. Use the existing shadcn Item render capability or an equivalent semantic anchor composition rather than an `onClick` handler on a generic container.

Add visible hover and keyboard-focus treatment. Do not add a redundant **View** button.

This deliberately supersedes the earlier local choice that list items were non-clickable; no backend list-contract change is required.

## 16. Accessibility and responsive behavior

- Use one logical heading hierarchy beneath the application header.
- Use semantic Breadcrumb, Table, links, buttons, `<time>`, and alert elements.
- Ensure status, progress, stage state, and failure state never rely on color alone.
- Give every Progress component an accessible label and value.
- Hide decorative spinners/icons from assistive technology.
- Make disabled and pending cancellation states understandable in text.
- Ensure the status Select has a persistent accessible label.
- Expose full truncated URL text through an accessible mechanism usable by keyboard and pointer users; do not rely on a pointer-only native title as the sole access path.
- Keep focus indicators visible for Run links, job links, pagination controls, configuration disclosure, Retry actions, and cancellation controls.
- Avoid layout overflow with long Run names, Primary Identifier values, Field Labels, descriptions, and URLs.
- Respect reduced-motion behavior through existing shadcn/project primitives.
- Do not introduce direct `useEffect` calls.

## 17. Testing strategy

Use the existing Vitest projects, jsdom Testing Library setup, isolated SWR cache provider, MSW server, and database-test infrastructure. No new test framework or production dependency is required.

### 17.1 Repository integration tests

Extend `tests/integration/scrape-run-read-repository.test.ts` to cover:

- Run-level failure code/message returned for an owned failed Run.
- Null Run-level failure fields for ordinary non-failed Runs.
- Owner isolation remains intact.
- Canonical stage ordering remains intact.
- Lightweight jobs still omit full results and failure messages.

### 17.2 Route tests

Extend `tests/unit/scrape-run-read-routes.test.ts` to cover:

- `200` includes nullable Run failure fields.
- `401` remains unchanged.
- Invalid, missing, and non-owned Run IDs return `404`.
- The route does not expose Workflow IDs, provider data, or Extraction Results.

Keep existing cancellation route tests and add missing response-shape/race assertions if needed for frontend assumptions:

- `202` body is `{ id, status: "cancelled" }` only after cleanup.
- `409`, `404`, and `503` retain safe errors.

### 17.3 Contract and helper tests

Extend frontend contract/helper tests to cover:

- One complete valid Run detail response.
- Invalid Run, job, and stage IDs.
- Unknown statuses, stages, and failure codes.
- Invalid URLs and timestamp nullability.
- Missing, duplicate, or misordered Run Stages.
- Missing or multiple Primary Identifier fields.
- Primary Identifier not marked required.
- Job counts that do not sum to total.
- Valid and malformed cancellation success responses.
- Active and Cancelling derivation.
- Finished-count and progress calculations.
- Run and Stage labels.
- Run-level and job-level timestamp formatting.
- Exact status filtering.
- Stable pagination, page ranges, and clamping after polling changes.
- Primary Identifier Field Label selection.

### 17.4 Frontend component integration tests

Use MSW and Testing Library to cover:

**Loading and errors**

- Route/page skeleton and available back navigation.
- Valid detail replacing the skeleton.
- Dedicated `404` state.
- Initial network/`5xx` retry behavior and manual Retry.
- No automatic `4xx` retry.
- Cached detail surviving a polling failure with a compact warning.
- No polling-error toast spam.

**Lifecycle presentation**

- Pending Run Preparation with zero jobs.
- Active job progress and accessible progress value.
- Complete all-success and mixed-outcome Runs.
- Failed zero-job preparation Run with Run-level failure alert.
- Cancelled Run with preserved complete/failed counts.
- Created, started, finished, and cancellation-request timestamps.
- Every Stage status, including Skipped versus Cancelled.
- Stage attempts, timestamps, and sanitized failure presentation.

**Job summaries**

- Dynamic Primary Identifier Field Label heading.
- Primary values only for successful jobs.
- URL, status, failure code, attempts, and finished-time presentation.
- Semantic nested-route links with prefetch disabled.
- Exact status filtering and option counts.
- Filter change resetting to page 1.
- 25-row pages, ranges, bounds, and hidden controls for one page.
- Polling changes that shrink the filtered result set and clamp the visible page.
- Preparation, terminal zero-job, and no-filter-match empty states.
- **Show all jobs** reset behavior.

**Configuration**

- Starts collapsed.
- Expands without a network request.
- Shows Target Site, Example Pages, and ordered user-facing fields.
- Marks required and Primary Identifier fields.
- Does not show Field Keys or filtering model.

**Polling**

- Requests every three seconds while pending or in progress.
- Continues while Cancelling.
- Stops when a terminal response enters cache.
- Retains focus/reconnect behavior.
- Cleans timers on unmount.

**Cancellation**

- Initial and retry-cancellation copy.
- Confirmation required before POST.
- Duplicate submission and dismissal prevented while mutating.
- `202` revalidates detail and list and yields Cancelled.
- `409` revalidates a completion race.
- `503` preserves content, revalidates, and exposes Retry cancellation when intent is observed.
- `404`, network failure, and malformed `202` fail safely.
- No automatic mutation retry.

**Run-list integration**

- Every existing Run Summary item has the correct semantic detail link.
- Keyboard focus and activation work.
- Existing creation and polling behavior does not regress.

Use fake timers only for polling and retry tests, restore real timers after each test, and isolate SWR caches so assertions do not leak between tests.

### 17.5 Manual verification

- Responsive layout at small, medium, and wide viewport sizes.
- Long Run names, hostnames, Primary Identifier values, URLs, and field descriptions.
- Keyboard navigation through breadcrumb, Run links, filters, pagination, configuration, cancellation, and Retry actions.
- Screen-reader names for status, progress, links, timestamps, alerts, and controls.
- Dynamic-route transition feedback.
- Browser back navigation from Run detail to the Run list.
- Temporary job-detail links navigating to the expected unimplemented route.

## 18. Phased implementation plan

Each phase should fit one focused implementation session and leave the repository in a passing state. Do not begin a phase until the preceding phase meets its exit condition.

### Phase 1 — Detail contracts and backend read-model completion

#### Scope

Establish the complete trusted data boundary before building the page. Make the smallest required backend addition and add pure frontend contracts and derivations.

#### Objectives

- Expose the persisted Run-level failure information needed to explain failures outside a specific Run Stage.
- Ensure no unknown API JSON enters the planned SWR cache.
- Define lifecycle, filter, pagination, and presentation behavior as independently testable pure logic.
- Preserve all existing backend ownership and lightweight-response boundaries.

#### Deliverables

- Add Run `failureCode` and `failureMessage` to the owner-scoped read repository projection and Run-detail route response.
- Add strict Zod schemas and inferred types for Run detail, fields, stages, lightweight jobs, and cancellation success.
- Add a validated Run-detail fetcher and cancellation fetcher using the existing safe frontend API error type.
- Add focused API path builders for Run detail, cancellation, and future job detail.
- Add pure helpers for Run/Stage status labels, timestamps, progress, Primary Identifier field selection, status filtering, pagination, visible ranges, and page clamping.
- Keep server-only and client-safe modules separated.

#### Success criteria

- An owned failed Run exposes its sanitized Run-level failure without exposing any additional sensitive data.
- Existing list and job-detail contracts remain unchanged.
- Invalid success JSON is rejected before caching.
- All planned list transformations are deterministic and require no React effects.
- Existing backend and frontend consumers continue to typecheck.

#### Testing requirements

- Repository integration tests for present/null Run failure fields and owner isolation.
- Route tests for `200`, `401`, and `404` response boundaries.
- Contract tests for every field, lifecycle enum, cross-field invariant, and malformed success response.
- Helper tests for progress, filtering, pagination, labels, and timestamps.
- Regression tests proving full job results, job failure messages, and Workflow IDs are not accidentally added to the Run-detail lightweight job projection.

#### Exit condition

Tests can obtain and runtime-validate one complete Run-detail payload, derive every page-level state, and parse cancellation responses without rendering React.

### Phase 2 — Dynamic route and lifecycle overview

#### Scope

Build the read-only dynamic route and every Run-level section except the full Scrape Job table interaction.

#### Objectives

- Establish the Next.js route and client boundary correctly for version 16.
- Provide robust initial loading, not-found, retry, cached-warning, and polling behavior.
- Explain active, complete, failed, and cancelled Runs without consulting Workflow history.
- Keep the page structure stable across lifecycle transitions.

#### Deliverables

- Add `app/app/scrape-runs/[runId]/page.tsx` using async Promise params and a thin Server Component.
- Add a route-transition loading skeleton if useful for immediate dynamic-route navigation.
- Add the focused SWR detail view with local configuration, three-second active polling, focus/reconnect revalidation, bounded retries, and manual Retry.
- Add breadcrumb/header, Run identity, status, lifecycle timestamps, and aggregate progress.
- Add Run-level failure alert.
- Add ordered Run Stage timeline.
- Add collapsed Run Configuration.
- Add initial skeleton, dedicated not-found state, initial error state, and cached refresh warning.
- Use existing shadcn components and no direct `useEffect`.

#### Success criteria

- Every Run lifecycle state is understandable before the job browser is added.
- Run Preparation never appears as completed zero-total progress.
- Failed preparation and dispatch outcomes can be explained from sanitized Run/Stage data.
- Cached content remains visible through polling failures.
- Polling begins and ends solely from cached Run status.
- Configuration remains secondary and immutable.

#### Testing requirements

- Frontend tests for loading, `404`, initial errors, retries, cached warnings, and manual Retry.
- Fake-timer tests for active, Cancelling, and terminal polling behavior.
- Tests for every Run Status and every Stage Status.
- Progress and mixed-outcome rendering tests.
- Failure-code/message privacy-boundary tests.
- Configuration disclosure and no-extra-request tests, including proof that Field Keys and the filtering model are not presented.
- Accessibility tests for headings, breadcrumb, statuses, progress, timestamps, alerts, and disclosure.

#### Exit condition

Direct navigation to an owned Run renders a complete, polling lifecycle overview and immutable configuration with correct loading and failure behavior.

### Phase 3 — Paginated Scrape Job summaries and navigation

#### Scope

Add the lightweight job browser and connect both Run and job navigation paths. Do not add any mutation.

#### Objectives

- Make all existing lightweight job summaries browsable without requesting job detail.
- Preserve precise domain language around Primary Identifiers and Extraction Results.
- Keep large rendered lists manageable through filtering and pagination.
- Establish navigation to current and future detail routes.

#### Deliverables

- Add responsive shadcn Table presentation.
- Label the Primary Identifier column with its configured Field Label.
- Add Page URL, status/failure code, attempts, and finished-time cells.
- Add exact local status Select with counts.
- Add fixed 25-row client pagination and visible-range copy.
- Add preparation, terminal-zero, and no-filter-match empty states.
- Add semantic future job-detail Links with `prefetch={false}`.
- Convert existing Run Summary Items into semantic Links to Run detail.
- Preserve backend job order and derive/clamp pages without effects.

#### Success criteria

- The page never calls the per-job API.
- The term **Result** is not misused for a Primary Identifier value.
- Filtering and pagination operate only on validated cached summaries.
- Polling updates visible rows without losing the selected filter.
- No more than 25 job rows render per page.
- Existing list-page creation, polling, and active-run behavior remains intact.

#### Testing requirements

- Table content and responsive-priority tests.
- Dynamic Primary Identifier label/value tests.
- Failed job code and terminal timestamp tests.
- Status option count and filtering tests.
- Pagination boundary, reset, range, and polling-clamp tests.
- Empty-state tests.
- Assertions that no job-detail network request occurs.
- Semantic Run and job link tests, including disabled prefetch for future routes.
- Regression tests for the existing Run Summary list.

#### Exit condition

Users can enter a Run from the existing list, browse and filter all lightweight jobs 25 at a time, and follow stable links toward future individual job detail pages.

### Phase 4 — Run cancellation and cache reconciliation

#### Scope

Add the only mutation on the page and integrate it with active polling and both relevant SWR caches.

#### Objectives

- Allow deliberate, confirmed cancellation without implying that closing a dialog undoes a request.
- Correctly distinguish an in-flight request, an observed Cancellation Request, and completed cancellation.
- Make incomplete cancellation cleanup recoverable.
- Resolve cancellation/completion races from authoritative GET state.

#### Deliverables

- Add shadcn AlertDialog cancellation confirmation.
- Add `useSWRMutation` cancellation ownership and pending state.
- Add **Cancel Scrape Run** and **Retry cancellation** variants.
- Handle `202`, `409`, `503`, `404`, network failure, and malformed success bodies.
- On validated `202`, project only the confirmed Cancelled status into Run-detail and Run-list caches before revalidating their complete read models.
- Revalidate Run-detail and Run-list cache keys after outcomes that may change persisted state.
- Preserve cached detail while mutation or post-`202` revalidation failures reconcile.
- Prevent duplicate submission and misleading dismissal while the request is active.

#### Success criteria

- A validated `202` immediately produces **Cancelled**; if subsequent GET revalidation fails, ancillary cached detail may remain stale behind a refresh warning but the confirmed status does not regress to active.
- A recorded but unfinished Cancellation Request stays active, polls, and offers Retry cancellation.
- A completion race displays the persisted winner after revalidation.
- Returning to the Run list does not retain stale active state after successful cancellation.
- Cancellation never retries automatically and never hand-constructs stage/job cleanup state in cache.

#### Testing requirements

- Confirmation and retry-confirmation interaction tests.
- In-flight disabling and dismissal-prevention tests.
- `202`, `409`, `503`, `404`, network, and malformed-response tests.
- Detail/list cache status-projection and revalidation assertions, including failed revalidation after a valid `202`.
- Polling interaction tests while cancellation is requested.
- Accessible dialog naming, description, focus, and destructive action tests.
- Existing backend cancellation route tests remain passing.

#### Exit condition

An Active Scrape Run can be cancelled or have incomplete cancellation retried with race-safe, polling-aware, cache-consistent UI behavior.

### Phase 5 — Integrated quality hardening

#### Scope

Validate the complete experience across responsive, accessibility, cache, polling, navigation, and lifecycle edge cases without adding product features.

#### Objectives

- Ensure every interaction remains usable across viewport sizes and input methods.
- Prove polling, filtering, pagination, navigation, and cancellation do not conflict.
- Confirm privacy and domain-language boundaries.
- Complete repository-wide verification.

#### Deliverables

- Responsive refinements for long content and narrow layouts.
- Final keyboard, focus, alert, progress, table, disclosure, and dialog semantics.
- Deterministic SWR cache and timer cleanup in tests.
- Removal of obsolete mocks or non-clickable-item assumptions.
- Documentation in code/tests of the accepted client-pagination payload risk where useful.
- Final verification against all acceptance criteria and explicit exclusions.

#### Success criteria

- The page remains understandable without relying on color, motion, or pointer hover.
- No timer or retry loop continues after terminal state or unmount.
- Polling changes cannot leave pagination on an unusable page.
- Mutation and revalidation races do not fabricate, discard, or expose data.
- No direct `useEffect`, server-only client import, hidden backend limit, or out-of-scope action is introduced.
- Long values do not break the layout.

#### Testing requirements

- Keyboard coverage for every link and control.
- Accessible queries for headings, statuses, progress, alerts, table labels, timestamps, disclosure, and dialog.
- Cache-race coverage for polling during filtering/pagination and cancellation during revalidation.
- Timer cleanup on terminal transition and unmount.
- Long-content rendering checks where practical in jsdom plus manual responsive inspection.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
- Perform the manual verification checklist in Section 17.5.

#### Exit condition

All automated suites and manual interaction checks pass, and the route is ready to be followed by the separate Scrape Job detail implementation.

## 19. Acceptance criteria

The feature is complete when:

1. `/app/scrape-runs/:runId` exists as a dynamic Next.js route with a thin Server Component and focused client boundary.
2. The page validates all Run-detail JSON before caching it.
3. The detail API exposes sanitized nullable Run-level failure code/message without exposing sensitive data.
4. Initial loading, not-found, initial failure, and cached refresh failure have distinct states.
5. Cached content remains visible during polling and refresh failures.
6. The page polls every three seconds only while the cached Run is active, including while Cancelling.
7. GET retries are bounded and exclude `4xx` responses.
8. The stable page order is header, overview/failure, stages, jobs, then collapsed configuration.
9. Run Preparation with zero jobs never appears as `0 of 0`.
10. Active progress uses terminal job counts and an accessible determinate bar only after jobs exist.
11. Mixed successful/failed outcomes remain visible while the Run status is Complete.
12. All three Run Stages show accurate status, attempts, timestamps, and sanitized failure details.
13. Run-level failure presentation explains failures that Stage rows alone cannot explain.
14. Run Configuration shows Target Site, Example Pages, and user-facing Extraction Fields while omitting Field Keys and filtering model.
15. The job browser uses only lightweight Run-detail data and never requests individual job detail.
16. The Primary Identifier column uses its configured Field Label and is not called a Result.
17. Job summaries show URL, status/failure code, attempts, and finished time at appropriate responsive breakpoints.
18. Status filtering is exact, local, counted, and resets pagination to page 1.
19. Pagination renders 25 jobs per page, preserves backend order, and handles polling-driven page-count changes.
20. Every job has a semantic link to the future nested detail route with prefetch disabled.
21. Existing Run Summary items link semantically to their Run detail routes.
22. Cancellation requires confirmation and never retries automatically.
23. A `202` is treated as completed cancellation and reconciles detail/list caches.
24. A persisted incomplete Cancellation Request displays Cancelling, continues polling, and offers Retry cancellation.
25. `409` completion races and `503` incomplete cleanup reconcile from authoritative GET state.
26. No search, export, bulk action, job mutation, Run retry/clone/edit/delete, or server pagination is introduced.
27. No direct `useEffect` or server-only import enters the client graph.
28. All declared repository, route, contract, helper, frontend, typecheck, and lint verification passes.

## 20. Explicit decisions and tradeoffs

- The page is one lifecycle-aware workspace rather than separate monitoring and results tabs.
- The section order remains stable across lifecycle transitions to avoid polling-driven layout jumps.
- Full Extraction Results and per-job failure messages belong to a separate job-detail route.
- Future job-detail links intentionally ship before their destination view and temporarily lead to `404`; prefetch is disabled.
- Run Configuration is available but starts collapsed because operational state and jobs are primary.
- Field Keys and filtering-model identifiers remain hidden as implementation-facing details.
- The page uses client-only SWR fetching rather than server-prefetched fallback data, accepting an initial skeleton in exchange for one data path.
- Job status filter and pagination state are local and are not encoded in the URL.
- Search and user-controlled sorting are omitted initially.
- Client-side pagination is accepted even though it does not limit response or polling payload size. This risk is explicit; no hidden cap or backend pagination should be added under this scope.
- PostgreSQL-backed read responses remain authoritative after cancellation; the minimal mutation response is not used to fabricate detailed cache state.
- Existing Run Summary items become links, intentionally superseding the earlier non-clickable presentation choice.
- No ADR is required: these UI and read-contract choices are visible and reasonably reversible, including the explicitly accepted pagination limitation.
