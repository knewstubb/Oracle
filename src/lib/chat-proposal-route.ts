// Shared request handling for the three chat-proposal routes (confirm, undo, dismiss).
// These are plain page-to-server routes. They are not tools: nothing in the tool registry points here.

import type { NextRequest } from 'next/server'
import { requireAuth } from './auth'
import { parseProposalIds } from './chat-proposal-confirm'

export async function readProposalRequest(
  request: NextRequest,
  params: Promise<{ id: string }>
): Promise<Response | { userId: string; deckId: number; proposalIds: string[] }> {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const deckId = Number.parseInt(id, 10)
  if (!Number.isInteger(deckId) || deckId <= 0) return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  let body: { proposalIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const proposalIds = parseProposalIds(body?.proposalIds)
  if (!proposalIds) return Response.json({ error: 'proposalIds must be 1 to 30 proposal ids' }, { status: 400 })
  return { userId: authResult.id, deckId, proposalIds }
}

/** One reply for "not your deck" and "no such proposal", so nothing leaks. */
export const NOT_FOUND = () => Response.json({ error: 'Not found' }, { status: 404 })
