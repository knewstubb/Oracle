# Taxonomy Rename & Expansion — Settled Spec for Gene / Marty

> Status: requirements-gathering complete. All six open questions from the original briefing are now answered and settled below. This doc is ready to hand to Marty as the basis for `requirements.md` — the remaining work is formalizing this into EARS acceptance criteria and running the four-risk check, not further discovery.

## 1. Baseline — what's already built today (verified against the code)

The current per-card-slot status taxonomy lives in `src/lib/card-status.ts`, documented there as "single source of truth":

```
CardSlotStatus = 'allocated' | 'allocated_proxy' | 'unallocated' | 'unowned' | 'generic_land'
```

This is rated "Clean Architecture — No Action Needed" in `docs/system-summary-and-audit.md`. The taxonomy work below is a **hard rename of this file's output and the persisted `ownership_status` column** (see Q6) — it touches code the team previously signed off as clean. Flag that to James for regression coverage, not just Margaret for implementation.

Separately, at the deck level, `docs/oracle-deck-lifecycle-picklist-spec.md` (Section 5) defines Completeness as a computed fact (`physical_copy_id IS NOT NULL` count / total), independent of lifecycle stage. **Playable/Unplayable (Q4) is this same computation, renamed and promoted to a Decks-Grid-visible badge** — not new logic.

**Terminology note:** the lifecycle spec and `system-summary-and-audit.md` both use "Boxed" for the middle lifecycle stage. The settled answer below renames this to **Built** for display purposes only — no enum change. Anyone reading the older docs should mentally substitute Built for Boxed.

## 2. Baseline — what's already decided and specced

From `docs/refactoring-audit.md`:

- **Shared Cards / ProxyAllocationPanel → V2 migration is confirmed**, not open — still needs its own spec (unchanged by this work).
- **The Sorted/Unsorted axis is renamed to Ordered/Unordered** in the settled answers below. The underlying definition from the audit doc is otherwise unchanged (`storage_location_id` set vs. not) — only the display terminology moved. Anyone reading `refactoring-audit.md` directly will see the old name; that document hasn't been updated.
- **Deck reimport (Q6 in that doc) is fixed** — see `tech-debt-register.md`, TD-001.

## 3. Canonical state reference

### Card-slot level (`deck_cards` row) — the five-state resolution taxonomy

One taxonomy, applies identically in the Cards tab and deck-builder search (previously two separate vocabularies — this unifies them, see Q2).

| State | Definition |
|---|---|
| **Original** | Resolved, backed by an owned non-proxy copy |
| **Proxy** | Resolved, backed by an owned proxy copy — a flat peer to Original, not nested under it |
| **Unallocated** | Not resolved, but a candidate exists — a free copy, or one reassignable without confirmation |
| **Claimed** | Not resolved, and every owned/proxied copy of the card is currently held by another deck. Doesn't imply exactly one copy exists — just that none are free. |
| **Unowned** | Not resolved, no copy exists anywhere in the collection |

**Generic land is not a sixth state** — it's an exemption flag on a slot, skipping status computation and display entirely. The flag drops the moment a specific physical copy is deliberately assigned to a land slot, and the slot re-enters the five states normally.

### Physical-copy level (`physical_copies` row)

| State / attribute | Definition |
|---|---|
| **Missing** | Terminal-but-reversible marker: "I no longer physically have this copy" (lost, damaged, sold, given away). Excludes the copy from availability without deleting the row. |
| **Ordered / Unordered** | Placement axis, independent of allocation — applies only to owned copies with no deck link. Ordered = `storage_location_id` set. Unordered = no deck link and no storage location. Never gates resolution eligibility — an Unordered free copy is as valid a candidate as an Ordered one. (Renamed from Sorted/Unsorted.) |
| **Available** (vocabulary, not a state) | An owned copy with no `deck_cards.physical_copy_id` link — the Collection/Storage-view label for "what's floating." Deliberately kept out of the five-state slot taxonomy to avoid mixing slot-level and copy-level vocabularies. |

### Deck level

| State | Definition |
|---|---|
| **Lifecycle** | Brew → Built → Archived (display-rename of Boxed → Built, no enum change) |
| **Allocate** | Boolean. Only Brew decks can toggle it manually (Reserve = on, Release = off). Built decks are always on, no toggle. Archived decks are always off, post Break Down. |
| **Playable / Unplayable** | Derived badge, Built-deck-specific (see Q4 below). Not a stored field. |

## 4. Full Q&A — source of truth, keep close to this wording when writing `requirements.md`

### Q1 answered above (Section 3).

### Q2. What does "Claimed" replace?

Not a collapse of `allocated` + `allocated_proxy` — those become **Original** and **Proxy**, staying as two separate flat states. Claimed renames "Over-allocated," which only existed in the old deck-builder-search taxonomy (Owned/Proxy/Over-allocated/Unowned). It's new for the Cards-tab context — that older taxonomy (Allocated/Allocated·proxy/Unallocated/Unowned) had no concept of "held by another deck" at all.

**Confirmed definition:** Claimed means every owned or proxied copy of the card is currently held by another deck. Can be more than one copy — Claimed doesn't imply exactly one.

### Q3. Missing — exact definition

Physical-copy level, not deck-slot level. Marks "I no longer have this specific copy."

- **Marked via:** a reconciliation scan (the deck-reimport rebuild — separate, not yet built) surfaces copies the system expects but the scan doesn't find. Those get marked Missing instead of silently deleted or left dangling.
- **Reversible:** yes. A later reconciliation scan that finds a previously-Missing copy un-marks it. A subsequent manual assignment to the vacated slot is a separate, independent action — un-marking Missing does not re-link the original slot; the copy becomes a free/Available copy in its own right.
- **Linked deck slot:** the `deck_cards` row unlinks (`physical_copy_id → null`) the moment its copy is marked Missing. The vacated slot then falls through the existing five-state resolution — no new branching logic:
  - Unowned, if that was the only copy
  - Claimed, if other copies exist but all are held by other decks
  - Unallocated, if a free (Available) copy exists elsewhere
- **Deck completeness:** flips automatically. Completeness is `physical_copy_id IS NOT NULL` count / total — a Missing-triggered unlink drops that count by one. For a Built deck, this flips Playable → Unplayable through the existing mechanism, same as any other card leaving the deck.

### Q4. Playable / Unplayable — state or badge?

Derived badge, not a new data field. A plain-language read of the existing completeness count, scoped to **Built decks only**. 100/100 resolved = Playable. Anything less = Unplayable. Not meaningful for Brew decks (expected to be incomplete).

**Sits alongside the completeness count, doesn't replace it.** Playable/Unplayable is the primary signal for a quick scan (Decks Grid) — binary, legible at small size. Raw N/100 stays as supporting detail (deck detail page, hover) — once a deck is known Unplayable, "99/100" and "60/100" are very different situations the badge alone can't distinguish.

**Naming constraint — do not rename to "Legal."** Playable measures one thing: is every slot physically resolved. Format legality (count minimums, singleton rules, banned/restricted lists, rarity restrictions for constrained formats) is a different computation entirely. A deck can be 100/100 resolved and format-illegal, or legal and still incomplete — orthogonal, not degrees of the same thing. Keep Playable for what it does today; reserve "Legal" for a real future per-format rules engine, noted here so the name isn't spent early. Not scoped or built as part of this work.

### Q5. The Gitrog scenario — why it matters

This is the example that settled the allocation action model, not just an illustration.

The original proposal: Built decks are always Allocate-on, and the only exit is Break Down — one-way, archives the deck. Pushed back on as too heavy for temporarily lending a card between two Built decks; the concern was Built decks needing a lighter "Release" action.

**The scenario that resolved it:** one owned copy of Gitrog, split across two real Built decks. To move it from Deck A to Deck B, nothing needs to happen on Deck A at all. Open Deck B's Picklist, see Gitrog listed as Claimed by Deck A, reassign it directly (Tier 4, confirmation required since the source is Built). Deck B becomes Playable. Deck A — untouched — automatically becomes Unplayable, because it's now missing a card.

That's why Claimed and Playable/Unplayable exist as a pair: cross-deck sharing is driven entirely from the receiving side. Claimed surfaces contention there without the giving deck needing to publish or manage its own availability. Playable/Unplayable surfaces the consequence on the giving deck without a manual step there either. Once that was clear, the standalone "Release" action turned out to solve a problem that doesn't exist — Break Down as the sole, one-way exit for Built decks is correct, not a gap.

### Q6. Hard rename or additive layer?

**Hard rename.** `allocated`, `allocated_proxy`, `unallocated`, `unowned`, plus the Chunk-9-only `over-allocated`, get removed from the codebase — not kept underneath a new display label. Includes the persisted `ownership_status` column on `deck_cards`, not just UI strings. One migration-plus-codemod pass covering stored values, `card-status.ts`'s output, and every UI consumer together.

**Reasoning:** this work supersedes the old two four-state systems, it doesn't extend them. The Shared Cards / ProxyAllocationPanel split (two non-reconciled views of the same data, per `refactoring-audit.md`) is a live example of what letting two vocabularies coexist costs — V1 was never fully retired under V2. A display-only skin over old enum values sets up the same drift one level up. More work up front, worth it for one vocabulary.

## 5. What's settled vs. what still needs technical verification

**Settled (product-level, ready for `requirements.md`):** the full state list and levels, Claimed's exact scope, Missing's mechanics and reversibility, Playable/Unplayable's badge-not-field status and its relationship to a future Legal feature, the Gitrog action model (Reserve/Release/Break Down/Rebuild), and hard-rename as the migration approach.

**Still Margaret's to confirm against the schema, not re-litigate:**
- Whether `deck_cards`/`physical_copies` as currently shaped can represent "every copy of this card is held elsewhere" (Claimed) without a new query pattern beyond what `card-status.ts` and the supply-pool logic already do.
- Whether marking a copy Missing and nulling `physical_copy_id` needs the same diff-based-preservation discipline established in the reimport fix (TD-001), or whether it's a simpler direct update given it's user-triggered rather than reimport-triggered.
- The actual migration/codemod scope for the hard rename — every file touching `ownership_status` or `CardSlotStatus`, not just the ones named in Section 1.

## 6. Recommended next step

Hand this document to Marty (via Gene) to formalize into `requirements.md` with EARS acceptance criteria per state and per transition (especially the Missing → unlink → recompute chain in Q3, and the Reserve/Release/Claimed/Playable interaction in Q5). Run the four-risk check explicitly on feasibility given Section 5's open technical items before Dieter starts designing the Decks Grid badge and the Picklist's "Claimed by [deck]" row treatment.
