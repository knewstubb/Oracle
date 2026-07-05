import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getMcpClient } from '@/lib/mcp-client'

interface BulkCard {
  name: string
  mana_cost?: string
  manaCost?: string
  type_line?: string
  typeLine?: string
  oracle_text?: string
  oracleText?: string
  color_identity?: string[]
  colorIdentity?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, collectionOnly } = body as {
      query: string
      collectionOnly?: boolean
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return Response.json({ error: 'Query is required' }, { status: 400 })
    }

    // Extract the name portion from the query (strip Scryfall syntax)
    const nameQuery = query
      .replace(/\bt:legendary\b/gi, '')
      .replace(/\bt:creature\b/gi, '')
      .replace(/\bf:commander\b/gi, '')
      .replace(/\bf:edh\b/gi, '')
      .trim()

    if (!nameQuery) {
      return Response.json({ cards: [] })
    }

    // Use bulk_card_search which works with offline Scryfall data
    const client = await getMcpClient()
    const result = await client.callTool({
      name: 'bulk_card_search',
      arguments: { query: nameQuery, search_field: 'name', limit: 30 },
    })

    if (result.isError) {
      const errText = (result.content as { type: string; text?: string }[])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
      throw new Error(`MCP tool "bulk_card_search" failed: ${errText}`)
    }

    // Parse structured content if available
    let rawCards: BulkCard[] = []
    const structured = (result as { structuredContent?: { cards?: BulkCard[] } }).structuredContent
    if (structured?.cards) {
      rawCards = structured.cards
    } else {
      // Fallback: parse text content
      const textContent = (result.content as { type: string; text?: string }[])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n')

      // Try JSON parse
      try {
        const parsed = JSON.parse(textContent)
        if (parsed.cards) rawCards = parsed.cards
      } catch {
        // Not JSON — return empty
      }
    }

    // Filter to legendary creatures only (commanders)
    const isCommander = (card: BulkCard) => {
      const typeLine = (card.type_line ?? card.typeLine ?? '').toLowerCase()
      return typeLine.includes('legendary') && typeLine.includes('creature')
    }

    // Build a set of owned card names from collection
    const supabase = createServerClient()
    const { data: collectionRows } = await supabase
      .from('collection')
      .select('card_name, quantity')

    const ownedMap = new Map(
      (collectionRows ?? []).map((r) => [r.card_name.toLowerCase(), r.quantity ?? 0])
    )

    // Map and filter results
    let cards = rawCards
      .filter(isCommander)
      .map((card) => ({
        name: card.name,
        manaCost: card.mana_cost ?? card.manaCost ?? '',
        typeLine: card.type_line ?? card.typeLine ?? '',
        oracleText: card.oracle_text ?? card.oracleText ?? '',
        colorIdentity: card.color_identity ?? card.colorIdentity ?? [],
        owned: ownedMap.has(card.name.toLowerCase()),
        ownedCount: ownedMap.get(card.name.toLowerCase()) ?? 0,
      }))

    // Filter to collection only if requested
    if (collectionOnly) {
      cards = cards.filter((c) => c.owned)
    }

    return Response.json({ cards })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Search failed: ${message}` }, { status: 500 })
  }
}
