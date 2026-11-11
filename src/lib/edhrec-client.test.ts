import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  commanderSlug,
  fetchEdhrecJson,
  getAverageDeck,
  getCommanderPage,
  parseAverageDeck,
  parseCommanderPage,
  toEdhrecSlug,
  EdhrecUnavailableError,
} from './edhrec-client'

const FIX = join(__dirname, '__fixtures__', 'edhrec')
const load = (f: string) => JSON.parse(readFileSync(join(FIX, f), 'utf8'))

const noSleep = async () => {}
function reply(status: number, body: unknown = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

describe('slugs', () => {
  it('uses the front face of a double-faced commander', () => {
    expect(toEdhrecSlug('Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel')).toBe('sephiroth-fabled-soldier')
    expect(commanderSlug(['Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel'])).toBe('sephiroth-fabled-soldier')
  })

  it('joins partners in alphabetical order, whichever is listed first', () => {
    expect(commanderSlug(['Tymna the Weaver', 'Thrasios, Triton Hero'])).toBe('thrasios-triton-hero-tymna-the-weaver')
    expect(commanderSlug(['Thrasios, Triton Hero', 'Tymna the Weaver'])).toBe('thrasios-triton-hero-tymna-the-weaver')
  })

  it('strips accents and apostrophes, and gives null with no commander', () => {
    expect(toEdhrecSlug('Mendicant Core, Guidelight')).toBe('mendicant-core-guidelight')
    expect(toEdhrecSlug('Séance Board')).toBe('seance-board')
    expect(toEdhrecSlug("Atraxa, Grand Unifier's")).toBe('atraxa-grand-unifiers')
    expect(commanderSlug([])).toBeNull()
  })
})

describe('parseCommanderPage (saved real JSON)', () => {
  const page = parseCommanderPage(load('commander-mendicant-core-guidelight.json'))

  it('reads type counts as whole numbers from the top level', () => {
    expect(page.typeCounts.land).toBe(34)
    expect(page.typeCounts.creature).toBe(27)
    expect(Number.isInteger(page.typeCounts.artifact)).toBe(true)
  })

  it('reads the deck sample from container.json_dict.card.num_decks', () => {
    expect(page.numDecks).toBe(17659)
  })

  it('works out inclusion as num_decks / potential_decks (there is no inclusion field)', () => {
    expect(page.cards.length).toBeGreaterThan(100)
    for (const c of page.cards) {
      expect(c.inclusion).toBeGreaterThanOrEqual(0)
      expect(c.inclusion).toBeLessThanOrEqual(1)
      if (c.potentialDecks > 0) expect(c.inclusion).toBeCloseTo(c.numDecks / c.potentialDecks, 10)
    }
  })

  it('leaves out land lists and the repeated Top/New Cards lists, with no duplicates', () => {
    const headers = new Set(page.cards.map((c) => c.header.toLowerCase()))
    for (const h of ['lands', 'utility lands', 'top cards', 'new cards']) expect(headers.has(h)).toBe(false)
    expect(new Set(page.cards.map((c) => c.name)).size).toBe(page.cards.length)
  })

  it('never throws on odd input', () => {
    expect(parseCommanderPage(null)).toEqual({ numDecks: null, cards: [], allCards: [], typeCounts: {} })
  })
})

describe('parseAverageDeck (saved real JSON)', () => {
  it('reads commanders, quantities and the deck sample', () => {
    const d = parseAverageDeck(load('average-deck-mendicant-core-guidelight.json'))
    expect(d.commanders).toEqual(['Mendicant Core, Guidelight'])
    expect(d.numDecks).toBe(17659)
    expect(d.typeCounts.land).toBe(34)
    expect(d.basicCount).toBe(16)
    // The commander is not in the card list: 99 cards.
    expect(d.cards.reduce((n, c) => n + c.quantity, 0)).toBe(99)
  })

  it('sums quantities of the same name across groups', () => {
    const json = { deck: { commander: ['X'], cards: { Lands: [['Island', 10]], Basics: [['Island', 5], ['Forest', 2]] } } }
    const d = parseAverageDeck(json)
    expect(d.cards.find((c) => c.name === 'Island')?.quantity).toBe(15)
  })

  it('reads a partner pair', () => {
    expect(parseAverageDeck(load('average-deck-thrasios-tymna.json')).commanders).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver'])
  })
})

describe('fetchEdhrecJson', () => {
  it('treats 404 and 403 (EDHREC answers 403 for an unknown slug) as not found', async () => {
    for (const status of [404, 403]) {
      const f = vi.fn(async () => reply(status, '<Error><Code>AccessDenied</Code></Error>'))
      await expect(fetchEdhrecJson('commanders/zzz.json', { fetch: f as unknown as typeof fetch, sleep: noSleep })).resolves.toEqual({ status: 'not_found' })
      expect(f).toHaveBeenCalledTimes(1)
    }
  })

  it('retries 429 and 5xx, then succeeds', async () => {
    const answers = [reply(429), reply(503), reply(200, { ok: 1 })]
    const f = vi.fn(async () => answers.shift()!)
    await expect(fetchEdhrecJson('x.json', { fetch: f as unknown as typeof fetch, sleep: noSleep })).resolves.toEqual({ status: 'ok', data: { ok: 1 } })
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('gives up after the retries with EdhrecUnavailableError', async () => {
    const f = vi.fn(async () => reply(500))
    await expect(fetchEdhrecJson('x.json', { fetch: f as unknown as typeof fetch, sleep: noSleep })).rejects.toBeInstanceOf(EdhrecUnavailableError)
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('a network failure throws EdhrecUnavailableError (never "not found")', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(fetchEdhrecJson('x.json', { fetch: f as unknown as typeof fetch, sleep: noSleep })).rejects.toBeInstanceOf(EdhrecUnavailableError)
  })

  it('never calls the real EDHREC from tests', async () => {
    await expect(fetchEdhrecJson('commanders/atraxa.json')).rejects.toThrow('not called from tests')
  })

  it('asks for the right files and parses them', async () => {
    const urls: string[] = []
    const f = vi.fn(async (url: string) => {
      urls.push(url)
      return reply(200, url.includes('average-decks') ? load('average-deck-hearthhull-the-worldseed.json') : load('commander-sephiroth-fabled-soldier.json'))
    })
    const t = { fetch: f as unknown as typeof fetch, sleep: noSleep }
    const avg = await getAverageDeck('hearthhull-the-worldseed', t)
    const page = await getCommanderPage('sephiroth-fabled-soldier', t)
    expect(urls).toEqual([
      'https://json.edhrec.com/pages/average-decks/hearthhull-the-worldseed.json',
      'https://json.edhrec.com/pages/commanders/sephiroth-fabled-soldier.json',
    ])
    expect(avg.status === 'ok' && avg.data.typeCounts.land).toBe(41)
    expect(page.status === 'ok' && page.data.numDecks).toBe(32531)
  })

  it('a redirect-only reply is not this commander', async () => {
    const f = vi.fn(async () => reply(200, { redirect: '/commanders/other' }))
    await expect(getCommanderPage('old-name', { fetch: f as unknown as typeof fetch, sleep: noSleep })).resolves.toEqual({ status: 'not_found' })
  })
})
