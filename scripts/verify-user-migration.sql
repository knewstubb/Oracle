-- ============================================================================
-- Verification Script: verify-user-migration.sql
-- Purpose:   Verify that migration 004_migrate_user_id.sql completed
--            successfully by checking all 24 user-owned tables.
--
-- HOW TO USE:
--   1. Run AFTER migration 004_migrate_user_id.sql has completed.
--   2. Replace the new_id placeholder below with Brad's actual Supabase Auth
--      user ID (the same value used in the migration).
--   3. Execute this script against your Supabase database:
--        psql $DATABASE_URL -f scripts/verify-user-migration.sql
--      Or paste it into the Supabase SQL Editor.
--   4. Review the output — every table should show PASS.
--      Any FAIL indicates rows that were not migrated.
--
-- This script is READ-ONLY — it does not modify any data.
--
-- Requirements: 6.4
-- ============================================================================

DO $$
DECLARE
  old_id UUID := '00000000-0000-0000-0000-000000000000';
  -- ⚠️  REPLACE THIS with Brad's real Supabase Auth user ID before running!
  -- Must match the new_id used in 004_migrate_user_id.sql.
  new_id UUID := '00000000-0000-0000-0000-000000000001'; -- REPLACE_WITH_BRADS_AUTH_UID

  tbl TEXT;
  total_rows BIGINT;
  new_id_rows BIGINT;
  old_id_rows BIGINT;
  verdict TEXT;
  all_passed BOOLEAN := TRUE;

  tables TEXT[] := ARRAY[
    'card_definitions',
    'decks',
    'collection',
    'physical_copies',
    'deck_cards',
    'deck_allocations',
    'deck_documentation',
    'brew_sessions',
    'brew_session_cards',
    'dead_weight_dismissals',
    'upgrade_candidates',
    'upgrade_changelog',
    'generic_land_preferences',
    'deck_health_cache',
    'health_run_log',
    'precon_mod_tracking',
    'card_ratings',
    'card_rating_history',
    'deck_synergy_scores',
    'commander_recommendations',
    'recommendation_history',
    'deck_upgrade_summary',
    'deck_category_targets',
    'deck_category_analysis'
  ];
BEGIN
  -- Guard: abort if placeholder was not replaced
  IF new_id = '00000000-0000-0000-0000-000000000001'::UUID THEN
    RAISE EXCEPTION 'Verification aborted: you must replace the new_id placeholder (00000000-0000-0000-0000-000000000001) with Brad''s real Supabase Auth UID before running this script.';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=============================================================';
  RAISE NOTICE '  POST-MIGRATION VERIFICATION REPORT';
  RAISE NOTICE '  Old user_id: %', old_id;
  RAISE NOTICE '  New user_id: %', new_id;
  RAISE NOTICE '=============================================================';
  RAISE NOTICE '';
  RAISE NOTICE '%-35s %8s %10s %10s %s', 'TABLE', 'TOTAL', 'NEW_ID', 'OLD_ID', 'VERDICT';
  RAISE NOTICE '%-35s %8s %10s %10s %s', '-----------------------------------', '--------', '----------', '----------', '-------';

  FOREACH tbl IN ARRAY tables LOOP
    -- Count total rows
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO total_rows;

    -- Count rows with the new (correct) user_id
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE user_id = $1', tbl)
      USING new_id INTO new_id_rows;

    -- Count rows still with the old (incorrect) user_id
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE user_id = $1', tbl)
      USING old_id INTO old_id_rows;

    -- Determine verdict
    IF old_id_rows = 0 AND (total_rows = 0 OR new_id_rows > 0) THEN
      verdict := 'PASS';
    ELSE
      verdict := 'FAIL';
      all_passed := FALSE;
    END IF;

    RAISE NOTICE '%-35s %8s %10s %10s %s', tbl, total_rows, new_id_rows, old_id_rows, verdict;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=============================================================';
  IF all_passed THEN
    RAISE NOTICE '  OVERALL RESULT: ✅ ALL TABLES PASSED';
    RAISE NOTICE '  Migration 004_migrate_user_id.sql completed successfully.';
  ELSE
    RAISE NOTICE '  OVERALL RESULT: ❌ SOME TABLES FAILED';
    RAISE NOTICE '  Review FAIL entries above. Rows with old_id > 0 were not migrated.';
  END IF;
  RAISE NOTICE '=============================================================';
  RAISE NOTICE '';
END $$;
