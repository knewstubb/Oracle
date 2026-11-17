// Reference types for docs/oracle/contracts/claude-connector-cc13-amendment.md. Contract only; not app code.
// Supersedes AI_LIMITS in claude-connector-slice-b.types.ts once the CC-13 migration is applied. Everything else there still holds.

export const AI_LIMITS = {
  direct_max: 120,
  split_window_minutes: 30,
  split_max: 200, // NEW key
  hourly_max: 500,
  undo_days: 7,
  pending_hours: 24,
  max_waiting: 20,
  max_request: 200,
  claude_undo_max: 200,
} as const; // must equal SQL _ai_limits() (test) and src/lib/connector/edit-config.ts

// 'card_move' and 'over_ten' stay legal values (old rows, and a DB CHECK constraint). After CC-13 'card_move' is never produced for new
// requests; 'over_ten' means "over direct_max". Reasons a new request can still wait: over_ten, recent_total, busy.
export type PendingReasonCc13 = 'over_ten' | 'recent_total' | 'busy' | 'card_move';

// copy_move after CC-13: applied straight away like any edit. Result is { outcome: 'applied', group_id, count: 1 }.
// Undo of a copy_move stays OWNER ONLY (OWNER_ONLY_UNDO unchanged) unless the owner decides otherwise (open question 2).

// Proposed new write tool (needs owner OK, see amendment section 5): fills slots with free copies in ONE request and ONE group.
export type SleeveFreeCopiesInput = {
  deck_id: number;
  copies: { copy_id: number; name: string }[]; // 1..max_request; each must be free (see FREE_COPY below)
  dry_run?: boolean;
};
// FREE_COPY: user_copies row that is in no deck_cards slot, not missing, not 'in your hand' (same meaning as search_collection only_free).
