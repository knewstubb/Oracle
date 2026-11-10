# Contract: Card State and Actions (T-28)

## Status

DRAFT, bounded Astra revision of the frozen T-28 draft; architecture hardening is
complete, but implementation acceptance is **PARTIAL / gated**. The behaviour rules come from the owner-approved
[Plan 1](../plans/01-behaviour-and-actions.md) and D-002, D-005, D-018–D-033. This
document fixes their precise meaning so Backend and Frontend build the same thing.
It does **not** approve database migrations, stored-data transitions, visuals or a
release. Those remain separate gates (§14).

Companion types: [`card-state-actions.types.ts`](card-state-actions.types.ts);
reproducible checks: [`card-state-actions.examples.ts`](card-state-actions.examples.ts).
A disagreement blocks handoff; neither prose nor types silently overrides the other.

### Authority legend (applies to every normative rule, including types/examples)

- **[A] Already approved:** only the behaviour in the following register. Approval
  of behaviour is not approval of a wire shape, screen, migration or release.
- **[E] Necessary technical enforcement:** all other normative statements in this
  document/types/examples unless explicitly marked [P]. These prevent approved
  rules from becoming false under errors, identity ambiguity or concurrent actions.
  They are a proposed implementation contract, not a new owner product decision.
- **[P gate] Proposal:** the named gate must be accepted before that behaviour is
  executable. Examples marked conditional demonstrate consequences, not approval.
  A whole paragraph/table row/section marked [P] inherits that classification.

| [A] Rule | Authority |
|---|---|
| Three readiness labels; Commander exactly 100 including selected commander(s); optional rows excluded; no manual Draft override or new legality gate | D-002 |
| Canonical versus printing identity; independent finish; exact physical copy retained | D-003, D-004, D-021 |
| Separate optional membership, releasing copies on Maybeboard move | D-005, D-018 |
| Five availability labels and preference; explicit Sleeve/Move; no silent theft, printing switch, copy deletion or half-move | D-025, D-033, Plan 1 B1-B3 |
| Proxy creates and sleeves one new copy; existing proxy is sleeved, not recreated | D-026 |
| Original-only shortages include proxy-filled demand, never affect readiness/assignments | D-027 |
| Remove Missing presentation without changing excluded-copy eligibility/data | D-028 |
| Folder move does not release copies; Break down retains list | D-029 |
| Explicit loading/error/staleness; essential identity/location/eligibility | D-030, D-033 |
| Import intent separate from inventory effects; generic basics auto-Sleeved without inventory | D-018-D-024, D-031, D-032 |
| Remaining action consequences in §7 (not storage-policy or conversion proposals) | Plan 1 approved behaviour direction |

**Commander-first handoff:** use known Commander format, verified separate
membership, positive quantities, one tracked card per row, verified assignments,
resolved canonical identity and complete fresh supply. Existing generic basics
need no conversion. Sleeve/Move/reuse an existing proxy are not blocked by Casual,
global shortage-scope or Missing-restoration decisions. New Proxy creation remains
conditional on G-M3; Maybeboard mutation on G-M4/G-M5. Affected excluded/ambiguous
rows are blocked without hiding the rest of the deck. UX may demonstrate the
conditional steps but must label them. Backend cannot enable writes until §14's
transaction/replay prerequisites are accepted and implemented.

Evidence tags: `[Confirmed: path]` = read in the repository on 2026-09-29.
`[Approximate]` = inferred and not proven (for example, the live database may
differ from repository migrations).
Unchanged findings outside Assignment B retain the frozen original report's
source attribution; they are not a new broad audit or live re-verification.

---

## 1. Vocabulary: internal name → owner label

Internal names do not need renaming just to change what the owner sees (D-025).
Owner-facing text must use only the right-hand column.

| Internal (code / DB) | Owner label | Notes |
|---|---|---|
| `deck_cards.copy_id IS NOT NULL` / lifecycle `sleeved` | **Sleeved** | |
| `deck_cards.copy_id IS NULL` / lifecycle `planned` | **Unsleeved** | "Planned" must not be shown to the owner (D-025). |
| Generic basic slot (§4) | **Sleeved** | Automatic (D-032). Internal status `generic_land` [Confirmed: src/lib/card-status.ts]. |
| `user_copies.is_proxy = false` / `ownership_status='original'` | **Original** | |
| `user_copies.is_proxy = true` / `ownership_status='proxy'` | **Proxy** | |
| `CardSlotStatus 'available'` | **Available** | |
| `CardSlotStatus 'alternate'` | **Alt available** | |
| *(does not exist yet)* | **Proxy available** | New `proxy_available` status is required. Today a free proxy ranks as tier 2 but has no status [Confirmed: src/lib/allocation-candidates.ts `classifyTier`; src/lib/card-status.ts `CardSlotStatus`]. |
| `CardSlotStatus 'claimed'` | **Unavailable** | Always give the reason and source deck(s). |
| `CardSlotStatus 'unowned'` | **Unowned** | Only when the lookup succeeded and there is neither an original nor a proxy (§3.4). |
| `user_copies.missing = true` | *(no label)* | D-028 retires this from the owner-facing product. See §12. |
| `decks.status` (legacy brew/boxed) | *(none)* | Replaced by the derived Draft / Assembling / Playable (§5). |
| Verified separate optional `deck_cards` membership | **Maybeboard** | Imported Maybeboard and Sideboard map here (D-005, D-018); categories alone are not authoritative (§2.1). |

---

## 2. Core predicates

Every endpoint, RPC and UI calculation must use these single definitions. Today
several copies of them disagree (see §14.1).

### 2.1 Slot relation: required vs optional

**[A]** Required = main-list membership including commanders; optional = separate
Maybeboard membership under D-005/D-018. The same canonical card can have separate
main and optional row IDs. Neither relation reserves a copy merely by existing.

**[E] Representation gate G-M4:** generated `deck_cards` has `categories` text but
no durable `relation`/`is_maybeboard` field. The import RPC accepts an
`is_maybeboard` payload flag, writes separate rows, then stores categories; its
successor matches existing relation using `categories LIKE '%Maybeboard%'`.
The deck-list reader instead uses the first JSON category and also excludes
Sideboard. These disagree for secondary tags, malformed categories and Sideboard.
[Confirmed: src/types/supabase.ts; supabase/migrations/20260926120000_import_maybeboard_relation.sql;
supabase/migrations/20260926130000_exact_printing_import.sql; src/app/api/decks/route.ts]

This revision does **not** choose either heuristic as the locked relation.
The reference input requires `relation: required | optional | unresolved`.
Backend must establish a reviewed source-of-truth adapter with provenance before
emitting known membership; where legacy text alone cannot prove membership, emit
`relation_unresolved`, suppress affected actions and return unknown readiness and
incomplete shortages. Do not drop the row. Fixtures supply explicit relation facts;
they do not certify a production adapter.

**[P G-M4]** Recommend a durable discriminator for separate `deck_cards` membership,
retaining distinct row IDs; assess an additive migration and a read-only ambiguity
inventory later. No migration draft, backfill or category reinterpretation is
authorised. This is a Backend/Architect representation gate, not a request to
reconsider the approved Maybeboard behaviour.

### 2.2 Card count of a slot

`deck_cards.quantity` may be greater than 1: the add-card and batch routes accept
a quantity [Confirmed: src/app/api/decks/[id]/cards/route.ts; .../cards/batch/route.ts].
Import and brew save write one row per card with quantity 1
[Confirmed: src/lib/deck-import.ts; supabase/migrations/20260926120000_import_maybeboard_relation.sql].

- **Card count** is the validated positive safe-integer quantity. Deck size uses card count, so one
  row of "Island ×36" counts as 36 cards, as D-032 requires.
- Null, zero, negative, fractional, non-finite or unsafe quantities (including
  overflow in totals) produce `invalid_quantity`; no coercion to 1. Return an
  explicit diagnostic, unknown readiness/progress and incomplete shortage counts.
- A **tracked** row can hold at most one copy (`copy_id` is a single value).
  Quantity > 1 produces `multi_quantity_tracked_row`: preserve its real quantity
  and copy, but no executable Sleeve/Move/Proxy, no authoritative readiness or
  shortage total for that deck/card. `outstandingCount` may show the validated
  quantity less the single held copy; invalid quantities use null, never zero.
  **[P G-D3]** Splitting into quantity-1 rows needs a later reviewed conversion,
  retaining existing copy assignment and list total. Do not split now.
- The current deck list counts rows, not quantity [Confirmed: src/app/api/decks/route.ts `total += 1`].
  That is wrong for multi-quantity rows and must change to card count.

### 2.3 Canonical card and printing

- **Canonical card** = `oracle_id`. The copy's canonical card comes from
  `user_copies.card_id → user_cards.oracle_id`. The slot's canonical card is
  resolved from `deck_cards.scryfall_id` through `ref_printings`. With no printing,
  a discrete resolver may use an exact canonical reference name yielding exactly
  one oracle ID (multiple printings of that same oracle are not ambiguous).
  This is stricter than the existing name-fallback identity trigger.
  [Confirmed: supabase/migrations/20260916065913_index_friendly_scryfall_lookup_in_identity_trigger.sql]
- **Requested printing** = `deck_cards.scryfall_id` (nullable).
- **Copy printing** = `user_copies.printing_id`.
- **Finish** = `user_copies.finish`. It is shown, never inferred from the printing,
  and never part of printing matching (D-004).
- Current supply lookups match by `card_name` [Confirmed: src/lib/allocation-candidates.ts
  `fetchEnrichedSupply`]. New contract consumers match on resolved `oracle_id`.
  Never use an approximate name/front-face match to authorise a physical action.
- Resolver path: validate printing identifier -> exact reference lookup -> one
  canonical oracle; absent/malformed printing mappings do not silently fall back
  to name. With no printing, exact-name lookup must be complete and unambiguous.
  Query failure, no result, conflicting oracle IDs or unresolved names yield
  `identity_unresolved`/`identity_ambiguous`, not Unowned. A suggested name match is
  a non-executable diagnostic until the resolver succeeds. At write time verify
  copy owner, `card_id` oracle and printing mapping again inside the transaction.
- Reuse the small printing resolver/batch lookup in `src/lib/identity-resolver.ts`
  after adding the necessary user scope to owned-card resolution. Do not import
  its CSV fallback chain, network fallback or default finish mapping into this
  contract. The pure `resolveIdentity` example consumes supplied reference facts,
  performs no I/O, and is not an identity backend.
  [Confirmed: src/lib/identity-resolver.ts]

### 2.4 Generic basic slot

A slot is **generic** when all of these are true:
- `card_name` is a basic land name: Plains, Island, Swamp, Mountain, Forest,
  Wastes, or a Snow-Covered basic [Confirmed: src/lib/basic-lands.ts];
- `scryfall_id IS NULL`;
- `copy_id IS NULL`;
- the slot is required.

A basic-name row with a null `scryfall_id` that **does** hold a copy is treated as
an ordinary Sleeved tracked slot. Its copy stays reserved; nothing is released
automatically (§13). A basic slot with a `scryfall_id` is a **tracked basic** and
follows the normal rules (D-032). Optional (Maybeboard) basic rows are just
optional rows.

### 2.5 Copy holder and freedom

- A copy is **held** when some `deck_cards.copy_id = copy.id`. The holder is that
  slot, which gives the holder deck and whether the holding slot is required or
  optional.
- A copy is **excluded** while `user_copies.missing = true` (D-028 interim, §12).
  Excluded copies are never eligible, never free, and never usable originals.
- A copy is **free** when it is not held and not excluded. Its location is
  irrelevant to freedom.
- A failed holder/exclusion/location join is not a null field. Multiple holders,
  an unverified owner or partial eligibility data block the affected row. Even a
  holder with `allocate=false`, `is_active=false` or a folder change means held.
- This intentionally matches `computeUnresolvedStatuses`
  [Confirmed: src/lib/card-status.ts]. It does **not** match import's stricter
  "in a `storage`-type location" rule
  [Confirmed: supabase/migrations/20260926130000_exact_printing_import.sql].
  Import keeps its current rule until the import spec aligns it (open question Q4).

### 2.6 Copy location (never invent one)

| Copy state | `CopyLocation` returned |
|---|---|
| Held by a slot | `{ kind: 'deck', deckId, deckName, deckCardId, relation }` |
| Free, `location_id` → `user_locations.type='storage'` | `{ kind: 'storage', locationId, name }` |
| Free, `location_id` → `type='deck'` location | `{ kind: 'recorded_deck_location', locationId, name, deckId }`. Recorded, but no slot holds the copy. Show it as recorded; do not claim it is sleeved. |
| Free, `location_id IS NULL` | `{ kind: 'not_recorded' }`. The UI must say "location not recorded". |

Sleeved copies have `location_id = NULL`
[Confirmed: supabase/migrations/20260925220000_placement_source.sql `_move_copy_to_slot`].
Their location is the holder deck. Free copies must never be given a placeholder
name: `PicklistV2` currently shows "Unsorted" for all of them, and the card-actions
route shows "Unknown" (§14.1).

---

## 3. Availability of an Unsleeved required tracked slot

This applies only to slots that are required, not generic, and Unsleeved. Sleeved,
generic and optional slots have no availability headline.

### 3.1 Option set (every usable choice is kept)

**Candidate copies** are all copies of the slot's canonical card that are **not
excluded** and are **not held by another slot in the same deck**. Such copies are
counted for the Unavailable reason but are not offered, because moving one would
just Unsleeve a sibling slot.

Each candidate becomes one option:

| Candidate | Option kind | Action offered |
|---|---|---|
| Free original | `free_original` | **Sleeve** |
| Free proxy | `free_proxy` | **Sleeve** (reuses the existing proxy; D-026) |
| Held by a slot in another deck | `in_other_deck` | **Move from [deck]** |

The **Proxy** choice is not removed merely because usable copies exist (Plan 1's
Sol Ring step 4). It is executable only for a valid, freshly verified row and an
approved proxy-printing policy (G-M3). A blocked/error/stale row has no actions,
including Proxy; an otherwise ready row can have a typed gated Proxy offer.

### 3.2 Printing match

- `matchesRequestedPrinting = requestedPrinting == null || copy.printing_id == requestedPrinting`.
  Null means no requested restriction, not a claimed exact-printing identity.
- Unknown copy printing or finish is returned explicitly, never changed to
  newest/nonfoil. The affected availability read is unknown and the row is blocked
  until essential facts resolve; unknown printing is not proof of an alternate.
- Finish never affects matching. It may break ties in ordering: the existing
  `scoreCandidate` gives +1 to nonfoil [Confirmed: src/lib/allocation-candidates.ts].
- Tracked basics use the same matching. D-023's fungibility is an import rule only.

### 3.3 Headline algorithm

Evaluate in order; the first match wins:

0. Verify complete, fresh identity/supply/holder/exclusion facts first. Any failure
   is an explicit unknown/error, not a lower-ranked success.
1. A free original whose printing matches → **Available**.
2. A free original with another printing → **Alt available**.
3. A free proxy of any printing → **Proxy available**.
4. The owner has at least one non-excluded original or proxy of this card, but none
   is free → **Unavailable**. Reasons: `held_by_other_deck` (list the holder decks),
   `held_in_this_deck` (another slot here holds it).
5. Only excluded copies exist → **Unavailable** with reason
   `excluded_pending_review`. This is interim, and its wording goes to the owner
   under G-D1. It must not read "Missing" and must not say Unowned.
6. No copies of either type → **Unowned**.
Errors are handled before this ordered success algorithm, never after Unowned.

### 3.4 Ordering of options

Order options by headline order: matching free originals, alternate free
originals, free proxies, then copies in other decks. Within each group, order by
the existing within-tier score, then copy id. The headline is a recommendation
only; nothing is auto-selected (D-020).

---

## 4. Generic basic lands (D-032)

- They count as **Sleeved**, and their card count counts toward deck size.
- They create no `user_copies`, reserve nothing, and appear in no availability,
  pick-list outstanding rows or original-shortage demand.
- They offer none of Sleeve, Move, Proxy or Change copy.
- **[P G-D2]** Choosing a printing could convert a generic row into tracked
  Unsleeved slots. This is not approved merely by D-032; block generic-to-tracked
  and tracked-to-generic conversions until quantity, copy-release and confirmation
  design is accepted. Ordinary Choose printing applies only to already tracked
  Unsleeved quantity-1 rows.
- Break down, Remove, Unsleeve and Move to Maybeboard release nothing for them.

---

## 5. Deck readiness (D-002)

### 5.1 Inputs

Readiness uses the complete deck membership/quantity/commander facts and verified
assigned-copy facts, not the availability of unassigned candidate copies.
A failed free-supply lookup can coexist with independently known Assembling
readiness; failed assignment identity/holder/exclusion verification cannot produce
Playable. Null `copy_id` is Unsleeved only after the row itself loaded successfully.
Stale/partial deck reads, unresolved relation, invalid quantity, duplicate holder,
unverified assigned copy or unresolved commander selection yield
`{ kind: 'unknown', state: null, issue, message }`. This is data status, not a fourth
readiness label. Do not render a missing badge as an unexplained successful state.

### 5.2 Algorithm

```
validate  = complete/fresh rows + membership + quantity + assignments (§2, §8)
required  = rows where verified relation = required   (§2.1)
cardCount = Σ cardCount(row) over required            (§2.2)
sleeved   = Σ over required of:
              generic slot           → cardCount(row)
              copy_id IS NOT NULL    → 1
              otherwise              → 0
complete  = sizeRuleSatisfied(format, cardCount) AND commanderRuleSatisfied
state     = !complete           → Draft
            sleeved < cardCount → Assembling
            otherwise           → Playable
```

- `commanderRuleSatisfied`: when the format has a commander (`hasCommander`), at least
  one **required** row must have `is_commander = true`. Otherwise it is always true.
  `decks.commander_name` alone does not satisfy it. [Approximate: existing decks
  created through `decks/create` and import set `is_commander` rows; decks with
  only `commander_name` have not been audited.] If the two representations disagree
  or commander facts were not fetched, return `commander_unverified`; do not erase
  a legacy selection or confidently call it Draft. An explicitly verified lack
  of a selected commander is Draft. Paired commanders each count in the 100.
- There is no manual Draft override and no legality gate. Colour identity,
  singleton and banned-card checks stay in the separate legality information.

### 5.3 Size rule per format

Source: `FORMAT_DEFINITIONS` and `validateDeckCount`
[Confirmed: src/lib/format-config.ts].

| Format | Size rule | Commander required |
|---|---|---|
| commander | exactly 100 | yes |
| standard, modern, legacy, vintage, pioneer, pauper | at least 60 | no |
| cube | at least 360 | no |
| casual | **no size rule**; see gate G-O1 | no |
| null or unknown string | `unknown_format`, no invented Commander fallback | unknown |

**Casual:** `validateDeckCount` returns `valid: true` for any count, so an empty
casual deck would become Playable. The contract does not invent a rule. For
casual decks the response returns `readiness.state = null` with
`issue: 'format_has_no_size_rule'` and an explicit explanation. **[P G-O1]** The
Casual completeness rule and presentation remain gated, outside the Commander
slice. The reference returns unknown rather than proposing an empty Playable deck.
The current `getFormatConfig` Commander fallback is inspected behaviour, not
approval to interpret corrupt or unknown format data as Commander.

---

## 6. Pick list (D-033) — primary assembly screen

### 6.1 Contents

- **Outstanding rows:** one row per Unsleeved required tracked slot with its
  full verified option set (§3). An anomalous row is retained as a blocked row,
  not omitted from success or exposed as executable.
- **Excluded:** generic basics, optional (Maybeboard/Sideboard) rows and Sleeved
  slots. The current route includes Maybeboard rows in both pulls and progress
  [Confirmed: src/app/api/decks/[id]/picklist/route.ts]. That must stop.
- **Progress:** `{ requiredCards, sleevedCards, genericBasicCards, outstandingCards }`.
  These use §5 counting, so `sleevedCards` includes generic basics, plus the deck
  `readiness`.
- **Location and eligibility are essential.** The pick list is not "loaded" until
  every outstanding row has options or an explicit per-row error (D-030).

### 6.2 Response shape

`PicklistResponse` in the types file. Per outstanding row:

- `deckCardId`, `cardName`, `oracleId`, `requestedPrinting` (`printingId`,
  `setCode`, `collectorNumber?`, `setName?`), `isCommander`, `primaryCategory`,
  `outstandingCount`, discriminant `kind: ready | blocked`
- `availability`: a headline label with reason and holder decks, or
  `{ kind: 'error' }`
- `options[]`. Each option has:
  - `copyId` and `copyType` (`original` | `proxy`)
  - `printing` (`printingId`, `setCode`, `collectorNumber`, `setName`) and `finish`
  - `matchesRequestedPrinting`
  - `location` (`CopyLocation`, §2.6)
  - `action` (a `sleeve` or `move_from` descriptor that carries the exact
    precondition values to send back)
  - `donorImpact` (for Move from: the donor deck's readiness before and after)
- `proxy`: executable descriptor with G-M3 policy/printing/finish, an explicit
  gated offer, or null on blocked rows. No unconditional `proxyAction`.
- A ready row has a non-null oracle ID, `outstandingCount: 1`, observation and
  known availability. Blocked rows have error issue/message, `options: []` and
  `proxy: null`. Only ready rows generate requests with observation preconditions.

Top level: `deck` (`id`, `name`, `format`, `readiness`), `progress`, `generatedAt`,
`dataState` (`complete` | `partial`). Progress is a `ReadState<PicklistProgress>`;
unknown counts are not zero. A partial response includes at least one explicit
row/deck issue, and cannot claim the assembly screen is entirely complete.

### 6.3 Row errors

If the copy lookup fails for any row, that row becomes blocked with an explicit
error, empty `options`, null `proxy`, and the response gets `dataState: 'partial'`. The
current route turns fetch failures into empty candidates, which the client then shows
as Unowned [Confirmed: picklist route `catch` block]. That must stop.

---

## 7. Actions

### 7.1 Common rules

- Every action runs as **one atomic database operation** including its operation
  receipt. Lock affected slots/copies in one documented deterministic order shared
  by all writers, using the existing `collection-copy:<id>` convention for copies.
  Proxy locks the target slot before creating a new copy. Backend must harmonise
  existing mixed lock orders; retries alone are not an atomicity guarantee. No action may:
  - take a copy from another deck without an explicit Move from;
  - switch a printing or finish;
  - delete an owned copy;
  - leave a cross-deck move half done.
- Every request carries **expected-state preconditions**: the values the client last
  saw. The server compares them inside the transaction. On a mismatch it changes
  nothing and returns a conflict error with the current state (§8).
- Every write carries `operationId` and `observationToken`. The server binds the
  latter to authenticated owner, relation, quantity, canonical identity, requested
  printing, target/source copy/holder and eligibility revisions. It expires when
  any relevant fact changes, including a move away and back (ABA), even if current
  IDs happen to match again. `generatedAt` alone cannot prove this. A mutation
  must revalidate ownership and these facts within its transaction. No client
  `userId` or forged action descriptor authorises a write.
- Every placement writes `placement_source` (D-009). Owner clicks use `manual`.
- Every success returns `ActionSuccess` (§9): a durable historical `receipt`,
  separately qualified `current` read, and `refresh` references. A failed
  post-commit refresh means "saved, refresh failed", not failed save or rollback.

### 7.2 Action table

In this table, "Slot" means the target `deck_cards` row.

| Action | Request (key fields) | Preconditions | Postconditions | Existing operation | Gap |
|---|---|---|---|---|---|
| **Sleeve** | `deckCardId`, `copyId`, `expectedSlotCopyId: null`, `expectedCopyHolderDeckCardId: null` | Slot required, tracked, Unsleeved. Copy is the same canonical card, not excluded, and **free**. | Slot holds the copy (`ownership_status` from the copy type). Copy `location_id = NULL`. No other slot changed. | `assign_physical_copy` → `_move_copy_to_slot(force=false)` | **G-M1:** `_move_copy_to_slot` silently takes a copy held by a deck whose `decks.allocate` is false. Sleeve must reject any held copy with `copy_not_free`. [Confirmed: placement_source.sql lines 150–175] |
| **Move from [deck]** (at the destination) | `targetDeckCardId`, `copyId`, `expectedSourceDeckCardId` (not null), `expectedTargetCopyId: null` | Target required, tracked, Unsleeved. Copy is held by exactly `expectedSourceDeckCardId` in another deck. | Source slot becomes Unsleeved (the **entry remains**). Target holds the copy. Both decks are affected. | `force_claim_copy` | **G-M1:** no expected-source check, so a copy that moved elsewhere in the meantime would be taken from its new holder. |
| **Move to [deck]** (at the donor) | `sourceDeckCardId`, `expectedCopyId`, `targetDeckCardId` (explicit), `expectedTargetCopyId: null` | Source slot holds `expectedCopyId`. Target is required, tracked, Unsleeved, the same canonical card, in another deck. | Same as Move from. | `reassign_to_deck` | **G-M2:** it picks the target slot by name and lowest id, and can pick a Maybeboard or other wrong slot. Require an explicit target slot. |
| **Proxy** | `deckCardId`, `expectedSlotCopyId: null`, `approvedProxyPolicyId`, explicit `printingId`, `finish` | Required, tracked, quantity-1 Unsleeved slot; resolved identity; G-M3 approved. | Exactly one new proxy is created and sleeved atomically, at the policy-confirmed printing/finish. No implicit latest printing. | `add_proxy_to_slot` currently chooses newest/nonfoil [Confirmed: supabase/migrations/20260925220000_placement_source.sql] | **[P G-M3]** Printing/finish selection policy remains unapproved; [E] durable replay required. `target_filled` proves no replay. |
| **Unsleeve** | `deckCardId`, `expectedCopyId` | Slot holds `expectedCopyId`. | Slot becomes Unsleeved and the entry remains. Copy becomes free at the **default storage** location, or `not_recorded` when there is no default. Response returns the resulting `CopyLocation`. | `unassign_copy_to_storage` | Add the `expectedCopyId` check (G-M1). It returns the copy to default storage, not its previous shelf [Confirmed]. |
| **Remove from deck** | `deckCardId`, `expectedCopyId` (nullable) | The slot exists. | The row is deleted. Any held copy goes to default storage. | `remove_deck_card_with_release` [Confirmed: 20260912190000_atomic_remove_deck_card.sql] | Add the expected check. |
| **Move to Maybeboard** | `deckCardId`, `expectedCopyId` (nullable) | Verified required membership; G-M4 adapter accepted. | Optional membership replaces required membership atomically; held copy is released to storage and commander selection removed. No category-only update substitutes for membership. | Today categories PUT has no release [Confirmed: src/app/api/decks/[id]/cards/[cardId]/categories/route.ts; frozen T-28 finding] | **G-M4/G-M5:** durable representation and atomic release; do not conflate two existing main/optional rows. |
| **Move to main list** | `deckCardId`, `newPrimaryCategory` | Verified optional membership with no held copy. | Required membership, Unsleeved (or existing generic, §2.4); category is presentation metadata only. No inventory effect. | categories PUT is insufficient | **G-M4/G-M5**, ownership and expected-state checks. |
| **Choose printing** | `deckCardId`, `printingId`, `expectedSlotCopyId: null` | Slot is **Unsleeved**. The printing's oracle equals the slot's canonical card. | `scryfall_id` and `set_code` updated. **Does not sleeve.** | `PATCH decks/[id]/cards/[cardId]` | **Gap:** today it also changes Sleeved slots [Confirmed]. Reject with `slot_not_unsleeved`. |
| **Change copy** | `deckCardId`, `expectedCopyId`, `replacement`: selected copy and holder, or new proxy with approved policy/printing/finish | Slot holds `expectedCopyId`. The replacement is the same canonical card, and free unless an explicit confirmed donor is named. New proxy requires G-M3. | Outgoing copy goes to recorded storage destination. Replacement is sleeved atomically; donor slot, if any, becomes Unsleeved. | `replace_proxy_with_original` covers only proxy → free original. | **G-M6:** general atomic replacement. Even the existing narrow case must meet G-M1/G-M9 before being executable. |
| **Break down** | `deckId` | Deck owned. | Every held copy goes to default storage (excluded copies get a NULL location). The list is unchanged. Readiness is recomputed, with generic basics still Sleeved. | `release_deck_copies` | Return `releasedCopyIds` for refresh. |
| **Folder move** | `deckId`, `folderId` | Deck and destination folder owned; expected observation current. | Only `folder_id` changes. **No release, no readiness change** (D-029). | existing folder update | No globally named retired folder is introduced. |
| **Undo last move** | `undoToken` | Current assignment matches the recorded one. | The recorded move is reversed. | `undo_copy_move` (`current_assignment_mismatch`, `slot_claimed_elsewhere`) [Confirmed] | none |

### 7.3 Proxy on a filled slot

A Sleeved slot never gets a second assignment. The Proxy action is not offered
there; **Change copy → new proxy** is gated by G-M3/G-M6, and the
outgoing copy goes to storage. An API call to Proxy on a filled slot returns
`slot_already_filled` with the current slot.

### 7.4 Duplicate clicks and retries

An exact retry is proved by a durable record keyed by **(authenticated user,
operationId)** and a server-computed fingerprint of the action, all IDs, expected
state, observation token, selected printing/finish/policy and placement source.
No client-provided fingerprint is trusted. A repeated click while one operation
is pending reuses that ID and identical payload; a changed intent requires a new
ID and fresh confirmation. UI disabling alone is not correctness.

| Observed operation record | Response / permitted effect |
|---|---|
| Same ID + fingerprint committed | `outcome: replayed`, original receipt, **no write**, including no re-sleeve after a later transfer. Fetch current state separately and refresh original donor/destination plus newly discovered holders. |
| Same ID + different fingerprint | `idempotency_key_reused` (409), no write. Never reinterpret as a new operation. |
| Same ID still executing | `operation_pending`, reconcile the same operation; no second execution. |
| Proven never accepted and no state change | Execute once after transaction precondition checks; record receipt in that same transaction. |
| Receipt unavailable/expired or network outcome unknown | `outcome_unknown`; reconcile by same ID, do not manufacture success or retry under a new ID. |
| New operation but target already filled / source changed | Conflict (`slot_already_filled`, `copy_not_free`, `source_changed`, `stale_observation`); no write, even if the copy happens to be the one wanted. |

The existing `_move_copy_to_slot` `already_assigned` shortcut is not proof of the
same operation. The existing proxy `target_filled` exception is not proof that
this caller created a proxy. [Confirmed: supabase/migrations/20260925220000_placement_source.sql]

**G-M9 technical prerequisite:** persistent operation identity, fingerprint,
receipt and consumed-ID/tombstone retention; revision/precondition mechanism;
same-user receipt reconciliation through the existing action transport (same
request) before writes can ship. Do not reset an expired ID to "never accepted".
No receipt store is present in the inspected RPCs; design its forward migration
and retention separately. No process-memory dedupe or timestamp-only workaround.
If any step fails before commit, all slots/copies/receipt roll back. If the response
is lost after commit, replay retrieves the receipt without repeating the mutation.

---

## 8. Load states, errors and retry

### 8.1 Load states (D-030)

Every read response is either a success body or an `ErrorBody`. Within a success:
- the pick list uses `dataState: 'partial'` together with row-level `{ kind: 'error' }`;
- `readiness.state` is non-null only when the deck rows loaded;
- the shortage response uses `dataState` in the same way.

`ReadState<T>` discriminates `known`, `loading`, `error`, `partial`, `stale`.
Only known has an authoritative value and observation. Readiness separately uses
`known` with one of the three labels or `unknown` with null state and issue.
The client retains old content visibly marked stale outside the actionable
response; stale rows have no executable descriptors. Never render loading,
failed/partial reads as Unowned, Playable or "nothing to pull".

Freshness is scoped: a complete coherent owner-scoped snapshot produces an opaque
revision token and `observedAt`; essential multi-query reads must verify revision
stability or retry as reads, not return mixed-era facts. Mark stale after relevant
mutation/refresh start. Discard out-of-order responses older than the latest
requested/accepted revision; do not use wall-clock timestamp comparisons as the
only ordering guard. A server recheck remains mandatory for another session's
concurrent changes. Readiness can remain known after an unrelated price failure.

**Current violations:**
- `computeUnresolvedStatuses` returns every name as `unowned` on a query error
  [Confirmed: src/lib/card-status.ts].
- The deck list defaults a missing status to `unowned` [Confirmed: src/app/api/decks/route.ts `?? 'unowned'`].
- The pick list swallows candidate errors (§6.3).

### 8.2 Error shape

```
ErrorBody = { ok: false, error: { code, message, retry, current? } }
```

`message` is owner-safe plain language. `retry` is one of:
- `none`: the request is invalid;
- `refresh_then_decide`: the state changed, so show the current state and let the
  owner choose again;
- `retry_same`: the failure was transient.
- `reconcile_operation`: the action may have committed; same operation ID and
  payload only. No "success" toast or new action ID while its outcome is unknown.

| Code | HTTP | From | Retry |
|---|---|---|---|
| `not_found` | 404 | `target_not_found`, `copy_not_found`, `not_found`, deck not owned | none |
| `slot_already_filled` | 409 | `target_filled` | refresh_then_decide (`current` = slot) |
| `copy_not_free` | 409 | new G-M1 check | refresh_then_decide (`current` = copy holder) |
| `source_changed` | 409 | new G-M1 check (the expected source differs) | refresh_then_decide |
| `slot_changed` | 409 | the expected copy differs (Unsleeve, Remove, Change copy, Move to) | refresh_then_decide |
| `copy_excluded` | 409 | `copy_missing` | refresh_then_decide (message must not say "Missing") |
| `slot_not_unsleeved` | 409 | Choose printing or Sleeve on a filled slot | refresh_then_decide |
| `slot_not_required` | 422 | a target in a Maybeboard, or a generic slot | none |
| `card_mismatch` | 422 | identity trigger or oracle check | none |
| `current_assignment_mismatch`, `slot_claimed_elsewhere` | 409 | `undo_copy_move` | refresh_then_decide |
| `unavailable` | 503 | a database or network failure | retry_same |
| `invalid_quantity`, `unsupported_quantity` | 422 | invalid or multi-quantity tracked row | none (review data; no automatic split) |
| `identity_unresolved`, `relation_unresolved` | 422 | unresolved canonical identity or membership | none (resolve facts before a new request) |
| `stale_observation` | 409 | revision/eligibility changed, including move-away-and-back | refresh_then_decide |
| `approval_required` | 409 | gated product policy or conversion | none |
| `idempotency_key_reused` | 409 | same ID, changed payload | none |
| `operation_pending` | 409 | recorded operation is still in progress | reconcile_operation |
| `outcome_unknown` | 503 | receipt or commit outcome cannot be verified | reconcile_operation |

`unavailable/retry_same` is safe for reads or a write proved rolled back. A client
timeout/disconnect is instead unknown outcome unless a durable result proves
otherwise. Report errors through existing route logging/owner-safe notifications;
do not log credentials or private card data unnecessarily.

---

## 9. Refresh identifiers

`ActionSuccess.receipt.affected` (at original commit) and `ActionSuccess.refresh`
(union with any later known holders):

```
{ deckIds: number[]; deckCardIds: number[]; copyIds: number[];
  oracleIds: string[]; cardNames: string[]; collection: true }
```

- `deckIds` **always includes the donor and destination** for Move, Change copy
  with a donor, and Undo.
- `collection` is true for every copy-changing action.
- For moves, source and target slot IDs and the exact copy ID are retained in the
  receipt, even after the copy moves again. `oracleIds` never contains printing IDs.

Mapping onto the existing query keys [Confirmed: src/hooks/useDeckQueryKeys.ts]:
- For each `deckId`:
  - `['decks', id]`
  - `['decks', id, 'card-statuses']`
  - `['decks', id, 'health']`
  - `['picklist', id]`
  - `['allocation', id]`
- Once per action:
  - `['decks']`
  - `['collection']`
  - `['card-actions', deckId, cardName]` for every affected deck/name pair
  - `['original-shortages']` (proposed new prefix; only if that view is enabled)

The executable `refreshKeys` reference proves numeric donor and destination keys,
including pick lists outside the `['decks']` prefix. Collection rollup, printing
and expansion keys share `['collection']`.
[Confirmed: src/hooks/useCollectionRollup.ts; src/hooks/useCollectionPrintings.ts]
Other outstanding decks for affected canonical cards may also have changed
availability: invalidate their cached pick-list/card-actions results by the
oracle-to-deck dependency map or conservatively invalidate those prefixes.
If a late current-holder lookup fails, invalidate all cached pick lists and
card-actions rather than leave an undiscovered donor actionable.

**Current gaps** [Confirmed: src/components/PicklistV2.tsx]:
- Pick-list claim, assign and proxy mutations refresh only the destination deck.
- A donor check reads `assignedTo.deckStatus === 'in_rotation'`, which is never
  populated, so the transfer confirmation is skipped.

---

## 10. Original shortages (D-027)

The shortage list is informational only. It never changes lists, assignments or
readiness, and adds no deck badges.

### 10.1 Calculation (per canonical card, `oracle_id`)

The subtraction/proxy exclusion is [A]; choosing scope and which originals are
usable for that scope is [P Q1 matching]. The following formula only consumes
verified facts under an approved policy or the explicitly labelled fixture policy.

```
requiredSlots   = Σ validated quantity over verified required, non-generic slots in an explicitly approved scope
                  (whether Unsleeved, Sleeved-original or Sleeved-proxy)
originalsUsable = count of the owner's originals of this card that are not excluded
                  (free + held in that same scope, each copy counted once)
additionalOriginalsNeeded = max(0, requiredSlots − originalsUsable)
```

- Proxies, whether free or sleeved, never reduce `additionalOriginalsNeeded`.
- A row appears only when `additionalOriginalsNeeded > 0`.
- **[P Q1]** No interim all-deck default. Global shortage publication is gated
  until the owner chooses which decks count, including Draft/folder-organised
  retired decks. Examples explicitly scope Korvold/Prosper; they do not establish
  a global policy. Folders have user-chosen names/IDs, no reserved "retired" name.
- **[P Q1 matching]** For a limited scope, recommend counting free originals and
  originals already held inside that scope. Show originals held outside separately,
  rather than assume permission to move them. This supply rule is conditional on
  the scope decision; "owned original" totals still include all originals.
  All-deck examples have no outside holders. No negative/unknown input yields zero.
- **[P Q1 matching] Printing matching:** recommend counting at canonical-card level. An owned
  original of another printing is a usable original (it would be Alt available).
  An optional `printingDetail` lists how many slots request each printing against
  the originals owned of each printing, for information only. A printing difference
  alone never creates a shortage. Finish is ignored.
- Tracked basics are counted; generic basics are not (D-032).

### 10.2 Row fields

- `oracleId`, `cardName`, `requiredSlots`
- `slotsByState` (`unsleeved`, `sleevedOriginal`, `sleevedProxy`)
- `originalsUsable`, `originalsFree`, `originalsSleeved`
- `originalsOwned` (all owned originals, including excluded/out-of-scope copies),
  `originalsHeldOutsideScope` ([P Q1] context, not presumed free supply)
- `proxiesSleeved`: proxies actually in required slots. Spare proxies are not counted.
- `proxiesSpare`: free proxies, shown separately.
- `freeOriginalsThatCouldReplaceProxies = min(originalsFree, proxiesSleeved)`. This
  avoids suggesting a purchase when an owned original could be swapped in.
- `additionalOriginalsNeeded`
- `originalsPendingReview`: the excluded-original count, for the G-D1 transition
  view only (it may be hidden)
- `decks[]` (`deckId`, `deckName`, `readiness`, `folderName`, `requiredSlots`,
  `sleevedOriginal`, `sleevedProxy`, `unsleeved`)

### 10.3 Worked examples

These are [A] arithmetic consequences within the explicit two-deck fixture,
with verified canonical matches and no excluded/out-of-scope originals. They do
not approve the global scope or alternate-printing matching proposals above.
Partial/failed membership, quantity or supply must produce issues, never an empty
successful shortage list. `OriginalShortagesResponse` carries scope and issues;
`dataState: partial` requires issues and cannot claim completeness.

| Case | required | originals usable | proxies sleeved | needed |
|---|---|---|---|---|
| Sol Ring: Korvold and Prosper, one original, nothing else | 2 | 1 | 0 | **1** |
| Same after Proxy in Korvold (both Playable) | 2 | 1 | 1 | **1** |
| Two slots filled by proxies, no originals | 2 | 0 | 2 | **2** |
| Two slots filled by proxies, one free original | 2 | 1 | 2 | **1** (`freeOriginalsThatCouldReplaceProxies` = 1) |
| Two slots filled by proxies, two free originals | 2 | 2 | 2 | 0: row hidden; proxies stay sleeved |

---

## 11. Import (D-031, preserving D-018 to D-024)

The **physical intent** (Sleeved or Unsleeved) and the **inventory effect** (existing
collection, or `new_cards`) are separate choices.

| Intent × inventory | Effect |
|---|---|
| Sleeved + existing collection | `reconcile_built_deck`: exact-printing matching (D-021), fungible basics (D-023), `printing_mismatch` conflicts (D-024). Maybeboard and Sideboard rows go to optional slots with no copies (D-018). Only **free** copies are used. **No automatic allocation pass** beyond this explicit reconciliation (D-020), and no destructive recompute. |
| Unsleeved + existing collection | Diff import. All tracked slots stay Unsleeved and no copies move. A complete list is Assembling (D-031). |
| Sleeved + `new_cards` | `replace_deck_with_new_cards` creates one copy per main-list tracked card and sleeves it. It creates no copies for optional rows (D-022). |
| Unsleeved + `new_cards` | Creates the copies **free** (default storage), not sleeved. **G-M7:** there is no RPC mode for this yet [Confirmed: `replace_deck_with_new_cards` always sleeves]. |

- **Generic basics in every mode:** no copy is created and no copy is assigned.
- **Gap:** the `new_cards` path builds a copy for every main card, including
  generic basics, with a null printing
  [Confirmed: src/lib/deck-import.ts new-cards loop; the RPC's `COALESCE(printing_id, scryfall_id)`].
  That contradicts D-032. The fix is to skip copy creation for generic rows (G-M7).
- Import never duplicates an existing copy. Re-importing never releases a copy
  except under the existing D-021 mismatch rule.

---

## 12. Missing transition gate (D-028)

**[A/E] Safe boundary (no data change):**
- No Missing action, label, filter or state appears anywhere. "Mark as missing"
  is removed from the card popover [Confirmed: src/components/StatusChipPopover.tsx
  calls `/api/physical-copies/{id}/missing`].
- Flagged copies stay excluded from eligibility, freedom and usable originals (§2.5).
  They are counted under the neutral reason `excluded_pending_review` (§3.3) and
  `originalsPendingReview` (§10.2).

**[P G-D1] Owner approval needed before any transition:**
1. A read-only review lists each flagged copy with its card, copy type, printing,
   finish and last-known context. `mark_copy_missing` already cleared its location
   and deck slot [Confirmed].
2. Recommend keeping it excluded until located; alternatively restore only a
   reviewed copy with an explicitly chosen recorded location, or a clearly
   approved "location not recorded" result. Existing unmark behaviour records
   default storage (frozen T-28 finding), which is not approval to do so here.
   Restoration/location policy remains unapproved. Deletion is not a offered
   transition in this slice; no records are deleted or eligibility re-enabled.
3. There is never an automatic re-sleeve.

Unrelated contract work does not wait for G-D1.

---

## 13. Generic/tracked basic transition [P G-D2; not executed]

Proposed action "Make generic" on a required basic-land slot:
- **Precondition:** the name is a basic land, and `expectedCopyId` is supplied.
- **Effect:**
  - if Sleeved, the copy goes to default storage and stays owned and free;
  - `scryfall_id` and `set_code` become NULL;
  - the slot is now generic and counts as Sleeved.
- **Bulk migration of existing data** (including basic rows that have a null printing
  but hold a copy, §2.4): produce a read-only preview per deck (slots, copies to be
  released) and wait for owner approval (G-D2). Nothing is converted automatically.

---

## 14. Current code gaps and remaining gates

### 14.1 Code gaps the implementation slice must close (no owner decision needed)

- The pick list includes Maybeboard rows, swallows errors and ignores the preferred
  printing [Confirmed: picklist route].
- `fetchEnrichedSupply` and the batch version do not filter out excluded copies
  [Confirmed].
- `PicklistV2` reads `entry.storageLocationName`, but the server sends `locationName`,
  so every copy shows "Unsorted". The card-actions route defaults to `'Unknown'`
  [Confirmed].
- There is no `proxy_available` status. `computeUnresolvedStatuses` reports errors
  as `unowned` [Confirmed].
- Mutations refresh only one deck, and the transfer check reads a dead field
  (§9) [Confirmed].
- Choose printing changes Sleeved slots [Confirmed].
- Deck size counts rows, not quantity (§2.2) [Confirmed].
- The popover still shows Missing and reads `holder.deckStatus === 'brewing'`
  [Confirmed].
- **Security (S1):**
  - The picklist and card-statuses routes read, and the categories route **writes**,
    `deck_cards` by `deck_id` or id through the admin client without checking
    `user_id` [Confirmed].
  - The new contract endpoints must check deck ownership; `not_found` is returned for
    another user's deck.

### 14.2 Migration gates (Backend proposes; each needs approval before deployment)

| Gate | Change |
|---|---|
| G-M1 | Expected-state parameters on `_move_copy_to_slot`, `unassign_copy_to_storage` and `remove_deck_card_with_release`. Sleeve must reject held copies. |
| G-M2 | `reassign_to_deck` takes an explicit target slot and rejects optional and generic targets. `assign_free_copy` has the same slot-selection issue. |
| G-M3 [P] | Approve proxy printing/finish policy before changing `add_proxy_to_slot`; no assumed requested/newest default. |
| G-M4 | Resolve separate membership representation, not a primary-category SQL heuristic (§2.1). Later additive discriminator/backfill proposal may be needed. |
| G-M5 | Atomic Move to Maybeboard with release. |
| G-M6 | General atomic Change copy. |
| G-M7 | Import: an Unsleeved + `new_cards` mode, and no copies for generic basics. |
| G-M8 [P, optional] | A unique partial index on `deck_cards(copy_id) WHERE copy_id IS NOT NULL`. Today uniqueness relies on locks only [Approximate: the live database may already differ]. Needs a read-only duplicate check first. |
| G-M9 | Durable user-scoped operation receipts/consumed IDs plus observation revisions; idempotency and coherent-read support (§7.4). Required before write slice, not an optional retry enhancement. |

### 14.3 Data and owner gates

| Gate | Question |
|---|---|
| G-D1 | Disposition of existing Missing-flagged copies (§12). |
| G-D2 | Converting existing tracked or copy-holding basic slots to generic (§13). |
| G-D3 | Splitting tracked rows that have quantity > 1 (§2.2). |
| G-O1 | Casual format completeness rule (§5.3). |
| Q1 | Do decks in a retired folder, or Draft decks, count toward original shortages? |
| Q4 | Should import's "free" rule (storage-only) align with the broader rule in §2.5? This belongs to the import spec. |
| Visual | Pick-list and shortage visuals (UX), and the O-006 milestone markers. |

### 14.4 Compact owner decision pack [P; none selected]

Recommendation first. These are only unresolved behaviour choices, not questions
about locks, indexes, identifiers or relation storage.

| Gate | Recommendation and visible alternative | Trade-off / concrete example |
|---|---|---|
| Q1 shortage scope/matching | Recommend explicitly chosen decks and any suitable original printing; alternatively all decks, including Draft and folder-organised retired decks. | Korvold and Prosper need two Sol Rings; a third retired list should not silently change "1 more" to "2 more". A copy held outside the chosen set is shown separately, not presumed movable. |
| G-D1 formerly excluded copies | Recommend keep excluded until located; alternatively restore reviewed copies with the owner confirming a location or explicitly accepting "location not recorded". | A flagged Sol Ring cannot suddenly appear available in Binder A. No deletion option in this work. |
| G-M3 new proxy details | Recommend use the requested printing where present, otherwise require an explicit printing; use a clearly shown nonfoil proxy finish. Alternative: always choose printing/finish explicitly. | Creating a Sol Ring proxy never silently switches artwork; explicit selection costs an extra choice. |
| G-D2/G-D3 basic/quantity conversion | Recommend preserve existing tracking and defer conversion; alternatively approve a per-deck preview that preserves totals and shows copies released/split. | Making 12 tracked Forests generic must not lose or invisibly reserve their real copies. Choosing a printing for 12 generic Forests needs 12 tracked slots. |
| G-O1 Casual readiness | Recommend defer Casual from this release; alternatively agree a separate completeness target before extending readiness there. | An empty Casual deck is not silently declared Playable. Commander design continues. |

G-M4, G-M9 and unknown-identity/error handling are engineering handoff gates, not
new product decisions for the owner. Visual approval is still required, not
invented here. Q4 import eligibility stays in a later import-specific handoff.

### 14.5 Current storage shape and bounded implementation handoff

No schema is changed. The following is the repository shape, not a live schema
certification. [Confirmed: src/types/supabase.ts; supabase/migrations/20260907061042_fix_user_cards_unique_constraint.sql;
supabase/migrations/20260912114410_collection_foundation_default_storage_location.sql]

| Surface read/written later | PK, FKs and uniqueness | Required query/index review |
|---|---|---|
| `deck_cards` | integer `id`; `deck_id -> decks.id`, `copy_id -> user_copies.id`, legacy `proxy_of_deck_id -> decks.id`; one copy reference per row, no verified unique-copy constraint | owner/deck row reads `(user_id, deck_id)`, reverse holder lookup `copy_id`; G-M8 duplicate inventory before uniqueness |
| `user_cards` | integer `id`; canonical `oracle_id`; unique `(oracle_id, user_id)` | owner/canonical lookup uses compound unique key |
| `user_copies` | integer `id`; `card_id`/`proxy_for_card_id -> user_cards.id`, `location_id -> user_locations.id`; copies intentionally not unique by printing/finish | `(user_id, card_id)`, exact copy PK and reverse-holder join; `printing_id` is a Scryfall printing ID, not canonical |
| `decks` | integer `id`; `folder_id -> deck_folders.id`, commander/build reference FKs | `(user_id, id)` ownership, folder/list reads; no unique deck name assumption |
| `user_locations` | integer `id`; nullable `deck_id -> decks.id`; partial unique indexes for non-null deck ID, storage `(name, user_id)`, and one default per user | owner/location lookup, recorded type/name; default storage is a recorded release destination, not proof of a previous shelf |

Generated relationship metadata is not a full uniqueness/index/RLS audit.
Historical PK/rename evidence: [Confirmed: supabase/reconciliation/pre-ledger/outer-migrations/20260702112545_001_initial_schema_tier1_and_2.sql;
supabase/reconciliation/pre-ledger/outer-migrations/20260702112557_001_initial_schema_tier3_and_4.sql;
supabase/reconciliation/pre-ledger/outer-migrations/20260702112616_001_initial_schema_tier5a.sql;
supabase/migrations/20260730032938_rename_card_tables.sql;
supabase/migrations/20260730044951_rename_tables_prefix_convention.sql;
supabase/migrations/20260812220000_fix_locations_unique_constraint.sql].
All user-owned rows already carry `user_id`; new receipt/revision storage must
also be user-scoped with owner RLS. Service-role routes must explicitly check both
decks, all slots/copies, related owned card/location/folder and receipt ownership;
return not_found for another user's objects. Verify deployed keys/RLS/indexes in
an authorised later read-only preflight; no speculative index additions now.
`deck_cards.scryfall_id`, `user_copies.printing_id` and printing reference IDs
identify printings; `user_cards.oracle_id` identifies canonical cards. Finish is
its own copy column. No identifier aliases/conversions are implied.

**Smallest coherent slice:** Commander read adapter and pick list plus atomic
Sleeve/Move/Unsleeve/reuse-existing-proxy and Break down, after G-M1/M2/M4/M9.
Generic auto-coverage needs no inventory change. Add new Proxy only after G-M3;
Maybeboard release after G-M5; global shortages after Q1. No application work is
authorised by this contract.

| Role | Exact reuse and boundary |
|---|---|
| Backend | Reuse `GET /api/decks/[id]/picklist`, card-status/card-actions readers and discrete identity resolver; adapt reads to the types, preserve explicit errors. Reuse `POST /api/allocation/assign`, `/claim-from-deck`, `/add-proxy` transports and named §7 RPCs, not a new competing API. Map existing `deckCardsId`/`physicalCopyId` at one boundary to `deckCardId`/`copyId`. Require operation ID/observation fields; legacy handlers cannot be called executable until upgraded. Each action/receipt is one transaction; no route-level sequence of release then assign. |
| UX | Prepare Plan 2's existing component visual board using known/blocked/stale states, exact recorded locations, existing vs new proxy and donor impact. Mark G-M3/Q1/conversion examples conditional. No new design in this contract. |
| Frontend | Reuse `PicklistV2`, `CardsTab`, `StatusChipPopover`, `ConfirmationModal`, `deckKeys`/invalidators after UX approval. Read discriminants, never reconstruct eligibility from legacy tier/activity flags. Preserve row during failure; reuse one operation ID on timeout; wait for committed response before success; refresh both decks and stale all affected supply readers. |
| T-15 | Consume §17 read-only facts only, not action descriptors or gated shortages. Final interface acceptance waits for cross-contract review; this work does not inspect another changing worktree. |

Rollback: disable new writes if the coherent slice fails; do not fall back to
legacy stealing/unsafe retry paths. Read-only content may remain with explicit
unknowns. Committed moves are reversed only by an explicit verified undo/new
action, not by UI rollback after timeout. Preserve newly created proxies, receipts,
copy IDs, exclusion flags and membership history; no clear-and-recompute or
destructive backfill. A migration/revision rollout and rollback plan remains a
separate Backend/Architect deliverable requiring approval.

---

## 15. Acceptance matrix

Setup for A1–A7: one free original Sol Ring in "Binder A" and no proxies. Korvold
and Prosper are Commander decks with 100 required cards and a commander. Sol Ring
is Unsleeved in both and every other slot is Sleeved.
Relations/identity/assignments are verified fixture facts. Shortage scope is
explicitly these two decks, not a global default. A4/A8 are **conditional G-M3**
examples with explicitly approved fixture printing/nonfoil policy; A12 is
conditional on the G-M4/G-M5 representation/transaction implementation gate.

| # | Given / When | Then |
|---|---|---|
| A1 | View both decks | Both **Assembling**. The shortage row for Sol Ring shows required 2, originals 1, proxies sleeved 0, needed 1. Neither deck has a badge. |
| A2 | Korvold's pick list; Sleeve the original | The option showed `storage: Binder A`, Original, printing and finish, headline Available. Afterwards Korvold is **Playable** and Prosper stays **Assembling**. Shortage still needs 1. |
| A3 | Prosper's pick list; Move from Korvold | The option showed `deck: Korvold` with donor impact Playable→Assembling, and headline Unavailable (held by Korvold). Afterwards Prosper is **Playable**. Korvold is **Assembling** and still lists Sol Ring, Unsleeved. `affected.deckIds` = both, and both pick lists refresh. |
| A4 | Korvold's pick list; Proxy | Exactly one new proxy is sleeved. Both **Playable**. Shortage: needed 1, proxies sleeved 1. |
| A5 | Unsleeve Korvold's proxy | Korvold **Assembling**. The proxy is free in default storage (or `not_recorded`). Ownership is 1 original + 1 proxy. Korvold's headline is **Proxy available**. Shortage still needs 1, with proxies sleeved 0 and proxiesSpare 1. |
| A6 | Sleeve that free proxy | Korvold **Playable**. The proxy count is still 1. |
| A7 | Break down Prosper | Prosper's list is unchanged and its original returns to default storage. Prosper is **Assembling**. The collection still has 1 original + 1 proxy. |
| A8 | Proxy repeated with the same operation ID and payload | One creation receipt, `outcome: replayed`, no write. A different operation that filled the slot is a conflict, never replay. |
| A9 | Commander deck with 99 or 101 required cards, all Sleeved | **Draft**. |
| A10 | 100 required cards, all Sleeved, no `is_commander` row | **Draft**. |
| A11 | Commander deck: 64 tracked Sleeved cards (including the commander) + 36 generic basics = 100 | **Playable**. No copies exist for the basics. The pick list has 0 outstanding rows. The basics are absent from shortages. |
| A12 | Same deck; move one tracked Sleeved card to Maybeboard | Its copy is freed to storage. Required count becomes 99, so **Draft**. The Maybeboard entry remains. |
| A13 | Copy lookup fails for one row | That row shows an error. It is never Unowned. `dataState: 'partial'`. |
| A14 | The deck rows fail to load | Error body; no readiness is shown, and never Playable. |
| A15 | Slot requests printing X. Free originals: Y only | **Alt available**. Sleeving Y is an explicit choice, and the slot's requested printing is unchanged. |
| A16 | Two slots filled by proxies, 0 originals / 1 free original / 2 free originals | Needed 2 / 1 / 0 (row hidden). No proxies are unsleeved automatically. |
| A17 | Move from with a stale donor (the copy moved after the list loaded) | `source_changed`. Nothing changes and the current holder is returned. |
| A18 | Folder move of a Playable deck | Still **Playable**. No copies are released. |
| A19 | Choose printing on a Sleeved slot | `slot_not_unsleeved`. Nothing changes. |
| A20 | Casual deck / unknown format | Unknown readiness with explicit `format_has_no_size_rule` / `unknown_format` issue, no invented label; Casual remains gated. |
| A21 | The only copy is Missing-flagged | **Unavailable** (`excluded_pending_review`). Not Unowned, not offered, and the word "Missing" is not shown. |
| A22 | Sleeve a copy that another deck holds | `copy_not_free`. Nothing is taken. |
| A23 | Zero/null/fractional/negative/non-finite quantity | `invalid_quantity`, unknown readiness/counts, no normalization or action. |
| A24 | Tracked Sol Ring row quantity 2, with zero or one assigned copy | `multi_quantity_tracked_row`, blocked actions and unknown readiness. Preserve data pending G-D3. |
| A25 | Partial/stale eligibility read or failed location/holder join | Row blocked; no Sleeve/Move/Proxy. No Unowned/empty success. A truly null recorded location remains `not_recorded`. |
| A26 | Unknown canonical identity, fuzzy/front-face name fallback or ambiguous exact reference | Explicit resolver error; no physical move. An exact reference name mapping to one oracle is allowed. |
| A27 | Two copies with different IDs/printing/finish and an existing proxy | Preserve every exact option and location; null requested printing matches any verified printing. Reusing a proxy creates no copy. |
| A28 | Same Sleeve/Move/Proxy operation replayed after an intervening transfer | Original receipt only, no re-sleeve/no new proxy. Current snapshot shows later holder, or explicit refresh error; original and new affected decks invalidated. |
| A29 | New operation with stale preconditions, including copy moved away then back | Conflict; do not treat same current holder/copy as proof of retry. |
| A30 | Timeout before/after unknown commit; pending record; expired/unavailable receipt | Reconcile same ID, never fresh-ID duplicate execution. Changed payload with same ID is rejected. |
| A31 | Donor `allocate=false` or inactive/folder-organised | Sleeve still rejects held copy; explicit Move needed. Donor list remains and both numeric refresh-key sets are present. |
| A32 | Secondary Maybeboard tag / malformed categories / two main+optional entries | Adapter cannot infer membership from category alone; unresolved yields unknown, while verified separate main/optional IDs remain distinct. |
| A33 | Partial shortage supply or invalid counts | Explicit issue, no successful zero shortage; proxy counts never enter original supply. |
| A34 | Assigned copy's identity/exclusion verification fails or copy appears twice | Unknown readiness, never Playable; no automatic release/repair. |
| A35 | Generic/tracked conversion or new Proxy without policy approval | Gated, no executable action or inventory change. Existing generic auto-Sleeved rule remains approved. |
| A36 | Older read arrives after mutation, or replay's current read fails | Keep authoritative mutation receipt, reject old action descriptors, show explicit stale/error and refresh. |

---

## 16. UX hand-off: fields available to the pick-list prototype

- **Deck:** `name`, `format`, `readiness.state`, `progress`
  (`requiredCards`, `sleevedCards`, `genericBasicCards`, `outstandingCards`),
  `dataState`, `generatedAt`.
- **Row:** `cardName`, `isCommander`, `primaryCategory`, `requestedPrinting`
  (`setCode`, `setName`, `collectorNumber`),   `outstandingCount`, `kind` and observation, and the
  `availability` label and reason, with `holderDecks[]` for Unavailable or the
  error state.
- **Option:**
  - `copyType` (Original or Proxy), `printing` (`setCode`, `setName`,
    `collectorNumber`), `finish`, `matchesRequestedPrinting`;
  - `location`:
    - storage name;
    - source deck name and its readiness;
    - "recorded deck location" name;
    - not recorded;
  - `action` kind (Sleeve or Move from), and `donorImpact` (the donor's readiness
    before and after).
- **Proxy:** executable only on a verified ready row with approved G-M3 policy;
  otherwise gated, or null for a blocked row. These are not new UX designs.
- **Group by source:** use `location.kind` and name. Not-recorded copies need their
  own explicit group.

## 17. Read-only T-15 availability boundary [E]

`AdvisorAvailabilityRequest` accepts canonical `oracleId`, nullable requested
printing ID and optional deck context. Authenticated owner comes from the server,
not model input. Resolve/verify canonical-printing correspondence before lookup.
With a deck context this represents an ordinary outstanding tracked requirement;
Sleeved/generic/optional state is separate, not relabelled Unowned. Without a deck,
report free/held copies for that canonical card without implying a slot exists.

`AdvisorAvailability = ReadState<AdvisorAvailabilityFacts>` returns one of the
five approved labels, reasons/holder decks, separate original/proxy ownership,
exact copy IDs, printing, finish and recorded location, excluded-copy count and
observation. Unknown essential printing/finish or failed joins make the read
unknown/partial, not absent inventory or a guessed alternate. A known null recorded location is
`not_recorded`, never an invented shelf. A pending exclusion is not Unowned.
The advisor may describe a non-executable unknown fact but cannot infer that a
copy is movable. It consumes the same §3 predicate, not its own shortage/readiness
logic. It gets **no action descriptors, operation IDs, undo tokens or writes**.
Observation tokens here are read provenance, never write authorisation.

T-15 integration acceptance: verify five-label priority, existing proxy distinction,
held/inactive donor identity, unresolved canonical mapping, stale ownership, failed
lookup, alternate printing/independent finish and excluded-copy handling. Prices,
legality and model rationale are outside this boundary. Global shortage scope,
Casual readiness, new-proxy defaults and conversions must not leak in as assumed
approved facts. Cross-contract acceptance remains pending the reviewed successor.

## 18. Bounded change log and reproducible reference checks

| Frozen draft gap | This revision |
|---|---|
| Approved behaviour and interim proposals blended | Authority legend/register; Commander-first subset; conditional gates and owner pack |
| Category position treated as Maybeboard truth | Separate relation retained; schema ambiguity and adapter/migration gate, no silent heuristic |
| `max(quantity, 1)` and multi-quantity actionable rows | Explicit invalid/anomaly errors; no coercion, no copy splitting |
| Readiness null only for Casual; failed eligibility could succeed | Known/unknown discriminants and coherent freshness; assignment verification separated from free-supply lookup |
| Proxy offered on every error row | Ready/blocked row union, gated Proxy policy, typed preconditions |
| Any filled slot treated as successful Proxy retry | Durable exact-operation receipts, conflict/unknown outcomes, intervening transfer and ABA rules |
| Name fallback could authorise moves | Discrete exact resolver/error path and canonical identity checks |
| Incomplete donor refresh and printing-match inconsistency | Numeric both-deck key oracle and null-request match definition; original/proxy/finish/location retained |
| Global all-deck shortages adopted provisionally | Explicit scope gate; conditional examples only; partial issues never successful empty results |
| Temporary, unreproducible checks | Persistent offline examples covering original journey plus only Assignment B gaps |

Run the pure references without application imports, credentials or network:

```sh
node --experimental-strip-types docs/oracle/contracts/card-state-actions.examples.ts
tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions docs/oracle/contracts/card-state-actions.types.ts docs/oracle/contracts/card-state-actions.examples.ts
```

Examples are reference truth-table/shape checks, **not proof of database atomicity,
deployed behaviour or browser invalidation**. G-M1/M4/M9 acceptance later requires
isolated transaction/concurrency tests with the actual adapters/RPCs, including
two simultaneous new operations, double-click replay, lost response, timeout
rollback, move-away-and-back, excluded/other-owner copies and both-deck refresh.
No application/server/database suite is part of this task.
