// Reference types for docs/oracle/contracts/claude-connector-slice-b.md. Contract only; not app code.

export const AI_LIMITS = {
  direct_max: 10,
  split_window_minutes: 30,
  hourly_max: 40,
  undo_days: 7,
  pending_hours: 24,
  max_waiting: 20,
  max_request: 60,
  claude_undo_max: 10,
} as const; // must equal SQL _ai_limits() (test)

export const CONNECTOR_WRITE_TOOLS = [
  'add_cards_to_deck', 'remove_cards_from_deck', 'set_card_zone', 'add_card_to_collection',
  'sleeve_free_copy', 'make_slot_original', 'create_proxy_for_slot', 'request_card_move', 'undo_change',
] as const;
export const CONNECTOR_READ_TOOLS_B = ['get_change_status', 'list_recent_changes'] as const;
export const DESTRUCTIVE_HINT_TOOLS = ['remove_cards_from_deck', 'undo_change'] as const;
export const BLOCKED_TOOL_NAMES = [
  'delete_deck', 'remove_from_collection', 'delete_card', 'delete_copy', 'replace_collection',
  'clear_deck', 'release_deck_copies',
] as const; // plus prefixes import_ sync_ bulk_

export type ChangeAction =
  | 'deck_add' | 'deck_remove' | 'deck_zone' | 'sleeve_copy'
  | 'make_original' | 'create_proxy' | 'collection_add' | 'copy_move';
export type PendingReason = 'over_ten' | 'recent_total' | 'busy' | 'card_move';
export type PendingStatus = 'waiting' | 'approved' | 'declined' | 'expired' | 'cancelled' | 'failed';
export const OWNER_ONLY_UNDO: readonly ChangeAction[] = ['collection_add', 'create_proxy', 'copy_move'];

export type DeckCounts = { size: number; sleeved: number; unsleeved_generics: number };
export type PendingPreview = {
  cards: { name: string; quantity: number; is_proxy?: boolean }[];
  decks: { deck_id: number; name: string; role: 'changes' | 'gains' | 'loses'; before: DeckCounts; after: DeckCounts }[];
};

export type SubmitOutcome =
  | { success: true; outcome: 'applied'; group_id: string; count: number }
  | { success: true; outcome: 'pending'; pending_id: string; expires_at: string; reason: PendingReason; duplicate?: boolean }
  | { success: true; outcome: 'would_apply' | 'would_wait'; reason: PendingReason | null };

export type UndoRefusal = {
  code: string; // e.g. owner_only, window_closed, slot_sleeved, copy_elsewhere, copy_in_deck, card_back_on_list
  card?: string; deck?: string; on?: string | null;
};
export type UndoResult = { success: true; undone: number } | { success: false; refused: UndoRefusal };

export type ChangeLogRow = {
  id: string; group_id: string; kind: ChangeAction; client_name: string;
  deck_id: number | null; deck_name: string | null; other_deck_id: number | null; other_deck_name: string | null;
  card_name: string; oracle_id: string | null; printing_id: string | null;
  approved_by_owner: boolean; created_at: string; undoable_until: string;
  undone_at: string | null; undone_by: 'owner' | 'claude' | null;
  owner_only: boolean; undo_blocker: UndoRefusal | null;
};
export type MovedSlot = {
  slot_id: number; card_name: string; moved_to_deck_id: number | null; moved_to_deck_name: string;
  at: string; client_name: string; approved_by_owner: boolean;
};
