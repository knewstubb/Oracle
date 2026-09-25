import { describe, it, expect } from 'vitest'
import {
  buildRollupRows,
  type UserCardMeta,
} from '@/lib/allocation-rollup'
import type { EnrichedSupplyEntry } from '@/lib/allocation-candidates'

function entry(overrides: Partial<EnrichedSupplyEntry> = {}): EnrichedSupplyEntry {
  return {
    physicalCopyId: 1,
    cardId: 1,
    printingId: 'printing-1',
    finish: 'nonfoil',
    isProxy: false,
    condition: 'near_mint',
    locationId: 1,
    locationName: 'Box',
    assignedTo: null,
    ...overrides,
  }
}

const solRing: UserCardMeta = {
  cardName: 'Sol Ring',
  oracleId: 'oracle-sol-ring',
  typeLine: 'Artifact',
}

describe('buildRollupRows', () => {
  it('counts owned, proxy and allocated copies from enriched supply', () => {
    const supply = new Map<string, EnrichedSupplyEntry[]>([
      [
        'Sol Ring',
        [
          entry({ physicalCopyId: 1, isProxy: false, assignedTo: null }),
          entry({ physicalCopyId: 2, isProxy: false, assignedTo: { deckCardsId: 9, deckId: 5, deckName: 'Deck A' } }),
          entry({ physicalCopyId: 3, isProxy: true, assignedTo: null }),
        ],
      ],
    ])

    const rows = buildRollupRows([solRing], supply, new Map([['Sol Ring', 4]]))

    expect(rows).toEqual([
      {
        oracleId: 'oracle-sol-ring',
        cardName: 'Sol Ring',
        ownedCount: 2,
        proxyCount: 1,
        allocatedCount: 1,
        shortfall: 2,
        typeLine: 'Artifact',
      },
    ])
  })

  it('never returns a negative shortfall', () => {
    const supply = new Map<string, EnrichedSupplyEntry[]>([
      ['Sol Ring', [entry(), entry({ physicalCopyId: 2 })]],
    ])

    const rows = buildRollupRows([solRing], supply, new Map([['Sol Ring', 1]]))

    expect(rows[0].shortfall).toBe(0)
  })

  it('treats missing demand as zero', () => {
    const supply = new Map<string, EnrichedSupplyEntry[]>([['Sol Ring', [entry()]]])

    const rows = buildRollupRows([solRing], supply, new Map())

    expect(rows[0].shortfall).toBe(0)
  })

  it('omits card names with no physical copies, matching the old rollup view', () => {
    const supply = new Map<string, EnrichedSupplyEntry[]>([['Sol Ring', []]])

    const rows = buildRollupRows([solRing], supply, new Map([['Sol Ring', 3]]))

    expect(rows).toEqual([])
  })

  it('deduplicates repeated card names, keeping the first oracle/typeLine', () => {
    const duplicate: UserCardMeta = {
      cardName: 'Sol Ring',
      oracleId: 'oracle-sol-ring-reprint',
      typeLine: 'Artifact — Reprint',
    }
    const supply = new Map<string, EnrichedSupplyEntry[]>([['Sol Ring', [entry()]]])

    const rows = buildRollupRows([solRing, duplicate], supply, new Map())

    expect(rows).toHaveLength(1)
    expect(rows[0].oracleId).toBe('oracle-sol-ring')
    expect(rows[0].typeLine).toBe('Artifact')
  })
})
