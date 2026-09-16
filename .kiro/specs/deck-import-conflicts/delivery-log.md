# Delivery Log — Deck Import Conflicts

> Feature: Deck Import Conflicts
> Status: In Progress (requirements drafted, design pending)
> Last updated: 2026-09-16
> Maintained by: Delivery Lead (Gene)

---

## 2026-09-16 — Requirements drafted from design session

**Context:** User surfaced that the import "conflict" count was meaningless — it counted planned/theorycrafted claims and basic lands, producing large numbers (e.g. 698). A multi-turn design session with the user reframed conflicts as a printing-keyed physical impossibility that must be reconciled at initial import.

**What changed:**
- Created `requirements.md` for the `deck-import-conflicts` feature.
- Locked the full card-allocation **state taxonomy** (12-value enum) as the anchoring reference.
- Locked **naming reconciliation**: Active/Brew (lifecycle) + Sleeved/Planned (allocation); "Theorycraft" retired from UI.

**Decisions made:**
- **Conflict definition:** per specific printing (scryfall_id), one conflict per over-committed printing, listing all decks it's sleeved into. Sleeved-count > owned-count (non-proxy, non-missing copies).
- **Alternate can never be Sleeved** — Sleeved requires the exact owned printing physically in the deck.
- **`Conflicted` is a derived printing-level overlay**, not a per-slot status — supports "all decks over-sleeved, no bias."
- **Import behaviour:** Active → sleeve all main cards (over-sleeve allowed during initial-import reconciliation); Brew → planned. Maybeboard/sideboard already excluded at normalization; basics are `Generic Land` and exempt.
- **Resolution:** Release (→ Planned) or Convert to Proxy (→ adds `is_proxy` collection copy, sleeves it) until sleeved ≤ owned. Atomic per convention.
- **Compute conflicts from persisted DB data after import**, not the in-flight pool.
- **Format:** detect from Archidekt `deckFormat`, user-overridable per deck on import.
- **Phasing:** Phase 1 = detection + import-screen two-list UI + resolution. Phase 2 = cross-page persistent bar + per-card markers.

**Prior context prevented:** earlier commits in this session already (a) fixed the missing-folder decks bug, (b) fixed the compute_card_diff SQL error, (c) fixed the identity trigger failing/timing out on unsynced printings, (d) switched onboarding to full-page scroll, (e) simplified import rows, (f) excluded basic lands from the *old* contention logic. This feature supersedes the old contention concept (supply-pool `detectContentions` + client-side detection in onboarding page) with the printing-keyed model.

**Open architecture questions (for Developer / design.md):**
1. DB representation of an over-sleeved slot without breaking the steady-state one-copy-one-slot invariant or leaking into allocation/rollup queries.
2. Archidekt `deckFormat` numeric → format-name mapping (only `3 = Commander` confirmed).
3. Fix latent bug: onboarding sends `status` but `resolve-one` reads `isActive`, dropping the Brew/Active choice.
4. `Convert to Proxy` — specific-printing vs generic proxy `printing_id`.

**Refs:**
- `requirements.md`
- Related: `card-status-taxonomy-rename/`, `generic-basic-lands/`, `proxy-ownership-layer/`, `collection-foundation/`
- Codebase investigation (this session): `src/lib/card-status.ts` (DeckCardLifecycle derived from copy_id), `src/lib/supply-pool.ts` (old detectContentions), `src/lib/warm-start-resolve.ts` (resolve flow), `src/lib/deck-normalizer.ts` (maybeboard/sideboard excluded, deckFormat ignored), `src/lib/deck-import.ts` (importDeckTheorycrafted vs importDeckBuilt), `src/lib/format-config.ts` (commander=100).

---
