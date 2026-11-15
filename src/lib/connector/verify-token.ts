// Local verification of the Supabase OAuth access token. Contract section 4, step 3.
// ES256 only, issuer and audience checked, 30 s clock tolerance. A browser-session token (no client_id) is refused.
import { createRemoteJWKSet, jwtVerify, errors as joseErrors, type JWTVerifyGetKey } from 'jose'

export type VerifyResult =
  | { ok: true; userId: string; clientId: string }
  | { ok: false; reason: 'expired' | 'invalid' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let remoteJwks: JWTVerifyGetKey | null = null

export function supabaseIssuer(): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')}/auth/v1`
}

function defaultJwks(): JWTVerifyGetKey {
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(`${supabaseIssuer()}/.well-known/jwks.json`))
  return remoteJwks
}

export async function verifyConnectorToken(
  token: string,
  opts: { jwks?: JWTVerifyGetKey; issuer?: string } = {},
): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, opts.jwks ?? defaultJwks(), {
      algorithms: ['ES256'],
      issuer: opts.issuer ?? supabaseIssuer(),
      audience: 'authenticated',
      clockTolerance: 30,
    })
    const sub = payload.sub
    const clientId = payload.client_id
    if (typeof sub !== 'string' || !UUID.test(sub)) return { ok: false, reason: 'invalid' }
    if (typeof clientId !== 'string' || clientId.length === 0) return { ok: false, reason: 'invalid' }
    return { ok: true, userId: sub, clientId }
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) return { ok: false, reason: 'expired' }
    return { ok: false, reason: 'invalid' }
  }
}
