import type { ReactNode } from "react"

import { AppHeader } from "@/components/app/app-header"

type AppPageProps = {
  children: ReactNode
}

export function AppPage({ children }: AppPageProps) {
  return (
    <>
      <AppHeader />
      <main className="py-8">{children}</main>
    </>
  )
}
