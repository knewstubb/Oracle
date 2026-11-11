# Contract: Deck health (Phase 2)

Status: DRAFT for owner review. Nothing here is built, and no migration is applied.
Author: Architect, 2026-11-11. Amended 2026-11-11 with owner decisions Q1 (EDHREC average deck first) and Q2 (stale numbers wording); see `docs/oracle/reports/2026-11-11-architect-archidekt-typical-numbers.md`. Archidekt is NOT a source (its terms forbid automated requests).
Inputs: approved brief `docs/oracle/briefs/daily-use-deck-advisor.md` (3, 4, 5, 9, 17, 18, 19), audit `docs/oracle/reports/2026-11-11-architect-daily-use-audit.md` (areas 3, 4, 9; 15a, 15b), approved design `docs/oracle/specs/whats-missing.md` + mockup + designer report.

Tags: [Confirmed: path] = read in the code or queried read-only on 2026-11-11. [Approximate] = my estimate, needs checking.

## 0. What is wrong today (so the Developer knows why)

1. [Confirmed: `src/lib/edhrec-client.ts`] `getCommanderTopCards` reads the live EDHREC JSON wrongly. Top-level `creature`, `instant`, `land`… are **integers** (average count per deck), not card arrays, so it returns zero cards. The real lists are in `container.json_dict.cardlists[]` (headers such as Creatures, Instants, Sorceries, Utility Artifacts, Mana Artifacts, Enchantments, Planeswalkers, Utility Lands, Lands, plus duplicate lists "Top Cards" and "New Cards"). Each `cardviews[]` item has `name, sanitized, synergy, lift, num_decks, potential_decks`. **There is no `inclusion` field**; inclusion = `num_decks / potential_decks`. Deck sample size = `container.json_dict.card.num_decks`.
2. [Confirmed] The health routes (`src/app/api/decks/[id]/health/route.ts`, `.../health/recheck/route.ts`) look the deck up by id only (no user filter) and pass `oracleText: null, typeLine: null`. The classifier's text path (tier 2) never runs, and `categories` on real decks holds only card types. Result: all-red pills. The 8 stored `deck_health` rows are stale and are never invalidated. `GET` also returns a fake "green" result on error, which hides failures (D-030).
3. [Confirmed: `src/lib/category-classifier.ts`, checked against Atraxa's EDHREC cards] The classifier is weak: land-fetch spells (Farseek, Cultivate, Kodama's Reach, Rampant Growth) come out as Tutor; "each creature" makes Ghostly Prison, Propaganda, Jace TMS "Board Wipe"; Toxic Deluge and Cyclonic Rift come out as Other; Mana Drain as Ramp; Viral Drake as Removal. It gives one category per card, so Damn (removal and wipe) cannot be both.
4. [Confirmed: `src/lib/spare-copy-browse.ts` `buildFilter`] The spare browse has its **own** draw/ramp/removal regexes and no wipes. Two classifiers means pill counts and listed cards would disagree. One shared function is mandatory (section 3.1).

## 1. Role target data

### 1.1 The four roles

Phase 2 shows exactly four roles: `ramp`, `draw`, `removal`, `wipes`. The other five roles in the current engine (Interaction, Finisher, Recursion, Tutor, Protection) are not shown until Phase 4 (spec section "hidden until Phase 4").

### 1.2 Shared role function (single source of truth)

New file `src/lib/card-roles.ts`:

```ts
export type Role = 'ramp' | 'draw' | 'removal' | 'wipes'
export const CLASSIFIER_VERSION = 1 // bump on any rule change; invalidates cached targets

export interface RoleCardInput { name: string; typeLine: string | null; oracleText: string | null }

/** A card may have 0..4 roles. Lands return []. Never throws. Pure. */
export function rolesForCard(card: RoleCardInput): Role[]
```

Rules for the Developer (golden tests required, section 7):
- Takes real card text. Callers must pass `oracle_text` and `type_line`, so the text path actually runs. Null text means `[]` and the card is counted as unclassified, never guessed.
- Multi-role: a card counts in every role it has.
- Ramp includes land-fetch to battlefield (Farseek, Cultivate, Kodama's Reach, Rampant Growth) and mana rocks and dorks. It excludes cards that only fetch to hand. Mana Drain is not ramp.
- Wipes: "destroy/exile all (or each) creature(s)", "all creatures get -X/-X", and similar. It needs a whole-board effect, not just the word "each creature" (Ghostly Prison, Propaganda, Jace TMS are not wipes). Toxic Deluge and Cyclonic Rift count as wipes (Rift: overload; use the overload text).
- Removal: targeted destroy, exile, bounce-or-damage-to-kill effects. A "-1/-1 counter" on a creature body (Viral Drake) is not removal.
- The existing Archidekt category map and per-card overrides are not used for these four roles in Phase 2. `ref_cards.default_category` (AI-made, 32,393 cards) is a **calibration cross-check only** when writing golden tests, not a source.
- Replaces: the role regexes inside `spare-copy-browse.ts` `buildFilter`, and `inferFromOracleText` for the four roles. `classifyCard` in `category-classifier.ts` stays only if something else still imports it; the Developer removes it if nothing does (grep first).

### 1.3 Per-commander target: shape

```ts
export interface RoleTarget {
  role: Role
  typical: number          // integer, see 1.4. Never invented: only present when status 'ok'
  cardsInRole: number      // EDHREC cards classified into this role
}

export interface CommanderTargets {
  status: 'ok' | 'thin' | 'not_found'
  source: 'edhrec_average' | 'edhrec_estimate' | 'general_guide'
  sourceLabel: string      // "EDHREC average deck, <deckSample> decks" | "EDHREC estimate, <deckSample> decks" | "General guide" | "General guide (couldn't reach EDHREC)"
  roles: RoleTarget[]      // empty when status != 'ok'
  cardsUsed: number        // non-land cards classified (average deck: its non-land cards; estimate: listed cards)
  deckSample: number | null
  coverage: number | null  // see 1.4
  typeCounts: TypeCount[]  // always filled when any source has them, see 1.6
  fetchedAt: string | null
  stale: boolean           // served after a failed refresh; label gets "may be out of date" appended, e.g. "EDHREC average deck, 46,230 decks, may be out of date"
}
```

### 1.4 Derivation (EDHREC, live): source order

Owner decision Q1: use the first source that qualifies. (A) EDHREC average deck, else (B) EDHREC estimate (the scale-up, steps 2 to 7 below), else (C) General guide. Archidekt is not used.

**(A) Average deck.**
- A1. Same slug rules as step 1 below. Fetch `https://json.edhrec.com/pages/average-decks/<slug>.json` (one request). [Confirmed by one probe, Atraxa, 2026-11-11: HTTP 200; `deck.cards` grouped by type as `[name, quantity]`; `container.json_dict.card.num_decks` = 46,230.] Everything else about this JSON beyond Atraxa is [Approximate] until the Task below is done.
- A2. Flatten `deck.cards`, summing quantities; exclude the commander (`deck.commander`) and lands (front-face type line). Basics are lands.
- A3. Join to `ref_cards` by name (exact, then front face) for text; run `rolesForCard`. Cards with no ref row are skipped and counted as missing.
- A4. `typical[role]` = number of non-land cards (by quantity) having the role. **No scaling.** `coverage` is null. `deckSample` = `num_decks`.
- A5. Qualifies only if: the list sums to 99 or 100 including the commander (basics and lands counted), `deckSample >= 50`, and at most 10% of non-land cards lack ref data. Otherwise fall to (B). This is EDHREC's built list of popular cards, not a true mean of decks; label it "EDHREC average deck", never "average of N decks".
- A6. Bracket skew: `bracket_counts` is returned by the file but not used in Phase 2 (no bracket filter). Not designed; flagged for later.

**(B) Estimate.** Steps 1 to 7 below, unchanged, label "EDHREC estimate, N decks", with the thin rules in 1.5.

1. Resolve the slug from the **front face only** of the commander name (`sephiroth-fabled-soldier` returns 200; the full DFC joined name returned 403). [Confirmed by probe] Partner pairs: both `tymna-the-weaver-thrasios-triton-hero` and `thrasios-triton-hero-tymna-the-weaver` returned 200 on 2026-11-11, so the exact format is [Approximate]; try one fixed order (alphabetical by front-face slug) and treat 404 as `not_found`. Never guess a different commander.
2. Fetch `https://json.edhrec.com/pages/commanders/<slug>.json` (one request per commander, existing client user agent).
3. Read `container.json_dict.cardlists[]`. Skip headers "Top Cards", "New Cards", "Lands", "Utility Lands". Flatten the rest, dedupe by name. Per card: `inclusion = num_decks / potential_decks`.
4. Join each card to `ref_cards` by name (exact, then front face) to get `type_line` and `oracle_text`. **Feed the card text to `rolesForCard`.** A card with no ref row is skipped and counted as missing, not guessed.
5. `rawSum[role] = Σ inclusion` of cards having the role. `listedSum = Σ inclusion` of all listed non-land cards.
6. EDHREC only lists cards above about a 5% inclusion floor, so raw sums undercount. [Confirmed: probes of 7 commanders, listed sum was 36 to 58 against 58 to 65 non-land slots; Atraxa's raw removal sum is about 2.7, which would make "Light" almost impossible.] Scale to a full deck:
   - `nonLandSlots = 99 − landsAvg`, where `landsAvg` is the EDHREC average land count (`json_dict` land total, an integer), else the mean `avg_lands` from `ref_commander_builds` for that commander.
   - `scale = nonLandSlots / listedSum`
   - `typical[role] = round(rawSum[role] × scale)`
   - `coverage = listedSum / nonLandSlots` (Atraxa about 0.62, scale about 1.6; typical becomes removal about 4, ramp about 11, wipes about 1 [Approximate]).
7. This scaling is my extrapolation, not an EDHREC number. Under owner decision Q1 it is only the fallback (B), used when the average deck does not qualify.

### 1.5 Thin-data rule (applies to the estimate (B); the average deck (A) has its own qualify rule in A5)

`status = 'thin'` if any of: `deckSample < 50`, classified non-land cards `< 60`, `coverage < 0.4` (the scale would exceed 2.5). `status = 'not_found'` on a 404. These starting values come from 6 probes and are [Approximate]. The Developer samples about 15 commanders (including 3 obscure ones) before slice 2 ships and reports the numbers. The mockup's "9" was only an example.

Thin or not found means:
- No role numbers from EDHREC, no buy ideas.
- Role check uses the **general guide** (only after both (A) and (B) fail): Ramp 10, Draw 10, Removal 6, Wipes 2 (the `min` of the existing `DEFAULT_THRESHOLDS`; this matches the mockup's "Average is 6" for removal). Label: "General guide".
- Type counts (1.6) still shown if stored builds exist.
- Never a made-up number: the guide numbers are labelled as the guide, never as "typical for <commander>".

### 1.6 Type counts (thin fallback and context)

`typeCounts: { type: 'creature'|'instant'|'sorcery'|'artifact'|'enchantment'|'planeswalker'|'land'; average: number }[]`. Source order: EDHREC integers from the same JSON (when fetched) else the mean over `ref_commander_builds` rows for the commander (`avg_creatures`, `avg_lands`, `avg_artifacts`, …; 1,880 of 1,885 rows have them [Confirmed]). Commander lookup goes by name through `ref_commanders`, because only 1 of 9 decks has `commander_id` [Confirmed]. Label "Averages from N stored builds", or "No stored builds yet" and an empty list. `avg_ramp/draw/removal/wipes` in `ref_commander_builds` are empty [Confirmed]; do not use them.

### 1.7 Cache table (DRAFT; owner approval needed before applying)

**Owner gate:** this migration must not be applied until the owner approves (process.md). Draft only, file name suggestion `supabase/migrations/20261111120000_ref_commander_role_targets.sql`. The Architect does not apply it.

```sql
-- DRAFT. NOT APPLIED. Owner approval required.
-- Shared reference data (same for every user), so no user_id column. This is a
-- deliberate exception to the per-user rule; it holds public EDHREC numbers only.
create table public.ref_commander_role_targets (
  edhrec_slug        text primary key,
  commander_name     text        not null,
  status             text        not null check (status in ('ok','thin','not_found')),
  source             text        not null default 'edhrec_estimate' check (source in ('edhrec_average','edhrec_estimate')), -- which derivation made roles
  roles              jsonb       not null default '[]'::jsonb, -- [{role,typical,cardsInRole,rawSum}] (rawSum only for the estimate)
  cards              jsonb       not null default '[]'::jsonb, -- [{name,roles[],inclusion}] (non-land, deduped)
  cards_used         integer     not null default 0,
  deck_sample        integer,
  coverage           numeric,
  lands_avg          numeric,
  type_counts        jsonb       not null default '[]'::jsonb,
  classifier_version integer     not null,
  fetched_at         timestamptz not null default now()
);
alter table public.ref_commander_role_targets enable row level security;
create policy ref_commander_role_targets_read
  on public.ref_commander_role_targets for select to authenticated using (true);
-- No insert/update/delete policy: only the server's admin client writes.
-- Rollback: drop table public.ref_commander_role_targets;
```

Why a table, not a column: a column on `ref_commanders` would need a join on a name match that most decks cannot make, and one commander can have many slugs (partners). Adding a table is additive and reversible. `cards` is stored so the buy-idea list and the pill counts come from the same classified rows (section 3).

### 1.8 Refresh rules

- Lazy only. No background job and no bulk fetching.
- Refresh when: no row; `now − fetched_at` greater than 14 days (status ok) or 7 days (thin or not_found); or `classifier_version` differs from `CLASSIFIER_VERSION`.
- Single-flight per slug in the process; at least 100 ms between EDHREC calls; one request per commander.
- Network errors and non-404 failures are **not cached**. Owner decision Q2: on a failed refresh serve the last saved row with `stale: true`, and the source line gets "may be out of date" (e.g. "EDHREC average deck, 46,230 decks, may be out of date"); if no saved row exists, general guide with source line "General guide (couldn't reach EDHREC)". Exact wording is owner-approved; Designer only places it.
- Cache both fetches: the table row records which source produced it (`source`). A refresh tries (A) first, then (B) only if (A) did not qualify; if both fail on the network, the stale rule applies.
- `POST .../health/recheck` may refresh targets only if they are past expiry, and at most once per hour per slug.

## 2. Verdict rules

```ts
export type RoleState = 'ok' | 'light' | 'unchecked'
```

- A role is **Light** when `have <= typical − 2`. 7 of a typical 8 is on track; 6 of 8 is Light. Going over is never a problem. If `typical < 2` the role can never be Light.
- `have` = main-deck cards only (exclude maybeboard and commander-zone cards, and lands by front-face type line), summed by `quantity`; a card counts in every role it has.
- Until a strategy exists (Phase 4), only generic roles are checked: ramp, draw, removal, wipes. The Strategy row is returned as `{ state: 'not_set', text }`, text "Not set yet, using typical numbers" (EDHREC ok) or "Not set yet, using the general guide" (thin). There is no editor and no link to one in Phase 2.
- Headline: "Well covered" if nothing is Light, else names up to two roles with the biggest shortfall (ties by fixed order ramp, draw, removal, wipes). A "(general guide)" suffix when the guide is used.
- Typical 0 wording ("none needed") is not designed. Developer shows the role as `ok` with text "Not usually played" and flags it to the Designer. [Approximate]
- Cards with no ref data go to `unclassifiedCount`. If `unclassifiedCount / mainDeckCount > 0.10`, return `checkState: 'partial'` and the UI shows "Couldn't fully check", never a silent zero (D-030).
- All copy is composed server-side in one pure function (`composeHealthCopy`), used by the panel and the chat so they cannot disagree.
- Replaced: green/amber/red, `amberMargin`, `selectMostSevereViolation`, `formatContextualNote`.

## 3. Per-card role result and gap lists

### 3.1 One function, everywhere
Pill counts (`have`), the "cards already in this deck" link, spare list, other-deck list, and EDHREC buy ideas all call `rolesForCard` with real text. `spare-copy-browse.ts` is changed to take a `role: Role` and filter with `rolesForCard` (SQL pre-filter by `ref_cards` colour identity, then classify in code); its own regexes are deleted.

```ts
export interface RoleCardResult {
  name: string
  roles: Role[]               // from rolesForCard; the requested role is always included
  status: 'SPARE' | 'IN_ANOTHER_DECK' | 'UNOWNED'
  otherDeckName: string | null // deck name only, nothing else (spec)
  inclusionPct: number | null  // buy ideas only, 0-100
  price: { usd: number | null; state: 'known' | 'unknown' } // see 3.3
}
```

### 3.2 Colour identity
Spare and buy lists are filtered by the commander's colour identity. `browseSpareCopies` already does this [Confirmed]. For buy ideas, one `lookupOwnedCopies` call (limit 60 names) per request; keep `UNOWNED`; drop `OUTSIDE_COLOUR_IDENTITY` and `UNKNOWN_CARD`; drop `ALREADY_IN_THIS_DECK`. If `commander_colour_identity` is null (unknown), return **no buy ideas** and `buyUnavailableReason: 'colours_unknown'`; do not skip the filter.

### 3.3 Groups, in this order
1. **Spare** (owned, not in any deck). Shown first.
2. **In another deck**: marker shows the deck name only. The existing `warning` text ("Using it here leaves X short by one") is not shown in Phase 2.
3. **Buy ideas**: EDHREC cards in the role, not in this deck, unowned, colour-legal. Sorted by inclusion descending, cap 8. Shown only when `status = 'ok'`. `buyDefaultOpen = true` when no spare/other-deck option exists (and `nothingOwnedFits = true`), else collapsed with the count. Thin data: `buyIdeas = []` and `buyUnavailableReason: 'thin_data'` ("No buy ideas yet. No popularity data for this commander, so nothing is guessed.").
4. **Price**: `usd` from `estimatePrice` (cheapest non-digital printing above zero). UI shows "$X est."; when `usd` is null show "Price unknown". Never `$0.00`. A price of 0 or negative is stored as null.

## 4. API shapes

All routes use `requireAuth()`, filter `decks` by `.eq('id', deckId).eq('user_id', userId)`, return 404 if no row, and return a real error (`{ error }`, 500) on failure. No fake-green fallback.

```ts
// GET /api/decks/[id]/health
export interface DeckHealthResponse {
  verdict: { headline: string; subline: string; usingGeneralGuide: boolean }
  strategy: { state: 'not_set'; text: string }
  sourceLine: string                  // "EDHREC average deck, 12,431 decks" | "EDHREC estimate, N decks" | "General guide" | "... may be out of date" | "General guide (couldn't reach EDHREC)"
  checkState: 'full' | 'partial'
  unclassifiedCount: number
  roles: Array<{
    role: Role
    label: string                     // "Ramp" ...
    have: number
    typical: number                   // from targets or guide
    targetSource: 'edhrec_average' | 'edhrec_estimate' | 'general_guide'
    state: 'ok' | 'light'
    text: string                      // e.g. "6 of 8 (typical)"
  }>
  typeCounts: TypeCount[]
  typeCountsLabel: string             // "Averages from 4 stored builds" | "No stored builds yet"
  computedAt: string
}

// GET /api/decks/[id]/health/gap?role=ramp|draw|removal|wipes
export interface DeckHealthGap {
  role: Role
  have: number
  typical: number
  inDeckCount: number                 // equals roles[].have for this role (the "See the N cards" link)
  spare: RoleCardResult[]
  inAnotherDeck: RoleCardResult[]
  buyIdeas: RoleCardResult[]
  buyDefaultOpen: boolean
  nothingOwnedFits: boolean
  buyUnavailableReason: null | 'thin_data' | 'colours_unknown'
}

// POST /api/decks/[id]/health/recheck  -> DeckHealthResponse (fresh counts; targets only if expired)
```

Persistence: the deck verdict is **computed on request, not stored** in Phase 2. The old `deck_health` rows are ignored (not deleted: no destructive change without owner approval).

### Chat (same question, existing tools)
- New read-only tool `get_deck_health` added to `DECK_CHAT_ONLY_TOOLS` in `src/lib/tool-registry.ts` (D-016). Input `{ role?: Role }`. Output: the `DeckHealthResponse` plus a pre-composed `chatAnswer`:

```ts
export interface DeckHealthChatAnswer {
  headline: string
  subline: string
  sourceLine: string
  lightRoles: Array<{ role: Role; text: string }>
  closing: 'Prices are estimates.'
}
```
- Card-level detail uses the **existing** `check_owned_copies` and `browse_spare_copies` (unchanged inputs; `browse_spare_copies` gains a `role` filter value `wipes` and uses the shared function). The tool is read-only: no add or move action in Phase 2 (brief scope).
- The panel and chat call the same server function, so numbers match. How a structured result is drawn in chat is Designer/Developer territory; the contract only requires the structured payload to be sent with the tool result.

## 5. Health route fix, and what is replaced or deleted

Fix (slice 1): `GET` and `recheck` filter by user; select `ref_cards` rows by name for `type_line` and `oracle_text`; no `oracleText: null`; `isLand` from the front-face type line, not the `categories` string; real error responses.

Replaced or deleted (each in the slice that replaces it; process.md Gate 4):
- `DEFAULT_THRESHOLDS` in `health-engine.ts`: becomes the 4-role general guide fallback; the other five roles removed.
- green/amber/red, `amberMargin`, `selectMostSevereViolation`, `formatContextualNote`: deleted.
- `getHealthResult` / `saveHealthResult` use for the verdict: removed from both routes. `health-store.ts` overrides code stays (overrides route still uses it), with the missing user filter on `health/overrides/route.ts` (id-only lookups at its 3 handlers) fixed as part of slice 1 [Confirmed: lines 36, 73, 130].
- `HealthStrip.tsx` / `HealthPill.tsx` and `src/app/decks/[id]/page.tsx` (line ~133 health query, `healthCategories` passed to `CardsTab` ~368): move to the new response. `CardsTab` category headers use `healthCategories` (lines 1100, 1177): decide with the Developer whether they keep a simple count or drop the status badge; do not leave the old shape alive.
- Role regexes in `spare-copy-browse.ts`: deleted.
- `getCommanderTopCards` in `edhrec-client.ts`: rewritten for the real shape; the old array-reading code removed.
- Old `deck_health` table rows: left alone. A later cleanup (drop table) needs the owner's approval.

## 6. Locked decisions touched

- D-001: reads `user_cards`/`user_copies`/`deck_cards` only; no new owned-card tables. (The new cache table is shared reference data, a stated exception, section 1.7.)
- D-003: `oracle_id` vs `scryfall_id` stay separate; owned lookups go through the existing `oracle_id` match.
- D-007: the health work only suggests; it never writes allocations.
- D-009, D-034: Phase 2 health and its chat answer write nothing to the deck. The brief (not these decisions) keeps health suggest-only for now; D-034 would allow direct undoable AI changes later, which is out of scope here.
- D-012, D-013, D-014: UI colour/label rules; Designer's area, followed from the approved spec.
- D-016: structured chat data comes via tool use, not regex on prose (`get_deck_health`).
- D-017: EDHREC role counts vs curve targets. Phase 2 shows role counts only, no curve matrix; no conflict.
- D-025, D-027, D-037, D-043: vocabulary and original-copy language; the health panel uses Spare / In another deck wording from `docs/oracle/specs/vocabulary.md`, and does not count proxies as supply (existing lookup excludes proxies).
- D-028: Missing stays retired; not touched. D-029: no archived decks; all decks count the same.
- D-030: no silent zero, no fake green, no failure shown as success (section 2, section 4).
- D-035, D-040: prices from Scryfall only, labelled estimates ("est."); no Card Kingdom.
- D-059: deck states untouched; health does not change deck state.
- O-002: external API rate limits are unvalidated, so EDHREC calls are single-flight, throttled and cached (1.8).
- Brief section 13 and process.md Gate 4: no live-data testing; separate test account.

Conflicts and challenges:
1. The spec and brief say "typical number". EDHREC's top-card list only shows cards over about 5% inclusion, so the estimate needs scaling. Resolved by owner decision Q1: use EDHREC's average deck first (no scaling), the scaled estimate second, the general guide last (1.4). Archidekt rejected: its terms forbid automated requests.
2. `ref_cards.default_category` already holds an AI role taxonomy, which the brief's card-text approach bypasses. Kept as a cross-check only.
3. The spec says other-deck marker shows deck name only; the existing lookup `warning` says more. Not shown in Phase 2.
4. The mockup says "Average is N" for the general guide. The guide is a rule of thumb, not an average; the wording should be "General guide" (Designer to confirm).
5. status.md says `ref_build_cards` has 150 rows; the DB has 450 [Confirmed]. status.md should be corrected by the Scribe.
6. Tables in this DB mostly have RLS off and the app uses the admin client. The new table follows the safer pattern (RLS on, read-only for users).

## 7. Tests required

General: `npm run check` passes (tests, typecheck, lint). No test touches the owner's live data (process.md Gate 4, brief section 13).

Separate test account rule: browser (E2E) and save-path tests run only against a **separate test account** in an isolated Supabase test environment (`E2E_ISOLATED=true`, or `E2E_MODE=shared-readonly` for read-only checks). Never the owner's account. Until that account exists, the Developer marks the E2E checks "not run" and the report says so; they do not substitute the owner's data.

Per slice:
- **S1**: golden tests for `rolesForCard` (at least 40 real cards, including all mislabels in section 0.3, and a card with two roles, a land, a DFC, null text); verdict boundaries (7 of 8 ok; 6 of 8 light; typical 1 never light; over is ok); unclassified over 10% gives `partial`; route test: another user's deck returns 404 on health, recheck and overrides; error returns 500 not green; card text really reaches the classifier (spy asserts non-null text).
- **S2**: average-deck test using a saved real average-deck JSON (quantities summed, commander and lands excluded, no scaling applied); A5 qualify and fall-through to the estimate (99/100 total, sample below 50, over 10% missing ref data); source order A then B then guide; stale label "may be out of date"; no saved row plus failure gives "General guide (couldn't reach EDHREC)"; plus EDHREC client test using a saved copy of the real JSON shape (integers at the top level, `cardlists`, no `inclusion`), including a 404 and a DFC name; scaling math; thin triggers one by one; cache: hit, expiry (14/7 days), `classifier_version` change, failed refresh serves stale, network error not cached; ok result never contains a number when status is thin.
- **S3**: integration test: for one deck, `roles[].have` equals the count of that role's cards in the deck listing, and `inDeckCount`; spare/other-deck lists use the same function; colour filter excludes off-colour spares; another user's cards never appear; other-deck marker has the deck name only.
- **S4**: price null prints "Price unknown", never 0; est. suffix; buy ideas exclude owned, off-colour and in-deck cards; `buyDefaultOpen` true only when no owned option; thin gives none; unknown colours give none.
- **S5**: tool returns the same numbers as the route for the same deck; tool is read-only and in `DECK_CHAT_ONLY_TOOLS`; `check_owned_copies` / `browse_spare_copies` regression tests still pass.

## 8. Slice plan

Each slice ships alone, is owner-reviewable, and ends with its old path deleted.

**S1: Honest strip and verdict (smallest; no migration).** Route fixes (user filter, real card text), `card-roles.ts` with golden tests, four roles on the general guide, the Light rule, Deck health button and overview panel with "Strategy: Not set yet". No EDHREC. Owner check: open one of your real decks; pills are no longer all red; a deck with 6 removal against the guide of 6 says fine, 3 says Light; the panel says "General guide"; another account cannot see the deck. Fixes the all-red bug.

**S2: Commander targets.** EDHREC client fix, derivation, cache table (**owner approves the migration first**), refresh rules, thin fallback with type counts. Q1 and Q2 are answered (1.4, 1.8). Includes the Developer task below. Owner check: Atraxa shows "EDHREC average deck, N decks"; an unknown commander shows "General guide" and type averages, with no made-up numbers; if EDHREC is unreachable the last saved numbers show "may be out of date", or "General guide (couldn't reach EDHREC)" when none are saved; the Developer's 15-commander sample table is in the report.

**S2 Developer task (before relying on the average-deck source, report the table):** sample about 15 commanders: 5 popular, 5 mid, 5 obscure (including one partner pair, one double-faced front face, one with fewer than 100 listed decks). Read-only, one request per commander, 100 ms or more apart, existing user agent, saved fixtures only for tests. For each record: HTTP status, whether the average-deck file exists, card total with quantities (99 or 100?), whether basics and lands are included, `num_decks`, share of non-land cards missing from `ref_cards`, role counts from the average deck vs the estimate (B), and whether A5 qualified. Then tune A5's thresholds and the 1.5 thin rule from the table, and tell the Architect if the average deck turns out unusable (then Q1 falls back to the estimate and the owner is told).

**S3: Gap detail (owned cards).** Click Light role → spare first, then in another deck with deck name; colour filter; "See the N cards already in this deck" matches the pill. Owner check: the count on the pill equals the cards listed; a card from another deck shows its deck name only; off-colour cards never appear.

**S4: Buy ideas and prices.** EDHREC buy ideas, collapsed with count when owned options exist, open when none, none on thin data, "est." prices, "Price unknown". Owner check: a role with spare cards shows the buy group collapsed; a role with nothing owned shows it open; no price ever reads $0.

**S5: Chat answer.** `get_deck_health` tool, panel buttons "Chat about this". Owner check: asking "what is my deck missing?" gives the same numbers as the panel; card questions use the owned-copies tools; chat never offers to add a card.
