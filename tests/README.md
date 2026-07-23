# Tests

Backend tests run in Vitest's Node environment. Frontend tests use a dedicated
jsdom project. Network requests are blocked unless they have an MSW handler.

## Conventions

- Unit: `tests/unit/**/*.{test,spec}.{ts,tsx}`
- Frontend: `tests/frontend/**/*.{test,spec}.{ts,tsx}`
- Integration: `tests/integration/**/*.{test,spec}.{ts,tsx}`

Vitest only discovers tests under `tests/`; production source directories do
not contain test files.

Unit tests receive an automatic mock for the canonical `@/db` module. Configure
it through `databaseMock`, `databasePoolMock`, or `getTableQueryMock` from
`tests/mocks/database.ts`. A test can replace that module mock when it needs a
more specialized fluent Drizzle mock.

Frontend tests use Testing Library with jest-dom matchers and automatic cleanup.
Use `renderWithSwr` from `tests/frontend/render.tsx` for an isolated SWR cache
with request deduplication disabled.

Add network handlers per test:

```ts
import { http, HttpResponse } from "msw"
import { server } from "@/tests/mocks/server"

server.use(
  http.get("https://example.com/data", () => HttpResponse.json({ ok: true })),
)
```

Integration runs require `TEST_DATABASE_URL` (and optionally
`TEST_DATABASE_URL_UNPOOLED`) in `.env.test.local`. **This must be a dedicated,
disposable database.** Before the suite and every watch-mode rerun, its `public`
and `drizzle` schemas are dropped and all migrations are reapplied. Integration
test files run serially because they share this database.

## Commands

```sh
pnpm test                 # all tests
pnpm test:unit            # unit only
pnpm test:frontend        # frontend/jsdom only
pnpm test:integration     # integration only
pnpm test:coverage        # all tests with coverage
```
