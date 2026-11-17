// Slice B edit tools (contract slice B section 3). Rules held here:
//  - every input is a strict zod object with NO user id argument; the user comes only from the verified token (ctx.userId)
//  - nothing here can delete a collection record: the only things a tool can ask for are the eight RPC actions
//  - each refusal comes back as a specific, plain-words error, and "Nothing was changed." is always true when it does
import { z } from 'zod'
import { editError } from '../errors'
import { editErrorMessage, describeGroup, pendingEndedText, undoRefusalText } from '../change-sentences'
import { groupChanges } from '../change-groups'
import { AI_LIMITS } from '../edit-config'
import type { EditContext } from '../user-client'
import type { ChangeAction, GatewayFailure, ResolvedCard, SubmitOutcome } from '../write-types'
import { LookupFailed, must, rows, type ToolOutput } from './common'
import { fetchCardFacts, factsFor } from './card-facts'
import { coloursOutside, normaliseColours } from './deck-colours'

const dryRun = z.boolean().optional().describe('If true, only check and describe what would happen. Nothing is changed.')
const deckId = z.number().int().positive().describe('The deck id from list_decks.')
const slotRef = z.strictObject({
  slot_id: z.number().int().positive().describe('The slotId of the card in get_deck.'),
  name: z.string().trim().min(1).max(200).describe('The card name in that slot (checked so the wrong card is never touched).'),
})

export const addCardsInput = z.strictObject({
  deck_id: deckId,
  cards: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(200).describe('Card name.'),
        quantity: z.number().int().min(1).max(AI_LIMITS.max_request).optional().describe('How many slots to add. Default 1.'),
        category: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .refine((c) => c.toLowerCase() !== 'maybeboard', {
            message: 'The category "Maybeboard" is reserved. To put cards on the Maybeboard use set_card_zone. Nothing was changed.',
          })
          .optional()
          .describe('Role category for this card, for example Ramp, Card Draw, Removal, Board Wipes, Lands. Reuse the category names the deck already shows in get_deck. Send one for every card; only a card sent without one is filed under "Other". "Maybeboard" is not allowed here; use set_card_zone.'),
      }),
    )
    .min(1)
    .max(AI_LIMITS.max_request),
  dry_run: dryRun,
})

export const removeCardsInput = z.strictObject({ deck_id: deckId, slots: z.array(slotRef).min(1).max(AI_LIMITS.max_request), dry_run: dryRun })

export const setZoneInput = z.strictObject({
  deck_id: deckId,
  slots: z.array(slotRef).min(1).max(AI_LIMITS.max_request),
  to: z.enum(['main', 'maybeboard']).describe('Where the cards should be.'),
  dry_run: dryRun,
})

export const setCategoryInput = z.strictObject({
  deck_id: deckId,
  slots: z
    .array(
      z.strictObject({
        slot_id: z.number().int().positive().describe('The slotId of the card in get_deck.'),
        name: z.string().trim().min(1).max(200).describe('The card name in that slot (checked so the wrong card is never touched).'),
        categories: z
          .array(z.string().trim().min(1).max(60))
          .min(1)
          .max(5)
          .describe('1 to 5 category names for this card; replaces its whole list. Order is kept; the first is the group it shows under. Any free text; new names are fine. Oracle matches letter case to categories the deck already uses.'),
      }),
    )
    .min(1)
    .max(AI_LIMITS.max_request),
  dry_run: dryRun,
})

export const addToCollectionInput = z.strictObject({
  name: z.string().trim().min(1).max(200).describe('Card name.'),
  finish: z.enum(['nonfoil', 'foil', 'etched']).optional().describe('Default nonfoil.'),
  printing_id: z.string().trim().min(1).max(64).optional().describe('Scryfall printing id, if a specific printing is wanted.'),
  dry_run: dryRun,
})

export const sleeveCopyInput = z.strictObject({
  deck_id: deckId,
  copy_id: z.number().int().positive().describe('The copyId of a free copy (from search_collection).'),
  name: z.string().trim().min(1).max(200),
  dry_run: dryRun,
})

export const makeOriginalInput = z.strictObject({
  deck_id: deckId,
  slot_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  original_copy_id: z.number().int().positive().describe('The copyId of a free original (not a proxy).'),
  dry_run: dryRun,
})

export const createProxyInput = z.strictObject({
  deck_id: deckId,
  slot_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  dry_run: dryRun,
})

export const requestMoveInput = z.strictObject({
  copy_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  to_deck_id: deckId,
  dry_run: dryRun,
})

export const undoInput = z.strictObject({ group_id: z.uuid().describe('The group_id from an earlier result or list_recent_changes.') })
export const changeStatusInput = z.strictObject({ pending_id: z.uuid().describe('The pending_id from an earlier result.') })
export const listRecentInput = z.strictObject({})

// --------------------------------------------------------------------------------------------------------------

function fail(f: GatewayFailure): ToolOutput {
  if (f.code === 'rpc_failed') return editError('rpc_failed', 'Oracle could not make that change just now. Nothing was changed. Try again.', true)
  return editError(f.code, editErrorMessage(f.code, f.detail))
}

function shapeOutcome(o: SubmitOutcome, extra: { warnings: string[] }): ToolOutput {
  const warnings = extra.warnings.length ? { warnings: extra.warnings } : {}
  if (o.outcome === 'applied') {
    return { ok: true, status: 'applied', group_id: o.group_id, count: o.count, message: 'Done. The owner can undo this in Oracle for 7 days.', ...warnings }
  }
  if (o.outcome === 'pending') {
    return {
      ok: true,
      status: 'pending_approval',
      pending_id: o.pending_id,
      expires_at: o.expires_at,
      reason: o.reason,
      ...(o.duplicate ? { duplicate: true } : {}),
      message: 'Nothing has changed yet. The owner has to say yes in Oracle first. It is waiting for them for 24 hours.',
      ...warnings,
    }
  }
  return { ok: true, status: o.outcome, reason: o.reason, dry_run: true, message: o.outcome === 'would_apply' ? 'This would go through straight away. Nothing was changed.' : 'This would wait for the owner to say yes. Nothing was changed.', ...warnings }
}

async function submit(ctx: EditContext, action: ChangeAction, payload: Record<string, unknown>, dry: boolean | undefined, warnings: string[] = []): Promise<ToolOutput> {
  const r = await ctx.gateway.submit({ userId: ctx.userId, connectionId: ctx.connectionId, action, payload, dryRun: !!dry })
  return r.ok ? shapeOutcome(r.data, { warnings }) : fail(r)
}

const notFoundCard = (name: string): ToolOutput => editError('card_not_found', `Oracle could not find a card called "${name}". Nothing was changed. Check the spelling.`)

/** Resolve names five at a time. Returns the first failure so the whole request is refused, never half-done. */
async function resolveNames(ctx: EditContext, names: string[], printingId?: string): Promise<{ ok: true; cards: Map<string, ResolvedCard>; warnings: string[] } | { ok: false; out: ToolOutput }> {
  const unique = [...new Set(names.map((n) => n.trim()))]
  const cards = new Map<string, ResolvedCard>()
  const warnings: string[] = []
  for (let i = 0; i < unique.length; i += 5) {
    const chunk = unique.slice(i, i + 5)
    const results = await Promise.all(chunk.map((n) => ctx.gateway.resolveCard(n, printingId)))
    for (let j = 0; j < chunk.length; j++) {
      const r = results[j]
      if (r.card === null) {
        return { ok: false, out: r.error ? editError('lookup_failed', 'Oracle could not look up card names just now. Nothing was changed. Try again.', true) : notFoundCard(chunk[j]) }
      }
      cards.set(chunk[j], r.card)
      if (r.card.name.toLowerCase() !== chunk[j].toLowerCase()) warnings.push(`"${chunk[j]}" was matched to "${r.card.name}".`)
    }
  }
  return { ok: true, cards, warnings }
}

/** CC-21: warn (never refuse) about added cards outside the deck's colours. Any lookup problem only skips the check. */
async function colourCheck(ctx: EditContext, deckId: number, names: string[]): Promise<{ warnings: string[]; note?: string }> {
  try {
    const deck = rows<{ colour_identity: string | null }>(await must(ctx.db.select('decks', 'colour_identity').eq('user_id', ctx.userId).eq('id', deckId).limit(1)))[0]
    if (!deck) return { warnings: [] }
    const deckColours = normaliseColours(deck.colour_identity)
    if (!deckColours) return { warnings: [], note: 'This deck has no colours set, so the cards were not checked against its colours.' }
    const facts = await fetchCardFacts(ctx, names, { includeRulesText: false, prices: new Map() })
    const warnings: string[] = []
    for (const n of [...new Set(names)]) {
      const f = factsFor(facts, n, false)
      const outside = f.available ? coloursOutside(f.colorIdentity, deckColours) : ''
      if (outside) warnings.push(`"${n}" (${normaliseColours(f.colorIdentity)}) is outside this deck's colours (${deckColours}). It was still added.`)
    }
    return { warnings }
  } catch (e) {
    if (e instanceof LookupFailed) return { warnings: [], note: 'Card colours could not be checked just now. The cards were still added.' }
    throw e
  }
}

export async function addCardsToDeck(ctx: EditContext, input: z.infer<typeof addCardsInput>): Promise<ToolOutput> {
  const res = await resolveNames(ctx, input.cards.map((c) => c.name))
  if (!res.ok) return res.out
  const items = input.cards.map((c) => {
    const card = res.cards.get(c.name.trim())!
    return {
      card_name: card.name,
      scryfall_id: card.scryfallId,
      set_code: card.setCode,
      oracle_id: card.oracleId,
      quantity: c.quantity ?? 1,
      categories: JSON.stringify([c.category ?? 'Other']),
    }
  })
  const colours = await colourCheck(ctx, input.deck_id, items.map((i) => i.card_name))
  const out = await submit(ctx, 'deck_add', { deck_id: input.deck_id, items }, input.dry_run, [...res.warnings, ...colours.warnings])
  return colours.note && out.ok !== false ? { ...out, colour_check: colours.note } : out
}

export const removeCardsFromDeck = (ctx: EditContext, input: z.infer<typeof removeCardsInput>) =>
  submit(ctx, 'deck_remove', { deck_id: input.deck_id, slots: input.slots.map((s) => ({ id: s.slot_id, card_name: s.name })) }, input.dry_run)

export const setCardZone = (ctx: EditContext, input: z.infer<typeof setZoneInput>) =>
  submit(ctx, 'deck_zone', { deck_id: input.deck_id, to: input.to, slots: input.slots.map((s) => ({ id: s.slot_id, card_name: s.name })) }, input.dry_run)

/** The tool only sends names as written (trimmed by zod). Matching to the deck's spelling happens in the database; its report is surfaced as warnings. */
export async function setCardCategory(ctx: EditContext, input: z.infer<typeof setCategoryInput>): Promise<ToolOutput> {
  const payload = { deck_id: input.deck_id, slots: input.slots.map((s) => ({ id: s.slot_id, card_name: s.name, categories: s.categories })) }
  const r = await ctx.gateway.submit({ userId: ctx.userId, connectionId: ctx.connectionId, action: 'deck_category', payload, dryRun: !!input.dry_run })
  if (!r.ok) return fail(r)
  const plan = (r.data as { plan?: { matched?: { card: string; sent: string; used: string }[]; changes?: unknown[]; skipped?: unknown[] } }).plan
  const warnings = (plan?.matched ?? []).map((m) => `Stored '${m.sent}' as '${m.used}' on ${m.card}, which this deck already uses.`)
  const out = shapeOutcome(r.data, { warnings })
  if (plan && (input.dry_run || r.data.outcome === 'pending') && out.ok !== false) {
    return { ...out, ...(plan.changes ? { changes: plan.changes } : {}), ...(plan.skipped?.length ? { skipped: plan.skipped } : {}) }
  }
  return out
}

export async function addCardToCollection(ctx: EditContext, input: z.infer<typeof addToCollectionInput>): Promise<ToolOutput> {
  const res = await resolveNames(ctx, [input.name], input.printing_id)
  if (!res.ok) return res.out
  const card = res.cards.get(input.name.trim())!
  return submit(ctx, 'collection_add', { oracle_id: card.oracleId, card_name: card.name, printing_id: card.scryfallId, finish: input.finish ?? 'nonfoil' }, input.dry_run, res.warnings)
}

export const sleeveFreeCopy = (ctx: EditContext, input: z.infer<typeof sleeveCopyInput>) =>
  submit(ctx, 'sleeve_copy', { deck_id: input.deck_id, copy_id: input.copy_id, card_name: input.name }, input.dry_run)

export const makeSlotOriginal = (ctx: EditContext, input: z.infer<typeof makeOriginalInput>) =>
  submit(ctx, 'make_original', { deck_id: input.deck_id, slot_id: input.slot_id, card_name: input.name, original_copy_id: input.original_copy_id }, input.dry_run)

export const createProxyForSlot = (ctx: EditContext, input: z.infer<typeof createProxyInput>) =>
  submit(ctx, 'create_proxy', { deck_id: input.deck_id, slot_id: input.slot_id, card_name: input.name }, input.dry_run)

/** Always waits for the owner. Pre-checks the name and captures where the copy is now, so a stale request fails later, not silently. */
export async function requestCardMove(ctx: EditContext, input: z.infer<typeof requestMoveInput>): Promise<ToolOutput> {
  try {
    const cr = rows<{ id: number; card_id: number }>(await must(ctx.db.select('user_copies', 'id, card_id').eq('user_id', ctx.userId).eq('id', input.copy_id).limit(1)))[0]
    if (!cr) return editError('copy_not_found', "That copy is not in the owner's collection. Nothing was changed.")
    const card = rows<{ card_name: string }>(await must(ctx.db.select('user_cards', 'card_name').eq('user_id', ctx.userId).eq('id', cr.card_id).limit(1)))[0]
    if (!card || card.card_name.trim().toLowerCase() !== input.name.trim().toLowerCase()) return editError('wrong_card', `That copy is not a ${input.name}. Nothing was changed.`)
    const slot = rows<{ id: number; deck_id: number }>(await must(ctx.db.select('deck_cards', 'id, deck_id').eq('user_id', ctx.userId).eq('copy_id', input.copy_id).order('id', { ascending: true }).limit(1)))[0]
    if (!slot) return editError('copy_not_in_a_deck', `The copy of ${card.card_name} is not in a deck right now. Nothing was changed.`)
    return submit(ctx, 'copy_move', { copy_id: input.copy_id, to_deck_id: input.to_deck_id, expected_source_deck_id: slot.deck_id, expected_source_slot_id: slot.id }, input.dry_run)
  } catch (e) {
    if (e instanceof LookupFailed) return editError('lookup_failed', 'Oracle could not read your collection just now. Nothing was changed. Try again.', true)
    throw e
  }
}

export async function undoChange(ctx: EditContext, input: z.infer<typeof undoInput>): Promise<ToolOutput> {
  const r = await ctx.gateway.undoAsClaude(ctx.userId, ctx.connectionId, input.group_id)
  if (!r.ok) return fail(r)
  if (r.data.success) return { ok: true, status: 'undone', undone: r.data.undone, message: 'Undone. Everything in that change is back as it was.' }
  return editError('undo_refused', `${undoRefusalText(r.data.refused)} Nothing was changed.`)
}

export async function getChangeStatus(ctx: EditContext, input: z.infer<typeof changeStatusInput>): Promise<ToolOutput> {
  const r = await ctx.gateway.getPending(ctx.userId, ctx.connectionId, input.pending_id)
  if (!r.ok) return fail(r)
  const p = r.data
  if (!p) return editError('pending_not_found', editErrorMessage('pending_not_found', {}))
  const ended = pendingEndedText(p)
  return {
    ok: true,
    pending_id: p.id,
    status: p.status,
    reason: p.reason,
    expires_at: p.expires_at,
    decided_at: p.decided_at,
    ...(p.result_group_id ? { group_id: p.result_group_id } : {}),
    message: p.status === 'waiting' ? 'Still waiting for the owner to say yes in Oracle.' : p.status === 'approved' ? 'The owner approved it and it was applied.' : (ended ?? 'Ended.'),
  }
}

export async function listRecentChanges(ctx: EditContext): Promise<ToolOutput> {
  const r = await ctx.gateway.listRecent(ctx.userId)
  if (!r.ok) return fail(r)
  const groups = groupChanges(r.data).slice(0, 50)
  return {
    ok: true,
    total: groups.length,
    changes: groups.map((g) => ({
      group_id: g.group_id,
      summary: g.summary,
      at: g.created_at,
      cards: g.cards.slice(0, 20),
      undone: g.undone_at ? { at: g.undone_at, by: g.undone_by } : null,
      claude_can_undo: !g.undone_at && !g.owner_only && !g.undo_blocker && g.card_count <= AI_LIMITS.claude_undo_max,
      ...(g.refusal_text && !g.undone_at ? { undo_blocked: g.refusal_text } : {}),
    })),
    note: 'Last 7 days. Adds to the collection, proxies and card moves can only be undone by the owner.',
  }
}

// Re-exported for the sentence snapshot of a group in tool output tests.
export { describeGroup }
