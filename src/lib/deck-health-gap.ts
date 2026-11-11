/**
 * Gap detail for one role: spare owned cards first, then cards held by another of the owner's decks.
 * Contract: docs/oracle/contracts/deck-health-phase2.md, sections 3 and 4 (slice 3: owned cards only; buy ideas come in slice 4).
 *
 * - The deck counts and the "cards already in this deck" list come from the same function as the strip (`classifyDeckCard`).
 * - Spare and other-deck lists come from `browseSpareCopies`, which only ever reads the signed-in user's cards,
 *   and filters by the commander's colour identity and by the same shared role function.
 * - The other-deck marker carries the deck name only.
 * - A failure is a real error, never an empty "nothing to suggest".
 */

import { loadBuyIdeas, type BuyIdea, type BuyUnavailableReason } from './deck-health-buy'
import { browseSpareCopies, MAX_BROWSE_LIMIT, type BrowseCard } from './spare-copy-browse'
import type { LookupClient } from './owned-copy-lookup'
import { loadHealthCards, loadTargets, type HealthClient, type LoadHealthOptions } from './deck-health-server'
import { buildDeckHealth, cardsInRole, HEALTH_ROLE_ORDER, type HealthRoleKey, type InDeckCard } from './deck-health'

export interface GapCard {
  name: string
  typeLine: string
  status: 'SPARE' | 'IN_ANOTHER_DECK'
  /** Deck name only (several decks are joined with ", "). Null for spare cards. */
  otherDeckName: string | null
  /** How many spare copies the owner has. */
  spareCopies: number
  /** Scryfall printing id of the owner's own copy, for the thumbnail. Null = no image known. */
  printingId: string | null
  /** Short sentence on what the card does for the role. Null when none. */
  detailLine: string | null
}

export interface DeckHealthGap {
  role: HealthRoleKey
  label: string
  have: number
  typical: number
  /** Equals roles[].have for this role: the "See the N cards already in this deck" count. */
  inDeckCount: number
  inDeckCards: InDeckCard[]
  spare: GapCard[]
  inAnotherDeck: GapCard[]
  /** False when the deck's colours could not be worked out. Nothing is listed as fitting then. */
  coloursKnown: boolean
  /** More cards exist than are shown. */
  spareTotal: number
  inAnotherDeckTotal: number
  /** EDHREC cards in this role that the owner does not own, are on-colour and not in the deck. At most 8. */
  buyIdeas: BuyIdea[]
  /** True when nothing owned fits (no spare and no other-deck card): the buy group opens by itself. */
  buyDefaultOpen: boolean
  nothingOwnedFits: boolean
  buyUnavailableReason: BuyUnavailableReason
}

export type LoadGapResult =
  | { ok: true; gap: DeckHealthGap }
  | { ok: false; status: 404 | 500; error: string }

export function parseGapRole(raw: string | null): HealthRoleKey | null {
  return raw && (HEALTH_ROLE_ORDER as readonly string[]).includes(raw) ? (raw as HealthRoleKey) : null
}

const toGapCard = (c: BrowseCard, status: GapCard['status']): GapCard => ({
  name: c.card_name,
  typeLine: c.type_line,
  status,
  otherDeckName: status === 'IN_ANOTHER_DECK' ? c.in_other_decks.map((d) => d.deck_name).join(', ') || null : null,
  spareCopies: c.spare_copies,
  printingId: c.printing_id ?? null,
  detailLine: c.detail_line ?? null,
})

export async function loadDeckGap(supabase: HealthClient, deckId: number, userId: string, role: HealthRoleKey, opts: LoadHealthOptions = {}): Promise<LoadGapResult> {
  // The deck's own cards and the owner's spare cards do not depend on each other, so both are read at the same time.
  const [loaded, browsed] = await Promise.all([
    loadHealthCards(supabase, deckId, userId),
    browseSpareCopies(supabase as unknown as LookupClient, { userId, deckId, kind: role, limit: MAX_BROWSE_LIMIT }).then(
      (browse) => ({ browse, err: null as unknown }),
      (err: unknown) => ({ browse: null, err }),
    ),
  ])
  if (!loaded.ok) return loaded

  // Same typical numbers as the health panel (the saved commander targets), so "typical" agrees in both places.
  let targets
  try {
    targets = await loadTargets(supabase, loaded.commanderNames, opts)
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : 'Could not check deck health' }
  }
  const health = buildDeckHealth(loaded.cards, targets)
  const row = health.roles.find((r) => r.role === role)
  if (!row) return { ok: false, status: 500, error: 'Unknown role' }
  const inDeckCards = cardsInRole(loaded.cards, role)

  if (!browsed.browse) {
    const err = browsed.err
    return { ok: false, status: 500, error: err instanceof Error ? err.message : 'Could not look through your cards' }
  }
  const browse = browsed.browse
  // Buy ideas come from the saved EDHREC list (no new EDHREC call) and one owned-copies lookup of at most 60 names.
  const buy = await loadBuyIdeas(supabase as unknown as LookupClient, {
    userId,
    deckId,
    role,
    targets,
    deckCards: loaded.cards,
    commanderNames: loaded.commanderNames,
  })
  const nothingOwnedFits = browse.total_spare === 0 && browse.total_in_another_deck === 0
  return {
    ok: true,
    gap: {
      role,
      label: row.label,
      have: row.have,
      typical: row.typical,
      inDeckCount: inDeckCards.reduce((n, c) => n + c.quantity, 0),
      inDeckCards,
      spare: browse.spare.map((c) => toGapCard(c, 'SPARE')),
      inAnotherDeck: browse.in_another_deck.map((c) => toGapCard(c, 'IN_ANOTHER_DECK')),
      coloursKnown: browse.colour_identity !== null,
      spareTotal: browse.total_spare,
      inAnotherDeckTotal: browse.total_in_another_deck,
      buyIdeas: buy.buyIdeas,
      buyDefaultOpen: nothingOwnedFits,
      nothingOwnedFits,
      buyUnavailableReason: buy.buyUnavailableReason,
    },
  }
}
