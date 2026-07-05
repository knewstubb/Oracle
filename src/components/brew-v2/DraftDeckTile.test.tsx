import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftDeckTile, type DraftDeck } from './DraftDeckTile'

const defaultDeck: DraftDeck = {
  id: 7,
  name: 'Nekusar Wheels',
  commanderName: 'Nekusar, the Mindrazer',
  cardCount: 45,
  colourIdentity: ['U', 'B', 'R'],
}

describe('DraftDeckTile', () => {
  const onContinue = vi.fn()
  const onDelete = vi.fn()

  beforeEach(() => {
    onContinue.mockClear()
    onDelete.mockClear()
  })

  it('renders with dashed blue border', () => {
    const { container } = render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const tile = container.firstElementChild as HTMLElement
    expect(tile.className).toContain('border-dashed')
    expect(tile.className).toContain('border-blue-400/30')
  })

  it('renders "Draft" badge with blue styling', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const badge = screen.getByText('Draft')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('text-[#378ADD]')
    expect(badge.className).toContain('bg-blue-500/20')
  })

  it('renders commander name', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    expect(screen.getByText('Nekusar, the Mindrazer')).toBeInTheDocument()
  })

  it('renders card count as fraction (e.g. 45/100)', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    expect(screen.getByText('45/100')).toBeInTheDocument()
  })

  it('renders colour identity bars', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    expect(screen.getByRole('img', { name: 'Blue, Black, Red' })).toBeInTheDocument()
  })

  it('has accessible aria-label on tile container', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    expect(
      screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    ).toBeInTheDocument()
  })

  // --- Hover interactions ---

  it('does not show action buttons initially', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    expect(screen.queryByText('Continue brewing')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete draft')).not.toBeInTheDocument()
  })

  it('shows "Continue brewing" and "Delete draft" on hover', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    expect(screen.getByText('Continue brewing')).toBeInTheDocument()
    expect(screen.getByText('Delete draft')).toBeInTheDocument()
  })

  it('hides actions on mouseleave', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.mouseLeave(tile)
    expect(screen.queryByText('Continue brewing')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete draft')).not.toBeInTheDocument()
  })

  it('calls onContinue with deck id when "Continue brewing" is clicked', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Continue brewing'))
    expect(onContinue).toHaveBeenCalledWith(7)
  })

  // --- Delete confirmation ---

  it('shows inline confirmation when "Delete draft" is clicked', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete draft'))

    expect(
      screen.getByText((_content, node) => {
        return node?.textContent === 'Delete \u201cNekusar Wheels\u201d?' && node.tagName === 'P'
      })
    ).toBeInTheDocument()
    expect(screen.getByText('This will permanently remove the draft.')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('restores hover state on "Cancel" click', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete draft'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('Continue brewing')).toBeInTheDocument()
    expect(screen.getByText('Delete draft')).toBeInTheDocument()
  })

  it('calls onDelete with deck id on "Delete" confirm', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete draft'))
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledWith(7)
  })

  it('confirmation "Delete" button has destructive styling', () => {
    render(
      <DraftDeckTile deck={defaultDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    const tile = screen.getByLabelText('Draft deck: Nekusar Wheels — Nekusar, the Mindrazer')
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete draft'))
    const deleteBtn = screen.getByText('Delete')
    expect(deleteBtn.className).toContain('text-[#E24B4A]')
    expect(deleteBtn.className).toContain('bg-[rgba(226,75,74,0.15)]')
  })

  it('handles empty colour identity gracefully', () => {
    const emptyDeck = { ...defaultDeck, colourIdentity: [] }
    render(
      <DraftDeckTile deck={emptyDeck} onContinue={onContinue} onDelete={onDelete} />
    )
    expect(screen.queryByRole('img', { name: /White|Blue|Black|Red|Green/ })).not.toBeInTheDocument()
  })
})
