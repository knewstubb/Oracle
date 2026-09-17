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
- A clear list of imported decks (with user-selected, format-aware card counts).
- A derived **Conflict** overlay on each deck involved in unresolved initial-import claims; this overlay is distinct from the deck lifecycle (Active/Brew).
- A precise list of genuine conflicts: for each over-committed printing — the card, quantity owned, quantity sleeved, and every deck it is sleeved into.
- The ability to resolve each conflict on the import screen (Release the excess to Planned, or Convert to a sleeved Proxy) until sleeved ≤ owned.

Once resolved, the collection reconciles into the normal steady-state allocation model with no lingering impossible states. The conflict records remain durable enough for the later cross-page conflict UI, but no steady-state allocation query may treat provisional import claims as physical copy assignments.

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

### 5.1 Choose deck format on import

**US-5.1.1** As a collection owner, I want to choose each imported deck's format (with an efficient default and per-deck overrides), so that card counts and singleton rules are correct without relying on source-platform format metadata.

#### Acceptance Criteria
- WHEN the user selects decks for import, THE SYSTEM SHALL require the user to choose an import format before any deck is imported; it SHALL NOT depend on Archidekt, Moxfield, or another source platform's format metadata.
- THE SYSTEM SHALL offer an import-wide format default and let the user override the format for each selected deck before import.
- WHEN the user changes a deck's format on the import screen, THE SYSTEM SHALL persist the selected value to `decks.format` and recompute the expected card count and singleton rules for that deck.
- WHERE a deck's format defines an expected size (e.g. Commander = 100), THE SYSTEM SHALL display the deck's card count against that expectation.
- THE SYSTEM SHALL apply the same user-selected format workflow to supported import sources, rather than introducing source-specific format mappings.

### 5.2 Sleeve Active decks; keep Brew decks planned

**US-5.2.1** As a collection owner, I want decks I bring in as Active to sleeve their real cards, and Brew decks to stay planned, so conflicts reflect only genuine physical commitments.

#### Acceptance Criteria
- WHEN a deck is imported as **Active**, THE SYSTEM SHALL create a durable initial-import sleeve claim for every main-deck slot, keyed to the exact printing requested by that slot.
- WHEN a deck is imported as **Brew**, THE SYSTEM SHALL leave its cards **Planned** (no sleeve claim and no physical copy committed) and exclude it from initial-import conflict detection.
- THE SYSTEM SHALL allow multiple Active sleeve claims for the same printing during the initial-import reconciliation window, with no deck given priority.
- THE SYSTEM SHALL NOT duplicate `deck_cards.copy_id`, create a proxy automatically, or otherwise violate the steady-state one-copy-one-slot invariant while representing initial-import sleeve claims.
- THE SYSTEM SHALL derive an **import-conflict overlay** for each printing where active exact-printing sleeve claims exceed owned non-proxy, non-missing copies.
- THE SYSTEM SHALL derive a **deck conflict overlay** for every deck with at least one slot participating in an unresolved import conflict. This overlay SHALL be separate from and SHALL NOT overwrite the deck's Active/Brew lifecycle.
- THE SYSTEM SHALL finalize non-conflicted claims, and shall finalize remaining claims after each conflict is resolved, into normal one-copy-one-slot `copy_id` assignments.
- Maybeboard and sideboard cards SHALL be excluded (they are already dropped at Archidekt normalization).
- Basic lands SHALL be treated as `Generic Land` and excluded from sleeving-conflict logic.
- THE SYSTEM SHALL ignore source-platform Proxy labels/tags when creating or evaluating initial-import sleeve claims; source tags are custom metadata and are not a reliable ownership signal.
- WHEN the user chooses **Active** or **Brew** on the import screen, THE SYSTEM SHALL persist and use that choice; it SHALL NOT silently import every deck as Active.

### 5.3 Compute conflicts keyed on printing

**US-5.3.1** As a collection owner, I want conflicts computed precisely per printing, so the count reflects real physical impossibilities and nothing else.

#### Acceptance Criteria
- WHEN import completes, THE SYSTEM SHALL compute conflicts from persisted active initial-import sleeve claims, grouped by exact printing, against owned non-proxy, non-missing `user_copies`; it SHALL NOT compute them from the in-flight supply pool or ordinary Planned slots.
- WHERE a printing has active sleeve-claim count > owned real-copy count, THE SYSTEM SHALL record exactly **one** open conflict for that printing.
- Each conflict SHALL identify: card name, specific printing, quantity owned, quantity sleeved (active claims), and every deck the printing is claimed sleeved into.
- THE SYSTEM SHALL derive the deck-level Conflict overlay from open conflicts; it SHALL clear automatically when none of the deck's slots participates in an open conflict.
- Basic lands and proxy copies SHALL be excluded from owned-copy conflict computation.
- Cards owned only as an Alternate printing SHALL NOT count as satisfying an exact-printing sleeve claim (printings are significant).

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
- WHEN the user selects **Release** on an excess sleeve claim, THE SYSTEM SHALL remove that claim, leave the slot Planned (`copy_id` remains null), and recompute the printing's claim count.
- WHEN the user selects **Convert to Proxy** on an excess sleeve claim, THE SYSTEM SHALL create a proxy `user_copies` row that matches the slot's exact printing (`is_proxy = true` with the slot's `printing_id`), sleeve that proxy into the slot, and remove the provisional real-copy claim.
- WHEN a printing's remaining real sleeve-claim count is ≤ owned real-copy count, THE SYSTEM SHALL assign distinct matching real copies to the remaining claims and clear the `Conflicted` overlay for that printing.
- Resolution actions SHALL be atomic per the atomic-writes convention (a single Postgres RPC for all records changed by the action).
- After all conflicts are resolved, THE SYSTEM SHALL leave the data in the valid steady-state model (each real copy in exactly one slot).

## 6. In Scope (Phase 1)

- User-selected import-wide format default plus per-deck format override for all supported import sources (no source-platform format mapping).
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

## 8. Architecture Decisions & Implementation Constraints

| # | Decision / constraint | Implementation impact |
|---|-----------------------|-----------------------|
| 1 | **Represent provisional initial-import sleeving with durable import sleeve claims, not duplicate `deck_cards.copy_id` assignments.** Claims reference the deck slot and exact wanted printing; many claims may exist for one printing during reconciliation. | Preserves the steady-state one-copy-one-slot invariant. Conflict queries group active claims by printing; ordinary allocation/rollup code must ignore unfinalized claims. |
| 2 | **Conflict status is a derived deck overlay, not `decks.status`.** A deck is conflicted iff an active slot claim participates in an open printing conflict. | Keeps Active/Brew lifecycle separate from reconciliation state and prevents stale status flags. Phase 2 can query the same durable records for deck-list bars and card markers. |
| 3 | **Format is user-selected for every import source.** The picker offers an import-wide default plus per-deck override; source-platform format metadata is not used. | Avoids Archidekt/Moxfield-specific mappings. Persist selection to `decks.format` before import and use `format-config` for expected size/rules. |
| 4 | **Active/Brew must be wired through correctly.** The current client sends `status` while `resolve-one` reads `isActive`; implementation shall map the selected lifecycle consistently. | Required for Active → sleeve claim / Brew → planned behavior. No further product decision needed. |
| 5 | **Convert-to-Proxy creates a printing-matched proxy.** The new `user_copies` row shall use the slot's requested `printing_id` and `is_proxy = true`. | Maintains printing-specific conflict semantics and turns the slot into `Sleeved Proxy`. |
| 6 | **Source Proxy labels are ignored.** Archidekt/Moxfield custom tags do not determine proxy ownership or conflict counts. | Proxy state only arises from an actual proxy copy in the collection or the explicit Convert-to-Proxy action. |

## 9. Open Questions

No remaining product decisions block design. The Developer architecture pass must specify the migration, claim lifecycle, RPC contracts, and reconciliation queries that satisfy Section 8.

- Authored: 2026-09-16 by Product Manager (Marty), from a design session between the user and Delivery Lead (Gene).
- Motivated by: the import "conflict" metric being meaningless (counted planned claims and basics). Redefined as a printing-keyed physical-impossibility signal with an on-import reconciliation workflow.
