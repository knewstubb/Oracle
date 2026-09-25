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
## 2026-09-17 — Printing-mismatch vs conflict split (design correction)

**Context:** First real import surfaced a flood of false conflicts. Root cause: conflict detection counted ownership by exact `printing_id`, but Archidekt deck slots and the physical collection almost never reference the same printing. Example: user owns 1 Winter Orb (printing `3a674ec8…`) sleeved into 1 deck whose slot recorded printing `ab3cec7e…` → reported "1 sleeved · 0 owned" (false conflict). There was no physical impossibility.

**Decision (user-approved):** separate two conditions on a priority ladder.

1. **Conflict (over-commitment)** — decks sleeving a card exceed copies owned **by card identity (oracle), not printing**. Amber. Release / Proxy. (e.g. Withering Torment: 2 sleeved, own 1.)
2. **Printing mismatch** — owned ≥ sleeved, but the slot's `scryfall_id` differs from an owned copy's `printing_id`. Lower urgency, distinct colour (blue/info). Action: **Switch printing** = retag `deck_cards.scryfall_id` to the owned printing and sleeve it.
3. A card is never both — conflict takes priority; mismatch only shows when not over-committed.

**Implementation changes:**
- Conflict detection: count owned copies by card identity (join user_copies→user_cards, group by oracle/card_name), not exact printing_id.
- Finalization: sleeve by card identity; when the owned printing differs and the card is not over-committed, **auto-retag** the slot to the owned printing (silent — single sensible answer). Most printing mismatches self-resolve at import.
- New `Printing mismatch` state + `Switch printing` action for residual/ambiguous cases.

**Also fixed this session:** prefetch chunked into batches of 30 (commit `331bc49`) — selecting >30 decks previously 400'd and bounced back to the picker.

---
## 2026-09-17 — Claim-only reconciliation (no pre-assignment, equal footing)

**Context:** Greedy finalization during import assigned real copies first-come, freezing most decks as "holds real copy" and leaving only the losers with Release/Proxy. This violated the no-deck-bias principle (e.g. Sol Ring: 16 sleeved / 14 owned showed only 2 resolvable). User: every deck must have equal right to change its allocation.

**Decision (user-approved, option A):**
- During the import screen, **nothing is pre-sleeved**. Every Active main-deck slot is an open **claim** (the single source of truth for reconciliation). Real `copy_id` assignment does NOT happen per-deck at import time.
- The conflict/allocation list shows **every** claimed card (not just over-committed ones), with Release/Proxy available on **all** decks — equal footing, no winners chosen.
- Colour reflects live state per card: **over-allocated** (sleeved > owned) = amber; **balanced** (sleeved ≤ owned) = resolved colour. Balanced cards remain editable (Release/Proxy still available).
- On **finish** ("Go to Decks"), a single finalize pass materializes balanced cards into real `copy_id` sleeves (with printing retag). Cards still over-allocated stay as claims/planned.

**Implementation impact:**
- `createSleeveClaimsForDeck` no longer calls finalize during import (claims only).
- Finalization moves to a finish step (new endpoint / on Go-to-Decks): finalize all cards where owned ≥ sleeved.
- `get_import_conflicts` → broaden to `get_import_allocations` returning ALL claimed cards with owned/sleeved + per-deck claims, plus an `overAllocated` flag, so the UI can colour and still offer actions on balanced cards.
- Non-Active (Brew) decks unchanged (planned, no claims).

---

## 2026-09-20 — Root cause of "hundreds of conflicts": unowned cards counted, Active-by-default

**Context:** User reported still seeing hundreds of conflicts after the claim-only reconciliation work (`5e6452c`). Read-only inspection of live data on 2026-09-20 — 19 decks holding claims, 1,506 claim rows, 2,561 deck_cards, 3,856 owned copies (0 missing, 1 proxy):

| Measure | Value |
|---|---|
| Distinct cards in the allocation list | **1,101** |
| Amber "over-allocated" | **148** |
| ↳ `owned > 0` — genuine over-commitment | **124** |
| ↳ `owned = 0` — card not owned at all | **24** |
| Balanced (teal) | **953** |
| `deck_cards` with a real `copy_id` | **1 of 2,561** |

**Finding 1 — counting bug: unowned ≠ over-committed.** `over_allocated` was `(claim_count + sleeved_count) > owned_count`. `createSleeveClaimsForDeck` claims *every* non-basic slot that has a printing, regardless of ownership, so for any card the user owns zero copies of this evaluates as `1 > 0` — always true. Every unowned card was therefore reported as an over-allocated conflict. Per the state taxonomy those are `Unowned`: no real copy is double-booked and there is no surplus to Release. (The legacy `get_import_conflicts` RPC has the same predicate and returns the same 148.)

**Finding 2 — behavioural cause: Active by default.** The picker seeded every deck to `in_rotation` (Active) and fell back to Active. All 19 claim-bearing decks were `is_active = true` **while `status = 'brewing'`**. Active asserts the deck is physically built and sleeved, which is precisely what creates a claim per slot. 1,506 slots ≈ 1,101 distinct cards demanding real copies; with 19 Commander-tier decks sharing staples, 124 genuine over-commitments is arithmetically correct — not a counting error (Sol Ring 14 owned / 16 wanted, Path of Ancestry 8/10, Fellwar Stone 4/6, Cyclonic Rift 1/4, Grim Tutor 1/4).

**Finding 3 — adjacent gap: finalize had never materialized anything.** Only 1 of 2,561 deck_cards carried a `copy_id`, and it was a proxy the user created by hand. The finish handler fired the finalize request with no `res.ok` check inside a `try` that swallowed every error, so a failed pass was indistinguishable from success. The identity trigger path was verified healthy (115,128 `ref_printings` rows; sampled copy/oracle identities all match), so nothing suggested the pass had run and been rejected.

**Also verified (rules out a false lead):** there are no non-basic duplicate `(deck_id, card_name)` rows — the 60 duplicate groups are all basic lands, which are excluded from claims. So per-instance double counting is not a factor; the list is keyed on card identity only.

**Changes:**
- Migration `20260920120000_get_import_allocations_unowned_state.sql` — `get_import_allocations` now returns an explicit `state` (`'over' | 'balanced' | 'unowned'`); `overAllocated` is true only for genuine over-commitments. Ordering puts conflicts first, unowned last. The equal-footing view is unchanged: still every claimed card, every deck editable.
- New `src/lib/import-allocation-state.ts` — `resolveAllocationState()` / `countAllocationStates()` treat the server `state` as authoritative and derive it locally otherwise, so the UI is correct before the migration lands. `ALLOCATION_STATE_ACCENTS` gives `unowned` a neutral treatment (`--text-secondary`) so it never reads as an alarm.
- Onboarding pickers (Archidekt + Moxfield) default to **Brew**, with a new "All Brew" / "All Active" bulk control and copy stating what Active does.
- Summary relabelled: "Cards in list" vs "Conflicts", a caption explaining what a conflict is, grey state per card, and unowned cards no longer mark their decks conflicted.
- `handleFinish` checks `res.ok`, surfaces the failure and stays on the summary instead of navigating, then re-reads allocations to confirm the pass actually landed and reports the finalized count. `finalizeImportClaims` returns `finalizedCount`; the finalize route passes it through.
- Tests: `src/lib/import-allocation-state.test.ts` — 12 cases covering the unowned/over/balanced split, server-state precedence over a stale `overAllocated`, derivation fallbacks, and the 1,101-vs-148 payload shape.

**Deferred:** scoping demand to a single import batch. `sleeved_demand` still counts every `deck_cards` row with a `copy_id` account-wide plus all outstanding claims, so the numbers are account-global and survive re-imports. Needs an `import_batch_id` on `import_sleeve_claims` plus a product decision on whether reconciliation is per-run or account-wide.

**Out of scope / unaffected:** `DeckImportButton`'s single-deck dialog already defaults to `new_cards` with `built` (`I have this deck built`) as an explicit opt-in, and it runs the older `deck-import.ts` allocation path — left alone.

**Refs:** `requirements.md` §4 (State Taxonomy), `design.md`; commits `5e6452c`, `7bfdb31`, `331bc49`.
