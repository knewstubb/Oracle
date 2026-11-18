-- Throwaway data and test helpers. Two users, one active connection each, one switched-off connection for user 1.
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003');
INSERT INTO public.connector_connections (id, user_id, client_id, client_name, revoked_at) VALUES
  ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'cl-1', 'Claude', NULL),
  ('c1000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001', 'cl-old', 'Claude', now()),
  ('c2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'cl-2', 'Claude', NULL);
INSERT INTO public.decks (id, name, format, is_active, user_id, card_count) VALUES
  (100, 'Manual', 'commander', true, '00000000-0000-0000-0000-000000000001', 0),
  (200, 'U2 Deck', 'commander', true, '00000000-0000-0000-0000-000000000002', 0);
CREATE SCHEMA t;
CREATE TABLE t.res (n serial, name text, ok boolean, detail text);
CREATE FUNCTION t.chk(p_name text, p_ok boolean, p_detail text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  INSERT INTO t.res (name, ok, detail) VALUES (p_name, COALESCE(p_ok, false), left(COALESCE(p_detail, ''), 300)) $$;
-- Runs a SELECT that returns jsonb; returns {ok:true,res:..} or {ok:false,err:..}. The attempt is a sub-transaction: an error undoes it.
CREATE FUNCTION t.att(q text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb; d text;
BEGIN EXECUTE q INTO v; RETURN jsonb_build_object('ok', true, 'res', v);
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL; RETURN jsonb_build_object('ok', false, 'err', SQLERRM, 'detail', d);
END $$;
CREATE FUNCTION t.u1() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION t.u2() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT '00000000-0000-0000-0000-000000000002'::uuid $$;
CREATE FUNCTION t.u3() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT '00000000-0000-0000-0000-000000000003'::uuid $$;
CREATE FUNCTION t.c1() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'c1000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION t.c1_off() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'c1000000-0000-0000-0000-0000000000f1'::uuid $$;
CREATE FUNCTION t.c2() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'c2000000-0000-0000-0000-000000000002'::uuid $$;
GRANT USAGE ON SCHEMA t TO authenticated, anon; GRANT SELECT ON t.res TO authenticated;
-- Oracle id n / printing id n (two distinct families so a printing id can never be mistaken for a card id)
CREATE FUNCTION t.o(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
CREATE FUNCTION t.s(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
-- Submit / approve / undo wrappers that never throw: {ok:true,res:...} or {ok:false,err:...,detail:...}
CREATE FUNCTION t.sub(p_action text, p_payload jsonb, p_user uuid DEFAULT NULL, p_conn uuid DEFAULT NULL, p_dry boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE d text;
BEGIN RETURN jsonb_build_object('ok', true, 'res', public.ai_submit_change(COALESCE(p_user, t.u1()), COALESCE(p_conn, t.c1()), p_action, p_payload, p_dry));
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL; RETURN jsonb_build_object('ok', false, 'err', SQLERRM, 'detail', d);
END $$;
CREATE FUNCTION t.und(p_group uuid, p_actor text, p_user uuid DEFAULT NULL, p_conn uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE d text;
BEGIN RETURN jsonb_build_object('ok', true, 'res', public.ai_undo_group(COALESCE(p_user, t.u1()), p_group, p_actor, COALESCE(p_conn, t.c1())));
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL; RETURN jsonb_build_object('ok', false, 'err', SQLERRM, 'detail', d);
END $$;
CREATE FUNCTION t.appr(p_pending uuid, p_user uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE d text;
BEGIN RETURN jsonb_build_object('ok', true, 'res', public.ai_approve_pending(COALESCE(p_user, t.u1()), p_pending));
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL; RETURN jsonb_build_object('ok', false, 'err', SQLERRM, 'detail', d);
END $$;
CREATE FUNCTION t.gid(j jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT COALESCE(j#>>'{res,group_id}', j->>'group_id')::uuid $$;
CREATE FUNCTION t.slot(p_deck integer, p_name text) RETURNS integer LANGUAGE sql AS $$ SELECT id FROM public.deck_cards WHERE deck_id = p_deck AND card_name = p_name ORDER BY id LIMIT 1 $$;
-- One card element of a card_label request
CREATE FUNCTION t.cd(p_deck integer, p_name text, p_add text[] DEFAULT NULL, p_rem text[] DEFAULT NULL, p_job jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object('id', t.slot(p_deck, p_name), 'card_name', p_name, 'add_roles', to_jsonb(p_add), 'remove_roles', to_jsonb(p_rem), 'job', p_job))
$$;
CREATE FUNCTION t.lbl(p_deck integer, VARIADIC p_cards jsonb[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('deck_id', p_deck, 'cards', to_jsonb(p_cards))
$$;
-- A deck of n numbered cards ("<prefix> 1".."<prefix> n") with printings and oracle ids from a private range, for the limit tests
CREATE FUNCTION t.mkdeck(p_deck integer, p_user uuid, p_n integer, p_prefix text, p_base integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.decks (id, name, format, is_active, user_id, card_count) VALUES (p_deck, 'Big ' || p_prefix, 'commander', true, p_user, p_n);
  INSERT INTO public.ref_printings (scryfall_id, oracle_id, name) SELECT t.s(p_base + i), t.o(p_base + i), p_prefix || ' ' || i FROM generate_series(1, p_n) i;
  INSERT INTO public.deck_cards (deck_id, card_name, scryfall_id, quantity, user_id) SELECT p_deck, p_prefix || ' ' || i, t.s(p_base + i)::text, 1, p_user FROM generate_series(1, p_n) i;
END $$;
-- Moves every log row two hours into the past (so rate windows reset). Bypasses the append-only guard on purpose; test use only.
CREATE FUNCTION t.age() RETURNS void LANGUAGE plpgsql AS $$
BEGIN SET LOCAL session_replication_role = replica; UPDATE public.ai_change_log SET created_at = created_at - interval '2 hours'; END $$;
-- Fingerprint of the parts of the database this feature may touch: every function in public (full definition and grants), every public constraint, every public table.
CREATE FUNCTION t.fp() RETURNS text LANGUAGE sql AS $$
  SELECT md5(
    (SELECT string_agg(pg_get_functiondef(p.oid) || COALESCE(p.proacl::text, ''), '|' ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f')
    || '#' || (SELECT string_agg(c.conrelid::regclass::text || c.conname || pg_get_constraintdef(c.oid), '|' ORDER BY c.conrelid::regclass::text, c.conname) FROM pg_constraint c WHERE c.connamespace = 'public'::regnamespace)
    || '#' || (SELECT string_agg(relname, '|' ORDER BY relname) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'i', 'v'))
    || '#' || (SELECT string_agg(tgname || tgrelid::regclass::text, '|' ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal))
$$;
-- Test cards 1..20 (oracle id t.o(n), printing t.s(n)); card 1..10 in deck 100 by printing, plus a name-only slot, an unknown slot, a maybeboard slot
INSERT INTO public.ref_printings (scryfall_id, oracle_id, name) SELECT t.s(i), t.o(i), 'Card ' || i FROM generate_series(1, 20) i;
INSERT INTO public.ref_printings (scryfall_id, oracle_id, name) VALUES (t.s(101), t.o(1), 'Card 1 (second printing)');
INSERT INTO public.deck_cards (deck_id, card_name, scryfall_id, quantity, user_id, categories) SELECT 100, 'Card ' || i, t.s(i)::text, 1, t.u1(), CASE WHEN i = 9 THEN '["Maybeboard"]' ELSE '["Other"]' END FROM generate_series(1, 10) i;
INSERT INTO public.user_cards (card_name, oracle_id, user_id) VALUES ('Name Only', t.o(11)::text, t.u1()), ('Name Only', t.o(12)::text, t.u2()),
  ('Twin', t.o(13)::text, t.u1()), ('Twin', t.o(14)::text, t.u1());
INSERT INTO public.deck_cards (deck_id, card_name, scryfall_id, quantity, user_id) VALUES
  (100, 'Name Only', 'not-a-uuid', 1, t.u1()), (100, 'Mystery Card', NULL, 1, t.u1()), (100, 'Twin', NULL, 1, t.u1());
INSERT INTO public.deck_cards (deck_id, card_name, scryfall_id, quantity, user_id) VALUES
  (200, 'Card 1', t.s(1)::text, 1, t.u2()), (200, 'Card 2', t.s(2)::text, 1, t.u2()), (200, 'Name Only', NULL, 1, t.u2());
-- Runs one statement and ALWAYS undoes it. Returns 'ok' if it would have succeeded, else the error text.
CREATE FUNCTION t.try(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RAISE EXCEPTION 't_rollback';
EXCEPTION WHEN OTHERS THEN IF SQLERRM = 't_rollback' THEN RETURN 'ok'; ELSE RETURN SQLERRM; END IF;
END $$;
CREATE TABLE t.keep (k text PRIMARY KEY, v text);
-- A request for cards "<prefix> lo" .. "<prefix> hi" of a deck made by t.mkdeck. p_extra is merged into every card element (roles, job ...)
CREATE FUNCTION t.bigp(p_deck integer, p_lo integer, p_hi integer, p_prefix text, p_extra jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('deck_id', p_deck, 'cards', COALESCE(jsonb_agg(jsonb_build_object('id', dc.id, 'card_name', dc.card_name) || p_extra ORDER BY dc.id), '[]'::jsonb))
    FROM public.deck_cards dc WHERE dc.deck_id = p_deck AND dc.card_name IN (SELECT p_prefix || ' ' || i FROM generate_series(p_lo, p_hi) i)
$$;
-- Fingerprint of the DATA in every table this feature touches (so "nothing changed" can be proved)
CREATE FUNCTION t.snap() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r text; h text;
BEGIN
  FOREACH r IN ARRAY ARRAY['user_card_roles','ai_change_log','ai_pending_changes','deck_card_jobs','deck_strategy_points','deck_health_targets','ref_card_roles','deck_cards','decks'] LOOP
    IF to_regclass('public.' || r) IS NOT NULL THEN
      EXECUTE format('SELECT COALESCE(md5(string_agg(to_jsonb(x)::text, %L ORDER BY to_jsonb(x)::text)), %L) FROM public.%I x', '|', '', r) INTO h; v := v || h;
    END IF;
  END LOOP;
  RETURN md5(v);
END $$;
CREATE FUNCTION t.expire(p_group uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN SET LOCAL session_replication_role = replica; UPDATE public.ai_change_log SET undoable_until = now() - interval '1 minute' WHERE group_id = p_group; END $$;
