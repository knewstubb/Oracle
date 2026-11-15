-- Undo for 20261116130100_oauth_client_tokens_no_writes (drops the 66 restrictive policies).
BEGIN;
DO $$ DECLARE t text; tables text[] := ARRAY[
    'decks','deck_cards','user_cards','user_copies','deck_notes','deck_versions','deck_combos','deck_documentation',
    'deck_health','deck_mana_analysis','deck_overview_content','deck_priority','deck_ratings','deck_strategy',
    'deck_upgrades','brew_sessions','debrief_actions','debrief_sessions','import_sleeve_claims','precon_mod_state',
    'sync_runs','upgrade_change_log']; BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_oauth_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_oauth_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_oauth_delete', t);
  END LOOP; END $$;
COMMIT;
