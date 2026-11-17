// Types shared by the write gateway, the edit tools and the cookie routes. No database client is imported here, so
// tool modules can depend on this file without being able to reach the service role.
import type {
  ChangeAction,
  ChangeLogRow,
  MovedSlot,
  PendingPreview,
  PendingReason,
  PendingStatus,
  SubmitOutcome,
  UndoRefusal,
  UndoResult,
} from '../../../docs/oracle/contracts/claude-connector-slice-b.types'
import type { DeckCreateResult, DeckSetupResult } from '../../../docs/oracle/contracts/claude-connector-cc15-deck-create.types'

export type { DeckCreateResult, DeckSetupResult }
export type { ChangeAction, ChangeLogRow, MovedSlot, PendingPreview, PendingReason, PendingStatus, SubmitOutcome, UndoRefusal, UndoResult }

/** A database refusal: `code` is the RPC's error text, `detail` its JSON detail (card, deck names etc.). */
export interface GatewayFailure {
  ok: false
  code: string
  detail: Record<string, unknown>
}
export type GatewayResult<T> = { ok: true; data: T } | GatewayFailure

/** A pending request as the database stores it (payload and hash are never returned). */
export interface PendingRow {
  id: string
  connection_id: string | null
  client_name: string
  kind: 'big_edit' | 'copy_move'
  action: ChangeAction
  reason: PendingReason
  deck_id: number | null
  deck_name: string | null
  other_deck_id: number | null
  other_deck_name: string | null
  card_count: number
  preview: PendingPreview
  status: PendingStatus
  created_at: string
  expires_at: string
  decided_at: string | null
  result_group_id: string | null
  failure_reason: { code?: string; card?: string; deck?: string; on?: string | null } | null
  cancel_reason: 'switched_off' | 'connection_ended' | null
}

export type ApproveResult =
  | { success: true; outcome: 'approved'; group_id: string; count: number }
  | { success: false; outcome: 'expired' | 'declined' | 'cancelled' | 'failed' | 'approved'; reason?: { code?: string; card?: string; deck?: string; on?: string | null } }

export type DeclineResult = { success: boolean; outcome: string }
export type ReenableRpcResult = { success: boolean; error?: 'not_found' | 'needs_reconnect'; already_on?: boolean }
export type ConnectionRow = { id: string; client_id: string; client_name: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null }
export type RevokeRpcResult = { success: boolean; client_id: string | null; cancelled_pending: number }

export interface ResolvedCard {
  oracleId: string
  scryfallId: string
  name: string
  setCode: string
}

/** Everything the edit tools and the cookie routes may ask the database. Implemented only in write-gateway.ts. */
export interface Gateway {
  /** null = no such card; throws never (an upstream failure is returned as `error`). */
  resolveCard(name: string, printingId?: string): Promise<{ card: ResolvedCard } | { card: null; error: boolean }>
  // Claude side: every call carries the verified user id and connection id from the token.
  submit(a: { userId: string; connectionId: string; action: ChangeAction; payload: Record<string, unknown>; dryRun: boolean }): Promise<GatewayResult<SubmitOutcome>>
  /** CC-15: a new deck. The commander (if any) is already resolved to ids; colourIdentity is the letters the manual create route stores. */
  createDeck(a: { userId: string; connectionId: string; name: string; format: string; commander: { card_name: string; scryfall_id: string; oracle_id: string; colour_identity: string } | null }): Promise<GatewayResult<DeckCreateResult>>
  /** CC-15: commander, strategy notes and bracket. `patch` holds only the keys the caller wants changed. */
  setDeckSetup(a: { userId: string; connectionId: string; deckId: number; patch: Record<string, unknown> }): Promise<GatewayResult<DeckSetupResult>>
  getPending(userId: string, connectionId: string, pendingId: string): Promise<GatewayResult<PendingRow | null>>
  listRecent(userId: string): Promise<GatewayResult<ChangeLogRow[]>>
  undoAsClaude(userId: string, connectionId: string, groupId: string): Promise<GatewayResult<UndoResult>>
  // Owner side: only the cookie routes call these.
  undoAsOwner(userId: string, groupId: string): Promise<GatewayResult<UndoResult>>
  listPending(userId: string): Promise<GatewayResult<PendingRow[]>>
  pendingCount(userId: string): Promise<GatewayResult<number>>
  approve(userId: string, pendingId: string): Promise<GatewayResult<ApproveResult>>
  decline(userId: string, pendingId: string): Promise<GatewayResult<DeclineResult>>
  movedSlots(userId: string, deckId: number): Promise<GatewayResult<MovedSlot[]>>
  revoke(userId: string, connectionId: string): Promise<GatewayResult<RevokeRpcResult>>
  /** Newest connection row, switched off or not. Null when Claude was never connected. */
  latestConnection(userId: string): Promise<GatewayResult<ConnectionRow | null>>
  /** Is Claude's saved sign-in for this app still good (not revoked, a live session exists)? */
  grantAlive(userId: string, clientId: string): Promise<GatewayResult<boolean>>
  reenable(userId: string, connectionId: string): Promise<GatewayResult<ReenableRpcResult>>
  activeConnection(userId: string): Promise<GatewayResult<{ id: string; client_name: string | null; created_at: string; last_used_at: string | null } | null>>
}
