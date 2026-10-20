# Contract: per-copy import attributes (import row editing)

## Status

READY for Developer handoff (rev 2, 2026-10-20). Owner approved the row-editing
design (spec rev 4, mockup, Designer report) and, on 2026-10-20, answered the open
questions (§13) and **approved both migrations for the Developer to apply** (§8).
One question is still open and has a safe default (§13, Q3: Unsleeved).

Spec: `docs/oracle/specs/import-row-editing.md` (rev 4). Reference types:
[`import-row-editing.types.ts`](./import-row-editing.types.ts). Migrations (owner-approved 2026-10-20, not yet applied):
`supabase/migrations/20261020120000_deck_import_per_copy_attributes.sql` (deck copies) and
`supabase/migrations/20261020120100_ref_printings_finishes.sql` (allowed finishes per printing).
Builds on [`manabox-import.md`](./manabox-import.md); sections of that contract
named below are superseded as stated.

Decisions relied on, none changed: D-001, D-003, D-014, D-038, D-041, D-044, D-045,
D-047, D-048, D-050, D-051, D-053.

---

## 1. What exists today (confirmed)

- **One condition and one language per row, and they are the first line's.**
  `ManaBoxPreviewRow` has a single optional `condition` and `language`
  [Confirmed: docs/oracle/contracts/manabox-import.types.ts]. `combineResolvedRows`
  copies them from the first candidate and discards the rest
  [Confirmed: src/lib/manabox-import.ts `combineResolvedRows`].
- **Collection combine key** is `scryfallId|finish|language` (D-051); condition is
  not in the key [Confirmed: src/lib/manabox-import.ts `combineResolvedRows`].
  **Deck combine key** is `scryfallId|finish` (no language) [same].
- **Collection write already keeps each source line's own condition**, because it
  loops over the un-combined candidates, not the combined rows
  [Confirmed: src/lib/manabox-collection-import.ts, step 2]. So per-copy
  condition is a UI/shape change there, not a storage change. What it does *not*
  do is let the owner change finish, condition or language: Original/Proxy is the
  only per-copy choice, applied through a "proxy budget" consumed in file order
  [Confirmed: same file, `remainingProxies`].
- **Language is defaulted too early.** The parser turns a blank language into
  `'en'` before anything else sees it [Confirmed: src/lib/manabox-import.ts,
  `const language = (row.language ?? '').trim().toLowerCase() || 'en'`]. After that
  point "the file said English" and "the file said nothing" are the same thing,
  so the "From your file" dot cannot be computed. This must change (§3).
- **Condition is defaulted too early at write time.** `mapCondition` returns
  `near_mint` for blank *and* unrecognised input [Confirmed: src/lib/identity-resolver.ts
  `mapCondition`]; the collection import uses it on every copy, proxies included
  [Confirmed: src/lib/manabox-collection-import.ts]. It also does not recognise
  `dmg` (only `d` and `damaged`) [Confirmed: src/lib/identity-resolver.ts `CONDITION_MAP`].
- **Deck write drops finish, language and condition.** `replace_deck_with_new_cards`
  inserts every copy with `finish = 'nonfoil'` and sets no language or condition
  [Confirmed: supabase/migrations/20260926120000_import_maybeboard_relation.sql].
  `importManaBoxDeck` sends only `is_proxy`/`is_maybeboard` per row
  [Confirmed: src/lib/manabox-deck-import.ts `DeckCardInsertRow`]. T-57 drafted a
  fix for finish only; it is not applied and not on main (see §8).
- **Collection write path** is `insert_user_copies`, whose row reader already
  accepts `finish`, `language`, `is_proxy`, `card_condition` (stored in the column
  `condition`) and passes a `NULL` condition through
  [Confirmed: supabase/migrations/20260912163000_atomic_collection_insert_ids.sql].
  Column facts: `user_copies.condition`, `.finish`, `.language` are nullable text
  [Confirmed: src/types/supabase.ts]. No CHECK constraint on them appears in the
  repo migrations [Approximate: a baseline schema outside `supabase/migrations/`
  could still have one].
- **Scryfall's per-printing `finishes` list is not stored or fetched by the import.**
  `ref_printings` has prices (including `price_usd_foil`) but no finishes column
  [Confirmed: src/types/supabase.ts `ref_printings`; src/lib/card-data-sync.ts maps
  prices only]. The resolver selects `oracle_id, scryfall_id, name, set_code, layout,
  type_line` [Confirmed: src/lib/manabox-resolver.ts `PRINTING_COLUMNS`]. The
  `finishes` that the reconciliation screen shows are the finishes of copies the
  owner *owns*, not Scryfall's list [Confirmed:
  supabase/migrations/20260926140000_import_reconciliation_redesign.sql `printing_supply`].
- **Row identity in the UI** is built from the row's own values:
  `scryfallId:finish:language:sourceIndex` [Confirmed: src/components/manabox-import/types.ts
  `rowId`]. Per-copy editing would re-key a row when its values change (§4).
- **Sample files** carry explicit `Condition`, `Language`, `Foil` on every line
  (`near_mint`, `en`, `normal`) [Confirmed: docs/oracle/samples/manabox/*.csv, counted].
  Text exports carry none of the three (contract §2.2).
- **T-56 (the screens) is not on main.** It lives on branch `test-t56-local`
  [Confirmed: git; status.md T-56 = REVIEW]. T-55 (server side) is on main.
  The Developer builds the new row editor on top of whatever T-56 is merged as.

---

## 2. Data shape per copy

Full types in `import-row-editing.types.ts`. In short, a review row becomes a
list of copies; each copy keeps the **file's values** and the **owner's edits**
as two separate records, and the value shown is *derived*:

```
ImportRow  { rowKey, ..., qty, copies: ImportCopy[], isBasicLand }
ImportCopy { index, sourceLine, file: {finish?, condition?, language?}, owner: {type?, finish?, condition?, language?} }
```

- `qty === copies.length`, always. The list is not editable (spec rev 4); the file
  fixes the count.
- `copies` are ordered by source line ascending, then in line order. A combined
  row made from "1 × near_mint" and "2 × lightly_played" lines is therefore
  `[NM, LP, LP]`. The order is deterministic so the client and server agree on
  what "copy 2" is (§9, `buildRowCopies`).
- **Defaults** (`ImportDefaults`: finish, condition, language) live in client
  state only. Initial value nonfoil / near_mint / en. Type defaults to Original
  (D-045) and is not in the bar. Nothing about defaults is persisted.
- Copy type is `original | proxy | unsleeved`; `unsleeved` exists on deck imports
  only (D-047). Unsleeved means "not in the deck", owned or not (§6).

---

## 2A. Text import uses the same flow (owner approved 2026-10-20)

Text deck exports (`2 Abrade (BLC) 191`) go through the **same preview, row editor,
defaults bar and bulk bar as CSV**. The separate text-file Foil checkbox (D-051) is
removed; foil is chosen per copy like everything else.

- Scope: text import exists only for deck imports; collection import is CSV only
  [Confirmed: src/components/manabox-import/ManaBoxCollectionImportDialog.tsx accepts
  `.csv`; docs/oracle/contracts/manabox-import.md §1, D-049].
- A text line carries a card, set, collector number and quantity, and nothing else.
  So every copy's `file` record is empty, and finish, condition and language all come
  from the defaults bar or the owner. **No "From your file" dot can ever appear on a
  text import**, and the defaults bar does real work here (unlike on ManaBox CSVs,
  §3).
- `ManaBoxTextLine.isFoil` is dropped; the parser always set it `false`
  [Confirmed: src/lib/manabox-import.ts line 375] and `resolveTextLine` mapped it to
  finish [Confirmed: same file line 654]. Text candidates carry no finish. The
  client-only `RowChoices.foil` and `FoilCheckbox` are deleted
  [Confirmed: src/components/manabox-import/ImportCardList.tsx, types.ts].
- Lines with the same printing combine into one row (`scryfallId|nonfoil` is no longer the
  key: for text the finish part of the key is `default`, since no file finish exists;
  key = `${scryfallId}|text`). Copies keep line order, so `sourceLine` still points at the
  right line for error messages.
- Finish defaults and the Scryfall-list fallback (§5A) apply as for any default.
- Unmatched lines and skipped tokens are listed as today; nothing about them changes.
- **Decision that needs Gene to update, owner approval now given: D-051.** Its
  sentence "Rows from a text file have a Foil checkbox so foils can be marked during
  import" is replaced by "text-file rows use the same per-copy finish control as CSV
  rows". D-049's sentence "Text files carry no finish, so cards import as non-foil and
  the owner fixes foils afterwards" stays true as a fact about the file; only the
  "fixes afterwards" part is superseded, since the owner now sets finish at import.
  Architect does not edit `decisions.md`.

---

## 3. Defaults vs file vs owner: how it is tracked

**Rule: owner edit wins, then the file's value, then the defaults bar.**

Nothing is stored as "the current value". `resolveCopy(copy, defaults, availableFinishes)` computes
it every time from three inputs (plus the printing's allowed finishes, §5A), and returns the source of each field:

| Source | Meaning | Dot |
|---|---|---|
| `owner` | the owner set it on this copy (single line, apply-to-all or bulk) | none |
| `file` | the file supplied a usable value and the owner has not touched it | "From your file" dot |
| `default` | neither; the defaults bar supplies it | none (spec §4: defaults never get a dot) |

Consequences, which the spec asked about:

- **"Changing the defaults only updates untouched copies"** is automatic: a copy
  whose source is `default` is recomputed from the new defaults; `file` and
  `owner` values do not read the defaults at all. (Spec open question 3: this
  contract implements it as proposed.)
- **Editing clears the dot** because an owner edit moves the source from `file`
  to `owner`. This holds even if the owner picks the same value the file had.
  Owner values are sticky: a later defaults change never moves them.
- **Type has no file source** (D-045: the file's Proxy column is never read), so
  type is `default` (Original) or `owner`, and never gets a dot.

**What counts as "the file supplied a value"** (small discrete functions,
§9; each returns `undefined` for "not supplied"):

- *Text export*: supplies none of the three; every field comes from defaults or the owner (§2A).
- *Finish*: CSV `Foil` of `normal` / `foil` / `etched` → `nonfoil` / `foil` / `etched`.
  Anything else, or a text export → not supplied.
- *Condition*: CSV `Condition` mapped to the five stored values (also accept `dmg`).
  Blank → not supplied. **Unrecognised → not supplied** (today it silently becomes
  near_mint); count it in `ImportValueNotices.unrecognisedCondition`.
- *Language*: lower-cased, trimmed, must match `^[a-z]{2,4}$`. Blank → not
  supplied. **The parser must stop defaulting blank to `'en'`**; `'en'` is applied
  only by `resolveCopy` through the defaults.

**Parse-time vs write-time.** The parser keeps raw file values on each copy and
never applies a default. Defaults are applied only inside `resolveCopy`, which
both the review screen (to draw tags) and the write path (to build rows) call,
so what the owner saw is what is written.

**Important consequence for the owner (§13, Q1):** every line in the sample
ManaBox CSVs supplies all three values, so on a real ManaBox file every copy's
finish, condition and language is `file` and the defaults bar changes nothing.
The bar only matters for text files and blank cells.

---

## 4. Rows, D-051 and row keys

D-051: the same printing and finish in different languages are **separate rows**;
different conditions are **one row**. Per-copy language means a row can now hold
mixed languages, so the rule is applied to the **file's** values only:

- `rowKey` is computed **once**, at preview time, from file values
  (`scryfallId|fileFinish|fileLanguage` for collections, `scryfallId|fileFinish` for
  CSV decks, `scryfallId|text` for text decks (§2A), exactly today's keys, with `fileLanguage` = `en` when the file is blank
  *for key purposes only*). It is **never recomputed** after an owner edit.
- An owner editing copy 2's language to Japanese leaves copy 2 in its row. The row
  does not split, move or reorder. Selection, open/closed state and the edits map
  are all keyed by `rowKey`.
- `rowId` in `src/components/manabox-import/types.ts` must change from the
  row's *current* values to `rowKey` (+ `sourceIndex`), or editing re-keys the row
  and loses selection.
- Deck rows keep today's key (no language in it). Copies in one deck row can carry
  different file languages; that is now safe because each copy carries its own.
- This is the spec's proposed answer to its Challenge 2. It needs the owner's
  confirmation (§13, Q3) but requires **no change to D-051's wording**: the rule
  still says "as imported".

---

## 5. What proxies store (finish and condition are hidden for them)

**Proposal.**

| Field | Proxy stores | Why |
|---|---|---|
| `condition` | `NULL` | A printed copy has no wear. `NULL` is already valid and already used [Confirmed: src/lib/manabox-import.ts types; docs/oracle/contracts/allocation-suggestion-engine.types.ts `CopyCondition` allows null] and `insert_user_copies` passes it through. This also means a collection screen can count "NM originals" without excluding proxies by hand. |
| `finish` | the finish the copy would have as an Original (file → defaults), kept but not shown | Matches what the app already does when a proxy is added to a slot: the proxy copy takes the slot's requested finish [Confirmed: supabase/migrations/20261011120000_proxy_requested_printing_finish.sql, `COALESCE(requested_finish,'nonfoil')`] (D-038, D-041). A proxy of a foil card stays "a proxy of the foil". It is also lossless: switching Original → Proxy → Original restores the exact finish and condition. |
| `language` | resolved as for an Original | Shown and editable on proxies per spec; a Japanese proxy is a Japanese-printed proxy. |

Rules that follow:

1. The review screen keeps `finish` and the held condition in memory while a copy
   is a proxy (`ResolvedImportCopy.heldCondition`), so toggling back loses nothing.
2. Bulk finish/condition and apply-to-all never write finish or condition onto a
   proxy (spec: proxies keep only language). Type and language do apply.
3. Any code that counts *owned foils* or *condition* must exclude `is_proxy`
   copies. [Approximate: not audited in this task; Developer to grep for foil and
   condition counting in the collection rollup and flag any that do not filter proxies.]
4. Alternative considered: always store `nonfoil` for proxies. Simpler to explain,
   but it contradicts D-041's idea that the slot and its proxy remember the finish
   asked for, and it throws the file's information away. Not recommended.

---

## 5A. Finish is offered only if Scryfall lists it for the printing

**Owner rule:** a copy may only be given non-foil, foil or etched if Scryfall's
`finishes` list for **that printing** includes it.

**Where the list comes from.** It is not stored today (§1). Cheapest sound option:
**store it once on `ref_printings`** (new nullable column `finishes`, draft migration
`20261020120100_ref_printings_finishes.sql`, filled by the existing card-data sync),
read by the import resolver in the same query that already fetches the printing
(`PRINTING_COLUMNS` gains `finishes`), and **carried on the resolved card into the
preview** as `ImportRow.availableFinishes`. No extra request per card, nothing fetched
from Scryfall during an import. The list is per printing (`scryfall_id`), never per
`oracle_id` (D-003); all copies in a row share one printing, so they share one list.
Stored values are `nonfoil | foil | etched`; Scryfall's `glossy` is ignored.
Alternative considered: ask Scryfall at preview time (`/cards/collection`, 75 ids a call).
Needs no migration but adds a slow, rate-limited network step to every preview and a new
failure mode; not recommended unless the owner does not want a migration.
`NULL` (printing not yet synced) means *unknown*: all three allowed, no flag, no error.

**Rules** (all in one pure function module, §9):

| Situation | Behaviour |
|---|---|
| Owner picks a finish | Only listed finishes can be chosen. |
| **File supplies a finish Scryfall does not list** (e.g. Foil on a card with no foil) | **Keep the file's value and flag it.** The file is what the owner scanned, and Scryfall can be wrong or behind; silently changing it would throw away information. `finishNote = 'unlisted'`; the finish control shows the value with a quiet "not listed by Scryfall" note; one counted notice on the screen (`unlistedFinish`). It still shows the "From your file" dot. The owner can change it to a listed finish, but cannot re-pick an unlisted one once changed. |
| **Defaults bar asks for a finish the card lacks** (default Foil, card is non-foil only) | **The card's own finish is used** for that copy: nonfoil if listed, else foil, else etched (first listed in that order). `finishNote = 'fallback'`, source stays `default` (no dot), no tag unless the result differs from the bar's finish in the usual tag sense. Counted notice `defaultFinishFellBack`: "Foil default skipped on 12 cards that don't come in foil." The bar's value is never changed. A copy that falls back follows the bar again automatically if the owner changes the bar to a finish it has. |
| **Bulk "Set finish"** to a finish some selected cards lack | Applied only to copies whose printing lists it; **others are left exactly as they were** (no edit recorded, no dot change). The popover note reads "Applies to 5 of 7 copies; 2 cards don't come in foil." If it would apply to none, Apply is disabled with that note. |
| **Apply to all (copy 1)** | Always safe for finish: copies in one row share a printing. |
| Proxy | Retained hidden finish (§5) follows the same rules, so a proxy never silently holds a finish its printing lacks (unless the file supplied it: flagged as above). |
| Deck, Unsleeved slot | `requested_finish` follows the same rules. |
| Text export | Finish comes from the bar, with the same fallback. |

**Finish control (Designer-facing impact).** For each copy:
- Printing lists **one** finish → **the Finish control is hidden** (nothing to choose);
  the finish is still stored and still produces a Foil/Etched tag if it is not non-foil
  (e.g. foil-only cards: the row still shows the Foil tag, but the owner is not offered
  a Non-foil choice).
- **Two or three** → a select with only those options, order Non-foil, Foil, Etched.
- File value unlisted → that value appears as an extra option marked "not listed by
  Scryfall", selected, with the accessible name suffix "(not listed by Scryfall)".
- Unknown list (`null`) → all three, as today.
- Keyboard order: a hidden Finish is skipped (like proxies).
- Defaults bar: Finish select stays all three. Help text becomes "Applies to copies you
  haven't set yourself, where the card comes in that finish. Proxies keep only language."
- Bulk popover: the new "Applies to N of M copies" note above; the Finish select stays all three.
- Collapsed row: unchanged. No new tag; unlisted/fallback are shown only inside the
  expanded line and in the one-line notice.

**Server validation** (the routes use the service role, §10): for every Original, Proxy
or Unsleeved copy, `validateCopyFinish(finish, source, availableFinishes)`:
- listed, or list unknown → accept;
- not listed and the copy's finish source is `file` (collection: the server re-read the
  file itself) → accept and count `unlistedFinish`;
- not listed and the source is `owner` or `default`-without-fallback → **reject the
  request** (400, naming row and copy index; nothing is written). The server recomputes
  the allowed list from `ref_printings`; it never trusts a list sent by the client.
- Deck: file values come from the client body, so a client could label a finish as
  "file". The only effect is storing a finish on the user's own copy; not a
  cross-user risk. Accepted and noted.

---

## 6. D-047 (Unsleeved) and D-048 (generic basics)

- **Unsleeved is a copy type, not a split count.** A deck row's three counts
  (`originalCount/proxyCount/unsleevedCount`, `ManaBoxRowSplit`) are replaced by
  counting `copies` by resolved `type`. `normalizeDeckRowSplits`,
  `ManaBoxRowSplits`, `rowSplits`, `ManaBoxProxyCounts` and `proxyCounts` are
  superseded by `copyEdits` + `defaults` and are removed.
- **What Unsleeved means (owner correction, 2026-10-20):** the physical card is
  **not in the deck**, whether or not the owner owns it. It describes where the card
  is, not whether it is owned. (An earlier draft of this contract wrongly said
  "no physical copy yet"; that wording is withdrawn.) This agrees with D-025
  (placement is Sleeved / Unsleeved; Original / Proxy describes the copy) and D-031
  (Unsleeved imports do not assign physical copies).
- **What the import stores for an Unsleeved line (re-checked against D-047, no
  conflict):** D-047 says Unsleeved "adds the card to the list only" and that existing
  owned copies are never pulled in. So the import **neither creates nor links a
  `user_copies` row**; it writes a planned slot (`deck_cards` with `copy_id = NULL`,
  `ownership_status = NULL`, `requested_finish`) through the existing
  `is_maybeboard = true` row flag [Confirmed: src/lib/manabox-deck-import.ts]. If the
  owner already owns the card, it stays in the collection untouched and can be sleeved
  into the slot later (D-020). If they do not, it remains an unowned slot (a shortfall).
  The import cannot tell which, so it does not guess.
- **Which attributes apply to an Unsleeved line: Finish only.** Language and condition
  are facts about one physical copy, and an Unsleeved line has no copy record to
  attach them to. Finish applies because a slot remembers the finish it asks for
  (D-041) and is validated against Scryfall's list (§5A). Designer: show Finish only on
  an Unsleeved line; row tag "Unsleeved". Bulk skips language and condition for
  Unsleeved lines.
- **Does this break anything? No.** The reading that Unsleeved lines should carry
  language and condition *like an Original* would break two things, which is why it is
  not the default: (a) it would need a `user_copies` row per Unsleeved line, contradicting
  D-047 ("list only") and **duplicating** any card the owner already has in the
  collection (D-050 means a second import adds again), and it would invent ownership for
  cards the owner does not have; (b) the alternative of storing language/condition on the
  slot would need two new `deck_cards` columns, a schema change to a locked structure
  that no decision asks for. If the owner wants either, it is a new decision (§13, Q3).
- **Original and Proxy deck copies** now write finish, language and condition
  onto the new `user_copies` row (they were nonfoil / default before), and
  `requested_finish` on the slot.
- **Bulk and apply-to-all** on a mix (finish additionally skips printings that do not list it, §5A): type applies to all; language applies to
  Original and Proxy only; finish applies to Originals and Unsleeved (skipped on
  proxies, §5); condition applies to Originals only.
- **D-048 generic basics.** When the switch is on, a basic-land row creates no
  copies and no slots with attributes: it stays a planned generic slot. The row
  shows no Edit button and no tags, with the existing "generic" note. When the
  switch is off, basics are ordinary rows.
- **Collection import** has no Unsleeved (no deck). Type is `original | proxy`.

---

## 7. Mapping into `user_copies`

Every Original or Proxy copy becomes exactly one `user_copies` row, so
`user_copies` stays one row per physical card (D-001).

| Import value | Column | Original | Proxy |
|---|---|---|---|
| type | `is_proxy` | `false` | `true` |
| finish | `finish` | resolved | resolved (retained; §5) |
| condition | `condition` (RPC key `card_condition`) | resolved, never null | `NULL` |
| language | `language` | resolved | resolved |
| row's printing | `printing_id` | **`scryfall_id`** (printing) | same |
| row's card | `card_id` → `user_cards.id` (upserted by `oracle_id` + `user_id`) | same | same |
| collection only | `purchase_price`, `acquired_at` | from the source line the copy came from | same |
| source | `source_tag` | `manabox` (collection) / `deck-import` (deck) | same |

- A copy carries the `purchase_price` / `acquired_at` of **its own source line**
  (today the write already loops per candidate, so this is preserved; the new
  `buildRowCopies` must keep `sourceLine` so the write path can look them up).
- No new column. Keys in the RPC rows are unchanged for collections; deck rows
  gain `language`, `card_condition` (§8).
- Atomicity, collection: all copies go in one `insert_user_copies` call, one
  transaction; if any row fails none are written [Confirmed:
  src/lib/manabox-collection-import.ts, `assertAtomicRpcCount`]. The `user_cards`
  upsert before it is a separate statement, so a failed insert can leave
  `user_cards` identity rows with no copies. [Approximate: harmless to counts, but
  Developer should confirm the collection rollup does not show zero-copy cards.]
- Atomicity, deck: deck row, `user_cards` upsert, then one
  `replace_deck_with_new_cards` call; the RPC is one transaction. A failure after
  the deck row is created leaves an empty deck [Confirmed:
  src/lib/manabox-deck-import.ts order of steps]. Existing behaviour, not made worse;
  cleaning it up needs a delete, so it is out of scope without owner approval.
- Idempotence: unchanged (D-050): importing the same file twice adds twice.

---

## 8. Migration

**Owner approval (2026-10-20): both migrations below are approved for the Developer to
apply, in the order in §12, and the card-data refresh is approved to run afterwards.**
They are additive or `CREATE OR REPLACE`, never destructive. Both files carry a header
saying so; neither is applied yet.

**Finish availability: one additive column** (draft, not applied):
`supabase/migrations/20261020120100_ref_printings_finishes.sql` adds nullable
`ref_printings.finishes text[]` (subset of nonfoil/foil/etched, check constraint,
`NULL` = unknown). Additive, no data changed, reversible by dropping the column.
Deployed: not present (§1). The existing card-data sync must be extended to fill it;
running that sync is a separate owner step. Until filled the import behaves as before
(all finishes allowed). Order: apply column → extend sync + resolver → (later) sync.

**Collection import writes: none.** `insert_user_copies` already reads every field
needed (§1).

**Deck import: one draft migration** (not run):
`supabase/migrations/20261020120000_deck_import_per_copy_attributes.sql`.

- Changes only the function `replace_deck_with_new_cards`: reads `finish`,
  `language`, `card_condition`, `source_tag` per row, writes them to
  `user_copies`, and writes `requested_finish` on the slot for every row kind.
- Non-destructive: `CREATE OR REPLACE FUNCTION`, no drop/truncate/delete of data,
  signature and grants unchanged, safe to re-run, rows with none of the new keys
  behave as before, invalid values raise instead of being coerced.
- Reversible: restore the function body from
  `20260926120000_import_maybeboard_relation.sql`. Rows already written keep what
  they were given.
- **It supersedes the T-57 draft** (`20261013120000_deck_import_row_finish.sql`),
  which is not applied and is not in `supabase/migrations/` on main (it exists only in
  archived commit `21058b7`). It is a strict superset of it. Apply this one; do
  not apply both as separate approvals.
- **What is deployed (status.md):**
  - `20261011120000_proxy_requested_printing_finish.sql` — **applied** to the hosted
    database 2026-10-11 (T-49). So `deck_cards.requested_finish` exists.
  - `20260926120000_import_maybeboard_relation.sql` and earlier — applied (M1).
  - T-57 `20261013120000_deck_import_row_finish.sql` — **drafted, not applied,
    owner gate**.
  - `20261020120000_deck_import_per_copy_attributes.sql` — **new draft, not applied.**
- **Deploy order matters.** Unknown JSON keys are silently ignored by the old
  function, so deck code that sends `language` / `card_condition` shipped *before*
  the migration would quietly store defaults. Order: owner approves → migration
  applied → deck code merged. Developer adds a read-back test (§11) so a missing
  migration fails loudly.
- Owner note in status.md (2026-09-25) allows relaxed migration care until MVP;
  this draft does not rely on it.

---

## 9. Discrete functions (new `src/lib/import-copies.ts`)

Identifier-resolution rules stay as small, pure, separately exported, unit-tested
functions; none of the following may be inlined into a route or component.

Parsing (file → `ImportCopyFileValues`):
- `parseFileFinish(raw?: string): ImportFinish | undefined`
- `parseFileCondition(raw?: string): ImportCondition | undefined` (accepts `dmg`;
  unrecognised → `undefined`; wraps or replaces `mapCondition` for this use, leaving
  `mapCondition`'s other callers alone)
- `parseFileLanguage(raw?: string): ImportLanguage | undefined`

Finish availability:
- `mapScryfallFinishes(raw: string[] | null | undefined): ImportFinish[] | null` (drops
  `glossy`; empty or missing → `null`)
- `allowedFinishes(available): ImportFinish[]` (null → all three)
- `pickFallbackFinish(wanted, available): ImportFinish` (wanted if listed, else first of
  nonfoil, foil, etched that is listed)
- `finishControlState(available, currentFinish, source): FinishControlState`
- `validateCopyFinish(finish, source, available): 'ok' | 'unlisted_file' | 'rejected'`

Building and resolving:
- `buildRowCopies(candidates: ResolvedManaBoxCandidate[]): ImportCopy[]` (ordering
  rule in §2; the *same* function runs in preview and at write time)
- `buildRowKey(candidate, kind): string` (file values only)
- `resolveCopy(copy, defaults, availableFinishes): ResolvedImportCopy`
- `toCollectionRpcRow(...)`, `toDeckRpcRow(...)` (pure mapping per §7)

Owner actions (pure; return a new edits map):
- `setCopyField(edits, rowKey, index, field, value)`
- `applyCopyOneToAll(edits, row, defaults)` (copies copy 1's *visible* fields only)
- `applyBulk(edits, rows, selection, {type?, finish?, condition?, language?}, defaults)`
  (skips per §5, §5A and §6; returns the edits map and `{applied, skipped}` copy counts for the popover note)

Display helpers (pure):
- `summariseRowTags(row, defaults)` (differs-from-defaults, order Proxy / finish /
  condition / language, cap 3 + "+N more")
- `bulkTypeState(rows, selection)` → `'original' | 'proxy' | 'mixed'`

Existing identity-resolution functions (`resolveByScryfallId`,
`resolveBySetCollector`, set-code normalisation, token skipping) are **not
changed**; their tests must still pass untouched.

---

## 10. Multi-user safety

- `userId` comes from the signed-in session (`requireAuth`), never from the request
  body [Confirmed: src/app/api/collection/import/route.ts, src/app/api/decks/import/route.ts].
- Routes use the service-role client (`createAdminClient`), which **bypasses
  RLS** [Confirmed: src/lib/manabox-collection-import.ts, manabox-deck-import.ts].
  Safety therefore comes from the explicit checks, and the new fields must keep
  them: both RPCs verify the `user_cards` row belongs to `p_user_id`, the deck
  belongs to `p_user_id`, the storage location belongs to `p_user_id`, and write
  `p_user_id` on every row [Confirmed: migrations 20260912163000, 20260926120000;
  draft migration keeps all of it].
- The edit payload holds **no database ids**. `copyEdits` is `rowKey → index →
  fields`, so one user cannot name another user's rows. Indexes past `qty` are
  rejected, not ignored.
- Server-side validation of every field, including finish against the printing's Scryfall
  list recomputed from `ref_printings` (§5A): enum membership for finish / condition /
  type, language shape, `copies.length === quantity`, total copies per import
  capped (suggest 10 000; one line is already capped at 100). Never pass client
  strings into the RPC unvalidated: the RPC uses a service-role grant.
- **Collection:** the server re-reads the file for identity and file values, so a
  client cannot forge a printing. **Deck:** the body is built by the client today
  (`deck.cards[].scryfallId/oracleId`). That is existing behaviour and cannot reach
  another user's data, but a user can create `user_cards` with a made-up
  `oracle_id`. Recommended small hardening in this work: verify every
  `scryfallId`/`oracleId` pair against `ref_printings` before writing.
- Defaults and edits live only in browser memory until the single submit; nothing
  is stored server-side between preview and import, so there is nothing to leak
  between users. Preview still writes nothing (contract §13.4).
- RLS on `user_copies`: no policy appears in the repo migrations
  [Approximate: may exist in a baseline outside this folder]. Not part of this
  task, but flagged for the public multi-user version.

---

## 11. Tests required

Unit (Vitest), all in `src/lib/import-copies.test.ts` unless noted:
1. `parseFileFinish/Condition/Language`: each recognised value, blank, unrecognised,
   `dmg`, `d`, mixed case, padded spaces, text-export (none), language `zhs`, bad
   shape (`english`, `e`).
2. `resolveCopy`: precedence owner > file > default for each of finish, condition,
   language; type is never `file`; source tags are right in every combination;
   owner value equal to file value still reports `owner`.
3. Defaults change: copies with `default` source follow; `file` and `owner` do not
   (this is the "only untouched copies follow" rule).
4. Proxy: condition resolves to `null`; finish and `heldCondition` are retained; toggle
   Original → Proxy → Original returns the original values.
5. `buildRowCopies`: `[1 × NM, 2 × LP]` → `[NM, LP, LP]`; order is stable between two
   calls; `sourceLine` is kept; qty cap 100 per line still holds.
6. `buildRowKey`: file values only; unchanged after owner edits; collection key
   includes language, deck key does not; blank file language keys as `en`.
7. D-051: same printing and finish in `en` and `ja` → two rows; NM and LP → one row
   with two conditions; an owner language edit does not split or move a row.
8. Owner actions: `applyCopyOneToAll` copies only visible fields (copy 1 proxy →
   no finish/condition written); `applyBulk` skips finish/condition on proxies and
   language/condition on Unsleeved; "Mixed" state; every owner action clears the dot.
9. Deck: Unsleeved produces `is_maybeboard` rows with `requested_finish`, no
   `user_copies` row and no link to an existing owned copy (a card the test user already
   owns is not duplicated or touched); language/condition sent for an Unsleeved line are
   ignored; D-048 generic basics produce no copies and ignore edits.
10. Mapping: `toCollectionRpcRow` / `toDeckRpcRow` output per §7 table, proxies
    `card_condition: null`, purchase price and added date from the copy's own source line.
11. `summariseRowTags`: default row → none; differing only; cap and "+N more"; counts
    ("2 Proxy"); finish/condition tags count Originals only.
12. Validation: unknown enum rejected; `copies.length !== quantity` rejected; index
    past `qty` rejected; oversize import rejected.
12a. **Finish availability** (`validateCopyFinish`, `pickFallbackFinish`, `finishControlState`):
    - owner picks foil on a non-foil-only printing → `rejected`; on a foil-capable one → `ok`;
    - file supplies foil on a non-foil-only printing → `unlisted_file`, value kept,
      `finishNote = 'unlisted'`, dot still shown;
    - default Foil on a non-foil-only card → resolves `nonfoil`, `finishNote = 'fallback'`,
      source `default`; changing the bar to non-foil needs no edit and clears the note;
    - foil-only and etched-only printings: fallback picks the listed finish;
    - bulk Set Foil over 7 copies where 2 printings lack foil → 5 changed, 2 untouched
      (no owner edit recorded), `{applied: 5, skipped: 2}`; none applicable → nothing changes;
    - `null` list → all three allowed, no note;
    - `mapScryfallFinishes` drops `glossy`, empty → `null`;
    - `finishControlState`: one finish → `hidden`; two → select with two options; unlisted
      file value → extra option marked unlisted;
    - server route test: a request with an owner-edited foil on a non-foil-only printing
      returns 400 and writes nothing, for both collection and deck.
12b. **Text import:** a text file produces rows with copies whose `file` records are empty
    (no dot possible); finish/condition/language come from defaults and owner edits;
    same printing on two lines → one row, copies in line order; no `isFoil` anywhere;
    the Foil checkbox component no longer exists; owner foil edits are written to the copy
    and `requested_finish`.
13. Existing `manabox-import.test.ts` identity-resolution tests pass unchanged; the
    preview tests update only for the new `copies` shape.

Integration / route:
14. Collection route: file with 1 NM + 2 LP lines + owner edits (copy 2 → Foil,
    copy 3 → Proxy) writes three rows with the expected columns; `userId` from the
    session; a body `userId` is ignored.
15. Deck route (after the migration is applied, against a test database): import →
    read the rows back and assert `finish`, `language`, `condition` (and `NULL` for
    the proxy) and `deck_cards.requested_finish`. This test fails if the migration is
    missing, which is its purpose.
16. Atomicity: one invalid row in a batch writes nothing (both routes).
17. Two users importing the same file: each sees and gets only their own rows.

UI (component tests; Designer's spec is the oracle):
18. Dot shows for `file` values only, disappears on edit, never on defaults-bar
    values; accessible name ends "(from your file)".
19. Collapsed tags per spec §4; Edit/Done; apply-to-all icon only on copy 1 with 2+
    copies; no Duplicate/Remove anywhere; Unsleeved line shows Finish only; text-import rows use the same editor and show no dots.
20. Editing a copy's language keeps the row in place and keeps it selected/open.

---

## 12. Developer tasks, final order

**Branch dependency.** The import screens (T-56) are **not on main**; they are on branch
`test-t56-local` and status.md has T-56 at REVIEW awaiting the owner's merge approval and
click-through. Server work (steps 1–6) does not touch those files and can start on main
now. Screen work (steps 8–10) **must not start until T-56 is merged**, because it rewrites
files that only exist on that branch (`ImportCardList.tsx`, `types.ts`, `CopyTypeControl.tsx`,
`FoilCheckbox.tsx`, `ManaBoxDeckImportFlow.tsx`). If T-56 is still unmerged when step 7 is
done, Developer stops and reports BLOCKED to Gene; do not build the editor on a private copy.

1. **Pure core** — `src/lib/import-copies.ts` and the types (§9); write tests 1–8, 11, 12,
   12a first.
2. **Apply both migrations** (owner-approved, §8), in one push, in filename order:
   `20261020120000_deck_import_per_copy_attributes.sql`, then
   `20261020120100_ref_printings_finishes.sql`. They are independent, so either order is
   safe. Confirm each applied and that remote history matches local. Nothing that reads the
   new column or sends the new deck fields merges before this step.
3. **Card-data sync + resolver** — extend `card-data-sync.ts` to map Scryfall `finishes`
   (via `mapScryfallFinishes`); add `finishes` to `PRINTING_COLUMNS` and `ManaBoxCardFacts`.
4. **Parser fix** — stop defaulting language to `en` at parse; keep raw file values; add
   `dmg`; drop `isFoil` from the text parser and `resolveTextLine`; `combineResolvedRows`
   returns `copies[]`, `rowKey`, `availableFinishes`; preview response carries them. Update
   existing preview tests (test 13, 12b).
5. **Collection write** — rows from `resolveCopy`; delete the proxy-budget logic; accept
   `defaults` + `copyEdits` (replaces `proxyCounts`); finish validation; tests 10, 14, 16, 17.
6. **Deck write** — per-row `finish`, `language`, `card_condition`; Unsleeved as a planned
   slot with `requested_finish` and no copy; replace `rowSplits`; `ref_printings` pair check
   (§10); text decks through the same path; tests 9, 12b, 15, 16.
7. **Run the card-data refresh** (owner-approved) once steps 2–3 are merged and deployed, so
   `ref_printings.finishes` fills in. Until it runs, finishes are unrestricted (§5A).
   Confirm by sampling a few printings (a foil-only and a non-foil-only one).
   **Gate:** T-56 merged before step 8.
8. **Screen state** — replace `RowChoices` / split / `foil` with `copies`, `defaults`,
   `copyEdits`; `rowId` → `rowKey` (§4); text and CSV rows share it.
9. **Screen** — the Designer's components (defaults bar, collapsed row, tags, expanded
   lines, hidden Finish when one finish exists, "not listed by Scryfall" marker, Unsleeved
   line with Finish only, bulk bar with "Applies to N of M copies", dot); tests 18–20.
10. **Clean-up** — remove `CopyTypeControl`, `CopyCountStepper`, `FoilCheckbox` and the
    text-file Foil column header, dead types; update `manabox-import.md` §6, §8, §9, §12,
    §13.3, §15 (Architect/Gene).

Gene, after this lands: update D-051 (and the D-049 wording) in `decisions.md` per §2A.

---

## 13. Owner answers (2026-10-20) and what remains

| # | Question | Answer | Where applied |
|---|---|---|---|
| 1 | Does a foil card marked Proxy remember it was foil? | **Yes** | §5 (unchanged) |
| 2 | Does a row stay together when one copy's language changes? | **Yes** | §4 (unchanged) |
| 3 | Unsleeved: which fields? | Owner corrected the meaning: Unsleeved = **not in the deck, owned or not** | §6 rewritten; **Q3 below stays open** |
| 4 | Remove the text-file Foil checkbox, use the per-copy editor for text | **Yes** | §2A; D-051 flagged for Gene |
| 5 | Unrecognised file value: use the default and count it | **Yes** | §3 |
| 6 | Finish only where Scryfall lists it; keep and mark unlisted file values | **Keep and mark** | §5A |
| 7 | Approve both drafts and the card-data refresh | **Approved** | §8, §12 |

**Still open — Q3 (plain language):** An Unsleeved card can be one you own or not, so the
import leaves your collection alone for it: it does not add a copy and does not touch one you
already have. The line therefore offers only Finish; language and condition have nowhere to be
saved until the card is actually sleeved. If you would rather record language and condition for
Unsleeved cards now, that is a new decision with a cost (it would add copies to your collection,
or need new storage on deck slots). Default until you say otherwise: Finish only.
