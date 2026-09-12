# Tasks: Commander Context Snapshot

## Phase 0 — Evidence and contract

- [x] Measure production database and commander-table sizes. Refs: requirements 1; design Architecture.
- [x] Trace runtime consumers, writers, foreign keys, and Vercel constraints. Refs: requirements 1; design Components.
- [x] Define phased snapshot boundary and rollback modes. Refs: requirements 5.3–5.4; design Source selector.

## Phase 1 — Snapshot generation

- [x] Implement deterministic paginated `ref_build_cards` export. Refs: requirements 5.1.
- [x] Create SQLite schema, indexes, manifest, checksum, and atomic publication. Refs: NFR-2–NFR-3, NFR-7.
- [x] Add structural and representative query validation. Refs: requirements 5.1–5.2.
- [x] Generate the first production snapshot and record its measured size.

## Phase 2 — Runtime dual read

- [ ] Add server-only Supabase and snapshot repositories behind one interface.
- [ ] Route build-card, signature, staple, and synergy reads through the interface.
- [ ] Add `supabase`, `shadow`, and `snapshot` source modes.
- [ ] Add checksum/manifest validation and explicit failure behavior.
- [ ] Configure narrow Next.js output tracing and confirm emitted artifacts.

## Phase 3 — Verification and cutover

- [ ] Compare aggregate counts and representative build queries.
- [ ] Deploy shadow mode and collect mismatch evidence.
- [ ] Switch deployed reads to snapshot while retaining Supabase rows.
- [ ] Verify API, AI grounding, deck analysis, and rollback.

## Phase 4 — Storage reclamation

- [ ] Verify no live runtime or job writes require `ref_build_cards`.
- [ ] Verify the deprecated recommendation relation has no rows or consumers.
- [ ] Prepare measured, reversible storage-reclamation migration.
- [ ] Obtain explicit destructive-change approval.
- [ ] Apply migration, run advisors, and measure database size after reclamation.

## Phase 5 — Later context migration

- [ ] Replace weekly insight/taxonomy database writes with atomic snapshot publication.
- [ ] Migrate insights and taxonomy only after freshness and deployment automation pass.
