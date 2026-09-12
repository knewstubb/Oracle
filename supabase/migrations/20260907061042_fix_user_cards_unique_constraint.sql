-- Drop the existing single-column unique constraint on oracle_id
-- (oracle_id should not be unique alone - same card can be owned by multiple users)
ALTER TABLE public.user_cards DROP CONSTRAINT IF EXISTS user_cards_oracle_id_key;

-- Create the correct compound unique constraint on (oracle_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS user_cards_oracle_id_user_id_key 
  ON public.user_cards(oracle_id, user_id);;
