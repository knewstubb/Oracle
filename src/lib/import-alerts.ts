/**
 * Alerts raised when an import skipped a move (contract import-intent §6, slice S6).
 * The deck that lost the claim shows "this slot's copy is also in <deck>" until the owner fixes it or dismisses it.
 * Every query is filtered by the owner's id. Writes touch only `deck_card_alerts` (status), never copies or slots.
 */

import type { AlertAction } from '@/lib/import-alerts-types'

/** Minimal loose client (the generated types do not know the table yet; tests inject a fake). */
export interface AlertsClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface OpenAlert {
  id: number
  deckCardId: number
  cardName: string
  causedByDeckId: number | null
  causedByDeckName: string | null
}

/** Open alerts for one deck. An alert whose copy has already left the slot is marked fixed and not returned. */
export async function listOpenAlerts(client: AlertsClient, userId: string, deckId: number): Promise<OpenAlert[]> {
  const { data, error } = await client
    .from('deck_card_alerts')
    .select('id, deck_card_id, copy_id, card_name, caused_by_deck_id')
    .eq('user_id', userId)
    .eq('deck_id', deckId)
    .eq('status', 'open')
    .order('id')
  if (error) throw new Error(error.message)
  const alerts = (data ?? []) as Array<{
    id: number
    deck_card_id: number
    copy_id: number | null
    card_name: string
    caused_by_deck_id: number | null
  }>
  if (alerts.length === 0) return []

  const slots = await client
    .from('deck_cards')
    .select('id, copy_id')
    .eq('user_id', userId)
    .in('id', alerts.map((a) => a.deck_card_id))
  if (slots.error) throw new Error(slots.error.message)
  const copyBySlot = new Map<number, number | null>(
    ((slots.data ?? []) as Array<{ id: number; copy_id: number | null }>).map((s) => [s.id, s.copy_id])
  )

  const stale = alerts.filter((a) => copyBySlot.get(a.deck_card_id) !== a.copy_id)
  if (stale.length > 0) {
    const upd = await client
      .from('deck_card_alerts')
      .update({ status: 'fixed', resolved_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', stale.map((a) => a.id))
    if (upd.error) throw new Error(upd.error.message)
  }
  const staleIds = new Set(stale.map((a) => a.id))
  const live = alerts.filter((a) => !staleIds.has(a.id))

  const causeIds = [...new Set(live.map((a) => a.caused_by_deck_id).filter((v): v is number => v !== null))]
  const names = new Map<number, string>()
  if (causeIds.length > 0) {
    const decks = await client.from('decks').select('id, name').eq('user_id', userId).in('id', causeIds)
    if (decks.error) throw new Error(decks.error.message)
    for (const d of (decks.data ?? []) as Array<{ id: number; name: string }>) names.set(d.id, d.name)
  }
  return live.map((a) => ({
    id: a.id,
    deckCardId: a.deck_card_id,
    cardName: a.card_name,
    causedByDeckId: a.caused_by_deck_id,
    causedByDeckName: a.caused_by_deck_id !== null ? (names.get(a.caused_by_deck_id) ?? null) : null,
  }))
}

/** Mark one alert fixed or dismissed. Returns false when it is not the owner's (the route answers 404). */
export async function resolveAlert(
  client: AlertsClient,
  userId: string,
  deckId: number,
  alertId: number,
  action: AlertAction
): Promise<boolean> {
  const found = await client
    .from('deck_card_alerts')
    .select('id')
    .eq('id', alertId)
    .eq('user_id', userId)
    .eq('deck_id', deckId)
    .eq('status', 'open')
    .maybeSingle()
  if (found.error) throw new Error(found.error.message)
  if (!found.data) return false
  const upd = await client
    .from('deck_card_alerts')
    .update({ status: action, resolved_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('user_id', userId)
  if (upd.error) throw new Error(upd.error.message)
  return true
}
