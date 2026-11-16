// Guard for the owner-only (cookie) routes of slice B. These routes let the signed-in owner see, approve, decline and undo
// what Claude did. Claude's own token must never work here:
//  - any Authorization header is refused (a connector sends one; the browser does not)
//  - a session token that carries a client_id (an OAuth token issued to Claude) is refused
//  - the user id comes only from the cookie session
//  - POSTs must come from Oracle's own site (Origin check)
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createAuthServerClient } from '@/lib/supabase-server'
import { carriesClientId } from './revoke'
import { siteUrl } from './errors'
import { createGateway } from './write-gateway'
import type { Gateway } from './write-types'
import type { ApiFailure } from './api-types'

export interface GuardDeps {
  getUserId: () => Promise<string | null>
  getSessionAccessToken: () => Promise<string | null>
  siteOrigins: string[]
}

export type GuardResult = { ok: true; userId: string } | { ok: false; status: number; body: ApiFailure }

const deny = (status: number, error: string, code: string): GuardResult => ({ ok: false, status, body: { ok: false, error, code } })

export async function guardOwnerRequest(req: { method: string; headers: Headers }, deps: GuardDeps): Promise<GuardResult> {
  if (req.headers.get('authorization')) return deny(403, 'Not allowed from a connector sign-in.', 'not_allowed')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin')
    if (!origin || !deps.siteOrigins.includes(origin.replace(/\/+$/, ''))) return deny(403, 'That request did not come from Oracle.', 'bad_origin')
  }
  const userId = await deps.getUserId()
  if (!userId) return deny(401, 'Please sign in.', 'unauthorized')
  if (carriesClientId(await deps.getSessionAccessToken())) return deny(403, 'Not allowed from a connector sign-in.', 'not_allowed')
  return { ok: true, userId }
}

export type RouteGuard = { ok: true; userId: string; gateway: Gateway; email: string | null } | { ok: false; status: number; body: ApiFailure }

export async function guardRoute(req: Request): Promise<RouteGuard> {
  const supabase = await createAuthServerClient()
  let reqOrigin = ''
  try {
    reqOrigin = new URL(req.url).origin
  } catch {
    reqOrigin = ''
  }
  const g = await guardOwnerRequest(req, {
    getUserId: async () => (await getAuthUser())?.id ?? null,
    getSessionAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    siteOrigins: [siteUrl(), reqOrigin].filter(Boolean),
  })
  if (!g.ok) return g
  const email = (await getAuthUser())?.email ?? null
  return { ok: true, userId: g.userId, gateway: createGateway(), email }
}

export function reply(r: { status: number; body: unknown }) {
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
}

export function failJson(r: { status: number; body: ApiFailure }) {
  return NextResponse.json(r.body, { status: r.status })
}

export const unavailable = (): ApiFailure => ({ ok: false, error: 'Oracle could not reach the database just now. Nothing was changed. Try again.', code: 'rpc_failed' })
