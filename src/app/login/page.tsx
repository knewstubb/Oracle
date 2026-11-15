import { LoginForm } from './login-form'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-[length:var(--fs-2xl)] font-medium tracking-tight text-foreground">
            The Oracle
          </h1>
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            Sign in to access your collection and decks
          </p>
        </div>
        <LoginForm next={next} />
      </div>
    </div>
  )
}
