import { z } from 'zod'
import type { DeckCardView } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import type { CardFacts } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { DECK_CARDS_PAGE_MAX, fitRows, cutText } from '../limits'
import { fetchCardFacts, factsFor } from './card-facts'
import { loadStrategyBrackets } from './bracket'
import { loadDeckHealthView, loadDeckStrategy, type HealthLoader } from './deck-strategy-read'
import { DECK_COLUMNS, deckStatusAndSleeved, toDeckSummary, type DeckRow } from './list-decks'
import { fetchAll, fetchAllIn, LookupFailed, lookupFailed, must, notFound, pageNote, rows, tooLarge, type ToolContext, type ToolOutput } from './common'

export const getDeckInput = z.strictObject({
  deck_id: z.number().int().positive().describe('The deck id from list_decks.'),
  limit: z.number().int().min(1).max(DECK_CARDS_PAGE_MAX).optional().describe('Cards per page, 1-150. Default 150.'),
  offset: z.number().int().min(0).optional().describe('Cards to skip, for paging.'),
  include_maybeboard: z.boolean().optional().describe('List maybeboard cards too. Default false (only counted).'),
  include_rules_text: z.boolean().optional().describe('Add each card\'s rules text (cut at 300 characters). Default false so a big deck fits one answer; type, cost, colours and legality are always included.'),
})

type DeckCardRow = {
  id: number
  card_name: string
  quantity: number | null
  categories: string | null
  is_commander: boolean | null
  ownership_status: string | null
  is_generic: boolean
  generic_sleeved: boolean | null
  copy_id: number | null
  scryfall_id: string | null
  requested_finish: string | null
}

/** Deck rows carry slimmer facts than search results: no price (the ownership tool has prices), so a 100-card deck fits one answer. */
export type DeckRowFacts = Omit<CardFacts, 'price'>

export function slimFacts(f: CardFacts): DeckRowFacts {
  const { price: _price, ...rest } = f // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest
}

export function parseCategories(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  } catch {
    /* fall through to comma split */
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

function ownership(row: DeckCardRow): DeckCardView['ownership'] {
  if (row.is_generic) return 'generic'
  const s = row.ownership_status
  return s === 'original' || s === 'proxy' || s === 'not_owned' ? s : null
}

/** Returns, in this order: deck, strategy (the owner's plan), health, cards. `loadHealth` is replaceable for tests. */
export async function getDeck(ctx: ToolContext, input: z.infer<typeof getDeckInput>, loadHealth?: HealthLoader): Promise<ToolOutput> {
  const limit = input.limit ?? DECK_CARDS_PAGE_MAX
  const offset = input.offset ?? 0
  try {
    const dr = await must(ctx.db.select('decks', DECK_COLUMNS).eq('user_id', ctx.userId).eq('id', input.deck_id).limit(1))
    const deckRow = rows<DeckRow>(dr)[0]
    if (!deckRow) return notFound() // not yours and missing look the same

    const all = await fetchAll<DeckCardRow>(() =>
      ctx.db
        .select('deck_cards', 'id, card_name, quantity, categories, is_commander, ownership_status, is_generic, generic_sleeved, copy_id, scryfall_id, requested_finish')
        .eq('user_id', ctx.userId)
        .eq('deck_id', input.deck_id)
        .order('id', { ascending: true }),
    )
    const isMaybe = (r: DeckCardRow) => parseCategories(r.categories).includes('Maybeboard')
    const maybeboardCount = all.filter(isMaybe).length
    const listed = input.include_maybeboard ? all : all.filter((r) => !isMaybe(r))
    const total = listed.length
    const page = listed.slice(offset, offset + limit)

    const copyIds = page.map((r) => r.copy_id).filter((x): x is number => x != null)
    const copies = copyIds.length ? await fetchAllIn<{ id: number; printing_id: string | null; finish: string | null }>(ctx, 'user_copies', 'id, printing_id, finish', 'id', copyIds) : []
    const copyById = new Map(copies.map((c) => [c.id, c]))
    const { status, sleevedCount } = deckStatusAndSleeved(deckRow.format, all)

    const withRules = input.include_rules_text ?? false
    const facts = await fetchCardFacts(ctx, page.map((r) => r.card_name), { includeRulesText: withRules, prices: new Map() }) // prices are not shown on deck rows

    const items: (DeckCardView & { facts: DeckRowFacts })[] = page.map((r) => {
      const copy = r.copy_id != null ? copyById.get(r.copy_id) : undefined
      return {
        facts: slimFacts(factsFor(facts, r.card_name, withRules)),
        slotId: r.id,
        name: r.card_name,
        quantity: r.quantity ?? 1,
        categories: parseCategories(r.categories).map((c) => cutText(c) ?? c),
        isCommander: !!r.is_commander,
        ownership: ownership(r),
        sleeved: r.copy_id != null,
        printingId: copy?.printing_id ?? r.scryfall_id,
        finish: copy?.finish ?? r.requested_finish,
      }
    })
    const strategy = await loadStrategyBrackets(ctx, [input.deck_id])
    const deck = toDeckSummary(deckRow, sleevedCount, status, undefined, strategy.get(input.deck_id))
    const strategyView = await loadDeckStrategy(ctx, input.deck_id, deck.bracketInfo)
    const health = await loadDeckHealthView(ctx, input.deck_id, loadHealth)
    const fit = fitRows(items, (kept) => {
      const meta = pageNote(total, offset, kept.length, kept.length < items.length)
      return {
        ok: true as const,
        deck,
        strategy: strategyView,
        health,
        mainboard: { ok: true as const, items: kept, total, returned: kept.length, offset, truncated: meta.truncated, ...(meta.note ? { note: meta.note } : {}) },
        maybeboardCount,
      }
    })
    if (!fit) return tooLarge()
    return fit.result
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
