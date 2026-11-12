/**
 * POST /api/decks/[id]/chat-proposals/dismiss
 * "Not now": hides the proposals. Changes only the proposal rows, never the deck.
 * Body: { proposalIds: string[] }
 * Not a tool: the chat model cannot call this route.
 */
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { dismissProposals } from '@/lib/chat-proposal-confirm'
import { NOT_FOUND, readProposalRequest } from '@/lib/chat-proposal-route'
import type { CheckClient } from '@/lib/chat-proposal-check'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await readProposalRequest(request, params)
  if (parsed instanceof Response) return parsed
  const outcome = await dismissProposals(createAdminClient() as unknown as CheckClient, parsed)
  if (outcome === 'ok') return Response.json({ ok: true })
  if (outcome === 'not_found') return NOT_FOUND()
  return Response.json({ error: "Couldn't dismiss that." }, { status: 500 })
}
