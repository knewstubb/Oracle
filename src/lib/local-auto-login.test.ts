import { describe, it, expect, vi, afterEach } from 'vitest'
import { attemptLocalAutoLogin, getLocalAutoLoginCredentials } from './local-auto-login'

const vars = { LOCAL_AUTO_LOGIN_EMAIL: 'me@example.com', LOCAL_AUTO_LOGIN_PASSWORD: 'pw-secret' }

describe('getLocalAutoLoginCredentials', () => {
  it('is active in development with both vars', () => {
    expect(getLocalAutoLoginCredentials({ NODE_ENV: 'development', ...vars })).toEqual({
      email: 'me@example.com',
      password: 'pw-secret',
    })
  })
  it('is inactive when a var is missing or empty', () => {
    expect(getLocalAutoLoginCredentials({ NODE_ENV: 'development', LOCAL_AUTO_LOGIN_EMAIL: 'a@b.c' })).toBeNull()
    expect(getLocalAutoLoginCredentials({ NODE_ENV: 'development', LOCAL_AUTO_LOGIN_PASSWORD: 'x' })).toBeNull()
    expect(getLocalAutoLoginCredentials({ NODE_ENV: 'development', ...vars, LOCAL_AUTO_LOGIN_EMAIL: '' })).toBeNull()
  })
  it('is inactive outside development (production guard)', () => {
    expect(getLocalAutoLoginCredentials({ NODE_ENV: 'production', ...vars })).toBeNull()
    expect(getLocalAutoLoginCredentials({ NODE_ENV: 'test', ...vars })).toBeNull()
    expect(getLocalAutoLoginCredentials({ ...vars })).toBeNull()
  })
})

describe('attemptLocalAutoLogin', () => {
  afterEach(() => vi.restoreAllMocks())
  const creds = { email: 'me@example.com', password: 'pw-secret' }

  it('returns true on success', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null })
    expect(await attemptLocalAutoLogin({ auth: { signInWithPassword } }, creds)).toBe(true)
    expect(signInWithPassword).toHaveBeenCalledWith(creds)
  })
  it('returns false, warns, and never logs the password on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const signInWithPassword = vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    expect(await attemptLocalAutoLogin({ auth: { signInWithPassword } }, creds)).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('pw-secret')
  })
  it('returns false when sign-in throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const signInWithPassword = vi.fn().mockRejectedValue(new Error('network'))
    expect(await attemptLocalAutoLogin({ auth: { signInWithPassword } }, creds)).toBe(false)
    expect(warn).toHaveBeenCalled()
  })
})
