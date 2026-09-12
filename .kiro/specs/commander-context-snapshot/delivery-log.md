# Delivery Log — Commander Context Snapshot

> Feature: Commander Context Snapshot
> Status: In Progress
> Last updated: 2026-09-12
> Maintained by: Delivery Lead

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
