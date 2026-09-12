# Code Cleanup Audit

> Audited: 2026-08-12
> Purpose: Identify dead code, orphaned files, and cleanup opportunities

## Summary

| Category | Count | Action |
|----------|-------|--------|
| **Uncommitted deletions** | 132 files | Commit existing cleanup |
| **Scanner archive/residue** | Removed | Completed 2026-09-03 |
| **Orphan test files** | 27+ | Review and delete |
| **Scripts folder** | 64 files | Review for one-time scripts |
| **Dormant feature code** | ~10 files | Decision needed |

---

## 1. Uncommitted Deletions (132 files)

Git status shows 132 files marked as deleted but not committed. This appears to be in-progress cleanup work. These should be committed or restored.

**Categories of deleted files:**
- `docs/archive/*` — Old documentation
- `scripts/*` — One-time migration scripts
- `src/app/api/ai/debrief/*` — Cut feature routes
- `src/app/api/ai/deck-scan/*` — Cut feature routes

**Recommended action:** Review and commit deletions with proper commit message.

---

## 2. Card Scanner Removal (Completed 2026-09-03)

The previously documented `src/_archived/scan-feature/` directory was already absent. A dependency trace found only four pieces of runtime residue: an unused dHash database, a stale mobile `/scan` link, global camera permission, and a scanner-only OCR Edge Function source.

**Completed action:**
- Deleted `public/scan/hash-db.json`.
- Removed the stale mobile Scan navigation item.
- Changed the global Permissions-Policy to deny camera access.
- Confirmed the linked Supabase project had no deployed Edge Functions, then deleted local `supabase/functions/ocr-collector-number/` source.
- Preserved historical research, but corrected current product documentation and TD-017.

Future physical capture should produce the supported CSV/text import format rather than add a separate collection-write path.

---

## 3. Orphan Test Files (27+)

Test files that don't have corresponding implementation files:

| Test File | Likely Cause |
|-----------|--------------|
| `DraftDeckTile.test.tsx` | Component moved to different location |
| `BrewBriefCard.test.tsx` | Component deleted |
| `BrewSkeletonPanel.test.tsx` | Component renamed/deleted |
| `DeadWeightUI.test.tsx` | Feature cut |
| `BrewSaveDialog.test.tsx` | Component renamed/deleted |
| `proxy-tag-interpretation.test.ts` | Module deleted |
| `archidekt-playwright.test.ts` | Playwright scraping removed |
| `rating-engine.*.test.ts` | Deck ratings feature archived |
| `deck-import-*.test.ts` | Test files may be valid — in `__tests__/` folder |
| `migration-020.test.ts` | One-time migration test |
| `accessibility.test.tsx` | General test — may be valid |

**Recommended action:** 
1. Delete clearly orphaned tests (BrewBriefCard, BrewSkeletonPanel, DeadWeightUI, etc.)
2. Review `__tests__/` folder tests — some may still be valid
3. Keep accessibility.test.tsx if it tests general patterns

---

## 4. Scripts Folder (64 files)

Many scripts appear to be one-time data migrations or analysis tools:

**Likely one-time scripts (can delete after confirming):**
- `apply-category-migration.ts`
- `apply-precon-migration.ts`
- `backfill-*.ts`
- `dedup-builds.ts`
- `debug-*.ts`

**Utility scripts (keep):**
- `compute-deck-ratings.ts`
- `export-sqlite.ts`
- `load-postgres.ts`
- `verify-e2e.ts`

**Analysis scripts (decision needed):**
- `analyze-build-*.ts` — May be useful for future analysis
- `audit-commander-data.ts` — Ongoing utility
- `check-*.ts` — Various validation scripts

**Recommended action:** Move one-time scripts to a `scripts/_archive/` folder rather than deleting, in case they're needed for reference.

---

## 5. Dormant Feature Code (Decision Needed)

These features have UI code, API routes, and database tables, but the primary AI-driven functionality was removed:

### Precon Mod Tracker
| Artifact | Path | Status |
|----------|------|--------|
| Component | `src/components/PreconModTracker.tsx` | Imported by StrategyTab |
| Engine | `src/lib/precon-mod-engine.ts` | Used |
| Store | `src/lib/precon-mod-store.ts` | Used |
| API routes | `src/app/api/decks/[id]/precon-mod-state/` | Exists |
| API routes | `src/app/api/decks/[id]/precon-diff/` | Exists |
| API routes | `src/app/api/precons/` | Exists |
| DB table | `precon_mod_state` | Exists |

**Assessment:** This feature appears to be partially implemented and wired up. The StrategyTab imports and renders PreconModTracker. Need to determine if it's intentionally dormant or just incomplete.

### Debrief Session
| Artifact | Path | Status |
|----------|------|--------|
| API route | `src/app/api/decks/[id]/debrief-session/` | Exists |
| UI code | UpgradeTab references debrief-session | Used |
| DB tables | `debrief_sessions`, `debrief_actions` | Exist |
| AI routes | `src/app/api/ai/debrief/*` | **DELETED** |

**Assessment:** The debrief session data layer exists and is read by UpgradeTab, but the AI routes that generate recommendations were deleted. This creates orphaned data-fetching code that won't return meaningful results.

### Goldfish Tab
| Artifact | Path | Status |
|----------|------|--------|
| Component | `src/components/GoldfishTab.tsx` | **FULLY IMPLEMENTED** |

**Assessment:** This feature IS implemented and functional. The GoldfishTab provides:
- New game / draw / mulligan / undo controls
- Zone management (library, hand, battlefield, graveyard, command zone)
- Card movement via double-click
- Turn and mulligan count tracking
- Card preview on click

**Action:** Un-archive the spec — this feature is shipped and working. The spec was incorrectly archived.

---

## Recommendations

### Immediate (Low Risk)
1. **Delete `src/_archived/`** — 2.7 MB of dead code, not imported
2. **Commit existing deletions** — 132 files already staged for deletion

### Short Term (Medium Risk)
3. **Clean up orphan tests** — Delete clearly dead test files
4. **Archive one-time scripts** — Move to `scripts/_archive/`

### Decision Required
5. **Precon Mod Tracker** — Is this feature meant to work? If not, remove from StrategyTab
6. **Debrief Session** — Remove dead code from UpgradeTab that fetches non-functional data
7. **Goldfish Tab** — Inspect and decide: finish implementing or remove

---

## File Counts by Category

```
src/_archived/              ~15 files (2.7 MB)
Orphan test files           ~27 files
One-time scripts            ~30 files
Uncommitted deletions       132 files
Dormant feature code        ~10 files
───────────────────────────────────────
Potential cleanup total     ~214 files
```

