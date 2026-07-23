# Roadmap: Card Allocation Engine

## Built

- **Six Statuses** — Original, Proxy, Available, Alternate, Claimed, Unowned. Derived from FK relationships.
- **Fill** — Assign free copy to open slot (atomic).
- **Claim** — Take from another deck (source becomes open).
- **Reassign** — Atomic RPC: source unlink + target fill in single transaction.
- **Add Proxy** — Create proxy physical_copy + assign.
- **Replace Proxy** — Swap proxy for real card when acquired.
- **Unassign** — Remove from slot, card returns to pool.
- **Mark Missing** — Atomic RPC: set flag + unlink from deck.
- **Mark Found** — Return to available pool.
- **Picklist** — 3-column resolution view.
- **Card Management Page** — Shared/contested cards across all decks.
- **Status Chip Popovers** — Contextual actions per status.
- **Printing Picker** — Visual grid, owned copies highlighted with location.

## Planned

### Game Night Readiness
**Priority:** #2 | **Effort:** Low

Single view: "6 decks ready. 2 need quick swaps (shows specific cards). 1 missing purchases." One-tap swap execution. Mobile-first (check before leaving for LGS).

### One-Tap Swap Suggestions
**Priority:** Medium | **Effort:** Medium

When two decks need the same card, suggest optimal resolution. "Sol Ring is in Muldrotha and wanted by Gitrog. Muldrotha has 3 other rocks. Swap?" Scored by deck resilience.

## Ideas

- **Auto-Allocate on Import** — "67 cards available — assign all?" (only free copies, never steal)
- **Allocation History** — "Sol Ring was in Muldrotha since April. Before that: Gitrog."
- **Priority Ranking** — "If only 1 Rhystic Study, which deck gets it?" User-defined priority.
- **Card Lending** — "Sol Ring is home in Muldrotha, lent to Gitrog for tonight." Has "return home" action.
- **Bulk Fill** — One click: fill every Available/Alternate slot at once
- **Bulk Proxy** — One click: create proxies for every unowned slot
