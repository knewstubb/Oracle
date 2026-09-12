ALTER TABLE decks DROP CONSTRAINT decks_status_check;
ALTER TABLE decks ADD CONSTRAINT decks_status_check CHECK (status = ANY (ARRAY['active'::text, 'draft'::text, 'concept'::text, 'inactive'::text]));;
