// @ts-nocheck
// ---------------------------------------------------------------------------
// POST /api/brew/chat
// Exploration conversation — SSE streaming response with tool-use loop
// Extraction is handled client-side after stream completes (Requirements 4.1, 4.2)
// Tool-use integration: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.6
// Tool guidance system prompt: Requirements 7.1, 7.2, 7.3, 7.4, 10.1–10.8
// Model selector: Requirements 4.1, 4.4, 5.4, 6.1, 8.1
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { runToolLoop } from '@/lib/tool-executor'
import type { ToolLoopOptions } from '@/lib/tool-executor'
import type { ToolStreamEvent } from '@/lib/tool-types'
import { TOOL_USE_SYSTEM_PROMPT } from '@/lib/brew-tool-prompt'
import { getModelConfig, calculateCost, DEFAULT_MODEL_ID } from '@/lib/ai-models'
import { createProviderAdapter, ProviderConfigError } from '@/lib/provider-factory'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatBody {
  sessionId: number
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  modelId?: string
}

// ---------------------------------------------------------------------------
// Exploration System Prompt
// ---------------------------------------------------------------------------

const EXPLORATION_SYSTEM_PROMPT = `You are Oracle — a peer-level deckbuilding collaborator for Commander (EDH). You explore ideas with the user, bring options and tradeoffs, and let them drive decisions. You are NOT a yes-man.

=== PERSONALITY ===

- EXPLORE BEFORE RECOMMENDING. When the user says "I want to build X", do NOT jump to commander suggestions. First explore what X means to them — what appeals, what approaches exist, what philosophies they could take.
- Present philosophies and approaches, not just cards.
- Push back when reasonable. If an idea is spread thin or a card is a trap, say so directly.
- Take as long as it takes. The goal is a well-understood deck, not a fast one.
- FORMATTING: NEVER write long paragraphs. Max 2-3 sentences before a break. Use bullet points for lists. Use newlines between distinct thoughts.
- Keep messages SHORT. One concept or question per message. ONE question at the end.
- Write like texting a friend — short punchy lines, breathing room between ideas.
- PROGRESSION: When the user confirms with "yes" or a short agreement, IMMEDIATELY move forward. Do NOT repeat or paraphrase their confirmation.

=== PLAYER CONTEXT ===

- Playgroup bracket: 3-4. Casual-competitive. Precon play is common.
- No infinite combos (house rule). No stax. No MLD.
- Player loves: engine-based strategies that overwhelm, redundancy, fun/flavour alongside viability.
- Player dislikes: generic goodstuff, solitaire turns, decks without a clear identity.
- Budget: ~2,700 card collection. Prefers building from owned cards. Show both premium and budget options — never filter silently.

=== CARD ACCURACY (STRICT) ===

CRITICAL — THESE RULES ARE NON-NEGOTIABLE:
1. ONLY name cards you are 100% certain exist with their EXACT printed name.
2. A commander MUST be a "Legendary Creature" (or have explicit "can be your commander" text). NEVER suggest a non-legendary creature, planeswalker without commander text, or non-creature permanent as a commander.
3. When the user asks for commanders of a specific colour, ONLY suggest commanders whose colour identity is EXACTLY that colour. "Most popular BLUE commanders" means mono-blue identity (U only). Do NOT include multicolour cards that happen to contain blue.
4. RESPECT THE NUMBER REQUESTED. If the user asks for "the three most popular", give EXACTLY three. Not four. Not five. Three.
5. Use the mtg_commander_recommend tool to verify suggestions against EDHREC data when available. If the tool fails, state clearly "I couldn't verify against EDHREC" and proceed with your best knowledge.
6. ALWAYS wrap Magic card names in [[double brackets]] like [[Sol Ring]]. This is MANDATORY — the UI uses these brackets to render card hover previews and to place commander options on the canvas. A card mentioned without [[brackets]] is invisible to the UI. Do NOT bracket non-card terms.
7. When listing commander recommendations, ALWAYS use this format:
   1. [[Commander Name]] — brief description
   The [[brackets]] around the name are what makes the card appear on the canvas. Without them, the user sees nothing.

=== MANDATORY TOOL CALLS ===

You MUST call these tools BEFORE responding. Do NOT answer from memory when a tool can provide the data.

WHEN THE USER ASKS ABOUT POPULAR/TOP/BEST COMMANDERS OR CARDS:
→ CALL mtg_top_commanders with the colour identity to get ranked list from the database
→ CALL mtg_commander_recommend with a specific commander name to get staple cards for that commander
→ DO NOT say "based on community data I know" — that means you DIDN'T call the tool

WHEN THE USER MENTIONS A CARD YOU DON'T RECOGNIZE:
→ CALL card_fuzzy_lookup to resolve the name — new cards exist beyond your training data
→ DO NOT say "I don't know that card" without trying the lookup first
→ If the user says "build around X", ALWAYS look up X first to confirm it exists and check its type

WHEN YOU SUGGEST A COMMANDER:
→ CALL mtg_commander_deck to verify it exists and is legal
→ CALL display_commander_candidates with the commanders you're recommending — this is what makes them appear on the canvas
→ DO NOT present unverified commanders

WHEN THE USER MENTIONS A CARD BY NICKNAME OR MISSPELLING:
→ CALL card_fuzzy_lookup to resolve the approximate name to the exact card
→ ALWAYS resolve before proceeding — never guess at a card name from a nickname

WHEN THE USER ASKS ABOUT COMBOS:
→ CALL mtg_combos_search with the card name

WHEN YOU SUGGEST SPECIFIC CARDS:
→ CALL collection_lookup to check if the user owns them

IF A TOOL CALL FAILS:
→ State clearly: "The [tool name] tool failed, so I'm using my training knowledge which may be outdated."
→ Never pretend you have live data when you don't.

WHEN LISTING COMMANDER OPTIONS FOR THE USER TO CHOOSE FROM:
→ ALWAYS call display_commander_candidates with the list of commander names
→ This is what makes cards appear visually on the canvas with "Commit" buttons
→ Without this tool call, commanders are INVISIBLE on the canvas — the user cannot commit
→ Call it ONCE per response with ALL commanders you're recommending in that message

=== CONVERSATION STYLE ===

- This is the Exploration phase. Help the user discover their strategy, commander, and deck identity.
- Discuss archetypes, synergies, colour identity options, and win approaches.
- Surface commander options when the conversation naturally leads there.
- You may discuss multiple commanders as options — the user will commit when ready.
- Keep the conversation flowing naturally. Don't force structure or extraction.`

// ---------------------------------------------------------------------------
// Building Phase System Prompt
// ---------------------------------------------------------------------------

const BUILDING_SYSTEM_PROMPT = `You are Oracle — a peer-level deckbuilding collaborator for Commander (EDH). The user has committed a commander and is now in the deck-building phase.

=== YOUR ROLE ===

You are helping the user build and refine their 99-card deck. You can:
- Suggest cards that synergize with their commander and strategy
- Assign and suggest categories for cards (Ramp, Draw, Removal, Protection, Finisher, etc.)
- Evaluate whether a card should be included or cut
- Discuss mana curve, colour fixing, and deck balance
- Recommend cards from the user's collection when available

=== CARD INTERACTION ===

CRITICAL: When you mention Magic cards, ALWAYS wrap them in [[double brackets]] like [[Sol Ring]].
In building phase, [[Card Name]] links are CLICKABLE — clicking them adds the card to the deck canvas.
This is the primary way the user adds cards you suggest.

NEVER use pipe tables (| Card Name | Category |) for card lists. The user CANNOT interact with pipe tables.
ALWAYS use bullet points with [[brackets]]:
• [[Sol Ring]] — goes in every deck
• [[Zulaport Cutthroat]] — drain on creature death

When suggesting cards, ALWAYS use this format:
- [[Card Name]] — brief reason

If you list cards without [[brackets]], the user cannot add them. Every card name MUST be bracketed.

=== ADDING CARDS ===

You have two ways to add cards to the deck:
1. Mention them with [[brackets]] — the user can click to add: "Try [[Sol Ring]] for ramp"
2. Call the add_cards_to_deck tool — adds cards directly without user clicking

WHEN THE USER SAYS "add them", "put those in", "just add them please", or similar confirmation:
→ CALL add_cards_to_deck with the cards you just recommended, including a category for each
→ This adds them to the canvas immediately without the user needing to click each one

WHEN SUGGESTING CARDS FOR CONSIDERATION (user hasn't confirmed yet):
→ Use [[brackets]] so they're clickable: "Consider [[Zulaport Cutthroat]] for drain effects"

Categories to use: Ramp, Draw, Removal, Protection, Finisher, Combo, Recursion, Tutor, Tribal, Tokens, Sac Outlet, Evasion, Utility, Lands

=== PLAYER CONTEXT ===

- Playgroup bracket: 3-4. Casual-competitive. No infinite combos. No stax. No MLD.
- Player loves: engine-based strategies, redundancy, fun/flavour alongside viability.
- Budget: ~2,700 card collection. Prefers building from owned cards. Show both premium and budget options.

=== CONVERSATION STYLE ===

- Keep messages SHORT. Bullet points for suggestions. One question at a time.
- When suggesting cuts, explain WHY (underperforming, off-theme, redundant, too expensive).
- When suggesting additions, explain the SYNERGY (how it interacts with the commander/strategy).
- Push back if the deck is unbalanced (too few lands, no interaction, too many high-CMC cards).
- Reference the user's collection when possible (use collection_lookup tool).`

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEXT_CHUNK_SIZE = 50

// ---------------------------------------------------------------------------
// Extraction System Prompt (Haiku decision extraction — inline)
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a decision extraction assistant for a Magic: The Gathering Commander deck brewing session.

Your job is to analyze an AI assistant's response from a deck brewing conversation and extract any high-confidence strategic decisions the user and assistant have agreed upon.

Extract ONLY decisions that are clearly stated or confirmed. Do not infer or guess.

Decision types to extract:
- colour_identity: The colour identity discussed (e.g. "Orzhov (WB)", "Sultai (BUG)")
- bracket: The power level bracket (e.g. "3", "3-4")
- archetype: The deck archetype (e.g. "Aristocrats", "Voltron", "Spellslinger")
- playstyle: How the deck plays (e.g. "Engine-based value", "Aggressive tempo")
- win_approach: How the deck wins (e.g. "Drain via sacrifice loops", "Commander damage")
- known_card_includes: Specific cards the user wants included (e.g. "Smothering Tithe")
- constraints: Limitations on the build (e.g. "No infinite combos", "Budget under $200")
- exclusions: Cards or strategies explicitly excluded (e.g. "No stax pieces")

For each extraction, provide:
- type: one of the decision types above
- key: a short uppercase label (e.g. "ARCHETYPE", "COLOUR IDENTITY")
- value: the extracted value
- source_quote: the exact phrase from the response that supports this extraction
- confidence: a number 0-1 indicating confidence (only include if >= 0.7)

Respond with a JSON array of extractions. If no decisions can be extracted, return an empty array [].

Respond ONLY with the JSON array. No markdown fences, no explanation.`

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = (await request.json()) as ChatBody

    const { sessionId, message, history } = body

    // --- Validate inputs ---
    if (!sessionId || typeof sessionId !== 'number') {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return Response.json({ error: 'Message cannot be empty' }, { status: 400 })
    }
    if (!Array.isArray(history)) {
      // Accept empty history for first message
      body.history = []
    }

    // --- Resolve model config and create adapter ---
    const resolvedModelId = body.modelId || DEFAULT_MODEL_ID
    const modelConfig = getModelConfig(resolvedModelId)

    let adapter
    try {
      adapter = createProviderAdapter(modelConfig)
    } catch (err) {
      if (err instanceof ProviderConfigError) {
        return Response.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    // --- Persist model_id to session ---
    const supabase = createAdminClient()
    let sessionStatus = 'exploring'
    try {
      const { data: sessionRow } = await supabase
        .from('brew_sessions')
        .select('status')
        .eq('id', sessionId)
        .single()
      if (sessionRow?.status) sessionStatus = sessionRow.status

      await supabase
        .from('brew_sessions')
        .update({ model_id: modelConfig.id })
        .eq('id', sessionId)
    } catch {
      // Non-critical — session update failure shouldn't block the chat
    }

    // Select system prompt based on session phase
    const phasePrompt = sessionStatus === 'building' ? BUILDING_SYSTEM_PROMPT : EXPLORATION_SYSTEM_PROMPT

    // --- Build messages array ---
    const apiMessages = [
      ...(body.history ?? []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as unknown,
      })),
      { role: 'user' as const, content: message.trim() as unknown },
    ]

    // --- Stream the response ---
    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Callback to emit tool_status SSE events during tool execution
          // Also tracks whether display_commander_candidates was called
          let candidatesEmitted = false
          const onToolEvent = (event: ToolStreamEvent) => {
            if (event.type === 'candidates') candidatesEmitted = true
            const sseData = JSON.stringify(event)
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
          }

          // --- Pre-resolve: detect commander names in user message ---
          // If the user says "build around X" or "I want X as my commander",
          // resolve X from the database immediately and emit as candidate.
          // This is model-independent — works regardless of AI formatting.
          if (sessionStatus !== 'building') {
            const userMsg = message.trim().toLowerCase()
            const commanderPatterns = [
              /(?:build around|brew|use|try|play)\s+(.+?)(?:\s+as\s+(?:my\s+)?commander)?$/i,
              /(?:commander|build)\s*(?:with|around|:)?\s+(.+)/i,
              /^(.+?)(?:\s+commander|\s+deck|\s+brew)$/i,
            ]

            let candidateName: string | null = null
            for (const pattern of commanderPatterns) {
              const match = message.trim().match(pattern)
              if (match) {
                candidateName = match[1].trim().replace(/^["']|["']$/g, '')
                break
              }
            }

            if (candidateName && candidateName.length > 2) {
              try {
                // Try exact/partial match in card_definitions
                const { data: matches } = await supabase
                  .from('card_definitions')
                  .select('card_name, color_identity')
                  .ilike('card_name', `%${candidateName}%`)
                  .limit(5)

                if (matches && matches.length > 0) {
                  console.log('[brew/chat] Pre-resolved commander from user message:', matches.map(m => m.card_name))
                  const preEvent = {
                    type: 'candidates',
                    commanders: matches.map(m => ({
                      name: m.card_name,
                      color_identity: m.color_identity?.split(',') ?? [],
                    })),
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(preEvent)}\n\n`))
                  candidatesEmitted = true
                }
              } catch {
                // Non-critical — model will handle it
              }
            }
          }

          // Run the tool execution loop with the resolved adapter
          const toolLoopOptions: ToolLoopOptions = {
            adapter,
            model: modelConfig.modelId,
            system: phasePrompt + '\n\n' + TOOL_USE_SYSTEM_PROMPT,
            messages: apiMessages,
            maxTokens: 4096,
            onToolEvent,
          }

          const finalResponse = await runToolLoop(toolLoopOptions)

          // Stream text as text_delta events
          let fullText = finalResponse.text
          for (let i = 0; i < fullText.length; i += TEXT_CHUNK_SIZE) {
            const chunk = fullText.slice(i, i + TEXT_CHUNK_SIZE)
            const event: ToolStreamEvent = { type: 'text_delta', text: chunk }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            )
          }

          // --- Emit cost SSE event (Requirement 8.1) ---
          const { inputTokens, outputTokens } = finalResponse.usage
          const estimatedCost = calculateCost(modelConfig.id, inputTokens, outputTokens)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'cost', inputTokens, outputTokens, estimatedCost })}\n\n`)
          )

          // --- Fallback: extract commander candidates if display tool wasn't called ---
          // If the model recommended commanders but didn't call display_commander_candidates,
          // extract them server-side from [[brackets]] in the response text.
          if (!candidatesEmitted && fullText.includes('[[')) {
            console.log('[brew/chat] display_commander_candidates NOT called — running fallback extraction')
            const bracketMatches = [...fullText.matchAll(/\[\[([^\]]+)\]\]/g)]
            console.log('[brew/chat] Fallback: found', bracketMatches.length, 'bracket matches in response')
            if (bracketMatches.length > 0) {
              // Extract ALL unique card names mentioned in [[brackets]]
              const seen = new Set<string>()
              const commanderNames: string[] = []

              for (const match of bracketMatches) {
                const name = match[1]
                if (seen.has(name)) continue
                seen.add(name)
                commanderNames.push(name)
              }

              console.log('[brew/chat] Fallback: extracted', commanderNames.length, 'unique card names:', commanderNames)

              // Filter to only legendary creatures (valid commanders) using Supabase
              if (commanderNames.length > 0) {
                try {
                  const { data: validCommanders } = await supabase
                    .from('mtg_cards' as any)
                    .select('name')
                    .in('name', commanderNames)
                    .eq('is_legendary', true)
                    .eq('is_creature', true)
                    .eq('commander_legal', true)

                  const confirmedNames = validCommanders?.map(c => c.name) ?? []
                  console.log('[brew/chat] Fallback: confirmed', confirmedNames.length, 'valid commanders:', confirmedNames)

                  if (confirmedNames.length > 0) {
                    const fallbackEvent = {
                      type: 'candidates',
                      commanders: confirmedNames.map(name => ({ name })),
                    }
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(fallbackEvent)}\n\n`)
                    )
                    console.log('[brew/chat] Fallback: emitted candidates SSE event')
                  }
                } catch (dbErr) {
                  // DB validation failed — emit all bracketed names as candidates
                  console.warn('[brew/chat] Fallback: DB validation failed, emitting all bracket matches:', dbErr)
                  const fallbackEvent = {
                    type: 'candidates',
                    commanders: commanderNames.slice(0, 10).map(name => ({ name })),
                  }
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(fallbackEvent)}\n\n`)
                  )
                }
              }
            }
          } else if (candidatesEmitted) {
            console.log('[brew/chat] display_commander_candidates tool was called — candidates already emitted')
          } else {
            console.log('[brew/chat] No [[ brackets found in response — no candidates to extract')
          }

          // --- Inline decision extraction (avoids second API call blocking issue) ---
          // Run Haiku extraction server-side and emit results in the same stream.
          // Always uses Anthropic Haiku regardless of the conversation model (Requirement 7.1).
          // Receives the full text from ToolLoopResult (provider-agnostic) (Requirement 7.2).
          if (fullText.trim()) {
            try {
              if (!process.env.ANTHROPIC_API_KEY) {
                console.warn('[brew/chat] ANTHROPIC_API_KEY is not set — skipping decision extraction')
                throw new Error('ANTHROPIC_API_KEY missing')
              }
              const anthropic = new Anthropic()
              // Signal client that extraction is in progress
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'tool_status', tool_name: 'decision_extraction', status: 'running' })}\n\n`)
              )
              const extractResponse = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                system: [
                  {
                    type: 'text',
                    text: EXTRACTION_SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                  },
                ],
                messages: [
                  {
                    role: 'user',
                    content: `Extract any strategic decisions from this brew session response:\n\n${fullText.trim()}`,
                  },
                ],
              })

              const rawText = extractResponse.content
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('')

              // Strip markdown code fences if Haiku wraps the JSON
              const cleanedText = rawText
                .replace(/^```(?:json)?\s*\n?/i, '')
                .replace(/\n?```\s*$/i, '')
                .trim()

              let entries: Array<{ type: string; key: string; value: string; source_quote: string; confidence: number }> = []
              try {
                const parsed = JSON.parse(cleanedText)
                if (Array.isArray(parsed)) {
                  entries = parsed.filter(
                    (e: any) => e.confidence >= 0.7 && e.key && e.value && e.source_quote
                  )
                }
              } catch {
                // Haiku returned malformed JSON — skip
              }

              // Signal extraction complete (regardless of whether entries were found)
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'tool_status', tool_name: 'decision_extraction', status: 'complete' })}\n\n`)
              )

              if (entries.length > 0) {
                // Categorize and emit as SSE event
                const categorizedEntries = entries.map((ext) => {
                  const normalizedType = ext.type?.toLowerCase().replace(/\s+/g, '_') || ''
                  const strategyTypes = ['archetype', 'playstyle', 'win_approach', 'known_card_includes']
                  const parameterTypes = ['colour_identity', 'bracket']
                  const constraintTypes = ['constraints', 'exclusions']

                  let section: string | null = null
                  if (strategyTypes.includes(normalizedType)) section = 'Strategy'
                  else if (parameterTypes.includes(normalizedType)) section = 'Parameters'
                  else if (constraintTypes.includes(normalizedType)) section = 'Constraints'

                  return {
                    id: `${ext.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    key: ext.key.toUpperCase(),
                    value: ext.value,
                    sourceQuote: ext.source_quote,
                    section,
                  }
                }).filter(e => e.section !== null)

                if (categorizedEntries.length > 0) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'decisions', entries: categorizedEntries })}\n\n`)
                  )
                }

                // Also persist to DB if sessionId provided
                if (sessionId) {
                  try {
                    const { data: sessionRow } = await supabase
                      .from('brew_sessions')
                      .select('decision_log_json')
                      .eq('id', sessionId)
                      .single()
                    if (sessionRow) {
                      const log = JSON.parse(sessionRow.decision_log_json || '{}')
                      for (const entry of categorizedEntries) {
                        const sectionKey = entry.section === 'Strategy' ? 'strategy'
                          : entry.section === 'Parameters' ? 'parameters'
                          : entry.section === 'Constraints' ? 'constraints' : null
                        if (sectionKey) {
                          log[sectionKey].push({
                            id: entry.id,
                            key: entry.key,
                            value: entry.value,
                            sourceQuote: entry.sourceQuote,
                            timestamp: Date.now(),
                          })
                        }
                      }
                      await supabase
                        .from('brew_sessions')
                        .update({ decision_log_json: JSON.stringify(log), updated_at: new Date().toISOString() })
                        .eq('id', sessionId)
                    }
                  } catch {
                    // DB persist failure — non-critical, client still got the events
                  }
                }
              }
            } catch (extractionErr) {
              // Extraction failure — non-critical, decision log just won't update (Requirement 7.3)
              if (extractionErr instanceof Error && extractionErr.message !== 'ANTHROPIC_API_KEY missing') {
                console.warn('[brew/chat] Decision extraction failed:', extractionErr.message)
              }
            }
          }

          // --- Emit done signal ---
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          const errMessage =
            err instanceof Error ? err.message : 'Stream error'
          const errorEvent: ToolStreamEvent = {
            type: 'error',
            error_message: errMessage,
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Brew chat failed: ${errMessage}` },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Note: Extraction is now handled client-side after the stream completes.
// The client calls /api/brew/extract directly and uses the response to
// animate new entries into the Decision Log panel (Requirements 4.1, 4.2).
// ---------------------------------------------------------------------------
