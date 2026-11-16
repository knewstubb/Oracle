import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>()
  return { ...real, fetchConnectionStatus: vi.fn(), switchConnection: vi.fn(), enableConnection: vi.fn() }
})

import { toast } from 'sonner'
import * as api from './api'
import { ConnectionTab } from './ConnectionTab'

const active: api.ConnectionStatus = { state: 'active', connectionId: 'c1', email: 'brad@example.com', lastUsedAt: new Date().toISOString(), clientName: 'Claude on the phone' }

function setup(onShowGuide = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ConnectionTab onShowGuide={onShowGuide} /></QueryClientProvider>)
}

beforeEach(() => vi.resetAllMocks())

describe('ConnectionTab', () => {
  it('loading: switch disabled, badge Checking…', () => {
    vi.mocked(api.fetchConnectionStatus).mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('Checking…')
    expect(screen.getByRole('switch', { name: 'Let Claude use Oracle' })).toBeDisabled()
  })

  it('active: badge, switch on, connected line', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue(active)
    setup()
    expect(await screen.findByText(/Claude is connected as brad@example.com/)).toBeInTheDocument()
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('Active')
    expect(screen.getByRole('switch', { name: 'Let Claude use Oracle' })).toHaveAttribute('aria-checked', 'true')
  })

  it('off: badge Off, switch off', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue({ ...active, state: 'off', connectionId: null })
    setup()
    await waitFor(() => expect(screen.getByTestId('connection-badge')).toHaveTextContent('Off'))
    expect(screen.getByRole('switch', { name: 'Let Claude use Oracle' })).toHaveAttribute('aria-checked', 'false')
  })

  it('error reading status: never shows Off, offers Try again', async () => {
    vi.mocked(api.fetchConnectionStatus).mockRejectedValue(new Error('x'))
    setup()
    expect(await screen.findByText("We couldn't check whether Claude is connected. It may still be.")).toBeInTheDocument()
    expect(screen.getByTestId('connection-badge')).not.toHaveTextContent(/^Off$/)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('switching off needs no confirm, shows the notice and a toast', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue(active)
    vi.mocked(api.switchConnection).mockResolvedValue({ ok: true })
    setup()
    await userEvent.click(await screen.findByRole('switch', { name: 'Let Claude use Oracle' }))
    expect(api.switchConnection).toHaveBeenCalledWith('c1')
    expect(await screen.findByText(/Claude can no longer reach Oracle/)).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('Claude is switched off.')
    expect(screen.getByRole('switch', { name: 'Let Claude use Oracle' })).toHaveAttribute('aria-checked', 'false')
  })

  it('a failed switch-off puts the switch back and says so loudly', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue(active)
    vi.mocked(api.switchConnection).mockResolvedValue({ ok: false })
    setup()
    await userEvent.click(await screen.findByRole('switch', { name: 'Let Claude use Oracle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't switch Claude off. Try again. If it keeps failing, change your Oracle password.")
    expect(screen.getByRole('switch', { name: 'Let Claude use Oracle' })).toHaveAttribute('aria-checked', 'true')
  })

  it('expired login: alert and reconnect button', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue({ ...active, state: 'expired' })
    setup()
    expect(await screen.findByText(/sign-in has expired/)).toBeInTheDocument()
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('Needs reconnecting')
    expect(screen.getByRole('button', { name: 'Show me how to reconnect' })).toBeInTheDocument()
  })

  it('switching on from off re-enables the same connection', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValueOnce({ ...active, state: 'off' }).mockResolvedValue(active)
    vi.mocked(api.enableConnection).mockResolvedValue({ ok: true })
    setup()
    const sw = await screen.findByRole('switch', { name: 'Let Claude use Oracle' })
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'))
    await userEvent.click(sw)
    expect(api.enableConnection).toHaveBeenCalledWith('c1')
    await waitFor(() => expect(screen.getByTestId('connection-badge')).toHaveTextContent('Active'))
    expect(toast).toHaveBeenCalledWith('Claude is switched on.')
    expect(screen.getByRole('switch', { name: 'Let Claude use Oracle' })).toHaveAttribute('aria-checked', 'true')
  })

  it('switching on when Claude signed out shows Needs reconnecting and opens the guide', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue({ ...active, state: 'off' })
    vi.mocked(api.enableConnection).mockResolvedValue({ ok: false, needsReconnect: true })
    const guide = vi.fn()
    setup(guide)
    const sw = await screen.findByRole('switch', { name: 'Let Claude use Oracle' })
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'))
    await userEvent.click(sw)
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign-in has expired/)
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('Needs reconnecting')
    await userEvent.click(screen.getByRole('button', { name: 'Show me how to reconnect' }))
    expect(guide).toHaveBeenCalled()
  })

  it('switching on when nothing was ever connected goes straight to reconnecting', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue({ ...active, state: 'off', connectionId: null })
    setup()
    const sw = await screen.findByRole('switch', { name: 'Let Claude use Oracle' })
    await waitFor(() => expect(sw).not.toBeDisabled())
    await userEvent.click(sw)
    expect(api.enableConnection).not.toHaveBeenCalled()
    expect(await screen.findByText(/sign-in has expired/)).toBeInTheDocument()
  })

  it('a failed switch-on says so and stays off', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue({ ...active, state: 'off' })
    vi.mocked(api.enableConnection).mockResolvedValue({ ok: false, needsReconnect: false })
    setup()
    const sw = await screen.findByRole('switch', { name: 'Let Claude use Oracle' })
    await waitFor(() => expect(sw).not.toBeDisabled())
    await userEvent.click(sw)
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't switch Claude on. Try again.")
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('switch on while expired explains reconnecting without calling the server', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue({ ...active, state: 'expired' })
    setup()
    const sw = await screen.findByRole('switch', { name: 'Let Claude use Oracle' })
    await waitFor(() => expect(sw).not.toBeDisabled())
    await userEvent.click(sw)
    expect(api.enableConnection).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Show me how to reconnect' })).toBeInTheDocument()
  })

  it('panel puts "Take any card out of your collection" under can\'t, and offers no remove control', async () => {
    vi.mocked(api.fetchConnectionStatus).mockResolvedValue(active)
    setup()
    const cant = (await screen.findByText("Claude can't", { selector: 'p' })).parentElement as HTMLElement
    expect(cant).toHaveTextContent('Take any card out of your collection')
    expect(screen.getByText(/These limits are enforced by Oracle, not by Claude's own prompts/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })
})
