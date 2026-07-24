# Scrape Run Extraction Dataset Download Design and Phased Implementation Plan

## 1. Purpose

Add CSV and JSON downloads for the Extraction Dataset produced by a terminal Scrape Run.

An Extraction Dataset is a downstream-usable projection of successful Extraction Results. It is not an archive of the Scrape Run's configuration or operational history.

This document is standalone and covers the backend read projection, file contracts, download API, Scrape Run detail-page interaction, error behavior, and testing strategy.

## 2. Goals

- Let users download every successful Extraction Result from one terminal Scrape Run.
- Support both spreadsheet-friendly CSV and machine-friendly JSON.
- Preserve the association between each result and its Canonical Page URL.
- Preserve configured Extraction Field ordering and stable Field Keys where appropriate.
- Enforce authentication and ownership without exposing non-owned Runs.
- Keep export read-only and stateless.
- Provide understandable unavailable, loading, success, and failure behavior.
- Validate stored successful results before emitting a dataset.

## 3. Scope

### In scope

- A **Download dataset** control in the Scrape Jobs card header on the Scrape Run detail page.
- CSV and JSON format choices.
- Disabled-state explanations for active Runs and terminal Runs without successful jobs.
- One authenticated, owner-scoped Extraction Dataset endpoint.
- Full in-memory database loading and file serialization.
- Browser Blob download behavior.
- Safe filenames and download response headers.
- Unit, repository integration, route, and frontend component tests.
- Adding `fast-csv` with pnpm after its API documentation is provided.

### Out of scope

- Exporting an Active Scrape Run or a “results so far” snapshot.
- Exporting failed, cancelled, pending, or in-progress Scrape Jobs.
- Exporting Run Configuration, Run Stages, lifecycle state, failures, attempts, timestamps, IDs, provider metadata, or Workflow data.
- Respecting the Scrape Job table's current status filter or pagination page.
- Downloads from the Scrape Run list or Scrape Job detail page.
- Streaming, database batching, background generation, object storage, generated-file persistence, or download history.
- Export-size preflight, a hard size cap, or a large-export fallback.
- Automatic retry.
- CSV formula-injection neutralization.
- Database schema, Workflow, lifecycle, or provider changes.
- Browser end-to-end tests.

## 4. Domain language

The root `CONTEXT.md` defines:

- **Extraction Dataset:** The collection of successful Extraction Results from one Scrape Run, with each result associated with its Canonical Page URL. Run configuration, lifecycle state, and failure diagnostics are not part of the dataset.
- **Extraction Result:** The normalized user-defined values produced by a successful Scrape Job.
- **Missing Value:** A `null` Extraction Result value.
- **Canonical Page URL:** The normalized identity of the Matching Page processed by a Scrape Job.

The feature must use **Extraction Dataset** rather than “full Scrape Run export,” because the downloaded artifact deliberately excludes operational state and unsuccessful Jobs.

This feature introduces no durable Export entity or Export lifecycle. No ADR is required because the delivery mechanism is local and reversible.

## 5. Dataset eligibility

A dataset is available only when both conditions hold:

1. The Scrape Run is terminal: `complete`, `failed`, or `cancelled`.
2. At least one Scrape Job has `complete` status.

Consequences:

- A `complete` Run with successful Jobs is downloadable.
- A `failed` Run is downloadable when an earlier successful result was preserved.
- A `cancelled` Run is downloadable when a result completed before cancellation.
- A `pending` or `in_progress` Run is never downloadable, even if some Jobs have already completed.
- A terminal Run with zero successful Jobs has no Extraction Dataset to download.

The frontend derives availability from the validated Run-detail read model. The download endpoint independently rechecks ownership, terminal status, and successful-job existence; frontend state is never authoritative.

## 6. Dataset content

### 6.1 Included records

Include exactly one record for every Scrape Job whose persisted status is `complete`.

Always exclude Jobs with these statuses:

- `pending`
- `in_progress`
- `failed`
- `cancelled`

Failed Jobs have no persisted partial Extraction Result and must never appear as empty or diagnostic rows.

### 6.2 Record ordering

Sort records by Canonical Page URL ascending. CSV and JSON must use the same deterministic order.

Ordering must not depend on internal Scrape Job IDs, the frontend's current table order, its selected status filter, or its current pagination page.

### 6.3 Field ordering

Use the Run's Extraction Fields in ascending configured `position` order.

- CSV columns follow that order after the source URL column.
- JSON `fields` properties are inserted in that order for readability, although consumers must not rely on JSON object property order.

### 6.4 Excluded data

Do not include:

- Scrape Run or Scrape Job IDs.
- Run name or Target Site metadata inside the file.
- Job status, attempts, timestamps, or failures.
- Missing-required Field Keys.
- Run Stages or Run Configuration.
- Field descriptions, requiredness, or Primary Identifier markers.
- Filtering model, Workflow identifiers, provider data, page content, or logs.

The Run name and ID are used only to construct the filename.

## 7. JSON contract

Return a top-level array. Each record has a Canonical Page URL and a nested `fields` object keyed by stable Field Key:

```json
[
  {
    "canonicalPageUrl": "https://example.com/case-study/acme",
    "fields": {
      "client": "Acme",
      "industry": null
    }
  }
]
```

Rules:

- Pretty-print with `JSON.stringify(records, null, 2)` semantics.
- Encode as UTF-8 without a byte-order mark.
- Preserve normalized strings exactly.
- Represent a Missing Value as JSON `null`.
- Nest extracted fields under `fields` so user-defined keys cannot collide with `canonicalPageUrl`.
- Never return an empty array successfully; a Run without successful Jobs is ineligible.

## 8. CSV contract

The first column is the system-owned source column:

```text
Canonical Page URL (source)
```

Remaining headers are the configured user-facing Field Labels in position order.

Example:

```csv
Canonical Page URL (source),Client,Industry
https://example.com/case-study/acme,Acme,
```

Rules:

- Use `fast-csv` for formatting. Do not implement a custom CSV serializer.
- Defer API-specific implementation details until the requested `fast-csv` documentation is supplied.
- Encode as UTF-8 with a byte-order mark.
- Use CRLF row endings.
- Preserve normalized strings exactly.
- Represent a Missing Value as an empty cell.
- Apply standards-compliant CSV quoting for commas, quotes, and line breaks.
- Do not neutralize values beginning with spreadsheet formula characters. This is an explicitly accepted initial-version risk.
- The source header cannot collide with a valid Field Label because parentheses are forbidden by Field Label validation.
- Never return a header-only file successfully; a Run without successful Jobs is ineligible.

## 9. Stored-result validation

Before serialization, validate every supposedly successful persisted result against the Run's configured Extraction Fields.

A valid successful result must:

- Be an object.
- Contain exactly the configured Field Keys.
- Contain only `string | null` values.
- Have a non-null value for every Required Extraction Field.

If any successful result is inconsistent:

- Fail the entire download.
- Do not skip the row.
- Do not discard unknown keys silently.
- Do not coerce a missing key to `null`.
- Do not emit a partial file.
- Log identifiers and safe diagnostics only; never log Extraction Result values.

This guards the dataset boundary against corrupted or legacy database state even though normal lifecycle writes already validate results.

## 10. Download API

### 10.1 Endpoint

```text
GET /api/scrape-runs/:runId/extraction-dataset?format=csv
GET /api/scrape-runs/:runId/extraction-dataset?format=json
```

Use one route implementation with a required, explicitly validated `format` query parameter. Do not use `Accept` content negotiation or separate format routes.

### 10.2 Authentication and ownership

Follow the existing Scrape Run route conventions:

- Require the current Better Auth session.
- Parse the authenticated user ID through the existing helper.
- Require `runId` to be a positive safe integer.
- Scope the repository read by both Run ID and owner user ID.
- Return the same `404` for malformed, missing, and non-owned Runs.

Do not fetch individual Scrape Job endpoints. Use one owner-scoped dataset read operation with a fixed number of database queries and no per-Job query loop.

### 10.3 Responses

- `200` — eligible dataset attachment.
- `400` — missing or unsupported format.
- `401` — no authenticated session.
- `404` — malformed Run ID, missing Run, or non-owned Run.
- `409` — owned Run is active or has no successful Jobs.
- `500` — stored successful results are inconsistent or serialization fails.

Errors use the existing safe JSON shape:

```ts
type ScrapeRunApiErrorResponse = {
  error: string
}
```

Do not expose raw exceptions, invalid stored values, provider data, SQL details, or stack traces.

### 10.4 Success headers

CSV:

```text
Content-Type: text/csv; charset=utf-8
```

JSON:

```text
Content-Type: application/json; charset=utf-8
```

Both formats:

```text
Content-Disposition: attachment; filename="<safe filename>"
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

Do not cache immutable terminal datasets because Extraction Results may contain sensitive customer data.

### 10.5 Filename

Use:

```text
<slugified-run-name>-<run-id>.csv
<slugified-run-name>-<run-id>.json
```

Example:

```text
acme-case-studies-42.csv
```

Filename rules:

- Produce a filesystem- and header-safe lowercase slug.
- Collapse separator runs and trim leading/trailing separators.
- Exclude control characters and path separators.
- Include the Run ID so identically named Runs remain distinguishable.
- Fall back to `scrape-run-<run-id>` when sanitization removes the full name.
- Share filename generation between the server response and client download behavior rather than duplicating rules.

## 11. Backend design

Add a focused owner-scoped read projection that returns only what generation needs:

- Run ID.
- Run name.
- Run status.
- Ordered Extraction Field definitions.
- Every `complete` Scrape Job's Canonical Page URL and full Extraction Result.

The repository must:

- Prove ownership in the database query.
- Exclude all non-complete Jobs at query time.
- Return successful Jobs in Canonical Page URL order or provide data that is deterministically sorted before serialization.
- Avoid N+1 queries.
- Return enough state to distinguish not found, active, terminal-without-results, and eligible outcomes.

The route may load the entire eligible dataset and generated file into memory. Do not add streaming, cursors, keyset pagination, batching, temporary files, Workflow steps, or object storage.

No persistence schema or migration is required.

## 12. Frontend design

### 12.1 Placement

Place the **Download dataset** control in the top-right `CardAction` area of the **Scrape Jobs** card on the Scrape Run detail page.

Do not place download controls in:

- The Scrape Run detail header.
- The Scrape Run list.
- Individual Scrape Job pages.

The control is run-wide and must remain visually separate from the status filter so users do not infer that filtering or pagination affects the file.

### 12.2 Available state

For a terminal Run with at least one successful Job, render an enabled dropdown containing:

- **Download CSV**
- **Download JSON**

Include explanatory menu text:

> Includes all N successful results. Failed and cancelled jobs are excluded.

`N` is `run.jobCounts.complete` from the validated Run-detail read model.

### 12.3 Disabled states

Keep the control visible but disabled when unavailable. Wrap the disabled control as needed so the existing shadcn Tooltip remains pointer- and keyboard-discoverable.

Tooltip copy:

- Active Run: **Available when this Scrape Run finishes.**
- Terminal Run with no successful Jobs: **No successful results to download.**

The active-state reason takes precedence even if some Jobs have already succeeded, because partial datasets are forbidden.

### 12.4 Download interaction

After a user selects a format:

1. Close the menu.
2. Enter one shared in-flight state.
3. Disable the download control and prevent another format request.
4. Show a spinner and **Preparing download…**.
5. Fetch the selected endpoint without automatic retries.
6. On success, read the complete response as a Blob.
7. Create a temporary object URL, trigger a same-page browser download with the shared safe filename, and revoke the object URL.
8. Restore the normal control state.

Do not put downloads in SWR cache and do not revalidate Run detail or the Run list after a download. Export is read-only.

### 12.5 Feedback

- Do not show a success toast; the browser download is sufficient feedback.
- On any request, response, Blob, or generation failure, restore the enabled state and show one safe warning toast.
- Reuse the existing safe API-error parsing behavior where practical.
- Do not automatically retry.
- Preserve the rest of the page and its local Job filter/page state.

### 12.6 React constraints

- Do not use `useEffect`.
- Perform Blob creation and cleanup in the user-triggered async handler.
- Keep server-only repository and serializer code out of the client graph.
- Use existing shadcn/ui Button, Dropdown Menu, Tooltip, and Card primitives.

## 13. Privacy, security, and observability

- Treat Extraction Results as private user data.
- Require authentication and owner scoping for every download.
- Return `private, no-store` and `nosniff` headers.
- Sanitize filenames before placing them in `Content-Disposition`.
- Never log file bodies, Extraction Result values, complete datasets, or raw serialization input.
- Structured failure logs may include user-independent diagnostics, Run ID, selected format, record count, duration, and safe failure category.
- Preserve normalized values exactly in both formats.
- CSV formula neutralization is deliberately deferred; JSON remains the lossless alternative but is not presented as a security mitigation.
- Do not persist download events, counts, timestamps, or generated files.

## 14. Accepted performance tradeoff

A Run may contain up to roughly 100,000 Scrape Jobs, and extracted strings have no configured maximum length. This version nevertheless loads all successful results and the generated file into memory.

Explicitly accepted consequences:

- An unusually large download may exceed database-query, function-memory, duration, browser-memory, or response-size limits.
- There is no size estimate, preflight, cap, warning threshold, streaming fallback, asynchronous path, or special oversized-export status.
- Retrying the same oversized download may fail again.
- Such a failure uses the ordinary safe warning toast and server diagnostic logging.

Do not silently introduce truncation, sampling, pagination, or a result cap while implementing this specification.

## 15. Suggested module responsibilities

Exact filenames may follow implementation ergonomics, but keep responsibilities separated:

```text
app/api/scrape-runs/[runId]/extraction-dataset/route.ts
  Session, ID/format parsing, HTTP status mapping, headers, and attachment response.

components/scrape-runs/scrape-job-summary-table.tsx
  Existing Scrape Jobs card and placement of the download control.

components/scrape-runs/download-extraction-dataset.tsx
  Availability, tooltip, format menu, request state, Blob download, and warning toast.

lib/scrape-runs/extraction-dataset.ts
  Client-safe eligibility, filename, paths, and dataset contracts where useful.

lib/server/scrape-runs/extraction-dataset-repository.ts
  Owner-scoped Run, ordered field, and successful-result read projection.

lib/server/scrape-runs/extraction-dataset-serialization.ts
  Stored-result validation plus JSON and fast-csv generation.
```

Avoid a generic export utility layer. This feature exports one domain-specific Extraction Dataset with one explicit contract.

## 16. Testing strategy

Use the existing Vitest projects, database-test infrastructure, Testing Library, MSW, and isolated SWR/frontend setup where applicable. Network tests must not call external providers.

### 16.1 Unit tests

Cover:

- Eligibility for every Run status and successful-job count combination.
- Active Runs remaining ineligible even after one Job succeeds.
- JSON record shaping and Canonical Page URL association.
- Nested fields keyed by Field Key in configured order.
- JSON `null` values and two-space pretty printing.
- Successful-result validation: missing, extra, wrong-typed, and null-required fields.
- Canonical Page URL sorting.
- Safe filename generation, duplicate names, unusual characters, separators, and empty-slug fallback.
- CSV headers, source column, configured Field Label order, and row ordering.
- CSV commas, quotes, CR/LF, multiline values, Unicode, and Missing Values.
- UTF-8 BOM and CRLF output.
- Formula-like CSV values remaining unchanged to document the accepted tradeoff.
- `fast-csv` serialization failures becoming safe generation failures.

### 16.2 Repository integration tests

Cover:

- Owned eligible Run retrieval.
- Missing and non-owned Runs remaining indistinguishable.
- Active, complete, failed, and cancelled Run states.
- Complete Jobs included.
- Failed, cancelled, pending, and in-progress Jobs excluded.
- Terminal Runs with zero complete Jobs represented as ineligible.
- Ordered fields and Canonical Page URL ordering.
- Full results loaded without loading unrelated Runs or Jobs.
- Corrupt successful JSONB result shapes reaching validation and failing the export boundary.

### 16.3 Route tests

Cover:

- CSV and JSON `200` responses.
- `400` for missing and unsupported formats.
- `401` without a session.
- `404` for malformed IDs, missing Runs, and non-owned Runs.
- `409` for Active Runs and terminal Runs without successes.
- `500` for inconsistent stored results and serialization failure.
- Safe error bodies.
- Exact content types, attachment filenames, no-store, and nosniff headers.
- Pretty JSON body shape and successful-only records.
- CSV BOM, headers, values, ordering, and exclusions.
- No Run configuration, lifecycle diagnostics, IDs, provider data, or unsuccessful Job rows in either format.

### 16.4 Frontend component tests

Cover:

- Placement in the Scrape Jobs card action area.
- Disabled Active Run control and tooltip.
- Disabled terminal-zero-success control and tooltip.
- Enabled complete, failed, and cancelled Runs with successful Jobs.
- Menu format options and successful-result count copy.
- Explicit failed/cancelled exclusion copy.
- Downloads remaining independent of status filter and pagination state.
- Correct endpoint for CSV and JSON.
- **Preparing download…**, spinner, disabled state, and duplicate prevention.
- Successful Blob download with the safe filename and object-URL cleanup.
- No success toast and no SWR revalidation.
- Safe warning toast and restored controls on HTTP, network, malformed, or Blob failures.
- Keyboard-discoverable tooltip and format menu behavior.
- No direct `useEffect`.

### 16.5 Excluded verification

Do not add:

- Workflow tests.
- Provider mocks.
- Database migration tests.
- Browser end-to-end tests.

These layers are unaffected by the read-only projection.

## 17. Phased implementation plan

Each phase should leave the repository passing. Do not begin `fast-csv` implementation until its requested API documentation is available.

### Phase 1 — Dataset contracts and owner-scoped read projection

#### Scope

Establish eligibility, file-independent dataset shaping, filename generation, stored-result validation, and database retrieval without adding the route or UI.

#### Deliverables

- Client-safe dataset eligibility and API-path helpers.
- Shared safe filename helper.
- Internal Extraction Dataset record contract.
- Exact successful-result validator against ordered configured fields.
- Owner-scoped repository read for Run identity/state, ordered fields, and complete Jobs only.
- Canonical Page URL ordering.

#### Testing requirements

- Unit tests for eligibility, shaping, validation, ordering, and filenames.
- Repository integration tests for ownership, statuses, successful-only selection, and ordering.
- Corrupt stored-result cases.

#### Exit condition

Tests can load one owned Run and deterministically produce a validated in-memory Extraction Dataset or a precise unavailable/invalid outcome without formatting a file.

### Phase 2 — CSV/JSON generation and download API

#### Scope

Add both serializers and the authenticated attachment endpoint.

#### Deliverables

- Install `fast-csv` with pnpm after its documentation is supplied.
- Pretty JSON generation.
- CSV generation with the agreed BOM, CRLF, headers, Missing Values, and exact-value behavior.
- Extraction Dataset route with format validation, ownership, eligibility, safe errors, and response headers.
- Safe server logging without extracted values.

#### Testing requirements

- Serializer unit tests for every file-contract rule.
- Route tests for both successful formats and all declared error statuses.
- Header, filename, privacy, and unsuccessful-Job exclusion assertions.

#### Exit condition

An authenticated request can download a complete, validated CSV or JSON attachment for an eligible owned Run.

### Phase 3 — Scrape Jobs card interaction

#### Scope

Add the download control and Blob behavior without changing existing table filtering, pagination, polling, or lifecycle behavior.

#### Deliverables

- CardAction download component.
- Disabled-state tooltips.
- CSV/JSON dropdown and successful-result explanatory copy.
- Shared in-flight state and **Preparing download…** feedback.
- Blob download and object-URL cleanup.
- Safe warning toast with no automatic retry.

#### Testing requirements

- Frontend tests for availability, tooltips, menu content, endpoint selection, loading, duplicate prevention, Blob success, cleanup, and failures.
- Regression tests for Job filtering, pagination, polling, and links.

#### Exit condition

A user can download either format from the Scrape Jobs card while unavailable and failure states remain clear and accessible.

### Phase 4 — Integrated hardening

#### Scope

Verify the complete feature against privacy, accessibility, large-content assumptions, and repository-wide quality gates without expanding scope.

#### Deliverables

- Final safe-error and logging review.
- Responsive and keyboard refinements.
- Removal of obsolete mocks or duplicated helpers.
- Documentation in tests of accepted in-memory and CSV formula risks.

#### Testing requirements

- Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
- Manually verify CSV and JSON downloads with Unicode, commas, quotes, multiline values, nulls, and mixed successful/failed Jobs.
- Manually verify enabled, disabled, loading, and warning states with keyboard navigation.

#### Exit condition

All automated suites and manual checks pass, and the feature meets this document without adding streaming, persistence, partial exports, or lifecycle changes.

## 18. Acceptance criteria

The feature is complete when:

1. The root glossary defines Extraction Dataset distinctly from a full Scrape Run archive.
2. Only terminal Runs with at least one complete Job are downloadable.
3. Active Runs cannot export partial results.
4. Failed and cancelled Runs can export preserved successful results.
5. Only `complete` Jobs appear; every other Job status is excluded.
6. Downloads ignore the frontend status filter and pagination page.
7. Records sort by Canonical Page URL and fields use configured position order.
8. JSON uses the agreed nested shape, Field Keys, `null`, UTF-8, and two-space pretty printing.
9. CSV uses the source header, Field Labels, blank Missing Values, UTF-8 BOM, CRLF, and `fast-csv`.
10. CSV preserves formula-like values without neutralization, as explicitly accepted.
11. Inconsistent stored successful results fail the whole download safely.
12. The owner-scoped endpoint supports explicit CSV and JSON format parameters.
13. Authentication, ownership, ID parsing, eligibility, and errors follow the declared HTTP behavior.
14. Successful responses use safe attachment filenames and private no-store headers.
15. The server generates the complete file in memory without streaming, persistence, batching, or background work.
16. Oversized-export failure remains an explicitly accepted limitation with no hidden truncation or cap.
17. The control appears in the Scrape Jobs card header and remains visible when disabled.
18. Disabled controls explain active and zero-success states through accessible tooltips.
19. The enabled menu states the successful-result count and unsuccessful-Job exclusion.
20. The browser fetches one Blob, prevents duplicate generation, and shows **Preparing download…**.
21. Success triggers the browser download without a toast or read-model revalidation.
22. Failure shows one safe warning, restores the control, and never retries automatically.
23. No download events, generated files, or export lifecycle state are persisted.
24. No Extraction Results or complete datasets enter logs or caches.
25. Unit, repository integration, route, frontend, typecheck, and lint verification passes.
