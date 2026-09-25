import { describe, it, expect } from 'vitest'
import {
  resolveAllocationState,
  shouldDisplayAllocation,
  countAllocationStates,
  ALLOCATION_STATE_ACCENTS,
} from './import-allocation-state'

describe('resolveAllocationState', () => {
  it('trusts the server state field when present', () => {
    expect(resolveAllocationState({ owned: 1, sleeved: 4, state: 'over' })).toBe('over')
    expect(resolveAllocationState({ owned: 0, sleeved: 1, state: 'unowned' })).toBe('unowned')
    expect(resolveAllocationState({ owned: 4, sleeved: 2, state: 'resolved' })).toBe('resolved')
  })

  it('prefers the server state field over a stale overAllocated flag', () => {
    // v1 payloads computed overAllocated without the unowned carve-out; a server
    // that knows about states must win over that legacy boolean.
    expect(
      resolveAllocationState({ owned: 0, sleeved: 1, state: 'unowned', overAllocated: true })
    ).toBe('unowned')
  })

  it('maps the legacy balanced state to resolved', () => {
    // Payloads from the pre-resolution database used 'balanced' for "supply covers demand".
    expect(resolveAllocationState({ owned: 4, sleeved: 2, state: 'balanced' })).toBe('resolved')
  })

  it('derives unowned for cards the user owns zero copies of', () => {
    // Must be checked before the demand comparison — 1 > 0 is true for every
    // unowned card, which is exactly how 24 unowned cards once showed as conflicts.
    expect(resolveAllocationState({ owned: 0, sleeved: 1 })).toBe('unowned')
    expect(resolveAllocationState({ owned: 0, sleeved: 5 })).toBe('unowned')
  })

  it('derives over only when demand exceeds owned supply', () => {
    // Sol Ring: 14 owned, 16 decks want it.
    expect(resolveAllocationState({ owned: 14, sleeved: 16 })).toBe('over')
    expect(resolveAllocationState({ owned: 1, sleeved: 4 })).toBe('over')
  })

  it('derives resolved when supply covers demand', () => {
    expect(resolveAllocationState({ owned: 3, sleeved: 3 })).toBe('resolved')
    expect(resolveAllocationState({ owned: 5, sleeved: 2 })).toBe('resolved')
  })

  it('derives from overAllocated when the flag is present and state is not', () => {
    expect(resolveAllocationState({ owned: 1, sleeved: 4, overAllocated: true })).toBe('over')
    expect(resolveAllocationState({ owned: 4, sleeved: 2, overAllocated: false })).toBe('resolved')
  })

  it('ignores an unrecognised server state value and derives instead', () => {
    expect(resolveAllocationState({ owned: 0, sleeved: 1, state: 'mystery' })).toBe('unowned')
    expect(resolveAllocationState({ owned: 2, sleeved: 4, state: 'mystery' })).toBe('over')
  })

  it('treats a null state as absent', () => {
    expect(resolveAllocationState({ owned: 1, sleeved: 2, state: null })).toBe('over')
  })
})

describe('shouldDisplayAllocation', () => {
  it('always lists conflicts and unowned cards', () => {
    expect(shouldDisplayAllocation({ owned: 1, sleeved: 4, state: 'over' })).toBe(true)
    expect(shouldDisplayAllocation({ owned: 0, sleeved: 1, state: 'unowned' })).toBe(true)
  })

  it('lists a resolved card only when the user decided something', () => {
    expect(
      shouldDisplayAllocation({ owned: 2, sleeved: 1, state: 'resolved', decidedCount: 1 })
    ).toBe(true)
  })

  it('hides resolved cards with no decisions — covered cards stay out of the way', () => {
    expect(
      shouldDisplayAllocation({ owned: 2, sleeved: 1, state: 'resolved', decidedCount: 0 })
    ).toBe(false)
    expect(shouldDisplayAllocation({ owned: 2, sleeved: 1, state: 'resolved' })).toBe(false)
  })
})

describe('countAllocationStates', () => {
  it('separates conflicts from unowned cards and tracks hidden resolved cards', () => {
    const counts = countAllocationStates([
      { owned: 1, sleeved: 4, state: 'over' }, // conflict
      { owned: 0, sleeved: 1, state: 'unowned' }, // not a conflict
      { owned: 2, sleeved: 1, state: 'resolved', decidedCount: 1 }, // green, listed
      { owned: 2, sleeved: 1, state: 'resolved', decidedCount: 0 }, // hidden
    ])
    expect(counts.over).toBe(1)
    expect(counts.unowned).toBe(1)
    expect(counts.resolved).toBe(1)
    expect(counts.hidden).toBe(1)
    expect(counts.total).toBe(4)
  })

  it('returns zeroed counts for an empty list', () => {
    expect(countAllocationStates([])).toEqual({
      over: 0,
      unowned: 0,
      resolved: 0,
      hidden: 0,
      total: 0,
    })
  })

  it('counts the total as the full payload, not just the listed cards', () => {
    // The old "Cards in list: 1,101" scare came from equating payload size with
    // problem count; the tile now shows over + unowned only.
    const counts = countAllocationStates([
      { owned: 1, sleeved: 2, state: 'over' },
      { owned: 1, sleeved: 1, state: 'resolved' },
      { owned: 1, sleeved: 1, state: 'resolved' },
    ])
    expect(counts.total).toBe(3)
    expect(counts.over + counts.unowned).toBe(1)
  })
})

describe('ALLOCATION_STATE_ACCENTS', () => {
  it('defines an accent for every state', () => {
    for (const state of ['over', 'unowned', 'resolved'] as const) {
      expect(ALLOCATION_STATE_ACCENTS[state]).toBeDefined()
    }
  })

  it('uses the app design tokens: amber conflicts, unowned pink, green resolved', () => {
    expect(ALLOCATION_STATE_ACCENTS.over.accent).toBe('var(--signal-warning)')
    expect(ALLOCATION_STATE_ACCENTS.unowned.accent).toBe('var(--status-unowned)')
    expect(ALLOCATION_STATE_ACCENTS.resolved.accent).toBe('var(--signal-success)')
  })
})
