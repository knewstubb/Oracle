import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import RootError from './error'
import DeckError from './decks/[id]/error'
import SharedCardsError from './shared-cards/error'
import NewDeckError from './new-deck/error'

import RootLoading from './loading'
import DeckLoading from './decks/[id]/loading'
import SharedCardsLoading from './shared-cards/loading'
import NewDeckLoading from './new-deck/loading'

describe('Error boundaries', () => {
  const testError = new Error('Connection refused')
  const mockReset = vi.fn()

  afterEach(() => {
    mockReset.mockClear()
  })

  describe('RootError', () => {
    it('renders error message with role="alert"', () => {
      render(<RootError error={testError} reset={mockReset} />)
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Connection refused/)).toBeInTheDocument()
    })

    it('calls reset on Retry click', () => {
      render(<RootError error={testError} reset={mockReset} />)
      fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
      expect(mockReset).toHaveBeenCalledOnce()
    })
  })

  describe('DeckError', () => {
    it('renders error with deck-specific message', () => {
      render(<DeckError error={testError} reset={mockReset} />)
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/load deck/)).toBeInTheDocument()
      expect(screen.getByText(/Connection refused/)).toBeInTheDocument()
    })

    it('calls reset on Retry click', () => {
      render(<DeckError error={testError} reset={mockReset} />)
      fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
      expect(mockReset).toHaveBeenCalledOnce()
    })
  })

  describe('SharedCardsError', () => {
    it('renders error with shared-cards-specific message', () => {
      render(<SharedCardsError error={testError} reset={mockReset} />)
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/load shared cards/)).toBeInTheDocument()
    })

    it('calls reset on Retry click', () => {
      render(<SharedCardsError error={testError} reset={mockReset} />)
      fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
      expect(mockReset).toHaveBeenCalledOnce()
    })
  })

  describe('NewDeckError', () => {
    it('renders error message', () => {
      render(<NewDeckError error={testError} reset={mockReset} />)
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Connection refused/)).toBeInTheDocument()
    })

    it('calls reset on Retry click', () => {
      render(<NewDeckError error={testError} reset={mockReset} />)
      fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
      expect(mockReset).toHaveBeenCalledOnce()
    })
  })
})

describe('Loading states', () => {
  it('RootLoading renders skeleton tiles', () => {
    const { container } = render(<RootLoading />)
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('DeckLoading renders header skeleton and card grid skeletons', () => {
    const { container } = render(<DeckLoading />)
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    // Header (circle + 2 text) + 15 card skeletons = 18+
    expect(skeletons.length).toBeGreaterThanOrEqual(15)
  })

  it('SharedCardsLoading renders skeleton rows', () => {
    const { container } = render(<SharedCardsLoading />)
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    // Title + subtitle + 6 rows × multiple skeletons each
    expect(skeletons.length).toBeGreaterThanOrEqual(6)
  })

  it('NewDeckLoading renders stepper and card skeletons', () => {
    const { container } = render(<NewDeckLoading />)
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    // Title + 4 stepper circles + 4 labels + 3 dividers + search + 8 cards
    expect(skeletons.length).toBeGreaterThanOrEqual(8)
  })
})
