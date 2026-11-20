import { describe, it, expect, beforeEach, vi } from 'vitest'
import { normaliseWhy, peekWhyColumn, rememberWhyColumn, resetWhyColumnCache, whyColumnAvailable } from './why-column'
import { fakeClient } from './fake-client'

beforeEach(() => resetWhyColumnCache())

describe('why column probe', () => {
  it('is available when the probe succeeds', async () => {
    expect(await whyColumnAvailable(fakeClient(() => ({ data: [], error: null })))).toBe(true)
  })
  it('is not available on error 42703', async () => {
    expect(await whyColumnAvailable(fakeClient(() => ({ data: null, error: { message: 'no column', code: '42703' } })))).toBe(false)
  })
  it('treats any other error as not available and logs it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await whyColumnAvailable(fakeClient(() => ({ data: null, error: { message: 'timeout', code: '57014' } })))).toBe(false)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('caches for 60 seconds, then asks again', async () => {
    let calls = 0
    const client = fakeClient(() => {
      calls++
      return { data: [], error: null }
    })
    await whyColumnAvailable(client, 1000)
    await whyColumnAvailable(client, 30_000)
    expect(calls).toBe(1)
    await whyColumnAvailable(client, 62_000)
    expect(calls).toBe(2)
  })
})

describe('normaliseWhy', () => {
  it('trims, turns empty into null, and refuses over 200 characters', () => {
    expect(normaliseWhy('  hi  ')).toEqual({ ok: true, value: 'hi' })
    expect(normaliseWhy('   ')).toEqual({ ok: true, value: null })
    expect(normaliseWhy(null)).toEqual({ ok: true, value: null })
    expect(normaliseWhy('x'.repeat(200)).ok).toBe(true)
    expect(normaliseWhy('x'.repeat(201)).ok).toBe(false)
    expect(normaliseWhy(5).ok).toBe(false)
  })
})

describe('peekWhyColumn / rememberWhyColumn', () => {
  it('is unknown until a read records it, then fresh for 60 seconds', () => {
    resetWhyColumnCache()
    expect(peekWhyColumn(1000)).toBeNull()
    rememberWhyColumn(false, 1000)
    expect(peekWhyColumn(30_000)).toBe(false)
    expect(peekWhyColumn(62_000)).toBeNull()
  })
})
