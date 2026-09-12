-- ============================================================================
-- Migration: 004_migrate_user_id.sql
-- Purpose:   Re-associate all existing data from the old hardcoded user ID
--            to Brad's real Supabase Auth user ID.
--
-- ⚠️  BEFORE RUNNING: You MUST replace the placeholder below with Brad's
--    actual Supabase Auth UID. Find it in the Supabase Dashboard under
--    Authentication > Users after signing up.
--
-- This migration updates user_id across all 24 user-owned tables in a single
-- atomic transaction. If any table update fails, the entire transaction rolls
-- back and no data is changed.
--
-- Requirements: 6.1, 6.2, 6.3
-- ============================================================================

BEGIN;

DO $$
DECLARE
  old_id UUID := '00000000-0000-0000-0000-000000000000';
  -- ⚠️  REPLACE THIS with Brad's real Supabase Auth user ID before running!
  -- Find it in Supabase Dashboard > Authentication > Users (the UUID column).
  new_id UUID := '00000000-0000-0000-0000-000000000001'; -- REPLACE_WITH_BRADS_AUTH_UID
  tbl TEXT;
  affected BIGINT;
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
    RAISE EXCEPTION 'Migration aborted: you must replace the new_id placeholder (00000000-0000-0000-0000-000000000001) with Brad''s real Supabase Auth UID before running this migration.';
  END IF;

  RAISE NOTICE 'Migrating user_id from % to %', old_id, new_id;

  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('UPDATE %I SET user_id = $1 WHERE user_id = $2', tbl)
      USING new_id, old_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Updated % rows in %', affected, tbl;
  END LOOP;

  RAISE NOTICE 'Migration complete — all tables updated successfully.';
END $$;

COMMIT;
