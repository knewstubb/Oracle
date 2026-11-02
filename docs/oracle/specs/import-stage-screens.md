# Import stage screens — spec (rev 1)

Mockup: `docs/oracle/mockups/import-stage-screens.html`. Covers the four non-review stages of the collection and deck import modal: **upload**, **processing**, **importing**, **result**. The review screen is covered by `import-row-editing.md`. Modal size is unchanged: one fixed size for every stage, 48rem wide, up to 46rem tall.

## 1. The problem
With one fixed large modal, the stages that have little to show look abandoned: upload is a small dashed box floating in empty space, processing is a lone spinner, and the result is a tiny title and one line centred in a large dark area. The owner cannot tell what format to bring, where to get it, what will happen to the data, or at the end what exactly was added and whether anything needs attention.

## 2. Principle
- **Fitts's law / affordance:** the whole body is the drop target, so the target is as large as the space.
- **Visibility of system status and recognition over recall (Nielsen #1, #6):** say what is happening, how far, and what to do next at every stage.
- **Quiet default, loud exception (D-014):** a clean result is a headline and one line; breakdown rows and warnings appear only when there is something to report.
- **D-015:** dashed border is used only for the empty drop zone, never for buttons.

## 3. Component inventory
| Component | Props | Built on |
|---|---|---|
| `ImportDropZone` (replaces the small box in `ManaBoxFilePicker`) | `accept`, `formatLabel`, `onFile`, `error` | native drop handlers, `Button` (outline) |
| `ImportHelpCards` | `kind` | plain bordered `div`s |
| `ImportErrorBanner` | `message`, `hint` | existing alert style (`role=alert`) |
| `ImportWorking` (processing and importing) | `title`, `detail`, `fileName?`, `processed?`, `total?`, `unit?`, `onCancel?` | `Progress` bar, `Button` (ghost) |
| `ImportResult` (restyled) | existing props plus `foils`, `unrecognisedValues`, `unlistedFinish` | `Button`, `Badge` |
| `ResultBreakdown` | `originals`, `proxies`, `foils`, `tokensSkipped`, `unsleeved?`, `basics?` | bordered list |
| `ResultNotice` | `kind: warning\|info`, `text`, `lines?` | existing notice styling |

## 4. Layout and states

### 4.1 Upload
Body, top to bottom: optional error banner · **drop zone (fills all spare height, minimum 200 px)** · two help cards side by side (≈ 100 px).
- **Empty:** centred in the zone: upload icon in a 56 px disc; "Drop your ManaBox file here"; "or"; **Choose file** (outline button); format line ("ManaBox .csv"; deck: "ManaBox .csv or .txt", D-049).
- **Drag over:** border and disc turn app green, light green tint; icon becomes an up-arrow; text "Drop to import" and "Release to read the file" (deck: "the deck"); the button and "or" hide.
- **Error:** banner above the zone; the zone stays in its empty state so the user can retry at once. Messages in §7.
- **Help cards:** "Export from ManaBox" and "What happens next" (three numbered lines). They are static and never change with state.
- Loading, disabled, over-allocated, unowned: not applicable.

### 4.2 Processing
Vertically and horizontally centred group: 36 px spinner · "Reading your file…" · "Matching 148 cards to Scryfall. This usually takes a few seconds." · file chip with the file name. No progress bar, because the app reports only the card count here, not progress. Reduced motion: the spinner stops spinning and shows a static partial ring.

### 4.3 Importing
Centred group: title ("Adding to your collection…" / "Creating your deck…") · progress bar 360 px wide · "87 of 148 copies" · "Keep this window open until it finishes." · **Cancel import** as a visible text button (replaces the small icon-only ✕).

### 4.4 Result
Centred column, max 460 px, scrolls inside the body if tall. Footer: **Close** (outline), **View collection** / **Open deck** (primary).
1. **Hero:** 52 px green circle with a check; headline "148 copies added"; line "to your collection". Deck: "Strix draft imported" / "66 cards added and sleeved".
2. **Breakdown** (bordered list; only when at least one of proxies, foils or tokens is non-zero): Originals · Proxies (blue ◆) · Foil (★, "included in the counts above") · Tokens skipped. Each row is hidden when 0, except Originals. Deck adds "Unsleeved" and "Basics" rows by the same rule (not mocked).
3. **When the breakdown would be empty,** one line "All originals." replaces it.
4. **Needs a look** (only when present): one amber-outline notice per kind (value not recognised; finish Scryfall doesn't list), then the unmatched-cards notice with up to three raw lines, each with the reason, and a header button **Copy unmatched lines**. More than three lines: "Show all 12" expands in place.
- States to review: 4a success clean · 4b success with breakdown · 4c success with notices and unmatched.
- Error on the import itself: unchanged from the current app (not redesigned here).

### 4.5 Deck result (rev 2)
No commander block. A quiet grey line under the breakdown and notes: "No commander yet. Choose one on the deck page." (see `import-review-controls.md` §7). Review-screen button is "Import deck" / "Import cards".

## 5. Interactions
Pointer: drag a file over the zone (drag-over state); drop to start; click Choose file; Cancel import; Close; View collection / Open deck; Copy unmatched lines; Show all.
Keyboard: Tab order on upload is Choose file → (error banner is not focusable) → close ×; Enter/Space on Choose file opens the file dialog. The whole zone is not a tab stop (the button is the keyboard equivalent of dropping). Result: Close → primary button; initial focus on the primary button. Escape closes at upload and result; while importing, Escape does nothing (Cancel import is the only way out).
Screen reader: processing and result are `role=status`; the error banner is `role=alert`; the progress bar has `aria-valuenow/max` and the label "Import progress". Changes of stage announce their title ("Reading your file", "Adding to your collection", "148 copies added").

## 6. Data binding
Existing, no change [Confirmed: `src/components/manabox-import/ImportResult.tsx`, `ManaBoxCollectionImportDialog.tsx`]: `inserted` (total), `proxies`, `skipped` (tokens), `unsleeved`, `basics`, `unmatched[]` (`rawLine`, `reason`), preview card count for processing, `processed/total` for importing, `unlistedFinish` [Confirmed: `docs/oracle/contracts/manabox-import.types.ts`, collection and deck summaries].
Derived: Originals = `inserted − proxies` (collection). For decks, Originals = `inserted − proxies − unsleeved`: confirm with Architect.

**Not returned to the result screen today (needed):**
| Field | Where it comes from | Proposed |
|---|---|---|
| `foils` (copies imported as foil or etched) | not in the summary; the review step knows each copy's final finish | Server returns it in the summary (preferred: counts what was actually stored); otherwise the client counts it from the confirmed review rows |
| `unrecognisedValues` | already computed for the review screen (`preview.notices`: condition, language, finish) | Carry it forward to the result step unchanged; no API change |
| `unlistedFinish` | in the summary, not shown on the result today | Pass to the result screen |
| Per-copy finish `etched` | counted with foils | Same field |

## 7. Copy
- Title: "Import collection" / "Import deck".
- Drop zone: "Drop your ManaBox file here" · "or" · "Choose file" · "ManaBox .csv" (deck "ManaBox .csv or .txt") · drag-over "Drop to import" / "Release to read the file".
- Help card 1 "Export from ManaBox": "Open your collection in ManaBox and export it as CSV." Deck: "Open the deck in ManaBox and export it as CSV or text."
- Help card 2 "What happens next": "We read finish, condition and language from your file." · "You review the cards and can change any copy." · "Nothing is added until you confirm."
- Errors: "That isn't a ManaBox .csv file. Choose the file you exported from ManaBox." · "This file has no cards. Check you exported the right list from ManaBox, then try again." · "We couldn't read that file. Export it from ManaBox again and retry."
- Processing: "Reading your file…" · "Matching 148 cards to Scryfall. This usually takes a few seconds." (no card count known: "Matching your cards to Scryfall.")
- Importing: "Adding to your collection…" / "Creating your deck…" · "87 of 148 copies" · "Keep this window open until it finishes." · "Cancel import".
- Result: "148 copies added" / "1 copy added" · "to your collection" · "Strix draft imported" · "66 cards added and sleeved" · "All originals." · rows "Originals", "Proxies", "Foil — included in the counts above", "Tokens skipped" · "Needs a look" · "3 values in your file weren't recognised, so your defaults were used." · "2 copies have a finish Scryfall doesn't list for that printing. They were kept as in your file." · "3 cards couldn't be matched, so they weren't added." · "Copy unmatched lines" · buttons "Close", "View collection", "Open deck".

## 8. Accessibility
Contrast on `#1A1A1E`: secondary text ≈ 6.5:1; green `#1D9E75` ≈ 5.1:1 (check icon, progress, drag-over border); proxy blue `#4A93A0` ≈ 5.0:1; amber `#EF9F27` and red `#E24B4A` are used for icon and border only, with body text in primary/secondary colour. Known existing issue: white text on the green primary button is ≈ 3.4:1 (below AA for 13 px); same as every primary button in the app, flagged not changed. D-012: success = icon + headline; warnings = triangle icon + text; proxy = ◆ + word; drag-over = icon and text change, not colour only. Dashed border meets the 3:1 non-text rule only in the drag-over state; the empty zone is also identified by its icon, text and button, so it isn't relied on.

## 9. Open questions
1. **ManaBox export wording.** The exact menu path in ManaBox is not verified; the help card uses a generic sentence. Owner to supply the steps if they want them spelled out.
2. **Foils in the breakdown:** shown as an "included above" row. Acceptable, or should Foil be a tag on Originals/Proxies only?
3. **Clean result** shows "All originals." Should it also say "Non-foil" when no foils?
4. **Processing** has no real progress bar because only a card count is known. Is an indeterminate spinner acceptable?
5. **Unmatched lines:** three shown, then "Show all". Is three right?
6. Result for decks: `Originals` maths with Unsleeved (see §6) needs Architect confirmation.
