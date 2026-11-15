# Brief: Claude connector (Gate 1)
Author: Product, drafted 2026-11-16 from the owner's request. Status: **Gate 1 APPROVED by the owner on 2026-11-16.** Gate 2 (audit) DONE; owner answers recorded in section 0 items 6-10. Gate 3 (design) **APPROVED 2026-11-16** (mockups/claude-connector.html, specs/claude-connector.md). Gate 3 answers: (1) Undo of a collection add allowed, owner only, removes only the copy Claude just added; (2) pending requests expire after 24 hours; (3) notifications are a quiet header badge only. Gate 4 slice 1 (data separation) started; nothing else built.

## 0. Approved decisions (owner, 2026-11-16)
These override the "recommended" wording elsewhere in this brief.
1. **Large edits:** Claude asks the owner first only above about 10 cards in one go. Small edits go straight through, with undo. Destructive actions (delete deck, wipe collection) are not offered to Claude at all. This confirms the proposed D-034 reading in section 12.
2. **Moving a card between decks:** Claude CAN do it, but only after the owner confirms, with the effect on both decks stated first (not suggest-only).
3. **"Recent changes by Claude" list with Undo inside Oracle:** in scope from day one.
4. **Earlier decisions:** reachable from anywhere (hosted, with login); editing is included from the start.
5. **Pending:** the D-034 amendment (covers Claude via the connector; small edits direct with undo; large edits and cross-deck moves need the owner's yes; destructive actions not offered) is NOT yet recorded in decisions.md. Gene records it at close-out (Gate 5) with owner approval.

### Gate 2 audit answers (owner, 2026-11-16; audit: `docs/oracle/reports/2026-11-16-architect-claude-connector-audit.md`)
6. **Approval:** Claude's own Allow/Deny is the everyday prompt, but Oracle's "recent changes" screen is the backstop. Big edits (above about 10 cards) and card moves between decks wait there as **pending** until the owner approves, even if Claude's prompts are switched off. Claude cannot approve its own pending changes. This supersedes section 0 item 2's "after the owner confirms" wording: the confirmation happens in Oracle.
7. **Undo window:** 7 days. If the deck changed since, Undo is refused and says why in plain words.
8. **Data separation goes first.** Per-user protection on decks, cards and copies, locking down wipe-style database functions, and owner checks on the two deck screens (status and notes) are their own step **before** the connector (new slice 0). It also protects the app today.
9. **Card-move rule.** When a card moves between decks: (a) the new position is saved; (b) the deck that lost it keeps the card in its plan as "wanted, now located elsewhere"; (c) the owner can see where it is now (which deck). Nothing is lost or duplicated (D-001, D-021).
10. **No deleting from the collection.** Claude can never remove an owned card or copy from the collection. This is the key safety line. It overrides section 5's former "add or remove a single card from the collection": Claude may **add** a card to the collection but never remove one. Removing a card from a **deck** is still allowed (the copy returns to storage, D-039), as is moving to the maybeboard.

**How rules 9 and 10 sit with existing concepts (from the audit):** a deck slot is either *planned* (wanted, no physical copy attached) or *placed/sleeved* (a specific copy attached, D-020, D-025). A cross-deck move therefore means: the copy attaches to the destination slot, and the source slot turns back into a planned slot rather than disappearing. That is how rule 9(b) is met without a new concept; the "where is it now" line comes from the copy's current deck. [Approximate: the audit did not trace whether the existing move path (`reassign_to_deck`) always leaves the source slot planned; Architect must confirm in the contract.] Today's removal paths (`remove_deck_card_with_release`, `apply_ai_deck_delta`) release copies to storage and never delete them; the collection-delete functions (`delete_user_copy`, `delete_user_copies`, `replace_collection`) must be unreachable from the connector. Moving to the maybeboard (S6) still releases the copy to storage (D-005, D-039); it is not a cross-deck move.

## 1. What this is, in plain words
A **connector** is a plug-in that lets a Claude chat app (Claude on the web, phone, desktop, or Claude Code) read and change Oracle's data while you chat. It runs on the internet, so it works from anywhere, and it asks you to log in to Oracle first.

(In technical circles this is called an "MCP connection". Same thing; the owner never needs to use that word.)

## 2. Problem
Oracle's own chat uses a paid, pay-per-use AI service. The owner already pays for a Claude subscription and would rather use that. Today Claude chats cannot see or touch Oracle's decks and collection, so the owner has to copy and paste between them.

## 3. Goals
1. In any Claude app, the owner can ask about their decks and collection and get answers from Oracle's real data.
2. The owner can also make changes from Claude (add or remove cards, manage the collection, proxies and the maybeboard), safely.
3. It works from phone, web, desktop and Claude Code, not only at home.
4. It is built so each future user sees and edits only their own data.

Oracle's own in-app AI chat is **out of scope** and keeps using the paid service.

## 4. Scenarios
| # | Who / when | What they have | What they want |
|---|---|---|---|
| S1 | Owner on their phone on the train, in Claude | The Oracle connector switched on | Ask "what's in my Korvold deck?" and get the real list |
| S2 | Owner at a game store, in Claude | A deck and a collection | Ask "do I own a Sol Ring that isn't in a deck?" and be told where each copy is |
| S3 | Owner brewing at their desk, in Claude desktop | A deck missing a few cards | Say "add Swords to Plowshares and Path to Exile to Rocco" and see them added |
| S4 | Owner changes their mind | A card Claude just added | Say "undo that" and have it reversed |
| S5 | Owner tidying up | A card marked as a proxy by mistake | "Make my Mana Crypt in Prosper an original" (or the reverse) and see it change |
| S6 | Owner moving a card to the maybeboard | A card in the main list | "Move Rhystic Study to Rocco's maybeboard" and the copy goes back to storage as it does today (D-005, D-039) |
| S7 | Owner uses Claude Code | Same account | The same reads and edits as in the chat apps |
| S8 | Someone without the owner's login tries to connect | The connector address only | They are refused and see nothing |
| S9 | Future: a second person joins | Their own account | They see and edit only their own decks and collection, never the owner's |

## 5. Which actions Claude can take
**Read (no changes):**
- List decks, with deck state and how many cards are sleeved.
- See a deck's cards, commander, maybeboard and proxies.
- Search the collection and see where each copy is (which deck, or storage), original or proxy, printing and finish.
- See what is short (original-copy shortages, D-027/D-037) and what is spare.
- Look up card facts and prices (prices labelled as estimates, D-035).

**Edit (changes data):**
- Add a card to a deck (as a planned slot; it never moves a copy you own).
- Remove a card from a deck (its copy goes back to storage, D-039).
- Move a card between the main list and the maybeboard.
- Add a single card to the collection (**never remove** one; see section 0 item 10).
- Mark a copy as Original or Proxy; create a proxy for a deck slot (D-026).
- Sleeve a free copy into a deck slot, or move a copy from one deck to another, only when the effect on both decks is stated first (D-033).

**Never available to Claude:**
- Deleting a deck, emptying a deck, clearing or replacing the collection.
- Removing any owned card or copy from the collection (section 0 item 10).
- Bulk imports that replace or clear anything (D-050 stays: imports only add).
- Anything that touches another person's data.
- Changing the AI's own permissions or the login.

## 6. Safety expectations
1. **Every edit can be undone**, and each change is recorded as made by AI, the same as D-034 and D-009. Claude tells you what it changed in plain words after each edit.
2. **Claude apps usually ask the owner to approve each action.** Oracle must not rely on that: the owner can switch that prompt off in Claude. So Oracle itself must stay safe either way.
3. **Small, specific edits only.** One card or a short named list per action. A large edit (for example more than about 10 cards in one go) needs an explicit "yes" from the owner before it happens.
4. **No destructive bulk operations without approval** (AGENTS.md rule 5): nothing that deletes everything, clears a deck, wipes the collection, or "clear and recompute". These are not offered to Claude at all in this first version, rather than offered behind a prompt.
5. **Warn, don't silently break.** If an edit would leave another deck short by one, Claude must say so before doing it (same promise as the Use-what-I-own brief). Unknown prices are never shown as zero or as fact (D-030, D-035).
6. **Failures are said out loud.** If a lookup fails, Claude is told it failed; it is never told "you own none" or "empty" (D-030).
7. **Testing never touches the owner's real data.** It runs against the separate test account (process.md Gate 4).

## 7. Login and access expectations
- Connecting from Claude takes the owner to Oracle's normal sign-in the first time, then stays connected until the owner disconnects it.
- The owner can see that the connector is active and **switch it off** at any time, which ends all Claude access immediately.
- Claude only ever reaches the data of the person who logged in. Not "everyone's data but filtered by Claude" — it must be impossible to see another person's data even if asked.
- Today there is one user. The design must not assume one user (AGENTS.md: do not block multi-user).
- If the login expires, Claude says so and asks the owner to reconnect, rather than failing quietly.

## 8. Scope
**In:** online connector; sign-in; reads listed in section 5; edits listed in section 5; undo; AI-source recording; a way to switch it off; a plain-language setup guide for connecting Claude web, phone, desktop and Claude Code; testing on the test account.

**Out:**
- Oracle's own in-app AI chat and its paid AI service.
- A public sign-up for other people (only making sure it is not blocked).
- Imports through Claude (file imports stay in Oracle's import screen).
- Deleting decks, bulk or destructive actions.
- Buying cards, price alerts, or posting to other sites.
- New Oracle screens, other than a simple connector on/off and "recent changes by Claude" view, whose need is a Gate 3 design question.

## 9. Success criteria
1. From a phone with no access to the owner's computer, the owner connects Claude, asks for a deck's list and gets it correct.
2. The owner adds a card to a deck from Claude, sees it in Oracle, and undoes it from Claude or Oracle; the deck is as before.
3. A card removed by Claude returns to storage, not deleted (D-039).
4. Asking Claude to "delete everything" or "clear my collection" is refused, and nothing changes.
5. Someone who is not logged in gets nothing.
6. A second test account cannot see or change the first account's data by any request.
7. Every change made through Claude appears in a "made by AI" record the owner can look at.
8. The owner's existing Oracle features and in-app AI chat work exactly as before.

## 10. What must never happen
- Losing or duplicating a card (a copy exists once, in one place, D-001/D-021).
- A Claude edit changing someone else's data.
- A change that cannot be undone.
- Silent failures presented as "none" or "empty".
- Claude edits made against the owner's live data during testing.

## 11. New words (to add to vocabulary.md once approved)
- **Connector:** the plug-in that lets a Claude app use Oracle's data.
- **Made by AI:** a change recorded as coming from Claude (or Oracle's chat), so it can be listed and undone.

## 12. Challenges to locked decisions
- **D-034** says AI changes may be applied **without a confirmation step**, provided undo exists. The chat-add-cards work (Developer report 2026-11-12) already moved to "owner clicks Add per suggestion" and flagged D-034 for amendment, not yet recorded. A connector is outside Oracle's own screens, so a per-suggestion Add button does not exist here. **Proposed reading for the owner to confirm:** small edits happen straight away with undo (D-034 as written); large edits need a "yes"; destructive ones are not offered. This differs from chat-add-cards' stricter rule, so the two should be reconciled.
- **D-034 is silent on external AI.** It was written for Oracle's own advisor. Confirm it also covers Claude working through the connector.
- **D-009** (every placement carries a source) helps: the connector needs its own source value so changes are tagged. Not a conflict.
- **O-002** (multi-user scale and write races unvalidated) is open and becomes more relevant once edits come from outside. Not locked; flagged only.
- **D-020, D-050** (no automatic allocation, imports only add): respected; Claude gets no automatic allocation or replace-style import.
- No other locked decision is in conflict.

## 13. Open questions for the owner (behaviour only)
1. **Large edits.** If Claude wants to change many cards at once (for example "cut 15 cards from Rocco"), should it ask you first every time, only above a size you choose (recommended: about 10 cards), or never?
2. **Moving copies between decks.** Should Claude be able to move a physical card from one deck to another, or only suggest it and leave the move to you in Oracle? Recommended: suggest only at first, because it leaves another deck short.
3. **Seeing what Claude did.** Is a simple "recent changes by Claude" list with an Undo button in Oracle needed on day one, or is "undo by telling Claude" enough? Recommended: the list, since phone use makes it harder to check.

## 14. Risks
- **Approval prompts can be switched off** in Claude, so Oracle's own limits must carry the safety.
- **Online access raises the stakes:** the data is reachable from anywhere, so login, expiry and the off-switch matter more than at home.
- **Future multi-user:** data separation must hold for the connector too, not only the screens.
- **Claude may misunderstand** ("remove Sol Ring" when it is in three decks). Mitigated by naming the deck and card back in plain words after every edit.
- **Subscription limits:** Claude plans have usage caps; heavy use may hit them. Not Oracle's control.
- **Data model quirks** (copies vs cards, printings vs cards, D-003/D-004) can confuse an outside AI and cause wrong edits; the audit should check what Claude needs to be told.
- **Provider changes:** the connector standard and each Claude app's support for it can change, and support varies by plan and app. To be confirmed at audit.

## 15. Proposed order
1. Owner approves this brief (Gate 1).
2. Audit (Architect, read-only): what Oracle already exposes, login and data-separation state, where edits are recorded and undone, any dead code.
3. Design (Designer): the on/off and recent-changes view if wanted; owner approves.
4. Build in slices (Developer, Tester): (0) data-separation fixes first (section 0 item 8; migrations need owner approval); (a) connect and sign in, read-only; (b) separation test with two accounts; (c) safe edits with undo; (d) switch-off and setup guide. Owner sees each slice.
5. Close-out: owner click-through from phone and Claude Code.

## 16. Summary for the owner
This adds an online plug-in so your Claude subscription can read and edit Oracle from anywhere, after you log in. Claude can add and remove cards, manage proxies, the collection and maybeboards, but can never delete decks or wipe anything, and every change can be undone and is recorded as made by AI. Each person only ever sees their own data, so a public version is not blocked. Oracle's own chat stays on the paid AI service. Please answer the three questions in section 13, and confirm how D-034 should read for Claude (section 12).
