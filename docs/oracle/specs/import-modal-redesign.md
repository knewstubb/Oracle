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

Also answered: ignored basics still go into the deck as ordinary basics.

## 3. What changes (numbers match the mockup tags; owner review 2026-11-04 applied)
| # | Where | Today | Change |
|---|---|---|---|
| 1 | Header | Commander select shares row 1 with Name and Format | Row 1 is Name + Format. **Commander gets its own row below it.** |
| 2 | Commander row | Second-slot select appears once a commander is chosen; Companion always shown | Partner / Background and Companion sit **next to the commander field**, only when they apply (Companion only when the file has one). The commander takes the full width when none applies. |
| 3 | "Importing as" bar | Ignore-basics control lives elsewhere | A switch in the bar, on by default. **On: basic lands are never taken from other decks. They need no source and raise no warning; the deck just gets ordinary basics.** Off: basics behave like any card and, if held by other decks, need a source. Line beside the switch states which applies. |
| 4 | "Importing as" bar | Defaults apply to all copies not set by hand | Apply to **new copies only**; note under Change. Rows using an existing copy show no finish, condition or language. |
| 5 | Row needing a source | Amber footer text blocks Import for copies in other decks ("coming soon") | Only the "needs a source" behaviour. A row with a copy that has no source shows the existing small pill in the existing amber, and its copy line shows "Choose source". In the expanded row, a **Source** select on each From-collection copy: "Choose source" (first, to clear it), "Spare copy (not in a deck)", "Take from {deck}". A spare copy is preselected where one exists. Import stays disabled until every copy has a source; the existing amber footer text says how many cards need one. |
| 9 | Modal size | `min(46rem, 100dvh − 4rem)` | 90% of screen height on tall screens; `100% − 4rem` on laptops (margin kept). Width stays 768px. |
| 10 | Every pop-up overlay | black 50% + light blur | Black 72% + 8px blur, once in the shared dialog overlay. |
| 11 | Name field | none | Amber one-line note under the field when a deck with this name exists. Warns only. |
| 12 | Expanded copy line / result | Result screen exists | Per-copy edit rules: **New copy** = everything (as today); **From collection** = source (and Original/Proxy of the pulled copy is kept); **Unowned** = finish (language held back). **Result screen** uses the existing list-box look: "Used spare copies", "Taken from other decks" (with "now short N"), "New copies added". No undo. |
| 13 | Import button | white text | Dark text `#08150F`, in the global primary button component. |

**Removed after owner review (do not build):** the violet pulled-from-deck icon and its number, the top warnings bar, the "N need attention" chip, the new `--status-pulled` colour, and any extra banners. No new colours or patterns are introduced. (Numbers 6, 7 and 8 are intentionally unused so the owner's numbering stays stable.)

Not changed: Back/Cancel behaviour, sort and search, bulk bar, "make all like copy 1", Original/Proxy for new copies, file errors, discard confirmation.

## 4. Behaviour
- **Default source for a collection copy:** spare if any; else the only deck holding a copy; else none ("Choose source").
- **Un-set:** choosing "Choose source" in the dropdown clears the copy's source. The row is flagged again and Import is disabled.
- **Blocking:** Import is disabled while any copy is From collection with no source. A duplicate name never blocks.
- **Ignore basic lands on:** basics show as New copy (ordinary basics), need no source, never reduce another deck. **Off:** basics held by other decks need a source like any card.
- A pulled copy keeps its Original/Proxy status.
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
Contrast on `#1A1A1E` (computed): teal proxy 4.9:1; amber 8.0:1; secondary text 6.4:1; dark text on the green button 5.5:1 (white: 3.4:1, fails). D-012: the needs-source flag is amber plus the words "Needs a source". Chip, switch and selects are ≥ 24px tall. The switch uses `role="switch"`. The footer message is in a polite live region.

## 7. Before build (brief §10.13)
Test on a separate test account; verify hosted migration status and get the owner's approval before applying it. Not a design matter and not done here.

## 8. Open questions
None. Q4 is moot (icon removed); Q5 answered (ignored basics go into the deck as ordinary basics).
