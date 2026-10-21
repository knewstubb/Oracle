# Import row editing — spec (rev 5)

Rev 5: the Edit/Done text button is replaced by a caret and the whole row is clickable with a grey hover; see `import-review-controls.md` §5. Wherever this spec says "Edit" or "Done", read "caret (down) / caret (up)".

Rev 2 (2026-10-20, owner revisions): field order is Type · Language · Finish · Condition; proxies keep only Language; the expanded footer row is gone (apply-to-all is a small icon on copy 1); bulk shows "Mixed"; owner edits override file values; (superseded in rev 4: no duplicate/remove, the list is not editable).

Mockup: `docs/oracle/mockups/import-row-editing.html`. Applies to the card list on the collection and deck import screens (D-044, D-050). Builds on `manabox-import.md`; where they conflict, this spec is the proposal and needs owner sign-off (see "Conflicts").

## 1. The problem
Each physical copy can differ in Original/Proxy, finish, condition and language, but the import list only lets you set Original/Proxy counts. Showing every attribute on every row would turn a list of hundreds of mostly identical cards into a wall of controls; showing none means the owner cannot log foils or condition at import time and has to fix them card by card afterwards.

## 2. Principle
Progressive disclosure plus "quiet default, loud exception" (D-014): the row shows only what differs from the defaults, and detail appears on request, per object. Controls sit inside the thing they change (D-015): per-copy controls live on the copy's line, bulk controls live in the list header, defaults live above the list. Recognition over recall (Nielsen #6): tags show values instead of making the user open each row to check.

## 3. Component inventory
| Component | Props | Built on |
|---|---|---|
| `ImportDefaultsBar` | `finish`, `condition`, `language`, `onChange` | `Select` ×3 inside an inline reveal; text link trigger |
| `ImportRow` (collapsed) | `name`, `setCode`, `collectorNumber`, `copies[]`, `selected`, `onEdit` | `Checkbox`, `Button` (outline, sm) |
| `CopyTags` | `copies[]`, `defaults` | `Badge` (outline) |
| `ImportRowExpanded` | `copies[]`, `onChangeCopy`, `onApplyAll` | `ToggleGroup`, `Select`, `Button` (ghost, icon) |
| `CopyLine` | `index`, `type`, `finish`, `condition`, `language` | as above |
| `ImportBulkBar` | `selectedRows`, `selectedCopies` | `Button`, `Popover` |
| `BulkSetPopover` | `finish?`, `condition?`, `language?` (each "Leave as is") | `Popover`, `Select` |

Copy model: each copy stores type, finish, condition, language. A value **not set by the owner or the file follows the defaults bar**; changing the defaults updates those copies only.

## 4. Layout and behaviour
**Defaults bar.** One line above the list: "Importing as: Non-foil · Near Mint · English" with a **Change** link. Change reveals three selects in place; the link becomes **Done**. Right side: "Values in your file are used automatically where present."

**Collapsed row.** Checkbox · quantity · name + set code/number · tags · **Edit**. The Original/Proxy counters are removed (see Challenge 1). Tags appear only when a value differs from the defaults:
- Proxy: blue outline, ◆ icon, "Proxy" (all copies) or "2 Proxy" (some).
- Finish: "Foil" / "Etched", ★ / ✦ icon; with a count when only some copies.
- Condition: "LP", "MP", "HP", "DMG". Finish and condition tags count Originals only; proxies contribute only the Proxy tag and, if different, a language tag.
- Language: "JA" etc.
- At most 3 tags, then "+N more". Order: Proxy, finish, condition, language.
- Default rows show no tags at all.

**Expanded row (Edit).** The row gains a lighter surface and a left rule; **Edit** becomes **Done**. Below the name, one line per copy: `# · [Original|Proxy] · Language · Finish · Condition · [Apply to all (copy 1 only)]`. The list is not editable: the number of copies per card is fixed by the file; the owner only edits each copy's type, language, finish and condition. There are no Duplicate or Remove controls (rev 4).
- Proxy copies hide **both Finish and Condition**; only Language remains. Condition is stored as none. Finish for a proxy is not shown and not edited (it keeps the default value stored; Architect to confirm what proxies store).
- Quantity is read-only everywhere in this flow. To drop a card or change a count, the owner edits the file.
- **Apply to all:** a small ⇊ icon button on copy 1's line only, at 2+ copies, tooltip and name "Make all copies like copy 1". No extra row, no footer.
- Owner edits override values from the file. A value that came from the import file gets a tiny dot (6 px, light grey, outlined) on the top-right corner of its field, tooltip "From your file", and the field's accessible name ends "(from your file)". The dot overlaps the field, so it adds no row height. Editing that value (single line, apply-to-all, or bulk) clears its dot. Defaults-bar values never get a dot.
- Rev 3: the earlier "From your file: …" text line was removed.
- More than one row may be open. Rows with 10+ copies scroll inside the page, not inside the row.

**Bulk.** With rows ticked, the list header becomes: "N selected · [Original|Proxy] · Set finish / condition / language ▾ · Clear". The Original/Proxy toggle shows one side pressed when every ticked copy agrees, and neither pressed plus the word "Mixed" when they differ. The popover has Finish, Condition, Language (each "Leave as is" by default) and the note "Applies to 7 copies in 3 rows. Proxies keep only language." Finish and condition skip proxies. Apply changes every copy in every ticked row.

## 5. States
| State | Behaviour |
|---|---|
| Default row | no tags, Edit |
| Row with tags | tags as §4 |
| Mixed row | tags carry counts ("1 Proxy", "1 Foil", "1 LP") |
| Expanded | per-copy lines |
| Proxy copy | Finish and Condition hidden, blue Proxy selected |
| Selected | checkbox ticked; header becomes bulk bar |
| Single copy | one line, no apply-to-all icon |
| Bulk, mixed selection | "Mixed" label, neither type pressed |
| Hover / focus | row hover surface; 2px green focus ring on every control |
| Disabled | 45% opacity, not-allowed cursor |
| Loading / empty / error | unchanged from `manabox-import.md` (no new states; rows never load individually) |
| Unowned / over-allocated | not applicable on import |
| Deck import | the Original/Proxy toggle gains a third "Unsleeved" option per D-047 (open question 5) |

## 6. Interactions
Pointer: Edit toggles; segmented control sets type; selects change values; icon button on copy 1 applies it to all copies; header checkbox selects all.
Keyboard: Tab order is checkbox → Edit → (expanded) per line: type, language, finish, condition (proxies skip the last two), apply-to-all (copy 1). Enter/Space activate buttons; arrow keys move within the type toggle and native selects. Escape closes the bulk popover and returns focus to its trigger. No drag interactions.
Live region announces: "All copies now match copy 1.", "Applied to selected rows."

## 7. Data binding
Writes the per-copy fields on `user_copies`: `is_proxy`, `finish` (`nonfoil|foil|etched`), `card_condition` (null for proxies), `language` (ISO code) [Confirmed: `docs/oracle/contracts/manabox-import.md` §3, §4]. File values map per that contract: Foil → finish, Condition → condition, Language → language; the file's Proxy column stays ignored (D-045). Row combining by `scryfallId + finish + language` per D-051 [see Challenge 2]. Gap: the contract's row type holds one condition and language per row; per-copy values need `copies[]` on the import row. Architect to confirm (see report).

## 8. Copy
- Defaults label: "Importing as:" · link "Change" / "Done".
- File note: "Values in your file are used automatically where present."
- Defaults help: "Applies to copies you haven't set yourself. Proxies keep only language."
- Row button: "Edit" / "Done" (screen reader: "Edit Rehearsed Debater").
- Apply-to-all icon: "Make all copies like copy 1"
- Bulk type: "Mixed"
- Bulk: "3 selected", "Set finish / condition / language", "Leave as is", "Apply", "Cancel", "Clear", "Applies to 7 copies in 3 rows. Proxies skip condition."
- Tags: "Proxy", "2 Proxy", "Foil", "Etched", "LP", "JA", "+2 more" (title: "Press Edit to see all").
- Hidden row summary for screen readers: "Differs from defaults: Proxy, Foil, LP" / "Uses defaults".

## 9. Accessibility
Contrast against `#1A1A1E`, using existing tokens: secondary text `#9C9CA3` ≈ 6.5:1; proxy blue `#4A93A0` ≈ 5.0:1; app green `#1D9E75` ≈ 5.1:1 (all ≥ 4.5:1). Tertiary text `#6E6E76` (set code, copy numbers) ≈ 3.5:1 — acceptable only for non-essential repeats, and the set code is also in the row's accessible name; Developer should use secondary for the set code if the owner wants strict AA. D-012: Proxy = blue + ◆ + word; Foil = ★ + word; selected type = fill + ring + word. No state is colour alone. Every select and icon button has an accessible name; the expanded copy lines are `role=group` labelled "Copy 2 of 3"; Edit uses `aria-expanded`.

## 10. Conflicts with locked decisions
1. **Replaces the Original/Proxy/Unsleeved control and inline stepper** from `manabox-import.md` rev 6 (D-045, D-047, D-053 remain true; only where they are set moves to the expanded row and bulk bar). Quick whole-row Proxy is now Tick → Proxy in the header.
2. **D-051** splits rows by language, but per-copy language implies one row can hold several. Proposed: rows still split by language *as imported from the file*; the owner's own change to one copy keeps it in its row.

## 11. Open questions
Answered by owner: bulk shows "Mixed"; owner edits override file values; the list is not editable (no duplicate, remove or drop-card).

1. Does the shortcut icon (⇊) read clearly enough on copy 1, or should it be a tooltip-only text button?
3. Changing the defaults after editing: only untouched copies follow. Confirm.
4. Should Edit remember open rows after filtering/searching? (Proposed: yes.)
5. Deck imports: Unsleeved as a third type in each copy line. Confirm.
6. What finish do proxies store (default finish, or non-foil)? Architect.
