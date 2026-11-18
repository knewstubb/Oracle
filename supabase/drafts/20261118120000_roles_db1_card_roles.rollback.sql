-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261118120000_roles_db1_card_roles.draft.sql (DB-1). Roll back DB-4, DB-3 and DB-2 FIRST (they use these tables and functions).
-- Drops: the two role tables and the five functions. Removes nothing else.
-- Refuses while either table holds rows (the owner's labels), unless the session first runs:  SET oracle.rollback_allow_data_loss = 'yes';
-- (a data-losing rollback is then the owner's explicit choice, in the same session). It never touches ai_change_log.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.user_card_roles') IS NULL THEN RAISE EXCEPTION 'roles_db1 is not applied'; END IF;
  IF to_regprocedure('public._ai_limits_roles()') IS NOT NULL THEN RAISE EXCEPTION 'roll back roles_db2 first'; END IF;
  IF to_regclass('public.deck_card_jobs') IS NOT NULL OR to_regclass('public.deck_strategy_points') IS NOT NULL THEN
    RAISE EXCEPTION 'roll back roles_db3 and roles_db4 first';
  END IF;
  IF (EXISTS (SELECT 1 FROM public.user_card_roles) OR EXISTS (SELECT 1 FROM public.ref_card_roles))
     AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: the role tables hold rows (set oracle.rollback_allow_data_loss = ''yes'' in this session to delete them)';
  END IF;
END $$;
DROP FUNCTION public.owner_set_card_role(uuid, uuid, text, text);
DROP FUNCTION public.get_effective_card_roles(uuid, uuid[]);
DROP FUNCTION public._slot_oracle_id(uuid, integer, integer);
DROP FUNCTION public.deck_slot_oracle_ids(uuid, integer);
DROP FUNCTION public._roles_fail(text, jsonb);
DROP TABLE public.user_card_roles;
DROP TABLE public.ref_card_roles;
COMMIT;
