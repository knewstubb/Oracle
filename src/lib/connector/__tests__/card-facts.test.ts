import { describe, it, expect } from 'vitest'
import { fetchCardFacts, legalityOf, PRICE_LABEL, FACTS_NAME_BATCH } from '../tools/card-facts'
import { mockDb, type RecordedQuery } from './mock-db'

const U = 'user-1'
type Lib = Record<string, { type: string; text?: string; cost?: string; mv?: number; ci?: string; legal?: boolean }>

const LIB: Lib = {
  'Sol Ring': { type: 'Artifact', text: 'Tap: Add {C}{C}.', cost: '{1}', mv: 1, ci: '', legal: true },
  'Bonecrusher Giant // Stomp': { type: 'Creature — Giant // Instant — Adventure', text: 'x'.repeat(400), cost: '{2}{R} // {1}{R}', mv: 3, ci: 'R', legal: true },
  'Black Lotus': { type: 'Artifact', text: 'Sacrifice: add three mana.', cost: '{0}', mv: 0, ci: '', legal: false },
  'Some Silver Card': { type: 'Creature', text: 'Silly.', cost: '{1}', mv: 1, ci: '', legal: false },
}
const BANNED = new Set(['Black Lotus'])
const PRICES: Record<string, number> = { 'Sol Ring': 1.5 }

function inList(q: RecordedQuery): string[] {
  return (q.filters.find((f) => f.op === 'in')?.args[1] as string[]) ?? []
}

function library(extra?: (q: RecordedQuery) => unknown) {
  return mockDb((q) => {
    if (extra) {
      const e = extra(q)
      if (e) return e as never
    }
    if (q.table === 'ref_cards') {
      const ilike = q.filters.find((f) => f.op === 'ilike')
      const toRow = (name: string) => {
        const c = LIB[name]
        return { name, type_line: c.type, oracle_text: c.text ?? null, mana_cost: c.cost ?? null, mana_value: c.mv ?? null, color_identity: c.ci ?? '', commander_legal: c.legal ?? true }
      }
      if (ilike) {
        const front = (ilike.args[1] as string).replace(' // %', '')
        return { data: Object.keys(LIB).filter((n) => n.startsWith(`${front} // `)).slice(0, 1).map(toRow) }
      }
      return { data: inList(q).filter((n) => LIB[n]).map(toRow) }
    }
    if (q.table === 'ref_printings') {
      if (q.columns === 'name') return { data: inList(q).filter((n) => BANNED.has(n)).map((name) => ({ name })) }
      return { data: inList(q).filter((n) => PRICES[n] != null).map((name) => ({ name, price_usd: PRICES[name], digital: false, updated_at: '2026-11-15T00:00:00Z' })) }
    }
    return { data: [] }
  })
}

describe('fetchCardFacts', () => {
  it('exact match carries type, cost, value, colours, rules text, legality and an estimate label', async () => {
    const { db } = library()
    const m = await fetchCardFacts({ db, userId: U }, ['Sol Ring'], { includeRulesText: true })
    expect(m.get('sol ring')).toEqual({
      available: true, typeLine: 'Artifact', manaCost: '{1}', manaValue: 1, colorIdentity: '', rulesText: 'Tap: Add {C}{C}.',
      legality: 'legal', price: { usd: 1.5, label: PRICE_LABEL },
    })
  })

  it('a deck row holding only the front face finds the double-faced card, and rules text is cut at 300', async () => {
    const { db } = library()
    const m = await fetchCardFacts({ db, userId: U }, ['Bonecrusher Giant'], { includeRulesText: true })
    const f = m.get('bonecrusher giant')!
    expect(f.available).toBe(true)
    expect(f.typeLine).toMatch(/^Creature/)
    expect(f.rulesText!.length).toBe(300)
    expect(f.rulesText!.endsWith('…')).toBe(true)
  })

  it('a name not in the library is unavailable with everything null, never guessed', async () => {
    const { db } = library()
    const m = await fetchCardFacts({ db, userId: U }, ['Totally Made Up'], { includeRulesText: true })
    expect(m.get('totally made up')).toEqual({
      available: false, typeLine: null, manaCost: null, manaValue: null, colorIdentity: null, rulesText: null,
      legality: 'unknown', price: { usd: null, label: PRICE_LABEL },
    })
  })

  it('banned and not legal are told apart; legal cards never ask the printings table about bans', async () => {
    const { db, queries } = library()
    const m = await fetchCardFacts({ db, userId: U }, ['Sol Ring', 'Black Lotus', 'Some Silver Card'], { includeRulesText: false })
    expect(m.get('black lotus')!.legality).toBe('banned')
    expect(m.get('some silver card')!.legality).toBe('not_legal')
    expect(m.get('sol ring')!.legality).toBe('legal')
    const banQuery = queries.find((q) => q.table === 'ref_printings' && q.columns === 'name')!
    expect(inList(banQuery).sort()).toEqual(['Black Lotus', 'Some Silver Card'])
  })

  it('no known price is null, never zero', async () => {
    const { db } = library()
    const m = await fetchCardFacts({ db, userId: U }, ['Black Lotus'], { includeRulesText: false })
    expect(m.get('black lotus')!.price).toEqual({ usd: null, label: PRICE_LABEL })
  })

  it('rules text is left out unless asked for', async () => {
    const { db } = library()
    const m = await fetchCardFacts({ db, userId: U }, ['Sol Ring'], { includeRulesText: false })
    expect('rulesText' in m.get('sol ring')!).toBe(false)
  })

  it('250 names go out in batches, one lookup per batch, not one per card', async () => {
    const names = Array.from({ length: 250 }, (_, i) => `Card ${i}`)
    const { db, queries } = library()
    const m = await fetchCardFacts({ db, userId: U }, names, { includeRulesText: false })
    expect(m.size).toBe(250)
    const cardQueries = queries.filter((q) => q.table === 'ref_cards' && q.filters.some((f) => f.op === 'in'))
    expect(cardQueries.length).toBe(Math.ceil(250 / FACTS_NAME_BATCH))
    for (const q of cardQueries) expect(inList(q).length).toBeLessThanOrEqual(FACTS_NAME_BATCH)
  })

  it('prices already loaded by the caller are used without a second price lookup', async () => {
    const { db, queries } = library()
    const m = await fetchCardFacts({ db, userId: U }, ['Sol Ring'], { includeRulesText: false, prices: new Map([['sol ring', 9]]) })
    expect(m.get('sol ring')!.price.usd).toBe(9)
    expect(queries.some((q) => q.table === 'ref_printings')).toBe(false)
  })

  it('a database error is thrown, not turned into "unavailable"', async () => {
    const { db } = mockDb(() => ({ error: { message: 'down' } }))
    await expect(fetchCardFacts({ db, userId: U }, ['Sol Ring'], { includeRulesText: false })).rejects.toThrow()
  })

  it('legalityOf covers the library answer', () => {
    expect(legalityOf(true, false)).toBe('legal')
    expect(legalityOf(false, true)).toBe('banned')
    expect(legalityOf(false, false)).toBe('not_legal')
    expect(legalityOf(null, false)).toBe('unknown')
  })
})
