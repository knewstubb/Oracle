-- DRAFT. NOT APPLIED. ROLLBACK for 20261118130000_cc25_trade_locations.draft.sql (CC-25).
-- Refuses while any place is marked Trade, unless the session first runs:  SET oracle.rollback_allow_data_loss = 'yes';
-- (dropping the column forgets which places were marked). Otherwise it restores the exact previous state.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_locations' AND column_name = 'is_trade') THEN
    RAISE EXCEPTION 'cc25 is not applied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_locations WHERE is_trade) AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: some places are marked Trade (set oracle.rollback_allow_data_loss = ''yes'' in this session to forget them)';
  END IF;
END $$;
ALTER TABLE public.user_locations DROP CONSTRAINT user_locations_trade_only_storage;
ALTER TABLE public.user_locations DROP COLUMN is_trade;
COMMIT;
