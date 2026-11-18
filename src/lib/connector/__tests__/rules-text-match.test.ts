// CC-14: the pure rules text matcher.
import { describe, it, expect } from 'vitest'
import { matchesRulesText } from '../tools/rules-text-match'
describe('matchesRulesText', () => {
  const t = 'Whenever this creature becomes tapped,\nput a +1/+1 counter on it.'
  it('all_words: every word, any order, partial words, not case sensitive', () => {
    expect(matchesRulesText(t, 'COUNTER put', 'all_words')).toBe(true)
    expect(matchesRulesText(t, 'counters', 'all_words')).toBe(false) // "counters" is not inside "counter"
    expect(matchesRulesText(t, 'counter', 'all_words')).toBe(true)
    expect(matchesRulesText(t, 'counter flying', 'all_words')).toBe(false)
  })
  it('phrase: exact sequence, whitespace and newlines collapsed', () => {
    expect(matchesRulesText(t, 'becomes tapped, put a', 'phrase')).toBe(true)
    expect(matchesRulesText(t, 'put becomes', 'phrase')).toBe(false)
  })
  it('a phrase never spans the face separator, all_words may', () => {
    const two = 'Flying\n//\nHaste'
    expect(matchesRulesText(two, 'flying haste', 'phrase')).toBe(false)
    expect(matchesRulesText(two, 'flying haste', 'all_words')).toBe(true)
    expect(matchesRulesText(two, 'haste', 'phrase')).toBe(true)
  })
  it('null or empty text never matches', () => {
    expect(matchesRulesText(null, 'a', 'all_words')).toBe(false)
    expect(matchesRulesText('  ', 'a', 'phrase')).toBe(false)
    expect(matchesRulesText('abc', '  ', 'all_words')).toBe(false)
  })
})
