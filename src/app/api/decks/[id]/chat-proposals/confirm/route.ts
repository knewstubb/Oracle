/**
 * POST /api/decks/[id]/chat-proposals/confirm
 * The owner clicked Add (one id) or Add all (many). Adds planned slots, quantity 1, no copy moved.
 * Body: { proposalIds: string[] }
 * Reply: { added: [{proposalId, deckCardId}], skipped: [{proposalId, blockReason, blockText}], deckCardCount }
 * Errors: 401 not signed in, 404 not your deck or unknown id, 409 already used, 410 expired, 500 nothing added.
 * Not a tool: the chat model cannot call this route.
 */
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { confirmProposals } from '@/lib/chat-proposal-confirm'
import { NOT_FOUND, readProposalRequest } from '@/lib/chat-proposal-route'
import type { CheckClient } from '@/lib/chat-proposal-check'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await readProposalRequest(request, params)
  if (parsed instanceof Response) return parsed
  const outcome = await confirmProposals(createAdminClient() as unknown as CheckClient, parsed)
  switch (outcome.kind) {
    case 'ok': return Response.json(outcome.reply)
    case 'not_found': return NOT_FOUND()
    case 'used': return Response.json({ error: 'This suggestion was already used.' }, { status: 409 })
    case 'expired': return Response.json({ error: 'This suggestion has expired. Ask me again.' }, { status: 410 })
    default: return Response.json({ error: "Couldn't add that card. Nothing was added." }, { status: 500 })
  }
}
