import { describe, it, expect } from 'vitest'
import { deckToCsv, deckCsvFileName } from './deck-to-csv'
import { parseManaBoxCsv } from './manabox-import'
import type { NormalizedCard } from './deck-normalizer'

function card(over: Partial<NormalizedCard>): NormalizedCard {
  return {
    cardName: 'Sol Ring',
    scryfallId: 'abc',
    oracleId: 'o',
    setCode: 'cmm',
    collectorNumber: '400',
    quantity: 1,
    typeLine: 'Artifact',
    isCommander: false,
    isProxy: false,
    manaCost: null,
    colorIdentity: [],
    sourceCategories: [],
    ...over,
  }
}

describe('deckToCsv', () => {
  const csv = deckToCsv({
    cards: [card({}), card({ cardName: 'Korvold, Fae-Cursed King', isCommander: true }), card({ cardName: 'Proxy Card', isProxy: true })],
    maybeboard: [card({ cardName: 'Maybe, "Quoted"' })],
  })

  it('marks the commander and maybeboard cards in the Board column', () => {
    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('Board')
    expect(lines[2]).toMatch(/,Commander,/)
    expect(lines[4]).toMatch(/,Maybeboard,/)
    expect(lines[4]).toContain('"Maybe, ""Quoted"""')
  })

  it('is read by the shared review parser with boards intact', () => {
    const rows = parseManaBoxCsv(csv).records.map((r) => r.row)
    expect(rows.filter((r) => r.board === 'maybeboard')).toHaveLength(1)
    expect(rows.filter((r) => r.board === 'commander')).toHaveLength(1)
    expect(rows.find((r) => r.name === 'Proxy Card')?.proxy).toBe(true)
  })

  it('names the file after the deck', () => {
    expect(deckCsvFileName('My: Deck/1')).toBe('My Deck 1.csv')
    expect(deckCsvFileName('')).toBe('Imported Deck.csv')
  })
})
