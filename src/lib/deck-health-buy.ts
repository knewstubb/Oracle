/**
 * Buy ideas for one role (Deck health slice S4).
 * Contract: docs/oracle/contracts/deck-health-phase2.md, sections 3.2, 3.3 and 3.3 item 4.
 *
 * - The cards come from the saved EDHREC list for the commander (already classified into roles). No EDHREC call is made here.
 * - A card is a buy idea only when it is in the role, not in the deck, not owned (a real copy; proxies do not count) and inside the
 *   commander's colours. Owned and colour checks use the one shared owned-copies lookup (60 names at most).
 * - Unknown commander colours give no buy ideas (never "skip the filter").
 * - Thin or missing data gives no buy ideas and a reason. Nothing is guessed.
 * - A price is the cheapest real printing above zero, or unknown. Never zero.
 */

import type { CommanderTargets } from './commander-targets'
import type { HealthDeckCard, HealthRoleKey } from './deck-health'
import { gapDetailLine } from './gap-detail-line'
import { lookupOwnedCopies, MAX_LOOKUP_NAMES, type LookupClient } from './owned-copy-lookup'
import { fetchRefTextByName } from './ref-card-text'

/** How many buy ideas are shown (contract 3.3). */
export const MAX_BUY_IDEAS = 8

export type BuyUnavailableReason = null | 'thin_data' | 'colours_unknown' | 'lookup_failed'

export interface BuyIdea {
  name: string
  typeLine: string
  /** Share of this commander's decks running the card, 0 to 100. Null when the saved list has no share (average-deck source). */
  inclusionPct: number | null
  price: { usd: number | null; state: 'known' | 'unknown' }
  /** Scryfall printing id for the thumbnail. Null = no image known. */
  printingId: string | null
  detailLine: string | null
}

export interface BuyResult {
  buyIdeas: BuyIdea[]
  buyUnavailableReason: BuyUnavailableReason
}

const front = (n: string): string => n.split(' // ')[0].trim().toLowerCase()

/** A price of zero, negative or not a number is unknown. Never $0. */
export function toPrice(usd: unknown): BuyIdea['price'] {
  return typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? { usd, state: 'known' } : { usd: null, state: 'unknown' }
}

/** What the screen prints for a price: "$38.00 est." or "Price unknown". */
export function formatPrice(price: BuyIdea['price']): string {
  return price.state === 'known' && price.usd !== null && price.usd > 0 ? `$${price.usd.toFixed(2)} est.` : 'Price unknown'
}

/** The saved EDHREC cards in this role that are not already in the deck, most popular first (cards without a share keep EDHREC's order). */
export function candidatesForRole(targets: CommanderTargets, role: HealthRoleKey, deckCards: HealthDeckCard[], commanderNames: string[]) {
  const inDeck = new Set<string>(commanderNames.map(front))
  for (const c of deckCards) if (c.inMainDeck) inDeck.add(front(c.cardName))
  const seen = new Set<string>()
  const list = (targets.cards ?? [])
    .map((c, i) => ({ ...c, i }))
    .filter((c) => (c.roles as string[]).includes(role))
    .filter((c) => {
      const k = front(c.name)
      if (inDeck.has(k) || seen.has(k)) return false
      seen.add(k)
      return true
    })
  list.sort((a, b) => (b.inclusion ?? -1) - (a.inclusion ?? -1) || a.i - b.i)
  return list
}

export async function loadBuyIdeas(
  supabase: LookupClient,
  args: { userId: string; deckId: number; role: HealthRoleKey; targets: CommanderTargets; deckCards: HealthDeckCard[]; commanderNames: string[] },
): Promise<BuyResult> {
  const { targets, role } = args
  if (targets.status !== 'ok') return { buyIdeas: [], buyUnavailableReason: 'thin_data' }
  // The saved list holds non-land cards only, so lands have no buy ideas.
  if (role === 'lands') return { buyIdeas: [], buyUnavailableReason: null }

  const candidates = candidatesForRole(targets, role, args.deckCards, args.commanderNames)
  if (candidates.length === 0) return { buyIdeas: [], buyUnavailableReason: null }

  try {
    const lookup = await lookupOwnedCopies(supabase, {
      userId: args.userId,
      deckId: args.deckId,
      cardNames: candidates.slice(0, MAX_LOOKUP_NAMES).map((c) => c.name),
    })
    if (lookup.commander_colour_identity === null) return { buyIdeas: [], buyUnavailableReason: 'colours_unknown' }

    const pct = new Map(candidates.map((c) => [c.name, c.inclusion]))
    const kept = lookup.results.filter((r) => r.status === 'UNOWNED' && r.card_name).slice(0, MAX_BUY_IDEAS)
    if (kept.length === 0) return { buyIdeas: [], buyUnavailableReason: null }

    const names = kept.map((r) => r.card_name as string)
    const [text, prints] = await Promise.all([
      fetchRefTextByName(supabase, names),
      supabase.from('ref_printings').select('scryfall_id, name, digital').in('name', names),
    ])
    const printingByName = new Map<string, string>()
    for (const p of (prints?.data ?? []) as Array<{ scryfall_id?: string; name: string; digital?: boolean | null }>) {
      if (p.scryfall_id && p.digital !== true && !printingByName.has(p.name)) printingByName.set(p.name, p.scryfall_id)
    }

    const buyIdeas = kept.map((r): BuyIdea => {
      const name = r.card_name as string
      const t = text.map.get(name)
      const share = pct.get(r.requested_name)
      return {
        name,
        typeLine: t?.type_line ?? '',
        inclusionPct: typeof share === 'number' ? Math.round(share * 100) : null,
        price: toPrice(r.price?.usd),
        printingId: printingByName.get(name) ?? null,
        detailLine: gapDetailLine(role, t?.type_line, t?.oracle_text),
      }
    })
    return { buyIdeas, buyUnavailableReason: null }
  } catch (err) {
    console.error('[health/gap] buy ideas failed:', err instanceof Error ? err.message : err)
    return { buyIdeas: [], buyUnavailableReason: 'lookup_failed' }
  }
}
