import { afterAll } from "vitest"
import { pool } from "@/db"

// Vitest gives each isolated integration file its own module graph and Pool.
afterAll(async () => {
  await pool.end()
})
