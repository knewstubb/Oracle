-- DRAFT FOR OWNER APPROVAL. NOT APPLIED. Do not run until the owner approves.
-- Contract: docs/oracle/contracts/data-separation.md (section 4). Task CC-03a, Gate 4 slice 1.
-- Rollback: supabase/drafts/20261116100100_revoke_anon_user_data_rpcs.rollback.sql (reversible).
-- Independent of 20261116100000 (either order works); apply both before any connector goes online.
--
-- What it does: only service_role (the server) may run the 50 user-data functions listed below. Today the anonymous
-- role (the public site key shipped to every browser) can run all 50, 13 of them are also open to PUBLIC and 18 to
-- signed-in users, and several are destructive and trust a caller-supplied p_user_id (delete_deck_with_release,
-- replace_collection, ...). Live catalog read 2026-11-16.
--
-- Why the app keeps working: every .rpc() call in src/ goes through createAdminClient() (service_role)
-- [Confirmed: contract section 2]. service_role is explicitly re-granted below.
--
-- Not touched: confirm_chat_card_proposals, undo_chat_card_proposals, import_deck_with_intent,
-- import_deck_with_intent_roles, set_deck_command_zone (already service_role only) and the trigger function
-- validate_deck_card_copy_identity (triggers do not need EXECUTE for callers).

BEGIN;

DO $$
DECLARE
  f text;
  fns text[] := ARRAY[
    '_default_storage_location_id(uuid)',
    '_ensure_default_storage_location_id(uuid)',
    '_insert_user_copy_rows_with_ids(uuid,jsonb,integer)',
    '_insert_user_copy_rows(uuid,jsonb,integer)',
    '_move_copy_to_slot(integer,integer,uuid,boolean,text)',
    'add_proxies_to_slots(uuid,jsonb,text)',
    'add_proxy_to_slot(integer,integer,uuid,text)',
    'apply_ai_deck_delta(integer,uuid,jsonb,integer[])',
    'apply_collection_sync(uuid,integer[],jsonb)',
    'apply_deck_cards_diff(integer,uuid,integer[],jsonb)',
    'archive_old_oracle_sessions(uuid,integer,integer)',
    'assign_free_copy(integer,integer,text,uuid,text)',
    'assign_physical_copy(integer,integer,uuid,text)',
    'batch_assign_deck(integer,uuid,jsonb)',
    'create_deck_version(integer,uuid,text,text,text)',
    'delete_deck_with_release(integer,uuid)',
    'delete_storage_location(integer,uuid)',
    'delete_user_copies(integer[],uuid)',
    'delete_user_copy(integer,uuid)',
    'finalize_import_claims(uuid,text)',
    'finalize_import_claims(uuid,uuid)',
    'force_claim_copy(integer,integer,uuid,text)',
    'get_active_oracle_session(uuid,text,integer,integer)',
    'get_collection_rollup(uuid)',
    'get_deck_conflict_counts(uuid)',
    'get_import_allocations(uuid,uuid)',
    'get_import_conflicts(uuid)',
    'get_import_reconciliation(uuid,uuid,boolean)',
    'get_shared_cards(uuid)',
    'insert_user_copies(uuid,jsonb)',
    'mark_copy_missing(integer,uuid)',
    'move_copies_to_storage(integer[],integer,uuid)',
    'move_copy_to_storage(integer,integer,uuid)',
    'reassign_to_deck(integer,integer,text,uuid,text)',
    'reconcile_built_deck(integer,uuid,jsonb)',
    'release_deck_copies(integer,uuid)',
    'remove_deck_card_with_release(integer,integer,uuid)',
    'replace_collection(uuid,jsonb)',
    'replace_deck_with_new_cards(integer,uuid,jsonb)',
    'replace_proxy_with_original(integer,integer,integer,uuid,text)',
    'resolve_import_conflict_proxy(uuid,integer)',
    'resolve_import_conflict_release(uuid,integer)',
    'set_generic_basic_count(integer,uuid,text,integer,text,text,text,text)',
    'set_import_claim_printing(uuid,integer,text)',
    'set_import_claim_resolution(uuid,integer,text)',
    'set_import_claim_state(uuid,integer,text)',
    'set_import_claim_wishlist(uuid,integer,boolean)',
    'unassign_copy_to_storage(integer,uuid)',
    'undo_copy_move(integer,integer,integer,uuid,text)',
    'unmark_copy_missing(integer,uuid)'
  ];
BEGIN
  FOREACH f IN ARRAY fns LOOP
    -- to_regprocedure returns NULL (not an error) if a signature has drifted; fail loudly instead of skipping silently.
    IF to_regprocedure('public.' || f) IS NULL THEN
      RAISE EXCEPTION 'function public.% not found; catalog changed since the draft, re-run the catalog query', f;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- Stop the recurring gap: Supabase grants EXECUTE on every new function to anon/PUBLIC by default, which is why
-- 20261113130000 had to patch the chat functions after the fact. New functions created by postgres in public are now
-- service_role-only unless a migration grants more. (service_role/postgres defaults are left as they are.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
