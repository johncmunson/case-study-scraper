import { fileURLToPath } from "node:url"
import { workflow } from "@workflow/vitest"
import { defineConfig } from "vitest/config"

const rootDirectory = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  plugins: [
    workflow({
      rootDir: rootDirectory,
    }),
  ],
  resolve: {
    alias: {
      "@": rootDirectory,
      "server-only": fileURLToPath(
        new URL("./tests/mocks/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    name: "workflow",
    environment: "node",
    include: ["tests/workflow/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: [
      "./tests/setup/network.ts",
      "./tests/setup/integration-database.ts",
    ],
    globalSetup: ["./tests/setup/reset-test-database.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    sequence: { groupOrder: 2 },
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
