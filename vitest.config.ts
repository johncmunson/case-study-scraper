import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const rootDirectory = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDirectory,
    },
  },
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      exclude: ["tests/**", "components/ui/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [`tests/unit/**/*.{test,spec}.{ts,tsx}`],
          setupFiles: ["./tests/setup/unit.ts"],
          mockReset: true,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [`tests/integration/**/*.{test,spec}.{ts,tsx}`],
          setupFiles: [
            "./tests/setup/network.ts",
            "./tests/setup/integration-database.ts",
          ],
          globalSetup: ["./tests/setup/reset-test-database.ts"],
          // Integration files share one database, so run them serially.
          fileParallelism: false,
        },
      },
    ],
  },
})
