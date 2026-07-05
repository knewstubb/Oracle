import { describe, it, expect } from 'vitest'
import {
  generateDeckListMarkdown,
  type DeckListCard,
  type DeckListInput,
} from './deck-list-generator'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<DeckListCard> = {}): DeckListCard {
  return {
    cardName: 'Sol Ring',
    category: 'Ramp',
    setCode: 'CMM',
    collectorNumber: '379',
    status: 'Original',
    isCommander: false,
    quantity: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('generateDeckListMarkdown', () => {
  describe('empty deck', () => {
    it('produces "0 cards • 0 proxies" with table structure', () => {
      const input: DeckListInput = { cards: [] }

      const result = generateDeckListMarkdown(input)

      expect(result.totalCards).toBe(0)
      expect(result.proxyCount).toBe(0)
      expect(result.categoryGroups).toEqual([])
      expect(result.markdown).toContain('0 cards • 0 proxies')
      // Table headers are always present
      expect(result.markdown).toContain('| Qty | Card | Category | Set | Status |')
    })
  })

  describe('single card', () => {
    it('produces one category group with a single table row', () => {
      const input: DeckListInput = {
        cards: [makeCard({ cardName: 'Cultivate', category: 'Ramp' })],
      }

      const result = generateDeckListMarkdown(input)

      expect(result.totalCards).toBe(1)
      expect(result.categoryGroups).toHaveLength(1)
      expect(result.categoryGroups[0].name).toBe('Ramp')
      expect(result.categoryGroups[0].cards).toHaveLength(1)
      // Table has one data row (header + separator + 1 data row)
      expect(result.markdown).toContain('| Cultivate |')
    })
  })

  describe('multi-category deck', () => {
    it('sorts categories alphabetically with cards in each group', () => {
      const input: DeckListInput = {
        cards: [
          makeCard({ cardName: 'Swords to Plowshares', category: 'Removal', setCode: 'CMR', collectorNumber: '387' }),
          makeCard({ cardName: 'Sol Ring', category: 'Ramp', setCode: 'CMM', collectorNumber: '379' }),
          makeCard({ cardName: 'Beast Whisperer', category: 'Draw', setCode: 'GRN', collectorNumber: '123' }),
        ],
      }

      const result = generateDeckListMarkdown(input)

      expect(result.totalCards).toBe(3)
      expect(result.categoryGroups).toHaveLength(3)

      // Categories sorted alphabetically: Draw, Ramp, Removal
      expect(result.categoryGroups[0].name).toBe('Draw')
      expect(result.categoryGroups[1].name).toBe('Ramp')
      expect(result.categoryGroups[2].name).toBe('Removal')

      // Summary shows correct totals
      expect(result.markdown).toContain('3 cards • 0 proxies')
    })
  })

  describe('commander override', () => {
    it('places commander card in "Commander" group regardless of assigned category', () => {
      const input: DeckListInput = {
        cards: [
          makeCard({ cardName: 'Rocco, Cabaretti Caterer', category: 'Ramp', isCommander: true, setCode: 'SNC', collectorNumber: '218' }),
          makeCard({ cardName: 'Sol Ring', category: 'Ramp', setCode: 'CMM', collectorNumber: '379' }),
        ],
      }

      const result = generateDeckListMarkdown(input)

      // Commander group is first
      expect(result.categoryGroups[0].name).toBe('Commander')
      expect(result.categoryGroups[0].cards[0].cardName).toBe('Rocco, Cabaretti Caterer')

      // Commander card is NOT in the Ramp group
      const rampGroup = result.categoryGroups.find((g) => g.name === 'Ramp')
      expect(rampGroup).toBeDefined()
      expect(rampGroup!.cards.every((c) => c.cardName !== 'Rocco, Cabaretti Caterer')).toBe(true)
    })

    it('commander group always appears first even with alphabetically earlier categories', () => {
      const input: DeckListInput = {
        cards: [
          makeCard({ cardName: 'Muldrotha, the Gravetide', category: 'Engine', isCommander: true }),
          makeCard({ cardName: 'Beast Whisperer', category: 'Draw' }),
          makeCard({ cardName: 'Animate Dead', category: 'Auras' }),
        ],
      }

      const result = generateDeckListMarkdown(input)

      expect(result.categoryGroups[0].name).toBe('Commander')
      // Remaining groups sorted alphabetically
      expect(result.categoryGroups[1].name).toBe('Auras')
      expect(result.categoryGroups[2].name).toBe('Draw')
    })
  })

  describe('pipe character escaping', () => {
    it('does not escape non-pipe characters like forward slashes', () => {
      const input: DeckListInput = {
        cards: [makeCard({ cardName: 'Fire // Ice', category: 'Removal' })],
      }

      const result = generateDeckListMarkdown(input)

      // Forward slashes are NOT pipes and should not be escaped
      expect(result.markdown).toContain('Fire // Ice')
    })

    it('escapes actual pipe characters to prevent broken tables', () => {
      const input: DeckListInput = {
        cards: [makeCard({ cardName: 'Fire | Ice', category: 'Removal' })],
      }

      const result = generateDeckListMarkdown(input)

      // Pipe should be escaped as \|
      expect(result.markdown).toContain('Fire \\| Ice')
      // The table structure should still have correct column count
      // A properly formatted row has exactly 6 pipe characters (| val | val | val | val | val |)
      const dataRows = result.markdown
        .split('\n')
        .filter((line) => line.includes('Fire'))
      expect(dataRows).toHaveLength(1)

      // Count unescaped pipes - should be 6 (| qty | card | category | set | status |)
      const row = dataRows[0]
      const unescapedPipes = row.replace(/\\\|/g, '').match(/\|/g)
      expect(unescapedPipes).toHaveLength(6)
    })
  })

  describe('proxy count accuracy', () => {
    it('correctly counts proxy cards in summary', () => {
      const input: DeckListInput = {
        cards: [
          makeCard({ cardName: 'Sol Ring', status: 'Original' }),
          makeCard({ cardName: 'Mana Crypt', status: 'Proxy', category: 'Ramp' }),
          makeCard({ cardName: 'Cultivate', status: 'Original' }),
          makeCard({ cardName: 'Beast Whisperer', status: 'Proxy', category: 'Draw' }),
          makeCard({ cardName: 'Swords to Plowshares', status: 'Original', category: 'Removal' }),
        ],
      }

      const result = generateDeckListMarkdown(input)

      expect(result.proxyCount).toBe(2)
      expect(result.totalCards).toBe(5)
      expect(result.markdown).toContain('5 cards • 2 proxies')
    })

    it('reports 0 proxies when all cards are Original', () => {
      const input: DeckListInput = {
        cards: [
          makeCard({ cardName: 'Sol Ring', status: 'Original' }),
          makeCard({ cardName: 'Cultivate', status: 'Original' }),
        ],
      }

      const result = generateDeckListMarkdown(input)

      expect(result.proxyCount).toBe(0)
      expect(result.markdown).toContain('2 cards • 0 proxies')
    })
  })

  describe('alphabetical sorting within groups', () => {
    it('sorts cards alphabetically within the same category', () => {
      const input: DeckListInput = {
        cards: [
          makeCard({ cardName: 'Sol Ring', category: 'Ramp' }),
          makeCard({ cardName: 'Arcane Signet', category: 'Ramp' }),
          makeCard({ cardName: 'Cultivate', category: 'Ramp' }),
          makeCard({ cardName: 'Birds of Paradise', category: 'Ramp' }),
        ],
      }

      const result = generateDeckListMarkdown(input)

      const rampGroup = result.categoryGroups.find((g) => g.name === 'Ramp')!
      const cardNames = rampGroup.cards.map((c) => c.cardName)

      expect(cardNames).toEqual([
        'Arcane Signet',
        'Birds of Paradise',
        'Cultivate',
        'Sol Ring',
      ])
    })

    it('output rows reflect the alphabetical ordering', () => {
      const input: DeckListInput = {
        cards: [
          makeCard({ cardName: 'Zendikar Resurgent', category: 'Ramp' }),
          makeCard({ cardName: 'Arcane Signet', category: 'Ramp' }),
        ],
      }

      const result = generateDeckListMarkdown(input)

      const arcaneIdx = result.markdown.indexOf('Arcane Signet')
      const zendikarIdx = result.markdown.indexOf('Zendikar Resurgent')
      expect(arcaneIdx).toBeLessThan(zendikarIdx)
    })
  })
})

