# Design: Deck Import Conflicts

> Last updated: 2026-09-16
> Status: Draft (Architecture)
> Author: Developer (Margaret), from `requirements.md`
> Reference implementation: `src/lib/warm-start-resolve.ts`, `src/lib/supply-pool.ts`, `src/lib/deck-import.ts`, `src/app/onboarding/page.tsx`

## Design Goals

- Represent the one-time initial-import over-sleeve state **without** breaking the steady-state one-copy-one-slot invariant.
- Make "conflict" a precise, printing-keyed, DB-derived signal (sleeved claims > owned real copies), never the old intra-batch contention count.
- Keep deck lifecycle (Active/Brew) orthogonal to the derived conflict overlay.
- Reuse existing allocation primitives (`deck_cards.copy_id`, `user_copies`, atomic RPCs) rather than inventing parallel systems.
- Scope to the personal app: smallest change that keeps data correct and recoverable; defer platform hardening.

---

## Architecture

### Overview — the core representation problem

Steady state requires: each real `user_copies` row is referenced by at most one `deck_cards.copy_id` (enforced by the identity trigger + the atomic movement RPCs). Initial import of multiple **Active** decks that each list the same card you own once *must* express "all N decks sleeve this" without assigning the same `copy_id` N times.

**Chosen representation: durable import sleeve claims in a new `import_sleeve_claims` table.** A claim records "this deck slot wants to sleeve this exact printing" during the reconciliation window. Claims are NOT `copy_id` assignments — they can legally overlap on a printing. Real `copy_id` assignment happens only when a printing is *not* over-committed (auto-finalized) or *after* the user resolves the excess.

This keeps `deck_cards` in a valid steady state at all times:
- Non-conflicted printings → finalized immediately to real `copy_id` (Sleeved).
- Conflicted printings → slots stay `copy_id = null` (Planned) but carry an open claim, so the UI shows them as "Sleeved (pending reconciliation)" via the claim, and steady-state allocation code — which only reads `copy_id` — treats them as planned and never sees an impossible state.

### Components

| Component | Role | Location |
|-----------|------|----------|
| `import_sleeve_claims` table | Durable record of provisional Active-import sleeve intents, keyed to deck slot + exact printing | new migration |
| `import_conflicts` view (or query) | Derives open conflicts: per printing where active claim count > owned real copies | new migration (view) |
| `detect_import_conflicts` / claim finalization RPC | After import, auto-finalize non-conflicted claims to `copy_id`; leave conflicted ones open | new migration (RPC) |
| `resolve_import_conflict_release` RPC | Release one excess claim (slot stays Planned) | new migration (RPC) |
| `resolve_import_conflict_proxy` RPC | Create a printing-matched proxy `user_copies`, sleeve it, drop the real claim | new migration (RPC) |
| Import format picker | Per-deck format select (import default + override) on the picker screen | `src/app/onboarding/page.tsx` |
| Active/Brew wiring fix | Send lifecycle to `resolve-one`; map to `is_active` + claim creation | onboarding page + `resolve-one/route.ts` |
| Conflicts summary UI | Two lists: decks imported + card conflicts (owned/sleeved/decks) with Release / Convert-to-Proxy | onboarding summary components |

### Data Model — `import_sleeve_claims`

```
import_sleeve_claims
- id            integer identity PK
- user_id       uuid            not null
- deck_id       integer         not null → decks(id)
- deck_cards_id integer         not null → deck_cards(id)   -- the specific slot
- card_name     text            not null
- printing_id   text            null      -- exact wanted printing (deck_cards.scryfall_id); null = no specific printing
- created_at    timestamptz     default now()
- UNIQUE (deck_cards_id)         -- one claim per slot
- INDEX (user_id, printing_id)   -- conflict grouping
- INDEX (user_id, card_name)
```

Rationale:
- Keyed to `deck_cards_id` so a claim maps 1:1 to a slot and is trivially cleaned up if the slot is deleted (FK cascade).
- `printing_id` mirrors `deck_cards.scryfall_id` (text) so conflict grouping is printing-exact (requirements: printings matter). A null printing groups as "any printing of this name" — treated conservatively (see Conflict query).
- Claims exist ONLY during/after Active import until reconciled. A resolved/finalized claim is deleted (its outcome is now expressed in `deck_cards.copy_id`), so the table trends to empty as conflicts are resolved. This is the durable-but-transient store Phase 2 will also read.

### Conflict derivation

Owned real copies for a printing (per user):
```
owned(printing) = count(user_copies where user_id=? and printing_id=<pid>
                        and is_proxy=false and missing=false)
```
Sleeved demand for a printing = **finalized sleeves + open claims** for that exact printing:
```
sleeved(printing) = count(deck_cards where user_id=? and scryfall_id=<pid> and copy_id is not null
                          and ownership_status='original')      -- already-finalized real sleeves
                  + count(import_sleeve_claims where user_id=? and printing_id=<pid>)  -- open claims
```
A printing is **conflicted** iff `sleeved(printing) > owned(printing)`. One conflict per printing. The conflict lists: card_name, printing_id, owned, sleeved, and the decks (from claims + finalized sleeves).

Basic lands (`isBasicLand(card_name)`) and proxy copies are excluded from `owned`. Alternate printings do not satisfy an exact-printing claim (grouping is by `printing_id`).

### Import flow changes

1. **Format selection (client):** picker requires an import-wide format (default `commander`) with per-deck override. The selected format is sent per deck and persisted to `decks.format`. No Archidekt `deckFormat` mapping.

2. **Active/Brew wiring (fix latent bug):** the client currently sends `status` but `resolve-one` reads `isActive`. Fix: send an explicit `lifecycle: 'active' | 'brew'`; the route maps `active → is_active=true` and `brew → is_active=false`, and drives claim creation.

3. **Resolution behaviour per deck:**
   - **Brew deck:** import as planned (current `importDeckTheorycrafted` path). No claims. Excluded from conflicts.
   - **Active deck:** import cards, then create an `import_sleeve_claims` row for every non-basic main-deck slot (keyed to `deck_cards.scryfall_id`).

4. **Finalization pass (after all decks imported):** for each printing, if `sleeved ≤ owned`, assign distinct real copies to the claims (set `copy_id` + `ownership_status='original'`) and delete those claims. Printings where `sleeved > owned` keep their claims open → surfaced as conflicts. This replaces the old supply-pool `detectContentions` + client-side contention detection.

5. **Deck conflict overlay:** derived — a deck is conflicted iff it has ≥1 slot with an open claim participating in an open printing conflict. Not stored on `decks`.

### Resolution actions (atomic RPCs, per convention-atomic-writes)

- **Release(claim):** delete the claim. Slot stays Planned (`copy_id` null). Recompute conflict. Single-row delete + no `deck_cards` change → still wrap in RPC for a consistent result contract.
- **Convert to Proxy(claim):** in one transaction — insert `user_copies` (`is_proxy=true`, `printing_id` = slot's wanted printing, `card_id` = slot's card, `user_id`), set the slot's `copy_id` to that new proxy + `ownership_status='proxy'`, delete the claim. This is a genuine multi-row atomic write → dedicated RPC (advisory lock on the printing key).
- **Auto-finalize on resolution:** when an action reduces a printing's claim count to ≤ owned, the RPC assigns remaining real copies to the remaining claims and deletes them (same as the finalization pass, scoped to one printing).

### Cross-cutting concerns

- **Invariant safety:** claims never set `copy_id`; only finalization/proxy RPCs do, and only when supply allows. The identity trigger (`validate_deck_card_copy_identity`) still guards every `copy_id` write.
- **Steady-state isolation:** allocation/rollup/status code reads `copy_id`; it never reads `import_sleeve_claims`, so an over-committed printing looks like N planned slots to that code — safe. Only the conflict UI and (Phase 2) markers read claims.
- **Basics/proxies:** excluded from `owned`; basics never get claims.
- **Personal-app scope:** no RLS work (deferred, TD-037 — RLS is disabled globally; flagged to user, not touched here). No import-run staging/audit beyond the claims table.

### Security review

- All new RPCs `SECURITY DEFINER`, `SET search_path = public`, and take `p_user_id` with an explicit ownership check on the claim/slot/copy (matches existing movement RPCs). No intermediate privilege window for PUBLIC/authenticated (migration privilege safety per convention-personal-app-scope).
- Convert-to-Proxy validates the slot belongs to the user and the claim matches before inserting the proxy.

### Rollout / rollback

- Additive migration (new table, view, RPCs). No change to existing `deck_cards`/`user_copies` shape.
- Rollback: drop the new table/view/RPCs; the old contention path is already superseded but harmless if left. Because claims never mutate `copy_id` except through the guarded finalize/proxy RPCs, an aborted import leaves valid planned slots (fail-closed).

### Trade-offs & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Provisional sleeve representation | Durable claims table | Duplicate `copy_id` across slots | Alternative breaks the FK/one-copy invariant and corrupts allocation queries. |
| Provisional representation | Durable claims table | Auto-proxy the excess immediately | Auto-proxy invents a user decision and biases which deck keeps the real copy; user wants no bias. |
| Conflict source | DB-derived (claims + finalized) | In-flight supply pool | Pool state is transient and not queryable post-import; Phase 2 needs a durable source. |
| Deck conflict status | Derived overlay | `decks.status` value | Keeps lifecycle orthogonal; avoids stale flags. |
| Format | User-selected | Archidekt `deckFormat` mapping | Source-agnostic; no per-platform mapping to maintain. |

### Open Questions (technical)

- Claim finalization ordering when multiple printings share the same real copies is not possible (copies are printing-specific), so per-printing finalization is independent — no cross-printing ordering needed.
- Whether to expose conflicts as a Postgres `VIEW` vs a parameterized RPC: lean RPC returning JSON (owned/sleeved/decks per conflict) for a single round-trip to the summary UI.

## Phasing

- **Phase 1 (this design):** claims table + view/RPCs, finalization pass, format picker, Active/Brew wiring fix, import-screen two-list UI + Release/Convert-to-Proxy.
- **Phase 2 (separate):** cross-page persistent conflict bar + per-card markers (reads the same `import_sleeve_claims` + conflict derivation).
