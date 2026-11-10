# Report: t29-reconcile-original-shortages
Role: Designer
Status: DONE
Task as received: Task T-29: Write a spec and HTML mockup that turn the existing Reconcile page (src/app/reconcile/page.tsx, src/components/reconcile/OverusedCardRow.tsx) into the original-copy shortage view defined by D-027, D-029, D-032 and D-037 in docs/oracle/decisions.md, saving them to docs/oracle/specs/ and docs/oracle/mockups/.
Done when: the spec and mockup show originals owned, proxies sleeved, affected decks and originals still needed (including cards with no original owned), use the D-025 vocabulary, and list every interaction choice for owner approval.
For Brad (plain words): Design how the Reconcile page should show cards you are short of originals for, including ones you only have as proxies, so you can approve it before it is built.

## Summary for the owner
The redesigned Reconcile page lists every card you need more originals of. For example, Sol Ring shows "2 more originals needed", with "Needed in decks 3 · Originals owned 1 · Proxies sleeved 2", and each deck marked Original, Proxy or Unsleeved. Cards you have only as proxies, such as Mana Crypt, now appear with a "No original owned" tag. Open the mockup in a browser and approve or change the 11 choices listed at the bottom (I-1 to I-11). The main ones are whether rows should only inform you (recommended) or offer a "Swap in original" button, and whether any printing of a card counts as an original (recommended: yes).

## Changed files
- docs/oracle/specs/reconcile-original-shortages.md — the spec (problem, principles, counting rules, components, states, interactions, data needs, copy, accessibility, choices).
- docs/oracle/mockups/reconcile-original-shortages.html — self-contained clickable mockup with state switcher and toggles for choices I-1, I-3 and I-6.
- docs/oracle/reports/2026-10-10-designer-t29-reconcile-original-shortages.md — this report.

## New decisions made (need owner confirmation)
- I-1 Rows only inform (deck links, plus a note "1 original in storage could replace a proxy"); no Swap or Buy action in this version.
- I-2 Deck links open in the same tab; filters, search and sort are kept on Back.
- I-3 Choosing a deck shows every short card that deck uses, with that deck's row marked "This deck".
- I-4 Default sort: most originals needed; also Most proxies sleeved and A–Z.
- I-5 Sidebar filter "No original owned".
- I-6 No copy-by-copy detail (printing, finish, location) in this version.
- I-7 Keep the page name "Reconcile".
- I-8 Search by card name.
- I-9 Any original printing counts as supply (D-037 asks for this to be confirmed at T-29 review).
- I-10 One totals line at the top: "8 more originals needed · 6 cards · 8 proxies sleeved · 2 with no original owned".
- I-11 Spare proxies in storage shown as a small note and never counted as sleeved.
- Cards with proxies but no original are labelled "No original owned", not "Unowned". Under D-025, Unowned means no original and no proxy.
- "Active / Brew" labels are removed from deck rows (D-029). The dashed "Also wanted by" chip is removed (D-015).
- Proxy chip uses a neutral label with a proxy-coloured border and icon, because proxy-coloured text on its tint is 3.86:1, which fails AA.
- Deck subtitles in the sidebar become "{n} proxies sleeved".

## Assumptions
- No T-28 contract file exists in any branch. status.md says D-027/D-037 supply the rules for this scope, so data binding cites the current `OveruseResult` and lists the new fields T-37 must add (spec §8). This was not treated as BLOCKED.
- "Originals in storage" means originals not sleeved in any main-deck slot.
- Copies formerly marked Missing count as owned originals (D-028 transition answer). Today's query excludes them [Confirmed: src/lib/reconcile-overuse.ts `.eq('missing', false)`].

## Challenges to locked decisions
- D-013: the existing proxy token #4A93A0 sits close to mana blue #6BA5C4 [Confirmed: src/styles/tokens.css]. The label and icon carry the meaning, so I did not change it here. Suggest it is reviewed in the shared status-presentation work.

## Open questions
- Architect: how T-37 gets `oracle_id` for deck slots. `deck_cards` has only `scryfall_id` and `card_name` [Confirmed: src/types/supabase.ts], and today's grouping is by card name, which does not follow D-003.
- Architect/Developer: which signal says a slot holds a proxy: `deck_cards.ownership_status` (used today) or `copy_id → user_copies.is_proxy`?
- The owner's answers to I-1 to I-11.

## Verification
- Headless Chrome (playwright-core) run of the mockup: no page errors. The six sample cards and their totals match the spec's worked examples (8 needed, 8 proxies sleeved, 2 with no original). The "No original owned", deck (I-3 a/b), search, Esc-to-clear and sort controls filter correctly. I-1 b shows one Swap button (Arcane Signet). I-6 expander works.
- Screenshots reviewed at 1360px and 390px wide, in the loaded, loading, refresh-failed and other states. I fixed mobile horizontal overflow, the facts layout, a cropped banner icon and a duplicated subtitle.
- Contrast ratios computed for every colour pair used (spec §10).
