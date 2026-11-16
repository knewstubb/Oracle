import { describe, it, expect } from 'vitest'
import {
  TICK_ACTION_BY_SEGMENT,
  codeFromRoutineError,
  parseTickBody,
  readTickResult,
  tickErrorMessage,
  tickErrorStatus,
  tickToastText,
  toRoutineTarget,
} from './picklist-ticks'
import { excludeSlotsWithOpenItems, itemGroup, type DeckMoveItem } from './picklist-move-items'

describe('parseTickBody', () => {
  it('accepts a deck target with a planned slot', () => {
    expect(parseTickBody({ copyId: 5, cardName: ' Sol Ring ', to: { kind: 'deck', deckId: 2, deckCardId: 9 } })).toEqual({
      copyId: 5, cardName: 'Sol Ring', to: { kind: 'deck', deckId: 2, deckCardId: 9 },
    })
  })
  it('accepts a box target and defaults the card name', () => {
    expect(parseTickBody({ copyId: 5, to: { kind: 'location', locationId: 3 } })).toEqual({
      copyId: 5, cardName: 'that card', to: { kind: 'location', locationId: 3 },
    })
  })
  it.each([
    null, 'x', {}, { copyId: 0, to: { kind: 'deck', deckId: 1 } }, { copyId: 1.5, to: { kind: 'deck', deckId: 1 } },
    { copyId: '5', to: { kind: 'deck', deckId: 1 } }, { copyId: 5 }, { copyId: 5, to: { kind: 'planet' } },
    { copyId: 5, to: { kind: 'deck', deckId: -1 } }, { copyId: 5, to: { kind: 'deck', deckId: 1, deckCardId: 'a' } },
    { copyId: 5, to: { kind: 'location' } },
  ])('refuses an unusable body %#', (b) => {
    expect(parseTickBody(b)).toBeNull()
  })
})

describe('routine input and answers', () => {
  it('maps URL segments to routine actions', () => {
    expect(TICK_ACTION_BY_SEGMENT).toEqual({ found: 'found', placed: 'placed', 'cant-find': 'cant_find' })
  })
  it('builds the routine target', () => {
    expect(toRoutineTarget({ kind: 'deck', deckId: 1, deckCardId: 2 })).toEqual({ kind: 'deck', deckId: 1, deckCardId: 2 })
    expect(toRoutineTarget({ kind: 'deck', deckId: 1 })).toEqual({ kind: 'deck', deckId: 1 })
    expect(toRoutineTarget({ kind: 'location', locationId: 3 })).toEqual({ kind: 'location', locationId: 3 })
  })
  it('finds the routine code inside a database message, else failed', () => {
    expect(codeFromRoutineError('ERROR: no_open_slot')).toBe('no_open_slot')
    expect(codeFromRoutineError('P0001: copy_missing')).toBe('copy_missing')
    expect(codeFromRoutineError('connection reset')).toBe('failed')
    expect(codeFromRoutineError(null)).toBe('failed')
  })
  it('gives every code a plain message that names the card and never says Unowned', () => {
    for (const code of ['copy_not_found', 'copy_missing', 'target_not_found', 'wrong_state', 'no_open_slot', 'already_in_this_deck', 'not_in_hand', 'copy_already_in_open_item', 'failed']) {
      const m = tickErrorMessage(code, 'Sol Ring')
      expect(m).toContain('Sol Ring')
      expect(m).not.toMatch(/unowned/i)
    }
    expect(tickErrorStatus('copy_not_found')).toBe(404)
    expect(tickErrorStatus('no_open_slot')).toBe(409)
    expect(tickErrorStatus('failed')).toBe(500)
  })
  it('reads a success and refuses anything else', () => {
    expect(readTickResult({ success: true, item_id: 4, state: 'found', source_deck_now_short: [{ deckId: 1, deckName: 'Prosper', cardName: 'Sol Ring' }] }))
      .toMatchObject({ itemId: 4, state: 'found', unchanged: false, sourceDeckNowShort: [{ deckName: 'Prosper' }] })
    expect(readTickResult({ success: true, state: 'missing', unchanged: true }).unchanged).toBe(true)
    expect(() => readTickResult({ success: false })).toThrow()
    expect(() => readTickResult(null)).toThrow()
  })
  it('words the toast after each tick, naming the deck left short', () => {
    const found = readTickResult({ success: true, item_id: 1, state: 'found', source_deck_now_short: [{ deckId: 1, deckName: 'Prosper', cardName: 'Sol Ring' }] })
    expect(tickToastText('found', 'Sol Ring', found)).toBe('Sol Ring is in your hand. Prosper is now short by one.')
    expect(tickToastText('placed', 'Sol Ring', found, 'Korvold')).toBe('Sol Ring placed in Korvold.')
    expect(tickToastText('cant_find', 'Sol Ring', found)).toBe('Sol Ring flagged Missing.')
  })
})

const item = (over: Partial<DeckMoveItem>): DeckMoveItem => ({
  itemId: 1, state: 'found', copyId: 10, deckCardsId: 100, cardName: 'Sol Ring', isProxy: false, from: null, ...over,
})

describe('saved steps for a deck', () => {
  it('takes slots with a step out of the normal grouping and leaves the rest', () => {
    const cards = [{ deckCardsId: 100 }, { deckCardsId: 101 }]
    expect(excludeSlotsWithOpenItems(cards, [item({})])).toEqual([{ deckCardsId: 101 }])
    expect(excludeSlotsWithOpenItems(cards, [])).toEqual(cards)
    expect(excludeSlotsWithOpenItems(cards, [item({ deckCardsId: null })])).toEqual(cards)
  })
  it('keeps a row in the group it came from', () => {
    expect(itemGroup(item({ from: { kind: 'deck', deckId: 3, name: 'Prosper' } }))).toBe('needsMoving')
    expect(itemGroup(item({ from: { kind: 'box', name: 'Box A' } }))).toBe('available')
    expect(itemGroup(item({ from: null }))).toBe('available')
  })
})
