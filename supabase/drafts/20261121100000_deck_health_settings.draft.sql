-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: deck rail Figma redesign (docs/oracle/briefs/deck-rail-figma-redesign.md), Deck settings > Deck health tab. Author: Developer, 2026-11-21.
-- Pattern: supabase/drafts/20261118120400_roles_db5_health_targets.draft.sql (RLS select own rows, writes only via service role).
-- What this does (and only this):
--   1. deck_health_settings: one row per deck, mode 'default' or 'custom'. No row means 'default'.
--   2. deck_health_categories: per deck, either a per-deck override of one of the five default ranges (kind not null)
--      or a custom category (kind null). Claude's proposed range is kept in proposed_min / proposed_max until the owner confirms.
--   Category COUNTS are not stored: they are computed from deck_cards.categories by case-insensitive name.
-- Not destructive: two new tables. Nothing existing is changed or dropped. Custom rows stay when mode is switched back to 'default'.
-- Writes happen only through the Next.js routes (owner check), using the service role.
-- Reversible: supabase/drafts/20261121100000_deck_health_settings.rollback.sql (refuses while either table holds rows).
BEGIN;

CREATE TABLE public.deck_health_settings (
  deck_id    integer PRIMARY KEY REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  mode       text NOT NULL DEFAULT 'default' CHECK (mode IN ('default', 'custom')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deck_health_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_health_settings_select_own ON public.deck_health_settings
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.deck_health_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deck_health_settings TO authenticated;
GRANT ALL ON public.deck_health_settings TO service_role;

CREATE TABLE public.deck_health_categories (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id      integer NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  kind         text CHECK (kind IN ('lands', 'ramp', 'card_advantage', 'targeted_removal', 'board_wipes')),  -- not null: override of a default range; null: custom category
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  min_cards    integer CHECK (min_cards >= 0),
  max_cards    integer CHECK (max_cards >= 0),
  proposed_min integer CHECK (proposed_min >= 0),
  proposed_max integer CHECK (proposed_max >= 0),
  proposed_by  text CHECK (proposed_by = 'claude'),
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_health_categories_range_order CHECK (min_cards IS NULL OR max_cards IS NULL OR min_cards <= max_cards),
  CONSTRAINT deck_health_categories_proposed_order CHECK (proposed_min IS NULL OR proposed_max IS NULL OR proposed_min <= proposed_max),
  CONSTRAINT deck_health_categories_proposed_pair CHECK ((proposed_min IS NULL AND proposed_max IS NULL) OR (proposed_min IS NOT NULL AND proposed_max IS NOT NULL))
);
CREATE UNIQUE INDEX deck_health_categories_deck_name_uq ON public.deck_health_categories (deck_id, lower(name));
CREATE UNIQUE INDEX deck_health_categories_deck_kind_uq ON public.deck_health_categories (deck_id, kind) WHERE kind IS NOT NULL;
CREATE INDEX deck_health_categories_deck_idx ON public.deck_health_categories (deck_id, sort_order);
ALTER TABLE public.deck_health_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_health_categories_select_own ON public.deck_health_categories
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.deck_health_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deck_health_categories TO authenticated;
GRANT ALL ON public.deck_health_categories TO service_role;

COMMIT;

-- Rolled-back rehearsal (run by the owner or Architect on a throwaway session; never commits):
-- BEGIN;
--   \i supabase/drafts/20261121100000_deck_health_settings.draft.sql   -- (remove its own BEGIN/COMMIT for the rehearsal)
--   INSERT INTO public.deck_health_settings (deck_id, user_id, mode) SELECT id, user_id, 'custom' FROM public.decks LIMIT 1;
--   INSERT INTO public.deck_health_categories (deck_id, user_id, name, min_cards, max_cards)
--     SELECT id, user_id, 'Protection', 3, 5 FROM public.decks LIMIT 1;
--   SELECT * FROM public.deck_health_settings;
--   SELECT * FROM public.deck_health_categories;
-- ROLLBACK;
