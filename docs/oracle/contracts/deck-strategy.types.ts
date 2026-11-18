// Types for docs/oracle/contracts/deck-strategy.md (CC-26, DB-6). Draft: nothing here is built or applied.
// Identifier rule: cards are identified by oracle_id (the card), never by scryfall_id (a printing). Items cover no cards.

export const STRATEGY_ITEM_KINDS = ['aim', 'commander_enables', 'win_condition', 'reference_commander'] as const
export type StrategyItemKind = (typeof STRATEGY_ITEM_KINDS)[number]

/** Kept equal to _ai_limits_strategy() in the database by a test. */
export const AI_LIMITS_STRATEGY = {
  item_statement_max_chars: 300,
  reason_max_chars: 200,
  items_per_request_max: 7,
  items_per_deck_max: 7,
  aim_max: 1,
  commander_enables_max: 3,
  win_condition_max: 3,
  reference_commander_max: 1,
  based_on_max: 5,
  links_per_request_max: 200,
} as const

export type Proposer = 'owner' | 'claude'
export type RowState = 'accepted' | 'to_look_at' | 'dismissed'

export interface StrategyItemView {
  id: number
  kind: StrategyItemKind
  statement: string
  reason: string | null
  from: 'you' | 'claude'
  state: 'accepted' | 'to_look_at'
  /** true exactly when from === 'you'. Claude must say "assuming ... (not yet confirmed by you)" while false. */
  confirmed: boolean
  /** Evidence cards for a Claude proposal (oracle ids). Cover nothing, change no count. */
  based_on: { name: string; oracle_id: string }[]
  replaces_id: number | null
  updated_at: string
}

export interface ProposeStrategyItemsInput {
  deck_id: number
  items: {
    kind: StrategyItemKind
    statement: string
    reason?: string
    based_on?: { slot_id: number; name: string }[]
    replaces_id?: number
  }[]
  dry_run?: boolean
}
export type ItemResult = 'proposed' | 'rewrote_own' | 'beside_yours'
export type ItemSkipWhy = 'already_exists' | 'previously_dismissed' | 'kind_full' | 'deck_items_full'

export interface ProposeJobLinksInput {
  deck_id: number
  links: { slot_id: number; name: string; serves: { item_id: number } | { point_id: number } }[]
  dry_run?: boolean
}
export type LinkSkipWhy = 'unchanged' | 'previously_dismissed' | 'no_job'

export type HealthGroup = 'lands' | 'ramp' | 'card_advantage' | 'interaction'

export interface DeckBriefInput {
  deck_id: number
  after_slot_id?: number
  limit?: number
  include_maybeboard?: boolean
  include_rules_text?: boolean
}

type Section<T> = ({ status: 'ok' } & T) | { status: 'not_available_yet' } | { status: 'could_not_check' }

/** Key order is the contract: deck, strategy, targets, cards, waiting. Only the first page carries deck, strategy, targets, waiting. */
export interface DeckBrief {
  deck?: {
    id: number
    name: string
    format: string
    status: string
    bracket: 1 | 2 | 3 | 4 | null
    card_count: number
    main_count: number
    commander: { name: string; oracle_id: string | null; type_line: string; colours: string[]; rules_text: string | null } | null
    build: { id: string; archetype: string } | null
  }
  strategy?: {
    /** Required. Non-empty when bracket is null: Claude asks the owner and does not assume. */
    ask_owner: 'bracket'[]
    intent: { playgroup: string | null; frustrations: string | null; budget: { mode: string | null; ceiling: number | null }; format_rules: string | null; legacy_win_condition: string | null }
    notes: { text: string | null; length: number; max: 4000; updated_at: string | null }
    earlier_notes: { date: string; text: string; cut: boolean }[]
    items: Record<StrategyItemKind, StrategyItemView[]> | { status: 'not_available_yet' }
    limits: { aim: 1; commander_enables: 3; win_condition: 3; reference_commander: 1; total: 7; points: 30 }
    missing: ('aim' | 'commander_enables' | 'win_condition')[]
    dismissed: { kind: StrategyItemKind | 'point'; statement: string }[]
    points: { id: number; statement: string; covers: { kind: 'card_type'; card_type: string } | { kind: 'cards'; count: number }; covers_count: number; effect: { kind: string; group: string } | null; reason: string | null; from: 'you' | 'claude'; state: RowState; updated_at: string }[]
  }
  targets?: Section<{
    groups: { group: HealthGroup; target: number; source: string; reason: string | null; set_by: 'claude' | 'owner' | null; have: number | null; light: boolean | null }[]
    claude_set_at: string | null
    strategy_changed_at: string | null
    stale: boolean
  }>
  cards: {
    slot_id: number
    name: string
    oracle_id: string | null
    /** The slot's scryfall_id. Display only; never written anywhere. */
    printing_id: string | null
    quantity: number
    in_main_deck: boolean
    type_line: string | null
    /** One category per card. */
    category: string | null
    roles: { role: string; from: 'standard' | 'you' | 'claude'; state?: RowState; beside?: boolean }[] | null
    job: { name: string; reason: string | null; from: 'you' | 'claude'; state?: RowState; beside?: boolean; serves: { kind: 'item' | 'point'; id: number; statement: string; from: 'you' | 'claude'; state: RowState } | null } | null
    covered_by: { point_id: number; statement: string }[]
    counts_toward: HealthGroup[] | null
    no_card_data: boolean
  }[]
  next_after_slot_id: number | null
  waiting?: {
    /** Computed on read, never stored. A question for the owner, not a cut list. */
    serving_nothing: { count: number; cards: { slot_id: number; name: string }[] }
    roles: number
    jobs: number
    items: number
    points: number
    links: number
    replacements: number
    recent_batches: { group_id: string; kind: string; count: number; at: string; undoable_until: string; can_undo: boolean }[]
  }
  truncated?: string
}

export interface StalenessView {
  claude_set_at: string | null
  strategy_changed_at: string | null
  stale: boolean
}
