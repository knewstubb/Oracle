// ---------------------------------------------------------------------------
// propose_deck_cards: records checked proposals and builds the two views of them.
//  - The model gets a plain ready/blocked list with NO ids (it can never repeat a confirmation token).
//  - The owner's browser gets the proposal cards, with the single-use id, through a stream event.
// This file never changes a deck. (contract: chat-add-cards.md)
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto'
import { lookupOwnedCopies, type OwnedCopyResult, type LookupClient } from './owned-copy-lookup'
import { decideCard, loadCardFacts, loadDeckFacts, type CheckClient, type CheckOutcome } from './chat-proposal-check'
import {
  MAX_PENDING_PROPOSALS_PER_DECK,
  MAX_PROPOSALS_PER_CALL,
  PROPOSAL_LIFE_MS,
  type AddProposalsEvent,
  type ProposalCard,
} from './chat-proposal-types'
import { MAX_CATEGORY_LENGTH } from './categoryUtils'

export interface ProposalInput {
  name: string
  category?: string
  reason?: string
}

const RESERVED_CATEGORIES = new Set(['maybeboard', 'sideboard', 'commander', 'companion'])

/** A category from the model, or undefined (then the card's default category is used). Maybeboard is out of scope. */
export function sanitiseCategory(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw.replace(/[\[\]"\\]/g, '').trim()
  if (!cleaned || cleaned.length > MAX_CATEGORY_LENGTH) return undefined
  if (RESERVED_CATEGORIES.has(cleaned.toLowerCase())) return undefined
  return cleaned
}

function cleanReason(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw.trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, 200) : undefined
}

/** One ownership line in the owner's words, from the existing owned-copy lookup. */
export function ownershipLineFor(result: OwnedCopyResult | undefined): string | undefined {
  if (!result) return undefined
  switch (result.status) {
    case 'SPARE':
      return 'You own it, spare.'
    case 'IN_ANOTHER_DECK': {
      const decks = result.in_other_decks.map((d) => d.deck_name).join(' and ')
      return `You own it, it's in ${decks}. Adding it makes a planned slot here and leaves the card in ${decks}.`
    }
    case 'ALREADY_IN_THIS_DECK':
      return "You own it, and it's already in this deck."
    case 'UNOWNED':
      return "You don't own this. Adding it makes a planned slot here."
    default:
      return undefined
  }
}

export interface ProposeResult {
  /** Text for the model. Contains no ids. */
  content: string
  is_error: boolean
  event?: AddProposalsEvent
}

/**
 * Checks each suggestion, stores a proposal row for each, and returns the model text and the page event.
 * `client` is the admin client; the deck is fixed by the server (never named by the model).
 */
export async function proposeDeckCards(
  client: CheckClient,
  args: { userId: string; deckId: number; cards: ProposalInput[] },
  now: Date = new Date()
): Promise<ProposeResult> {
  const fail = (text: string): ProposeResult => ({ content: text, is_error: true })
  const deck = await loadDeckFacts(client, args.deckId, args.userId)
  if (!deck) return fail('The deck could not be found for this owner, so nothing can be proposed. Suggest the cards in words only.')

  const notes: string[] = []
  const seen = new Set<string>()
  let inputs = args.cards.filter((c) => c && typeof c.name === 'string' && c.name.trim() !== '')
  inputs = inputs.filter((c) => {
    const k = c.name.trim().toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (inputs.length === 0) return fail('No card names were given. Nothing was proposed.')
  if (inputs.length > MAX_PROPOSALS_PER_CALL) {
    notes.push(`Only the first ${MAX_PROPOSALS_PER_CALL} cards were proposed; the rest were dropped. Offer them in a later message.`)
    inputs = inputs.slice(0, MAX_PROPOSALS_PER_CALL)
  }

  // Pending cap per deck.
  let pending = 0
  try {
    const { count, error } = await client
      .from('chat_card_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', args.userId)
      .eq('deck_id', args.deckId)
      .eq('status', 'pending')
      .gt('expires_at', now.toISOString())
    if (error) throw error
    pending = count ?? 0
  } catch {
    return fail('Add buttons are not available right now (proposals could not be recorded). Suggest the cards in words only and do not offer to add them.')
  }
  const room = Math.max(0, MAX_PENDING_PROPOSALS_PER_DECK - pending)
  if (room === 0) return fail('There are already too many open suggestions for this deck. Ask the owner to add or dismiss some first.')

  const facts = await loadCardFacts(client, inputs.map((c) => c.name))
  const decided = inputs.map((c) => {
    const card = facts.get(c.name.trim()) ?? null
    return { input: c, card, outcome: decideCard(c.name.trim(), card, deck) }
  })

  // Only ready cards use up room.
  let used = 0
  const kept = decided.filter((d) => {
    if (d.outcome.state !== 'ready') return true
    if (used >= room) return false
    used++
    return true
  })
  if (kept.length < decided.length) notes.push(`Only ${room} more open suggestions are allowed for this deck; the rest were dropped.`)

  // Ownership lines for ready cards only (best effort).
  const readyNames = kept.filter((d) => d.outcome.state === 'ready' && d.card).map((d) => d.card!.name)
  const ownership = new Map<string, OwnedCopyResult>()
  if (readyNames.length > 0) {
    try {
      const lookup = await lookupOwnedCopies(client as unknown as LookupClient, { userId: args.userId, deckId: args.deckId, cardNames: readyNames })
      for (const r of lookup.results) ownership.set(r.requested_name, r)
    } catch {
      // The ownership line is optional.
    }
  }

  const expiresAt = new Date(now.getTime() + PROPOSAL_LIFE_MS).toISOString()
  const rows = kept.map((d) => {
    const id = randomUUID()
    const category = sanitiseCategory(d.input.category)
    const reason = cleanReason(d.input.reason)
    const outcome: CheckOutcome = d.outcome
    return { d, id, category, reason, outcome, row: {
      id,
      user_id: args.userId,
      deck_id: args.deckId,
      oracle_id: d.card?.oracleId ?? null,
      card_name: d.card?.name ?? d.input.name.trim().slice(0, 200),
      category: category ?? null,
      reason: reason ?? null,
      status: outcome.state === 'ready' ? 'pending' : 'blocked',
      blocked_reason: outcome.blockReason ?? null,
      expires_at: expiresAt,
    } }
  })

  try {
    const { error } = await client.from('chat_card_proposals').insert(rows.map((r) => r.row))
    if (error) throw error
  } catch {
    return fail('Add buttons are not available right now (proposals could not be recorded). Suggest the cards in words only and do not offer to add them.')
  }

  const proposals: ProposalCard[] = rows.map((r) => ({
    proposalId: r.id,
    cardName: r.row.card_name,
    reason: r.reason,
    category: r.category,
    state: r.outcome.state,
    blockReason: r.outcome.blockReason,
    blockText: r.outcome.blockText,
    ownershipLine: r.outcome.state === 'ready' && r.d.card ? ownershipLineFor(ownership.get(r.d.card.name)) : undefined,
  }))

  // The model sees outcomes only. No ids, no tokens.
  const forModel = {
    results: proposals.map((p) => ({
      card: p.cardName,
      outcome: p.state,
      ...(p.state === 'blocked' ? { why: p.blockText } : {}),
      ...(p.ownershipLine ? { ownership: p.ownershipLine } : {}),
    })),
    notes,
    instruction:
      'The owner now sees an Add button for each ready card. Nothing has been added. Do not say anything was added. For blocked cards, tell the owner why in the words given.',
  }

  return {
    content: JSON.stringify(forModel, null, 2),
    is_error: false,
    event: { type: 'add_proposals', deckId: args.deckId, deckName: deck.deckName, proposals },
  }
}
