import { describe, it, expect } from 'vitest'
import {
  formatChangeLogEntry,
  computeThisMonthCount,
  type ChangeLogEntry,
} from './upgrade-changelog'

describe('formatChangeLogEntry', () => {
  it('formats an applied entry with all fields', () => {
    const result = formatChangeLogEntry(
      'Llanowar Elves',
      'Birds of Paradise',
      'applied',
      'Better mana fixing across all colors',
      '2025-06-15'
    )

    expect(result).toBe(
      '**Change Log Entry — 2025-06-15**\n' +
        '• Applied: Cut Llanowar Elves → Add Birds of Paradise\n' +
        '• Reason: Better mana fixing across all colors'
    )
  })

  it('formats a skipped entry with all fields', () => {
    const result = formatChangeLogEntry(
      'Sol Ring',
      'Mana Crypt',
      'skipped',
      'Too expensive for current budget',
      '2025-06-20'
    )

    expect(result).toBe(
      '**Change Log Entry — 2025-06-20**\n' +
        '• Skipped: Cut Sol Ring → Add Mana Crypt\n' +
        '• Reason: Too expensive for current budget'
    )
  })

  it('handles empty reason gracefully', () => {
    const result = formatChangeLogEntry(
      'Forest',
      'Command Tower',
      'applied',
      '',
      '2025-01-01'
    )

    expect(result).toContain('• Reason: ')
  })

  it('contains all five required fields', () => {
    const result = formatChangeLogEntry(
      'Cut Card',
      'Add Card',
      'applied',
      'Some reason',
      '2025-03-10'
    )

    expect(result).toContain('Cut Card')
    expect(result).toContain('Add Card')
    expect(result).toContain('Applied')
    expect(result).toContain('Some reason')
    expect(result).toContain('2025-03-10')
  })
})

describe('computeThisMonthCount', () => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed

  // Helper to generate a date string for the current month
  function thisMonthDate(day: number): string {
    const month = String(currentMonth + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${currentYear}-${month}-${d}`
  }

  // Helper to generate a date string for a different month
  function otherMonthDate(): string {
    const otherMonth = currentMonth === 0 ? 11 : currentMonth - 1
    const year = currentMonth === 0 ? currentYear - 1 : currentYear
    return `${year}-${String(otherMonth + 1).padStart(2, '0')}-15`
  }

  it('counts only applied entries in the current month', () => {
    const entries: ChangeLogEntry[] = [
      { id: 1, date: thisMonthDate(1), cut_card: 'A', add_card: 'B', reason: 'r', skipped: false },
      { id: 2, date: thisMonthDate(10), cut_card: 'C', add_card: 'D', reason: 'r', skipped: false },
      { id: 3, date: thisMonthDate(15), cut_card: 'E', add_card: 'F', reason: 'r', skipped: true },
    ]

    expect(computeThisMonthCount(entries)).toBe(2)
  })

  it('excludes entries from other months', () => {
    const entries: ChangeLogEntry[] = [
      { id: 1, date: thisMonthDate(5), cut_card: 'A', add_card: 'B', reason: 'r', skipped: false },
      { id: 2, date: otherMonthDate(), cut_card: 'C', add_card: 'D', reason: 'r', skipped: false },
    ]

    expect(computeThisMonthCount(entries)).toBe(1)
  })

  it('returns 0 for empty entries', () => {
    expect(computeThisMonthCount([])).toBe(0)
  })

  it('returns 0 when all entries are skipped', () => {
    const entries: ChangeLogEntry[] = [
      { id: 1, date: thisMonthDate(3), cut_card: 'A', add_card: 'B', reason: 'r', skipped: true },
      { id: 2, date: thisMonthDate(7), cut_card: 'C', add_card: 'D', reason: 'r', skipped: true },
    ]

    expect(computeThisMonthCount(entries)).toBe(0)
  })

  it('returns 0 when all applied entries are from other months', () => {
    const entries: ChangeLogEntry[] = [
      { id: 1, date: otherMonthDate(), cut_card: 'A', add_card: 'B', reason: 'r', skipped: false },
    ]

    expect(computeThisMonthCount(entries)).toBe(0)
  })
})
