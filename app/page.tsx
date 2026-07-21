import Link from "next/link"

export default function LandingPage() {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Link
        href="/sign-in"
        className="text-sm font-medium underline underline-offset-4"
      >
        Sign in
      </Link>
    </main>
  )
}
