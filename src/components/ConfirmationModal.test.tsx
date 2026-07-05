import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmationModal } from './ConfirmationModal'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

describe('ConfirmationModal', () => {
  const defaultProps = {
    open: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    title: 'Confirm action?',
    description: 'This will update tags.',
    confirmLabel: 'Apply',
    isLoading: false,
  }

  it('renders title and description when open', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByText('Confirm action?')).toBeInTheDocument()
    expect(screen.getByText('This will update tags.')).toBeInTheDocument()
  })

  it('renders children content', () => {
    render(
      <ConfirmationModal {...defaultProps}>
        <p>Change summary here</p>
      </ConfirmationModal>
    )
    expect(screen.getByText('Change summary here')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('disables buttons when isLoading', () => {
    render(<ConfirmationModal {...defaultProps} isLoading={true} />)
    expect(screen.getByRole('button', { name: /applying/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('shows "Applying..." text when isLoading', () => {
    render(<ConfirmationModal {...defaultProps} isLoading={true} />)
    expect(screen.getByText('Applying...')).toBeInTheDocument()
  })

  it('has role="alertdialog"', () => {
    render(<ConfirmationModal {...defaultProps} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
