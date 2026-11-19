import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { AUTOSAVE_PAUSE_MS, AUTOSAVE_RETRY_MS, useAutosave, type SaveResult } from './useAutosave'

interface V {
  a: string
  b: string
  n: number | null
}
const START: V = { a: 'one', b: 'two', n: null }

type Save = (changed: Partial<V>) => Promise<SaveResult>
function setup(save: Save, online = true) {
  return renderHook((p: { online: boolean }) => useAutosave<V>({ initial: START, save, online: p.online }), { initialProps: { online } })
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const ok = async (): Promise<SaveResult> => ({ ok: true })

describe('useAutosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('saves after a pause, not before, and restarts the pause on every change', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    act(() => result.current.setField('a', 'x'))
    await tick(AUTOSAVE_PAUSE_MS - 100)
    act(() => result.current.setField('a', 'xy'))
    await tick(AUTOSAVE_PAUSE_MS - 100)
    expect(save).not.toHaveBeenCalled()
    expect(result.current.hasPending).toBe(true)
    await tick(100)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ a: 'xy' })
    expect(result.current.status).toBe('saved')
    expect(result.current.lastSavedAt).toBeInstanceOf(Date)
    expect(result.current.hasPending).toBe(false)
  })

  it('saveNow (blur) sends at once and the pause timer does not send it again', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    act(() => result.current.setField('a', 'x'))
    await act(async () => { await result.current.saveNow() })
    expect(save).toHaveBeenCalledTimes(1)
    await tick(AUTOSAVE_PAUSE_MS * 2)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('sends only the fields that differ from what is saved', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    act(() => result.current.setField('b', 'changed'))
    act(() => result.current.setField('n', 3))
    await tick(AUTOSAVE_PAUSE_MS)
    expect(save).toHaveBeenLastCalledWith({ b: 'changed', n: 3 })
    act(() => result.current.setField('a', 'x'))
    act(() => result.current.setField('a', 'one')) // typed and put back
    await tick(AUTOSAVE_PAUSE_MS)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('saveNow with field names sends only those fields', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    act(() => result.current.setField('a', 'typing'))
    act(() => result.current.setField('n', 2))
    await act(async () => { await result.current.saveNow(['n']) })
    expect(save).toHaveBeenCalledWith({ n: 2 })
    await tick(AUTOSAVE_PAUSE_MS)
    expect(save).toHaveBeenLastCalledWith({ a: 'typing' })
  })

  it('one save at a time, in order, and the second carries the newest values', async () => {
    const resolvers: ((r: SaveResult) => void)[] = []
    const save = vi.fn<Save>(() => new Promise((res) => resolvers.push(res)))
    const { result } = setup(save)
    act(() => result.current.setField('a', 'first'))
    await tick(AUTOSAVE_PAUSE_MS)
    expect(result.current.status).toBe('saving')
    act(() => result.current.setField('a', 'second'))
    act(() => result.current.setField('a', 'third'))
    await tick(AUTOSAVE_PAUSE_MS)
    expect(save).toHaveBeenCalledTimes(1) // the first is still out
    await act(async () => resolvers[0]({ ok: true }))
    await tick(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ a: 'third' })
    await act(async () => resolvers[1]({ ok: true }))
    expect(result.current.draft.a).toBe('third')
    expect(result.current.status).toBe('saved')
  })

  it('a response that arrives after the window was reset is ignored', async () => {
    let finish: (r: SaveResult) => void = () => {}
    const save = vi.fn<Save>(() => new Promise((res) => (finish = res)))
    const { result } = setup(save)
    act(() => result.current.setField('a', 'x'))
    await tick(AUTOSAVE_PAUSE_MS)
    act(() => result.current.discard())
    await act(async () => finish({ ok: true }))
    expect(result.current.draft.a).toBe('one')
    expect(result.current.lastSavedAt).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('a failed save keeps the text, retries once after 5 seconds, and then waits for the next edit', async () => {
    const save = vi.fn<Save>(async () => ({ ok: false, error: 'nope' }))
    const { result } = setup(save)
    act(() => result.current.setField('a', 'keep me'))
    await tick(AUTOSAVE_PAUSE_MS)
    expect(result.current.status).toBe('error')
    expect(result.current.draft.a).toBe('keep me')
    expect(result.current.error).toBe('nope')
    expect(result.current.hasPending).toBe(true)
    await tick(AUTOSAVE_RETRY_MS)
    expect(save).toHaveBeenCalledTimes(2)
    await tick(AUTOSAVE_RETRY_MS * 3)
    expect(save).toHaveBeenCalledTimes(2) // only one automatic retry
    act(() => result.current.setField('a', 'keep me!'))
    await tick(AUTOSAVE_PAUSE_MS)
    expect(save).toHaveBeenCalledTimes(3)
    await tick(AUTOSAVE_RETRY_MS) // the next edit earned another retry
    expect(save).toHaveBeenCalledTimes(4)
    expect(result.current.draft.a).toBe('keep me!')
  })

  it('a save that throws is a failed save, and a retry that works clears the error', async () => {
    const save = vi.fn<Save>().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ ok: true })
    const { result } = setup(save)
    act(() => result.current.setField('a', 'x'))
    await tick(AUTOSAVE_PAUSE_MS)
    expect(result.current.status).toBe('error')
    await tick(AUTOSAVE_RETRY_MS)
    expect(result.current.status).toBe('saved')
    expect(result.current.error).toBeNull()
  })

  it('offline: nothing is sent, status says offline, and it saves when the connection is back', async () => {
    const save = vi.fn<Save>(ok)
    const { result, rerender } = setup(save, false)
    act(() => result.current.setField('a', 'typed offline'))
    await tick(AUTOSAVE_PAUSE_MS * 2)
    expect(save).not.toHaveBeenCalled()
    expect(result.current.status).toBe('offline')
    expect(result.current.draft.a).toBe('typed offline')
    rerender({ online: true })
    await tick(0)
    expect(save).toHaveBeenCalledWith({ a: 'typed offline' })
    expect(result.current.status).toBe('saved')
  })

  it('flush sends at once and says whether everything is saved', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    act(() => result.current.setField('a', 'x'))
    let done = false
    await act(async () => { done = await result.current.flush() })
    expect(done).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    await tick(AUTOSAVE_PAUSE_MS * 2)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush says false when the save fails, and when offline', async () => {
    const save = vi.fn<Save>(async () => ({ ok: false, error: 'x' }))
    const a = setup(save)
    act(() => a.result.current.setField('a', 'x'))
    let done = true
    await act(async () => { done = await a.result.current.flush() })
    expect(done).toBe(false)
    const b = setup(vi.fn<Save>(ok), false)
    act(() => b.result.current.setField('a', 'x'))
    await act(async () => { done = await b.result.current.flush() })
    expect(done).toBe(false)
  })

  it('flush with nothing to save is true and sends nothing', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    let done = false
    await act(async () => { done = await result.current.flush() })
    expect(done).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('a field the server cannot store yet is not sent again and is not wiped by the refresh', async () => {
    const save = vi.fn<Save>(async () => ({ ok: true, notSaved: ['a'] }))
    const { result } = setup(save)
    act(() => result.current.setField('a', 'hello'))
    act(() => result.current.setField('b', 'kept'))
    await tick(AUTOSAVE_PAUSE_MS)
    expect(result.current.notSaved).toEqual(['a'])
    expect(result.current.status).toBe('saved')
    act(() => { result.current.applyIncoming({ a: 'one', b: 'kept', n: null }) })
    expect(result.current.draft.a).toBe('hello')
    await act(async () => { await result.current.flush() })
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('useAutosave: applyIncoming', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('replaces fields nobody touched and says which', () => {
    const { result } = setup(vi.fn<Save>(ok))
    let r: ReturnType<typeof result.current.applyIncoming> | undefined
    act(() => { r = result.current.applyIncoming({ a: 'from Claude', b: 'two', n: 4 }) })
    expect(r).toEqual({ replaced: ['a', 'n'], conflicts: [] })
    expect(result.current.draft).toEqual({ a: 'from Claude', b: 'two', n: 4 })
    expect(result.current.touched('a')).toBe(false)
  })

  it('never replaces a field with typing waiting to be saved, and reports it as a conflict', () => {
    const { result } = setup(vi.fn<Save>(ok))
    act(() => result.current.setField('a', 'mine'))
    expect(result.current.touched('a')).toBe(true)
    let r: ReturnType<typeof result.current.applyIncoming> | undefined
    act(() => { r = result.current.applyIncoming({ a: 'theirs', b: 'new b', n: null }) })
    expect(r).toEqual({ replaced: ['b'], conflicts: ['a'] })
    expect(result.current.draft).toEqual({ a: 'mine', b: 'new b', n: null })
  })

  it('never replaces a field in a running save', async () => {
    let finish: (r: SaveResult) => void = () => {}
    const { result } = setup(vi.fn<Save>(() => new Promise((res) => (finish = res))))
    act(() => result.current.setField('a', 'mine'))
    await tick(AUTOSAVE_PAUSE_MS)
    let r: ReturnType<typeof result.current.applyIncoming> | undefined
    act(() => { r = result.current.applyIncoming({ a: 'theirs', b: 'two', n: null }) })
    expect(r?.conflicts).toEqual(['a'])
    expect(result.current.draft.a).toBe('mine')
    await act(async () => finish({ ok: true }))
  })

  it('never replaces a field whose save failed', async () => {
    const { result } = setup(vi.fn<Save>(async () => ({ ok: false, error: 'x' })))
    act(() => result.current.setField('a', 'mine'))
    await tick(AUTOSAVE_PAUSE_MS)
    let r: ReturnType<typeof result.current.applyIncoming> | undefined
    act(() => { r = result.current.applyIncoming({ a: 'theirs', b: 'two', n: null }) })
    expect(r?.conflicts).toEqual(['a'])
    expect(result.current.draft.a).toBe('mine')
  })

  it('the echo of the owner\'s own save is not a conflict and not a replacement', async () => {
    const { result } = setup(vi.fn<Save>(ok))
    act(() => result.current.setField('a', 'mine'))
    await tick(AUTOSAVE_PAUSE_MS)
    act(() => result.current.setField('a', 'mine, and more'))
    let r: ReturnType<typeof result.current.applyIncoming> | undefined
    act(() => { r = result.current.applyIncoming({ a: 'mine', b: 'two', n: null }) })
    expect(r).toEqual({ replaced: [], conflicts: [] })
    expect(result.current.draft.a).toBe('mine, and more')
  })

  it('takeIncoming replaces the field and drops what was waiting', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    act(() => result.current.setField('a', 'mine'))
    act(() => result.current.takeIncoming('a', 'theirs'))
    expect(result.current.draft.a).toBe('theirs')
    expect(result.current.hasPending).toBe(false)
    await tick(AUTOSAVE_PAUSE_MS * 2)
    expect(save).not.toHaveBeenCalled()
  })

  it('a held field is not saved, even on close, until the owner chooses; then it is a normal save', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    act(() => result.current.setField('a', 'mine'))
    act(() => result.current.hold('a'))
    await tick(AUTOSAVE_PAUSE_MS * 2)
    let done = true
    await act(async () => { done = await result.current.flush() })
    expect(done).toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(result.current.hasPending).toBe(true)
    act(() => result.current.keepMine('a', 'theirs'))
    await tick(0)
    expect(save).toHaveBeenCalledWith({ a: 'mine' })
  })

  it('keepMine keeps the text, and its save sends only that field', async () => {
    const save = vi.fn<Save>(ok)
    const { result } = setup(save)
    act(() => result.current.setField('a', 'mine'))
    await act(async () => { await result.current.saveNow(['b']) })
    act(() => result.current.keepMine('a', 'theirs'))
    await tick(0)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ a: 'mine' })
    expect(result.current.draft.a).toBe('mine')
  })
  describe('leaving', () => {
    const withLeave = (leave: (c: Partial<V>) => void, online = true) =>
      renderHook(() => useAutosave<V>({ initial: START, save: ok, online, saveOnLeave: leave }))
    it('sends unsaved text when the page is closed or reloaded', () => {
      const leave = vi.fn()
      const { result } = withLeave(leave)
      act(() => result.current.setField('a', 'typed'))
      window.dispatchEvent(new Event('pagehide'))
      expect(leave).toHaveBeenCalledWith({ a: 'typed' })
    })
    it('sends unsaved text when the tab is hidden', () => {
      const leave = vi.fn()
      const { result } = withLeave(leave)
      act(() => result.current.setField('b', 'typed'))
      const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      spy.mockRestore()
      expect(leave).toHaveBeenCalledWith({ b: 'typed' })
    })
    it('sends unsaved text when the screen goes away, and nothing when all is saved or offline', async () => {
      const leave = vi.fn()
      const a = withLeave(leave)
      act(() => a.result.current.setField('a', 'typed'))
      a.unmount()
      expect(leave).toHaveBeenCalledWith({ a: 'typed' })
      leave.mockClear()
      const b = withLeave(leave)
      b.unmount()
      const c = withLeave(leave, false)
      act(() => c.result.current.setField('a', 'x'))
      c.unmount()
      expect(leave).not.toHaveBeenCalled()
    })
  })
})
