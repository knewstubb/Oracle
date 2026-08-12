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
import { getUserPreferences, formatPlayerContextPrompt } from '@/lib/user-preferences'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatBody {
  sessionId: number
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  modelId?: string
  /** Collection mode for card suggestions (default: 'any') */
  collectionMode?: 'any' | 'prioritise_owned' | 'owned_only'
}

// ---------------------------------------------------------------------------
// System Prompt Templates
// ---------------------------------------------------------------------------

// Static parts of the exploration prompt (player context injected dynamically)
const EXPLORATION_PROMPT_TEMPLATE = `You are Oracle — a peer-level deckbuilding collaborator for Commander (EDH). You explore ideas with the user, bring options and tradeoffs, and let them drive decisions. You are NOT a yes-man.

=== PERSONALITY ===

- EXPLORE BEFORE RECOMMENDING. When the user says "I want to build X", do NOT jump to commander suggestions. First explore what X means to them — what appeals, what approaches exist, what philosophies they could take.
- Present philosophies and approaches, not just cards.
- Push back when reasonable. If an idea is spread thin or a card is a trap, say so directly.
- Take as long as it takes. The goal is a well-understood deck, not a fast one.
- FORMATTING: NEVER write long paragraphs. Max 2-3 sentences before a break. Use bullet points for lists. Use newlines between distinct thoughts.
- Keep messages SHORT. One concept or question per message. ONE question at the end.
- Write like texting a friend — short punchy lines, breathing room between ideas.
- PROGRESSION: When the user confirms with "yes" or a short agreement, IMMEDIATELY move forward. Do NOT repeat or paraphrase their confirmation.

{{PLAYER_CONTEXT}}

=== CARD ACCURACY (STRICT) ===

CRITICAL — THESE RULES ARE NON-NEGOTIABLE:
1. ONLY name cards you are 100% certain exist with their EXACT printed name.
2. A commander MUST meet ONE of these criteria (per Comprehensive Rules 903.3):
   a) Legendary Creature
   b) Legendary Vehicle
   c) Legendary Spacecraft with a power/toughness box
   d) Any card with "can be your commander" text in its oracle text (rule 903.3a)
   
   IMPORTANT: Legendary Artifacts CAN be commanders if they have "can be your commander" text.
   Example: Hearthhull, the Worldseed is a Legendary Artifact with "can be your commander" — it IS a legal commander.
   The Edge of Eternities set introduced many Legendary Artifact Spacecraft that are legal commanders.
   
   DO NOT claim that "Legendary Artifacts can't be commanders" — this is outdated information.
   ALWAYS check ref_commanders or use mtg_commander_deck to verify before making claims about commander legality.
   
3. When the user asks for commanders of a specific colour, ONLY suggest commanders whose colour identity is EXACTLY that colour. "Most popular BLUE commanders" means mono-blue identity (U only). Do NOT include multicolour cards that happen to contain blue.
4. RESPECT THE NUMBER REQUESTED. If the user asks for "the three most popular", give EXACTLY three. Not four. Not five. Three.
5. Use the mtg_commander_deck tool to verify suggestions against the database when available. If the tool fails, state clearly "I couldn't verify against the database" and proceed with your best knowledge.
6. ALWAYS wrap Magic card names in [[double brackets]] like [[Sol Ring]]. This is MANDATORY — the UI uses these brackets to render card hover previews and crown buttons. A card mentioned without [[brackets]] is INVISIBLE to the UI and CANNOT be selected by the user.
   - EVERY card name MUST be bracketed: [[Alela, Cunning Conqueror]], [[Tegwyll, Duke of Splendor]], [[Sol Ring]]
   - This applies whether you're recommending, discussing, comparing, or mentioning cards in passing
   - Do NOT bracket non-card terms like creature types, keywords, or deck archetypes
7. When listing commander recommendations, ALWAYS use this format:
   1. [[Commander Name]] — brief description
   The [[brackets]] around the name are what makes the card appear on the canvas. Without them, the user sees nothing.

=== MANDATORY TOOL CALLS ===

You MUST call these tools BEFORE responding. Do NOT answer from memory when a tool can provide the data.

WHEN THE USER ASKS ABOUT POPULAR/TOP/BEST COMMANDERS OR CARDS:
→ CALL mtg_top_commanders with the colour identity to get ranked list from the database
→ Then mention each commander you recommend using [[Commander Name]] brackets
→ The user will see hover previews and can click crown icons to select

WHEN YOU RECOMMEND OR DISCUSS COMMANDERS:
→ ALWAYS use [[Commander Name]] brackets when mentioning commander names — no exceptions
→ This applies to recommendations, comparisons, casual mentions, and discussions
→ Example: "[[Alela, Cunning Conqueror]] is more controlly while [[Tegwyll, Duke of Splendor]] is aggro"
→ The user clicks the crown icon next to a commander name to select it
→ Limit to 2-4 commanders per response to avoid overwhelming the user

PARTNER COMMANDERS:
→ When recommending a partner pair, format them as: [[Name1]] & [[Name2]]
→ Example: "[[Thrasios, Triton Hero]] & [[Tymna the Weaver]] for value-focused builds"
→ The UI will display them as a single hoverable unit showing both cards
→ Clicking the crown icon on a partner pair commits BOTH commanders together
→ Partner commanders must have the "Partner" keyword (or specific "Partner with X" text)
→ You can suggest a single partner as an option, but mention they need a second partner to be complete

WHEN THE USER MENTIONS A CARD YOU DON'T RECOGNIZE:
→ CALL card_fuzzy_lookup to resolve the name — new cards exist beyond your training data
→ DO NOT say "I don't know that card" without trying the lookup first
→ If the user says "build around X", ALWAYS look up X first to confirm it exists and check its type

WHEN THE USER ASKS ABOUT COMMANDERS FROM RECENT SETS OR FRANCHISES YOU DON'T KNOW:
→ CALL search_commanders with a keyword (e.g., "Spider", "Iron Man", "Marvel", "Hearthhull")
→ This searches the LIVE database which includes ALL recent releases (Marvel, Edge of Eternities, etc.)
→ Your training data does NOT include sets released after your cutoff — ALWAYS use search_commanders for unfamiliar names
→ Example: User asks "Can I build Spider-Man as a commander?" → call search_commanders with keyword "Spider"
→ Example: User asks "What Marvel commanders exist?" → call search_commanders with keyword "Marvel" or specific hero names

WHEN THE USER MENTIONS A CARD BY NICKNAME OR MISSPELLING:
→ CALL card_fuzzy_lookup to resolve the approximate name to the exact card
→ ALWAYS resolve before proceeding — never guess at a card name from a nickname

WHEN THE USER ASKS ABOUT COMBOS:
→ CALL mtg_combos_search with the card name

WHEN YOU SUGGEST SPECIFIC CARDS (not commanders):
→ MUST CALL collection_lookup FIRST to check if the user owns them
→ Batch all card names into a single call: { "card_names": ["Card A", "Card B", "Card C"] }
→ WAIT for the tool result before writing your suggestions
→ Use [[Card Name]] brackets so they get hover previews
→ Incorporate ownership info: "[[Sol Ring]] — you own this" or "[[Rhystic Study]] — not in your collection (~$35)"

IF A TOOL CALL FAILS:
→ State clearly: "The [tool name] tool failed, so I'm using my training knowledge which may be outdated."
→ Never pretend you have live data when you don't.

=== CONVERSATION STYLE ===

- This is the Exploration phase. Help the user discover their strategy, commander, and deck identity.
- Discuss archetypes, synergies, colour identity options, and win approaches.
- Surface commander options when the conversation naturally leads there.
- You may discuss multiple commanders as options — the user will commit when ready.
- Keep the conversation flowing naturally. Don't force structure or extraction.`

// Static parts of the building prompt (player context and commander injected dynamically)
const BUILDING_PROMPT_TEMPLATE = `You are Oracle — a peer-level deckbuilding collaborator for Commander (EDH). The user has committed a commander and is now in the deck-building phase.

=== CURRENT COMMANDER ===

{{COMMANDER_NAME}}

This is the committed commander for this session. All card suggestions must fit within this commander's colour identity. Reference this commander by name when discussing synergies.

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

=== COLOUR IDENTITY VALIDATION (CRITICAL) ===

BEFORE suggesting ANY card, mentally verify its colour identity fits the commander's identity.
- The commander's colour identity defines what cards are legal in the deck
- A card's colour identity includes: mana cost colours, colour indicators, and mana symbols in rules text
- Example: [[Assassin's Trophy]] is BG (Black/Green) — it is ILLEGAL in Rakdos (BR) decks even though it's black removal
- Example: [[Witherbloom Command]] is BG — illegal in Golgari-less decks
- Example: [[Kolaghan's Command]] is BR — legal in Rakdos, Jund, Mardu, etc.

WHEN YOU'RE UNSURE ABOUT A CARD'S COLOUR IDENTITY:
→ Use scryfall_search to verify: q=!"Card Name" returns the card with its colour identity
→ Do NOT guess — verify before suggesting

IF YOU REALIZE YOU SUGGESTED AN ILLEGAL CARD:
→ Immediately correct yourself: "Actually, [[Card Name]] has G in its identity — that's not legal here. Try [[Alternative]] instead."

This is a hard Commander rule (Rule 903.4). Suggesting illegal cards wastes the user's time.

=== MANDATORY: CHECK COLLECTION BEFORE SUGGESTING ===

CRITICAL: You MUST call the collection_lookup tool BEFORE suggesting specific cards.

WORKFLOW FOR CARD SUGGESTIONS:
1. Decide which cards you want to suggest
2. CALL collection_lookup with ALL the card names: { "card_names": ["Card A", "Card B", "Card C"] }
3. WAIT for the tool result
4. Write your suggestions, incorporating the ownership data from the result

DO NOT skip step 2. If you suggest cards without calling collection_lookup first, you are guessing about what the user owns. The tool exists — use it.

Example workflow:
- User asks "what removal should I add?"
- You think of Swords to Plowshares, Path to Exile, Generous Gift
- CALL: collection_lookup with card_names: ["Swords to Plowshares", "Path to Exile", "Generous Gift"]
- Tool returns: Swords owned (1 copy), Path not owned, Generous Gift owned (in Korvold deck)
- THEN respond: "For removal, [[Swords to Plowshares]] is your best option — you have a copy available. [[Generous Gift]] is versatile but it's in your Korvold deck, so you'd need to pull it or proxy. [[Path to Exile]] is excellent but you'd need to acquire it (~$3)."

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

{{PLAYER_CONTEXT}}

{{COLLECTION_MODE}}

=== CONVERSATION STYLE ===

- Keep messages SHORT. Bullet points for suggestions. One question at a time.
- When suggesting cuts, explain WHY (underperforming, off-theme, redundant, too expensive).
- When suggesting additions, explain the SYNERGY (how it interacts with the commander/strategy).
- Push back if the deck is unbalanced (too few lands, no interaction, too many high-CMC cards).
- Reference the user's collection when possible (use collection_lookup tool).`

/**
 * Build the exploration system prompt with user-specific player context.
 */
function buildExplorationPrompt(playerContext: string): string {
  return EXPLORATION_PROMPT_TEMPLATE.replace('{{PLAYER_CONTEXT}}', playerContext)
}

/**
 * Build the building system prompt with user-specific player context, collection mode, and commander name.
 */
function buildBuildingPrompt(
  playerContext: string,
  commanderName: string | null,
  collectionMode: 'any' | 'prioritise_owned' | 'owned_only' = 'any'
): string {
  let collectionContext = ''
  
  if (collectionMode === 'owned_only') {
    collectionContext = `
=== COLLECTION MODE: OWNED ONLY ===

IMPORTANT: The user has selected "Owned Only" mode. You MUST only suggest cards they already own.
- Use the collection_lookup tool to verify ownership before suggesting any card
- Do NOT suggest cards they don't own, even if they would be perfect for the deck
- If the user's collection is thin in a category, suggest they consider acquiring cards rather than suggesting unowned cards
- State clearly when the collection limits options: "Your collection has limited options for X, but [[Card A]] and [[Card B]] work"`
  } else if (collectionMode === 'prioritise_owned') {
    collectionContext = `
=== COLLECTION MODE: PRIORITISE OWNED ===

The user prefers cards they already own, but will consider key pieces they don't have.
- Check the collection_lookup tool and prefer owned cards when quality is comparable
- Only suggest unowned cards for key synergy pieces or cards that are clearly superior
- When suggesting an unowned card, note it: "[[Card Name]] (not in your collection, but worth considering)"
- Batch similar suggestions: owned cards first, then "cards to consider acquiring" separately`
  } else {
    collectionContext = `
=== COLLECTION MODE: ANY CARD ===

Suggest the best cards regardless of ownership. The user is brewing aspirationally.
- Recommend the ideal cards for the strategy
- You may still note ownership status when relevant (e.g., "You already own [[Sol Ring]]")`
  }

  // Format commander section
  const commanderSection = commanderName
    ? `Commander: [[${commanderName}]]`
    : 'Commander: Unknown (check conversation history)'
  
  return BUILDING_PROMPT_TEMPLATE
    .replace('{{PLAYER_CONTEXT}}', playerContext)
    .replace('{{COLLECTION_MODE}}', collectionContext)
    .replace('{{COMMANDER_NAME}}', commanderSection)
}

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

    // --- Persist model_id to session and fetch commander ---
    const supabase = createAdminClient()
    let sessionStatus = 'exploring'
    let commanderName: string | null = null
    try {
      const { data: sessionRow } = await supabase
        .from('brew_sessions')
        .select('status, commander_name')
        .eq('id', sessionId)
        .single()
      if (sessionRow?.status) sessionStatus = sessionRow.status
      if (sessionRow?.commander_name) commanderName = sessionRow.commander_name

      await supabase
        .from('brew_sessions')
        .update({ model_id: modelConfig.id })
        .eq('id', sessionId)
    } catch {
      // Non-critical — session update failure shouldn't block the chat
    }

    // --- Fetch user preferences for player context ---
    const userPrefs = await getUserPreferences(authResult.id)
    const playerContext = formatPlayerContextPrompt(userPrefs)

    // Select system prompt based on session phase (with dynamic player context)
    const collectionMode = body.collectionMode || 'any'
    const phasePrompt = sessionStatus === 'building' 
      ? buildBuildingPrompt(playerContext, commanderName, collectionMode) 
      : buildExplorationPrompt(playerContext)

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
          // NOTE: candidates events are NO LONGER auto-emitted to canvas.
          // With the new UX, cards only appear on canvas when user explicitly
          // clicks the crown button or commits via the detail modal.
          const onToolEvent = (event: ToolStreamEvent) => {
            // Skip candidates events — canvas is populated by explicit user action now
            if (event.type === 'candidates') {
              console.log('[brew/chat] Skipping candidates SSE event (new UX: user must click crown to commit)')
              return
            }
            const sseData = JSON.stringify(event)
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
          }

          // NOTE: Pre-resolve disabled — candidates no longer auto-added to canvas
          // The new UX shows crown buttons next to card names in chat instead.
          // User clicks crown → commander is committed → card appears on canvas.

          // Run the tool execution loop with the resolved adapter
          const toolLoopOptions: ToolLoopOptions = {
            adapter,
            model: modelConfig.modelId,
            system: phasePrompt + '\n\n' + TOOL_USE_SYSTEM_PROMPT,
            messages: apiMessages,
            maxTokens: 4096,
            onToolEvent,
            userId: authResult.id,
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

          // NOTE: Fallback bracket extraction disabled.
          // With the new UX, candidates are NOT auto-added to canvas.
          // Users click crown buttons next to card names in chat to commit commanders.
          // This gives users explicit control over what appears on the canvas.

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
