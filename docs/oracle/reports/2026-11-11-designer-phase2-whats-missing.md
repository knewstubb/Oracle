# Report: designer-phase2-whats-missing
Role: Designer
Status: DONE
Task as received: Gate 3 design for Phase 2 ONLY of the approved brief docs/oracle/briefs/daily-use-deck-advisor.md (the deck 'what's missing' view: plain-language verdict on top, counts below, each target with a short reason including the typical number and its source; honest fallback when role data is thin; generic role tags until a strategy is agreed; each gap clickable leading to owned cards (spare, then another deck with warning, then buy ideas with labelled estimated prices, unknown price never zero); if nothing owned fits say so then suggest buys; chat answers the same question; build on the existing health strip and chat; works on phone and laptop; use docs/oracle/vocabulary.md vocabulary). Deliver one HTML mockup at docs/oracle/mockups/, a short spec at docs/oracle/specs/, and this report. Questions for the owner are about behaviour with an example, max three options, recommendation first. Do not touch app code, decisions.md or status.md.

## Summary for the owner
The deck's bottom strip now has a single **Deck health** button next to the role counts (for example "Removal 3/8"). It opens a panel with, from the top: a Strategy row, the verdict card (with **Chat about this**), then the counts, each with its reason and source. Tapping a gap shows owned cards that fill it (spare first, then in another deck with a warning), then buy ideas with estimated prices. Wording is shorter throughout and no longer repeats the commander or its colours. One question remains, about where the deck strategy is set.

## Changed files
- docs/oracle/mockups/whats-missing.html — one page with eight scenarios (healthy, gaps overview, spare, only-in-another-deck, nothing owned with buy ideas, thin data, chat, checking/error) and a Laptop/Phone switch
- docs/oracle/specs/whats-missing.md — the spec (file names kept; view named Deck health)
- docs/oracle/reports/2026-11-11-designer-phase2-whats-missing.md — this report

No app code, decisions.md or status.md touched. Note: `docs/oracle/vocabulary.md` does not exist; the vocabulary used is `docs/oracle/specs/vocabulary.md`.

## New decisions made (need owner confirmation)
1. **Where it lives:** the existing health strip gets a verdict chip; the panel is a right drawer on laptop and a bottom sheet on phone. No new tab.
2. **Pills limited to Ramp, Draw, Removal, Wipes** until a strategy is agreed (brief 17.2). The other five health pills are hidden for now.
3. **No red for gaps.** Light is amber with a warning icon and the word "Light"; on track is a quiet tick. Red stays for "Couldn't check". This is how the all-red result goes away.
4. **New words:** Spare, Light, On track, General guide, Buy ideas. The vocabulary spec has no "Spare" row; the brief and Architect use it. Existing words kept: Available, Unavailable · In [deck], Unowned, est., Price unknown.
5. **View name: Deck health** (owner decision 2026-11-11, matches the existing health strip; replaces the brief's "What's missing" and the interim "Deck gaps", and cannot clash with the Phase 3 Missing location).
6. **The old pill click** (jump to Cards tab) is kept as a link inside each gap.
7. **Owned cards only count when legal for the deck:** same colour identity, proxies and planned slots not counted.
8. **Phase 2 is suggest-only:** no add or move button in the panel (D-007, D-034).
9. **Thin-data buy ideas:** none shown (owner decision).
10. **A role counts as "Light"** when 2 or more short (owner decision).
11. **Single Deck health button** in the strip (amber with a warning icon when any role is light, a tick otherwise); the verdict text sits at the top of the panel's verdict card. No "+1 more".
12. **Chat about this** moved into the verdict card; the bottom footer is removed.
13. **Shorter text:** no commander name or colours in reasons, hints or warnings ("Average is 8; you have 3", with "Based on N EDHREC cards" smaller on the line below; Chat about this button made smaller). "Nothing moves until you decide." removed; "Using it here leaves X one short." later removed too (owner: obvious): other-deck cards show only an amber warning marker with the deck name, e.g. "In Wilhelt". Also cut: "Each is in a different deck.", the buy footer "Prices are Scryfall estimates.", and the Well covered sub-line.
14. **Strategy row** at the top of the panel, shown as a Phase 4 placeholder (spec section 5.7).
15. **Wording variant to confirm:** for decks with commander data the Strategy row reads "Not set yet, using typical numbers", and "Not set yet, using the general guide" only on thin data. Reason: the targets for a commander with EDHREC data are not the general guide, so the owner's wording would be untrue there. Say if you want the general-guide wording everywhere.

## Assumptions
- The Architect sets the "thin" threshold (how few classified EDHREC cards count as thin); the mockup uses 9 as an example. Real numbers in the mockup are invented sample data.
- A card can count in several roles; the deck total stays 100 (brief section 9).
- Cache of role targets per commander exists (audit 15a); it is not a contract yet.
- Card names used as examples are sample data and not checked against the owner's collection.

## Challenges to locked decisions
- none. Reminder for Gene: D-028 (Missing removed) is reversed for the system location only; this view no longer uses the word "Missing".

## Decisions (owner answers, 2026-11-11)
1. **Light at 2 or more short.** Typical 8 and you have 7 reads On track; 6 reads Light, 2 short.
2. **Buy ideas** are collapsed with a count when owned options exist, and open by themselves when nothing owned fits.
3. **Thin data shows no buy ideas**, with a plain sentence saying why.
4. **The view is named Deck health** (reverses the interim "Deck gaps").
5. Layout changes from the owner review: shorter text, one Deck health button, Chat about this in the top card, no "Nothing moves until you decide" line, Strategy row placeholder.

## Open questions
1. **Where is the deck strategy set?** Spec section 5.7 shows a placeholder Strategy row at the top of Deck health, reading "Not set yet, using the general guide" with a greyed "Set strategy" marked Phase 4. Example: once you confirm "Make lots of zombies and sacrifice them", the row shows that sentence, and Removal and Draw targets switch to this deck's own tags.
   - **Recommended A:** strategy is set from inside Deck health. The row opens the editor in Phase 4; the existing Strategy tab is folded in or retired then. One place to look, and it sits next to the numbers it changes.
   - B: strategy stays only on the existing Strategy tab; Deck health shows a read-only line linking to it. Smallest change, but the strategy is separate from the numbers it drives.
   - C: both places can edit it. Convenient, but two editors for one sentence can disagree.
2. **How are estimated prices labelled?** Currently each price reads like "$4.20 est." with a small "est.", and there is no footer line. Example: Rhystic Study shows "$38.00 est."; a card with no price shows "Price unknown".
   - **Recommended A:** small "est." suffix on each price, no footer. Labelled where you read it, no extra line.
   - B: bring back the footer "Prices are Scryfall estimates." under the buy ideas. Explains the source, but adds a sentence.
   - C: no label at all. Cleanest, but an estimate could be read as a fixed price.

Also changed: card thumbnails on every suggested row now stretch exactly from the top of the card name to the bottom of the status pill.

## Dependencies for the Architect (before Gate 4)
- A per-commander role-target contract: role, typical number, number of EDHREC cards used, source label, and the thin threshold.
- A per-card role result for suggested cards so the pill count and the cards listed agree.
- A colour-identity filter on the spare and buy lists.
- Health route does not filter by user (audit area 3); fix before any multi-user work.

## Verification
- Opened the mockup in Chrome via Playwright and clicked through all eight scenarios in laptop and phone layouts after this round (a script error was found and fixed along the way), then re-ran: no script errors. Screenshots reviewed for overview (laptop and phone) and only-in-another-deck (laptop); the other scenarios ran without errors but were not looked at.
- Contrast ratios computed from the real tokens — all text pairs 4.5:1 or better; magenta used for icon and border only.
- Not tested: real devices, screen reader, the app (nothing built).
