import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            The Oracle
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your collection and decks
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
