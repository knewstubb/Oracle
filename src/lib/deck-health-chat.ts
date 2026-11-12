/**
 * The chat's answer about deck health (Deck health slice S5).
 * Contract: docs/oracle/contracts/deck-health-phase2.md, section 4 "Chat".
 *
 * - Read-only. It never adds, moves or removes a card.
 * - The numbers come from `loadDeckHealth` and `loadDeckGap`, the very same functions the Deck health routes call,
 *   so the chat and the panel cannot disagree.
 * - The sentences come from `composeChatAnswer`, built on the same verdict copy the panel shows.
 * - A failure comes back as a real error, never as an empty "all fine".
 */

import { formatPrice } from './deck-health-buy'
import { loadDeckGap, type DeckHealthGap } from './deck-health-gap'
import { loadDeckHealth, type HealthClient, type LoadHealthOptions } from './deck-health-server'
import { HEALTH_ROLE_ORDER, ROLE_LABELS, type DeckHealthResponse, type HealthRoleKey } from './deck-health'

export interface DeckHealthChatAnswer {
  headline: string
  subline: string
  sourceLine: string
  lightRoles: Array<{ role: HealthRoleKey; text: string }>
  closing: 'Prices are estimates.'
}

/** Short summary of one role's owned options and buy ideas. Names only; the owned-copies tools give card detail. */
export interface DeckHealthRoleSummary {
  role: HealthRoleKey
  label: string
  have: number
  typical: number
  inDeckCount: number
  sourceLine: string
  spare: Array<{ name: string; spareCopies: number }>
  spareTotal: number
  /** Deck name only. */
  inAnotherDeck: Array<{ name: string; deckName: string | null }>
  inAnotherDeckTotal: number
  buyIdeas: Array<{ name: string; inclusionPct: number | null; price: string }>
  buyUnavailableReason: DeckHealthGap['buyUnavailableReason']
  nothingOwnedFits: boolean
  coloursKnown: boolean
}

export interface DeckHealthToolResult extends DeckHealthResponse {
  chatAnswer: DeckHealthChatAnswer
  /** Only when a role was asked about. */
  roleDetail?: DeckHealthRoleSummary
}

export type DeckHealthToolOutcome =
  | { ok: true; result: DeckHealthToolResult }
  | { ok: false; status: 404 | 500; error: string }

/** At most this many names per group go back to the chat (the panel shows the full lists). */
const SUMMARY_CAP = 8

export function isHealthRole(raw: unknown): raw is HealthRoleKey {
  return typeof raw === 'string' && (HEALTH_ROLE_ORDER as readonly string[]).includes(raw)
}

/** Verdict, source and the Light roles, from the one health response. Pure. */
export function composeChatAnswer(health: DeckHealthResponse): DeckHealthChatAnswer {
  return {
    headline: health.verdict.headline,
    subline: health.verdict.subline,
    sourceLine: health.sourceLine,
    lightRoles: health.roles.filter((r) => r.state === 'light').map((r) => ({ role: r.role, text: `${r.label}: ${r.text}` })),
    closing: 'Prices are estimates.',
  }
}

export function summariseGap(gap: DeckHealthGap): DeckHealthRoleSummary {
  return {
    role: gap.role,
    label: gap.label || ROLE_LABELS[gap.role],
    have: gap.have,
    typical: gap.typical,
    inDeckCount: gap.inDeckCount,
    sourceLine: gap.sourceLine,
    spare: gap.spare.slice(0, SUMMARY_CAP).map((c) => ({ name: c.name, spareCopies: c.spareCopies })),
    spareTotal: gap.spareTotal,
    inAnotherDeck: gap.inAnotherDeck.slice(0, SUMMARY_CAP).map((c) => ({ name: c.name, deckName: c.otherDeckName })),
    inAnotherDeckTotal: gap.inAnotherDeckTotal,
    buyIdeas: gap.buyIdeas.slice(0, SUMMARY_CAP).map((c) => ({ name: c.name, inclusionPct: c.inclusionPct, price: formatPrice(c.price) })),
    buyUnavailableReason: gap.buyUnavailableReason,
    nothingOwnedFits: gap.nothingOwnedFits,
    coloursKnown: gap.coloursKnown,
  }
}

/** Runs the same loaders as the routes. Another user's deck is "not found". */
export async function loadDeckHealthForChat(
  supabase: HealthClient,
  deckId: number,
  userId: string,
  role?: HealthRoleKey | null,
  opts: LoadHealthOptions = {},
): Promise<DeckHealthToolOutcome> {
  const health = await loadDeckHealth(supabase, deckId, userId, opts)
  if (!health.ok) return health
  const result: DeckHealthToolResult = { ...health.health, chatAnswer: composeChatAnswer(health.health) }
  if (role) {
    const gap = await loadDeckGap(supabase, deckId, userId, role, opts)
    if (!gap.ok) return gap
    result.roleDetail = summariseGap(gap.gap)
  }
  return { ok: true, result }
}
