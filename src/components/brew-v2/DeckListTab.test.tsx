import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeckListTab } from './DeckListTab'
import type { DeckCard } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    card_name: 'Test Card',
    primary_category: 'Ramp',
    additional_categories: [],
    ownership_status: 'original',
    cmc: 3,
    type_line: 'Creature — Elf',
    oracle_text: 'Tap: Add G.',
    ...overrides,
  }
}

const defaultProps = {
  cards: [] as DeckCard[],
  categoryHealthTargets: {} as Record<string, number | null>,
  onCardClick: vi.fn(),
  expandedCard: null,
  renderCardRow: (card: DeckCard) => (
    <div data-testid={`card-row-${card.card_name}`}>{card.card_name}</div>
  ),
}

describe('DeckListTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Pinned Win Conditions section', () => {
    it('renders "Win conditions" pinned section', () => {
      render(<DeckListTab {...defaultProps} />)
      expect(screen.getByText('Win conditions')).toBeInTheDocument()
    })

    it('shows cards with primary_category "Win Condition" in the win conditions section', () => {
      const cards = [
        makeCard({ card_name: 'Craterhoof Behemoth', primary_category: 'Win Condition' }),
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
      ]
      render(<DeckListTab {...defaultProps} cards={cards} />)
      // Win condition card should be rendered via renderCardRow
      expect(screen.getByTestId('card-row-Craterhoof Behemoth')).toBeInTheDocument()
    })

    it('shows empty state when no win conditions', () => {
      render(<DeckListTab {...defaultProps} cards={[]} />)
      // Should show "No cards assigned" for the pinned section
      const emptyStates = screen.getAllByText('No cards assigned')
      expect(emptyStates.length).toBeGreaterThanOrEqual(1)
    })

    it('applies teal gradient accent to win conditions section', () => {
      const cards = [
        makeCard({ card_name: 'Thassa\'s Oracle', primary_category: 'Win Condition' }),
      ]
      const { container } = render(<DeckListTab {...defaultProps} cards={cards} />)
      // The pinned section for Win Conditions should have teal border
      const tealSection = container.querySelector('.border-l-teal-400\\/40')
      expect(tealSection).toBeInTheDocument()
    })
  })

  describe('Pinned Alt Win Conditions section', () => {
    it('renders "Alt win conditions" pinned section', () => {
      render(<DeckListTab {...defaultProps} />)
      expect(screen.getByText('Alt win conditions')).toBeInTheDocument()
    })

    it('shows cards with primary_category "Alt Win Condition" in the alt section', () => {
      const cards = [
        makeCard({ card_name: 'Lab Maniac', primary_category: 'Alt Win Condition' }),
      ]
      render(<DeckListTab {...defaultProps} cards={cards} />)
      expect(screen.getByTestId('card-row-Lab Maniac')).toBeInTheDocument()
    })

    it('applies amber gradient accent to alt win conditions section', () => {
      const cards = [
        makeCard({ card_name: 'Approach of the Second Sun', primary_category: 'Alt Win Condition' }),
      ]
      const { container } = render(<DeckListTab {...defaultProps} cards={cards} />)
      const amberSection = container.querySelector('.border-l-amber-400\\/40')
      expect(amberSection).toBeInTheDocument()
    })
  })

  describe('Dynamic Category Sections', () => {
    it('renders a CategorySection for each unique primary_category (excluding win conditions)', () => {
      const cards = [
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
        makeCard({ card_name: 'Arcane Signet', primary_category: 'Ramp' }),
        makeCard({ card_name: 'Swords to Plowshares', primary_category: 'Removal' }),
        makeCard({ card_name: 'Rhystic Study', primary_category: 'Draw' }),
      ]
      render(<DeckListTab {...defaultProps} cards={cards} />)

      expect(screen.getByText('Ramp')).toBeInTheDocument()
      expect(screen.getByText('Removal')).toBeInTheDocument()
      expect(screen.getByText('Draw')).toBeInTheDocument()
    })

    it('shows correct count in category header', () => {
      const cards = [
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
        makeCard({ card_name: 'Arcane Signet', primary_category: 'Ramp' }),
        makeCard({ card_name: 'Mind Stone', primary_category: 'Ramp' }),
      ]
      render(<DeckListTab {...defaultProps} cards={cards} />)
      // Count should show "3" next to "Ramp"
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('shows health indicator dot with correct color for healthy category', () => {
      const cards = [
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
        makeCard({ card_name: 'Arcane Signet', primary_category: 'Ramp' }),
      ]
      const { container } = render(
        <DeckListTab
          {...defaultProps}
          cards={cards}
          categoryHealthTargets={{ Ramp: 2 }}
        />
      )
      // Should have a teal dot for healthy (count matches target)
      const tealDot = container.querySelector('.bg-teal-400')
      expect(tealDot).toBeInTheDocument()
    })

    it('shows amber dot for low category count', () => {
      const cards = [
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
      ]
      const { container } = render(
        <DeckListTab
          {...defaultProps}
          cards={cards}
          categoryHealthTargets={{ Ramp: 5 }}
        />
      )
      const amberDot = container.querySelector('.bg-amber-400')
      expect(amberDot).toBeInTheDocument()
    })

    it('shows red dot for high category count', () => {
      const cards = [
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
        makeCard({ card_name: 'Arcane Signet', primary_category: 'Ramp' }),
        makeCard({ card_name: 'Mind Stone', primary_category: 'Ramp' }),
      ]
      const { container } = render(
        <DeckListTab
          {...defaultProps}
          cards={cards}
          categoryHealthTargets={{ Ramp: 1 }}
        />
      )
      const redDot = container.querySelector('.bg-red-400')
      expect(redDot).toBeInTheDocument()
    })

    it('shows gray dot for unmonitored category', () => {
      const cards = [
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
      ]
      const { container } = render(
        <DeckListTab
          {...defaultProps}
          cards={cards}
          categoryHealthTargets={{ Ramp: null }}
        />
      )
      const grayDot = container.querySelector('.bg-gray-500')
      expect(grayDot).toBeInTheDocument()
    })
  })

  describe('Card interactions', () => {
    it('calls onCardClick when a card row is clicked', () => {
      const onCardClick = vi.fn()
      const cards = [
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
      ]
      render(<DeckListTab {...defaultProps} cards={cards} onCardClick={onCardClick} />)
      fireEvent.click(screen.getByTestId('card-row-Sol Ring'))
      expect(onCardClick).toHaveBeenCalledWith('Sol Ring')
    })

    it('does not include win condition cards in dynamic category sections', () => {
      const cards = [
        makeCard({ card_name: 'Craterhoof', primary_category: 'Win Condition' }),
        makeCard({ card_name: 'Sol Ring', primary_category: 'Ramp' }),
      ]
      render(<DeckListTab {...defaultProps} cards={cards} />)
      // Win Condition should NOT appear as a category header in the dynamic sections
      // It only appears in the pinned section title
      const headers = screen.getAllByText('Win conditions')
      expect(headers).toHaveLength(1) // Only the pinned section title
    })
  })
})
