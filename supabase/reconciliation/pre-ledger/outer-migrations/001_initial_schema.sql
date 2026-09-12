-- ============================================================
-- Initial Schema Migration: The Oracle (SQLite → Postgres)
--
-- This is the complete Postgres DDL for The Oracle application,
-- translated from the live SQLite Schema_Inventory.
--
-- Tables are ordered by FK_Dependency_Order (parent tables first).
-- 31 tables total. Excluded: sqlite_sequence (Postgres-native),
-- notion_deck_map (dropped in migration 025).
--
-- user_id UUID NOT NULL is added to all 24 user-owned tables.
-- 7 reference/system tables are excluded from user_id.
-- ============================================================

-- ============================================================
-- TIER 1: Reference/system tables (no FK dependencies, no user_id)
-- ============================================================

-- 1. _migrations (system table, no user_id)
CREATE TABLE _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);

-- 2. sets (reference table, no user_id)
CREATE TABLE sets (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- 3. sync_meta (system table, no user_id)
CREATE TABLE sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. card_metadata (reference table, no user_id)
CREATE TABLE card_metadata (
  card_name TEXT PRIMARY KEY,
  rarity TEXT,
  price_usd NUMERIC,
  set_code TEXT,
  type_line TEXT,
  mana_cost TEXT,
  cmc DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. precon_cards (reference table, no user_id)
CREATE TABLE precon_cards (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  precon_url TEXT NOT NULL,
  card_name TEXT NOT NULL,
  UNIQUE(precon_url, card_name)
);
CREATE INDEX idx_precon_cards_url ON precon_cards(precon_url);

-- 6. card_kingdom_prices (reference/cache table, no user_id)
CREATE TABLE card_kingdom_prices (
  scryfall_printing_id TEXT PRIMARY KEY,
  price_retail NUMERIC NOT NULL CHECK(price_retail >= 0.0 AND price_retail <= 999999.99),
  is_foil BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. oracle_to_printings (reference table, no user_id)
CREATE TABLE oracle_to_printings (
  oracle_id TEXT NOT NULL,
  scryfall_printing_id TEXT NOT NULL,
  UNIQUE(oracle_id, scryfall_printing_id)
);
CREATE INDEX idx_oracle_to_printings_oracle_id ON oracle_to_printings(oracle_id);

-- ============================================================
-- TIER 2: card_definitions (user-owned, referenced by physical_copies & deck_cards)
-- ============================================================

-- 8. card_definitions (user-owned, gets user_id)
CREATE TABLE card_definitions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oracle_id TEXT NOT NULL UNIQUE,
  card_name TEXT NOT NULL,
  color_identity TEXT DEFAULT '',
  type_line TEXT DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_card_definitions_card_name ON card_definitions(card_name);
CREATE INDEX idx_card_definitions_user_id ON card_definitions(user_id);

-- ============================================================
-- TIER 3: decks (user-owned, referenced by many child tables)
-- ============================================================

-- 9. decks (user-owned, gets user_id — note: id is NOT auto-generated, comes from Archidekt)
CREATE TABLE decks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  commander_name TEXT,
  commander_scryfall_id TEXT,
  colour_identity TEXT,
  card_count INTEGER,
  last_synced_at TIMESTAMPTZ,
  raw_json TEXT,
  precon_url TEXT,
  deck_type TEXT DEFAULT 'Custom',
  bracket TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'draft', 'concept')),
  is_precon_mod BOOLEAN DEFAULT FALSE,
  user_id UUID NOT NULL
);
CREATE INDEX idx_decks_user_id ON decks(user_id);

-- ============================================================
-- TIER 4: collection, physical_copies (depend on card_definitions)
-- ============================================================

-- 10. collection (user-owned, gets user_id)
CREATE TABLE collection (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_name TEXT NOT NULL,
  scryfall_id TEXT,
  set_code TEXT,
  quantity INTEGER DEFAULT 1,
  foil BOOLEAN DEFAULT FALSE,
  finish TEXT DEFAULT 'Normal',
  condition TEXT DEFAULT 'Near Mint',
  date_added TEXT,
  language TEXT DEFAULT 'English',
  purchase_price NUMERIC DEFAULT 0,
  collector_number TEXT,
  color_identity TEXT,
  types TEXT,
  edition_name TEXT,
  user_id UUID NOT NULL
);
CREATE INDEX idx_collection_name ON collection(card_name);
CREATE INDEX idx_collection_identity ON collection(color_identity);
CREATE INDEX idx_collection_types ON collection(types);
CREATE INDEX idx_collection_user_id ON collection(user_id);

-- 11. physical_copies (user-owned, gets user_id)
CREATE TABLE physical_copies (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_definition_id INTEGER NOT NULL REFERENCES card_definitions(id),
  scryfall_printing_id TEXT,
  is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
  proxy_for_definition_id INTEGER REFERENCES card_definitions(id) ON DELETE SET NULL,
  condition TEXT CHECK (condition IS NULL OR condition IN ('near_mint', 'lightly_played', 'moderately_played', 'heavily_played', 'damaged')),
  is_foil BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_at TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_physical_copies_card_definition_id ON physical_copies(card_definition_id);
CREATE INDEX idx_physical_copies_is_proxy ON physical_copies(is_proxy);
CREATE INDEX idx_physical_copies_user_id ON physical_copies(user_id);
CREATE UNIQUE INDEX idx_physical_copies_group
  ON physical_copies(card_definition_id, scryfall_printing_id, is_foil, is_proxy);

-- ============================================================
-- TIER 5: Tables depending on decks (and optionally physical_copies)
-- ============================================================

-- 12. deck_cards (user-owned, gets user_id)
CREATE TABLE deck_cards (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  scryfall_id TEXT,
  set_code TEXT,
  quantity INTEGER DEFAULT 1,
  categories TEXT,
  tags TEXT,
  is_commander BOOLEAN DEFAULT FALSE,
  dead_weight_flag TEXT CHECK(dead_weight_flag IN ('redundant', 'off_strategy', 'bracket_mismatch', 'format_violation')),
  dead_weight_reason TEXT,
  ownership_status TEXT DEFAULT NULL CHECK (ownership_status IN ('original', 'proxy', 'not_owned')),
  proxy_of_deck_id INTEGER DEFAULT NULL REFERENCES decks(id) ON DELETE SET NULL,
  physical_copy_id INTEGER REFERENCES physical_copies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL
);
CREATE INDEX idx_deck_cards_name ON deck_cards(card_name);
CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id);
CREATE INDEX idx_deck_cards_physical_copy_id ON deck_cards(physical_copy_id) WHERE physical_copy_id IS NOT NULL;
CREATE INDEX idx_deck_cards_user_id ON deck_cards(user_id);

-- 13. deck_allocations (user-owned, gets user_id)
CREATE TABLE deck_allocations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_name TEXT NOT NULL,
  scryfall_id TEXT,
  set_code TEXT,
  collector_number TEXT,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('original', 'proxy')),
  priority_override BOOLEAN DEFAULT FALSE,
  written_to_archidekt BOOLEAN DEFAULT FALSE,
  written_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL,
  UNIQUE(card_name, deck_id)
);
CREATE INDEX idx_deck_alloc_card ON deck_allocations(card_name);
CREATE INDEX idx_deck_alloc_deck ON deck_allocations(deck_id);
CREATE INDEX idx_deck_alloc_scryfall ON deck_allocations(scryfall_id);
CREATE INDEX idx_deck_alloc_user_id ON deck_allocations(user_id);

-- 14. proxy_allocations (user-owned, gets user_id)
CREATE TABLE proxy_allocations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_name TEXT NOT NULL,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('original', 'proxy')),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  written_to_archidekt BOOLEAN DEFAULT FALSE,
  written_at TIMESTAMPTZ,
  user_id UUID NOT NULL,
  UNIQUE(card_name, deck_id)
);
CREATE INDEX idx_proxy_alloc_card ON proxy_allocations(card_name);
CREATE INDEX idx_proxy_alloc_deck ON proxy_allocations(deck_id);
CREATE INDEX idx_proxy_alloc_user_id ON proxy_allocations(user_id);

-- 15. deck_priority (user-owned, gets user_id)
CREATE TABLE deck_priority (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_priority_user_id ON deck_priority(user_id);

-- 16. deck_strategy (user-owned, gets user_id)
CREATE TABLE deck_strategy (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  win_condition TEXT,
  table_context TEXT,
  bracket INTEGER CHECK(bracket >= 1 AND bracket <= 4),
  budget_mode TEXT CHECK(budget_mode IN ('collection', 'budget', 'unrestricted')),
  budget_ceiling NUMERIC,
  frustration TEXT,
  strategy_notes TEXT,
  format_rules TEXT,
  health_overrides TEXT,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_strategy_user_id ON deck_strategy(user_id);

-- 17. deck_health (user-owned, gets user_id)
CREATE TABLE deck_health (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  overall_status TEXT NOT NULL CHECK(overall_status IN ('green', 'amber', 'red')),
  user_id UUID NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deck_health_user_id ON deck_health(user_id);

-- 18. deck_documentation (user-owned, gets user_id)
CREATE TABLE deck_documentation (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  strategy_playstyle TEXT,
  synergy_lines TEXT,
  strengths_weaknesses TEXT,
  matchup_notes TEXT,
  mulligan_guide TEXT,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_documentation_user_id ON deck_documentation(user_id);

-- 19. deck_notes (user-owned, gets user_id)
CREATE TABLE deck_notes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_notes_deck_id ON deck_notes(deck_id);
CREATE INDEX idx_deck_notes_user_id ON deck_notes(user_id);

-- 20. deck_overview_content (user-owned, gets user_id)
CREATE TABLE deck_overview_content (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_overview_content_user_id ON deck_overview_content(user_id);

-- 21. deck_combos (user-owned, gets user_id)
CREATE TABLE deck_combos (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_combos_user_id ON deck_combos(user_id);

-- 22. deck_mana_analysis (user-owned, gets user_id)
CREATE TABLE deck_mana_analysis (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_mana_analysis_user_id ON deck_mana_analysis(user_id);

-- 23. deck_upgrades (user-owned, gets user_id)
CREATE TABLE deck_upgrades (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  owned BOOLEAN DEFAULT FALSE,
  suggested_cut TEXT,
  cut_flag TEXT,
  price NUMERIC,
  synergy_score DOUBLE PRECISION,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_upgrades_user_id ON deck_upgrades(user_id);

-- 24. deck_ratings (user-owned, gets user_id)
CREATE TABLE deck_ratings (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_ratings_user_id ON deck_ratings(user_id);

-- 25. dead_weight_dismissals (user-owned, gets user_id)
CREATE TABLE dead_weight_dismissals (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deck_id, card_name)
);
CREATE INDEX idx_dw_dismissals_deck ON dead_weight_dismissals(deck_id);
CREATE INDEX idx_dw_dismissals_user_id ON dead_weight_dismissals(user_id);

-- 26. precon_mod_state (user-owned, gets user_id)
CREATE TABLE precon_mod_state (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  swaps_used INTEGER DEFAULT 1,
  sol_ring_removed BOOLEAN DEFAULT FALSE,
  rarity_mythic_used INTEGER DEFAULT 0,
  rarity_rare_used INTEGER DEFAULT 0,
  rarity_uncommon_used INTEGER DEFAULT 0,
  rarity_common_used INTEGER DEFAULT 0,
  budget_spent NUMERIC DEFAULT 0.0,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deck_id)
);
CREATE INDEX idx_precon_mod_state_deck ON precon_mod_state(deck_id);
CREATE INDEX idx_precon_mod_state_user_id ON precon_mod_state(user_id);

-- 27. upgrade_change_log (user-owned, gets user_id)
CREATE TABLE upgrade_change_log (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  cut_card TEXT NOT NULL,
  add_card TEXT NOT NULL,
  reason TEXT DEFAULT '',
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX idx_upgrade_change_log_deck ON upgrade_change_log(deck_id);
CREATE INDEX idx_upgrade_change_log_user_id ON upgrade_change_log(user_id);

-- 28. sync_runs (user-owned, gets user_id)
CREATE TABLE sync_runs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  trigger TEXT NOT NULL CHECK(trigger IN ('csv_import', 'manual', 'card_movement', 'scheduled')),
  decks_processed INTEGER DEFAULT 0,
  decks_succeeded INTEGER DEFAULT 0,
  decks_failed INTEGER DEFAULT 0,
  details TEXT,
  user_id UUID NOT NULL
);
CREATE INDEX idx_sync_runs_user_id ON sync_runs(user_id);

-- ============================================================
-- TIER 6: debrief_sessions (depends on decks)
-- ============================================================

-- 29. debrief_sessions (user-owned, gets user_id)
CREATE TABLE debrief_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'investigating'
    CHECK(status IN ('investigating', 'analysing', 'recommending', 'complete', 'abandoned')),
  brief_json TEXT,
  recommendations_json TEXT,
  current_rec_index INTEGER DEFAULT 0,
  conversation_json TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_debrief_sessions_deck ON debrief_sessions(deck_id, status);
CREATE INDEX idx_debrief_sessions_user_id ON debrief_sessions(user_id);

-- ============================================================
-- TIER 7: debrief_actions, brew_sessions (depend on debrief_sessions/decks)
-- ============================================================

-- 30. debrief_actions (user-owned, gets user_id)
CREATE TABLE debrief_actions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES debrief_sessions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK(action_type IN ('applied', 'skipped', 'disagreed', 'error')),
  cut_card TEXT NOT NULL,
  add_card TEXT NOT NULL,
  reason TEXT NOT NULL,
  notion_logged BOOLEAN NOT NULL DEFAULT FALSE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_debrief_actions_session ON debrief_actions(session_id);
CREATE INDEX idx_debrief_actions_user_id ON debrief_actions(user_id);

-- 31. brew_sessions (user-owned, gets user_id)
CREATE TABLE brew_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER REFERENCES decks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'selecting'
    CHECK(status IN ('selecting', 'investigating', 'confirming', 'generating', 'refining', 'saving', 'complete', 'abandoned', 'exploring', 'building')),
  path_type TEXT CHECK(path_type IN ('commander', 'concept')),
  commander_name TEXT,
  colour_identity TEXT,
  concept_description TEXT,
  brief_json TEXT,
  skeleton_json TEXT,
  refinement_history_json TEXT DEFAULT '[]',
  conversation_json TEXT DEFAULT '[]',
  decision_log_json TEXT DEFAULT '{"strategy":[],"parameters":[],"constraints":[]}',
  assessment_cache_json TEXT DEFAULT '{}',
  model_id TEXT DEFAULT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brew_sessions_status ON brew_sessions(status);
CREATE INDEX idx_brew_sessions_updated ON brew_sessions(updated_at DESC);
CREATE INDEX idx_brew_sessions_user_id ON brew_sessions(user_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- shared_cards view (translated from SQLite GROUP_CONCAT → Postgres string_agg)
CREATE OR REPLACE VIEW shared_cards AS
SELECT
  dc.card_name,
  COUNT(DISTINCT dc.deck_id) AS deck_count,
  string_agg(DISTINCT dc.deck_id::TEXT, ',') AS deck_ids,
  (SELECT COALESCE(SUM(c.quantity), 0)
   FROM collection c
   WHERE c.card_name = dc.card_name) AS owned_copies
FROM deck_cards dc
GROUP BY dc.card_name
HAVING COUNT(DISTINCT dc.deck_id) > 1;
