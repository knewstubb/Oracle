import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildDeckPreview,
  type ManaBoxCardFacts,
  type ManaBoxResolver,
} from '@/lib/manabox-import'
import {
  checkImportFile,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_LINES,
  NO_CARDS_MESSAGE,
  TOO_BIG_MESSAGE,
  UNSUPPORTED_FILE_MESSAGE,
} from '@/lib/import-file-guard'
import { buildCommitDeck, computeTotals } from '@/components/manabox-import/types'
import { INITIAL_DEFAULTS } from '@/components/manabox-import/types'

const DIR = resolve(process.cwd(), 'docs/oracle/samples/import-formats')
const fixture = (name: string) => readFileSync(resolve(DIR, name), 'utf8')

function resolver(): ManaBoxResolver {
  const make = (name: string, set: string, cn: string, id: string): ManaBoxCardFacts => ({
    oracleId: `oracle-${id}`,
    scryfallId: `sf-${id}`,
    cardName: name,
    setCode: set,
    collectorNumber: cn,
    layout: 'normal',
    typeLine: 'Artifact',
    availableFinishes: ['nonfoil', 'foil', 'etched'],
  })
  return {
    async resolveByScryfallId() {
      return null
    },
    async resolveBySetCollector(set, cn) {
      return make('Card', set.toLowerCase(), cn, `${set.toLowerCase()}-${cn}`)
    },
    async resolveByName(name) {
      return make(name, 'tst', '1', `name-${name}`)
    },
  }
}

const preview = (name: string, kind: 'csv' | 'text') =>
  buildDeckPreview(
    kind === 'csv' ? { fileName: name, csvContent: fixture(name) } : { fileName: name, textContent: fixture(name) },
    resolver()
  )

const maybeNames = (p: Awaited<ReturnType<typeof preview>>) =>
  p.rows.filter((r) => r.board === 'maybeboard').map((r) => r.cardName)
const mainNames = (p: Awaited<ReturnType<typeof preview>>) =>
  p.rows.filter((r) => r.board !== 'maybeboard').map((r) => r.cardName)

describe('S-5 file guard (§7)', () => {
  it('rejects MTGO .dek XML with the plain-words message, not guessed', () => {
    const result = checkImportFile(fixture('edge-unknown-format.dek'), 'edge-unknown-format.dek')
    expect(result).toMatchObject({ ok: false, reason: 'unsupported', error: UNSUPPORTED_FILE_MESSAGE })
    expect(UNSUPPORTED_FILE_MESSAGE).toBe("This file type isn't supported. Export a text or CSV list.")
  })

  it('rejects XML or JSON content even under a .txt name, and .cod/.dck/.json by name', () => {
    expect(checkImportFile(fixture('edge-unknown-format.dek'), 'deck.txt')).toMatchObject({ reason: 'unsupported' })
    expect(checkImportFile('{"mainboard":{}}', 'deck.txt')).toMatchObject({ reason: 'unsupported' })
    expect(checkImportFile('[{"name":"Sol Ring"}]', 'deck.txt')).toMatchObject({ reason: 'unsupported' })
    for (const name of ['a.cod', 'a.dck', 'a.json']) {
      expect(checkImportFile('1 Sol Ring', name)).toMatchObject({ reason: 'unsupported' })
    }
  })

  it('rejects files over 5 MB or 5,000 lines before parsing', () => {
    expect(checkImportFile('x'.repeat(MAX_IMPORT_BYTES + 1), 'big.txt')).toMatchObject({ reason: 'too_big', error: TOO_BIG_MESSAGE })
    const lines = Array.from({ length: MAX_IMPORT_LINES + 1 }, () => '1 Sol Ring').join('\n')
    expect(checkImportFile(lines, 'long.txt')).toMatchObject({ reason: 'too_big' })
    expect(checkImportFile(Array.from({ length: 4000 }, () => '1 Sol Ring').join('\n'), 'ok.txt')).toMatchObject({ ok: true })
  })

  it('says no cards were found for prose, and accepts text and CSV by content', () => {
    expect(checkImportFile('just some notes\nnothing here', 'notes.txt')).toMatchObject({ ok: false, error: NO_CARDS_MESSAGE })
    expect(checkImportFile(fixture('moxfield-deck.txt'), 'x.csv')).toMatchObject({ ok: true, kind: 'text' })
    expect(checkImportFile(fixture('moxfield-deck.csv'), 'x.txt')).toMatchObject({ ok: true, kind: 'csv' })
  })
})

describe('S-5 one preview per site', () => {
  it('Moxfield text: sideboard and maybeboard cards are maybeboard rows, never main (the §1 fault)', async () => {
    const p = await preview('moxfield-deck.txt', 'text')
    expect(maybeNames(p).sort()).toEqual(['Cyclonic Rift', 'Rhystic Study'])
    expect(p.rows.filter((r) => r.board === 'maybeboard')).toHaveLength(2)
    expect(p.rows.filter((r) => r.board !== 'maybeboard')).toHaveLength(5)
    expect(p.notes?.join(' ')).toMatch(/2 cards are on the maybeboard/)
  })

  it('Archidekt text: Maybeboard and Sideboard tags go to the maybeboard, DFC kept', async () => {
    const p = await preview('archidekt-deck.txt', 'text')
    expect(p.rows.filter((r) => r.board === 'maybeboard').map((r) => r.collectorNumber).sort()).toEqual(['129', '31'])
    expect(mainNames(p)).toContain('Adventurous Eater // Have a Bite'.split(' // ')[0])
  })

  it('MTG Arena: Companion note, sideboard to maybeboard, commander listed', async () => {
    const p = await preview('mtgarena-commander.txt', 'text')
    expect(p.commanders).toEqual([{ name: "Atraxa, Praetors' Voice", scryfallId: 'sf-c16-28' }])
    expect(p.notes?.join(' ')).toMatch(/companion/i)
    expect(p.rows.filter((r) => r.board === 'maybeboard')).toHaveLength(1)
  })

  it('MTGO: SB: lines are maybeboard, the untitled block after them stays main', async () => {
    const p = await preview('mtgo-sb-prefix.txt', 'text')
    expect(maybeNames(p).sort()).toEqual(['Cyclonic Rift', 'Negate'])
    expect(mainNames(p).sort()).toEqual(['Counterspell', 'Island', 'Lightning Bolt', 'Sol Ring'].sort())
  })

  it('MTGGoldfish: a name-only list previews as one of each by name', async () => {
    const p = await preview('mtggoldfish-deck.txt', 'text')
    expect(p.rows.map((r) => [r.cardName, r.qty])).toEqual([
      ['Sol Ring', 1],
      ['Command Tower', 1],
      ['Arcane Signet', 1],
      ['Cultivate', 1],
    ])
    expect(p.rows.every((r) => r.printingGiven === false)).toBe(true)
  })

  it('Deckstats text: //Maybeboard, SB: and the # commander tag', async () => {
    const p = await preview('deckstats-deck.txt', 'text')
    expect(maybeNames(p).sort()).toEqual(['Cultivate', 'Cyclonic Rift', 'Negate'])
    expect(p.commanders?.map((c) => c.name).sort()).toEqual(["Atraxa, Praetors' Voice", 'Rhystic Study'])
  })

  it('Archidekt CSV: commander, main, maybeboard and sideboard', async () => {
    const p = await preview('archidekt-deck.csv', 'csv')
    expect(p.commanders?.map((c) => c.name)).toEqual(["Atraxa, Praetors' Voice"])
    expect(p.rows.filter((r) => r.board === 'maybeboard')).toHaveLength(2)
    expect(p.rows.filter((r) => r.board !== 'maybeboard')).toHaveLength(3)
  })

  it('Moxfield CSV: Tags Proxy label is not a board; every row is main', async () => {
    const p = await preview('moxfield-deck.csv', 'csv')
    expect(p.rows.every((r) => r.board !== 'maybeboard')).toBe(true)
    expect(p.rows).toHaveLength(3)
  })

  it('TappedOut CSV: main / side / maybe / commander', async () => {
    const p = await preview('tappedout-deck.csv', 'csv')
    expect(p.rows.filter((r) => r.board === 'maybeboard')).toHaveLength(2)
    expect(p.commanders?.[0].name).toBe("Atraxa, Praetors' Voice")
  })

  it('Deckbox and Deckstats CSV preview without a printing guess', async () => {
    const box = await preview('deckbox-deck.csv', 'csv')
    expect(box.rows.map((r) => r.cardName)).toEqual(['Sol Ring', 'Cultivate'])
    const stats = await preview('deckstats-deck.csv', 'csv')
    expect(stats.rows).toHaveLength(2)
  })
})

describe('S-5 maybeboard rows follow D-018 / D-022', () => {
  it('the same card in main and maybeboard is two rows with different keys (E-1)', async () => {
    const p = await preview('edge-conflicting-sections.txt', 'text')
    const sol = p.rows.filter((r) => r.cardName === 'Sol Ring')
    expect(sol.map((r) => r.board ?? 'main').sort()).toEqual(['main', 'maybeboard'])
    expect(new Set(sol.map((r) => r.rowKey)).size).toBe(2)
    expect(sol.find((r) => r.board === 'maybeboard')!.rowKey.endsWith('|maybeboard')).toBe(true)
  })

  it('the commit deck carries board and leaves maybeboard cards out of the card count', async () => {
    const p = await preview('moxfield-deck.txt', 'text')
    const deck = buildCommitDeck(p.rows)
    const maybe = deck.cards.filter((c) => 'board' in c)
    expect(maybe).toHaveLength(2)
    expect(deck.cardCount).toBe(p.rows.filter((r) => r.board !== 'maybeboard').reduce((s, r) => s + r.qty, 0))
  })

  it('footer totals add no proxies, unsleeved or foil for maybeboard rows', async () => {
    const p = await preview('moxfield-deck.txt', 'text')
    const withMaybe = computeTotals(p.rows, 'deck', INITIAL_DEFAULTS, {})
    const mainOnly = computeTotals(p.rows.filter((r) => r.board !== 'maybeboard'), 'deck', INITIAL_DEFAULTS, {})
    expect(withMaybe.unsleeved).toBe(mainOnly.unsleeved)
    expect(withMaybe.foil).toBe(mainOnly.foil)
    expect(withMaybe.cards).toBe(mainOnly.cards + 2)
  })

  it('a maybeboard basic land is not a generic row', async () => {
    const p = await buildDeckPreview(
      { fileName: 'x.txt', textContent: 'Maybeboard\n2 Island\n' },
      resolver()
    )
    expect(p.rows[0].board).toBe('maybeboard')
    const totals = computeTotals(p.rows, 'deck', INITIAL_DEFAULTS, {})
    expect(totals.basics).toBe(0)
  })
})
