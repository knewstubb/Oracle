// ---------------------------------------------------------------------------
// Debrief Mode — Prompt Engineering
// ---------------------------------------------------------------------------

import type { DebriefBrief, DeckCardWithOwnership } from './debrief-types'

// ---------------------------------------------------------------------------
// Investigation System Prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the fast investigator model.
 *
 * Instructs the model to conduct a brief interview extracting game context,
 * then synthesise a DebriefBrief JSON after gathering enough detail.
 */
export function buildInvestigatorSystemPrompt(
  commanderName: string,
  deckName: string
): string {
  return `You are an experienced Commander player helping debrief a game with the "${deckName}" deck (commander: ${commanderName}).

Your role is to conduct a brief, focused post-game interview. Be conversational, friendly, and concise — like a knowledgeable Commander player asking a friend how their game went.

Reference the deck name "${deckName}" and commander "${commanderName}" naturally in conversation.

Ask focused questions about:
- Game outcome (win, loss, or draw)
- Problem cards that underperformed or got stuck in hand
- Effective cards that carried the game or created key moments
- Opponent archetypes and strategies faced at the table
- The primary pattern behind the win or loss (mana screw, outpaced by aggro, combo disrupted, etc.)

Guidelines:
- You have a maximum of 5 exchanges with the user. Keep questions targeted and efficient.
- After gathering sufficient context (3–5 exchanges), synthesise the information into a structured DebriefBrief.
- Do NOT ask all topics in one message — spread them across 2–3 questions to keep the conversation natural.
- If the user gives detailed answers early, you can synthesise sooner.
- When you have enough context, output a JSON block with type "brief_ready" containing the DebriefBrief.

The DebriefBrief JSON schema:
{
  "gameOutcome": "win" | "loss" | "draw",
  "problemCards": ["card names that underperformed"],
  "effectiveCards": ["card names that performed well"],
  "opponentArchetypes": ["descriptions of opponent strategies"],
  "lossPattern": "the primary pattern behind the outcome",
  "userNotes": "any additional context the user mentioned"
}

Start by greeting the user and asking what happened in their game with ${commanderName}.`
}

// ---------------------------------------------------------------------------
// Analysis Prompt
// ---------------------------------------------------------------------------

/**
 * Build the prompt for the heavy analyst model.
 *
 * Includes the DebriefBrief, full deck list with ownership, and strategy
 * context. Instructs the model to produce 1–5 Recommendation objects.
 */
export function buildAnalystPrompt(
  brief: DebriefBrief,
  deckCards: DeckCardWithOwnership[],
  strategy: { win_condition?: string; bracket?: number; frustration?: string; strategy_notes?: string } | null
): string {
  const lines: string[] = []

  // --- Brief context ---
  lines.push('=== DEBRIEF BRIEF ===')
  lines.push('')
  lines.push(`Game Outcome: ${brief.gameOutcome}`)
  lines.push(`Loss/Win Pattern: ${brief.lossPattern}`)

  if (brief.problemCards.length > 0) {
    lines.push(`Problem Cards: ${brief.problemCards.join(', ')}`)
  }

  if (brief.effectiveCards.length > 0) {
    lines.push(`Effective Cards: ${brief.effectiveCards.join(', ')}`)
  }

  if (brief.opponentArchetypes.length > 0) {
    lines.push(`Opponent Archetypes: ${brief.opponentArchetypes.join(', ')}`)
  }

  if (brief.userNotes) {
    lines.push(`User Notes: ${brief.userNotes}`)
  }

  lines.push('')
  lines.push('=== END DEBRIEF BRIEF ===')
  lines.push('')

  // --- Strategy context ---
  if (strategy) {
    lines.push('=== DECK STRATEGY CONTEXT ===')
    lines.push('')

    if (strategy.win_condition) {
      lines.push(`Win Condition: ${strategy.win_condition}`)
    }

    if (strategy.bracket != null) {
      lines.push(`Bracket: ${strategy.bracket}`)
    }

    if (strategy.frustration) {
      lines.push(`Frustration Points: ${strategy.frustration}`)
    }

    if (strategy.strategy_notes) {
      lines.push(`Strategy Notes: ${strategy.strategy_notes}`)
    }

    lines.push('')
    lines.push('=== END STRATEGY CONTEXT ===')
    lines.push('')
  }

  // --- Deck list ---
  lines.push('=== DECK LIST ===')
  lines.push('')

  for (const card of deckCards) {
    const ownership = card.ownership_status ? ` [${card.ownership_status}]` : ''
    const commander = card.is_commander ? ' (Commander)' : ''
    lines.push(`${card.quantity}x ${card.card_name}${commander}${ownership}`)
  }

  lines.push('')
  lines.push('=== END DECK LIST ===')
  lines.push('')

  // --- Instructions ---
  lines.push('=== INSTRUCTIONS ===')
  lines.push('')
  lines.push('Analyse the debrief brief in the context of this deck list and strategy.')
  lines.push('Produce 1–5 card-swap recommendations as a JSON array.')
  lines.push('')
  lines.push('Each recommendation must be a JSON object with:')
  lines.push('- "cutCard": the card name to remove from the deck')
  lines.push('- "addCard": the card name to add to the deck')
  lines.push('- "reason": reasoning framed in win-condition terms (how this swap helps the deck win)')
  lines.push('- "ownershipStatus": "original" | "proxy" | "not_owned" (ownership classification of the add card)')
  lines.push('')
  lines.push('Prioritisation guidelines:')
  lines.push('- Order recommendations by impact — highest impact first')
  lines.push('- Consider the lossPattern and problemCards when identifying what to cut')
  lines.push('- Frame reasons in terms of the deck\'s win condition and strategy')
  lines.push('- Prefer cards the user already owns ("original") over purchases ("not_owned")')
  lines.push('- Cards marked "proxy" are already available to the user at no cost')
  lines.push('- Do not suggest cutting the commander')
  lines.push('')
  lines.push('Respond with ONLY the JSON array. No commentary or explanation outside the JSON.')
  lines.push('')
  lines.push('=== END INSTRUCTIONS ===')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Note Entry Formatter
// ---------------------------------------------------------------------------

/**
 * Format a debrief action as a markdown entry for deck notes.
 *
 * Returns a formatted string containing the session ID, date, cut card,
 * add card, and win-condition reasoning.
 */
export function formatDebriefNoteEntry(
  sessionId: number,
  action: { cutCard: string; addCard: string; reason: string }
): string {
  const date = new Date().toISOString().split('T')[0]
  return `### Debrief #${sessionId} — ${date}\n- **Cut:** ${action.cutCard}\n- **Add:** ${action.addCard}\n- **Reason:** ${action.reason}`
}

/** @deprecated Use formatDebriefNoteEntry instead */
export const formatDebriefNotionEntry = formatDebriefNoteEntry
