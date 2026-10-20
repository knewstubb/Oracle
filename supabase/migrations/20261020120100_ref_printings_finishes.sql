-- APPROVED by the owner 2026-10-20 for the Developer to apply (order: see contract §12
-- step 2). NOT YET APPLIED. Originally drafted by the Architect.
-- Task: import row editing — offer a finish only if Scryfall lists it for the
-- printing (contract: docs/oracle/contracts/import-row-editing.md, §5A).
--
-- Additive and forward-only. Adds one nullable column; no existing data is
-- changed, dropped or rewritten. Reversible: ALTER TABLE ... DROP COLUMN finishes
-- (nothing else depends on it until the app code that reads it ships).
--
-- ref_printings.finishes
--   Scryfall's per-printing `finishes` list, stored as the values this app uses:
--   a subset of {nonfoil, foil, etched}. Scryfall's `glossy` is not stored.
--   One row = one printing; the identifier column of that table is scryfall_id
--   (printing), unchanged (D-003). The finish itself is still its own attribute
--   on user_copies and is never encoded in scryfall_id.
--
--   NULL means "not known yet": rows are filled by the existing card-data sync
--   (src/lib/card-data-sync.ts must be extended to map Scryfall `finishes`).
--   Until a printing is filled, the app treats it as "all three allowed" and
--   shows no warning. Running the sync is a separate owner step.
--
-- Indexes: none. The column is only read alongside rows already fetched by
-- scryfall_id (primary lookup) in the import resolver.
-- RLS: ref_printings is shared reference data with no user_id; unchanged.

ALTER TABLE public.ref_printings
  ADD COLUMN IF NOT EXISTS finishes text[]
  CONSTRAINT ref_printings_finishes_check
  CHECK (
    finishes IS NULL
    OR (
      cardinality(finishes) >= 1
      AND finishes <@ ARRAY['nonfoil', 'foil', 'etched']::text[]
    )
  );

COMMENT ON COLUMN public.ref_printings.finishes IS
  'Scryfall per-printing finishes (subset of nonfoil, foil, etched). NULL = not synced yet; treat as all allowed. Printing-level (scryfall_id), not oracle-level.';
