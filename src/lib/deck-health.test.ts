import { describe, it, expect } from 'vitest'
import { roleState, composeHealthCopy, buildDeckHealth, countRoles, GENERAL_GUIDE, type HealthDeckCard } from './deck-health'
import { loadDeckHealth, type HealthClient } from './deck-health-server'

describe('roleState (Light = 2 or more short)', () => {
  it('8 typical: 7 is fine, 6 is light', () => {
    expect(roleState(7, 8)).toBe('ok')
    expect(roleState(6, 8)).toBe('light')
  })
  it('6 typical: 6 fine, 3 light', () => {
    expect(roleState(6, 6)).toBe('ok')
    expect(roleState(3, 6)).toBe('light')
  })
  it('typical 1 is never light', () => {
    expect(roleState(0, 1)).toBe('ok')
  })
  it('over the typical count is fine', () => {
    expect(roleState(20, 8)).toBe('ok')
  })
})

describe('composeHealthCopy', () => {
  const mk = (ramp: number, draw: number, removal: number, wipes: number) =>
    (['ramp', 'draw', 'removal', 'wipes'] as const).map((role, i) => {
      const have = [ramp, draw, removal, wipes][i]
      return { role, have, typical: GENERAL_GUIDE[role], state: roleState(have, GENERAL_GUIDE[role]) }
    })

  it('says Well covered with no suffix', () => {
    const c = composeHealthCopy({ roles: mk(10, 10, 6, 2), usingGeneralGuide: true })
    expect(c.headline).toBe('Well covered')
  })
  it('names the two biggest gaps', () => {
    const c = composeHealthCopy({ roles: mk(10, 5, 1, 2), usingGeneralGuide: true })
    expect(c.headline).toBe('Light on draw and removal (general guide)')
    expect(c.subline).toContain('short')
  })
})

describe('buildDeckHealth', () => {
  const card = (name: string, typeLine: string, oracleText: string | null, quantity = 1): HealthDeckCard => ({
    cardName: name,
    quantity,
    typeLine,
    oracleText,
    inMainDeck: true,
  })

  it('counts removal from real text and labels the general guide', () => {
    const cards = Array.from({ length: 6 }, (_, i) => card(`Kill ${i}`, 'Instant', 'Destroy target creature.'))
    const h = buildDeckHealth(cards)
    expect(h.roles.find((r) => r.role === 'removal')?.have).toBe(6)
    expect(h.sourceLine).toBe('General guide')
    expect(h.strategy.text).toMatch(/Not set yet/)
  })

  it('three removal is light', () => {
    const cards = Array.from({ length: 3 }, (_, i) => card(`Kill ${i}`, 'Instant', 'Destroy target creature.'))
    expect(buildDeckHealth(cards).roles.find((r) => r.role === 'removal')?.state).toBe('light')
  })

  it('does not count lands or off-list cards', () => {
    const cards = [card('Forest', 'Basic Land — Forest', null, 30), { ...card('X', 'Instant', 'Destroy target creature.'), inMainDeck: false }]
    const r = countRoles(cards)
    expect(r.have.removal).toBe(0)
    expect(r.have.lands).toBe(30)
    expect(r.unclassifiedCount).toBe(0)
  })

  it('counts lands from the front-face type line, including double-faced lands, and is Light at 2+ short', () => {
    const cards = [
      card('Forest', 'Basic Land — Forest', null, 30),
      card('Command Tower', 'Land', null, 1),
      card('Shatterskull Smashing // Shatterskull, the Hammer Pass', 'Sorcery // Land', null, 1),
      card('Bala Ged Recovery // Bala Ged Sanctuary', 'Sorcery // Land', null, 1),
    ]
    const h = buildDeckHealth(cards)
    const lands = h.roles.find((r) => r.role === 'lands')!
    expect(lands.typical).toBe(36)
    expect(lands.have).toBe(31) // the two spell-front double-faced cards are not lands
    expect(lands.state).toBe('light')
    expect(h.roles).toHaveLength(5)
  })

  it('35 lands is fine, 34 is Light', () => {
    expect(buildDeckHealth([card('Forest', 'Basic Land — Forest', null, 35)]).roles.find((r) => r.role === 'lands')?.state).toBe('ok')
    expect(buildDeckHealth([card('Forest', 'Basic Land — Forest', null, 34)]).roles.find((r) => r.role === 'lands')?.state).toBe('light')
  })

  it('is partial when over 10% of the deck has no card text', () => {
    const cards = [card('Ghost', 'Creature', null, 20), card('Kill', 'Instant', 'Destroy target creature.', 80)]
    expect(buildDeckHealth(cards).checkState).toBe('partial')
    const few = [card('Ghost', 'Creature', null, 5), card('Kill', 'Instant', 'Destroy target creature.', 95)]
    expect(buildDeckHealth(few).checkState).toBe('full')
  })
})

// A fake client. Never the live database.
function fakeClient(opts: {
  deck: { id: number } | null
  deckCards?: unknown[]
  refs?: unknown[]
  fail?: 'deck_cards' | 'ref_cards'
}) {
  const calls: Array<{ table: string; eq: Array<[string, unknown]> }> = []
  const client: HealthClient = {
    from(table: string) {
      const rec = { table, eq: [] as Array<[string, unknown]> }
      calls.push(rec)
      const result = () => {
        if (table === 'decks') return { data: opts.deck, error: null }
        if (table === 'deck_cards') return opts.fail === 'deck_cards' ? { data: null, error: { message: 'boom' } } : { data: opts.deckCards ?? [], error: null }
        return opts.fail === 'ref_cards' ? { data: null, error: { message: 'boom' } } : { data: opts.refs ?? [], error: null }
      }
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (col: string, val: unknown) => {
        rec.eq.push([col, val])
        return chain
      }
      chain.in = () => Promise.resolve(result())
      chain.ilike = () => chain
      chain.limit = () => Promise.resolve(result())
      chain.maybeSingle = () => Promise.resolve(result())
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res)
      return chain
    },
  }
  return { client, calls }
}

describe('loadDeckHealth', () => {
  it('filters the deck by owner and returns 404 for someone else\'s deck', async () => {
    const { client, calls } = fakeClient({ deck: null })
    const r = await loadDeckHealth(client, 5, 'user-b')
    expect(r).toMatchObject({ ok: false, status: 404 })
    expect(calls[0].eq).toContainEqual(['user_id', 'user-b'])
  })

  it('passes real card text to the classifier', async () => {
    const { client } = fakeClient({
      deck: { id: 5 },
      deckCards: [{ card_name: 'Swords to Plowshares', quantity: 1, categories: null, is_commander: false, command_zone_role: null }],
      refs: [{ name: 'Swords to Plowshares', type_line: 'Instant', oracle_text: 'Exile target creature. Its controller gains life equal to its power.' }],
    })
    const r = await loadDeckHealth(client, 5, 'u')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.health.roles.find((x) => x.role === 'removal')?.have).toBe(1)
  })

  it('returns 500, not a green result, when a read fails', async () => {
    for (const fail of ['deck_cards', 'ref_cards'] as const) {
      const { client } = fakeClient({
        deck: { id: 5 },
        deckCards: [{ card_name: 'A', quantity: 1, categories: null, is_commander: false, command_zone_role: null }],
        fail,
      })
      const r = await loadDeckHealth(client, 5, 'u')
      expect(r).toMatchObject({ ok: false, status: 500 })
    }
  })
})
