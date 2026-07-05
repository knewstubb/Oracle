import { getAllPreferences } from '@/lib/generic-land-store'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const preferences = await getAllPreferences()
    return Response.json(preferences)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
