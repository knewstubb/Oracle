import { describe, it, expect } from 'vitest'
import {
  isRowUnresolved,
  partitionRowsByOwnership,
  normalizeInstanceState,
} from '@/lib/import-reconciliation'
import type { ConflictPrintingRow } from '@/types/import-reconciliation'

function makeRow(
  ownership: ConflictPrintingRow['ownership'],
  resolved: boolean
): ConflictPrintingRow {
  return {
    cardName: 'Sol Ring',
    printingId: 'scryfall-1',
    oracleId: 'oracle-1',
    setCode: '2XM',
    setName: 'Double Masters',
    collectorNumber: '270',
    finish: null,
    imageUriSmall: null,
    imageUriNormal: null,
    imageUriLarge: null,
    owned: 1,
    availableSupply: 0,
    ownedAnyPrinting: 1,
    freeProxies: 0,
    claimedBy: [],
    ownership,
    printingMismatch: false,
    overAllocated: !resolved && ownership === 'owned',
    resolved,
    instances: [],
    alternatePrintings: [],
  }
}

describe('isRowUnresolved', () => {
  it('returns true for unresolved rows', () => {
    expect(isRowUnresolved(makeRow('owned', false))).toBe(true)
  })

  it('returns false for resolved rows', () => {
    expect(isRowUnresolved(makeRow('owned', true))).toBe(false)
  })
})

describe('partitionRowsByOwnership', () => {
  it('splits rows by ownership', () => {
    const owned = makeRow('owned', false)
    const unowned = makeRow('unowned', false)
    const result = partitionRowsByOwnership([owned, unowned, owned])
    expect(result.owned).toHaveLength(2)
    expect(result.unowned).toHaveLength(1)
  })
})

describe('normalizeInstanceState', () => {
  it('normalizes legacy and canonical states', () => {
    expect(normalizeInstanceState('sleeved')).toBe('sleeved')
    expect(normalizeInstanceState('sleeve')).toBe('sleeved')
    expect(normalizeInstanceState('proxy')).toBe('proxy')
    expect(normalizeInstanceState('planned')).toBe('planned')
    expect(normalizeInstanceState('release')).toBe('planned')
    expect(normalizeInstanceState(null)).toBe('planned')
  })
})
