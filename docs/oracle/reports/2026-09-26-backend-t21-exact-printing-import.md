# Report: T-21 — exact-printing assignment on built-deck import

Role: Backend
Status: DONE (one migration written outside the Backend lane — see "Challenges")

Task as received: Task T-21: Update the built-deck importer so that it only assigns a physical copy to a deck slot when the owned copy's printing (scryfall_id) exactly matches the printing listed in the Archidekt deck. If no exact match is owned, leave the slot unassigned (planned). Per D-021.

Inputs:
- D-021 in docs/oracle/decisions.md
- T-13 report in docs/oracle/reports/2026-09-26-architect-m1-exit-test.md (section 6: printing mismatches)
- src/lib/deck-import.ts
- supabase/migrations/20260925220000_placement_source.sql (reconcile_built_deck RPC)
- T-20 migration: supabase/migrations/20260926120000_import_maybeboard_relation.sql

Done when: the importer no longer falls back to any owned printing of the same card name; exact-match assignment is enforced; and you report typecheck/test results.

## What changed and why

The built-deck importer does no copy selection itself: it sends the imported rows to one atomic RPC, `reconcile_built_deck`, which chooses which free copy to sleeve. The name-only fallback therefore lived in SQL, not in TypeScript [Confirmed: supabase/migrations/20260926120000_import_maybeboard_relation.sql, lines 399–404]. To enforce D-021 the RPC had to change; no TypeScript change is required.

New migration `supabase/migrations/20260926130000_exact_printing_import.sql` replaces `reconcile_built_deck` with two exact-printing rules:

1. **On insert (new slot):** the eligibility query now requires `v_row.scryfall_id IS NOT NULL AND uc.printing_id = v_row.scryfall_id`. The old `ORDER BY CASE … THEN 0 ELSE 1 END` preference that fell back to another printing of the same card name is gone. If no free copy of the exact printing is in storage, the slot is inserted Planned, exactly as before.
2. **On re-import (existing slot):** the existing row is now joined to its sleeved copy. If the copy's printing differs from the imported `scryfall_id`, the copy is returned to default storage and the slot is set back to Planned (`copy_id`, `ownership_status`, `placement_source` all NULL). A correctly matching assignment is preserved, so the 124 mismatch slots from T-13 section 6 are cleared on the next built-mode re-import rather than surviving.

Exemptions (kept as before, because they do not track a specific owned printing): maybeboard slots (D-005/D-018), generic basic-land slots, and manual proxy assignments (D-019 — a proxy is a stand-in, and `add_proxy_to_slot` sets its `printing_id` to the latest printing, not the deck's listed printing [Confirmed: supabase/migrations/20260925220000_placement_source.sql, lines 584–608]). The match ordering was also made validity-aware so a duplicate mismatched row cannot consume the match and evict a correctly-assigned row.

## Changed files

- `supabase/migrations/20260926130000_exact_printing_import.sql` — new migration replacing `reconcile_built_deck` so a physical copy is assigned only when its `printing_id` equals the imported `scryfall_id` (D-021); mismatched existing assignments are released to Planned.

No TypeScript file changed. `src/lib/deck-import.ts` already passes `scryfall_id` through unchanged and contains no fallback logic [Confirmed: src/lib/deck-import.ts, lines 107–140, 226–259].

## New decisions made (need owner confirmation)

- On built-mode re-import, an existing slot whose sleeved copy is the *wrong printing* is released to storage and left Planned, rather than being preserved or swapped for a correct-printing copy. This follows D-021 (the assignment is invalid) and D-020 (no automatic allocation pass), but it was not written down. It is the mechanism that clears the T-13 mismatch slots.
- `new_cards` and `theorycrafted` modes are unchanged. In `new_cards` mode a copy is created for the exact imported printing, so it already satisfies D-021.

## Assumptions

- The Deck's `deck_cards.scryfall_id` is the source of truth for "the printing listed in the Archidekt deck"; the normalizer sets it from Archidekt's `card.scryfall.id`.
- The RPC is the only place a built-mode copy is selected, so no TypeScript guard is needed.
- The migration is not applied to the database from this environment (no DB credentials), consistent with the T-12/T-20 pattern. It needs Architect review and the normal deploy path before it takes effect.
- Exempting basic lands is a judgement call: see "Open questions".

## Challenges to locked decisions

- None to a locked decision.
- Process challenge (not a decision): AGENTS.md and the Backend role say new migrations are the Architect's lane. As with T-20, the done-criteria required end-to-end behaviour that only the `reconcile_built_deck` function body can express, and the task named the migration files as inputs, so I wrote the migration. It needs Architect review before deploy. If the intended split is "Architect drafts the RPC migration first", this task should be re-run after that migration lands.

## Open questions

1. **Basic lands.** Archidekt basic lands carry a `scryfall_id`, so they are not treated as generic (`is_generic_land` requires a basic land *without* a printing [Confirmed: src/lib/deck-import.ts, line 134]) and are now held to exact-printing matching. If the owner sleeves a different basic-land printing than Archidekt lists, that slot will now be released and reported as a shortfall. Should basic lands be exempt from exact-printing matching (fungible), or should the owner's exact basics be tracked? No decision covers this.
2. **Conflict reason wording.** With exact-printing matching, a shortfall caused purely by a printing difference is still reported with `reason: 'no_free_copy'` when a free copy of another printing exists. The `AllocationConflict` reason union is `'unowned' | 'claimed' | 'no_free_copy'` [Confirmed: src/lib/deck-import.ts, lines 29–37]. A distinct `printing_mismatch` reason would explain the shortfall honestly to the owner; I did not add it because it changes the API response enum and the task did not ask for it.
3. **NULL `scryfall_id` rows.** A non-basic row with no `scryfall_id` can no longer match any copy (the insert guard requires a non-null printing), and an existing assignment on such a row is released. Archidekt always supplies a `scryfall_id`, so this should be rare, but confirm the Moxfield path always resolves one.
4. **Swap vs. release.** After releasing a wrong-printing copy, should the importer pull a free correct-printing copy in the same pass (swapping), or leave the slot Planned? D-020 points to leaving it Planned; confirm.

## Verification

- Migration structural check — 1 `CREATE OR REPLACE FUNCTION`, 1 `AS $function$`, 1 `$function$;` terminator; 0 occurrences of the old `THEN 0 ELSE 1 END` fallback; 3 exact-printing guards present (match-preserve, match-order, insert-eligibility).
- `node_modules/.bin/vitest --run src/lib/__tests__/deck-import-built.test.ts src/lib/__tests__/deck-import-proxy.test.ts src/lib/__tests__/deck-cards-diff.maybeboard.test.ts src/lib/__tests__/deck-normalizer.test.ts src/lib/__tests__/deck-cards-diff.preservation.test.ts src/lib/__tests__/deck-cards-diff.property.test.ts` — 6 files, 47 tests passed.
- `node_modules/.bin/tsc --noEmit` — 292 error lines, exactly the pre-existing baseline reported in the T-20 report. No TypeScript file was touched, so no new errors.
- `node_modules/.bin/vitest --run` (full suite) — 52 failed files / 245 failed tests, identical to the baseline in the T-20 report (missing `NEXT_PUBLIC_SUPABASE_URL` and `.opencode` self-tests). The one import-related failure, `src/lib/__tests__/deck-import-integration.test.ts`, is pre-existing: it calls an `importDeckAddNewCards` function that no longer exists and a mocked query missing `.range` — unrelated to this change.
- No database apply was attempted (no credentials in this environment), consistent with T-12/T-20. Verification of the SQL at runtime is deferred to the Architect review and the deploy path.

Note: `node_modules` is not installed in this worktree; verification used a git-ignored symlink to the sibling `t13-m1-exit-test` checkout, as in T-20.
