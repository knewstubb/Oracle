// ---------------------------------------------------------------------------
// Confirm, dismiss and undo for chat proposals (contract: chat-add-cards.md, sections 2.4 to 2.6 and 3).
// Called only by the three routes under /api/decks/[id]/chat-proposals/. These are plain page-to-server
// routes: they are not tools and the model has no way to reach them. Each needs the signed-in owner
// plus the single-use proposal id the server created.
// ---------------------------------------------------------------------------

import { getOwnedPrintingsByNames } from './card-data'
import { deriveDefaultCategory } from './card-definition-resolver'
import { blockText, decideCard, loadCardFacts, loadDeckFacts, type CheckClient } from './chat-proposal-check'
import type { BlockReason, ConfirmReply, UndoReply } from './chat-proposal-types'

export const MAX_IDS_PER_REQUEST = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only well-formed, de-duplicated ids; null when the request is malformed. */
export function parseProposalIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IDS_PER_REQUEST) return null
  if (!raw.every((x) => typeof x === 'string' && UUID_RE.test(x))) return null
  return [...new Set(raw as string[])]
}

export type ConfirmOutcome =
  | { kind: 'ok'; reply: ConfirmReply }
  | { kind: 'not_found' } // not your deck, or none of the ids are yours (same answer, nothing leaks)
  | { kind: 'used' } // single id already used
  | { kind: 'expired' } // single id expired
  | { kind: 'failed' } // nothing was added

interface ProposalRow {
  id: string
  user_id: string
  deck_id: number
  card_name: string
  category: string | null
  status: string
  expires_at: string
}

type Row = Record<string, unknown>

const USED_TEXT = 'This suggestion was already used.'
const EXPIRED_TEXT = blockText('expired', {})

async function loadProposals(client: CheckClient, ids: string[], userId: string, deckId: number): Promise<ProposalRow[]> {
  const { data, error } = await client
    .from('chat_card_proposals')
    .select('id, user_id, deck_id, card_name, category, status, expires_at')
    .in('id', ids)
    .eq('user_id', userId)
    .eq('deck_id', deckId)
  if (error || !Array.isArray(data)) throw new Error('proposals unreadable')
  return (data as ProposalRow[]).filter((p) => p.user_id === userId && p.deck_id === deckId)
}

async function setStatus(client: CheckClient, ids: string[], userId: string, deckId: number, patch: Row, onlyFrom: string): Promise<void> {
  if (ids.length === 0) return
  await client.from('chat_card_proposals').update(patch).in('id', ids).eq('user_id', userId).eq('deck_id', deckId).eq('status', onlyFrom)
}

/** The category written on the slot: the proposal's, else the card's default, else derived from its type line. */
async function resolveCategories(client: CheckClient, cardName: string, proposed: string | null): Promise<string | null> {
  if (proposed) return JSON.stringify([proposed])
  const { data } = await client.from('ref_cards').select('default_category, type_line').eq('name', cardName).limit(1)
  const meta = Array.isArray(data) ? (data[0] as { default_category?: { primary?: string } | null; type_line?: string } | undefined) : undefined
  if (meta?.default_category?.primary) return JSON.stringify([meta.default_category.primary])
  if (meta?.type_line) return JSON.stringify([deriveDefaultCategory(meta.type_line)])
  return null
}

/** A printing the owner owns, else the newest default printing by name, else none. The slot stores a printing id (D-003). */
async function resolvePrintingId(client: CheckClient, cardName: string, owned: Map<string, string>): Promise<string | null> {
  const mine = owned.get(cardName)
  if (mine) return mine
  const { data } = await client.from('ref_printings').select('scryfall_id').eq('name', cardName).order('released_at', { ascending: false }).limit(1)
  const row = Array.isArray(data) ? (data[0] as { scryfall_id?: string } | undefined) : undefined
  return row?.scryfall_id ?? null
}

export async function confirmProposals(
  client: CheckClient,
  args: { userId: string; deckId: number; proposalIds: string[] },
  now: Date = new Date()
): Promise<ConfirmOutcome> {
  const { userId, deckId, proposalIds } = args
  let deck
  let proposals: ProposalRow[]
  try {
    deck = await loadDeckFacts(client, deckId, userId)
    if (!deck) return { kind: 'not_found' }
    proposals = await loadProposals(client, proposalIds, userId, deckId)
  } catch {
    return { kind: 'failed' }
  }

  const byId = new Map(proposals.map((p) => [p.id, p]))
  const skipped: ConfirmReply['skipped'] = []
  const live: ProposalRow[] = []
  for (const id of proposalIds) {
    const p = byId.get(id)
    if (!p) { skipped.push({ proposalId: id, blockReason: 'unknown', blockText: 'I could not find that suggestion.' }); continue }
    if (p.status === 'pending' && new Date(p.expires_at).getTime() <= now.getTime()) {
      skipped.push({ proposalId: id, blockReason: 'expired', blockText: EXPIRED_TEXT }); continue
    }
    if (p.status === 'expired') { skipped.push({ proposalId: id, blockReason: 'expired', blockText: EXPIRED_TEXT }); continue }
    if (p.status !== 'pending') { skipped.push({ proposalId: id, blockReason: 'used', blockText: USED_TEXT }); continue }
    live.push(p)
  }

  // A single-card request gets a plain status: nothing found, already used, or expired.
  if (proposalIds.length === 1 && live.length === 0 && skipped.length === 1) {
    const r = skipped[0].blockReason
    if (r === 'unknown') return { kind: 'not_found' }
    if (r === 'used') return { kind: 'used' }
    if (r === 'expired') {
      try { await setStatus(client, proposalIds, userId, deckId, { status: 'expired' }, 'pending') } catch { /* best effort */ }
      return { kind: 'expired' }
    }
  }
  if (proposalIds.length > 1 && live.length === 0 && skipped.every((s) => s.blockReason === 'unknown')) return { kind: 'not_found' }

  // Re-check everything now: the deck may have changed since the proposal.
  const facts = await loadCardFacts(client, live.map((p) => p.card_name)).catch(() => new Map())
  const items: Array<{ proposal_id: string; card_name: string; scryfall_id: string | null; categories: string | null }> = []
  const nowBlocked: Array<{ id: string; reason: BlockReason }> = []
  const taken = new Set(deck.mainKeys)
  const owned = await getOwnedPrintingsByNames(live.map((p) => p.card_name), userId).catch(() => new Map<string, string>())
  for (const p of live) {
    const card = facts.get(p.card_name) ?? null
    const decision = decideCard(p.card_name, card, { ...deck, mainKeys: taken })
    if (decision.state === 'blocked' || !card) {
      const reason = decision.blockReason ?? 'not_found'
      skipped.push({ proposalId: p.id, blockReason: reason, blockText: decision.blockText ?? blockText(reason, { requested: p.card_name }) })
      nowBlocked.push({ id: p.id, reason })
      continue
    }
    taken.add(card.name.split(' // ')[0].trim().toLowerCase()) // a repeat within this batch is a duplicate now
    items.push({
      proposal_id: p.id,
      card_name: card.name,
      scryfall_id: await resolvePrintingId(client, card.name, owned),
      categories: await resolveCategories(client, card.name, p.category),
    })
  }

  let added: ConfirmReply['added'] = []
  if (items.length > 0) {
    // One transaction: the deck row is locked, every slot is added, every proposal is marked, or nothing is.
    if (!client.rpc) return { kind: 'failed' }
    const { data, error } = await client.rpc('confirm_chat_card_proposals', { p_user_id: userId, p_deck_id: deckId, p_items: items })
    if (error || !data || (data as Row).success !== true) return { kind: 'failed' }
    const result = data as { added?: Array<{ proposal_id: string; deck_card_id: number }>; skipped?: Array<{ proposal_id: string; reason: string }> }
    added = (result.added ?? []).map((a) => ({ proposalId: a.proposal_id, deckCardId: a.deck_card_id }))
    for (const s of result.skipped ?? []) {
      const reason: ConfirmReply['skipped'][number]['blockReason'] =
        s.reason === 'in_deck' ? 'in_deck' : s.reason === 'expired' ? 'expired' : s.reason === 'used' ? 'used' : 'unknown'
      skipped.push({ proposalId: s.proposal_id, blockReason: reason, blockText: reason === 'in_deck' ? blockText('in_deck', { deck: deck.deckName }) : reason === 'expired' ? EXPIRED_TEXT : reason === 'used' ? USED_TEXT : 'I could not find that suggestion.' })
    }
  }

  // Record the cards that turned out blocked (not part of the add transaction; nothing was added for them).
  for (const b of nowBlocked) {
    try { await setStatus(client, [b.id], userId, deckId, { status: 'blocked', blocked_reason: b.reason }, 'pending') } catch { /* best effort */ }
  }

  return { kind: 'ok', reply: { added, skipped, deckCardCount: deck.mainCount + added.length } }
}

export async function dismissProposals(client: CheckClient, args: { userId: string; deckId: number; proposalIds: string[] }): Promise<'ok' | 'not_found' | 'failed'> {
  try {
    const deck = await loadDeckFacts(client, args.deckId, args.userId)
    if (!deck) return 'not_found'
    await setStatus(client, args.proposalIds, args.userId, args.deckId, { status: 'dismissed' }, 'pending')
    return 'ok'
  } catch {
    return 'failed'
  }
}

const UNDO_TEXT: Record<string, string> = {
  changed: 'This card has been changed since. Remove it from the deck page.',
  expired: 'This suggestion has expired, so Undo is no longer available. Remove the card from the deck page.',
  not_added: 'That card was not added, so there is nothing to undo.',
  unknown: 'I could not find that suggestion.',
}

export async function undoProposals(client: CheckClient, args: { userId: string; deckId: number; proposalIds: string[] }): Promise<{ kind: 'ok'; reply: UndoReply } | { kind: 'not_found' } | { kind: 'failed' }> {
  try {
    const deck = await loadDeckFacts(client, args.deckId, args.userId)
    if (!deck) return { kind: 'not_found' }
    if (!client.rpc) return { kind: 'failed' }
    const { data, error } = await client.rpc('undo_chat_card_proposals', { p_user_id: args.userId, p_deck_id: args.deckId, p_proposal_ids: args.proposalIds })
    if (error || !data || (data as Row).success !== true) return { kind: 'failed' }
    const r = data as { undone?: string[]; refused?: Array<{ proposal_id: string; reason: string }> }
    const refused = (r.refused ?? []).map((x) => ({ proposalId: x.proposal_id, text: UNDO_TEXT[x.reason] ?? UNDO_TEXT.changed }))
    if (refused.length > 0 && refused.length === args.proposalIds.length && refused.every((x) => x.text === UNDO_TEXT.unknown)) return { kind: 'not_found' }
    return { kind: 'ok', reply: { undone: r.undone ?? [], refused } }
  } catch {
    return { kind: 'failed' }
  }
}
