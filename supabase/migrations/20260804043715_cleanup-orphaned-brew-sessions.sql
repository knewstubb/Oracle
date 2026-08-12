-- ---------------------------------------------------------------------------
-- Migration: cleanup-orphaned-brew-sessions
-- 
-- Cleans up legacy brew_sessions that have no associated deck_id.
-- These are sessions created before the deck-first model was implemented.
--
-- Strategy:
-- 1. Sessions with no meaningful content (no commander, no conversation) → DELETE
-- 2. Sessions with content but no deck → Mark as 'abandoned' so they don't
--    appear in active session queries (user can still recover via DB if needed)
-- ---------------------------------------------------------------------------

-- Mark sessions with content but no deck as abandoned (preserves data)
UPDATE brew_sessions
SET status = 'abandoned',
    updated_at = NOW()
WHERE deck_id IS NULL
  AND status NOT IN ('complete', 'abandoned')
  AND (commander_name IS NOT NULL 
       OR (conversation_json IS NOT NULL 
           AND conversation_json != '[]' 
           AND conversation_json != 'null'));

-- Delete sessions with no deck AND no meaningful content
DELETE FROM brew_sessions
WHERE deck_id IS NULL
  AND status NOT IN ('complete', 'abandoned')
  AND commander_name IS NULL
  AND (conversation_json IS NULL 
       OR conversation_json = '[]' 
       OR conversation_json = 'null');
