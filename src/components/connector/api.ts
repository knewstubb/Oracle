// Client-side access to the cookie-only connector routes (contract section 8). One place, so the wire shapes can be
// adapted in one edit. Sentences come from the server (change-sentences.ts); the client never writes its own.
import type {
  ChangeLogRow,
  DeckCounts,
  MovedSlot,
  PendingPreview,
  PendingReason,
  PendingStatus,
  UndoRefusal,
} from '../../../docs/oracle/contracts/claude-connector-slice-b.types'

export type { ChangeLogRow, DeckCounts, MovedSlot, PendingPreview, PendingReason, PendingStatus, UndoRefusal }

export type ChangeRowData = ChangeLogRow & { summary?: string | null; consequence?: string | null }

export interface PendingItem {
  id: string
  kind: 'big_edit' | 'copy_move'
  action: string
  reason: PendingReason
  deck_id: number | null
  deck_name: string | null
  other_deck_id: number | null
  other_deck_name: string | null
  card_count: number
  preview: PendingPreview
  status: PendingStatus
  client_name: string | null
  created_at: string
  expires_at: string
  decided_at: string | null
  failure_reason: string | null
  cancel_reason: string | null
  summary?: string | null
  title?: string | null
}

export interface ConnectionStatus {
  state: 'active' | 'off' | 'expired'
  connectionId: string | null
  email: string | null
  lastUsedAt: string | null
  clientName: string | null
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status, body)
  return body as T
}

/** Accepts either a bare array or an object holding the array under one of the given keys. */
function list<T>(body: unknown, ...keys: string[]): T[] {
  if (Array.isArray(body)) return body as T[]
  if (body && typeof body === 'object') {
    for (const k of keys) {
      const v = (body as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v as T[]
    }
  }
  throw new ApiError('Unexpected answer', 200, body)
}

export const connectorKeys = {
  changes: ['connector', 'changes'] as const,
  pending: ['connector', 'pending'] as const,
  pendingCount: ['connector', 'pending-count'] as const,
  status: ['connector', 'status'] as const,
  moved: (deckId: number) => ['connector', 'moved-slots', deckId] as const,
}

export async function fetchChanges(): Promise<ChangeRowData[]> {
  return list<ChangeRowData>(await request('/api/connector/changes'), 'changes', 'rows', 'data')
}

export async function fetchPending(): Promise<PendingItem[]> {
  return list<PendingItem>(await request('/api/connector/pending'), 'pending', 'items', 'data')
}

export async function fetchPendingCount(): Promise<number> {
  const body = await request<{ count?: unknown } | number>('/api/connector/pending/count')
  const n = typeof body === 'number' ? body : Number(body?.count)
  if (!Number.isFinite(n)) throw new ApiError('Unexpected answer', 200, body)
  return n
}

export async function fetchMovedSlots(deckId: number): Promise<MovedSlot[]> {
  return list<MovedSlot>(await request(`/api/connector/moved-slots?deckId=${deckId}`), 'slots', 'moved', 'data')
}

export async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const b = await request<{
    connected?: boolean
    connection?: { id: string; client_name: string | null; last_used_at: string | null } | null
    email?: string | null
  }>('/api/connector/status')
  if (typeof b?.connected !== 'boolean') throw new ApiError('Unexpected answer', 200, b)
  return {
    // The status route only reports an active link; "off" is what it says when nothing is active.
    state: b.connected ? 'active' : 'off',
    connectionId: b.connection?.id ?? null,
    email: b.email ?? null,
    lastUsedAt: b.connection?.last_used_at ?? null,
    clientName: b.connection?.client_name ?? null,
  }
}

export type UndoOutcome = { ok: true; undone: number } | { ok: false; refused: UndoRefusal } | { ok: false; failed: true }

export async function undoGroup(groupId: string): Promise<UndoOutcome> {
  try {
    const body = await request<{ success?: boolean; undone?: number; refused?: UndoRefusal }>(
      `/api/connector/changes/${encodeURIComponent(groupId)}/undo`,
      { method: 'POST' },
    )
    if (body?.success === false && body.refused) return { ok: false, refused: body.refused }
    return { ok: true, undone: body?.undone ?? 0 }
  } catch (e) {
    // A refusal may come back as a 4xx with the reason in the body.
    const refused = e instanceof ApiError ? (e.body as { refused?: UndoRefusal } | null)?.refused : undefined
    if (refused) return { ok: false, refused }
    return { ok: false, failed: true }
  }
}

export type DecideOutcome = { ok: true; summary?: string } | { ok: false; reason: string | null; stale: boolean }

export async function decidePending(id: string, action: 'approve' | 'decline'): Promise<DecideOutcome> {
  try {
    const body = await request<{ summary?: string }>(`/api/connector/pending/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
    })
    return { ok: true, summary: body?.summary }
  } catch (e) {
    const b = e instanceof ApiError ? (e.body as { reason?: string; error?: string; code?: string } | null) : null
    const stale = e instanceof ApiError && e.status === 409
    return { ok: false, reason: b?.reason ?? b?.error ?? null, stale }
  }
}

export async function switchConnection(connectionId: string): Promise<{ ok: true; warning?: string } | { ok: false }> {
  try {
    const body = await request<{ warning?: string }>('/api/connector/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId }),
    })
    return { ok: true, warning: body?.warning }
  } catch {
    return { ok: false }
  }
}
