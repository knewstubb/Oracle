-- Drop the legacy single-column unique constraint on oracle_id
-- (allows same card to be owned by multiple users)
ALTER TABLE public.user_cards DROP CONSTRAINT card_definitions_oracle_id_key;;
