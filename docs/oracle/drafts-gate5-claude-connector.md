# DRAFT: Gate 5 close-out for the Claude connector (CC-05)
Status: **APPLIED 2026-11-17 (superseded by the records).** Owner approved; sections 1-3 are now in decisions.md (D-034a), AGENTS.md and specs/vocabulary.md. Section 4 (click-through) is still the one open owner step. Written by Gene, 2026-11-17.

## 1. D-034 amendment (new entry for decisions.md, placed after D-034)

> - **D-034a** **D-034 also covers Claude working through the connector (Claude apps and Claude Code).** Small edits go straight through and can be undone from Oracle's Recent changes screen for 7 days (undo is refused, with a plain-words reason, if the deck has changed since). Big edits (more than about 10 cards in one go) and moving a card from one deck to another do not happen until the owner approves them in Oracle; they wait there as pending for 24 hours, then expire. Claude cannot approve its own pending changes, and this holds even if Claude's own Allow/Deny prompts are switched off. A moved card is saved in its new deck and stays in the old deck's plan as wanted but now elsewhere, with its location shown. Claude can never delete a deck, a collection card or a copy, and can never replace or wipe the collection; Claude may add a card to the collection (undo removes only the copy it just added, owner only). Removing a card from a deck stays allowed (the copy returns to storage, D-039). Every Claude change is recorded with its own source value (D-009) so it can be listed and undone. Amends D-034; reconciles it with the stricter "owner clicks Add" rule in Oracle's own chat. *(Owner-approved 2026-11-16, Gate 1 items 1-3 and Gate 2/3 answers 6-10; recorded at Gate 5.)*

Also append to the D-034 line: "See D-034a for the connector."

## 2. Correction of the false "get_collection_rollup is live and confirmed working" line

- **AGENTS.md, line 34.** Currently: "`get_collection_rollup` RPC is live and confirmed working". The function was unused and was dropped from the live database on 2026-11-16 (CC-03b, undo script saved). Proposed replacement:
  > - Collection totals are computed by the app from `user_cards` and `user_copies`; the old `get_collection_rollup` function was unused and was removed on 2026-11-16 (CC-03b).
- **decisions.md.** I searched it: the "live and confirmed working" line is NOT in decisions.md, only in AGENTS.md. Proposed: no change to decisions.md for this point. (Tell me if you were thinking of a different line.)

## 3. vocabulary.md entries
The file is `docs/oracle/specs/vocabulary.md`. Proposed new rows, same style as the existing table:

| Word | Meaning |
|---|---|
| **Connector** | The plug-in that lets a Claude app use Oracle's data. Switched on or off in Oracle. |
| **Made by AI** | A change recorded as coming from Claude (or Oracle's chat), so it can be listed and undone. |
| **Recent changes** | The screen listing what Claude changed, with Undo for 7 days. |
| **Pending** | A big edit or card move waiting for the owner's yes in Oracle; expires after 24 hours. |
| **Needs reconnecting** | The connector was switched off (which signs Claude out on purpose); switching it back on needs Claude to sign in again. |
| **Wanted, now elsewhere** | A deck slot whose card was moved to another deck; the plan keeps it and shows where it is now. |
| **Not marked active by you** | What Claude says about a deck whose manual Active flag is off (the default). Claude also gives the deck's readiness. |

Note for owner: Claude's deck list uses Draft / Assembling / Playable, but D-059 says the deck states are Unowned cards / Assembling / Playable. The connector currently reuses the older readiness helper. Small mismatch; I suggest a follow-up to align the connector's words with D-059.

## 4. Owner click-through checklist (from the brief's scenarios)
Do these once, in order; tell Gene pass or fail for each.
1. **Connect (S1, S7, S8):** In Oracle's Claude connector page, follow the Setup guide on the web or desktop. In Claude, ask "What's in my Korvold deck?" You should see the real list. Then open the connector address in a private window without signing in: you should be refused.
2. **On the phone (S1):** After adding it on desktop, open Claude on your phone and ask the same question. (Adding from the phone is beta, so skip if it won't add.)
3. **Where is my card (S2):** Ask "Do I own a Sol Ring that isn't in a deck?" Claude should say where each copy is.
4. **Small edit (S3):** Ask "Add Swords to Plowshares and Path to Exile to Rocco." They appear in the deck and in Recent changes.
5. **Undo (S4):** Ask Claude to undo, or press Undo in Recent changes. The cards go away.
6. **Original / proxy (S5):** "Make my Mana Crypt in Prosper an original." The copy type changes; undo it.
7. **Maybeboard (S6):** "Move Rhystic Study to Rocco's maybeboard." The copy returns to storage.
8. **Big edit waits:** Ask Claude to add 12+ cards at once. Nothing changes until you approve it under Pending in Oracle.
9. **Card move waits:** Ask Claude to move a card between two decks. It waits for you; after approving, the old deck shows it as wanted, now elsewhere.
10. **No deleting:** Ask Claude to delete a deck or remove a card from your collection. It should say it can't.
11. **Switch off and on:** Switch the connector off; Claude can no longer see your decks. Switch it on; it says Needs reconnecting, and signing in again works.
12. **Deck list wording:** Ask "List my decks." Every deck appears, each "not marked active by you", with Draft, Assembling or Playable.

## 5. The one approval needed
Approve (or edit) sections 1-3 so Gene can write them into decisions.md, AGENTS.md and the vocabulary, and close the Claude connector (CC-04, CC-05) once you have done the checklist.
