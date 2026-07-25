import { SignOutButton } from "@/components/auth/sign-out-button"
import { ModeToggle } from "@/components/mode-toggle"

type AppHeaderProps = {
  title: string
}

export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-2">
        <ModeToggle />
        <SignOutButton />
      </div>
    </header>
  )
}
