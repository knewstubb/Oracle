# Delivery Log — Collection CSV Import

> Feature: Collection CSV Import
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-02 — Feature Shipped

**Context:** CSV import from Archidekt and other sources shipped with instance-level support.

**What shipped:**
- `import-engine-v2.ts` handling replace, add, sync modes
- Instance-level: quantity N in CSV → N physical_copies rows
- Source-tag auto-detection from CSV column headers
- Identity resolution via Scryfall oracle_id
- Duplicate detection by scryfall_printing_id + source_tag
- Per-row failure logging without halting batch

**Decisions made:**
- V2 engine as primary, legacy V1 kept for backward compat
- Replace mode does full wipe + reimport
- Sync mode preserves existing allocation

**Known limitations:**
- No progress indicator during large imports (deferred)

**Refs:**
- Spec: `specs/collection-csv-upsert/`
- Engine: `src/lib/import-engine-v2.ts`

---

## 2026-09-03 — Migration readiness gate reopened

**Context:** The user intends to move the real collection into Oracle and requested a full readiness audit. Static tracing and validation showed that the shipped import behavior diverges from this feature's original non-destructive requirements.

**What was found:**
- Replace deletes all user copies before full-file parse/resolution/validation.
- Browser chunking commits the first chunk as replace and later chunks as add; interruption leaves partial state.
- Replacement creates new copy IDs and does not preserve deck allocations.
- Add/sync are not fully idempotent or transactional.
- Export does not reconstruct all copy metadata, storage, missing state, decks, or allocations.
- No verified database-native backup/restore rehearsal exists in repository documentation.
- Migration-critical quality gates are not green (277 failed tests; typecheck and lint fail).

**Gate decision:**
- **Rejected for authoritative migration.** Oracle may remain a secondary/test system, but Archidekt and independent exports must remain authoritative until remediation and restore rehearsal pass.
- Loop-back: **backtrack-multi** — requirements/design must be updated, Developer must implement staged atomic import and complete restore, DevOps must establish backup/staging/observability, Tester must verify realistic interruption/retry/round-trip scenarios.

**Decisions made:**
- No historical migration, data export, or legacy import engine is deleted during the audit.
- Current implementation is treated as reality; superseded requirements are explicitly marked.
- Collection Replace/Sync should be disabled or hard-gated before authoritative data is loaded.

**Refs:**
- Audit: `docs/audits/collection-migration-readiness-2026-09-03.md`
- Debt: TD-026, TD-028, TD-030, TD-031, TD-034, TD-035
