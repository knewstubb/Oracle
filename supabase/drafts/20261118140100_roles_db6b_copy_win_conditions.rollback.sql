-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261118140100_roles_db6b_copy_win_conditions.draft.sql (DB-6b). Deletes only the rows the copy made: owner Win condition items whose reason is exactly
-- 'Copied from your written win condition.' (an item the owner edited loses that reason, so it is kept). Refuses if one of those rows was changed since
-- (updated_at differs from created_at) or if a card link points at one. deck_strategy.win_condition was never touched, so nothing is restored.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.deck_strategy_items') IS NULL THEN RAISE EXCEPTION 'roles_db6 is not applied'; END IF;
  IF EXISTS (SELECT 1 FROM public.deck_strategy_items WHERE kind = 'win_condition' AND proposer = 'owner' AND reason = 'Copied from your written win condition.' AND updated_at <> created_at) THEN
    RAISE EXCEPTION 'cannot roll back: a copied win condition was changed since the copy';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deck_job_serves l JOIN public.deck_strategy_items i ON i.id = l.serves_item_id
              WHERE i.kind = 'win_condition' AND i.proposer = 'owner' AND i.reason = 'Copied from your written win condition.') THEN
    RAISE EXCEPTION 'cannot roll back: a card link points at a copied win condition';
  END IF;
END $$;
DELETE FROM public.deck_strategy_items WHERE kind = 'win_condition' AND proposer = 'owner' AND state = 'accepted' AND reason = 'Copied from your written win condition.' AND updated_at = created_at;
COMMIT;
