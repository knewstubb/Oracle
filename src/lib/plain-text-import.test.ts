/**
 * Round 12: plain text decklists with NO set codes, through the real text-import path
 * (parse -> resolve by name -> preview rows -> deck write). In-memory only; no database.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/deck-versions', () => ({ createVersionSnapshot: vi.fn(async () => undefined) }))

import { buildDeckPreview, detectManaBoxFile, parseManaBoxText, type ManaBoxCardFacts, type ManaBoxResolver } from '@/lib/manabox-import'
import { importManaBoxDeck } from '@/lib/manabox-deck-import'
import { nameLookupVariants, pickDefaultPrinting, isPromoLikePrinting, type PrintingCandidate } from '@/lib/default-printing'
import type { ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'

const SAMPLE = readFileSync(resolve(process.cwd(), 'docs/oracle/samples/plain-text/no-set-codes.txt'), 'utf8')
const DEFAULTS: ImportDefaults = { finish: 'nonfoil', condition: 'near_mint', language: 'en' }

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe('parseManaBoxText: plain lines', () => {
  it('reads every line of the owner sample, with no printing and no commander line', () => {
    const { lines, badLines } = parseManaBoxText(SAMPLE)
    expect(badLines).toEqual([])
    expect(lines).toHaveLength(12)
    expect(lines.every((l) => l.setCode === '' && l.collectorNumber === '')).toBe(true)
    expect(lines.map((l) => l.cardName)).toEqual([
      'Ghen, Arcanum Weaver',
      'Eiganjo Dynastorian // Replenish',
      'Bitter Reunion',
      'Spirited Companion',
      'Treacherous Blessing',
      'Origin of Thor',
      'The Misty Mountains Cold',
      'Sphere of Safety',
      'Starfield Mystic',
      'Doomwake Giant',
      'Gravebreaker Lamia',
      'Island',
    ])
    expect(lines[11].quantity).toBe(10)
    expect(detectManaBoxFile(SAMPLE)).toBe('text')
  })

  it('keeps a split name with " // " and is not fooled by a line that starts with //', () => {
    const { lines, badLines } = parseManaBoxText("// comment\n1 Fire // Ice\n2x Sol Ring\n1 Urza's Saga\n1 Jaya’s Immolating Inferno")
    expect(badLines).toEqual([])
    expect(lines.map((l) => [l.quantity, l.cardName])).toEqual([
      [1, 'Fire // Ice'],
      [2, 'Sol Ring'],
      [1, "Urza's Saga"],
      [1, 'Jaya’s Immolating Inferno'],
    ])
  })

  it('still reads lines with a full printing and keeps them exact', () => {
    const { lines } = parseManaBoxText('3 Swamp (ZNR) 267\n1 Sol Ring (CMR)')
    expect(lines[0]).toMatchObject({ cardName: 'Swamp', setCode: 'ZNR', collectorNumber: '267' })
    expect(lines[1]).toMatchObject({ cardName: 'Sol Ring', setCode: 'CMR', collectorNumber: '' })
  })

  it('skips a "Deck" heading but reports a line it cannot read', () => {
    const { lines, badLines } = parseManaBoxText('Deck\n1 Sol Ring\nSideboard')
    expect(lines).toHaveLength(1)
    expect(badLines.map((b) => b.rawLine)).toEqual(['Sideboard'])
  })
})

// ---------------------------------------------------------------------------
// Default printing
// ---------------------------------------------------------------------------

function cand(id: string, over: Partial<PrintingCandidate> = {}): PrintingCandidate {
  return {
    scryfallId: id,
    oracleId: 'o1',
    name: 'X',
    setCode: id,
    setName: `Set ${id}`,
    collectorNumber: '1',
    layout: 'normal',
    releasedAt: '2020-01-01',
    digital: false,
    ...over,
  }
}

describe('pickDefaultPrinting', () => {
  it('prefers a printing the owner owns, even if it is older', () => {
    const picked = pickDefaultPrinting(
      [cand('new', { releasedAt: '2025-01-01' }), cand('old', { releasedAt: '2015-01-01' })],
      new Map([['old', 1]])
    )
    expect(picked?.scryfallId).toBe('old')
  })

  it('among owned printings takes the one with most copies, then the newest', () => {
    const list = [cand('a', { releasedAt: '2019-01-01' }), cand('b', { releasedAt: '2021-01-01' }), cand('c', { releasedAt: '2023-01-01' })]
    expect(pickDefaultPrinting(list, new Map([['a', 5], ['b', 2]]))?.scryfallId).toBe('a')
    expect(pickDefaultPrinting(list, new Map([['a', 2], ['b', 2]]))?.scryfallId).toBe('b')
  })

  it('with nothing owned takes the newest regular paper printing, skipping promos and digital', () => {
    const picked = pickDefaultPrinting([
      cand('digital', { releasedAt: '2026-05-01', digital: true }),
      cand('promo', { releasedAt: '2026-04-01', setName: 'Judge Gift Cards 2026' }),
      cand('star', { releasedAt: '2026-03-01', collectorNumber: '12★' }),
      cand('regular', { releasedAt: '2024-01-01' }),
      cand('older', { releasedAt: '2018-01-01' }),
    ])
    expect(picked?.scryfallId).toBe('regular')
  })

  it('falls back to a promo, then digital, when that is all there is; never picks a token over a card', () => {
    expect(pickDefaultPrinting([cand('promo', { setName: 'Promos' })])?.scryfallId).toBe('promo')
    expect(pickDefaultPrinting([cand('d', { digital: true })])?.scryfallId).toBe('d')
    expect(
      pickDefaultPrinting([cand('tok', { layout: 'token', releasedAt: '2026-01-01' }), cand('card', { releasedAt: '2010-01-01' })])?.scryfallId
    ).toBe('card')
    expect(pickDefaultPrinting([])).toBeNull()
  })

  it('never picks a printing that is not released yet while a released one exists', () => {
    const list = [cand('future', { releasedAt: '2027-04-09' }), cand('now', { releasedAt: '2026-10-02' })]
    expect(pickDefaultPrinting(list, new Map(), '2026-10-21')?.scryfallId).toBe('now')
    expect(pickDefaultPrinting([cand('future', { releasedAt: '2027-04-09' })], new Map(), '2026-10-21')?.scryfallId).toBe('future')
  })

  it('breaks a same-day tie with the lowest collector number', () => {
    const list = [cand('b', { collectorNumber: '387', releasedAt: '2026-10-02' }), cand('a', { collectorNumber: '283', releasedAt: '2026-10-02' })]
    expect(pickDefaultPrinting(list, new Map(), '2026-10-21')?.scryfallId).toBe('a')
  })

  it('recognises promo-like printings', () => {
    expect(isPromoLikePrinting({ setName: 'Secret Lair Drop', collectorNumber: '5' })).toBe(true)
    expect(isPromoLikePrinting({ setName: 'Zendikar Rising', collectorNumber: '267' })).toBe(false)
    expect(isPromoLikePrinting({ setName: 'Zendikar Rising', collectorNumber: '267p' })).toBe(true)
  })

  it('straightens apostrophes and finds the front face of a double name', () => {
    expect(nameLookupVariants('Jaya’s  Immolating Inferno')).toEqual({ exact: "Jaya's Immolating Inferno", frontFace: null })
    expect(nameLookupVariants('Fire // Ice')).toEqual({ exact: 'Fire // Ice', frontFace: 'Fire' })
  })
})

// ---------------------------------------------------------------------------
// Preview through the real parse -> resolve -> rows path
// ---------------------------------------------------------------------------

interface Card {
  name: string
  oracle: string
  printings: Array<{ id: string; set: string; num: string; type?: string; layout?: string }>
}

const CARDS: Card[] = [
  { name: 'Ghen, Arcanum Weaver', oracle: 'o-ghen', printings: [{ id: 'ghen-1', set: 'neo', num: '1' }] },
  { name: 'Bitter Reunion', oracle: 'o-bitter', printings: [{ id: 'bitter-1', set: 'mom', num: '2' }] },
  { name: 'Spirited Companion', oracle: 'o-spirit', printings: [{ id: 'spirit-1', set: 'thb', num: '3' }] },
  { name: 'Treacherous Blessing', oracle: 'o-blessing', printings: [{ id: 'bless-1', set: 'cmd', num: '4' }] },
  { name: 'Origin of Thor', oracle: 'o-thor', printings: [{ id: 'thor-1', set: 'msh', num: '5' }] },
  { name: 'The Misty Mountains Cold', oracle: 'o-misty', printings: [{ id: 'misty-1', set: 'ltr', num: '6' }] },
  { name: 'Sphere of Safety', oracle: 'o-sphere', printings: [{ id: 'sphere-1', set: '7ed', num: '7' }] },
  { name: 'Starfield Mystic', oracle: 'o-mystic', printings: [{ id: 'mystic-1', set: 'thb', num: '8' }] },
  { name: 'Doomwake Giant', oracle: 'o-giant', printings: [{ id: 'giant-1', set: 'thb', num: '9' }] },
  { name: 'Gravebreaker Lamia', oracle: 'o-lamia', printings: [{ id: 'lamia-1', set: 'thb', num: '10' }] },
  { name: 'Island', oracle: 'o-island', printings: [{ id: 'island-new', set: 'fdn', num: '280', type: 'Basic Land — Island' }, { id: 'island-old', set: 'm21', num: '264', type: 'Basic Land — Island' }] },
  // The real "Fire // Ice" shape: stored as "Front // Back".
  { name: 'Fire // Ice', oracle: 'o-fire', printings: [{ id: 'fire-1', set: 'mh2', num: '290', layout: 'split' }] },
]

/** A name-based resolver in memory; stands in for the database one (same contract). */
function nameResolver(owned: Map<string, number> = new Map()): ManaBoxResolver {
  const toFacts = (c: Card, p: Card['printings'][number]): ManaBoxCardFacts => ({
    oracleId: c.oracle,
    scryfallId: p.id,
    cardName: c.name,
    setCode: p.set,
    collectorNumber: p.num,
    layout: p.layout ?? 'normal',
    typeLine: p.type ?? 'Creature',
    availableFinishes: ['nonfoil', 'foil'],
  })
  return {
    async resolveByScryfallId() {
      return null
    },
    async resolveBySetCollector() {
      return null
    },
    async resolveByName(name) {
      const { exact, frontFace } = nameLookupVariants(name)
      const card = CARDS.find((c) => c.name.toLowerCase() === exact.toLowerCase()) ?? CARDS.find((c) => c.name.toLowerCase().startsWith(`${(frontFace ?? exact).toLowerCase()} // `))
      if (!card) return null
      const pick = pickDefaultPrinting(
        card.printings.map((p, i) => cand(p.id, { oracleId: card.oracle, name: card.name, setCode: p.set, collectorNumber: p.num, releasedAt: `20${20 + (card.printings.length - i)}-01-01` })),
        owned
      )!
      return toFacts(card, card.printings.find((p) => p.id === pick.scryfallId)!)
    },
  }
}

describe('owner sample through the text-import path', () => {
  it('resolves the real cards by name; the made-up "Eiganjo Dynastorian // Replenish" is the only line left unmatched', async () => {
    const preview = await buildDeckPreview({ fileName: 'no-set-codes.txt', textContent: SAMPLE }, nameResolver())
    expect(preview.totalLines).toBe(12)
    expect(preview.rows).toHaveLength(11) // 10 real cards + the Island row
    expect(preview.unmatched).toHaveLength(1)
    expect(preview.unmatched[0]).toMatchObject({ cardName: 'Eiganjo Dynastorian // Replenish', reason: 'no_card', sourceIndex: 2 })
    expect(preview.rows.map((r) => r.cardName)).toContain('Ghen, Arcanum Weaver')
    // Each row is a real card with the default printing filled in for the review screen.
    const ghen = preview.rows.find((r) => r.cardName === 'Ghen, Arcanum Weaver')!
    expect(ghen).toMatchObject({ scryfallId: 'ghen-1', setCode: 'neo', collectorNumber: '1', qty: 1 })
    expect(ghen.copies).toHaveLength(1)
  })

  it('"10 Island" becomes one basic-land row of 10 copies on the default printing', async () => {
    const preview = await buildDeckPreview({ fileName: 'x.txt', textContent: '10 Island' }, nameResolver())
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0]).toMatchObject({ cardName: 'Island', isBasicLand: true, qty: 10, scryfallId: 'island-new' })
  })

  it('uses the printing the owner owns when there is one', async () => {
    const preview = await buildDeckPreview({ fileName: 'x.txt', textContent: '10 Island' }, nameResolver(new Map([['island-old', 3]])))
    expect(preview.rows[0].scryfallId).toBe('island-old')
  })

  it('finds a split card typed in full or by its front, stored under the front name; fixes capitalisation', async () => {
    const preview = await buildDeckPreview({ fileName: 'x.txt', textContent: '1 Fire // Ice\n1 fire\n1 ghen, arcanum weaver' }, nameResolver())
    expect(preview.unmatched).toEqual([])
    expect(preview.rows.map((r) => r.cardName).sort()).toEqual(['Fire', 'Ghen, Arcanum Weaver'])
    expect(preview.rows.find((r) => r.cardName === 'Fire')!.qty).toBe(2)
  })

  it('names resolve by card identity: two lines for one card combine whatever the default printing is', async () => {
    const preview = await buildDeckPreview({ fileName: 'x.txt', textContent: '1 Bitter Reunion\n2 Bitter Reunion' }, nameResolver())
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0]).toMatchObject({ oracleId: 'o-bitter', qty: 3 })
  })

  it('a resolver that cannot look up names leaves plain lines unmatched instead of failing', async () => {
    const bare: ManaBoxResolver = { resolveByScryfallId: async () => null, resolveBySetCollector: async () => null }
    const preview = await buildDeckPreview({ fileName: 'x.txt', textContent: '1 Sol Ring' }, bare)
    expect(preview.rows).toEqual([])
    expect(preview.unmatched).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Writing: Generic basics on/off for "10 Island"
// ---------------------------------------------------------------------------

function fakeClient(printingRows: Array<Record<string, unknown>>) {
  const rpc: Array<Array<Record<string, unknown>>> = []
  const client = {
    from() {
      return {
        async insert() {
          return { error: null }
        },
        upsert(rows: unknown) {
          const list = (Array.isArray(rows) ? rows : [rows]) as Array<Record<string, unknown>>
          return { select: async () => ({ data: list.map((r, i) => ({ id: i + 1, oracle_id: r.oracle_id })), error: null }) }
        },
        select() {
          return { in: async () => ({ data: printingRows, error: null }) }
        },
      }
    },
    async rpc(_name: string, args: { p_rows: Array<Record<string, unknown>> }) {
      rpc.push(args.p_rows)
      return { data: { success: true, inserted_count: args.p_rows.length }, error: null }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, rpc }
}

describe('saving the plain-text deck', () => {
  async function deck() {
    const preview = await buildDeckPreview({ fileName: 'no-set-codes.txt', textContent: SAMPLE }, nameResolver())
    const cards = preview.rows.map((row) => ({
      cardName: row.cardName,
      scryfallId: row.scryfallId,
      oracleId: row.oracleId,
      setCode: row.setCode,
      collectorNumber: row.collectorNumber,
      quantity: row.qty,
      typeLine: '',
      isCommander: false,
      isProxy: false,
      manaCost: null,
      colorIdentity: [],
      sourceCategories: [],
      rowKey: row.rowKey,
      sourceIndex: row.sourceIndex,
      printingGiven: row.printingGiven,
      copies: row.copies,
    }))
    const printings = CARDS.flatMap((c) =>
      c.printings.map((p) => ({ scryfall_id: p.id, oracle_id: c.oracle, type_line: p.type ?? 'Creature', finishes: ['nonfoil', 'foil'] }))
    )
    return {
      deck: { name: 'D', platform: 'manabox', platformDeckId: 'x', sourceUrl: '', commander: null, cards, cardCount: 20, colourIdentity: '' },
      printings,
    }
  }

  it('plain "10 Island": 10 planned Island slots, no copies; other cards are real copies', async () => {
    const { deck: d, printings } = await deck()
    const { client, rpc } = fakeClient(printings)
    await importManaBoxDeck({ deck: d as never, name: 'D', defaults: DEFAULTS, userId: 'u', supabase: client })
    const rows = rpc[0]
    expect(rows).toHaveLength(20) // 10 single cards + 10 Islands
    const islands = rows.filter((r) => r.card_name === 'Island')
    expect(islands).toHaveLength(10)
    expect(islands.every((r) => r.card_id === null && r.is_maybeboard === true)).toBe(true)
    expect(rows.filter((r) => r.card_name !== 'Island').every((r) => r.card_id !== null && r.is_maybeboard === false)).toBe(true)
  })
})
