# Spec: "Import built deck" modal, changes on top of today's modal
Role: Designer · 2026-11-04 (reworked after owner feedback) · Gate 3 (owner approves before build)
Mockup: `docs/oracle/mockups/import-modal-redesign.html` · Requirements: `docs/oracle/briefs/use-what-i-own.md` §9 and §10 (§10 wins)

## 1. Rule for this spec
**The baseline is the modal as it ships today** (`src/components/manabox-import/`, viewed live at 1440×900). Everything not listed in §3 stays exactly as it is: dialog 768px wide, header (Name / Format / Commander), the "Importing as" bar, the filter row (All chip, Sort, Find card), the list columns (checkbox, Qty, Card, Card origin, Type, chevron), proxy mark, pills, expanded copy lines, "N in deck" summary, Back / Cancel / Import deck, all existing tokens and spacing. The mockup copies token values and metrics from the live app. A "Highlight what changed" switch in the mockup's review strip outlines each changed element with a numbered tag that matches §3.

## 2. Locked owner answers
1. A spare copy (owned, in no deck) is preselected before any deck copy.
2. Import is blocked until every copy has a source.
3. Duplicate deck name warns only; it never blocks.
4. The Import button's dark text (`#08150F` on `#1D9E75`, 5.5:1; white is 3.4:1 and fails AA) applies to the **global primary button component**, not only this modal.
5. Language on Unowned rows is **held back**: not built until the Architect confirms where it is stored. Everything else is built.

Pending owner, assumed here: Q4 no "1" on single-copy rows; Q5 ignored basics are still added to the deck.

## 3. What changes (numbers match the mockup tags)
| # | Where | Today | Change |
|---|---|---|---|
| 1 | Header | Commander select in row 1; second-slot select appears when a commander is chosen | Second slot (Partner or Background) appears only when the chosen commander allows one. Uses existing `ReviewCommanderSelect` slot types (`commander`, `second`). |
| 2 | Header row 2 | Companion select always shown | Shown only when the file contains a Companion card (`companion` slot). |
| 3 | "Importing as" bar | "Ignore basic lands" lives elsewhere | A switch inside the bar, on by default, plus "N ignored, still added to the deck". |
| 4 | "Importing as" bar | Defaults apply to all copies not set by hand | Apply to **new copies only**. Note under the Change editor: "Applies to new copies only. Copies you already own keep their own finish, condition and language." Rows using an existing copy show no finish, condition or language. |
| 5 | Expanded row | Origin/type per copy; copies held in another deck are flagged "shared" and never moved | When a copy is From collection, a **Source** select sits on the copy line: "Spare copy (not in a deck)" first (preselected), then "Take from {deck}" per deck holding a copy. Per copy, so two copies can come from two decks. No separate section. If no spare and 2+ decks: placeholder "Choose a source…" (amber); the copy needs attention. |
| 6 | Collapsed row, after the name | Only the teal proxy mark | Pulled-from-deck mark, 18px round, same style as the proxy mark but a **violet outlined card with an arrow leaving it** (new token `--status-pulled #A78BFA`, outside WUBRG, D-013). A number inside shows how many copies are pulled, only when the row has 2+ copies (Q4). No text; deck names on hover/focus (tabindex 0). |
| 7 | Top of modal | Amber text in the footer ("Saving that is coming soon…") | A **warnings bar** under the title: no close button; each line clears when resolved. Shows 2 lines plus "Show N more". Lines: needs-source (blocks), pulled-copy notices (info), duplicate name (warn only). |
| 8 | Footer, beside the buttons | none | **"N need attention" chip** (amber, same chip metrics as "All"), only when N > 0. Counts rows, not warnings. Click filters the list to those rows; click again clears. Replaces the amber footer text. |
| 9 | Modal size | `min(46rem, 100dvh − 4rem)` | Height 90% of the screen on tall screens; on laptops (≤ 800px tall) `100% − 4rem`, so a margin stays. Width stays 768px. The list is what scrolls. |
| 10 | Every pop-up overlay | black 50% + light blur | Darker: black 72% + 8px blur, set once in the shared dialog overlay. |
| 11 | Name field | none | A line in the warnings bar when a deck with this name exists. Warns only. Clears on rename. |
| 12 | Expanded copy line / result | Result screen exists | Edit rules per copy: **New copy** = origin, type, language, finish, condition (as today). **From collection** = source only; a pulled copy keeps its Original/Proxy status. **Unowned** = finish (language held back). **Result screen** lists spare copies used, cards moved out of each deck ("that deck is now short N") and new copies added. No undo. |
| 13 | Import button | white text | Dark text `#08150F`, applied to the global primary button. |

Not changed and not highlighted: Back/Cancel behaviour, sort and search, bulk bar, "make all like copy 1", per-row Original/Proxy for new copies, file errors, discard confirmation.

## 4. Behaviour
- **Default source for a collection copy:** spare if any; else the only deck holding a copy; else none (needs attention).
- **Blocking:** Import is disabled while any copy is From collection with no source. Chip and top bar say why.
- **Warnings bar:** non-dismissable, `role="status"` (not an alert, so it doesn't interrupt on every change).
- **Ignore basic lands:** basics show "Ignored basic" in Card origin and are never matched to collection copies; they are still added to the deck (Q5).
- A pulled copy keeps its Original/Proxy status. Choosing a deck as the source means that deck loses the card ("leaves {deck}" note beside it).
- Escape keeps the existing "Discard this import?" confirmation.

## 5. Data binding
| Element | Source |
|---|---|
| Rows, copies, source decks | import intent view (`docs/oracle/contracts/import-intent.*`), Gate 2 audit `2026-11-03-architect-scan-wins-audit.md` |
| Original/Proxy of existing copy | `user_copies.is_proxy` (D-001) |
| Source deck shortage after move | source deck's `deck_cards` slot becoming Unsleeved (audit) |
| Partner/Background/Companion eligibility | `docs/oracle/contracts/command-zone-roles.md` |
| Duplicate deck name | existing decks list; Developer to confirm a read exists |
| Language on Unowned | **HELD BACK** (§10.5), not built |

No field is invented. Card and deck names in the mockup are illustrative.

## 6. Accessibility
Contrast on `#1A1A1E` (computed): violet pulled mark 6.4:1; teal proxy 4.9:1; amber 8.0:1; secondary text 6.4:1; dark text on the green button 5.5:1 (white: 3.4:1, fails). D-012: every state is colour plus text or icon; the pulled mark differs from the proxy mark in shape and colour and has a screen-reader label. Chip, switch and selects are ≥ 24px tall. The switch uses `role="switch"`. Changes to the attention count are announced in a polite live region.

## 7. Before build (brief §10.13)
Test on a separate test account; verify hosted migration status and get the owner's approval before applying it. Not a design matter and not done here.

## 8. Open questions
Q4 and Q5 above, pending owner. See the report.
