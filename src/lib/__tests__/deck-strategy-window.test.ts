import { describe, it, expect } from 'vitest'
import { BRACKETS, bracketLabel, bracketName, parseBracket } from '../deck-bracket'
import { SUMMARY_MAX, STRATEGY_MAX, addDatedParagraph, bracketWarning, shortDateText, validateWindowInput } from '../deck-strategy-window'
describe('bracket names (number first)', () => {
  it('has the owner\'s five names in order', () => {
    expect(BRACKETS.map((b) => `${b.number} ${b.name}`)).toEqual(['1 Exhibition', '2 Core', '3 Upgraded', '4 Optimized', '5 cEDH'])
  })
  it('the label starts with the number and the name is optional', () => {
    expect(bracketLabel(3)).toBe('3 Upgraded')
    expect(bracketLabel(3, false)).toBe('3')
    expect(bracketName(5)).toBe('cEDH')
    expect(bracketName(6)).toBeNull()
    expect(bracketName(null)).toBeNull()
  })
  it('only 1 to 5 is a bracket', () => {
    expect([1, 2, 3, 4, 5].map(parseBracket)).toEqual([1, 2, 3, 4, 5])
    for (const bad of [0, 6, 2.5, '', 'Bracket 3', null, undefined]) expect(parseBracket(bad)).toBeNull()
  })
})
describe('the bracket warning only informs', () => {
  const implied = { minimumBracket: 4, basedOn: '4 Game Changers' }
  it('shows when the cards imply more than the target', () => {
    expect(bracketWarning(3, implied)).toEqual({ text: 'Cards in this deck imply at least Bracket 4. Your target is Bracket 3.', basedOn: '4 Game Changers' })
  })
  it('shows nothing when the cards imply the same or less, when no target is set, or when nothing is counted yet', () => {
    expect(bracketWarning(4, implied)).toBeNull()
    expect(bracketWarning(5, implied)).toBeNull()
    expect(bracketWarning(null, implied)).toBeNull()
    expect(bracketWarning(3, null)).toBeNull()
  })
  it('the sentence never says anything is restricted', () => {
    const w = bracketWarning(2, implied)!
    expect(`${w.text} ${w.basedOn}`).not.toMatch(/restrict|limit|only suggest|refus|block|filter/i)
  })
})
describe('Claude adds a dated paragraph and never replaces the owner\'s text', () => {
  const day = new Date('2026-11-19T23:59:00Z')
  it('keeps the owner\'s text exactly and adds the paragraph after it', () => {
    const mine = 'Yedora plants lands.\nNever cut Scute Swarm.'
    const r = addDatedParagraph(mine, 'Add a sacrifice outlet.', day)!
    expect(r.startsWith(mine)).toBe(true)
    expect(r).toBe(`${mine}\n\nClaude, 19 Nov 2026: Add a sacrifice outlet.`)
  })
  it('trailing blank space in the owner\'s text does not pile up blank lines', () => {
    expect(addDatedParagraph('Mine.\n\n\n', 'More.', day)).toBe('Mine.\n\nClaude, 19 Nov 2026: More.')
  })
  it('an empty or missing Strategy gets just the paragraph', () => {
    expect(addDatedParagraph(null, 'First.', day)).toBe('Claude, 19 Nov 2026: First.')
    expect(addDatedParagraph('  \n', 'First.', day)).toBe('Claude, 19 Nov 2026: First.')
  })
  it('an empty paragraph adds nothing', () => {
    expect(addDatedParagraph('Mine.', '   ', day)).toBeNull()
  })
  it('over the limit returns nothing instead of cutting the owner\'s text', () => {
    expect(addDatedParagraph('x'.repeat(STRATEGY_MAX - 5), 'too long to fit', day)).toBeNull()
  })
  it('the date is the UTC day', () => {
    expect(shortDateText('2026-11-19T23:59:00Z')).toBe('19 Nov')
    expect(shortDateText('nonsense')).toBe('')
    expect(shortDateText(null)).toBe('')
  })
})
describe('what the window may save', () => {
  it('accepts brackets 1 to 5 and null', () => {
    for (const b of [1, 2, 3, 4, 5, null]) expect(validateWindowInput({ bracket: b })).toEqual({ ok: true, values: { bracket: b } })
  })
  it('refuses bracket 0, 6 and text', () => {
    for (const b of [0, 6, 'high', 2.5]) expect(validateWindowInput({ bracket: b }).ok).toBe(false)
  })
  it('a summary of 120 saves and 121 does not', () => {
    expect(validateWindowInput({ summary: 'x'.repeat(SUMMARY_MAX) }).ok).toBe(true)
    const r = validateWindowInput({ summary: 'x'.repeat(SUMMARY_MAX + 1) })
    expect(r).toEqual({ ok: false, error: 'The summary can be at most 120 characters.' })
  })
  it('the summary is one line; the Strategy keeps its line breaks; empty text is stored as nothing', () => {
    expect(validateWindowInput({ summary: ' a\nb ', strategy: 'one\ntwo', playgroup: '   ' })).toEqual({ ok: true, values: { summary: 'a b', strategy: 'one\ntwo', playgroup: null } })
  })
  it('fields the window does not own (win condition, budget) are never passed on', () => {
    const r = validateWindowInput({ bracket: 3, win_condition: 'x', budget_mode: 'budget', budget_ceiling: 5 })
    expect(r).toEqual({ ok: true, values: { bracket: 3 } })
  })
  it('nothing to save is an error', () => {
    expect(validateWindowInput({}).ok).toBe(false)
    expect(validateWindowInput(null).ok).toBe(false)
  })
})
