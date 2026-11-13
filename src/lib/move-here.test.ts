import { describe, it, expect } from 'vitest'
import { movableCopies, moveHereErrorMessage, movedToastText, orderMoveHereCopies, type MoveHereCopy } from './move-here'

const c = (over: Partial<MoveHereCopy>): MoveHereCopy => ({ copyId: 1, isProxy: false, deckId: 1, deckName: 'Prosper', deckState: 'assembling', ...over })

describe('orderMoveHereCopies (default pick, spec 19.6)', () => {
  it('puts copies in non-Playable decks before copies in Playable decks', () => {
    const out = orderMoveHereCopies([c({ copyId: 1, deckName: 'Atraxa', deckState: 'playable' }), c({ copyId: 2, deckName: 'Zurgo', deckState: 'draft' })])
    expect(out.map((x) => x.copyId)).toEqual([2, 1])
  })
  it('puts originals before proxies inside the same state', () => {
    const out = orderMoveHereCopies([c({ copyId: 1, isProxy: true, deckName: 'A' }), c({ copyId: 2, deckName: 'Z' })])
    expect(out.map((x) => x.copyId)).toEqual([2, 1])
  })
  it('then sorts by deck name A to Z, then copy id', () => {
    const out = orderMoveHereCopies([c({ copyId: 3, deckName: 'Prosper' }), c({ copyId: 2, deckName: 'Edgar' }), c({ copyId: 1, deckName: 'Edgar' })])
    expect(out.map((x) => x.copyId)).toEqual([1, 2, 3])
  })
  it('example from the spec: Prosper Assembling, Atraxa Playable, Edgar Markov proxy Playable', () => {
    const out = orderMoveHereCopies([
      c({ copyId: 3, deckName: 'Edgar Markov', isProxy: true, deckState: 'playable' }),
      c({ copyId: 2, deckName: 'Atraxa', deckState: 'playable' }),
      c({ copyId: 1, deckName: 'Prosper', deckState: 'assembling' }),
    ])
    expect(out.map((x) => x.deckName)).toEqual(['Prosper', 'Atraxa', 'Edgar Markov'])
  })
  it('does not change the input', () => {
    const input = [c({ copyId: 2, deckName: 'B' }), c({ copyId: 1, deckName: 'A' })]
    orderMoveHereCopies(input)
    expect(input.map((x) => x.copyId)).toEqual([2, 1])
  })
})

describe('movableCopies', () => {
  it('never offers a copy that is already in the target deck', () => {
    const out = movableCopies([c({ copyId: 1, deckId: 5 }), c({ copyId: 2, deckId: 6 })], 5)
    expect(out.map((x) => x.copyId)).toEqual([2])
  })
  it('is empty when every copy is in the target deck', () => {
    expect(movableCopies([c({ deckId: 5 })], 5)).toEqual([])
  })
})

describe('messages', () => {
  it('names the source deck and says it is short by one', () => {
    expect(movedToastText('Prosper', false)).toBe('Moved from Prosper. Prosper is now short by one.')
  })
  it('says a Playable source is now Assembling', () => {
    expect(movedToastText('Atraxa', true)).toBe('Moved from Atraxa. Atraxa is now Assembling.')
  })
  it('gives a plain sentence for every refusal and never leaks the code', () => {
    for (const code of ['already_in_this_deck', 'source_changed', 'copy_missing', 'no_open_slot', 'copy_not_found', 'failed']) {
      const msg = moveHereErrorMessage(code, 'Cultivate', 'Prosper')
      expect(msg).toContain('Cultivate')
      expect(msg).not.toContain('_')
    }
    expect(moveHereErrorMessage('source_changed', 'Cultivate', 'Prosper')).toBe('Cultivate is no longer in Prosper.')
  })
})
