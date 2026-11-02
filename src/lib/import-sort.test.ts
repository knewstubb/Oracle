import { describe, it, expect } from 'vitest'
import { sortImportRows } from './import-sort'

const row = (cardName: string, setCode: string, collectorNumber: string, sourceIndex: number) => ({
  cardName,
  setCode,
  collectorNumber,
  sourceIndex,
})

describe('sortImportRows', () => {
  const rows = [row('Zada', 'a', '1', 1), row('island', 'b', '2', 2), row('Arcane Signet // Back', 'c', '3', 3), row('Island', 'a', '10', 4), row('Island', 'a', '9', 5)]

  it('keeps file order, even when given out of order', () => {
    expect(sortImportRows([...rows].reverse(), 'file').map((r) => r.sourceIndex)).toEqual([1, 2, 3, 4, 5])
  })

  it('sorts by name, case-insensitively, double-faced cards by front name', () => {
    expect(sortImportRows(rows, 'name').map((r) => r.cardName)).toEqual(['Arcane Signet // Back', 'Island', 'Island', 'island', 'Zada'])
  })

  it('breaks ties by set code then collector number (numerically)', () => {
    const sorted = sortImportRows(rows, 'name').filter((r) => r.cardName.toLowerCase() === 'island')
    expect(sorted.map((r) => `${r.setCode}${r.collectorNumber}`)).toEqual(['a9', 'a10', 'b2'])
  })

  it('does not change the input', () => {
    const copy = [...rows]
    sortImportRows(rows, 'name')
    expect(rows).toEqual(copy)
  })
})
