// Slice B edit tools (contract slice B section 3). Rules held here:
//  - every input is a strict zod object with NO user id argument; the user comes only from the verified token (ctx.userId)
//  - nothing here can delete a collection record: the only things a tool can ask for are the eight RPC actions
//  - each refusal comes back as a specific, plain-words error, and "Nothing was changed." is always true when it does
import { z } from 'zod'
import { editError } from '../errors'
import { editErrorMessage, describeGroup, pendingEndedText, undoRefusalText } from '../change-sentences'
import { groupChanges } from '../change-groups'
import { AI_LIMITS } from '../edit-config'
import { isMissingTable, reasonField, reasonNotStoredNote } from '../change-reason'
import { FORMAT_DEFINITIONS, type DeckFormat } from '../../format-config'
import type { EditContext } from '../user-client'
import type { ChangeAction, GatewayFailure, ResolvedCard, SubmitOutcome } from '../write-types'
import { LookupFailed, must, rows, type ToolOutput } from './common'
import { fetchCardFacts, factsFor } from './card-facts'
import { coloursOutside, normaliseColours } from './deck-colours'
import { getOwnedPrintingsByNames } from '../../card-data'
import { defaultCategoryForTypeLine } from '../../type-line'
import { BRACKET_MAX, BRACKET_MIN } from '../../deck-bracket'
import { PLAYGROUP_MAX, STRATEGY_MAX, SUMMARY_MAX } from '../../deck-strategy-window'

const dryRun = z.boolean().optional().describe('If true, only check and describe what would happen. Nothing is changed.')
const reason = reasonField
const deckId = z.number().int().positive().describe('The deck id from list_decks.')
const slotRef = z.strictObject({
  slot_id: z.number().int().positive().describe('The slotId of the card in get_deck.'),
  name: z.string().trim().min(1).max(200).describe('The card name in that slot (checked so the wrong card is never touched).'),
})

export const addCardsInput = z.strictObject({
  deck_id: deckId,
  reason,
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
          .describe('Optional. A category for this card. Leave it out and the card starts in its type\'s category (for example Creature or Land). If you send one, reuse a name the deck already shows in get_deck. Deck health reads card text, not categories. "Maybeboard" is not allowed here; use set_card_zone.'),
      }),
    )
    .min(1)
    .max(AI_LIMITS.max_request),
  dry_run: dryRun,
})

export const removeCardsInput = z.strictObject({ deck_id: deckId, reason, slots: z.array(slotRef).min(1).max(AI_LIMITS.max_request), dry_run: dryRun })

export const setZoneInput = z.strictObject({
  deck_id: deckId,
  reason,
  slots: z.array(slotRef).min(1).max(AI_LIMITS.max_request),
  to: z.enum(['main', 'maybeboard']).describe('Where the cards should be.'),
  dry_run: dryRun,
})

export const setCategoryInput = z.strictObject({
  deck_id: deckId,
  reason,
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
  reason,
  name: z.string().trim().min(1).max(200).describe('Card name.'),
  finish: z.enum(['nonfoil', 'foil', 'etched']).optional().describe('Default nonfoil.'),
  printing_id: z.string().trim().min(1).max(64).optional().describe('Scryfall printing id, if a specific printing is wanted.'),
  dry_run: dryRun,
})

export const sleeveCopyInput = z.strictObject({
  deck_id: deckId,
  reason,
  copy_id: z.number().int().positive().describe('The copyId of a free copy (from search_collection).'),
  name: z.string().trim().min(1).max(200),
  dry_run: dryRun,
})

export const makeOriginalInput = z.strictObject({
  deck_id: deckId,
  reason,
  slot_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  original_copy_id: z.number().int().positive().describe('The copyId of a free original (not a proxy).'),
  dry_run: dryRun,
})

export const createProxyInput = z.strictObject({
  deck_id: deckId,
  reason,
  slot_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  dry_run: dryRun,
})

export const requestMoveInput = z.strictObject({
  reason,
  copy_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  to_deck_id: deckId,
  dry_run: dryRun,
})

const FORMATS = Object.keys(FORMAT_DEFINITIONS) as [DeckFormat, ...DeckFormat[]]
const commanderRef = z.strictObject({ name: z.string().trim().min(1).max(200).describe('The commander card name.') })

export const createDeckInput = z.strictObject({
  reason,
  name: z.string().trim().min(1).max(100).describe('The new deck name (1 to 100 characters). Must not match another deck name, ignoring capital letters.'),
  format: z.enum(FORMATS).describe('The deck format. A commander deck needs a commander.'),
  commander: commanderRef.optional().describe('Required when format is commander.'),
})

export const setDeckSetupInput = z
  .strictObject({
    deck_id: deckId,
    reason,
    commander: commanderRef.optional().describe('Make this card the deck\'s commander (added as a Planned slot if it is not on the deck).'),
    summary: z.string().trim().max(SUMMARY_MAX).nullable().optional().describe(`The deck's one-line summary shown on the deck page, at most ${SUMMARY_MAX} characters, or null to clear it.`),
    strategy: z
      .string()
      .trim()
      .min(1)
      .max(STRATEGY_MAX)
      .optional()
      .describe('The whole Strategy text, as one clean piece of text. It replaces what is there now, so start from the Strategy get_deck returned, keep what still holds, and rewrite the rest. Do not append dated paragraphs. At most 4000 characters. Send based_on with it.'),
    based_on: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Required with strategy. Copy strategy.version from get_deck (the time the Strategy was last changed), or the word none when get_deck shows no Strategy yet. If the Strategy changed since you read it, the rewrite is refused and nothing is changed.'),
    playgroup: z.string().trim().max(PLAYGROUP_MAX).nullable().optional().describe(`Who the owner usually plays against, at most ${PLAYGROUP_MAX} characters, or null to clear it.`),
    bracket: z.number().int().min(BRACKET_MIN).max(BRACKET_MAX).nullable().optional().describe('The owner\'s TARGET bracket, 1 to 5 (1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH), or null to clear it. When the owner has not set one, ask them; do not assume. The bracket never limits which cards you may suggest.'),
  })
  .refine((v) => v.strategy === undefined || v.based_on !== undefined, {
    message: 'Send based_on with strategy: the strategy.version from get_deck, or none when there is no Strategy yet. Nothing was changed.',
    path: ['based_on'],
  })
  .refine((v) => v.commander !== undefined || v.summary !== undefined || v.strategy !== undefined || v.playgroup !== undefined || v.bracket !== undefined, {
    message: 'Send at least one of commander, summary, strategy, playgroup or bracket. Nothing was changed.',
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

/** Can the database keep a reason? Null = yes. Otherwise the plain note to add to the answer. A read that fails for another reason says "just now". */
async function reasonStorageNote(ctx: EditContext, waiting: boolean): Promise<string | null> {
  try {
    const r = await ctx.db.select('ai_change_reasons', 'group_id').eq('user_id', ctx.userId).limit(1)
    if (!r.error) return null
    return reasonNotStoredNote(isMissingTable(r.error.message) ? 'yet' : 'now', waiting)
  } catch {
    return reasonNotStoredNote('now', waiting)
  }
}
/** Adds `reason_note` to an answer whose change was made (or is waiting) when the reason could not be stored. A dry run stores nothing, so it never needs it. */
async function withReasonNote(ctx: EditContext, out: ToolOutput): Promise<ToolOutput> {
  if (out.ok === false) return out
  if (out.status !== 'applied' && out.status !== 'pending_approval') return out
  const note = await reasonStorageNote(ctx, out.status === 'pending_approval')
  return note ? { ...out, reason_note: note } : out
}
async function submit(ctx: EditContext, action: ChangeAction, payload: Record<string, unknown>, dry: boolean | undefined, warnings: string[] = []): Promise<ToolOutput> {
  const r = await ctx.gateway.submit({ userId: ctx.userId, connectionId: ctx.connectionId, action, payload, dryRun: !!dry })
  return r.ok ? withReasonNote(ctx, shapeOutcome(r.data, { warnings })) : fail(r)
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

/** The printing the owner owns for each card name (with its set code), else nothing. Any problem falls back to the default printing. */
async function ownedPrintingsFor(ctx: EditContext, names: string[]): Promise<Map<string, { scryfallId: string; setCode: string }>> {
  const out = new Map<string, { scryfallId: string; setCode: string }>()
  try {
    const owned = await getOwnedPrintingsByNames(names, ctx.userId)
    if (owned.size === 0) return out
    const ids = [...new Set(owned.values())]
    const found = rows<{ scryfall_id: string; set_code: string | null }>(await must(ctx.db.select('ref_printings', 'scryfall_id, set_code').in('scryfall_id', ids)))
    const setById = new Map(found.map((r) => [r.scryfall_id, r.set_code]))
    for (const [name, id] of owned) {
      const setCode = setById.get(id)
      if (setCode) out.set(name, { scryfallId: id, setCode })
    }
  } catch { /* keep the default printing */ }
  return out
}
/** Type lines for cards sent without a category, so they start in their type's category (shared rule). A lookup problem leaves them under "Other", as before. */
async function startingTypeLines(ctx: EditContext, names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (names.length === 0) return out
  try {
    const facts = await fetchCardFacts(ctx, names, { includeRulesText: false, prices: new Map() })
    for (const [name, f] of facts) if (f.available && f.typeLine) out.set(name.toLowerCase(), f.typeLine)
  } catch { /* keep "Other" */ }
  return out
}
export async function addCardsToDeck(ctx: EditContext, input: z.infer<typeof addCardsInput>): Promise<ToolOutput> {
  const res = await resolveNames(ctx, input.cards.map((c) => c.name))
  if (!res.ok) return res.out
  const ownedPrintings = await ownedPrintingsFor(ctx, [...res.cards.values()].map((c) => c.name))
  const typeLines = await startingTypeLines(ctx, input.cards.filter((c) => !c.category).map((c) => c.name))
  const items = input.cards.map((c) => {
    const card = res.cards.get(c.name.trim())!
    const mine = ownedPrintings.get(card.name)
    return {
      card_name: card.name,
      scryfall_id: mine?.scryfallId ?? card.scryfallId,
      set_code: mine?.setCode ?? card.setCode,
      oracle_id: card.oracleId,
      quantity: c.quantity ?? 1,
      categories: JSON.stringify([c.category ?? defaultCategoryForTypeLine(typeLines.get(card.name.toLowerCase()) ?? typeLines.get(c.name.trim().toLowerCase()))]),
    }
  })
  const colours = await colourCheck(ctx, input.deck_id, items.map((i) => i.card_name))
  const out = await submit(ctx, 'deck_add', { deck_id: input.deck_id, items, claude_reason: input.reason }, input.dry_run, [...res.warnings, ...colours.warnings])
  return colours.note && out.ok !== false ? { ...out, colour_check: colours.note } : out
}

export const removeCardsFromDeck = (ctx: EditContext, input: z.infer<typeof removeCardsInput>) =>
  submit(ctx, 'deck_remove', { deck_id: input.deck_id, claude_reason: input.reason, slots: input.slots.map((s) => ({ id: s.slot_id, card_name: s.name })) }, input.dry_run)

export const setCardZone = (ctx: EditContext, input: z.infer<typeof setZoneInput>) =>
  submit(ctx, 'deck_zone', { deck_id: input.deck_id, claude_reason: input.reason, to: input.to, slots: input.slots.map((s) => ({ id: s.slot_id, card_name: s.name })) }, input.dry_run)

/** The tool only sends names as written (trimmed by zod). Matching to the deck's spelling happens in the database; its report is surfaced as warnings. */
export async function setCardCategory(ctx: EditContext, input: z.infer<typeof setCategoryInput>): Promise<ToolOutput> {
  const payload = { deck_id: input.deck_id, claude_reason: input.reason, slots: input.slots.map((s) => ({ id: s.slot_id, card_name: s.name, categories: s.categories })) }
  const r = await ctx.gateway.submit({ userId: ctx.userId, connectionId: ctx.connectionId, action: 'deck_category', payload, dryRun: !!input.dry_run })
  if (!r.ok) return fail(r)
  const plan = (r.data as { plan?: { matched?: { card: string; sent: string; used: string }[]; changes?: unknown[]; skipped?: unknown[] } }).plan
  const warnings = (plan?.matched ?? []).map((m) => `Stored '${m.sent}' as '${m.used}' on ${m.card}, which this deck already uses.`)
  const out = await withReasonNote(ctx, shapeOutcome(r.data, { warnings }))
  if (plan && (input.dry_run || r.data.outcome === 'pending') && out.ok !== false) {
    return { ...out, ...(plan.changes ? { changes: plan.changes } : {}), ...(plan.skipped?.length ? { skipped: plan.skipped } : {}) }
  }
  return out
}

export async function addCardToCollection(ctx: EditContext, input: z.infer<typeof addToCollectionInput>): Promise<ToolOutput> {
  const res = await resolveNames(ctx, [input.name], input.printing_id)
  if (!res.ok) return res.out
  const card = res.cards.get(input.name.trim())!
  return submit(ctx, 'collection_add', { claude_reason: input.reason, oracle_id: card.oracleId, card_name: card.name, printing_id: card.scryfallId, finish: input.finish ?? 'nonfoil' }, input.dry_run, res.warnings)
}

export const sleeveFreeCopy = (ctx: EditContext, input: z.infer<typeof sleeveCopyInput>) =>
  submit(ctx, 'sleeve_copy', { claude_reason: input.reason, deck_id: input.deck_id, copy_id: input.copy_id, card_name: input.name }, input.dry_run)

export const makeSlotOriginal = (ctx: EditContext, input: z.infer<typeof makeOriginalInput>) =>
  submit(ctx, 'make_original', { claude_reason: input.reason, deck_id: input.deck_id, slot_id: input.slot_id, card_name: input.name, original_copy_id: input.original_copy_id }, input.dry_run)

export const createProxyForSlot = (ctx: EditContext, input: z.infer<typeof createProxyInput>) =>
  submit(ctx, 'create_proxy', { claude_reason: input.reason, deck_id: input.deck_id, slot_id: input.slot_id, card_name: input.name }, input.dry_run)

/** Always waits for the owner. Pre-checks the name and captures where the copy is now, so a stale request fails later, not silently. */
export async function requestCardMove(ctx: EditContext, input: z.infer<typeof requestMoveInput>): Promise<ToolOutput> {
  try {
    const cr = rows<{ id: number; card_id: number }>(await must(ctx.db.select('user_copies', 'id, card_id').eq('user_id', ctx.userId).eq('id', input.copy_id).limit(1)))[0]
    if (!cr) return editError('copy_not_found', "That copy is not in the owner's collection. Nothing was changed.")
    const card = rows<{ card_name: string }>(await must(ctx.db.select('user_cards', 'card_name').eq('user_id', ctx.userId).eq('id', cr.card_id).limit(1)))[0]
    if (!card || card.card_name.trim().toLowerCase() !== input.name.trim().toLowerCase()) return editError('wrong_card', `That copy is not a ${input.name}. Nothing was changed.`)
    const slot = rows<{ id: number; deck_id: number }>(await must(ctx.db.select('deck_cards', 'id, deck_id').eq('user_id', ctx.userId).eq('copy_id', input.copy_id).order('id', { ascending: true }).limit(1)))[0]
    if (!slot) return editError('copy_not_in_a_deck', `The copy of ${card.card_name} is not in a deck right now. Nothing was changed.`)
    return submit(ctx, 'copy_move', { claude_reason: input.reason, copy_id: input.copy_id, to_deck_id: input.to_deck_id, expected_source_deck_id: slot.deck_id, expected_source_slot_id: slot.id }, input.dry_run)
  } catch (e) {
    if (e instanceof LookupFailed) return editError('lookup_failed', 'Oracle could not read your collection just now. Nothing was changed. Try again.', true)
    throw e
  }
}

/** The commander's ids and colours, looked up here so the database never matches names. Colours use the same letters the manual create route stores. */
async function resolveCommander(ctx: EditContext, name: string): Promise<{ ok: true; card: { card_name: string; scryfall_id: string; oracle_id: string; colour_identity: string }; warnings: string[] } | { ok: false; out: ToolOutput }> {
  const res = await resolveNames(ctx, [name])
  if (!res.ok) return res
  const card = res.cards.get(name.trim())!
  try {
    const facts = await fetchCardFacts(ctx, [card.name], { includeRulesText: false, prices: new Map() })
    const f = factsFor(facts, card.name, false)
    return { ok: true, card: { card_name: card.name, scryfall_id: card.scryfallId, oracle_id: card.oracleId, colour_identity: (f.available ? normaliseColours(f.colorIdentity) : null) ?? '' }, warnings: res.warnings }
  } catch (e) {
    if (e instanceof LookupFailed) return { ok: false, out: editError('lookup_failed', 'Oracle could not look up card details just now. Nothing was changed. Try again.', true) }
    throw e
  }
}

export async function createDeck(ctx: EditContext, input: z.infer<typeof createDeckInput>): Promise<ToolOutput> {
  if (input.format === 'commander' && !input.commander) return editError('commander_required', editErrorMessage('commander_required', {}))
  let commander = null
  let warnings: string[] = []
  if (input.commander) {
    const c = await resolveCommander(ctx, input.commander.name)
    if (!c.ok) return c.out
    commander = c.card
    warnings = c.warnings
  }
  const r = await ctx.gateway.createDeck({ userId: ctx.userId, connectionId: ctx.connectionId, name: input.name, format: input.format, commander })
  if (!r.ok) return fail(r)
  const note = await recordReason(ctx, r.data.group_id, input.reason)
  return {
    ok: true,
    status: 'applied',
    group_id: r.data.group_id,
    deck_id: r.data.deck_id,
    count: r.data.count,
    message: 'The deck was created, empty. Add cards with add_cards_to_deck. Only the owner can undo this, in Oracle, while the deck has no cards; Claude cannot delete a deck.',
    ...(warnings.length ? { warnings } : {}),
    ...(note ? { reason_note: note } : {}),
  }
}

/** For the two writes that do not go through the submit function (create deck, set deck setup): store the reason right after the change. Returns the plain note when it could not be stored. */
async function recordReason(ctx: EditContext, groupId: string, reason: string): Promise<string | null> {
  const note = await reasonStorageNote(ctx, false)
  if (note) return note
  const r = await ctx.gateway.recordReason({ userId: ctx.userId, groupId, reason })
  return r.ok ? null : reasonNotStoredNote('now', false)
}
/** Can the database hold the summary, the playgroup's change record and bracket 5? False until the owner applies the update. */
async function newFieldsReady(ctx: EditContext): Promise<boolean> {
  const r = await ctx.db.select('deck_strategy', 'summary, updated_by').eq('user_id', ctx.userId).limit(1)
  return !r.error
}
/** The marker from get_deck is a time. Compare as times when both parse, so a different spelling of the same moment still matches. */
function sameVersion(current: string, sent: string | undefined): boolean {
  if (sent === undefined) return false
  if (current === sent) return true
  if (current === 'none' || sent === 'none') return false
  const a = Date.parse(current)
  return !Number.isNaN(a) && a === Date.parse(sent)
}
export async function setDeckSetup(ctx: EditContext, input: z.infer<typeof setDeckSetupInput>): Promise<ToolOutput> {
  const patch: Record<string, unknown> = {}
  let warnings: string[] = []
  if (input.commander) {
    const c = await resolveCommander(ctx, input.commander.name)
    if (!c.ok) return c.out
    patch.commander = { card_name: c.card.card_name, scryfall_id: c.card.scryfall_id, oracle_id: c.card.oracle_id }
    warnings = c.warnings
  }
  // The summary, the playgroup and bracket 5 need the stored-data update the owner applies later. Until then say so plainly
  // and change nothing, instead of letting an older database quietly drop them.
  if (input.summary !== undefined || input.playgroup !== undefined || input.bracket === 5) {
    if (!(await newFieldsReady(ctx))) {
      return editError('strategy_fields_not_ready', 'The summary, the playgroup and bracket 5 cannot be saved yet: Oracle\'s stored data has not been updated for them. Nothing was changed. The bracket (1 to 4), the Strategy text and the commander can still be set.')
    }
  }
  if (input.summary !== undefined) patch.summary = input.summary
  if (input.playgroup !== undefined) patch.playgroup = input.playgroup
  if (input.bracket !== undefined) patch.bracket = input.bracket
  if (input.strategy !== undefined) {
    // Claude rewrites the whole Strategy, only when it read the latest text. The database compares again with strategy_notes_base.
    const cur = await ctx.db.select('deck_strategy', 'strategy_notes, updated_at').eq('user_id', ctx.userId).eq('deck_id', input.deck_id).limit(1)
    if (cur.error) return editError('rpc_failed', 'Oracle could not read the current Strategy just now. Nothing was changed. Try again.', true)
    const row = rows<{ strategy_notes: string | null; updated_at: string | null }>(cur)[0]
    const version = row?.updated_at ?? 'none'
    if (!sameVersion(version, input.based_on)) return editError('strategy_changed', editErrorMessage('strategy_changed', {}))
    patch.strategy_notes = input.strategy
    patch.strategy_notes_base = row?.strategy_notes ?? null
  }
  const r = await ctx.gateway.setDeckSetup({ userId: ctx.userId, connectionId: ctx.connectionId, deckId: input.deck_id, patch })
  if (!r.ok) return fail(r)
  if (r.data.outcome === 'no_change') return { ok: true, status: 'no_change', count: 0, message: 'Everything sent was already set that way. Nothing was changed.' }
  const note = await recordReason(ctx, r.data.group_id, input.reason)
  return {
    ok: true,
    status: 'applied',
    group_id: r.data.group_id,
    count: r.data.count,
    changed: r.data.changed,
    message: 'Done. Claude or the owner can undo this for 7 days, unless the same thing is changed by hand first.',
    ...(warnings.length ? { warnings } : {}),
    ...(note ? { reason_note: note } : {}),
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
      ...(g.claude_reason ? { reason: g.claude_reason } : {}),
      at: g.created_at,
      cards: g.cards.slice(0, 20),
      undone: g.undone_at ? { at: g.undone_at, by: g.undone_by } : null,
      claude_can_undo: !g.undone_at && !g.owner_only && !g.undo_blocker && g.card_count <= AI_LIMITS.claude_undo_max,
      ...(g.refusal_text && !g.undone_at ? { undo_blocked: g.refusal_text } : {}),
    })),
    note: 'Last 7 days. Adds to the collection, proxies, card moves and deck creation can only be undone by the owner.',
  }
}

// Re-exported for the sentence snapshot of a group in tool output tests.
export { describeGroup }
