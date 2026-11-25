import { describe, it, expect } from 'vitest'
import { checkDeckName, hasNameClash } from './deck-name'

describe('checkDeckName', () => {
  it('trims spaces at both ends', () => {
    expect(checkDeckName('  Prosper  ')).toEqual({ ok: true, name: 'Prosper' })
  })
  it('refuses empty, spaces only and non-text', () => {
    expect(checkDeckName('')).toEqual({ ok: false, error: 'name_empty' })
    expect(checkDeckName('   ')).toEqual({ ok: false, error: 'name_empty' })
    expect(checkDeckName(null)).toEqual({ ok: false, error: 'name_empty' })
  })
  it('allows exactly 100 characters and refuses 101', () => {
    expect(checkDeckName('a'.repeat(100)).ok).toBe(true)
    expect(checkDeckName('a'.repeat(101))).toEqual({ ok: false, error: 'name_too_long' })
  })
})

describe('hasNameClash', () => {
  const decks = [{ id: 1, name: 'Prosper' }, { id: 2, name: 'Korvold' }]
  it('ignores capital letters', () => {
    expect(hasNameClash(decks, 2, 'prosper')).toBe(true)
  })
  it('lets a deck change only the capitals of its own name', () => {
    expect(hasNameClash(decks, 2, 'KORVOLD')).toBe(false)
  })
  it('allows an unused name', () => {
    expect(hasNameClash(decks, 2, 'Atraxa')).toBe(false)
  })
})
