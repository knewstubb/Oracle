// Types for docs/oracle/contracts/deck-rename-and-reorder.md. Reference only; no handlers.
export type DeckRenameError = 'name_empty' | 'name_too_long' | 'name_taken' | 'not_found' | 'save_failed';
export type DeckOrderError = 'deck_order_empty' | 'deck_order_duplicate' | 'deck_order_mismatch' | 'save_failed';

/** PATCH /api/decks/[id] with a name. renamedBy is 'owner' only until Claude rename is built (then logged as ai_change_log kind deck_rename). */
export interface DeckRenameRequest { name: string; renamedBy?: 'owner' }
export type DeckRenameResponse = { ok: true; name: string } | { error: DeckRenameError };

/** PUT /api/decks/order. deckIds = ALL of the owner's decks, first to last. */
export interface DeckOrderRequest { deckIds: number[] }
export type DeckOrderResponse = { ok: true; count: number } | { error: DeckOrderError };

export const DECK_NAME_MAX = 100;
/** Shared order for every deck list. */
export const DECK_ORDER_BY = ['position', 'name', 'id'] as const;
