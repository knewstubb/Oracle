/**
 * T-36 architecture reference, revising T-15 for D-034/D-035/D-036 and T-28
 * reconciliation. Not installed application code.
 *
 * Imports the T-28 read-only card-state contract so the advisor availability
 * boundary is shared, not duplicated. The T-28 types file must be present at
 * `./card-state-actions.types.ts` for strict type-checking; runtime examples use
 * only type-only imports and run without it under `--experimental-strip-types`.
 *
 * All wire values require runtime validation; these types are not validators.
 */

import type {
  AdvisorAvailability,
  AdvisorAvailabilityRequest,
  AvailabilityLabel,
  CopyFacts,
  CopyLocation,
  DeckReadiness,
  Finish,
  HolderDeck,
  PrintingRef,
  ReadState,
} from './card-state-actions.types.ts'

export type {
  AdvisorAvailability,
  AdvisorAvailabilityRequest,
  AvailabilityLabel,
  CopyFacts,
  CopyLocation,
  DeckReadiness,
  Finish,
  HolderDeck,
  PrintingRef,
  ReadState,
}

export type OracleId = { kind: 'oracle_id'; value: string }
export type PrintingId = { kind: 'scryfall_id'; value: string }
export type Colour = 'W' | 'U' | 'B' | 'R' | 'G'
export type NonEmpty<T> = readonly [T, ...T[]]

/** D-009 placement source reused for AI changes. */
export type PlacementSource = 'manual' | 'ai' | 'import'

export interface Evidence {
  id: string
  source:
    | 'scryfall'
    | 'repository'
    | 't28'
    | 'edhrec'
    | 'spellbook'
    | 'owner'
    | 'reviewed_rule'
    | 'model'
    | 'offline_fixture'
  locator: string
  observedAt: string
  sourceUpdatedAt: string | null
  version: string | null
}

export type Freshness =
  | { state: 'fresh'; validUntil: string }
  | { state: 'stale'; expiredAt: string }
  | { state: 'unknown'; reason: string }

export type UnknownReason =
  | 'unset'
  | 'not_found'
  | 'ambiguous'
  | 'lookup_failed'
  | 'unsupported'
  | 'not_recorded'
  | 'conflicting_sources'
  | 'approval_pending'

export type Fact<T> =
  | {
      state: 'known'
      value: T
      evidence: NonEmpty<Evidence>
      freshness: Freshness
    }
  | {
      state: 'unknown'
      reason: UnknownReason
      message: string
      attemptedSources: readonly Evidence[]
    }

export interface CardIdentity {
  oracleId: OracleId
  name: string
}

export interface FaceFacts {
  index: number
  name: string
  typeLine: string
  oracleText: string
  manaCost: string | null
  colours: readonly Colour[]
}

export interface RulesFacts {
  layout: string
  faces: NonEmpty<FaceFacts>
  colourIdentity: readonly Colour[]
  manaValue: number
  keywords: readonly string[]
  producedMana: readonly string[]
  textHash: string
}

export interface CardFacts {
  identity: CardIdentity
  rules: Fact<RulesFacts>
  commanderLegality: Fact<'legal' | 'banned' | 'not_legal' | 'restricted'>
  printing: Fact<{
    printingId: PrintingId
    oracleId: OracleId
    setCode: string
    collectorNumber: string
    finishes: NonEmpty<Finish>
  }>
}

export interface CommanderContext {
  members: NonEmpty<CardFacts>
  pairing: Fact<
    | 'single'
    | 'partner'
    | 'partner_with'
    | 'friends_forever'
    | 'background'
    | 'doctors_companion'
  >
  colourIdentity: Fact<readonly Colour[]>
  eligibility: Fact<{ legal: boolean; reason: string; ruleVersion: string }>
}

export interface Preferences {
  plan: Fact<string>
  bracket: Fact<{ min: number; max: number }>
  budget: Fact<{ currency: string; perCard: number | null; total: number | null }>
  collectionMode: Fact<'owned_only' | 'prefer_owned' | 'unrestricted'>
  infiniteCombos: Fact<'allow' | 'avoid'>
  stax: Fact<'allow' | 'avoid'>
  massLandDestruction: Fact<'allow' | 'avoid'>
  extraTurns: Fact<'allow' | 'avoid'>
  customRules: Fact<readonly string[]>
}

export interface DeckSlot {
  deckCardId: number
  identity: Fact<CardIdentity>
  requestedPrinting: Fact<PrintingId | null>
  quantity: Fact<number>
  relation: Fact<'main' | 'maybeboard'>
  isCommander: Fact<boolean>
  coverage: Fact<
    | { kind: 'generic_basic'; placement: 'sleeved' }
    | { kind: 'tracked'; placement: 'sleeved' | 'unsleeved'; copyId: number | null }
  >
}

export interface DeckContext {
  deckId: number
  name: string
  format: Fact<'commander'>
  revision: string
  readAt: string
  slots: readonly DeckSlot[]
  commander: Fact<CommanderContext>
  preferences: Preferences
}

/**
 * T-28 availability, decorated with the candidate key the advisor asked about.
 * The advisor never computes supply; it consumes T-28 facts.
 */
export interface AvailabilityRead {
  key: AvailabilityKey
  availability: AdvisorAvailability
}

export interface AvailabilityKey {
  oracleId: OracleId
  requestedPrinting: PrintingId | null
  target:
    | { kind: 'candidate'; deckId: number | null }
    | { kind: 'slot'; deckId: number; deckCardId: number }
}

/** D-035: Scryfall estimate price, clearly labelled. */
export interface PriceQuote {
  provider: 'scryfall'
  currency: string
  amount: number
  printingId: PrintingId
  finish: Finish
  condition: string | null
  /** Scryfall prices are indicative estimates, not purchase guarantees. */
  indicative: true
  sourceUpdatedAt: string | null
}

export interface Claim {
  id: string
  text: string
  kind: 'rules' | 'interpretation'
  card: OracleId
  faceIndex: number | null
  evidenceIds: NonEmpty<string>
  assertionId: string | null
}

export interface SupportCondition {
  description: string
  status: 'satisfied' | 'not_satisfied' | 'unknown'
  evidenceIds: readonly string[]
}

/** Server-derived action descriptor. The model only selects keys; it never authors these. */
export type ActionDescriptor =
  | { kind: 'sleeve'; copyId: number }
  | { kind: 'move_from'; copyId: number; sourceDeckCardId: number }
  | { kind: 'proxy'; printingId: PrintingId; finish: Finish }
  | { kind: 'remove'; deckCardId: number }
  | { kind: 'move_to_maybeboard'; deckCardId: number }

/** The model selects supplied keys; it cannot supply ownership, price, card text or actions. */
export interface ModelSuggestion {
  candidateKey: string
  commanderKeys: NonEmpty<string>
  rationale: string
  roles: NonEmpty<string>
  mechanics: readonly string[]
  claimIds: NonEmpty<string>
  conditions: readonly SupportCondition[]
  antiSynergyClaimIds: readonly string[]
  cut:
    | { kind: 'slot'; deckCardId: number; reason: string }
    | { kind: 'open_slot'; reason: string }
    | { kind: 'not_assessed'; reason: string }
  package: { key: string; candidateKeys: NonEmpty<string>; purpose: string } | null
  unknowns: readonly string[]
}

export interface ModelSubmission {
  schemaVersion: 'advisor-model-v1'
  contextId: string
  suggestions: readonly ModelSuggestion[]
  noMatchesReason: string | null
}

/** D-034: applicable suggestion with server-derived, undoable action. */
export interface Suggestion {
  id: string
  kind: 'recommendation'
  source: 'ai'
  actionability: 'applicable'
  /** The action the advisor will take if the owner accepts it. */
  action: ActionDescriptor
  card: CardFacts
  commanderIds: NonEmpty<OracleId>
  rationale: string
  roles: NonEmpty<string>
  mechanics: readonly string[]
  claims: NonEmpty<Claim>
  conditions: readonly SupportCondition[]
  antiSynergyClaims: readonly Claim[]
  cut: ModelSuggestion['cut']
  package: { key: string; members: NonEmpty<OracleId>; purpose: string } | null
  availability: AvailabilityRead
  price: Fact<PriceQuote>
  evidence: NonEmpty<Evidence>
  usefulness: 'unrated' | 'owner_reviewed'
  unknowns: readonly string[]
}

export type AdvisorErrorCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'not_found'
  | 'context_unavailable'
  | 'stale_context'
  | 'identity_unresolved'
  | 'facts_unavailable'
  | 'unsupported_response'
  | 'invalid_suggestion'
  | 'tool_failed'
  | 'timeout'
  | 'rate_limited'
  | 'refresh_unavailable'
  | 'apply_failed'
  | 'undo_failed'
  | 'nothing_to_undo'

export interface AdvisorError {
  code: AdvisorErrorCode
  message: string
  retryable: boolean
  requestId: string
}

export interface AdvisorRequest {
  schemaVersion: 'advisor-v1'
  requestId: string
  message: string
  context:
    | { type: 'deck'; deckId: number }
    | { type: 'collection'; commanderIds: readonly OracleId[] }
  sessionId?: string
}

export interface ResponseContext {
  requestId: string
  contextId: string
  deckRevision: string | null
  availabilitySnapshotId: string | null
  generatedAt: string
  notices: readonly string[]
}

export type AdvisorResult =
  | {
      status: 'complete' | 'partial'
      context: ResponseContext
      suggestions: NonEmpty<Suggestion>
      issues: readonly AdvisorError[]
    }
  | {
      status: 'no_matches'
      context: ResponseContext
      suggestions: readonly []
      reason: string
    }
  | {
      status: 'needs_context'
      context: ResponseContext
      missing: NonEmpty<string>
    }
  | { status: 'error'; error: AdvisorError }

export type AdvisorEvent =
  | { type: 'advisor_status'; requestId: string; stage: 'context' | 'reasoning' | 'validation' }
  | { type: 'advisor_result'; requestId: string; result: AdvisorResult }
  | {
      type: 'advisor_done'
      requestId: string
      outcome: 'complete' | 'partial' | 'no_matches' | 'needs_context' | 'error'
    }

/** D-034: apply one or more validated suggestions atomically with source = 'ai'. */
export interface ApplyRequest {
  schemaVersion: 'advisor-apply-v1'
  requestId: string
  contextId: string
  suggestionIds: NonEmpty<string>
  /** Mirrors T-28 operation idempotency. */
  operationId: string
  observationToken: string
}

export interface ApplyResult {
  schemaVersion: 'advisor-apply-v1'
  requestId: string
  operationId: string
  source: PlacementSource
  /** Deck/card/copy IDs affected by the apply. */
  affected: {
    deckIds: number[]
    deckCardIds: number[]
    copyIds: number[]
    oracleIds: string[]
  }
  /** Current state after apply; failure here is "saved, refresh failed". */
  current: AdvisorResult | null
  issues: readonly AdvisorError[]
}

/** D-034: undo the last AI operation for this deck/user. */
export interface UndoRequest {
  schemaVersion: 'advisor-undo-v1'
  requestId: string
  deckId: number
  /** Optional: undo a specific AI operation instead of the most recent. */
  operationId?: string
}

export interface UndoResult {
  schemaVersion: 'advisor-undo-v1'
  requestId: string
  operationId: string
  source: PlacementSource
  affected: ApplyResult['affected']
  current: AdvisorResult | null
  issues: readonly AdvisorError[]
}

export interface AdvisorToolMap {
  advisor_get_context: {
    input: { contextId: string }
    output: Fact<DeckContext>
  }
  advisor_get_card_facts: {
    input: { contextId: string; candidateKeys: NonEmpty<string> }
    output: readonly { candidateKey: string; facts: Fact<CardFacts> }[]
  }
  advisor_get_availability: {
    input: { contextId: string; candidateKeys: NonEmpty<string> }
    output: readonly AvailabilityRead[]
  }
  advisor_submit_recommendations: {
    input: ModelSubmission
    output: AdvisorResult
  }
  advisor_apply_recommendations: {
    input: ApplyRequest
    output: ApplyResult
  }
  advisor_undo_last_apply: {
    input: UndoRequest
    output: UndoResult
  }
}

/** Map an advisor wrapper identifier to the plain string T-28 expects. */
export function toT28OracleId(id: OracleId): string {
  return id.value
}

/** Map a T-28 plain oracle id back to the advisor wrapper. */
export function fromT28OracleId(value: string): OracleId {
  return { kind: 'oracle_id', value }
}

/** Map an advisor wrapper printing id to the plain string T-28 expects. */
export function toT28PrintingId(id: PrintingId): string {
  return id.value
}

/** Map a T-28 plain printing id back to the advisor wrapper. */
export function fromT28PrintingId(value: string): PrintingId {
  return { kind: 'scryfall_id', value }
}

/** Build a T-28 availability request from an advisor availability key. */
export function toT28AvailabilityRequest(key: AvailabilityKey): AdvisorAvailabilityRequest {
  return {
    oracleId: key.oracleId.value,
    requestedPrintingId: key.requestedPrinting?.value ?? null,
    deckId: key.target.kind === 'slot' ? key.target.deckId : key.target.deckId,
  }
}

/** Convert a T-28 copy facts record into advisor price lookup inputs. */
export function priceKeyFromCopy(copy: CopyFacts): { printingId: PrintingId | null; finish: Finish | null } {
  return {
    printingId: copy.printing ? { kind: 'scryfall_id', value: copy.printing.printingId } : null,
    finish: copy.finish,
  }
}
