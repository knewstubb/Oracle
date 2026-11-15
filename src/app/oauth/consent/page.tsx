import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase-server'
import { isValidAuthorizationId } from '@/lib/connector/consent'
import { Button } from '@/components/ui/button'
import { allowConnection, denyConnection } from './actions'

export const dynamic = 'force-dynamic'

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string; error?: string }> }) {
  const { authorization_id: authorizationId, error } = await searchParams

  let clientName: string | null = null
  if (isValidAuthorizationId(authorizationId)) {
    const supabase = await createAuthServerClient()
    const { data } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
    if (data && 'redirect_url' in data) redirect(data.redirect_url)
    if (data && 'authorization_id' in data) clientName = data.client.name
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-[length:var(--fs-2xl)] font-medium tracking-tight text-foreground">The Oracle</h1>
          {clientName ? (
            <>
              <p className="text-[length:var(--fs-md)] text-foreground">{clientName} is asking to connect.</p>
              <p className="text-[length:var(--fs-md)] text-muted-foreground">
                Claude wants to read your Oracle decks and collection. It can&apos;t change anything.
              </p>
            </>
          ) : (
            <p className="text-[length:var(--fs-md)] text-muted-foreground" role="alert">
              This connection request is not valid any more. Close this page and start again from Claude.
            </p>
          )}
        </div>

        {error && clientName && (
          <p className="text-[length:var(--fs-md)] text-destructive" role="alert">
            That did not work. Nothing was connected. Please try again.
          </p>
        )}

        {clientName && (
          <div className="space-y-2">
            <form action={allowConnection}>
              <input type="hidden" name="authorization_id" value={authorizationId} />
              <Button type="submit" className="w-full" size="lg">Allow</Button>
            </form>
            <form action={denyConnection}>
              <input type="hidden" name="authorization_id" value={authorizationId} />
              <Button type="submit" variant="outline" className="w-full" size="lg">Deny</Button>
            </form>
            <p className="pt-2 text-center text-[length:var(--fs-sm)] text-muted-foreground">
              Didn&apos;t start this? Close this page. Nothing is shared until you allow it.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
