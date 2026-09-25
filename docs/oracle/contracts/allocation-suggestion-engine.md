# Allocation Suggestion Engine Contract

Status: DRAFT  
Owner: Architect  
Locked decision: D-007

## Scope

This contract governs how Oracle computes and applies card allocations between the physical collection (`user_copies`, representing owned physical copies per D-001) and deck slots (`deck_cards`).

## Principle

Allocation suggestions are **computed and returned**, never written over existing allocations without explicit user action on a single card or copy.

## Retired write paths

The following destructive clear-and-recompute pattern is retired and must not be reintroduced:

- `allocation_clear_active_decks(p_user_id UUID)` — bulk clears `copy_id` / `ownership_status` on all active-deck `deck_cards` rows as a prelude to recomputation.

No RPC may clear allocations across multiple decks or multiple cards in a single call.

## Allowed allocation write paths

All allocation mutations must be atomic and scoped to a single copy or single deck slot:

- `assign_physical_copy(copy_id, target_deck_card_id, user_id)`
- `assign_free_copy(card_name, copy_id, target_deck_id, user_id)`
- `reassign_to_deck(card_name, copy_id, target_deck_id, user_id)`
- `batch_assign_deck(assignments, deck_id, user_id)` — scoped to one deck
- `replace_proxy_with_original(...)`
- `add_proxy_to_slot(...)` / `add_proxies_to_slots(...)`
- `unassign_copy_to_storage(copy_id, user_id)`
- `undo_copy_move(...)`
- `force_claim_copy(...)`
- `_move_copy_to_slot(...)`

Collection-level mutations (`replace_collection`, `apply_collection_sync`, `delete_user_copies`) may release allocations only via FK cascade or explicit per-copy removal as part of their own transaction; they are not allocation RPCs and must not be used as allocation resolvers.

## Suggestion interface

The compute layer that previously drove the destructive resolver is reused as a read-only suggestion engine. It returns, for each unassigned deck slot, a ranked list of candidate physical copies from free storage, without writing any `deck_cards` row.

## Identifier rules

- `copy_id` refers to `physical_copies.id` / `user_copies.id` (a specific owned finish/printing).
- `deck_card_id` refers to `deck_cards.id` (a card's membership in a deck).
- `card_name` is used for identity matching only when a `copy_id` is not yet selected.

## Migration history

- `20260925000000_retire_destructive_allocation_rpc.sql` — drops `allocation_clear_active_decks`.
