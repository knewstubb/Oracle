-- Phase 3 Picklist, slice S0 (supply rule): older stored routines must not count a copy that is In your hand as free.
--
-- STATUS: APPLIED 2026-11-16 to hosted project udocxsyzzvrceiuupprj (owner approved). 10 functions patched.
-- Additive: it only re-creates existing functions with one extra condition; no table or column changes, no data touched.
--
-- Contract: docs/oracle/contracts/know-where-cards-are.md section 6 ("the latest definition of each must be taken from
-- the live database, not the oldest migration file").
--
-- How: instead of copying about 100 KB of function text from older files (which may be stale), this reads the LIVE
-- definition of each function, adds `AND uc.in_hand = false` after every `uc.missing = false` test (and after
-- `COALESCE(uc.missing, false) = false`), and re-creates the function with the same signature, security setting and
-- search_path. It raises if a function has no such test, so it can never silently change nothing. Re-running is safe:
-- a function that already mentions in_hand is skipped.
--
-- Functions covered (live check 2026-11-16: every public function that uses the missing flag as a supply filter):
--   finalize_import_claims (two overloads), get_deck_conflict_counts, get_import_allocations, get_import_conflicts,
--   get_import_reconciliation, import_deck_with_intent, reconcile_built_deck, set_import_claim_printing,
--   set_import_claim_state.
-- Not covered on purpose: the move/assign functions that REFUSE a missing copy (copy_missing). The guard trigger
-- deck_cards_copy_must_be_available already refuses an in-hand copy for all of them (live since 2026-11-16).
--
-- Rollback: re-run the older migration that defines the function, or remove `AND uc.in_hand = false`.

DO $patch$
DECLARE
  v_fn record;
  v_def text;
  v_new text;
BEGIN
  FOR v_fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'finalize_import_claims', 'get_deck_conflict_counts', 'get_import_allocations', 'get_import_conflicts',
        'get_import_reconciliation', 'import_deck_with_intent', 'reconcile_built_deck',
        'set_import_claim_printing', 'set_import_claim_state'
      )
  LOOP
    v_def := pg_get_functiondef(v_fn.oid);

    IF v_def ILIKE '%in_hand%' THEN
      CONTINUE; -- already patched
    END IF;

    v_new := replace(v_def, 'COALESCE(uc.missing, false) = false', 'COALESCE(uc.missing, false) = false AND uc.in_hand = false');
    v_new := replace(v_new, 'uc.missing = false', 'uc.missing = false AND uc.in_hand = false');

    IF v_new = v_def THEN
      RAISE EXCEPTION 'in_hand patch found no missing test in %(%)', v_fn.proname, v_fn.args;
    END IF;

    EXECUTE v_new;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'finalize_import_claims', 'get_deck_conflict_counts', 'get_import_allocations', 'get_import_conflicts',
        'get_import_reconciliation', 'import_deck_with_intent', 'reconcile_built_deck',
        'set_import_claim_printing', 'set_import_claim_state'
      )
      AND p.prosrc ILIKE '%in_hand%'
  ) < 10 THEN
    RAISE EXCEPTION 'in_hand patch incomplete: expected 10 functions (finalize_import_claims has two overloads)';
  END IF;
END
$patch$;
