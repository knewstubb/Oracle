// Contract types: card roles, deck jobs, strategy points, deck health (CC-26). Matches card-roles-and-deck-jobs.md.
// DRAFT. Not imported by any code yet. Database objects: supabase/drafts/20261118120000..120300_roles_db1..db4_*.draft.sql (NOT APPLIED).
// Identifier rule (D-003): every `oracle_id` here is a card (oracle id, a uuid string). No scryfall_id (printing) appears except
// where named `printing_id`/`scryfall_id`.

// ---------------------------------------------------------------------------------------------------------------
// Shared constants (a test asserts these equal the SQL CHECK lists and _ai_limits_roles())
// ---------------------------------------------------------------------------------------------------------------
export const ROLE_SLUGS = [
  'ramp', 'fixing', 'card_draw', 'card_selection', 'tutor', 'targeted_removal', 'board_wipe',
  'counterspell', 'protection', 'recursion', 'graveyard_hate', 'stax_tax', 'hand_disruption',
] as const;
export type RoleSlug = (typeof ROLE_SLUGS)[number];

export const STARTING_JOBS = ['Engine', 'Enabler', 'Payoff', 'Win condition', 'Combo piece', 'Commander support', 'Flex'] as const;

export const HEALTH_GROUPS = ['lands', 'ramp', 'card_advantage', 'interaction'] as const;
export type HealthGroup = (typeof HEALTH_GROUPS)[number];
/** The groups a strategy point effect may name (lands are never moved). */
export type EffectGroup = Exclude<HealthGroup, 'lands'>;

/** Which group a role feeds. Roles not listed feed no group (shown in the card window only). */
export const ROLE_TO_GROUP: Partial<Record<RoleSlug, EffectGroup>> = {
  ramp: 'ramp',
  card_draw: 'card_advantage',
  targeted_removal: 'interaction',
  board_wipe: 'interaction',
  counterspell: 'interaction',
  hand_disruption: 'interaction',
};
/** Jobs (matched case-insensitively) that feed the Plan line. */
export const PLAN_JOBS = ['Engine', 'Enabler', 'Payoff', 'Combo piece'] as const;
export const WIN_JOB = 'Win condition' as const;

/** Common guide (unchanged; source check still open). */
export const COMMON_GUIDE: Record<HealthGroup, number> = { lands: 36, ramp: 10, card_advantage: 10, interaction: 10 };

export const CARD_TYPES = ['artifact', 'creature', 'enchantment', 'instant', 'sorcery', 'land', 'planeswalker', 'battle'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** Keep equal to SQL _ai_limits_roles(). The request limits (120 direct, 200 max, 7 day undo) stay in AI_LIMITS (edit-config.ts). */
export const AI_LIMITS_ROLES = {
  job_name_max_chars: 40,
  reason_max_chars: 200,
  statement_max_chars: 200,
  strategy_points_per_deck_max: 30,
  strategy_points_per_request_max: 10,
  point_cards_max: 100,
  roles_per_card_max: 13,
  labels_page_max: 150,
} as const;

export type Proposer = 'owner' | 'claude';
export type RowState = 'accepted' | 'to_look_at' | 'dismissed';
/** Who a value shows as coming from. `standard` = the shared baseline. */
export type ValueFrom = 'standard' | 'you' | 'claude';

// ---------------------------------------------------------------------------------------------------------------
// Table rows
// ---------------------------------------------------------------------------------------------------------------
/** ref_card_roles (shared, no user). */
export type RefCardRoleRow = {
  oracle_id: string; role: RoleSlug; proposer: 'system' | 'claude'; basis: string | null; created_at: string; updated_at: string;
};
/** user_card_roles (personal). Unique (user_id, oracle_id, role, proposer). */
export type UserCardRoleRow = {
  id: number; user_id: string; oracle_id: string; role: RoleSlug; effect: 'add' | 'remove'; proposer: Proposer; state: RowState;
  proposed_in_deck_id: number | null; batch_id: string | null; created_at: string; updated_at: string;
};
/** deck_card_jobs. Unique (user_id, deck_id, oracle_id, proposer). job NULL only on an owner row ("no job, on purpose"). */
export type DeckCardJobRow = {
  id: number; user_id: string; deck_id: number; oracle_id: string; card_name: string; job: string | null; reason: string | null;
  proposer: Proposer; state: RowState; batch_id: string | null; created_at: string; updated_at: string;
};
/** deck_strategy_points. Unique (user_id, deck_id, lower(btrim(statement))). */
export type DeckStrategyPointRow = {
  id: number; user_id: string; deck_id: number; statement: string;
  covers_kind: 'card_type' | 'cards'; card_type: CardType | null; covers_oracle_ids: string[] | null;
  effect_kind: 'counts_as' | 'does_not_count_as' | null; effect_group: EffectGroup | null;
  reason: string | null; proposer: Proposer; state: RowState; batch_id: string | null; created_at: string; updated_at: string;
};

// ---------------------------------------------------------------------------------------------------------------
// Database functions (service role only; every one takes p_user_id first)
// ---------------------------------------------------------------------------------------------------------------
export type SlotOracleId = { slot_id: number; oracle_id: string | null; resolved_by: 'printing' | 'name' | null };
export type EffectiveCardRole = {
  oracle_id: string; role: RoleSlug; in_baseline: boolean; baseline_proposer: 'system' | 'claude' | null;
  owner_effect: 'add' | 'remove' | null; claude_effect: 'add' | 'remove' | null; claude_state: 'to_look_at' | 'dismissed' | null;
  effective: boolean; effective_from: 'owner' | 'claude' | 'baseline' | null; beside: boolean;
};
export type EffectiveCardJob = {
  oracle_id: string; card_name: string; owner_job: string | null; owner_reason: string | null; owner_set: boolean;
  claude_job: string | null; claude_reason: string | null; claude_state: 'to_look_at' | 'dismissed' | null;
  effective_job: string | null; effective_reason: string | null; effective_from: 'owner' | 'claude' | null; beside: boolean; batch_id: string | null;
};
/** Returned by every owner_* function so the route can offer the 10-second Undo by replaying `previous`. */
export type OwnerWriteResult<P = Record<string, unknown>> = { previous: P; current: P };
export type OwnerAcceptResult = { accepted: number };
export type OwnerDecision = 'accept' | 'dismiss';
export type OwnerRoleAction = 'add' | 'remove' | 'clear';
export type OwnerJobAction = 'set' | 'clear_job' | 'clear';

// ---------------------------------------------------------------------------------------------------------------
// Change kinds (DB-2). Both added to ai_change_log.kind and ai_pending_changes.action.
// ---------------------------------------------------------------------------------------------------------------
export type LabelChangeAction = 'card_label' | 'strategy_point';
export type LabelResult = 'proposed' | 'beside_yours';
export type SkipWhy = 'unchanged' | 'previously_dismissed' | 'already_exists';

/** Payload sent to ai_submit_change for action 'card_label' (the tool maps slot_id -> id like set_card_category). */
export type CardLabelPayload = {
  deck_id: number;
  cards: Array<{
    id: number; card_name: string; add_roles?: RoleSlug[]; remove_roles?: RoleSlug[];
    job?: { name: string; reason?: string };
  }>;
};
export type StrategyPointPayload = {
  deck_id: number;
  points: Array<{
    statement: string; covers: { card_type: CardType } | { cards: Array<{ id: number; card_name: string }> };
    effect?: { kind: 'counts_as' | 'does_not_count_as'; group: EffectGroup }; reason?: string;
  }>;
};
/** ai_change_log.before / after for kind card_label (one row per card). */
export type CardLabelLogBefore = {
  roles: Array<{ role: RoleSlug; row: null | { effect: 'add' | 'remove'; state: RowState; batch_id: string | null; proposed_in_deck_id: number | null } }>;
  job: null | { row: null | { job: string; reason: string | null; state: RowState; batch_id: string | null } };
};
export type CardLabelLogAfter = {
  roles: Array<{ role: RoleSlug; effect: 'add' | 'remove'; state: 'to_look_at'; result: LabelResult }>;
  job: null | { job: string; reason: string | null; state: 'to_look_at'; result: LabelResult };
  beside: Array<{ what: 'role'; role: RoleSlug } | { what: 'job' }>;
};
/** Extra field on every ai_list_recent_changes row of the two new kinds. */
export type LabelDetail =
  | { roles: Array<{ role: RoleSlug; effect: 'add' | 'remove' }>; job: string | null; beside: boolean }
  | { statement: string; covers_kind: 'card_type' | 'cards'; card_type: CardType | null; effect_kind: string | null; effect_group: EffectGroup | null };

export type UndoLabelResult =
  | { success: true; undone: number; left_alone?: Array<{ card: string; deck: string | null; what: string }> }
  | { success: false; refused: { code: LabelUndoRefusalCode; card?: string; deck?: string | null; on?: string | null; what?: string }; left_alone?: Array<{ card: string; deck: string | null; what: string }> };
export type LabelUndoRefusalCode =
  | 'already_undone' | 'window_closed' | 'deck_gone' | 'slot_gone' | 'changed_since' | 'nothing_to_undo' | 'owner_only' | 'connection_revoked' | 'invalid_actor';

/** Database refusal codes (the error text) for the new kinds and owner functions. */
export type LabelErrorCode =
  | 'connection_revoked' | 'deck_not_found' | 'slot_not_found' | 'duplicate_slot' | 'duplicate_card' | 'card_not_identified'
  | 'unknown_role' | 'conflicting_roles' | 'bad_job_name' | 'reason_too_long' | 'slot_in_maybeboard' | 'nothing_to_change'
  | 'too_many_cards' | 'invalid_request' | 'jobs_not_available' | 'strategy_points_not_available'
  | 'bad_statement' | 'bad_covers' | 'unknown_card_type' | 'bad_effect' | 'too_many_points_in_request' | 'too_many_strategy_points'
  | 'too_many_waiting' | 'unknown_card' | 'bad_action' | 'no_proposal' | 'point_not_found'
  | 'bad_decision' | 'card_not_in_deck' | 'point_exists' | 'change_not_found' | 'invalid_actor';

// ---------------------------------------------------------------------------------------------------------------
// Claude's tools
// ---------------------------------------------------------------------------------------------------------------
export type GetCardLabelsInput = { deck_id: number; only?: 'all' | 'unlabelled' | 'to_look_at'; after_slot_id?: number; limit?: number /* 1..150 */ };
export type CardLabelsView = {
  slot_id: number; name: string; oracle_id: string | null; quantity: number; categories: string[]; in_main_deck: boolean; no_card_data: boolean;
  roles: Array<{ role: RoleSlug; effective: boolean; from: ValueFrom; state?: 'to_look_at' | 'dismissed'; beside?: { from: 'claude'; effect: 'add' | 'remove' } }>;
  text_roles: RoleSlug[];
  job: null | { name: string; reason: string | null; from: 'you' | 'claude'; state?: RowState; beside?: { name: string; reason: string | null } };
  legacy_hint: RoleSlug | null;
};
export type GetCardLabelsResult = {
  deck: { id: number; name: string }; cards: CardLabelsView[]; next_after_slot_id: number | null;
  counts: { cards: number; with_roles: number; with_jobs: number | 'not_available_yet'; to_look_at: number }; truncated?: string;
};
export type GetStrategyPointsInput = { deck_id: number };
export type StrategyPointView = {
  id: number; statement: string;
  covers: { kind: 'card_type'; card_type: CardType } | { kind: 'cards'; cards: Array<{ name: string; oracle_id: string }> };
  covers_count: number; effect: null | { kind: 'counts_as' | 'does_not_count_as'; group: EffectGroup };
  reason: string | null; from: 'you' | 'claude'; state: RowState;
};
export type GetStrategyPointsResult = { deck: { id: number; name: string }; points: StrategyPointView[]; limit: 30 };

export type ProposeCardLabelsInput = {
  deck_id: number; dry_run?: boolean;
  cards: Array<{ slot_id: number; name: string; add_roles?: RoleSlug[]; remove_roles?: RoleSlug[]; job?: { name: string; reason?: string } }>; // 1..200; each card needs one of the three
};
export type ProposeStrategyPointsInput = {
  deck_id: number; dry_run?: boolean;
  points: Array<{
    statement: string; covers: { card_type: CardType } | { cards: Array<{ slot_id: number; name: string }> };
    effect?: { kind: 'counts_as' | 'does_not_count_as'; group: EffectGroup }; reason?: string;
  }>; // 1..10
};
export type ProposeResult =
  | { success: true; outcome: 'applied'; group_id: string; count: number; plan: ProposePlan }
  | { success: true; outcome: 'pending'; pending_id: string; expires_at: string; reason: 'over_ten' | 'recent_total' | 'busy'; plan: ProposePlan }
  | { success: true; outcome: 'would_apply' | 'would_wait'; reason?: string; plan: ProposePlan };
export type ProposePlan = {
  n: number;
  changes: Array<{
    slot_id?: number; card_name?: string; oracle_id?: string | null; statement?: string; covers_count?: number;
    roles?: Array<{ role: RoleSlug; effect: 'add' | 'remove'; result: LabelResult }>;
    job?: null | { name: string; reason: string | null; result: LabelResult };
    effect?: null | { kind: 'counts_as' | 'does_not_count_as'; group: EffectGroup }; result?: LabelResult;
  }>;
  skipped: Array<{ slot_id?: number; card_name?: string; statement?: string; what: string; why: SkipWhy }>;
};

// ---------------------------------------------------------------------------------------------------------------
// App routes (owner side). All return 404 {error:'Deck not found'} for a deck that is not the signed-in user's.
// ---------------------------------------------------------------------------------------------------------------
export type CardWindowLabels = {
  slot_id: number; deck_id: number; oracle_id: string | null; name: string; categories: string[]; no_card_data: boolean;
  roles: CardLabelsView['roles']; text_roles: RoleSlug[];
  job: CardLabelsView['job']; job_names: string[];
  strategy_points: Array<{ id: number; statement: string; effect: StrategyPointView['effect']; from: 'you' | 'claude'; state: RowState }>;
  counts_as: Array<{ group: EffectGroup | 'lands'; because: 'role' | 'strategy_point' | 'card_text' | 'land'; point_id?: number; role?: RoleSlug }>;
};
export type PutRoleBody = { role: RoleSlug; action: OwnerRoleAction };
export type DecideBody = { decision: OwnerDecision; role?: RoleSlug };
export type PutJobBody = { action: OwnerJobAction; job?: string; reason?: string };
export type AcceptProposalsBody = { scope: 'all' } | { scope: 'batch'; group_id: string };
export type ProposalsBar = {
  to_look_at: { roles: number; jobs: number; strategy_points: number };
  batches: Array<{ group_id: string; created_at: string; cards: number; undoable_until: string; undo_blocker: unknown | null }>;
};

// ---------------------------------------------------------------------------------------------------------------
// Deck health (computed on read, never stored). Replaces the four-role response when slice 7 ships.
// ---------------------------------------------------------------------------------------------------------------
// D-060: 'owner' (your override) and 'claude_strategy' (Claude's number from the deck's strategy) sit above the fallback order.
export type TargetSource = 'owner' | 'claude_strategy' | 'build' | 'all_builds_average' | 'edhrec_estimate' | 'common_guide';
/** Proposed storage row for DB-5 (not drafted). A group with set_by 'owner' is never written by Claude. */
export type DeckHealthTargetRow = {
  deck_id: number; user_id: string; group: HealthGroup; target: number;
  reason: string | null;            // required when set_by = 'claude'
  set_by: 'claude' | 'owner'; previous: number | null; batch_id: string | null; updated_at: string;
};
export type CountReason = { card: string; oracle_id: string | null; quantity: number; tag: 'role' | 'strategy_point' | 'job' | 'card_text' | 'proposed'; role?: RoleSlug; point_id?: number };
export type HealthGroupResult = {
  group: HealthGroup; label: string; have: number; target: number; target_source: TargetSource; target_source_label: string; light: boolean;
  target_reason: string | null;                      // Claude's short reason, shown next to the number (D-060)
  target_set_by: 'claude' | 'owner' | null;           // null for the fallback sources
  target_undoable: boolean;                           // true when Claude set it and a previous value exists
  claude_would_set: number | null;                    // set when an owner override stops Claude from updating
  from_roles: number; from_card_text: number; adjusted_by_points: number; proposed_by_claude: number; cards: CountReason[];
};
export type DeckHealthV2 =
  | { ok: false; error: 'could_not_check'; message: string }
  | {
      ok: true; check_state: 'full' | 'partial' | 'partial_inputs'; unclassified_count: number;
      groups: HealthGroupResult[];
      plan: null | { plan_cards: number; win_conditions: number }; // null until at least one job is set
      not_counted_roles: RoleSlug[];                              // fixing, card_selection, tutor, protection, recursion, graveyard_hate, stax_tax
      source_line: string; computed_at: string;
    };
/** Everything the health function reads (section 7.3), in the order it reads it. */
export type DeckHealthInputs = {
  deck: { id: number; user_id: string; commander_name: string | null; commander_id: string | null; build_id: string | null };
  deck_cards: Array<{ id: number; card_name: string; scryfall_id: string | null; quantity: number | null; categories: string | null; is_commander: boolean | null; command_zone_role: string | null }>;
  slot_oracle_ids: SlotOracleId[];
  ref_text_by_name: Record<string, { type_line: string | null; oracle_text: string | null }>;
  effective_roles: EffectiveCardRole[];
  effective_jobs: EffectiveCardJob[] | null;            // null before DB-3 exists
  strategy_points: DeckStrategyPointRow[] | null;       // null before DB-4 exists
  build: null | { archetype: string | null; avg_lands: number | null; avg_ramp: number | null; avg_draw: number | null; avg_removal: number | null; avg_wipes: number | null };
  all_builds_targets: unknown;                          // CommanderTargets from commander-targets-server.ts, unchanged
};
