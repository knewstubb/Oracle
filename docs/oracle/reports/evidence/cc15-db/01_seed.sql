-- Two users, one active connection each, one revoked connection for user 1, one plain deck each. Throwaway data only.
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
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
DECLARE v jsonb;
BEGIN EXECUTE q INTO v; RETURN jsonb_build_object('ok', true, 'res', v);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'err', SQLERRM);
END $$;
CREATE FUNCTION t.u1() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION t.u2() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT '00000000-0000-0000-0000-000000000002'::uuid $$;
CREATE FUNCTION t.c1() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'c1000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION t.c1_off() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'c1000000-0000-0000-0000-0000000000f1'::uuid $$;
CREATE FUNCTION t.c2() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'c2000000-0000-0000-0000-000000000002'::uuid $$;
GRANT USAGE ON SCHEMA t TO authenticated; GRANT SELECT ON t.res TO authenticated;
