# Report: import-history-audit
Role: Architect
Status: DONE
Task as received: Research task, no code changes, no DB writes. Repo /Users/bradknewstubb/Developer/Personal/oracle_app (branch test-t56-local; use git log/show for older work). The owner has rebuilt import many times since July 2026 and wants one consolidated picture. Read docs/oracle/reports/2026-10-22-designer-import-scenarios.md and compare it with all earlier import work (git log, decisions.md esp. D-047/D-050, specs/contracts/reports for T-12, T-20, T-21, T-22, T-35, T-54, T-56, the docs about deck-import-conflicts, collection-foundation and import lifecycle modes, and the code: safe-replace collection import from 2026-09-15, built-deck reconcile, claim-based reconciliation, theorycrafted mode, Archidekt/Moxfield importers, old onboarding import). Produce this report with: (1) timeline of each import attempt and whether live/superseded/dead; (2) which Designer gaps are wrong/already solved vs real; (3) locked decisions that conflict with each other or with code; (4) duplicated or dead import code and UI paths that confuse users; (5) a recommended consolidation (one import model for the three scenarios, smallest change set, what to delete); (6) owner questions in behaviour terms only. Do not edit decisions.md.

## Summary for the owner
**Much of what the Designer says is missing was already built in September, and then switched off or left behind when you moved to ManaBox in October.** A "replace my whole collection" import exists and works safely (it checks the whole file first and either replaces everything or changes nothing), but no button reaches it any more, because the ManaBox rules said imports only ever add. A "deck I already have built" import that sleeves cards from your collection also exists, and so does a "theorycrafted" import, plus a full screen for sorting out cards that two decks both want. They still sit behind the old URL/Precon tabs and the old Archidekt/Moxfield onboarding page, which is why import feels like several different apps. The Designer is right about the real gaps: the new ManaBox review can't tell you what you already own, can't sleeve copies you own, and nothing replaces your decks.

My recommendation: keep one screen (the new ManaBox review), ask "what are you doing?" first so it only sets sensible defaults, reuse the existing "sleeve free copies from my collection" and "replace collection" machinery behind it, and delete the old three-choice screen, the broken Precon tab and the Brew/Active onboarding. You need to answer the questions in section 6 (mainly: should the import be allowed to sleeve copies you already own, and how much should "start fresh" remove).

---

## 1. Timeline of import attempts

Status key: **LIVE** (a user can reach it today), **API-ONLY** (works, no screen reaches it), **SUPERSEDED**, **DEAD** (nothing calls it).

| # | When | Meant to do | What was built | Status today |
|---|---|---|---|---|
| 1 | 2026-07-05 to 07-22 | First collection and deck import. Archidekt CSV, then "any CSV with just a name" (07-15), multi-platform deck import (07-22), card scanner "Add cards" mode (07-21) | `import-engine.ts` (v1, printing groups), then `import-engine-v2.ts` (one row per physical card; modes add / sync / replace). Deck import with three intents `new_cards` / `built` / `design`. Scanner [commits afd0147, f9d9c9f, 39908ab] | v1 engine **DEAD** (only a script imports it) [Confirmed: src/lib/import-engine.ts; scripts/run-collection-import.ts]. `csv-import.ts` **DEAD**, imported only by its own test [Confirmed: src/lib/csv-import.ts]. v2 engine **LIVE** (backs replace and the onboarding Moxfield collection). Scanner removed 09-12 (8ef73f6) |
| 2 | 2026-09-07 to 09-17 | "Warm start": bring Archidekt (later Moxfield) collection and all decks over in one session, with progress, rate limits, folder decks, more than 30 decks | `/onboarding` page, `/api/onboarding/*` routes, `warm-start-import.ts`, `warm-start-resolve*.ts`, per-deck **Brew / Active** switch [Confirmed: src/app/onboarding/page.tsx `deckStatusOptions`] | **LIVE**, reached by "Import from Archidekt or Moxfield" on the empty home page [Confirmed: src/app/page.tsx line ~160]. `importArchidektCollection` in `warm-start-import.ts` duplicates `collection-stream` [Approximate: the page calls `collection-stream`; `/api/onboarding/collection` has no UI caller found] |
| 3 | 2026-09-12 to 09-15 | **Collection foundation.** Safe replace of the collection, atomic moves, one-location model, Empty to Planned to Sleeved lifecycle, and three explicit deck-import intents: New cards, **Built**, **Theorycrafted** (renamed from "design" on 09-14, 9d688f5) | `replace_collection` RPC (per-user lock, checks the whole file first, one transaction); `reconcile_built_deck` RPC (keeps valid sleeves, pulls free exact copies, never takes from another deck, releases cards missing from the list, reports shortages as conflicts); streamed progress and a warning dialog for replace (26ee08a) [Confirmed: supabase/migrations/20260912170000_atomic_collection_personal_scope.sql; 20260912180000_built_import_reconciliation.sql; src/lib/import-engine-v2.ts `isReplaceMode`; src/lib/deck-import.ts `importDeckBuilt`, `importDeckTheorycrafted`, `importDeckNewCards`; .kiro/specs/collection-foundation/design.md] | Replace is **API-ONLY**: `/api/collection/import?mode=replace` still works [Confirmed: src/app/api/collection/import/route.ts], but its only client, `chunked-import-client.ts`, is **DEAD** (only its test imports it) and the collection button now opens the ManaBox dialog [Confirmed: src/components/collection/CollectionImportButton.tsx]. Built / Theorycrafted / New cards are **LIVE** through the URL and Precon tabs [Confirmed: src/components/DeckImportButton.tsx lines ~380-425; src/app/api/decks/import/route.ts] |
| 4 | 2026-09-16 to 09-20 | **Deck-import conflicts.** When several Active decks want the same single copy at import, record claims, let the owner Release / Proxy / Sleeve, then settle | `import_sleeve_claims` table, claim RPCs, `import-sleeve-claims.ts`, "claim-only reconciliation with equal footing" (5e6452c) [Confirmed: .kiro/specs/deck-import-conflicts/design.md; src/lib/import-sleeve-claims.ts] | Claims are still **created** when onboarding imports an Active deck and **settled** on finish [Confirmed: src/lib/warm-start-resolve.ts `createSleeveClaimsForDeck`; src/app/api/onboarding/finalize/route.ts]. The older claim-resolution routes (`/api/onboarding/conflicts`, `/conflicts/resolve`) have no screen calling them [Approximate: grep found no caller outside tests]. Only reachable through onboarding |
| 5 | 2026-09-26 | T-12 placement source; T-20 maybeboard and sideboard to Maybeboard (D-018, D-022); T-21 exact printing only (D-021, D-023, D-024); M1 exit test locked D-018 to D-021 | Source tagging on placement writes; importer changes in `deck-import.ts` [Confirmed: docs/oracle/reports/2026-09-26-backend-t20-*.md, t21-*.md] | **LIVE** inside the URL path and onboarding only. The ManaBox path has no Maybeboard at all (D-046) |
| 6 | 2026-09-26 to 09-28 | **T-22/T-24/O-005.** Replace the claim screen with a state-based reconcile summary (Available, Unowned, claimed with/without alternate, wishlist, alternate printing); fix "planned counted as resolved" | `ReconciliationSummary`, `ConflictCard`, `/api/onboarding/reconciliation/*`, migrations 20260926140000 and 20260927120000 (applied 09-28 per status.md) [Confirmed: src/components/reconciliation/; docs/oracle/status.md O-005] | **LIVE** as the final "summary" step of onboarding only [Confirmed: src/app/onboarding/page.tsx step `summary`] |
| 7 | 2026-10-01 to 10-05 | T-35: import any public Archidekt account from a pasted URL; clearer private-collection errors; Reconcile "overused" view | `parseArchidektCollectionInput`, `/api/reconcile/overused` [Confirmed: src/lib/archidekt-client.ts; src/app/reconcile/page.tsx] | Archidekt import **LIVE** (onboarding). Moxfield path exists but O-001 ("curl test before committing") is still open [Confirmed: docs/oracle/decisions.md O-001] |
| 8 | 2026-10-13 | **ManaBox pivot.** D-044 to D-052; T-53 contract, T-54 spec, T-55 server, T-56 screens | `manabox-import.ts`, `manabox-collection-import.ts` (add-only), `manabox-deck-import.ts` (per-card Original / Proxy / Unsleeved), preview routes that save nothing [Confirmed: src/lib/manabox-*.ts] | **LIVE** for the collection button and for the deck dialog's **File** and **Paste** tabs |
| 9 | 2026-10-20 to 10-21 | Row editing per copy, stage screens, stepper, review controls, generic basics (D-032, D-048) | `import-copies.ts`, `src/components/manabox-import/*`, migrations 20261020120000, generic-basics RPC [Confirmed: docs/oracle/contracts/import-row-editing.md; generic-basic-lands.md] | **LIVE**. status.md still shows T-56 as "REVIEW" although this branch contains rounds 5 to 13 [Approximate: status.md lags] |
| 10 | 2026-10-22 | Designer review of three scenarios | This report's input | Proposal only |

Two facts the Designer could not see from the screens:
- The ManaBox spec itself says the old collection import "replaces the whole collection and clears every deck's sleeves", and D-050 deliberately turned that into add-only [Confirmed: docs/oracle/specs/manabox-import.md §1, §10]. Replace was removed on purpose from the screen, never from the server.
- The Precon tab asks `/api/precons`, and no such route exists in the working tree, so the tab can only show "Loading precons..." or an error [Confirmed: src/components/DeckImportButton.tsx lines 148-157; glob of src/app/api finds no `precons`]. The Precon tab is therefore **broken today**, not just "the old flow".

## 2. The Designer's claims, checked

### Wrong, or already solved by earlier work
| Designer claim | Verdict | Evidence |
|---|---|---|
| "Replace everything: there is none." | **Partly wrong.** A safe, all-or-nothing collection replace exists on the server. What is missing is a screen, and any removal of decks. | `replace_collection` RPC; `?mode=replace`; streaming progress and a pre-mutation warning were built 09-15 [Confirmed: src/app/api/collection/import/route.ts; src/lib/import-engine-v2.ts]. It deletes every owned copy and sets every deck slot back to unsleeved (the slot's copy link is cleared, the deck and its list stay) [Confirmed: supabase/migrations/20260925220000_placement_source.sql `apply_collection_sync`] |
| "Deck cards in the collection can't be matched at import." | **Wrong for the URL path**, right for the ManaBox path. | `built` mode does exactly this atomically and respects exact printing (D-021) [Confirmed: src/lib/deck-import.ts `importDeckBuilt`; reconcile_built_deck migration] |
| "Contention isn't handled." | **Wrong for onboarding**, right for ManaBox. | Claim-based reconciliation with Release / Proxy / Sleeve and a state-based summary [Confirmed: src/lib/import-sleeve-claims.ts; src/components/reconciliation/ReconciliationSummary.tsx]. Note the status.md ruling: the first deck imported gets a contested copy, "not a bug" (O-005 notes) |
| Theorycrafted works only via select-all then Unsleeved. | **Incomplete.** A real Theorycrafted intent already exists in the URL path (list only, no copies created, never moves or releases copies). The ManaBox path simply doesn't offer it as a starting choice. | `importDeckTheorycrafted` [Confirmed: src/lib/deck-import.ts] |
| "Import lifecycle modes" don't exist / need inventing (Option A's up-front question). | **Mostly already designed.** The September spec defined three intents, New cards / Built / Theorycrafted, as "an attestation of reality". The Designer's "Precon / Some I own / Just the list" is that same model with new names. | [Confirmed: .kiro/specs/collection-foundation/design.md "Import intent"] |
| "From collection" is a new capability needing a new Architect contract. | **Mostly exists.** Backend for "sleeve free exact copies into this deck, never clearing, never taking from another deck" exists twice: `reconcile_built_deck` and `POST /api/decks/[id]/allocate`. No screen calls `/allocate`. | [Confirmed: src/app/api/decks/[id]/allocate/route.ts; grep finds no UI caller] |
| N7 cites D-006 as the owner-confirmation rule for replace. | **Wrong citation.** D-006 is about *schema* changes ("flush-and-rebuild over a convoluted migration"). The relevant safeguard is AGENTS rule 5 (no destructive DB ops without named owner approval). | [Confirmed: docs/oracle/decisions.md D-006] |
| "Migration" and "Original/Unsleeved" wording. | Note the word clash: "migration" in D-006 means a database change, in the owner's scenario it means moving data in. Keep them apart in owner-facing text. | |

### Real gaps (Designer is right)
1. The ManaBox deck review cannot show what you already own, and "Already own" and "don't own" are the same choice (Unsleeved) [Confirmed: src/components/manabox-import/types.ts has no ownership field].
2. Importing a deck with Original on a card you own adds a second copy, silently [Confirmed: src/lib/manabox-deck-import.ts header "Existing owned copies are never pulled in"].
3. No way to import one collection plus N decks as one session with a combined summary on the ManaBox path (onboarding has it for Archidekt/Moxfield).
4. No screen for replace, and no server step that removes decks. `replace_collection` clears copies only. A fresh migration with old decks still present would leave the old decks behind [Confirmed: apply_collection_sync].
5. Theorycrafted default is wrong on the ManaBox path (everything is Original; one missed click adds 100 copies).
6. URL and Precon tabs feed a different, older flow (and Precon is broken).
7. Replace via the old route honours a file's Proxy flag for Moxfield-style files, which conflicts with D-045 (ManaBox rows are correctly exempt) [Confirmed: src/lib/import-engine-v2.ts lines ~256-302].

## 3. Locked decisions that conflict

| Decisions | Conflict | Evidence |
|---|---|---|
| **D-020** (no automatic allocation at import) and **D-047** ("existing owned copies are never pulled in") vs the code | Both read as global, but they were written for the ManaBox path. `built` mode pulls free copies automatically, and onboarding "Active" settles claims into real sleeves on "Go to Decks". Nobody scoped the decisions to a path, so the code contradicts them. | [Confirmed: src/lib/deck-import.ts `importDeckBuilt`; src/lib/import-sleeve-claims.ts; D-020, D-047] |
| **D-031** vs **D-047** | D-031 says deck import asks Sleeved / Unsleeved at deck level and applies to "standalone and onboarding/batch imports"; D-047 replaced the deck-level choice with a per-card choice. Onboarding and the URL path still use Brew/Active and New/Built/Theorycrafted, so D-031 was never carried through, and its text still says "implementation pending". | [Confirmed: decisions.md; src/app/onboarding/page.tsx; DeckImportButton.tsx] |
| **D-002 / D-025 / D-029** vs onboarding | The deck states are Draft / Assembling / Playable and there is no "Brew" or "Active" concept; onboarding still asks Brew or Active per deck, and the importer writes `is_active`. | [Confirmed: src/app/onboarding/page.tsx lines 25-27, 376-380] |
| **D-050** vs ManaBox contract | The contract says in one place "never replaces" (§1) and in another that replace vs add is "exactly as the current collection import" (§ about line 116, and §14 "existing `mode=replace/add/sync` entry points remain"). Code agrees with §14; the decision agrees with §1. | [Confirmed: docs/oracle/contracts/manabox-import.md] |
| **D-044** vs live importers | D-044 calls ManaBox "the import route for the initial collection and deck imports", but the Archidekt/Moxfield onboarding (T-35, built 12 days earlier) was never retired or re-scoped, and the home page still points at it. | [Confirmed: src/app/page.tsx] |
| **D-037** vs "reconciliation" | "Reconcile" is the page for original-copy shortages (D-037) and also the name of the post-import conflict screen (T-22/T-24) and its routes. Two meanings, same word. | [Confirmed: src/app/reconcile/page.tsx imports `ReconciliationNav` from the import-reconciliation components] |
| **D-052** | Already flagged by the Designer as superseded by the commander selector spec (commander is chosen on the review header). The register still says the picker opens after import. | [Confirmed: docs/oracle/specs/deck-commander-selector.md] |
| **D-018/D-022** vs **D-046** | Maybeboard is imported on the URL path and is not available at all on the ManaBox path. Not a contradiction but a gap that gets worse if the URL path is retired: D-018's Archidekt maybeboard behaviour needs an owner decision if the URL path feeds the ManaBox review. | [Confirmed: D-018, D-046] |

## 4. Duplicated or dead code and confusing paths

**Confusing to a user**
- Deck import dialog has four tabs with two experiences: File and Paste go to the new per-card review, URL and Precon go to the old "These are new cards / I have this deck built / This is theorycrafted" screen [Confirmed: DeckImportButton.tsx].
- Precon tab cannot load (no `/api/precons` route).
- Collection page offers ManaBox; empty home page sends a new user to the Brew/Active Archidekt/Moxfield onboarding.
- Two meanings of "Reconcile" (section 3).
- "Original" on a deck import means "add a new original" (Designer §1, correct).

**Dead or nearly dead code** (candidates, each verified by import search unless marked)
- `src/lib/import-engine.ts` (484 lines): only `scripts/run-collection-import.ts` uses it.
- `src/lib/csv-import.ts` (538) and its test: nothing else imports it.
- `src/lib/chunked-import-client.ts` (589) and its test: nothing else imports it. Its `mode=replace` call is the only former screen route to replace.
- `src/lib/deck-import-legacy.ts` and `/api/decks/[id]/reimport`: no screen calls the route [Approximate: grep of components found none].
- `/api/collection/import` branches `mode=upsert` and `sync` (the `upsert` branch already says "kept for backward compatibility").
- `importArchidektCollection` and `/api/onboarding/collection` if the page only uses `collection-stream` [Approximate].
- `/api/onboarding/conflicts` and `/conflicts/resolve`: no screen caller [Approximate].
- `POST /api/decks/[id]/allocate`: not dead code, but has no button.

**Duplicated**
- Two collection import pipelines: `import-engine-v2` (Moxfield onboarding, replace) vs `manabox-collection-import` vs `warm-start-import` (Archidekt).
- Three deck writers: `importDeckTheorycrafted`/`Built`/`NewCards` (URL and onboarding) vs `importManaBoxDeck`.
- Three ownership-matching mechanisms: `reconcile_built_deck`, claims, `autoAssignDeck`.

## 5. Recommended consolidation

**One model: "Intent, Review, Apply".** All three of the owner's scenarios become the same review screen with different starting defaults.

1. **Intent first (sets defaults only; every card stays editable).**
   - *Add cards* → collection review, default Original (today's screen).
   - *Add a deck* → asks for the list (File, Paste, or link) and then one of: **All new** (precon; default Original), **Some I own** (default Unsleeved, then an explicit "Sleeve from my collection" step), **Just the list** (default Unsleeved, generic basics Unsleeved too).
   - *Start fresh* → separate guarded path (below).
2. **One review screen.** URL / Archidekt / Moxfield / Precon only produce a list that feeds the existing ManaBox review (the preview route `decks/import/preview` already normalises URL decks and is already called by the flow [Confirmed: ManaBoxDeckImportFlow.tsx]).
3. **"I own it" = reuse, don't rebuild.**
   - Add a quiet "In collection: 2 · 1 free" read-only hint per row (read from the rollup that already exists).
   - Add the existing free-copy sleeving as an **explicit step on the result screen** ("12 cards are free in your collection. Sleeve them now?" with a preview), calling `POST /api/decks/[id]/allocate`. This fits D-020 and D-047 unchanged (nothing automatic, nothing pulled in during the save). It is the Designer's Option B, and it is the smallest change because the engine and route already exist.
   - Only if the owner wants it, upgrade to a per-card "From collection" choice (Designer Option A). That changes D-047 and needs the first-deck-wins vs choose question below.
4. **Migration / Start fresh.** Keep ManaBox collection import add-only (D-050). For "replace", reuse `replace_collection` (already atomic and all-or-nothing) behind a separate "Start fresh" flow with a typed confirmation and a list of what will be removed. Needed new work, drafted by Architect and **owner-approved before any migration is applied**: a deck-removal step (existing `delete_deck_with_release` per deck, wrapped so collection, decks and sleeves change in one transaction), and a decision on what survives (section 6, Q2). Until that exists, a first-time migration on an empty account needs no replace at all: import the collection, then each deck as "Some I own".
5. **Multi-file migration session.** Smallest option: keep one file per deck (D-044) but let the dialog stay open for the next file and finish with one combined summary. No new data model.
6. **Fix the decisions, not the code, first.** Ask Gene to propose (not edit) wording scoping D-020/D-047 to "the ManaBox import never sleeves automatically; the explicit Sleeve step does", retiring D-031's onboarding clause and D-052, and settling the D-050 contract wording.

**What to delete (after owner approval; nothing in the database is dropped)**
1. In `DeckImportButton.tsx`: the three-choice screen, the URL and Precon result paths into the old flow, the Precon tab and its `/api/precons` query. Keep URL as an input source.
2. `/api/decks/import` legacy `new_cards` / `built` / `theorycrafted` branches and the functions behind them, once onboarding is retired.
3. `import-engine.ts`, `csv-import.ts`, `chunked-import-client.ts`, `deck-import-legacy.ts` with `/reimport`, `scripts/run-collection-import.ts`, and the `upsert` / `sync` branches of the collection route (keep `replace`).
4. Onboarding: the Brew/Active toggle, the claims routes and `ReconciliationSummary`; repoint the empty home page to the single importer. Keep Archidekt/Moxfield fetchers as a "from a link" source. Leave the `import_sleeve_claims` table and RPCs in the database (forward-only; no drops without explicit approval) and mark them unused.
5. Rename the post-import "reconciliation" screens and routes so "Reconcile" means only the shortage page (D-037).

Order of work: decisions wording, then remove the broken Precon tab and the old chooser, then the result-screen Sleeve step and ownership hint, then Start fresh (needs a migration draft), then onboarding retirement and dead-code deletion.

## Changed files
- docs/oracle/reports/2026-10-22-architect-import-history-audit.md — this report (no other files changed; decisions.md untouched; no database writes)

## New decisions made (need owner confirmation)
- Proposed only, none recorded: one import model (intent sets defaults only); explicit post-import "Sleeve from my collection" using existing machinery; Start fresh as a separate guarded flow; retire the old chooser, Precon tab and Brew/Active onboarding.

## Assumptions
- The owner's data lives in the shared database and replace behaviour is as read from the migration files in the repo; I did not query the hosted database (it was not part of the task), so which of the migrations were applied is taken from status.md [Approximate].
- "No caller" findings come from searching `src/`, `scripts/` and `tests/` for imports and fetch URLs; calls built from dynamic strings would not show [Approximate].

## Challenges to locked decisions
- D-020 / D-047 — built mode and onboarding claims contradict them as currently worded — scope them to the ManaBox path or add the explicit Sleeve step as the one sanctioned exception.
- D-031 — never carried through to onboarding and superseded in part by D-047 — mark as superseded.
- D-052 — superseded by the commander selector spec — update the register.
- D-050 vs contract §14 — reconcile the two statements about replace.
- D-044 — does not say what happens to the Archidekt/Moxfield onboarding — add a line.

## Open questions
See section 6.

## 6. Questions for the owner (behaviour only)
1. **Cards you already own.** When a deck lists a card you already own and a copy is free, which do you want: (a) the import review offers to use your copy, per card; (b) the screen after the import offers "Sleeve the 12 free cards now?" with a preview; (c) leave it as today and sleeve on the deck page? I recommend (b).
2. **Start fresh.** If you replace everything, what should be removed and what should stay? For example: all copies, all decks, deck notes and history, advisor chats, chosen art, storage locations. I suggest everything except settings and storage locations, shown in a list before you confirm.
3. **Do you still need Start fresh?** For a first move into Oracle on an empty account you don't need it. Do you want it as a button for later, or only when the account already has data?
4. **Your ManaBox export.** Does your collection file include the cards that sit in your ManaBox decks? If yes, migrated decks should use your collection cards; if no, those cards are additional and should be added as new.
5. **Two decks, one card.** In a migration, if two decks list your only Sol Ring: the first deck imported gets it and the other shows "In Korvold", or you choose on a summary screen before anything is saved?
6. **Other printings.** If you own a different printing of a card than the deck lists, should the import use it automatically, or leave the card unsleeved and show "Alt available"?
7. **Archidekt and Moxfield.** Do you still want to bring decks over from an Archidekt or Moxfield link, or is ManaBox the only way in from now on? If links stay, they would feed the same review screen as files, and the Brew/Active wording goes away.
8. **Maybeboard on links.** Archidekt decks have a maybeboard and sideboard; ManaBox files do not. If links stay, should those cards still come in as maybeboard?
9. **Theorycrafted basics.** In a "just the list" deck, should plain basic lands start unsleeved too?
10. **Duplicate warning.** Should the review tell you when an import will add a card you already own ("8 cards you own will be added again")?
11. **Precon tab.** It cannot load today. Remove it, or do you want a real precon picker back (that would need a precon list source)?
