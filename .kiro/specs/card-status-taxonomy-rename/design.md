# Design Document — Card Status Taxonomy Rename & Expansion

## UX Design

### Overview

This design replaces the existing four-state card-slot vocabulary with a unified five-state taxonomy across every surface: Cards Tab, Deck Builder search, Picklist, and Collection. It also introduces a Playable/Unplayable deck-level badge on the Decks Grid, a Missing indicator in Collection/Storage views, and renames the builder-search-only "Over-allocated" to "Claimed" everywhere.

The design system already has the token vocabulary and badge conventions needed — this work maps new states onto existing patterns rather than inventing new UI primitives.

### References

- Requirements: `.kiro/specs/card-status-taxonomy-rename/requirements.md`
- Current card-status source: `src/lib/card-status.ts`
- Current builder badge: `src/components/BuilderStatusBadge.tsx`
- Current Cards Tab chips: `src/components/CardsTab.tsx` (line ~540)
- Current DeckTile completeness: `src/components/DeckTile.tsx`
- Design system tokens: `.kiro/steering/oracle-component-layout-spec.md`
- Status color reference: `.kiro/steering/oracle-component-layout-spec.md` Section 5

---

### 1. Token Assignments — Unified Status Palette

The five-state taxonomy needs a single, consistent color mapping used identically on badge pills, filter chips, grid borders, and dot indicators. Mapped against existing tokens where possible; one new token introduced for Claimed.

| State | Token | Hex | Rationale |
|-------|-------|-----|-----------|
| **Original** | `--accent-primary` | #1D9E75 | Teal — the "resolved, best case" color. Matches existing `allocated` treatment. Solid dot. |
| **Proxy** | `--accent-primary` | #1D9E75 | Same teal, dashed dot — the existing convention from `BuilderStatusBadge`. Proxy is a resolved state, just a different backing. |
| **Unallocated** | `--signal-warning` | #EF9F27 | Amber — "attention needed but not critical." A free copy exists; one click resolves it. |
| **Claimed** | `--status-over` | #FF5F1F | Orange — the "contention" color already used for over-allocation. Carries forward the existing meaning. |
| **Unowned** | `--signal-critical` | #E24B4A | Red — "no path to resolution without new acquisition." Terminal within the current collection. |

**New token (not yet in `tokens.css`):**
- `--status-claimed-bg`: `rgba(255, 95, 31, 0.12)` — follows the 15%-alpha badge background convention from `oracle-component-layout-spec.md` Section 5.

**Background convention** (per existing system): every status color used as a filled badge gets a `rgba(..., 0.12–0.15)` variant for its background. These already exist for `--accent-primary-bg`, `--signal-warning-bg`, `--signal-critical-bg`. Add `--status-claimed-bg` to complete the set.

---

### 2. Cards Tab — Status Filter Chips

Replaces the current four chips (`Allocated`, `Allocated · proxy`, `Unallocated`, `Unowned`) with five.

**Layout (unchanged pattern):** horizontal row below toolbar, scrollable on narrow viewports.

```
[All — 100]  [● Original — 62]  [◐ Proxy — 18]  [◑ Unallocated — 8]  [⊘ Claimed — 9]  [○ Unowned — 3]
```

| Chip | Active color | Dot style | Icon hint |
|------|-------------|-----------|-----------|
| All | neutral (existing) | none | — |
| Original | `--accent-primary` | solid circle | ● |
| Proxy | `--accent-primary` | dashed circle | ◐ |
| Unallocated | `--signal-warning` | half-fill circle | ◑ |
| Claimed | `--status-over` | cross-through circle | ⊘ |
| Unowned | `--signal-critical` | empty circle | ○ |

**Interaction:** single-select (click to filter, click again or click "All" to clear). Active chip gets its color applied to text + dot; inactive chips stay `--text-tertiary`.

**Accessibility:** each chip is a `<button>` with `aria-pressed`. The dot is `aria-hidden`; the label text carries full meaning. Color is never the sole differentiator — each state has a unique dot shape.

**States:**
- Default: all chips visible, "All" active
- Active filter: selected chip highlighted, others muted
- Zero count: chip still renders (shows "— 0"), disabled state (`opacity: 0.4`, `pointer-events: none`)
- Loading: chips show skeleton placeholders (same width, pulsing bg)

---

### 3. Cards Tab — Per-Row Status Badge

Appears trailing on each card row in list view. Same component used in both Cards Tab and Builder search (vocabulary unification).

**Badge anatomy** (follows `BuilderStatusBadge` existing pattern):

```
[dot 6px] [label text]
```

Rendered as a `<span>` with `rounded-full px-2 py-0.5` and the state's `color` + `bg` from Section 1.

| State | Dot | Label | Color | Background |
|-------|-----|-------|-------|------------|
| Original | ● solid | "Original" | `--accent-primary` | `rgba(29,158,117,0.12)` |
| Proxy | ◐ dashed border | "Proxy" | `--accent-primary` | `rgba(29,158,117,0.06)` |
| Unallocated | ◑ half-fill | "Unallocated" | `--signal-warning` | `rgba(239,159,39,0.10)` |
| Claimed | ⊘ crossed | "Claimed" | `--status-over` | `rgba(255,95,31,0.12)` |
| Unowned | ○ empty | "Unowned" | `--signal-critical` | `rgba(228,75,74,0.10)` |

**Claimed badge — extra context line:** Below the badge, in `--text-tertiary` at `--text-xs`, render the holding deck name: `"Held by [Deck Name]"`. Mirrors the existing `BuilderStatusBadge` pattern for `over_allocated` which shows `"Currently in [deck] ([status])"`. Truncate deck name at 20ch with ellipsis.

**Generic land slots:** No badge rendered. The row still appears in the list but the trailing badge area is empty — existing behavior, preserved.

**Grid view:** the existing corner dot convention (solid/dashed/empty circle at top-right of card art) maps directly to the new five states. Add the half-fill and crossed variants for Unallocated and Claimed respectively.

---

### 4. Decks Grid — Playable / Unplayable Badge

**Applies to Built decks only.** Replaces the current "completeness badge" (which shows `N/100` with `AlertTriangle`) with a named binary badge, keeping the count as secondary detail.

**Playable (100/100 resolved):**

No badge rendered. A fully-resolved Built deck is the expected state — silence is the signal. The existing lifecycle badge ("Built") is sufficient. No additional visual clutter.

**Unplayable (<100 resolved):**

```
[⚠ AlertTriangle icon 12px] [Unplayable]  [97/100 — secondary]
```

| Property | Value |
|----------|-------|
| Text color | `--status-over` (#FF5F1F) |
| Background | `rgba(255, 95, 31, 0.12)` |
| Border radius | `rounded-full` |
| Padding | `px-2 py-0.5` |
| Font | `--text-xs` / `--font-medium` |
| Icon | `AlertTriangle` from lucide-react (existing import in DeckTile) |
| Count text | `--text-tertiary`, same size, follows the badge inline |

**Placement:** Same row as the lifecycle badge, after it. Exact same position as the current `completeness` badge in `DeckTile.tsx` — this is a label rename + structural promotion, not a layout change.

**States:**
- Built + Playable: no badge (clean tile)
- Built + Unplayable: orange badge with icon + count
- Brew/Archived: never shown regardless of resolution count

**Transitions:**
- Card marked Missing → unlink → count drops → badge appears (no user action needed on this deck)
- Tier 4 reassignment pulls card from this deck → count drops → badge appears
- User resolves the gap via Picklist → count returns to 100 → badge disappears

**Accessibility:** Badge includes `aria-label="Unplayable: 97 of 100 cards resolved"`. The AlertTriangle icon is `aria-hidden`.

---

### 5. Decks Grid — Lifecycle Badge Rename

The `StatusBadge` component currently shows "Boxed" for the middle lifecycle stage. Per the settled spec, this becomes **"Built"** as a display-only rename — no enum change in the database.

| DB value | Display label (old) | Display label (new) |
|----------|--------------------|--------------------|
| `brew` | Brew | Brew (unchanged) |
| `boxed` | Boxed | **Built** |
| `archived` | Archived | Archived (unchanged) |

Change is localized to the `CONFIG` record in `StatusBadge.tsx`. No color change — Built keeps the same teal treatment as Boxed.

---

### 6. Picklist — "Claimed by [Deck]" Row Treatment

When a card has no free copies and all are held by other decks, the Picklist row needs to communicate that the resolution path requires pulling from another deck (Tier 3 or Tier 4).

**Row anatomy for a Claimed slot:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Card name]                                                [⊘ Claimed] │
│                                                                        │
│  Held by:                                                              │
│  ┌────────────────────────────────────────────────────┐               │
│  │ [Deck name] · [Brew/Built] · [copy condition]  [→] │               │
│  │ [Deck name] · [Built]      · [copy condition]  [→] │               │
│  └────────────────────────────────────────────────────┘               │
│                                                                        │
│  [Print proxy — Tier 5]                                                │
└──────────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Each holding-deck row is a candidate. Clicking `[→]` (or the row itself) initiates the reassignment.
- Tier 3 (source is Brew): proceeds immediately on click — low friction, no confirmation needed.
- Tier 4 (source is Built): click opens the confirmation modal (per lifecycle spec Section 6c). Modal copy: `"This is currently in [Deck Name]. Removing it will make that deck incomplete ([N-1]/100) and Unplayable. Continue?"`
- Tier 5 (Print proxy): dedicated button at the bottom of the candidate list, visually distinct (outline style, not a row).

**Empty state:** If a Claimed row has zero Tier 3/4 candidates because all holding decks are Archived (allocate forced off), only the Tier 5 button shows. Label the section: `"All copies are in archived decks — print a proxy to resolve."`

**Keyboard:** Each candidate row and the Tier 5 button are focusable. Enter/Space activates. Tab order: card row → candidate rows (top to bottom) → Tier 5 button.

---

### 7. Collection / Storage View — Missing Indicator

Physical copies marked Missing appear in the Collection view with a distinct treatment — they're still visible (the record isn't deleted) but clearly distinguished from available copies.

**Row treatment (Collection table):**

```
[Card name]  [Set · Condition · Foil]  [Missing ×]
```

| Property | Value |
|----------|-------|
| Row opacity | 0.5 — entire row is dimmed |
| Badge | `"Missing"` in `--signal-critical` text, `rgba(228,75,74,0.10)` bg |
| Strikethrough | Card name gets `line-through` text-decoration in `--text-tertiary` |
| Action | `×` button (clear Missing) with tooltip "Mark as found" |

**Filtering:** Collection view gets a new filter toggle: `"Show Missing"` (default: off). When off, Missing copies are hidden entirely. When on, they render with the dimmed treatment above.

**Count exclusion:** Missing copies do NOT count toward the "Owned" total in collection summary stats. They appear in a separate `"Missing: N"` stat if any exist.

**States:**
- Default (Show Missing off): row hidden
- Show Missing on: row visible, dimmed, with badge and clear action
- Un-marking (click ×): row animates back to full opacity, badge disappears, copy returns to Available pool

**Accessibility:** Missing rows include `aria-label="[Card name] — marked as missing"`. The dimmed visual treatment is supplemented by the "Missing" text badge (not color-only). The `×` button has `aria-label="Mark [card name] as found"`.

---

### 8. Builder Search — Vocabulary Alignment

The deck-builder card search (`BuilderStatusBadge`) currently uses `owned / proxy / over_allocated / unowned`. This aligns to:

| Old term | New term | Visual change |
|----------|----------|---------------|
| `owned` | `Original` | Label text only — same color/dot |
| `proxy` | `Proxy` | Label text only — unchanged |
| `over_allocated` | `Claimed` | Label + color: amber (`--signal-warning`) → orange (`--status-over`). "Currently in [deck]" subtext stays. |
| `unowned` | `Unowned` | Unchanged |

The `BuilderStatusBadge` component merges with the unified `StatusBadge` (for card slots) — one component, one vocabulary, used in both Cards Tab and Builder search. The `heldBy` prop stays for the "Held by [deck]" contextual line on Claimed cards.

---

### 9. Responsive Behavior

**Filter chips (Cards Tab):** On viewports < 640px, the chip row becomes horizontally scrollable with `overflow-x-auto` and `-webkit-overflow-scrolling: touch`. A subtle fade gradient on the right edge indicates more chips. No wrapping — all five chips stay on one line.

**Playable/Unplayable badge (Decks Grid):** At the smallest card width (< 200px on mobile grid), the "Unplayable" text is hidden and only the icon + count remain: `[⚠] [97/100]`. Badge keeps its background. Breakpoint: same as existing DeckTile responsive behavior.

**Claimed candidate list (Picklist):** On narrow viewports (< 480px), the deck name in each candidate row truncates at 16ch. Condition badge wraps below. The reassignment arrow stays trailing-aligned.

---

### 10. Error & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Status computation fails (API error) | Cards Tab shows all cards without status badges. Filter chips disabled with "Status unavailable" tooltip. No false classifications. |
| Physical copy linked but the `physical_copies` row is deleted (orphan FK) | Slot falls to `unowned`. Log a warning server-side. Do not crash the UI. |
| User marks all copies of a card as Missing in one action | All deck slots referencing those copies unlink. Each affected deck's completeness recomputes. Badge flips are batched (one re-render per deck, not per slot). |
| Deck with 0 cards (edge case during brew) | No status computation. Filter chips show all zeros. No Playable/Unplayable badge (Brew stage). |
| Two users viewing the same deck (single-user app, but tab duplication) | TanStack Query staleness handles this — second tab picks up the update on next focus/refetch. No real-time sync needed. |

---

### 11. Summary of Component Changes

| Component | Change |
|-----------|--------|
| `StatusBadge.tsx` | Rename "Boxed" label → "Built". No structural change. |
| `BuilderStatusBadge.tsx` | **Merge into a single unified `CardSlotBadge` component** shared by Cards Tab and Builder. New props: `status: CardSlotStatus`, `heldBy?: { deckName, deckStatus }`. |
| `CardsTab.tsx` | Rename filter chip labels + colors. Add "Claimed" chip. Update `StatusChip` color for each state per Section 2. |
| `DeckTile.tsx` | Rename completeness badge → "Unplayable" badge. Add label text. Suppress when Playable (100/100). |
| `card-status.ts` | New type values, new `claimed` classification logic (Requirement 7). |
| `builder-card-status.ts` | **Delete.** Logic merges into `card-status.ts`. One engine, one vocabulary. |
| New: `CardSlotBadge.tsx` | Unified badge component replacing both `BuilderStatusBadge` and the inline badge rendering in Cards Tab. |
| New: Collection "Missing" filter toggle | Filter chip or toggle in Collection toolbar. |

---

## Architecture

### Overview

This is a vocabulary rename with one genuinely new capability (Claimed detection) and one schema addition (`missing` column). The structural change is smaller than it appears — the hardest part is the codemod breadth, not algorithmic complexity. The existing `fetchEnrichedSupply` query already returns all the data needed for Claimed detection; `builder-card-status.ts` already implements the exact logic (called `over_allocated` there). This work unifies two parallel classification engines into one.

### Schema Migration (019)

**New migration:** `supabase/migrations/019_taxonomy_rename.sql`

```sql
-- 1. Add missing column to physical_copies
ALTER TABLE physical_copies
  ADD COLUMN missing BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_physical_copies_missing
  ON physical_copies(missing) WHERE missing = true;

-- 2. Update deck_cards.ownership_status CHECK constraint
-- Old values: 'original', 'proxy', 'not_owned' (plus NULL and 'generic')
-- New values: 'original', 'proxy' (plus NULL and 'generic')
-- 'not_owned' is removed — unresolved slots have NULL ownership_status
ALTER TABLE deck_cards
  DROP CONSTRAINT IF EXISTS deck_cards_ownership_status_check;

ALTER TABLE deck_cards
  ADD CONSTRAINT deck_cards_ownership_status_check
  CHECK (ownership_status IS NULL OR ownership_status IN ('original', 'proxy', 'generic'));

-- 3. Migrate 'not_owned' → NULL (these are unresolved slots — their status
-- is now computed dynamically as unallocated/claimed/unowned, not stored)
UPDATE deck_cards
  SET ownership_status = NULL
  WHERE ownership_status = 'not_owned';

-- 4. Update batch_assign_deck RPC to match new constraint
-- (the RPC writes ownership_status — it must not write 'not_owned')
CREATE OR REPLACE FUNCTION batch_assign_deck(p_assignments jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Clear source assignments (Tier 3/4 reassigns)
  UPDATE deck_cards
  SET physical_copy_id = NULL, ownership_status = NULL
  WHERE id IN (
    SELECT (a->>'clear_deck_cards_id')::bigint
    FROM jsonb_array_elements(p_assignments) AS a
    WHERE a->>'clear_deck_cards_id' IS NOT NULL
  );

  -- Apply new assignments
  UPDATE deck_cards dc
  SET
    physical_copy_id = (a->>'physical_copy_id')::bigint,
    ownership_status = a->>'ownership_status'
  FROM (
    SELECT
      (elem->>'deck_cards_id')::bigint AS deck_cards_id,
      (elem->>'physical_copy_id')::bigint AS physical_copy_id,
      elem->>'ownership_status' AS ownership_status
    FROM jsonb_array_elements(p_assignments) AS elem
  ) a
  WHERE dc.id = a.deck_cards_id;
END;
$$;
```

**Rationale for removing `not_owned` from stored values:** The old system stored `ownership_status = 'not_owned'` as a denormalized snapshot. The new system computes unresolved status dynamically (unallocated vs. claimed vs. unowned) because the classification depends on the *current* state of other decks' assignments — a value that changes without this deck being touched. Storing it would require recomputing on every external change. `NULL` means "unresolved — compute at read time."

### Type Changes

**`src/lib/card-status.ts` — the primary rewrite:**

```typescript
// New type
export type CardSlotStatus = 'original' | 'proxy' | 'unallocated' | 'claimed' | 'unowned' | 'generic_land'

// classifySlotStatus becomes:
export function classifySlotStatus(
  physicalCopyId: number | null,
  isProxy: boolean | null
): CardSlotStatus {
  if (physicalCopyId !== null) {
    return isProxy ? 'proxy' : 'original'
  }
  return 'unallocated' // Default for unresolved — batch computation refines to claimed/unowned
}
```

**`computeUnresolvedStatuses` — extended to three-way classification:**

Currently returns `Map<cardName, 'unallocated' | 'unowned'>`. Extended to `Map<cardName, 'unallocated' | 'claimed' | 'unowned'>`.

The key change: instead of just checking "does a physical copy exist?" (current), also check "is every copy assigned to a deck?"

```typescript
// Pseudocode for the new logic:
// 1. Resolve card_names → card_definition_ids (unchanged)
// 2. Fetch physical_copies for those defs WHERE missing = false
// 3. For each card_definition_id that has copies:
//    - LEFT JOIN deck_cards on physical_copy_id to check assignment
//    - If ANY copy has no deck_cards link → 'unallocated' (free copy exists)
//    - If ALL copies have a deck_cards link → 'claimed' (all held)
// 4. Cards with zero non-missing copies → 'unowned'
```

**Feasibility assessment:** This adds one additional query compared to the current implementation. The current `computeUnresolvedStatuses` does:
1. Resolve names → def IDs (paginated)
2. Check which def IDs have physical_copies rows

The new version needs step 2 to also know which copies are free vs. held. Two approaches:

- **Option A (recommended):** Fetch `physical_copies.id` + join `deck_cards.physical_copy_id` in one query. PostgREST supports this via the existing FK. The join returns NULL for free copies. Count free vs. total per card_definition_id in JavaScript. No new index needed — `idx_deck_cards_physical_copy_id` already exists.

- **Option B (if A is too slow at scale):** Materialize a `free_copy_count` per card_definition_id using a Postgres view or RPC. Only pursue if Option A shows measurable latency on the 100-card batch (unlikely for this single-user app with ~2400 card_definitions).

**Query shape (Option A):**

```typescript
const { data: copies } = await supabase
  .from('physical_copies')
  .select('id, card_definition_id, deck_cards!deck_cards_physical_copy_id_fkey(id)')
  .eq('user_id', userId)
  .eq('missing', false)
  .in('card_definition_id', defIdsToCheck)
```

For each `card_definition_id`, if any copy has `deck_cards: []` (empty array = no assignment), the card is `unallocated`. If all copies have `deck_cards: [{ id }]`, the card is `claimed`. Pagination applies per the Supabase steering rule (table has ~3400 rows, but narrowed by `IN` clause to at most ~100 def IDs per deck).

### Module Merge Plan

**Delete `src/lib/builder-card-status.ts`** — its logic merges into `card-status.ts`.

The builder-search API (`/api/cards/builder-status/route.ts`) currently calls `computeBuilderCardStatuses()`. After the merge, it calls the same unified engine — `computeUnresolvedStatuses` for batch classification, supplemented with `fetchEnrichedSupply` for the `heldBy` detail on Claimed cards.

**New unified flow:**

| Consumer | Currently calls | After merge calls |
|----------|----------------|-------------------|
| Cards Tab (`/api/decks/[id]/card-statuses`) | `computeDeckCardStatuses()` | `computeDeckCardStatuses()` (same name, new return values) |
| Builder search (`/api/cards/builder-status`) | `computeBuilderCardStatuses()` | `computeDeckCardStatuses()` + `fetchEnrichedSupply()` for heldBy detail |
| Picklist | `getRankedCandidates()` | Unchanged — already uses the enriched supply |

**Component merge:** `BuilderStatusBadge.tsx` and the inline badge rendering in `CardsTab.tsx` merge into a new `CardSlotBadge.tsx`. The `BuilderStatusBadge` component has zero external importers (confirmed by grep) — it's only referenced in its own file. Safe to delete after creating the unified component.

### Missing Flag — Unlink Mechanics

Marking a copy as Missing is a direct update — simpler than the diff-based reimport reconciliation (TD-001). The reimport needed to detect which cards left vs. stayed; Missing is explicit and user-triggered.

**Write path:**

```typescript
async function markCopyMissing(physicalCopyId: number, userId: string): Promise<void> {
  const supabase = createAdminClient()

  // 1. Set missing = true
  await supabase
    .from('physical_copies')
    .update({ missing: true })
    .eq('id', physicalCopyId)
    .eq('user_id', userId)

  // 2. Unlink any deck_cards row pointing at this copy
  await supabase
    .from('deck_cards')
    .update({ physical_copy_id: null, ownership_status: null })
    .eq('physical_copy_id', physicalCopyId)
}
```

No transaction needed for atomicity — the two operations are idempotent and safe to retry. If step 2 fails, the slot just has a dangling FK to a Missing copy, which the next status computation will detect and classify as unresolved.

**Unmark (mark as found):**

```typescript
async function unmarkCopyMissing(physicalCopyId: number, userId: string): Promise<void> {
  await supabase
    .from('physical_copies')
    .update({ missing: false })
    .eq('id', physicalCopyId)
    .eq('user_id', userId)
  // Copy returns to Available pool. No auto-relink — user resolves via Picklist.
}
```

### API Route Changes

| Route | Change |
|-------|--------|
| `GET /api/decks/[id]/card-statuses` | Return new `CardSlotStatus` values. Update `counts` object keys: `original`, `proxy`, `unallocated`, `claimed`, `unowned`. |
| `GET /api/cards/builder-status` | Rewrite to call unified engine. Return same shape but with new status values. |
| `POST /api/physical-copies/[id]/missing` | **New route.** Sets `missing = true`, unlinks deck_cards. Returns affected deck IDs for client-side invalidation. |
| `DELETE /api/physical-copies/[id]/missing` | **New route.** Sets `missing = false`. Returns the copy's card name for pool refresh. |

### Codemod File List (Full Blast Radius)

Files requiring string-value changes (`'allocated'` → `'original'`, `'allocated_proxy'` → `'proxy'`, `'not_owned'` → removal, `'over_allocated'` → `'claimed'`):

| File | Change type |
|------|-------------|
| `src/lib/card-status.ts` | Type + logic rewrite (primary) |
| `src/lib/builder-card-status.ts` | **Delete** (merged into card-status.ts) |
| `src/lib/ownership-resolver.ts` | Remove `'not_owned'` writes; `denormaliseOwnership` sets NULL for unresolved |
| `src/lib/supply-pool.ts` | Update ownership_status values passed to `batchAssignDeck` |
| `src/lib/warm-start-resolve.ts` | Update ownership_status values in assignment objects |
| `src/lib/debrief-types.ts` | Update `DeckCardWithOwnership.ownership_status` type |
| `src/app/api/decks/[id]/card-statuses/route.ts` | Update count keys |
| `src/app/api/cards/builder-status/route.ts` | Rewrite to use unified engine |
| `src/app/api/allocation/route.ts` | Update ownership_status references |
| `src/components/CardsTab.tsx` | Update `StatusFilter` type, chip labels, chip colors |
| `src/components/BuilderStatusBadge.tsx` | **Delete** (replaced by CardSlotBadge) |
| `src/components/DeckTile.tsx` | Update completeness badge → "Unplayable" label |
| `src/components/StatusBadge.tsx` | "Boxed" → "Built" label |
| `src/types/supabase.ts` | Regenerate (Supabase CLI `gen types`) |
| `scripts/legacy-allocation-transfer.ts` | Update role mappings (or mark as legacy/dead) |

**Test files:**
| File | Change type |
|------|-------------|
| `src/app/api/allocation/route.test.ts` | Update mock ownership_status values |
| `src/app/api/allocation/__tests__/allocation-bug-condition.test.ts` | Update mock values |
| `src/lib/debrief-prompts.test.ts` | Update mock DeckCardWithOwnership values |
| `src/components/StatusBadge.test.tsx` | Update "Boxed" → "Built" assertions |

**Migration/RPC files:**
| File | Change type |
|------|-------------|
| `supabase/migrations/019_taxonomy_rename.sql` | **New** — schema changes |

### Data Model Summary

```
deck_cards
├── physical_copy_id: FK → physical_copies.id (nullable)
├── ownership_status: 'original' | 'proxy' | 'generic' | NULL
│   └── NULL = unresolved (status computed dynamically)
└── is_generic_land: boolean (exemption flag)

physical_copies
├── missing: boolean (default false) ← NEW
├── storage_location_id: FK → storage_locations.id (nullable)
└── [existing columns unchanged]

Computed at read time (not stored):
├── CardSlotStatus: 'original' | 'proxy' | 'unallocated' | 'claimed' | 'unowned' | 'generic_land'
└── Deck completeness: COUNT(physical_copy_id IS NOT NULL) / total
    └── Playable = 100/100, Unplayable = <100
```

### Cross-Cutting Concerns

**TanStack Query invalidation:** When a copy is marked Missing, the client must invalidate:
- `['decks', deckId, 'card-statuses']` — the affected deck's status computation
- `['decks']` — the Decks Grid (Playable/Unplayable badge may change)
- `['collection']` — the Collection view (copy count changes)

The `POST /api/physical-copies/[id]/missing` response returns `affectedDeckIds` so the client knows exactly what to invalidate.

**`ownership_status` on write path:** The `batch_assign_deck` RPC and `supply-pool.ts` write `ownership_status = 'original'` or `'proxy'` when assigning. They write `NULL` when clearing. The values `'original'` and `'proxy'` are unchanged — no write-path change needed for those. Only the `'not_owned'` value is removed (replaced by NULL).

---

## Operations

### Migration Rollout

**Strategy: Single deployment, no feature flag.**

Rationale: This is a single-user application deployed on Vercel (frontend) + Supabase (database). There are no concurrent users to worry about during migration. The migration is backward-compatible in the sense that the application won't crash if the migration runs before the code deploys — `NULL` ownership_status is already handled gracefully (treated as unresolved).

**Deployment order:**
1. Run migration 019 on Supabase (adds `missing` column, updates CHECK constraint, migrates `'not_owned'` → NULL, updates RPC)
2. Deploy code (new types, merged engine, new components)
3. Regenerate Supabase types (`supabase gen types typescript`)

If code deploys before migration (unlikely but safe): the old code will see `NULL` where it expected `'not_owned'` — existing logic already handles NULL gracefully (falls through to the default unresolved path in `classifySlotStatus`).

### Monitoring

**Classification accuracy (post-deploy spot check):**

Run a one-time verification query after deployment:

```sql
-- Cards classified as 'claimed' should have all copies assigned
-- For each card in a deck with status computed as 'claimed':
-- verify no free (non-missing) copy exists unlinked
SELECT pc.id, cd.card_name
FROM physical_copies pc
JOIN card_definitions cd ON cd.id = pc.card_definition_id
LEFT JOIN deck_cards dc ON dc.physical_copy_id = pc.id
WHERE pc.missing = false
  AND dc.id IS NULL  -- free copy
  AND cd.card_name IN (
    -- cards that the engine classified as 'claimed' for any deck
    -- (run computeDeckCardStatuses output against this)
  );
-- Should return 0 rows — any result indicates a misclassification
```

**Missing-triggered unlink monitoring:**

The `POST /api/physical-copies/[id]/missing` route should log:
- Which copy was marked Missing
- Which deck_cards rows were unlinked (if any)
- Which deck IDs lost completeness

For this single-user app, `console.log` at `info` level in the route handler is sufficient — visible in Vercel's function logs. No external alerting infrastructure needed.

**Runtime errors:**

Existing error handling in `card-status.ts` (catches Supabase query failures, returns fallback classifications) is preserved. The new `claimed` detection query failure falls back to classifying the slot as `'unallocated'` (safe default — tells the user a candidate might exist, which is better than falsely claiming no path to resolution).

### Cost & Performance

**New query cost for Claimed detection:** One additional PostgREST query per deck status computation (fetching physical_copies with deck_cards join). For a 100-card deck with ~20 unresolved names, this queries ~20 card_definition_ids against ~3400 physical_copies rows. The `IN` clause + existing index (`idx_physical_copies_card_definition_id`) keeps this fast. Expected latency: <100ms for the additional query on Supabase's managed Postgres.

**No new background jobs.** No cron. No materialized views. The computation is on-demand (API request triggers it) and cached client-side via TanStack Query with the existing `staleTime: 5 * 60 * 1000`.

### Rollback Plan

If the deployment causes issues:

1. **Code rollback:** Revert to previous Vercel deployment (instant via Vercel dashboard). The old code handles `NULL` ownership_status gracefully.
2. **Migration rollback (if needed):**

```sql
-- Revert: remove missing column
ALTER TABLE physical_copies DROP COLUMN IF EXISTS missing;

-- Revert: restore old CHECK constraint
ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS deck_cards_ownership_status_check;
ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_ownership_status_check
  CHECK (ownership_status IS NULL OR ownership_status IN ('original', 'proxy', 'not_owned', 'generic'));

-- Revert: restore not_owned values (set all NULLs back)
-- Note: this is lossy — we can't distinguish "was not_owned" from "was never computed"
-- For this single-user app, re-running the ownership resolver fixes it:
-- SELECT resolveOwnership() or equivalent manual trigger
```

The `missing` column removal is safe because no copies will have been marked Missing yet (no UI to trigger it until the new code deploys). The constraint rollback is safe because we're widening it (adding back `'not_owned'` as valid). The value restoration is the only lossy step — acceptable for a single-user app where the ownership resolver can recompute everything.
