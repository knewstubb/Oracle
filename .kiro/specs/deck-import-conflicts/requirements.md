# Requirements: Deck Import Conflicts

> Status: Draft
> Authored: 2026-09-16 by Product Manager (Marty), from user + Delivery Lead (Gene) design session
> Related specs: `card-status-taxonomy-rename/`, `generic-basic-lands/`, `proxy-ownership-layer/`, `collection-foundation/`

## 1. Problem Statement

When a user imports their Archidekt collection and decks, decks brought in as **Active** (physically owned and played) assert a physical reality: their cards are **sleeved** — the real copy is in that deck. But a user commonly runs the same card across multiple Active decks while owning only one physical copy of a given printing. On import this produces a physical impossibility: the same owned copy is claimed as sleeved by two or more decks at once.

The steady-state app already manages allocation gracefully (one physical copy lives in one place; other decks show it as claimable). But that model assumes the data started consistent. At **initial import**, the incoming data is inconsistent by nature, and the user must reconcile it — decide which deck actually holds each scarce copy, and mark the rest as proxy or unallocated — before the collection can settle into the steady-state model.

The previous "conflict" metric counted intra-batch contention over *any* card (including planned/theorycrafted claims and basic lands), producing large, meaningless numbers (e.g. 698). That is the wrong signal. A conflict is specifically: **more sleeved instances of a specific printing than physical copies owned.**

## 2. Outcome

After import, the user sees:
- A clear list of imported decks (with correct, format-aware card counts).
- A precise list of genuine conflicts: for each over-committed printing — the card, quantity owned, quantity sleeved, and every deck it is sleeved into.
- The ability to resolve each conflict on the import screen (Release the excess to Planned, or Convert to a sleeved Proxy) until sleeved ≤ owned.

Once resolved, the collection reconciles into the normal steady-state allocation model with no lingering impossible states.

## 3. Users

| User | Role |
|------|------|
| Collection owner (single-user, personal app) | Imports decks/collection from Archidekt; reconciles physical reality of scarce copies across their Active decks. |

## 4. State Taxonomy (anchoring reference)

Card allocation state is the product of two dimensions plus exemptions and one overlay.

**Dimension A — Supply tier** (what the user owns for the *wanted printing*):
- None — owns no copy of this card
- Exact — owns the specific printing the slot wants
- Alternate — owns a *different* printing of the same card (never the wanted one)
- Proxy — has a proxy

**Dimension B — Allocation** (where the copy is):
- Sleeved — the exact owned copy is committed to *this* deck
- Claimed — the copy is committed to *another* deck
- Available — not in use

### Full state enum (12)

| State | Meaning |
|-------|---------|
| `Unowned` | Owns nothing of this card; not wishlisted. |
| `Wishlisted` | Owns nothing; flagged to acquire. **Reserved — separate future feature, not built in this spec.** |
| `Available` | Owns the exact printing; not in use. |
| `Alternate Available` | Owns a different printing; not in use. |
| `Claimed` | Owns the exact printing; committed to another deck. |
| `Alternate Claimed` | Owns a different printing; committed to another deck. |
| `Sleeved` | Owns the **exact** printing and it is committed to *this* deck. |
| `Available Proxy` | Has a proxy; not in use. |
| `Claimed Proxy` | Has a proxy; committed to another deck. |
| `Sleeved Proxy` | Has a proxy committed to *this* deck. |
| `Generic Land` | Basic land; exempt from tracking and conflicts. |
| `Conflicted` | **Derived overlay** (not a slot state): for a printing, sleeved-count > owned-count. Badges all involved slots. |

### Rules embedded in the taxonomy

- **Alternate can never be Sleeved.** Sleeved requires the exact owned printing physically in the deck. If a user commits an alternate printing to a slot, that printing becomes the exact copy for the slot (i.e. it is Sleeved as itself), so there is no "Alternate Sleeved."
- **`Conflicted` is a derived, printing-level overlay**, not a per-slot status. Every over-sleeved slot remains genuinely `Sleeved`; the conflict is a property of the printing across decks. This supports the no-deck-bias requirement (all involved slots are equally Sleeved until the user resolves).
- **Basic lands** are `Generic Land` and are excluded from conflict detection entirely.
- **Proxies** are excluded when counting owned physical copies.

### Naming reconciliation (retire "Theorycraft" from UI)

Two independent axes, one word-pair each:

| Axis | Terms |
|------|-------|
| Deck lifecycle | **Active** (cards get sleeved) / **Brew** (cards stay planned) |
| Card allocation | **Sleeved** / **Planned** |

"Theorycraft" is retired from user-facing language; it was an allocation concept ("all cards planned") wearing a lifecycle label. Internal function names (e.g. `importDeckTheorycrafted`) may be renamed to `...Planned` for consistency (low-cost, optional).

## 5. User Stories & Acceptance Criteria

### 5.1 Detect deck format on import, allow override

**US-5.1.1** As a collection owner, I want each imported deck's format detected from Archidekt (with the ability to change it), so that card counts and singleton rules are correct per deck.

#### Acceptance Criteria
- WHEN a deck is imported from Archidekt, THE SYSTEM SHALL map the Archidekt `deckFormat` numeric field to a known format (e.g. Commander) and store it on `decks.format`.
- WHEN the Archidekt `deckFormat` has no known mapping, THE SYSTEM SHALL default the format to `commander` and surface it as user-changeable.
- WHEN the user changes a deck's format on the import screen, THE SYSTEM SHALL update `decks.format` and recompute the expected card count and singleton rules for that deck.
- WHERE a deck's format defines an expected size (e.g. Commander = 100), THE SYSTEM SHALL display the deck's card count against that expectation.

### 5.2 Sleeve Active decks; keep Brew decks planned

**US-5.2.1** As a collection owner, I want decks I bring in as Active to sleeve their real cards, and Brew decks to stay planned, so conflicts reflect only genuine physical commitments.

#### Acceptance Criteria
- WHEN a deck is imported as **Active**, THE SYSTEM SHALL sleeve all of its main-deck cards (assign the owned exact printing where available).
- WHEN a deck is imported as **Brew**, THE SYSTEM SHALL leave its cards **Planned** (no physical copy committed) and exclude it from conflict detection.
- WHEN the number of Active decks sleeving a specific printing exceeds the copies owned, THE SYSTEM SHALL allow all involved slots to be sleeved (deliberate over-sleeve) during the initial-import reconciliation window, with no deck given priority.
- THE SYSTEM SHALL NOT let the over-sleeved (over-committed) state leak into steady-state code paths that assume the one-copy-one-slot invariant; over-committed printings SHALL be marked pending reconciliation until resolved.
- Maybeboard and sideboard cards SHALL be excluded (they are already dropped at Archidekt normalization).
- Basic lands SHALL be treated as `Generic Land` and excluded from sleeving-conflict logic.

### 5.3 Compute conflicts keyed on printing

**US-5.3.1** As a collection owner, I want conflicts computed precisely per printing, so the count reflects real physical impossibilities and nothing else.

#### Acceptance Criteria
- WHEN import completes, THE SYSTEM SHALL compute conflicts from persisted data (deck_cards with a committed exact copy, grouped by printing) against owned non-proxy, non-missing `user_copies`, not from the in-flight resolution pool.
- WHERE a printing has sleeved-count > owned-count, THE SYSTEM SHALL record exactly **one** conflict for that printing.
- Each conflict SHALL identify: card name, specific printing, quantity owned, quantity sleeved, and every deck the printing is sleeved into.
- Basic lands and proxy copies SHALL be excluded from conflict computation.
- Cards owned only as an Alternate printing SHALL NOT count as satisfying an exact-printing sleeve (printings are significant).

### 5.4 Import screen shows two lists

**US-5.4.1** As a collection owner, I want the import screen to show decks imported and card conflicts, so I can see what came in and what needs reconciling.

#### Acceptance Criteria
- THE SYSTEM SHALL display a list of imported decks with per-deck card counts (format-aware) and status.
- THE SYSTEM SHALL display a list of card conflicts, each showing: card name, quantity owned, quantity sleeved, and all decks the printing is currently sleeved into.
- WHEN there are no conflicts, THE SYSTEM SHALL indicate a clean import.
- The import screen SHALL be a full-page, scrollable layout (not a modal).

### 5.5 Resolve conflicts on the import screen

**US-5.5.1** As a collection owner, I want to resolve each conflict by marking excess sleeved instances as Proxy or Unallocated, so the collection reconciles to a valid physical state.

#### Acceptance Criteria
- WHEN the user selects **Release** on an excess sleeved slot, THE SYSTEM SHALL clear that slot's copy (set it to Planned) and decrement the sleeved-count for the printing.
- WHEN the user selects **Convert to Proxy** on an excess sleeved slot, THE SYSTEM SHALL add a proxy copy to the collection (`user_copies` with `is_proxy = true`) and sleeve that proxy into the slot (state becomes `Sleeved Proxy`).
- WHEN a printing's sleeved-count (of real copies) is reduced to ≤ owned-count, THE SYSTEM SHALL clear the `Conflicted` overlay for that printing.
- Resolution actions SHALL be atomic per the atomic-writes convention (a single Postgres RPC for multi-row changes).
- After all conflicts are resolved, THE SYSTEM SHALL leave the data in the valid steady-state model (each real copy in exactly one slot).

## 6. In Scope (Phase 1)

- Archidekt `deckFormat` → format-name mapping and per-deck format override on the import screen.
- Active → sleeved (built) import path; Brew → planned import path, driven by the existing Brew/Active picker toggle.
- Over-sleeve reconciliation convention (initial import only) with a pending-reconciliation marker that steady-state paths respect.
- Printing-keyed conflict detection computed from persisted data.
- Import-screen two-list UI (decks imported + card conflicts with owned/sleeved/decks).
- Conflict resolution on the import screen: Release and Convert-to-Proxy (proxy adds a collection copy), atomic.
- Retiring "Theorycraft" from user-facing language; adopting Active/Brew + Sleeved/Planned consistently in import UI copy.

## 7. Out of Scope (deferred)

| Item | Reason |
|------|--------|
| Cross-page persistent conflict bar | Phase 2. |
| Per-card conflict markers threaded through `StatusChipPopover` / `CardSlotBadge` / `CardGroupSection` on deck pages | Phase 2. |
| Wishlist concept (`Wishlisted` state) | Separate future feature; reserved as an enum value only. |
| Foil-vs-nonfoil-as-distinct-supply nuance beyond "specific printing" | Covered by printing-keyed logic; no extra modelling this pass unless printing granularity proves insufficient. |
| Repository-wide rename of internal `...Theorycrafted` symbols | Optional cleanup; not required for behaviour. |

## 8. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Exact representation of an over-sleeved slot in the DB: provisional-proxy-flagged vs a true over-assignment with a pending-reconciliation marker. Design session leaned toward "all decks over-sleeved, marked pending until resolved," but the concrete schema mechanism (new column/flag vs status) is an architecture decision. | Architecture (Developer) — must not break steady-state invariant or leak into allocation/rollup queries. |
| 2 | Archidekt `deckFormat` numeric → format-name mapping is not defined anywhere in the code today. Need the authoritative mapping (only `3 = Commander` is confirmed from fixtures). | Blocks 5.1 accuracy for non-commander formats. |
| 3 | Latent bug: onboarding sends `status` but `resolve-one` route reads `isActive`, so the Brew/Active choice is currently dropped (all decks import active). Must be fixed for 5.2 to work. | Blocks 5.2. |
| 4 | Does `Convert to Proxy` on import create a *specific-printing* proxy (matching the slot's wanted printing) or a generic proxy? Affects the proxy `user_copies` row's `printing_id`. | Minor — Developer to choose sensible default (match slot printing). |

## Provenance

- Authored: 2026-09-16 by Product Manager (Marty), from a design session between the user and Delivery Lead (Gene).
- Motivated by: the import "conflict" metric being meaningless (counted planned claims and basics). Redefined as a printing-keyed physical-impossibility signal with an on-import reconciliation workflow.
