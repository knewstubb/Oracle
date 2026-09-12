# Delivery Log — Commander Context Snapshot

> Feature: Commander Context Snapshot
> Status: In Progress
> Last updated: 2026-09-12
> Maintained by: Delivery Lead

---

## 2026-09-12 — Runtime reads migrated behind dual-source repository

**Context:** Phase 2 required every live `ref_build_cards` consumer to use one server-only contract before Supabase rows could be compared with or replaced by the immutable SQLite snapshot.

**What changed:**
- Added canonical build-card types plus Supabase and read-only SQLite repositories for ranked cards, signatures, staples, and batched synergy-score lookups.
- Added `COMMANDER_CONTEXT_SOURCE=supabase|shadow|snapshot`; `supabase` remains the default, `shadow` returns Supabase while logging count/digest parity, and `snapshot` serves only a fully validated artifact.
- Migrated the commander build facade, deck detail synergy lookup, deck build detection, and brew generation grounding to the repository; all affected routes explicitly use the Node.js runtime.
- Made snapshot startup fail closed on manifest schema, safe artifact name, byte size, SHA-256, SQLite integrity, or row-count mismatch. Brew generation now propagates source failures instead of silently continuing without EDHREC grounding.
- Made shadow startup lazy and fault-tolerant: a missing or invalid snapshot emits `shadow_error` without exposing card names and preserves the Supabase response.
- Replaced broad dynamic-route trace includes with a literal bundled artifact path. Next.js now traces the 33.95 MiB snapshot only into `/api/decks/[id]`, `/api/decks/[id]/build`, and `/api/ai/brew/generate`, together with the manifests, repository modules, and native SQLite runtime.

**Validation evidence:**
- `npm run build` passes on Next.js 16.2.4; the existing middleware deprecation warning remains, and project-wide type validation remains intentionally skipped by existing configuration.
- Targeted ESLint reports 0 errors and 6 pre-existing unused-symbol warnings in the migrated route files.
- Snapshot smoke returned 5 ranked cards, 5 signatures, 5 staples, and 5 synergy scores from the representative build.
- Production-backed shadow smoke reported exact digest matches for all four repository operations.
- A forced missing-manifest shadow smoke emitted `status=shadow_error` and still returned the expected 5 Supabase cards.
- Generated NFT traces contain the immutable SQLite artifact in exactly the three intended route trace files; direct source search finds all runtime `ref_build_cards` queries centralized in the Supabase repository.

**Decisions made:**
- Preserve `supabase` as the default until deployed shadow evidence is collected; this increment performs no production mutation or deletion.
- Treat live `category` as the canonical source for `cardType`. This deliberately repairs the prior `card_type` projection, which does not exist in production and silently returned empty recommendation data.
- Use deterministic cross-source tie-breakers before limits so snapshot parity is reproducible; parity compares the canonical repaired contract rather than preserving the broken empty-result behavior.
- Keep the bundled artifact filename explicit in server code so per-route static tracing stays narrow and a manifest pointing at an unbundled snapshot fails visibly.

**Loop-back:**
- Backtrack-one: semantic review found that brew generation swallowed snapshot bootstrap failures and that eager shadow construction bypassed fallback. Brew now rethrows source failures, while shadow initialization is cached and lazy inside the guarded comparison operation; both failure paths were re-verified.

**Refs:**
- Runtime repository: `src/lib/commander-context/`
- Feature tasks: `.kiro/specs/commander-context-snapshot/tasks.md`
- Commit: task #11 checkpoint

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
- Commit: `1587c0a`

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
