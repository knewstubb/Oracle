import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { deckAnalysis, commanderOverview } from '@/lib/mcp-client'
import { formatStrategyPromptBlock, type StrategyData } from '@/lib/format-strategy-prompt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deckId } = body as { deckId: number }

    if (!deckId || typeof deckId !== 'number') {
      return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .select('id, name, commander_name')
      .eq('id', deckId)
      .single()

    if (deckErr || !deck) {
      return Response.json({ error: 'Deck not found' }, { status: 404 })
    }

    const { data: cards, error: cardsErr } = await supabase
      .from('deck_cards')
      .select('card_name, is_commander')
      .eq('deck_id', deckId)

    if (cardsErr) {
      return Response.json({ error: cardsErr.message }, { status: 500 })
    }

    const commanderName = deck.commander_name || cards?.find((c) => c.is_commander)?.card_name || ''
    const cardNames = (cards ?? []).map((c) => c.card_name)

    // Fetch strategy data if configured
    const { data: strategyRow } = await supabase
      .from('deck_strategy')
      .select('deck_id, win_condition, table_context, bracket, budget_mode, frustration, strategy_notes')
      .eq('deck_id', deckId)
      .single()

    const strategyData: StrategyData = strategyRow
      ? {
          configured: true,
          win_condition: strategyRow.win_condition,
          table_context: strategyRow.table_context,
          bracket: strategyRow.bracket,
          budget_mode: strategyRow.budget_mode,
          frustration: strategyRow.frustration,
          strategy_notes: strategyRow.strategy_notes,
        }
      : { configured: false, win_condition: null, table_context: null, bracket: null, budget_mode: null, frustration: null, strategy_notes: null }

    const strategyBlock = formatStrategyPromptBlock(strategyData)

    // Run MCP analysis calls in parallel
    const [analysis, overview] = await Promise.allSettled([
      deckAnalysis(cardNames, commanderName, strategyBlock),
      commanderOverview(commanderName, cardNames),
    ])

    const analysisResult = analysis.status === 'fulfilled' ? analysis.value : null
    const overviewResult = overview.status === 'fulfilled' ? overview.value : null

    if (!analysisResult) {
      const reason = analysis.status === 'rejected' ? analysis.reason?.message : 'Unknown error'
      return Response.json({ error: `Analysis failed: ${reason}` }, { status: 500 })
    }

    // Merge commander overview combos with deck analysis combos
    const allCombos = [
      ...analysisResult.combos,
      ...(overviewResult?.combos ?? []),
    ]
    // Deduplicate combos by cards
    const seenComboKeys = new Set<string>()
    const uniqueCombos = allCombos.filter((combo) => {
      const key = combo.cards.slice().sort().join('|')
      if (seenComboKeys.has(key)) return false
      seenComboKeys.add(key)
      return true
    })

    // Build win conditions from overview oracle text + analysis strengths
    const winConditions: string[] = []
    if (overviewResult?.oracleText) {
      winConditions.push(overviewResult.oracleText)
    }

    // Build strategy summary from raw analysis
    const strategy = extractStrategy(analysisResult.raw, commanderName)

    return Response.json({
      strategy,
      winConditions,
      combos: uniqueCombos,
      strengths: analysisResult.strengths,
      weaknesses: analysisResult.weaknesses,
      bracket: analysisResult.bracket,
      manaCurve: analysisResult.manaCurve,
      averageCmc: analysisResult.averageCmc,
      commanderName,
      strategyContext: strategyBlock,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Analysis failed: ${message}` }, { status: 500 })
  }
}

/**
 * Extract a strategy summary from the raw MCP response text.
 */
function extractStrategy(raw: string, commanderName: string): string {
  const strategyMatch = raw.match(/(?:strategy|overview|summary)[:\s]*\n([\s\S]*?)(?:\n#{1,3}\s|\n\n\n|$)/i)
  if (strategyMatch) {
    return cleanMarkdown(strategyMatch[1].trim()).slice(0, 500)
  }

  const parts: string[] = []

  const bracketMatch = raw.match(/\*\*Bracket:\*\*\s*(\S+)/i)
  if (bracketMatch) parts.push(`Power bracket: ${bracketMatch[1]}`)

  const avgMatch = raw.match(/\*\*Average mana value:\*\*\s*([\d.]+)/i)
  if (avgMatch) parts.push(`Average mana value: ${avgMatch[1]}`)

  const comboCount = (raw.match(/\*\*\[[\w-]+\]\*\*/g) || []).length
  if (comboCount > 0) parts.push(`${comboCount} combo(s) detected`)

  const almostMatch = raw.match(/\*\*Almost included:\*\*\s*(\d+)/i)
  if (almostMatch && parseInt(almostMatch[1]) > 0) parts.push(`${almostMatch[1]} near-combos available`)

  if (parts.length > 0) {
    return `${commanderName} — ${parts.join('. ')}.`
  }

  return `${commanderName} deck analysis complete.`
}

/** Strip markdown formatting from text */
function cleanMarkdown(text: string): string {
  return text
    .replace(/^#+\s+.*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
