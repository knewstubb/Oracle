ALTER TABLE oracle_to_printings ADD COLUMN IF NOT EXISTS card_name TEXT;
ALTER TABLE oracle_to_printings ADD COLUMN IF NOT EXISTS set_code TEXT;
ALTER TABLE oracle_to_printings ADD COLUMN IF NOT EXISTS collector_number TEXT;
CREATE INDEX IF NOT EXISTS idx_oracle_to_printings_card_name ON oracle_to_printings(card_name);
CREATE INDEX IF NOT EXISTS idx_oracle_to_printings_set_collector ON oracle_to_printings(set_code, collector_number);;
