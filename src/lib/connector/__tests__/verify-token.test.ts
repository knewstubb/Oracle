import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet, type JWK } from 'jose'
import { verifyConnectorToken } from '../verify-token'

const ISS = 'https://proj.supabase.co/auth/v1'
const SUB = '11111111-2222-4333-8444-555555555555'
let priv: CryptoKey
let jwks: ReturnType<typeof createLocalJWKSet>
let otherPriv: CryptoKey

beforeAll(async () => {
  const kp = await generateKeyPair('ES256')
  priv = kp.privateKey
  const jwk: JWK = { ...(await exportJWK(kp.publicKey)), alg: 'ES256', kid: 'k1', use: 'sig' }
  jwks = createLocalJWKSet({ keys: [jwk] })
  otherPriv = (await generateKeyPair('ES256')).privateKey
})

async function sign(claims: Record<string, unknown>, o: { key?: CryptoKey; iss?: string; aud?: string; exp?: string | number } = {}) {
  let j = new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuedAt().setIssuer(o.iss ?? ISS).setAudience(o.aud ?? 'authenticated')
  j = j.setExpirationTime(o.exp ?? '1h')
  return j.sign(o.key ?? priv)
}
const verify = (t: string) => verifyConnectorToken(t, { jwks, issuer: ISS })

describe('verifyConnectorToken', () => {
  it('accepts a valid OAuth token', async () => {
    const r = await verify(await sign({ sub: SUB, client_id: 'client-1' }))
    expect(r).toEqual({ ok: true, userId: SUB, clientId: 'client-1' })
  })
  it('reports an expired token as expired', async () => {
    const r = await verify(await sign({ sub: SUB, client_id: 'c' }, { exp: Math.floor(Date.now() / 1000) - 3600 }))
    expect(r).toEqual({ ok: false, reason: 'expired' })
  })
  it('rejects wrong issuer', async () => {
    expect((await verify(await sign({ sub: SUB, client_id: 'c' }, { iss: 'https://evil/auth/v1' }))).ok).toBe(false)
  })
  it('rejects wrong audience', async () => {
    expect((await verify(await sign({ sub: SUB, client_id: 'c' }, { aud: 'service_role' }))).ok).toBe(false)
  })
  it('rejects HS256', async () => {
    const { createHmac } = await import('node:crypto')
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const head = b64({ alg: 'HS256', typ: 'JWT', kid: 'k1' })
    const body = b64({ sub: SUB, client_id: 'c', iss: ISS, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
    const t = `${head}.${body}.${createHmac('sha256', 'secret').update(`${head}.${body}`).digest('base64url')}`
    expect((await verify(t)).ok).toBe(false)
  })
  it('rejects alg none', async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: SUB, client_id: 'c', iss: ISS, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.`
    expect((await verify(t)).ok).toBe(false)
  })
  it('rejects a missing sub', async () => {
    expect((await verify(await sign({ client_id: 'c' }))).ok).toBe(false)
  })
  it('rejects a sub that is not a uuid', async () => {
    expect((await verify(await sign({ sub: 'not-a-uuid', client_id: 'c' }))).ok).toBe(false)
  })
  it('refuses a browser-session token with no client_id', async () => {
    expect((await verify(await sign({ sub: SUB }))).ok).toBe(false)
  })
  it('rejects a tampered signature', async () => {
    const t = await sign({ sub: SUB, client_id: 'c' })
    const [h, p, s] = t.split('.')
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: '99999999-2222-4333-8444-555555555555', client_id: 'c', iss: ISS, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.${s}`
    void p
    expect((await verify(forged)).ok).toBe(false)
  })
  it('rejects a token signed by a different key', async () => {
    expect((await verify(await sign({ sub: SUB, client_id: 'c' }, { key: otherPriv }))).ok).toBe(false)
  })
})
