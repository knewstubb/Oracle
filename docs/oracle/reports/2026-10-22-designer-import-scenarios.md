# Report: import-scenarios
Role: Designer
Status: DONE
Task as received: Review task (do not build code). Repo /Users/bradknewstubb/Developer/Personal/oracle_app, branch test-t56-local. Read docs/oracle/specs/import-row-editing.md, import-stage-screens.md, import-review-controls.md, deck-commander-selector.md, deck-basics-and-printings.md, docs/oracle/decisions.md (D-047 unsleeved, D-051, etc.), docs/oracle/vocabulary.md, and the current import UI in src/components/manabox-import/* to see what exists.

The owner describes three real import scenarios:
1. MIGRATION: shifting or replacing their entire collection and decks. They add all cards and decks and replace everything currently in the system (if anything). They must be able to mark which cards are owned and which are not. Decks containing cards not in the collection are considered unowned by default.
2. ADDING CARDS: new cards added to the collection; may be a mix of original and proxy, but all are owned.
3. ADDING A DECK (most nuance): (a) simple, like a precon where every card is also added to the collection; (b) a mix of new cards, cards already in the collection, and unowned cards; (c) theorycrafted: they may or may not own the cards but nothing is sleeved.

Question: does the current import design cover all of these? Is it clear enough to a first-time user? Could we do it better? Produce: for each scenario, what the user can do today (tag [Confirmed: path] or [Approximate]), gaps, confusing moments, and concrete suggestions (e.g. an up-front 'what are you doing' choice, per-card owned/unowned marking, bulk 'I own all of these', replace-everything safeguards given D-rule no destructive DB ops without explicit confirmation, how owned/unowned/proxy/unsleeved relate). Give a recommended design direction with at most 3 options, recommendation first, and an optional low-fidelity mockup only if it helps (docs/oracle/mockups/import-scenarios.html). Write the report to docs/oracle/reports/2026-10-22-designer-import-scenarios.md per the report format, including a plain-language 'Summary for the owner' and the questions the owner needs to decide (behaviour, not implementation). Do not edit decisions.md. Do not write to any database.

(Note: the vocabulary file is at `docs/oracle/specs/vocabulary.md`, not `docs/oracle/vocabulary.md`.)

## Summary for the owner
Adding cards (scenario 2) and adding a brand-new precon (3a) work well today. Theorycrafted decks (3c) work, but only if you know to switch every card away from the default, which adds them all to your collection. Mixed decks (3b) and migration (1) don't really work: the import can't see what you already own, so a card you already have is either added a second time or left unsleeved for you to sleeve by hand, and there is no way to replace everything. I recommend asking "What are you doing?" before the file is chosen, showing "In collection: 2 · 1 free" on each card, adding a fourth choice, **From collection**, and making "Start fresh" a separate path with a typed confirmation. Two of these change locked rules, so I need your answers to the questions at the end.

---

## 1. How the pieces relate (the model the screens must teach)
The owner's words map onto Oracle's existing vocabulary like this. The design problem is that the import screen never explains this model.

| Owner says | Oracle fact | Set at import by | Shown on deck as |
|---|---|---|---|
| "I own it" | a physical copy exists in the collection, either **Original** or **Proxy** (D-001, D-025) | collection import: every copy; deck import: choosing Original or Proxy | Sleeved (filled badge) if in this deck |
| "Proxy" | a type of owned copy, not a separate ownership state (D-026) | Original/Proxy choice per copy (D-045) | Proxy badge (blue ◆) |
| "Not sleeved" | **Unsleeved**: on the list, no copy in the slot. It says nothing about ownership (D-025) | Unsleeved choice per copy (D-047) | Outline badge with an availability headline |
| "I don't own it" | **Unowned**: worked out, not set. It means no original and no proxy anywhere (D-025, vocabulary §3) | can't be set directly; it follows from choosing Unsleeved for a card with no copies | Unowned (magenta ⊖) |
| "I own it but it's elsewhere" | **Available / Alt available / Proxy available / Unavailable** (worked out) | can't be set; follows from Unsleeved | headline per D-025 |

Example: you import Prosper with Sol Ring set to Unsleeved. If you own a free Sol Ring, the deck shows **Available**. If your only one is in Korvold, it shows **Unavailable · In Korvold**. If you own none, it shows **Unowned**. The import screen shows none of this. It only says "Unsleeved".

The key gap: **"Original" on the deck import means "add a new original copy"**, not "this card is an original" [Confirmed: src/lib/manabox-deck-import.ts header: "Original and Proxy create a brand-new user_copies row… Existing owned copies are never pulled in"]. To a first-time user those read the same.

## 2. What exists today (entry points)
- **Collection import:** "Import cards" on the collection page. ManaBox CSV, every copy Original or Proxy, add-only [Confirmed: src/components/collection/CollectionImportButton.tsx; src/components/manabox-import/ImportCardList.tsx `options` = original/proxy for collection; D-050].
- **Deck import dialog** with four tabs: URL, Paste List, File, Precon [Confirmed: src/components/DeckImportButton.tsx].
  - **File and Paste** lead to the new ManaBox review screen: per copy Original / Proxy / Unsleeved, default Original, bulk type toggle in the header [Confirmed: DeckImportButton.tsx handlePasteSubmit builds a .txt file for the same flow; ImportCardList.tsx; ImportRowEditor.tsx `TYPE_STYLE`].
  - **URL and Precon** still lead to the **old** chooser: "These are new cards" / "I have this deck built: Sleeve cards from my existing collection automatically" / "This is theorycrafted: Save the decklist as Planned, with no physical allocation" [Confirmed: DeckImportButton.tsx lines ~380–425; handlePreconSubmit uses the Archidekt URL preview; src/app/api/decks/import/route.ts `built` mode "auto-pull from existing collection"].
- **Onboarding** ("Bring your collection over · Import from Archidekt or Moxfield" on the empty home page) is a separate batch importer with a per-deck **Brew / Active** toggle [Confirmed: src/app/page.tsx; src/app/onboarding/page.tsx `deckStatusOptions`].
- **Replace everything:** there is none. "Clear All Data" exists only under Settings → Developer Tools and is blocked in production [Confirmed: src/app/settings/page.tsx; src/app/api/dev/reset/route.ts returns 404 when NODE_ENV is production].
- **Review screen shows nothing about what you already own:** no owned count, no availability [Confirmed: no ownership field on review rows in src/components/manabox-import/types.ts `UiPreviewRow` = contract ImportRow; grep for "owned" in manabox-import components returns nothing].

## 3. Scenario by scenario

### Scenario 1: Migration (replace collection and decks)
**What you can do today**
- Import the collection from ManaBox (add-only) [Confirmed: D-050, ManaBoxCollectionImportDialog.tsx]. Then import each deck file one at a time [Confirmed: D-044 one deck per file].
- To mark deck cards you own without duplicating them, set every deck card to **Unsleeved**, then sleeve each card by hand from the deck page or pick list [Confirmed: D-047, D-020; manabox-deck-import.ts]. Cards with no copy then show **Unowned**, which matches "unowned by default" [Confirmed: vocabulary.md §3].
- Or use onboarding from Archidekt/Moxfield. It still uses Brew/Active wording [Confirmed: src/app/onboarding/page.tsx] and is not the ManaBox route D-044 chose.

**Gaps**
- **No replace.** You can't remove what's there, outside a developer-only tool that doesn't run in production. Importing again doubles the collection (D-050).
- **Deck cards that are in the collection can't be matched at import.** The default (Original) **doubles** every card that the collection file already contains. Unsleeved avoids that, but then a 100-card built deck needs up to 99 manual sleeve actions. Across 10 decks that is roughly 1,000 clicks.
- **No multi-file session.** A migration is one collection plus N deck files. Today that means N+1 separate imports with no combined summary.
- **Contention isn't handled.** Two migrated decks both want your one Sol Ring. Nothing says which one gets it.
- It's unknown whether a ManaBox collection export includes the cards that sit in ManaBox decks. If it doesn't, the deck cards are physical copies that need adding (New original), not matching. The right default depends on this (Question 3).

**Confusing moments**
- The empty home page sends a new user to Archidekt/Moxfield onboarding, while the collection page offers ManaBox. Two importers with different words for the same thing.
- "Original" as the default on deck rows looks harmless and silently doubles cards.

### Scenario 2: Adding cards
**What you can do today:** covered. Drop a ManaBox CSV, every copy defaults to Original, tick rows and press Proxy for proxies, and finish, condition and language come from the file or the defaults bar [Confirmed: ImportCardList.tsx bulk bar `TypeToggle`; ImportDefaultsBar.tsx; import-row-editing.md].

**Gaps**
- ManaBox CSV only. There's no paste or text list for collections (D-049 text is decks only) [Confirmed: collection picker label "ManaBox .csv", import-stage-screens.md §4.1].
- No guard against importing the same file twice (D-050 allows it on purpose). There's no "You imported collection-2026-10-13.csv on 13 Oct" hint [Approximate: nothing in the dialog records past file names].
- Rows don't show "you already own 2", which would help catch a double import.

**Confusing moments:** few. The words "Original/Proxy" are accurate here, because every copy is new and owned.

### Scenario 3a: Precon (all new)
**What you can do today:** covered via File/Paste. Defaults are Original, so pressing **Import deck** adds and sleeves everything [Confirmed: ManaBoxDeckImportFlow.tsx; result "66 cards added and sleeved", import-stage-screens.md §4.4]. Basics with no printing become generic (sleeved by default) [Confirmed: deck-basics-and-printings.md §4; manabox-deck-import.ts].

**Confusing moment:** the **Precon tab** goes to the old three-choice screen, not this review. So "import a precon" has two different experiences in one dialog, depending on the tab.

### Scenario 3b: Mix of new, already owned, and unowned
**What you can do today [Confirmed: D-047; manabox-deck-import.ts]**
- New cards → Original or Proxy.
- Already owned → Unsleeved, then sleeve by hand on the deck page (the deck shows Available / Alt available / Unavailable).
- Unowned → Unsleeved (the deck shows Unowned).

**Gaps**
- You have to **remember** which cards you own: the review screen gives no hint.
- "Already owned" and "don't own" are the same choice (Unsleeved), so the screen can't confirm you got it right.
- No bulk "I own all of these, sleeve them from my collection".
- The old URL path's "I have this deck built" does auto-sleeve from the collection [Confirmed: api/decks/import/route.ts `built`]. That conflicts with D-020/D-047 and D-031's wording, and it's the only route that does matching at all.

**Confusing moment:** marking a card you already own as "Original" adds a second copy with no warning.

### Scenario 3c: Theorycrafted (nothing sleeved)
**What you can do today:** tick the header checkbox ("Select all shown"), then press **Unsleeved** in the bulk bar. Nothing is added; the deck shows Available or Unowned per card [Confirmed: ImportCardList.tsx `handleSelectAll` and bulk `TypeToggle`].

**Gaps / confusing moments**
- The default is the opposite of what the user wants. Missing the select-all step adds 100 phantom cards to your collection, and that can't be undone from the import.
- Generic basics default to **Sleeved** [Confirmed: deck-basics-and-printings.md "A plain '11 Plains' in a file starts Sleeved"]. In a theorycrafted list they should arguably be Unsleeved too (Question 6).

## 4. Recommended direction (three options, recommendation first)

### Option A (recommended): Start with intent, review with ownership in view
- **One question before the file picker:** "What are you doing?"
  - Adding cards to my collection
  - Adding a deck, with a follow-up:
    - All new to my collection (precon)
    - Some new, some I already own
    - Just the list, nothing is sleeved
  - Start fresh (replace my collection and decks)

  The answer **only sets defaults and wording**. Every card stays editable, which keeps D-045/D-047 per-card control. Principle: match the system to the user's task (Nielsen #2), plus error prevention through safe defaults (#5).
- **Show what you own on every deck row:** "In collection: 2 · 1 free" (quiet text, D-014).
- **Name what each choice does, in the deck review only:** New original · New proxy · **From collection** (new) · Unsleeved.
  - **From collection** sleeves a free copy you already own: the exact printing first (D-021), and only then another printing, marked "other printing · Change". It is greyed out when no copy is free, with the reason given, e.g. "Your only copy is in Korvold".
- **Under each choice, a one-line consequence** in the locked words, e.g. "⊖ Unowned on the deck until you add or proxy it" or "🔒 Unavailable · In Korvold". Unowned is then *explained* at the point of choice, not set as a separate flag.
- **Bulk:** "Set to: … From collection" on ticked rows, plus one header shortcut, "Use my copies where free".
- **Defaults per path:**

  | Path | Default for each card |
  |---|---|
  | Precon | New original |
  | Some I own | From collection where a copy is free; otherwise Unsleeved |
  | Just the list | Unsleeved |

- **Start fresh** is a separate guided session:
  1. Collection file.
  2. Deck files, added one or several at a time, each reviewed as "Some I own" against the *incoming* collection.
  3. A final screen that names what is removed and what is added, kept items listed, typed **REPLACE** to confirm.

  Nothing is removed until that confirmation, and a failure leaves the old data in place. This satisfies AGENTS rule 5 and D-006 (explicit owner confirmation) as a product behaviour.
- **One deck importer:** URL and Precon should feed this same review screen. Retire the old three-choice screen and the Brew/Active onboarding wording.
- What you'd see differently: one extra question up front. One extra column on deck rows. Theorycrafted and migration become one or two clicks instead of hundreds.
- Trade-off: needs owner sign-off to amend D-047 ("never pulled in automatically") and D-050 ("never replaces"). The deck review row gets wider.

### Option B: Same intent question, keep import add-only, sleeve afterwards
- The same up-front question and "In collection" hint, but the review keeps today's three choices.
- After import, the result screen offers **"12 cards on this list are free in your collection. Sleeve them now?"** with a preview list and Confirm. This is an explicit action after import, so it fits D-020 and D-047 as written. Start fresh is the same as Option A.
- What you'd see differently: decisions are split across two screens. "Already own" can't be told apart from "don't own" until after import.
- Trade-off: no change to D-047, but more steps. Migration still means one confirm per deck.

### Option C: Wording and defaults only
- Rename the deck choices to "Add original / Add proxy / Unsleeved".
- Add a one-line explainer above the deck list.
- Show a warning in the footer when the import would add copies of cards you already own ("8 cards you already own will be added again").
- Point the home page at ManaBox.
- No replace path: migration still needs a developer reset.
- Trade-off: cheap and changes no decisions, but scenarios 1 and 3b stay largely manual.

Mockup (Option A, low fidelity): `docs/oracle/mockups/import-scenarios.html`. It has three panels: the first question, a deck review with ownership facts, and the guarded replace.

## Changed files
- docs/oracle/mockups/import-scenarios.html — low-fidelity mockup of Option A (intent question, own-aware deck review, guarded replace)
- docs/oracle/reports/2026-10-22-designer-import-scenarios.md — this report

## New decisions made (need owner confirmation)
- N1. An up-front "What are you doing?" choice that sets defaults only (Option A/B).
- N2. Deck review rows show "In collection: N · M free" (quiet).
- N3. A fourth per-copy choice, **From collection**, which sleeves an existing free copy, preferring the exact printing (amends D-047; Option A only).
- N4. Deck-review labels "New original / New proxy" instead of "Original / Proxy". The collection import keeps "Original / Proxy". This is an import-only wording change; D-043 badges are unchanged.
- N5. A consequence line under each choice, using the D-025 availability words.
- N6. Theorycrafted path defaults every card to Unsleeved.
- N7. A "Start fresh" path. It replaces the collection and decks only after a review summary and typed confirmation; nothing is removed on failure (amends D-050 for this path only).
- N8. URL and Precon tabs use the same review screen; the old new/built/theorycrafted chooser and the onboarding Brew/Active toggle are retired.

## Assumptions
- A ManaBox deck export is a list. It doesn't say whether the cards are physically in that deck.
- "Mark which cards are owned and which are not" means owned = a copy exists (Original or Proxy), and unowned = shown on decks, not stored as a flag. This matches D-025.
- The ownership facts and From collection need data the review screen doesn't have today. That is a contract question for the Architect, not designed here.

## Challenges to locked decisions
- **D-047**: "Existing owned copies are never pulled in automatically" leaves scenarios 1 and 3b with one manual sleeve per card. Evidence: manabox-deck-import.ts header; no ownership data on review rows. Suggested change: allow an explicit **From collection** choice on the review screen, visible and editable per copy before import. It is a default only on the "Some I own" and migration paths. Option B avoids this change.
- **D-050**: "Collection import never replaces the collection". Scenario 1 needs replace. Evidence: the only route to clearing data is a developer tool that is blocked in production (settings page, api/dev/reset). Suggested change: keep normal collection import add-only, and add a separate Start fresh path with the safeguards in N7.
- **D-020 / D-031 vs current code**: the URL/Precon "I have this deck built" choice auto-sleeves from the collection, and its wording ("Planned", "theorycrafted") is retired by D-031. Evidence: DeckImportButton.tsx; api/decks/import/route.ts `built`. Suggested: route these tabs through the ManaBox review (N8). This is a consistency fix, not a new rule.
- **D-052**: already flagged as superseded by the commander selector spec; no new evidence.

## Open questions (for the owner: behaviour, not implementation)
1. **Matching at import:** when a deck card is already in your collection and a copy is free, should the import offer to sleeve that copy (Option A), offer it right after import (Option B), or leave you to sleeve it on the deck page (today)?
2. **Start fresh:** when you replace everything, what should survive? For example: deck notes, deck history, Brew sessions and advisor chats, game debriefs, chosen art, storage locations. Proposed: only settings survive.
3. **Your ManaBox data:** when you export your ManaBox collection, are the cards that sit in your ManaBox decks included? If yes, migrated decks should use cards from the collection. If no, they are extra physical cards and should be added as new.
4. **Contention in a migration:** two decks both list your only Sol Ring. Should the first deck imported get it (the other shows Unavailable · In Korvold), or should you pick on a summary screen before confirming?
5. **Other printings:** if you own Command Tower but not the printing the deck lists, should From collection use your other printing automatically, or leave the card Unsleeved (the deck shows "Alt available")?
6. **Theorycrafted basics:** in a "Just the list" deck, should generic basics start Unsleeved too, or stay Sleeved as today?
7. **Duplicate warning:** when a collection or deck import would add a copy of a card you already own, should the review screen point it out? (Quiet note, or a footer count like "8 cards you already own will be added again".)
8. **Precon tab:** should the Precon and URL tabs use the same review screen as files, so every deck import looks the same?
9. **Proxies in a migration:** should the migration's deck review offer New proxy for cards that aren't in the collection (you know you've printed them), or should all of those start as Unowned and be handled on the deck?

## Verification
- Read AGENTS.md, ~/agents-shared/designer.md, .agents/project/designer.md, decisions.md, specs/vocabulary.md and the five named specs — done.
- `grep`/`sed` over src/components/manabox-import/*, src/components/DeckImportButton.tsx, src/components/collection/CollectionImportButton.tsx, src/app/api/decks/import/route.ts, src/lib/manabox-deck-import.ts, src/app/onboarding/page.tsx, src/app/page.tsx, src/app/settings/page.tsx, src/app/api/dev/reset/route.ts — read only; findings cited above.
- No code built, no database touched, decisions.md not edited. Mockup is a static HTML file with no build step.
