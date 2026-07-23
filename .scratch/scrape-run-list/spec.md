# Scrape Run List Frontend Design and Phased Implementation Plan

## 1. Purpose

Implement the first frontend read experience for Scrape Runs on `/app/scrape-runs` and integrate creation with SWR.

The page will fetch and cache all of the current user’s Run Summaries, present active and terminal runs in a responsive list, poll while a run is active, and update immediately after successful creation. The existing creation form will use `useSWRMutation` instead of managing a standalone `fetch` request.

This document is standalone and covers frontend behavior, client-side data contracts, component responsibilities, and testing. The existing backend is treated as complete.

## 2. Goals

- Show every Scrape Run owned by the current user, newest first.
- Make each item easy to identify by name and Target Site.
- Communicate Run Status, Run Preparation, cancellation, and aggregate Scrape Job outcomes accurately.
- Keep active progress current without requiring a page reload.
- Cache the list through SWR and avoid redundant requests.
- Add a newly created run to the visible list immediately after the API confirms creation.
- Reflect the one-active-run-per-user rule before submission while retaining backend enforcement as the authority.
- Provide clear loading, empty, stale-data, and failure states.
- Add focused DOM component-test infrastructure for this frontend behavior.

## 3. Scope

### In scope

- A client-rendered Run Summary list within `/app/scrape-runs`.
- Runtime-validated frontend contracts for the existing list and create responses.
- `useSWR` for list fetching, caching, retry behavior, and conditional polling.
- `useSWRMutation` for creating Scrape Runs.
- Immediate, deduplicated cache insertion after a successful creation.
- Reconciliation after creation conflicts and persisted dispatch failures.
- Responsive shadcn/ui list items, status badges, progress bars, skeletons, empty state, alerts, tooltip, and existing dialog/form controls.
- Mutation-aware dialog behavior.
- A dedicated jsdom Vitest project using Testing Library and the existing MSW infrastructure.

### Out of scope

- A Scrape Run detail route or inline detail view.
- Navigation from a Run Summary item.
- Scrape Job or Extraction Result presentation.
- Failure-code or failure-message presentation.
- Cancellation controls.
- Retry, clone, edit, or delete controls.
- Search, filtering, sorting controls, or pagination.
- Server-side prefetching or SWR fallback hydration.
- SSE, WebSockets, or any other streaming transport.
- Backend route behavior, response-shape, database, or Workflow changes.
- End-to-end browser tests.

## 4. Domain language used by the UI

- **Scrape Run:** One user-initiated attempt to identify matching pages on one Target Site and extract the same fields from each page.
- **Active Scrape Run:** A run with `pending` or `in_progress` status. A user may have at most one.
- **Run Preparation:** Mapping and Filtering work that occurs before Scrape Jobs have been established.
- **Cancellation Request:** A request to stop an Active Scrape Run. The run remains active while cancellation cleanup is unfinished.
- **Scrape Job:** The extraction attempt for one Matching Page.
- **Target Site:** The exact hostname identified by the run’s normalized target URL.

The existing root `CONTEXT.md` remains authoritative. This feature does not introduce new domain terms or change existing definitions.

## 5. Existing backend contracts

All requests are same-origin and authenticated through the existing application session.

### `GET /api/scrape-runs`

Returns all owned Run Summaries, newest first, with no pagination:

```ts
type ScrapeRunSummary = {
  id: number
  name: string
  targetUrl: string
  status: "pending" | "in_progress" | "complete" | "failed" | "cancelled"
  cancellationRequestedAt: string | null
  jobCounts: {
    total: number
    pending: number
    inProgress: number
    complete: number
    failed: number
    cancelled: number
  }
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}
```

Dates are ISO date-time strings on the wire even though the server repository uses `Date` values internally.

### `POST /api/scrape-runs`

Accepts this raw frontend/wire payload:

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

The existing form and shared input type remain the implementation source of truth. The accepted contract is:

- `name` contains 1–100 characters after trimming.
- `url` and every Example Page URL contain at most 2,048 characters and use HTTP or HTTPS.
- URLs must not contain credentials and must use public DNS hostnames rather than IP, localhost, or internal/special-use hostnames.
- The target is normalized to its origin. Its submitted path, query string, and fragment do not define the Target Site.
- There are 2–5 Example Page URLs.
- Every Example Page uses the exact Target Site hostname; subdomains are not accepted.
- Example Page query strings and fragments are removed. Default ports, trailing slashes, and supported percent-encoding variants are canonicalized.
- Example Pages are distinct after canonicalization.
- There are 1–10 Extraction Fields.
- Each Field Label contains 2–30 characters after trimming and matches `^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$`.
- Field Labels are unique ignoring case. Their lowercase, space-to-underscore Field Keys must also be unique.
- Each field description contains 2–100 characters after trimming.
- Exactly one field is the Primary Identifier, and that field must be required.

The form should continue to submit raw user-entered strings and booleans. Backend parsing performs authoritative trimming, canonicalization, Field Key generation, cross-field validation, and one-active-run enforcement. This frontend scope does not duplicate those normalization rules in a second submit schema.

Response behavior:

- `201`: Workflow dispatch was accepted and its run ID was attached. Returns the newly persisted `pending` Run Summary with zero job counts.
- `400`: malformed JSON or invalid Run Configuration. No run is created.
- `401`: no valid session. No run is created.
- `409`: another Active Scrape Run exists. No second run is created.
- `503` without `scrapeRunId`: deployment configuration failed before persistence. No run is created.
- `503` with `scrapeRunId`: a run was persisted. Workflow dispatch failure leaves it terminal and failed; Workflow-ID attachment failure may leave a Workflow able to self-attach and continue. The frontend must revalidate rather than infer the persisted status.

The frontend must not automatically retry this non-idempotent request.

### Error response shape

Every handled route error has a JSON object with a safe `error` string. Depending on the path, it may also contain validation issues or a persisted run ID:

```ts
type ScrapeRunApiErrorResponse = {
  error: string
  issues?: unknown[] // Serialized Zod issues; frontend reconciliation ignores them.
  scrapeRunId?: number
}
```

Relevant status shapes are:

```ts
// 400 malformed JSON
{ error: "Invalid JSON payload." }

// 400 validation failure
{ error: string, issues: ZodIssue[] }

// 401
{ error: "Unauthorized." }

// 409
{ error: "You already have an active scrape run." }

// 503 after persistence
{ error: string, scrapeRunId: number }
```

Frontend behavior must depend on HTTP status and the presence of a valid `scrapeRunId`, not on matching exact message text. Unknown, malformed, or non-JSON error bodies use a generic safe fallback.

### Backend lifecycle and count guarantees relevant to the list

- A Run Status is one of `pending`, `in_progress`, `complete`, `failed`, or `cancelled`.
- `pending` and `in_progress` are active. At most one Active Scrape Run may exist per user.
- A Cancellation Request does not make a run terminal. While cleanup is pending, status remains active and `cancellationRequestedAt` is non-null.
- Scrape Jobs do not exist during Mapping or Filtering. Therefore, an active run may legitimately have `jobCounts.total === 0` while Run Preparation is underway.
- Once Filtering succeeds, every selected Matching Page is persisted as one Scrape Job before Scraping starts. The Example Pages guarantee at least two jobs for a normally prepared run.
- `jobCounts.total` is the number of persisted jobs. The five status-specific counts are mutually exclusive and sum to `total`.
- A job is terminal when it is `complete`, `failed`, or `cancelled`. Pending and in-progress jobs are unfinished.
- Ordinary Scraping finalization marks a run `complete` when at least one job succeeds, including mixed successful/failed outcomes. It marks a run `failed` when all jobs fail.
- Mapping, Filtering, dispatch, job-creation, or unexpected orchestration failures can produce a failed run with zero jobs or with earlier successful jobs preserved.
- Cancellation preserves jobs that were already complete or failed and marks unfinished jobs cancelled.
- Terminal runs have a non-null `finishedAt`. A run may have null `startedAt` when it fails before Workflow claim; active claimed runs have a start time.
- Read responses come entirely from PostgreSQL and never require the frontend to consult Workflow state.
- The list endpoint intentionally omits fields, examples, stages, job rows, Extraction Results, and failure details.

## 6. Frontend wire contracts

Add shared Zod schemas and inferred types for:

- Job counts.
- One Run Summary.
- The Run Summary list.
- The error response fields needed by frontend reconciliation, including optional `scrapeRunId`.

The Run Summary schema must validate:

- Positive integer IDs.
- Existing shared Run Status values.
- Nonnegative integer counts.
- A valid normalized target URL string.
- ISO date-time strings and the declared nullable timestamps.

Both GET and successful POST JSON must be treated as `unknown` and parsed before entering the SWR cache. A nonconforming success response is a request failure rather than partially trusted data.

Use one typed frontend API error that can retain:

- HTTP status when a response exists.
- A safe user-facing message.
- Optional persisted `scrapeRunId`.

Do not expose raw response bodies or validation internals in the UI.

## 7. Page and component design

### 7.1 Client boundary

Keep `app/app/scrape-runs/page.tsx` as a thin Server Component. It should render `AppPage` and a focused client component such as `ScrapeRunsView`.

The client view owns:

- `useSWR`.
- `useSWRMutation`.
- Conditional polling and retry configuration.
- Cache population and reconciliation.
- The derived Active Scrape Run.
- Composition of the create control and list states.

The creation dialog owns:

- Open/closed state.
- Dynamic form-field state.
- Payload construction.
- Form presentation and native input constraints.
- Success and failure toasts.

Pass the create callback, mutation state, and active-run submission guard from the view into the dialog. Do not add `useEffect`; SWR, derived render state, event handlers, and conditional rendering cover the required behavior.

Do not add a global `SWRConfig` provider for this single resource. Production behavior should be configured locally. Tests may use an isolated `SWRConfig` provider to create a fresh cache for each test.

### 7.2 Page actions

Keep one **Create New Scrape Run** button above the list.

When cached data contains an Active Scrape Run:

- Disable the trigger.
- Wrap the disabled control as needed so a tooltip can still receive pointer and keyboard events.
- Explain in the tooltip that only one Scrape Run may be active at a time.
- Treat a run with a Cancellation Request as active until its status is terminal.

The button remains available during the initial list load or a list failure with no cached data because the client cannot yet know whether an active run exists. The backend `409` remains authoritative.

### 7.3 Run Summary list structure

Use shadcn `ItemGroup` and outlined `Item` components rather than a table. Items are informational and must not look clickable.

Each item displays:

1. The user-defined run name as its primary heading.
2. The Target Site hostname as secondary text.
3. A textual status badge.
4. Aggregate Scrape Job progress or outcomes.
5. The creation date and time in the user’s locale.

Do not display the numeric run ID, full target origin, started time, finished time, duration, stage details, failure details, or action controls.

Long names and hostnames should truncate without breaking the responsive layout. Use a semantic `<time dateTime={createdAt}>` element for the creation timestamp.

### 7.4 Status presentation

A `cancellationRequestedAt` value overrides the visible label of an otherwise active run:

| Condition | Visible label | Badge treatment |
|---|---|---|
| `pending` | Pending | secondary |
| `in_progress` | In progress | default |
| Active with Cancellation Request | Cancelling | outline |
| `complete` | Complete | secondary |
| `failed` | Failed | destructive |
| `cancelled` | Cancelled | outline |

Show a small spinner only for **In progress** and **Cancelling**. The text label must remain present so status is never communicated by color or motion alone. Decorative spinner elements should be hidden from assistive technology.

### 7.5 Job progress and outcome text

Derive the finished count as:

```ts
jobCounts.complete + jobCounts.failed + jobCounts.cancelled
```

Render state-aware text:

- Active with zero total jobs: **Preparing matching pages…**
- Active with jobs: **X of Y jobs finished**
- Terminal with jobs: **X succeeded · Y failed**, adding a cancelled count only when it is nonzero
- Terminal with zero jobs: **No scrape jobs created**

This distinction is required because Mapping and Filtering occur before jobs exist. Rendering `0 of 0` would incorrectly imply that work is complete.

For an active run with jobs, show a thin shadcn `Progress` bar:

```ts
(finishedCount / jobCounts.total) * 100
```

The progress bar needs an accessible label and value. Do not show a determinate bar during Run Preparation or after a run becomes terminal.

Mixed job outcomes remain visible even when Run Status is **Complete**. A failed preparation run does not trigger a detail fetch to obtain a reason.

### 7.6 Timestamp formatting

Display only the creation date and time using the browser’s locale through a stable `Intl.DateTimeFormat` configuration with medium date and short time styles.

Do not use a continuously changing relative-time label. It would require extra refresh behavior and would make list scanning less predictable.

## 8. List data behavior

### 8.1 SWR key and fetcher

Use `/api/scrape-runs` as the shared GET and mutation cache key.

The GET fetcher must:

1. Perform the request.
2. Parse non-success responses into the typed frontend API error.
3. Parse successful JSON as unknown through the Run Summary list schema.
4. Return only validated summaries.

### 8.2 Loading and revalidation

Before the first successful response, render three compact shadcn `Skeleton` items. Keep the create control visible and usable.

Do not replace cached items with skeletons during background revalidation. Do not display an ordinary background-refresh spinner; active polling would otherwise cause visual noise every three seconds.

Retain SWR’s focus and network-reconnect revalidation behavior.

### 8.3 Conditional polling

Poll every three seconds while any cached Run Summary has `pending` or `in_progress` status. A run displaying **Cancelling** therefore continues polling.

Stop polling when every cached run is terminal. Default hidden-tab behavior should avoid polling while the document is hidden; focus revalidation obtains fresh state when the user returns.

Polling must not create overlapping request loops with error retries. While the current refresh is in a failed/retry state, suspend the ordinary three-second interval and resume it after a successful retry or manual revalidation.

### 8.4 GET retry behavior

- Retry network and `5xx` failures up to three times using SWR backoff.
- Do not automatically retry `4xx` responses.
- A manual **Retry** action invokes bound revalidation.

### 8.5 Empty state

When the validated list is empty, render shadcn `Empty` with:

- **No scrape runs yet** as the title.
- Short guidance to use the page’s create action.

Do not add a second create button inside the empty state.

### 8.6 Fetch failures

If no cached data exists, replace the list area with an inline error state and **Retry** button.

If cached data exists and revalidation fails:

- Keep the cached items visible.
- Show a compact, non-destructive **Couldn’t refresh scrape runs** warning.
- Include a manual retry action.

Do not emit toasts for list polling or revalidation failures; repeated requests must not create toast spam. Error content should use appropriate live-region or alert semantics without repeatedly announcing unchanged polling failures.

## 9. Creation mutation behavior

### 9.1 Mutation ownership

`ScrapeRunsView` configures `useSWRMutation` for `/api/scrape-runs`. The mutation fetcher accepts the existing `NewScrapeRunInput`, submits JSON, rejects non-success responses as typed frontend API errors, and validates the `201` response as one Run Summary.

The dialog calls the passed mutation function from its submit handler. `useSWRMutation`’s `isMutating` replaces the dialog’s manual request-state bookkeeping.

### 9.2 Successful creation

On `201`, populate the existing list cache immediately:

1. Remove any cached item with the returned ID.
2. Prepend the returned summary.
3. Do not perform an immediate redundant GET.

The new `pending` item activates conditional polling, which reconciles subsequent status and count changes with PostgreSQL.

After cache population:

- Show the existing success toast.
- Close the dialog.
- Allow conditional unmounting to reset the form for its next opening.

### 9.3 Mutation dismissal behavior

While creation is in flight:

- Disable all form controls.
- Show the submitting indicator and copy.
- Prevent closing through the close button, Escape, outside interaction, or trigger state changes.
- Do not abort the POST.

A non-idempotent request cannot be reliably undone by aborting the browser request after the backend has received it. The dialog should close only after a confirmed success.

### 9.4 Mutation failure behavior

Do not retry creation automatically.

For every failed mutation:

- Keep the dialog open.
- Preserve all entered fields.
- Restore enabled controls when no Active Scrape Run is known.
- Show a warning toast with the safe API message or a generic fallback.

Additional reconciliation:

- On `409`, revalidate the list because another tab or stale cache may have missed an Active Scrape Run.
- On `503` with `scrapeRunId`, revalidate because the backend may have persisted a terminal failed run.
- Do not modify or revalidate the list for ordinary `400` validation failures or network failures.

If polling discovers an Active Scrape Run while the dialog is already open:

- Keep the dialog open and preserve its values.
- Disable submission.
- Show a short inline explanation that another run is active.
- Do not close or reset the form automatically.

The backend `409` remains necessary for stale-cache and cross-tab races.

## 10. Suggested module responsibilities

Exact filenames may follow implementation ergonomics, but responsibilities should remain separated:

```text
app/app/scrape-runs/page.tsx
  Thin Server Component page composition.

components/scrape-runs/scrape-runs-view.tsx
  Client SWR ownership, derived active state, and page-level composition.

components/scrape-runs/scrape-run-list.tsx
  Loading, empty, error, warning, and ItemGroup presentation.

components/scrape-runs/scrape-run-list-item.tsx
  One summary item, status, progress, hostname, and timestamp presentation.

components/scrape-runs/new-scrape-run-dialog.tsx
  Existing form, refactored to receive mutation behavior and guards.

lib/scrape-runs/api-contracts.ts
  Shared wire schemas, inferred types, fetchers, and safe API error parsing.

lib/scrape-runs/presentation.ts
  Pure status, progress, hostname, and summary-text helpers when extraction
  improves testability; avoid a generic catch-all utility module.
```

Do not import server-only repositories into the client graph. Keep the client boundary as deep as practical, consistent with the installed Next.js Server and Client Component guidance.

## 11. Test strategy

### 11.1 Test infrastructure

Add these development dependencies with pnpm:

- `jsdom`
- `@testing-library/react`
- `@testing-library/dom`
- `@testing-library/user-event`
- `@testing-library/jest-dom`

Add a dedicated frontend Vitest project rather than changing the Node environment used by existing backend tests. Its setup should:

- Use jsdom.
- Register jest-dom matchers.
- Clean up rendered React trees after each test.
- Reuse the existing MSW server lifecycle and unhandled-request enforcement.
- Give every SWR test an isolated cache provider with deduping disabled where deterministic request assertions require it.

Use fake timers only for polling/backoff cases and restore them after each test.

### 11.2 Test layers

**Contract and helper tests** cover runtime response parsing, API error parsing, active/cancelling derivation, finished-count calculation, progress percentages, terminal summaries, Target Site display, and timestamp semantics.

**Component integration tests** cover SWR, MSW requests, cache behavior, user interaction, and rendered accessible states.

Existing backend route tests remain unchanged unless a shared schema import requires a type-only adjustment. Do not duplicate backend persistence behavior in frontend tests.

## 12. Phased implementation plan

### Phase 1 — Frontend contracts and test foundation

#### Scope

Establish trusted frontend API boundaries and DOM test infrastructure without changing the visible page.

#### Objectives

- Make GET and POST success data runtime-safe before it enters SWR.
- Centralize safe HTTP error handling and reconciliation metadata.
- Create a dedicated, isolated frontend test environment.
- Define pure presentation derivations before component orchestration.

#### Deliverables

- Run Summary, list, job-count, and relevant error-response Zod schemas.
- Inferred frontend wire types using ISO date-time strings.
- Typed GET and create fetchers, or focused primitives from which those fetchers are built.
- Typed API error carrying status, safe message, and optional `scrapeRunId`.
- Pure helpers for active/cancelling state, finished counts, progress, status labels, outcome text, Target Site hostname, and date formatting where useful.
- Frontend Testing Library dependencies.
- A jsdom Vitest project and setup integrated with existing MSW behavior.

#### Success criteria

- Unknown JSON cannot enter the planned cache without schema validation.
- GET and POST share one Run Summary contract.
- Non-success responses expose only safe frontend error information.
- Frontend tests run independently without changing backend test environments.
- No production UI behavior has regressed.

#### Testing requirements

- Accept a complete valid summary and list.
- Reject invalid statuses, IDs, counts, URLs, and timestamp nullability.
- Parse safe API messages and optional persisted run IDs.
- Fall back safely for malformed/non-JSON error bodies.
- Derive **Cancelling** only for active runs with a Cancellation Request.
- Calculate finished counts and percentages for zero, partial, mixed, and terminal outcomes.
- Produce each agreed progress/outcome message.
- Run existing unit, integration, and Workflow projects to prove the new project configuration does not interfere.

#### Exit condition

A component can consume typed fetchers and pure presentation values in an isolated jsdom test without trusting raw API JSON.

### Phase 2 — Cached Run Summary list

#### Scope

Implement the complete read-only list experience with `useSWR`. Creation may still use its existing submission implementation during this phase.

#### Objectives

- Fetch and cache all owned Run Summaries.
- Render every agreed item field and status accurately.
- Keep Active Scrape Runs current through conditional polling.
- Provide complete loading, empty, and list-error behavior.

#### Deliverables

- Thin page composition retaining the Server Component boundary.
- Client `ScrapeRunsView` with locally configured `useSWR`.
- Conditional three-second polling while any run is active.
- Focus/reconnect revalidation and bounded retry classification.
- Stacked shadcn `Item` list with status badges and active progress bars.
- Three-item initial skeleton.
- Empty state without a duplicated create action.
- Initial-error and cached-data refresh-warning states with manual retry.
- Locale creation timestamp and semantic `<time>` output.
- No background refresh indicator during ordinary successful polling.

#### Success criteria

- The page displays the backend’s newest-first list without client reordering.
- Active preparation never appears as `0 of 0`.
- Mixed outcomes remain visible on completed runs.
- Cancelling is distinguishable from Cancelled.
- Cached content remains visible during revalidation and refresh failures.
- Polling starts and stops solely from cached active status.
- No item implies navigation or exposes out-of-scope details/actions.

#### Testing requirements

- Initial request renders skeletons while the create action remains available.
- Empty response renders the agreed empty state.
- Valid summaries render name, hostname, status, counts, and creation time.
- Cover every status badge and the Cancelling override.
- Cover preparation, partial active progress, mixed completion, cancellation counts, and zero-job terminal presentation.
- Verify determinate progress value and accessible labeling only for active runs with jobs.
- Verify initial failure plus manual retry.
- Verify cached items survive a revalidation failure with a warning.
- Verify network/`5xx` bounded retries and no automatic `4xx` retry.
- With fake timers, verify polling occurs while active and stops after a terminal response.
- Verify ordinary background revalidation does not replace items with skeletons or show a refresh spinner.

#### Exit condition

`/app/scrape-runs` provides a complete, cached, polling read experience independent of the create mutation migration.

### Phase 3 — Create mutation and cache integration

#### Scope

Replace the dialog’s standalone fetch/request bookkeeping with `useSWRMutation` and integrate the one-active-run UX.

#### Objectives

- Give list fetching and creation one cache owner.
- Make a confirmed creation visible without a redundant GET.
- Remove ambiguous abort-on-close behavior.
- Reconcile stale and cross-tab active-run races.

#### Deliverables

- `useSWRMutation` configured on the same `/api/scrape-runs` key.
- Mutation fetcher using the Phase 1 response and error contracts.
- Immediate prepend-and-deduplicate `populateCache` behavior with no success revalidation.
- Dialog props for create callback, `isMutating`, and active-run submission guard.
- Removal of manual `isSubmitting` and `AbortController` ownership that is no longer needed.
- Mutation-safe dismissal prevention.
- Disabled create trigger and explanatory tooltip when a run is active.
- Inline active-run explanation if the dialog was already open.
- Error reconciliation for `409` and persisted-run `503` responses.
- Existing success and warning toast behavior adapted to typed errors.

#### Success criteria

- A `201` response inserts exactly one newest item immediately and closes the dialog.
- Successful creation does not issue an immediate redundant list GET.
- The inserted pending run activates Phase 2 polling.
- The dialog cannot be dismissed while the mutation is in flight.
- Failed creation preserves form values and never retries automatically.
- Known active state prevents submission while backend conflict handling still covers races.
- Cross-tab discovery does not silently discard form input.

#### Testing requirements

- Submit the expected `NewScrapeRunInput` JSON through MSW.
- Disable controls and prevent each dismissal path while pending.
- On success, prepend the validated summary, deduplicate by ID, show success feedback, and close/reset the dialog.
- Assert no immediate GET follows successful cache population.
- Verify subsequent polling reconciles the inserted item.
- Verify `400` and network failures preserve values and do not revalidate the list.
- Verify `409` shows the warning, keeps values, and revalidates the list.
- Verify `503` with `scrapeRunId` revalidates and can reveal the persisted failed run.
- Verify malformed `201` JSON fails safely and does not pollute the cache.
- Verify the trigger tooltip and disabled state for pending, in-progress, and Cancelling runs.
- Verify an active run discovered while the dialog is open disables submission without closing it.
- Verify the create button remains available when list state is not yet known.

#### Exit condition

Creation, list caching, active-run enforcement, and polling operate as one coherent SWR-driven experience.

### Phase 4 — Interaction and quality hardening

#### Scope

Validate the integrated experience across responsive, accessibility, cache, and lifecycle edge cases. Do not add product features.

#### Objectives

- Ensure the UI remains usable across supported viewport sizes and input methods.
- Prove polling, retries, mutations, and cache updates do not conflict.
- Confirm that implementation boundaries and explicit exclusions remain intact.
- Complete repository-wide verification.

#### Deliverables

- Responsive layout refinements using existing shadcn components and project styling.
- Accessible labels, alert semantics, tooltip behavior, progress semantics, disabled states, focus behavior, and motion treatment.
- Stable handling of long names/hostnames and locale timestamp rendering.
- Deterministic test cache isolation and timer cleanup.
- Removal of obsolete dialog request code and stale mocks.
- Final verification against all acceptance criteria.

#### Success criteria

- The create control, status, progress, warnings, and list hierarchy are understandable without relying on color.
- Keyboard users can discover the active-run tooltip and operate every available action.
- Long content does not overflow small screens.
- No request loop continues after all runs become terminal.
- Mutation and revalidation races cannot duplicate or remove the newly created run.
- No direct `useEffect`, server-only client import, global SWR provider, or out-of-scope action is introduced.

#### Testing requirements

- Keyboard interaction for create trigger, tooltip, dialog submission, dismissal prevention, and Retry actions.
- Accessible queries for status text, alerts, progress, and creation time.
- Long-content render checks at constrained container widths where practical in jsdom; supplement with manual responsive inspection.
- Cache-race coverage for creation during an initial GET and revalidation during polling.
- Timer tests proving polling and retry timers are cleaned up on terminal state and unmount.
- Verify no repeated toast behavior from list failures.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
- Perform manual browser checks for responsive layout, tooltip positioning, dialog behavior, and active progress transitions using mocked or seeded data.

#### Exit condition

All automated suites and manual interaction checks pass, and the page meets the acceptance criteria without expanding the agreed scope.

## 13. Acceptance criteria

The frontend scope is complete when:

1. `/app/scrape-runs` fetches all owned summaries through `useSWR` and validates the response at runtime.
2. Summaries remain in backend-provided newest-first order.
3. Every item shows name, Target Site hostname, accurate visible status, state-aware job information, and localized creation time.
4. Run Preparation never renders misleading zero-total progress.
5. Active job progress uses terminal job counts and an accessible progress bar.
6. A Cancellation Request displays **Cancelling** until the run becomes terminal.
7. Initial loading, empty, initial failure, and stale-data refresh failure each have the agreed distinct UI.
8. Cached items remain visible during ordinary revalidation and refresh failures.
9. The list polls every three seconds only while at least one run is active and revalidates on focus/reconnect.
10. GET retries are bounded and exclude `4xx` responses.
11. Creation uses `useSWRMutation` and is never retried automatically.
12. A valid `201` response is prepended and deduplicated in cache without an immediate list refetch.
13. The newly inserted pending run naturally activates polling.
14. The dialog cannot be dismissed during creation and no longer aborts an in-flight non-idempotent POST.
15. Creation failures preserve form values and show safe warning feedback.
16. `409` and persisted-run `503` responses trigger list reconciliation.
17. A known Active Scrape Run disables creation with a keyboard-discoverable tooltip.
18. Cross-tab active-run discovery preserves an already-open form while preventing submission.
19. No detail navigation, item actions, filtering, sorting, pagination, or backend changes are introduced.
20. Frontend component tests run in a dedicated jsdom project and all repository test, typecheck, and lint commands pass.

## 14. Explicit decisions and tradeoffs

- The page uses client-only SWR fetching rather than server-prefetched fallback data. The skeleton is accepted in exchange for one data path and simpler cache ownership.
- The list uses responsive Item components rather than a table. This favors compact cross-device presentation and avoids implying unsupported table controls.
- A successful creation updates cache immediately rather than revalidating. Conditional polling provides eventual reconciliation.
- A list-fetch failure does not disable creation when no cache is available. The backend remains the source of truth for the active-run constraint.
- List items omit failure reasons because the lightweight backend contract intentionally excludes them and no detail experience is in scope.
- Creation cannot be dismissed or automatically retried while in flight because request cancellation cannot undo a non-idempotent operation reliably.
- Polling is accepted for active progress because the backend intentionally exposes polling-friendly PostgreSQL read models and does not provide streaming.
- No ADR is needed: these frontend choices are local, visible, and reasonably reversible.
