# Delivery Log — Deck Import Missing Decks Bug

> Feature: Deck Import Missing Decks Bug Fix
> Status: Needs Investigation
> Last updated: 2026-09-14
> Maintained by: Gene

---

## 2026-09-14 — Issue Reported & Scoped Separately

**Context:** User reported that not all decks from Archidekt exports are visible in the deck import picker during collection re-sync.

**What we know:**
- Symptom: Missing decks from Archidekt exports during import.
- Impact: Forces manual filtering or re-entry of decks the user wants to track.
- Scope: Unclear — need investigation (API limit, parsing bug, filtering logic, pagination).

**Decision:**
- Track as separate spec (not part of collection-trust-and-security effort).
- Requires investigation spike before design/implementation can begin.

**Next steps:**
- Provide details: how many decks are missing, what count is expected?
- Confirm if issue is consistent or intermittent.
- Provide a sample Archidekt export or account for debugging.

**Refs:**
- Related: collection-trust-and-security spec (collection replace/RLS effort)
- Roadmap: Phase 2 (collection import/management trustworthy)

---

*Authored: 2026-09-14 by Gene*