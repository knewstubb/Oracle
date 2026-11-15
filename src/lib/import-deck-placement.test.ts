import { describe, it, expect } from 'vitest'
import { planDeckImport, picklistOffer, type PlannerSlot, type PlannerCopy } from './import-deck-placement'

const slot = (id: number, cardName: string, o: Partial<PlannerSlot> = {}): PlannerSlot => ({
  id, cardName, printingId: null, finish: null, copyId: null, isMaybeboard: false, ...o,
})
const copy = (index: number, cardName: string, o: Partial<PlannerCopy> = {}): PlannerCopy => ({
  index, cardName, printingId: null, finish: null, isBasicLand: false, ...o,
})
const commander = { maxCopies: 1 }

describe('planDeckImport', () => {
  it('fills the exact printing and finish slot first', () => {
    const slots = [slot(1, 'Sol Ring', { printingId: 'a' }), slot(2, 'Sol Ring', { printingId: 'b', finish: 'foil' })]
    const plan = planDeckImport(slots, [copy(0, 'Sol Ring', { printingId: 'b', finish: 'foil' })], { maxCopies: 2 })
    expect(plan.outcomes[0]).toEqual({ index: 0, kind: 'filled', slotId: 2, exact: true })
    expect(plan.counts.differsFromPlan).toBe(0)
  })

  it('otherwise fills the lowest-id empty slot and counts the difference', () => {
    const slots = [slot(9, 'Sol Ring', { printingId: 'z' }), slot(4, 'Sol Ring', { printingId: 'y' })]
    const plan = planDeckImport(slots, [copy(0, 'Sol Ring', { printingId: 'a' })], { maxCopies: 2 })
    expect(plan.outcomes[0]).toMatchObject({ kind: 'filled', slotId: 4, exact: false })
    expect(plan.counts.differsFromPlan).toBe(1)
  })

  it('a card the deck does not list becomes a new slot', () => {
    const plan = planDeckImport([], [copy(0, 'Arcane Signet')], commander)
    expect(plan.outcomes[0].kind).toBe('added')
    expect(plan.counts).toMatchObject({ filled: 0, added: 1, unsorted: 0 })
  })

  it('a second copy of a card with one allowed goes to Unsorted as already filled', () => {
    const plan = planDeckImport([], [copy(0, 'Arcane Signet'), copy(1, 'Arcane Signet')], commander)
    expect(plan.outcomes.map((o) => o.kind)).toEqual(['added', 'unsorted'])
    expect(plan.outcomes[1]).toMatchObject({ reason: 'already_filled' })
  })

  it('a card whose slot is already filled goes to Unsorted', () => {
    const plan = planDeckImport([slot(1, 'Sol Ring', { copyId: 7 })], [copy(0, 'Sol Ring')], commander)
    expect(plan.outcomes[0]).toEqual({ index: 0, kind: 'unsorted', reason: 'already_filled' })
  })

  it('a multi-copy format allows new slots up to its limit', () => {
    const plan = planDeckImport([slot(1, 'Bolt', { copyId: 7 })], [copy(0, 'Bolt'), copy(1, 'Bolt'), copy(2, 'Bolt'), copy(3, 'Bolt')], { maxCopies: 4 })
    expect(plan.outcomes.map((o) => o.kind)).toEqual(['added', 'added', 'added', 'unsorted'])
  })

  it('a maybeboard-only card goes to Unsorted', () => {
    const plan = planDeckImport([slot(1, 'Sol Ring', { isMaybeboard: true })], [copy(0, 'Sol Ring')], commander)
    expect(plan.outcomes[0]).toEqual({ index: 0, kind: 'unsorted', reason: 'maybeboard_only' })
  })

  it('a maybeboard copy does not block a main-deck empty slot', () => {
    const plan = planDeckImport([slot(1, 'Sol Ring', { isMaybeboard: true }), slot(2, 'Sol Ring')], [copy(0, 'Sol Ring')], commander)
    expect(plan.outcomes[0]).toMatchObject({ kind: 'filled', slotId: 2 })
  })

  it('a basic land goes to Unsorted unless an empty tracked basic slot exists', () => {
    const plan = planDeckImport(
      [slot(1, 'Forest')],
      [copy(0, 'Forest', { isBasicLand: true }), copy(1, 'Forest', { isBasicLand: true })],
      { maxCopies: 99 }
    )
    expect(plan.outcomes[0]).toMatchObject({ kind: 'filled', slotId: 1 })
    expect(plan.outcomes[1]).toEqual({ index: 1, kind: 'unsorted', reason: 'basic_land' })
  })

  it('matches names ignoring case and spacing', () => {
    const plan = planDeckImport([slot(1, 'sol ring')], [copy(0, ' Sol Ring ')], commander)
    expect(plan.outcomes[0].kind).toBe('filled')
  })

  it('two copies of one card fill two empty slots', () => {
    const plan = planDeckImport([slot(1, 'Bolt'), slot(2, 'Bolt')], [copy(0, 'Bolt'), copy(1, 'Bolt')], { maxCopies: 4 })
    expect(plan.outcomes.map((o) => (o as { slotId: number }).slotId)).toEqual([1, 2])
  })

  it('filled + added + unsorted always equals the copies imported', () => {
    const slots = [slot(1, 'A'), slot(2, 'B', { copyId: 3 }), slot(3, 'C', { isMaybeboard: true })]
    const copies = [copy(0, 'A'), copy(1, 'B'), copy(2, 'C'), copy(3, 'D'), copy(4, 'D'), copy(5, 'Plains', { isBasicLand: true })]
    const { counts, outcomes } = planDeckImport(slots, copies, commander)
    expect(counts.filled + counts.added + counts.unsorted).toBe(copies.length)
    expect(outcomes).toHaveLength(copies.length)
    expect(Object.values(counts.unsortedByReason).reduce((a, b) => a + b, 0)).toBe(counts.unsorted)
  })
})

describe('picklistOffer', () => {
  it('Unsorted offers all', () => expect(picklistOffer('unsorted', 12, 12)).toEqual({ kind: 'all', count: 12 }))
  it('a box or binder offers none', () => expect(picklistOffer('storage', 12, 0)).toEqual({ kind: 'none' }))
  it('a deck offers only what went to Unsorted', () => expect(picklistOffer('deck', 12, 3)).toEqual({ kind: 'some', count: 3 }))
  it('a deck that sent none to Unsorted offers none', () => expect(picklistOffer('deck', 12, 0)).toEqual({ kind: 'none' }))
})
