-- ---------------------------------------------------------------------------
-- Repair: Oracle session functions
-- ---------------------------------------------------------------------------
-- The previous migration partially applied. This repairs the functions.
-- ---------------------------------------------------------------------------

-- Drop if exists to ensure clean state
DROP FUNCTION IF EXISTS get_active_oracle_session(UUID, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS archive_old_oracle_sessions(UUID, INTEGER, INTEGER);

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
  v_rows_affected INTEGER;
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
      SELECT os.id
      FROM oracle_sessions os
      WHERE os.user_id = p_user_id AND os.archived_at IS NULL
      ORDER BY os.last_message_at ASC
      LIMIT (v_session_count - p_max_active_sessions)
    )
    UPDATE oracle_sessions
    SET archived_at = NOW()
    WHERE id IN (SELECT sta.id FROM sessions_to_archive sta);
    
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    v_archived_count := v_archived_count + v_rows_affected;
  END IF;

  RETURN v_archived_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION get_active_oracle_session IS 'Returns active session for context if within 4-hour window';
COMMENT ON FUNCTION archive_old_oracle_sessions IS 'Archives sessions >90 days old or beyond 100 session limit';
