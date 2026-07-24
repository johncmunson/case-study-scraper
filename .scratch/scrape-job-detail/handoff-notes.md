# Phase 1 handoff notes

Phase 1 was completed as planned. The existing owner-scoped Scrape Job detail repository query now returns the parent Scrape Run identity and ordered Extraction Field projection in the same focused query; it does not load sibling Scrape Jobs or unrelated Run Configuration. The nested route remains additive and keeps the existing private `404` behavior.

The client-safe contract now exports `getScrapeJobDetailApiPath`, `scrapeJobDetailSchema`, `ScrapeJobDetail`, and `fetchScrapeJobDetail(url, expectedRunId, expectedJobId)`. The fetcher validates the entire response before returning it and treats route-ID mismatches as the same safe invalid-response error as any other malformed `200`.

No unexpected implementation issues or deviations from the Phase 1 plan were encountered. Focused repository, route, and contract tests cover ownership/nested membership, field ordering and privacy, serialization and errors, lifecycle/result invariants, diagnostics, and route-ID matching. Phase 2 can build its SWR fetcher closure directly around the new API path builder and validated fetcher.

# Phase 2 handoff notes

Phase 2 was completed as planned. The nested page now has a thin route, shared route/client skeleton, and a focused SWR view that polls active Jobs every three seconds, preserves cached content for recoverable refresh failures, clears unavailable detail after a background `404`, and leaves parent read-model requests and caches untouched. Navigation, the complete-Job heading derivation, Canonical Page URL, lifecycle status, attempts, timestamps, Retry controls, and pending/in-progress/cancelled content are in place.

No unexpected issues or deviations from the plan were encountered. Phase 3 can replace the intentionally concise complete and failed lifecycle Cards with the detailed ordered Extraction Result and sanitized failure components; the surrounding header, warning, cache, and polling structure should not need to change.
