# Contract: Import file formats from other deck sites (T-59)

## Status

FINAL (owner answered N-1 to N-4 and N-5, §9). Developer can build from this;
one schema gap for the companion is flagged in §9 (N-2) and needs an Architect
migration draft before slice S-7. Extends, and does not replace,
[manabox-import.md](./manabox-import.md): ManaBox stays the primary route (D-044,
D-049). This contract says how the **deck import** also reads lists exported from
other sites, and what the words that mark a section ("Commander", "Maybeboard",
"SB:") do.

**Evidence level.** Existing-parser claims are `[Confirmed: path]`. The
descriptions of other sites' export formats are written from knowledge of those
sites and are tagged `[Unverified]`: no real export files were available in the
repo or fetched. Before Developer treats any `[Unverified]` row as settled, the
owner (or Tester) should drop one real export from that site into
`docs/oracle/samples/import-formats/` (§8). The parser is deliberately tolerant,
so a wrong guess about a site degrades to "line shown as unmatched", not to a
silent wrong import.

Decisions applied: D-005 (maybeboard is a separate relation), D-018 (sideboard
and maybeboard both go to the maybeboard), D-022 (maybeboard cards in
`new_cards` mode create no owned copies), D-046 (commander picked after import; amended: a marked commander is pre-ticked, N-1),
D-049 (text files accepted, tokens skipped, unmatched lines listed), D-045
(AMENDED by N-5: the file's Proxy column sets the review-row default to Proxy; the
owner can still change it), D-019 (same amendment for CSV imports), D-051 (text
rows get a Foil checkbox; N-3 pre-ticks it from the file's marker).

---

## 1. What exists today

| Parser | What it reads | Section words | Gaps against this contract |
|---|---|---|---|
| `manabox-import.ts` `parseManaBoxCsv` | ManaBox CSV; header must contain `ManaBox ID`, `Scryfall ID`, `Set code`, `Collector number` and the required set includes `Scryfall ID` [Confirmed: src/lib/manabox-import.ts lines 128-146] | none | Rejects any other site's CSV; requires `Scryfall ID` (conflicts with the corrected column table: it must be optional, manabox-import.md §5.1 rule 2). T-58 is editing this file. |
| `manabox-import.ts` `parseManaBoxText` | `qty[x] name [(SET) num]`, set code 2-4 chars | Only `deck`, `mainboard`, `main` are skipped; `//` and `#` lines are comments [Confirmed: lines 369-400] | `Commander`, `Sideboard`, `Maybeboard`, `Companion` headings and `SB:` lines come back as **bad lines**. No section memory at all. No foil marker. |
| `text-deck-parser.ts` | Same line shape; `Commander` opens a commander block that ends at a blank line | Recognises `sideboard/maybeboard/companion/considering` and `deck/mainboard/main` [Confirmed: src/lib/text-deck-parser.ts lines 61-77] | **Bug:** those headings are recognised then thrown away, so Sideboard and Maybeboard cards import as **main-deck cards**. `SB:` prefix is stripped, so SB cards also import as main. Violates D-018. |
| `csv-deck-parser.ts` | Archidekt-style CSV: `Quantity`, `Card Name`/`Name`, `Categories`, `Label`/`Tags`, `Set Code`/`Edition Code`, `Scryfall ID` | Only a `Commander` category is read | Does not read `Maybeboard`/`Sideboard` categories (so they land in main), ignores collector number, finish and `Board`-type columns. Misses Archidekt's real export column names (below). |

Net: today every non-ManaBox list either fails or puts maybeboard cards into the
main deck. This contract replaces the three section behaviours with one shared
rule set.

---

## 2. One parsing model for every format

Every parser, text or CSV, emits the same row shape:

```
{ quantity, name, setCode?, collectorNumber?, scryfallId?, finish?, proxy?, board, sourceLine }
board = 'main' | 'commander' | 'maybeboard' | 'companion'   // see §4
proxy = true when the file's Proxy column / label says so (N-5); undefined otherwise
```

`board` is the **only** thing section words change. Oracle then applies:

- `main` → main deck list.
- `maybeboard` → the maybeboard relation (D-005, D-018). Under `new_cards` mode
  creates **no** `user_copies` (D-022); never counts towards readiness (D-005).
- `commander` → the card is a **command-zone candidate** (N-1). It is imported
  in the deck like any card, the commander picker still opens, and the
  candidates are **already ticked** in it. Nothing is set silently.
- `companion` → also a command-zone candidate (N-2), shown in the picker as
  its own "Companion" tick, separate from the commander ticks.
- `proxy` → the review row's Original/Proxy choice starts at Proxy when true
  (N-5); the owner can still change it per row.

Identity resolution is unchanged: `Scryfall ID` if present, else set + collector
number, else name-only lookup for plain lists (manabox-import.md §5; plain-text
import contract). Finish is its own attribute, never part of `scryfall_id`
(AGENTS.md identifier rules).

---

## 3. Format-by-format table

All `[Unverified]` unless a file in `docs/oracle/samples/` is cited.

### 3.1 Text formats

| Site | Typical line | Foil / extras on the line | How sections are marked | Notes |
|---|---|---|---|---|
| **ManaBox text** | `2 Abrade (BLC) 191` | none; finish absent (D-049) | none | `[Confirmed: docs/oracle/samples/manabox/Armageddon.txt]`. DFCs front name only; tokens appear and are skipped (D-049). |
| **Plain / MTGGoldfish / generic** | `1 Sol Ring`, `1x Sol Ring` | none | Headings `Commander`, `Sideboard`, `Companion`; or a **blank line then an untitled block** (classic sideboard) | `[Confirmed: docs/oracle/samples/plain-text/no-set-codes.txt]` for the plain shape. Name only → resolved by name. |
| **MTG Arena** | `4 Lightning Bolt (M10) 146` | none | Headings on their own line: `Deck`, `Sideboard`, `Commander`, `Companion`, followed by a blank line | Arena set codes can be Arena-only (`DAR`, `ANA`) and may not match Scryfall; unmatched → listed (D-049). Arena often writes collector number as the last token exactly like ManaBox. |
| **MTGO text** | `4 Lightning Bolt` | none | `SB: 1 Name` per sideboard line, or blank line + untitled block | `.dek` XML files are **out of scope** (§7). |
| **Moxfield text** | `1 Sol Ring (CMM) 400 *F*` | `*F*` foil, `*E*` etched | Blank line between blocks; headings such as `SIDEBOARD:`, and `Commander`/`Maybeboard` style headings depending on the export option | Section wording varies by export option; handle all words in §5. |
| **Archidekt text** | `1x Sol Ring (cmm) 400 *F* [Ramp,Maybeboard{noDeck}{noPrice}] ^Have,#37d67a^` | `*F*`, `*E*`; `[...]` category list; `^...^` label | **Categories in square brackets.** `Commander` category = commander; `Maybeboard`, `Sideboard` categories = maybeboard board (they carry `{noDeck}`) | Strip `{...}` flags, `[...]` and `^...^` from the name before matching. Proxy label `^Proxy^` sets the row default to Proxy (N-5). |
| **TappedOut text** | `1x Sol Ring` or `1 Sol Ring (CMM)` | `*F*` foil on some exports | Headings `Commander`, `Sideboard`, `Maybeboard`/`Considering` | Often name only. |
| **Deckbox text** | `1 Sol Ring` | none | Heading `Sideboard:`; commander sometimes only as the first line | Deckbox exports full set **names** in CSV, not codes (§3.2). |
| **Deckstats text** | `1 [CMM#400] Sol Ring # comment` or `1 Sol Ring` | trailing `# comment` | `//Commander`, `//Maybeboard`, `//Sideboard`, `//Main` comment lines **are headings**; `SB: ` prefix | Bracket form `[SET#NUM]` is a second printing syntax. A `//` line is a comment **unless its word is in §5**. |

### 3.2 CSV formats

Header matching is case-insensitive, trims spaces, and uses the alias lists
below. A CSV is accepted when it has a name column and a quantity column (a
missing quantity column means 1 each). Unknown columns are ignored.

| Meaning | Accepted header names (aliases) | Used by |
|---|---|---|
| Quantity | `Quantity`, `Qty`, `Count`, `Amount`, `Qty.`, `Number` | ManaBox, Archidekt, Moxfield, Deckbox, TappedOut, Deckstats |
| Card name | `Name`, `Card Name`, `Card`, `Card_Name`, `card_name` | all |
| Scryfall ID (optional) | `Scryfall ID`, `ScryfallID`, `scryfall_id` | ManaBox, Archidekt |
| Set code | `Set code`, `Set Code`, `Edition Code`, `Set`, `set_code`, `Printing` (when it is 2-6 chars) | ManaBox, Archidekt, TappedOut |
| Set name | `Set name`, `Edition`, `Edition Name`, `Set Name` | ManaBox, Archidekt, Moxfield, Deckbox |
| Collector number | `Collector number`, `Collector Number`, `Card Number`, `collector_number`, `Number` (only if Quantity found elsewhere) | all |
| Finish | `Foil`, `Finish`, `Is Foil`, `is_foil` | ManaBox, Archidekt, Moxfield, Deckbox, TappedOut |
| Board / section | `Board`, `Section`, `Zone`, `Categories`, `Category`, `Tags`, `Label` | TappedOut (`Board`), Archidekt (`Categories`), Moxfield (`Tags`) |
| Condition / language | `Condition`, `Language` | collection-style exports |
| Proxy | `Proxy`, `Is Proxy`, `proxy` (values `true`/`1`/`yes`/`x` = proxy; blank/`false`/`0` = not) | ManaBox, Archidekt (label), Deckbox-like |
| Ignored | `Rarity`, `ManaBox ID`, `Purchase price*`, `Misprint`, `Altered`, `Alter`, `Signed`, `Added`, `Date Added`, `Tradelist Count`, `Notes`, `Last Modified`, mana/colour/type columns, price columns | — |

Per site:

| Site | Typical header | Section column | Finish values | Set value |
|---|---|---|---|---|
| **ManaBox** | `Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,…` `[Confirmed: docs/oracle/samples/manabox/Strix draft.csv]` | none | `normal`, `foil`, `etched` (manabox-import.md §4) | code (`sos`) |
| **Archidekt** | `Quantity,Name,Finish,Condition,Date Added,Language,Scryfall ID,Edition Name,Edition Code,Collector Number,…,Categories` (user-chosen columns; the app's older parser expected `Card Name`, `Label`) | `Categories`, e.g. `Commander` or `Maybeboard` or `Sideboard` or `[Ramp,Removal]` | `Normal`, `Foil`, `Etched` | `Edition Code` |
| **Moxfield** | `Count,Name,Edition,Foil,Collector Number,…,Tags` | `Tags` only; commander/maybeboard are not columns | `foil`, `etched` or blank | `Edition` is a **code** |
| **Deckbox** | `Count,Tradelist Count,Name,Edition,Card Number,Condition,Language,Foil,…` | none in the file | `foil` or blank | `Edition` is a full set **name** → needs name→code lookup; if not found, fall back to name-only |
| **TappedOut** | `Board,Qty,Name,Printing,Foil,Alter,Signed,Condition,Language` | `Board` | `foil` or blank | `Printing` is a code |
| **Deckstats** | `amount,card_name,is_foil,is_pinned,set_id,set_code,collector_number,language,condition,comment,added` | none; sideboard lines come as separate section in text only | `1` / `0` | `set_code` |
| **MTGGoldfish / MTG Arena / MTGO** | no CSV; text only | — | — | — |

Quantity, name and printing columns are the same job in each site; only the
header word changes, which is why §3.2 is an alias table rather than per-site
code.

Row rules:

- `Quantity` empty or not a whole number ≥ 1 → row goes to the unmatched list,
  not silently 1. (The old CSV parser defaulted to 1 at
  `[Confirmed: src/lib/csv-deck-parser.ts line 107]`; that hides bad data.)
  A **missing column** still means 1.
- `Board`/`Categories`/`Tags` cell: split on `,`, strip `[` `]`, compare each
  piece to §5 (case-insensitive). Any piece naming a board wins over type
  categories like `Ramp`. If pieces disagree (e.g. `Commander` and `Maybeboard`),
  the order of precedence is `maybeboard` > `commander` > `main`, and a warning
  is shown.
- Finish: see §6.1.

---

## 4. Boards and where each goes

| `board` | Oracle destination | Copies created in `new_cards` mode (D-022) | Counts to deck readiness (D-005) |
|---|---|---|---|
| `main` | main `deck_cards` | per Original/Proxy/Unsleeved choice (D-047) | yes |
| `commander` | main `deck_cards` (as today) **plus** a pre-ticked command-zone candidate in the picker (N-1). 1 card = commander; 2 cards = commander + partner/background (N-2) | as main | as main |
| `maybeboard` | maybeboard `deck_cards` relation | none | no |
| `companion` | command zone with the commander (N-2): a candidate in the picker's Companion tick. Needs a role marker the deck model lacks today (§9 N-2 gap) | as main (it is a card the owner plays) | no: not one of the 99 |

---

## 5. Section-word table

A section word marks **every card under it until the next section word**. A
blank line does **not** end a named section (the old commander-only rule ended
it at a blank line `[Confirmed: src/lib/text-deck-parser.ts line 47]`). Matching
is case-insensitive, ignores a trailing `:`, surrounding whitespace, a leading
`//`, `#` or `*`, and a trailing card count in brackets such as `Sideboard (15)`.

| Word(s) on its own line | Sets `board` to | Seen on |
|---|---|---|
| `Commander`, `Commanders`, `Commander(s)`, `Command Zone`, `General` | `commander` | Arena, Moxfield, Archidekt, TappedOut, Deckstats, ManaBox-like pastes |
| `Deck`, `Main`, `Mainboard`, `Main Deck`, `Maindeck`, `Library` | `main` | Arena, MTGO, Goldfish, Deckstats |
| `Maybeboard`, `Maybe`, `Considering`, `Consider`, `Maybe Board`, `Wishlist` | `maybeboard` | Moxfield, Archidekt, TappedOut, Deckstats |
| `Sideboard`, `Side Board`, `Side`, `Sb` | `maybeboard` (D-018) | Arena, MTGO, Moxfield, Goldfish, Deckbox |
| `Companion`, `Companions` | `companion` → command zone (N-2) | Arena, Moxfield |
| `Tokens`, `Token` | tokens: **skip every line** (D-049) | Archidekt, Moxfield |
| `Attractions`, `Stickers`, `Contraptions`, `Acorn` | `maybeboard` with a warning "not a normal deck card" | rare |
| `Land`, `Lands`, `Creatures`, `Instants`, `Sorceries`, `Artifacts`, `Enchantments`, `Planeswalkers`, `Ramp`, `Removal`, etc. | **no change** to `board` (type/function groupings only; ignored, section stays as before) | Deckstats, EDHREC, Archidekt text |

Forms that are **not** their own line:

| Pattern | Meaning |
|---|---|
| `SB: <line>` or `SB <line>` (case-insensitive) in front of a card line | that one line is `maybeboard`; the surrounding section is unchanged |
| `CMDR: <line>`, `Commander: <line>` in front of a card line | that one line is `commander` (the existing parser treated a lone `Commander:` heading only) |
| `<line> [Commander]`, `[Commander{top}]` (Archidekt category tag) | that line is `commander` |
| `<line> [Maybeboard{noDeck}…]`, `[Sideboard…]` | that line is `maybeboard` |
| `<line> #commander`, `// commander` comment at end of line | that line is `commander` (Deckstats) |
| Line starting `//` or `#` whose text matches a word in the table above | **a section heading**, not a comment |
| Any other `//` or `#` line | comment, ignored |

Precedence on one line: line-level tag beats the current section; if both a
`SB:` and a `[Commander]` appear, `maybeboard` wins and a warning is shown.

Untitled block after a blank line (MTGO/Goldfish habit): **the board does not
change.** It stays whatever the last section word set (default `main`), and the
preview shows a note: "A blank line followed by more cards: kept in the main
deck. Add a Sideboard heading if these are maybeboard cards." Reason: Oracle is
Commander-first, a 99-card list often has blank lines between paragraphs, and a
wrong guess would silently strip a card out of the main deck. (Assumption A-1.)

Unknown single words on their own line (no digit, no card shape), for example
`Lands (36)` or `Other`: ignored as a heading with a warning; the board is
unchanged.

---

## 6. Line patterns

### 6.1 Text card line

```
[SB:] <qty>[x] <name> [(<SET>) [<collector>]] [<finish>] [<tags>]
 or   <qty>[x] [<SET>#<collector>] <name>                    # Deckstats form
```

| Part | Rule |
|---|---|
| qty | 1-100 digits, optional `x`/`X` directly after, then space. A bare name with no quantity is **one copy** only inside a section other than the unmarked top (see edge case E-3); otherwise unmatched. |
| name | Everything up to the first ` (` that starts a set code, the first ` *`, ` [` or ` ^`. DFC names keep ` // ` (`Adventurous Eater // Have a Bite`). |
| set | `(` 2-6 letters/digits `)`. **Widened from 2-4** `[Confirmed: src/lib/manabox-import.ts line 369]`: modern Scryfall codes such as `30a`, `plst`, `pmei` and promo sets run to 5-6. Case-insensitive. |
| collector | Next token after the set, kept verbatim (`191`, `191a`, `★`, `12★`, `P12`). |
| finish | `*F*` → foil, `*E*` → etched. Absent → nonfoil. (Applies to non-ManaBox text only, N-3.) |
| tags | `[..]` categories, `{..}` flags, `^..^` labels, `# comment`: parsed for board words (§5) then dropped. |

Alternate separators accepted: tab between qty and name; non-breaking space;
`1 x Sol Ring`; trailing whitespace; Windows line endings; a UTF-8 BOM at the
start of the file.

### 6.2 What a line can resolve to

1. set + collector present → set + collector lookup (manabox-import.md §5.1/§6.3).
2. set present, collector absent → cheapest or default printing in that set;
   flagged "printing guessed" so the owner sees it. (Matches the existing
   `1 Sol Ring (CMR)` allowance `[Confirmed: src/lib/manabox-import.ts line 363]`.)
3. name only → by name (plain-text import contract).
4. none match → listed on the import screen with the original line (D-049).

---

## 7. Out of scope (and what the user sees)

| Input | Result |
|---|---|
| MTGO `.dek` XML, Cockatrice `.cod`, Forge `.dck`, JSON exports | Rejected with "This file type isn't supported. Export a text or CSV list." Not guessed. |
| Site links (Moxfield URL, Archidekt URL) | Handled by the existing URL import, not this contract. Moxfield API is still O-001. |
| Collection-style CSVs sent to the deck screen | Parsed the same way; every row is `main`. |
| Files over 5 MB or 5,000 lines | Rejected before parsing (assumption A-3; tune later). |

---

## 8. Edge cases

| ID | Case | Rule |
|---|---|---|
| E-1 | Same card appears in two sections (Sol Ring in main and maybeboard) | Keep both: one main slot, one maybeboard slot. Never merge across boards. |
| E-2 | Same card twice in the same section | Add quantities **only if** the printing (set + collector + finish) is identical, else keep as separate rows. |
| E-3 | Name with no quantity (`Sol Ring`) | Unmatched with reason "no quantity", **except** a file where every card line lacks one: then each is 1. Avoids reading a heading-like word as a card. |
| E-4 | Heading looks like a card (`Island`, `Wastes`, `Commander`) | Section words are matched on the whole trimmed line and only **without** a quantity. `1 Commander` is never a heading. (No real card is named only "Deck" or "Sideboard".) |
| E-5 | Card whose name begins with a section word (`Sideboard Specialist`, `Maybe…`) | Only whole-line match counts, so safe. |
| E-6 | Commander section holds 2 cards (partner, background) | Both `commander`; both pre-ticked in the picker (N-1, N-2). Picker accepts 2 ticks only if the pair is legal (§9 N-2). |
| E-7 | Commander section holds 100+ cards | Warn "Commander section is unusually large"; treat the same. |
| E-8 | `SB:` lines inside an Arena `Deck` block | Line-level wins. |
| E-9 | Quoted CSV fields with commas, doubled quotes, embedded newlines | RFC 4180. The current `csv-deck-parser.ts` splits records on every newline before parsing quotes, which breaks a quoted newline `[Confirmed: src/lib/csv-deck-parser.ts line 84]`; the shared parser must read quotes across lines. |
| E-10 | CSV with `;` or tab delimiters (EU spreadsheets) | Detect the delimiter from the header line (`,` `;` tab); else "unsupported". |
| E-11 | Header row with a BOM or trailing spaces | Strip BOM and trim before alias matching. |
| E-12 | Text file that has a header-looking first line (`Name,Qty`) | Treated as CSV if the first line has ≥ 2 delimiters and a recognised alias; else text. |
| E-13 | Basics, Snow-Covered basics, Wastes in any section | Unchanged by this contract; D-048 still applies to main-deck rows only. Basics in the maybeboard are never converted. |
| E-14 | Tokens in any section | Skipped (D-049, D-051); counted in the preview "skipped" line. |
| E-15 | Split/DFC/Adventure written with `/` or `//` or front only | Match front name, then full name (existing behaviour, manabox-import.md §5.3). |
| E-16 | Set code differs from Scryfall's (Arena-only sets, MTGO `PRM`) | Unmatched → listed; offer name-only fallback is **not** automatic (would pick a wrong printing silently). |
| E-17 | Foil/etched marker present for a ManaBox file | ManaBox text files never carry it; if seen, it is honoured the same as other text (N-3: Foil checkbox pre-ticked). |
| E-18 | `Proxy` column or `^Proxy^` label | Sets the review row's default to Proxy (N-5); owner can change it. Text files with no Proxy marker default to Original as before. In collection CSVs too. |
| E-19 | Quantity 0 | Unmatched "quantity 0". |
| E-20 | Windows-1252/odd encodings, curly quotes/apostrophes (`’`, `“`) in names | Normalise to straight quotes before lookup; Latin-1 mojibake is left and will surface as unmatched. |
| E-21 | Commander appears only as the **first card of an untitled list** (Goldfish habit) | No inference: stays `main` (the owner picks it after import as per D-046). |
| E-22 | A line in a Commander section is a Companion or Background | Background: stays `commander` (legal second card). Companion: if a card in the Commander section has the Companion keyword and other commander(s) exist, re-tag it `companion`; the owner corrects in the picker. |

---

## 9. Decisions (owner answered 2026-10-23)

- **N-1 — AGREED: a marked commander is pre-ticked.** When a list marks the
  commander (heading, tag, column), the picker still opens after import
  (D-052) with that card already ticked. Nothing is set silently. Amends D-046.
- **N-2 — CHANGED: companion and partner/background go in the command zone
  with the commander, not the maybeboard.** How the import marks it:
  - Cards under a Commander heading (or tagged `[Commander]`, `CMDR:`) →
    `board='commander'`. One card = the commander; a second = partner or
    background.
  - Cards under a Companion heading → `board='companion'`.
  - Both kinds show as pre-ticked candidates in the picker; the owner confirms.

  What the deck model and picker support today:
  - `deck_cards.is_commander` is a plain true/false per row, so a deck can hold
    two commander rows `[Confirmed: src/types/supabase.ts deck_cards.is_commander;
    src/app/api/decks/create/route.ts lines 79-103 inserts commander + partner]`.
  - The import picker is **single-choice**: `ReviewCommanderSelect` holds one
    commander and the save writes one `commander_name`/`commander_scryfall_id`
    on `decks` `[Confirmed: src/components/manabox-import/ReviewCommanderSelect.tsx
    lines 11-16; ManaBoxDeckImportFlow.tsx lines 408-421]`. The deck page picker
    is also single `[Confirmed: CommanderPicker.tsx lines 62-77]`.
  - `decks` has no second-commander column. Tables `deck_leaderships` /
    `deck_leadership_cards` exist with roles commander, partner, background,
    but **no role for companion**, and nothing in `src/` reads them
    `[Confirmed: supabase/migrations/20260730205437_create_deck_leaderships.sql;
    no src references]`.
  - The eligibility check lists only cards that can be a commander
    (`/api/commanders/eligible`), so a companion would never appear in it.

  Gaps (build slices S-6, S-7 cover them):
  1. Picker must allow two commander ticks (and a Companion tick) on the review
     screen and the deck page.
  2. A companion needs a "role" on its `deck_cards` row; `is_commander=true`
     alone would make it count as a commander. Recommended: one nullable text
     column `command_zone_role` (`commander|partner|background|companion`) on
     `deck_cards`. Architect drafts the migration once the owner confirms
     (not drafted here; drafts only, owner approves before applying).
  3. Eligibility needs a second list: cards that have the Companion keyword
     (or Partner / Background / "Choose a Background").

  **Commander-rules concern (brief).** Under the actual Commander rules the
  companion is **not** in the command zone: it starts outside the game (the
  sideboard) and is not part of the 100. A *partner* and a *background* **are**
  in the command zone, so that part matches the rules. Keeping the companion in
  the command zone area is fine as an Oracle display choice, but then it must
  **not** count as a commander for colour identity, legality or the 100-card
  count (the role marker in gap 2 is what allows this). The pair must also be
  legal: two Partner cards, or one "Choose a Background" plus one Background;
  otherwise the picker refuses the second tick with a plain reason.
  Until S-7 ships, the safe interim is: the picker pre-ticks the commander(s)
  only; a companion is kept in the main list with a preview note.
- **N-3 — AGREED: foil/etched markers from non-ManaBox files are honoured**
  (`*F*`, `*E*`, Foil/Finish column). The review row's Foil checkbox is
  pre-ticked (D-051). ManaBox text still carries no finish (D-049).
- **N-4 — AGREED: the deck import accepts other sites' files**, text and CSV.
  Amends D-044's "ManaBox is the import route" wording for deck import.
- **N-5 — AGREED: the file's Proxy column is honoured.** It sets the review
  row's default to Proxy; the owner can still change it per row. Applies to
  deck and collection CSVs. **Overrides** the "Proxy column is ignored" wording
  of D-045 and D-019 for CSVs. A file with no Proxy value leaves the default at
  Original. In `new_cards` mode a Proxy row follows D-047 as if the owner had
  picked Proxy by hand. T-58 deliberately left the flag ignored in the preview
  `[Confirmed: docs/oracle/reports/2026-10-23-developer-t58-csv-no-scryfall-id.md]`;
  slice S-1 changes that (the parser already reads `proxy=true`).

---

## 10. Test-file list

Existing, usable now:

| File | Use |
|---|---|
| `docs/oracle/samples/manabox/Strix draft.csv` | CSV with every column, no commander/sections |
| `docs/oracle/samples/manabox/manabox-scan-2026-06-05.csv`, `…2026-10-13.csv` | Older/newer ManaBox headers |
| `docs/oracle/samples/manabox/Armageddon.txt` | Text with token line and basics |
| `docs/oracle/samples/manabox/Strixhaven.txt` | Text with DFC `//` names |
| `docs/oracle/samples/plain-text/no-set-codes.txt` | Name-only lines |
| `docs/oracle/samples/test-protocol/01-collection.csv` | Collection-shape CSV |

New files to add (real exports where possible; otherwise hand-built from the
rules above), all under `docs/oracle/samples/import-formats/`:

| File | Must contain |
|---|---|
| `archidekt-deck.csv` | Columns `Quantity,Name,Finish,Edition Code,Collector Number,Scryfall ID,Categories`; rows with `Commander`, `Maybeboard`, `Sideboard`, `[Ramp,Removal]`, a foil and an etched row |
| `archidekt-deck.txt` | `1x Name (set) num *F* [Category{noDeck}{noPrice}] ^Label^` lines |
| `moxfield-deck.txt` | Commander at top, blank lines, `SIDEBOARD:`/`Maybeboard`, `*F*` and `*E*` |
| `moxfield-deck.csv` | `Count,Name,Edition,Foil,Collector Number,Tags` |
| `mtgarena-commander.txt` | `Commander`, `Deck`, `Sideboard`, `Companion` headings, Arena-only set code |
| `mtgo-sb-prefix.txt` | `SB:` lines and an untitled block after a blank line |
| `mtggoldfish-deck.txt` | Name-only lines, blank-line sideboard |
| `tappedout-deck.csv` | `Board,Qty,Name,Printing,Foil` with `main`/`side`/`maybe`/`commander` |
| `deckbox-deck.csv` | Edition as full set **name**, `Card Number` |
| `deckstats-deck.txt` | `//Commander`, `//Maybeboard`, `SB:`, `[SET#NUM]`, trailing `# comment` |
| `deckstats-deck.csv` | `amount,card_name,is_foil,set_code,collector_number` |
| `edge-bom-crlf-semicolon.csv` | BOM, CRLF, `;` delimiter |
| `edge-quoted-newline.csv` | quoted field containing a newline and `""` |
| `edge-section-words-as-card-names.txt` | `1 Commander Info`-style names, lines that look like headings, a no-quantity line |
| `edge-conflicting-sections.txt` | Same card in main and maybeboard; `SB:` inside Commander section |
| `edge-unknown-format.dek` | MTGO XML, expect "unsupported" |

Expected unit tests (Tester/Developer): one table-driven test per row of §5 and
§3.2, one per edge-case ID, and a regression test that **Sideboard/Maybeboard
cards never reach the main list** (the fault in §1).

---

## 11. Handoff notes to Developer

- Build one shared section-and-line parser; retire the section handling in
  `text-deck-parser.ts` and `manabox-import.ts` text parsing in favour of it
  once T-58 lands. Do not edit while T-58 is open.
- Make `Scryfall ID` optional in the CSV required-column set and detection
  markers (the contract table now says so); detect other sites by §3.2 aliases.
- Types for the shared row (`board` etc.) belong next to
  `manabox-import.types.ts`; not drafted here to avoid colliding with T-58.

---

## 12. T-60 build slices (in order; each independently testable)

| Slice | What it delivers | How to test it |
|---|---|---|
| **S-1** Proxy default (N-5) | Preview rows from a CSV with `Proxy` true start as Proxy; others Original; owner's change on the row still wins; collection and deck imports. Update the T-58 test that asserts "not marked proxy" (Kodama's Reach in `01-collection.csv` becomes Proxy). | Unit: preview of `01-collection.csv` → Kodama's Reach `proxy`; toggling to Original persists to the saved import. Existing ManaBox samples unchanged. |
| **S-2** Shared section parser | One text parser: §5 section words, `SB:`, line tags, `[SET#NUM]`, 2-6 char set codes, blank-line rule A-1. Replace the section handling in `text-deck-parser.ts` and `parseManaBoxText`. Fixes Sideboard → main-deck fault. | Text fixtures in §10; regression test: Sideboard/Maybeboard cards never reach main. |
| **S-3** Shared CSV reader + alias table | RFC 4180 reader, delimiter and BOM detection, §3.2 aliases, optional Scryfall ID, Board/Categories/Tags cell rules. | CSV fixtures per site in §10; quoted-newline and `;` cases (E-9, E-10). |
| **S-4** Finish markers (N-3) | `*F*`/`*E*` and Foil/Finish column set finish; Foil checkbox pre-ticked on the review row; ManaBox text stays non-foil. | Fixture with `*F*`, `*E*`; ManaBox text sample stays nonfoil (D-049). |
| **S-5** Import entry for other sites (N-4) | Deck import screen accepts the files from S-2/S-3 (detection, wording of unmatched list, preview notes). Maybeboard rows follow D-018/D-022. | End-to-end preview of one file per site; maybeboard rows create no copies in `new_cards` mode. |
| **S-6** Commander pre-tick, one or two (N-1, N-2a) | Marked commander(s) arrive pre-ticked on the review screen; picker still opens. Picker allows two ticks with the legality check (partner pair / background pair); save writes both `is_commander` rows. | Unit: Moxfield/Archidekt/Arena commander fixtures → ticked; partner and background fixtures → two ticks; illegal pair refused. |
| **S-7** Companion in the command zone (N-2b) | **Needs owner confirmation of `command_zone_role` and an Architect migration draft first.** Companion tick in the picker; saved with role companion; not counted as a commander for colour identity, legality or the 100. | Arena fixture with Companion heading → ticked as companion; deck legality unaffected; colour identity ignores it. |
| **S-8** Samples and handoff | Drop real exports (open question in the report) into `docs/oracle/samples/import-formats/` and replace `[Unverified]` rows. | Each real file parses with zero unexpected unmatched lines. |
