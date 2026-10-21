# Import review controls — spec (rev 1)

Mockup: `docs/oracle/mockups/import-review-controls.html`. Applies to the review screen of both imports (deck and collection). Extends `import-row-editing.md` and `import-stage-screens.md`.

## 1. The problem
The deck review list can be 60+ cards in file order, so finding a card means scrolling or searching. Three amber "not matched" boxes stack above the list and push it down, and they cannot be hidden. Rows only reveal that they are editable through a text button, and the footer button just says "Import".

## 2. Principle
- **Flexibility and efficiency (Nielsen #7):** sort is one small control for a long list.
- **User control and freedom (#3) + quiet default, loud exception (D-014):** warnings take one line, can be dismissed, and can always be brought back; nothing is lost because the result screen repeats them.
- **Affordance and Fitts's law:** the whole row is the target; a caret signals "opens"; hover shows it is clickable.
- **Plain labelling:** the final button says what it does.

## 3. Component inventory
| Component | Props | Built on |
|---|---|---|
| `ImportSortSelect` | `value: 'name'\|'file'`, `onChange` | shadcn `Select` |
| `ImportNotes` (replaces the stacked unmatched boxes) | `unmatched[]`, `tokens`, `hidden`, `onDismiss`, `onRestore` | `Button` (ghost), notice styling |
| `UnmatchedList` | `lines[]` | plain list, `Button` (ghost, sm) |
| `ImportRow` | existing, plus `onToggle` on the whole row | caret `Button` (ghost, icon) |
| Footer | `total`, `unmatchedCount`, `hiddenCount` | `Button` (primary) |

## 4. Sort
**Placement:** in the filter row, right side, between the chips and Find card: `Sort [Import order ▾]`. 24 px high like the chips.
**Options:** "Import order" and "Name A–Z" (in that order).
**Default:** Import order for deck and collection (owner decision, 2026-10-21). It matches the file and the line numbers in "not matched" notes; Name A–Z is one click away.
**Rules:**
- Chips choose which rows, Find narrows them, Sort orders what is left.
- Chip counts and the footer total never change with sort.
- Name sort: case-insensitive, double-faced cards by front name, ties by set code then collector number.
- Basics (deck) are sorted in with everything else; the Basics chip still isolates them.
- Ticked rows stay ticked; open rows stay open and move with their card.
- Editing a value never reorders rows.
- The choice lasts for this import only; each new import starts on Import order (owner decision).
- Keyboard: standard select. Screen reader: label "Sort"; announces "Sorted by name A to Z".

## 5. Not-matched and other notes
- **1 line:** one box: icon · "1 line not matched · Line 1 · `Commander` · unreadable line" · **Copy** · ✕.
- **2 or more lines:** one line: icon · "3 lines not matched · they won't be imported" · **View** · **Copy all** · ✕.
  - **View** opens an inline list directly under the line (about 4 rows visible, scrolls beyond): line number · text · reason · **Copy**. The button becomes **Hide**.
  - **Copy all** copies every raw line, one per line.
- **Tokens skipped** and value notices (not recognised; finish not listed): quiet grey one-liners, each with ✕.
- **Dismiss (✕)** hides that note for this review only. Numbers don't change and the cards stay not imported. The footer keeps the count ("24 cards · 3 not matched") and adds **Show hidden notes (n)** while anything is hidden; clicking it restores all hidden notes. After dismissing, focus moves to that footer link.
- Dismissal is not remembered once the review closes.
- **Result screen:** unmatched lines and notes always appear under "Needs a look", dismissed or not (`import-stage-screens.md` §4.4). `unmatched[]` already reaches the result.

## 6. Row affordance (replaces Edit/Done text)
- Whole row is the click target, except the checkbox. Hover: subtle grey background (`--bg-hover`), hand cursor.
- Right end: a caret button, down when collapsed and up when expanded. 28 × 28 px, grey, brighter on row hover.
- Expanded: lighter surface and left rule stay; clicking the header row or caret collapses. Clicks inside the copy lines never collapse it.
- Keyboard: the caret is the real button (Tab, Enter/Space), `aria-expanded`, named "Edit Rehearsed Debater" / "Collapse Rehearsed Debater", with a visible focus ring. Row click is a mouse and touch convenience and adds no tab stop.
- Tags stay in the collapsed row.

## 7. Button wording
Footer button: **Import cards** (collection), **Import deck** (deck). Footer left text: "24 cards · 3 not matched" (collection: "148 copies"). Result buttons unchanged.

## 8. Commander moves out of the import
The deck result no longer asks for a commander. It shows a quiet grey line: **"No commander yet. Choose one on the deck page."** (info icon, not amber, since nothing went wrong). Choosing happens on the deck page, where only valid commanders are selectable: see `deck-commander-selector.md`.

## 9. States
| State | Behaviour |
|---|---|
| Sort Name / Import order | as §4 |
| Filter or Find with no results | "No cards match. Clear the filter or search." |
| 0 unmatched | no note |
| 1 unmatched | single box with Copy and ✕ |
| 2+ unmatched | one-line summary; View expands |
| Dismissed | note gone; footer shows "Show hidden notes (n)" |
| Row hover / focus / expanded | grey surface; green focus ring on caret; caret flips |
| Deck vs collection | deck: All, Proxies, Unsleeved, Basics chips; collection: All, Proxies |

## 10. Copy
"Sort" · "Name A–Z" · "Import order" · "Find card" · "3 lines not matched · they won't be imported" · "1 line not matched" · "View" / "Hide" · "Copy" / "Copied" · "Copy all" · "Dismiss not matched note" · "Show hidden notes (2)" · "No cards match. Clear the filter or search." · "Import cards" · "Import deck" · "No commander yet. Choose one on the deck page."

## 11. Data binding
No new data. `unmatched[]` (`sourceIndex`, `rawLine`, `reason`) and `skippedTokens` exist [Confirmed: `src/components/manabox-import/ImportNoticeLine.tsx`]. Import order needs each row's file position [Approximate: Developer to confirm the field].

## 12. Accessibility
Contrast as in earlier specs (secondary ≈ 6.5:1; amber for icon and border only). D-012: warning = triangle icon + text. ✕ and caret targets are 24–28 px (WCAG 2.2 minimum 24 px). Live region: "Note hidden. 3 lines still not matched." D-015: ✕ and Copy sit inside the note they act on.

## 13. Challenges to locked decisions
- **D-052** (commander picker opens right after a deck import) conflicts with the owner's decision to choose commanders on the deck page. Suggest superseding it; D-046 still holds.

## 14. Open questions
Answered by owner: default Import order (deck and collection); not remembered; basics sorted in with the rest.

2. Is the footer "Show hidden notes" link an acceptable recall?
1. Collapse threshold is 2 unmatched lines; owner to explain preference (pending).
2. Commander on the deck page: see `deck-commander-selector.md`.
