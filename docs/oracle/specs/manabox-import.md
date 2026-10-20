# Spec: ManaBox import — collection and deck (T-54)

Role: Designer · Phase 5 (Getting cards in) · Status: **Draft for owner review — revision 6** · 2026-10-20
Mockup: `docs/oracle/mockups/manabox-import.html` (open in a browser; the dashed bar at the top switches file, step and error states, adds illustrative lines, and has a greyscale check). The **Foil** tick box only appears for text files: pick **Deck text file · Strixhaven ✦ Foil tick box** in that bar.
Inputs: D-044–D-053 (this feature; D-047 revised and D-050–D-052 added on main in 151967d; D-053 colours in db273de), D-002, D-005, D-012–D-015, D-019–D-021, D-025, D-031, D-032, D-039, D-043 (locked vocabulary, `docs/oracle/specs/vocabulary.md`); the owner's sample files in `docs/oracle/samples/manabox/`; `docs/oracle/reports/2026-10-13-gene-manabox-import-request.md` (incl. the 18:47 follow-up).
Pairs with: T-53 (Architect contract, in parallel). Every field this spec needs from T-53 is listed in §7.

**Revision 6 (2026-10-20, owner-approved "option 1"):** the floating count picker overlapped neighbouring rows' controls in the 30 px list. It is replaced by an **in-place count stepper**: on a 2+ copy row, Proxy or Unsleeved turns that row's own control into "Proxy − 1 +" with "· Original 1" beside it. Nothing floats; no other row is covered. Component `CopyCountPicker` → `CopyCountStepper`; §5.3, §6.2, §6.3, copy and accessibility updated. D-047 ("split by count") is unchanged; D-052 concerns the commander picker only.

**Revision 5 (2026-10-13, owner: "Lets use the app green. Its the state we want a card in"):** a selected **Original** uses the app green `--accent-primary` #1D9E75 instead of mint. No new colour token. D-053 needs amending (G6).

**Revision 4 (2026-10-13, D-053 "Proxy blue and original a mint"):**
- A selected **Original** is now **mint**: a proposed new token `--status-original` #8FE6C1, used for the tint, border and icon.
- **Proxy** keeps `--status-proxy` #4A93A0, now called **blue** (not teal).
- The colours apply to row segments, to the bulk-bar icons, and to the count picker (now the stepper, rev 6), which now also shows how many stay Original.
- The mockup's text-file example is labelled so the Foil tick box is easy to find.

**Revision 3 (2026-10-13, owner answers):**
- The deck-level **Add to collection / List only** choice is gone. Every deck row now has **Original · Proxy · Unsleeved** (default Original, D-047 revised). On a row with 2+ copies, Proxy or Unsleeved opens the count picker to split the copies.
- The bulk bar offers all three choices.
- Collection import adds cards only (D-050).
- Languages are split into separate rows and conditions are combined; tokens are skipped in collection imports too; text-file rows have a **Foil** tick box (D-051). The "Text file: all nonfoil" notice is removed.
- After a Commander-format deck import, the deck opens with the commander picker already open, with no "Later" step (D-052).
- Deck import shows a spinner only (G5). The collection importer keeps accepting today's other CSV layouts (G4).

**Revision 2:** text was cut down and rows were made denser (30 px). The "Some" option was replaced by the count picker (a stepper since rev 6).

---

## 1. The problem

Brad scans physical cards with ManaBox and wants them in Oracle without retyping. Today the collection import **replaces the whole collection** and clears every deck's sleeves [Confirmed: src/components/collection/CollectionImportButton.tsx; src/lib/chunked-import-client.ts sends `mode=replace` for the first chunk]. The deck import's file tab only takes a CSV, drops lines it doesn't understand without saying so, and expects a commander that ManaBox files never name (D-046).

Brad needs three things:
- Bring in a ManaBox file.
- Say, for each card, whether it's a real card, a proxy, or not in the deck box yet.
- See what will and won't import, then choose the commander.

## 2. Principles

- **Preview before commit (Nielsen #5):** the file is checked and listed *before* anything is written.
- **Minimalist design (Nielsen #8):** every visible word helps a decision. The footer counts are the only summary, and explanations live in tooltips.
- **Sensible defaults:** the common case needs no changes. Every card starts Original, Generic basics is on, and the format is Commander.
- **Progressive disclosure:** the count stepper appears only when you split a row with 2 or more copies. Token lines appear only after **Show**.
- **Visibility of system status, honestly (Nielsen #1, D-030):** skipped tokens and unmatched lines are always named.
- **Object–action mapping (D-015):** the choice sits on each row. Bulk actions appear in the list header only while rows are selected.
- **Colour marks the choice (D-014, D-053):** a selected Original is the app green (the state we want a card in), a selected Proxy is blue with the mask icon, and Unsleeved is a grey outline with no fill (vocabulary §3). The unmatched line is the only amber element.
- **Consistency (D-043):** state words come from the locked vocabulary: Original, Proxy, Sleeved, Unsleeved, Basic, Draft, Foil.

## 3. Flow

| # | Step | Deck | Collection |
|---|---|---|---|
| 1 | Choose file | **File** tab of the Import deck dialog (URL · Paste · **File** · Precon). `.csv` or `.txt`. | Collection page **Import** → dialog. `.csv` (ManaBox and today's other layouts, G4). |
| 2a | Checking | Lines are matched to cards. Options stay editable. Row skeletons. **Import** disabled. | Same, with no options. |
| 2b | Review | Options line (Name · Format · Generic basics) → count line → notices → card list → footer. **Import** | Notices → card list → footer. **Add N** |
| 3 | Importing | Spinner in the dialog. No cancel (all-or-nothing; G5). | Progress bar + **Cancel** (existing behaviour). |
| 3e | Failed | "Import failed — nothing changed" · **Back** · **Try again** (choices kept). | Same. |
| 4 | Done | **Commander format:** no done dialog; go to step 5. **Other formats:** outcome list · **Open deck**. | Outcome list · **View collection**. |
| 5 | Deck page + commander picker | The new deck opens with the **commander picker already open** (D-052) and a one-line import result under the header. | — |

**Why the commander is chosen on the deck page (D-046, D-052):** the file doesn't name the commander. Choosing on the deck page puts it next to the "Draft · 99/100" state it changes. The picker opens immediately, so it is the next thing you do. Escape or clicking away closes it, and **Choose commander** stays in the header for later.

## 4. Component inventory

Primitives come from `src/components/ui/` [Confirmed: dialog, tabs, radio-group, switch, checkbox, input, button, popover, command, dropdown-menu, skeleton, tooltip, sonner]. Badges use T-26 `SlotBadge` / `FinishTag` (vocabulary spec §6).

| Component | Props (minimum) | shadcn base | Notes |
|---|---|---|---|
| `ManaBoxFilePicker` | `accept`, `onFile`, `error?` | `Button`, native file input | Dashed drop zone (an empty drop zone is allowed to be dashed, D-015) with a real **Choose file** button. Replaces the deck "CSV" tab content [Confirmed: src/components/DeckImportButton.tsx]. |
| `ImportFileChip` | `fileName`, `cardCount`, `checking`, `onChange` | — | Sits in the title row: "Strix draft.csv · 65 cards · Change". |
| `DeckImportOptions` | `name`, `format`, `genericBasics`, `basicsQty`, `cardCount` | `Input`, `Select`, `Switch`, `Tooltip` | One row. The count line under it reads "65/100 · commander picked next". Format options = `FORMAT_OPTIONS` [Confirmed: src/lib/format-config.ts]. The switch is hidden when the file has no basic lands. |
| `ImportNoticeLine` | `tone: 'warning'\|'info'`, `icon`, `text`, `action?`, `details?` | — | One line each. Not matched (warning, **Copy**); Tokens skipped (info, **Show/Hide**). Several unmatched lines: "3 not matched" + **Show** + **Copy**. |
| `ImportCardList` | `rows`, `kind: 'deck'\|'collection'`, `source: 'csv'\|'txt'`, `selection`, `filter`, `query` | `Checkbox`, `Input` | 30 px rows. The header becomes the bulk bar when ≥1 row is selected. Filters: All · Proxies · Unsleeved (deck) · Basics (deck, when there are basics). Text files add a **Foil** column. Virtualise above ~200 rows. |
| `CopyTypeControl` | `qty`, `counts: {original, proxy, unsleeved}`, `onChange`, `cardName`, `options` | `RadioGroup` (1 copy) / `ToggleGroup` (2+ copies) | Deck: **Original · Proxy · Unsleeved**. Collection: **Original · Proxy**. When a row is split, each chosen segment shows its count, e.g. "Original 1 · Proxy 1". A generic basic shows the **Basic** badge instead. |
| `CopyCountStepper` | `qty`, `type: 'proxy'\|'unsleeved'`, `value`, `base`, `onChange(n)`, `onClose` | Native buttons + `role="spinbutton"` (no Popover) | Replaces the row's segments while editing: "Proxy [−] 1 [+] · ✓ Original 1" / "Unsleeved [−] 1 [+] · ✓ Original 1". Range 1…qty; − disabled at 1, + disabled at qty. The Original remainder (green check) updates live. Same row height (24 px), rendered in the row, never floating. Works at any qty. |
| `FoilCheckbox` | `checked`, `cardName` | `Checkbox` | Text-file rows only (D-051). Applies to every copy on the row. |
| `ImportSummary` | `totals`, `kind` | — | Footer counts, `aria-live="polite"`. |
| `ImportProgress` | `processed`, `total`, `cancellable` | progress bar, `Button` | Collection only. Reuse the existing collection progress [Confirmed: CollectionImportButton.tsx]. |
| `ImportResult` | `outcomes[]`, `nextAction` | `Dialog` | Step 4 (collection; decks not in Commander format). |
| `ImportResultLine` | `outcomes`, `unmatched[]`, `onDismiss` | — | Step 5: one line under the deck header, dismissible. |
| `ChooseCommanderButton` | `deckId`, `format`, `hasCommander`, `openOnMount` | `Button` | In the deck header, right side. Commander format only, and only while there is no commander. `openOnMount` after an import. |
| `CommanderPicker` | `candidates`, `onPick`, `onSearchAll` | `Popover` + `Command` | This deck's cards that can be commander, plus a **Search all cards** footer. |
| Card ⋯ menu item | **Make commander** | `DropdownMenu` item | Eligible cards in Commander decks only. |

## 5. States

### 5.1 Choose file
| State | Shows |
|---|---|
| Default | Drop zone: upload icon, "ManaBox .csv or .txt", **Choose file**. |
| Drag over | Border `--accent-primary`, faint tint. |
| Wrong file | Red line: "Not a ManaBox .csv or .txt file". |
| Empty / unreadable | "No cards in this file" / "Couldn't read this file". |

### 5.2 Checking
- The file chip reads "Checking…" (`role="status"`), and the list shows 8 skeleton rows.
- The footer reads "Checking…" and the primary button is disabled. Options and **Cancel** still work.
- If the check fails: "Couldn't check this file" · **Try again**.
- Lines that haven't been checked yet are never shown as unmatched (D-030).

### 5.3 Review — deck
| Element | States |
|---|---|
| Name | Prefilled from the file name ("Strix draft"). Empty → red border, **Import** disabled. |
| Format | Default Commander. Count line: "65/100 · commander picked next" (Commander), "61/60" (60-card formats), "300/360" (Cube), "40" (Casual). |
| Generic basics | On (default) / Off, with the basic-land count next to it ("8"). Tooltip: "Basic lands count as sleeved and add no copies". Hidden when there are no basics. |
| Row control (1 copy) | **Original** (default; app-green tint + green border + green check icon, D-053 as amended by the owner) · **Proxy** (blue tint + blue border + blue mask icon) · **Unsleeved** (grey outline, no fill, no icon). Labels stay `--text-primary`. |
| Row control (2+ copies) | Same three segments. All copies one type: only that segment is on, with no count. Split: every type in use is on and shows its count, e.g. "Original 1 · Proxy 1" or "Proxy 1 · Unsleeved 1". |
| Generic basic row | **Basic** badge; no checkbox and no control (it isn't a physical card). |
| Foil (text files) | A tick box in the Foil column, off by default. Ticked = every copy on the row imports as foil. CSV rows show their file finish as a `FinishTag` (Foil / Etched); Nonfoil shows nothing (D-043). |
| Language | Rows that aren't English show a language tag ("JA"), one row per language (D-051). |
| Count stepper | **Collapsed:** the normal segments (counts shown when split). **Editing:** this row's segments are replaced by "Proxy − n + · Original r". **At 1:** − disabled (dimmed, still announced). **At qty:** + disabled; Original reads 0. **Split result (after collapse):** "Original 1 · Proxy 1". Only one row edits at a time. Hover/focus: buttons use `--bg-hover`; the number has a 2 px focus ring. |
| Selection | Header: "{n} selected · ✓ Original · Proxy · Unsleeved · Clear". The check icon is green and the mask icon blue; the buttons themselves stay neutral. |
| Empty filter / search | "No proxies" / "No unsleeved cards" / "No match for "sol r"". |
| Primary | **Import**. Disabled while checking, with no name, or with 0 cards. |

What each choice does (D-047): **Original** and **Proxy** add a new owned copy of that type and sleeve it in this deck. **Unsleeved** puts the card on the list only, so it can be sleeved later from cards you already own. Cards you already own are never pulled in automatically.

Example (Strix draft.csv: 65 rows → 58 combined, 8 basic lands): 54 Original, 1 Proxy, 3 Unsleeved, generic basics on → footer "**57 cards** · 1 proxy · 3 unsleeved · 8 basics". With generic basics off, the 8 basics become ordinary rows, so the footer reads **65 cards**.

### 5.4 Review — collection
- Same as 5.3 with no options line and no Unsleeved: each row offers **Original · Proxy**.
- Basic lands are ordinary rows, because they are real cards.
- Rows are split by language and combined across conditions; each copy keeps its condition (D-051).
- Tokens are skipped and listed (D-051).
- Footer "**26 cards** · 0 proxies"; the button reads **Add 26**. Nothing you already own changes, and importing the same file twice adds the cards twice (D-050).

### 5.5 Notices (one line each, only when they apply)
| Notice | Tone | Text |
|---|---|---|
| Not matched | Warning (amber icon + border, 8% tint) | "**1 not matched** · Line 89 `1 Witherbloom Pledgemage (SOS) 999` · no such card" · **Copy**. Several: "**3 not matched**" · **Show** · **Copy**. |
| Tokens | Info | "1 token skipped" · **Show** → "Line 43 `1 Inkling (TSOS) 7`" (D-049, D-051). |

Identical rows (same printing + finish + language) are combined into one row with a count, without a notice.

The samples have no unmatched lines (D-049: 186/186 matched), and the collection samples have no tokens and no non-English cards. The mockup's **Illustrative lines** switch adds one of each.

### 5.6 Importing, failed, done
| State | Shows |
|---|---|
| Importing — deck | "Importing…" with a spinner in the disabled primary button. Escape does nothing. |
| Importing — collection | "Importing…", progress bar, "32/57". **Cancel** → "Stop? {x} cards already added stay." **Keep going** · **Stop**. |
| Failed | `alertdialog` "Import failed — nothing changed" · **Back** · **Try again**. |
| Done — deck, Commander | No dialog. Go to the deck page (5.7) with the picker open. |
| Done — deck, other formats | Title "{name} imported". Lines: ✓ "54 cards added · sleeved · 1 proxy" · "3 unsleeved" · "8 basics" · "1 token skipped" · ⚠ "1 not matched `…`" **Copy**. **Open deck**. |
| Done — collection | "Collection updated" · "26 cards added" · "1 token skipped" … · **View collection**. |

### 5.7 Deck page — choosing the commander
| State | Shows |
|---|---|
| Straight after import | Picker open with focus in search. Under the header, a single dismissible line: "**Imported** · 54 cards added · sleeved · 1 proxy · 3 unsleeved · 8 basics · **1 not matched** `…`" · **Copy** · ✕. It is amber only when something didn't match. |
| Picker closed, no commander | Header meta "Commander · Draft · 99/100" (D-002) and the **Choose commander** button. |
| Picker open | Search "Search this deck", options (name · "Legendary"), footer **Search all cards**. |
| No eligible card / no match | "No match in this deck" (Search all cards is still offered). |
| Chosen | The button disappears; the meta gains "♛ Emil, Vastlands Roamer"; toast "Emil, Vastlands Roamer is commander · **Undo**". The card count doesn't change. |
| From outside the deck | Card search; the chosen card is added as commander (+1 to the count), Unsleeved (D-020). |
| Partner / Background | After the first pick, the button becomes **Add partner** (optional) and opens the same picker, filtered to valid partners. |
| Other formats | No button and no menu item. |
| Saving / failed | Button spinner; toast "Couldn't set commander — nothing changed · **Try again**". |

## 6. Interactions

### 6.1 Pointer
- Drop a file, or click **Choose file**. **Change** goes back to step 1 and resets the choices.
- **Row control:** one click on a segment. **Original** sets every copy on the row to Original. On a 1-copy row, **Proxy** or **Unsleeved** just selects it.
- **Foil:** click the tick box (text files).
- **Bulk:** tick row checkboxes, then **✓ Original**, **Proxy** or **Unsleeved** in the header. This sets every copy of each selected row; counts can be changed per row afterwards. Shift-click selects a range; the header checkbox selects all shown rows.
- Filters and search only narrow the list; they never change choices.
- **Copy** copies the unmatched lines, and its label reads "Copied" for 2 s. **Show/Hide** toggles the token lines.
- **Choose commander** → picker → click an option. Card ⋯ → **Make commander**. **Undo** reverts.

### 6.2 Count stepper (rows with 2+ copies)
- **Clicking Proxy or Unsleeved** on a row where that type isn't in use sets **all** copies to it and turns the row's control into the stepper, showing that number. Clicking a type already in use opens the stepper at its current number.
- **− / +** change the number by 1 within 1…qty. Reaching qty makes the whole row that type (Original 0).
- **Where the other copies go:** raising the number takes copies from Original first, then from the other type. Lowering it returns copies to Original.
  - "2 Pull from the Grave" → **Proxy** → "Proxy − 2 + · Original 0" → **−** → "Proxy − 1 + · Original 1".
  - Collapsed: "Original 1 · Proxy 1". Then **Unsleeved** → stepper → 1 → "Proxy 1 · Unsleeved 1".
- **Collapsing:** click anywhere outside the stepper, press Escape or Enter, or Tab away. Changes apply live, so collapsing **keeps** the number. There is no cancel.
- Only one stepper is open at a time (opening another collapses the first). Rows with 1 copy never show it, and **Original** never opens it.
- **Bulk bar:** with several rows selected, **Proxy** or **Unsleeved** applies to **all copies** of every selected row. No stepper opens, even on multi-copy rows; the per-row count is adjusted afterwards by clicking that row's own segment. (Unchanged from rev 3; stated here because the stepper is per row.)

### 6.3 Keyboard
| Where | Keys |
|---|---|
| Dialog | Opens with focus on Choose file / Name (deck review) / search (collection review). Tab stays in the dialog. Escape closes (not while importing) and returns focus to the **Import** button that opened it. |
| Drop zone | Not focusable. The **Choose file** button inside it is (Enter/Space), and that is the keyboard way to do the drop. |
| Row control, 1 copy | Radio group: Tab enters at the selected option; ←/→ move **and** select. |
| Row control, 2+ copies | Toggle group: Tab enters at the first segment in use; ←/→ **move focus only**; Enter/Space chooses it. For Proxy or Unsleeved this opens the stepper, and focus goes to the number. Arrow keys never open the stepper. |
| Count stepper | The number is the one Tab stop (`spinbutton`); − and + are pointer-only. **↑ / → / + / =** add 1; **↓ / ← / − / _** subtract 1; Home = 1; End = qty. Keys stop at the ends (no wrap). Enter, Space or Escape collapses, keeping the number, and returns focus to the segment. Tab collapses and moves on. |
| Foil / row checkbox | Space toggles. |
| Generic basics | Space toggles. |
| List | Per row: select checkbox → Foil (text files) → row control. |
| Commander picker | Opens with focus in search (also straight after import); ↑/↓ move; Enter picks; focus moves to **Undo** in the toast. Escape closes and returns focus to **Choose commander**. |
| Import result line | **Copy** and ✕ are buttons; ✕ moves focus to **Choose commander** (or the deck title once a commander is set). |
| ⋯ menu | Enter opens; ↑/↓; Enter picks; Escape returns to ⋯. |

## 7. Data binding

No contract defines the ManaBox import yet: **T-53 (Architect) is writing it**. Contracts I checked: `docs/oracle/contracts/import-reconciliation-redesign.md` (post-import reconciliation, not used here) and `placement-source.md` (placements carry `source`, D-009). The names below are only suggestions.

| Element | Source | Status |
|---|---|---|
| Format options, deck size | `FORMAT_OPTIONS`, `FORMAT_DEFINITIONS[f].deckSize` [Confirmed: src/lib/format-config.ts] | Exists |
| Preview before commit | A parse + match that writes nothing and returns the rows below. The deck CSV tab's current preview has a different shape [Confirmed: DeckImportButton.tsx `PreviewResponse`]; collection import has no preview. | **Needed** |
| Row | `name`, `setCode`, `collectorNumber`, `qty`, `finish` (text files: `nonfoil` unless Foil is ticked, D-049/D-051), `language`, `scryfallId`, `oracleId`, `isBasicLand` (the 5 basics, Snow-Covered, Wastes — D-048), `sourceLines[]`. Rows combined by `scryfallId + finish + language`; conditions combined, with each copy's condition kept (D-051). | **Needed** |
| Tokens | `skippedTokens: {line, raw}[]`, for deck **and** collection (D-049, D-051) | **Needed** |
| Unmatched | `unmatched: {line, raw, reason: 'no_card'\|'bad_line'\|'unknown_id'}[]` → "no such card" / "unreadable line" / "unknown card ID" | **Needed** |
| Commit — deck | per row `original`, `proxy`, `unsleeved` counts summing to `qty` (the file's Proxy column is ignored, D-045); text files: per-row `foil`; `name`, `format`, `genericBasics` (D-048). Original/Proxy create owned copies sleeved in the deck; Unsleeved creates deck rows only, with no copies (D-047). | **Needed** |
| Commit — collection | per row `original`, `proxy` counts; add-only (D-050) | **Needed** |
| Progress | `processed`, `total` [Confirmed: src/lib/chunked-import-client.ts] | Exists (collection) |
| Result | counts for added, proxies, unsleeved, basics, tokens, unmatched; `deckId` | **Needed** |
| Commander candidates | per deck card "can be commander", plus partner rules | **Needed** |
| Set commander on an existing deck | Today it can only be set at creation [Confirmed: src/components/NewDeckModal.tsx]; the deck update route accepts only `build_id` [Confirmed: src/app/api/decks/[id]/route.ts] | **Needed** |
| Readiness | D-002 (T-28 / Phase 6). Until then the header shows "99/100" without the state word (D-043). | Pending |

## 8. Copy (complete visible text)

| Where | Text |
|---|---|
| Titles | Import deck · Import collection · Importing… · Import failed — nothing changed · {name} imported · Collection updated |
| Tabs (deck) | URL · Paste · File · Precon |
| Drop zone | ManaBox .csv or .txt (collection: ManaBox .csv) · Choose file |
| File errors | Not a ManaBox .csv or .txt file · No cards in this file · Couldn't read this file |
| File chip | {file} · {n} cards · Change — while checking: {file} · Checking… · Change |
| Check failed | Couldn't check this file · Try again |
| Options | Name · Format · Generic basics {n} |
| Tooltip | Generic basics: "Basic lands count as sleeved and add no copies" |
| Count line | {n}/{size} · commander picked next (Commander) · {n}/{size} (others) · {n} (Casual) |
| Notices | **{n} not matched** · {Line 89 / Row 66} `{raw}` · {no such card / unreadable line / unknown card ID} · Copy → Copied · {n} token(s) skipped · Show / Hide |
| Filters / search | All {n} · Proxies {n} · Unsleeved {n} · Basics {n} · Find card |
| List header | Qty · Card · Foil (text files) — selected: {n} selected · ✓ Original · Proxy · Unsleeved · Clear |
| Row | Original · Proxy · Unsleeved — split: Original {n} · Proxy {n} · Unsleeved {n} — Basic · Foil · Etched · {LANG} |
| Count stepper | Proxy − {n} + · ✓ Original {r} — Unsleeved − {n} + · ✓ Original {r} |
| Empty list | No proxies · No unsleeved cards · No match for "{query}" |
| Footer | **{n} cards** · {p} proxies · {u} unsleeved (if any) · {f} foil (if any) · {b} basics (if any) |
| Buttons | Cancel · Import · Add {n} · Back · Try again · Open deck · View collection |
| Importing | Deck: spinner. Collection: {x}/{n} · Cancel → "Stop? {x} cards already added stay." Keep going · Stop |
| Done lines | {n} cards added · sleeved · {p} proxies · {u} unsleeved · {b} basics · {t} tokens skipped · 1 not matched `{raw}` Copy |
| Deck page | **Imported** · {done lines} · Copy · ✕ — Choose commander · Search this deck · Legendary · No match in this deck · Search all cards · Make commander · Add partner |
| Toasts | {card} is commander · Undo — Couldn't set commander — nothing changed · Try again |

Use singulars correctly ("1 proxy", "1 token", "1 basic").

## 9. Accessibility

**Colour pairs** (existing tokens, on `--bg-surface` #1A1A1E):

| Pair | Ratio | Use |
|---|---|---|
| `--text-primary` on Proxy-selected tint (18% `--status-proxy`, blue) | 11.1:1 | Proxy label; number in the Proxy stepper |
| `--text-primary` on Original-selected tint (18% `--accent-primary`, green) | 11.1:1 | Original label |
| `--accent-primary` (green icon) on surface | 5.1:1 | Check icon; stepper "✓ Original n" icon |
| `--accent-primary` border vs its tint | 4.0:1 | Non-text ✓ |
| `--status-proxy` border vs that tint | 3.9:1 | Non-text ✓ |
| Selected outline `--text-secondary` vs `--bg-surface` | 6.4:1 | Unsleeved (outline only) |
| `--text-primary` / `--text-secondary` on 8% warning tint | 12.4 / 5.6:1 | Unmatched line |
| `--signal-warning` border | 8.0:1 | Unmatched line |
| `--text-primary` on 10% critical tint; red icon/border | 12.9 / 4.4:1 | File error |
| `--text-tertiary` (set + number, 11 px) on surface | 3.4:1 | **Below 4.5:1 for small text.** Use `--text-secondary` (6.4:1) in the build (G3). |
| Switch off track `--text-tertiary` | 3.4:1 | Non-text ✓ |
| White on `--accent-primary` | 3.4:1 | Switch thumb ✓. Button text is below AA, an existing app-wide pair (G3). |

- **D-012 (colour is never the only cue):**
  - Original = check icon + word + green. Green and Proxy blue have similar lightness, so in greyscale the check vs mask icon and the words carry the difference (verified with the greyscale switch).
  - Proxy = mask icon + word + blue.
  - Unsleeved = word + outline with no fill.
  - Basic = landscape icon + word.
  - Unmatched = warning icon + "not matched"; tokens = skip icon.
  - Split counts are written out.
  - The mockup's greyscale switch shows every state still reads.
- **D-013 / D-014 / D-015 / D-053:** no new colours. A selected Original uses the app green `--accent-primary` #1D9E75 (owner, 2026-10-13: "Lets use the app green. Its the state we want a card in"). Only Original, Proxy and the unmatched line carry colour. The dashed border is used only on the empty drop zone.
- **Tooltips** hold explanations only. They show on hover and focus, and their text is also the control's `aria-description`.
- **Focus order (deck review):** Change → Name → Format → Generic basics → notice actions → filters → search → select-all → per row (select → Foil → row control; stepper number when editing) → Cancel → Import.
- **Screen-reader names:**
  - Row group: "Pull from the Grave, 2 copies".
  - Segments on a 2+ copy row: toggle buttons named "Proxy, 1 of 2".
  - Stepper: group "How many Pull from the Grave are proxies" / "… are unsleeved"; number is a spinbutton ("Proxies, 1 of 2", min 1, max qty); buttons "Fewer proxies" / "More proxies" (disabled at the ends).
  - The Original remainder is `aria-live="polite"` and atomic: each step announces "Original 1". Collapsing announces "Pull from the Grave: 1 original, 1 proxy".
  - Foil tick box: "Foil, Abrade".
  - The footer is `aria-live="polite"` (debounced ~500 ms). Bulk actions announce "3 cards set to Unsleeved".
  - The checking state and the import result line are `role="status"`; failure is `role="alertdialog"`.
- **Commander picker:** WAI-ARIA combobox with `aria-activedescendant`. When it opens straight after import, focus goes to its search, and the deck heading stays the page's first heading.
- **Target size:** segments, stepper buttons (26 × 24 px) and tick boxes are ≥ 24 px tall, or 15 px boxes inside 30 px rows with a 24 px clickable area (WCAG 2.2 2.5.8 ✓).
- **Motion:** spinners stop under `prefers-reduced-motion` [Confirmed: src/app/globals.css].

## 10. What this replaces

| Today | After |
|---|---|
| Collection import replaces the collection and clears deck sleeves [Confirmed: CollectionImportButton.tsx] | Adds only, with a preview first (D-050). Other CSV layouts are still accepted (G4). |
| Deck mode picker "These are new cards / I have this deck built / This is theorycrafted" [Confirmed: DeckImportButton.tsx] | For ManaBox files: **Original · Proxy · Unsleeved** per card (D-047). The URL, Paste and Precon tabs are unchanged. |
| Deck "CSV" tab | **File** tab, `.csv` + `.txt` |
| Commander only set at deck creation [Confirmed: NewDeckModal.tsx] | Picker opens after import (D-052); **Choose commander** in the deck header; **Make commander** in the ⋯ menu |

## 11. Questions for Brad

1. **For text files, is one Foil tick box per card line what you meant?** Recommended: yes. Ticking it marks every copy on that line as foil. For example, "2 Adventurous Eater" ticked gives 2 foils. If only one of the two is foil, you'd fix the second one afterwards. The alternative is to ask how many are foil, like Proxy does. That's more exact, but it adds a picker to a rarely needed case.

## 12. Open questions (for Gene / Architect, not Brad)

- **G1 (T-53):** every **Needed** row in §7. In particular: the preview that writes nothing, per-row Original/Proxy/Unsleeved counts on commit, per-row Foil for text files, and setting the commander on an existing deck.
- **G6 (decisions register):** the owner chose the app green for a selected Original ("Lets use the app green. Its the state we want a card in"), replacing D-053's mint, which was to differ from the brand green. D-053 needs amending. No new token is needed.
- **G3:** small-text contrast. White on `--accent-primary` buttons is 3.4:1 (pre-existing and app-wide; suggest a T-26 token fix). The mockup's `--text-tertiary` set/number text should be `--text-secondary` in the build.
