# Oracle — Taxonomy, Refactor Alignment & Lifecycle Naming (Addendum 2, Revised)

> Layered on top of `oracle-allocation-picklist-kiro-handoff.md` and `oracle-allocation-picklist-addendum.md`.
> Does not replace either — but **Part B (taxonomy)** supersedes the status naming in both prior docs.
> Read the note at the top of Part B before touching any code that references the old names.

---

## What Changed Since the Last Version

- **Confirmed viable and unchanged:** Boxed → Built rename is display-label-only, no data migration (per Kiro's check of `STATUS_CONFIG`).
- **Settled:** Allocate-off means genuinely free — Tier 1/2, no confirmation — for other decks' candidate resolution. Was an open question; now resolved. Requires an `allocation-candidates.ts` change (see Part D).
- **Settled, and reversed from prior version:** Built decks never sit in an Allocate-off resting state. Only two things touch the Allocate flag: Reserve/Release on Brew decks, and the Built ↔ Archived transition (Break Down / Rebuild). See Part D.
- **New:** "Unavailable" is renamed to **Claimed** in the five-state taxonomy (Part B).
- **New:** A derived **Playable / Unplayable** status for Built decks (Part B).
- **Part C narrowed:** "Sandbox-preview status" only ever applies to Brew decks now, since Built decks don't have an off-resting-state to preview from.

---

## Part A — Refactor Audit Alignment

Unchanged from the prior version.

### 1. V1 Brew Mode

Not a product decision — finish the trace. Confirm whether any live page still renders a component using `useBrewSession.ts`. If nothing does, delete the 7 V1 brew routes, the hook, and the 6 dead components.

**Status (resolved 2026-07-13):** Trace completed. `useBrewSession` has zero page/component imports — only a stale test file. Hook deleted. V1 brew routes + MCP client confirmed for Phase 1 deletion.

### 2. Shared Cards / ProxyAllocationPanel → V2

Confirmed: migrate. Then delete `allocation.ts`, `allocation-resolver.ts`, `allocation-store.ts`, `collection-reallocator.ts`, and the `proxy_allocations` table.

### 3. Canonical Import Path

**Status (resolved 2026-07-13):** `/api/collection/import` IS the ongoing resync feature. `import-engine-v2.ts` is canonical. `import-engine.ts` only serves legacy `upsert` mode — retire once that branch is removed.

### 4. Rollup vs. Rollup-v2

**Status (resolved 2026-07-13):** They serve different purposes. Old rollup = fat Collection page response (pricing, printings). rollup-v2 = lean allocation status view. Both kept; rollup-v2 wired in when five-state taxonomy is surfaced on Collection.

### 5. MCP Client

Downstream of #1. Goes with V1 brew routes.

### 6. Deck Reimport

**Status (resolved 2026-07-13):** `deck-import-legacy.ts` does blind wipe-and-replace. No reconciliation. Needs full rewrite spec for diff-based reconciliation. Flagged for rebuild, not deletion.

### Priority Reordering (Still Standing)

The `card_name` → `card_definition_id` join-key fix should happen **before** dead-code cleanup — correctness risk > hygiene. Turn every "may be dead" into a confirmed reference trace before deleting.

---

## Part B — Unified Card-State Taxonomy

> **SUPERSEDES** the four-state system in Chunk 3 (`Allocated / Allocated · proxy / Unallocated / Unowned`) and the four-state system in Chunk 9 (`Owned / Proxy / Over-allocated / Unowned`). Replace both with one.

### The Five States

| State | Meaning |
|-------|---------|
| **Original** | Resolved with an owned, non-proxy card |
| **Proxy** | Resolved with an owned proxy |
| **Unallocated** | Not resolved, but a candidate exists (owned copy free, or reassignable) |
| **Claimed** | Not resolved, and every owned copy is currently held by another Built deck |
| **Unowned** | No copy exists anywhere in the collection |

### Rename Map for Existing Code/UI

| Old Name | New Name |
|----------|----------|
| Allocated | **Original** |
| Allocated · proxy | **Proxy** (flat peer state, not nested) |
| Over-allocated | **Claimed** |
| Unallocated | Unallocated (unchanged) |
| Unowned | Unowned (unchanged) |

### Why "Claimed," Not "Unavailable"

The card IS available — it's just held by a specific other deck, and reassigning it is a normal, one-click (with confirmation) action, not a dead end. "Unavailable" implies nothing can be done; "Claimed" correctly implies there's a specific deck holding it and a specific path to get it back.

**Display rule:** "Claimed" alone in tight spaces (grid tile border, filter chip). "Claimed by [Deck Name]" wherever there's room (Picklist row, card detail panel). Same data `shared_cards` already provides.

### Color

Keep Claimed in the **same amber family as Unallocated** — don't add a fourth hue. Differentiate the two by icon:
- **Claimed:** swap/arrows icon
- **Unallocated:** clock icon

Same pattern already used to tell Original apart from Proxy (solid vs. dashed border) without adding new colors. Unowned stays red-orange — it's the one state requiring buying or printing.

### Scope

This same five-state vocabulary applies identically whether the card is:
- Already in a deck (Cards tab)
- Being considered for addition (deck builder search results)

One taxonomy, not two.

### New: Playable / Unplayable (Derived, Built-Deck-Specific)

Not a new data field — a plain-language read of the existing Completeness count (`deck_cards.physical_copy_id IS NOT NULL` / total), scoped to Built decks specifically.

- **Playable** = 100/100 resolved
- **Unplayable** = anything less

Doesn't apply meaningfully to Brew decks (expected to be incomplete).

**Purpose:** Makes cross-deck reassignment visible without action on the losing deck's part. Example:
- Deck A (Built) has Gitrog, is Playable
- Deck B (Built) needs Gitrog, owns one copy, currently held by Deck A
- Deck B's Picklist shows Gitrog as "Claimed by Deck A"
- User reassigns (Tier 4, confirmation required)
- Deck B becomes Playable. Deck A becomes Unplayable.

**Surface Playable/Unplayable on the Decks Grid**, not just deck detail — visible at a glance across all decks.

### Generic Lands — Exemption Flag, Not a Sixth State

Chunk 11's basic-land handling stands. Generic land slots are exempt from this taxonomy entirely. Model as a **flag** that skips taxonomy computation and display. A tracked land instance re-enters the normal five-state system.

### Missing (Terminal State — Physical-Copy Level)

Applies to `physical_copies` rows, not deck slots. Represents "I no longer physically have this card" — lost, damaged, sold, given away. Excludes from availability calculations without deleting the row. Don't let reimport reconciliation silently delete unmatched rows; mark them Missing instead.

### Sorted / Unsorted (Placement Axis — Independent)

Fourth axis, independent of Lifecycle, Allocate, and resolution taxonomy:
- In a deck (linked via `physical_copy_id`)
- In a specific storage location (`storage_location_id` set)
- **Unsorted** (owned, unlinked, no storage location)

**Rule:** Sorting status must **never gate resolution eligibility**. An Unsorted free card is exactly as valid a Tier 1/2 candidate as a sorted one.

---

## Part C — Brew-Deck Preview Status & Picklist-on-Transition

> Narrowed from prior version — only applies to Brew decks now, since Built decks no longer have an Allocate-off state.

### Brew-Deck Preview Status

The five-state taxonomy should display for a Brew deck's cards **even before Reserve is used** — representing potential availability ("if I Reserved this deck right now, what would each card resolve to") rather than a committed outcome.

Same computation as a Reserved or Built deck's real status; the difference is framing. Label it as a **preview** so it's clear nothing is committed yet.

### Picklist-on-Transition

**Reserving** a Brew deck, or **Rebuilding** an Archived one, should route directly into the Picklist rather than just flipping a flag.

### Picklist Candidate Ranking

Needs no new logic — existing Tier 1–5 order is the priority system. Confirmed, not open.

---

## Part D — Lifecycle Naming and the Allocation Action Model

### Boxed → Built: Confirmed, Display-Only

Kiro confirmed: `STATUS_CONFIG` maps internal enum values to display labels. Changing `boxed.label` from `'Boxed'` to `'Built'` is a one-line change. All branching logic uses `'boxed'` directly — no data migration needed.

Sequence: **Brew → Built → Archived**

All existing behavioral rules stay identical (delete protection, Tier 4 confirmation on reassignment from Built).

### The Allocation Action Model: Reserve / Release / Break Down / Rebuild

This replaces the "Sandbox, redefined" section from the prior version entirely.

#### Brew Decks — Reserve / Release

| Action | Effect |
|--------|--------|
| **Reserve** (turn Allocate on) | "Pulling these cards aside for this brew — other decks can't have them without Tier 3 reassignment" |
| **Release** (turn Allocate off) | "Never mind, put them back" |

- Default: Allocate off (cards not claimed)
- The deck stays in Brew either way
- **This is the only place a manual Allocate toggle exists**

#### Built Decks — Always Allocate On, No Toggle

A Built deck's cards are committed, full stop. No toggle — the only way off is Break Down.

#### Break Down (Built → Archived)

A single, one-way, confirmation-gated action:
1. Releases all cards back to circulation (unlinks `physical_copy_id` on all `deck_cards` rows)
2. Transitions the deck to Archived
3. Forces Allocate off

**Not a toggle.** Confirmation: "Break down this deck? Its cards will be released back to your collection and may be claimed by other decks."

#### Rebuild (Archived → Built)

The reverse path:
1. Transitions deck back to Built
2. Sets Allocate on
3. Routes directly into the **Picklist** to re-claim cards (some may have been taken by other decks in the meantime)

#### Why Built Never Needs "Release Without Archiving"

Cross-deck sharing doesn't require the giving deck to do anything. It happens through the receiving deck's Picklist — a Tier 4 pull, with confirmation. Deck A stays Built, stays Allocate-on, never gets touched directly, and simply becomes **Unplayable** (Part B) as a side effect of losing a card. No scenario requires Built decks to sit in an off state.

### Implementation: Allocate-Off = Genuinely Free

**Settled (was open in prior version).** Allocate-off means the linked cards are Tier 1/2 candidates for other decks — free, no confirmation required.

This applies to:
- Unreserved Brew decks (default state)
- Archived decks (post-Break Down)

Update `allocation-candidates.ts`:
- If a physical copy is linked to a `deck_cards` row, and that deck has `allocate = false` → treat as **free** (Tier 1 original / Tier 2 proxy)
- Reserved Brew decks (`allocate = true`) → Tier 3 (named source, no confirmation)
- Built decks (`allocate = true`, always) → Tier 4 (named source, confirmation required)

### Sandbox — The Word

Fully free now. Nothing in the current model uses it. Reserved for a distinct, not-yet-built feature: duplicating an existing deck into a new, fully independent record for experimentation. Out of scope here — flagged so the name isn't reused.

### Cost

"Boxed" and "Sandbox" both appear throughout prior docs and mockups. This is naming + behavior together — expect a real pass over existing material.

---

## Open Questions — Carried Forward or New

| Question | Source | Status | Blocks |
|----------|--------|--------|--------|
| Is `collection_rollup` a plain view or materialized? | Addendum 1 | **Resolved** — plain view (migrations 012/014) | — |
| Is `shared_cards` live, and detailed enough to name specific contending decks? | Addendum 1 | Unconfirmed | Part B (Claimed display) |
| `card_name` vs. `oracle_id` as join key | Part A | Being actioned — `card_definition_id` backfill to `deck_cards` | Taxonomy computation |
| ~~Does a sandboxed deck's resolved card surface as Tier 4?~~ | Prior version | **Resolved** — see Part D. Tier 1/2 for Allocate-off sources, Tier 3 for Reserved Brew, Tier 4 for Built | — |
| ~~Display-only vs. full enum rename for Boxed → Built?~~ | Part D | **Resolved** — display-only, confirmed viable | — |
| Fork/duplicate-to-experiment feature | Part D | Deferred | Nothing currently |
