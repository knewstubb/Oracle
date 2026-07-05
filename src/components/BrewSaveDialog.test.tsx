import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrewSaveDialog } from './BrewSaveDialog'

describe('BrewSaveDialog', () => {
  const defaultProps = {
    commanderName: 'Muldrotha, the Gravetide',
    defaultDeckName: 'Muldrotha Graveyard',
    cardCount: 100,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    isSaving: false,
    error: null,
  }

  it('renders the heading and deck name input with default value', () => {
    render(<BrewSaveDialog {...defaultProps} />)
    expect(screen.getByRole('heading', { name: 'Save Deck' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Muldrotha Graveyard')).toBeInTheDocument()
  })

  it('displays 100/100 cards with checkmark when card count is 100', () => {
    render(<BrewSaveDialog {...defaultProps} />)
    expect(screen.getByText('100/100 cards ✓')).toBeInTheDocument()
  })

  it('displays warning when card count is not 100', () => {
    render(<BrewSaveDialog {...defaultProps} cardCount={98} />)
    expect(screen.getByText('98/100 cards ⚠️')).toBeInTheDocument()
  })

  it('defaults the Archidekt toggle to checked', () => {
    render(<BrewSaveDialog {...defaultProps} />)
    const toggle = screen.getByRole('checkbox', { name: /also create in archidekt/i })
    expect(toggle).toBeChecked()
  })

  it('calls onSave with deck name and pushToArchidekt when Save clicked', () => {
    const onSave = vi.fn()
    render(<BrewSaveDialog {...defaultProps} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save Deck' }))
    expect(onSave).toHaveBeenCalledWith({
      deckName: 'Muldrotha Graveyard',
      pushToArchidekt: true,
    })
  })

  it('calls onSave with updated name and unchecked Archidekt toggle', () => {
    const onSave = vi.fn()
    render(<BrewSaveDialog {...defaultProps} onSave={onSave} />)

    const input = screen.getByDisplayValue('Muldrotha Graveyard')
    fireEvent.change(input, { target: { value: 'Sultai Value' } })

    const toggle = screen.getByRole('checkbox', { name: /also create in archidekt/i })
    fireEvent.click(toggle)

    fireEvent.click(screen.getByRole('button', { name: 'Save Deck' }))
    expect(onSave).toHaveBeenCalledWith({
      deckName: 'Sultai Value',
      pushToArchidekt: false,
    })
  })

  it('disables Save button when deck name is empty', () => {
    render(<BrewSaveDialog {...defaultProps} />)
    const input = screen.getByDisplayValue('Muldrotha Graveyard')
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save Deck' })).toBeDisabled()
  })

  it('disables Save button and shows spinner when isSaving', () => {
    render(<BrewSaveDialog {...defaultProps} isSaving={true} />)
    const saveButton = screen.getByRole('button', { name: /saving/i })
    expect(saveButton).toBeDisabled()
    expect(screen.getByText('Saving…')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn()
    render(<BrewSaveDialog {...defaultProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('displays error message when error prop is provided', () => {
    render(<BrewSaveDialog {...defaultProps} error="Failed to save deck" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to save deck')
  })

  it('does not render error when error prop is null', () => {
    render(<BrewSaveDialog {...defaultProps} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
