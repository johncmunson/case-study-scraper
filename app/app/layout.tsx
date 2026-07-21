import { requireSession } from "@/auth/session"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await requireSession()

  return <main>{children}</main>
}
