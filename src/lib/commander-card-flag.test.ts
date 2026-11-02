import { describe, it, expect } from 'vitest'
import {
  findCommanderTarget,
  planCommanderFlags,
  findCommanderCards,
  withCommanderSection,
  markCommanderCard,
  type FlagRow,
} from './commander-card-flag'
import { buildDeckSlotFacts, formatDeckSlotFactsForPrompt, type DeckSlotRow } from './deck-chat-facts'

const row = (id: number, name: string, extra: Partial<FlagRow> = {}): FlagRow => ({
  id, card_name: name, categories: '["Creature"]', is_commander: false, command_zone_role: null, ...extra,
})

describe('commander card flag planning', () => {
  it('picks the exact-name main-list card, lowest id, ignoring maybeboard copies', () => {
    const rows = [row(9, 'Mendicant Core, Guidelight', { categories: '["Maybeboard"]' }), row(7, 'Mendicant Core, Guidelight'), row(5, 'Other')]
    expect(findCommanderTarget(rows, 'Mendicant Core, Guidelight')?.id).toBe(7)
    expect(findCommanderTarget(rows, 'mendicant core, guidelight')).toBeNull()
  })

  it('clears the previous primary commander but never partner or companion', () => {
    const rows = [
      row(1, 'Old', { is_commander: true }),
      row(2, 'Partner', { is_commander: true, command_zone_role: 'partner' }),
      row(3, 'Comp', { command_zone_role: 'companion' }),
      row(4, 'New'),
    ]
    expect(planCommanderFlags(rows, 'New')).toEqual({ targetId: 4, clearIds: [1] })
  })

  it('does nothing when the card is not on the list', () => {
    expect(planCommanderFlags([row(1, 'A', { is_commander: true })], 'Nope')).toEqual({ targetId: null, clearIds: [] })
  })
})

describe('findCommanderCards', () => {
  it('uses flagged cards, including partner, never a companion', () => {
    const rows = [row(1, 'A', { is_commander: true }), row(2, 'B', { is_commander: true, command_zone_role: 'partner' }), row(3, 'C', { command_zone_role: 'companion' })]
    expect(findCommanderCards(rows, 'A').map((r) => r.id)).toEqual([1, 2])
  })
  it('falls back to the card matching the commander name on old decks', () => {
    expect(findCommanderCards([row(1, 'A'), row(2, 'M')], 'M').map((r) => r.id)).toEqual([2])
    expect(findCommanderCards([row(1, 'A')], null)).toEqual([])
  })
})

describe('withCommanderSection', () => {
  const groups: [string, { id: number }[]][] = [['Creature', [{ id: 1 }, { id: 2 }]], ['Land', [{ id: 3 }]]]
  it('moves the commander to a Commander group at the top, any group mode', () => {
    expect(withCommanderSection(groups, [{ id: 1 }])).toEqual([['Commander', [{ id: 1 }]], ['Creature', [{ id: 2 }]], ['Land', [{ id: 3 }]]])
  })
  it('drops a group left empty and merges a literal Commander group', () => {
    const g: [string, { id: number }[]][] = [['Commander', [{ id: 9 }]], ['Creature', [{ id: 1 }]]]
    expect(withCommanderSection(g, [{ id: 1 }])).toEqual([['Commander', [{ id: 1 }, { id: 9 }]]])
  })
  it('leaves groups untouched with no commander', () => {
    expect(withCommanderSection(groups, [])).toBe(groups)
  })
})

describe('commander counts once', () => {
  const slot = (id: number, name: string, extra: Partial<DeckSlotRow> = {}): DeckSlotRow => ({
    id, card_name: name, quantity: 1, categories: '["Creature"]', copy_id: null, scryfall_id: null, is_commander: false, is_proxy: null, ...extra,
  })
  const rows = Array.from({ length: 83 }, (_, i) => slot(i + 1, `Card ${i}`)).concat(slot(100, 'Mendicant Core, Guidelight'))

  it('84 rows including the commander is 84 of 100 and the prompt says the commander is included (name fallback)', () => {
    const f = buildDeckSlotFacts(rows, 'custom', 'Mendicant Core, Guidelight')
    expect(f.mainListCount).toBe(84)
    expect(f.emptySlots).toBe(16)
    expect(f.commanderNames).toEqual(['Mendicant Core, Guidelight'])
    expect(formatDeckSlotFactsForPrompt(f)).toContain('already INCLUDES the commander (Mendicant Core, Guidelight)')
  })
  it('flagged commander gives the same count', () => {
    const flagged = rows.map((r) => (r.id === 100 ? { ...r, is_commander: true } : r))
    expect(buildDeckSlotFacts(flagged, 'custom', null).mainListCount).toBe(84)
  })
})

describe('markCommanderCard', () => {
  function fake(rows: FlagRow[]) {
    const updates: Array<{ payload: unknown; ids?: unknown }> = []
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: async () => ({ data: rows, error: null }) }) }),
        update: (payload: unknown) => {
          const u: { payload: unknown; ids?: unknown } = { payload }
          updates.push(u)
          const chain: Record<string, unknown> = {}
          chain.eq = (c: string, v: unknown) => { if (c === 'id') u.ids = v; return chain }
          chain.in = (_c: string, v: unknown) => { u.ids = v; return chain }
          chain.then = (res: (v: unknown) => void) => res({ error: null })
          return chain
        },
      }),
    }
    return { client, updates }
  }

  it('sets the new flag first, then clears the old one', async () => {
    const { client, updates } = fake([row(1, 'Old', { is_commander: true }), row(2, 'New')])
    const res = await markCommanderCard(client, 7, 'u', 'New')
    expect(res.markedId).toBe(2)
    expect(updates).toEqual([
      { payload: { is_commander: true, command_zone_role: null }, ids: 2 },
      { payload: { is_commander: false }, ids: [1] },
    ])
  })
  it('changes nothing when the card is not in the deck', async () => {
    const { client, updates } = fake([row(1, 'Old', { is_commander: true })])
    expect((await markCommanderCard(client, 7, 'u', 'Nope')).markedId).toBeNull()
    expect(updates).toEqual([])
  })
})
