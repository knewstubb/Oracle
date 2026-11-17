-- ============ CREATE ============
CREATE FUNCTION t.cd(p_name text, p_fmt text, p_cmd jsonb DEFAULT NULL, p_user uuid DEFAULT t.u1(), p_conn uuid DEFAULT t.c1()) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.att(format('SELECT public.ai_create_deck(%L, %L, %L, %L, %L)', p_user, p_conn, p_name, p_fmt, p_cmd)) $$;
CREATE FUNCTION t.did(p_name text, p_user uuid DEFAULT t.u1()) RETURNS integer LANGUAGE sql AS $$ SELECT id FROM decks WHERE user_id = p_user AND name = p_name $$;
SELECT t.cd('TEST C', 'commander', '{"card_name":"Korvold, Fae-Cursed King","scryfall_id":"sc-korvold","oracle_id":"or-korvold","colour_identity":"BGR"}') AS r \gset b01_
SELECT t.chk('B01 create: success, outcome applied, group id and deck id returned', (:'b01_r'::jsonb->>'ok')::boolean AND :'b01_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'b01_r'::jsonb#>>'{res,group_id}' IS NOT NULL, :'b01_r');
SELECT t.did('TEST C') AS c_id \gset
SELECT t.chk('B01a deck row: not active, format commander, card_count 1, commander + colours stored, owned by user 1',
  (SELECT is_active = false AND format = 'commander' AND card_count = 1 AND commander_name = 'Korvold, Fae-Cursed King' AND commander_scryfall_id = 'sc-korvold' AND colour_identity = 'BGR' AND user_id = t.u1() FROM decks WHERE id = :c_id),
  (SELECT to_jsonb(d)::text FROM decks d WHERE id = :c_id));
SELECT t.chk('B01b exactly one card row: the commander, Planned (no copy), same shape as the manual route (no categories)',
  (SELECT count(*) = 1 AND bool_and(is_commander AND copy_id IS NULL AND categories IS NULL AND quantity = 1 AND scryfall_id = 'sc-korvold' AND command_zone_role IS NULL) FROM deck_cards WHERE deck_id = :c_id),
  (SELECT string_agg(to_jsonb(c)::text, ' ') FROM deck_cards c WHERE deck_id = :c_id));
SELECT t.chk('B01c log row: one deck_create, deck name snapshot, commander slot id, oracle id, not approved-by-owner',
  (SELECT count(*) = 1 AND bool_and(kind = 'deck_create' AND deck_name = 'TEST C' AND deck_id = :c_id AND oracle_id = 'or-korvold' AND deck_card_id = (SELECT id FROM deck_cards WHERE deck_id = :c_id) AND NOT approved_by_owner AND client_name = 'Claude' AND after->>'format' = 'commander') FROM ai_change_log WHERE deck_id = :c_id),
  (SELECT string_agg(to_jsonb(l)::text, ' ') FROM ai_change_log l WHERE deck_id = :c_id));
SELECT t.chk('B01d no strategy row is created by create', NOT EXISTS (SELECT 1 FROM deck_strategy WHERE deck_id = :c_id), '');
SELECT t.cd('X', 'commander') AS r \gset b02_
SELECT t.chk('B02 Commander format without a commander is refused', :'b02_r'::jsonb->>'err' = 'commander_required' AND NOT EXISTS (SELECT 1 FROM decks WHERE name = 'X'), :'b02_r');
SELECT t.cd('test c', 'commander', '{"card_name":"Korvold"}') AS r \gset b03_
SELECT t.chk('B03 duplicate name in different letter case refused', :'b03_r'::jsonb->>'err' = 'deck_name_taken', :'b03_r');
SELECT t.chk('B03b a hand-made deck name is protected the same way', t.cd('MANUAL', 'modern')->>'err' = 'deck_name_taken', '');
SELECT t.chk('B03c the other user may use the same name (names are per user)', (t.cd('TEST C', 'modern', NULL, t.u2(), t.c2())->>'ok')::boolean, '');
SELECT t.cd('TEST M', 'modern') AS r \gset b04_
SELECT t.chk('B04 non-Commander format: no commander needed; empty deck, card_count 0, no card rows',
  (:'b04_r'::jsonb->>'ok')::boolean AND (SELECT card_count = 0 AND commander_name IS NULL FROM decks WHERE name = 'TEST M' AND user_id = t.u1()) AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = t.did('TEST M')), :'b04_r');
SELECT t.chk('B05 blank name, 101-character name, blank format refused',
  t.cd('   ', 'modern')->>'err' = 'bad_deck_name' AND t.cd(repeat('n', 101), 'modern')->>'err' = 'bad_deck_name' AND t.cd('OK name', '  ')->>'err' = 'bad_format'
  AND (t.cd(repeat('n', 100), 'modern')->>'ok')::boolean, '');
SELECT t.cd('  Padded  ', 'modern') AS r \gset b05b_
SELECT t.chk('B05b the name is trimmed', EXISTS (SELECT 1 FROM decks WHERE name = 'Padded' AND user_id = t.u1()), :'b05b_r');
SELECT t.chk('B06 connection switched off: refused, nothing created',
  t.cd('Offline', 'modern', NULL, t.u1(), t.c1_off())->>'err' = 'connection_revoked' AND NOT EXISTS (SELECT 1 FROM decks WHERE name = 'Offline'), '');
SELECT t.chk('B07 another user''s connection id is refused', t.cd('Cross', 'modern', NULL, t.u1(), t.c2())->>'err' = 'connection_revoked' AND NOT EXISTS (SELECT 1 FROM decks WHERE name = 'Cross'), '');
-- 11th deck in an hour (user 2 makes ten, one already made in B03c)
SELECT count(*) AS made FROM (SELECT t.cd('U2 deck ' || g, 'modern', NULL, t.u2(), t.c2()) FROM generate_series(1, 9) g) q;
SELECT t.cd('U2 eleventh', 'modern', NULL, t.u2(), t.c2()) AS r \gset b08_
SELECT t.chk('B08 the 11th deck within an hour is refused', :'b08_r'::jsonb->>'err' = 'too_many_decks_this_hour' AND (SELECT count(*) FROM ai_change_log WHERE user_id = t.u2() AND kind = 'deck_create') = 10, :'b08_r');
-- 26th open empty deck: bring user 1 to exactly 25 open empty decks with old (backdated) fake rows, so the hourly rule is not what refuses
CREATE FUNCTION t.open_empty(p_user uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM ai_change_log l WHERE l.user_id = p_user AND l.kind = 'deck_create' AND l.undone_at IS NULL
     AND EXISTS (SELECT 1 FROM decks d WHERE d.id = l.deck_id AND d.user_id = p_user) AND NOT EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.deck_id = l.deck_id AND NOT COALESCE(dc.is_commander, false)) $$;
SELECT 25 - t.open_empty(t.u1()) AS fake \gset
SET session_replication_role = replica;
INSERT INTO decks (id, name, format, is_active, user_id) SELECT 1000 + g, 'old empty ' || g, 'modern', false, t.u1() FROM generate_series(1, :fake) g;
INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, created_at)
  SELECT t.u1(), gen_random_uuid(), t.c1(), 'Claude', 'deck_create', 1000 + g, 'old empty ' || g, 'x', now() - interval '2 hours' FROM generate_series(1, :fake) g;
SET session_replication_role = origin;
SELECT t.chk('B09-setup user 1 has exactly 25 open empty decks, fewer than 10 made in the last hour', t.open_empty(t.u1()) = 25 AND (SELECT count(*) FROM ai_change_log WHERE user_id = t.u1() AND kind = 'deck_create' AND created_at > now() - interval '1 hour') < 10,
  t.open_empty(t.u1())::text);
SELECT t.cd('One too many', 'modern') AS r \gset b09_
SELECT t.chk('B09 the 26th open empty deck is refused', :'b09_r'::jsonb->>'err' = 'too_many_empty_decks' AND NOT EXISTS (SELECT 1 FROM decks WHERE name = 'One too many'), :'b09_r');
INSERT INTO deck_cards (deck_id, card_name, quantity, user_id) VALUES (1001, 'Sol Ring', 1, t.u1());
SELECT t.cd('Now allowed', 'modern') AS r \gset b09b_
SELECT t.chk('B09b once one of those decks has a card on it, it no longer counts: a new deck is allowed again', (:'b09b_r'::jsonb->>'ok')::boolean AND t.open_empty(t.u1()) = 25, :'b09b_r');
SELECT t.cd('Cap again', 'modern') AS r \gset b09c_
SELECT t.chk('B09c ...and then the cap holds again', :'b09c_r'::jsonb->>'err' = 'too_many_empty_decks', :'b09c_r');
DELETE FROM decks WHERE id = 1002;
SELECT t.cd('After delete', 'modern') AS r \gset b09d_
SELECT t.chk('B09d a deck deleted by hand (works: 20261117120000) keeps its log row with no deck, and frees a slot',
  (SELECT deck_id IS NULL AND deck_name = 'old empty 2' FROM ai_change_log WHERE deck_name = 'old empty 2') AND (:'b09d_r'::jsonb->>'ok')::boolean, :'b09d_r');
-- clean up the fakes and age every deck_create row, so later sections are not limited by the hourly rule
DELETE FROM decks WHERE id > 1000 AND id < 1100;
SET session_replication_role = replica;
UPDATE ai_change_log SET created_at = created_at - interval '2 hours' WHERE kind = 'deck_create';
SET session_replication_role = origin;
-- parallel calls: see the shell step (two sessions, same name, different letter case)
