import { describe, it, expect } from 'vitest'
import { listOpenAlerts, resolveAlert, type AlertsClient } from '@/lib/import-alerts'

/** A tiny in-memory fake that records filters and updates. */
function fake(tables: Record<string, Array<Record<string, unknown>>>) {
  const updates: Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }> = []
  const client: AlertsClient = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let patch: Record<string, unknown> | null = null
      const rows = () =>
        (tables[table] ?? []).filter((r) =>
          Object.entries(filters).every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v))
        )
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (p: Record<string, unknown>) => {
          patch = p
          return chain
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v
          return chain
        },
        in: (k: string, v: unknown[]) => {
          filters[k] = v
          return chain
        },
        order: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          if (patch) {
            updates.push({ table, patch, filters: { ...filters } })
            resolve({ error: null })
          } else resolve({ data: rows(), error: null })
        },
      }
      return chain
    },
  }
  return { client, updates }
}

const alert = (over: Record<string, unknown>) => ({
  id: 1, user_id: 'u', deck_id: 5, deck_card_id: 50, copy_id: 900, card_name: 'Sol Ring', caused_by_deck_id: 9, status: 'open', ...over,
})

describe('listOpenAlerts', () => {
  it('returns open alerts for the deck with the causing deck name', async () => {
    const { client, updates } = fake({
      deck_card_alerts: [alert({}), alert({ id: 2, user_id: 'other' }), alert({ id: 3, status: 'dismissed' })],
      deck_cards: [{ id: 50, user_id: 'u', copy_id: 900 }],
      decks: [{ id: 9, user_id: 'u', name: 'Goblins' }],
    })
    const out = await listOpenAlerts(client, 'u', 5)
    expect(out).toEqual([{ id: 1, deckCardId: 50, cardName: 'Sol Ring', causedByDeckId: 9, causedByDeckName: 'Goblins' }])
    expect(updates).toHaveLength(0)
  })

  it('treats an alert as fixed (and marks it) when the copy is no longer in the slot', async () => {
    const { client, updates } = fake({
      deck_card_alerts: [alert({})],
      deck_cards: [{ id: 50, user_id: 'u', copy_id: null }],
      decks: [],
    })
    expect(await listOpenAlerts(client, 'u', 5)).toEqual([])
    expect(updates[0].patch).toMatchObject({ status: 'fixed' })
  })
})

describe('resolveAlert', () => {
  it('404s (false) for another user, and never updates', async () => {
    const { client, updates } = fake({ deck_card_alerts: [alert({})] })
    expect(await resolveAlert(client, 'intruder', 5, 1, 'dismissed')).toBe(false)
    expect(updates).toHaveLength(0)
  })
  it('marks the owner’s alert', async () => {
    const { client, updates } = fake({ deck_card_alerts: [alert({})] })
    expect(await resolveAlert(client, 'u', 5, 1, 'dismissed')).toBe(true)
    expect(updates[0].patch).toMatchObject({ status: 'dismissed' })
  })
})
