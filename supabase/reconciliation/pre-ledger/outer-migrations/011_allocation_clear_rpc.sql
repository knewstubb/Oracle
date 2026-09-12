-- Migration: Create RPC function for transactional allocation clearing
-- This function acquires an advisory lock and clears physical_copy_id + ownership_status
-- on deck_cards rows belonging to active decks for a given user.
--
-- The advisory lock (pg_advisory_xact_lock) serializes concurrent resolver runs.
-- The lock is automatically released when the transaction completes.
-- If the caller's transaction fails, the clear is rolled back automatically.
--
-- Validates: Requirements 6.4, 6.5, 6.6

CREATE OR REPLACE FUNCTION allocation_clear_active_decks(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Acquire advisory lock for concurrency serialization (Requirement 6.6).
  -- This blocks concurrent resolver runs until this transaction completes.
  -- Lock ID 12345 is reserved for the allocation resolver.
  PERFORM pg_advisory_xact_lock(12345);

  -- Clear physical_copy_id and ownership_status on deck_cards rows
  -- belonging to ACTIVE decks only (Requirement 6.4).
  -- Inactive/draft deck rows are left unchanged.
  UPDATE deck_cards
  SET physical_copy_id = NULL,
      ownership_status = NULL
  WHERE user_id = p_user_id
    AND deck_id IN (
      SELECT id FROM decks
      WHERE user_id = p_user_id
        AND status = 'active'
    );
END;
$$;

-- Grant execute to authenticated users (service role bypasses this anyway)
GRANT EXECUTE ON FUNCTION allocation_clear_active_decks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION allocation_clear_active_decks(UUID) TO service_role;
