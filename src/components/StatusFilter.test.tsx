import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusFilter, parseStatusFilter } from './StatusFilter'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
}))

describe('StatusFilter', () => {
  it('renders chip buttons for all three statuses', () => {
    render(<StatusFilter />)

    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inactive' })).toBeInTheDocument()
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

    expect(mockReplace).toHaveBeenCalledWith('?status=active', { scroll: false })
  })
})

describe('parseStatusFilter', () => {
  it('returns empty array when no status param', () => {
    const params = new URLSearchParams()
    expect(parseStatusFilter(params)).toEqual([])
  })

  it('parses a single status', () => {
    const params = new URLSearchParams('status=active')
    expect(parseStatusFilter(params)).toEqual(['active'])
  })

  it('parses comma-separated statuses', () => {
    const params = new URLSearchParams('status=active,draft')
    expect(parseStatusFilter(params)).toEqual(['active', 'draft'])
  })

  it('filters out invalid status values', () => {
    const params = new URLSearchParams('status=active,bogus,draft')
    expect(parseStatusFilter(params)).toEqual(['active', 'draft'])
  })

  it('returns empty array for entirely invalid param', () => {
    const params = new URLSearchParams('status=bogus,invalid')
    expect(parseStatusFilter(params)).toEqual([])
  })

  it('handles whitespace in values', () => {
    const params = new URLSearchParams('status= active , draft ')
    expect(parseStatusFilter(params)).toEqual(['active', 'draft'])
  })
})
