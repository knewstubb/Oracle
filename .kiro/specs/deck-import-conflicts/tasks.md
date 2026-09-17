# Tasks: Deck Import Conflicts (Phase 1)

> Refs: `requirements.md`, `design.md`
> Each task references the requirement(s) and design section it satisfies.

## Backend / Data

- [ ] 1. Migration: `import_sleeve_claims` table + indexes
  - Table per design "Data Model". UNIQUE(deck_cards_id), FK cascade to deck_cards, indexes on (user_id, printing_id) and (user_id, card_name).
  - Refs: requirements 5.2; design "Data Model"

- [ ] 2. Migration: conflict-derivation RPC `get_import_conflicts(p_user_id)`
  - Returns JSON per conflicted printing: card_name, printing_id, owned, sleeved, decks[]. Excludes basics + proxies from owned; groups by exact printing_id.
  - Refs: requirements 5.3; design "Conflict derivation"

- [ ] 3. Migration: finalization RPC `finalize_import_claims(p_user_id)`
  - For each printing where sleeved ≤ owned, assign distinct real copies to claims (set copy_id + ownership_status='original'), delete those claims. Advisory lock per printing. SECURITY DEFINER + ownership checks + no PUBLIC privilege window.
  - Refs: requirements 5.2, 5.3; design "Import flow changes" step 4, "Security review"

- [ ] 4. Migration: `resolve_import_conflict_release(p_user_id, p_claim_id)` RPC
  - Delete the claim (slot stays planned), then auto-finalize the affected printing. Atomic. Returns updated conflict state.
  - Refs: requirements 5.5; design "Resolution actions"

- [ ] 5. Migration: `resolve_import_conflict_proxy(p_user_id, p_claim_id)` RPC
  - Insert printing-matched proxy user_copies (is_proxy=true, printing_id=slot printing), set slot copy_id + ownership_status='proxy', delete claim, auto-finalize printing. Single transaction, advisory lock. Ownership-validated.
  - Refs: requirements 5.5, design decision #5; design "Resolution actions"

## Import wiring

- [ ] 6. Fix Active/Brew wiring: client sends explicit lifecycle; `resolve-one` maps to is_active and drives claim creation
  - Refs: requirements 5.2 (last AC); design "Import flow changes" step 2

- [ ] 7. Active import creates sleeve claims for non-basic main-deck slots; Brew imports stay planned (no claims)
  - Replace supply-pool `detectContentions` + onboarding client-side contention detection with the claims + finalization model.
  - Refs: requirements 5.2, 5.3; design "Import flow changes" steps 3–4

- [ ] 8. Per-deck format selection on the import picker (import-wide default + override), persisted to decks.format
  - Refs: requirements 5.1; design "Import flow changes" step 1

## Import-screen UI

- [ ] 9. Summary shows two lists: decks imported (format-aware counts + derived conflict overlay) and card conflicts (name, owned, sleeved, decks)
  - Refs: requirements 5.4; design "Conflict derivation", "Deck conflict overlay"

- [ ] 10. Conflict resolution controls on the summary: Release and Convert-to-Proxy per excess claim; live re-derivation after each action
  - Refs: requirements 5.5

## Verification

- [ ] 11. Test the finalization + resolution RPCs (non-conflicted auto-finalize; conflicted stays open; release clears; proxy adds copy + sleeves; auto-finalize on resolution)
  - Refs: requirements 5.3, 5.5

- [ ] 12. Build + targeted integration check of the import flow end to end (Active over-sleeve → conflict list → resolve → valid steady state)
  - Refs: verification steering
