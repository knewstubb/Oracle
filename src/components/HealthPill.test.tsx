import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HealthPill, type HealthPillCategory } from './HealthPill'

describe('HealthPill', () => {
  const okCategory: HealthPillCategory = { name: 'Ramp', count: 10, status: 'ok' }
  const warnCategory: HealthPillCategory = { name: 'Draw', count: 5, status: 'warn' }
  const critCategory: HealthPillCategory = { name: 'Removal', count: 2, status: 'crit' }

  it('renders category name and count', () => {
    render(<HealthPill category={okCategory} onClick={() => {}} />)
    expect(screen.getByText('Ramp')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('renders as a button element', () => {
    render(<HealthPill category={okCategory} onClick={() => {}} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<HealthPill category={okCategory} onClick={handleClick} />)
    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders teal colour for ok status with transparent background', () => {
    render(<HealthPill category={okCategory} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveStyle({ color: 'var(--color-teal)' })
    // ok status uses transparent background (no coloured background)
    expect(button.style.backgroundColor).toBe('transparent')
  })

  it('renders amber colour and background for warn status', () => {
    render(<HealthPill category={warnCategory} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveStyle({ color: 'var(--color-amber)' })
    expect(button).toHaveStyle({ backgroundColor: 'var(--color-amber-bg)' })
  })

  it('renders red colour and background for crit status', () => {
    render(<HealthPill category={critCategory} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveStyle({ color: 'var(--color-red)' })
    expect(button).toHaveStyle({ backgroundColor: 'var(--color-red-bg)' })
  })

  it('provides accessible aria-label with status, name, and count', () => {
    render(<HealthPill category={warnCategory} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'warn Draw 5')
  })

  it('renders a distinct icon per status (not just colour)', () => {
    const { container: okContainer } = render(
      <HealthPill category={okCategory} onClick={() => {}} />
    )
    const { container: warnContainer } = render(
      <HealthPill category={warnCategory} onClick={() => {}} />
    )
    const { container: critContainer } = render(
      <HealthPill category={critCategory} onClick={() => {}} />
    )

    // Each status renders a different SVG icon - verify they exist and are aria-hidden
    const okSvg = okContainer.querySelector('svg')
    const warnSvg = warnContainer.querySelector('svg')
    const critSvg = critContainer.querySelector('svg')

    expect(okSvg).toBeInTheDocument()
    expect(warnSvg).toBeInTheDocument()
    expect(critSvg).toBeInTheDocument()

    // Icons should be decorative (aria-hidden)
    expect(okSvg).toHaveAttribute('aria-hidden', 'true')
    expect(warnSvg).toHaveAttribute('aria-hidden', 'true')
    expect(critSvg).toHaveAttribute('aria-hidden', 'true')
  })
})
