import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  describe('Brew status', () => {
    it('renders "Brew" text', () => {
      render(<StatusBadge status="brew" />)
      expect(screen.getByText('Brew')).toBeInTheDocument()
    })

    it('uses teal color token class and background class', () => {
      render(<StatusBadge status="brew" />)
      const badge = screen.getByLabelText('Status: Brew')
      expect(badge.className).toContain('text-[var(--accent-primary)]')
      expect(badge.className).toContain('bg-[var(--accent-primary-bg)]')
    })
  })

  describe('Built status (display rename from Boxed)', () => {
    it('renders "Built" text', () => {
      render(<StatusBadge status="boxed" />)
      expect(screen.getByText('Built')).toBeInTheDocument()
    })

    it('uses teal color token class and background class', () => {
      render(<StatusBadge status="boxed" />)
      const badge = screen.getByLabelText('Status: Built')
      expect(badge.className).toContain('text-[var(--accent-primary)]')
      expect(badge.className).toContain('bg-[var(--accent-primary-bg)]')
    })
  })

  describe('Archived status', () => {
    it('renders "Archived" text', () => {
      render(<StatusBadge status="archived" />)
      expect(screen.getByText('Archived')).toBeInTheDocument()
    })

    it('uses secondary text color token and subtle background class', () => {
      render(<StatusBadge status="archived" />)
      const badge = screen.getByLabelText('Status: Archived')
      expect(badge.className).toContain('text-[var(--text-secondary)]')
      expect(badge.className).toContain('bg-[rgba(255,255,255,0.08)]')
    })
  })

  describe('Accessibility', () => {
    it('has aria-label indicating the status', () => {
      render(<StatusBadge status="brew" />)
      expect(screen.getByLabelText('Status: Brew')).toBeInTheDocument()
    })
  })

  describe('Custom className', () => {
    it('applies additional className when provided', () => {
      render(<StatusBadge status="brew" className="ml-2" />)
      const badge = screen.getByLabelText('Status: Brew')
      expect(badge.className).toContain('ml-2')
    })
  })
})
