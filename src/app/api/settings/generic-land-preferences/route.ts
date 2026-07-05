import { getAllPreferences } from '@/lib/generic-land-store'

export async function GET() {
  try {
    const preferences = await getAllPreferences()
    return Response.json(preferences)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
