import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DeckStateBadge } from './DeckStateBadge'

describe('DeckStateBadge', () => {
  it('renders Draft with count suffix', () => {
    render(<DeckStateBadge state="draft" sleeved={82} required={100} />)
    expect(screen.getByText(/Draft/)).toBeInTheDocument()
    expect(screen.getByLabelText('Draft · 82/100')).toBeInTheDocument()
  })

  it('renders Assembling with "sleeved" suffix', () => {
    render(<DeckStateBadge state="assembling" sleeved={87} required={100} />)
    expect(screen.getByText(/Assembling/)).toBeInTheDocument()
    expect(
      screen.getByLabelText('Assembling · 87/100 sleeved')
    ).toBeInTheDocument()
  })

  it('renders Playable with proxy count when proxies are used', () => {
    render(
      <DeckStateBadge
        state="playable"
        sleeved={100}
        required={100}
        proxyCount={6}
      />
    )
    expect(screen.getByText(/Playable/)).toBeInTheDocument()
    expect(screen.getByText(/6 proxies/)).toBeInTheDocument()
    expect(
      screen.getByLabelText('Playable · 6 proxies')
    ).toBeInTheDocument()
  })

  it('renders Playable without count suffix when no proxies are used', () => {
    render(<DeckStateBadge state="playable" sleeved={100} required={100} />)
    expect(screen.getByText('Playable')).toBeInTheDocument()
    expect(screen.queryByText('100/100')).not.toBeInTheDocument()
  })

  it('renders Checking… with spinner and no count', () => {
    render(<DeckStateBadge state="checking" sleeved={0} required={100} />)
    expect(screen.getByText('Checking…')).toBeInTheDocument()
    expect(screen.queryByText('0/100')).not.toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument()
  })

  it('renders failed state with em-dash count and Try again', async () => {
    const onRetry = vi.fn()
    render(
      <DeckStateBadge
        state="failed"
        sleeved={0}
        required={100}
        onRetry={onRetry}
      />
    )
    expect(screen.getByText(/Couldn't check/)).toBeInTheDocument()
    expect(screen.getByText(/—\/100/)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Try again' })
    await userEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('omits Try again when onRetry is not provided', () => {
    render(<DeckStateBadge state="failed" sleeved={0} required={100} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('uses Casual-style count when required is null', () => {
    render(<DeckStateBadge state="assembling" sleeved={40} required={null} />)
    expect(screen.getByText(/40 sleeved/)).toBeInTheDocument()
  })
})
