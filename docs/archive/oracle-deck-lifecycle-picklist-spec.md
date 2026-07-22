# Oracle — deck lifecycle & picklist spec

Version 1.0 — draft for Kiro implementation. Companion to `oracle-status-color-spec.md` and `oracle-component-layout-spec.md`. Living document; update in place.

## 1. Purpose

Defines deck lifecycle states, the Allocate toggle, deck completeness as a computed fact independent of lifecycle, and the picklist workflow that physically reconciles a deck's card list against real owned copies. Supersedes the earlier "Active/Inactive" deck status concept referenced in prior specs — that binary conflated two questions that need to stay separate (see Section 2).

**Confirmed data model** (per Kiro, verified against real schema):

- Brew Canvas writes to an in-memory `DeckState`, autosaved every 2s into `brew_sessions.skeleton_json` — a session buffer, not `deck_cards`. **No `deck_cards` rows exist until the explicit Save action** (`POST /api/ai/brew/save`), which bulk-inserts by `card_name`.
- `deck_cards` has its own row identity (`id`), plus a **nullable** `physical_copy_id` FK to `physical_copies` and an `ownership_status` field (`'original'` / `'proxy'`). Both start unset at Save time and are written later by resolution.
- `physical_copies` is genuinely instance-level — one row per physical card, with `card_definition_id`, `is_proxy`, `storage_location_id`, etc. This is solid ground; the ownership-axis and fully-allocated-via-proxy work in the color spec is buildable on it as designed.
- The legacy `collection` table (quantity-grouped, no instance identity) is retired/read-only as of migration 010 and irrelevant to this spec.
- An **Allocation Resolver already exists** and currently runs automatically post-save, silently writing `physical_copy_id` + `ownership_status`. This predates and was not designed against the interactive picklist in Section 6.

**Hard blocker, read first:** the picklist in Section 6 was designed as an interactive, per-row, confirmation-gated process that explicitly forbids silent auto-cascading (Section 6d). The existing Allocation Resolver is the opposite of that — an automatic process that writes without confirmation. These cannot both run against the same `deck_cards` rows as currently designed; the existing resolver could easily do the exact thing Section 6d forbids (silently pull from a Boxed deck, auto-fill a gap) before a person ever sees a picklist.

**Confirmed, not just suspected:** the existing resolver's supply query (`buildAllocationInputV2`) has no join against `deck_cards.physical_copy_id` and returns every owned non-proxy copy, free or not. It only works safely today because `runAllocationResolver` clears all `physical_copy_id` links on active decks immediately before recomputing — a full clear-and-recompute model, not an incremental one.

**Decision, not an open question:** that model is incompatible with this spec. Run automatically, it would periodically clear and reshuffle assignments on Boxed decks — silently violating the completeness guarantee (Section 5) and the exact-restore undo guarantee (Section 8) on decks nobody touched. `applyAllocationOutputV2` (the write layer) should not run automatically on brew-save or import for any deck going forward. `computeAllocationV2` and `scoreCopy` are retained as the ranking logic behind both the manual picklist (Section 6) and auto-assign-from-storage (Section 6e) — but all writes to `physical_copy_id` now happen only through the confirmed, scoped actions defined in this spec.

---

## 2. Two independent axes (not one status field)

Same discipline as the ownership/allocation split in the color spec — don't fuse unrelated questions into one field.

- **Lifecycle** — what stage this deck is in, by user intent: `Brew` → `Boxed` → `Archived`
- **Allocate** — whether this deck's cards currently count against the collection: boolean, independent of lifecycle stage
- **Completeness** — a computed fact: does this deck currently have all 100 required physical copies resolved? Independent of both of the above, and can change without the user touching lifecycle or Allocate at all (see Section 5)

A deck can be Boxed, Allocate = on, and Incomplete, all simultaneously. None of these three facts implies any of the others.

---

## 3. Lifecycle states

Confirmed against the real schema (current constraint: `CHECK (status IN ('active', 'draft', 'inactive'))`, post-migration-005 — an earlier `'concept'` value was already collapsed into `'draft'` before this spec, so there's no hidden merge happening here):

| State | Maps from | Meaning | Deletable? |
|---|---|---|---|
| **Brew** | `'draft'` (direct, clean mapping — only one "building" state exists today) | Commander picked, cards being placed. Covers everything from an empty canvas through a fully-named 100-card list that hasn't been physically resolved yet. | Yes |
| **Boxed** | *(new — no current equivalent)* | All 100 cards physically resolved to specific owned copies. Considered playable. | **No** — same protection `'active'` currently has via `canDeleteDeck`. Locked-in, fully-resolved work shouldn't be casually deletable; must be Archived first. |
| **Archived** | `'inactive'` (direct mapping) | Shelved. Cards freed back to the pool. | Yes |

Transition to Boxed is **manual**, triggered by the person once the picklist reaches 100/100 — never automatic on hitting the count, since it's a deliberate declaration, not a side effect of a checkbox.

**Migration, confirmed feasible:**

```sql
ALTER TABLE decks DROP CONSTRAINT decks_status_check;
ALTER TABLE decks ADD CONSTRAINT decks_status_check 
  CHECK (status IN ('brew', 'boxed', 'archived'));
```

No data `UPDATE` step needed — the database is being wiped clean rather than migrated, so there's no existing `'active'`/`'draft'`/`'inactive'` data to carry forward. Confirmed none of the three new values reuse the literal string `'active'`, which is what keeps `runAllocationResolver`'s `status = 'active'` filter structurally inert against every deck under this model (Section 6f).

**Also required in the same migration — the `allocate` column doesn't exist yet:**

```sql
ALTER TABLE decks ADD COLUMN allocate BOOLEAN NOT NULL DEFAULT false;
```

Defaulting to `false` at the schema level is deliberately the safe choice, not a statement about Boxed decks' eventual default — application logic sets the real per-stage default (Section 4) explicitly whenever a deck is created or transitions stage. The column default only matters as a fallback if a row is ever inserted through a path that skips that logic.

---

## 4. Allocate toggle

Governs whether this deck's `deck_cards` rows count against collection rollups (OWNED/PROXY/ALLOC/SHORT everywhere else in the app). Independent of lifecycle stage.

| Stage | Default | Overridable? |
|---|---|---|
| Brew | Off (sandbox) | Yes — flip on to have an in-progress deck count early |
| Boxed | On | Yes — flip off to keep a finished deck in sandbox mode |
| Archived | **Forced off, toggle disabled** | No — cannot be re-enabled without first un-archiving |

**Only takes effect after the first Save.** Before that, the deck exists only as `brew_sessions.skeleton_json` — there are no `deck_cards` rows for the toggle to apply to, regardless of its position. "Brewing counts early" in practice means: hit Save at least once (creating unresolved `deck_cards` rows), flip Allocate on, and whatever the picklist has resolved so far counts — not that an in-progress, unsaved canvas session counts.

**Control location:** the toggle lives on the deck profile page, not the Decks grid — that's where a person goes to act on a specific deck's allocation state. A lightweight passive indicator still belongs on the Decks grid card itself (small "Sandbox" or equivalent badge) so an atypical off-when-expected-on Boxed deck is visible without opening it — the toggle being profile-page-only doesn't remove the need to *see* the state from the grid, only where you *change* it.

**Confirmation modal gates the off transition only**, not both directions — turning Allocate off creates a real physical/digital mismatch risk worth naming explicitly: the deck's cards stay physically together, but the system now treats them as available, meaning another deck's picklist could suggest pulling a "spare" copy that's actually still sitting in this box. Turning Allocate back on returns to the expected default and needs no confirmation.

> "Turning this off means these cards will no longer be reserved against your collection. They may show as available to other decks even though they're still physically in this deck. Continue?"

**Unarchiving:** a deck returning from Archived to Boxed comes back with Allocate **off**, requiring a conscious re-enable. Never silently restores to its prior on-state — an allocation change with no visible trigger is exactly the kind of surprise the quiet-default/loud-exception principle exists to prevent.

**Visual requirement:** a Boxed deck with Allocate manually off is an atypical combination and needs its own small flag on the Decks grid — otherwise it's invisible why a seemingly-finished deck isn't drawing on the collection.

---

## 5. Completeness (computed, not a lifecycle state)

A Boxed deck's card count can drop below 100 as a *side effect* of an action taken on a different deck (a card gets pulled from it via another deck's picklist). This does not change its lifecycle status — it stays Boxed, because that's still true as a statement of intent — but it gets a computed badge layered on top.

| State | Badge | Token |
|---|---|---|
| Complete (100/100) | None | — |
| Incomplete (<100) | Loud, e.g. "97/100" | Reuses `--status-over` (`#FF5F1F`) + `ti-alert-triangle` — same family as over-allocated, since the underlying meaning is the same shape of problem: "this doesn't have what it needs" |

Must render directly on the Decks grid card, not buried in a detail view — this is the one place someone might grab a deck to play without checking further.

Scope: completeness only applies to decks. Pulling from storage never creates a "gap" — there's no deck on the other end with an expectation to violate.

---

## 6. Picklist

Generated from within Brew status once a deck's 100-card list is named but not yet physically resolved — the tool that bridges "100 cards chosen" to "100 cards Boxed." Live/computed, not a saved snapshot: reflects other picklists' and other decks' changes in real time.

### 6a. Source priority order

Auto-resolves each row to the least disruptive available option, in this order:

1. Unallocated owned original in storage
2. Unallocated proxy already in storage
3. Reassign from another **Brew**-status deck
4. Reassign from another **Boxed**-status deck
5. Print a new proxy

**Tier 4 is excluded from auto-default entirely.** It only ever appears as a manual choice, never auto-selected, and is always gated behind the confirmation dialog in Section 6c — regardless of whether the person reached it via auto-suggestion or picked it themselves from an expanded candidate list.

**Tier 5 only applies when nothing above exists anywhere in the collection** — not just nothing unallocated. It's the only tier that creates a new `physical_copies` row rather than moving an existing one, so it gets a distinct button, not a checkbox (Section 6b).

### 6b. Row interaction

Grouped by source type for practical picking (storage rows further grouped by location, so a physical pass through one box or binder resolves several rows at once).

| Tier | Control | Friction |
|---|---|---|
| 1–3 | Checkbox | None beyond the click — low-stakes, reversible, done up to 100 times per deck |
| 4 | Checkbox, opens confirmation modal | Modal must be confirmed before anything commits |
| 5 | Dedicated button, not a checkbox | Creates a new proxy instance and assigns it in one action |

**Multi-source rows:** when more than one candidate exists at the same tier (e.g. the same card unallocated in two different storage locations), the row shows a count and expands to list each candidate with its location, letting the person swap the selection. The row is not blocked waiting for a decision — a default is chosen automatically per Section 6a, expansion is optional.

### 6c. Confirmation dialog (Tier 4 only)

Triggered any time a Tier 4 source is committed, whether auto-suggested or manually chosen from an expanded list:

> "This is the only copy of [card] and it's currently in [Boxed deck]. Removing it will make that deck incomplete ([N-1]/100) and no longer playable. Continue?"

Cancel: nothing happens. Confirm: proceeds exactly as any other row commit (Section 7), plus the source deck's completeness badge recomputes.

### 6d. No auto-fill / no cascade

**Explicit non-goal, not an oversight:** pulling a card out of a deck (Tier 3/4) never triggers the system to automatically backfill the resulting gap, even if a spare copy exists elsewhere in the collection that could fill it.

The gap simply falls back to unresolved in the source deck's own picklist, ranked through the same priority order as any other row, next time that deck's picklist is viewed. A spare copy in storage will show up as the suggested default there — one click away, made by the person, never made silently on their behalf.

Rationale: the app's value depends on mirroring physical reality exactly. The person only physically moved one card. Auto-filling the gap with a different card they never touched would make the data claim an action that didn't happen — the same trust violation that exact-restore undo (Section 8) exists to prevent, triggered from the opposite direction.

This must be called out explicitly in implementation, since "keep decks automatically complete" is the kind of feature a well-intentioned build might reach for as an obvious improvement. It is not one.

### 6e. Auto-assign from storage (bulk, on import)

When a deck is first imported, most cards likely already exist unclaimed in storage — requiring a manual click per row for all 100 is unnecessary friction for what's usually the majority case. Auto-assign runs automatically at import time, but strictly scoped to Tier 1–2 of Section 6a (unallocated original or proxy already in storage) — it never reaches into another deck's `deck_cards`, never creates a new proxy, and therefore never touches anything the confirmation gate (6c), completeness (Section 5), or no-cascade rule (6d) exist to protect. Nothing it does needs a confirmation dialog, because nothing it does can make another deck incomplete.

**Depends on an enriched supply query — the existing `buildAllocationInputV2` supply fetch cannot be reused as-is.** Confirmed: its `physical_copies` query has no join against `deck_cards.physical_copy_id` and returns every non-proxy copy the person owns, free or not. It only works safely today because the existing resolver clears all `physical_copy_id` links on active decks immediately before recomputing — a full clear-and-recompute model.

That model is incompatible with this spec as a whole, not just with auto-assign: it would periodically clear and reshuffle assignments on **Boxed** decks, silently violating the completeness guarantee in Section 5 and the exact-restore undo guarantee in Section 8. **`applyAllocationOutputV2` (the write layer) should not run automatically on brew-save or import for any deck going forward.** `computeAllocationV2` and `scoreCopy` are still valuable — they become the ranking function behind both auto-assign and the manual picklist's suggested defaults — but nothing should write to `physical_copy_id` outside the confirmed, per-row (or scoped bulk) actions defined in this spec.

**Confirmed feasible against the real schema** — final required shape for the enriched supply query:

```
physical_copies: id, card_definition_id, scryfall_printing_id, is_foil,
                 condition, is_proxy, storage_location_id
  → nested: storage_locations(name)
  → nested: deck_cards!deck_cards_physical_copy_id_fkey(
              id, deck_id,
              decks!deck_cards_deck_id_fkey(name, status)
            )
```

No `is_proxy` filter at the query level — proxies are returned and tagged, letting downstream logic (Tier 2 vs. Tier 1) decide, not the fetch itself.

**Required pre-step, in order, before the partial unique index can be created:**

```sql
-- 1. Find existing duplicate claims first
SELECT physical_copy_id, COUNT(*) 
FROM deck_cards 
WHERE physical_copy_id IS NOT NULL 
GROUP BY physical_copy_id 
HAVING COUNT(*) > 1;

-- 2. Null out duplicates (keep one, clear the rest) if any are found

-- 3. Only then:
CREATE UNIQUE INDEX idx_deck_cards_unique_physical_copy
  ON deck_cards(physical_copy_id)
  WHERE physical_copy_id IS NOT NULL;
```

Skipping step 1 means the index creation simply fails if any duplicates already exist — cheap to check, and worth doing regardless of whether the query returns anything, since a non-empty result is itself evidence of exactly the kind of double-claim this whole index exists to prevent.

**Auto-assigned rows stay visibly distinct in the picklist**, not indistinguishable from manually-confirmed ones — a person reviewing a freshly-imported deck should see at a glance which rows were matched automatically versus which still need attention. Undo works identically regardless of origin (Section 8 restores based on what a row displaced, not how it got resolved).

Import concurrency is not a concern — only one deck can be imported at a time, so the incremental claim-and-check pattern used for ordinary picklist commits (Section 7) isn't required for the bulk auto-assign pass specifically.

### 6f. Retiring existing automatic call sites

Confirmed via codebase audit: seven call sites currently invoke `runAllocationResolver` automatically or via a "recalculate" action. Critically, both its clear step and its demand-building step (`computeAllocationV2`) filter to `status = 'active'` — which means **the moment the new lifecycle values are genuinely distinct strings (never reusing `'active'`), this entire code path becomes structurally blind to every deck under the new model, automatically.** That's a hard requirement for the migration, not an implementation detail: if "Boxed" is ever stored as `'active'` under the hood for backward-compatibility convenience, this protection silently disappears.

Structural inertness isn't the same as correctness, though — several of these sites represent real functionality that needs replacing, not orphaning:

| Site | Trigger | Disposition |
|---|---|---|
| `deck-import.ts:172`, `:305` | URL import / reimport | **Repoint to Section 6e's auto-assign.** This is the exact "deck probably already exists in storage" case 6e was built for — real, wanted behavior, just via the non-destructive method now. |
| Collection replace / import routes | Collection changes | **Retire, no replacement.** A collection edit shouldn't trigger a resolve pass across every deck. If it invalidates an existing link (e.g. a linked physical copy gets deleted), that surfaces as a completeness drop on the affected deck (Section 5) and appears in that deck's own picklist — not a background sweep. |
| `POST /api/allocation/resolve` | Manual, global | **Redesign.** Legitimate need, wrong mechanism — becomes "run auto-assign for all Brew-stage decks' unresolved slots, free storage only," never clearing existing assignments. |
| `POST /api/decks/[id]/allocate` | Manual, per-deck | **Redesign, and fix a pre-existing bug.** Currently runs the full unscoped resolver despite being presented as per-deck — already misleading users today, independent of this spec. Becomes 6e's auto-assign, properly scoped to that one deck's unresolved rows. |
| `decks/[id]/status/route.ts:124` | Draft → active transition | **Retire outright, no replacement.** Under Section 3, a deck can't reach Boxed until its picklist already shows 100/100 — resolution has already happened incrementally by the time this would fire. |

`applyAllocationOutputV2` has exactly one caller (`runAllocationResolver` itself) — no other code writes to `physical_copy_id` directly, so there's no hidden ninth path to account for.

---

## 7. Transaction mechanics — when counts update

Immediate and atomic, per row, never batched:

1. Person physically pulls the card.
2. Clicks the row's checkbox (Tiers 1–3) or confirms the modal (Tier 4) or clicks the dedicated button (Tier 5).
3. One atomic write: previous claim (source deck's `deck_cards` row, or storage-location marker) is cleared; destination deck's `deck_cards` row is assigned to that `physical_copy_id`. For Tier 5, a new `physical_copies` row (`is_proxy = true`) is created and assigned in the same transaction.
4. Counts recompute immediately — source and destination both — and propagate everywhere they're shown: Collection, Allocation, the destination deck's picklist progress, the source deck's completeness badge if applicable.
5. Any other open picklist referencing the same card re-ranks its candidates on next read, since the pool has changed.

Batching was considered and rejected: a "stage now, commit later" model would let two concurrent picklists both believe the same physical copy is still available, recreating exactly the race condition immediate-commit exists to prevent.

---

## 8. Undo

Un-ticking a row must **exactly restore** the card to its prior source — not drop it back to "unresolved" and re-rank fresh, which could land it somewhere different from where it started and would make "undo" not actually undo.

**Failure mode:** if the prior source has been claimed by something else in the interim (e.g. a different picklist reassigned that same slot to a third deck before this undo happened), exact restore is impossible.

**Resolution: block, don't silently fall back.** Tell the person why ("can't restore — that slot's been claimed elsewhere since") and let them resolve it manually. A silent fallback to unresolved-and-re-rank would sometimes quietly do something different from what was asked, which is worse than an explicit failure — especially in a workflow where the person is trusting the app's state to match cards they're physically holding.

---

## 9. Outstanding

All prior open questions in this document are resolved — each is documented inline, in bold, at the point it's resolved (Sections 1, 3, 4, 6e, 6f). Not repeated here as a parallel changelog. What remains is implementation sequencing, not open decisions:

- [ ] **Foundation, no dependencies:** fix the stale `brew-v2-types.ts` type declaration (`'active' | 'draft' | 'concept'`) alongside the Section 3 migration, so it doesn't silently permit an invalid value once `'concept'` and the old three-value set are gone.
- [ ] **Foundation, ordered:** run the duplicate-claim check (Section 6e) before creating the partial unique index — index creation fails outright if duplicates exist, so this can't be skipped or reordered.
- [ ] **Blocked on the enriched supply query existing:** the five redesigned/repointed call sites in Section 6f all depend on it — don't start this until Phase 1 below is complete.
- [ ] **Blocked on real data, not on design:** storage-location grouping for picklist Tier 1 rows (Section 6b) can't be finalized until storage locations actually have data in them.
