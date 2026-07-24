# Scrape Run Card Actions

## High-level design

### Goal

Add a top-right actions menu to every card on the Scrape Runs page while preserving card navigation and the existing card layout as much as possible.

Each menu contains exactly one destructive action, selected from the Run's persisted lifecycle status:

| Run state | Menu action |
| --- | --- |
| `pending` | Cancel |
| `in_progress` | Cancel |
| `in_progress` with a Cancellation Request (displayed as “Cancelling”) | Cancel |
| `complete` | Delete |
| `failed` | Delete |
| `cancelled` | Delete |

“Cancelling” remains an active presentation state, not a terminal status. Repeated cancellation is safe because the existing cancellation endpoint is idempotent and resumes incomplete cancellation cleanup.

### User experience

- Place an ellipsis (`…`) trigger in the top-right corner of each card.
- Keep the card body as a link to the existing Scrape Run detail page. The link and menu trigger must be sibling interactive regions; do not nest the menu button inside an anchor.
- Move the status badge from the card header to immediately after the existing timestamp. Otherwise preserve the current lower-card layout, including the Scrape Job summary and active progress bar.
- Render both Cancel and Delete as destructive menu items.
- Selecting the menu item closes the menu and opens an accessible confirmation dialog.
- Confirmation copy identifies the selected Run by name.
- Use the same Cancel label and standard cancellation copy for a Run displayed as “Cancelling”; do not expose “Retry cancellation” on cards.
- Disable the card trigger and dialog controls while the action request is pending, show a spinner on the confirmation button, and prevent dismissal or duplicate submission until the request settles.
- On success, close the dialog and show a bottom-center success toast:
  - `Scrape Run cancelled`
  - `Scrape Run deleted`
- On failure, close the dialog, retain the card, show a bottom-center warning toast, and revalidate the list so stale status or deletion races resolve to the server's state.

### Deletion semantics

**Run Deletion** is the irreversible removal of a terminal Scrape Run and all app-owned persisted data associated with it: configuration, stages, Scrape Jobs, Extraction Results, and the source data from which Extraction Datasets are generated. This term is recorded in [CONTEXT.md](./CONTEXT.md).

Deletion is not cancellation and must never implicitly cancel an active Run. The server, rather than only the UI, is authoritative about terminal eligibility.

The child tables for fields, stages, and jobs already use `ON DELETE CASCADE`. Extraction Datasets are generated from fields and successful job results rather than stored in a separate table. Therefore deleting the parent Run removes all relevant persisted data without a schema migration.

A terminal Run may retain a historical `workflowRunId`, but deletion does not call workflow cancellation or attempt to delete provider-owned execution history. Terminal-only eligibility guarantees that no active workflow should be interrupted.

### API contract

Extend the existing dynamic Run route with:

```http
DELETE /api/scrape-runs/:runId
```

Responses:

| Condition | Response |
| --- | --- |
| Unauthenticated | `401` with the existing unauthorized JSON body |
| Invalid, missing, or non-owned Run | `404` with the existing private not-found JSON body |
| Owned Run is still active | `409` with a safe JSON error |
| Terminal Run deleted | `204 No Content` with an empty body |

A second deletion request returns `404`; deletion is not represented as an idempotent success after the resource has ceased to exist.

The route uses the Next.js 16 Route Handler conventions already present in the repository: an exported `DELETE` function, Web `Request`/`Response` APIs, and awaited dynamic `params`.

### Server consistency and security

Perform the eligibility check and deletion in one database transaction:

1. Select the Run by both Run ID and authenticated user ID.
2. Lock the parent row with `FOR UPDATE`.
3. Return `not_found` when no owned row exists.
4. Return `active_conflict` for `pending` or `in_progress`, including Runs with a Cancellation Request.
5. Delete the locked parent only when its status is terminal.

The ownership predicate prevents disclosure of another Researcher's Run. The row lock serializes deletion against lifecycle transitions: deletion either observes an active Run and rejects it, or observes a terminal Run and removes it.

### Frontend data flow

The list endpoint and `SCRAPE_RUNS_API_PATH` SWR key remain the canonical card read model.

- Cancellation continues to call `POST /api/scrape-runs/:runId/cancel` and validate the existing `202` response.
- Deletion calls the new `DELETE` route and requires exactly `204`.
- After cancellation succeeds, project only the validated `status: "cancelled"` into the list cache, then revalidate. Do not fabricate timestamps or Scrape Job counts.
- After deletion succeeds, filter only the deleted Run ID from the list cache, then revalidate. Do not remove the card optimistically before server confirmation.
- On any action error, leave cached cards intact and revalidate. This handles races such as a Run finishing before cancellation confirmation or disappearing before deletion confirmation.

No direct `useEffect` is needed. Menu/dialog state changes, mutations, cache updates, focus handling, and toasts should all occur in explicit event and mutation handlers.

### Scope

Included:

- Card actions on the Scrape Runs list page.
- Terminal-only deletion API and persistence behavior.
- Cancellation from list cards.
- Status badge relocation beside the timestamp.
- Accessibility, responsive behavior, and automated tests.

Not included:

- A Delete action on the Scrape Run detail page.
- Changes to the existing detail-page cancellation UI.
- Archive, soft-delete, restore, or retention features.
- New lifecycle statuses.
- A database migration.
- Deleting provider-owned workflow history.

No ADR is required: permanent deletion versus archival is now explicit in the domain glossary, and the implementation follows existing route, ownership, transaction, SWR, and component conventions.

---

## Detailed implementation plan

### 1. Add the terminal deletion repository operation

Update [`lib/server/scrape-runs/repository.ts`](./lib/server/scrape-runs/repository.ts).

1. Export a discriminated result type such as:

   ```ts
   type DeleteOwnedTerminalScrapeRunResult =
     | Readonly<{ outcome: "deleted" }>
     | Readonly<{ outcome: "active_conflict" }>
     | Readonly<{ outcome: "not_found" }>
   ```

2. Add `deleteOwnedTerminalScrapeRun({ userId, scrapeRunId })` using the existing owned-Run input shape.
3. Start a `db.transaction`.
4. Select the parent Run's ID and status with predicates for both `scrapeRuns.id` and `scrapeRuns.userId`, and lock it with `.for("update")`.
5. Return `not_found` if the query finds no owned row. This intentionally combines missing and cross-owner cases.
6. Classify status with the shared active/terminal status helpers from [`lib/scrape-runs/contracts.ts`](./lib/scrape-runs/contracts.ts). Return `active_conflict` for both active statuses; a non-null `cancellationRequestedAt` must not alter this classification.
7. Delete the terminal parent row and request its ID with `.returning`.
8. Throw an internal invariant error if the already-locked row unexpectedly cannot be deleted. Do not expose that error's details through the route.
9. Return `deleted` after the parent removal succeeds. Rely on existing foreign-key cascades for fields, stages, and jobs.

Do not call cancellation functions or workflow APIs from this operation.

### 2. Add the `DELETE` Route Handler

Update [`app/api/scrape-runs/[runId]/route.ts`](./app/api/scrape-runs/[runId]/route.ts) while preserving its existing `GET` export.

1. Export an async `DELETE` handler with the same promise-based route-parameter type as `GET`.
2. Authenticate first with `getCurrentSession`. Return `unauthorizedResponse()` before parsing params or touching the repository when no session exists.
3. Await `params`, parse `runId` through `positiveIntegerRouteId`, and return `scrapeRunNotFoundResponse()` for invalid IDs.
4. Convert the session user ID with `numericSessionUserId`.
5. Call `deleteOwnedTerminalScrapeRun` with the authenticated user ID and parsed Run ID.
6. Map repository outcomes:
   - `not_found` → the shared private `404` response.
   - `active_conflict` → `409` with `{ error: "An active scrape run cannot be deleted." }`.
   - `deleted` → `new Response(null, { status: 204 })`.
7. Allow unexpected repository errors to propagate to the framework's generic server-error handling; do not serialize database details.

Do not use `Response.json` for the successful response because a `204` must not have a body.

### 3. Add the deletion client contract

Update [`lib/scrape-runs/api-contracts.ts`](./lib/scrape-runs/api-contracts.ts).

1. Reuse `getScrapeRunDetailApiPath(runId)` for the deletion URL; the detail and deletion resource paths are intentionally identical.
2. Add `deleteScrapeRun(url: string): Promise<void>`.
3. Send the request through the existing `fetchResponse` helper with:
   - `method: "DELETE"`
   - network fallback message `Unable to delete the scrape run.`
4. For non-OK responses, throw the result of `scrapeRunApiErrorFromResponse` so safe server messages and status codes are retained.
5. Require exactly `response.status === 204`; reject any other nominally successful status with the existing invalid-response error.
6. Return without calling `response.json()`. No Zod success schema is needed for a bodyless response.

Keep the existing cancellation contract unchanged.

### 4. Build the card action menu and confirmation controller

Create [`components/scrape-runs/scrape-run-card-actions.tsx`](./components/scrape-runs/scrape-run-card-actions.tsx) as a client component using existing shadcn components from `components/ui`.

#### Menu behavior

1. Accept the current `ScrapeRunSummary` as a prop.
2. Derive the available action directly from `isActiveScrapeRun(run)`:
   - active → `cancel`
   - terminal → `delete`
3. Render an icon-only ghost `Button` with a Lucide ellipsis icon through `DropdownMenuTrigger`'s `render` API.
4. Give the trigger a Run-specific accessible name such as `Actions for ${run.name}`.
5. Render `DropdownMenuContent` aligned to the end.
6. Render exactly one `DropdownMenuItem`, labelled `Cancel` or `Delete`, with `variant="destructive"`.
7. On item selection, record the selected action in controlled dialog state. This is a user-selection snapshot, not state synchronized from props. It prevents polling from silently changing an already-open Cancel confirmation into Delete.
8. Keep the `AlertDialog` root/content outside the menu popup subtree so closing the portaled menu does not unmount the dialog.

#### Mutations and cache reconciliation

1. Use `useSWRMutation` for the cancellation path with the existing `cancelScrapeRun` fetcher.
2. Use a separate `useSWRMutation` for the detail/deletion path with `deleteScrapeRun`.
3. Invoke both hooks unconditionally; choose which trigger to call from the selected action. This follows React's hook rules while keeping per-card pending state isolated.
4. Use `useSWRConfig().mutate` to update the canonical `SCRAPE_RUNS_API_PATH` cache.
5. Cancellation success:
   - Verify that the response ID matches the selected card's ID, as the detail view already does.
   - Treat a mismatched ID as an invalid server response and do not alter the cache.
   - Close the dialog.
   - Map the matching cached summary to `status: "cancelled"` and preserve every other field.
   - Show `Scrape Run cancelled`.
   - Trigger list revalidation for authoritative timestamps, cancellation metadata, and counts.
6. Deletion success:
   - Close the dialog.
   - Filter the selected ID from the cached summary list.
   - Show `Scrape Run deleted`.
   - Trigger list revalidation.
7. Failure for either action:
   - Close the dialog.
   - Keep the cached card list unchanged.
   - Normalize unknown failures to an action-specific safe message; preserve `ScrapeRunApiError.message` for validated API errors.
   - Show a warning toast using the repository convention `Error: ${message}`.
   - Trigger list revalidation so `404`, `409`, `503`, malformed responses, and ambiguous network failures reconcile to server state.
8. Use the existing bottom-center toast position convention.
9. Apply the cache write through SWR's `mutate` before starting revalidation so SWR can invalidate older in-flight list reads rather than allowing stale data to overwrite a confirmed mutation.

#### Confirmation dialog behavior

1. Use a controlled `AlertDialog` whose open state is represented by the selected action.
2. Prevent `onOpenChange` from dismissing the dialog while the selected mutation is pending by calling the provided event details' `cancel()` method.
3. Guard the confirmation handler against duplicate invocation.
4. Disable both dialog buttons and the menu trigger while the relevant request is pending.
5. Show a spinner and `Cancelling…` or `Deleting…` on the destructive confirmation button.
6. Use the neutral action as the initial focus target.
7. Keep a ref to the menu trigger and use the dialog content's supported `finalFocus` API, or equivalent explicit close-handler focus restoration, so focus returns to the ellipsis trigger after dismissal. Do not add an effect for focus management.

Cancellation copy:

- Title: `Cancel Scrape Run?`
- Description identifies the Run by name and states that unfinished work will stop while already-finished Scrape Jobs retain their outcomes.
- Neutral button: `Keep running`
- Destructive button: `Cancel Scrape Run`
- Use this same copy when the badge says “Cancelling.”

Deletion copy:

- Title: `Delete Scrape Run?`
- Description identifies the Run by name, states that its associated configuration, stages, Scrape Jobs, results, and datasets will be permanently removed, and says the action cannot be undone.
- Neutral button: `Keep Scrape Run`
- Destructive button: `Delete Scrape Run`

### 5. Refactor the card into sibling navigation and action regions

Update [`components/scrape-runs/scrape-run-list-item.tsx`](./components/scrape-runs/scrape-run-list-item.tsx).

1. Stop rendering the outer `Item` itself as a `Link`. A button inside that anchor would be invalid nested interactive content.
2. Keep the outer `Item` as the visual card and make its main content a `Link` to `/app/scrape-runs/${run.id}`.
3. Place `ScrapeRunCardActions` as a sibling of that link, positioned in the top-right through the existing `ItemActions` primitive or an equivalent card-relative action slot.
4. Preserve a large clickable navigation region, hover behavior, truncation, card overflow behavior, and a visible keyboard focus ring on the link.
5. Reserve enough right-side header space that long names cannot render underneath the ellipsis trigger.
6. Ensure the portaled menu and dialog are not clipped by card overflow.
7. Keep the existing card heading hierarchy, hostname, job summary, timestamp semantics, and progress behavior.
8. Remove the status badge from the top header.
9. In the existing summary/timestamp row, wrap the timestamp and status badge in a compact group in that order:
   - timestamp
   - status badge
10. Preserve the row's current responsive behavior and leave the progress bar after the row. The change is a relocation of the badge, not a footer redesign.
11. Keep the existing status variant, status label, spinner, and accessibility logic. A Run displayed as “Cancelling” must continue to show its status spinner and expose Cancel in the menu.

No changes should be required in [`components/scrape-runs/scrape-run-list.tsx`](./components/scrape-runs/scrape-run-list.tsx) or [`components/scrape-runs/scrape-runs-view.tsx`](./components/scrape-runs/scrape-runs-view.tsx) unless implementation reveals that a cache callback must be passed explicitly. Prefer keeping action-specific logic encapsulated in the new card action component while mutating the existing canonical SWR key.

### 6. Preserve existing detail-page behavior

Do not add deletion to the detail header and do not alter the existing retry-aware detail cancellation flow in:

- [`components/scrape-runs/cancel-scrape-run-dialog.tsx`](./components/scrape-runs/cancel-scrape-run-dialog.tsx)
- [`components/scrape-runs/scrape-run-detail-view.tsx`](./components/scrape-runs/scrape-run-detail-view.tsx)

The card menu deliberately uses the simpler agreed Cancel wording even though the detail page can continue to explain incomplete cleanup as a retry.

### 7. Documentation cleanup

1. Keep the new **Run Deletion** definition in [`CONTEXT.md`](./CONTEXT.md).
2. Verify the definition remains implementation-free and consistent with the final behavior.
3. Do not create an ADR or migration documentation.

---

## Required test cases and test seams

### Test seams

| Seam | Purpose | Test level |
| --- | --- | --- |
| `deleteOwnedTerminalScrapeRun` outcome union | Test ownership and status policy independently from HTTP mapping | Integration |
| `DELETE` Route Handler with mocked session/repository | Test authentication, private errors, and exact HTTP responses without a database | Unit |
| Database foreign-key cascades | Prove parent deletion removes all app-owned child data | Integration |
| `deleteScrapeRun` fetcher | Test method, exact `204` handling, error normalization, and no JSON parsing | Frontend contract |
| `ScrapeRunCardActions` with MSW and isolated SWR cache | Test menu/dialog behavior and real mutation/cache integration | Frontend |
| `ScrapeRunListItem` | Test sibling link/menu structure and timestamp/badge placement | Frontend |
| Existing `isActiveScrapeRun` and terminal status helpers | Keep the action matrix tied to canonical lifecycle classification | Unit/frontend |

Use [`tests/frontend/render.tsx`](./tests/frontend/render.tsx) for an isolated SWR cache and the existing MSW server for network behavior. Use the shared Scrape Run fixtures rather than introducing loosely typed objects.

### Route unit tests

Create [`tests/unit/scrape-run-deletion-route.test.ts`](./tests/unit/scrape-run-deletion-route.test.ts).

Required cases:

1. Unauthenticated request returns `401` and never calls the deletion repository.
2. Invalid IDs return the private `404` and never call the repository. Cover non-numeric, zero, negative, and unsafe integer values consistent with existing route tests.
3. The route converts the session user ID and passes the correct `{ userId, scrapeRunId }` to the repository.
4. `not_found` returns the same `404` body for missing and non-owned Runs.
5. `active_conflict` returns `409` with the safe active-Run message.
6. `deleted` returns exactly `204`.
7. The `204` response body is empty and does not advertise a JSON body.
8. Unexpected repository errors are not converted into a response containing internal error details.
9. The existing `GET` behavior in the shared route file remains covered and unchanged.

### Repository integration tests

Extend [`tests/integration/scrape-run-repository.test.ts`](./tests/integration/scrape-run-repository.test.ts).

Required cases:

1. Deletion succeeds independently for `complete`, `failed`, and `cancelled` Runs.
2. Deletion returns `active_conflict` and preserves a `pending` Run.
3. Deletion returns `active_conflict` and preserves an `in_progress` Run.
4. An `in_progress` Run with `cancellationRequestedAt` is still rejected and preserved.
5. A missing Run returns `not_found`.
6. A Run owned by another user returns `not_found` and remains unchanged.
7. Deleting one user's terminal Run does not alter any unrelated Run.
8. A first deletion returns `deleted`; a second attempt for the same ID returns `not_found`.

### Cascade integration tests

Extend [`tests/integration/scrape-run-schema.test.ts`](./tests/integration/scrape-run-schema.test.ts) with direct parent-Run deletion coverage.

Required assertions:

1. The selected Scrape Run is removed.
2. Its Extraction Fields are removed.
3. Its Run Stages are removed.
4. Its Scrape Jobs and JSON Extraction Results are removed.
5. The owning user remains.
6. Unrelated Runs and all of their child rows remain.

This complements the existing user-deletion cascade test, which does not directly guarantee the Run Deletion boundary.

### API client contract tests

Extend [`tests/frontend/scrape-run-api-contracts.test.ts`](./tests/frontend/scrape-run-api-contracts.test.ts).

Required cases:

1. `deleteScrapeRun` sends `DELETE` to the supplied Run resource path.
2. A bodyless `204` resolves to `undefined` without attempting JSON parsing.
3. Safe JSON `401`, `404`, and `409` errors preserve their status and message in `ScrapeRunApiError`.
4. A non-JSON error response uses the existing status-based fallback message.
5. A network failure uses `Unable to delete the scrape run.` without exposing transport details.
6. Unexpected successful statuses such as `200` or `202` are rejected as invalid server responses.
7. Existing cancellation contract tests continue to pass unchanged.

### Focused card action tests

Create [`tests/frontend/scrape-run-card-actions.test.tsx`](./tests/frontend/scrape-run-card-actions.test.tsx), or place equivalent focused cases in the existing list-view suite if that produces less duplication.

Required menu and classification cases:

1. The trigger has a Run-specific accessible name and an ellipsis icon that is hidden from the accessibility tree.
2. Enter and Space can open the menu; Escape closes it and restores focus.
3. The menu contains exactly one action.
4. `pending` shows destructive `Cancel`, not Delete.
5. `in_progress` shows destructive `Cancel`, not Delete.
6. An active Run displayed as “Cancelling” still shows `Cancel`; it never shows “Retry cancellation” or Delete.
7. `complete`, `failed`, and `cancelled` each show destructive `Delete`, not Cancel.
8. Selecting the item closes the menu and opens the matching accessible alert dialog.
9. Polling/status changes do not silently change the action in an already-open confirmation; server reconciliation handles stale confirmations.

Required confirmation cases:

1. Both dialogs identify the selected Run by name.
2. Cancel uses the standard unfinished-work/finished-outcomes copy.
3. Delete states permanence, associated-data removal, and that the operation cannot be undone.
4. Initial focus lands on the neutral button.
5. The neutral button closes the dialog and returns focus to the card's menu trigger.
6. Confirmation starts exactly one request.
7. Both controls and the card trigger are disabled while pending.
8. The destructive button shows the correct spinner and pending label.
9. Escape, outside interaction, and repeated confirmation cannot dismiss or duplicate the action while pending.
10. The dialog closes after either success or failure.

Required mutation and cache cases:

1. Cancellation calls the existing cancellation endpoint for the selected Run.
2. A valid cancellation response changes only the selected cached Run to `cancelled`, changes its menu action to Delete, shows the success toast, and revalidates.
3. Cancellation of the only active Run allows existing create-action eligibility to update from the list cache.
4. A mismatched cancellation response ID is treated as invalid and does not update any card.
5. A cancellation `409` leaves the card present, shows a warning, and revalidates to the latest terminal state/action.
6. A cancellation `503` leaves the card present, shows a warning, and revalidates so a recorded Cancellation Request can display as “Cancelling.”
7. Deletion sends one request only after confirmation.
8. Successful deletion removes only the selected card after the server response, shows the success toast, and revalidates.
9. Deleting the final card renders the existing empty state.
10. A deletion `404`, `409`, `5xx`, malformed success, or network failure leaves the card in place, closes the dialog, shows a warning toast, and revalidates.
11. Acting on one card does not alter another card's data or pending state.
12. A stale in-flight list read does not reinsert a successfully deleted card or overwrite a confirmed cancellation projection.

Mount the existing `<Toaster />` only in tests that assert toast behavior, and dismiss toasts during test cleanup to avoid cross-test leakage.

### Card layout and navigation regression tests

Extend [`tests/frontend/scrape-runs-view.test.tsx`](./tests/frontend/scrape-runs-view.test.tsx).

Required cases:

1. Every Run still exposes a keyboard-focusable link to its existing detail URL.
2. The menu trigger is not contained by the link, and activating it does not navigate.
3. The status badge no longer appears in the top title/hostname region.
4. The timestamp and status badge share the existing lower summary row, with the timestamp preceding the badge.
5. The Scrape Job summary remains on the left at supported widths.
6. The active progress bar remains after the summary/timestamp/status row.
7. Long names and hostnames remain truncated and understandable in the constrained-width fixture.
8. The top-right action trigger does not overlap long title text.
9. Existing status labels, badge variants, status spinners, progress values, loading, empty, and refresh-error states remain unchanged.

### Optional concurrency hardening

If the existing integration harness can coordinate two database transactions deterministically, add a race test between terminal transition and deletion:

- If deletion obtains the row lock while the Run is active, deletion returns `active_conflict` and the later lifecycle transition may complete.
- If the lifecycle transition commits first, deletion observes the terminal status and succeeds.

Do not add timing-based sleeps solely to force this race; the transaction-level status tests and row-lock implementation are the required baseline.

---

## Implementation order

1. Add repository tests and implement `deleteOwnedTerminalScrapeRun`.
2. Add route unit tests and implement the `DELETE` handler.
3. Add API contract tests and implement `deleteScrapeRun`.
4. Add focused card-action tests and implement the menu, dialogs, mutations, cache reconciliation, toasts, and focus handling.
5. Refactor the card link/action structure and relocate the badge beside the timestamp.
6. Extend list-view regression tests for layout, navigation, statuses, and mutation integration.
7. Run targeted suites during development, followed by all required checks.

## Verification commands

Use pnpm only:

```bash
pnpm test:unit
pnpm test:frontend
pnpm test:integration
pnpm typecheck
pnpm lint
pnpm test
```

Do not run Prettier; formatting is left to the user per repository instructions.

## Completion criteria

The feature is complete when:

- Every list card shows exactly one correct status-derived destructive action.
- “Cancelling” cards continue to offer Cancel with ordinary cancellation copy.
- Card navigation and action interaction are valid, independent, keyboard-operable, and focus-safe.
- The badge sits immediately to the right of the existing timestamp without redesigning the lower card.
- Cancellation reconciles through the canonical list cache and existing endpoint.
- Terminal deletion is ownership-safe, transactionally guarded, cascading, and exposed through the agreed `204` API.
- Success and failure feedback match the agreed toast/dialog behavior.
- Detail-page behavior remains unchanged.
- All required automated tests, type checking, and linting pass.
