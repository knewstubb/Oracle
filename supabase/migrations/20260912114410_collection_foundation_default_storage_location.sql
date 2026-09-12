-- ============================================================
-- Collection Foundation Phase 1: default storage location
--
-- Adds an is_default flag to storage-type user_locations, guarantees
-- exactly one default per user, seeds a default for every user that
-- has copies or storage locations, and backfills copies that are
-- unsorted (location_id IS NULL) AND not sleeved in any deck slot
-- into that default. Copies currently referenced by a deck_cards
-- slot are intentionally left location-less (they are "in the deck").
-- ============================================================

-- 1. Add is_default (storage-only semantics; deck rows stay false)
ALTER TABLE public.user_locations
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- 2. At most one default storage location per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_locations_one_default_per_user
  ON public.user_locations(user_id)
  WHERE is_default = true AND type = 'storage';

-- 3. Seed a default storage location for every user that has any copies
--    or storage locations but no default yet. Promote an existing
--    storage location named 'Unsorted' if present, else create one.
DO $$
DECLARE
  u uuid;
  existing_id integer;
  next_sort integer;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id FROM public.user_copies
    UNION
    SELECT DISTINCT user_id FROM public.user_locations WHERE type = 'storage'
  LOOP
    -- Skip if this user already has a default storage location
    IF EXISTS (
      SELECT 1 FROM public.user_locations
      WHERE user_id = u AND type = 'storage' AND is_default = true
    ) THEN
      CONTINUE;
    END IF;

    -- Prefer an existing storage location literally named 'Unsorted'
    SELECT id INTO existing_id
    FROM public.user_locations
    WHERE user_id = u AND type = 'storage' AND lower(name) = 'unsorted'
    ORDER BY id
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      UPDATE public.user_locations SET is_default = true WHERE id = existing_id;
    ELSE
      SELECT COALESCE(MAX(sort_order), -1) + 1 INTO next_sort
      FROM public.user_locations
      WHERE user_id = u AND type = 'storage';

      INSERT INTO public.user_locations (name, type, deck_id, color, sort_order, user_id, is_default)
      VALUES ('Unsorted', 'storage', NULL, '#6B7280', next_sort, u, true);
    END IF;
  END LOOP;
END $$;

-- 4. Backfill: unsorted (NULL location) AND not sleeved -> the user's default.
--    Copies referenced by any deck_cards slot are left untouched.
UPDATE public.user_copies uc
SET location_id = d.id
FROM public.user_locations d
WHERE d.user_id = uc.user_id
  AND d.type = 'storage'
  AND d.is_default = true
  AND uc.location_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.deck_cards dc WHERE dc.copy_id = uc.id
  );;
