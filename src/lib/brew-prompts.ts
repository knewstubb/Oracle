// ---------------------------------------------------------------------------
// Brew Mode — Prompt Engineering
// ---------------------------------------------------------------------------

import type { StrategyBrief, CategoryGroup } from '@/types/brew'

// ---------------------------------------------------------------------------
// Investigation System Prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the investigation Fast Model.
 *
 * Path A: commander already chosen — ask about strategy, bracket, budget.
 * Path B: concept provided — help find a commander, then pivot to strategy.
 *
 * Max 6 exchanges. Friendly, conversational tone.
 * Must produce a StrategyBrief JSON when sufficient context gathered.
 *
 * @param pathType - 'commander' if user has a commander, 'concept' if exploring
 * @param commanderName - The commander name (for pathType 'commander')
 * @param conceptDescription - The concept description (for pathType 'concept')
 * @param playerContext - Pre-formatted player context block from formatPlayerContextPrompt()
 */
export function buildBrewInvestigatorPrompt(
  pathType: 'commander' | 'concept',
  commanderName?: string,
  conceptDescription?: string,
  playerContext?: string
): string {
  const lines: string[] = []

  // --- Identity ---
  lines.push('You are Oracle — a peer-level deckbuilding collaborator. You explore ideas together with the user, bring options and tradeoffs, and let them drive. You are NOT a yes-man. You push back when ideas are unfocused, present honest tradeoffs, and challenge structural problems.')
  lines.push('')

  // --- Personality Rules ---
  lines.push('=== PERSONALITY ===')
  lines.push('')
  lines.push('- EXPLORE BEFORE RECOMMENDING. When the user says "I want to build X", do NOT jump to commander suggestions. First explore what X means to them — what appeals, what approaches exist within that space, what different philosophies they could take.')
  lines.push('- Present philosophies and approaches, not just cards. "There are 3 ways to approach blink" is better than "here are 3 blink commanders".')
  lines.push('- Push back when reasonable. If the idea is spread thin or a card is a trap, say so. "That\'s three engines competing for slots — which one is the core?" is always better than agreeing.')
  lines.push('- Take as long as it takes. Don\'t rush. The goal is a well-understood deck, not a fast brief.')
  lines.push('- CRITICAL FORMATTING RULE: NEVER write long paragraphs. Maximum 2-3 sentences before a line break. Use bullet points for any list of options. If your message would be more than 3-4 lines without a break, you MUST restructure into bullets or short paragraphs. USE NEWLINES BETWEEN EVERY DISTINCT THOUGHT. Each sentence should be its own line when presenting information.')
  lines.push('- Keep messages SHORT. One concept or question per message. ONE question at the end, not multiple.')
  lines.push('- Write like texting a friend — short punchy lines, breathing room between ideas. Not an essay.')
  lines.push('- PROGRESSION RULE: When the user confirms with "yes", "yeah", or a short agreement, IMMEDIATELY move forward to the next topic or question. Do NOT repeat what they said, do NOT paraphrase their confirmation, do NOT ask them to clarify their "yes". Just advance the conversation.')
  lines.push('')
  lines.push('=== END PERSONALITY ===')
  lines.push('')
  lines.push('=== CARD ACCURACY ===')
  lines.push('')
  lines.push('CRITICAL: When suggesting commanders or specific cards:')
  lines.push('- ONLY name cards you are 100% certain exist with their EXACT printed name.')
  lines.push('- A commander MUST be a "Legendary Creature" (or have "can be your commander" text). Soulherder is NOT legendary. Ephemerate is an instant, not a creature.')
  lines.push('- Do NOT hallucinate card names. If you are unsure a card exists, say "I believe there\'s a card called X" or just describe the effect without naming it.')
  lines.push('- Common mistakes to AVOID: suggesting non-legendary creatures as commanders, making up card names that don\'t exist, confusing spell names with creature names.')
  lines.push('- When listing commanders, stick to ones you are CERTAIN are Legendary Creatures legal in Commander.')
  lines.push('- ONLY wrap actual Magic: The Gathering card names in [[brackets]]. Do NOT bracket deck names, strategy names, colour names, or other non-card terms.')
  lines.push('')
  lines.push('=== END CARD ACCURACY ===')
  lines.push('')

  // --- Player Context (dynamic per user) ---
  if (playerContext) {
    lines.push(playerContext)
    lines.push('')
  }
  lines.push('')

  if (pathType === 'commander') {
    // --- Path A: Commander already confirmed ---
    lines.push(`The user has chosen ${commanderName} as their commander.`)
    lines.push('')
    lines.push('Your job: explore HOW they want to build around this commander. Don\'t assume the obvious strategy. Ask what appeals to them about this commander, what angle they want to take, what kind of engine or game plan they envision.')
    lines.push('')
    lines.push('Topics to cover across multiple exchanges:')
    lines.push('- What appeals about this commander specifically')
    lines.push('- How they want to win (engine that overwhelms? combo? value grind?)')
    lines.push('- Any cards they definitely want to include')
    lines.push('- Budget approach')
    lines.push('- Any archetypes within this commander\'s design space they want to lean into or avoid')
  } else {
    // --- Path B: Concept-first ---
    lines.push(`The user's concept: "${conceptDescription}"`)
    lines.push('')
    lines.push('Your job: EXPLORE the concept space before suggesting commanders. Discuss:')
    lines.push('- Different approaches/philosophies within this concept')
    lines.push('- What specifically appeals to the user about this idea')
    lines.push('- What colours and strategies naturally fit')
    lines.push('- Tradeoffs between different angles')
    lines.push('')
    lines.push('Only suggest specific commanders AFTER you understand what they actually want. When you do suggest, explain why each fits their specific angle — not just "this is a popular X commander".')
  }

  // --- Shared guidelines ---
  lines.push('')
  lines.push('=== CONVERSATION RULES ===')
  lines.push('')
  lines.push('- Maximum 6 exchanges. But use them all if needed — don\'t rush.')
  lines.push('- ONE question or concept per message. Don\'t dump everything at once.')
  lines.push('- After 4+ exchanges with sufficient context, you may synthesise into a StrategyBrief.')
  lines.push('- At exchange 6, you MUST produce the brief regardless.')
  lines.push('- When mentioning Magic card names, wrap them in [[double brackets]] like [[Sol Ring]] or [[Brago, King Eternal]]. This enables hover previews in the UI.')
  lines.push('')
  lines.push('=== END CONVERSATION RULES ===')
  lines.push('')

  // --- StrategyBrief schema ---
  lines.push('=== STRATEGY BRIEF SCHEMA ===')
  lines.push('')
  lines.push('When ready, output this JSON in a code block:')
  lines.push('{')
  lines.push('  "commanderName": "full commander name",')
  lines.push('  "colourIdentity": ["W", "U", "B", "R", "G"],')
  lines.push('  "primaryWinCondition": "description of main win path",')
  lines.push('  "secondaryWinCondition": "description of backup plan",')
  lines.push('  "targetBracket": 1 | 2 | 3 | 4,')
  lines.push('  "knownIncludes": ["card names the user wants included"],')
  lines.push('  "playstyleDescription": "how the deck plays",')
  lines.push('  "budgetPreference": "collection" | "budget" | "unrestricted",')
  lines.push('  "budgetCeiling": optional number in USD (only if budgetPreference is "budget")')
  lines.push('}')
  lines.push('')
  lines.push('=== END STRATEGY BRIEF SCHEMA ===')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Brief Extraction Prompt
// ---------------------------------------------------------------------------

/**
 * Build the prompt for Strategy_Brief extraction from conversation.
 *
 * Formats the conversation into a prompt that asks the model to extract
 * a StrategyBrief JSON from the exchange. Used when forcing extraction
 * at exchange limit.
 */
export function buildBriefExtractionPrompt(
  conversation: Array<{ role: string; content: string }>,
  commanderName: string
): string {
  const lines: string[] = []

  lines.push('=== CONVERSATION HISTORY ===')
  lines.push('')

  for (const message of conversation) {
    const label = message.role === 'user' ? 'User' : 'Assistant'
    lines.push(`${label}: ${message.content}`)
    lines.push('')
  }

  lines.push('=== END CONVERSATION HISTORY ===')
  lines.push('')

  lines.push('=== EXTRACTION INSTRUCTIONS ===')
  lines.push('')
  lines.push(`Based on the conversation above about building a deck with ${commanderName}, extract a StrategyBrief JSON object.`)
  lines.push('')
  lines.push('Fill in ALL fields based on what was discussed. If a field was not explicitly discussed, make a reasonable inference from context.')
  lines.push('')
  lines.push('Required fields:')
  lines.push(`- commanderName: "${commanderName}"`)
  lines.push('- colourIdentity: array of colour letters (e.g., ["B", "G"] for Golgari)')
  lines.push('- primaryWinCondition: the main path to victory discussed')
  lines.push('- secondaryWinCondition: a backup plan (infer from playstyle if not explicitly stated)')
  lines.push('- targetBracket: 1, 2, 3, or 4 (default to 3 if not discussed)')
  lines.push('- knownIncludes: array of specific card names mentioned (empty array if none)')
  lines.push('- playstyleDescription: how the deck intends to play')
  lines.push('- budgetPreference: "collection", "budget", or "unrestricted" (default "unrestricted" if not discussed)')
  lines.push('- budgetCeiling: number in USD (only include if budgetPreference is "budget" and a ceiling was mentioned)')
  lines.push('')
  lines.push('Respond with ONLY the JSON object. No commentary or explanation outside the JSON.')
  lines.push('')
  lines.push('=== END EXTRACTION INSTRUCTIONS ===')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Skeleton Generation Prompt
// ---------------------------------------------------------------------------

/**
 * Extended options for skeleton generation prompt.
 */
interface SkeletonPromptOptions {
  /** Knowledge context (archetype guide, deck fundamentals) */
  knowledgeContext?: string
  /** Scryfall slot candidates formatted for prompt */
  scryfallSlots?: string
  /** Full card pool for selection-based prompting */
  cardPoolForSelection?: string[]
}

/**
 * Build the prompt for Heavy Model skeleton generation.
 *
 * Assembles the Heavy Model prompt with:
 * - Strategy brief context
 * - Knowledge context (archetype guides, deck fundamentals)
 * - EDHREC staples (top synergy cards)
 * - Scryfall slot candidates (functional role cards)
 * - Collection cards (what the user already owns in this colour identity)
 * - Card pool for selection (prevents hallucinations)
 *
 * Uses SELECTION-BASED prompting: the AI selects from provided card lists
 * rather than generating names from memory, eliminating hallucinations.
 */
export function buildSkeletonGenerationPrompt(
  brief: StrategyBrief,
  edhrecStaples: Array<{ cardName: string; synergy: number; price?: number }>,
  collectionCards: Array<{ cardName: string; owned: boolean }>,
  scryfallFills: Array<{ cardName: string; price: number }>,
  options?: SkeletonPromptOptions
): string {
  const lines: string[] = []

  // --- CRITICAL: Selection-based instruction ---
  lines.push('=== CRITICAL INSTRUCTION ===')
  lines.push('')
  lines.push('You are building a Commander deck by SELECTING cards from the provided lists below.')
  lines.push('DO NOT invent or recall card names from memory — ONLY use cards that appear in:')
  lines.push('1. The EDHREC STAPLES section')
  lines.push('2. The USER COLLECTION section')
  lines.push('3. The SCRYFALL CANDIDATES section')
  lines.push('4. The CARD POOL FOR SELECTION section')
  lines.push('5. Basic lands (Plains, Island, Swamp, Mountain, Forest) and the commander')
  lines.push('')
  lines.push('If a card name does not appear in these lists, DO NOT include it.')
  lines.push('This ensures every card in the deck is a real, verified Magic card.')
  lines.push('')
  lines.push('=== END CRITICAL INSTRUCTION ===')
  lines.push('')

  // --- Knowledge context (archetype guide, deck fundamentals) ---
  if (options?.knowledgeContext) {
    lines.push('=== DECK BUILDING KNOWLEDGE ===')
    lines.push('')
    lines.push(options.knowledgeContext)
    lines.push('')
    lines.push('=== END DECK BUILDING KNOWLEDGE ===')
    lines.push('')
  }

  // --- Strategy brief context ---
  lines.push('=== STRATEGY BRIEF ===')
  lines.push('')
  lines.push(`Commander: ${brief.commanderName}`)
  lines.push(`Colour Identity: ${brief.colourIdentity.join(', ')}`)
  lines.push(`Primary Win Condition: ${brief.primaryWinCondition}`)
  lines.push(`Secondary Win Condition: ${brief.secondaryWinCondition}`)
  lines.push(`Target Bracket: ${brief.targetBracket}`)
  lines.push(`Playstyle: ${brief.playstyleDescription}`)
  lines.push(`Budget Preference: ${brief.budgetPreference}`)

  if (brief.budgetCeiling != null) {
    lines.push(`Budget Ceiling: $${brief.budgetCeiling}`)
  }

  if (brief.knownIncludes.length > 0) {
    lines.push(`Known Includes (MUST include these): ${brief.knownIncludes.join(', ')}`)
  }

  lines.push('')
  lines.push('=== END STRATEGY BRIEF ===')
  lines.push('')

  // --- EDHREC staples ---
  lines.push('=== EDHREC STAPLES ===')
  lines.push('')
  if (edhrecStaples.length > 0) {
    lines.push('Top synergy cards for this commander (SELECT from this list):')
    lines.push('')
    for (const staple of edhrecStaples) {
      const priceStr = staple.price ? ` ($${staple.price.toFixed(2)})` : ''
      lines.push(`- ${staple.cardName} (synergy: ${staple.synergy}%)${priceStr}`)
    }
  } else {
    lines.push('(No EDHREC data available for this commander)')
  }
  lines.push('')
  lines.push('=== END EDHREC STAPLES ===')
  lines.push('')

  // --- Scryfall slot candidates ---
  if (options?.scryfallSlots) {
    lines.push('=== SCRYFALL CANDIDATES BY ROLE ===')
    lines.push('')
    lines.push('Cards tagged by functional role (SELECT from these for specific slots):')
    lines.push(options.scryfallSlots)
    lines.push('')
    lines.push('=== END SCRYFALL CANDIDATES ===')
    lines.push('')
  }

  // --- Collection cards ---
  lines.push('=== USER COLLECTION ===')
  lines.push('')
  if (collectionCards.length > 0) {
    lines.push('Cards the user owns (PRIORITISE these — they are free):')
    lines.push('')
    for (const card of collectionCards) {
      const status = card.owned ? '✅ owned' : '⚠️ in another deck'
      lines.push(`- ${card.cardName} [${status}]`)
    }
  } else {
    lines.push('(No collection data available)')
  }
  lines.push('')
  lines.push('=== END USER COLLECTION ===')
  lines.push('')

  // --- Full card pool for selection ---
  if (options?.cardPoolForSelection && options.cardPoolForSelection.length > 0) {
    lines.push('=== CARD POOL FOR SELECTION ===')
    lines.push('')
    lines.push('Additional verified cards you may select from:')
    lines.push('')
    // Group in columns for readability
    const pool = options.cardPoolForSelection
    for (let i = 0; i < pool.length; i += 4) {
      const chunk = pool.slice(i, i + 4)
      lines.push(chunk.map(c => `- ${c}`).join('  |  '))
    }
    lines.push('')
    lines.push('=== END CARD POOL ===')
    lines.push('')
  }

  // --- Scryfall fills (lower priority) ---
  if (scryfallFills.length > 0) {
    lines.push('=== ADDITIONAL FILL CANDIDATES ===')
    lines.push('')
    lines.push('Lower-synergy cards available if needed:')
    lines.push('')
    for (const fill of scryfallFills.slice(0, 30)) {
      if (fill.price > 0) {
        lines.push(`- ${fill.cardName} ($${fill.price.toFixed(2)})`)
      } else {
        lines.push(`- ${fill.cardName}`)
      }
    }
    lines.push('')
    lines.push('=== END FILL CANDIDATES ===')
    lines.push('')
  }

  // --- Generation instructions ---
  lines.push('=== GENERATION INSTRUCTIONS ===')
  lines.push('')
  lines.push('Build a complete Commander deck of EXACTLY 100 cards (including the commander).')
  lines.push('')
  lines.push('REMINDER: ONLY select cards from the lists above. Do not invent card names.')
  lines.push('')
  lines.push('Group the cards into functional categories. Typical categories include:')
  lines.push('- Ramp (10-12 cards)')
  lines.push('- Draw / Card Advantage (10-12 cards)')
  lines.push('- Removal / Interaction (8-10 cards)')
  lines.push('- Protection (3-5 cards)')
  lines.push('- Synergy / Theme pieces (deck-specific)')
  lines.push('- Finishers / Win Conditions (4-6 cards)')
  lines.push('- Lands (35-37 cards — basic lands are always valid)')
  lines.push('')
  lines.push('Prioritisation rules:')
  lines.push('1. ALWAYS include the Known Includes specified in the brief')
  lines.push('2. Prioritise cards from the User Collection (owned cards are free)')
  lines.push('3. Use EDHREC staples with high synergy scores')
  lines.push('4. Fill functional slots using Scryfall candidates')
  lines.push('5. Fill remaining slots from the Card Pool')
  lines.push('6. Flag any card that creates a proxy conflict (already in another deck)')
  lines.push('')

  if (brief.budgetPreference === 'budget' && brief.budgetCeiling != null) {
    lines.push(`Budget constraint: Individual cards should not exceed $${brief.budgetCeiling}. Flag any card over this ceiling as over-budget.`)
    lines.push('')
  } else if (brief.budgetPreference === 'collection') {
    lines.push('Budget constraint: Strongly prefer owned cards. Only include non-owned cards if no owned alternative exists for a critical role.')
    lines.push('')
  }

  lines.push('Output format: JSON object matching the DeckSkeleton schema:')
  lines.push('{')
  lines.push(`  "commanderName": "${brief.commanderName}",`)
  lines.push(`  "colourIdentity": ${JSON.stringify(brief.colourIdentity)},`)
  lines.push('  "totalCards": 100,')
  lines.push('  "categories": [')
  lines.push('    {')
  lines.push('      "name": "Category Name",')
  lines.push('      "cards": [')
  lines.push('        {')
  lines.push('          "cardName": "Card Name",')
  lines.push('          "ownershipStatus": "owned" | "proxy_candidate" | "not_owned",')
  lines.push('          "price": 1.50,')
  lines.push('          "proxyConflict": { "deckName": "...", "deckId": 1 } | null,')
  lines.push('          "overBudget": false,')
  lines.push('          "accepted": false')
  lines.push('        }')
  lines.push('      ]')
  lines.push('    }')
  lines.push('  ]')
  lines.push('}')
  lines.push('')
  lines.push('CRITICAL: The total card count across ALL categories MUST equal exactly 100.')
  lines.push('Sort cards within each category: owned first, then proxy_candidate, then not_owned.')
  lines.push('')
  lines.push('Respond with ONLY the JSON object. No commentary or explanation outside the JSON.')
  lines.push('')
  lines.push('=== END GENERATION INSTRUCTIONS ===')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Refinement Prompt
// ---------------------------------------------------------------------------

/**
 * Build the prompt for targeted refinement (swap/alternatives).
 *
 * For 'swap': asks for a replacement for targetCard in the given category role.
 * For 'alternatives': asks for 3-5 alternatives matching the category's functional role.
 */
export function buildRefinementPrompt(
  brief: StrategyBrief,
  category: CategoryGroup,
  action: 'swap' | 'alternatives',
  targetCard?: string
): string {
  const lines: string[] = []

  // --- Context ---
  lines.push('=== DECK CONTEXT ===')
  lines.push('')
  lines.push(`Commander: ${brief.commanderName}`)
  lines.push(`Colour Identity: ${brief.colourIdentity.join(', ')}`)
  lines.push(`Primary Win Condition: ${brief.primaryWinCondition}`)
  lines.push(`Target Bracket: ${brief.targetBracket}`)
  lines.push(`Playstyle: ${brief.playstyleDescription}`)
  lines.push(`Budget Preference: ${brief.budgetPreference}`)

  if (brief.budgetCeiling != null) {
    lines.push(`Budget Ceiling: $${brief.budgetCeiling}`)
  }

  lines.push('')
  lines.push('=== END DECK CONTEXT ===')
  lines.push('')

  // --- Category context ---
  lines.push('=== CATEGORY CONTEXT ===')
  lines.push('')
  lines.push(`Category: ${category.name}`)
  lines.push(`Current cards in this category:`)

  for (const card of category.cards) {
    const ownership = card.ownershipStatus === 'owned' ? '✅' : card.ownershipStatus === 'proxy_candidate' ? '⚠️' : '❌'
    const price = card.price != null ? ` ($${card.price.toFixed(2)})` : ''
    lines.push(`  - ${card.cardName} ${ownership}${price}`)
  }

  lines.push('')
  lines.push('=== END CATEGORY CONTEXT ===')
  lines.push('')

  // --- Action-specific instructions ---
  lines.push('=== INSTRUCTIONS ===')
  lines.push('')

  if (action === 'swap') {
    lines.push(`Find a SINGLE replacement for "${targetCard}" in the "${category.name}" category.`)
    lines.push('')
    lines.push('The replacement must:')
    lines.push(`- Serve the same functional role as "${targetCard}" within the "${category.name}" category`)
    lines.push(`- Be legal in Commander format`)
    lines.push(`- Be within the colour identity: ${brief.colourIdentity.join(', ')}`)
    lines.push('- Not already be in the current category card list')

    if (brief.budgetPreference === 'budget' && brief.budgetCeiling != null) {
      lines.push(`- Ideally cost less than $${brief.budgetCeiling}`)
    }

    lines.push('')
    lines.push('Respond with a JSON object:')
    lines.push('{')
    lines.push('  "cardName": "Replacement Card Name",')
    lines.push('  "ownershipStatus": "owned" | "proxy_candidate" | "not_owned",')
    lines.push('  "price": 1.50,')
    lines.push('  "overBudget": false,')
    lines.push('  "accepted": false,')
    lines.push('  "reason": "Brief explanation of why this card fits"')
    lines.push('}')
  } else {
    // alternatives
    lines.push(`Suggest 3-5 alternative cards for the "${targetCard}" slot in the "${category.name}" category.`)
    lines.push('')
    lines.push('Each alternative must:')
    lines.push(`- Serve the same functional role as "${targetCard}" within the "${category.name}" category`)
    lines.push('- Be legal in Commander format')
    lines.push(`- Be within the colour identity: ${brief.colourIdentity.join(', ')}`)
    lines.push('- Not already be in the current category card list')
    lines.push('- Offer a meaningful trade-off (budget, power level, synergy, availability)')

    if (brief.budgetPreference === 'budget' && brief.budgetCeiling != null) {
      lines.push(`- Ideally cost less than $${brief.budgetCeiling}`)
    }

    lines.push('')
    lines.push('Respond with a JSON array of 3-5 cards:')
    lines.push('[')
    lines.push('  {')
    lines.push('    "cardName": "Alternative Card Name",')
    lines.push('    "ownershipStatus": "owned" | "proxy_candidate" | "not_owned",')
    lines.push('    "price": 1.50,')
    lines.push('    "overBudget": false,')
    lines.push('    "accepted": false,')
    lines.push('    "reason": "Brief explanation of why this card is a good alternative"')
    lines.push('  }')
    lines.push(']')
  }

  lines.push('')
  lines.push('Respond with ONLY the JSON. No commentary or explanation outside the JSON.')
  lines.push('')
  lines.push('=== END INSTRUCTIONS ===')

  return lines.join('\n')
}
