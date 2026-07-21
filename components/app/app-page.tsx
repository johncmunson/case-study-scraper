import type { ReactNode } from "react"

import { AppHeader } from "@/components/app/app-header"

type AppPageProps = {
  children: ReactNode
  title: string
}

export function AppPage({ children, title }: AppPageProps) {
  return (
    <>
      <AppHeader title={title} />
      <main className="py-8">{children}</main>
    </>
  )
}
