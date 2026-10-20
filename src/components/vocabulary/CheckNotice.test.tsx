import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CheckNotice } from './CheckNotice'

describe('CheckNotice', () => {
  it('renders failed notice with alert role and Try again', async () => {
    const onRetry = vi.fn()
    render(<CheckNotice kind="failed" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByText(
        "Couldn't check availability for this deck. Your cards and sleeves haven't changed."
      )
    ).toBeInTheDocument()

    const button = screen.getByRole('button', { name: 'Try again' })
    await userEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders stale notice with formatted time and Refresh', async () => {
    const onRetry = vi.fn()
    const checkedAt = new Date(2026, 9, 12, 10, 42, 0)
    render(<CheckNotice kind="stale" checkedAt={checkedAt} onRetry={onRetry} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    // Time format is locale-dependent; assert on the static prefix and button.
    expect(screen.getByText(/Last checked/)).toBeInTheDocument()

    const button = screen.getByRole('button', { name: 'Refresh' })
    await userEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders stale notice with em-dash when checkedAt is missing', () => {
    render(<CheckNotice kind="stale" onRetry={vi.fn()} />)
    expect(screen.getByText('Last checked —')).toBeInTheDocument()
  })
})
