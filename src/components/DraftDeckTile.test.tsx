import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftDeckTile } from './DraftDeckTile'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock TanStack Query
const mockMutate = vi.fn()
const mockInvalidateQueries = vi.fn()
let mockOnSuccess: (() => void) | undefined
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  useMutation: ({ onSuccess }: { mutationFn: () => Promise<unknown>; onSuccess?: () => void }) => {
    mockOnSuccess = onSuccess
    return {
      mutate: mockMutate,
      isPending: false,
    }
  },
}))

const defaultProps = {
  id: 7,
  name: 'Nekusar Wheels',
  commanderName: 'Nekusar, the Mindrazer',
  commanderScryfallId: 'def12345-6789-0000-0000-000000000000',
  colourIdentity: ['U', 'B', 'R'],
  cardCount: 47,
  brewSessionId: 3,
}

describe('DraftDeckTile', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockMutate.mockClear()
    mockInvalidateQueries.mockClear()
  })

  it('renders with dashed border style', () => {
    const { container } = render(<DraftDeckTile {...defaultProps} />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.style.border).toBe('0.5px dashed rgba(55, 138, 221, 0.3)')
  })

  it('renders deck name as bold heading', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const heading = screen.getByText('Nekusar Wheels')
    expect(heading.tagName).toBe('H3')
    expect(heading.className).toContain('font-bold')
  })

  it('renders commander name as subtitle', () => {
    render(<DraftDeckTile {...defaultProps} />)
    expect(screen.getByText('Nekusar, the Mindrazer')).toBeInTheDocument()
  })

  it('renders blue "Draft" badge', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const badge = screen.getByText('Draft')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('text-[#378ADD]')
    expect(badge.className).toContain('bg-[rgba(55,138,221,0.15)]')
  })

  it('does NOT render card count or health pips', () => {
    render(<DraftDeckTile {...defaultProps} />)
    expect(screen.queryByText('47 Cards')).not.toBeInTheDocument()
    expect(screen.queryByText('47')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Deck health/ })).not.toBeInTheDocument()
  })

  it('renders commander art image', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const img = screen.getByRole('img', { name: 'Nekusar, the Mindrazer card art' })
    expect(img).toHaveAttribute(
      'src',
      'https://cards.scryfall.io/art_crop/front/d/e/def12345-6789-0000-0000-000000000000.jpg'
    )
  })

  it('renders colour identity bars', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const bars = screen.getByRole('img', { name: 'Blue, Black, Red' })
    expect(bars).toBeInTheDocument()
  })

  it('has accessible aria-label on tile container', () => {
    render(<DraftDeckTile {...defaultProps} />)
    expect(screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')).toBeInTheDocument()
  })

  // State machine tests

  it('starts in idle state (no hover buttons visible)', () => {
    render(<DraftDeckTile {...defaultProps} />)
    expect(screen.queryByText('Continue brewing')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete draft')).not.toBeInTheDocument()
  })

  it('shows hover actions on mouseenter', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    expect(screen.getByText('Continue brewing')).toBeInTheDocument()
    expect(screen.getByText('Delete draft')).toBeInTheDocument()
  })

  it('hides hover actions on mouseleave', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.mouseLeave(tile)
    expect(screen.queryByText('Continue brewing')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete draft')).not.toBeInTheDocument()
  })

  it('navigates to brew session on "Continue brewing" click', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Continue brewing'))
    expect(mockPush).toHaveBeenCalledWith('/new-deck?resume=3')
  })

  it('navigates to deck page when no brewSessionId', () => {
    render(<DraftDeckTile {...defaultProps} brewSessionId={null} />)
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Continue brewing'))
    expect(mockPush).toHaveBeenCalledWith('/decks/7')
  })

  it('transitions to confirming state on "Delete draft" click', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete draft'))
    // Confirmation UI should appear — text is split across elements, use a function matcher
    expect(screen.getByText((_content, node) => {
      return node?.textContent === 'Delete \u201cNekusar Wheels\u201d?' && node.tagName === 'P'
    })).toBeInTheDocument()
    expect(screen.getByText('This will permanently remove the draft.')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('restores hover state on "Cancel" click', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete draft'))
    fireEvent.click(screen.getByText('Cancel'))
    // Should be back to hover state
    expect(screen.getByText('Continue brewing')).toBeInTheDocument()
    expect(screen.getByText('Delete draft')).toBeInTheDocument()
  })

  it('calls delete mutation on "Delete" confirm', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete draft'))
    fireEvent.click(screen.getByText('Delete'))
    expect(mockMutate).toHaveBeenCalled()
  })

  it('confirmation Delete button has destructive styling', () => {
    render(<DraftDeckTile {...defaultProps} />)
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete draft'))
    const deleteBtn = screen.getByText('Delete')
    expect(deleteBtn.className).toContain('text-[#E24B4A]')
    expect(deleteBtn.className).toContain('bg-[rgba(226,75,74,0.15)]')
  })

  it('handles empty colour identity', () => {
    render(<DraftDeckTile {...defaultProps} colourIdentity={[]} />)
    expect(screen.queryByRole('img', { name: /White|Blue|Black|Red|Green/ })).not.toBeInTheDocument()
  })
})
