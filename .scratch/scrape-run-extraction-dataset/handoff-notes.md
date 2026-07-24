# Phase 3 handoff notes

Phase 3 was implemented as planned.

- Added the Extraction Dataset download control to the Scrape Jobs card action. Active Runs and terminal Runs without successful results keep a keyboard-discoverable disabled control with the specified tooltip; eligible complete, failed, and cancelled Runs expose CSV and JSON choices with Run-wide result-count copy.
- Added isolated client-side download behavior using the Phase 1 shared path and filename helpers. One in-flight guard covers both formats, the menu closes into **Preparing download…**, successful responses are downloaded as Blobs with object-URL cleanup, and failures restore the control and show one safe warning without retries, SWR caching, or read-model revalidation.
- Added frontend coverage for placement, availability, keyboard interaction, menu copy, endpoint selection, loading/duplicate prevention, safe filenames, Blob handoff and cleanup, safe failure handling, and preservation of filtering/pagination and polling behavior.

There were no material deviations from the plan. The only implementation detail of note was that the current Base UI-backed `DropdownMenuLabel` must be nested in `DropdownMenuGroup`; this was handled without changing the shared UI primitive.

Final verification passed: 576 tests, typecheck, and lint. Phase 4 can focus on the planned integrated privacy, accessibility, responsive, and manual file-content checks; no obsolete mocks or duplicated filename/path logic were introduced in this phase.
