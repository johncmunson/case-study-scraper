import { setupServer } from "msw/node"

/** Add per-test handlers with `server.use(...)`. */
export const server = setupServer()
