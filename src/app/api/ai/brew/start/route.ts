// ---------------------------------------------------------------------------
// POST /api/ai/brew/start
// Start a new brew session — Path A (commander) or Path B (concept)
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildBrewInvestigatorPrompt } from '@/lib/brew-prompts'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const body = await request.json()
    const { pathType, commanderName, conceptDescription } = body as {
      pathType: string
      commanderName?: string
      conceptDescription?: string
    }

    // --- Validate pathType ---
    if (!pathType || !['commander', 'concept'].includes(pathType)) {
      return Response.json(
        { error: "pathType must be 'commander' or 'concept'" },
        { status: 400 }
      )
    }

    // --- Path-specific validation ---
    if (pathType === 'commander') {
      if (!commanderName || typeof commanderName !== 'string' || commanderName.trim().length === 0) {
        return Response.json(
          { error: 'commanderName is required for commander path' },
          { status: 400 }
        )
      }
    }

    if (pathType === 'concept') {
      if (!conceptDescription || typeof conceptDescription !== 'string' || conceptDescription.trim().length === 0) {
        return Response.json(
          { error: 'conceptDescription is required for concept path' },
          { status: 400 }
        )
      }
    }

    const supabase = createAdminClient()

    // --- Insert new brew session ---
    const { data: newSession, error: insertErr } = await supabase
      .from('brew_sessions')
      .insert({
        status: 'investigating',
        path_type: pathType,
        commander_name: pathType === 'commander' ? commanderName!.trim() : null,
        concept_description: pathType === 'concept' ? conceptDescription!.trim() : null,
        user_id: userId,
      })
      .select('id')
      .single()

    if (insertErr || !newSession) {
      return Response.json(
        { error: `Failed to create session: ${insertErr?.message || 'Unknown error'}` },
        { status: 500 }
      )
    }

    const sessionId = newSession.id

    // --- Generate first investigator message via AI ---
    const systemPrompt = buildBrewInvestigatorPrompt(
      pathType as 'commander' | 'concept',
      pathType === 'commander' ? commanderName!.trim() : undefined,
      pathType === 'concept' ? conceptDescription!.trim() : undefined
    )

    let firstMessage: string

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const anthropic = new Anthropic()

      // Build the initial conversation — user's concept/commander as first input
      const userContext = pathType === 'commander'
        ? `I want to build a deck with ${commanderName!.trim()} as my commander.`
        : conceptDescription!.trim()

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContext }],
      })

      firstMessage = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')

      if (!firstMessage) {
        firstMessage = pathType === 'commander'
          ? `Great choice with ${commanderName!.trim()}! Let's figure out how you want to win. What's the game plan — combo, value, aggro, or something else?`
          : `Interesting concept! Let me help you find the right commander for that. What colours are you leaning towards?`
      }
    } catch {
      // Fallback if AI call fails
      firstMessage = pathType === 'commander'
        ? `Let's brew with ${commanderName!.trim()}! What's the game plan — how do you want to win?`
        : `Interesting! Tell me more about what you're imagining — what colours or strategies appeal to you?`
    }

    // Store the initial conversation
    const userMsg = pathType === 'commander'
      ? `I want to build a deck with ${commanderName!.trim()} as my commander.`
      : conceptDescription!.trim()

    const initialConversation = [
      { role: 'user', content: userMsg },
      { role: 'assistant', content: firstMessage },
    ]

    await supabase
      .from('brew_sessions')
      .update({ conversation_json: JSON.stringify(initialConversation) })
      .eq('id', sessionId)

    return Response.json({ sessionId, firstMessage })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Failed to start brew session: ${message}` },
      { status: 500 }
    )
  }
}
