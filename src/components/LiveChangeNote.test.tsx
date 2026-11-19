import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiveChangeNote } from './LiveChangeNote'
describe('LiveChangeNote', () => {
  it('shows nothing when there is no note', () => {
    render(<LiveChangeNote note={null} onSeeHistory={() => {}} />)
    expect(screen.queryByTestId('live-change-note')).toBeNull()
  })
  it('says what happened in one line and opens History', async () => {
    const onSeeHistory = vi.fn()
    render(<LiveChangeNote note={{ fading: false }} onSeeHistory={onSeeHistory} />)
    expect(screen.getByRole('status')).toHaveTextContent('Claude just changed this deck.')
    await userEvent.click(screen.getByRole('button', { name: 'See in History' }))
    expect(onSeeHistory).toHaveBeenCalled()
  })
  it('fades out while fading', () => {
    render(<LiveChangeNote note={{ fading: true }} onSeeHistory={() => {}} />)
    expect(screen.getByTestId('live-change-note').className).toContain('opacity-0')
  })
})
