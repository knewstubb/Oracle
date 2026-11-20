import { describe, it, expect } from 'vitest'
import { conditionLabel, conditionStored, CONDITION_OPTIONS } from './labels'

describe('condition words', () => {
  it('maps stored words to short words and back', () => {
    for (const o of CONDITION_OPTIONS) {
      expect(conditionLabel(o.stored)).toBe(o.label)
      expect(conditionStored(o.label)).toBe(o.stored)
    }
  })
  it('shows a dash when empty and passes unknown values through', () => {
    expect(conditionLabel(null)).toBe('–')
    expect(conditionLabel('LP')).toBe('LP')
    expect(conditionStored('weird')).toBe('weird')
  })
})
