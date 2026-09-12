-- ============================================================
-- Migration 003: Row Level Security Policies for User-Owned Tables
--
-- Enables RLS on all 24 user-owned tables and creates four policies
-- per table (SELECT, INSERT, UPDATE, DELETE) restricting access to
-- rows where user_id matches the authenticated user's auth.uid().
--
-- Idempotent: uses DROP POLICY IF EXISTS before CREATE POLICY.
--
-- Requirements: 3.1 (SELECT), 3.2 (INSERT), 3.3 (UPDATE), 3.4 (DELETE)
-- ============================================================

-- Helper: enable RLS (safe to call multiple times — no-op if already enabled)

-- ============================================================
-- 1. card_definitions
-- ============================================================
ALTER TABLE card_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_definitions_select_own" ON card_definitions;
CREATE POLICY "card_definitions_select_own"
  ON card_definitions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_definitions_insert_own" ON card_definitions;
CREATE POLICY "card_definitions_insert_own"
  ON card_definitions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_definitions_update_own" ON card_definitions;
CREATE POLICY "card_definitions_update_own"
  ON card_definitions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_definitions_delete_own" ON card_definitions;
CREATE POLICY "card_definitions_delete_own"
  ON card_definitions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. decks
-- ============================================================
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decks_select_own" ON decks;
CREATE POLICY "decks_select_own"
  ON decks FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "decks_insert_own" ON decks;
CREATE POLICY "decks_insert_own"
  ON decks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "decks_update_own" ON decks;
CREATE POLICY "decks_update_own"
  ON decks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "decks_delete_own" ON decks;
CREATE POLICY "decks_delete_own"
  ON decks FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. collection
-- ============================================================
ALTER TABLE collection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_select_own" ON collection;
CREATE POLICY "collection_select_own"
  ON collection FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "collection_insert_own" ON collection;
CREATE POLICY "collection_insert_own"
  ON collection FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "collection_update_own" ON collection;
CREATE POLICY "collection_update_own"
  ON collection FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "collection_delete_own" ON collection;
CREATE POLICY "collection_delete_own"
  ON collection FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 4. physical_copies
-- ============================================================
ALTER TABLE physical_copies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "physical_copies_select_own" ON physical_copies;
CREATE POLICY "physical_copies_select_own"
  ON physical_copies FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "physical_copies_insert_own" ON physical_copies;
CREATE POLICY "physical_copies_insert_own"
  ON physical_copies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "physical_copies_update_own" ON physical_copies;
CREATE POLICY "physical_copies_update_own"
  ON physical_copies FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "physical_copies_delete_own" ON physical_copies;
CREATE POLICY "physical_copies_delete_own"
  ON physical_copies FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. deck_cards
-- ============================================================
ALTER TABLE deck_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_cards_select_own" ON deck_cards;
CREATE POLICY "deck_cards_select_own"
  ON deck_cards FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_cards_insert_own" ON deck_cards;
CREATE POLICY "deck_cards_insert_own"
  ON deck_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_cards_update_own" ON deck_cards;
CREATE POLICY "deck_cards_update_own"
  ON deck_cards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_cards_delete_own" ON deck_cards;
CREATE POLICY "deck_cards_delete_own"
  ON deck_cards FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 6. deck_allocations
-- ============================================================
ALTER TABLE deck_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_allocations_select_own" ON deck_allocations;
CREATE POLICY "deck_allocations_select_own"
  ON deck_allocations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_allocations_insert_own" ON deck_allocations;
CREATE POLICY "deck_allocations_insert_own"
  ON deck_allocations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_allocations_update_own" ON deck_allocations;
CREATE POLICY "deck_allocations_update_own"
  ON deck_allocations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_allocations_delete_own" ON deck_allocations;
CREATE POLICY "deck_allocations_delete_own"
  ON deck_allocations FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 7. deck_documentation
-- ============================================================
ALTER TABLE deck_documentation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_documentation_select_own" ON deck_documentation;
CREATE POLICY "deck_documentation_select_own"
  ON deck_documentation FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_documentation_insert_own" ON deck_documentation;
CREATE POLICY "deck_documentation_insert_own"
  ON deck_documentation FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_documentation_update_own" ON deck_documentation;
CREATE POLICY "deck_documentation_update_own"
  ON deck_documentation FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_documentation_delete_own" ON deck_documentation;
CREATE POLICY "deck_documentation_delete_own"
  ON deck_documentation FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 8. brew_sessions
-- ============================================================
ALTER TABLE brew_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brew_sessions_select_own" ON brew_sessions;
CREATE POLICY "brew_sessions_select_own"
  ON brew_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "brew_sessions_insert_own" ON brew_sessions;
CREATE POLICY "brew_sessions_insert_own"
  ON brew_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "brew_sessions_update_own" ON brew_sessions;
CREATE POLICY "brew_sessions_update_own"
  ON brew_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "brew_sessions_delete_own" ON brew_sessions;
CREATE POLICY "brew_sessions_delete_own"
  ON brew_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 9. brew_session_cards
-- ============================================================
ALTER TABLE brew_session_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brew_session_cards_select_own" ON brew_session_cards;
CREATE POLICY "brew_session_cards_select_own"
  ON brew_session_cards FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "brew_session_cards_insert_own" ON brew_session_cards;
CREATE POLICY "brew_session_cards_insert_own"
  ON brew_session_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "brew_session_cards_update_own" ON brew_session_cards;
CREATE POLICY "brew_session_cards_update_own"
  ON brew_session_cards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "brew_session_cards_delete_own" ON brew_session_cards;
CREATE POLICY "brew_session_cards_delete_own"
  ON brew_session_cards FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 10. dead_weight_dismissals
-- ============================================================
ALTER TABLE dead_weight_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dead_weight_dismissals_select_own" ON dead_weight_dismissals;
CREATE POLICY "dead_weight_dismissals_select_own"
  ON dead_weight_dismissals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "dead_weight_dismissals_insert_own" ON dead_weight_dismissals;
CREATE POLICY "dead_weight_dismissals_insert_own"
  ON dead_weight_dismissals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dead_weight_dismissals_update_own" ON dead_weight_dismissals;
CREATE POLICY "dead_weight_dismissals_update_own"
  ON dead_weight_dismissals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dead_weight_dismissals_delete_own" ON dead_weight_dismissals;
CREATE POLICY "dead_weight_dismissals_delete_own"
  ON dead_weight_dismissals FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 11. upgrade_candidates
-- ============================================================
ALTER TABLE upgrade_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upgrade_candidates_select_own" ON upgrade_candidates;
CREATE POLICY "upgrade_candidates_select_own"
  ON upgrade_candidates FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "upgrade_candidates_insert_own" ON upgrade_candidates;
CREATE POLICY "upgrade_candidates_insert_own"
  ON upgrade_candidates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "upgrade_candidates_update_own" ON upgrade_candidates;
CREATE POLICY "upgrade_candidates_update_own"
  ON upgrade_candidates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "upgrade_candidates_delete_own" ON upgrade_candidates;
CREATE POLICY "upgrade_candidates_delete_own"
  ON upgrade_candidates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 12. upgrade_changelog
-- ============================================================
ALTER TABLE upgrade_changelog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upgrade_changelog_select_own" ON upgrade_changelog;
CREATE POLICY "upgrade_changelog_select_own"
  ON upgrade_changelog FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "upgrade_changelog_insert_own" ON upgrade_changelog;
CREATE POLICY "upgrade_changelog_insert_own"
  ON upgrade_changelog FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "upgrade_changelog_update_own" ON upgrade_changelog;
CREATE POLICY "upgrade_changelog_update_own"
  ON upgrade_changelog FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "upgrade_changelog_delete_own" ON upgrade_changelog;
CREATE POLICY "upgrade_changelog_delete_own"
  ON upgrade_changelog FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 13. generic_land_preferences
-- ============================================================
ALTER TABLE generic_land_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generic_land_preferences_select_own" ON generic_land_preferences;
CREATE POLICY "generic_land_preferences_select_own"
  ON generic_land_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "generic_land_preferences_insert_own" ON generic_land_preferences;
CREATE POLICY "generic_land_preferences_insert_own"
  ON generic_land_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "generic_land_preferences_update_own" ON generic_land_preferences;
CREATE POLICY "generic_land_preferences_update_own"
  ON generic_land_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "generic_land_preferences_delete_own" ON generic_land_preferences;
CREATE POLICY "generic_land_preferences_delete_own"
  ON generic_land_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 14. deck_health_cache
-- ============================================================
ALTER TABLE deck_health_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_health_cache_select_own" ON deck_health_cache;
CREATE POLICY "deck_health_cache_select_own"
  ON deck_health_cache FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_health_cache_insert_own" ON deck_health_cache;
CREATE POLICY "deck_health_cache_insert_own"
  ON deck_health_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_health_cache_update_own" ON deck_health_cache;
CREATE POLICY "deck_health_cache_update_own"
  ON deck_health_cache FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_health_cache_delete_own" ON deck_health_cache;
CREATE POLICY "deck_health_cache_delete_own"
  ON deck_health_cache FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 15. health_run_log
-- ============================================================
ALTER TABLE health_run_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_run_log_select_own" ON health_run_log;
CREATE POLICY "health_run_log_select_own"
  ON health_run_log FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "health_run_log_insert_own" ON health_run_log;
CREATE POLICY "health_run_log_insert_own"
  ON health_run_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "health_run_log_update_own" ON health_run_log;
CREATE POLICY "health_run_log_update_own"
  ON health_run_log FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "health_run_log_delete_own" ON health_run_log;
CREATE POLICY "health_run_log_delete_own"
  ON health_run_log FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 16. precon_mod_tracking
-- ============================================================
ALTER TABLE precon_mod_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precon_mod_tracking_select_own" ON precon_mod_tracking;
CREATE POLICY "precon_mod_tracking_select_own"
  ON precon_mod_tracking FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "precon_mod_tracking_insert_own" ON precon_mod_tracking;
CREATE POLICY "precon_mod_tracking_insert_own"
  ON precon_mod_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "precon_mod_tracking_update_own" ON precon_mod_tracking;
CREATE POLICY "precon_mod_tracking_update_own"
  ON precon_mod_tracking FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "precon_mod_tracking_delete_own" ON precon_mod_tracking;
CREATE POLICY "precon_mod_tracking_delete_own"
  ON precon_mod_tracking FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 17. card_ratings
-- ============================================================
ALTER TABLE card_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_ratings_select_own" ON card_ratings;
CREATE POLICY "card_ratings_select_own"
  ON card_ratings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_ratings_insert_own" ON card_ratings;
CREATE POLICY "card_ratings_insert_own"
  ON card_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_ratings_update_own" ON card_ratings;
CREATE POLICY "card_ratings_update_own"
  ON card_ratings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_ratings_delete_own" ON card_ratings;
CREATE POLICY "card_ratings_delete_own"
  ON card_ratings FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 18. card_rating_history
-- ============================================================
ALTER TABLE card_rating_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_rating_history_select_own" ON card_rating_history;
CREATE POLICY "card_rating_history_select_own"
  ON card_rating_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_rating_history_insert_own" ON card_rating_history;
CREATE POLICY "card_rating_history_insert_own"
  ON card_rating_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_rating_history_update_own" ON card_rating_history;
CREATE POLICY "card_rating_history_update_own"
  ON card_rating_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "card_rating_history_delete_own" ON card_rating_history;
CREATE POLICY "card_rating_history_delete_own"
  ON card_rating_history FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 19. deck_synergy_scores
-- ============================================================
ALTER TABLE deck_synergy_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_synergy_scores_select_own" ON deck_synergy_scores;
CREATE POLICY "deck_synergy_scores_select_own"
  ON deck_synergy_scores FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_synergy_scores_insert_own" ON deck_synergy_scores;
CREATE POLICY "deck_synergy_scores_insert_own"
  ON deck_synergy_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_synergy_scores_update_own" ON deck_synergy_scores;
CREATE POLICY "deck_synergy_scores_update_own"
  ON deck_synergy_scores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_synergy_scores_delete_own" ON deck_synergy_scores;
CREATE POLICY "deck_synergy_scores_delete_own"
  ON deck_synergy_scores FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 20. commander_recommendations
-- ============================================================
ALTER TABLE commander_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commander_recommendations_select_own" ON commander_recommendations;
CREATE POLICY "commander_recommendations_select_own"
  ON commander_recommendations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "commander_recommendations_insert_own" ON commander_recommendations;
CREATE POLICY "commander_recommendations_insert_own"
  ON commander_recommendations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "commander_recommendations_update_own" ON commander_recommendations;
CREATE POLICY "commander_recommendations_update_own"
  ON commander_recommendations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "commander_recommendations_delete_own" ON commander_recommendations;
CREATE POLICY "commander_recommendations_delete_own"
  ON commander_recommendations FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 21. recommendation_history
-- ============================================================
ALTER TABLE recommendation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recommendation_history_select_own" ON recommendation_history;
CREATE POLICY "recommendation_history_select_own"
  ON recommendation_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "recommendation_history_insert_own" ON recommendation_history;
CREATE POLICY "recommendation_history_insert_own"
  ON recommendation_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "recommendation_history_update_own" ON recommendation_history;
CREATE POLICY "recommendation_history_update_own"
  ON recommendation_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "recommendation_history_delete_own" ON recommendation_history;
CREATE POLICY "recommendation_history_delete_own"
  ON recommendation_history FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 22. deck_upgrade_summary
-- ============================================================
ALTER TABLE deck_upgrade_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_upgrade_summary_select_own" ON deck_upgrade_summary;
CREATE POLICY "deck_upgrade_summary_select_own"
  ON deck_upgrade_summary FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_upgrade_summary_insert_own" ON deck_upgrade_summary;
CREATE POLICY "deck_upgrade_summary_insert_own"
  ON deck_upgrade_summary FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_upgrade_summary_update_own" ON deck_upgrade_summary;
CREATE POLICY "deck_upgrade_summary_update_own"
  ON deck_upgrade_summary FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_upgrade_summary_delete_own" ON deck_upgrade_summary;
CREATE POLICY "deck_upgrade_summary_delete_own"
  ON deck_upgrade_summary FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 23. deck_category_targets
-- ============================================================
ALTER TABLE deck_category_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_category_targets_select_own" ON deck_category_targets;
CREATE POLICY "deck_category_targets_select_own"
  ON deck_category_targets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_category_targets_insert_own" ON deck_category_targets;
CREATE POLICY "deck_category_targets_insert_own"
  ON deck_category_targets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_category_targets_update_own" ON deck_category_targets;
CREATE POLICY "deck_category_targets_update_own"
  ON deck_category_targets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_category_targets_delete_own" ON deck_category_targets;
CREATE POLICY "deck_category_targets_delete_own"
  ON deck_category_targets FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 24. deck_category_analysis
-- ============================================================
ALTER TABLE deck_category_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_category_analysis_select_own" ON deck_category_analysis;
CREATE POLICY "deck_category_analysis_select_own"
  ON deck_category_analysis FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_category_analysis_insert_own" ON deck_category_analysis;
CREATE POLICY "deck_category_analysis_insert_own"
  ON deck_category_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_category_analysis_update_own" ON deck_category_analysis;
CREATE POLICY "deck_category_analysis_update_own"
  ON deck_category_analysis FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "deck_category_analysis_delete_own" ON deck_category_analysis;
CREATE POLICY "deck_category_analysis_delete_own"
  ON deck_category_analysis FOR DELETE
  USING (auth.uid() = user_id);
