import { vi } from "vitest"
import "./network"

// Keep unit tests from constructing the real database pool. Application code
// should use the canonical `@/db` import when it needs the database.
vi.mock("@/db", async () => {
  const { databaseMock, databasePoolMock } = await import("../mocks/database")

  return {
    db: databaseMock,
    pool: databasePoolMock,
  }
})
