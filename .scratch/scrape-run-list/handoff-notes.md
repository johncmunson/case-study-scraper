# Phase 1 handoff

- Added runtime-validated Run Summary/list/error contracts plus typed GET and create fetchers in `lib/scrape-runs/api-contracts.ts`. Successful responses are parsed from `unknown`; failures expose only a safe message, optional HTTP status, and optional persisted Scrape Run ID.
- Added pure status, progress/outcome, Target Site hostname, and locale timestamp helpers in `lib/scrape-runs/presentation.ts`.
- Added the dedicated `frontend` jsdom Vitest project, Testing Library/jest-dom setup, existing MSW lifecycle reuse, and `renderWithSwr` for a fresh no-deduplication cache per render. Use `pnpm test:frontend` for this project.
- The visible `/app/scrape-runs` page and existing creation dialog were intentionally unchanged, as required for Phase 1.
- The only unexpected implementation issue was that Zod refinements can still run after the built-in URL check reports an issue; the normalized target-origin refinement therefore handles `new URL()` failures explicitly.
- Review identified that the frontend contract also needed the backend’s public-DNS-hostname guarantee. That browser-safe check now lives in `lib/scrape-runs/public-hostname.ts` and is shared by backend URL normalization and the frontend response schema.
- No plan deviations. Phase 2 can use `SCRAPE_RUNS_API_PATH`, `fetchScrapeRunSummaries`, the inferred summary types, and the presentation helpers directly.

Verification completed: `pnpm test` (all 20 files and 250 tests, including unit, frontend, integration, and Workflow projects), `pnpm typecheck`, and `pnpm lint`.

# Phase 2 handoff

- Added the client-owned SWR read experience in `components/scrape-runs/scrape-runs-view.tsx`, while keeping `app/app/scrape-runs/page.tsx` as a thin Server Component. The existing creation dialog remains unchanged for the Phase 3 mutation migration.
- Added responsive outlined Item presentation, status treatments, active/cancelling spinners, state-aware Scrape Job summaries, accessible determinate progress, semantic locale timestamps, skeletons, empty state, and distinct initial/refresh error states.
- GET requests now retry network and `5xx` failures up to three times with SWR backoff, never retry `4xx`, retain focus/reconnect behavior, and poll every three seconds only while cached data contains an Active Scrape Run. SWR’s error-aware polling loop suspends interval revalidation while a retry is outstanding.
- Added focused component coverage for all list states, statuses, progress/outcomes, manual retry, bounded retries, cached refresh failures, background revalidation, and active-to-terminal polling. Extended `renderWithSwr` only to allow per-test SWR timing overrides while preserving an isolated cache.
- No plan deviations or unexpected product issues. One review suggestion was applied by removing a redundant `isLoading` prop; alert consolidation suggestions were intentionally left alone because the two explicit states are small and clearer than a generic abstraction.

Verification completed: `pnpm test` (all 21 files and 258 tests, including unit, frontend, integration, and Workflow projects), `pnpm typecheck`, and `pnpm lint`.

# Phase 3 handoff

- Migrated creation to `useSWRMutation` on the shared `/api/scrape-runs` key. Validated `201` summaries are prepended and deduplicated through `populateCache` with success revalidation disabled; the inserted pending run naturally starts the existing polling loop.
- Refactored the dialog to receive the mutation callback, `isMutating`, and the derived Active Scrape Run guard. In-flight creation now disables the form and close control, blocks Escape/outside/trigger dismissal, and no longer owns or aborts an `AbortController`.
- Added active-run trigger disabling with a keyboard-focusable tooltip, plus inline protection that preserves an already-open form if polling/revalidation discovers another Active Scrape Run.
- Added reconciliation for `409` and persisted-run `503` failures while leaving ordinary validation/network failures cache-neutral. Typed safe error messages continue to drive warning toasts.
- Added focused integration coverage for raw payloads, pending dismissal locks, success cache insertion/deduplication, polling, reset-on-remount, failure preservation, reconciliation, malformed success data, active discovery, and active-run tooltips.
- No plan deviations. Two small test-environment/control details surfaced: Sonner requires a jsdom `matchMedia` shim, and native fieldset disabling does not propagate to Base UI’s span-based radios, so the radio group is disabled explicitly during mutation.

Verification completed: `pnpm test` (all 22 files and 270 tests, including unit, frontend, integration, and Workflow projects), `pnpm typecheck`, and `pnpm lint`.
