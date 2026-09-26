# Contract: Import Reconciliation Redesign (T-22)

## Status

APPROVED — owner decisions incorporated (Q3/Q4 closed, button renamed to
"Allocate Cards", §5 resolved semantics updated). Ready for Backend
implementation.

Defines the data model, API surface, persistence behaviour and correctness
properties needed to implement the UX spec in
`docs/oracle/specs/import-reconciliation-redesign.md`.

Draft migration: `supabase/migrations/20260926140000_import_reconciliation_redesign.sql`
TypeScript types: [`import-reconciliation-redesign.types.ts`](./import-reconciliation-redesign.types.ts)

---

## 1. Scope and the problem this solves

The redesign replaces a per-card action model (`sleeve` / `release` / `proxy`)
with a per-instance **state** model (`planned` / `sleeved` / `proxy`), grouped
by **conflict printing**, presented in three tabs.

Three things in the existing implementation cannot express that, and are the
substance of this contract:

| # | Existing behaviour | Why the redesign needs it changed |
|---|--------------------|-----------------------------------|
| 1 | `get_import_allocations` groups by `card_name` and counts `owned` across **all printings** [Confirmed: `supabase/migrations/20260920140500_get_import_allocations_v2_resolutions.sql`] | The spec's unit of grouping is one **printing**, and `owned` means "copies of *that printing*" (spec §5). D-021/D-024 also make printing identity load-bearing. |
| 2 | Claims have no per-instance printing override [Confirmed: `import_sleeve_claims` columns in `src/types/supabase.ts`] | The alternate-printing selector applies to one deck-card instance (spec §12). |
| 3 | Claims default to `resolution = 'sleeve'`, and the DB value set is `('sleeve','release','proxy')` [Confirmed: `supabase/migrations/20260920140000_import_claim_resolution_columns.sql`] | The spec's default is **Planned** for every instance, and `release` no longer means "release" — it means "stays planned". Keeping the old words guarantees permanent mistranslation between spec, UI and DB. |

Everything else — the claims table, batch scoping, `settled_at` as the durable
record, a single materialisation pass on "Allocate Cards" — is kept.

---

## 2. Domain model

### 2.1 Instance

An **instance** is one deck-card slot awaiting a decision: exactly one row of
`import_sleeve_claims`, which is 1:1 with a `deck_cards` row
(`import_sleeve_claims_slot_unique UNIQUE (deck_cards_id)`).

The instance is the unit of every write in this contract.

### 2.2 Conflict printing

A **conflict printing** is the pair `(card_name, imported_printing_id)` — the
printing the imported deck asked for. It is the unit of grouping, of row
rendering, and of every count.

`imported_printing_id` is `import_sleeve_claims.printing_id`, a `scryfall_id`
(printing identity, D-003). Basic lands never produce claims, so D-023
fungibility does not apply on this screen [Confirmed:
`createSleeveClaimsForDeck` in `src/lib/import-sleeve-claims.ts`].

### 2.3 Effective printing

`effectivePrintingId = selected_printing_id ?? printing_id`.

Supply and over-allocation are evaluated against the **effective** printing.
Row grouping stays on the **imported** printing, so choosing an alternate does
not make a card jump rows (spec §12: the select is inline on the instance row).

### 2.4 Supply

All counts are scoped to the authenticated user.

| Term | Definition |
|------|------------|
| `ownedAnyPrinting` | Real copies of `card_name` (`is_proxy = false`, `missing = false`), any printing. |
| `ownedTotal(p)` | Real copies of `card_name` with `printing_id = p`. This is the spec's `owned`. |
| `availableSupply(p)` | `ownedTotal(p)` minus copies already referenced by a `deck_cards.copy_id`. The number of real copies this screen can hand out. |
| `claimedBy(p)` | Decks holding a real copy of `p`. Feeds the "Already claimed" source-deck tags (spec §7). |
| `freeProxies(p)` | Proxy copies of `p` (`is_proxy = true`) not referenced by any `deck_cards.copy_id`. Drives "reuse an existing proxy" at finalize. |
| `sleevedIntent(p)` | In-scope instances whose effective printing is `p` and whose state is `sleeved`. |

Because in-scope instances are exactly the slots with `deck_cards.copy_id IS NULL`
(§2.5), a copy that is "held" is always held *outside* this screen.
`availableSupply` therefore needs no correction for the batch's own rows.

### 2.5 Which instances appear

An instance is in scope when all of the following hold:

1. It belongs to the requested batch (`batch_id = p_batch_id`), or, with no
   batch id, is unsettled (`settled_at IS NULL`).
2. Its `deck_cards.copy_id IS NULL` — the slot is genuinely undecided.

Rule 2 is new. `reconcile_built_deck` already assigns a copy whenever a free
copy of the exact printing exists (D-021), and `createSleeveClaimsForDeck`
claims every non-basic slot regardless [Confirmed: both files]. Without rule 2
the screen would list slots that import already resolved. Those slots still
count as supply consumers, and still surface as `claimedBy` deck tags — they
just are not editable rows on a screen whose purpose is unfinished work
(spec §7: "only the conflicted cards").

**Design gap flagged:** the spec has no visual treatment for "already sleeved
during import". This contract's answer is "not shown as a row". If the owner
wants those visible, that is a Designer decision, not a contract change — the
data is already in the payload as `claimedBy`.

---

## 3. Data model changes

All changes are additive or value-level. No table, column, constraint or row is
dropped; no destructive operation is used.

### 3.1 `import_sleeve_claims` — new columns

| Column | Type | Null | Default | Purpose |
|--------|------|------|---------|---------|
| `selected_printing_id` | `text` | yes | `NULL` | Per-instance alternate-printing override. `NULL` = use the imported `printing_id`. **This is the field the UX report asked the Architect to name.** |
| `wishlist` | `boolean` | no | `true` | Per-instance wishlist toggle for unowned cards, checked by default (spec §9). |

`printing_id` keeps its meaning: the printing the imported deck listed. It is
never overwritten, so the default option in the select is always recoverable.

### 3.2 `import_sleeve_claims.resolution` — renamed value set

| Old value | New value | Meaning |
|-----------|-----------|---------|
| `release` | `planned` | Slot stays planned. No copy assigned. |
| `sleeve` | `sleeved` | Slot takes a real copy of the effective printing. |
| `proxy` | `proxy` | Slot takes a proxy: reuse a free one, else create one. |

- `CHECK (resolution IN ('planned','sleeved','proxy'))`.
- `DEFAULT` changes from `'sleeve'` to `'planned'` (spec §8: Planned is the
  default for every instance).
- Existing rows are updated in place. Legacy strings remain **accepted on input**
  at the RPC boundary and are mapped, so a cached client cannot corrupt state.

Consequence of the default change: nothing is materialised unless the user
explicitly chooses `sleeved` or `proxy`. That is D-020 ("import does not run an
automatic allocation pass") applied consistently. The easy exact-printing
matches are still assigned by `reconcile_built_deck` at import time, so this
does not regress the happy path.

### 3.3 New index

```sql
CREATE INDEX idx_import_sleeve_claims_user_batch_printing
  ON public.import_sleeve_claims (user_id, batch_id, card_name, printing_id);
```

### 3.4 Deliberate exclusions

**No `finish` on the conflict-printing key.** The spec §19 binds the printing
identifier to `deck_cards.finish`. That column does not exist — `deck_cards` is
`(card_name, categories, copy_id, dead_weight_flag, dead_weight_reason, deck_id,
id, is_commander, ownership_status, placement_source, proxy_of_deck_id,
quantity, scryfall_id, set_code, tags, user_id)` [Confirmed:
`src/types/supabase.ts`]. Finish lives only on `user_copies.finish` (D-004), and
the import pipeline does not persist a requested finish anywhere today.

Therefore the conflict-printing key is `(card_name, printing_id)`, matching
`reconcile_built_deck`'s existing exact-printing rule, and finish is reported
where it is real:

- Row header: `finish` is the single distinct finish among the printing's real
  copies, or `null` when there are none or several.
- Alternate-printing options: `finishes: string[]`, the finishes actually owned.

Splitting supply by finish is a separate increment; it needs the import
pipeline to capture a requested finish first. Logged as debt (§10).

**No new wishlist table.** The durable wishlist list is out of scope per spec
§18 and the T-22 handoff ("local UI state persisted separately"). The toggle is
a column on the claim, which is durable, instance-scoped, and costs nothing.
When the wishlist feature lands it can materialise from these rows at finalize.

---

## 4. API surface

### 4.1 New routes

The redesigned screen gets its own routes. The existing
`GET /api/onboarding/conflicts` and `POST /api/onboarding/conflicts/resolve`
stay untouched and keep serving the current `SummaryScreen` until the new UI
ships, then are retired (§11). This avoids a window where the app is broken
because contract and UI land in different commits.

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/onboarding/reconciliation` | Read the whole reconciliation view for a batch. |
| `PATCH` | `/api/onboarding/reconciliation/instance` | Set one instance's state. |
| `PATCH` | `/api/onboarding/reconciliation/instance/printing` | Set or clear one instance's alternate printing. |
| `PATCH` | `/api/onboarding/reconciliation/instance/wishlist` | Set one instance's wishlist toggle. |
| `POST` | `/api/onboarding/finalize` | Unchanged route. Updated RPC behaviour (§7). |

All routes require auth via `requireAuth()` and derive `userId` server-side. No
route accepts a `userId`. All reach Postgres through `createAdminClient()`, the
existing pattern for these RPCs.

### 4.2 `GET /api/onboarding/reconciliation`

Query parameters:

| Param | Type | Default | Meaning |
|-------|------|---------|---------|
| `batchId` | uuid | — | Import run to read. Omitted ⇒ all unsettled claims. |
| `includeResolved` | `'true' \| 'false'` | `false` | Whether resolved rows are returned. |

Response `200`:

```ts
interface ReconciliationView {
  batchId: string | null
  counts: ReconciliationCounts
  decks: ReconciliationDeck[]
  rows: ConflictPrintingRow[]
}

interface ReconciliationCounts {
  /** Decks-tab badge: unresolved conflict printings across all imported decks. */
  unresolvedTotal: number
  /** Owned-tab badge. */
  unresolvedOwned: number
  /** Unowned-tab badge. */
  unresolvedUnowned: number
  /** Every row the batch has, resolved or not, before includeResolved filtering. */
  rowsTotal: number
}

interface ReconciliationDeck {
  deckId: number
  deckName: string
  /** Lifecycle badge: true → "Active", false → "Brew". */
  isActive: boolean
  /** Unresolved conflict printings that touch this deck. */
  conflictPrintingCount: number
}

interface ConflictPrintingRow {
  cardName: string
  /** The printing the imported deck listed. Row identity, with cardName. */
  printingId: string
  oracleId: string | null

  // Printing display data, from ref_printings. null when unsynced.
  setCode: string | null
  setName: string | null
  collectorNumber: string | null
  /** Single distinct finish among owned real copies of this printing, else null. */
  finish: string | null
  imageUriSmall: string | null
  imageUriNormal: string | null
  /** Hover-preview source (spec §11). */
  imageUriLarge: string | null

  // Supply
  /** Real copies of THIS printing. The spec's `owned`. */
  owned: number
  /** Real copies of this printing this screen can still hand out. */
  availableSupply: number
  /** Real copies of the card across all printings. 0 ⇒ ownership 'unowned'. */
  ownedAnyPrinting: number
  freeProxies: number
  /** Decks already holding a real copy of this printing (spec §7). */
  claimedBy: DeckRef[]

  // Classification
  /** Tab routing. 'unowned' iff ownedAnyPrinting === 0. */
  ownership: 'owned' | 'unowned'
  /** D-024: card is owned, but not in this printing. Warn only. */
  printingMismatch: boolean
  /** Any instance wants a real copy it cannot get. Amber row warning. */
  overAllocated: boolean
  /** Every instance in this row is slot-level resolved (§5). Green row. */
  resolved: boolean

  instances: ConflictInstance[]
  /** Other printings of this card the user owns. Empty ⇒ hide the select. */
  alternatePrintings: AlternatePrinting[]
}

interface ConflictInstance {
  /** Write key for every PATCH in this contract. */
  claimId: number
  deckCardsId: number
  deckId: number
  deckName: string

  state: 'planned' | 'sleeved' | 'proxy'
  /** null ⇒ using the row's imported printing. */
  selectedPrintingId: string | null
  effectivePrintingId: string
  wishlisted: boolean

  /** false ⇒ render the Sleeved button disabled (spec §8.2). */
  canSleeve: boolean
  /** true ⇒ render the amber "Already claimed" descriptor (spec §8.1). */
  alreadyClaimed: boolean
  /**
   * true when this slot has no remaining actionable option (§5).
   * `sleeved` with supply, `proxy`, and `planned` slots that have lost the
   * allocation race on every printing option are all resolved.
   */
  resolved: boolean
  /** Decks holding the real copies of this instance's effective printing (spec §7). */
  claimedBy: DeckRef[]
}

interface AlternatePrinting {
  printingId: string
  setCode: string | null
  setName: string | null
  collectorNumber: string | null
  /** Finishes owned for this printing. Display only. */
  finishes: string[]
  owned: number
  availableSupply: number
  imageUriSmall: string | null
}

interface DeckRef {
  deckId: number
  deckName: string
}
```

Row ordering: unresolved before resolved, then `overAllocated` first, then
`cardName`, then `printingId`. Resolved rows keep their position within a client
session because the client replaces its list from mutation responses (§6).

The UI derives nothing about supply. `canSleeve` and `alreadyClaimed` are
computed server-side from one consistent snapshot, so two tabs can never
disagree.

### 4.3 `PATCH /api/onboarding/reconciliation/instance`

```ts
interface SetInstanceStateBody {
  claimId: number
  state: 'planned' | 'sleeved' | 'proxy'
  /** Echoed back on the refreshed view. Optional. */
  batchId?: string
}
```

Response `200`: `{ success: true, view: ReconciliationView }` with
`includeResolved: true`, so a row the write just resolved stays on screen
(spec §14).

Rejects `sleeved` when the effective printing has no room
(`sleevedIntent >= availableSupply`) with `409 sleeve_supply_exhausted`. The UI
already disables the button; the RPC re-checks because the invariant "never more
sleeved instances than copies owned" must hold even if the client is stale. Fail
closed, per the personal-app-scope convention.

Legacy inputs `'release'` and `'sleeve'` are accepted and mapped to `'planned'`
and `'sleeved'`.

### 4.4 `PATCH /api/onboarding/reconciliation/instance/printing`

```ts
interface SetInstancePrintingBody {
  claimId: number
  /** null clears the override and returns to the imported printing. */
  printingId: string | null
  batchId?: string
}
```

Response `200`: `{ success: true, demoted: boolean, view: ReconciliationView }`.

Validation, all fail-closed:

| Condition | Error | HTTP |
|-----------|-------|------|
| Claim not found for this user | `claim_not_found` | 404 |
| `printingId` unknown to `ref_printings` | `printing_not_found` | 404 |
| Target `oracle_id` differs from the imported printing's `oracle_id` | `printing_not_same_card` | 422 |
| User owns no real copy of `printingId` | `printing_not_owned` | 409 |

`printing_not_same_card` is the D-003 guard: an alternate printing is a
different `scryfall_id` for the same `oracle_id`, never a different card.

`printing_not_owned` enforces spec §12 ("Only owned cards can use alternate
printings"). Proxy copies do not qualify.

**Demotion:** if the instance was `sleeved` and the newly selected printing has
no room, the instance is set to `planned` and `demoted: true` is returned. The
alternative — rejecting the printing change — would trap the user, and spec §12
says alternate-printing selection is never blocking. Demotion keeps the supply
invariant without blocking. The UI should surface a toast, not an error.

### 4.5 `PATCH /api/onboarding/reconciliation/instance/wishlist`

```ts
interface SetInstanceWishlistBody {
  claimId: number
  wishlisted: boolean
  batchId?: string
}
```

Response `200`: `{ success: true, view: ReconciliationView }`.

Wishlist state never affects deck membership, supply, `resolved`, or any count
(spec §9).

### 4.6 `POST /api/onboarding/finalize`

Route, request body (`{ batchId?: string }`) and response field names are
unchanged. One field is added:

```ts
interface FinalizeResponse {
  success: true
  finalizedCount: number   // instances given a real copy
  proxiedCount: number     // instances given a proxy (reused or created)
  releasedCount: number    // 'planned' instances settled, slot left planned
  leftOpenCount: number    // instances whose decision could not be satisfied
  settledCount: number     // NEW: claims stamped settled_at this pass
}
```

---

## 5. How counts are computed

This answers the handoff's open question directly.

**Unit.** Every badge counts **conflict printings**, never instances. One card
in three decks with the same printing is one count. The same card name in two
different printings is two counts (spec §6).

**Slot-level resolved.** A deck's slot (one instance) is `resolved` when any of
the following hold:

1. its state is `sleeved` and `canSleeve === true` for its effective printing;
2. its state is `proxy`; or
3. its state is `planned` and **no printing option still has room**.

"Has room" for a printing `p` means `availableSupply(p) > sleevedIntent(p)`
after ignoring this instance's own demand — a planned instance consumes none,
and a sleeved instance switching away would free its current printing. The
printing options to consider are the imported printing plus every
`alternatePrinting` the user owns. Losing the allocation race to other decks
therefore counts as resolved, not unresolved.

A slot is only genuinely unresolved while an action is still possible.

**Printing-level resolved.** A conflict printing is `resolved` when **every**
instance in the row is slot-level resolved. This is the row's `resolved` flag
and the predicate that turns a row green.

**Unresolved** is the negation at the printing level: a row is unresolved if
any of its instances is unresolved. `planned` no longer always counts as
unresolved — a planned slot whose imported printing and every alternate are out
of room is resolved because nothing can be done for it. This makes the badge a
"still actionable" count rather than a "touched every row" count, and it is
what makes "Allocate Cards ({n} unresolved)" and "All imported cards are
reconciled." meaningful (spec §20, §15).

**Badges.**

| Badge | Value |
|-------|-------|
| Owned tab | unresolved rows with `ownership === 'owned'` |
| Unowned tab | unresolved rows with `ownership === 'unowned'` |
| Decks tab | `unresolvedOwned + unresolvedUnowned` |
| Finish bar | `unresolvedTotal` |
| Per deck | unresolved rows having at least one instance in that deck |

Per-deck counts deliberately do **not** sum to `unresolvedTotal`: a printing
wanted by three decks contributes 1 to the tab badge and 1 to each of three
deck headers. The Decks tab is a cross-deck view of printings; deck headers are
per-deck views of the same printings.

`printingMismatch` rows (D-024) sit in the **Owned** tab. The user owns the
card, just not that printing — the alternate-printing selector is the intended
fix, and it only exists on the Owned tab.

---

## 6. Persistence, and filtering resolved rows on reload

This answers the handoff's second and third open questions.

**Where state lives.** Entirely on `import_sleeve_claims`:
`resolution`, `selected_printing_id`, `wishlist`. Server-side, durable,
batch-scoped. A user can close the tab, come back days later, and continue. No
`localStorage`, no session state, no client-derived supply maths. Choices are
therefore identical across tabs by construction (spec §6).

**Resolved rows visible until reload** (spec §14) falls out of two rules:

1. `GET` defaults to `includeResolved=false`.
2. Every `PATCH` returns the full view with `includeResolved=true`.

The client replaces its list from each mutation response, so a row it just
resolved stays in place, turns green, and remains editable. Because the response
contains the full batch view, a write against one deck also updates every other
deck's rows for the same card in the same render — including decks the owner is
not currently viewing. A full reload calls `GET` with the default and the
resolved rows are gone. No client-side bookkeeping and no "recently resolved"
set to keep in sync.

`includeResolved=true` on `GET` exists for tests and for a future "show
completed" affordance. The Frontend agent should not use it on initial load.

---

## 7. Finalization behaviour

`finalize_import_claims(p_user_id, p_batch_id)` remains the single materializer,
one transaction, per-card advisory lock
(`pg_advisory_xact_lock(hashtextextended('import-card:' || card_name, 0))`).
Card-level rather than printing-level, because an alternate-printing selection
moves demand between printings of the same card.

Four changes.

### 7.1 Per-instance materialisation replaces all-or-nothing

Today, if a card is over-committed, finalize materialises **nothing** for it and
settles every claim [Confirmed:
`supabase/migrations/20260920140300_finalize_import_claims_honour_resolutions.sql`].

That guard existed because demand was card-level and the old UI could not stop
over-sleeving. The redesign prevents over-sleeving at both the UI and the RPC
boundary (§4.3), so the guard now only destroys good decisions: one
unsatisfiable instance would discard the user's choices for every other deck
wanting that card.

New behaviour, per effective printing, instances in `claim_id` order:

| State | Action |
|-------|--------|
| `planned` | Keep the claim, stamp `settled_at`. Slot stays planned. |
| `sleeved` | Assign the lowest-id free real copy of the effective printing. If none, stamp `settled_at` and count `leftOpen`. |
| `proxy` | Reuse the lowest-id free proxy copy of the effective printing; if none, create one. |

### 7.2 Exact printing on assignment (D-021)

The copy assigned to a `sleeved` instance must satisfy
`user_copies.printing_id = effectivePrintingId`. There is no name-only fallback.
Today's finalize picks any free copy of the card name and retags
`deck_cards.scryfall_id` to whatever it found — which is exactly the
printing-drift T-21 removed from `reconcile_built_deck` but left in finalize.

### 7.3 Proxy reuse

Spec §8 and §9 require "reuse an existing proxy if one is free; otherwise add a
new proxy copy". Today's finalize always inserts a new proxy row, so repeated
runs accumulate duplicate proxies. Reuse first, create second.

Creation keeps the existing identity resolution (resolve `oracle_id` from
`ref_printings`, create the `user_cards` row if missing) so an unowned card can
still be proxied.

### 7.4 One-location integrity and placement source

Every assignment now also sets:

- `deck_cards.placement_source = 'import'` — required by
  `docs/oracle/contracts/placement-source.md` row 12.
- `user_copies.location_id = NULL` — a copy in a deck is not in storage. Today's
  finalize omits this, leaving copies simultaneously in a deck and in a storage
  location. `reconcile_built_deck` already does it correctly. This is a
  one-location correctness fix, in scope under the safety exception of
  `convention-personal-app-scope.md`.

### 7.5 Claims are kept, not deleted

Materialised claims are deleted (their outcome now lives on `deck_cards`).
Unmaterialised claims — `planned`, and `sleeved` instances that could not be
satisfied — keep their row and get `settled_at` stamped. That is the durable
record behind the cross-page conflict badge and means pressing
"Allocate Cards (12 unresolved)" does not silently erase 12 decisions.

### 7.6 `get_deck_conflict_counts`

Redefined to match the slot-level resolved predicate. A deck's badge counts
distinct `(card_name, printing_id)` pairs where the deck has a claim, open or
settled, whose `deck_cards.copy_id IS NULL`, and where at least one of the
deck's instances for that printing is unresolved per §5.

The old definition recomputed card-level supply maths account-wide and only
counted `resolution = 'sleeve'`. With `planned` as the default that would report
zero conflicts for every deck immediately after import. The new definition
reads "import slots this deck can still do something about", which is both
correct under the new default and easier to explain. A planned slot whose every
printing option is exhausted is resolved and drops from the badge.

---

## 8. Correctness properties

Properties to hold across all valid executions. Each cites what it protects.

| ID | Property | Protects |
|----|----------|----------|
| P1 | For every printing `p`, in-scope instances with state `sleeved` ≤ `availableSupply(p)`. | Spec §8.2, "no tie-breaker". Enforced by `canSleeve`, re-checked in `set_import_claim_state`, preserved on printing change by demotion. **Exemption:** the legacy `set_import_claim_resolution` shim writes without the supply check, deliberately preserving the old screen's behaviour. It is the only path that can violate P1, and it is deleted in Phase 5. |
| P2 | No `user_copies.id` is referenced by two `deck_cards` rows after finalize. | One-copy-one-slot (D-001, D-021). |
| P3 | Every copy finalize assigns satisfies `printing_id = effectivePrintingId`. | D-021. |
| P4 | After finalize, every copy with a `deck_cards` reference has `location_id IS NULL`; every copy released to storage has a non-null storage `location_id`. | One-location model. |
| P5 | Running finalize twice on the same batch creates no additional assignments and no additional proxy rows. | Idempotence; proxy-duplication bug in §7.3. |
| P6 | `GET` with `includeResolved=true` after any `PATCH` returns exactly the written `state`, `selectedPrintingId` and `wishlisted`. | Spec §6, §14 persistence. |
| P7 | `GET` with `includeResolved=false` omits exactly the rows where `resolved === true`. | Spec §14 reload behaviour. |
| P8 | `unresolvedTotal === unresolvedOwned + unresolvedUnowned`, and every row is in exactly one of the two ownership buckets. | Spec §6 count rule. |
| P9 | `selected_printing_id` is always a `scryfall_id` sharing the imported printing's `oracle_id`, of which the user owns ≥ 1 real copy. | D-003, spec §12. |
| P10 | Every `deck_cards` row finalize sets `copy_id` on has `placement_source = 'import'`. | `placement-source.md` row 12. |
| P11 | A `wishlist` write changes no count, no `resolved`, and no `deck_cards` row. | Spec §9 independence. |
| P12 | Changing an instance's state or printing never changes another instance's `state`, except the documented demotion of the same instance. | Spec §8: the instance is the unit of action. |

P1, P5, P8 and P9 are the property-test candidates; the rest are integration
assertions (§9).

---

## 9. Error handling

### 9.1 By layer

| Layer | Failure | Surfaced as |
|-------|---------|-------------|
| Route | missing/non-numeric `claimId`, unknown `state` | `400` `{ error }` |
| Route | no session | existing `requireAuth()` response |
| RPC | claim absent or owned by another user | `404` `claim_not_found` |
| RPC | `sleeved` with no room | `409` `sleeve_supply_exhausted` |
| RPC | alternate printing not owned | `409` `printing_not_owned` |
| RPC | alternate printing unknown | `404` `printing_not_found` |
| RPC | alternate printing is a different card | `422` `printing_not_same_card` |
| RPC | anything else | `500` `{ error: message }` |

Every RPC raises with `ERRCODE = 'P0001'` and a stable machine-readable token as
the message prefix, matching the existing convention in
`set_import_claim_resolution`. The route maps token → status; unknown tokens map
to `500`.

### 9.2 Rollback

Each RPC is a single statement and therefore a single transaction. A failed
`PATCH` leaves no partial state; the client's view is still valid and it may
retry. Finalize runs the whole pass in one transaction with per-card advisory
locks, so a failure part-way leaves zero copies assigned and zero proxies
created — never a half-materialised import.

The one UI-visible non-error mutation is demotion (§4.4). It is reported as
`demoted: true` on a `200`, not as an error, because the user's printing choice
did succeed.

### 9.3 What is deliberately not an error

- Finishing with unresolved rows. Spec §12 and §14: alternate-printing
  over-allocation and leftover `planned` instances warn only.
- `printingMismatch`. D-024 reports it; it never blocks.
- A printing missing from `ref_printings` (unsynced). Display fields come back
  `null`; the row still renders and is still actionable.

---

## 10. Trade-offs, alternatives, and debt

| Decision | Chosen | Alternative rejected | Rationale |
|----------|--------|----------------------|-----------|
| Grouping key | `(card_name, printing_id)` | include `finish` | `deck_cards` has no `finish`, and the import pipeline captures no requested finish. Adding one is a pipeline change, not a contract change. Matches `reconcile_built_deck`. |
| Alternate-printing target | a printing | a specific `user_copies.id` | Counts, over-allocation and grouping are all per printing by owner decision. Copy-level selection would be more precise and is the natural next increment, but it contradicts the locked per-printing grouping today. |
| Value rename | `planned`/`sleeved`/`proxy` in the DB | keep `release`/`sleeve`, translate in the API | `release` no longer means release. A permanent translation layer between spec, UI and DB is exactly how the `scryfall_id`/`oracle_id` class of bug happens. Legacy strings still accepted on input. |
| New routes | `/api/onboarding/reconciliation*` | evolve `/conflicts` in place | The payload shape changes substantially; evolving in place breaks the live screen between the contract commit and the UI commit. |
| Resolved-row filtering | server-side, `GET` default off + mutations return all | client keeps a "recently resolved" set | One rule, no client bookkeeping, no drift between tabs. |
| Wishlist storage | column on the claim | new `user_wishlist` table | The durable wishlist list is explicitly deferred. A table with no consumer is debt. |
| Finalize granularity | per instance | per card, all-or-nothing | The all-or-nothing guard now only discards decisions the UI already prevented from being invalid. |

### Debt to log in the tech debt register

| Item | Trigger to bring it back into scope |
|------|-------------------------------------|
| Conflict printings ignore finish; a foil copy can satisfy a nonfoil request. | Import captures a requested finish, or the owner reports a foil/nonfoil mis-assignment. See §15 for why finish is not part of the printing identifier. |
| Alternate-printing options group by printing, so `condition` cannot be shown per option (spec §12 asks for it). | Owner wants condition-accurate selection ⇒ move to copy-level selection. See §15 for why condition, like finish, is a copy-level attribute. |
| Wishlist toggles are stored on import claims and are deleted with them when a deck is re-imported. | The standalone wishlist feature is built. |
| `get_import_allocations`, `set_import_claim_resolution`, `resolve_import_conflict_*` and `/api/onboarding/conflicts*` remain as dead paths after the new UI ships. | New UI verified in use ⇒ retire (§11). |
| Persistent "who is contesting the same cards" view. | Build a dedicated view that groups reconciliation rows by card/oracle and lists the decks competing for copies, reusing the existing `GET /api/onboarding/reconciliation?includeResolved=true` path already built for this. |
| Import RPCs remain `SECURITY DEFINER` with app-level ownership checks rather than RLS. | TD-037 RLS remediation; multi-user. |

---

## 11. Implementation checklist and sequence

### Deployment sequencing — read first

Changing the default state to `planned` (§3.2) means a freshly imported batch
records no sleeve intent until the user chooses it. The **old** summary screen
derives its conflict list from sleeve intent, so between this migration and the
new UI the old screen shows no conflicts.

That is a display consequence, not data loss: every claim row, printing and deck
slot is preserved, and the new screen renders them all. **Apply the migration
together with the new UI.** The migration also patches `get_import_allocations`
so the old path cannot filter on a value the new CHECK constraint forbids —
without that patch it would silently match zero rows, which is worse than
visibly showing nothing.

Ordered. Each item is small enough to implement unambiguously.

### Phase 1 — Database (Backend agent)

1. Apply `supabase/migrations/20260926140000_import_reconciliation_redesign.sql`
   after owner approval. Sections, in order:
   1. new columns (`selected_printing_id`, `wishlist`)
   2. `resolution` value rename + CHECK + `DEFAULT 'planned'`
   3. `get_import_reconciliation` (new)
   4. `set_import_claim_state` (new)
   5. `set_import_claim_printing` (new)
   6. `set_import_claim_wishlist` (new)
   7. `set_import_claim_resolution` (legacy shim, value-mapped)
   8. `get_import_allocations` (value-compatibility patch only)
   9. `finalize_import_claims` (per-instance materialisation)
   10. `get_deck_conflict_counts` (redefined)
   11. grants for the four new functions (`service_role` only)
2. Regenerate `src/types/supabase.ts`.

### Phase 2 — Server library (Backend agent)

3. New `src/lib/import-reconciliation.ts`: `getImportReconciliation`,
   `setClaimState`, `setClaimPrinting`, `setClaimWishlist`. Thin wrappers over
   the RPCs, fail closed on a missing or malformed `success` field, matching the
   style of `src/lib/import-sleeve-claims.ts`.
4. `src/lib/import-sleeve-claims.ts`: `createSleeveClaimsForDeck` writes
   `resolution: 'planned'`; `FinalizeResult` gains `settledCount`.
5. New pure module `src/lib/import-reconciliation-state.ts` for anything the UI
   still derives (tab routing from `ownership`, row label from
   `resolved`/`overAllocated`/`printingMismatch`). No supply maths — that is
   server-side.

### Phase 3 — Routes (Backend agent)

6. `GET /api/onboarding/reconciliation`.
7. `PATCH /api/onboarding/reconciliation/instance`.
8. `PATCH /api/onboarding/reconciliation/instance/printing`.
9. `PATCH /api/onboarding/reconciliation/instance/wishlist`.
10. `POST /api/onboarding/finalize`: pass through `settledCount`.

### Phase 4 — UI (Frontend agent)

11. Build against §4.2's `ReconciliationView`. Initial load: `GET` without
    `includeResolved`. Every mutation: replace local state with `response.view`.
12. Never compute supply. Use `canSleeve`, `alreadyClaimed`, `claimedBy`,
    `counts`.

### Phase 5 — Retirement (after the new screen is verified in use)

13. Delete `/api/onboarding/conflicts` and `/conflicts/resolve`,
    `getImportAllocations`, `setClaimResolution`, `src/lib/import-allocation-state.ts`.
14. Migration dropping `get_import_allocations`, `set_import_claim_resolution`,
    `resolve_import_conflict_release`, `resolve_import_conflict_proxy`.

---

## 12. Testing strategy

### Property tests (`fast-check`, pure functions)

Target the supply and count maths, extracted into pure helpers so they can be
tested without a database.

| Property | Generator |
|----------|-----------|
| P1 | random (owned, held, instances, states) → asserted `sleevedIntent ≤ availableSupply` after any legal sequence of state writes |
| P8 | random row sets → counts partition exactly |
| P7 | random row sets × `includeResolved` → filtering is exactly the `resolved` predicate |
| Count unit | N instances of one printing across N decks → always contributes 1 to a tab badge and 1 to each of N deck headers |

### Unit tests

- `import-reconciliation-state.ts`: tab routing, row labels, `printingMismatch`
  rows land in Owned.
- Route handlers with a mocked lib layer: body validation, error-token → status
  mapping, `includeResolved` defaulting.
- Legacy alias mapping: `'release' → planned`, `'sleeve' → sleeved`.

### Integration tests (real Postgres, seeded fixtures)

Extend the pattern in `src/lib/__tests__/deck-import-integration.test.ts`.
These need a real database: they assert P2–P5, P10, advisory-lock behaviour and
transactional rollback, none of which can be mocked honestly.

Scenarios:

1. One owned copy, three decks want it. One instance → `sleeved`; the other two
   report `canSleeve: false` and `alreadyClaimed: true`. Finalize assigns exactly
   one copy (P2), with `placement_source = 'import'` (P10) and
   `location_id = NULL` (P4).
2. Card owned only in printing B, deck asked for printing A. Row is
   `ownership: 'owned'`, `printingMismatch: true`, `owned: 0`. Selecting B makes
   `canSleeve: true`. Finalize assigns a B copy and retags
   `deck_cards.scryfall_id` to B (P3).
3. Instance `sleeved` on A; alternate printing B is exhausted. Printing change
   succeeds with `demoted: true` and state `planned` (P1).
4. A free proxy of the printing exists. Two instances choose `proxy`. Finalize
   reuses the free proxy for the first and creates exactly one new proxy (§7.3).
5. Finalize twice on the same batch (P5).
6. Over-committed printing with mixed decisions. Every satisfiable instance
   materialises; the unsatisfiable one is settled and left planned (§7.1).
7. Stale client sends `state: 'sleeved'` with no supply → `409`, no state change.
8. Alternate printing of a different card → `422`, no state change.
9. Reload behaviour: resolve a row, `PATCH` response still contains it, fresh
   `GET` does not (P7).
10. Wishlist toggle changes no count and no `deck_cards` row (P11).

### Read-only integrity checks after any run against real data

```sql
-- P2: no copy in two slots
SELECT copy_id, count(*) FROM deck_cards
WHERE copy_id IS NOT NULL GROUP BY copy_id HAVING count(*) > 1;

-- P4: no copy both in a deck and in storage
SELECT uc.id FROM user_copies uc
JOIN deck_cards dc ON dc.copy_id = uc.id
WHERE uc.location_id IS NOT NULL;

-- P3: no sleeved original whose printing differs from its slot
SELECT dc.id FROM deck_cards dc
JOIN user_copies uc ON uc.id = dc.copy_id
WHERE dc.ownership_status = 'original'
  AND dc.scryfall_id IS NOT NULL
  AND uc.printing_id IS DISTINCT FROM dc.scryfall_id;

-- P10: no import-era placement without a source
SELECT id FROM deck_cards WHERE copy_id IS NOT NULL AND placement_source IS NULL;
```

### What may be mocked

Mockable: Supabase client in route tests, `ref_printings` lookups in pure-function
tests.

Not mockable: advisory locks, transactional rollback, `FOR UPDATE` contention,
the `UNIQUE (deck_cards_id)` upsert path, and the one-copy-one-slot invariant.
Those must run against Postgres.

---

## 13. Owner questions — status

| # | Status | Question | Answer / reason |
|---|--------|----------|-----------------|
| 1 | **Closed** | Should slots that import already sleeved (exact printing, free copy) appear on the reconciliation screen at all? | **Stay hidden.** Conflict-free imports that were already sleeved during import do not appear as editable rows. They still count as supply consumers and surface as `claimedBy` deck tags (§2.5). If the owner later wants them visible, the Designer must spec a read-only treatment. |
| 2 | **Closed** | Spec §12 asks for `condition` in each alternate-printing option. Selection is per printing, so condition cannot be shown truthfully when several copies of a printing exist. Drop condition, or move to copy-level selection in a later increment? | **Drop condition from the printing-level option list.** Scryfall treats a printing (set code + collector number + id) as finish-agnostic; `finishes: string[]` lists every finish a printing exists in, and foil/nonfoil share one id (see §15). `condition` is a copy-level attribute, exactly like `finish` under D-004. It can surface later if selection moves to copy-level granularity; until then it is logged as debt. |
| 3 | **Closed** | Is "Planned counts as unresolved" correct? | **No — not automatically.** A `planned` slot is unresolved only while at least one printing option (imported or alternate) still has room. A `planned` slot that has lost the allocation race on every option is resolved. This makes the badge count "still actionable" printings, not "untouched" rows (§5). |
| 4 | **Closed** | After "Allocate Cards", should `planned` instances keep appearing in the deck-list conflict badge? | **Yes, while they are still actionable.** The badge uses the same slot-level resolved predicate as the reconciliation view (§7.6). A `planned` slot whose every printing option is exhausted is resolved and drops from the badge. |

## 14. Challenges to locked decisions

None. The contract builds on D-001, D-003, D-004, D-005, D-018–D-024 and
`placement-source.md` without reopening any of them. §7.2 and §7.4 extend
T-21's D-021 enforcement from `reconcile_built_deck` into
`finalize_import_claims`, where it was missed.

---

## 15. Scryfall printing / finish reference

This contract treats `finish` as an independent copy-level attribute for the
same reason D-004 does: Scryfall's data model separates *printing identity*
from *finish*.

- A **printing** is identified by `scryfall_id` (or equivalently by set code +
  collector number). That identifier is finish-agnostic: the same id can exist
  in `nonfoil`, `foil`, and `etched` finishes, exposed as a `finishes: string[]`
  array. Foil and nonfoil versions of the same set/collector-number share one
  id.
- **Finish** is therefore not encoded in the printing id. It must be stored as
  a separate field (e.g. `user_copies.finish`) and matched alongside the id,
  never derived from the id. Use Scryfall search syntax `is:foil`,
  `is:nonfoil`, `finish:etched`, and bulk-data fields (`Default Cards` /
  `All Cards`) for offline finish lookups.
- Assuming finish is encoded in the printing id will miss etched/foil-only
  printings or double-count cards that exist under one id across multiple
  finishes.

**Exceptions where a finish-like distinction is its own printing** (distinct
collector number and id): borderless, showcase, extended art, Surge Foil, and
Secret Lair variants. Those are printing distinctions, not finish-encoding
schemes. Star-suffixed collector numbers (★) can mark foil-only variants for
some releases.

**Consequence for this contract.** The conflict-printing key is
`(card_name, printing_id)`; finish is deliberately excluded from the key (§3.4,
§10). `condition` is the same class of attribute as finish — copy-level, not
printing-identity-level — so it is also excluded from alternate-printing
options (§13 Q2).
