# Report: import-intent
Role: Designer
Status: DONE
Task as received: Design task (no code). Repo /Users/bradknewstubb/Developer/Personal/oracle_app, branch test-t56-local. Follow docs/oracle/process.md. First read docs/oracle/reports/2026-10-22-designer-import-scenarios.md (your earlier review), docs/oracle/reports/2026-10-22-architect-import-history-audit.md, docs/oracle/briefs/import-cleanup.md, specs/import-row-editing.md, import-stage-screens.md, import-review-controls.md, deck-basics-and-printings.md, and the current UI in src/components/manabox-import/*. Then create docs/oracle/specs/import-intent.md, docs/oracle/mockups/import-intent.html, and report docs/oracle/reports/2026-10-23-designer-import-intent.md. Supersede the question-first idea in the earlier report where it differs. Do not edit decisions.md; no DB writes.
OWNER DECISIONS:
- Applies to a deck import via ANY method (file, pasted text, link, precon). The choice only sets starting defaults; every card stays editable. Three choices, names exactly: 'I bought it', 'I built it', 'I'm planning it', each with a short description beneath. Wording rule: 'I built it' must NOT say it adds nothing; it just adds nothing by default.
- I bought it: new deck; every card defaults to Add to collection (ticked), original, sleeved into the deck.
- I built it: built from cards the owner owns (or plans to buy). Cards already in the collection default to sleeved from the collection (show 'In collection · N free'); nothing added by default (Add to collection unticked). A card not owned must stay unsleeved and be impossible to sleeve (owner rule).
- I'm planning it: theorycrafted. Nothing added, nothing sleeved, everything unsleeved. Basic lands, including generic basics, default UNSLEEVED here.
- New per-card control: 'Add to collection' tick (ticked by default only for I bought it). Show how it interacts with Original/Proxy/Unsleeved, the per-copy editor, bulk bar, a 'From collection' option, and unowned cards. Unowned and not added = unowned/unsleeved.
- Partly-new, partly-owned decks are handled by choosing 'I bought it' or 'I built it' and changing per-card ticks, not by a fourth choice.
- Collection-only imports (adding cards) are unchanged; all owned.
Cover: where the choice appears (before the file picker vs on the review screen) for link/text/file/precon; the review header summary of what will happen ('12 added to collection, 40 sleeved from collection, 3 unowned'); count wording; edge cases (card owned but all copies are in other decks; owned in a different printing than the deck lists). Owner questions: behaviour terms only, max 3 options each, recommendation first, with an example. Owner is a designer who doesn't read code; put code and paths only in the report appendix.

## Summary for the owner
Every deck import now starts with "What's this deck?": **I bought it**, **I built it** or **I'm planning it**. Your answer sets where each card starts. On the review, each card gets an **Add to collection** tick and a fourth choice, **From collection**, and a summary line above the list reads, for example, "Nothing added to your collection · 52 sleeved from your collection · 32 unowned". A card you don't own can't be sleeved unless you tick Add. Before anything is built I need four answers (below). The changes also conflict with two locked rules (that the import never sleeves cards you already own); Gene should reword them once you approve.

**Files to open:** the spec is `docs/oracle/specs/import-intent.md` and the clickable mockup is `docs/oracle/mockups/import-intent.html`.

## Questions for you
**Q1. Where does "What's this deck?" appear?**
- **(Recommended) a) First screen, above the Link / Paste / File / Precon tabs, with nothing pre-selected; repeated on the review so you can switch.**
  - Example: you drop a file before choosing. The file waits with "Choose what this deck is above to continue". On the review you switch to I built it, and every card you haven't touched updates.
  - You always make a deliberate choice before 100 cards are set up.
- b) Review screen only, starting on I'm planning it (the safe one: nothing added).
  - One less step, but a precon would need a click on the review to switch to I bought it.
- c) First screen only, fixed once chosen. Simpler, but changing your mind means starting again.

**Q2. You own the card, but in a different printing than the deck lists (I built it).**
- **(Recommended) a) Sleeve your other printing, marked "Other printing".**
  - Example: the deck lists Command Tower CLB 351; you own CMM 410 and it's free. It starts From collection with "Your copy: CMM 410", and the deck shows your real printing.
  - A built deck holds the copy you actually used.
- b) Leave it unsleeved; the deck shows "Alt available" and you sleeve it later. Stricter, but more clicks after import.

**Q3. Your only free copy is a proxy (I built it).**
- **(Recommended) a) Sleeve the proxy, marked ◆ Proxy.** Example: your free Professional Face-Breaker is a printed proxy, so the deck shows it as a proxy.
- b) Leave it unsleeved; the deck shows "Proxy available".

**Q4. You own the card, but every copy is sleeved in other decks (I built it).**
- **(Recommended) a) Leave it unsleeved; the deck shows "Unavailable · In Korvold". Move it later from the deck page.**
  - Example: your only Sol Ring is in Korvold. The import never takes it out of Korvold.
- b) Offer "Move from Korvold" in the import's copy picker. It's faster, but an import could quietly empty another deck.

## Changed files
- docs/oracle/specs/import-intent.md: the spec (new)
- docs/oracle/mockups/import-intent.html: interactive mockup with the first screen, the review (edge-case rows, bulk bar, live summary), the result screen and a combination table (new)
- docs/oracle/reports/2026-10-23-designer-import-intent.md: this report (new)

## New decisions made (need owner confirmation)
- **N1. One question for all four deck sources.** It sits above the source tabs, nothing is pre-selected, and Continue is held until you answer. On the review it shows as a "Starting point" control, and changing it re-applies defaults only to copies you haven't edited (spec §5).
- **N2. Descriptions** (spec §14):
  - "New to you, like a precon. Every card starts added to your collection and sleeved."
  - "Put together from cards you own. Your copies start sleeved from your collection; tick Add to collection for anything new."
  - "A list to try out. Every card starts unsleeved, and nothing is added."
- **N3. Four-way choice per copy:** Original · Proxy · From collection · Unsleeved, plus the Add tick. The two keep each other valid (spec §7.2):
  - choosing Original or Proxy ticks Add;
  - choosing From collection unticks it;
  - unticking Add on Original or Proxy switches to From collection if a copy is free, otherwise to Unsleeved;
  - ticking Add on From collection switches to Original.
- **N4. "Added, not sleeved" is allowed** (Add ticked + Unsleeved). The new copy is always an original. A free proxy added without sleeving isn't offered.
- **N5. The Add tick has its own column** on the right, headed "Add to collection", so it's never confused with the left-hand selection checkbox. It shows mixed (–) when copies differ. Generic basic lines show a dash instead of a tick.
- **N6. Free copies are shared across the import** in import order. From collection picks, in this order:
  1. the exact printing (matching finish where possible);
  2. another printing;
  3. a proxy.
- **N7. From collection never takes a copy from another deck.** When it can't be used, the reason shows as visible text.
- **N8. Summary line counts.**
  - It counts cards and always adds up to the total.
  - Order: added · sleeved from your collection · added, not sleeved · unsleeved · unowned · generic basics.
  - Zeros are hidden, but the line opens with "Nothing added to your collection" when that's true.
- **N9. Ownership hint** per row: "Not in collection" / "In collection · N free" (plus "· other printing" or "1 free proxy"). It shows what you owned before the import and doesn't change as you edit.
- **N10. New "Unowned" filter chip** on the review (All · Proxies · Unsleeved · Unowned · Basics).
- **N11. Copies sleeved elsewhere before saving.** If a chosen copy is sleeved somewhere else before you save, it's saved as Unsleeved and listed on the result under "Needs a look".
- **N12. Ownership fails to load.** I built it falls back to "Unsleeved" for untouched cards and shows a retry line. Nothing is sleeved from a guess.
- **N13. The old link chooser is retired.** The link chooser ("These are new cards / I have this deck built / This is theorycrafted") goes. Links feed the same review screen.

**Superseded from my 22 October report**
- The "What are you doing?" question, its "Adding cards" and "Start fresh" answers, and the "All new / Some I own / Just the list" sub-choices.
- The "New original / New proxy" labels.
- The post-import "Sleeve the 12 free cards now?" step (the cleanup brief's Q1 option a).
- Kept: From collection, the "In collection" hint, consequence lines, one review screen for every source.

## Assumptions
- "Free" means not sleeved in any deck. Copies in a binder or box count as free.
- The owner's decision "I built it: cards in the collection default to sleeved from the collection" covers other printings and proxies only if the owner answers Q2 and Q3 with (a). If not, those start Unsleeved.
- The Precon tab stays broken until a precon list exists (cleanup brief). The question is designed for it anyway.
- Archidekt maybeboard handling for links is unchanged by this spec (cleanup brief question on D-018).
- Collection import gets no question and no tick column.

## Challenges to locked decisions
- **D-020** ("Import does not run an automatic allocation pass").
  - The owner decision makes I built it sleeve owned copies by default at import.
  - Suggested rewording: "Import never sleeves a copy you didn't see. I built it pre-selects From collection per card on the review; nothing is sleeved until you press Import deck, and nothing is taken from another deck."
- **D-047** ("default Original"; "Existing owned copies are never pulled in automatically").
  - Both are replaced: the default now depends on the starting point, and From collection pulls in owned copies as a visible, per-card choice. The "Add to collection" tick is new.
  - Suggested change: supersede D-047 with this spec's model table (spec §3).
- **D-045** ("Original or Proxy ... defaulting to Original"). Still true for collection import. For deck import, the default is set by the starting point. Suggested change: scope "defaulting to Original" to collection import.
- **D-021** ("exact printing when possible"). Consistent if Q2 = a, because the exact printing is tried first. Mention "Other printing" as the visible fallback.
- **D-048** (generic-basics switch on by default). Already superseded by the basics spec. This spec adds that generic basics start Unsleeved under I'm planning it.
- **D-031.** Already flagged by the Architect as superseded; this spec is its replacement for the deck-level question.
- **Cleanup brief.**
  - Q1 is effectively answered by the owner's decisions (a per-card choice at import, the brief's option b).
  - Slice 5 should become "ownership facts on the review plus From collection" rather than a result-screen Sleeve step.
  - Slice 6 still applies.

## Open questions
- Q1–Q4 above (owner).
- **For the Architect: data needs.** The ownership facts per card and the per-copy save fields (appendix).
- **For the Developer: re-applying defaults.** Re-applying the starting point must not move a free copy that the owner manually assigned. Touched copies are allocated first (as the mockup does).

## Verification
- Read AGENTS.md, the base and project designer role files, process.md, the two 22 Oct reports, the cleanup brief, the four named specs, decisions D-012/D-014/D-015/D-020/D-021/D-025/D-026/D-043/D-045/D-047/D-048/D-050/D-053, and the import UI components. Read only.
- Ran the mockup in Chrome via a scripted check (not saved in the repo). Results:
  - The three starting points give the expected summaries for the 29-card sample:
    - built: "Nothing added · 8 sleeved from your collection · 4 unsleeved · 2 unowned · 15 generic basics";
    - bought: "14 added · 15 generic basics";
    - planning: "Nothing added · 12 unsleeved · 2 unowned · 15 generic basics, unsleeved".
  - The Continue-without-choice error shows.
  - Bulk From collection reports "Applied to 8 of 14 copies. 6 have no free copy…".
  - No page errors.
- Contrast computed against #1A1A1E and #212126: magenta #F0339E 4.69 / 4.33 (so icon and border only), grey #9C9CA3 6.36, blue #4A93A0 4.93, green #1D9E75 5.12.
- No code changed, no database touched, decisions.md not edited.

---

## Revision 2 (23 October, owner decisions)

**Summary:** the intent is now picked once on the first screen. "From collection" and the "N free" hints are gone. Import now moves cards out of other decks, and the review is simpler: an Add tick plus Original / Proxy / Unsleeved.

### What changed
- **Review screen:** no intent switcher, just "Importing as: …" with "start again to change". Summary moved below the list.
- **Per card:** only the Add to collection tick and Original / Proxy / Unsleeved. Owned copies are matched automatically. A card you don't own can't be sleeved until Add is ticked.
- **Card only in another deck (e.g. Sol Ring in Korvold):** import moves it. An inline note shows the deck(s) it's in and asks which deck is missing it, with a Skip button. Skip adds a new sleeved copy and puts an "Accounting error" alert on that card in the other deck's decklist (small mockup included).
- **Owned in a different printing:** inline choice "Use my CMM 410" or "Add this printing"; can't be sleeved until chosen.
- **Only free copy is a proxy:** the proxy is sleeved. **Basics** default unsleeved under I'm planning it.
- **Precon:** pick from a list, same review, preset to I bought it, all new originals in exact printings.

### Rule table
| Situation | Add ticked | Add unticked |
|---|---|---|
| I bought it, any card | New original (or proxy if chosen), sleeved | n/a, starts ticked |
| I built it, you own a free copy | Adds a new one, your copy stays free | Your copy sleeved automatically |
| I built it, only free copy is a proxy | Adds new | The proxy is sleeved |
| Only copy is in another deck | Adds new, other deck untouched | Copy moves here; you confirm the deck, or Skip (adds new + alert on the other deck) |
| Owned in another printing | "Add this printing" | "Use my printing"; blocked until chosen |
| Not owned | Adds new, can be sleeved | Unsleeved, shown Unowned |
| I'm planning it | Nothing added, nothing sleeved; shown Owned or Unowned | same |

### Owner questions
1. **If a card is in two or more decks (Ancient Tomb in Korvold and Breya), should you have to pick the deck before importing?**
   - **A (recommended): yes.** The card shows "Needs a choice" and the footer counts it, but Import still works; unchosen cards stay unsleeved. You'd see the moved card always named.
   - B: no, we pick the most recently built deck and say so. Faster, but a wrong guess silently breaks a deck.
   - C: yes and Import is blocked until all are chosen. Safest, but slower on big lists.
2. **When a move is skipped, how long should the alert on the other deck's decklist stay?**
   - **A (recommended): until you dismiss it** on that card ("Fixed").
   - B: until the deck is next edited.
   - C: until the card is removed from that deck.
3. **With one deck holding the card, should the move be pre-selected (one click less) or require a deliberate confirm?**
   - **A (recommended): pre-selected**, with Skip beside it. You confirm by importing.
   - B: not pre-selected; counted as "needs a choice".
   - C: pre-selected but the summary line calls out every move in colour.

### Not built or checked
Mockup only. Moving copies, skipped-move records, deck alerts and the precon list need Architect support (BLOCKED until contracts exist). The sample precon names are placeholders. In the mockup, Import is not blocked by unresolved choices (recommendation 1A). Decisions.md not edited.

---

## Revision 3 (23 October, owner answers and wording pass)

**Summary:** the owner's three answers are applied, headings now carry the intent, and most explanatory text is cut. The spec is rewritten as one current version (rev 3).

### Answers applied
1. Cards in other decks: same UI for one deck or several; the owner picks the deck. One deck is pre-selected; several need a pick.
2. A skipped-move alert stays until fixed or dismissed (**Fixed** and **Dismiss** shown on the decklist alert).
3. Single-deck move is pre-selected.

### What changed
- Heading is **Import purchased deck / Import built deck / Import planned deck**, on the first screen once chosen and on review. "Import deck" before choosing.
- Move callout is now just **"{Card}: copy will be moved from [Korvold | Skip]"** (several decks: **[Korvold | Yuriko | Skip]**). Skip explains itself in a tooltip.
- Printing callout: "{Card}: you own it as CMM 410; this deck lists CLB 351. It can't be sleeved until you choose." with **Use my CMM 410** and **Add this printing**.
- Spec: replaced with one current version; no "From collection", hints or top-of-review summary remain.

### Texts cut
- "This sets where each card starts. You can change any card before importing. It can't be changed on the next screen; to change it, start again." (removed)
- All three intent descriptions ("Put together from cards you own…" etc.) and the "Importing as: … To change this, start the import again" line. **Proposal: no description on the choice cards**; the names and the heading suffice.
- The long move text, the "If you skip…" sentence, and the printing-choice lines "Choose a printing (above)…", "No free copy to sleeve: tick Add…". Card state is shown by tags and a disabled-button tooltip instead.
- Copy-line consequence sentences ("Added to your collection and sleeved here", "Your owned copy is matched automatically…", etc.) are now two or three words ("Owned copy", "Owned proxy", "Moves from Korvold", "Not sleeved").
- "Applies to cards you add" beside the import defaults; "Link imports open the same review as files"; the precon explainer; the result-screen footnotes ("Needs a look", commander note); the long alert text on the decklist mock; "Clear the filter or search"; "Choose what this deck is to continue" (now "Choose one to continue."); page notes on the mockup trimmed to one line each; reference table cells shortened.

### Open points
- **Update (owner, same day):** each intent card gets a one-line description, using the owner's wording: "Adds every card to your collection and sleeves it." / "Uses cards you own. Add any new ones as you go." / "Just a list. Nothing is added or sleeved." This replaces the "no description" proposal below; mockup and spec updated. Everything else in rev 3 is approved.
- (Superseded) Please confirm no description on the intent cards.
- Several decks with none picked: the card stays unsleeved and counts as "needs a choice"; Import still works.
- Mockup only; Architect contracts for moves, skipped-move records, alerts and the precon list remain BLOCKED. Decisions.md not edited.

---

## Appendix (for agents): code references and data fields

**Current behaviour cited**
- Deck copy choice is Original / Proxy / Unsleeved, and collection is Original / Proxy [Confirmed: src/components/manabox-import/ImportRowEditor.tsx `TYPE_STYLE`, `typeOptions`].
- Type union [Confirmed: docs/oracle/contracts/import-row-editing.types.ts `ImportCopyType = 'original' | 'proxy' | 'unsleeved'`].
- Field visibility per type [Confirmed: src/lib/import-copies.ts `visibleFields`].
- Bulk bar with applied/skipped note [Confirmed: src/components/manabox-import/ImportCardList.tsx ~L381–449].
- Filter chips: all/proxy/unsleeved/basic [Confirmed: src/components/manabox-import/types.ts `RowFilter`].
- No ownership field on review rows [Confirmed: types.ts `UiPreviewRow = ImportRow`].
- Review header holds name, format and commander [Confirmed: DeckImportOptions.tsx, ManaBoxDeckImportFlow.tsx ~L372–415].
- Old link chooser `new_cards` / `built` / `theorycrafted` [Confirmed: src/components/DeckImportButton.tsx ~L380–425].
- Precon tab fetches a non-existent `/api/precons` [per architect audit; DeckImportButton.tsx ~L148–158].
- Tokens [Confirmed: src/styles/tokens.css `--status-unowned #F0339E`, `--status-proxy #4A93A0`, `--accent-primary #1D9E75`].

**Data the Architect needs to provide (BLOCKS build, not design)**

Preview, per row:
- `ownership: { owned: number, free: number, elsewhere: { deckId, deckName, count }[], freeCopies: { copyId, scryfallId, setCode, collectorNumber, finish, condition, language, isProxy, match: 'exact'|'other_printing'|'proxy' }[] }`, keyed by oracle_id.
- `freeCopies` must exclude copies sleeved in any deck.
- The existing rollup RPC and `/api/decks/[id]/allocate` logic are candidate sources (architect audit §5).

Commit, per copy, extend `ImportCopyOwnerEdits` / the commit body:
- `addToCollection: boolean`
- `type: 'original'|'proxy'|'unsleeved'|'collection'` (or keep type and add `source: 'new'|'collection'|'none'`; Architect's call)
- `collectionCopyId?: string`

Save rules:
- The save step re-checks that each `collectionCopyId` is still free, in the same transaction as the sleeve.
- A copy that isn't free falls back to unsleeved and is counted in `summary.noLongerFree`.

Summary, extend the deck summary with:
- `addedSleeved`, `addedProxies`, `addedUnsleeved`, `sleevedFromCollection`, `unsleevedOwned`, `unowned`, `genericSleeved`, `genericUnsleeved`, `noLongerFree`.
- Today's summary has `inserted`, `proxies`, `unsleeved`, `basics` only [Confirmed: types.ts `ImportStep` done].

Client state:
- `ImportStep.review` gains `intent: 'bought'|'built'|'planning'`.
- Defaults re-application reuses the "owner-touched" rule already used by the defaults bar (owner edits in `copyEdits`).

**Mockup implementation notes**
- Allocation order in the mockup: clear untouched picks, then walk rows in import order and give untouched copies the first unused free copy in the order exact → other → proxy.
- Touched copies keep their picks.
- Generic rows use the existing Sleeved/Unsleeved line model (`deck-basics-and-printings.md`).
