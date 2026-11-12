/**
 * POST /api/decks/[id]/chat-proposals/undo
 * Removes exactly the slot a chat add created, only if it is still an unchanged planned slot.
 * Body: { proposalIds: string[] }
 * Reply: { undone: string[], refused: [{proposalId, text}] }
 * Not a tool: the chat model cannot call this route.
 */
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { undoProposals } from '@/lib/chat-proposal-confirm'
import { NOT_FOUND, readProposalRequest } from '@/lib/chat-proposal-route'
import type { CheckClient } from '@/lib/chat-proposal-check'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await readProposalRequest(request, params)
  if (parsed instanceof Response) return parsed
  const outcome = await undoProposals(createAdminClient() as unknown as CheckClient, parsed)
  if (outcome.kind === 'ok') return Response.json(outcome.reply)
  if (outcome.kind === 'not_found') return NOT_FOUND()
  return Response.json({ error: "Couldn't undo that. Nothing was changed." }, { status: 500 })
}
