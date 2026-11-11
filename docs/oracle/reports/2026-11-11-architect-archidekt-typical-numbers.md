# Report: archidekt-typical-numbers
Role: Architect
Status: DONE
Task as received: Read-only feasibility study. Compare the owner's idea (average role counts from public Archidekt decks of exactly 100 cards for a commander) with the EDHREC scale-up in `docs/oracle/contracts/deck-health-phase2.md` section 1.4. Cover terms/robots/documented access, feasibility numbers, comparison, recommendation, contract changes, and the owner's stale-numbers decision. Do not edit the contract.

## Summary for the owner
Archidekt's own terms of service forbid using software or scripts to make automated searches or requests to the site, and it publishes no official public API. So I do not recommend building the "search Archidekt for decks with this commander" idea. I found a better source: EDHREC publishes a ready-made 100-card "average deck" per commander, which gives real role counts with no scaling guesswork. I recommend using that, with the scale-up as backup and the general guide last. One small decision for you is below.

## 1. Can Archidekt be used? (No, not on its terms)

- **Documented API:** none found. A web search returned only third-party wrappers, no Archidekt developer docs or API terms. [Approximate: absence of evidence]
- **Existing repo use** [Confirmed: `src/lib/archidekt-client.ts`]: the app calls `https://archidekt.com/api/...` undocumented endpoints, but only for the signed-in owner's own collection and own decks (`/collection/{id}/`, `/decks/v3/?ownerId=...`), plus single-deck import by URL the owner pastes (`src/lib/warm-start-resolve.ts`, `src/lib/url-parser.ts`). Nothing in `src/lib` or `scripts/` searches decks by commander or crawls other people's decks. Those calls are user-initiated, one-owner, small. They work, but "works" is not "permitted".
- **robots.txt** (fetched 2026-11-11, `archidekt.com/robots.txt`): only `/login?`, `/partialCompare`, `/playtester-v2/`, `/sandbox?` are disallowed. `/api/` and deck pages are not blocked. So robots.txt does not forbid it.
- **Terms of Service** (fetched 2026-11-11, `archidekt.com/terms`, Acceptable Use): users agree not to "use software or automated agents or scripts to produce multiple accounts on the Site, or to generate automated searches, requests, or queries to the Site", not to "interfere with, disrupt, or create an undue burden on servers", and the site may act "in our sole discretion". Plainly read: **automated searches and requests are not permitted.** The sentence is clumsily worded (it could be read as limited to account-farming), but the safe reading is a ban, and a deck-crawler is exactly "automated searches".
- **Verdict:** not permitted as written, no written permission, no official API. **Do not use it for this feature.** A multi-user public Oracle (brief and roadmap Phase 10) would make this worse: many users triggering crawls of someone else's site under a clause that bans it. If the owner wants it anyway, the only clean path is to ask Archidekt for written permission; that is a business step, not a build step. I did not test the deck-search endpoint, since I am not recommending it.

Because of this verdict, sections 2 of the brief (sampling, rate limits, caching) are answered only briefly, as design notes in case permission is ever granted, not as a plan.

## 2. If it were permitted (notes only)

- **Realistic decks:** popular commanders hundreds; obscure ones fewer than 10 once "exactly 100" is enforced. Most public decks are unfinished, 99/101 cards, or have a maybeboard. [Approximate]
- **Volume:** searching returns summaries only; each deck then needs its own request (about 1 search page per 20-50 decks plus 1 request per deck). 30 decks is roughly 31+ requests per commander. Rate limits are unpublished (O-002), so risk is real.
- **100-card rule:** count main deck only (commander included in the 100, maybeboard and sideboard excluded, as the contract already does for `have`). Reject anything not exactly 100 quantity-summed.
- **Sampling:** most recently updated, skip precons and decks tagged unfinished, ideally filter by bracket; otherwise bracket 1-2 and 4-5 skew the average.
- **Classification cost:** 30 decks x 99 cards is about 3,000 card checks, but only about 600-1,000 distinct cards; text comes from `ref_cards`, so cost is small and local. The cost is the requests, not the classifying.
- **Thin threshold:** at least 15 qualifying decks. **Cache shape:** same table as contract 1.7 plus `deck_count`. **Fetch style:** one commander at a time on demand, 30+ day refresh, never bulk precompute.

## 3. Comparison

| | EDHREC scale-up (contract 1.4) | Archidekt 100-card average | **EDHREC "average deck" (new option)** |
|---|---|---|---|
| Accuracy | Estimate; a guess for the missing ~40% of cards; removal and wipes most distorted | Real decks; skewed by who uploads, most decks are unfinished | A real 100-card list EDHREC builds from popular cards; slightly "too popular", but no scaling guess |
| Permitted | Same source we already use | **Terms forbid automation** | Same source we already use; its robots.txt does not block it |
| Requests per commander | 1 | 30+ | 1 |
| Effort | Medium (scaling and thin rules) | High (search, paging, sampling, filters) | **Lowest of the three** |
| Risk | Number looks precise but is extrapolated | Legal, rate limits, thin data on obscure commanders | Format could change (undocumented JSON, same as today) |

**New finding** [Confirmed by one fetch, 2026-11-11: `https://json.edhrec.com/pages/average-decks/atraxa-praetors-voice.json`, HTTP 200]: EDHREC serves an average deck per commander. The JSON has `deck.cards` grouped by type with quantities (Atraxa: creatures 24, instants 10, sorceries 8, artifacts 9, enchantments 7, planeswalkers 5, lands 36), `bracket_counts`, and `container.json_dict.card.num_decks` (46,230 for Atraxa). It is one request, about 100 cards, so classifying it with `rolesForCard` gives role counts directly, with no scale factor. Caveat: it is EDHREC's constructed "average" (most popular cards filling the slots), not a true mean of decks, so label it "EDHREC average deck", not "average of N decks". The Developer must check it with ~15 commanders including obscure ones (does the file exist, is it 100 cards, are basics included) before slice 2 relies on it.

## 4. Recommendation

Hybrid, with plain labels, in this order:
1. **EDHREC average deck** (100 cards present, deck sample at least 50): "EDHREC average deck, 46,230 decks".
2. **EDHREC scale-up** (average deck missing or not 100 cards, top-card list adequate): "EDHREC estimate" (marked as estimated).
3. **General guide**: "General guide".
4. **Unreachable source** (owner's decision): show last saved numbers with "may be out of date"; if none saved, the general guide.
Do not use Archidekt. Keep the scale-up code only as step 2; it is already designed.

## 5. What would change in the contract (not edited)

- 1.3 `source`: `'edhrec_average' | 'edhrec_estimate' | 'general_guide'`; `sourceLabel` values as in section 4.
- 1.4: new first step fetching `/pages/average-decks/<slug>.json`, reading `deck.cards` with quantities, classifying with `rolesForCard`; existing steps 2-6 become the fallback. Same slug rules (front face, partner order).
- 1.5 thin rule: add "average deck present and quantities sum to 99 or 100" and keep the existing rules for the estimate.
- 1.7 table: add `source text` and `average_deck jsonb` (or reuse `cards`); a rename, still additive and draft only.
- 1.8 refresh and the stale rule: owner's decision applies. On failed refresh, serve the last saved row with `stale: true` and label "may be out of date" (replaces the "Couldn't reach EDHREC" wording; Designer to confirm); general guide only if no saved row.
- 2 verdict rules and `DeckHealthResponse.sourceLine`: new labels. Q1 in the earlier report is superseded by Q1 below.
- 6: no new locked-decision conflict; O-002 still applies (single request, cached, throttled).
- 7 S2 tests: add a saved real average-deck JSON fixture, quantity summing, fallback order, stale label.

## Changed files
- docs/oracle/reports/2026-11-11-architect-archidekt-typical-numbers.md — this report only

## New decisions made (need owner confirmation)
- Do not use Archidekt as a data source for typical numbers (terms forbid automated requests).
- Source order: EDHREC average deck, then EDHREC estimate, then general guide.

## Assumptions
- The Archidekt terms text I fetched is the current one and the clause means what it plainly says.
- EDHREC average-deck JSON exists for most commanders; unverified beyond Atraxa.
- EDHREC's own terms were not reviewed in detail here; its robots.txt does not block these paths and the app already uses its JSON.

## Challenges to locked decisions
- none

## Open questions
Q1. Which numbers should Oracle trust for "typical", for example Atraxa's removal?
1. **Recommended: EDHREC's average deck, falling back to the estimate.** You would see "EDHREC average deck, 46,230 decks" and removal counted straight from a real 100-card list. Trade-off: it is EDHREC's built list, not a true average of all decks.
2. Estimate only (the old plan). You would see "EDHREC estimate". Trade-off: less accurate for removal and wipes.
3. Ask Archidekt for written permission first, then use real decks. You would wait for an answer, and may get none.

Q2. When no saved numbers exist and the source is down, should the panel say "General guide" with a small note "couldn't reach EDHREC"? Recommended: yes. Example: a new commander on a bad day shows "General guide (couldn't reach EDHREC)" instead of nothing. Alternative: show only "General guide".

## Verification
- fetched `archidekt.com/robots.txt` — 4 disallowed paths, `/api/` not blocked
- fetched `archidekt.com/terms` and searched text for automated-access wording — clause found (quoted above)
- one fetch of the EDHREC average-deck JSON for Atraxa — 200, 100-card style list with quantities and `num_decks` 46,230
- grep of `src` and `scripts` for Archidekt use — only owner's own collection/decks and pasted-URL import; no commander search
- no tests run; no code, migrations or database changes
