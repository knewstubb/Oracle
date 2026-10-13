# Report: t54-manabox-import-spec
Role: Designer
Status: DONE
Task as received: "Task T-54: Write the spec (docs/oracle/specs/manabox-import.md) and an HTML mockup (docs/oracle/mockups/) for the collection and deck import screens, per decisions D-044 to D-049, the T-54 line in docs/oracle/status.md, the locked vocabulary in docs/oracle/specs/vocabulary.md, and the sample files in docs/oracle/samples/manabox/. Done when: the mockup shows choosing a CSV or text file, deck format, per-card Original/Proxy (default Original), add-to-collection choice (default on), basics-to-generic switch (default on), skipped tokens and unmatched lines, and where the commander is picked after import, and your report is written. For Brad (plain words): Design the import screens for you to review before anything is built."

## Revision 5 — 2026-10-13 — Original uses the app green
Task as received (owner, verbatim): "Lets use the app green. Its the state we want a card in"

**For Brad:** A chosen Original now shows in the app's green, the same green used for "good" states, instead of mint. Proxy stays blue.

What changed:
- **Mockup:** the selected Original segment, the green check icons (bulk bar and count picker) and the Foil-example hint now use `--accent-primary` #1D9E75. The proposed mint token is dropped.
- **Spec:** rev-5 note; §2, §5.3, §9 contrast rows and the D-012 note updated; G6 reworded.
- **Contrast:** label text on the green tint is 11.1:1, the green icon on the surface 5.1:1, and the green border against its tint 4.0:1, all passing. Green and Proxy blue have similar lightness, so in greyscale the check vs mask icons and the words carry the difference (D-012 still met).
- **Needs recording (Gene):** D-053 says the mint must be clearly different from the brand green. The owner has now chosen the brand green itself, so D-053 needs amending.
- **Verification (rev 5):** JS parse check passed. Headless Chromium, no page errors; a selected Original computes to rgba(29,158,117,.18) with the green border. Colour and greyscale screenshots checked.

## Revision 4 — 2026-10-13 — Original mint, Proxy blue (D-053); Foil easier to find
Task as received: "Task T-54 revision 4: Apply new decision D-053 (main commit, owner 2026-10-13: "Proxy blue and original a mint"): keep Proxy's existing colour (--status-proxy #4A93A0, now called blue, not teal) and give the selected Original choice a mint colour clearly distinct from Proxy blue and the brand green #1D9E75, meeting contrast for text/icons; apply it to row segments, bulk bar and count picker; also make the text-file example easier to find (the owner could not see the Foil checkbox because it only shows in the 'Deck · Strixhaven.txt' example), for example by labelling that example clearly. Update the spec, any 'teal' wording for Proxy in your spec, and your report. Done when: the mockup shows mint for selected Original and blue for Proxy, the Foil checkbox is easy to find, and your report has a dated revision-4 note. For Brad (plain words): Make the Original button mint, keep Proxy blue, and make the Foil tick box easier to find in the mockup."

**For Brad:** A chosen Original now shows in mint and Proxy stays blue, so you can tell them apart at a glance. To see the Foil tick box, pick **Deck text file · Strixhaven ✦ Foil tick box** in the bar at the top of the mockup. A note under the mockup says the same.

What changed:
- **Mint:** a proposed new token `--status-original` #8FE6C1 (new decision, needs adding to the T-26 tokens, spec G6).
  - Contrast on the dark surface is 11.8:1. Label text on the mint tint is 9.6:1, and the mint border against its tint is 7.9:1.
  - It is clearly different from Proxy blue #4A93A0 (ΔE 40, and lightness 85 vs 57, so they also separate in greyscale) and from the brand green #1D9E75 (ΔE 29, much lighter).
  - `--mana-green` was not reused, because it means colour identity.
- **Where it applies:**
  - Row segments: a selected Original has a mint tint, border and check icon; a selected Proxy has a blue tint, border and mask icon. Unsleeved stays a grey outline.
  - Bulk bar: the check icon is mint and the mask icon blue.
  - Count picker: the numbers stay blue for Proxies, and a new mint "✓ Original n" shows how many copies stay Original, updating as the selected number moves.
- **Foil easier to find:** the mockup's file examples are renamed "Deck CSV · Strix draft", "Deck text file · Strixhaven ✦ Foil tick box" (the hint is in mint) and "Collection CSV · scan". The note under the mockup points to the Foil example.
- **Spec:** rev-4 note; Proxy "teal" wording replaced with blue; §2, §4, §5.3, §8 and §9 colour rows updated; G6 added.
- **Verification (rev 4):**
  - JS parse check passed.
  - Headless Chromium (Playwright 1.64), no page errors.
  - Computed styles: a selected Original is rgba(143,230,193,.16) with a #8FE6C1 inset border; a selected Proxy is rgba(74,147,160,.18) with a #4A93A0 border.
  - Picker on Pull from the Grave ×2 reads "Proxies 1 2 of 2 · Original 0"; ← changes it to "Original 1"; Enter → "Original 1 · Proxy 1".
  - Screenshots (colour and greyscale) checked.

## Revision 3 — 2026-10-13 — owner answers (D-047 revised, D-050–D-052)
Task as received: "Task T-54 revision 3: Update the spec and mockup to these owner decisions made today (main commit 151967d; text below): In short: remove the deck-level Add to collection / List only choice; every deck row gets Original · Proxy · Unsleeved (default Original), and on rows with 2+ copies clicking Proxy or Unsleeved opens the count picker to split; the bulk bar offers all three; collection import is add-only with no replace option; split rows by language, combine conditions; skip tokens in collection imports; text-file rows show a small Foil checkbox; after deck import open the commander picker immediately (no Later step). Gene answers: G2 superseded by D-047; G4 yes, keep accepting existing non-ManaBox collection CSVs; G5 a spinner is enough. Keep the UI condensed. Done when: the spec and mockup reflect D-047 (revised) and D-050 to D-052, section 11 has no answered questions left, and your report has a dated revision-3 note. For Brad (plain words): Update the import screens with your answers: Original, Proxy or Unsleeved per deck card, a Foil tick box for text files, and the commander picker straight after import."

**For Brad:**
- Each card in a deck import now has three choices: Original, Proxy or Unsleeved. On a card you have 2 of, clicking Proxy or Unsleeved lets you pick how many, so one card can be both, e.g. "Original 1 · Proxy 1".
- Text files have a Foil tick box on each line.
- After a Commander deck import, the deck opens with the commander picker already open.
- One new question for you: is one Foil tick box per line what you meant?

What changed:
- **Mockup:**
  - The deck-level "Cards: Add to collection / List only" control is removed.
  - Every deck row has **Original · Proxy · Unsleeved**; collection rows keep **Original · Proxy**.
  - On 2+ copy rows, Proxy or Unsleeved opens the count picker. Split rows show counts on each chosen segment ("Original 1 · Proxy 1"). This replaces "Proxy 1/2", which can't show a three-way split.
  - The bulk bar has Original · Proxy · Unsleeved, and there is a new **Unsleeved** filter.
  - Text files get a **Foil** column of tick boxes, and the "Text file: all nonfoil" notice is removed.
  - Collection: an illustrative skipped token and a Japanese ("JA") row, behind the renamed **Illustrative lines** switch.
  - Deck import shows a spinner only.
  - Commander format skips the done dialog and opens the deck page with the picker open, plus a one-line, dismissible "Imported · …" result. Other formats keep the done dialog with **Open deck**. **Later** is removed.
- **Spec:**
  - Rev-3 note at the top; §3–§10 updated.
  - §11 now holds only the new Foil question; the six answered questions are removed.
  - §12 keeps G1 (updated) and G3. G2, G4 and G5 are removed as answered.
- **Verification (rev 3):**
  - JS parse check passed.
  - Headless Chromium (Playwright 1.64), with no page errors:
    - A 1-copy row set to Unsleeved changes the footer to "1 unsleeved".
    - Pull from the Grave ×2 → Proxy → "Proxies 1 2 of 2" → pick 1 → "Original 1 · Proxy 1". → Unsleeved → pick 1 → "Proxy 1 · Unsleeved 1". → Original resets it.
    - Keyboard on Hungry Graffalon ×2: → moves focus with no picker; Enter opens it with focus on 2; ← Enter → "Proxy 1" with focus back on Proxy. Escape closes it.
    - Bulk bar shows Original · Proxy · Unsleeved; bulk Unsleeved and the Unsleeved filter work.
    - Commander format: Import → deck page with focus in the picker search and the "Imported · 54 cards added · sleeved · 1 proxy · 3 unsleeved · 8 basics · 1 not matched" line. Enter picks the commander and the toast appears.
    - Modern format → done dialog with **Open deck**.
    - Text file: ticking Foil → footer "2 foil"; no nonfoil notice.
    - Collection: no Unsleeved option, token notice and JA row shown, "27 cards added · 1 token skipped".
    - The page has no "Some", "Later", "List only" or "Add to collection".
    - Greyscale screenshot: Original, Proxy and Unsleeved stay distinguishable.

## Revision 2 — 2026-10-13 — condensed UI, proxy count picker
Task as received: "Task T-54 revision: (1) Cut the mockup and on-screen text hard: remove explanatory sentences, helper paragraphs and repeated labels, and keep only the controls, short labels and counts needed to decide; tighten spacing so more card rows fit. (2) Remove the 'Some' option everywhere: rows show only Original · Proxy, and choosing Proxy on a row with quantity above 1 opens a small count picker (how many of the N are proxies, default all N, 1 to N) shown inline as e.g. 'Proxy 1/2'; update the spec, interaction notes, open question 3 and your report to match. Done when: the mockup and spec in docs/oracle/ have no 'Some' option, the quantity picker works in the mockup, visible copy is substantially shorter, and your report has a dated revision note. For Brad (plain words): Make the import screens shorter and less wordy, and replace 'Some' with picking how many copies are proxies when you click Proxy." Owner feedback (verbatim): "Lets condense the UI. It is very wordy. Also, dont use 'some' just have it so if i click proxy on multiple cards it allows me to pick how many".

**For Brad:** The import screen is now mostly controls and counts, and about 16 cards fit on screen instead of 9. "Some" is gone. Click Proxy on a card you have 2 of and you pick how many are proxies; it starts at both, and the button then shows, for example, "Proxy 1/2".

What changed:
- Mockup rebuilt: explanatory sentences and helper paragraphs removed; explanations for Add to collection, List only and Generic basics moved to tooltips; deck options on one line; the three-line summary replaced by footer counts ("57 cards · 4 proxies · 8 basics"); notices one line each; the "repeated rows combined" notice removed (rows still combine); rows 38 → 30 px; done screen and commander prompt shortened.
- "Some" option and its stepper removed from the mockup and the spec. New `ProxyCountPicker` (spec §4, §5.3, §6.2, §6.3, §8, §9): clicking Proxy on a row with 2+ copies sets all copies and opens the picker; numbers 1…N; Enter/Space opens it from the keyboard; arrow keys choose Original/Proxy without opening it; Escape or clicking outside closes it; focus returns to Proxy.
- Spec §8 copy table rewritten to the short strings; Question 3 rewritten ("start at all, or at 1?").
- Verification (rev 2): JS parse check passed; headless Chromium (Playwright 1.64), no page errors. Pull from the Grave ×2 → Proxy → picker "Proxies 1 2 of 2", label "Proxy 2/2" → pick 1 → "Proxy 1/2", footer "1 proxy". Keyboard: → onto Proxy on Hungry Graffalon ×2 gives "Proxy 2/2" with no picker; Enter opens it with focus on 2; ← Enter gives "Proxy 1/2" with focus back on Proxy. Escape and outside click close it. 1-copy rows never open it. Bulk Proxy on 2 rows → "4 proxies". List only, txt (token Show), collection (26 cards), checking state and commander pick + toast all work. Rendered page text has no "Some". Screenshots confirm about 16 rows visible at 860 px height.

## Summary for the owner
The import screens are ready to review in your browser (revision 5). You choose a ManaBox file and check the list before anything is saved. Each deck card is Original (app green), Proxy (blue) or Unsleeved, and text files have a Foil tick box. To find it, pick the "Deck text file" example at the top. After a Commander deck import, the commander picker opens straight away. One question is left: is one Foil tick box per line what you meant?

## Changed files
- docs/oracle/specs/manabox-import.md — the spec (problem, principles, flow, components, states, interactions, data needs, exact copy, accessibility, questions)
- docs/oracle/mockups/manabox-import.html — self-contained clickable mockup built on the owner's real sample files (Strix draft.csv, Strixhaven.txt, scan 2026-06-05)
- docs/oracle/reports/2026-10-13-designer-t54-manabox-import-spec.md — this report

## New decisions made (need owner confirmation)
Settled by the owner on 2026-10-13 and no longer proposals: add-only collection import (D-050); per-card Original · Proxy · Unsleeved (D-047 revised); language split, conditions combined, tokens skipped in collections, Foil tick box (D-051); picker opens straight after import (D-052).

Still Designer proposals:
- A selected Original uses the **app green** (owner, rev 5); this amends D-053's mint. Used only where the Original/Proxy choice is made.
- **Count picker** on rows with 2+ copies, for Proxy and Unsleeved. It starts at all copies. Raising a number takes copies from Original first, then from the other type; lowering returns them to Original. Original never opens the picker, and neither do arrow keys.
- **Split rows show counts on each chosen segment** ("Original 1 · Proxy 1"). This replaces rev 2's "Proxy 1/2".
- **Collection rows offer Original · Proxy only.** Unsleeved means "on a deck list without a copy", which doesn't apply to a collection.
- **One Foil tick box per text-file line, covering every copy on it.** (Spec Question 1.)
- **After a Commander-format import there is no done dialog.** A dismissible one-line result sits under the deck header, beside the open picker. Other formats keep the done dialog with **Open deck**.
- Generic basics have no row checkbox and no control (unchanged; Gene already explained this to the owner).
- Identical rows are combined without a notice (printing + finish + language).
- The deck import dialog's "CSV" tab is renamed **File** and accepts .csv and .txt.
- The commander can also be set later from the header button or a card's ⋯ menu; Partner/Background gets an optional **Add partner**.

## Assumptions
- Original/Proxy rows in a deck import create new owned copies sleeved in the deck, and Unsleeved rows create deck rows only (D-047 revised; matches today's `new_cards` / `theorycrafted` behaviour [Confirmed: src/lib/deck-import.ts]).
- Commander candidates in the mockup are picked by hand; the real list needs card data.
- The owner's samples have no unmatched lines, no collection tokens and no non-English cards. The mockup adds one of each behind "Illustrative lines".

## Challenges to locked decisions
- none. (The earlier D-047 wording question, G2, was superseded by the revised D-047.)

## Open questions
- For Brad: spec §11, Question 1 (one Foil tick box per text-file line).
- For Gene / Architect (spec §12):
  - G1 (T-53): the preview that writes nothing; per-row Original/Proxy/Unsleeved counts and per-row Foil on commit; skipped tokens for collections; language on rows; commander eligibility; setting the commander on an existing deck (the deck update route accepts only `build_id` today [Confirmed: src/app/api/decks/[id]/route.ts]).
  - G6: amend D-053. The owner chose the app green for a selected Original instead of a mint.
  - G3: white text on the brand-green primary button is 3.4:1, below AA (pre-existing and app-wide; suggest fixing via T-26).
  - Answered by Gene on 2026-10-13: G2 (superseded by D-047 revised), G4 (keep accepting non-ManaBox collection CSVs), G5 (a spinner is enough).
- Figma: not used; the mockup is HTML as the project additions require.

## Verification
(First pass below; rev 2 and rev 3 checks are in their revision notes.)
- `node -e new Function(<mockup script>)` — JS parses.
- Headless Chromium (Playwright 1.64) clicked through every step for all three sample files, with no page errors. Checked results:
  - Strix draft.csv footer: "Adds 57 cards … (57 originals, 0 proxies), plus 8 generic basics".
  - Marking 1 card and then 2 selected cards (one ×2) as Proxy gives "53 originals, 4 proxies".
  - Basics switch off gives 65 tracked. List only gives "Saves 57 cards as a list, plus 8 generic basics".
  - Strixhaven.txt: 1 token skipped (Inkling, line 43); the text-file foil notice shows; (v1 test; v1 had a "Some" option, since removed — see revision note).
  - Collection scan: "Adds 26 cards".
  - The commander picker filters by typing, picks with keyboard Enter, and Undo restores the button; ⋯ → Make commander works.
  - Wrong-file, still-checking and import-failed states all render.
- Sample stats checked with Python against the files: Strix draft 65 rows → 58 combined, 8 basics (Swamp ×4, Island ×3, Forest ×1); Strixhaven.txt 88 lines, 100 cards, 1 token, 2 basics.
- Contrast ratios computed from token hex values (spec §9).
