// Slice B constants (contract: docs/oracle/contracts/claude-connector-slice-b.md). A test keeps AI_LIMITS equal to the
// SQL function _ai_limits() and to the contract's types file.

export const AI_LIMITS = {
  direct_max: 120,
  split_window_minutes: 30,
  split_max: 200,
  hourly_max: 500,
  undo_days: 7,
  pending_hours: 24,
  max_waiting: 20,
  max_request: 200,
  claude_undo_max: 200,
} as const

// CC-15 numbers for deck creation and setup. A test keeps these equal to the SQL function _ai_limits_new().
export const AI_LIMITS_NEW = {
  decks_created_per_hour: 10,
  decks_created_open_max: 25,
  boxes_created_per_hour: 10,
  box_move_max: 200,
  strategy_notes_max_chars: 4000,
} as const

export const CONNECTOR_WRITE_TOOLS = [
  'add_cards_to_deck',
  'remove_cards_from_deck',
  'set_card_zone',
  'set_card_category',
  'create_deck',
  'set_deck_setup',
  'add_card_to_collection',
  'sleeve_free_copy',
  'make_slot_original',
  'create_proxy_for_slot',
  'request_card_move',
  'undo_change',
] as const

export const CONNECTOR_READ_TOOLS_B = ['get_change_status', 'list_recent_changes'] as const

/** Only these two may say destructiveHint: true (they can take a card off a deck list; neither can touch the collection). */
export const DESTRUCTIVE_HINT_TOOLS = ['remove_cards_from_deck', 'undo_change'] as const

export const BLOCKED_TOOL_NAMES = [
  'delete_deck',
  'remove_from_collection',
  'delete_card',
  'delete_copy',
  'replace_collection',
  'clear_deck',
  'release_deck_copies',
] as const

export const BLOCKED_TOOL_PREFIXES = ['import_', 'sync_', 'bulk_'] as const

export function isBlockedToolName(name: string): boolean {
  const n = name.toLowerCase()
  return (BLOCKED_TOOL_NAMES as readonly string[]).includes(n) || BLOCKED_TOOL_PREFIXES.some((p) => n.startsWith(p))
}
