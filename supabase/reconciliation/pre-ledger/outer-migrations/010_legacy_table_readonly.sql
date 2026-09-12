-- ============================================================
-- Migration 010: Legacy Table Read-Only Gates
--
-- Puts the `collection` and `deck_allocations` tables into
-- read-only retirement mode. Application roles can still SELECT
-- but all write operations (INSERT, UPDATE, DELETE) are blocked
-- via both REVOKE and defensive trigger functions.
--
-- Superuser access is preserved for emergency recovery.
-- ============================================================

BEGIN;

-- ============================================================
-- Step 1: Revoke write privileges on `collection` table
-- for Supabase application roles (anon, authenticated, service_role)
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON collection FROM anon;
REVOKE INSERT, UPDATE, DELETE ON collection FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON collection FROM service_role;

-- ============================================================
-- Step 2: Revoke write privileges on `deck_allocations` table
-- for Supabase application roles (anon, authenticated, service_role)
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON deck_allocations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON deck_allocations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON deck_allocations FROM service_role;

-- ============================================================
-- Step 3: Create trigger function for `collection` table
-- that raises an exception on any write attempt.
-- This is a belt-and-suspenders safeguard in case privileges
-- are re-granted or bypassed via RLS policies.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_collection_writes()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'The collection table is in read-only retirement mode. Use physical_copies for card ownership data.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collection_readonly_guard
  BEFORE INSERT OR UPDATE OR DELETE
  ON collection
  FOR EACH ROW
  EXECUTE FUNCTION prevent_collection_writes();

-- ============================================================
-- Step 4: Create trigger function for `deck_allocations` table
-- that raises an exception on any write attempt.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_deck_allocations_writes()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'The deck_allocations table is in read-only retirement mode. Use physical_copies for card ownership data.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deck_allocations_readonly_guard
  BEFORE INSERT OR UPDATE OR DELETE
  ON deck_allocations
  FOR EACH ROW
  EXECUTE FUNCTION prevent_deck_allocations_writes();

COMMIT;
