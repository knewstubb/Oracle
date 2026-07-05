import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeckEditor, type DeckSuggestion } from './DeckEditor'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

const mockCards: DeckSuggestion[] = [
  { name: 'Sol Ring', manaCost: '{1}', typeLine: 'Artifact', role: 'Ramp', owned: true },
  { name: 'Lightning Bolt', manaCost: '{R}', typeLine: 'Instant', role: 'Removal', owned: false },
  { name: 'Llanowar Elves', manaCost: '{G}', typeLine: 'Creature — Elf Druid', role: 'Ramp', owned: true },
  { name: 'Counterspell', manaCost: '{U}{U}', typeLine: 'Instant', role: 'Counter', owned: false },
  { name: 'Forest', manaCost: '', typeLine: 'Basic Land — Forest', role: 'Mana base', owned: true },
]

describe('DeckEditor', () => {
  const mockOnCardsChange = vi.fn()
  const mockOnBack = vi.fn()
  const mockOnCreateDeck = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    mockOnCardsChange.mockClear()
    mockOnBack.mockClear()
    mockOnCreateDeck.mockClear()
  })

  it('renders card count', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    expect(screen.getByText('5/99 cards')).toBeInTheDocument()
  })

  it('shows amber text when card count is not 99', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    const countEl = screen.getByText('5/99 cards')
    expect(countEl).toHaveClass('text-warning')
  })

  it('does not show amber text when card count is exactly 99', () => {
    const cards99 = Array.from({ length: 99 }, (_, i) => ({
      name: `Card ${i}`,
      manaCost: '{1}',
      typeLine: 'Creature',
      role: 'Filler',
      owned: true,
    }))

    render(
      <DeckEditor
        cards={cards99}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    const countEl = screen.getByText('99/99 cards')
    expect(countEl).not.toHaveClass('text-warning')
  })

  it('groups cards by type', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    expect(screen.getByText('Creatures (1)')).toBeInTheDocument()
    expect(screen.getByText('Instants (2)')).toBeInTheDocument()
    expect(screen.getByText('Artifacts (1)')).toBeInTheDocument()
    expect(screen.getByText('Lands (1)')).toBeInTheDocument()
  })

  it('shows remove button with correct aria-label on hover', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    const removeBtn = screen.getByRole('button', { name: 'Remove Sol Ring' })
    expect(removeBtn).toBeInTheDocument()
  })

  it('removes a card when remove button is clicked', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove Sol Ring' }))

    expect(mockOnCardsChange).toHaveBeenCalledWith(
      mockCards.filter((c) => c.name !== 'Sol Ring')
    )
  })

  it('dispatches open-search event when Add cards is clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Add cards/i }))

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'open-search' })
    )
  })

  it('calls onBack when Back button is clicked', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    expect(mockOnBack).toHaveBeenCalledTimes(1)
  })

  it('calls onCreateDeck when Create Deck button is clicked', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={mockOnCardsChange}
        onBack={mockOnBack}
        onCreateDeck={mockOnCreateDeck}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Create Deck/i }))
    expect(mockOnCreateDeck).toHaveBeenCalledTimes(1)
  })
})
