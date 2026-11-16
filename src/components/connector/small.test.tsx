import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>()
  return { ...real, fetchPendingCount: vi.fn(), fetchMovedSlots: vi.fn() }
})

import * as api from './api'
import { PendingChip } from './PendingChip'
import { MovedSlotNote, useMovedSlots } from './MovedSlotNote'

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}
beforeEach(() => vi.resetAllMocks())

describe('PendingChip', () => {
  it('shows count and links to Recent changes while n > 0', async () => {
    vi.mocked(api.fetchPendingCount).mockResolvedValue(2)
    wrap(<PendingChip />)
    const link = await screen.findByRole('link', { name: /2 Claude is waiting for your yes/ })
    expect(link).toHaveAttribute('href', '/settings/claude-connector?tab=changes#waiting')
  })
  it('renders nothing at 0', async () => {
    vi.mocked(api.fetchPendingCount).mockResolvedValue(0)
    const { container } = wrap(<PendingChip />)
    await waitFor(() => expect(api.fetchPendingCount).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
  it('renders nothing when the count fails', async () => {
    vi.mocked(api.fetchPendingCount).mockRejectedValue(new Error('x'))
    const { container } = wrap(<PendingChip />)
    await waitFor(() => expect(api.fetchPendingCount).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('MovedSlotNote', () => {
  const slot: api.MovedSlot = { slot_id: 5, card_name: 'Sol Ring', moved_to_deck_id: 9, moved_to_deck_name: 'Korvold', at: '2026-11-14T10:55:00Z', client_name: 'Claude', approved_by_owner: true }
  it('shows Unavailable, In {deck}, Open {deck} and the one history line', () => {
    wrap(<MovedSlotNote slot={slot} />)
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText('In Korvold')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Korvold' })).toHaveAttribute('href', '/decks/9')
    expect(screen.getByText(/Was in this deck\. Claude moved this copy to Korvold on .*\(you approved it\)\./)).toBeInTheDocument()
  })
  it('useMovedSlots keys by slot id and tolerates a failed lookup', async () => {
    vi.mocked(api.fetchMovedSlots).mockResolvedValue([slot])
    function Probe() {
      const m = useMovedSlots(3)
      return <span>{m.has(5) ? 'has' : 'none'}</span>
    }
    wrap(<Probe />)
    expect(await screen.findByText('has')).toBeInTheDocument()
  })
})
