# Report: precon-sources
Role: Architect
Status: DONE
Task as received: Research whether Oracle can source precon deck lists from EDHREC to generate a starter list for the import "Precon" tab (currently broken: it calls a non-existent /api/precons). Check existing EDHREC integration, research EDHREC and alternatives (Scryfall, Moxfield/Archidekt public precon lists), compare data/reliability/terms/rate limits/mapping/effort, verify with a handful of polite fetches, recommend one smallest-build approach, list owner questions. No code changes, no DB writes.

## Summary for the owner
**Yes, and it's easy.** Complete precon lists exist for free in two places, with the exact printing of every card (set and collector number), including the commander, 100 cards each.

- **EDHREC** has all 176 precon decks (Commander 2011 up to this month's Multiverse Reforged). Each is a full 100 cards with the commander. But EDHREC's terms of use forbid automated requests, and it's a site's private feed rather than a published dataset. I would not build the Precon tab on it.
- **A free community dataset ("taw", on GitHub)** has 200 commander precons, updated yesterday, each 100 cards with the exact printing. Oracle **already downloads this dataset** for the Precon tab, but throws away the card lists and keeps only the deck name. That is why the tab can't work: it was left half-built, not because the data is missing.

**Recommendation:** keep the dataset Oracle already uses, save the full lists as well as names (small change), and make the Precon tab pick a deck and open it in the same review screen as a file import. Cards come in with the exact printing the precon shipped with, so the "default printing" rule doesn't even apply.

Two things for you to decide are at the bottom (what the imported precon should be; whether to show EDHREC upgrade ideas later).

## Changed files
- docs/oracle/reports/2026-10-23-architect-precon-sources.md (new). No other changes.

## Findings

### 1. What Oracle already has [Confirmed]
| Item | State |
|---|---|
| EDHREC bulk sync of commander data: `scripts/sync-edhrec-data.ts`, `scripts/sync-commander-rankings.ts` (calls `json.edhrec.com/pages/commanders/<slug>.json`) | Live, used for commander stats, themes, upgrade ideas. **No precon data used.** |
| EDHREC through an MCP tool for upgrade staples: `scripts/generate-upgrade-data.ts`, `src/lib/upgrade-candidates.ts` | Live for upgrades |
| Precon table `ref_precons` (`supabase/migrations/20260802093043_create_ref_precons.sql`) | Exists. Holds name, set, commander, colours, date, card count and an `archidekt_url`. **No card list column.** |
| `scripts/sync-precons.ts` | Downloads taw's `decks_v2.json` (which includes every card and printing), filters to commander decks, then **stores only metadata**. The "Archidekt URL" it saves is a *search page*, not a deck, so even a working route could not import from it. |
| Precon tab in `src/components/DeckImportButton.tsx` (~148–158, ~276–290) | Calls `/api/precons` (no such route) and then imports the search URL through the old URL path. Broken twice over. |
| `tags` in `scripts/edhrec-tag-mappings.ts` mapping "precon" tags to nothing | Irrelevant here |

I did not check whether `ref_precons` is filled in the hosted database [Approximate]; it is not needed for the recommendation.

### 2. Source comparison
All numbers below come from fetches I made on 2026-10-23 (7 requests to EDHREC, 1 download from GitHub, 1 request each to Scryfall and the GitHub API, spaced a couple of seconds apart).

| | **EDHREC** | **taw dataset (GitHub)** | **Scryfall sets** | **Moxfield / Archidekt public lists** |
|---|---|---|---|---|
| What you get | Full list, 100 cards incl. commander, per card: name, quantity, set code, collector number, Scryfall id | Full list, 100 cards incl. commander, per card: name, quantity, set code, number, foil flag, mtgjson id | Cards in a set, **not which deck each belongs to** | Full list with printings, but someone's copy |
| Decks covered | 176 (index page `…/pages/precon.json`; 56 sets, Commander 2011 → Multiverse Reforged, Oct 2026) | 200 commander decks incl. 2 MTGO ones; newest Oct 2, 2026; repo last updated Oct 22, 2026 | Set type `commander` has 46 sets but no deck split | Varies; no official "this is the precon" |
| Complete? | Yes: 100 of 100 in both decks I counted (Reality Fracture, Lorehold Spirit) | Yes: 100 in Lorehold Spirit. Some entries are not 100-card commander decks (e.g. "Reality Fracture Theme Deck" 60 cards, MTGO redemption 290) so filtering is needed | n/a | Mixed; users change lists |
| Exact printing | Yes (set + number, and Scryfall id) | Yes (set + number) | Yes but no deck | Yes |
| Reliability | Good, but private feed that can change without notice; unknown slugs return 403 | Good, community maintained, no cost | Rock-solid but doesn't solve the problem | Users edit, rate limits, Moxfield blocks unrecognised clients |
| Terms | **EDHREC terms say you shall not use "software or automated agents or scripts" to generate requests, nor build a competing site.** robots.txt does not block the JSON host, but terms still apply. We already bulk-sync commander data from it, so this risk exists today. | Public GitHub repo; **no licence file declared** (GitHub reports none). Data is card names, which are not copyrightable. Low risk, but worth noting. | Free, clear API rules (identify the app, ~10 requests/second) | Terms vary; unofficial APIs |
| Rate limits | None seen. Files served from a CDN (cached ~27 min). | One 29 MB file, one download per sync | 10 req/s | Unclear |
| Mapping into the review | Exact printings, so the review shows each card as it shipped. Needs a slug list from the index. | Same. Needs set+number → our card id lookup (`ref_printings`) | No | Same as a URL import |
| Effort | Small to medium (fetch, store, map), plus the terms issue | **Smallest**: already downloaded, just save the lists | Not viable alone | Medium, brittle, no official source |

Note on EDHREC's precon pages: they are an *upgrade guide* (cards to add, cards to cut, "new commanders") built on the original list, so the original list appears alongside it. Those add/cut lists are the more interesting product value and could power a later "Upgrade this precon" feature, but that is a different task.

### 3. How it would map into the review
- A precon with exact printings arrives with every card already set to a printing. The "default printing" rule (names only) is only needed as a fallback for cards our reference data can't match [Approximate: to confirm against the review parser when designing].
- What a precon *is* when saved is a behaviour question (Q1 below): a deck of cards you own, or a planned deck with nothing owned? D-047 says imports never pull in owned cards, and a precon import shouldn't either, so the default is every card as a planned slot you then mark Original / Proxy / Unsleeved in the review, the same as a file import.
- The commander is known from the list, so D-052 / the commander selector can be preset.

### 4. Smallest build (recommended)
1. **Save the lists.** Extend the sync script to store the card list for each precon (one JSON column on `ref_precons`, one small migration, owner-approved before applying). Replace the useless Archidekt search URL.
2. **Add the missing route.** A read-only `/api/precons` that returns the list of decks (search by name/commander/set) and a way to fetch one deck's cards.
3. **Wire the tab.** Selecting a precon feeds its cards into the same review screen the File and Paste tabs use. Delete the old "three-choice" step for this tab (aligns with slice 6 of the cleanup brief).
4. **Optional later:** surface EDHREC upgrade lists for the chosen precon (only if the terms issue is accepted or approval is obtained from EDHREC).

Effort: about one slice of work for Developer plus a Designer pass on the tab, assuming the review accepts a ready-made list. This is a replacement for deleting the Precon tab (cleanup slice 3); the owner should choose between "delete the tab" and "fix the tab" (Q2).

### 5. Not verified
- I did not test whether Moxfield or Archidekt expose official precon pages; I rely on the existing repo importers and general knowledge [Approximate].
- I fetched EDHREC's terms page and quoted the relevant clause, but I am not giving legal advice.
- EDHREC's feed is not a documented API; the shape (`archidekt`, `deck`, `commander_v2` fields) was observed today and could change.

## New decisions made (need owner confirmation)
- Recommend the taw dataset as the single precon source; EDHREC is not used for bulk list sourcing (terms).

## Assumptions
- The review screen can take a ready list with exact printings. This needs checking before Designer/Developer start.
- The hosted database has `ref_precons`; no data check was done.

## Challenges to locked decisions
- None. D-047 (never pull owned cards) is respected by the default.

## Open questions
1. **What should a chosen precon become?** (a) Recommended: a planned deck with all 100 cards as slots, and you mark each card Original, Proxy or Unsleeved in the review, as with any import. (b) The same, but with a one-tap "I own this precon, mark all Original". (c) Only the card list is shown, nothing is saved until you confirm. (This is a presentation of (a); say if you want that.)
2. **Fix the tab or delete it?** (a) Recommended: fix it; the data is free and the work is small. (b) Delete the tab and rely on file import. (c) Keep it deleted for now, revisit when someone asks.
3. **What if a precon contains cards in several printings** (e.g. a Secret Lair, a reprint from another set)? (a) Recommended: use exactly what the dataset lists. (b) Let you swap printings in the review. (c) Always use the newest printing.
4. **Do you want upgrade ideas for the chosen precon later** (cards to add or cut, from EDHREC)? (a) Recommended: not now. (b) Yes, if we get permission from EDHREC first. (c) Yes, from our existing commander upgrade engine instead.
5. **How fresh should the precon list be?** (a) Recommended: refresh when we run the sync, roughly each release. (b) Refresh automatically each week.
