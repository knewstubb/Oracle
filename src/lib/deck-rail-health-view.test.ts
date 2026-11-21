import { describe, it, expect } from 'vitest'
import { buildDeckHealth, type DeckHealthResponse } from './deck-health'
import { referenceLine } from './deck-rail-health-view'

const withSample = (h: DeckHealthResponse, available: boolean, sample: number | null): DeckHealthResponse => ({ ...h, reference: { available, label: 'No EDHREC average for this commander', sample } })
const h = buildDeckHealth([])

describe('referenceLine', () => {
  it('shows the small-sample note at 999 decks and not at 1,000', () => {
    const a = referenceLine(withSample(h, true, 999))
    expect(a.text).toBe('EDHREC average for reference · 999 decks')
    expect(a.smallSample).toBe(true)
    const b = referenceLine(withSample(h, true, 1000))
    expect(b.text).toBe('EDHREC average for reference · 1,000 decks')
    expect(b.smallSample).toBe(false)
  })
  it('has no small-sample note when there is no average or no count', () => {
    expect(referenceLine(withSample(h, false, null))).toMatchObject({ text: 'No EDHREC average for this commander', smallSample: false })
    expect(referenceLine(withSample(h, true, null))).toMatchObject({ text: 'EDHREC average for reference', smallSample: false })
  })
})
