// Reference types for docs/oracle/contracts/claude-connector-deck-category.md. Contract only; not app code.
// Extends claude-connector-slice-b.types.ts (do not edit that file's constants by hand: add the entries below to them).

/** Add to ChangeAction, CONNECTOR_WRITE_TOOLS (as 'set_card_category'). Not in OWNER_ONLY_UNDO. Not in DESTRUCTIVE_HINT_TOOLS. */
export type DeckCategoryAction = 'deck_category';

export const CATEGORY_NAME_MAX = 60; // same as add_cards_to_deck's category
export const CATEGORIES_PER_CARD_MAX = 5; // proposed; must equal c_max_cats in _ai_plan (test)

/** Spelling: the tool only trims/length-checks. Case-insensitive matching to the deck's existing categories happens in SQL _ai_plan (contract 3a). */

/** MCP tool input (zod strictObject; name trimmed 1..200, category trimmed 1..60). No user id. 1..AI_LIMITS.max_request slots. */
export type SetCardCategoryInput = {
  deck_id: number;
  slots: { slot_id: number; name: string; categories: string[] }[]; // each slot gets its OWN list, 1..5 names, order kept
  dry_run?: boolean;
};

/** Payload sent to ai_submit_change(p_action = 'deck_category'). Written by write-gateway, never by Claude directly. */
export type DeckCategoryPayload = {
  deck_id: number;
  slots: { id: number; card_name: string; categories: string[] }[];
};

/** Extra fields in the plan returned by dry runs and pending previews. */
export type DeckCategoryPlan = {
  action: 'deck_category';
  deck_id: number;
  deck_name: string;
  n: number; // slots that will actually change (skipped ones are not counted)
  changes: { slot_id: number; card_name: string; from: string[]; to: string[] }[];
  matched: { card: string; sent: string; used: string }[]; // names stored with the deck's existing spelling (matching is done in SQL, not in the tool)
  skipped: { slot_id: number; name: string; categories: string[] }[]; // already exactly that list
};

/** Error codes (RAISE ... DETAIL = json). Developer maps each to a plain sentence. */
export type DeckCategoryErrorCode =
  | 'invalid_request'      // {field:'category'|'cards', card?}  a name empty after trim or over 60 chars, list empty or over 5, or no slots
  | 'category_reserved'    // {card, category}  the name is 'Maybeboard' (any case), or 'Commander' on a card that is not a commander
  | 'slot_not_found'       // {card, deck}      wrong slot id, wrong deck, or name does not match
  | 'duplicate_slot'       // {card}
  | 'slot_in_maybeboard'   // {card, deck}      slot has the Maybeboard marker anywhere in its categories
  | 'nothing_to_change'    // {deck, skipped}   every slot was already in that category
  | 'too_many_cards';      // {max}             more than 60 slots

/** Extra fields on ChangeLogRow for kind 'deck_category' (from ai_list_recent_changes). */
export type DeckCategoryLogExtras = { categories_from: string[] | null; categories_to: string[] | null };

/** Extra undo refusal codes for this kind: slot_edited, slot_gone, deck_gone (existing codes) plus window_closed, already_undone, owner_only. */
