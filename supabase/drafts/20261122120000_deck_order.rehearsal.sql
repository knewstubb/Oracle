-- Throwaway-Postgres rehearsal for 20261122120000_deck_order. NEVER run against the hosted database.
-- Usage (psql -v ON_ERROR_STOP=1 -f this-file, in a scratch database), from the repo root. Each step prints PASS or fails loudly.
\set ON_ERROR_STOP on
-- Stub of the parts of the live schema the draft touches (decks only; columns and roles approximate).
CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; END $$;
CREATE TABLE public.decks (id serial PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), name text NOT NULL, status text NOT NULL DEFAULT 'planned', folder_id integer);
GRANT SELECT ON public.decks TO service_role;
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
INSERT INTO public.decks (user_id, name) VALUES
 ('00000000-0000-0000-0000-00000000000a','Prosper'), ('00000000-0000-0000-0000-00000000000a','Atraxa'),
 ('00000000-0000-0000-0000-00000000000a','Korvold'), ('00000000-0000-0000-0000-00000000000b','Zur'),
 ('00000000-0000-0000-0000-00000000000b','Ayula');

-- 1. APPLY
\i supabase/drafts/20261122120000_deck_order.draft.sql
DO $$ BEGIN
  IF (SELECT string_agg(name, ',' ORDER BY position) FROM decks WHERE user_id='00000000-0000-0000-0000-00000000000a') <> 'Atraxa,Korvold,Prosper' THEN RAISE EXCEPTION 'FAIL backfill A'; END IF;
  IF (SELECT string_agg(name, ',' ORDER BY position) FROM decks WHERE user_id='00000000-0000-0000-0000-00000000000b') <> 'Ayula,Zur' THEN RAISE EXCEPTION 'FAIL backfill B'; END IF;
  RAISE NOTICE 'PASS apply + backfill per user from A to Z';
END $$;

-- 2. NEW DECK GOES TO THE END (per user)
INSERT INTO decks (user_id, name) VALUES ('00000000-0000-0000-0000-00000000000a','Aesi'), ('00000000-0000-0000-0000-00000000000b','Zzz');
DO $$ BEGIN
  IF (SELECT string_agg(name, ',' ORDER BY position) FROM decks WHERE user_id='00000000-0000-0000-0000-00000000000a') <> 'Atraxa,Korvold,Prosper,Aesi' THEN RAISE EXCEPTION 'FAIL new deck end A'; END IF;
  IF (SELECT max(position) FROM decks WHERE user_id='00000000-0000-0000-0000-00000000000b') <> 3 THEN RAISE EXCEPTION 'FAIL new deck end B'; END IF;
  RAISE NOTICE 'PASS new decks go to the end';
END $$;

-- 3. MOVE (as service_role): Korvold to the front
SET ROLE service_role;
SELECT move_decks('00000000-0000-0000-0000-00000000000a', ARRAY(SELECT id FROM decks WHERE name IN ('Korvold','Atraxa','Prosper','Aesi') ORDER BY array_position(ARRAY['Korvold','Atraxa','Prosper','Aesi'], name)));
RESET ROLE;
DO $$ BEGIN
  IF (SELECT string_agg(name, ',' ORDER BY position) FROM decks WHERE user_id='00000000-0000-0000-0000-00000000000a') <> 'Korvold,Atraxa,Prosper,Aesi' THEN RAISE EXCEPTION 'FAIL move'; END IF;
  IF (SELECT string_agg(name, ',' ORDER BY position) FROM decks WHERE user_id='00000000-0000-0000-0000-00000000000b') <> 'Ayula,Zur,Zzz' THEN RAISE EXCEPTION 'FAIL move touched other user'; END IF;
  RAISE NOTICE 'PASS move works, other user untouched';
END $$;

-- 4. ALL-OR-NOTHING: each bad call must raise the named error and leave every position as it was
CREATE TEMP TABLE before AS SELECT id, position FROM decks;
DO $$
DECLARE a uuid := '00000000-0000-0000-0000-00000000000a'; ids integer[]; bad text; tests text[][];
        t record;
BEGIN
  SELECT array_agg(id ORDER BY position) INTO ids FROM decks WHERE user_id = a;
  FOR t IN SELECT * FROM (VALUES
     ('deck_order_empty',     ARRAY[]::integer[]),
     ('deck_order_duplicate', ARRAY[ids[1], ids[1], ids[3], ids[4]]),
     ('deck_order_mismatch',  ids[1:3]),                                              -- one deck missing
     ('deck_order_mismatch',  ids || 999999),                                         -- unknown deck
     ('deck_order_mismatch',  ARRAY[ids[1], ids[2], ids[3], (SELECT id FROM decks WHERE name='Zur')])  -- other user's deck
  ) v(expected, arr) LOOP
    BEGIN
      PERFORM move_decks(a, t.arr);
      RAISE EXCEPTION 'FAIL no error for %', t.expected;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> t.expected THEN RAISE EXCEPTION 'FAIL expected % got %', t.expected, SQLERRM; END IF;
    END;
  END LOOP;
  IF EXISTS (SELECT 1 FROM decks d JOIN before b USING (id) WHERE d.position <> b.position) THEN RAISE EXCEPTION 'FAIL positions changed'; END IF;
  RAISE NOTICE 'PASS five bad lists refused, no position changed';
END $$;
-- Failure halfway: force the write itself to fail on the 3rd row (position CHECK), prove earlier rows roll back too.
CREATE FUNCTION pg_temp.halfway() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _x(i int);
  -- a deferred-style failure: trigger that fails when the 3rd deck of user A is written
  CREATE FUNCTION public._boom() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.position = 3 THEN RAISE EXCEPTION ''boom''; END IF; RETURN NEW; END';
  CREATE TRIGGER _boom BEFORE UPDATE ON public.decks FOR EACH ROW EXECUTE FUNCTION public._boom();
END $$;
SELECT pg_temp.halfway();
DO $$ BEGIN
  BEGIN
    PERFORM move_decks('00000000-0000-0000-0000-00000000000a', ARRAY(SELECT id FROM decks WHERE user_id='00000000-0000-0000-0000-00000000000a' ORDER BY position DESC));
    RAISE EXCEPTION 'FAIL boom did not fire';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'boom' THEN RAISE; END IF; END;
  IF EXISTS (SELECT 1 FROM decks d JOIN before b USING (id) WHERE d.position <> b.position) THEN RAISE EXCEPTION 'FAIL partial write survived'; END IF;
  RAISE NOTICE 'PASS failure mid-save leaves the old order';
END $$;
DROP TRIGGER _boom ON public.decks; DROP FUNCTION public._boom();

-- 5. PERMISSIONS: signed-in and anonymous users cannot call the function
DO $$ BEGIN
  IF has_function_privilege('authenticated','public.move_decks(uuid,integer[])','EXECUTE') OR has_function_privilege('anon','public.move_decks(uuid,integer[])','EXECUTE')
     OR NOT has_function_privilege('service_role','public.move_decks(uuid,integer[])','EXECUTE') THEN RAISE EXCEPTION 'FAIL grants'; END IF;
  RAISE NOTICE 'PASS only service_role can execute';
END $$;

-- 6. UNDO refuses while the order differs from A to Z, then works when confirmed
\echo 'undo without confirmation (expected to ERROR) ...'
\set ON_ERROR_STOP off
\i supabase/drafts/20261122120000_deck_order.rollback.sql
\set ON_ERROR_STOP on
ROLLBACK;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='decks' AND column_name='position') THEN RAISE EXCEPTION 'FAIL refusal did not keep column'; END IF;
  RAISE NOTICE 'PASS undo refused, column still there';
END $$;
SET oracle.confirm_drop_deck_order = 'yes';
\i supabase/drafts/20261122120000_deck_order.rollback.sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='decks' AND column_name='position')
     OR to_regprocedure('public.move_decks(uuid,integer[])') IS NOT NULL
     OR (SELECT count(*) FROM decks) <> 7 THEN RAISE EXCEPTION 'FAIL undo'; END IF;
  RAISE NOTICE 'PASS undo confirmed: column, function, trigger gone; all 7 decks still present';
END $$;
