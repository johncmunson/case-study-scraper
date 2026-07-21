import path from "node:path"
import type { TestProject } from "vitest/node"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"
import "../../lib/envConfig"
import { getDatabaseUrl } from "../../db/databaseUrl"

async function resetTestDatabase() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Refusing to reset a database outside NODE_ENV=test.")
  }

  const pool = new Pool({
    connectionString: getDatabaseUrl({ preferUnpooled: true }),
    max: 1,
  })

  try {
    // Dropping both schemas clears application data and Drizzle's migration
    // journal, ensuring every integration run applies all migrations afresh.
    await pool.query('DROP SCHEMA IF EXISTS "public" CASCADE')
    await pool.query('DROP SCHEMA IF EXISTS "drizzle" CASCADE')
    await pool.query('CREATE SCHEMA "public"')

    await migrate(drizzle(pool), {
      migrationsFolder: path.join(process.cwd(), "db/migrations"),
    })
  } finally {
    await pool.end()
  }
}

export async function setup(project: TestProject) {
  await resetTestDatabase()
  project.onTestsRerun(resetTestDatabase)
}
