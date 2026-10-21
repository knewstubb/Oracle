/**
 * Generic basic lands on a deck (contract generic-basic-lands §3A, §6).
 *
 * POST  { cardName, count, finish?, language?, scryfallId? }  set how many generics of a basic (0 removes the line)
 * PATCH { cardName, sleeved?, finish?, language?, scryfallId? } edit the whole generic line
 *
 * Neither creates, links or releases a collection copy.
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { GenericBasicsError, setGenericBasicCount, updateGenericLine } from '@/lib/generic-basics'

async function readDeckId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params
  const deckId = parseInt(id, 10)
  return Number.isNaN(deckId) ? null : deckId
}

function fail(err: unknown) {
  if (err instanceof GenericBasicsError) return Response.json({ error: err.message }, { status: err.status })
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[generic-basics] ${message}`)
  return Response.json({ error: 'Generic basics update failed' }, { status: 500 })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const deckId = await readDeckId(params)
  if (deckId === null) return Response.json({ error: 'Invalid deck ID' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  try {
    const result = await setGenericBasicCount(createAdminClient(), {
      deckId,
      userId: authResult.id,
      cardName: body.cardName,
      count: body.count,
      finish: body.finish,
      language: body.language,
      scryfallId: body.scryfallId,
    })
    return Response.json(result)
  } catch (err) {
    return fail(err)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const deckId = await readDeckId(params)
  if (deckId === null) return Response.json({ error: 'Invalid deck ID' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  try {
    const result = await updateGenericLine(createAdminClient(), {
      deckId,
      userId: authResult.id,
      cardName: body.cardName,
      sleeved: body.sleeved,
      finish: body.finish,
      language: body.language,
      scryfallId: body.scryfallId,
      extra: body,
    })
    return Response.json(result)
  } catch (err) {
    return fail(err)
  }
}
