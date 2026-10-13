# Contract: ManaBox Import (T-53)

## Status

FINAL — owner decisions D-044 to D-052 are incorporated. Ready for Backend
implementation.

This contract defines how Oracle turns a ManaBox collection scan or deck export
into `user_cards`, `user_copies` and `deck_cards` rows. It covers the CSV format
and the text-export format, maps every column and line part to stored data, and
states which existing import code is reused and which is replaced.

Owner decisions incorporated: **D-044 to D-049**, plus **D-050 to D-052**
(2026-10-13 revisions to D-047 and new decisions on add-only collection imports,
row combining, text-file foils and post-import commander picker).

Sample files in `docs/oracle/samples/manabox/`:

| File | Kind | Lines | Notes |
|------|------|-------|-------|
| `manabox-scan-2026-06-05.csv` | Collection scan | 26 header + data | Older export: no `Signed`, no `Proxy` column |
| `manabox-scan-2026-10-13.csv` | Collection scan | 3 header + data | Newer export: adds `Signed`, `Proxy` |
| `Strix draft.csv` | Deck export | 66 header + data | No commander information; includes basic lands |
| `Armageddon.txt` | Deck text export | 98 | Includes token line `Drake (TFDN) 8` |
| `Strixhaven.txt` | Deck text export | 88 | Includes DFC lines and basic lands |

TypeScript types: [`manabox-import.types.ts`](./manabox-import.types.ts)

---

## 1. Scope

ManaBox import has two separate entry points (D-050):

1. **Collection import** — one CSV file adds physical cards to the collection.
   It is add-only and never replaces the collection or clears deck sleeves.
2. **Deck import** — one CSV or one text file creates exactly one deck.

Both entry points share the same identity-resolution rules. Deck import uses a
per-card `Original / Proxy / Unsleeved` choice instead of a deck-level mode
(D-047 revised).

Out of scope for this contract (handled elsewhere):

- The import screen UI/UX spec (T-54, Designer).
- Commander selection after deck import (T-54; the deck is imported with no
  commander and the owner picks it in the deck view afterwards, per D-046).
- Import reconciliation for unresolved deck slots (T-22 contract, already
  deployed).

---

## 2. File format detection

### 2.1 CSV

A file is treated as ManaBox CSV when its header contains all four markers
[Confirmed: `src/lib/csv-normalizer.ts` line 41]:

- `ManaBox ID`
- `Scryfall ID`
- `Set code`
- `Collector number`

The detection is case-sensitive on the exact header strings found in the sample
files. Two header variants are supported:

| Variant | Columns present |
|---------|-----------------|
| Older export | `Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency,Added` |
| Newer export | Same as older, plus `Signed` and `Proxy` after `Altered` |

Both variants use the same column names; the only difference is the presence of
the optional `Signed` and `Proxy` columns.

### 2.2 Text export

A file is treated as a ManaBox text export when it is **not** a CSV and every
non-empty, non-comment line matches the grammar in §6.1.

Text exports carry no finish, no condition, no language and no purchase price.

---

## 3. CSV column mapping

This section maps every column of the two sample CSVs to stored data. Columns
not listed are ignored.

| ManaBox column | Required | Stored as | Notes |
|----------------|----------|-----------|-------|
| `Name` | yes | `user_cards.card_name`; `deck_cards.card_name` | Front face only for DFCs (see §5.3) |
| `Set code` | yes | `deck_cards.set_code`; lookup fallback for identity | Lower-cased before lookup |
| `Set name` | no | ignored | Display only; not stored |
| `Collector number` | yes | used in set+collector lookup | String, kept exactly as in file |
| `Foil` | yes | `user_copies.finish` | Maps to `nonfoil`/`foil`/`etched` (§4) |
| `Rarity` | no | ignored | |
| `Quantity` | yes | number of `user_copies` rows created | Capped at 100 per row [Confirmed: `src/lib/import-engine-v2.ts` line 95] |
| `ManaBox ID` | no | ignored | Internal ManaBox identifier |
| `Scryfall ID` | yes | `user_copies.printing_id`; `deck_cards.scryfall_id` | Primary printing identifier (D-003) |
| `Purchase price` | no | `user_copies.purchase_price` | Stored in USD; 0 or empty → `NULL` |
| `Misprint` | no | ignored | |
| `Altered` | no | ignored | |
| `Signed` | no | ignored | Present only in newer exports |
| `Condition` | no | `user_copies.card_condition` | Maps to `near_mint`/`lightly_played`/`moderately_played`/`heavily_played`/`damaged` |
| `Language` | no | `user_copies.language` | Lower-cased ISO code; empty → `'en'` |
| `Proxy` | no | **ignored** | Per D-045, the file's proxy flag never overrides the owner's per-row proxy count |
| `Purchase price currency` | no | ignored | All prices assumed USD |
| `Added` | no | `user_copies.acquired_at` | ISO timestamp; empty → `NULL` |

### 3.1 Collection CSV specifics

- The file is parsed into one typed row per CSV row.
- Each row expands into `Quantity` physical copies (capped at 100).
- Copies are inserted with `source_tag = 'manabox'`.
- Existing collection contents are replaced or appended depending on the chosen
  import mode (`replace` vs `add`), exactly as the current collection import
  route already does [Confirmed: `src/app/api/collection/import/route.ts`].

### 3.2 Deck CSV specifics

- Each CSV row becomes one `deck_cards` slot with `quantity = 1`.
- If the row's quantity is greater than 1, it expands into that many slots, each
  with `quantity = 1`. This matches the existing deck import pattern
  [Confirmed: `src/lib/deck-import.ts` line 524].
- `is_commander` is always `false` at import time; the commander is chosen after
  import (D-046).
- `categories` defaults to the card's derived type category when the file gives
  none (see §7.3).

---

## 4. Finish mapping

ManaBox stores finish as `normal`, `foil` or `etched`. Oracle stores
`nonfoil`, `foil` or `etched` on `user_copies.finish` (D-004).

| ManaBox `Foil` value | `user_copies.finish` |
|----------------------|----------------------|
| `normal` (or empty) | `nonfoil` |
| `foil` | `foil` |
| `etched` | `etched` |

For text exports the finish is always `nonfoil`; the owner fixes foils
afterwards (D-049).

---

## 5. Identity resolution

Resolution turns a parsed row into an `oracle_id` and a `scryfall_id`
(printing). The rules below apply to both CSV and text exports.

### 5.1 Strategy

1. **CSV with `Scryfall ID`:** use the file's `Scryfall ID` as the printing.
   Look up `oracle_id` from `ref_printings.oracle_id` by `scryfall_id`
   [Confirmed: `src/lib/identity-resolver.ts` line 196].
2. **Text export or CSV missing `Scryfall ID`:** look up the printing from
   `Set code` + `Collector number` via `ref_printings`
   (`set_code`, `collector_number`) [Confirmed: `src/lib/import-engine-v2.ts`
   line 488].
3. **Fallback:** if neither strategy yields an identity, report the line as
   unmatched (§8).

The file's `Name` is **not** used as a fallback for resolution. It is used only
for display and for `card_name` storage after a successful identity lookup.

### 5.2 Printing identifier rules

- `scryfall_id` identifies a specific printing; `oracle_id` identifies the
  canonical card across printings (D-003).
- `user_copies.printing_id` stores the `scryfall_id`.
- `deck_cards.scryfall_id` stores the `scryfall_id` the deck asks for.
- `user_cards.oracle_id` stores the `oracle_id`.

### 5.3 Double-faced cards

ManaBox CSV stores DFC names with both faces (for example
`"Landscape Painter // Vibrant Idea"`). Text exports use the **front face only**
(for example `Adventurous Eater`).

Resolution must match against `ref_printings.name`. For CSV rows the parser
preserves the full name; for text exports the parser uses the front face before
the ` // ` separator. The stored `card_name` is the full two-face name when it
is available (CSV), otherwise the front face name (text).

### 5.4 Set code normalisation

ManaBox set codes are mixed case (for example `sos`, `SOA`, `TDM`). Before any
database lookup, normalise to lower case to match `ref_printings.set_code`
[Confirmed: `src/lib/import-engine-v2.ts` line 630].

---

## 6. Text export format

### 6.1 Grammar

Each line is:

```
<quantity> <card name> (<set code>) <collector number>
```

Examples from the sample files:

```
2 Abrade (BLC) 191
1 Adventurous Eater // Have a Bite (SOS) 72
1 Drake (TFDN) 8
3 Titan's Grave (SOS) 266
```

Rules:

- `<quantity>` is a positive integer, 1–100.
- `<card name>` is the front-face name; for DFCs it may include ` // ` and the
  back-face name.
- `<set code>` is 2–4 letters, upper or lower case.
- `<collector number>` is the set-specific collector number.
- Blank lines are ignored.
- Lines starting with `//` or `#` are comments and ignored.

### 6.2 Parsing

The existing `text-deck-parser.ts` must be extended:

- Keep the full collector number (the current parser drops it at line 99
  [Confirmed: `src/lib/text-deck-parser.ts` line 99]).
- Keep the set code as provided.
- Preserve DFC names including ` // `.
- Return each line as a `NormalizedCard`-like object with `scryfallId = ''`,
  `setCode` populated, and a new `collectorNumber` field so the import pipeline
  can resolve the printing via set+collector lookup.

### 6.3 Identity resolution for text

Because text exports have no `Scryfall ID`, resolve each line by
`set_code` + `collector_number` against `ref_printings` (§5.1 strategy 2).

---

## 7. Deck import behaviour

### 7.1 One deck per file

A ManaBox deck CSV or text file creates exactly one Oracle deck. The deck name
comes from the file name (without extension) unless the owner edits it on the
import screen.

### 7.2 Deck format

The owner chooses the deck's `format` on import (D-046). Supported values are
the same as the existing `decks.format` column, defaulting to `commander`.
ManaBox files carry no format information.

### 7.3 Categories

ManaBox deck files have no category information. Each `deck_cards` row gets a
category derived from the resolved card's type line, using the same derivation
as the existing deck importer [Confirmed: `src/lib/deck-import.ts` line 56]:

`Creature` → `Planeswalker` → `Battle` → `Instant` → `Sorcery` → `Artifact` →
`Enchantment` → `Land` → `Other`.

### 7.4 Commander

ManaBox deck files do not mark the commander. All cards import as
`is_commander = false`. After the import succeeds, the deck view opens with the
commander picker already showing (D-052).

---

## 8. Per-row Original / Proxy / Unsleeved split (deck import)

Each deck-import row has three splittable counts that sum to `qty`
(D-047 revised):

- **Original** — new owned copies, sleeved into the deck as `original`.
- **Proxy** — new proxy copies, sleeved into the deck as `proxy`.
- **Unsleeved** — list only: a `deck_cards` row with `copy_id = NULL` and
  `ownership_status = NULL`, so the card can be sleeved later from copies already
  owned (D-020, D-031).

Default: all copies are **Original**.

For rows with quantity > 1, the owner can split the count across the three
states. For example, a row with `qty = 2` could be 1 Original, 1 Proxy, 0
Unsleeved.

The ManaBox file's own `Proxy` column is **always ignored** and never overrides
this choice (D-045).

---

## 9. Collection import Original / Proxy count

Collection import offers an **Original / Proxy** choice for every row, defaulting
to **Original** (all copies original) (D-045). For rows with quantity > 1, the
owner can pick a proxy count from 0 to `qty`.

- `proxyCounts[rowIndex]` copies of each row are inserted with
  `user_copies.is_proxy = true`; the remaining copies are `is_proxy = false`.
- The file's own `Proxy` column is ignored.

Collection import is **add-only**: it appends new copies to the collection and
never replaces existing copies or clears deck sleeves (D-050).

---

## 10. Basics-to-generic switch

Deck import offers a switch **Convert basic lands to generic** (default on)
(D-048).

### 10.1 Covered basic land names

The switch applies to the same names as `isBasicLand()`
[Confirmed: `src/lib/basic-lands.ts` line 12]:

- `Plains`, `Island`, `Swamp`, `Mountain`, `Forest`
- `Wastes`
- `Snow-Covered Plains`, `Snow-Covered Island`, `Snow-Covered Swamp`,
  `Snow-Covered Mountain`, `Snow-Covered Forest`

### 10.2 When the switch is on

- Each basic land slot is imported as a generic basic land:
  - `deck_cards.copy_id = NULL`
  - `deck_cards.ownership_status = NULL`
  - `deck_cards.scryfall_id` is set to the file's printing (or the default basic
    land printing if none is resolved) for display purposes.
- No `user_copies` row is created for generic basics, even for rows marked
  Original or Proxy.
- The slot counts toward deck size and is treated as Sleeved for readiness under
  D-032.

### 10.3 When the switch is off

- Basic lands are imported as normal tracked cards.
- Rows marked Original create an `original` `user_copies` row and sleeve it.
- Rows marked Proxy create a `proxy` `user_copies` row and sleeve it.
- Rows marked Unsleeved create a Planned `deck_cards` slot with no copy.

### 10.4 Collection import

The basics-to-generic switch does **not** apply to collection import. A
collection scan always creates real `user_copies` rows for basic lands.

---

## 11. Token skipping and unmatched lines

### 11.1 Token skipping

Tokens are detected from the **resolved Scryfall card data only**. The sample
file `Armageddon.txt` contains `Drake (TFDN) 8`, which must be skipped
(D-049). Because `TDM` is a real card set (Tarkir: Dragonstorm), there is **no
set-code allow-list**.

A CSV row or text line is treated as a token and skipped when the resolved card
meets any of:

- `layout` is `token` or `double_faced_token`, or
- `type_line` contains the word `Token`.

This applies to both collection imports and deck imports, CSV and text
(D-051). Skipped lines do not appear in the unmatched list.

### 11.2 Unmatched lines

A line or row is unmatched when identity resolution fails (§5.1 strategy 3) or
when the quantity is invalid. The import screen shows these lines to the owner
rather than dropping them silently (D-049).

For each unmatched line the UI displays:

- The original line text (text export) or row number and `Name` (CSV).
- The reason:
  - `no_card` → "no such card" (resolution failed),
  - `bad_line` → "unreadable line" (text grammar could not be parsed),
  - `unknown_id` → "unknown card ID" (CSV `Scryfall ID` is malformed or not found).

Unmatched lines do **not** block importing the rest of the file.

---

## 12. Data stored for a successful import

### 12.1 Collection import

For each resolved CSV row with quantity `Q` and proxy count `P` (default 0):

- One `user_cards` row (upserted by `oracle_id`, `user_id`).
- `Q` `user_copies` rows:
  - `P` of them have `is_proxy = true`
  - `Q - P` of them have `is_proxy = false`
  - All copies share:
    - `card_id` → the `user_cards` row
    - `printing_id` → the resolved `scryfall_id`
    - `finish` → mapped finish (§4)
    - `card_condition` → mapped condition (each copy keeps its own condition;
      rows with the same printing and finish but different conditions are
      combined in the preview but stored as individual copies)
    - `language` → lower-cased language code
    - `purchase_price` → price or `NULL`
    - `acquired_at` → `Added` timestamp or `NULL`
    - `source_tag` → `'manabox'`
    - `location_id` → `NULL` (the RPC resolves the default storage location)

Collection import is add-only: existing collection copies and deck sleeves are
never changed (D-050).

### 12.2 Deck import

For each combined row with quantity `Q`, original count `O`, proxy count `P` and
unsleeved count `U`, where `O + P + U = Q` (D-047 revised):

- One `user_cards` row (upserted by `oracle_id`, `user_id`).
- `O` new `user_copies` rows with `is_proxy = false`.
- `P` new `user_copies` rows with `is_proxy = true`.
- `O + P` `deck_cards` rows, each linked to one of the new copies, with:
  - `ownership_status` → `original` or `proxy`
  - `placement_source = 'import'`
- `U` `deck_cards` rows with `copy_id = NULL` and `ownership_status = NULL`
  (Unsleeved).

All `deck_cards` rows share:

- `deck_id` → the new deck
- `card_name` → resolved card name
- `scryfall_id` → resolved printing
- `set_code` → normalised set code
- `quantity = 1`
- `categories` → derived category (§7.3)
- `is_commander = false`

Basic lands converted to generic skip the `user_copies` row and the `copy_id`
link entirely; they create generic basic slots with `copy_id = NULL`
(§10). Existing owned copies are never used (D-047).

---

## 13. Preview before commit

The import screen needs a non-writing preview (T-54 §7). The preview parses the
file, resolves identities, detects tokens and unmatched lines, and returns rows
combined by printing + finish (and condition + language for collections).

### 13.1 Preview request

| Method | Route | Body |
|--------|-------|------|
| `POST` | `/api/collection/import/preview` | `{ csvContent: string }` or multipart `file` |
| `POST` | `/api/decks/import/preview` | `{ csvContent?: string, textContent?: string }` or multipart `file` |

The preview accepts the same file inputs as the commit routes.

### 13.2 Preview response

```ts
interface ManaBoxPreviewResponse {
  fileName: string
  totalLines: number
  rows: ManaBoxPreviewRow[]
  skippedTokens: ManaBoxSkippedToken[]
  unmatched: ManaBoxUnmatchedLine[]
}

interface ManaBoxPreviewRow {
  /** 1-based index of the first source line/row contributing to this combined row. */
  sourceIndex: number
  /** All source line/row indices that were combined into this row. */
  sourceLines: number[]
  cardName: string
  setCode: string
  collectorNumber: string
  scryfallId: string
  oracleId: string
  qty: number
  finish: 'nonfoil' | 'foil' | 'etched'
  /** Collection only. */
  condition?: string
  /** Collection only. */
  language?: string
  /** True when this row is a basic land eligible for the generic switch. */
  isBasicLand: boolean
}

interface ManaBoxSkippedToken {
  sourceIndex: number
  rawLine: string
  cardName?: string
}
```

### 13.3 Row combining rules

- **Deck preview:** rows are combined by `(scryfallId, finish)`. `qty` is the
  total number of copies. Text files default to `finish = 'nonfoil'`, but the
  UI shows a per-row **Foil** checkbox so the owner can mark foils before
  import (D-051).
- **Collection preview:** rows are combined by `(scryfallId, finish, language)`.
  Different languages show as separate rows. Different conditions are combined
  into one row; each underlying copy still keeps its own condition when stored
  (D-051).
- Identical CSV rows are silently combined; there is no notice.

### 13.4 Preview does not write

No `user_cards`, `user_copies` or `deck_cards` rows are created. The preview is
safe to call repeatedly while the owner reviews choices.

---

## 14. Reuse and replacement of existing code

| Existing file | Reused? | How |
|---------------|---------|-----|
| `src/lib/csv-import.ts` | **Partially replaced** | Its parsing and delta logic is specific to the Archidekt collection CSV format. The new ManaBox collection import reuses `executeInstanceLevelImport` (`import-engine-v2.ts`) instead. The route `src/app/api/collection/import/route.ts` is reused and extended with a ManaBox path. |
| `src/lib/import-engine-v2.ts` | **Reused and extended** | Already contains a `manabox` row extractor (lines 287–329) and identity resolution. It needs: (1) a per-row proxy count from the UI instead of reading the file's `Misprint`/`Proxy` column, and (2) wiring to the deck import flow for deck CSVs. |
| `src/lib/csv-normalizer.ts` | **Reused** | Already detects ManaBox CSV and normalises it. The normalised output is not required if the import engine reads ManaBox columns directly, but the detection logic stays. |
| `src/lib/csv-deck-parser.ts` | **Replaced for ManaBox** | This parser is hard-coded to the Archidekt deck CSV shape. A new ManaBox deck CSV parser is needed. |
| `src/lib/text-deck-parser.ts` | **Extended** | The grammar is close, but it currently drops the collector number. It must be extended to capture set code + collector number and pass them to identity resolution. |
| `src/lib/deck-import.ts` | **Partially reused** | The ManaBox deck import no longer uses the deck-level `new_cards` / `theorycrafted` modes. It reuses the deck upsert and version-snapshot helpers, but the copy/slot creation logic is new to support the per-row Original/Proxy/Unsleeved split (D-047 revised). |
| `src/lib/deck-normalizer.ts` | **Reused** | The `NormalizedCard` / `NormalizedDeck` types are the bridge from any parser to `deck-import.ts`. |
| `src/lib/identity-resolver.ts` | **Reused** | `resolveOracleIdFromPrinting` and `mapFinishToFinishString` are used by the import engine. |
| `src/lib/basic-lands.ts` | **Reused** | `isBasicLand()` defines the exact basic land names for the generic switch. |
| `src/app/api/collection/import/route.ts` | **Extended** | Add handling for ManaBox collection CSV. The existing `mode=replace/add/sync` entry points remain. |
| `src/app/api/decks/import/route.ts` | **Extended** | Add handling for ManaBox deck CSV and text exports. The existing mode-based dispatch stays. |

---

## 15. API surface

### 15.1 Collection import

Route: `POST /api/collection/import`

For ManaBox collection imports the route is **add-only** (D-050). It appends new
copies to the collection; it never replaces or deletes existing copies and it
never affects deck sleeves.

Request body:

```ts
interface ManaBoxCollectionImportBody {
  /** Raw CSV content, or supplied via multipart `file`. */
  csvContent?: string
  /**
   * Per-row proxy count. Key is the 1-based CSV row index.
   * Value is the number of copies (0…qty) that should be proxies.
   * Omitted rows default to 0 proxies (all Original).
   */
  proxyCounts?: Record<number, number>
}
```

Response: `ManaBoxCollectionImportSummary` (see types file).

Behaviour:

- Accept ManaBox CSV in addition to Archidekt CSV.
- Each row expands into `Quantity` physical copies.
- `proxyCounts[rowIndex]` of those copies are inserted with `is_proxy = true`;
  the rest are `is_proxy = false`.
- The file's own `Proxy` column is ignored.
- Existing collection contents are left untouched.
- Tokens are skipped (D-051).

### 15.2 Deck import

Route: `POST /api/decks/import`

Request body:

```ts
interface ManaBoxDeckImportBody {
  deck: NormalizedDeck
  name: string
  format?: string
  /** Convert basic lands to generic, untracked slots. Default true (D-048). */
  convertBasicLandsToGeneric?: boolean
  /**
   * Per-row Original / Proxy / Unsleeved split. Key is the 1-based source
   * row/line index of the combined row. For each row:
   *   - originalCount + proxyCount + unsleevedCount = qty
   *   - omitted rows default to { originalCount: qty, proxyCount: 0, unsleevedCount: 0 }
   */
  rowSplits?: Record<number, {
    originalCount: number
    proxyCount: number
    unsleevedCount: number
  }>
}
```

Behaviour:

- For each row, `originalCount` and `proxyCount` create new copies and sleeve
  them into the deck.
- `unsleevedCount` creates Planned `deck_cards` rows with `copy_id = NULL`.
- Existing owned copies are **never** pulled in (D-047 revised).
- After the import succeeds, the UI opens the new deck with the commander picker
  already showing (D-052).

### 15.3 Set commander on an existing deck

Route: `PATCH /api/decks/[id]`

Today this route only accepts `build_id` [Confirmed:
`src/app/api/decks/[id]/route.ts` line 287]. It is extended to accept commander
fields:

```ts
interface PatchDeckBody {
  build_id?: string | null
  commander_id?: string | null
  commander_name?: string | null
  commander_scryfall_id?: string | null
}
```

Validation:

- At most one of `commander_id`, `commander_name` or `commander_scryfall_id` is
  required; if `commander_id` is provided it is authoritative.
- If `commander_name` is provided, the server looks it up in `ref_cards` and
  verifies `can_be_commander = true`.
- If the deck's `format` does not have a commander, the request returns 400.
- Setting `commander_id` to `null` clears the commander.

Atomicity: the update is a single `UPDATE decks` statement scoped to the
authenticated user. No deck cards are added or removed.

This operation is used both for the immediate post-import commander picker
(D-052) and for later commander changes from the deck page.

---

## 16. Migrations

No schema migration is required for this contract. The existing tables already
support every field listed:

- `user_copies.is_proxy`, `finish`, `card_condition`, `language`,
  `purchase_price`, `acquired_at`, `source_tag`, `location_id`
  [Confirmed: `src/types/supabase.ts`].
- `deck_cards.scryfall_id`, `set_code`, `quantity`, `categories`,
  `is_commander`, `copy_id`, `ownership_status`, `placement_source`
  [Confirmed: `src/types/supabase.ts`].
- `decks.format`, `commander_id`, `commander_name`, `commander_scryfall_id`
  already exist.

Code-only changes:

- The ManaBox row extractor in `import-engine-v2.ts` must stop reading the
  `Misprint`/`Proxy` column and accept per-row split counts from the UI.
- `text-deck-parser.ts` must keep the collector number and support a per-row
  foil flag.
- `PATCH /api/decks/[id]` must accept commander fields in addition to `build_id`.

---

## 17. Correctness properties

1. **Identifier safety:** `scryfall_id` is used for printings and `oracle_id` for
   canonical card identity (D-003).
2. **Finish independence:** finish is read from the `Foil` column and stored
   separately from the printing (D-004).
3. **Proxy override:** the file's proxy flag is never used; the owner's per-row
   split is authoritative (D-045).
4. **Unsleeved deck slots are Planned:** cards imported as Unsleeved have
   `copy_id = NULL` and can be sleeved later from owned copies (D-020, D-031).
5. **Generic basics do not create fictional copies:** when the switch is on,
   basic land slots have `copy_id IS NULL` and count as Sleeved under D-032.
6. **Tokens are skipped by card data only:** token lines never become deck cards
   or collection copies; real-card sets are never mistaken for token sets.
7. **Tokens are skipped in collection imports too** (D-051).
8. **Unmatched lines are surfaced:** the owner sees every line that could not be
   resolved.
9. **One deck per file:** a ManaBox deck file never creates multiple decks.
10. **Collection import is add-only:** existing collection copies and deck sleeves
    are never removed by a ManaBox collection scan (D-050).
11. **Original and Proxy create new copies:** existing owned copies are never
    pulled into deck slots (D-047 revised).
12. **Commander picker opens immediately:** after a deck import the new deck opens
    with the commander picker showing (D-052).

---

## 18. Open questions

None. All owner questions raised in T-54 have been decided (D-050 to D-052).
