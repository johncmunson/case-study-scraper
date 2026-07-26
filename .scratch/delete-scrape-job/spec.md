## Implementation plan

### 1. Persistence and concurrency

**File:** `lib/server/scrape-runs/repository.ts`

Add `deleteOwnedTerminalScrapeJob(...)` returning:

- `deleted`
- `not_found`
- `active_conflict`

Within one transaction:

1. Lock the owned parent Run with `FOR UPDATE`.
2. Lock/find the Job using both `scrapeRunId` and `scrapeJobId`.
3. Return `not_found` if either is unavailable.
4. Reject an active parent Run.
5. Hard-delete the Job.
6. Leave the Run status and all other Run data unchanged.

Always lock the Run before the Job, matching existing lifecycle lock ordering.

### 2. DELETE route

**File:** `app/api/scrape-runs/[runId]/scrape-jobs/[jobId]/route.ts`

Add a `DELETE` handler alongside the existing `GET`:

- Authenticate before parsing parameters.
- Validate both IDs.
- Delegate ownership and terminal-state checks to the repository.
- Return exact bodyless `204`, private `404`, `409`, or `401`.
- Let unexpected errors propagate.

### 3. Job detail contract

The detail UI needs the parent status because a completed Job may still belong to an active Run.

**Files:**

- `lib/server/scrape-runs/read-repository.ts`
- `lib/scrape-runs/api-contracts.ts`

Add `scrapeRun.status` to the Job detail projection and Zod schema. Add a `deleteScrapeJob` API client that requires an exact `204` response.

### 4. Shared deletion UI

**New component:** `components/scrape-runs/delete-scrape-job-dialog.tsx`

Use existing shadcn components and established mutation patterns:

- Row-action and detail-button trigger variants.
- Exact agreed confirmation copy.
- Prevent duplicate submissions and dialog dismissal while pending.
- Show success/error toast.
- No `useEffect`.

On success:

- Remove the Job from the cached Run detail.
- Decrement total and status-specific counts.
- Update the Run summary cache similarly.
- Preserve Run status.
- Revalidate relevant read models in the background.
- Support an `onDeleted` callback for navigation.

On failure, retain the Job and revalidate stale data.

### 5. Run detail table entry point

**File:** `components/scrape-runs/scrape-job-summary-table.tsx`

- Add an Actions column and per-row menu.
- Show deletion only for terminal Runs.
- Remove a successfully deleted row in place.
- Let existing derived pagination clamp after deletion.
- Allow the table to reach the existing zero-job state.
- Keep filters and counts consistent.

### 6. Job detail entry point

**Files:**

- `components/scrape-runs/scrape-job-detail-header.tsx`
- `components/scrape-runs/scrape-job-detail-view.tsx`

- Add an optional header action slot.
- Show deletion only when `job.scrapeRun.status` is terminal.
- After success, use `router.replace()` to return to the parent Run so Back does not reopen the deleted Job.
- Warm/update the parent cache before navigation.

### 7. Tests

Add or extend coverage for:

- **Repository integration:** terminal statuses, all Job outcomes, final-Job deletion, unchanged Run status, ownership, wrong parent, active conflicts, and repeated deletion.
- **Route unit tests:** authentication order, ID validation, private `404`, `409`, exact `204`, and unexpected errors.
- **API contract tests:** DELETE method, exact response handling, safe errors, and expanded Job detail schema.
- **Frontend tests:** action visibility, confirmation copy, pending protection, row removal, count/filter/pagination updates, zero-job state, error retention, and detail-page navigation.

Likely files:

- `tests/integration/scrape-run-repository.test.ts`
- `tests/unit/scrape-job-deletion-route.test.ts`
- `tests/frontend/scrape-run-api-contracts.test.ts`
- `tests/frontend/scrape-job-detail-api-contract.test.ts`
- `tests/frontend/scrape-job-summary-table.test.tsx`
- `tests/frontend/scrape-job-detail-view.test.tsx`
- `tests/frontend/scrape-run-fixtures.ts`

### 8. Validation

Run:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:frontend
pnpm typecheck
pnpm lint
```

No database migration or dataset cleanup is needed: results are stored on the Job, and datasets are generated from remaining completed Jobs. No ADR is needed.
