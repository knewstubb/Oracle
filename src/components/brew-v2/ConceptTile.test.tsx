import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConceptTile } from './ConceptTile'
import type { DecisionLog } from '@/lib/brew-v2-types'

const mockDecisionLog: DecisionLog = {
  strategy: [
    { id: '1', key: 'ARCHETYPE', value: 'Aristocrats', sourceQuote: 'I like sacrifice', timestamp: 1000 },
    { id: '2', key: 'PLAYSTYLE', value: 'Engine-based value', sourceQuote: 'Build a machine', timestamp: 1001 },
  ],
  parameters: [
    { id: '3', key: 'COLOUR IDENTITY', value: 'Orzhov (WB)', sourceQuote: 'Black and white', timestamp: 1002 },
  ],
  constraints: [],
}

const emptyDecisionLog: DecisionLog = {
  strategy: [],
  parameters: [],
  constraints: [],
}

const defaultProps = {
  concept: {
    id: 42,
    decisionLog: mockDecisionLog,
    createdAt: '2026-06-20T10:30:00Z',
  },
  onContinue: vi.fn(),
  onDelete: vi.fn(),
}

describe('ConceptTile', () => {
  beforeEach(() => {
    defaultProps.onContinue.mockClear()
    defaultProps.onDelete.mockClear()
  })

  it('renders with dashed border style', () => {
    const { container } = render(<ConceptTile {...defaultProps} />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.style.border).toBe('1px dashed rgba(255, 255, 255, 0.2)')
  })

  it('renders "Concept" badge', () => {
    render(<ConceptTile {...defaultProps} />)
    const badge = screen.getByText('Concept')
    expect(badge).toBeInTheDocument()
  })

  it('displays up to 3 decision entries as preview', () => {
    render(<ConceptTile {...defaultProps} />)
    expect(screen.getByText('ARCHETYPE')).toBeInTheDocument()
    expect(screen.getByText('Aristocrats')).toBeInTheDocument()
    expect(screen.getByText('PLAYSTYLE')).toBeInTheDocument()
    expect(screen.getByText('Engine-based value')).toBeInTheDocument()
    expect(screen.getByText('COLOUR IDENTITY')).toBeInTheDocument()
    expect(screen.getByText('Orzhov (WB)')).toBeInTheDocument()
  })

  it('shows "No decisions yet" for empty decision log', () => {
    render(
      <ConceptTile
        {...defaultProps}
        concept={{ ...defaultProps.concept, decisionLog: emptyDecisionLog }}
      />
    )
    expect(screen.getByText('No decisions yet')).toBeInTheDocument()
  })

  it('renders created date', () => {
    render(<ConceptTile {...defaultProps} />)
    // Date formatting is locale-dependent, check for a date substring
    expect(screen.getByText(/Jun/)).toBeInTheDocument()
  })

  it('starts in idle state (no hover buttons visible)', () => {
    render(<ConceptTile {...defaultProps} />)
    expect(screen.queryByText('Continue exploring')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete concept')).not.toBeInTheDocument()
  })

  it('shows hover actions on mouseenter', () => {
    render(<ConceptTile {...defaultProps} />)
    const tile = screen.getByLabelText(/Concept session/)
    fireEvent.mouseEnter(tile)
    expect(screen.getByText('Continue exploring')).toBeInTheDocument()
    expect(screen.getByText('Delete concept')).toBeInTheDocument()
  })

  it('hides hover actions on mouseleave', () => {
    render(<ConceptTile {...defaultProps} />)
    const tile = screen.getByLabelText(/Concept session/)
    fireEvent.mouseEnter(tile)
    fireEvent.mouseLeave(tile)
    expect(screen.queryByText('Continue exploring')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete concept')).not.toBeInTheDocument()
  })

  it('calls onContinue with concept id on "Continue exploring" click', () => {
    render(<ConceptTile {...defaultProps} />)
    const tile = screen.getByLabelText(/Concept session/)
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Continue exploring'))
    expect(defaultProps.onContinue).toHaveBeenCalledWith(42)
  })

  it('transitions to confirming state on "Delete concept" click', () => {
    render(<ConceptTile {...defaultProps} />)
    const tile = screen.getByLabelText(/Concept session/)
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete concept'))
    // Confirmation UI should appear
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('restores hover state on "Cancel" click during confirmation', () => {
    render(<ConceptTile {...defaultProps} />)
    const tile = screen.getByLabelText(/Concept session/)
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete concept'))
    fireEvent.click(screen.getByText('Cancel'))
    // Should be back to hover state
    expect(screen.getByText('Continue exploring')).toBeInTheDocument()
    expect(screen.getByText('Delete concept')).toBeInTheDocument()
  })

  it('calls onDelete with concept id on confirm', () => {
    render(<ConceptTile {...defaultProps} />)
    const tile = screen.getByLabelText(/Concept session/)
    fireEvent.mouseEnter(tile)
    fireEvent.click(screen.getByText('Delete concept'))
    fireEvent.click(screen.getByText('Delete'))
    expect(defaultProps.onDelete).toHaveBeenCalledWith(42)
  })

  it('has accessible aria-label on tile', () => {
    render(<ConceptTile {...defaultProps} />)
    expect(screen.getByLabelText(/Concept session/)).toBeInTheDocument()
  })
})
