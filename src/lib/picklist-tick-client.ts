import type { PicklistTickAction, TickResult } from '@/lib/picklist-ticks'

/**
 * Sends one Picklist tick. Throws an Error whose message is the plain sentence to show: the server's own refusal
 * message, or the standard "Couldn't save that" line when the server could not be reached.
 */
export async function sendTick(
  action: PicklistTickAction,
  body: { copyId: number; cardName: string; to: unknown },
): Promise<TickResult> {
  const fallback = `Couldn't save that. ${body.cardName} is still where Oracle had it.`
  const segment = action === 'cant_find' ? 'cant-find' : action
  let res: Response
  try {
    res = await fetch(`/api/picklist/${segment}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyId: body.copyId, to: body.to, cardName: body.cardName }),
    })
  } catch {
    throw new Error(fallback)
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { message?: string }).message || fallback)
  return json as TickResult
}
