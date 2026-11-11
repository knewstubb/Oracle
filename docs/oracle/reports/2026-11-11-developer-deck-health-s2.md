# Developer report: Deck health S2 "Commander targets"

## Role
Developer

## Status
DONE. The cache table migration is written but **not applied**: Gene needs to apply it. E2E was not run, and it was not checked in a browser.

## Task as received
Build slice S2 ("Commander targets") of Phase 2 Deck health in the Oracle app. Work on a new branch deck-health-s2 off current main; push it; do NOT merge. Read first: AGENTS.md, docs/oracle/process.md, docs/oracle/briefs/daily-use-deck-advisor.md (sections 17-19, including the typical-numbers source decision at the end of 19), docs/oracle/contracts/deck-health-phase2.md (all of section 1 incl. 1.4, 1.7 cache table, 1.8 refresh rules; section 7 'S2' tests; section 8 'S2' and the 'S2 Developer task'), docs/oracle/reports/2026-11-11-architect-archidekt-typical-numbers.md and docs/oracle/reports/2026-11-11-architect-amend-deck-health-contract.md, and the S1/S3 reports. Owner decisions: typical numbers come from EDHREC's average deck first, then EDHREC's estimate (scale-up), then the General guide. If EDHREC is unreachable: show last saved numbers with "may be out of date"; if nothing saved, "General guide (couldn't reach EDHREC)". Lands must also become commander-specific. Migration: owner APPROVED (2026-11-11) creating public.ref_commander_role_targets as drafted in contract 1.7; write it as a migration file; apply it only if the normal process allows the Developer to; if unsure, do not apply and say so. Do the S2 Developer task first (sample about 15 commanders, read-only, throttled) and put the table in the report; tune thresholds from it; if the average deck is unusable, stop and report. Tests per contract 7 S2 using saved fixtures; never touch live data. Run typecheck, lint, unit tests. Write this report with owner check steps. Commit and push.

## Summary for the owner
Deck health now compares each deck with what players of **its own commander** usually run, using EDHREC's average deck for that commander. Lands are included, so a landfall deck like Hearthhull is judged against 41 lands and Mendicant Core against 34. The panel says where the numbers come from, for example "EDHREC average deck, 17,659 decks". For rare commanders with too little data, it falls back to the general guide and shows a "Card types" list instead. If EDHREC can't be reached, it shows the last saved numbers marked "may be out of date", or "General guide (couldn't reach EDHREC)" if nothing is saved yet.

**One thing for Gene:** the new storage table (approved by you) is written but **not yet added to the database**. Until it is, the app still works, but it asks EDHREC fresh each time Deck health opens (about half a second extra) instead of remembering the numbers for two weeks.

### Owner check steps
(after Gene applies the table and the branch is running)
1. Open the **Mendicant** deck and press Deck health. Under the verdict it says **"EDHREC average deck, 17,659 decks"**. Each role row says "EDHREC average deck" underneath, and the wording is "Average is 12; you have 5." For Mendicant today: ramp 5 of 12 (Light), draw 14 of 13, removal 2 of 3, wipes 1 of 1, lands 33 of 34.
2. Open **Mendicant 2**. It shows the same source line (that deck has no commander row, so the deck's commander name is used).
3. Open the **Landfall** deck (Hearthhull). Its Lands row says "Average is **41**", not 34 or 36, so lands differ by commander.
4. The Strategy row says "Not set yet, using typical numbers".
5. Open a deck whose commander is rare on EDHREC (none of yours today; Tobias Andrion was one tested). It says "General guide" and shows a **Card types** block: "Creatures: you have X · usually Y", with "EDHREC averages, N decks" underneath.
6. Optional: switch off the network and press Recheck on a deck you've opened before. The numbers stay, with ", may be out of date" added.

## The S2 Developer task: sample of EDHREC data (contract section 8)
Read-only, at least 1 second between requests, run on 2026-11-11 with `scripts/sample-edhrec-typical-numbers.ts`. For each commander it fetched both files, the average deck (A) and the commander page (B), so the two methods could be compared. This means two requests per commander in the sample, not one. In the app, B is fetched only when A can't be used. Card text came from our `ref_cards` table. Role columns are ramp/draw/removal/wipes/lands.

| Commander | Tier | Avg deck HTTP | Total | Lands (basics) | Decks | Non-land cards without text | (A) average deck | A usable | (B) estimate | B classified / coverage / scale | B status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Atraxa, Praetors' Voice | popular | 200 | 100 | 36 (13) | 46,230 | 0/63 | 15/9/6/2/36 | yes | 14/7/7/3/36 | 206 / 0.54 / 1.86 | ok |
| The Ur-Dragon | popular | 200 | 100 | 35 (9) | 51,789 | 0/64 | 20/6/5/3/35 | yes | 22/7/5/2/35 | 162 / 0.57 / 1.75 | ok |
| Edgar Markov | popular | 200 | 100 | 36 (15) | 52,710 | 2/63 | 7/8/7/2/36 | yes | 9/9/7/2/36 | 186 / 0.63 / 1.58 | ok |
| Krenko, Mob Boss | popular | 200 | 100 | 35 (30) | 45,209 | 0/64 | 4/5/12/2/35 | yes | 6/5/8/1/35 | 179 / 0.65 / 1.54 | ok |
| Yuriko, the Tiger's Shadow | popular | 200 | 100 | 30 (15) | 31,795 | 4/69 (6%) | 6/12/2/0/30 | yes | 6/10/4/1/30 | 176 / 0.63 / 1.59 | ok |
| Mendicant Core, Guidelight (owner) | mid | 200 | 100 | 34 (16) | 17,659 | 1/65 | 12/13/3/1/34 | yes | 13/12/2/1/34 | 194 / 0.61 / 1.64 | ok |
| Rocco, Cabaretti Caterer (owner) | mid | 200 | 100 | 35 (14) | 10,234 | 1/64 | 22/7/7/1/35 | yes | 20/6/7/1/35 | 169 / 0.48 / 2.07 | ok |
| Hearthhull, the Worldseed (owner, landfall) | mid | 200 | 100 | 41 (15) | 33,879 | 1/58 | 19/8/9/2/41 | yes | 18/6/9/2/41 | 134 / 0.72 / 1.40 | ok |
| Zhulodok, Void Gorger (owner) | mid | 200 | 100 | 36 (9) | 21,788 | 1/63 | 16/12/7/0/36 | yes | 19/11/8/0/36 | 159 / 0.77 / 1.30 | ok |
| Baylen, the Haymaker (owner) | mid | 200 | 100 | 35 (16) | 30,011 | 1/64 | 8/6/7/0/35 | yes | 14/5/6/2/35 | 180 / 0.49 / 2.03 | ok |
| Sephiroth, Fabled SOLDIER (owner, double-faced) | mid | 200 | 100 | 34 (26) | 32,531 | 2/65 | 9/8/3/2/34 | yes | 11/10/5/2/34 | 174 / 0.67 / 1.50 | ok |
| Thrasios + Tymna (partners) | partner | 200 | 97 listed, 100 after fix | 27 listed, 30 by EDHREC (3 basics left out) | 11,553 | 1/68 | 21/6/4/1/30 | no (97) before fix, yes after | 22/3/6/1/30 | 146 / 0.74 / 1.35 | ok |
| Jedit Ojanen | obscure | 200 | 100 | 39 (26) | 61 | 1/60 | 10/6/4/2/39 | yes | 12/7/2/2/39 | 157 / 0.38 / 2.61 | thin (coverage) |
| Tobias Andrion | obscure | 200 | 100 | 36 (25) | 90 | 8/63 (13%) | 9/6/3/2/36 | no (missing text) | 17/11/3/3/36 | 131 / 0.21 / 4.73 | thin, so general guide |
| Sivitri Scarzam | obscure | 200 | 100 | 36 (24) | 65 | 5/63 (8%) | 11/15/2/5/36 | yes | 18/13/4/3/36 | 171 / 0.32 / 3.10 | thin |
| Barktooth Warbeard | obscure | 200 | 100 | 36 (23) | 654 | 0/63 | 14/13/9/2/36 | yes | 18/11/6/1/36 | 160 / 0.37 / 2.72 | thin |
| Lady Orca | obscure | 200 | 100 | 38 (27) | 59 | 15/61 (25%) | 14/12/5/1/38 | no (missing text) | 18/11/6/2/38 | 174 / 0.27 / 3.68 | thin, so general guide |
| Gosta Dirk | obscure | 200 | 100 | 37 (22) | 32 | 0/62 | 11/11/7/1/37 | no (32 decks, under 50) | 13/10/5/2/37 | 221 / 0.47 / 2.13 | thin (sample), so general guide |

Extra probes: Ayesha Tanaka 230 decks, Kei Takahashi 50 and Rasputin Dreamweaver 869 all have an average deck of 99 cards plus the commander. An unknown slug gets **403** (an S3 "AccessDenied" XML), not 404, so the client treats both 403 and 404 as "not found". Cards without text in our `ref_cards` are mostly modal double-faced lands, pathways and cards from very new sets.

**Findings:**
- The average deck is usable. Every commander tried has one, including commanders with 32 to 90 decks. It is always 99 cards plus the commander, and land counts really do differ by commander: from 30 (Yuriko) to 41 (Hearthhull). So the plan holds: A first, B second, guide last.
- A and B mostly agree within 1 to 3 per role. B over-counts where scaling is large (scale above 2, obscure commanders), which supports the thin rules.
- **Tuning**:
  - The only change is the partner case. Some partner average decks leave basics out of the card list while EDHREC's own land count includes them (Thrasios+Tymna: 27 lands listed, EDHREC says 30, 3 basics). Missing basics are now added back, but **only when EDHREC's basic count fully explains the gap**. Any other short list still fails the 99/100 check.
  - The other thresholds stay as drafted: at least 50 decks, at most 10% of non-land cards without text, estimate at least 60 classified cards, coverage at least 0.4. They separated the sample sensibly: every popular, mid and owner commander passes A, and the bad obscure cases (Tobias, Lady Orca, Gosta Dirk) fall to B, then thin, then the guide.

## Changed files
New:
- `supabase/migrations/20261111120000_ref_commander_role_targets.sql`: the approved cache table (contract 1.7), additive only, with RLS read for signed-in users and no write policy. **Not applied.**
- `src/lib/commander-targets.ts`: pure working-out. Covers (A) average deck counts (no scaling), (B) the estimate (scale-up), the thin rules, saved-row shape, freshness (14/7 days, role-rules version) and the source labels.
- `src/lib/commander-targets-server.ts`: reads and writes the cache, the source order A then B then guide, one refresh per commander at a time, the stale rule, at most one Recheck refresh an hour, stored-builds type counts, and tolerance of the table not existing yet.
- `src/lib/ref-card-text.ts`: card text lookup moved here so Deck health and the EDHREC working-out share it.
- `scripts/sample-edhrec-typical-numbers.ts`: the read-only sample script used for the table above.
- `src/lib/__fixtures__/edhrec/*.json`: trimmed copies of real EDHREC files (3 average decks, 2 commander pages) and the saved card text for every card in them.
- Tests: `src/lib/edhrec-client.test.ts`, `src/lib/commander-targets.test.ts`, `src/lib/commander-targets-server.test.ts`, `src/components/DeckHealthPanel.sources.test.tsx`.

Edited:
- `src/lib/edhrec-client.ts`: rewritten.
  - Correct slugs (front face for double-faced cards, partners sorted).
  - Correct parsing: whole-number type counts, deck count from `container.json_dict.card.num_decks`, inclusion = num_decks / potential_decks.
  - Fetches the average deck.
  - 403/404 mean not found; retries on 429/5xx; 10 s timeout; requests spaced at least 100 ms apart.
  - Refuses to call the real EDHREC from inside tests.
  - The chat tool helpers keep working.
- `src/lib/deck-health.ts`: uses the commander's typical numbers including lands; "Average is N" for EDHREC and "Guide is N" for the guide; typical 0 shows "Not usually played"; type counts include what the deck has.
- `src/lib/deck-health-server.ts`: finds the commander (commander rows, else the deck's commander name), gets the targets (injectable for tests), and imports card text from `ref-card-text.ts`.
- `src/lib/deck-health-gap.ts`: the gap detail uses the same targets, so its "typical" matches the panel.
- `src/app/api/decks/[id]/health/recheck/route.ts`: Recheck may refresh out-of-date numbers.
- `src/components/DeckHealthPanel.tsx`: each role row names its source; adds a "Card types" block when the general guide is used.
- `src/lib/deck-health.test.ts`, `src/lib/deck-health-gap.test.ts`: new cases.

## New decisions made (need owner confirmation)
- **Lands typical**:
  - From the average deck, it is the deck's land count, with basics added back as described above.
  - From the estimate, it is EDHREC's average land count (falling back to stored builds).
  - If neither gives a land number, Lands uses the guide's 36 and that row is labelled "General guide".
  - A thin or not-found commander uses the guide for all five rows.
- **Typical 0** (for example Zhulodok and Baylen have 0 wipes on average): shown as fine with the text "Not usually played". This wording isn't designed yet; **flagged to the Designer**, as the contract says.
- **Card types label**: "EDHREC averages, N decks" when EDHREC gave type counts, "Averages from N stored builds" from our stored builds, and "No stored builds yet" otherwise.
- The Card types block shows only when the general guide is used (spec 5.5).
- If the average deck can't be reached (network) but the estimate can, the estimate is shown but **not saved**, so the better average deck is tried again next time instead of being hidden for 14 days.
- Background (commander + background) pairs are treated like partners for the EDHREC name. Not tested live.
- Recheck that hits the once-an-hour limit shows the saved numbers marked "may be out of date" if they have expired.

## Assumptions
- **Migration not applied.** `.agents/project/developer.md` puts migrations in the Architect's lane, and `status.md` shows earlier migrations applied by the owner or Gene. Nothing says the Developer applies them, so I only wrote the file. A read-only check confirmed the table doesn't exist yet. The code copes:
  - Reading the table fails, so it works the numbers out live.
  - Saving fails, so it is logged and ignored.
  - Until the table exists, nothing is cached, and each Deck health check makes one or two EDHREC requests.
- In the estimate, only cards with card text count towards the inclusion total, so cards we can't read don't dilute every role. The scale makes up for them.
- Commander names come from the deck's commander rows, else `decks.commander_name` (your "Mendicant 2" deck has no commander row).
- The contract's "one request per commander" is followed at runtime when A is usable (the normal case). It becomes two only when A fails.

## Challenges to locked decisions
- None. The spec line "No role data for this commander yet." for thin data is replaced by the contract's "General guide" label, as the amended contract says.

## Open questions
- Designer: wording for a typical of 0 ("Not usually played" for now).
- Gene: apply `supabase/migrations/20261111120000_ref_commander_role_targets.sql` to the hosted project, then update `docs/oracle/status.md` (I left status.md alone because it's Gene's file).

## Verification
- `npx vitest run`: 229 files passed, 5 skipped; 2,725 tests passed, 42 skipped. New tests:
  - Client: 18 tests covering parsing of saved real JSON, slugs (double-faced, partner), 403/404 not found, retries, network failure, and no real calls from tests.
  - Working-out: 19 tests. Mendicant 12/13/3/1 and 34 lands with no scaling, quantities, commander left out, Hearthhull 41 lands, the partner basics fix, each 99/100, sample and missing-text failure, the estimate maths, each thin trigger, thin never storing numbers, and 14/7-day expiry plus role-rules version.
  - Cache rules: 17 tests. Source order, cache hit, expiry, stale "may be out of date", "couldn't reach EDHREC", network failure not saved, table missing, single refresh, and the Recheck hourly limit.
  - Deck health: 9 new tests covering EDHREC numbers, lands by commander, the lands guide fallback, typical 0, type counts, thin data, unreachable, commander lookup, and gap and panel agreeing.
  - Panel: 2 tests for the source labels and the Card types block.
- `npm run typecheck`: only the known error in `docs/oracle/contracts/card-state-actions.examples.ts`.
- `npm run lint`: 0 errors (warnings only, none in changed files: `npx eslint` on the changed files is clean).
- Live read-only check, with writes blocked by a wrapper and no table:
  - Mendicant and Mendicant 2: "EDHREC average deck, 17,659 decks"; ramp 5/12, draw 14/13, removal 2/3, wipes 1/1, lands 33/34.
  - Hearthhull: lands 41.
  - Sephiroth: average deck, 32,531 decks.
  - Tobias Andrion: General guide with "EDHREC averages, 90 decks".
- Not done: E2E (no separate test account) and a browser check. The owner's dev server on port 3000 was not touched.
- Process note: one edit to `src/lib/deck-health.ts` was made with a small script instead of the edit tool (by mistake). The result was checked by typecheck, lint and tests.
