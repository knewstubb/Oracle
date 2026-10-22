# Brief: import cleanup (Gate 1 + Gate 2 combined, for owner approval)
Author: Architect, 2026-10-23. Status: **DRAFT, waiting for owner approval. Nothing has been deleted or changed.** Updated 2026-10-23: Precon tab moved from DELETE to FIX (slice P1); precon behaviour decisions recorded in 6a.
Basis: `reports/2026-10-22-architect-import-history-audit.md`, re-checked on 2026-10-23.

## 1. What this is, in plain words
Import has been rebuilt six-plus times. The newest version (the ManaBox review screen) is good, but the older versions are still in the app. They make import look like several different tools, one tab is broken (the Precon tab, which you decided to **fix**, not delete), and some agreed rules now contradict each other. This brief says what stays, what goes, which rules to reword, and in what order to remove things so the app never breaks.

**What must never happen:** losing or duplicating your cards or decks, and touching your live data while testing.

**Three scenarios this must keep working** (from your Oct 22 list): moving everything in (migration), adding cards, adding a deck (precon, mixed, theorycrafted).

## 2. KEEP (and why)
| Keep | Why |
|---|---|
| The new ManaBox review screen for collection and deck files | The one importer you approved. Per-card Original / Proxy / Unsleeved, row editing, generic basics. |
| "Replace my whole collection" (server side only) | Safe all-or-nothing function. No screen reaches it, on purpose (add-only rule). Q4: no new Start fresh flow; Settings "Clear All Data" stays. |
| "Sleeve free copies into this deck" (server side only) | Already written; no button. May be reused by the intent design (Q1); on hold until that design exists. |
| The "keep what's valid, pull free copies, report shortages" deck step | Same idea, reused if a deck is re-imported. Stays until the new Sleeve step exists. |
| **The Precon tab (owner decision 2026-10-23: FIX, not delete)** | Currently broken. Repaired by slice P1 so a precon opens in the same review as a file. Its list table and sync script stay. |
| Pasting a link to a deck as a way to *get a list* | Still useful, but it should lead into the new review (needs your answer, Q2). |
| The shortage page ("Reconcile") | A separate, approved feature (D-037). |
| Database tables and functions for the old conflict claims | We never drop data structures here. They just go unused. |

## 3. DELETE (each item)
"Nobody calls it" was checked by searching all source, scripts, tests, config and automation files for the file name, the web address and for addresses built from pieces (template strings, string joins). Method detail is in the appendix.

**Safe now (you will see no difference)**
| Item | What you stop seeing | Risk |
|---|---|---|
| Old collection import engine and the old CSV importer | Nothing. Only a one-off script uses the first; the second is used only by its own test. | Low |
| The old "chunked" collection import helper | Nothing. The collection button no longer uses it. (Its test goes too.) | Low |
| "Re-import deck" server route and the old deck writer behind it | Nothing. No button calls it. | Low |
| Five unused onboarding server routes (see appendix) | Nothing. The onboarding page does not call them. | Low |

**Goes only after your answer (not safe to delete yet)**
| Item | What you stop seeing | Why it waits |
|---|---|---|
| The old three-choice screen ("new cards / I have this deck built / theorycrafted") after a link | The old flow for link imports | Goes after links feed the new review with the intent choices (slice 6). Q2 answered; waits for the intent design (Q1). |
| The Archidekt/Moxfield onboarding importer (Brew/Active switch, post-import conflict screen, home-page link) | A whole separate importer | Q2 answered: links stay but use the new review, so this separate importer retires (slice 7). |
| Old collection import modes for non-ManaBox CSV files | Nothing: **kept** | **Owner answered Q3 = yes, they stay (low priority). Not deleted.** |

## 4. DECISIONS to change (proposals; Gene edits `decisions.md` only after you approve)
| ID | Current wording (short) | Conflict | Proposed wording | Needs you? |
|---|---|---|---|---|
| D-020 | Import runs no automatic allocation | Link-import "built" mode and onboarding "Active" do sleeve automatically; owner Q1 = yes (sleeving owned cards on import, three intents) | **Wording on hold:** will be rewritten by the intent design (I bought it / I built it / I'm planning it). | **Yes**, with the design |
| D-047 | "Existing owned copies are never pulled in automatically" | Contradicted by Q1 (I built it pulls owned copies; copies can move between decks) | **On hold**, same as D-020. "I bought it" (incl. precons) stays as is. | **Yes**, with the design |
| D-031 | Deck import asks Sleeved/Unsleeved; applies to onboarding too | Replaced by D-047's per-card choice; onboarding never changed | Mark **superseded by D-047**. | Quick OK |
| D-044 | ManaBox is the route for initial collection and decks | Says nothing about the Archidekt/Moxfield importer that still exists | Add (Q2 answered): "Pasted deck links (Archidekt/Moxfield) are an input to the same review as files, with the same intent choices. The separate onboarding importer is retired." | **Yes** (confirm wording) |
| D-050 | Collection import only adds, never replaces | Contract text elsewhere says replace "remains" | Keep. **Q4: no Start fresh flow, so no wording change** (Settings "Clear All Data" is the reset). | No |
| D-052 | Commander picker opens after import | Replaced by commander chosen on the review header | Mark **superseded by the commander selector spec**. | Quick OK |
| D-018 / D-022 | Archidekt maybeboard and sideboard import as maybeboard | If links feed the review, ManaBox review has no Maybeboard | Links stay (Q2), so the review needs a Maybeboard/Sideboard place for link imports (Designer), or the note "ManaBox files have none; links keep theirs". Not decided here. | **Yes** (Designer + owner) |
| D-006 | "Clean slate beats complex migration" (database changes) | Not in conflict, but cited as the safeguard for replacing data. It is only about database structure. | Add a note: "D-006 covers database structure changes only. Replacing the owner's data is governed by AGENTS rule 5 and D-050." | Quick OK |
| **"Reconcile" double meaning** | D-037: Reconcile page = shortage view. Also the name of the post-import conflict screens and routes | Same word, two meanings | After onboarding goes, the word means only the shortage page. Until then, call the import one "Sort out conflicts" in anything you read. | Quick OK |

## 5. DOCS to mark superseded (when the matching slice ships, not before)
- `contracts/manabox-import.md`: fix §1 vs §14 on replace; §14 reuse table lists files that will be deleted.
- `specs/vocabulary.md`: section V9 (wording changes for the old import screens) becomes moot; remove it from the list.
- Import reconciliation set (`specs/import-reconciliation-redesign*.md`, `contracts/import-reconciliation-redesign.*`, `import-reconciliation-states.md`, `handoffs/t22-*.md`, `mockups/import-reconciliation-redesign.html`): superseded when onboarding is retired.
- `.kiro/specs/deck-import-conflicts/`, `deck-import-v2/`, `collection-foundation/` (the "import intent" part): history only.
- `status.md`: T-22 and T-24 rows, and T-56 (still says REVIEW).
- `docs/user-guide.md` import section: [Approximate] describes the July importer.
Add a one-line "SUPERSEDED by …" banner at the top; do not delete the files (history).

## 6. SLICES (smallest risk first; each ships and tests alone)
**Before slice 1:** Tester records a baseline: the one-command check passes, and by hand: collection import preview, deck File import preview, deck Paste preview. Saving an import is **untested** until the separate test account exists; slices 1-4 do not touch saving.

| # | Slice | Tester verifies after |
|---|---|---|
| 1 | Delete old collection engine, old CSV importer, chunked helper, the one-off script and their tests | One-command check; app builds; collection import (preview) still works |
| 2 | Delete re-import route and old deck writer | Check; build; open a deck page; deck File import preview |
| 3 | *(Not used. The Precon tab is kept and fixed in P1; number left empty so later slice numbers stay stable.)* | n/a |
| 4 | Delete the five unused onboarding routes and their tests | Check; build; open the onboarding page and reach its steps (no saving) |
| **P1** | **Fix the Precon tab** (see 6a). Independent of the open questions. Needs owner approval of the database change *before it is applied*. | Preview: pick a precon, review shows 100 cards with exact printings, commander preset, all Original. Save on the test account only. |
| 5 | **FLAGGED, likely replaced.** Was: "Sleeve free copies" result step. Owner's Q1 answer points to an intent design (I bought it / I built it / I'm planning it; import is source of truth; copies can move). **Do not build as written.** Next step is a Designer mockup and Architect contract, then this slice is rewritten. | n/a until redesigned |
| 6 | *(after the intent design, replacing slice 5)* Links feed the same review with the intent choices (I bought it / I built it / I'm planning it); then delete the three-choice screen and the `new cards` / `built` modes. Q2 answered. | URL import end to end on the test account; File/Paste unchanged |
| 7 | *(after slice 6)* Retire onboarding (page, Brew/Active, claim creation, conflict screen, home link) | Home page empty state; no dead links; collection and decks pages unchanged |
| 8 | **DROPPED (Q3 = yes):** old collection route modes stay. Optional later, low priority: check non-ManaBox CSV layouts still work and fold them into the new screen. | n/a |
| 9 | **DROPPED (Q4):** no Start fresh flow; the existing Settings "Clear All Data" button stays. | n/a |
| 10 | Mark docs superseded; Gene applies approved decision edits | Gene's decision-vs-code check |

Each slice is committed separately. If a slice's check fails, revert that slice only.

### 6a. Slice P1: fix the Precon tab (owner decisions 2026-10-23)
**Decided:** (1) fix, not delete. (2) A chosen precon is **"I bought it"**: all 100 cards are added as **new Originals**, even if you already own them (Q5). You can still change any card to Proxy or Unsleeved in the review. (3) Printings: **exactly what the dataset lists, always** (Q6, confirmed).
**What is built (smallest set):**
1. The sync stores each precon's full card list (one new column; commander flagged; foil flag kept). The useless Archidekt *search* link is dropped. **Database change: drafted by Architect, applied only after your approval.**
2. A small read-only list of precons (search by name / commander / set) and a way to fetch one precon's cards.
3. Choosing a precon opens the **same review** as a file, with the commander preselected. The old three-choice screen is not used.
4. Source is the community dataset the sync already downloads (not EDHREC; its terms forbid automated requests). See `reports/2026-10-23-architect-precon-sources.md`.
**What changes for you:** the Precon tab works; you pick a deck and see all 100 cards, exactly as printed, before anything is saved.
**Does D-047 conflict?** No. "I bought it" adds new Original copies inside the import and does not pull in copies you already own. **Q5 answered:** all 100 import as new Originals even if you own them (duplicates accepted). **Q6 answered:** exact printings as listed, always.

**Can the review take a ready-made list with exact printings? Verified in code 2026-10-23.**
- **Yes, through the file path, not as a pre-built object.** The review is built by `/api/decks/import/preview`, which accepts only ManaBox CSV or text content and looks the cards up itself (`buildDeckPreview` in `src/lib/manabox-import.ts`). There is no route that accepts an already-resolved list.
- **CSV carries everything asked for:** Scryfall ID, Set code, Collector number, Foil (normal / foil / etched → nonfoil / foil / etched) and Quantity. Resolution prefers the Scryfall ID, then set + collector number (`resolveBySetCollector`). So the cleanest build is: `/api/precons/<id>` returns the list; the tab turns it into a ManaBox-style CSV string and sends it through the existing preview call, with no new review logic.
- **Text format carries no finish** (`<qty> <name> (<set>) <number>` only), so CSV must be used to keep foils.
- **Gaps (small):** (a) the CSV has no "commander" column, so the commander must be preselected by name after the preview [Approximate: confirm how `ReviewCommanderSelect` takes an initial value]; (b) the review's per-copy default type: confirm "Original" is the default (the contract says each copy is Original / Proxy / Unsleeved) and set it explicitly for precons; (c) cards the lookup can't match (new sets not yet in our reference data) show up as unmatched, which the review already handles; (d) the dataset gives a mtgjson id, not a Scryfall id, so we resolve by set + collector number (needs set-code normalisation, which `normalizeSetCode` in `manabox-resolver.ts` exists for).
- **Not tested end to end**; nothing was run. Tester verifies in the preview step, then on the test account for saving.

## 7. Questions
### Answered by the owner (recorded 2026-10-23)
- **Q1 = YES.** A deck import can sleeve cards you already own. It is now being designed as three intents: **"I bought it"**, **"I built it"**, **"I'm planning it"**. The **import is the source of truth**, and **copies can move between decks**. **Flag (not decided):** this probably replaces the "Sleeve free copies" step (slice 5) and changes D-020/D-047 more than my proposed wording; the intent design supersedes this brief's proposal. It needs a Designer mockup and an Architect contract first. It also touches "never take a card from another deck" in the old built mode, which the new "copies can move" rule contradicts.
- **Q3 = YES, other CSV files stay, low priority.** So the old collection route modes (`add`/`sync`/`upsert`) are **not deleted** and slice 8 is dropped. Whether those layouts reach the new screen is still unverified; that is a later, low-priority task.
- **Q4 = keep the existing "Clear All Data" button in Settings. No new Start fresh flow.** Slice 9 is dropped. `replace_collection` stays server-side, unused by any screen. D-050 needs no Start-fresh wording.
- **Q5 = precons import ALL 100 cards as new Originals (a fresh purchase), even if you already own them.** No ownership warning. Duplicates are accepted by design. This is the "I bought it" intent applied to precons.
- **Q6 = always exact printings as the dataset lists them.** No swap offered for precons on the Precon tab by default.

- **Q2 = option a.** The intent choices apply to any import method, including a pasted link. Links stay and feed the same review as files. The onboarding importer (Brew/Active switch, separate conflict screen, home-page link) and the old three-choice screen retire after that (slices 6, 7).
- **"Copy already in another deck" = answered by the Designer's revision.** The review shows which decks the card is currently in, so you confirm which deck is missing it. If you skip that, the card is added sleeved and the affected decklist shows an accounting-error alert. (Recorded as the answer; this replaces my "Moves from Deck A" question, which is removed.) This still needs the Architect contract and D-020/D-047 rewording with the intent design.

### Still open
None in this brief. Remaining work is design/contract (intent design), then the approvals listed in section 4 and the database change for P1.

## Appendix: paths and verification (for agents)
**Slice 1:** `src/lib/import-engine.ts` (only `scripts/run-collection-import.ts` imports it), `src/lib/csv-import.ts` + `.test.ts`, `src/lib/chunked-import-client.ts` + `.test.ts`, `scripts/run-collection-import.ts`. After deleting, check for newly orphaned helpers (for example anything only `import-engine.ts` used).
**Slice 2:** `src/app/api/decks/[id]/reimport/route.ts`, `src/lib/deck-import-legacy.ts`. `deck-cards-diff.ts` stays (also used by `deck-import.ts`). `deck-versions.ts` only mentions "reimport" as a label string.
**Slice 3:** not used (Precon tab kept).
**Slice P1:** `scripts/sync-precons.ts` (already downloads `taw/magic-preconstructed-decks-data` `decks_v2.json` with per-card `set_code`, `number`, `foil`; today it discards the cards and stores a search URL), `supabase/migrations/20260802093043_create_ref_precons.sql` (no card column; new migration needed, approval first), new `src/app/api/precons/route.ts` (+ one for a single precon), `src/components/DeckImportButton.tsx` (Precon tab lines ~148–158 query, ~276–290 submit: replace the Archidekt-URL submit with "build CSV and open `ManaBoxDeckImportFlow`"), `src/components/manabox-import/ManaBoxDeckImportFlow.tsx` (calls `/api/decks/import/preview` at ~116, then `/api/decks/import`), `src/lib/manabox-import.ts` (`buildDeckPreview`, CSV headers at ~132–144, `resolveBySetCollector`), `src/lib/manabox-resolver.ts` (`normalizeSetCode`), `docs/oracle/contracts/import-row-editing.types.ts` (`ImportFinish` = nonfoil | foil | etched). Filter the dataset to 100-card commander decks (it also holds 60-card theme decks and MTGO redemption sets).
**Slice 4 routes (no caller):** `src/app/api/onboarding/collection`, `/resolve`, `/moxfield/resolve`, `/conflicts`, `/conflicts/resolve`. The onboarding page calls only `collection-stream`, `decks`, `prefetch-decks`, `resolve-one`, `moxfield/collection`, `moxfield/decks`, `moxfield/resolve-one`; the summary calls `reconciliation*` and `finalize`. Keep `import-sleeve-claims.ts` (used by `finalize`, `warm-start-resolve*.ts`). `importArchidektCollection` in `warm-start-import.ts` loses its only caller with `onboarding/collection`; `fetchArchidektDeckList` stays.
**Slice 6/7:** `DeckImportButton.tsx` three-choice screen, `src/app/api/decks/import/route.ts` modes, `importDeckNewCards` / `importDeckBuilt` in `src/lib/deck-import.ts` (`importDeckTheorycrafted` is still used by `warm-start-resolve*.ts` until slice 7), `src/app/onboarding/page.tsx`, `src/components/reconciliation/*`, `DeckImportProgressList.tsx`, `warm-start-*.ts`, `src/app/page.tsx` link (+ `page.test.tsx` expects it), settings text mentioning onboarding. `reconcile_built_deck` and the claims RPCs stay in the database.
**Slice 8 (dropped, Q3 = yes):** `src/app/api/collection/import/route.ts` branches `add` / `sync` / `upsert` stay. Still unverified: whether non-ManaBox CSV reaches the new screen (the preview route detects ManaBox files; G4 in `specs/manabox-import.md` says other layouts stay accepted). Low-priority check for the Tester later.
**Verification method (2026-10-23):** searched `src`, `scripts`, `tests`, `package.json`, `vercel.json`, `next.config.ts`, `playwright.config.ts` and `.github` for each file name, each `/api/...` address, and for dynamic forms (`` `/api/${...}` ``, string concatenation, `mode=` strings). Result: only the references listed above. No scheduled job or e2e test calls any "delete now" item. Limits: this finds literal and template strings; a URL assembled from several variables would not appear. The four GitHub workflows are switched off (status.md T-43). `/api/decks/[id]/allocate` also has no caller; it is kept, not deleted.
