import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardDataSection } from './CardDataSection'
import { CardDataStaleNotice } from './CardDataStaleNotice'

const idle = { phase: 'idle', message: null, startedAt: null, finishedAt: null, processed: 0 }
const status = (over: object = {}) => ({
  lastSyncedAt: '2026-10-19T12:00:00Z',
  isStale: false,
  ageDays: 1,
  totalPrintings: 100,
  refresh: idle,
  ...over,
})

function mockFetch(responses: Array<{ ok?: boolean; status?: number; body: unknown }>) {
  const fn = vi.fn()
  responses.forEach((r) =>
    fn.mockImplementationOnce(async () => ({ ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body }))
  )
  fn.mockImplementation(async () => ({ ok: true, status: 200, json: async () => responses[responses.length - 1].body }))
  global.fetch = fn as never
  return fn
}
const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
  )

beforeEach(() => vi.clearAllMocks())

describe('CardDataSection', () => {
  it('shows the last updated date and a refresh button', async () => {
    mockFetch([{ body: status() }])
    wrap(<CardDataSection />)
    expect(await screen.findByText(/Last updated: Oct (19|20), 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refresh card data/ })).toBeEnabled()
  })
  it('warns when out of date', async () => {
    mockFetch([{ body: status({ isStale: true, ageDays: 90 }) }])
    wrap(<CardDataSection />)
    expect(await screen.findByText(/out of date/)).toBeInTheDocument()
  })
  it('shows running state and disables the button', async () => {
    mockFetch([{ body: status({ refresh: { ...idle, phase: 'running', message: 'Saving cards…' } }) }])
    wrap(<CardDataSection />)
    expect(await screen.findByText(/Saving cards…/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refreshing/ })).toBeDisabled()
  })
  it('starts a refresh on click and shows a failure message', async () => {
    const fetchFn = mockFetch([
      { body: status() },
      { status: 202, body: { started: true } },
      { body: status({ refresh: { ...idle, phase: 'failed', message: 'Card data could not be refreshed.' } }) },
    ])
    wrap(<CardDataSection />)
    await userEvent.click(await screen.findByRole('button', { name: /Refresh card data/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be refreshed')
    expect(fetchFn).toHaveBeenCalledWith('/api/card-data/refresh', { method: 'POST' })
  })
  it('shows a success message', async () => {
    mockFetch([{ body: status({ refresh: { ...idle, phase: 'succeeded', message: 'Card data updated — 5 cards refreshed.' } }) }])
    wrap(<CardDataSection />)
    expect(await screen.findByText(/Card data updated/)).toBeInTheDocument()
  })
})

describe('CardDataStaleNotice', () => {
  it('shows a one-line notice with a Settings link when stale', async () => {
    mockFetch([{ body: status({ isStale: true, ageDays: 90 }) }])
    wrap(<CardDataStaleNotice />)
    expect(await screen.findByText(/Card data is 90 days old/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Refresh in Settings/ })).toHaveAttribute('href', '/settings')
  })
  it('renders nothing when fresh', async () => {
    const f = mockFetch([{ body: status() }])
    const { container } = wrap(<CardDataStaleNotice />)
    await waitFor(() => expect(f).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(container).toBeEmptyDOMElement()
  })
})
