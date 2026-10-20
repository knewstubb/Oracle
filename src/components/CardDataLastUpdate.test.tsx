import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardDataLastUpdate, formatShortDate } from './CardDataLastUpdate'

const status = vi.hoisted(() => ({ value: { data: null as unknown, isStale: false } }))
vi.mock('@/hooks/useCardDataStatus', () => ({ useCardDataStatus: () => status.value }))

describe('formatShortDate', () => {
  it("formats as day, short month and 'yy", () => {
    expect(formatShortDate(new Date(2026, 5, 13, 12).toISOString())).toBe("13 Jun '26")
  })
  it('returns null for unreadable dates', () => {
    expect(formatShortDate('nope')).toBeNull()
  })
})

describe('CardDataLastUpdate', () => {
  it('shows the label and links to Settings', () => {
    status.value = { data: { lastSyncedAt: new Date(2026, 9, 20, 12).toISOString() }, isStale: false }
    render(<CardDataLastUpdate />)
    const link = screen.getByRole('link', { name: "Last update 20 Oct '26" })
    expect(link).toHaveAttribute('href', '/settings')
  })
  it('renders nothing when there is no date yet', () => {
    status.value = { data: null, isStale: false }
    const { container } = render(<CardDataLastUpdate />)
    expect(container).toBeEmptyDOMElement()
  })
})
