-- ---------------------------------------------------------------------------
-- Extend oracle_sessions for Unified Oracle Sidebar
-- ---------------------------------------------------------------------------
-- Adds fields needed for:
-- - Session naming (AI-generated or user-edited)
-- - Session typing (exploration, deck, collection, general)
-- - Context linking (deck_id for deck-context sessions)
-- - Archival (soft delete for old sessions)
-- ---------------------------------------------------------------------------

-- Add session_name column for AI-generated or user-edited names
ALTER TABLE oracle_sessions
  ADD COLUMN IF NOT EXISTS session_name VARCHAR(100);

-- Add session_type to distinguish exploration vs deck vs general sessions
-- Values: 'exploration' | 'deck' | 'collection' | 'general'
ALTER TABLE oracle_sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'general'
  CHECK (session_type IN ('exploration', 'deck', 'collection', 'general'));

-- Add context_deck_id for deck-context sessions (nullable)
ALTER TABLE oracle_sessions
  ADD COLUMN IF NOT EXISTS context_deck_id INTEGER REFERENCES decks(id) ON DELETE SET NULL;

-- Add archived_at for soft archive (nullable = not archived)
ALTER TABLE oracle_sessions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add status for exploration sessions: exploring, building, complete
-- Values: 'active' | 'exploring' | 'building' | 'complete'
ALTER TABLE oracle_sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'exploring', 'building', 'complete'));

-- Add commander_name for exploration sessions that have selected a commander
ALTER TABLE oracle_sessions
  ADD COLUMN IF NOT EXISTS commander_name TEXT;

-- Add committed_deck_id for exploration sessions that have been committed to a deck
ALTER TABLE oracle_sessions
  ADD COLUMN IF NOT EXISTS committed_deck_id INTEGER REFERENCES decks(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Indexes for common query patterns
-- ---------------------------------------------------------------------------

-- Index for fetching active sessions by type (history panel tabs)
CREATE INDEX IF NOT EXISTS idx_oracle_sessions_type_active
  ON oracle_sessions(user_id, session_type, last_message_at DESC)
  WHERE archived_at IS NULL;

-- Index for fetching sessions by deck context
CREATE INDEX IF NOT EXISTS idx_oracle_sessions_deck_context
  ON oracle_sessions(user_id, context_deck_id, last_message_at DESC)
  WHERE context_deck_id IS NOT NULL;

-- Index for archival queries (finding old sessions to archive)
CREATE INDEX IF NOT EXISTS idx_oracle_sessions_archival
  ON oracle_sessions(user_id, last_message_at)
  WHERE archived_at IS NULL AND committed_deck_id IS NULL;

-- ---------------------------------------------------------------------------
-- RLS policies already exist from original migration, no changes needed
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Helper function: Get active session for context (respects 4-hour window)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_active_oracle_session(
  p_user_id UUID,
  p_session_type TEXT,
  p_context_deck_id INTEGER DEFAULT NULL,
  p_window_hours INTEGER DEFAULT 4
)
RETURNS TABLE (
  id UUID,
  session_name VARCHAR(100),
  session_type TEXT,
  status TEXT,
  context_deck_id INTEGER,
  commander_name TEXT,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER,
  started_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    os.id,
    os.session_name,
    os.session_type,
    os.status,
    os.context_deck_id,
    os.commander_name,
    os.last_message_at,
    os.message_count,
    os.started_at
  FROM oracle_sessions os
  WHERE os.user_id = p_user_id
    AND os.session_type = p_session_type
    AND os.archived_at IS NULL
    AND (
      -- For deck context, match the specific deck
      (p_session_type = 'deck' AND os.context_deck_id = p_context_deck_id)
      -- For other contexts, no deck matching needed
      OR (p_session_type != 'deck')
    )
    AND os.last_message_at > (NOW() - (p_window_hours || ' hours')::INTERVAL)
  ORDER BY os.last_message_at DESC
  LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper function: Auto-archive old sessions (called by cron or on-demand)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION archive_old_oracle_sessions(
  p_user_id UUID,
  p_days_inactive INTEGER DEFAULT 90,
  p_max_active_sessions INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_archived_count INTEGER := 0;
  v_session_count INTEGER;
BEGIN
  -- 1. Archive sessions older than p_days_inactive with no committed deck
  UPDATE oracle_sessions
  SET archived_at = NOW()
  WHERE user_id = p_user_id
    AND archived_at IS NULL
    AND committed_deck_id IS NULL
    AND last_message_at < (NOW() - (p_days_inactive || ' days')::INTERVAL);
  
  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  -- 2. If still over limit, archive oldest sessions beyond max
  SELECT COUNT(*) INTO v_session_count
  FROM oracle_sessions
  WHERE user_id = p_user_id AND archived_at IS NULL;

  IF v_session_count > p_max_active_sessions THEN
    WITH sessions_to_archive AS (
      SELECT id
      FROM oracle_sessions
      WHERE user_id = p_user_id AND archived_at IS NULL
      ORDER BY last_message_at ASC
      LIMIT (v_session_count - p_max_active_sessions)
    )
    UPDATE oracle_sessions
    SET archived_at = NOW()
    WHERE id IN (SELECT id FROM sessions_to_archive);
    
    GET DIAGNOSTICS v_session_count = ROW_COUNT;
    v_archived_count := v_archived_count + v_session_count;
  END IF;

  RETURN v_archived_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN oracle_sessions.session_name IS 'AI-generated or user-edited session name (3-6 words)';
COMMENT ON COLUMN oracle_sessions.session_type IS 'Session context type: exploration, deck, collection, general';
COMMENT ON COLUMN oracle_sessions.context_deck_id IS 'Deck ID for deck-context sessions';
COMMENT ON COLUMN oracle_sessions.archived_at IS 'Soft archive timestamp (NULL = active)';
COMMENT ON COLUMN oracle_sessions.status IS 'Session status: active, exploring, building, complete';
COMMENT ON COLUMN oracle_sessions.commander_name IS 'Commander name for exploration sessions';
COMMENT ON COLUMN oracle_sessions.committed_deck_id IS 'Deck ID if exploration was committed';
COMMENT ON FUNCTION get_active_oracle_session IS 'Returns active session for context if within 4-hour window';
COMMENT ON FUNCTION archive_old_oracle_sessions IS 'Archives sessions >90 days old or beyond 100 session limit';
