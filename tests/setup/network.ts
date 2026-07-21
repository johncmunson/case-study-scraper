import "@/lib/envConfig"
import { afterAll, afterEach, aroundEach, beforeAll } from "vitest"
import { server } from "../mocks/server"

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})

// Scope runtime handlers to each test so `server.use()` remains safe in
// concurrent tests.
aroundEach((runTest) => server.boundary(runTest)())

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
