import { integer, timestamp } from "drizzle-orm/pg-core"

export function identityPrimaryKey() {
  return integer().primaryKey().generatedAlwaysAsIdentity({ startWith: 1000 })
}

export function createdAt() {
  return timestamp({ withTimezone: true }).defaultNow().notNull()
}

export function updatedAt() {
  return timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull()
}
