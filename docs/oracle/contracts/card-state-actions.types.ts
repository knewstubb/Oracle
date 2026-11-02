/**
 * Card State and Actions — shared contract types (T-28).
 *
 * Companion to docs/oracle/contracts/card-state-actions.md. Self-contained on
 * purpose (no imports). Architecture reference, NOT an implemented API.
 * Rules inherit [A] approved / [E] enforcement / [P] gated proposal from
 * the companion contract. A disagreement blocks handoff; neither silently wins.
 *
 * Id conventions (match generated DB types):
 *   deckId / deckCardId / copyId / locationId / folderId: number (integer PKs)
 *   oracleId (canonical card) and printingId (scryfall printing): string
 *   A printingId is NEVER an oracleId (D-003). Finish is independent (D-004).
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Owner label: Sleeved / Unsleeved (D-025). Generic basics are 'sleeved'. */
export type Placement = 'sleeved' | 'unsleeved'

/** Owner label: Original / Proxy (D-025). */
export type CopyType = 'original' | 'proxy'

export type Finish = 'nonfoil' | 'foil' | 'etched'

/** D-005/D-018 membership, resolved by a reviewed adapter, NOT a category heuristic. */
export type SlotRelation = 'required' | 'optional'

export type PlacementSource = 'manual' | 'ai' | 'import'

/** D-002. Unknown data is not a fourth owner-facing readiness state. */
export type ReadinessState = 'draft' | 'assembling' | 'playable'

export type Issue =
  | 'loading' | 'lookup_failed' | 'partial_data' | 'stale_data'
  | 'invalid_quantity' | 'multi_quantity_tracked_row'
  | 'identity_unresolved' | 'identity_ambiguous' | 'card_mismatch'
  | 'relation_unresolved' | 'assignment_unverified' | 'duplicate_assignment'
  | 'copy_excluded' | 'copy_facts_unknown' | 'commander_unverified'
  | 'format_has_no_size_rule' | 'unknown_format' | 'approval_required'

export interface Observation {
  /** Server-issued scope/revision token; a timestamp alone is not a precondition. */
  token: string
  observedAt: string
}

export type ReadState<T> =
  | { kind: 'known'; value: T; observation: Observation }
  | { kind: 'loading' | 'error' | 'partial' | 'stale'; issue: Issue; message: string }

export type IdentityResolution =
  | { kind: 'resolved'; oracleId: string; via: 'printing' | 'exact_reference_name' }
  | { kind: 'unresolved'; issue: 'identity_unresolved' | 'identity_ambiguous'; message: string }

export interface IdentityMapping {
  /** Canonical identity, never a printing ID. */
  oracleId: string
  /** Specific Scryfall printing, never an oracle ID. */
  printingId: string
  canonicalName: string
}

export interface PrintingRef {
  printingId: string
  setCode: string | null
  setName?: string | null
  collectorNumber?: string | null
}

// ---------------------------------------------------------------------------
// Locations — never invented (D-033)
// ---------------------------------------------------------------------------

export type CopyLocation =
  | {
      kind: 'deck'
      deckId: number
      deckName: string
      deckCardId: number
      relation: SlotRelation
    }
  | { kind: 'storage'; locationId: number; name: string }
  | {
      /** location_id points at a deck-type location but no slot holds the copy. */
      kind: 'recorded_deck_location'
      locationId: number
      name: string
      deckId: number | null
    }
  | { kind: 'not_recorded' }

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface SizeRule {
  rule: 'exact' | 'minimum' | null
  /** null when the format has no target (casual). */
  target: number | null
}

export interface ReadinessCounts {
  /** Σ cardCount over required rows (quantity-aware, generic basics included). */
  requiredCards: number
  /** Generic basics + one per required row holding a copy. */
  sleevedCards: number
  genericBasicCards: number
  commanderSelected: boolean
}

export type DeckReadiness =
  | (ReadinessCounts & { kind: 'known'; state: ReadinessState; sizeRule: SizeRule; observation: Observation })
  | { kind: 'unknown'; state: null; issue: Issue; message: string }

// ---------------------------------------------------------------------------
// Availability (Unsleeved, required, tracked slots only)
// ---------------------------------------------------------------------------

export type AvailabilityLabel =
  | 'available'
  | 'alt_available'
  | 'proxy_available'
  | 'unavailable'
  | 'unowned'

export type UnavailableReason =
  | 'held_by_other_deck'
  | 'held_in_this_deck'
  /** Interim D-028 wording gate G-D1; never display the word "Missing". */
  | 'excluded_pending_review'

export interface HolderDeck {
  deckId: number
  deckName: string
  deckCardId: number
  copyType: CopyType
  readiness: DeckReadiness
}

export type Availability =
  | { kind: 'available' | 'alt_available' | 'proxy_available' | 'unowned' }
  | { kind: 'unavailable'; reasons: UnavailableReason[]; holderDecks: HolderDeck[] }
  | { kind: 'error'; issue: Issue; message: string }

// ---------------------------------------------------------------------------
// Pick list
// ---------------------------------------------------------------------------

export interface SleeveActionDescriptor {
  action: 'sleeve'
  deckCardId: number
  copyId: number
  expectedSlotCopyId: null
  expectedCopyHolderDeckCardId: null
  observationToken: string
}

export interface MoveFromActionDescriptor {
  action: 'move_from'
  targetDeckCardId: number
  copyId: number
  expectedSourceDeckCardId: number
  expectedTargetCopyId: null
  observationToken: string
}

export interface ProxyActionDescriptor {
  action: 'proxy'
  deckCardId: number
  expectedSlotCopyId: null
  observationToken: string
  /** P/G-M3: descriptor exists only after proxy policy approval. */
  approvedProxyPolicyId: string
  printingId: string
  finish: Finish
}

export interface DonorImpact {
  deckId: number
  deckName: string
  readinessBefore: DeckReadiness
  readinessAfter: DeckReadiness
}

export type PicklistOptionKind = 'free_original' | 'free_proxy' | 'in_other_deck'

export interface CopyFacts {
  copyId: number
  oracleId: string
  copyType: CopyType
  printing: PrintingRef | null
  finish: Finish | null
  matchesRequestedPrinting: boolean
  location: CopyLocation
}

export type PicklistOption = CopyFacts & { finish: Finish; printing: PrintingRef } & (
  | { kind: 'free_original' | 'free_proxy'; action: SleeveActionDescriptor }
  | { kind: 'in_other_deck'; action: MoveFromActionDescriptor; donorImpact: DonorImpact }
)

export type ProxyOffer =
  | { kind: 'executable'; action: ProxyActionDescriptor }
  | { kind: 'gated'; gate: 'G-M3'; message: string }

export interface PicklistRowIdentity {
  deckCardId: number
  cardName: string
  oracleId: string | null
  requestedPrinting: PrintingRef | null
  isCommander: boolean
  primaryCategory: string | null
}

export type PicklistRow = PicklistRowIdentity & (
  | {
      kind: 'ready'
      oracleId: string
      outstandingCount: 1
      observation: Observation
      availability: Exclude<Availability, { kind: 'error' }>
      options: PicklistOption[]
      proxy: ProxyOffer
    }
  | {
      kind: 'blocked'
      outstandingCount: number | null
      availability: Extract<Availability, { kind: 'error' }>
      options: []
      proxy: null
    }
)

export interface PicklistProgress {
  requiredCards: number
  sleevedCards: number
  genericBasicCards: number
  outstandingCards: number
}

export type DataState = 'complete' | 'partial'

export interface PicklistResponse {
  ok: true
  deck: { id: number; name: string; format: string | null; readiness: DeckReadiness }
  progress: ReadState<PicklistProgress>
  rows: PicklistRow[]
  dataState: DataState
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Actions — requests
// ---------------------------------------------------------------------------

export interface OperationRequest {
  /** Required for every write. Reuse only for the exact same logical operation. */
  operationId: string
  observationToken: string
}

export interface SleeveRequest extends OperationRequest {
  action: 'sleeve'
  deckCardId: number
  copyId: number
  expectedSlotCopyId: null
  expectedCopyHolderDeckCardId: null
}

export interface MoveFromRequest extends OperationRequest {
  action: 'move_from'
  targetDeckCardId: number
  copyId: number
  expectedSourceDeckCardId: number
  expectedTargetCopyId: null
}

export interface MoveToRequest extends OperationRequest {
  action: 'move_to'
  sourceDeckCardId: number
  expectedCopyId: number
  targetDeckCardId: number
  expectedTargetCopyId: null
}

export interface ProxyRequest extends OperationRequest {
  action: 'proxy'
  deckCardId: number
  expectedSlotCopyId: null
  approvedProxyPolicyId: string
  printingId: string
  finish: Finish
}

export interface UnsleeveRequest extends OperationRequest {
  action: 'unsleeve'
  deckCardId: number
  expectedCopyId: number
}

export interface RemoveRequest extends OperationRequest {
  action: 'remove'
  deckCardId: number
  expectedCopyId: number | null
}

export interface MoveToMaybeboardRequest extends OperationRequest {
  action: 'move_to_maybeboard'
  deckCardId: number
  expectedCopyId: number | null
}

export interface MoveToMainListRequest extends OperationRequest {
  action: 'move_to_main_list'
  deckCardId: number
  newPrimaryCategory: string
}

export interface ChoosePrintingRequest extends OperationRequest {
  action: 'choose_printing'
  deckCardId: number
  printingId: string
  expectedSlotCopyId: null
}

export type Replacement =
  | { kind: 'copy'; copyId: number; expectedHolderDeckCardId: number | null }
  | { kind: 'new_proxy'; approvedProxyPolicyId: string; printingId: string; finish: Finish }

export interface ChangeCopyRequest extends OperationRequest {
  action: 'change_copy'
  deckCardId: number
  expectedCopyId: number
  replacement: Replacement
}

export interface BreakDownRequest extends OperationRequest {
  action: 'break_down'
  deckId: number
}

export interface FolderMoveRequest extends OperationRequest {
  action: 'folder_move'
  deckId: number
  folderId: number | null
}

export interface UndoRequest extends OperationRequest {
  action: 'undo'
  undoToken: string
}

export type CardActionRequest =
  | SleeveRequest
  | MoveFromRequest
  | MoveToRequest
  | ProxyRequest
  | UnsleeveRequest
  | RemoveRequest
  | MoveToMaybeboardRequest
  | MoveToMainListRequest
  | ChoosePrintingRequest
  | ChangeCopyRequest
  | BreakDownRequest
  | FolderMoveRequest
  | UndoRequest

export type CardActionName = CardActionRequest['action']

// ---------------------------------------------------------------------------
// Actions — responses
// ---------------------------------------------------------------------------

export interface SlotSnapshot {
  deckId: number
  deckCardId: number
  cardName: string
  relation: SlotRelation
  isGenericBasic: boolean
  placement: Placement
  copyId: number | null
  copyType: CopyType | null
  requestedPrinting: PrintingRef | null
}

export interface CopySnapshot {
  copyId: number
  oracleId: string
  copyType: CopyType
  printing: PrintingRef | null
  finish: Finish | null
  location: CopyLocation
}

export interface AffectedRefs {
  /** Always includes donor AND destination for cross-deck effects. */
  deckIds: number[]
  deckCardIds: number[]
  copyIds: number[]
  oracleIds: string[]
  cardNames: string[]
  /** True for every copy-changing action; refresh collection + shortages. */
  collection: boolean
}

export interface OperationReceipt {
  operationId: string
  committedAt: string
  action: CardActionName
  affected: AffectedRefs
  slots: SlotSnapshot[]
  copies: CopySnapshot[]
  /** Keyed by deckId (as string for JSON). */
  readiness: Record<string, DeckReadiness>
  createdCopyIds: number[]
  releasedCopyIds: number[]
  undoToken?: string
}

export interface ActionSuccess {
  ok: true
  outcome: 'applied' | 'replayed'
  /** Historical committed effects; replay does not claim these are current. */
  receipt: OperationReceipt
  /** Failed refresh does not turn a committed action into a failed action. */
  current: ReadState<{ slots: SlotSnapshot[]; copies: CopySnapshot[]; readiness: Record<string, DeckReadiness> }>
  /** Union of receipt refs and subsequently discovered holders, if any. */
  refresh: AffectedRefs
}

// ---------------------------------------------------------------------------
// Errors (D-030) — never a silent Unowned/Playable/empty success
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'not_found'
  | 'slot_already_filled'
  | 'copy_not_free'
  | 'source_changed'
  | 'slot_changed'
  | 'copy_excluded'
  | 'slot_not_unsleeved'
  | 'slot_not_required'
  | 'card_mismatch'
  | 'current_assignment_mismatch'
  | 'slot_claimed_elsewhere'
  | 'unavailable'
  | 'invalid_quantity'
  | 'unsupported_quantity'
  | 'identity_unresolved'
  | 'relation_unresolved'
  | 'stale_observation'
  | 'approval_required'
  | 'idempotency_key_reused'
  | 'operation_pending'
  | 'outcome_unknown'

export type RetryPolicy = 'none' | 'refresh_then_decide' | 'retry_same' | 'reconcile_operation'

export interface ErrorBody {
  ok: false
  error: {
    code: ErrorCode
    /** Owner-safe plain language; never the word "Missing". */
    message: string
    retry: RetryPolicy
    operationId?: string
    current?: { slot?: SlotSnapshot; copy?: CopySnapshot }
  }
}

export type ActionResponse = ActionSuccess | ErrorBody
export type PicklistResult = PicklistResponse | ErrorBody

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  not_found: 404,
  slot_already_filled: 409,
  copy_not_free: 409,
  source_changed: 409,
  slot_changed: 409,
  copy_excluded: 409,
  slot_not_unsleeved: 409,
  slot_not_required: 422,
  card_mismatch: 422,
  current_assignment_mismatch: 409,
  slot_claimed_elsewhere: 409,
  unavailable: 503,
  invalid_quantity: 422,
  unsupported_quantity: 422,
  identity_unresolved: 422,
  relation_unresolved: 422,
  stale_observation: 409,
  approval_required: 409,
  idempotency_key_reused: 409,
  operation_pending: 409,
  outcome_unknown: 503,
}

// ---------------------------------------------------------------------------
// Original shortages (D-027) — informational only
// ---------------------------------------------------------------------------

export interface ShortageDeckRow {
  deckId: number
  deckName: string
  folderName: string | null
  readiness: DeckReadiness
  requiredSlots: number
  sleevedOriginal: number
  sleevedProxy: number
  unsleeved: number
}

export interface ShortagePrintingDetail {
  printingId: string | null
  requestedSlots: number
  originalsOwned: number
}

export interface OriginalShortageRow {
  oracleId: string
  cardName: string
  requiredSlots: number
  slotsByState: { unsleeved: number; sleevedOriginal: number; sleevedProxy: number }
  originalsUsable: number
  originalsOwned: number
  /** P/Q1: shown separately, never silently treated as free scoped supply. */
  originalsHeldOutsideScope: number
  originalsFree: number
  originalsSleeved: number
  /** Proxies actually in required slots — spare proxies are NOT counted here. */
  proxiesSleeved: number
  proxiesSpare: number
  freeOriginalsThatCouldReplaceProxies: number
  /** max(0, requiredSlots − originalsUsable). Always > 0 for returned rows. */
  additionalOriginalsNeeded: number
  /** Excluded (legacy flagged) originals; for the G-D1 review only. */
  originalsPendingReview: number
  decks: ShortageDeckRow[]
  printingDetail?: ShortagePrintingDetail[]
}

export interface ShortageIssue {
  oracleId: string | null
  issue: Issue
  message: string
}

export type OriginalShortagesResponse = {
  ok: true
  rows: OriginalShortageRow[]
  generatedAt: string
  /** No global/default scope is approved. */
  scope: { kind: 'approved'; policyId: string; deckIds: number[] } | { kind: 'example'; deckIds: number[] }
} & (
  | { dataState: 'complete'; issues: [] }
  | { dataState: 'partial'; issues: [ShortageIssue, ...ShortageIssue[]] }
)

// ---------------------------------------------------------------------------
// Reference implementations of the pure rules (contract §2.4, §3.3, §5, §10)
// ---------------------------------------------------------------------------

export const BASIC_LAND_NAMES: readonly string[] = [
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest',
]

export interface SlotFacts {
  cardName: string
  requestedPrintingId: string | null
  copyId: number | null
  relation: SlotRelation | 'unresolved'
  quantity: number | null
  isCommander: boolean
  /** Result of owner, identity, exclusion and unique-holder verification. */
  assignmentVerified: boolean
}

export function isGenericBasicSlot(slot: SlotFacts): boolean {
  return (
    slot.relation === 'required' &&
    BASIC_LAND_NAMES.includes(slot.cardName) &&
    slot.requestedPrintingId === null &&
    slot.copyId === null
  )
}

export function validQuantity(quantity: number | null): quantity is number {
  return quantity !== null && Number.isSafeInteger(quantity) && quantity > 0
}

export function computeReadiness(
  input: ReadState<SlotFacts[]>,
  format: string | null,
): DeckReadiness {
  const unknown = (issue: Issue, message: string): DeckReadiness => ({ kind: 'unknown', state: null, issue, message })
  if (input.kind !== 'known') return unknown(input.issue, input.message)
  if (format === 'casual') return unknown('format_has_no_size_rule', 'Casual readiness needs an approved rule.')
  const minimums: Record<string, number> = { standard: 60, modern: 60, legacy: 60, vintage: 60, pioneer: 60, pauper: 60, cube: 360 }
  if (format !== 'commander' && (format === null || !Object.hasOwn(minimums, format))) {
    return unknown('unknown_format', 'The deck format must be verified.')
  }
  const sizeRule: SizeRule = format === 'commander'
    ? { rule: 'exact', target: 100 }
    : { rule: 'minimum', target: minimums[format] }
  const slots = input.value
  if (slots.some(s => s.relation === 'unresolved')) return unknown('relation_unresolved', 'Main-list membership is not verified.')
  if (slots.some(s => !validQuantity(s.quantity))) return unknown('invalid_quantity', 'A card quantity needs correction.')
  if (slots.some(s => s.relation === 'optional' && s.copyId !== null)) return unknown('assignment_unverified', 'An optional row still holds a copy.')
  const required = slots.filter((s) => s.relation === 'required')
  const copies = required.flatMap(s => s.copyId === null ? [] : [s.copyId])
  if (new Set(copies).size !== copies.length) return unknown('duplicate_assignment', 'A copy has more than one holder.')
  if (required.some(s => !isGenericBasicSlot(s) && s.quantity !== 1)) {
    return unknown('multi_quantity_tracked_row', 'A tracked row represents more than one card; review it before assembly.')
  }
  if (required.some(s => s.copyId !== null && !s.assignmentVerified)) {
    return unknown('assignment_unverified', 'Assigned copy eligibility is not verified.')
  }
  let requiredCards = 0
  let sleevedCards = 0
  let genericBasicCards = 0
  for (const s of required) {
    const n = s.quantity
    if (!validQuantity(n)) return unknown('invalid_quantity', 'A card quantity needs correction.')
    requiredCards += n
    if (isGenericBasicSlot(s)) {
      genericBasicCards += n
      sleevedCards += n
    } else if (s.copyId !== null) {
      sleevedCards += 1
    }
  }
  if (!Number.isSafeInteger(requiredCards)) return unknown('invalid_quantity', 'The total card quantity is outside the supported range.')
  const commanderSelected = required.some((s) => s.isCommander)
  const base = { requiredCards, sleevedCards, genericBasicCards, sizeRule, commanderSelected }
  const target = sizeRule.target
  if (target === null) return unknown('unknown_format', 'The size rule is unavailable.')
  const sizeOk =
    sizeRule.rule === 'exact' ? requiredCards === target : requiredCards >= target
  const complete = sizeOk && (format !== 'commander' || commanderSelected)
  const state: ReadinessState = !complete
    ? 'draft'
    : sleevedCards < requiredCards
      ? 'assembling'
      : 'playable'
  return { ...base, kind: 'known', state, observation: input.observation }
}

export interface CandidateFacts {
  copyId: number
  oracleId: string
  copyType: CopyType
  printingId: string | null
  finish: Finish | null
  holder: { deckId: number; deckCardId: number } | null
  excluded: boolean
}

/** E: consumes a complete, owner-scoped, identity-verified supply read. */
export function headlineAvailability(
  identity: IdentityResolution,
  requestedPrintingId: string | null,
  input: ReadState<CandidateFacts[]>,
): ReadState<AvailabilityLabel> {
  if (input.kind !== 'known') return input
  if (identity.kind !== 'resolved') return { kind: 'error', issue: identity.issue, message: identity.message }
  const candidates = input.value
  if (candidates.some(c => c.oracleId !== identity.oracleId)) {
    return { kind: 'error', issue: 'card_mismatch', message: 'Supply identity does not match the requested card.' }
  }
  if (new Set(candidates.map(c => c.copyId)).size !== candidates.length) {
    return { kind: 'error', issue: 'duplicate_assignment', message: 'Supply contains duplicate copy records.' }
  }
  const result = (value: AvailabilityLabel): ReadState<AvailabilityLabel> => ({ kind: 'known', value, observation: input.observation })
  const usable = candidates.filter((c) => !c.excluded)
  if (usable.some(c => c.printingId === null || c.finish === null)) {
    return { kind: 'error', issue: 'copy_facts_unknown', message: 'Essential copy printing or finish is not verified.' }
  }
  const free = usable.filter((c) => c.holder === null)
  const freeOriginals = free.filter((c) => c.copyType === 'original')
  if (freeOriginals.some((c) => requestedPrintingId === null || c.printingId === requestedPrintingId)) {
    return result('available')
  }
  if (freeOriginals.length > 0) return result('alt_available')
  if (free.some((c) => c.copyType === 'proxy')) return result('proxy_available')
  if (candidates.length > 0) return result('unavailable')
  return result('unowned')
}

export function additionalOriginalsNeeded(input: ReadState<{ requiredSlots: number; originalsUsable: number }>): ReadState<number> {
  if (input.kind !== 'known') return input
  const { requiredSlots, originalsUsable } = input.value
  if (![requiredSlots, originalsUsable].every(n => Number.isSafeInteger(n) && n >= 0)) {
    return { kind: 'error', issue: 'invalid_quantity', message: 'Shortage counts are invalid.' }
  }
  return { kind: 'known', value: Math.max(0, requiredSlots - originalsUsable), observation: input.observation }
}

/** E: no fuzzy/front-face fallback; lookup errors and absent mappings stay distinct. */
export function resolveIdentity(
  request: { kind: 'printing'; printingId: string } | { kind: 'exact_name'; name: string },
  lookup: ReadState<IdentityMapping[]>,
): IdentityResolution {
  if (lookup.kind !== 'known') return { kind: 'unresolved', issue: 'identity_unresolved', message: lookup.message }
  const rows = lookup.value.filter(row => request.kind === 'printing'
    ? row.printingId === request.printingId
    : row.canonicalName === request.name)
  if (rows.some(row => row.oracleId.length === 0)) {
    return { kind: 'unresolved', issue: 'identity_unresolved', message: 'Reference identity is incomplete.' }
  }
  const ids = [...new Set(rows.map(row => row.oracleId).filter(id => id.length > 0))]
  if (ids.length !== 1) return {
    kind: 'unresolved',
    issue: ids.length > 1 ? 'identity_ambiguous' : 'identity_unresolved',
    message: 'Resolve this card to one canonical identity before moving a copy.',
  }
  return { kind: 'resolved', oracleId: ids[0], via: request.kind === 'printing' ? 'printing' : 'exact_reference_name' }
}

/** E: pure eligibility example, not an endpoint or transaction implementation. */
export function assemblyEligibility(
  slot: ReadState<SlotFacts>,
  identity: IdentityResolution,
  supply: ReadState<CandidateFacts[]>,
): { kind: 'eligible' } | { kind: 'blocked'; issue: Issue } {
  if (slot.kind !== 'known') return { kind: 'blocked', issue: slot.issue }
  if (supply.kind !== 'known') return { kind: 'blocked', issue: supply.issue }
  if (slot.observation.token !== supply.observation.token) return { kind: 'blocked', issue: 'stale_data' }
  if (identity.kind !== 'resolved') return { kind: 'blocked', issue: identity.issue }
  if (!validQuantity(slot.value.quantity)) return { kind: 'blocked', issue: 'invalid_quantity' }
  if (slot.value.relation === 'unresolved') return { kind: 'blocked', issue: 'relation_unresolved' }
  if (slot.value.relation !== 'required' || isGenericBasicSlot(slot.value) || slot.value.copyId !== null) {
    return { kind: 'blocked', issue: 'assignment_unverified' }
  }
  if (slot.value.quantity !== 1) return { kind: 'blocked', issue: 'multi_quantity_tracked_row' }
  const headline = headlineAvailability(identity, slot.value.requestedPrintingId, supply)
  if (headline.kind !== 'known') return { kind: 'blocked', issue: headline.issue }
  return { kind: 'eligible' }
}

export type ReplayRecord =
  | { kind: 'committed'; fingerprint: string; receipt: OperationReceipt }
  | { kind: 'pending'; fingerprint: string }
  | { kind: 'absent'; neverAccepted: true }
  | { kind: 'unknown' }

/** E: operation records are looked up by authenticated user + operationId. */
export function classifyRetry(record: ReplayRecord, fingerprint: string):
  | 'check_preconditions' | 'replay_receipt' | 'idempotency_key_reused' | 'operation_pending' | 'outcome_unknown' {
  if (record.kind === 'unknown') return 'outcome_unknown'
  if (record.kind === 'absent') return 'check_preconditions'
  if (record.fingerprint !== fingerprint) return 'idempotency_key_reused'
  return record.kind === 'committed' ? 'replay_receipt' : 'operation_pending'
}

/** E: after assemblyEligibility and owner/identity validation, under transaction locks. */
export function placementConflict(
  request: SleeveRequest | MoveFromRequest | ProxyRequest,
  current: {
    observationToken: string
    targetDeckId: number
    targetCopyId: number | null
    selectedCopy: CandidateFacts | null
    proxyPolicyApproved: boolean
  },
): ErrorCode | null {
  if (request.observationToken !== current.observationToken) return 'stale_observation'
  if (current.targetCopyId !== null) return 'slot_already_filled'
  if (request.action === 'proxy') return current.proxyPolicyApproved ? null : 'approval_required'
  const copy = current.selectedCopy
  if (copy === null || copy.copyId !== request.copyId) return 'not_found'
  if (copy.excluded) return 'copy_excluded'
  if (request.action === 'sleeve') return copy.holder === null ? null : 'copy_not_free'
  if (copy.holder?.deckId === current.targetDeckId) return 'source_changed'
  return copy.holder?.deckCardId === request.expectedSourceDeckCardId ? null : 'source_changed'
}

export function refreshKeys(affected: AffectedRefs): readonly (readonly (string | number)[])[] {
  const keys: (readonly (string | number)[])[] = [['decks']]
  for (const id of new Set(affected.deckIds)) {
    keys.push(['decks', id], ['decks', id, 'card-statuses'], ['decks', id, 'health'],
      ['picklist', id], ['allocation', id])
    for (const name of new Set(affected.cardNames)) keys.push(['card-actions', id, name])
  }
  if (affected.collection) keys.push(['collection'], ['original-shortages'])
  return keys
}

/** E: T-15 consumes facts only; no action descriptor, write token or shortage policy. */
export interface AdvisorAvailabilityRequest {
  oracleId: string
  requestedPrintingId: string | null
  deckId: number | null
}

export interface AdvisorAvailabilityFacts {
  oracleId: string
  requestedPrintingId: string | null
  availability: Exclude<Availability, { kind: 'error' }>
  originalsOwned: number
  proxiesOwned: number
  copies: CopyFacts[]
  excludedCopyCount: number
}

export type AdvisorAvailability = ReadState<AdvisorAvailabilityFacts>
