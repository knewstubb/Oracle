import { describe, it, expect, vi } from 'vitest'
import { processConsent, type ConsentDeps } from '../consent'

function deps(over: Partial<ConsentDeps> = {}): ConsentDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    getUserId: async () => 'user-1',
    getDetails: async () => ({ kind: 'details', clientId: 'client-1', clientName: 'Claude' }),
    approve: vi.fn(async () => { calls.push('approve'); return { redirectUrl: 'https://claude.ai/cb?code=1' } }),
    deny: vi.fn(async () => { calls.push('deny'); return { redirectUrl: 'https://claude.ai/cb?error=access_denied' } }),
    insertConnection: vi.fn(async () => { calls.push('insert'); return { id: 'conn-1' } }),
    deleteConnection: vi.fn(async () => { calls.push('delete') }),
    ...over,
  }
}

describe('processConsent', () => {
  it('approve inserts then approves, and redirects', async () => {
    const d = deps()
    const r = await processConsent('allow', 'auth-1', d)
    expect(r).toEqual({ redirectTo: 'https://claude.ai/cb?code=1' })
    expect(d.calls).toEqual(['insert', 'approve'])
    expect(d.insertConnection).toHaveBeenCalledWith('user-1', 'client-1', 'Claude')
  })
  it('approve failure deletes the row again', async () => {
    const d = deps({ approve: async () => ({ error: true }) })
    const r = await processConsent('allow', 'auth-1', d)
    expect(r).toEqual({ error: 'failed' })
    expect(d.calls).toEqual(['insert', 'delete'])
    expect(d.deleteConnection).toHaveBeenCalledWith('conn-1', 'user-1')
  })
  it('insert failure never approves', async () => {
    const d = deps({ insertConnection: async () => ({ error: true }) })
    expect(await processConsent('allow', 'auth-1', d)).toEqual({ error: 'failed' })
    expect(d.approve).not.toHaveBeenCalled()
  })
  it('deny inserts nothing', async () => {
    const d = deps()
    const r = await processConsent('deny', 'auth-1', d)
    expect('redirectTo' in r).toBe(true)
    expect(d.insertConnection).not.toHaveBeenCalled()
    expect(d.calls).toEqual(['deny'])
  })
  it('unauthenticated is refused, nothing touched', async () => {
    const d = deps({ getUserId: async () => null })
    expect(await processConsent('allow', 'auth-1', d)).toEqual({ error: 'unauthenticated' })
    expect(d.insertConnection).not.toHaveBeenCalled()
    expect(d.approve).not.toHaveBeenCalled()
  })
  it('refuses a malformed authorization id', async () => {
    const d = deps()
    expect(await processConsent('allow', '../x', d)).toEqual({ error: 'invalid' })
    expect(await processConsent('allow', undefined, d)).toEqual({ error: 'invalid' })
  })
})
