import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveStatus } from './SaveStatus'

const AT = new Date(2026, 10, 19, 14, 5)

describe('SaveStatus', () => {
  it('is a polite status region that stays in the page, empty when idle', () => {
    render(<SaveStatus status="idle" lastSavedAt={null} onRetry={() => {}} />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()
  })
  it('says Saving… with an icon', () => {
    render(<SaveStatus status="saving" lastSavedAt={null} onRetry={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')
    expect(screen.getByRole('status').querySelector('svg')).not.toBeNull()
  })
  it('says when it last saved', () => {
    render(<SaveStatus status="saved" lastSavedAt={AT} onRetry={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent(/^Saved at \d{1,2}:05/)
  })
  it('says the text is still there after a failure and offers Try again at 44px with a focus ring', async () => {
    const onRetry = vi.fn()
    render(<SaveStatus status="error" lastSavedAt={null} onRetry={onRetry} />)
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't save. Your text is still here.")
    const b = screen.getByRole('button', { name: 'Try again' })
    expect(b.className).toMatch(/min-h-11/)
    expect(b.className).toMatch(/min-w-11/)
    expect(b.className).toMatch(/focus-visible:outline-white/)
    await userEvent.setup().click(b)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
  it('says it is offline and will save later', () => {
    render(<SaveStatus status="offline" lastSavedAt={null} onRetry={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent("Offline. Will save when you're back")
    expect(screen.getByRole('status').querySelector('svg')).not.toBeNull()
  })
})
