-- ============================================================
-- Migration: Fix user_locations unique constraint
--
-- The original storage_locations table had UNIQUE(name, user_id).
-- This constraint was preserved through renames:
--   storage_locations → locations → user_locations
--
-- The constraint causes errors because:
--   1. Multiple decks can have the same name (deck-type locations)
--   2. Deck locations are auto-created by trigger when decks are created
--
-- Fix: Drop the old constraint and create a new partial index that
-- only enforces uniqueness for storage-type locations.
-- ============================================================

-- Drop the inherited constraint from storage_locations
ALTER TABLE user_locations DROP CONSTRAINT IF EXISTS storage_locations_name_user_id_key;

-- Create a new partial unique index for storage-type locations only
-- (decks can have duplicate names, storage locations cannot)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_locations_name_user_storage 
  ON user_locations(name, user_id) 
  WHERE type = 'storage';
