# Brief: Use what I own (Gate 1, for owner approval)
Author: drafted 2026-11-02 from the owner's chat. Status: **APPROVED by owner 2026-11-02 (roadmap change and suggest-only). Nothing has been built yet.**

## 1. What this is, in plain words
Brad is scanning all 17 decks into ManaBox (lands included, proxies marked), then the rest of his collection, and importing both into Oracle. He feels he is not using his collection enough. The main thing he wants is to **chat with the AI about which cards he already owns could replace proxies or fill gaps in a deck.**

This is a small, first slice of Phase 8 (AI advisor). It reuses the existing deck chat and the advisor contract already written (T-15, T-36).

## 2. Scenarios
| # | Who / when | What he has | What he wants |
|---|---|---|---|
| S1 | Viewing a deck, asks "what could replace my proxied Eternal Witness?" | A deck with proxies; a loose collection | Real copies he owns that could take its place |
| S2 | Asks "where are the gaps in this deck?" | A deck with fewer than 100 real cards, or empty slots | Cards he owns that fit the deck's colours and plan |
| S3 | Asks about a card whose only real copy is in another deck | Korvold holds the only Sol Ring; Rocco has it as a proxy | To be told, and to decide |
| S4 | Nothing he owns fits | Gaps remain | Cards worth buying, with an estimated price |

## 3. Answers are grouped three ways
1. **Spare:** you own a real copy that is in no deck. Listed first.
2. **In another deck:** shown below Spare, with a warning. For example: "Sol Ring is in Korvold. Using it here leaves Korvold short by one." (Owner decision 2026-11-02: a warning is enough; these are not hidden.)
3. **Buy:** you own no real copy. Prices are Scryfall estimates, labelled as estimates (D-035).

## 4. What must never happen
- Suggesting a card the owner does not have as if he owned it.
- Showing an unknown price as zero or as a fact.
- A swap that silently loses a card, or leaves another deck short without saying so.
- Testing against the owner's live data (use the test account).

## 5. What this needs first
- All 17 decks and the loose collection imported, with every deck card marked as a new copy (otherwise the import tries to take it from another deck and stops).
- The import review screen finished and merged (owner approval).
- Architect to confirm whether "physically in Korvold, claimed by Rocco" can be stored today (see section 6).

## 6. Open questions for the owner
- **Shared cards (answered in chat 2026-11-02):** a real card has one physical home. Other decks may claim it as a plan. It only moves when logged, and the deck that loses it then shows as short. Whether the current data model can hold the claim is for the Architect to check; any data change comes back for owner approval. No locked decision is changed by this brief.
- **Swaps (answered 2026-11-02):** suggestions come first. The AI's edit ability is **kept, not deleted**, but switched off in the deck chat by default so it only suggests (D-034 still holds; applying comes later by switching it back on).

## 7. Roadmap change (owner approved 2026-11-02)
This moves a slice of Phase 8 ahead of Phases 3 to 7. Recommendation: finish only what the slice depends on (import, and Phase 2 checks), and park the rest of Phases 3 to 7 until this works on three real decks (for example Rocco and two others).

## 8. Proposed order (Gates 2 to 5)
1. **Audit (Architect, read-only):** what the chat can see today; whether proxies, spare cards and claims can be read; shared-card storage question.
2. **Design (Designer):** how the three groups appear in the chat, with one mockup covering S1 to S4. Owner approves.
3. **Build in slices (Developer, Tester):** (a) the chat knows a deck's proxies and gaps; (b) it knows which cards are spare, in other decks or unowned; (c) the grouped answer with warnings. Owner sees each slice.
4. **Close-out:** owner tries it on three real decks.

## 9. Addendum 2026-11-03: cards that moved between decks (owner direction)
**Problem:** decks get scanned out of order. A card is physically in deck B now, but Oracle still has it in deck A. Importing B today cannot save that card.

**Owner decision: the scan wins, with a check screen.**
- When a deck is imported and a card is already sleeved in another deck, the card moves to the scanned deck. The other deck then shows that card as short by one until it is scanned.
- Before saving, the import lists "N cards moved from other decks". The owner can untick any card.
- **Several copies in several decks:** if the owner has, for example, two Sol Rings and both are in other decks (Korvold and Prosper), the check screen asks which deck to pull each copy from. The owner picks per card. Where only one deck has a copy, it is chosen automatically.
- Nothing is deleted. The deck that loses a card keeps it as a planned card and is marked short.

**Open for the Architect (Gate 2):** how to store "moved, other deck now short" with the current data model, and whether a data change is needed. Any data change comes back for owner approval. No locked decision is changed by this addendum.
**Status:** wording approved by the owner in chat; not yet audited or designed. Designer: one mockup of the check screen (single move, and the pick-a-deck case).
