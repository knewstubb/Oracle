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
## 2026-09-16 — Final design review: reconciliation-claim architecture selected

**Context:** User requested a final design review, supplied screenshots of the current Archidekt format display and Oracle import flow, and resolved the remaining product decisions.

**What changed:**
- Updated `requirements.md` to replace source-derived format detection with a source-agnostic, user-selected import format (import-wide default + per-deck override).
- Replaced the open over-sleeve representation question with the selected **durable initial-import sleeve-claim** architecture.
- Added the derived per-deck Conflict overlay and exact-printing proxy decision.

**Decisions made:**
- **Provisional initial-import sleeves are durable claims, not duplicate physical assignments.** An Active import creates one exact-printing claim per main-deck slot. Multiple claims can coexist for one printing only during reconciliation; `deck_cards.copy_id` remains protected by the normal one-copy-one-slot invariant.
- **Conflict query:** one open conflict per printing where active real sleeve claims exceed owned non-proxy, non-missing copies. The deck Conflict overlay is derived from its participating claims, not stored in `decks.status`.
- **Resolution:** Release removes an excess claim and leaves the slot Planned. Convert-to-Proxy creates an `is_proxy = true` `user_copies` row matching the slot printing, sleeves that proxy, and removes the provisional real claim.
- **Format:** user chooses format for every import source. Use an import-wide default with per-deck override; do not build Archidekt/Moxfield numeric mappings.
- **Lifecycle wiring:** no user decision required — implementation must correct the existing `status`/`isActive` request mismatch so Active creates claims and Brew remains Planned.
- **Source Proxy tags:** ignored; they are custom metadata, not an ownership signal.

**Design verification:**
- Current screenshots show the retired design: opaque page-based collection progress, source-specific format display, old supply-pool assignment failures, ambiguous incomplete deck counts, generic amber warnings, review-picklist navigation, and a 698 contention count. None represents the required printing-keyed physical reconciliation workflow.
- The updated requirements now distinguish normal planned-card allocation from the one-time initial-import physical reconciliation workflow, preserving the steady-state one-copy-one-slot invariant.

**Implementation gate:** No remaining product decisions block architecture/design. Developer must next produce `design.md` covering claim/session schema, conflict/reconciliation RPC contracts, exact-printing queries, failure/rollback behavior, format-picker state, and the Active/Brew request wiring correction.

---
## 2026-09-17 — Phase 1 implemented and verified

**Context:** User approved building Phase 1 end-to-end (data disposable). Developer (Margaret) implemented the full claim-based reconciliation.

**What changed (commits):**
- `2b2d381` — `import_sleeve_claims` table + RPCs: `get_import_conflicts`, `finalize_import_claims`, `resolve_import_conflict_release`, `resolve_import_conflict_proxy`. All SECURITY DEFINER, per-user ownership checks, advisory lock per printing (`import-printing:<printing_id>`).
- `5586367` — Claim-based Active import: `resolveSingleDeckWithPrefetch` now imports planned then (if Active) creates sleeve claims via new `src/lib/import-sleeve-claims.ts` and finalizes. Fixed the latent Active/Brew wiring bug (client now sends `lifecycle`; route maps `in_rotation→active`, `brewing→brew`). Added user-selected format picker (import-wide default + per-deck override) persisted to `decks.format`. Regenerated `src/types/supabase.ts`.
- `16bfaaf` — Import summary two-list UI (decks + card conflicts) with derived deck Conflict overlay badge; Release / Convert-to-Proxy controls; `GET /api/onboarding/conflicts` + `POST /api/onboarding/conflicts/resolve`. Extended `get_import_conflicts` to return `claimId`/`deckCardsId` per deck ref.

**Verification (against hosted DB, then cleaned up):**
- Conflict detection: 1 owned + 2 Active claims for a printing → exactly 1 conflict (owned 1, sleeved 2), both decks listed with claim ids. Correct.
- Finalization: demand > supply → no assignment (claims stay open). Correct.
- Release: released slot → Planned (`copy_id` null); remaining claim auto-finalized with the real copy (`ownership=original`); conflict cleared; 0 residual claims. Correct.
- Convert-to-Proxy: resolved slot got a new `is_proxy=true` copy (`source_tag=import-conflict-proxy`) sleeved; remaining claim auto-finalized with the real copy; conflict cleared. Correct.
- `npx next build` passes clean.
- Fixed a pre-existing type error (`physicalCopiesCreated` → `userCopiesCreated`) that would have broken the build, since this feature heavily edits that file.

**Decisions / notes:**
- Basic lands excluded from claims (generic/untracked). Slots without an exact `scryfall_id` are not claimed (printing-keyed conflicts require an exact printing).
- Steady-state isolation holds: allocation/rollup code reads `copy_id` only and never sees `import_sleeve_claims`; over-committed printings appear as planned slots to that code.
- RLS advisory: the Supabase advisor flags RLS disabled on all 30 tables. Deferred per convention-personal-app-scope (TD-037); not touched by this feature. Flagged to user.

**Deferred to Phase 2:** cross-page persistent conflict bar + per-card markers on deck pages (will read the same `import_sleeve_claims` + `get_import_conflicts`).

**Status:** Phase 1 complete, ready for user testing via a fresh import.

**Refs:** commits 2b2d381, 5586367, 16bfaaf; `requirements.md`, `design.md`, `tasks.md`.

---
