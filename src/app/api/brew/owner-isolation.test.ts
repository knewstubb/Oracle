/**
 * Brew sessions are private. These tests use a small in-memory stand-in for the
 * database that honours `.eq()` filters, so a route that forgets to filter by
 * the signed-in user would visibly leak or modify another user's session.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const db: { brew_sessions: Row[] } = { brew_sessions: [] }
let currentUser = 'user-a'

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: currentUser, email: 'x@example.com' }),
  getAuthUser: () => Promise.resolve({ id: currentUser, email: 'x@example.com' }),
}))

class FakeQuery {
  private filters: Array<[string, unknown]> = []
  private mode: 'select' | 'update' | 'delete' = 'select'
  private patch: Row = {}
  private wantRows = false
  private notFilters: Array<[string, unknown[]]> = []

  constructor(private table: Row[]) {}

  select() {
    if (this.mode !== 'select') this.wantRows = true
    return this
  }
  update(patch: Row) {
    this.mode = 'update'
    this.patch = patch
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val])
    return this
  }
  not(col: string, _op: string, val: string) {
    this.notFilters.push([col, val.replace(/[()"]/g, '').split(',')])
    return this
  }
  order() {
    return this
  }
  limit() {
    return this
  }
  private matches(): Row[] {
    return this.table.filter(
      (r) =>
        this.filters.every(([c, v]) => r[c] === v) &&
        this.notFilters.every(([c, vals]) => !vals.includes(r[c] as string))
    )
  }
  private run() {
    const rows = this.matches()
    if (this.mode === 'update') rows.forEach((r) => Object.assign(r, this.patch))
    if (this.mode === 'delete') {
      this.table.splice(0, this.table.length, ...this.table.filter((r) => !rows.includes(r)))
    }
    return rows
  }
  maybeSingle() {
    const rows = this.run()
    return Promise.resolve({ data: rows[0] ?? null, error: null })
  }
  single() {
    const rows = this.run()
    return Promise.resolve(
      rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { message: 'no rows' } }
    )
  }
  then<T>(resolve: (v: { data: unknown; error: null }) => T): Promise<T> {
    const rows = this.run()
    return Promise.resolve(resolve({ data: this.mode === 'select' || this.wantRows ? rows : null, error: null }))
  }
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (t: 'brew_sessions') => new FakeQuery(db[t]),
  }),
}))

import { GET as sessionGet, PATCH as sessionPatch } from './session/route'
import { PATCH as sessionIdPatch } from './session/[id]/route'
import { GET as aiSessionGet } from '../ai/brew/session/route'
import {
  getBrewSession,
  updateBrewSession,
  deleteBrewSession,
  listBrewSessions,
} from '@/lib/brew-v2-session'
import { loadAssessmentCache, persistAssessmentCache } from '@/lib/brew-v2-assessment-cache'

const url = (p: string) => new URL(p, 'http://localhost:3000')
const json = (method: string, p: string, body: unknown) =>
  new NextRequest(url(p), {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  currentUser = 'user-b' // the intruder
  db.brew_sessions = [
    {
      id: 1,
      user_id: 'user-a',
      status: 'exploring',
      skeleton_json: '{"cards":[]}',
      commander_name: 'Korvold',
      assessment_cache_json: '{}',
      decision_log_json: '{}',
      conversation_json: '[]',
    },
    { id: 2, user_id: 'user-b', status: 'exploring', skeleton_json: '{"cards":[]}', commander_name: 'Prosper' },
  ]
})

describe('brew routes: another user\'s session is a 404 and is never changed', () => {
  it('GET /api/brew/session hides it', async () => {
    const res = await sessionGet(new NextRequest(url('/api/brew/session?id=1')))
    expect(res.status).toBe(404)
  })

  it('GET /api/brew/session returns your own', async () => {
    const res = await sessionGet(new NextRequest(url('/api/brew/session?id=2')))
    expect(res.status).toBe(200)
    expect((await res.json()).commander_name).toBe('Prosper')
  })

  it('PATCH /api/brew/session 404s and does not modify it', async () => {
    const res = await sessionPatch(json('PATCH', '/api/brew/session', { sessionId: 1, status: 'abandoned' }))
    expect(res.status).toBe(404)
    expect(db.brew_sessions[0].status).toBe('exploring')
  })

  it('PATCH /api/brew/session updates your own', async () => {
    const res = await sessionPatch(json('PATCH', '/api/brew/session', { sessionId: 2, status: 'building' }))
    expect(res.status).toBe(200)
    expect(db.brew_sessions[1].status).toBe('building')
  })

  it('PATCH /api/brew/session/[id] 404s and does not modify it', async () => {
    const res = await sessionIdPatch(json('PATCH', '/api/brew/session/1', { status: 'abandoned' }), {
      params: Promise.resolve({ id: '1' }),
    })
    expect(res.status).toBe(404)
    expect(db.brew_sessions[0].status).toBe('exploring')
  })

  it('GET /api/ai/brew/session?id= hides it', async () => {
    const res = await aiSessionGet(new NextRequest(url('/api/ai/brew/session?id=1')))
    expect(res.status).toBe(404)
  })

  it('GET /api/ai/brew/session?active=true only returns your own', async () => {
    const res = await aiSessionGet(new NextRequest(url('/api/ai/brew/session?active=true')))
    const data = await res.json()
    expect(data.session?.id).toBe(2)
  })
})

describe('brew helpers filter by user', () => {
  it('getBrewSession / listBrewSessions', async () => {
    expect(await getBrewSession('user-b', 1)).toBeNull()
    expect((await getBrewSession('user-a', 1))?.id).toBe(1)
    expect((await listBrewSessions('user-b')).map((r) => r.id)).toEqual([2])
  })

  it('updateBrewSession / deleteBrewSession do not touch another user\'s row', async () => {
    await updateBrewSession('user-b', 1, { status: 'abandoned' })
    expect(db.brew_sessions[0].status).toBe('exploring')
    await expect(deleteBrewSession('user-b', 1)).rejects.toThrow('not found')
    expect(db.brew_sessions).toHaveLength(2)
  })

  it('assessment cache load/persist are owner scoped', async () => {
    await persistAssessmentCache('user-b', 1, new Map([['Sol Ring', {} as never]]))
    expect(db.brew_sessions[0].assessment_cache_json).toBe('{}')
    expect((await loadAssessmentCache('user-b', 1)).size).toBe(0)
  })
})
