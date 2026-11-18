// CC-07: the filters shared by search_collection and get_collection_summary. Contract: connector-collection-search.md sections 5, 12 and 13.
// Filters the database can do are pushed into the view query; the rest (OR logic, roles) is applied in the app after the read (collection-query.ts).
import { z } from 'zod'
import type { CollectionSummaryInput } from '../../../../docs/oracle/contracts/connector-collection-search.types'
import { ROLE_ORDER, type Role } from '../../card-roles'
import type { ReadQuery } from '../user-client'
import { escapeLike } from './common'

/** The filters, without paging, rules text or grouping. The summary input is the same list. */
export type CollectionFilters = Omit<CollectionSummaryInput, 'group_by'>

export const CARD_TYPES = ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land', 'battle'] as const
const word = z.string().trim().min(1).max(40)

/** zod fields for every shared filter. Spread into a strictObject. Role names come from the shared classifier, never retyped. */
export const filterFields = {
  query: z.string().min(1).max(100).optional().describe('Part of a card name (not case sensitive).'),
  types: z.array(z.enum(CARD_TYPES)).min(1).max(8).optional().describe('Card types; a card matches if it has ANY of them on either face. Only these eight types exist as filters.'),
  colours: z.array(z.enum(['W', 'U', 'B', 'R', 'G'])).max(5).optional().describe('Colours W U B R G. See colour_match for what they mean. Colourless cards fit "within".'),
  colour_match: z.enum(['within', 'exact', 'includes']).optional().describe('within (default): the card fits a deck of only these colours, so colourless cards are included. exact: exactly these colours (["G"] = mono-green only). includes: has at least these colours, may have more.'),
  colourless: z.boolean().optional().describe('true = only colourless cards (no colour at all). Cannot be combined with colours.'),
  subtypes: z.array(word).min(1).max(10).optional().describe('Creature types and other subtypes such as Elf, Kithkin, Equipment, Time Lord. Whole word, not case sensitive. A card matches if it has ANY of them.'),
  keywords: z.array(word).min(1).max(10).optional().describe('Printed keyword abilities such as flying, haste, deathtouch, landfall. Not words that merely appear in rules text ("target creature gains flying" does not make a card a flying creature). "Kinship" is a keyword here, not a creature type.'),
  keywords_match: z.enum(['all', 'any']).optional().describe('all (default): the card must have every listed keyword. any: at least one.'),
  roles: z.array(z.enum(ROLE_ORDER as unknown as [Role, ...Role[]])).min(1).max(4).optional().describe('Roles worked out live from rules text by the same rules as Deck health: ramp, draw, removal, wipes. A best guess, front face only, lands never have a role, cost reducers count as ramp. Not the same as EDHREC categories.'),
  roles_match: z.enum(['any', 'all']).optional().describe('any (default): the card has at least one listed role. all: every listed role (removal and wipes = cards that are both).'),
  mana_value_min: z.number().int().min(0).max(20).optional().describe('Lowest mana value, inclusive.'),
  mana_value_max: z.number().int().min(0).max(20).optional().describe('Highest mana value, inclusive.'),
  location: z.string().trim().min(1).max(100).optional().describe('A deck name, a box or binder name, or the words "In your hand" or "Missing" (not case sensitive, whole name).'),
  only_free: z.boolean().optional().describe('Only copies that are free: in no deck, not In your hand, and not Missing.'),
  include_proxies: z.boolean().optional().describe('Include proxy copies. Default true.'),
  only_proxies: z.boolean().optional().describe('Only proxy copies. Cannot be combined with include_proxies=false.'),
  text: z.string().trim().min(1).max(100).optional().describe('Words in the card\'s rules text, either face (not case sensitive, partial words count: "counter" finds "counters"). Real rules text says "put" not "puts" and "this creature" not the card\'s name, so search for the stable words ("+1/+1 counter") rather than a sentence. Up to 8 words. Needs card facts.'),
  text_match: z.enum(['all_words', 'phrase']).optional().describe('all_words (default): every word must appear somewhere in the rules text, in any order. phrase: the exact words in that order (never across the gap between two faces). Needs text.'),
  legendary: z.boolean().optional().describe('true = Legendary on either face of the type line (so Legendary artifacts, vehicles and planeswalkers count). false = Legendary on neither face. Not the same as can_be_commander.'),
  can_be_commander: z.boolean().optional().describe('true = the card library says it can be your commander (Legendary creatures and cards that say so). false = it cannot. Use this for "commander candidates" and legendary for "legendary things".'),
  no_card_facts: z.literal(true).optional().describe('true = list only the owned cards that have no card data yet. Cannot be combined with filters that need card data (types, colours, subtypes, keywords, roles, mana value, text, legendary, can_be_commander).'),
}

/** Cross-field rules. Used as a zod superRefine, so a bad mix is INVALID_INPUT before any read happens. */
export function refineFilters(f: CollectionFilters, ctx: z.RefinementCtx): void {
  const bad = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
  if (f.only_proxies && f.include_proxies === false) bad('only_proxies', 'only_proxies cannot be combined with include_proxies=false')
  if (f.colourless && f.colours && f.colours.length > 0) bad('colourless', 'colourless cannot be combined with colours')
  if (f.mana_value_min != null && f.mana_value_max != null && f.mana_value_min > f.mana_value_max) bad('mana_value_min', 'mana_value_min is higher than mana_value_max')
  if (f.text && f.text.split(/\s+/).length > 8) bad('text', 'text can have at most 8 words')
  if (f.text_match && !f.text) bad('text_match', 'text_match needs text')
  if (f.no_card_facts && factFilterNames(f).length > 0) bad('no_card_facts', `no_card_facts cannot be combined with the ${factFilterNames(f).join(', ')} filter`)
}

export const norm = (s: string) => s.trim().toLowerCase()

export function wantsColourless(f: CollectionFilters): boolean {
  if (f.colourless) return true
  return !!f.colours && f.colours.length === 0 && (f.colour_match ?? 'within') !== 'includes'
}

export function hasColourFilter(f: CollectionFilters): boolean {
  return wantsColourless(f) || (!!f.colours && f.colours.length > 0)
}

/** Filters that need card facts (type, colour, mana value, subtype, keyword, role, legendary, rules text, commander). A card with no library row can never match them. */
export function factFilterNames(f: CollectionFilters): string[] {
  const out: string[] = []
  if (f.types) out.push('type')
  if (hasColourFilter(f)) out.push('colour')
  if (f.mana_value_min != null || f.mana_value_max != null) out.push('mana value')
  if (f.subtypes) out.push('subtype')
  if (f.keywords) out.push('keyword')
  if (f.roles) out.push('role')
  if (f.legendary != null) out.push('legendary')
  if (f.text) out.push('rules text')
  if (f.can_be_commander != null) out.push('commander')
  return out
}

const COLOUR_COL: Record<string, string> = { W: 'has_w', U: 'has_u', B: 'has_b', R: 'has_r', G: 'has_g' }

/** Filters the database can apply itself. `withFacts` false leaves out everything that needs card facts (used to count cards without facts). */
export function applyPushdown(q: ReadQuery, f: CollectionFilters, withFacts = true): ReadQuery {
  let out = q
  if (f.query) out = out.ilike('card_name', `%${escapeLike(f.query)}%`)
  if (f.only_free) out = out.eq('is_free', true)
  if (f.only_proxies) out = out.eq('is_proxy', true)
  else if (f.include_proxies === false) out = out.eq('is_proxy', false)
  if (f.no_card_facts) out = out.eq('facts_available', false) // a fact-free filter: applies in both passes
  if (!withFacts) return out

  if (hasColourFilter(f)) {
    out = out.eq('facts_available', true)
    if (wantsColourless(f)) out = out.eq('is_colourless', true)
    else {
      const chosen = new Set(f.colours ?? [])
      const mode = f.colour_match ?? 'within'
      for (const c of Object.keys(COLOUR_COL)) {
        if (chosen.has(c as never)) {
          if (mode !== 'within') out = out.eq(COLOUR_COL[c], true) // exact and includes need the colour; within allows but does not need it
        } else if (mode !== 'includes') {
          out = out.eq(COLOUR_COL[c], false) // within and exact: a colour not chosen must be absent
        }
      }
    }
  }
  if (f.mana_value_min != null) out = out.gte('mana_value', f.mana_value_min)
  if (f.mana_value_max != null) out = out.lte('mana_value', f.mana_value_max)
  if (f.subtypes) out = out.overlaps('subtypes', f.subtypes.map(norm))
  if (f.keywords) {
    const kws = f.keywords.map(norm)
    out = (f.keywords_match ?? 'all') === 'all' ? out.contains('keywords', kws) : out.overlaps('keywords', kws)
  }
  if (f.legendary != null) {
    out = out.eq('facts_available', true)
    out = f.legendary ? out.ilike('type_line', '%legendary%') : out.not('type_line', 'ilike', '%legendary%')
  }
  if (f.types || f.roles || f.text || f.can_be_commander != null) out = out.eq('facts_available', true)
  return out
}
