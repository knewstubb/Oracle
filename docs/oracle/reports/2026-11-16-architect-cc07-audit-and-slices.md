# Report: cc07-audit-and-slices
Role: Architect
Status: DONE
Task as received: Start CC-07 (filterable collection search for the Claude connector) per docs/oracle/process.md. Approved brief: docs/oracle/briefs/connector-collection-search.md (owner approved with listed defaults: filters by type, colour identity, location, free-only where hand/missing don't count as free, originals and proxies as separate rows; role search and wishlist deferred, wishlist only if cheap). Audit current search_collection (src/lib/connector/tools/search-collection.ts), especially the 3,000-card scan limit, decide whether a DB change/RPC is needed (migrations are written but must NOT be applied without owner approval; flag it), write the contract in docs/oracle/contracts/, and slice the build into small developer-ready slices with acceptance checks. No code implementation. Write a report.

## Summary for the owner
Claude's collection search can be made filterable by type, colour, mana value, and place, with real totals and group counts. It needs one small, safe database addition (a read-only "lookup view" that stores nothing and can be removed with one line), because the type and colour of your cards are not stored on your own cards today. The current free-only search is 168 cards away from a hard 3,000-card limit, and it wrongly counts In your hand and Missing cards as free; both get fixed.

## Changed files
- docs/oracle/contracts/connector-collection-search.md — the contract
- docs/oracle/contracts/connector-collection-search.types.ts — reference types
- supabase/drafts/20261116200000_connector_collection_copies_view.draft.sql — DRAFT migration (NOT applied)
- supabase/drafts/20261116200000_connector_collection_copies_view.rollback.sql — undo
- docs/oracle/reports/2026-11-16-architect-cc07-audit-and-slices.md — this report

## Audit findings (Gate 2)
1. **Scan limit.** Free-only or no-proxies searches read every matching card and filter in the app, stopping at 3,000 cards. [Confirmed: search-collection.ts SCAN_CAP] Live collection: 2,832 distinct cards, 4,550 copies, 1,780 in decks, 2,770 in storage, 137 proxies. [Live: hosted DB, read-only] Headroom is 168 cards. Past that, totals are wrong (the note says so, but the answer is still incomplete).
2. **"Free" is wrong vs the app-wide rule.** Today free = in no deck. It ignores In your hand and Missing, and the copy lookup does not read the in-hand flag, so an in-hand copy would show location "unknown". [Confirmed: search-collection.ts copyCols/copyViews] Nothing is in hand or missing today (0 and 0 live), so no visible harm yet.
3. **Type and colour are not on your cards.** user_cards.type_line and color_identity are empty on all 2,832 cards. [Live] They exist only in the shared card library, linked by card name. Mana value is only there. [Confirmed: src/types/supabase.ts]
4. **Card library gaps.** 100 owned cards (3.5%, 124 copies) have no library match; 57 are two-faced names. [Live] They cannot match type/colour filters; the contract makes the answer say how many are excluded and shows them as "No facts" in counts.
5. **Library colour spelling is mixed** ("R, W" on 5,531 rows, "BW" on 86). [Live] The view normalises it. Type lines lose subtypes on many cards, so only the eight main types are filterable.
6. **Handle limits.** The connector database handle is select-only and has no greater-than/less-than. [Confirmed: user-client.ts] Two small operators are added; it stays select-only.
7. **Wishlist.** Only an inert yes/no on import claims exists; no collection wishlist. [Confirmed: instance/wishlist/route.ts] Not cheap: deferred.
8. **Locked decisions:** none in conflict. D-030 (failures never look like "none") is the main rule applied.

## Decision: DB change needed? YES, one view (migration needs owner approval)
Chosen: read-only view `connector_collection_copies`, one row per copy, joining facts and place. Alternatives rejected: copying facts onto user cards (drift, live data backfill), a stored function (weakens the select-only guarantee; kept as fallback if the collection ever nears 20,000 copies). Measured join with filters live: about 160 ms. No new index. Logic dry-run read-only against live data matched expectations. **FLAG: draft is in supabase/drafts, NOT applied. Owner approval required. Apply this one file only (no blanket db push).**

## Slices (each small; owner sees each before the next)
Order: S0 gate, then S1, S2, S3, S4. Developer deletes the old path in the same slice (process rule).

**S0 — Approve and apply the view (Gene + owner, then Architect check).**
Accept: owner approves; Gene applies only the one draft file; a read-only check as a normal signed-in user (not the admin key) returns only the owner's rows (4,550 copies); anonymous access is refused; rollback file exists. Nothing in the app changes.

**S1 — Search on the view, honest totals, true "free" (Developer).**
Scope: replace both existing paths in search_collection with the view path (contract 5.3); rows become card + kind (new `kind`, `totalCopies`); `only_free` excludes In your hand and Missing; `CopyView.location` gains in-hand and missing; delete SCAN_CAP, the scan loop, the in-app free filter, the old copy helper and the 3,000 note. Inputs otherwise unchanged (name, free, proxies, limit, offset).
Accept: (a) free-only total equals live count of copies in no deck, not in hand, not missing; (b) a card with originals and proxies gives two rows with correct counts; (c) a test with more than 3,000 cards still gives an exact total; (d) an In your hand copy is excluded by free-only and shows location "in your hand"; (e) paging note and 40 KB cap still work; (f) a failed request returns a lookup error, never an empty list; (g) every query carries the owner id (isolation test passes); (h) grep shows no SCAN_CAP left.

**S2 — Filters (Developer).**
Scope: add `gte`/`lte` to the read handle; add types, colours + colour_match, colourless, mana value range, location, only_proxies, include_rules_text; `filterCoverage` note; `knownPlaces` on unknown location; update the tool description (main types only, either-face rule, colourless fits "within").
Accept: S1 of the brief ("green creatures not in a deck") works in one call and total matches the live check (mono-green creature copies = 392 before the free filter); S3 ("what's in Unsorted") returns that box's cards; colour modes within/exact/includes each tested incl. colourless; mana value range inclusive; contradictory inputs (colourless + colours, only_proxies + no proxies) give INVALID_INPUT; unknown place returns zero results with real place names; with a type filter the answer says 100 cards have no facts; unknown fields rejected; registry snapshot updated for the new inputs only.

**S3 — Group counts (Developer).**
Scope: optional input on get_collection_summary: group_by type | colour | location | kind plus the same filters.
Accept: no input = identical to today's answer (regression test); group_by colour (brief S2) returns one answer, groups add up to total copies, includes a "No facts" group; location groups cover each deck, each box, In your hand, Missing; at most 60 groups with a truncation flag; answer under 3 KB; failures are lookup errors.

**S4 — Verify, describe, close (Tester, then Scribe/Gene).**
Tester runs brief scenarios S1 to S3 live and read-only against the real collection, compares numbers to direct database counts, confirms no writes. Because no separate test account exists, nothing here saves data; record that. Scribe marks slice A contract's search line as superseded and updates status. Gene updates decisions.md only if the owner asks.
Accept: scenario answers match direct counts; connector tool list in Claude shows updated descriptions; old path confirmed gone.

## New decisions made (need owner confirmation)
- "Free" now excludes In your hand and Missing copies (already approved default 2; this changes the existing flag, not a new flag).
- Colour search default: "green" means fits a green-only deck (colourless included); exact and includes available.
- Main types only (eight); no subtype search, because the library drops subtypes.
- Type counts use one type per card (front face; Land first, then Creature); a type filter matches either face.
- Summary lives on the existing summary tool as optional input rather than a new tool.
- Draft migration kept in supabase/drafts (not migrations) per current practice for unapplied files.

## Assumptions
- Single live user; row protection already applied (CC-03a), so the view inherits own-rows-only.
- Connector tokens use the authenticated database role like the existing user tables. [Approximate; S0 check confirms]

## Challenges to locked decisions
- none

## Open questions
- Owner: approve applying the view (S0)? 
- Owner (behaviour): when Claude asks for "green", should colourless cards show up? Recommendation: yes (fits a green deck); Claude can ask for exact green only.
- Gene: the 100 owned cards with no library facts (57 two-faced) deserve a separate data task; not part of CC-07.

## Verification
- Read-only SQL on hosted project (counts, join plan, view-logic dry run) — results as cited; nothing created or changed.
- No code or tests run; no code written. Migration draft not applied.


## AMENDMENT 2026-11-16 (role search added): slices S2, S3 and S4 grow as set out in contract section 13.7 (`docs/oracle/contracts/connector-collection-search.md`). No database change; S0 and S1 unchanged.
