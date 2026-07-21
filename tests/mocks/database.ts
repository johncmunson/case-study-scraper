import { vi } from "vitest"

export type TableQueryMock = {
  findFirst: ReturnType<typeof vi.fn>
  findMany: ReturnType<typeof vi.fn>
}

const tableQueryMocks = new Map<string, TableQueryMock>()

export function getTableQueryMock(tableName: string): TableQueryMock {
  let queryMock = tableQueryMocks.get(tableName)

  if (!queryMock) {
    queryMock = {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    }
    tableQueryMocks.set(tableName, queryMock)
  }

  return queryMock
}

const query = new Proxy({} as Record<string, TableQueryMock>, {
  get: (_target, tableName) =>
    typeof tableName === "string" ? getTableQueryMock(tableName) : undefined,
})

/**
 * Shared unit-test mock for the public Drizzle surface used by the application.
 * Configure these functions directly, or replace the `@/db` mock in a test when
 * a specialized fluent-query mock is more convenient.
 */
export const databaseMock = {
  query,
  select: vi.fn(),
  selectDistinct: vi.fn(),
  selectDistinctOn: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}

export const databasePoolMock = {
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
}
