import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { CLAUDE_POLL_INTERVAL_MS, CLAUDE_POLL_MAX_ERRORS, useClaudeChangeWatch, type ClaudeMarkerReply } from './useRefreshOnTabReturn'
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}
function setOnline(on: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: on, configurable: true })
  window.dispatchEvent(new Event(on ? 'online' : 'offline'))
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)
function setup(fetchMarker: (d: number | undefined) => Promise<ClaudeMarkerReply>, deckId: number | 'all' = 7) {
  const onChange = vi.fn()
  const f = vi.fn((d: number | undefined) => fetchMarker(d))
  const view = renderHook(() => useClaudeChangeWatch({ deckId: deckId === 'all' ? undefined : deckId, fetchMarker: f, onChange }))
  return { f, onChange, ...view }
}
describe('useClaudeChangeWatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
    setOnline(true)
  })
  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
    setOnline(true)
  })
  it('checks at once, then every 8 seconds for this deck', async () => {
    const { f } = setup(async () => ({ marker: 'a', actor: null }))
    await tick(0)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][0]).toBe(7)
    await tick(CLAUDE_POLL_INTERVAL_MS - 1)
    expect(f).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(f).toHaveBeenCalledTimes(2)
    await tick(CLAUDE_POLL_INTERVAL_MS)
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('the interval is inside the 5 to 10 second range', () => {
    expect(CLAUDE_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5000)
    expect(CLAUDE_POLL_INTERVAL_MS).toBeLessThanOrEqual(10000)
  })
  it('the first answer is only a starting point; a different marker later reports a change once', async () => {
    let m = 'a'
    const { onChange } = setup(async () => ({ marker: m, actor: 'claude' }))
    await tick(0)
    expect(onChange).not.toHaveBeenCalled()
    await tick(CLAUDE_POLL_INTERVAL_MS)
    expect(onChange).not.toHaveBeenCalled()
    m = 'b'
    await tick(CLAUDE_POLL_INTERVAL_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ marker: 'b', actor: 'claude' })
    await tick(CLAUDE_POLL_INTERVAL_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
  it('pauses while the tab is hidden and checks at once when it is shown again', async () => {
    const { f } = setup(async () => ({ marker: 'a', actor: null }))
    await tick(0)
    setVisibility('hidden')
    await tick(60_000)
    expect(f).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await tick(0)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('does not start when the tab is hidden', async () => {
    setVisibility('hidden')
    const { f } = setup(async () => ({ marker: 'a', actor: null }))
    await tick(30_000)
    expect(f).not.toHaveBeenCalled()
  })
  it('stops while offline and checks at once when the network returns', async () => {
    const { f } = setup(async () => ({ marker: 'a', actor: null }))
    await tick(0)
    setOnline(false)
    await tick(60_000)
    expect(f).toHaveBeenCalledTimes(1)
    setOnline(true)
    await tick(0)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('backs off after errors, stops after five in a row, and starts again when the tab is shown', async () => {
    const { f, onChange } = setup(async () => {
      throw new Error('down')
    })
    await tick(0)
    expect(f).toHaveBeenCalledTimes(1)
    await tick(CLAUDE_POLL_INTERVAL_MS) // 16 s wait after the first error: not yet
    expect(f).toHaveBeenCalledTimes(1)
    await tick(CLAUDE_POLL_INTERVAL_MS)
    expect(f).toHaveBeenCalledTimes(2)
    await tick(10 * 60_000)
    expect(f).toHaveBeenCalledTimes(CLAUDE_POLL_MAX_ERRORS)
    expect(onChange).not.toHaveBeenCalled()
    setVisibility('hidden')
    setVisibility('visible')
    await tick(0)
    expect(f).toHaveBeenCalledTimes(CLAUDE_POLL_MAX_ERRORS + 1)
  })
  it('a success after an error returns to the normal rhythm', async () => {
    let fail = true
    const { f } = setup(async () => {
      if (fail) throw new Error('blip')
      return { marker: 'a', actor: null }
    })
    await tick(0)
    fail = false
    await tick(2 * CLAUDE_POLL_INTERVAL_MS)
    expect(f).toHaveBeenCalledTimes(2)
    await tick(CLAUDE_POLL_INTERVAL_MS)
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('stops for good when signed out (401)', async () => {
    const { f } = setup(async () => {
      throw Object.assign(new Error('no'), { status: 401 })
    })
    await tick(10 * 60_000)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('does not overlap: a slow answer is waited for', async () => {
    let release: (v: ClaudeMarkerReply) => void = () => {}
    const { f } = setup(() => new Promise((r) => (release = r)))
    await tick(0)
    setVisibility('hidden')
    setVisibility('visible')
    await tick(0)
    expect(f).toHaveBeenCalledTimes(1)
    release({ marker: 'a', actor: null })
  })
  it('stops when the page goes away', async () => {
    const { f, unmount } = setup(async () => ({ marker: 'a', actor: null }))
    await tick(0)
    unmount()
    await tick(60_000)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('asks for the whole account when no deck is given', async () => {
    const { f } = setup(async () => ({ marker: 'a', actor: null }), 'all')
    await tick(0)
    expect(f.mock.calls[0][0]).toBeUndefined()
  })
})
