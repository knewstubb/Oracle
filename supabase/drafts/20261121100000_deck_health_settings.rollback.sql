-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261121100000_deck_health_settings.sql.
-- Drops: deck_health_categories and deck_health_settings. Removes nothing else.
-- Refuses while either table holds rows (the owner's custom categories and modes).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.deck_health_settings') IS NULL OR to_regclass('public.deck_health_categories') IS NULL THEN
    RAISE EXCEPTION 'deck_health_settings is not applied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deck_health_settings) OR EXISTS (SELECT 1 FROM public.deck_health_categories) THEN
    RAISE EXCEPTION 'cannot roll back: the deck health tables hold rows';
  END IF;
END $$;
DROP TABLE public.deck_health_categories;
DROP TABLE public.deck_health_settings;
COMMIT;
