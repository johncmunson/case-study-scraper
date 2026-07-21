import "@/lib/envConfig"
import { defineConfig } from "drizzle-kit"
import { getDatabaseUrl } from "@/db/databaseUrl"

const databaseUrl = getDatabaseUrl({ preferUnpooled: true })

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: databaseUrl,
  },
})
