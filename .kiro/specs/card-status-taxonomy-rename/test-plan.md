# Test Plan — Card Status Taxonomy Rename & Expansion

> Authored by: James (Tester)
> Date: 2026-07-14
> References: `requirements.md`, `design.md`

## Test Strategy

This feature is a **vocabulary rename with one new classification state (Claimed) and one new schema capability (Missing)**. The primary risk is regression — breaking existing consumers during a broad codemod. The secondary risk is classification accuracy — Claimed must never misclassify when free copies exist.

**Testing approach:**
- **Unit tests** for the classification engine (the core logic in `card-status.ts`)
- **Integration tests** for the API routes that serve status data
- **Migration verification** (one-time, manual) for schema correctness
- **Regression sweep** (automated grep + TypeScript compiler) for zero old values at runtime

No E2E/browser tests for this pass — the UI changes are label/color swaps on existing components. Visual verification is manual during review.

---

## 1. Unit Tests — Classification Engine

**File:** `src/lib/card-status.test.ts` (new)

### 1.1 classifySlotStatus (synchronous, pure)

| Test case | Input | Expected |
|-----------|-------|----------|
| Resolved with non-proxy copy | `physicalCopyId: 42, isProxy: false` | `'original'` |
| Resolved with proxy copy | `physicalCopyId: 42, isProxy: true` | `'proxy'` |
| Unresolved (null physical_copy_id) | `physicalCopyId: null, isProxy: null` | `'unallocated'` (default) |

### 1.2 computeUnresolvedStatuses (async, batch — the critical path)

**Setup:** Mock Supabase client returning controlled physical_copies + deck_cards data.

| Test case | Setup | Expected |
|-----------|-------|----------|
| Card with free non-missing copy (no deck link) | 1 physical_copy, no deck_cards row | `'unallocated'` |
| Card with all copies held by other decks | 2 copies, both have deck_cards links | `'claimed'` |
| Card with zero non-missing copies | 0 physical_copies rows (or all missing=true) | `'unowned'` |
| Card with 3 copies: 2 held, 1 free | 3 copies, 1 has no deck_cards link | `'unallocated'` (one free = not claimed) |
| Card with 1 copy, missing=true | 1 copy with missing=true | `'unowned'` (missing excluded) |
| Card with 2 copies: 1 held, 1 missing | 1 held + 1 missing | `'claimed'` (missing excluded, only held remains) |
| Card not in card_definitions at all | No def row for card_name | `'unowned'` |
| Empty input (no card names) | `[]` | Empty map |
| Multiple cards, mixed statuses | 3 cards: one free, one all-held, one missing | Correct per-card classification |

### 1.3 computeDeckCardStatuses (integration of classify + batch)

| Test case | Setup | Expected |
|-----------|-------|----------|
| Mix of resolved + unresolved + generic land | 5 cards: 2 resolved, 2 unresolved, 1 basic land | Correct status per card, generic_land for basic land |
| All resolved | 100 cards, all with physical_copy_id | All `'original'` or `'proxy'`, no batch query triggered |
| All unresolved | 10 cards, all null physical_copy_id | Batch query runs, each gets correct unresolved status |

### 1.4 Generic land exemption

| Test case | Input | Expected |
|-----------|-------|----------|
| "Forest" with no physical_copy_id | `card_name: 'Forest', physical_copy_id: null` | `'generic_land'` |
| "Forest" with deliberate physical_copy_id | `card_name: 'Forest', physical_copy_id: 99` | `'original'` or `'proxy'` (re-enters taxonomy) |
| "Snow-Covered Island" with no copy | Depends on `isBasicLand()` logic | Verify this IS treated as generic land |

---

## 2. Unit Tests — Missing Flag Logic

**File:** `src/lib/missing.test.ts` (new, or co-located with the route handler)

### 2.1 markCopyMissing

| Test case | Setup | Expected |
|-----------|-------|----------|
| Copy linked to a deck slot | physical_copy with deck_cards link | `missing=true` set, deck_cards.physical_copy_id nulled |
| Copy not linked to any deck | physical_copy, no deck_cards reference | `missing=true` set, no deck_cards update needed |
| Copy already missing (idempotent) | physical_copy with `missing=true` | No error, no change |

### 2.2 unmarkCopyMissing

| Test case | Setup | Expected |
|-----------|-------|----------|
| Missing copy un-marked | `missing=true` → `missing=false` | Copy returns to Available pool, no auto-relink |
| Non-missing copy un-marked (no-op) | `missing=false` | No error, no change |

### 2.3 Missing → Completeness Chain

| Test case | Setup | Expected |
|-----------|-------|----------|
| Built deck at 100/100, one card's copy marked Missing | Deck with 100 resolved slots | Completeness drops to 99/100. Badge would flip Playable → Unplayable. |
| Built deck at 99/100, last unresolved slot's copy appears (un-marked) | Copy un-marked, slot still null | Completeness stays 99/100 (no auto-relink) |

---

## 3. Integration Tests — API Routes

### 3.1 GET /api/decks/[id]/card-statuses

**File:** `src/app/api/decks/[id]/card-statuses/route.test.ts` (update existing or new)

| Test case | Expected response |
|-----------|-------------------|
| Deck with mix of all 5 states | `counts: { total, original, proxy, unallocated, claimed, unowned }` all correct |
| Deck with only generic lands unresolved | `counts.generic_land` populated, not included in `total` |
| Empty deck (0 cards) | `cards: [], counts: { total: 0, ... }` |
| Auth failure (no session) | 401 |
| Invalid deck ID | 400 |

**Regression critical:** Response must NOT contain keys `allocated` or `allocated_proxy` (old values).

### 3.2 POST /api/physical-copies/[id]/missing (new route)

| Test case | Expected |
|-----------|----------|
| Mark a linked copy as missing | 200, `missing=true`, affected deck IDs returned |
| Mark a free copy as missing | 200, `missing=true`, empty affected deck IDs |
| Mark non-existent copy | 404 |
| Mark another user's copy | 403 or 404 (no leak) |
| Auth failure | 401 |

### 3.3 DELETE /api/physical-copies/[id]/missing (new route)

| Test case | Expected |
|-----------|----------|
| Un-mark a missing copy | 200, `missing=false`, card_name returned |
| Un-mark a non-missing copy (idempotent) | 200, no error |
| Auth failure | 401 |

---

## 4. Migration Verification

**Run once after migration 019 deploys. Manual verification via Supabase SQL editor.**

| Check | Query | Expected |
|-------|-------|----------|
| `missing` column exists | `SELECT column_name FROM information_schema.columns WHERE table_name='physical_copies' AND column_name='missing'` | 1 row |
| `missing` defaults to false | `SELECT COUNT(*) FROM physical_copies WHERE missing = true` | 0 |
| No `'not_owned'` values remain | `SELECT COUNT(*) FROM deck_cards WHERE ownership_status = 'not_owned'` | 0 |
| CHECK constraint updated | `SELECT conname, consrc FROM pg_constraint WHERE conrelid = 'deck_cards'::regclass AND conname LIKE '%ownership%'` | Allows NULL, 'original', 'proxy', 'generic' only |
| RPC updated | `SELECT prosrc FROM pg_proc WHERE proname = 'batch_assign_deck'` | Contains updated function body |
| Index on missing exists | `SELECT indexname FROM pg_indexes WHERE tablename='physical_copies' AND indexname LIKE '%missing%'` | 1 row |

---

## 5. Regression Sweep — Zero Old Values

**Automated, run as part of CI or pre-merge check.**

### 5.1 TypeScript compiler (zero-effort)

The type change from `'allocated' | 'allocated_proxy' | 'unallocated' | 'unowned'` to `'original' | 'proxy' | 'unallocated' | 'claimed' | 'unowned'` means any file still using old values will fail `tsc`. This catches:
- Switch/case branches on old values
- Type assertions
- Comparison operators

**Gate:** `npx tsc --noEmit` must pass with zero errors.

### 5.2 Runtime string grep (catches what tsc misses)

TypeScript can't catch runtime strings in API responses, URL parameters, or database queries that compare against old values by string literal.

```bash
# Must return 0 matches across all .ts/.tsx files (excluding migrations and this test plan)
grep -rn "'allocated'" src/ --include="*.ts" --include="*.tsx" | grep -v "unallocated" | grep -v "over_allocated"
grep -rn "'allocated_proxy'" src/ --include="*.ts" --include="*.tsx"
grep -rn "'not_owned'" src/ --include="*.ts" --include="*.tsx"
grep -rn "'over_allocated'" src/ --include="*.ts" --include="*.tsx"
```

**Gate:** All four greps return zero results.

### 5.3 Builder vocabulary grep

```bash
# Old builder terms must not appear in any component or route
grep -rn "BuilderCardStatus\|BuilderStatusBadge\|builder-card-status" src/ --include="*.ts" --include="*.tsx"
```

**Gate:** Zero results (files deleted).

---

## 6. UI Verification (Manual — during PR review)

Not automated for this pass. Reviewer checks:

| Surface | Check |
|---------|-------|
| Cards Tab filter chips | 5 chips: All, Original, Proxy, Unallocated, Claimed, Unowned. Correct colors per design. |
| Cards Tab per-row badge | Badge matches slot status. Claimed shows "Held by [deck]" subtext. |
| Decks Grid (Built deck, Playable) | No Unplayable badge shown. Lifecycle badge says "Built" not "Boxed". |
| Decks Grid (Built deck, Unplayable) | Orange badge with AlertTriangle + N/100 count. |
| Decks Grid (Brew/Archived deck) | No Playable/Unplayable badge regardless of resolution count. |
| Builder search | Same five terms as Cards Tab. "Claimed" with holding deck subtext. |
| Collection (Missing copy, filter off) | Missing copies hidden. |
| Collection (Missing copy, filter on) | Dimmed row, strikethrough name, "Missing" badge, "×" button. |
| Picklist (Claimed row) | Shows holding-deck candidates with Tier labels. Tier 4 triggers confirmation modal. |

---

## 7. Performance Baseline

**Not a formal load test** — this is a single-user app. But verify the Claimed detection query doesn't regress page load time.

| Measurement | Method | Threshold |
|-------------|--------|-----------|
| `/api/decks/[id]/card-statuses` response time | Vercel function log, typical deck (100 cards, ~20 unresolved) | <500ms total (current baseline ~300ms, budget +200ms for Claimed query) |
| Collection page load with Missing filter | Browser DevTools network tab | No new waterfall — Missing copies filtered client-side from existing data |

---

## 8. Release Gate Criteria

All of the following must pass before this feature ships:

- [ ] `npx tsc --noEmit` passes (zero type errors)
- [ ] All unit tests in `card-status.test.ts` pass
- [ ] All unit tests in `missing.test.ts` pass
- [ ] API integration tests pass for both new and updated routes
- [ ] Runtime string grep returns zero matches for old values (Section 5.2 + 5.3)
- [ ] Migration verification queries all pass (Section 4)
- [ ] Manual UI review completed by at least one reviewer (Section 6)
- [ ] No runtime console errors on Cards Tab, Decks Grid, Builder search, Collection
- [ ] Card-statuses API response contains zero occurrences of `allocated` or `allocated_proxy` keys

---

## 9. Risks Carried from Requirements

| Risk | Test coverage |
|------|--------------|
| Claimed misclassification (false positive — says claimed when free copy exists) | Unit test 1.2 cases 1, 4, 6 — explicit edge cases for "one free among many held" |
| Missing chain incomplete (copy marked but slot not unlinked) | Unit test 2.1 + integration test 3.2 — verify both writes happen |
| Old values survive in runtime strings | Section 5.2 grep sweep — catches what TypeScript can't |
| Performance regression from Claimed query | Section 7 baseline check |
| Playable badge shown on non-Built decks | Unit test via computeDeckCardStatuses (mock deck status) + manual UI check |
