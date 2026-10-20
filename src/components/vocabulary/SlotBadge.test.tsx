import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    render,
  }: {
    children?: React.ReactNode
    render?: React.ReactElement
  }) => render ?? <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}))

import { SlotBadge } from './SlotBadge'

describe('SlotBadge', () => {
  describe('badge variant', () => {
    it('renders Original with check icon for original state', () => {
      render(<SlotBadge state="original" />)
      expect(screen.getByText('Original')).toBeInTheDocument()
      expect(screen.getByLabelText('Sleeved, original')).toBeInTheDocument()
    })

    it('renders Proxy with comedy_mask icon and proxy token', () => {
      render(<SlotBadge state="proxy" />)
      const badge = screen.getByLabelText('Sleeved, proxy')
      expect(screen.getByText('Proxy')).toBeInTheDocument()
      expect(badge.parentElement).toHaveAttribute(
        'style',
        expect.stringContaining('background-color: var(--state-proxy-bg)')
      )
      expect(badge.parentElement).toHaveAttribute(
        'style',
        expect.stringContaining('border: 1px solid transparent')
      )
    })

    it('renders Basic with landscape icon for basic state', () => {
      render(<SlotBadge state="basic" />)
      expect(screen.getByText('Basic')).toBeInTheDocument()
      expect(screen.getByLabelText('Sleeved, basic')).toBeInTheDocument()
    })

    it('renders Available as outline badge', () => {
      render(<SlotBadge state="available" />)
      const badge = screen.getByLabelText('Unsleeved, available')
      expect(screen.getByText('Available')).toBeInTheDocument()
      expect(badge.parentElement).toHaveAttribute(
        'style',
        expect.stringContaining('border: 1px solid var(--state-available)')
      )
    })

    it('renders Alt available with swap_horiz icon', () => {
      render(<SlotBadge state="alt_available" />)
      expect(screen.getByText('Alt available')).toBeInTheDocument()
      expect(screen.getByLabelText('Unsleeved, alt available')).toBeInTheDocument()
    })

    it('renders Proxy available as loud outline badge', () => {
      render(<SlotBadge state="proxy_available" />)
      const badge = screen.getByLabelText('Unsleeved, proxy available')
      expect(screen.getByText('Proxy available')).toBeInTheDocument()
      expect(badge.parentElement).toHaveAttribute(
        'style',
        expect.stringContaining('border: 1px solid var(--state-proxy-available)')
      )
      expect(badge.parentElement).toHaveAttribute(
        'style',
        expect.stringContaining('background-color: var(--state-proxy-available-bg)')
      )
    })

    it('renders Unavailable with reason line', () => {
      render(<SlotBadge state="unavailable" reason="In Korvold" />)
      expect(screen.getByText('Unavailable')).toBeInTheDocument()
      expect(screen.getByText('In Korvold')).toBeInTheDocument()
      expect(
        screen.getByLabelText('Unsleeved, unavailable, In Korvold')
      ).toBeInTheDocument()
    })

    it('renders Unowned with do_not_disturb_on icon', () => {
      render(<SlotBadge state="unowned" />)
      const badge = screen.getByLabelText('Unsleeved, unowned')
      expect(screen.getByText('Unowned')).toBeInTheDocument()
      expect(badge.parentElement).toHaveAttribute(
        'style',
        expect.stringContaining('border: 1px solid var(--state-unowned)')
      )
      expect(badge.parentElement).toHaveAttribute(
        'style',
        expect.stringContaining('background-color: var(--state-unowned-bg)')
      )
    })

    it('renders Checking… with spinner', () => {
      render(<SlotBadge state="checking" />)
      expect(screen.getByText('Checking…')).toBeInTheDocument()
      expect(screen.getByLabelText('Unsleeved, checking…')).toBeInTheDocument()
      expect(document.querySelector('svg')).toBeInTheDocument()
    })

    it('renders failed badge with Try again button', async () => {
      const onRetry = vi.fn()
      render(<SlotBadge state="failed" onRetry={onRetry} />)
      expect(screen.getByText(/Couldn't check/)).toBeInTheDocument()
      const button = screen.getByRole('button', { name: 'Try again' })
      await userEvent.click(button)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('does not render Try again when onRetry is omitted', () => {
      render(<SlotBadge state="failed" />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('icon variant', () => {
    it('renders a circular icon for original state', () => {
      render(<SlotBadge state="original" variant="icon" />)
      expect(screen.getByLabelText('Sleeved, original')).toBeInTheDocument()
    })

    it('renders tooltip content with reason for icon variant', () => {
      render(<SlotBadge state="unavailable" variant="icon" reason="In 2 decks" />)
      expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
        'UnavailableIn 2 decks'
      )
    })

    it('supports md size', () => {
      render(<SlotBadge state="proxy" variant="icon" size="md" />)
      const badge = screen.getByLabelText('Sleeved, proxy')
      expect(badge).toHaveStyle({ width: '24px', height: '24px' })
    })
  })
})
