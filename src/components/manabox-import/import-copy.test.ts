import { describe, it, expect } from 'vitest'
import { intentNotes } from './import-copy'

describe('intentNotes (result lists)', () => {
  it('lists spare copies, cards taken per deck with "now short", and new copies', () => {
    const notes = intentNotes({
      moved: 2,
      alertsCreated: 0,
      needsALook: [],
      usedSpare: ['Sol Ring'],
      taken: [
        { cardName: 'Cultivate', fromDeckId: 7, fromDeckName: 'Elves' },
        { cardName: 'Rampant Growth', fromDeckId: 7, fromDeckName: 'Elves' },
      ],
      newCopies: ['Arcane Signet'],
    })
    expect(notes).toEqual([
      'Used spare copies: Sol Ring.',
      'Taken from Elves: Cultivate, Rampant Growth. Elves is now short 2.',
      'New copies added: Arcane Signet.',
    ])
  })
})
