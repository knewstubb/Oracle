/**
 * Generate Session Name API
 * 
 * POST /api/oracle/sessions/[id]/generate-name
 * 
 * Uses AI to generate a short, descriptive name (3-6 words) for a session
 * based on the first AI response content. Called automatically after the
 * first substantive AI response in a session.
 * 
 * Body:
 *   responseContent: string — The AI response to base the name on
 * 
 * Returns the generated name and updates the session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getModelConfig, DEFAULT_MODEL_ID } from '@/lib/ai-models'
import { createProviderAdapter } from '@/lib/provider-factory'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateNameBody {
  responseContent: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAME_GENERATION_PROMPT = `You are a helpful assistant that generates short, descriptive names for chat sessions.

Given the AI response below, generate a concise session name that captures the main topic or intent.

Rules:
- Use 3-6 words maximum
- Be specific to the topic (e.g., "Sacrifice aristocrats exploration" not "Deck building help")
- Use lowercase except for proper nouns or card/commander names
- No punctuation at the end
- For deck-building conversations, mention the strategy or commander if discussed
- For collection questions, mention the card type or theme if specific

Examples of good names:
- "Sacrifice aristocrats exploration"
- "Zedruu politics build"
- "Korvold land destruction cuts"
- "Blue green ramp options"
- "Missing fetchland alternatives"
- "Mana curve analysis"

AI Response to analyze:
"""
{RESPONSE}
"""

Generate only the session name, nothing else.`

// ---------------------------------------------------------------------------
// POST — Generate session name from AI response
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const body = (await request.json()) as GenerateNameBody

  if (!body.responseContent?.trim()) {
    return NextResponse.json(
      { error: 'responseContent is required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Verify session exists and belongs to user
  const { data: session, error: sessionError } = await supabase
    .from('oracle_sessions')
    .select('id, session_name')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (sessionError) {
    if (sessionError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    console.error('[generate-name] Error fetching session:', sessionError)
    return NextResponse.json({ error: sessionError.message }, { status: 500 })
  }

  // Skip if session already has a name
  if (session.session_name) {
    return NextResponse.json({
      sessionName: session.session_name,
      skipped: true,
      reason: 'Session already has a name',
    })
  }

  // Truncate response content to avoid token limits
  const truncatedContent = body.responseContent.slice(0, 2000)

  // Generate name using AI
  const modelConfig = getModelConfig(DEFAULT_MODEL_ID)
  const adapter = createProviderAdapter(modelConfig)

  const prompt = NAME_GENERATION_PROMPT.replace('{RESPONSE}', truncatedContent)

  try {
    const response = await adapter.generateText({
      model: modelConfig.modelId,
      system: 'You generate concise session names. Output only the name, nothing else.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 50,
    })

    // Clean up the generated name
    let generatedName = response.text.trim()
    
    // Remove quotes if present
    generatedName = generatedName.replace(/^["']|["']$/g, '')
    
    // Truncate to 100 chars (database limit)
    generatedName = generatedName.slice(0, 100)

    // Validate we got something reasonable
    if (!generatedName || generatedName.length < 3) {
      return NextResponse.json({
        sessionName: null,
        skipped: true,
        reason: 'Generated name was too short or empty',
      })
    }

    // Update the session with the generated name
    const { error: updateError } = await supabase
      .from('oracle_sessions')
      .update({ session_name: generatedName })
      .eq('id', id)
      .eq('user_id', userId)

    if (updateError) {
      console.error('[generate-name] Error updating session:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      sessionName: generatedName,
      skipped: false,
    })
  } catch (error) {
    console.error('[generate-name] AI generation error:', error)
    // Don't fail the request — naming is non-critical
    return NextResponse.json({
      sessionName: null,
      skipped: true,
      reason: 'AI generation failed',
    })
  }
}
