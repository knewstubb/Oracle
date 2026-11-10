# Brief: Vector recommendation trial (Gate 1, for owner approval)
Author: Product, drafted 2026-11-04 from the owner's decisions and the Architect's contract. Status: **APPROVED by the owner at Gate 1 on 2026-11-04** (status line updated by Gene 2026-11-06).
Sources: `docs/oracle/contracts/vector-trial-2026-11.md` (draft contract) and the four Architect reports of 2026-11-04 (vector-trial, -update, -spellbook-builds, -commander-swap).

## 1. The problem, in plain words
When Oracle suggests cards for a commander, it mostly leans on what other people play (EDHREC popularity). That finds the safe, common cards. It misses good cards that do the same job as the popular ones but are less well known, and it does not know that a card is great in one style of deck and poor in another.

## 2. The goal
Find out, cheaply and reversibly, whether a second way of finding cards ("find cards that do similar things", called vector search) plus known combos from Commander Spellbook gives better suggestions than EDHREC alone. The answer is **go** or **stop**. It is an experiment, not a feature.

## 3. Who
Brad, the only person who sees anything. He is also the judge: he grades the cards.

## 4. What Brad will see and do
No new screens and no change to the app. Brad does three things:
1. **Approves** this brief, the choice of builds, and the two deck lists used as test decks.
2. **Grades roughly 2 hours of cards, blind.** He sees plain card text with no hint of where it came from, and marks each: great / would play / marginal / wouldn't. About 230 cards (range 1.75 to 2.5 hours). Behind the scenes the cards come from three lists: EDHREC alone, vector search alone, and the two combined (with combos). He picks between pairs of lists in about 10 situations, for example "Wilhelt, Zombies build, no sacrifice outlets yet". An assistant can pre-grade so Brad only confirms or edits.
3. **Reads one plain-language result:** go, iterate, or stop, with the numbers behind it.

If a suggested card finishes, or is one card away from, a combo, the trial results mark it with a "combo" label (credit: Commander Spellbook).

## 5. What is being tested (decisions already made)
- **Commanders:** Mendicant Core, Guidelight (white/blue) and Wilhelt, the Rotcleaver (blue/black). Each is the other's contrast.
- **Builds (styles):** suggestions are worked out per build, because a card's value changes with the style. For example, Blood Artist should rank high in Aristocrats and low in a Treasure build. Builds: Wilhelt Zombies, Wilhelt Aristocrats, and Mendicant Artifacts. A second Mendicant build is left out (it would push grading to about 2.4 hours).
- **Three signals:** vector similarity, EDHREC popularity (for the chosen build), and Commander Spellbook combos from day one.
- **Scryfall function labels (oracle tags)** such as "ramp" or "makes treasure": tested as an A/B arm (with and without). Judged separately from go/stop. Data comes from Scryfall's daily bulk download.
- **Embedding model (how card similarity is measured):** a free model run on Brad's own machine, no account, nothing leaves it.
- **Combos and Brad's preferences:**
  - The "ask before suggesting" rule applies to any combo-labelled card that is a piece of an infinite combo.
  - Combo labels can be **switched per deck**. When off, a card loses its label and its boost only. It can still be suggested on its own merit. The Architect found that every in-colour combo for both commanders is infinite or a win, so in this trial the rule effectively covers all combo labels.
  - Combo cards need to be legal, in the commander's colours, and matched by card identity, not by name.

## 6. Scope
**In:**
- A one-off offline run, with a separate store of card data for the trial.
- Loading the combo data and the Scryfall labels.
- Per-build lists for the three builds.
- Brad's blind grading and a written result.
- Syncing builds and re-pulling decks first, if missing (section 8).

**Out:**
- **Any UI change**, any new route, any change to chat or the live advisor.
- Changes to the collection, decks, or any locked data (D-001 untouched).
- Per-user taste, free-text search, and anything for the future multi-user version.
- Fixing the full card-data gaps (only a partial fix for the trial pool).
- Fixing the existing Spellbook lookup in the app (it returns blank names and sorts least popular first; the trial doesn't use it; flagged for a separate fix).
- Showing Scryfall labels to users (usage rules unclear; resolve before any user-facing use).

## 7. Success and stop criteria (from the contract)
**Go (worth a real brief and design) if all hold, for each of the three lists:**
- The combined list beats EDHREC's order by at least 0.10 on the standard ranking score (nDCG@10) and at least 7 of its top 10 are good (precision ≥ 0.70).
- At least 3 good cards in its top 20 that EDHREC's list for that build did not have (combo-only finds are counted separately).
- At least half of the top 20 are not generic staples.
- Brad prefers the combined list in at least 7 of 10 blind comparisons.
- Combos do not hurt: within 0.02 of the no-combo version, else combos stay as a label only, with no ranking boost.
- Builds matter: at least 75% of card pairs are ordered the way Brad's own grades order them across builds. If this alone fails, the result is "go for commander-level, build-awareness not proven".

**Must always be true (100%):**
- Every shown card is identified, legal, and in colours.
- Ownership labels are right.
- Combo labels are correct, including the on/off/unknown switch behaviour.
- Missing build data is shown as "no data", never as zero.

**Iterate (once):** meets some but not all, or only two of three lists pass. Try a second embedding model on the same grades.

**Stop:** the combined list fails to beat EDHREC by at least 0.05 on at least two of three lists, or vector search mostly returns look-alike cards (similar words, wrong function). Record it and keep the current EDHREC-based approach.

This is small-sample evidence (2 commanders, 3 lists, about 230 grades): directional, not proof.

## 8. Order of work
1. **Kickoff data check (Architect):** were Mendicant's and Wilhelt's builds ever loaded? The owner says builds and decks have been removed from the app. **If builds are missing, sync them first. This blocks all per-build work** (nothing per-build is simulated meanwhile). The sync only adds or updates reference data. It is a separate, owner-approved task.
2. **Re-pull decks from Archidekt** (links from Brad). These give the test deck lists.
3. **Identifier bug check** (section 9).
4. Gate 2 audit, then the trial run. Because there is no UI, Gate 3 mockup has no screen to design. The grading sheet is the only thing Brad sees. This stays proposed until Gene confirms Gate 3 is skipped.
5. Brad grades. Result report. Go/stop.

## 9. Open questions
1. **Archidekt links:** Brad to supply the deck links (Wilhelt and Mendicant) for the re-pull. Do these decks go back into the live app, or are they only used as read-only test lists for the trial? Recommendation: test lists only until the test account exists, with no write to live data without approval.
2. **Kickoff data check:** which builds actually exist now, and are they still the right ones? Brad confirms Zombies, Aristocrats and Artifacts match how he plays.
3. **Identifier bug check:** the old local database stores printing ids in a column named for the card's identity. This is the mix-up the project rules warn about. Confirm the live app is not affected. It was not used by the trial.
4. **Hosted database:** is the card-similarity feature available on the hosted database, and are the ten waiting import migrations still unapproved? The trial waits behind them.
5. **Combos with no answer yet:** when a deck has never been asked, hold back combo-labelled cards until Brad answers once per deck (the Architect's plan). Where the answer is stored in the live app needs its own design before any production use.
6. **Spellbook and Scryfall terms:** attribution and label usage rules are unclear. Fine for an internal trial, to be settled before any user-facing use.

## 10. Risks
- **Brad's time:** about 2 hours of grading. Cut to Wilhelt only (about 1.2 hours) if needed.
- **Builds missing or thin:** per-build work cannot start until they are synced.
- **Mendicant is the weakest list for combos:** only 10 known combos, all 3 cards.
- **Similar words, different job:** for example "sacrifice" vs "dies". Test cards are included to catch it.
- **Popularity is invisible to vector search:** it is combined with EDHREC to compensate.
- **Combos could crowd out the list** or be wrong for the style of deck. Capped at 20 and checked.
- **Builds picked to flatter the result:** builds are chosen by data and approved by Brad before results.
- **Scope creep into a feature:** a "go" only leads to a new brief and design, never straight to a build.
- **Reversible:** the trial can be switched off (nothing to switch), then reduced one signal at a time, and removed with separate approval. Existing data is never changed.

## 11. New words (added to `vocabulary.md` by Gene after approval)
- **Vector search / embedding:** a way of describing each card as numbers so cards that do similar things sit close together.
- **Build:** a commander's style of deck, for example Zombies or Aristocrats.
- **Oracle tag:** Scryfall's community label for a card's function, for example "ramp".
- **Combo label:** a note on a suggestion that completes or is one card from a known combo.
