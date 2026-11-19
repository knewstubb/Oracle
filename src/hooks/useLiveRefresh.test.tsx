import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { DEFER_RECHECK_MS, NOTE_SHOW_MS, TYPING_IDLE_MS, useLiveDeckRefresh, useLiveUserRefresh } from './useLiveRefresh'
import { CLAUDE_POLL_INTERVAL_MS, type ClaudeMarkerReply } from './useRefreshOnTabReturn'
import { STRATEGY_BUSY, setBusy } from '@/lib/live-refresh-holds'
import * as api from '@/components/connector/api'
vi.mock('@/components/connector/api', async (orig) => ({ ...(await orig<typeof import('@/components/connector/api')>()), fetchChangeMarker: vi.fn() }))
const fetchMarker = vi.mocked(api.fetchChangeMarker)
let reply: ClaudeMarkerReply
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, spy, wrapper }
}
const keysOf = (spy: ReturnType<typeof setup>['spy']) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey))
/** Starting point taken, then Claude changes something. */
async function claudeChanges(next: ClaudeMarkerReply) {
  await tick(0)
  reply = next
  await tick(CLAUDE_POLL_INTERVAL_MS)
}
describe('live refresh of an open deck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reply = { marker: 'm1', actor: null }
    fetchMarker.mockReset()
    fetchMarker.mockImplementation(async () => reply)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    setBusy(STRATEGY_BUSY, false)
  })
  it('refetches nothing while the marker is the same', async () => {
    const { spy, wrapper } = setup()
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await tick(CLAUDE_POLL_INTERVAL_MS * 4)
    expect(fetchMarker.mock.calls.length).toBeGreaterThan(3)
    expect(spy).not.toHaveBeenCalled()
  })
  it('asks the marker for this deck only', async () => {
    const { wrapper } = setup()
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await tick(0)
    expect(fetchMarker.mock.calls[0][0]).toBe(7)
  })
  it('on a change refetches the deck, its rail, History and waiting requests, and shows the note, which fades', async () => {
    const { spy, wrapper } = setup()
    const { result } = renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    const keys = keysOf(spy)
    expect(keys).toContain('["decks",7]') // card list, rail counts, health, curve, colour needs, Strategy block
    expect(keys).toContain('["picklist",7]')
    expect(keys).toContain('["connector","changes","deck",7]') // History
    expect(keys).toContain('["connector","pending-count"]')
    expect(result.current.note).toEqual({ fading: false })
    await tick(NOTE_SHOW_MS - 900)
    expect(result.current.note).toEqual({ fading: true })
    await tick(1000)
    expect(result.current.note).toBeNull()
  })
  it('does not refetch other decks or the whole app', async () => {
    const { spy, wrapper } = setup()
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    expect(keysOf(spy)).not.toContain('["decks"]')
    expect(keysOf(spy).some((k) => k.includes('"decks",8'))).toBe(false)
  })
  it('shows no note for the owner\'s own change (still refreshes quietly)', async () => {
    const { spy, wrapper } = setup()
    const { result } = renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'owner' })
    expect(spy).toHaveBeenCalled()
    expect(result.current.note).toBeNull()
  })
  it('waits while the owner is typing in a field, then refreshes once they stop', async () => {
    const { spy, wrapper } = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await tick(0)
    input.focus()
    reply = { marker: 'm2', actor: 'claude' }
    await tick(CLAUDE_POLL_INTERVAL_MS - 100)
    input.dispatchEvent(new Event('input', { bubbles: true })) // typing right as Claude's change is noticed
    await tick(100)
    expect(spy).not.toHaveBeenCalled()
    await tick(TYPING_IDLE_MS + DEFER_RECHECK_MS)
    expect(spy).toHaveBeenCalled()
  })
  it('waits while a card edit or delete confirmation window is open, then refreshes when it closes', async () => {
    const { spy, wrapper } = setup()
    const dlg = document.createElement('div')
    dlg.setAttribute('role', 'alertdialog')
    document.body.appendChild(dlg)
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    await tick(10_000)
    expect(spy).not.toHaveBeenCalled()
    dlg.remove()
    await tick(DEFER_RECHECK_MS)
    expect(spy).toHaveBeenCalled()
  })
  it('a window marked as allowed (History) does not hold the refresh back', async () => {
    const { spy, wrapper } = setup()
    const dlg = document.createElement('div')
    dlg.setAttribute('role', 'dialog')
    dlg.setAttribute('data-live-refresh', 'allow')
    document.body.appendChild(dlg)
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    expect(spy).toHaveBeenCalled()
  })
  it('waits while a save or delete is running', async () => {
    const { client, spy, wrapper } = setup()
    const mutating = vi.spyOn(client, 'isMutating').mockReturnValue(1)
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    expect(spy).not.toHaveBeenCalled()
    mutating.mockReturnValue(0)
    await tick(DEFER_RECHECK_MS)
    expect(spy).toHaveBeenCalled()
  })
  it('several changes while waiting become one refresh', async () => {
    const { client, spy, wrapper } = setup()
    const mutating = vi.spyOn(client, 'isMutating').mockReturnValue(1)
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    reply = { marker: 'm3', actor: 'claude' }
    await tick(CLAUDE_POLL_INTERVAL_MS)
    mutating.mockReturnValue(0)
    await tick(DEFER_RECHECK_MS)
    expect(keysOf(spy).filter((k) => k === '["connector","changes","deck",7]')).toHaveLength(1)
  })
  it('an open Strategy window is refetched with the rest of the deck, with no hold and no stale mark', async () => {
    const { spy, wrapper } = setup()
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    const deckCall = spy.mock.calls.map((c) => c[0] as { queryKey: unknown[]; predicate?: unknown }).find((c) => JSON.stringify(c.queryKey) === '["decks",7]')!
    expect(deckCall.predicate).toBeUndefined() // nothing under the deck is left out, Strategy included
  })
  it('waits while the Strategy window is saving, then refreshes right after', async () => {
    const { spy, wrapper } = setup()
    setBusy(STRATEGY_BUSY, true)
    renderHook(() => useLiveDeckRefresh(7), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    await tick(10_000)
    expect(spy).not.toHaveBeenCalled()
    setBusy(STRATEGY_BUSY, false)
    await tick(DEFER_RECHECK_MS)
    expect(keysOf(spy)).toContain('["decks",7]')
  })
  it('does nothing without a deck id and nothing at all when the tab is hidden', async () => {
    const { wrapper } = setup()
    renderHook(() => useLiveDeckRefresh(undefined), { wrapper })
    await tick(30_000)
    expect(fetchMarker).not.toHaveBeenCalled()
  })
})
describe('live refresh for the deck list and Recent changes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reply = { marker: 'm1', actor: null }
    fetchMarker.mockReset()
    fetchMarker.mockImplementation(async () => reply)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => vi.useRealTimers())
  it('uses the same marker for the whole account and refetches only the keys it was given', async () => {
    const { spy, wrapper } = setup()
    renderHook(() => useLiveUserRefresh([['decks'], ['connector', 'changes']]), { wrapper })
    await claudeChanges({ marker: 'm2', actor: 'claude' })
    expect(fetchMarker.mock.calls[0][0]).toBeUndefined()
    expect(keysOf(spy)).toEqual(['["decks"]', '["connector","changes"]'])
  })
  it('does not check while the tab is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    const { wrapper } = setup()
    renderHook(() => useLiveUserRefresh([['decks']]), { wrapper })
    await tick(60_000)
    expect(fetchMarker).not.toHaveBeenCalled()
  })
})
