import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InlineDeleteConfirmation } from './InlineDeleteConfirmation'

describe('InlineDeleteConfirmation', () => {
  const defaultProps = {
    deckName: 'Nekusar Wheels',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    isDeleting: false,
  }

  it('renders the deck name in confirmation text', () => {
    render(<InlineDeleteConfirmation {...defaultProps} />)
    expect(
      screen.getByText((_, el) => el?.textContent === 'Delete \u201cNekusar Wheels\u201d?')
    ).toBeInTheDocument()
  })

  it('renders the permanent removal subtext', () => {
    render(<InlineDeleteConfirmation {...defaultProps} />)
    expect(
      screen.getByText('This will permanently remove the draft.')
    ).toBeInTheDocument()
  })

  it('renders Cancel and Delete buttons', () => {
    render(<InlineDeleteConfirmation {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<InlineDeleteConfirmation {...defaultProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onConfirm when Delete is clicked', () => {
    const onConfirm = vi.fn()
    render(<InlineDeleteConfirmation {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('disables both buttons when isDeleting is true', () => {
    render(<InlineDeleteConfirmation {...defaultProps} isDeleting={true} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /delet/i })).toBeDisabled()
  })

  it('shows "Deleting…" text when isDeleting', () => {
    render(<InlineDeleteConfirmation {...defaultProps} isDeleting={true} />)
    expect(screen.getByText('Deleting…')).toBeInTheDocument()
  })

  it('has role="alertdialog" for accessibility', () => {
    render(<InlineDeleteConfirmation {...defaultProps} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('styles the Delete button with destructive colouring', () => {
    render(<InlineDeleteConfirmation {...defaultProps} />)
    const deleteBtn = screen.getByRole('button', { name: 'Delete' })
    expect(deleteBtn.className).toContain('bg-[rgba(226,75,74,0.15)]')
    expect(deleteBtn.className).toContain('border-[rgba(226,75,74,0.3)]')
    expect(deleteBtn.className).toContain('text-[#E24B4A]')
  })
})
