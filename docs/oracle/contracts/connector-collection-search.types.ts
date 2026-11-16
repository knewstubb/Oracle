/**
 * Reference types for CC-07 (filterable collection search + group counts). Contract: docs/oracle/contracts/connector-collection-search.md.
 * Reference only: no handlers here. Extends docs/oracle/contracts/claude-connector-slice-a.types.ts and
 * connector-card-facts-and-deck-health.types.ts.
 * Identifier rule (D-003): oracleId = the card across printings; printingId = scryfall_id of one printing. Never swap them.
 */
import type { CopyView, Paged } from './claude-connector-slice-a.types'
import type { WithFacts } from './connector-card-facts-and-deck-health.types'
// Roles come from the ONE shared classifier. Never retype the list. Contract section 13.
import type { Role } from '../../../src/lib/card-roles'
export type { Role }

export type CardType = 'creature' | 'instant' | 'sorcery' | 'artifact' | 'enchantment' | 'planeswalker' | 'land' | 'battle'
export type Colour = 'W' | 'U' | 'B' | 'R' | 'G'

/** How the colour filter reads. Default 'within'. */
export type ColourMatch =
  | 'within' // card colours are all inside the chosen ones (fits a deck of those colours). Colourless always fits.
  | 'exact' // card colours are exactly the chosen ones
  | 'includes' // card has at least the chosen colours (may have more)

export type PlaceKind = 'deck' | 'storage' | 'in_hand' | 'missing'

/** search_collection input. Every field optional; filters combine with AND. Unknown fields are rejected (strict). */
export interface SearchCollectionInput {
  query?: string // part of a card name, 1-100 chars (unchanged)
  types?: CardType[] // 1-8; card has ANY of these types on either face
  colours?: Colour[] // 0-5; empty array together with colour_match 'exact' means colourless
  colour_match?: ColourMatch // default 'within'; only used when colours is given
  colourless?: boolean // shortcut for "only colourless cards"; cannot be combined with colours
  subtypes?: string[] // AMENDED: 1-10 words like "Elf", "Equipment", "Kithkin"; case-insensitive, exact word; card has ANY of them on either face. PENDING OWNER ANSWER: 'any' is the proposed default
  keywords?: string[] // AMENDED: 1-10 words like "flying", "haste", "deathtouch"; case-insensitive, exact word
  keywords_match?: 'all' | 'any' // AMENDED: default 'all' ("flying haste" = both). PENDING OWNER ANSWER: 'all' is the proposed default
  roles?: Role[] // NEW (section 13): 1-4 of ramp, draw, removal, wipes; worked out live from rules text by rolesForCard; lands never match
  roles_match?: 'any' | 'all' // NEW: PENDING OWNER ANSWER, proposed default 'any'
  mana_value_min?: number // integer 0-20
  mana_value_max?: number // integer 0-20
  location?: string // a deck name, box/binder name, or the words "In your hand" / "Missing" (case-insensitive, exact)
  only_free?: boolean // CHANGED: copies in no deck AND not In your hand AND not Missing (was: not in any deck)
  include_proxies?: boolean // unchanged; default true
  only_proxies?: boolean // NEW; cannot be combined with include_proxies=false
  include_rules_text?: boolean // NEW; default true (unchanged behaviour). Claude may send false to keep pages small
  limit?: number // 1-25, default 25 (unchanged)
  offset?: number // unchanged
}

/** One result row = one card + one kind. A card with originals and proxies gives two rows. */
export interface SearchRow extends WithFacts {
  oracleId: string
  name: string
  typeLine: string | null
  keywords?: string[] // AMENDED: shown from card facts so Claude can confirm a keyword match
  roles?: Role[] // NEW: from rolesForCard on the card's facts; [] = checked, no role; absent = could not be checked (no facts or no rules text)
  kind: 'original' | 'proxy' // NEW
  copyCount: number // copies of THIS kind that match the filters
  copies: CopyView[] // up to 20, as before; location.kind may now also be 'in_hand' or 'missing'
  copiesTruncated: boolean
}

export interface SearchCollectionResult extends Paged<SearchRow> {
  totalCopies: number // matching copies across all rows (exact)
  /** Present when a type, subtype, keyword, colour or mana value filter was used (AMENDED: subtype and keyword added). Cards with no library facts cannot match those filters. */
  filterCoverage?: { cardsWithoutFacts: number; cardsWithoutText?: number; note: string } // cardsWithoutText: NEW, role filter or role grouping only: library row but no rules text, so no role check possible // note e.g. "100 owned cards have no card facts yet, so type and colour filters cannot include them."
  /** Present when `location` matched nothing. Lists real place names so Claude can retry. */
  knownPlaces?: string[] // up to 50
  roleRulesVersion?: number // NEW: CLASSIFIER_VERSION used; present only when a role filter was used
}

/** get_collection_summary gains optional input. With no input the answer is exactly what it is today. */
export type SummaryGroupBy = 'type' | 'colour' | 'location' | 'kind' | 'role'

export interface CollectionSummaryInput {
  group_by?: SummaryGroupBy
  // The same filters as search, minus paging and rules text:
  query?: string
  types?: CardType[]
  colours?: Colour[]
  colour_match?: ColourMatch
  colourless?: boolean
  subtypes?: string[] // AMENDED, same meaning as search
  keywords?: string[] // AMENDED
  keywords_match?: 'all' | 'any' // AMENDED
  roles?: Role[] // NEW, same meaning as search
  roles_match?: 'any' | 'all' // NEW
  mana_value_min?: number
  mana_value_max?: number
  location?: string
  only_free?: boolean
  include_proxies?: boolean
  only_proxies?: boolean
}

export interface SummaryGroup {
  label: string // "Creature", "Green", "Black/Red", "Colourless", "Korvold (deck)", "Unsorted", "In your hand", "No facts", "Original", "Proxy", and for group_by role: "Ramp", "Draw", "Removal", "Wipes", "No role"
  copies: number
  distinctCards: number
}

export interface GroupedCollectionSummary {
  ok: true
  groupBy: SummaryGroupBy
  totalCopies: number // copies matching the filters
  distinctCards: number
  groups: SummaryGroup[] // largest first; at most 60. Cards without facts appear as one "No facts" group, never hidden.
  groupsTruncated: boolean
  note?: string // for group_by role: says role groups overlap (a card can have several roles) so they may add up to more than totalCopies
  roleRulesVersion?: number // when roles are used
}
