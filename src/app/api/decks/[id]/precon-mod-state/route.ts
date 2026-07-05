import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getPreconModState } from '@/lib/precon-mod-store'
import { computeTradeDown } from '@/lib/precon-mod-engine'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const state = await getPreconModState(deckId)
  if (!state) {
    return Response.json({ error: 'State not yet computed' }, { status: 404 })
  }

  // Fetch updated_at separately (not part of the PreconModState interface)
  const supabase = createServerClient()
  const { data: row } = await supabase
    .from('precon_mod_state')
    .select('updated_at')
    .eq('deck_id', deckId)
    .maybeSingle()

  const trade_down = computeTradeDown(state)

  return Response.json({
    swaps_used: state.swaps_used,
    sol_ring_removed: state.sol_ring_removed,
    rarity_mythic_used: state.rarity_mythic_used,
    rarity_rare_used: state.rarity_rare_used,
    rarity_uncommon_used: state.rarity_uncommon_used,
    rarity_common_used: state.rarity_common_used,
    budget_spent: state.budget_spent,
    budget_cap: 50,
    trade_down,
    updated_at: row?.updated_at ?? null,
  })
}
