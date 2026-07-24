# Scrape Job Detail Design and Phased Implementation Plan

## 1. Purpose

Implement the lifecycle-aware Scrape Job page at:

```text
/app/scrape-runs/:runId/scrape-jobs/:jobId
```

The page lets a user monitor one Scrape Job, inspect its successful Extraction Result, or understand why extraction failed or was cancelled. It is read-only and remains subordinate to its parent Scrape Run.

This document is standalone. It defines the required backend read-model addition, frontend behavior, runtime contracts, component boundaries, tests, and phased delivery plan.

## 2. Goals and scope

### Goals

- Support pending, in-progress, complete, failed, and cancelled Jobs.
- Present successful results in the configured field order with user-facing Field Labels.
- Explain failures with sanitized diagnostics and labeled missing Required Extraction Fields.
- Poll active Jobs without replacing usable cached content.
- Preserve authentication, ownership, nested Run/Job membership, and privacy boundaries.
- Avoid fetching the parent Run-detail response and its potentially large Job list.
- Follow the existing SWR and shadcn/ui architecture without `useEffect`.

### In scope

- The nested dynamic frontend route and route-level skeleton.
- A focused client SWR view.
- An additive extension to the existing nested Job-detail API response.
- Minimal parent Run identity and ordered Extraction Field definitions.
- Strict runtime validation before caching.
- Loading, not-found, initial-error, stale-data warning, and manual-retry states.
- Job identity, source URL, status, attempts, lifecycle timestamps, results, and failures.
- Repository, route, contract/helper, and frontend component tests.

### Out of scope

- Retrying, cancelling, editing, deleting, or cloning a Scrape Job.
- Mutating the parent Scrape Run from this page.
- Previous/next sibling navigation or preservation of the parent table's local state.
- Fetching the parent Run-detail endpoint or updating parent caches from Job polling.
- Raw JSON, exports, downloads, or dedicated copy controls.
- Partial results for failed Jobs.
- Attempt history, provider payloads, logs, page content, or response metadata.
- Server prefetching, SWR fallback hydration, SSE, or WebSockets.
- Lifecycle, persistence, Workflow, or provider changes beyond the read projection.

## 3. Domain behavior

- **Scrape Job:** The extraction attempt for one Matching Page within a Scrape Run.
- **Extraction Result:** The normalized user-defined values produced only by a successful Scrape Job.
- **Primary Identifier:** The required Extraction Field used to name and reference a successful result. It need not be unique.
- **Missing Value:** A `null` result value.
- **Required Extraction Field:** A field whose Missing Value causes its Job to fail.
- **Field Label:** The user-facing field name.
- **Field Key:** The machine-readable result identity. Field Keys are not displayed.
- **Canonical Page URL:** The normalized page identity used as the Job's source URL.

Job statuses are:

```ts
type ScrapeJobStatus =
  | "pending"
  | "in_progress"
  | "complete"
  | "failed"
  | "cancelled"
```

`pending` and `in_progress` are active; all others are terminal.

A complete Job has a persisted Extraction Result containing every configured Field Key, and every Required Extraction Field has a non-null value. A failed or cancelled Job has no persisted partial result. A missing-required failure may retain only missing Field Keys and sanitized diagnostics.

No new domain term or durable architectural decision is introduced, so this feature requires no glossary or ADR change.

## 4. Backend read contract

### 4.1 Endpoint and access

```text
GET /api/scrape-runs/:runId/scrape-jobs/:jobId
```

The route requires the current session. Both IDs must be positive safe integers. The repository lookup must prove ownership and that the Job belongs to the Run in the route.

Responses:

- `200`: owned Job detail.
- `401`: no valid session.
- `404`: malformed ID, missing Job, non-owned Job, or wrong parent Run.

Every `404` uses the same response:

```json
{ "error": "Scrape job not found." }
```

### 4.2 Additive response

Preserve the existing flat Job fields and add only the context needed by this page:

```ts
type ScrapeJobDetail = {
  id: number
  url: string
  status: ScrapeJobStatus
  attemptCount: number
  result: Record<string, string | null> | null
  missingRequiredFieldKeys: string[] | null
  failureCode: ScrapeRunErrorCode | null
  failureMessage: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null

  scrapeRun: {
    id: number
    name: string
  }

  fields: Array<{
    position: number
    label: string
    key: string
    description: string
    required: boolean
    primaryIdentifier: boolean
  }>
}
```

Dates are ISO date-times on the wire. Fields are ordered by ascending unique `position`.

Stable failure codes remain:

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

Do not add stages, aggregate counts, Example Pages, filtering model, sibling Jobs, Workflow identifiers, provider data, or credentials.

Extend the existing owner-scoped Job-detail repository operation to return the Job, parent Run `id` and `name`, and ordered field definitions. Do not compose the heavyweight Run-detail read, which loads every sibling Job summary.

## 5. Frontend runtime contract

Add separate frontend and API path builders:

```ts
getScrapeJobDetailPath(runId, jobId)
// /app/scrape-runs/:runId/scrape-jobs/:jobId

getScrapeJobDetailApiPath(runId, jobId)
// /api/scrape-runs/:runId/scrape-jobs/:jobId
```

Add a strict Zod schema, inferred type, and validated fetcher to the existing client-safe API contract module. The fetcher receives the expected Run and Job IDs and rejects a `200` whose `scrapeRun.id` or `id` differs from them.

Validate the response as one read model:

- IDs are positive integers; attempts and positions are nonnegative integers.
- The Job URL is HTTP or HTTPS.
- Statuses, failure codes, and timestamp shapes are known.
- Fields have unique keys and strictly increasing unique positions.
- Exactly one field is the Primary Identifier, and it is required.
- A complete Job has exactly the configured result keys with `string | null` values.
- Every Required Extraction Field is non-null in a complete result.
- A non-complete Job has `result: null`.
- Any supplied missing-required key identifies a configured Required Extraction Field.

A malformed `200` is a safe API failure and must not partially populate the cache. Reuse the existing typed API error and safe error parsing; never expose raw invalid bodies or Zod internals.

## 6. Route and data behavior

### 6.1 Route architecture

Create:

```text
app/app/scrape-runs/[runId]/scrape-jobs/[jobId]/page.tsx
```

The page is a thin Server Component. It awaits both dynamic params and passes serializable strings to a focused client view. Use the generated route-aware `PageProps` type where supported by the installed Next.js version.

Use a static application-header title such as **Scrape Job**. Add a matching `loading.tsx` skeleton. Do not server-fetch the Job or add `generateStaticParams`.

### 6.2 SWR behavior

Use the nested API path as the SWR key. Parse successful JSON from `unknown` through the Job-detail contract.

Poll every three seconds while the cached Job is `pending` or `in_progress`. Stop when it becomes `complete`, `failed`, or `cancelled`. Retain focus/reconnect revalidation and default hidden-tab behavior.

Retry network and `5xx` failures up to three times using SWR backoff. Do not automatically retry `4xx`. Suspend ordinary polling while an error retry is active; manual Retry invokes bound revalidation.

Do not mutate parent Run-detail or Run-list caches. Those endpoints remain authoritative for their own summaries and aggregates.

### 6.3 Loading and errors

- Route transition and initial client load use a structured skeleton with back navigation.
- An initial `404` shows **Scrape Job not found**, a link to the route's parent Run, and access to the Scrape Runs list.
- A background `404` discards unavailable cached detail and transitions to the same not-found state.
- Other initial failures show a safe inline error and Retry.
- Network or `5xx` background failures retain cached content and show **Couldn't refresh scrape job** with Retry.
- Polling never replaces cached content with a skeleton or emits error toasts.

## 7. Page design

Keep this order stable while polling changes status:

1. Breadcrumbs and Job identity.
2. Canonical Page URL and external-page action.
3. Status and lifecycle metadata.
4. Main outcome area.

Use responsive Cards and stacked metadata rather than a wide table.

### 7.1 Identity and navigation

Breadcrumbs are:

```text
Scrape Runs → {Run name} → {Job heading}
```

The Run name links to `/app/scrape-runs/:runId`.

For a complete Job, use its Primary Identifier value as the heading. For all other statuses, use **Scrape Job**. Do not display numeric IDs.

Show the complete Canonical Page URL prominently, wrapping it safely rather than truncating it, and provide a safe external link. Do not auto-link URL-looking extracted values.

Existing Job links on the parent Run page remain semantic Next.js Links with `prefetch={false}`. Up to 25 Jobs may be visible, and route-shell prefetch would not preload client API data.

### 7.2 Status and lifecycle

| Status | Label | Main state |
|---|---|---|
| `pending` | Pending | Waiting to start extraction |
| `in_progress` | In progress | Extracting data from this page |
| `complete` | Complete | Ordered Extraction Result |
| `failed` | Failed | Sanitized failure presentation |
| `cancelled` | Cancelled | Extraction was cancelled before this job finished |

Show a textual status badge, attempt count including zero, Created always, Started when available, and Finished when available. Use semantic `<time dateTime>` elements and the existing stable locale formatter.

Do not display `updatedAt`, relative time, or duration. A decorative in-progress spinner may accompany text but must be hidden from assistive technology.

### 7.3 Successful Extraction Result

Render every configured field in ascending `position` order as a semantic definition list inside a Card. Do not rely on result-object key order.

For each field show:

- Field Label and description.
- Primary Identifier marker when applicable.
- Required or Optional state.
- Extracted value.

Show **Not found** for an optional Missing Value. Render values as selectable plain text, preserve meaningful line breaks, wrap long text, and never truncate the authoritative value.

Do not show Field Keys or raw JSON, and do not add dedicated copy controls.

### 7.4 Failed and cancelled Jobs

For a failed Job, show a prominent sanitized alert with a concise heading, failure message when present, and stable failure code as secondary diagnostics. Use a safe generic explanation if diagnostics are absent.

When `failureCode` is `missing_required_fields` and valid missing keys are present, map them to Field Labels and list the missing Required Extraction Fields. Never display the keys or infer partial values.

For a cancelled Job, show the explicit cancellation explanation rather than a failure alert. Run cancellation remains a parent-page action.

## 8. Accessibility and component boundaries

- Use semantic Breadcrumb, headings, definition list, links, buttons, alerts, and `<time>` elements.
- Never communicate state through color or motion alone.
- Keep visible focus for navigation, source links, and Retry.
- Wrap long names, labels, URLs, descriptions, and values without overflow.
- Use existing shadcn/ui Breadcrumb, Badge, Card, Alert, Skeleton, Tooltip, and Button primitives.
- Do not use `useEffect` or import server-only modules into the client graph.

Suggested responsibilities:

```text
app/app/scrape-runs/[runId]/scrape-jobs/[jobId]/page.tsx
  Thin dynamic route.

app/app/scrape-runs/[runId]/scrape-jobs/[jobId]/loading.tsx
  Route-transition skeleton.

components/scrape-runs/scrape-job-detail-view.tsx
  SWR, polling, retries, page states, and composition.

components/scrape-runs/scrape-job-detail-header.tsx
  Breadcrumbs, identity, source, status, and lifecycle metadata.

components/scrape-runs/scrape-job-result.tsx
  Ordered semantic Extraction Result.

components/scrape-runs/scrape-job-failure.tsx
  Sanitized failure and labeled missing fields.

components/scrape-runs/scrape-job-detail-skeleton.tsx
  Shared loading structure.

lib/scrape-runs/api-contracts.ts
  API path, schema/type, and validated fetcher.

lib/scrape-runs/presentation.ts
  Pure presentation derivations as they become necessary.
```

## 9. Phased implementation plan

Each phase must leave the repository passing and establish the boundary required by the next phase.

### Phase 1 — Self-contained read model and trusted contract

#### Scope

Extend the nested Job read model and establish the runtime-safe frontend data boundary. Do not render the page.

#### Objectives

- Supply exactly the Run identity and fields required for presentation.
- Avoid the heavyweight parent Run-detail response.
- Preserve ownership, nested membership, and privacy.
- Reject inconsistent success data before React can consume it.

#### Deliverables

- Add parent Run identity and ordered fields to the owner-scoped repository projection and route response.
- Add the Job-detail API path builder, strict schema/type, and validated fetcher.
- Keep existing flat Job fields and existing Run-detail/summary contracts unchanged.

#### Success criteria

- One authenticated request returns the complete self-contained read model.
- No sibling Jobs or unrelated Run configuration are fetched or returned.
- The fetcher rejects route-ID mismatches and invalid lifecycle/result shapes.
- Existing consumers continue to typecheck.

#### Testing requirements

- Repository integration tests for parent identity, field order, ownership, and nested membership.
- Route tests for `200`, `401`, every `404` case, serialization, and response privacy.
- Contract tests for IDs, lifecycle values, fields, result membership, required values, and missing-field diagnostics.
- Existing unit and integration suites remain passing.

#### Exit condition

Tests can fetch and validate a self-contained Job response for every status without rendering React.

### Phase 2 — Route, polling, and lifecycle shell

#### Scope

Build the route, SWR ownership, loading/error behavior, navigation, identity, lifecycle metadata, and active/cancelled state content. Detailed complete/failed outcomes follow in Phase 3.

#### Objectives

- Establish the Next.js route and client boundary.
- Keep active Jobs current without replacing cached content.
- Make navigation and non-result lifecycle states usable and accessible.
- Prove safe behavior for unavailable and temporarily unreachable data.

#### Deliverables

- Thin dynamic page and route/client skeleton.
- Focused SWR view with polling, retries, focus/reconnect behavior, and manual Retry.
- Generic not-found, initial-error, and cached-warning states.
- Breadcrumbs, heading derivation, source link, status, attempts, and timestamps.
- Pending, in-progress, and cancelled state content.
- Focused presentation helpers used by this phase.

#### Success criteria

- Direct navigation works for an owned Job.
- Active Jobs transition in place and terminal Jobs stop polling.
- Background `404` becomes not-found; network/`5xx` refresh failures retain cached content.
- No parent-detail request or parent-cache mutation occurs.
- Page structure remains stable as data changes.

#### Testing requirements

- Frontend tests for loading, `404`, errors, cached warnings, and Retry.
- Fake-timer tests for active polling, terminal stopping, error retry interaction, and cleanup.
- Breadcrumb, heading, source-link, status, attempt, and timestamp tests.
- Assertions against parent requests/cache mutation and polling-error toasts.
- Keyboard and semantic checks for navigation, statuses, alerts, and times.

#### Exit condition

The route provides a robust lifecycle shell and all data behaviors needed for terminal outcome components.

### Phase 3 — Terminal outcomes and integrated hardening

#### Scope

Add complete-result and failed-outcome presentation, then harden those outcomes for responsive layouts, accessibility, long content, and lifecycle updates. Entire-feature verification follows in Phase 4.

#### Objectives

- Present successful values in configured order and precise domain language.
- Explain failures using only sanitized retained diagnostics.
- Keep long content and every input method usable.
- Integrate terminal outcomes into the lifecycle shell without exposing stale identity or invalid partial output.

#### Deliverables

- Ordered semantic Extraction Result with descriptions and markers.
- Optional **Not found**, long-value, and multiline handling.
- Generic failure alert and labeled missing-required-field list.
- Responsive refinements and final accessibility semantics.
- Any focused result/failure helpers required by these components.

#### Success criteria

- Complete and failed Jobs have complete, accurate presentations within the lifecycle shell.
- Field Keys, raw JSON, partial results, and unsafe internals never appear in terminal outcomes.
- Long labels, descriptions, and values remain readable and usable across supported layouts and input methods.
- Terminal outcome rendering cannot show stale identity or invalid partial output during a lifecycle update.

#### Testing requirements

- Ordered result, Primary Identifier heading, optional null, long/multiline value, description, and marker tests.
- Generic failure, absent-diagnostic fallback, and labeled missing-required-field tests.
- Focused accessible-semantic and responsive-behavior tests for results and failure alerts.
- Focused lifecycle-shell integration tests for complete and failed outcome rendering.

#### Exit condition

Complete and failed outcomes are implemented, hardened, and covered by focused tests, leaving the full feature ready for Phase 4 verification.

### Phase 4 — Entire-feature verification

#### Scope

Verify the completed feature across every status and across responsive, accessibility, cache, retry, privacy, navigation, and repository-integration edge cases. This phase adds no feature scope; it only adds verification and fixes defects found while checking the requirements already defined by this document.

#### Objectives

- Verify every lifecycle state and transition as one integrated feature.
- Confirm cache, retry, polling, request-isolation, ownership, and privacy behavior under edge conditions.
- Validate navigation, responsive behavior, and keyboard and assistive-technology semantics.
- Confirm all exclusions and complete repository-wide verification.

#### Deliverables

- Integrated coverage for lifecycle transitions and cross-component edge cases.
- Completed responsive, keyboard, accessibility, navigation, cache, and privacy verification.
- Defect fixes required to satisfy the existing scope, without adding new capabilities.
- Passing repository-wide test, typecheck, and lint results.

#### Success criteria

- Every Job status has a complete, accurate presentation.
- Field Keys, raw JSON, partial results, and unsafe internals never appear.
- No retry/cancel mutation, sibling navigation, export, copy control, `useEffect`, or server-only client import is introduced.
- Polling transitions cannot render stale identity or invalid partial output.
- Existing parent-page Job links reach this route and retain `prefetch={false}`.
- Ownership, nested membership, response privacy, and request-isolation guarantees hold throughout the integrated feature.

#### Testing requirements

- Integrated transitions from active to complete, failed, and cancelled.
- Cached-data, retry-race, timer-cleanup, isolated-cache, and no-extra-request tests.
- End-to-end checks of loading, not-found, initial-error, stale-data warning, manual Retry, and terminal states.
- Keyboard and accessible-semantic tests for results, alerts, links, statuses, and timestamps.
- Navigation checks for direct entry, breadcrumbs, parent links, source links, and disabled prefetch on parent-page Job links.
- Privacy and access checks for unauthenticated, non-owned, wrong-parent, malformed-ID, and malformed-success-response cases.
- Manual checks at narrow, medium, and wide layouts with long content and keyboard navigation.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.

#### Exit condition

All automated suites and manual checks pass, and the Scrape Job detail page satisfies this document without expanding its scope.
