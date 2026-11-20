-- =============================================================================
-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: store Scryfall's Oracle tags as the app's 40 card Tags (tags-fill). Author: Developer, 2026-11-20.
-- Brief: docs/oracle/briefs/card-tags-and-deck-slot-why.md (sections 5, 9A). List: docs/oracle/reports/2026-11-20-architect-tag-frequency-proposal.md.
-- Test: docs/oracle/reports/evidence/roles-db/test_tags.sh. Fill job: scripts/fill-card-tags.ts (run only after this is applied).
--
-- What this does (and only this):
--   1. ref_tag_list: the shared list of the 40 Tags (stable key, display name, broad or mechanic, the Scryfall tags each maps from, display order).
--      Ships with the 40 rows, so the fill job and the screens agree on the same list.
--   2. ref_card_tags: one row per card per Tag, keyed by oracle_id (the card, D-003; never a scryfall_id) plus the Tag key.
--      No user and no deck is attached: Tags are global, the same for everyone. Each row records where it came from
--      (source: 'scryfall' now; 'rule', 'ai' and 'owner_correction' are allowed for later), the fill run that wrote it (run_id) and when (filled_at),
--      so a whole run can be removed with one statement:  DELETE FROM ref_card_tags WHERE run_id = '<run>'.
--      It ships EMPTY. The fill job writes the rows.
--   Signed-in users can read both tables. Only the service role can write them (row security on; no write grant for anyone else).
-- Not destructive: two new tables. No existing table, column, function, policy or row is touched.
-- Reversible: supabase/drafts/20261120100000_tags_fill_tag_tables.rollback.sql (refuses while ref_card_tags holds rows).
-- =============================================================================
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.ref_tag_list') IS NOT NULL OR to_regclass('public.ref_card_tags') IS NOT NULL THEN
    RAISE EXCEPTION 'tags_fill already applied (ref_tag_list or ref_card_tags exists)';
  END IF;
END $$;

CREATE TABLE public.ref_tag_list (
  key             text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  display_name    text NOT NULL CHECK (btrim(display_name) <> ''),
  kind            text NOT NULL CHECK (kind IN ('broad', 'mechanic')),
  scryfall_tags   text[] NOT NULL CHECK (cardinality(scryfall_tags) > 0),   -- Scryfall tag names this Tag maps from (each with its sub-tags)
  scryfall_exclude text[] NOT NULL DEFAULT '{}',                            -- Scryfall tag names whose cards are removed from this Tag
  display_order   integer NOT NULL UNIQUE CHECK (display_order > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ref_tag_list IS 'The 40 card Tags. Shared, no user attached. Readable by signed-in users, written only by the service role.';

CREATE TABLE public.ref_card_tags (
  oracle_id  uuid NOT NULL,
  tag_key    text NOT NULL REFERENCES public.ref_tag_list (key),
  source     text NOT NULL CHECK (source IN ('scryfall', 'rule', 'ai', 'owner_correction')),
  run_id     uuid NOT NULL,
  filled_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (oracle_id, tag_key, source)
);
CREATE INDEX ref_card_tags_tag ON public.ref_card_tags (tag_key, oracle_id);   -- "all cards with this Tag"
CREATE INDEX ref_card_tags_run ON public.ref_card_tags (run_id);               -- "undo one run"
COMMENT ON TABLE public.ref_card_tags IS 'Card Tags keyed by oracle_id (the card), NOT a scryfall_id (a printing). D-003. Global: no user, no deck. run_id is the run that FIRST wrote the row.';

ALTER TABLE public.ref_tag_list ENABLE ROW LEVEL SECURITY;    -- never FORCE
ALTER TABLE public.ref_card_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY ref_tag_list_read_signed_in ON public.ref_tag_list FOR SELECT TO authenticated USING (true);
CREATE POLICY ref_card_tags_read_signed_in ON public.ref_card_tags FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.ref_tag_list, public.ref_card_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ref_tag_list, public.ref_card_tags TO authenticated;
GRANT ALL ON public.ref_tag_list, public.ref_card_tags TO service_role;

INSERT INTO public.ref_tag_list (key, display_name, kind, scryfall_tags, scryfall_exclude, display_order) VALUES
  ('targeted_removal', 'Targeted removal', 'broad', ARRAY['removal']::text[], ARRAY['sweeper', 'removal-land']::text[], 1),
  ('card_draw', 'Card draw', 'broad', ARRAY['draw']::text[], '{}'::text[], 2),
  ('ramp', 'Ramp', 'broad', ARRAY['ramp']::text[], '{}'::text[], 3),
  ('recursion', 'Recursion', 'broad', ARRAY['recursion']::text[], '{}'::text[], 4),
  ('card_selection', 'Card selection', 'broad', ARRAY['scry', 'surveil', 'top-deck-manipulation', 'loot', 'rummage']::text[], '{}'::text[], 5),
  ('protection', 'Protection', 'broad', ARRAY['protection']::text[], '{}'::text[], 6),
  ('tutor', 'Tutor', 'broad', ARRAY['tutor']::text[], '{}'::text[], 7),
  ('fixing', 'Fixing', 'broad', ARRAY['mana-fix', 'mana-filter', 'dual-land', 'tutor-land-basic']::text[], '{}'::text[], 8),
  ('board_wipe', 'Board wipe', 'broad', ARRAY['sweeper']::text[], '{}'::text[], 9),
  ('hand_disruption', 'Hand disruption', 'broad', ARRAY['hand-disruption']::text[], '{}'::text[], 10),
  ('stax_tax', 'Stax / tax', 'broad', ARRAY['tax', 'lockdown', 'mass-land-denial']::text[], '{}'::text[], 11),
  ('counterspell', 'Counterspell', 'broad', ARRAY['counterspell']::text[], '{}'::text[], 12),
  ('graveyard_hate', 'Graveyard hate', 'broad', ARRAY['hate-graveyard']::text[], '{}'::text[], 13),
  ('direct_damage', 'Direct damage or life loss to opponents', 'mechanic', ARRAY['burn-player', 'drain-life', 'opponent-loses-life', 'group-slug']::text[], '{}'::text[], 14),
  ('plus_one_counters', '+1/+1 counter maker', 'mechanic', ARRAY['gives-pp-counters', 'repeatable-pp-counters']::text[], '{}'::text[], 15),
  ('lifegain', 'Lifegain', 'mechanic', ARRAY['lifegain']::text[], '{}'::text[], 16),
  ('token_generator', 'Token generator', 'mechanic', ARRAY['repeatable-token-generator']::text[], '{}'::text[], 17),
  ('play_from_exile', 'Play from exile (impulse)', 'mechanic', ARRAY['impulse', 'repeatable-impulse', 'castable-from-exile', 'gives-castable-from-exile']::text[], '{}'::text[], 18),
  ('anthem', 'Anthem / team pump', 'mechanic', ARRAY['power-boost-to-all', 'toughness-boost-to-all', 'anthem', 'keyword-anthem']::text[], '{}'::text[], 19),
  ('death_trigger', 'Death trigger', 'mechanic', ARRAY['death-trigger']::text[], '{}'::text[], 20),
  ('mana_sink', 'Mana sink', 'mechanic', ARRAY['mana-sink', 'bottomless-mana-sink']::text[], '{}'::text[], 21),
  ('sacrifice_outlet', 'Sacrifice outlet', 'mechanic', ARRAY['sacrifice-outlet']::text[], '{}'::text[], 22),
  ('discard_outlet', 'Discard outlet', 'mechanic', ARRAY['discard-outlet']::text[], '{}'::text[], 23),
  ('counters_payoff', 'Counters payoff', 'mechanic', ARRAY['counters-matter', 'pp-counters-matter']::text[], '{}'::text[], 24),
  ('cast_trigger', 'Cast trigger', 'mechanic', ARRAY['cast-trigger-you']::text[], '{}'::text[], 25),
  ('graveyard_payoff', 'Graveyard payoff', 'mechanic', ARRAY['cards-in-graveyard-matter', 'graveyard-fuel']::text[], '{}'::text[], 26),
  ('artifact_payoff', 'Artifact payoff', 'mechanic', ARRAY['synergy-artifact']::text[], '{}'::text[], 27),
  ('self_mill', 'Self-mill', 'mechanic', ARRAY['mill-self']::text[], '{}'::text[], 28),
  ('copy_clone', 'Copy / clone', 'mechanic', ARRAY['copy']::text[], '{}'::text[], 29),
  ('tapper', 'Tapper', 'mechanic', ARRAY['tapper-creature']::text[], '{}'::text[], 30),
  ('steal_control', 'Steal / gain control', 'mechanic', ARRAY['theft', 'control-changing-effects']::text[], ARRAY['reanimate-from-opponent']::text[], 31),
  ('creature_enters_payoff', 'Creature-enters payoff', 'mechanic', ARRAY['creaturefall']::text[], '{}'::text[], 32),
  ('spellslinger_payoff', 'Spellslinger payoff', 'mechanic', ARRAY['synergy-instant', 'synergy-sorcery']::text[], '{}'::text[], 33),
  ('mill_opponents', 'Mill opponents', 'mechanic', ARRAY['mill-opponent', 'mill-any']::text[], '{}'::text[], 34),
  ('group_hug', 'Group hug', 'mechanic', ARRAY['group-hug', 'selective-group-hug']::text[], '{}'::text[], 35),
  ('free_cast', 'Free cast / cheat into play', 'mechanic', ARRAY['free-cast-another']::text[], '{}'::text[], 36),
  ('cost_reducer', 'Cost reducer', 'mechanic', ARRAY['cost-reducer']::text[], '{}'::text[], 37),
  ('landfall', 'Landfall', 'mechanic', ARRAY['landfall']::text[], '{}'::text[], 38),
  ('treasure_generator', 'Treasure generator', 'mechanic', ARRAY['repeatable-treasures']::text[], '{}'::text[], 39),
  ('blink', 'Blink', 'mechanic', ARRAY['flicker']::text[], '{}'::text[], 40);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ref_tag_list) <> 40 OR (SELECT count(*) FROM public.ref_tag_list WHERE kind = 'broad') <> 13 THEN
    RAISE EXCEPTION 'tags_fill: expected 40 Tags (13 broad)';
  END IF;
END $$;
COMMIT;
