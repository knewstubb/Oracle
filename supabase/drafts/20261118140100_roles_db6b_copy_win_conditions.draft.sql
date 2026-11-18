-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: deck strategy store, DB-6b: the one-time copy of each deck's written win condition into a Win condition item marked "Set by you". Author: Architect, 2026-11-18.
-- Contract: docs/oracle/contracts/deck-strategy.md (3.2a, 14.6). Test: docs/oracle/reports/evidence/roles-db/test_db6.sh
-- Depends on: DB-6 (20261118140000).
--
-- INSERT ONLY. It never updates or deletes anything and never changes deck_strategy.win_condition (the old text stays exactly as it is, as an archive).
--   * Copies a text only when it is not blank after trimming and has at most 300 characters after trimming. A longer text is left alone (nothing is cut) and counted as skipped.
--   * Multi-line text is copied as one item (no guessing where to split).
--   * A deck that already has the same sentence as a Win condition is skipped (the sentence index), so running it twice makes no second copy.
--   * A deck that already has 3 live Win conditions or 7 live items is skipped (the limits), counted as skipped_full.
--   * Every row it makes carries the reason 'Copied from your written win condition.' so the rollback can find exactly these rows.
-- The notice at the end says how many decks were copied and how many were skipped.
-- Reversible: supabase/drafts/20261118140100_roles_db6b_copy_win_conditions.rollback.sql
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.deck_strategy_items') IS NULL THEN RAISE EXCEPTION 'apply roles_db6 first'; END IF;
END $$;
DO $$
DECLARE v_copied integer; v_long integer; v_full integer; v_blank integer; v_dup integer;
BEGIN
  SELECT count(*) INTO v_long FROM public.deck_strategy s JOIN public.decks d ON d.id = s.deck_id AND d.user_id = s.user_id
   WHERE btrim(COALESCE(s.win_condition, '')) <> '' AND char_length(btrim(s.win_condition)) > 300;
  SELECT count(*) INTO v_blank FROM public.deck_strategy s WHERE btrim(COALESCE(s.win_condition, '')) = '';
  SELECT count(*) INTO v_full FROM public.deck_strategy s JOIN public.decks d ON d.id = s.deck_id AND d.user_id = s.user_id
   WHERE btrim(COALESCE(s.win_condition, '')) <> '' AND char_length(btrim(s.win_condition)) <= 300
     AND (   (SELECT count(*) FROM public.deck_strategy_items i WHERE i.user_id = s.user_id AND i.deck_id = s.deck_id AND i.kind = 'win_condition' AND i.state <> 'dismissed' AND i.replaces_item_id IS NULL) >= 3
          OR (SELECT count(*) FROM public.deck_strategy_items i WHERE i.user_id = s.user_id AND i.deck_id = s.deck_id AND i.state <> 'dismissed' AND i.replaces_item_id IS NULL) >= 7);
  WITH ins AS (
    INSERT INTO public.deck_strategy_items (user_id, deck_id, kind, statement, reason, proposer, state)
    SELECT s.user_id, s.deck_id, 'win_condition', btrim(s.win_condition), 'Copied from your written win condition.', 'owner', 'accepted'
      FROM public.deck_strategy s JOIN public.decks d ON d.id = s.deck_id AND d.user_id = s.user_id
     WHERE btrim(COALESCE(s.win_condition, '')) <> '' AND char_length(btrim(s.win_condition)) <= 300
       AND (SELECT count(*) FROM public.deck_strategy_items i WHERE i.user_id = s.user_id AND i.deck_id = s.deck_id AND i.kind = 'win_condition' AND i.state <> 'dismissed' AND i.replaces_item_id IS NULL) < 3
       AND (SELECT count(*) FROM public.deck_strategy_items i WHERE i.user_id = s.user_id AND i.deck_id = s.deck_id AND i.state <> 'dismissed' AND i.replaces_item_id IS NULL) < 7
    ON CONFLICT DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_copied FROM ins;
  RAISE NOTICE 'win condition copy: % decks copied, % skipped as too long (over 300 characters), % skipped because the deck is full, % have no written win condition',
    v_copied, v_long, v_full, v_blank;
END $$;
COMMIT;
