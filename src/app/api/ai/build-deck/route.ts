import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildAround, suggestManaBase } from '@/lib/mcp-client'

export interface DeckSuggestion {
  name: string
  manaCost: string
  typeLine: string
  role: string
  owned: boolean
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const { commanderName, collectionOnly } = body as {
      commanderName: string
      collectionOnly?: boolean
    }

    if (!commanderName || typeof commanderName !== 'string') {
      return Response.json(
        { error: 'Invalid commander name' },
        { status: 400 },
      )
    }

    // Fetch collection for owned checks
    const supabase = createAdminClient()
    const { data: collection } = await supabase
      .from('collection')
      .select('card_name, quantity')

    const ownedSet = new Set(
      (collection ?? []).map((c) => c.card_name.toLowerCase()),
    )

    // Step 1: Get non-land card suggestions via buildAround
    const buildResult = await buildAround([commanderName], 'commander', {
      limit: 65,
    })

    let nonLandCards: DeckSuggestion[] = (buildResult.cards ?? []).map(
      (c) => ({
        name: c.name,
        manaCost: c.manaCost || '',
        typeLine: c.typeLine || '',
        role: c.role || '',
        owned: ownedSet.has(c.name.toLowerCase()),
      }),
    )

    // Filter to owned cards if collectionOnly
    if (collectionOnly) {
      nonLandCards = nonLandCards.filter((c) => c.owned)
    }

    // Step 2: Get land suggestions via suggestManaBase
    let landCards: DeckSuggestion[] = []
    let manaBaseNote: string | undefined

    const nonLandNames = nonLandCards.map((c) => c.name)

    const [manaResult] = await Promise.allSettled([
      suggestManaBase(nonLandNames, 'commander'),
    ])

    if (manaResult.status === 'fulfilled') {
      landCards = (manaResult.value.lands ?? []).map((l) => ({
        name: l.name,
        manaCost: '',
        typeLine: 'Land',
        role: l.reason || 'Mana base',
        owned: ownedSet.has(l.name.toLowerCase()),
      }))

      if (collectionOnly) {
        landCards = landCards.filter((c) => c.owned)
      }
    } else {
      manaBaseNote =
        'Mana base generation failed. You may need to add lands manually.'
    }

    const cards = [...nonLandCards, ...landCards]

    return Response.json({
      commander: commanderName,
      cards,
      totalCards: cards.length,
      ...(manaBaseNote && { manaBaseNote }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Deck generation failed: ${message}` },
      { status: 500 },
    )
  }
}
