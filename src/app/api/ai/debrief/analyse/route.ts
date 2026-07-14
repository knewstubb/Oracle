import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { buildAnalystPrompt } from '@/lib/debrief-prompts'
import type { DebriefBrief, DeckCardWithOwnership, Recommendation, DebriefSessionRow } from '@/lib/debrief-types'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const { sessionId } = body as { sessionId: number }

    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Validate session exists with status 'analysing'
    const { data: session, error: fetchErr } = await supabase
      .from('debrief_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.status !== 'analysing') {
      return Response.json(
        { error: `Session is in '${session.status}' state, expected 'analysing'` },
        { status: 409 }
      )
    }

    // Load brief_json from session
    if (!session.brief_json) {
      return Response.json({ error: 'Session has no brief data' }, { status: 400 })
    }

    const brief: DebriefBrief = JSON.parse(session.brief_json)

    // Load deck cards with ownership status
    const { data: deckCards, error: cardsErr } = await supabase
      .from('deck_cards')
      .select('card_name, quantity, categories, is_commander, ownership_status')
      .eq('deck_id', session.deck_id)

    if (cardsErr) {
      return Response.json({ error: cardsErr.message }, { status: 500 })
    }

    const cardsWithOwnership: DeckCardWithOwnership[] = (deckCards ?? []).map((row) => ({
      card_name: row.card_name,
      quantity: row.quantity,
      categories: row.categories,
      is_commander: Boolean(row.is_commander),
      ownership_status: (row.ownership_status as 'original' | 'proxy') || null,
    }))

    // Load deck strategy
    let strategy: { win_condition?: string; bracket?: number; frustration?: string; strategy_notes?: string } | null = null

    const { data: strategyRow } = await supabase
      .from('deck_strategy')
      .select('win_condition, bracket, frustration, strategy_notes')
      .eq('deck_id', session.deck_id)
      .single()

    if (strategyRow) {
      strategy = {
        win_condition: strategyRow.win_condition ?? undefined,
        bracket: strategyRow.bracket ?? undefined,
        frustration: strategyRow.frustration ?? undefined,
        strategy_notes: strategyRow.strategy_notes ?? undefined,
      }
    }

    // Build the analyst prompt
    const analystPrompt = buildAnalystPrompt(brief, cardsWithOwnership, strategy)

    // Call Anthropic heavy model (Claude Sonnet)
    const anthropic = new Anthropic()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: analystPrompt }],
    })

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json({ error: 'No text response from model' }, { status: 500 })
    }

    // Parse JSON response as Recommendation[]
    let recommendations: Recommendation[]
    try {
      const parsed = JSON.parse(textBlock.text)
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array')
      }
      recommendations = parsed
    } catch (parseErr) {
      const message = parseErr instanceof Error ? parseErr.message : 'Unknown parse error'
      return Response.json(
        { error: `Failed to parse recommendations: ${message}` },
        { status: 500 }
      )
    }

    // Validate and clamp to 1-5 recommendations
    if (recommendations.length === 0) {
      return Response.json(
        { error: 'Model produced zero recommendations' },
        { status: 500 }
      )
    }
    if (recommendations.length > 5) {
      recommendations = recommendations.slice(0, 5)
    }

    // Store recommendations and transition status
    const { error: updateErr } = await supabase
      .from('debrief_sessions')
      .update({
        recommendations_json: JSON.stringify(recommendations),
        status: 'recommending',
      })
      .eq('id', sessionId)

    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500 })
    }

    return Response.json({ recommendations })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Analysis failed: ${message}` }, { status: 500 })
  }
}
