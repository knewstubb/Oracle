# Report: vector-trial-commander-swap
Role: Architect
Status: PARTIAL
Task as received: Read AGENTS.md and your role files, then update docs/oracle/contracts/vector-trial-2026-11.md (still DRAFT, no approved brief, build nothing, status PARTIAL) and write docs/oracle/reports/2026-11-04-architect-vector-trial-commander-swap.md in the standard format. Owner decisions (all final): (a) Replace Prosper and Korvold with two other commanders the owner knows well: 'Mendicant Core, Guidelight' and 'Wilhelt, the Rotcleaver' (verify exact names/oracle_ids via Scryfall and the repo, and check colour identity; recompute the candidate pool, colour-fit stats for combos, and pool size). They also serve as each other's contrast commander. (b) Per-build design stays: use EDHREC builds for each commander (verify what exists in ref_commander_builds / ref_build_cards; cannot access DB so keep the kickoff data check); choose builds sensibly (up to 2 per commander only if grading effort stays about 2 hours; state the effort). (c) Owner answers to open questions: infinite-combo 'ask before suggesting' rule DOES apply to a card that is a piece of an infinite combo carrying a combo label; combo labels must be switchable off per deck; 'Commander Spellbook' credit on combo labels is fine; if builds were never synced, recommend sync first (blocking per-build work) and state that as the plan. Update the evaluation set (deck-dependent cards, multi-feature cards, combo hits frozen lists) to use these commanders, replacing all Prosper/Korvold references; keep examples in docs consistent. Plain-language owner summary, no code or paths; list remaining open questions (e.g. whether the owner has current deck lists for these commanders).

## Summary for the owner
The trial now uses Mendicant Core, Guidelight (white/blue) and Wilhelt, the Rotcleaver (blue/black), each as the other's contrast; it is still a draft and nothing is built. For Wilhelt I plan two builds (Zombies and Aristocrats) and for Mendicant one (its top build, probably Artifacts), which keeps grading at about 2 hours; a second Mendicant build would push it to about 2.4 hours and probably doesn't exist in the loaded data anyway. Combo suggestions follow your rules: they are asked about first, can be turned off per deck, and credit Commander Spellbook. Three things you didn't ask about: Mendicant has only 10 known combos, all of them infinite, so combos will matter less for it; the old size estimate for the card pool was about half the real size (harmless, but corrected); and I can't confirm from here that Mendicant's builds were ever loaded, so the plan is to check first and load them before any per-build work if they're missing. Your remaining questions are listed below.

## Changed files
- docs/oracle/contracts/vector-trial-2026-11.md — Prosper/Korvold replaced everywhere by Mendicant/Wilhelt (lists renamed W1, W2, M1); pool recomputed to W/U/B (§2.1); build evidence, proposed builds and sync-first plan (§1.1, §1.3, §4B.1); combo sizes and colour-fit recomputed (§4A.1, §5.7); owner's combo rules added (§4A.5, new §4A.6, new gate 8 in §5.4); evaluation set updated (§5.2, §5.5, §5.6, §5.7 incl. new L-cross list, §5.8); risks, additional-data row, locked-decision note and handoffs updated (§5A, §7, §8, §9).
- docs/oracle/reports/2026-11-04-architect-vector-trial-commander-swap.md — this report.

No migration, types file or code was created. The earlier three reports from today are historical and were left as written (they still mention Prosper and Korvold).

## New decisions made (need owner confirmation)
- **Commanders verified.** Mendicant Core, Guidelight: colour identity W, U; oracle_id b20d74a4-0e08-4779-972a-499f1a2be15a; Commander-legal. Wilhelt, the Rotcleaver: colour identity U, B; oracle_id eada96a1-4964-4ad0-b0e3-2df08d6ae188; Commander-legal. Both read from Scryfall today; the names match the repo's spelling. [Confirmed: live Scryfall; research/edhrec-sync/build-similarity.json]
- **Pool = W/U/B, 18,561 cards, about 18,850 face rows.** Mendicant's own set 12,780, Wilhelt's 12,708, shared blue-or-colourless 7,454. Combo and colour checks use **each commander's own colours, not the pool's**, because 4 of Wilhelt's combos are white-blue-black: inside the pool but outside Wilhelt.
- **Builds: W1 = Wilhelt Zombies, W2 = Wilhelt Aristocrats, M1 = Mendicant's top build.** Wilhelt's other two builds (Reanimator, Combo) were merged away in August. A second Mendicant build is left out for effort. The owner approves the final choice at kickoff.
- **Effort stays about 2 hours (about 230 grades, range 1.75 to 2.5).** Same list count (3) and card counts as before. Wilhelt-only is about 1.2 hours; adding a second Mendicant build is about 2.4 hours.
- **Combo rules from the owner's answers.** The "ask first" rule covers any combo-labelled card that is a piece of an infinite combo (unlabelled combo pieces are not covered). Each deck has a combo state: unknown (labelled infinite-combo cards held back, one question asked), on, or off (list identical to the version without combos). New hard gate 8 tests all three states. Where the per-deck answer is stored in the live app is not designed here; it needs its own contract.
- **Deck-dependent test cards must be blue or colourless** to be gradable for both commanders (examples checked legal and in colour for both: Rhystic Study, Mystic Remora, Skullclamp, Sai, Master Thopterist, Sol Ring, Ashnod's Altar). White and black favourites such as Smothering Tithe and Blood Artist moved to the multi-feature and Wilhelt build-flip checks, where only one commander matters.
- **New check L-cross (§5.7):** one commander's combo pieces must not be labelled in the other commander's lists unless they truly fit.
- **Sync-first plan.** If either commander's builds were never loaded, loading them (the existing builds script, run for just these two, adds or updates reference rows only, no deletes) becomes a separate owner-approved task that blocks all per-build work. Nothing per-build is simulated meanwhile.

## Assumptions
- The combo numbers come from live Spellbook queries for each commander today, not the bulk file; the run recomputes them from its dated bulk snapshot. [Confirmed: live API; Approximate that they match the bulk file exactly]
- "Infinite" is judged from Spellbook's own result names, with the qualifying names fixed before the test; unclear results count as infinite (safe side).
- The local export of the hosted builds (taken 2026-09-12, 50 cards stored per build) represents what the hosted database held then; it is not the live database.
- Mendicant's expected single build (Artifacts) comes from EDHREC's public theme shares today applied to the sync's 2% rule; the August numbers may have differed. [Approximate]
- The tag lists for the two commanders were not probed; they are read at load time.

## Challenges to locked decisions
- none. D-036(b) is clarified, not challenged: the owner's answer defines its scope (labelled infinite-combo pieces). Gene may want to record that wording.

## Findings you did not ask for
- **Old pool estimate was wrong.** Earlier drafts said about 10,000 cards for the B/R/G pool; Scryfall gives 18,474 for that same colour set. No decision depended on it, and local embedding stays free, but the load is about twice as big.
- **Every in-colour combo for both commanders is infinite or a win** (10 of 10 for Mendicant, 21 of 21 for Wilhelt). So the owner's "ask first" rule effectively covers all combo labels in this trial.
- **Mendicant's combos all have exactly 3 pieces**, so it can only ever show "completes" or "1 piece away", never "combo with commander". Wilhelt has 3-, 4- and 5-piece combos; 9 of its 21 in-colour combos use Poppet Stitcher // Poppet Factory.
- **Local legacy database holds printing ids in a column named oracle_id** (the stored ids for both commanders do not match the real oracle_ids, which I checked against Scryfall). That is the identifier mix-up the project rules warn about; it was not used here and the file is a local legacy one, but worth confirming production is not affected. [Confirmed: data/oracle.db card_definitions vs live Scryfall]

## Open questions
1. **Do you have current deck lists for these two commanders?** The trial needs about 30-card fixtures for each (the Wilhelt deck "A Rot to Process" and the Mendicant deck "Arti-facts" exist in the old local copy at 84 and 87 cards, but I don't know if they are current or how you want them used). Without them, a public sample list is used.
2. **When combos are switched off for a deck, should infinite-combo cards disappear completely, or only lose their label and boost (they could still be suggested on their own merit)?** My plan is the second.
3. **When a deck has never been asked about combos, is it right to hold back the labelled combo cards until you answer?** My plan is yes, with one plain question per deck.
4. **Which builds do you actually play?** The plan picks Wilhelt Zombies and Aristocrats and Mendicant's top build from popularity; if your decks are a different style (for example an Artifacts build versus a Tokens or Clones one for Mendicant), say so before kickoff.
5. Should the combo switch's default after being asked be remembered per deck forever, or re-asked when the deck changes a lot? (Needed before any live design.)
6. Hosted-database status is still unverified: were Mendicant's and Wilhelt's builds ever loaded, and is the pending set of ten import migrations still waiting for approval? (Kickoff gate; I cannot check from here.)
7. Brief still missing: the process needs an approved brief before any design or build proceeds; Gene writes it after you confirm this plan.

## Verification
- Scryfall named lookups for both commanders — names, oracle_ids, colour identity (W/U and U/B) and Commander legality confirmed.
- Scryfall searches `legal:commander id<=wub`, `id<=wu`, `id<=ub`, `id<=u`, `id<=brg` and layout counts — 18,561 / 12,780 / 12,708 / 7,454 / 18,474 cards; 202 transform, 40 modal, 40 split, 11 flip.
- Scryfall lookups for example cards — Rhystic Study, Mystic Remora, Sai, Skullclamp, Sol Ring, Ashnod's Altar, Urza, Poppet Stitcher: legal in Commander; identities as stated.
- Live Commander Spellbook queries for each commander (every page, newest-popularity ordering) — Mendicant 10 variants, all 3 pieces, all WU, all legal; Wilhelt 35 variants (13/10/12 by 3/4/5 pieces), 21 in U/B, 14 outside (4 WUB, 6 GWUB, 4 UBR), all legal, none with templates; all in-colour combos produce infinite or win results.
- Local files read for build evidence — build-similarity and dedup files (Wilhelt's four August builds, two merged); commander-context export (Wilhelt Zombies and Aristocrats present with 50 cards each, 39 and 41 signature; Reanimator and Combo absent; no Mendicant build identifiable).
- EDHREC public page theme counts for both commanders — Mendicant 17,570 decks with Artifacts about 10% and the next theme below 2%; Wilhelt 23,078 decks with Zombies, Tokens, Aristocrats, Reanimator, Combo above 2%.
- Search of the contract for Prosper, Korvold, P1, P2, K1, B/R/G — remaining hits are only the update note, the replacement statement and a "replaces the earlier Prosper-based list" note.
- No tests or builds run (documents only). No database access; hosted data unverified.
