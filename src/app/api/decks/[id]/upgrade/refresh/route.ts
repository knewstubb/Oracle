import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const DEFAULT_USER_ID = process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Validate deck exists
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  try {
    // Clear existing candidates from deck_upgrades for this deck
    await supabase
      .from('deck_upgrades')
      .delete()
      .eq('deck_id', deckId)

    // TODO: Re-run upgrade engine (EDHREC staples, dead weight analysis, debrief fixes merge)
    // The full engine lives in scripts/generate-upgrade-data.ts and requires MCP client
    // for EDHREC data. Once a callable library module is extracted, invoke it here.
    // For now, write an empty candidates array and return 0.
    const candidates: unknown[] = []

    // Write new candidates to deck_upgrades
    const content = JSON.stringify(candidates)
    const { error: upsertErr } = await supabase
      .from('deck_upgrades')
      .upsert(
        {
          deck_id: deckId,
          content,
          generated_at: new Date().toISOString(),
          user_id: DEFAULT_USER_ID,
        },
        { onConflict: 'deck_id' }
      )

    if (upsertErr) {
      return Response.json({ error: upsertErr.message }, { status: 500 })
    }

    return Response.json({ success: true, candidate_count: candidates.length })
  } catch (err) {
    console.error('[upgrade/refresh] Error:', err)
    return Response.json(
      { error: 'Failed to refresh upgrade analysis' },
      { status: 500 }
    )
  }
}
