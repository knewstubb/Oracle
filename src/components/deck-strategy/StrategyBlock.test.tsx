import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrategyBlock } from './StrategyBlock'
import type { StrategyWindowData } from '@/lib/deck-strategy-window'
const EMPTY: StrategyWindowData = { configured: false, bracket: null, summary: '', strategy: '', playgroup: '', updatedBy: null, updatedAt: null, canStoreNewFields: true, implied: null }
const SET: StrategyWindowData = { ...EMPTY, configured: true, bracket: 4, summary: 'Plants and recursion', updatedBy: 'owner', updatedAt: '2026-11-19T10:00:00Z' }
let getResponse: () => Promise<unknown>
let putResponse: (body: unknown) => Promise<unknown>
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === 'PUT' ? putResponse(JSON.parse(String(init.body))) : getResponse()))
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
beforeEach(() => {
  getResponse = async () => json(200, EMPTY)
  putResponse = async (b) => json(200, { ...SET, ...(b as object), notSaved: [] })
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
})
function renderBlock(onSeeHistory = vi.fn(), saltScore?: number | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { unmount } = render(
    <QueryClientProvider client={qc}>
      <StrategyBlock deckId={7} deckName="Yedora, the Explorer" saltScore={saltScore} onSeeHistory={onSeeHistory} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onSeeHistory, qc, unmount }
}
describe('Strategy block', () => {
  it('empty: a dashed "+ Set bracket" link chip (never amber), the summary prompt, and one Edit link that opens a dialog', async () => {
    renderBlock()
    const block = await screen.findByTestId('strategy-block')
    expect(block.tagName).toBe('DIV')
    expect(screen.getByRole('heading', { name: 'Strategy' })).toBeInTheDocument()
    const edit = screen.getByRole('button', { name: 'Edit strategy' })
    expect(edit).toHaveAttribute('aria-haspopup', 'dialog')
    const set = screen.getByTestId('set-bracket')
    expect(set).toHaveTextContent('+ Set bracket')
    expect(set.className).toMatch(/border-dashed/)
    expect(set.className).not.toMatch(/amber/)
    expect(block.querySelector('[class*="amber"]')).toBeNull()
    expect(block).not.toHaveTextContent('Not set')
    expect(block).toHaveTextContent('Add a one-line summary of how this deck plays')
    await userEvent.setup().click(set)
    expect(await screen.findByRole('dialog', { name: 'Strategy' })).toBeInTheDocument()
  })
  it('there is no whole-block button: only Edit, the set-bracket chip and the summary prompt open the window', async () => {
    renderBlock()
    await screen.findByTestId('strategy-block')
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit', '+ Set bracket', 'Add a one-line summary of how this deck plays'])
  })
  it('set: a "Bracket 4" chip and the summary', async () => {
    getResponse = async () => json(200, SET)
    renderBlock()
    const block = await screen.findByTestId('strategy-block')
    expect(screen.getByTestId('bracket-chip')).toHaveTextContent('Bracket 4')
    expect(screen.queryByTestId('set-bracket')).toBeNull()
    expect(block).toHaveTextContent('Plants and recursion')
    expect(screen.queryByTestId('strategy-block-warning')).toBeNull()
  })
  it('salt chip shows with a bracket and without one, in neutral colours, and is absent without a salt score', async () => {
    getResponse = async () => json(200, SET)
    const first = renderBlock(vi.fn(), 0.6)
    const chip = await screen.findByTestId('salt-chip')
    expect(chip).toHaveTextContent('Salt 0.6')
    expect(chip.className).not.toMatch(/amber|green|red|signal/)
    expect(screen.getByTestId('bracket-chip')).toBeInTheDocument()
    first.unmount()
    getResponse = async () => json(200, EMPTY)
    const second = renderBlock(vi.fn(), 1.7)
    expect(await screen.findByTestId('salt-chip')).toHaveTextContent('Salt 1.7')
    expect(screen.getByTestId('set-bracket')).toBeInTheDocument()
    second.unmount()
    renderBlock(vi.fn(), null)
    await screen.findByTestId('strategy-block')
    expect(screen.queryByTestId('salt-chip')).toBeNull()
  })
  it('bracket exceeded: the same sentence as the window, with an icon', async () => {
    getResponse = async () => json(200, { ...SET, bracket: 3, implied: { minimumBracket: 4, basedOn: '4 Game Changers' } })
    renderBlock()
    const w = await screen.findByTestId('strategy-block-warning')
    expect(w).toHaveTextContent('Cards in this deck imply at least Bracket 4. Your target is Bracket 3.')
    expect(w.querySelector('svg')).not.toBeNull()
  })
  it('loading: says so, is busy, and is not a button', async () => {
    getResponse = () => new Promise(() => {})
    renderBlock()
    const box = screen.getByTestId('strategy-block-loading')
    expect(box).toHaveAttribute('aria-busy', 'true')
    expect(box).toHaveTextContent('Loading strategy…')
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('failed: not a button, says nothing changed, and Try again loads again', async () => {
    let calls = 0
    getResponse = async () => (++calls <= 2 ? json(500, { error: 'x' }) : json(200, SET)) // the block retries once by itself
    const { user } = renderBlock()
    const box = await screen.findByTestId('strategy-block-failed', {}, { timeout: 4000 })
    expect(box).toHaveTextContent("Couldn't load your strategy.")
    expect(box).toHaveTextContent('Nothing was changed. Your saved strategy is safe.')
    expect(screen.queryByTestId('strategy-block')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('strategy-block')).toHaveTextContent('Plants and recursion')
  })
  it('offline: shows the saved copy with a chip, still opens, and says changes save when back online', async () => {
    getResponse = async () => json(200, SET)
    renderBlock()
    const block = await screen.findByTestId('strategy-block')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(block).toHaveTextContent('Offline · showing saved copy')
    expect(block).toHaveTextContent('Plants and recursion')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit strategy' }))
    const dlg = await screen.findByRole('dialog', { name: 'Strategy' })
    expect(dlg).toHaveTextContent("Your changes will save when you're back online")
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
  it('saves by itself: the bracket goes out alone as soon as it is picked, typing goes out when the window closes, and the block updates', async () => {
    let stored = { ...EMPTY }
    putResponse = async (b) => json(200, { ...(stored = { ...stored, ...(b as object) }), configured: true, notSaved: [] })
    const { user } = renderBlock()
    await screen.findByTestId('strategy-block')
    await user.click(screen.getByRole('button', { name: 'Edit strategy' }))
    await screen.findByRole('dialog', { name: 'Strategy' })
    await waitFor(() => expect(screen.getByRole('radio', { name: /1Exhibition/ })).toHaveFocus())
    await user.click(screen.getByRole('radio', { name: /4Optimized/ }))
    const puts = () => fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT').map((c) => JSON.parse(String(c[1]!.body)))
    await waitFor(() => expect(puts()).toEqual([{ bracket: 4 }]))
    await user.type(screen.getByLabelText('One-line summary'), 'Plants and recursion')
    await user.click(screen.getAllByRole('button', { name: 'Close' })[1])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(puts()).toEqual([{ bracket: 4 }, { summary: 'Plants and recursion' }])
    expect(screen.getByTestId('strategy-block')).toHaveTextContent('Plants and recursion')
    expect(screen.getByText('Strategy saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit strategy' })).toHaveFocus())
  })
  it('a failed save keeps the window open with everything typed and offers Keep editing', async () => {
    putResponse = async () => json(500, { error: 'db down' })
    const { user } = renderBlock()
    await user.click(await screen.findByRole('button', { name: 'Edit strategy' }))
    await screen.findByRole('dialog')
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true))
    await user.type(screen.getByLabelText('One-line summary'), 'Keep me')
    await user.click(screen.getAllByRole('button', { name: 'Close' })[1])
    expect(await screen.findByRole('alertdialog', { name: "This didn't save." })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Your changes are still here and nothing was lost.")
    expect(screen.getByLabelText('One-line summary')).toHaveValue('Keep me')
    expect(screen.getByRole('dialog').textContent).not.toMatch(/select Save/)
  })
  it('bracket 5 before the stored-data update: the window says so plainly and keeps the pick', async () => {
    putResponse = async () => json(422, { code: 'bracket_5_not_stored_yet', error: "Bracket 5 can't be saved yet. Oracle's stored data still stops at 4. Pick 1 to 4 for now." })
    const { user } = renderBlock()
    await user.click(await screen.findByRole('button', { name: 'Edit strategy' }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('radio', { name: /5cEDH/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Bracket 5 can't be saved yet.")
    expect(screen.getByRole('radio', { name: /5cEDH/ })).toBeChecked()
  })
  it('Claude changing the Strategy while the window is open shows up in the window without a Refresh button', async () => {
    getResponse = async () => json(200, { ...SET, strategy: 'Old plan.' })
    const { user, qc } = renderBlock()
    await user.click(await screen.findByRole('button', { name: 'Edit strategy' }))
    await screen.findByRole('dialog')
    await act(async () => {
      getResponse = async () => json(200, { ...SET, strategy: 'Claude plan.', updatedBy: 'claude' })
      await qc.invalidateQueries({ queryKey: ['decks', 7, 'strategy-window'] })
    })
    await waitFor(() => expect(screen.getByLabelText('Strategy', { selector: 'textarea' })).toHaveValue('Claude plan.'))
    expect(screen.getByTestId('updated-by-claude')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })
  it('See in History closes the window and opens History', async () => {
    getResponse = async () => json(200, SET)
    const { user, onSeeHistory } = renderBlock()
    await user.click(await screen.findByRole('button', { name: 'Edit strategy' }))
    await user.click(await screen.findByRole('button', { name: 'See in History' }))
    expect(onSeeHistory).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
