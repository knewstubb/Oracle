-- ============================================================
-- Migration 005: Deck Status Lifecycle Update
--
-- Replaces 'concept' with 'inactive' in the deck status values.
-- Migrates any existing 'concept' rows to 'draft'.
-- Final valid statuses: 'active', 'draft', 'inactive'
-- Default remains 'active'.
--
-- Requirements: 1.1, 1.2, 1.3, 1.4
-- ============================================================

-- Step 1: Migrate existing 'concept' rows to 'draft'
UPDATE decks SET status = 'draft' WHERE status = 'concept';

-- Step 2: Drop existing constraint, add new one
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_status_check;
ALTER TABLE decks ADD CONSTRAINT decks_status_check
  CHECK (status IN ('active', 'draft', 'inactive'));
