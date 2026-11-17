-- NOT APPLIED to live. Needs owner approval. Task: fix-deck-delete-ai-log.
-- Bug: deleting a deck that Claude edited failed with "ai_change_log_is_append_only". The foreign keys
-- ai_change_log.deck_id / other_deck_id are ON DELETE SET NULL; that automatic update tripped the append-only guard.
-- Fix: the guard now also lets deck_id / other_deck_id become NULL, but only when the deck they point to no longer exists.
-- Every other column stays frozen (only undone_at / undone_by may change, as before). No data is changed by this file.
-- ai_pending_changes has no guard and its SET NULL keys already work. Reversible: re-run the function body from
-- 20261116150000_ai_change_log_and_pending.sql.
BEGIN;
CREATE OR REPLACE FUNCTION public._ai_change_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW) - 'undone_at' - 'undone_by';
  v_old jsonb := to_jsonb(OLD) - 'undone_at' - 'undone_by';
  v_deck_cleared boolean := false;
BEGIN
  -- A deck reference may be emptied when its deck has been deleted (the foreign key's SET NULL). Nothing else.
  IF OLD.deck_id IS NOT NULL AND NEW.deck_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.decks d WHERE d.id = OLD.deck_id) THEN
    v_new := v_new - 'deck_id';
    v_old := v_old - 'deck_id';
    v_deck_cleared := true;
  END IF;
  IF OLD.other_deck_id IS NOT NULL AND NEW.other_deck_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.decks d WHERE d.id = OLD.other_deck_id) THEN
    v_new := v_new - 'other_deck_id';
    v_old := v_old - 'other_deck_id';
    v_deck_cleared := true;
  END IF;
  IF v_new IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'ai_change_log_is_append_only' USING ERRCODE = 'P0001';
  END IF;
  -- A deck delete may clear the reference on a row that was already undone; the undo fields must not change then.
  IF v_deck_cleared AND (NEW.undone_at, NEW.undone_by) IS NOT DISTINCT FROM (OLD.undone_at, OLD.undone_by) THEN
    RETURN NEW;
  END IF;
  IF OLD.undone_at IS NOT NULL THEN
    RAISE EXCEPTION 'ai_change_log_already_undone' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._ai_change_log_guard() FROM PUBLIC, anon, authenticated;
COMMIT;
