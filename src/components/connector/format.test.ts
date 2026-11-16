import { describe, expect, it } from 'vitest'
import { cancelReasonText, formatClock, formatWhen } from './format'

describe('formatWhen', () => {
  const now = new Date(2026, 10, 16, 14, 3)
  it('is just the clock for today', () => {
    expect(formatWhen(new Date(2026, 10, 16, 18, 0).toISOString(), now)).toBe(formatClock(new Date(2026, 10, 16, 18, 0).toISOString()))
  })
  it('says tomorrow when it is the next day', () => {
    expect(formatWhen(new Date(2026, 10, 17, 14, 3).toISOString(), now)).toMatch(/^tomorrow /)
  })
  it('says yesterday for the day before', () => {
    expect(formatWhen(new Date(2026, 10, 15, 14, 3).toISOString(), now)).toMatch(/^yesterday /)
  })
  it('gives a date for anything else', () => {
    expect(formatWhen(new Date(2026, 10, 20, 14, 3).toISOString(), now)).toMatch(/20/)
  })
  it('is empty for missing or bad input', () => {
    expect(formatWhen(null, now)).toBe('')
    expect(formatWhen('nope', now)).toBe('')
  })
})

describe('cancelReasonText', () => {
  it('uses plain wording for switched_off or empty', () => {
    expect(cancelReasonText('switched_off')).toBe('Claude was switched off')
    expect(cancelReasonText(null)).toBe('Claude was switched off')
  })
  it('strips a repeated Cancelled and Nothing changed', () => {
    expect(cancelReasonText('Cancelled. You switched the connection off. Nothing changed.')).toBe('You switched the connection off')
  })
  it('leaves a plain reason alone', () => {
    expect(cancelReasonText('The deck was deleted')).toBe('The deck was deleted')
  })
})
