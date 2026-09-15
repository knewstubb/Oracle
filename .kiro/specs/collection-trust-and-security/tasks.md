# Tasks: Collection Trust & Security

## Phase 1: Collection Replace Safety (Option A) — CORRECTED 2026-09-14

**Finding:** Validate-then-swap is already implemented and hosted-verified as part of the `collection-foundation` spec (see its delivery log, 2026-09-12/14 entries). `chunkedImport()` sends the full CSV as one request; `executeInstanceLevelImport()` resolves every row before any write; `replace_collection()` RPC does the delete+insert in one locked transaction. **TD-026 should be marked resolved, not left open.** No implementation tasks 1.1–1.3 remain — struck from this list.

- [x] ~~1.1 Create validation logic~~ — already exists (`executeInstanceLevelImport` Stage 3, full-file resolution before any write).
- [x] ~~1.2 Implement replace RPC with transaction wrapping~~ — already exists (`replace_collection` → `apply_collection_sync`, one transaction, advisory-locked).
- [x] ~~1.3 Create replace endpoint~~ — already exists (`POST /api/collection/import?mode=replace`).

### Progress & Feedback (streaming NDJSON — decided 2026-09-14)
The safe replace route remains one request and one transaction. It now streams progress events over that same response; no polling endpoint or durable job table is needed.
- [x] **1.4a** Choose a serverless-safe progress transport: a single NDJSON `ReadableStream` response for the default replace path. No in-memory job state or `import_jobs` table.
- [x] **1.4b** Add progress callbacks to `executeInstanceLevelImport` for validation, resolution, preparation, and replacement phases.
- [x] **1.4c** Update `POST /api/collection/import?mode=replace` to return NDJSON progress events and a terminal completion/error event.
- [x] **1.4d** Update `chunkedImport` to incrementally decode NDJSON while preserving JSON behavior for add-only/custom paths.
- [x] **1.4e** Update `CollectionImportButton` to show physical-card counts and server-side phases from streamed progress.
- [ ] **1.5** Design and implement error reporting with line numbers, specific card names for validation failures (currently returns a flat error array — check if line-level detail is already present in `errors[]` before building new UI for it).
- [x] **1.5a** Add a confirmation/warning step to `CollectionImportButton` before a replace-mode import runs: state clearly that this replaces the entire collection, deck allocations will be cleared and need Built-deck reconciliation afterward, and manual per-copy edits (storage location, notes, price, missing flags) will not survive. Currently no such warning exists.

### Testing & Validation
- [ ] **1.6** Verify existing atomic-replace behavior still holds after the async job refactor: intentional mid-import error leaves old collection intact, no partial state. (This behavior itself is already proven — 2026-09-12/14 delivery log — this task is regression coverage for the refactor, not new discovery.)
- [ ] **1.7** Confirm Option A limitations are already documented for the user: manual per-card edits (storage location, notes, purchase price, missing flags) do not survive reimport — reflect in UI copy if not already present.

### Housekeeping
- [ ] **1.8** Update `.kiro/specs/tech-debt-register.md`: mark TD-026 `resolved` with date and reference to the `collection-foundation` delivery log entries that fixed it.

## Phase 2: Row Level Security (RLS)

### Database Policy Implementation
- [ ] **2.1** Audit `user_cards`, `user_copies`, `decks`, `deck_cards` for `user_id` FK consistency and add any missing columns if needed.
- [ ] **2.2** Write migration: enable RLS on all four tables, add `USING (user_id = auth.uid())` policies for `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- [ ] **2.3** Update all service-role functions (like `replace_user_collection`) to use `SECURITY DEFINER` with explicit `user_id` parameter.

### Isolation Testing
- [ ] **2.4** Create two test user accounts in seeded database.
- [ ] **2.5** Verify isolation: each test user can only see/modify their own cards, decks, copies.
- [ ] **2.6** Test edge cases: attempt raw SQL cross-user access (should fail), verify service-role still works.

### Documentation & Release
- [ ] **2.7** Document RLS policy scope for future maintainers.
- [ ] **2.8** Verify no breaking changes to existing single-user flows.

## Known Issues to Address (Separately or In-Scope)

### Deck Import Missing-Decks Bug
- **Status:** Tracked as separate spec `deck-import-missing-decks-fix`.
- **Symptom:** Not all decks from an Archidekt export are visible in the deck import picker.
- **User impact:** Makes re-importing a collection from Archidekt incomplete.
- **Scope for this effort:** Out of scope — will be addressed in its own spec.

## Scope Decisions

### In Scope
- Atomic validation-then-swap (Option A).
- RLS policies on all user-owned tables.
- Real-time import progress reporting.
- Error reporting with context.
- Two-account isolation testing.

### Deferred
- Option B (true incremental diffing).
- Full multi-tenant infrastructure.
- Backup/disaster recovery.
- Audit logging.

---

*Authored: 2026-09-14 by Delivery Lead (Gene)*
*Status: Draft, awaiting confirmation on deck-import bug scope*