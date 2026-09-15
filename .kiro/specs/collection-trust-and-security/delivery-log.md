# Delivery Log — Collection Trust & Security

> Feature: Collection Trust & Security
> Status: Planning
> Last updated: 2026-09-14
> Maintained by: Gene

---

## 2026-09-14 — Scope Clarification & Known Issues

**Context:** User provided three critical UX gaps during scope clarification:

1. **Deck import missing-decks bug:** Not all decks from Archidekt exports are visible in the import picker. Affects workflow when re-importing a collection.
2. **Collection import progress visibility:** User needs to see total card count upfront and real-time progress during import. Current implementation has no progress feedback.
3. **Your message cut off:** "Things to keep in mind" had a third item that didn't finish — reached out to clarify.

**What changed:**
- Added US-5.1.2 to requirements for progress visibility (total count, real-time updates).
- Added US-5.1.2 ACs for streaming progress during validation/swap.
- Documented missing-decks bug as an open question (scope decision needed).
- Added progress reporting section to design with SSE/polling options.

**Decisions pending:**
- Include deck-import missing-decks bug in this effort, or file as separate work?
- Use Server-Sent Events or polling for progress updates? (Polling OK for MVP.)

**Refs:**
- Requirements: US-5.1.2 (progress visibility)
- Design: "Progress Reporting" section
- Tasks: "Known Issues to Address" section

---

*Authored: 2026-09-14 by Gene*


---

## 2026-09-14 — Correction: collection-replace safety was already implemented

**Context:** Before starting Phase 1 implementation (polling decided, about to write code), traced the actual current code rather than trusting TD-026's "open" status and the roadmap doc's framing. Found the validate-then-swap fix already shipped and hosted-verified under the `collection-foundation` spec's atomic-boundary increment.

**What was found:**
- `src/lib/chunked-import-client.ts`: `chunkedImport()` sends the entire CSV as one request for the default full-import path — chunking only applies to `addOnly`/custom-endpoint flows. Explicit code comment states the full-import request is intentionally not split into replace-then-add chunks.
- `src/lib/import-engine-v2.ts`: `executeInstanceLevelImport()` resolves every row before any RPC call; a resolution failure returns an error with zero writes performed.
- `supabase/migrations/20260912170000_atomic_collection_personal_scope.sql` (`replace_collection`) and `20260912162000_atomic_collection_boundary.sql` (`apply_collection_sync`): single-transaction, advisory-locked, service-role-only delete+insert.
- `src/components/collection/CollectionImportButton.tsx` is the only caller and always takes this safe path (no `apiUrl`/`addOnly` override).
- This matches the `collection-foundation` delivery log's 2026-09-12 "Backtrack-one correction" and 2026-09-14 hosted-verification entries.

**What changed in this spec:**
- Rewrote design.md's "Collection Replacement" section to describe the actual shipped flow instead of a hypothetical unsafe-flow-to-be-fixed.
- Struck tasks 1.1–1.3 (validation logic, replace RPC, replace endpoint) as already done.
- Reframed the remaining Phase 1 work as a progress-reporting refactor (sync route → async job + polling) on top of already-safe replace logic, not a safety fix.
- Added task 1.8: update the tech debt register to mark TD-026 resolved, since it currently and incorrectly reads "open."

**Why this matters:** The roadmap doc (`docs/roadmap-foundations-first.md`) and this spec's earlier drafts both treated TD-026 as an open critical risk requiring new implementation. Building against that assumption would have produced redundant/conflicting RPCs. This is exactly the kind of drift the tech-debt register convention exists to prevent — the register must be corrected, not just this spec.

**Decision:** Proceed directly to the progress-reporting (polling) work as the actual Phase 1 scope. No new safety-critical database work needed for collection replace.

**Refs:**
- `collection-foundation` delivery log, 2026-09-12 and 2026-09-14 entries
- Tech debt register: TD-026 (needs correction, see task 1.8)


---

## 2026-09-14 — Additional gap found: no pre-replace warning in UI

**Context:** While correcting the spec's scope after finding TD-026 already fixed, checked whether `CollectionImportButton` actually communicates the Option A limitations (allocations cleared, manual edits lost) as US-5.1.3 required. It does not — there is no confirmation or warning step before a replace-mode import runs.

**What changed:**
- Added this as a new task (1.5a) rather than treating US-5.1.3 as fully satisfied: the *data-safety* behavior is correct, but the *user communication* about that behavior's side effects is genuinely missing from the UI.
- No code changed yet — this session corrected specs only; implementation starts next.

**Refs:**
- `src/components/collection/CollectionImportButton.tsx` (no confirmation dialog present)
- Requirements: US-5.1.3
- Tasks: 1.5a


---

## 2026-09-14 — Streaming progress and pre-replace warning implemented

**Context:** The user chose streaming progress (Option B) after polling was rejected as unsafe for the app's Vercel/serverless deployment without a durable job table. The safe replacement transaction itself remains unchanged.

**What changed:**
- Added optional progress callbacks to `executeInstanceLevelImport` for validating, resolving, preparing, and replacing phases. Progress reports both source-row counts and physical-card counts derived from CSV quantities.
- Changed only the default full replacement response to newline-delimited JSON (`application/x-ndjson`) over the same request. The route emits progress events and a terminal completion/error event while preserving the existing single `replace_collection` RPC boundary.
- Updated `chunkedImport` with incremental `TextDecoder`/`ReadableStream` parsing, including split-record handling, terminal-event validation, and protocol-error reporting. Add-only and custom endpoint paths retain their existing JSON/chunk behavior.
- Updated `CollectionImportButton` to show phase labels and physical-card counts instead of an opaque `chunk 1/1` state.
- Added a confirmation step before replacement that explains full-collection replacement, cleared deck allocations, required Built-deck reconciliation, and non-preserved manual copy metadata.
- Replaced the stale collection import route test that targeted retired `mode=legacy` behavior with current streaming/add-mode coverage.

**Validation:**
- Focused tests: `src/lib/chunked-import-client.test.ts`, `src/components/collection/CollectionImportButton.test.tsx`, and `src/app/api/collection/import/route.test.ts` — 29/29 passing.
- Changed-file TypeScript filtering — clean.
- `git diff --check` — passing.
- Targeted ESLint — no errors; two pre-existing test warnings were removed during this increment.
- `npm run build` — passing. Existing warnings remain for the middleware-to-proxy convention and missing optional `GEMINI_API_KEY`.

**Decisions:**
- No polling endpoint, in-memory job map, `import_jobs` table, or durable staging infrastructure was added. Streaming keeps progress in the same serverless invocation and stays within personal-app scope.
- Stream failures after headers are sent are represented as protocol `error` events over HTTP 200; body/authentication failures before stream creation retain normal HTTP errors.

**Refs:**
- Design: `.kiro/specs/collection-trust-and-security/design.md`
- Tasks: `.kiro/specs/collection-trust-and-security/tasks.md`
- Implementation: `src/app/api/collection/import/route.ts`, `src/lib/import-engine-v2.ts`, `src/lib/chunked-import-client.ts`, `src/components/collection/CollectionImportButton.tsx`
