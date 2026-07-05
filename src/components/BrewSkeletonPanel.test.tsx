import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrewSkeletonPanel } from './BrewSkeletonPanel'
import type { DeckSkeleton } from '@/types/brew'

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeSkeleton(overrides?: Partial<DeckSkeleton>): DeckSkeleton {
  return {
    commanderName: 'Muldrotha, the Gravetide',
    colourIdentity: ['B', 'U', 'G'],
    totalCards: 100,
    categories: [
      {
        name: 'Ramp',
        cards: [
          {
            cardName: 'Sol Ring',
            ownershipStatus: 'owned',
            price: 3.5,
            overBudget: false,
            accepted: false,
          },
          {
            cardName: 'Arcane Signet',
            ownershipStatus: 'proxy_candidate',
            price: 2.0,
            proxyConflict: { deckName: 'World Breaker', deckId: 1 },
            overBudget: false,
            accepted: false,
          },
        ],
      },
      {
        name: 'Draw',
        cards: [
          {
            cardName: 'Rhystic Study',
            ownershipStatus: 'not_owned',
            price: 45.0,
            overBudget: true,
            accepted: false,
          },
        ],
      },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrewSkeletonPanel', () => {
  it('renders the total card count summary', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    expect(screen.getByText('100/100 cards')).toBeInTheDocument()
  })

  it('renders category distribution chips in the summary', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    expect(screen.getByText('Ramp 2')).toBeInTheDocument()
    expect(screen.getByText('Draw 1')).toBeInTheDocument()
  })

  it('renders collapsible category sections with name and count', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    // Category headers visible
    expect(screen.getByText('Ramp')).toBeInTheDocument()
    expect(screen.getByText('Draw')).toBeInTheDocument()
    // Counts shown
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders card names within categories', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    expect(screen.getByText('Arcane Signet')).toBeInTheDocument()
    expect(screen.getByText('Rhystic Study')).toBeInTheDocument()
  })

  it('shows ProxyBadge for proxy_candidate cards', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    expect(screen.getByText('Proxy')).toBeInTheDocument()
  })

  it('shows price badges for cards with prices', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    expect(screen.getByText('$3.50')).toBeInTheDocument()
    expect(screen.getByText('$2.00')).toBeInTheDocument()
    expect(screen.getByText('$45.00')).toBeInTheDocument()
  })

  it('shows proxy conflict indicator with deck name in title', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    const conflictIndicator = screen.getByTitle('Conflict: World Breaker')
    expect(conflictIndicator).toBeInTheDocument()
  })

  it('shows over-budget indicator for expensive cards', () => {
    const { container } = render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    // AlertTriangle rendered as SVG for over-budget card
    const alertIcons = container.querySelectorAll('.text-red-400')
    expect(alertIcons.length).toBeGreaterThan(0)
  })

  it('calls onRefine with swap action when swap button clicked', () => {
    const onRefine = vi.fn()
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={onRefine}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    const swapButtons = screen.getAllByTitle('Swap card')
    fireEvent.click(swapButtons[0])

    expect(onRefine).toHaveBeenCalledWith({
      type: 'swap',
      category: 'Ramp',
      oldCard: 'Sol Ring',
      newCard: '',
    })
  })

  it('calls onRefine with alternatives action when alternatives button clicked', () => {
    const onRefine = vi.fn()
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={onRefine}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    const altButtons = screen.getAllByTitle('Request alternatives')
    fireEvent.click(altButtons[0])

    expect(onRefine).toHaveBeenCalledWith({
      type: 'alternatives',
      category: 'Ramp',
      targetCard: 'Sol Ring',
    })
  })

  it('calls onRefine with accept action when accept button clicked', () => {
    const onRefine = vi.fn()
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={onRefine}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    const acceptButtons = screen.getAllByText('Accept')
    fireEvent.click(acceptButtons[0])

    expect(onRefine).toHaveBeenCalledWith({
      type: 'accept',
      category: 'Ramp',
    })
  })

  it('collapses a category section when header is clicked', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    // All cards visible initially
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()

    // Click the Ramp header to collapse
    fireEvent.click(screen.getByText('Ramp'))

    // Sol Ring should no longer be visible
    expect(screen.queryByText('Sol Ring')).not.toBeInTheDocument()
  })

  it('calls onSave when Save Deck button is clicked', () => {
    const onSave = vi.fn()
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={onSave}
        isRefining={false}
      />
    )

    fireEvent.click(screen.getByText('Save Deck'))
    expect(onSave).toHaveBeenCalled()
  })

  it('disables Save Deck and action buttons when isRefining is true', () => {
    render(
      <BrewSkeletonPanel
        skeleton={makeSkeleton()}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={true}
      />
    )

    expect(screen.getByText('Save Deck')).toBeDisabled()
    const swapButtons = screen.getAllByTitle('Swap card')
    expect(swapButtons[0]).toBeDisabled()
  })

  it('hides accept button when all cards in a category are accepted', () => {
    const skeleton = makeSkeleton({
      categories: [
        {
          name: 'Ramp',
          cards: [
            {
              cardName: 'Sol Ring',
              ownershipStatus: 'owned',
              price: 3.5,
              overBudget: false,
              accepted: true,
            },
          ],
        },
      ],
    })

    render(
      <BrewSkeletonPanel
        skeleton={skeleton}
        onRefine={vi.fn()}
        onSave={vi.fn()}
        isRefining={false}
      />
    )

    expect(screen.queryByText('Accept')).not.toBeInTheDocument()
  })
})
