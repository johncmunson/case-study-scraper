import { requireSession } from "@/auth/session"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await requireSession()

  return (
    <div className="min-h-dvh bg-muted/25 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </div>
  )
}
