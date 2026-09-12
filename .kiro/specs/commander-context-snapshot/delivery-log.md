# Delivery Log — Commander Context Snapshot

> Feature: Commander Context Snapshot
> Status: In Progress
> Last updated: 2026-09-12
> Maintained by: Delivery Lead

---

## 2026-09-12 — Versioned build-card snapshot exported

**Context:** Phase 1 required a deterministic, validated local artifact before any runtime reads or production rows could move away from Supabase.

**What changed:**
- Added `scripts/export-commander-context.ts` with exact-count reads and stable two-key pagination in pages of at most 1,000 rows.
- Probed production schema at runtime and mapped the live `category` column to canonical SQLite `card_type`; no secrets or user data enter the artifact.
- Added row validation, duplicate detection, pre/post source-state checks, SQLite integrity/count/content validation, representative read checks, SHA-256 manifests, immutable versioned files, and manifest-last atomic publication.
- Exported 94,250 unique `ref_build_cards` rows into a 35,594,240-byte (33.95 MiB) SQLite file, down from the measured 187 MiB Postgres relation plus indexes.
- Reopened the artifact independently and verified count, integrity, and SHA-256. A second isolated export produced the same content digest and byte-identical SQLite SHA-256.

**Validation evidence:**
- Source and snapshot content SHA-256: `ac2860ad2bc007116c6f29f7cfaca8f7da2faa1873ea539e28681dc50fea6588`.
- SQLite file SHA-256: `d0da1021fad9f72db87c9121164aa44b4e9cc060cb5a9ff651da9fffe31d3487`.
- `PRAGMA integrity_check`: `ok`.
- Row count and unique key count: 94,250 each.
- Representative query checks: 13, covering ranked cards, type/minimum-inclusion filters, signatures, staples, batched synergy lookups, and an empty build.
- TypeScript and ESLint checks pass for the exporter.

**Loop-back:**
- Backtrack-one: the first export aborted before publication because the validation code compared Postgres ordering using JavaScript binary ordering. The exporter now treats database ordering as the pagination contract, detects duplicate keys independently, and computes cross-system content hashes using canonical UTF-8/SQLite binary ordering. The second and reproducibility exports passed.

**Decisions made:**
- `data/commander-context/manifest.json` is the atomic current-snapshot pointer; immutable versioned database and manifest files are published first.
- Keep the 33.95 MiB artifact bundled for the first runtime increment; Vercel trace/deployment size remains a Phase 2 gate.
- Production `ref_build_cards` remains untouched until dual-read and deployment parity pass and destructive approval is obtained.

**Refs:**
- Exporter: `scripts/export-commander-context.ts`
- Current manifest: `data/commander-context/manifest.json`
- Commit: pending

---

## 2026-09-12 — Storage pressure measured and migration scoped

**Context:** The user asked whether shared commander context could move to a local source to reduce Supabase database usage.

**What was found:**
- Production database size is approximately 504 MB.
- `ref_build_cards` consumes 187 MB for 94,250 rows, including 139 MB of indexes.
- Empty/deprecated `ref_edhrec_recommendations` retains 49 MB of index storage.
- Commander taxonomy consumes 18 MB and insights approximately 9.5 MB.
- Commander/build identity tables are small but referenced by deck foreign keys.
- Browser code already accesses this data through server routes, making a server-only repository boundary feasible.

**Decisions made:**
- Use a staged, UUID-preserving, read-only SQLite snapshot.
- Move `ref_build_cards` first because it is the largest payload and its refresh job is manual.
- Keep commander and build identity rows in Supabase.
- Keep weekly-refreshed insights/taxonomy in Supabase until atomic artifact publication is implemented.
- Do not remove production rows until deployed shadow parity passes and the user separately approves the destructive cutover.

**Handoff:**
- Developer owns exporter, repository abstraction, runtime migration, and parity validation.
- DevOps supports Vercel packaging, source-mode configuration, deployment evidence, and later storage measurement.
- Tester verifies API and recommendation parity before cutover.

**Refs:**
- Requirements: `.kiro/specs/commander-context-snapshot/requirements.md`
- Design: `.kiro/specs/commander-context-snapshot/design.md`
- Debt candidates: database capacity, reference-data publication, and stale/dead relations
