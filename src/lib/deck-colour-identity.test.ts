import { describe, it, expect } from 'vitest'
import { deckColourIdentity, lookupDeckColourIdentity } from './deck-colour-identity'

describe('deckColourIdentity', () => {
  it('turns the card-data text into the stored WUBRG letters', () => {
    expect(deckColourIdentity(['G, R, W'])).toBe('WRG')
  })
  it('unions several commanders', () => {
    expect(deckColourIdentity(['U, B', 'B, R'])).toBe('UBR')
  })
  it('is empty for a colourless or unknown commander', () => {
    expect(deckColourIdentity([''])).toBe('')
    expect(deckColourIdentity([null])).toBe('')
  })
})

function fakeDb(rows: unknown, error: unknown = null) {
  return { from: () => ({ select: () => ({ in: async () => ({ data: rows, error }) }) }) } as never
}

describe('lookupDeckColourIdentity', () => {
  it('returns the identity for the named card', async () => {
    const db = fakeDb([{ name: 'Rocco, Cabaretti Caterer', color_identity: 'G, R, W' }])
    expect(await lookupDeckColourIdentity(db, ['Rocco, Cabaretti Caterer'])).toBe('WRG')
  })
  it('returns null (never a guess) when a card has no data or the lookup fails', async () => {
    expect(await lookupDeckColourIdentity(fakeDb([]), ['Nobody'])).toBeNull()
    expect(await lookupDeckColourIdentity(fakeDb(null, { message: 'x' }), ['Nobody'])).toBeNull()
  })
})
