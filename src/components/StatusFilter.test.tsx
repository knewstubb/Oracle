import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusFilter, parseStatusFilter } from './StatusFilter'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
}))

describe('StatusFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders chip buttons for all three statuses', () => {
    render(<StatusFilter />)

    expect(screen.getByRole('button', { name: 'Brewing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Graveyard' })).toBeInTheDocument()
  })

  it('has accessible group role with label', () => {
    render(<StatusFilter />)

    expect(screen.getByRole('group', { name: 'Filter decks by status' })).toBeInTheDocument()
  })

  it('all chips show as unfiltered (aria-pressed=false) when no URL param', () => {
    render(<StatusFilter />)

    const buttons = screen.getAllByRole('button')
    buttons.forEach(btn => {
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    })
  })

  it('clicking a chip updates URL with status param', () => {
    render(<StatusFilter />)

    fireEvent.click(screen.getByRole('button', { name: 'Active' }))

    expect(mockReplace).toHaveBeenCalledWith('?status=in_rotation', { scroll: false })
  })

  it('clicking Brewing chip updates URL with brewing status', () => {
    render(<StatusFilter />)

    fireEvent.click(screen.getByRole('button', { name: 'Brewing' }))

    expect(mockReplace).toHaveBeenCalledWith('?status=brewing', { scroll: false })
  })

  it('clicking Graveyard chip updates URL with graveyard status', () => {
    render(<StatusFilter />)

    fireEvent.click(screen.getByRole('button', { name: 'Graveyard' }))

    expect(mockReplace).toHaveBeenCalledWith('?status=graveyard', { scroll: false })
  })
})

describe('parseStatusFilter', () => {
  it('returns empty array when no status param', () => {
    const params = new URLSearchParams()
    expect(parseStatusFilter(params)).toEqual([])
  })

  it('parses a single status', () => {
    const params = new URLSearchParams('status=in_rotation')
    expect(parseStatusFilter(params)).toEqual(['in_rotation'])
  })

  it('parses brewing status', () => {
    const params = new URLSearchParams('status=brewing')
    expect(parseStatusFilter(params)).toEqual(['brewing'])
  })

  it('parses graveyard status', () => {
    const params = new URLSearchParams('status=graveyard')
    expect(parseStatusFilter(params)).toEqual(['graveyard'])
  })

  it('parses comma-separated statuses', () => {
    const params = new URLSearchParams('status=in_rotation,brewing')
    expect(parseStatusFilter(params)).toEqual(['in_rotation', 'brewing'])
  })

  it('filters out invalid status values', () => {
    const params = new URLSearchParams('status=in_rotation,bogus,brewing')
    expect(parseStatusFilter(params)).toEqual(['in_rotation', 'brewing'])
  })

  it('returns empty array for entirely invalid param', () => {
    const params = new URLSearchParams('status=bogus,invalid')
    expect(parseStatusFilter(params)).toEqual([])
  })

  it('handles whitespace in values', () => {
    const params = new URLSearchParams('status= in_rotation , brewing ')
    expect(parseStatusFilter(params)).toEqual(['in_rotation', 'brewing'])
  })

  it('filters out old status values (active, draft, inactive)', () => {
    const params = new URLSearchParams('status=active,draft,inactive')
    expect(parseStatusFilter(params)).toEqual([])
  })
})
