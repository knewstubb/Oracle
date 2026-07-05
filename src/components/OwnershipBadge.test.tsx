import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OwnershipBadge } from './OwnershipBadge'

describe('OwnershipBadge', () => {
  describe('Original state', () => {
    it('renders ● symbol and "Original" text', () => {
      render(<OwnershipBadge status="original" />)
      expect(screen.getByText('●')).toBeInTheDocument()
      expect(screen.getByText('Original')).toBeInTheDocument()
    })

    it('uses teal background and text colour', () => {
      render(<OwnershipBadge status="original" />)
      const badge = screen.getByLabelText('Original')
      expect(badge.className).toContain('text-teal-600')
      expect(badge.className).toContain('bg-teal-50')
    })

    it('has correct aria-label', () => {
      render(<OwnershipBadge status="original" />)
      expect(screen.getByLabelText('Original')).toBeInTheDocument()
    })
  })

  describe('Proxy state', () => {
    it('renders ◐ symbol and "Proxy" text', () => {
      render(<OwnershipBadge status="proxy" />)
      expect(screen.getByText('◐')).toBeInTheDocument()
      expect(screen.getByText('Proxy')).toBeInTheDocument()
    })

    it('uses amber background and text colour', () => {
      render(<OwnershipBadge status="proxy" holderDeckName="Yedora" />)
      const badge = screen.getByLabelText('Proxy — Original held by Yedora')
      expect(badge.className).toContain('text-amber-600')
      expect(badge.className).toContain('bg-amber-50')
    })

    it('has aria-label including holder deck name when provided', () => {
      render(<OwnershipBadge status="proxy" holderDeckName="Ice Queen" />)
      expect(
        screen.getByLabelText('Proxy — Original held by Ice Queen')
      ).toBeInTheDocument()
    })

    it('has simple aria-label when no holderDeckName is provided', () => {
      render(<OwnershipBadge status="proxy" />)
      expect(screen.getByLabelText('Proxy')).toBeInTheDocument()
    })
  })

  describe('Not owned state', () => {
    it('renders ○ symbol and "Not owned" text', () => {
      render(<OwnershipBadge status="not_owned" />)
      expect(screen.getByText('○')).toBeInTheDocument()
      expect(screen.getByText('Not owned')).toBeInTheDocument()
    })

    it('uses muted background and text colour', () => {
      render(<OwnershipBadge status="not_owned" />)
      const badge = screen.getByLabelText('Not owned')
      expect(badge.className).toContain('text-gray-500')
      expect(badge.className).toContain('bg-gray-100')
    })

    it('has correct aria-label', () => {
      render(<OwnershipBadge status="not_owned" />)
      expect(screen.getByLabelText('Not owned')).toBeInTheDocument()
    })
  })

  describe('Layout classes', () => {
    it('applies inline-flex, items-center, gap-1, rounded-full, px-2, py-0.5, text-xs, font-medium', () => {
      render(<OwnershipBadge status="original" />)
      const badge = screen.getByLabelText('Original')
      expect(badge.className).toContain('inline-flex')
      expect(badge.className).toContain('items-center')
      expect(badge.className).toContain('gap-1')
      expect(badge.className).toContain('rounded-full')
      expect(badge.className).toContain('px-2')
      expect(badge.className).toContain('py-0.5')
      expect(badge.className).toContain('text-xs')
      expect(badge.className).toContain('font-medium')
    })
  })

  describe('Accessibility', () => {
    it('symbol has aria-hidden to prevent screen reader double-reading', () => {
      render(<OwnershipBadge status="original" />)
      const symbol = screen.getByText('●')
      expect(symbol).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
