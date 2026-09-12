-- ============================================================
-- Migration 006: Storage Locations
--
-- Adds physical storage location tracking for collection cards.
-- Cards not in a deck can be assigned to a named location
-- (e.g., "Rare Binder", "Bulk Box", "Trade Pile").
-- ============================================================

-- 1. Create storage_locations table
CREATE TABLE storage_locations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER DEFAULT 0,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, user_id)
);

CREATE INDEX idx_storage_locations_user ON storage_locations(user_id);

-- 2. Add storage_location_id to collection table
ALTER TABLE collection ADD COLUMN storage_location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL;

CREATE INDEX idx_collection_storage_location ON collection(storage_location_id);

-- 3. Enable RLS
ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY storage_locations_user_policy ON storage_locations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role bypass
CREATE POLICY storage_locations_service_policy ON storage_locations
  FOR ALL
  USING (true)
  WITH CHECK (true);
