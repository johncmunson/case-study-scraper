import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { attachDatabasePool } from "@vercel/functions/db-connections"
import { getDatabaseUrl } from "./databaseUrl"
import * as schema from "./schema"

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * DB INITIALIZATION STRATEGY
 * ──────────────────────────────────────────────────────────────────────────────
 * This module creates a pg Pool (or reuses one during development), creates a
 * fresh Drizzle wrapper for the current module instance, and exports both.
 *
 * It has runtime branches keyed by standard NODE_ENV values: development,
 * test, and production. Staging is not a NODE_ENV value; staging deploys run
 * with NODE_ENV=production and APP_ENV=staging, so they receive the same
 * database client behavior as production.
 *
 * 1) DEVELOPMENT (Next.js dev server)
 *    - HMR reloads modules on file changes. Without care, each reload would
 *      create a new Pool (and new DB connections), quickly exhausting the DB.
 *    - In development, we store the Pool on globalThis so module reloads reuse
 *      connections.
 *    - We still create a fresh Drizzle wrapper per module instance so schema-
 *      derived caches do not survive HMR reloads.
 *
 * 2) TEST (automated tests)
 *    - NODE_ENV is typically "test".
 *    - Each isolated Vitest file gets a Pool owned by that file's module graph;
 *      tests do not cache Pools on globalThis because workers can outlive files.
 *    - The database setup file closes that Pool in its file-scoped afterAll hook.
 *    - Tests skip the Vercel Fluid cleanup hook.
 *    - TEST_DATABASE_URL must point at a dedicated test database.
 *
 * 3) PRODUCTION / STAGING (deployed app on Vercel Fluid Compute)
 *    - Modules do not hot-reload. Each instance holds one Pool in memory.
 *    - We call attachDatabasePool(pool) so Fluid can close idle clients cleanly
 *      before the instance is suspended, preventing "leaked" connections.
 *
 * Pool sizing:
 *  - max:   modest numbers (10 in production/staging, 5 elsewhere) to avoid stampeding
 *           the DB, yet allow concurrency per instance.
 *  - idleTimeoutMillis:
 *           short (5s in production/staging, 1s in development/test) so unused clients
 *           are recycled quickly; this works well with Fluid's lifecycle + the
 *           attach helper.
 *
 * Client-side pooling + a provider pooler:
 *  - Using a pg Pool on the client side **and** a provider pooled endpoint from
 *    Neon is safe here because:
 *      a) We always release clients back to the app pool promptly.
 *      b) In production, Fluid's attachDatabasePool ensures idle clients are
 *         closed before suspension (so no lingering "leaks").
 *  - This pattern is portable to other Postgres providers (e.g., RDS). If you
 *    switch later, you typically just swap the relevant database URL.
 *
 * Drizzle casing: { casing: "snake_case" }
 *  - Maps JS identifiers to SQL names in snake_case (e.g., `createdAt` -> `created_at`)
 *    so your TypeScript objects can stay idiomatic while the DB uses conventional
 *    snake_case columns/tables.
 *
 * Further reading:
 *  - Connection Pooling with Vercel Functions
 *    https://vercel.com/guides/connection-pooling-with-functions
 *  - The real serverless compute to database connection problem, solved:
 *    https://vercel.com/blog/the-real-serverless-compute-to-database-connection-problem-solved
 *  - Connect to Neon
 *    https://neon.com/docs/connect/connect-intro
 */

const databaseUrl = getDatabaseUrl()

// Environment flags. Staging intentionally behaves like production here because
// it runs with NODE_ENV=production and APP_ENV=staging.
const isProductionLike = process.env.NODE_ENV === "production"
const isDevelopment = process.env.NODE_ENV === "development"

/**
 * In development, cache the Pool on globalThis so it survives HMR module
 * reloads. Tests intentionally do not use this cache: Vitest setup hooks are
 * file-scoped, while a worker's globalThis can survive between isolated files.
 * Production/staging instances rely on the platform-managed lifecycle instead.
 */
const globalForDb = globalThis as unknown as {
  databasePostgresPool?: Pool
  databaseDrizzleDb?: unknown
}

const poolErrorHandlerAttached = Symbol.for(
  "database.postgres.poolErrorHandlerAttached",
)

type PoolWithErrorHandlerMarker = Pool & {
  [poolErrorHandlerAttached]?: true
}

// pg emits "error" when an idle client disconnects unexpectedly. In local dev
// the Pool survives HMR reloads, so mark the Pool itself to avoid registering
// duplicate listeners across module instances.
function attachPoolErrorHandler(pool: Pool) {
  const markedPool = pool as PoolWithErrorHandlerMarker

  if (markedPool[poolErrorHandlerAttached]) {
    return
  }

  pool.on("error", (error) => {
    console.warn(
      "Postgres pool idle client error. The client was removed from the pool and future queries will open a fresh connection.",
      error,
    )
  })

  markedPool[poolErrorHandlerAttached] = true
}

/**
 * Create or reuse a single pg Pool.
 *
 * Why these values?
 * - max:
 *   - production/staging: 10 -> allows per-instance concurrency without overwhelming the DB.
 *     Fluid can run multiple concurrent requests on one instance; 10 is a sane,
 *     conservative starting point that you can tune later.
 *   - development/test: 5 -> lighter usage; keep it small to avoid noisy neighbors.
 *
 * - idleTimeoutMillis:
 *   - production/staging: 5000 ms -> short enough to free idle clients quickly (good for
 *     elasticity) but long enough to allow rapid reuse under bursty traffic.
 *   - development/test: 1000 ms -> quick recycle during local runs; keeps things
 *     snappy and avoids connection accumulation during frequent restarts.
 *
 * Note: These are sensible defaults, not absolutes. Monitor and tune as needed.
 */
const pool =
  (isDevelopment ? globalForDb.databasePostgresPool : undefined) ??
  new Pool({
    connectionString: databaseUrl,
    max: isProductionLike ? 10 : 5,
    idleTimeoutMillis: isProductionLike ? 5000 : 1000,
  })

attachPoolErrorHandler(pool)

/**
 * Production / staging (Vercel Fluid compute):
 * - attachDatabasePool integrates the pool lifecycle with Fluid.
 * - It ensures idle connections are properly closed before the instance is
 *   suspended, preventing the classic "serverless leaked connections" issue.
 *
 * Development:
 * - We skip it. HMR and repeated local imports are handled by the globalThis
 *   Pool cache.
 *
 * Test:
 * - We skip it. Each isolated test file owns its Pool, which the database setup
 *   closes in that file's afterAll hook.
 */
if (isProductionLike) {
  attachDatabasePool(pool)
}

/**
 * Create a Drizzle instance bound to our Pool and schema.
 *
 * `casing: "snake_case"`:
 * - Drizzle maps JS identifiers to SQL snake_case automatically. This lets your
 *   TS models use camelCase fields while your database uses snake_case columns,
 *   which is conventional in SQL schemas and plays nicely with tools/migrations.
 *
 * Do not cache this wrapper across local module reloads. Drizzle keeps an
 * internal casing cache keyed by table name; if the schema gains a column while
 * the dev server is running, a stale wrapper can try to insert the new column
 * with an undefined SQL name. The wrapper is cheap, while the Pool is the
 * expensive object we need to preserve.
 */
const db = drizzle(pool, { schema, casing: "snake_case" })

/**
 * DEVELOPMENT POOL CACHING
 * - Next.js dev server hot-reloads files on save.
 * - Without this cache, every reload would construct a new Pool -> more TCP
 *   connections -> potential "too many connections".
 * - By stashing the Pool on globalThis, subsequent development imports reuse
 *   the same connections without preserving Drizzle's schema-derived caches.
 * - Tests must not populate this cache because their teardown is file-scoped.
 */
if (isDevelopment) {
  globalForDb.databasePostgresPool = pool
  delete globalForDb.databaseDrizzleDb
}

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * Portability notes (e.g., moving to AWS RDS)
 * ──────────────────────────────────────────────────────────────────────────────
 * - Code stays the same. Swap the environment's database URL to point at your new Postgres host.
 * - If you used a provider pooled URL, another provider may not have that notion;
 *   either:
 *     - use the provider directly (often fine at modest scale), or
 *     - adopt RDS Proxy (or pgbouncer) if you need high connection fan-in.
 * - Keep the same pg Pool and Drizzle usage. Transactions and queries are unchanged.
 * - Migrations: continue to prefer a **direct** (non-pooled) connection for schema
 *   migrations, regardless of provider, to avoid pooling mode quirks.
 */

export { db, pool }
