// CC-15 contract types: Claude creates and sets up a deck. Matches claude-connector-cc15-deck-create.md.
// Writers: ai_create_deck, ai_set_deck_setup (supabase/drafts/20261117200100_cc15b_deck_create_setup.draft.sql).
export type DeckCreateInput = {
  name: string; // 1-100 characters
  format: 'commander' | 'standard' | 'modern' | 'legacy' | 'vintage' | 'pioneer' | 'pauper' | 'cube' | 'casual';
  commander?: { name: string }; // required when format is commander
};
export type DeckSetupInput = {
  deck_id: number;
  commander?: { name: string };
  strategy_notes?: string; // at most 4000 characters (AI_LIMITS_NEW.strategy_notes_max_chars)
  bracket?: 1 | 2 | 3 | 4 | null; // null clears it
}; // at least one of the three fields
export type DeckCreateResult = { success: true; outcome: 'applied'; group_id: string; deck_id: number; count: 1 };
export type DeckSetupResult =
  | { success: true; outcome: 'applied'; group_id: string; count: 1; changed: Record<string, unknown> }
  | { success: true; outcome: 'no_change'; count: 0 };
/** Database refusal codes (the error text). */
export type DeckCreateError =
  | 'connection_revoked' | 'bad_deck_name' | 'bad_format' | 'commander_required' | 'deck_name_taken'
  | 'too_many_decks_this_hour' | 'too_many_empty_decks' | 'could_not_allocate_deck_id';
export type DeckSetupError =
  | 'connection_revoked' | 'deck_not_found' | 'nothing_to_set' | 'bad_bracket' | 'bad_notes' | 'notes_too_long';
/** Undo refusal codes added by these kinds. */
export type DeckUndoRefusalCode = 'owner_only' | 'already_undone' | 'too_old' | 'deck_gone' | 'deck_not_empty' | 'deck_in_use' | 'changed_since';
