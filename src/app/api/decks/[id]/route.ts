import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import { frontFaceName } from '@/lib/basic-lands'
import { getFormatConfig } from '@/lib/format-config'
import { getCommanderBuildCardRepository } from '@/lib/commander-context'
import { NextRequest } from 'next/server'
import type { Database } from '@/types/supabase'
import type { PatchDeckCommanderBody } from '../../../../../docs/oracle/contracts/manabox-import.types'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const { data: cards, error: cardsErr } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('card_name')

  if (cardsErr) {
    return Response.json({ error: cardsErr.message }, { status: 500 })
  }

  // Fetch mana costs and prices from card_metadata for all cards in this deck
  const cardNames = (cards ?? []).map(c => c.card_name)
  const manaCostMap: Record<string, string> = {}
  const priceMap: Record<string, number> = {}
  const rarityMap: Record<string, string> = {}
  if (cardNames.length > 0) {
    // Build lookup names: include both full DFC names and front-face variants
    const lookupNames = new Set(cardNames)
    for (const name of cardNames) {
      if (name.includes(' // ')) lookupNames.add(frontFaceName(name))
    }
    const lookupArray = Array.from(lookupNames)

    for (let i = 0; i < lookupArray.length; i += 200) {
      const batch = lookupArray.slice(i, i + 200)
      const { data: metaRows } = await supabase
        .from('ref_cards')
        .select('name, mana_cost, edhrec_rank')
        .in('name', batch)
      for (const row of metaRows ?? []) {
        if (row.mana_cost) manaCostMap[row.name] = row.mana_cost
      }
    }

    // Get prices from ref_printings for cards with scryfall_id
    const scryfallIdsForPrice = (cards ?? [])
      .map(c => c.scryfall_id)
      .filter((id): id is string => id !== null)
    
    if (scryfallIdsForPrice.length > 0) {
      const uniquePriceIds = [...new Set(scryfallIdsForPrice)]
      for (let i = 0; i < uniquePriceIds.length; i += 200) {
        const batch = uniquePriceIds.slice(i, i + 200)
        const { data: priceRows } = await supabase
          .from('ref_printings')
          .select('scryfall_id, name, price_usd, rarity')
          .in('scryfall_id', batch)
        for (const row of priceRows ?? []) {
          if (row.price_usd !== null) priceMap[row.name] = row.price_usd
          if (row.rarity) rarityMap[row.name] = row.rarity
        }
      }
    }

    // For DFC cards in deck_cards: if the full name didn't match but front-face did, propagate
    for (const name of cardNames) {
      if (name.includes(' // ') && !manaCostMap[name]) {
        const front = frontFaceName(name)
        if (manaCostMap[front]) manaCostMap[name] = manaCostMap[front]
        if (priceMap[front] !== undefined) priceMap[name] = priceMap[front]
        if (rarityMap[front]) rarityMap[name] = rarityMap[front]
      }
      // Also handle reverse: deck_cards has front-face only, metadata has full name
      if (!name.includes(' // ') && !manaCostMap[name]) {
        // Check if any full DFC name starts with this front face
        const fullName = Object.keys(manaCostMap).find(k => k.startsWith(name + ' // '))
        if (fullName) {
          manaCostMap[name] = manaCostMap[fullName]
          if (priceMap[fullName] !== undefined) priceMap[name] = priceMap[fullName]
          if (rarityMap[fullName]) rarityMap[name] = rarityMap[fullName]
        }
      }
    }

    // Auto-fill missing card data is no longer needed — all data comes from ref_cards and ref_printings
    // which are populated by sync jobs, not on-the-fly Scryfall queries
  }

  // Fetch edition names from ref_printings for cards with scryfall IDs
  const scryfallIds = (cards ?? []).map(c => c.scryfall_id).filter((id): id is string => id !== null)
  const editionMap: Record<string, { setCode: string; editionName: string }> = {}
  if (scryfallIds.length > 0) {
    const uniqueIds = [...new Set(scryfallIds)]
    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200)
      const { data: setRows } = await supabase
        .from('ref_printings')
        .select('scryfall_id, set_code, set_name')
        .in('scryfall_id', batch)
      for (const row of setRows ?? []) {
        editionMap[row.scryfall_id] = { setCode: row.set_code, editionName: row.set_name }
      }
    }
  }

  // Get associated brew session if deck is a draft
  const { data: brewSession } = await supabase
    .from('brew_sessions')
    .select('id')
    .eq('deck_id', deckId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch commander metadata (salt score, EDHREC rank) from ref_commanders
  // Use commander_id if available, otherwise fall back to name lookup
  let commanderMeta: { id: string; salt_score: number | null; edhrec_rank: number | null; edhrec_deck_count: number | null } | null = null
  
  if (deck.commander_id) {
    const { data } = await supabase
      .from('ref_commanders')
      .select('id, salt_score, edhrec_rank, edhrec_deck_count')
      .eq('id', deck.commander_id)
      .maybeSingle()
    commanderMeta = data
  } else if (deck.commander_name) {
    const { data } = await supabase
      .from('ref_commanders')
      .select('id, salt_score, edhrec_rank, edhrec_deck_count')
      .ilike('display_name', deck.commander_name)
      .limit(1)
      .maybeSingle()
    commanderMeta = data
  }

  // Allocation status is meaningful only when a physical copy is sleeved.
  // Planned rows intentionally stay nullable instead of defaulting to Original.
  const allocationMap: Record<string, string | null> = {}
  for (const card of cards ?? []) {
    allocationMap[card.card_name] = card.copy_id != null
      ? (card.ownership_status || 'original')
      : null
  }

  // Fetch synergy scores from the configured commander-context source.
  const synergyMap: Record<string, number> = {}
  if (deck.build_id && cardNames.length > 0) {
    const scores = await getCommanderBuildCardRepository()
      .getSynergyScores(deck.build_id, cardNames)

    for (const [cardName, synergyScore] of scores) {
      synergyMap[cardName] = synergyScore
    }

    // Handle DFC cards: propagate synergy from front-face to full name
    for (const name of cardNames) {
      if (name.includes(' // ') && synergyMap[name] === undefined) {
        const front = frontFaceName(name)
        if (synergyMap[front] !== undefined) {
          synergyMap[name] = synergyMap[front]
        }
      }
    }
  }

  // Merge allocation status, mana cost, price, edition, and synergy into cards
  const cardsWithStatus = (cards ?? []).map(card => ({
    ...card,
    lifecycle: card.copy_id != null ? 'sleeved' as const : 'planned' as const,
    allocation_status: card.copy_id != null
      ? (card.ownership_status || 'original')
      : null,
    allocation_role: card.copy_id != null
      ? (card.ownership_status || 'original')
      : null,
    mana_cost: manaCostMap[card.card_name] || null,
    price_usd: priceMap[card.card_name] ?? null,
    edition_name: card.scryfall_id ? editionMap[card.scryfall_id]?.editionName || null : null,
    rarity: rarityMap[card.card_name] || null,
    synergy_score: synergyMap[card.card_name] ?? null,
  }))

  return Response.json({
    deck: {
      ...deck,
      commander_id: commanderMeta?.id ?? deck.commander_id ?? null,
      salt_score: commanderMeta?.salt_score ?? null,
      edhrec_rank: commanderMeta?.edhrec_rank ?? null,
      edhrec_deck_count: commanderMeta?.edhrec_deck_count ?? null,
    },
    cards: cardsWithStatus,
    brewSessionId: brewSession?.id ?? null,
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, status')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const { data, error: deleteErr } = await supabase.rpc('delete_deck_with_release', {
    p_deck_id: deckId,
    p_user_id: authResult.id,
  })

  if (deleteErr) {
    if (deleteErr.message?.includes('deck_not_found')) {
      return Response.json({ error: 'Deck not found' }, { status: 404 })
    }
    return Response.json({ error: `Failed to delete deck: ${deleteErr.message}` }, { status: 500 })
  }

  const result = assertAtomicRpcSuccess(data, 'delete_deck_with_release')
  return Response.json({ success: true, ...result })
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * PATCH /api/decks/[id]
 *
 * Updates deck metadata fields: `build_id` and the commander fields
 * (`commander_id`, `commander_name`, `commander_scryfall_id`). Setting a
 * commander is a single `UPDATE decks` scoped to the authenticated user, used
 * by the post-import commander picker (D-052) and later changes (contract §15.3).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  let body: PatchDeckCommanderBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify deck ownership and read the format (needed for commander legality).
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, format')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const updatePayload: Database['public']['Tables']['decks']['Update'] = {}

  if ('build_id' in body) {
    if (body.build_id !== null) {
      if (typeof body.build_id !== 'string' || !UUID_REGEX.test(body.build_id)) {
        return Response.json({ error: 'Invalid build_id format' }, { status: 400 })
      }
    }
    updatePayload.build_id = body.build_id
  }

  const hasCommanderField =
    'commander_id' in body || 'commander_name' in body || 'commander_scryfall_id' in body

  if (hasCommanderField) {
    if (!getFormatConfig(deck.format).hasCommander) {
      return Response.json(
        { error: 'This format does not have a commander' },
        { status: 400 }
      )
    }

    // commander_id is authoritative when provided.
    if ('commander_id' in body) {
      const commanderId = body.commander_id
      if (commanderId === null) {
        // Clearing the commander clears every commander field.
        updatePayload.commander_id = null
        updatePayload.commander_name = null
        updatePayload.commander_scryfall_id = null
      } else {
        if (typeof commanderId !== 'string' || !UUID_REGEX.test(commanderId)) {
          return Response.json({ error: 'Invalid commander_id format' }, { status: 400 })
        }
        updatePayload.commander_id = commanderId
        updatePayload.commander_name = null
        updatePayload.commander_scryfall_id = null
      }
    } else if (body.commander_name !== undefined && body.commander_name !== null) {
      // Verify the named card can legally be a commander.
      const { data: refCard, error: refErr } = await supabase
        .from('ref_cards')
        .select('name, can_be_commander')
        .eq('name', body.commander_name)
        .limit(1)
        .maybeSingle()

      if (refErr) {
        return Response.json({ error: refErr.message }, { status: 500 })
      }
      if (!refCard || refCard.can_be_commander !== true) {
        return Response.json(
          { error: 'That card cannot be a commander' },
          { status: 400 }
        )
      }
      updatePayload.commander_name = body.commander_name
      updatePayload.commander_id = null
      updatePayload.commander_scryfall_id = body.commander_scryfall_id ?? null
    } else if (body.commander_scryfall_id !== undefined) {
      updatePayload.commander_scryfall_id = body.commander_scryfall_id
    } else {
      // commander_name explicitly null clears the name.
      updatePayload.commander_name = null
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('decks')
    .update(updatePayload)
    .eq('id', deckId)
    .eq('user_id', authResult.id)

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ success: true, updated: updatePayload })
}
