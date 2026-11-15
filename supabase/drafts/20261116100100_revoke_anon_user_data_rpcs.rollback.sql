-- ROLLBACK for 20261116100100_revoke_anon_user_data_rpcs.sql. DRAFT, NOT APPLIED. Needs owner approval to run.
-- Running this RE-OPENS destructive functions to anyone holding the public site key.
-- Restores EXECUTE exactly as read from the live catalog on 2026-11-16, in three groups.

BEGIN;

DO $$
DECLARE f text;
BEGIN
  -- Group 1: anon + service_role only (no PUBLIC, no authenticated). 32 functions.
  FOREACH f IN ARRAY ARRAY[
    '_default_storage_location_id(uuid)','_ensure_default_storage_location_id(uuid)',
    '_insert_user_copy_rows_with_ids(uuid,jsonb,integer)','_insert_user_copy_rows(uuid,jsonb,integer)',
    '_move_copy_to_slot(integer,integer,uuid,boolean,text)','add_proxies_to_slots(uuid,jsonb,text)',
    'add_proxy_to_slot(integer,integer,uuid,text)','apply_ai_deck_delta(integer,uuid,jsonb,integer[])',
    'apply_collection_sync(uuid,integer[],jsonb)','apply_deck_cards_diff(integer,uuid,integer[],jsonb)',
    'assign_free_copy(integer,integer,text,uuid,text)','assign_physical_copy(integer,integer,uuid,text)',
    'batch_assign_deck(integer,uuid,jsonb)','delete_deck_with_release(integer,uuid)',
    'delete_storage_location(integer,uuid)','delete_user_copies(integer[],uuid)','delete_user_copy(integer,uuid)',
    'force_claim_copy(integer,integer,uuid,text)','insert_user_copies(uuid,jsonb)','mark_copy_missing(integer,uuid)',
    'move_copies_to_storage(integer[],integer,uuid)','move_copy_to_storage(integer,integer,uuid)',
    'reassign_to_deck(integer,integer,text,uuid,text)','reconcile_built_deck(integer,uuid,jsonb)',
    'release_deck_copies(integer,uuid)','remove_deck_card_with_release(integer,integer,uuid)',
    'replace_collection(uuid,jsonb)','replace_deck_with_new_cards(integer,uuid,jsonb)',
    'replace_proxy_with_original(integer,integer,integer,uuid,text)','unassign_copy_to_storage(integer,uuid)',
    'undo_copy_move(integer,integer,integer,uuid,text)','unmark_copy_missing(integer,uuid)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon', f);
  END LOOP;

  -- Group 2: anon + authenticated + service_role (no PUBLIC). 5 functions.
  FOREACH f IN ARRAY ARRAY[
    'get_import_reconciliation(uuid,uuid,boolean)',
    'set_generic_basic_count(integer,uuid,text,integer,text,text,text,text)',
    'set_import_claim_printing(uuid,integer,text)','set_import_claim_state(uuid,integer,text)',
    'set_import_claim_wishlist(uuid,integer,boolean)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;

  -- Group 3: PUBLIC + anon + authenticated + service_role. 13 functions.
  FOREACH f IN ARRAY ARRAY[
    'archive_old_oracle_sessions(uuid,integer,integer)','create_deck_version(integer,uuid,text,text,text)',
    'finalize_import_claims(uuid,text)','finalize_import_claims(uuid,uuid)',
    'get_active_oracle_session(uuid,text,integer,integer)','get_collection_rollup(uuid)',
    'get_deck_conflict_counts(uuid)','get_import_allocations(uuid,uuid)','get_import_conflicts(uuid)',
    'get_shared_cards(uuid)','resolve_import_conflict_proxy(uuid,integer)',
    'resolve_import_conflict_release(uuid,integer)','set_import_claim_resolution(uuid,integer,text)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated;

COMMIT;
