import { SignOutButton } from "@/components/auth/sign-out-button"

type AppHeaderProps = {
  title: string
}

export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <SignOutButton />
    </header>
  )
}
