/**
 * Card Data API
 * 
 * Provides DB-first card lookups for client-side code.
 * Wraps the card-data utility functions for HTTP access.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getCardByName,
  getCardByFuzzyName,
  getCardPrinting,
  getCardWithPrinting,
  validateCommander,
  getCardEnrichment,
  getCardsByNames,
  getPrintingsByNames,
} from '@/lib/card-data'
import { getAuthUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  const action = searchParams.get('action') || 'get'
  const fuzzy = searchParams.get('fuzzy') === 'true'

  if (!name) {
    return NextResponse.json({ error: 'name parameter required' }, { status: 400 })
  }

  try {
    switch (action) {
      case 'validate-commander': {
        const result = await validateCommander(name)
        return NextResponse.json(result)
      }

      case 'scryfall_id': {
        // Lightweight lookup — scryfall_id for hover preview + commander eligibility for crown icon
        const printing = await getCardPrinting(name)
        if (!printing?.scryfall_id) {
          return NextResponse.json({ error: 'Card not found' }, { status: 404 })
        }
        // Check if card exists in ref_commanders (authoritative source for commander eligibility)
        const supabase = createAdminClient()
        const { data: commander } = await supabase
          .from('ref_commanders')
          .select('id')
          .eq('display_name', printing.name)
          .maybeSingle()
        return NextResponse.json({ 
          scryfall_id: printing.scryfall_id,
          can_be_commander: commander !== null,
        })
      }

      case 'enrich': {
        const result = await getCardEnrichment(name)
        if (!result) {
          return NextResponse.json({ error: 'Card not found' }, { status: 404 })
        }
        return NextResponse.json(result)
      }

      case 'detail': {
        // Get card data + printing + ownership info
        const printing = await getCardPrinting(name)
        if (!printing) {
          return NextResponse.json({ error: 'Card not found' }, { status: 404 })
        }

        // Get oracle_text, power, toughness from ref_cards
        const supabase = createAdminClient()
        const { data: refCard } = await supabase
          .from('ref_cards')
          .select('oracle_text, power, toughness')
          .eq('name', printing.name)
          .maybeSingle()

        // Check ownership via user_cards -> user_copies
        let owned = false
        let quantity = 0
        const inDecks: string[] = []

        const user = await getAuthUser()
        if (user) {
          // Find user's card entry by oracle_id
          const { data: userCard } = await supabase
            .from('user_cards')
            .select('id')
            .eq('user_id', user.id)
            .eq('oracle_id', printing.oracle_id)
            .maybeSingle()

          if (userCard) {
            // Count copies
            const { count } = await supabase
              .from('user_copies')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('card_id', userCard.id)
              .eq('is_proxy', false)

            quantity = count ?? 0
            owned = quantity > 0

            // Get decks using this card
            const { data: deckCards } = await supabase
              .from('deck_cards')
              .select('decks!deck_cards_deck_id_fkey(name)')
              .eq('user_id', user.id)
              .eq('card_name', printing.name)
            
            if (deckCards) {
              for (const dc of deckCards) {
                const deckName = (dc.decks as any)?.name
                if (deckName && !inDecks.includes(deckName)) {
                  inDecks.push(deckName)
                }
              }
            }
          }
        }

        return NextResponse.json({
          name: printing.name,
          mana_cost: printing.mana_cost,
          type_line: printing.type_line,
          oracle_text: refCard?.oracle_text,
          power: refCard?.power,
          toughness: refCard?.toughness,
          color_identity: printing.color_identity,
          image_uri: printing.image_uri_large || printing.image_uri_normal,
          price_usd: printing.price_usd,
          owned,
          quantity,
          in_decks: inDecks,
        })
      }

      case 'printing': {
        const printing = await getCardPrinting(name)
        if (!printing) {
          return NextResponse.json({ error: 'Printing not found' }, { status: 404 })
        }
        return NextResponse.json(printing)
      }

      case 'full': {
        const result = await getCardWithPrinting(name)
        if (!result) {
          return NextResponse.json({ error: 'Card not found' }, { status: 404 })
        }
        return NextResponse.json(result)
      }

      case 'get':
      default: {
        const card = fuzzy 
          ? await getCardByFuzzyName(name) 
          : await getCardByName(name)
        if (!card) {
          return NextResponse.json({ error: 'Card not found' }, { status: 404 })
        }
        return NextResponse.json(card)
      }
    }
  } catch (error) {
    console.error('[api/cards] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/cards - Batch operations
 * 
 * Body: { names: string[], action: 'get' | 'printings' | 'enrich' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { names, action = 'get' } = body

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: 'names array required' }, { status: 400 })
    }

    // Limit batch size to prevent abuse
    if (names.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 names per request' }, { status: 400 })
    }

    switch (action) {
      case 'printings': {
        const results = await getPrintingsByNames(names)
        // Convert Map to object for JSON serialization
        return NextResponse.json(Object.fromEntries(results))
      }

      case 'get':
      default: {
        const results = await getCardsByNames(names)
        return NextResponse.json(Object.fromEntries(results))
      }
    }
  } catch (error) {
    console.error('[api/cards] Batch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
