# Report: vector-trial-update
Role: Architect
Status: PARTIAL
Task as received: Update docs/oracle/contracts/vector-trial-2026-11.md (draft, still no approved brief; remain PARTIAL, build nothing) and write a short follow-up report in the standard format. Owner-approved additions: (1) specify exactly what text is embedded per card face (name, type line, face oracle text, Scryfall keywords, optional Tagger function tags; exclude price, ownership, deck membership); (2) Scryfall Tagger tags (otag:) as an optional with/without A/B arm, joined by oracle_id never name, a `tags text[]` column, verify Scryfall API/tagging usage rules and flag uncertainty, map Tagger tags to ref_taxonomy; (3) new evaluation checks: multi-feature cards (per-feature sub-queries merged vs single query, in the graded set) and deck-dependent cards (graded per commander, Prosper vs Korvold, commander + deck blend query, EDHREC carries the deck-specific signal); (4) a short section "Additional data that could improve results" with now/later/not recommended verdicts, verified against the repo. Owner-facing summary in plain language.

## Summary for the owner
The trial plan now says exactly what each card's description contains (name, card type, rules text, keywords, and optionally Scryfall's community "function" labels like ramp), and never price, whether you own it, or which deck it is in. It also adds two checks: cards that do two jobs (like Prosper, ramp and draw) and cards that are great in one deck but weak in another (like Rhystic Study, judged for Prosper and for Korvold). Marking the extra cards adds about half an hour to your hour. Still only a draft: nothing is built and it needs your approved brief first. One thing to know: your probe thought the community labels could only be fetched one label at a time, but Scryfall publishes them as a daily download, which is simpler, and it shows more labels than your probe found (for example Smothering Tithe does have a Treasure-maker label).

## Changed files
- docs/oracle/contracts/vector-trial-2026-11.md — updated draft: §2.2 table sketch (new `tags` list column, key now includes the text version), new §2.3 exact embedded text, new §2.4 Tagger arm with usage rules and taxonomy mapping, §4 and §5 updates, new §5.5 and §5.6 checks, new §5A additional data, two new risks, handoff note
- docs/oracle/reports/2026-11-04-architect-vector-trial-update.md — this report

No migration, type file, code or database change. Temporary Scryfall files were downloaded to /tmp for verification only and are not in the repo.

## New decisions made (need owner confirmation)
- Name is now included in the embedded text (reverses the draft's exclusion). Mitigation: a name-free sanity run on the look-alike traps.
- Text recipe versions `v2-base` and `v2-tagged`; table key is now (oracle_id, face_index, text version) so both arms coexist. `tags text[]` holds exactly the tag slugs that were embedded (empty for base).
- Tag source is Scryfall's Oracle Tags bulk file, not per-tag search (see Open questions). Needs an allow-list of functional tags, parent-tag expansion (e.g. `ramp` is the parent of `mana-rock`), and a weight cutoff (median and above), fixed before the test.
- Tags A/B is judged separately from the go/stop decision: kept only if tagged beats base by ≥ 0.03 nDCG@10 on either commander with no harm on the traps.
- Check A (multi-feature) success: per-feature merged beats single by ≥ 0.05 nDCG@10 and covers all features, else keep single. Check B (deck-dependent): fused list orders ≥ 75% of cards correctly between Prosper and Korvold, and the commander+deck blend (weights 0.4 / 0.6, fixed now) is no worse than commander alone. Neither adds a go/stop gate.
- Owner labelling rises from about 120 to about 170 grades (about 1.5 hours).
- Verdicts in §5A: now = EDHREC per-commander data, colour identity filter; later = mana-value filter, role taxonomy, Spellbook combos, commander decklists, deck-level stats, accept/skip history, graded labels as ranker data, price/salt as optional filters; not recommended = rulings, and price/salt as embedded text.

## Assumptions
- Face-level keywords: Scryfall keeps `keywords` on the card, not the face [Approximate]; rule used is "keep a keyword on a face only if it appears in that face's text".
- Tags are per card, so every face of a multi-face card gets the same tags [Approximate].
- The two deck fixtures (~30 cards each) are supplied or approved by the owner, not derived from EDHREC (would be circular).
- Hosted pgvector availability and the content of `deck_upgrades`, `upgrade_change_log`, `debrief_actions`, `deck_health`, `deck_mana_analysis` remain unverified [Approximate].

## Challenges to locked decisions
none

## Open questions
- **Evidence conflicts with the owner's probe:** Scryfall's live manifest (fetched 2026-11-04) lists an Oracle Tags bulk file (about 4,600 oracle tags, updated daily). I joined it by oracle_id against the Oracle Cards file for the sample cards: Prosper (7 tags incl. ramp, repeatable-treasures, impulsive-draw), Smothering Tithe (ramp, repeatable-treasures, rhystic, draw-hate), Sol Ring (mana-rock; `ramp` only via parent), Blood Artist (blood-artist-ability, opponent-loses-life; no death-trigger tag directly). Slugs differ from the probe's labels. Does the owner want the bulk route used (recommended: no rate limit, one dated snapshot)?
- **Uncertain usage rules:** attribution to Tagger contributors, a separate licence for tags, and whether showing or serving tags to users counts as republishing are not stated in Scryfall's docs. Harmless for an internal trial; must be resolved before any user-facing use or the public version (O-002).
- Confirmed rules: search 2 requests/second, other API 10/second, bulk files unlimited, a 429 means a 30-second block and possible ban, accurate User-Agent and Accept headers required, cache ≥ 24 h, no Scryfall branding or paywalling, add value rather than republish.
- Will the owner supply the two deck fixtures, or use public sample lists?
- Brief still absent: Gene must obtain the Gate 1 brief before any design or build.

## Verification
- Read AGENTS.md, ~/agents-shared/architect.md, .agents/project/architect.md, existing contract and report — done.
- Repo checks (migrations, generated types, scripts, docs) via search for taxonomy, rulings, Spellbook, salt, price, mana value, tables — done; claims tagged in the contract.
- Fetched Scryfall API, rate-limit, Tags and bulk-data pages, and joined Oracle Tags to Oracle Cards in /tmp for six sample cards — done.
- No tests, builds or migrations run (nothing built).
