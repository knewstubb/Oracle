-- Deck Leadership: supports single commanders, partners, backgrounds, oathbreaker
CREATE TABLE deck_leaderships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  color_identity TEXT NOT NULL,
  leadership_type TEXT NOT NULL CHECK (leadership_type IN ('single','partner','partner_with','friends_forever','background','background_flex','oathbreaker')),
  legal_commander BOOLEAN DEFAULT TRUE,
  legal_oathbreaker BOOLEAN DEFAULT FALSE,
  legal_brawl BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up by canonical key
CREATE INDEX idx_deck_leaderships_canonical_key ON deck_leaderships(canonical_key);
CREATE INDEX idx_deck_leaderships_type ON deck_leaderships(leadership_type);

-- Cards that make up each leadership configuration
CREATE TABLE deck_leadership_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leadership_id UUID NOT NULL REFERENCES deck_leaderships(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  card_role TEXT NOT NULL CHECK (card_role IN ('commander','partner','background','background_any','signature_spell','oathbreaker')),
  position INT NOT NULL DEFAULT 1,
  is_flexible BOOLEAN DEFAULT FALSE,
  UNIQUE(leadership_id, card_name),
  UNIQUE(leadership_id, position)
);

CREATE INDEX idx_leadership_cards_name ON deck_leadership_cards(card_name);
CREATE INDEX idx_leadership_cards_leadership ON deck_leadership_cards(leadership_id);

COMMENT ON TABLE deck_leaderships IS 'Command zone configurations supporting single commanders, partner pairs, backgrounds, and oathbreaker';
COMMENT ON COLUMN deck_leaderships.canonical_key IS 'Alphabetically sorted key, e.g. thrasios-triton-hero//tymna-the-weaver or commander+background';
COMMENT ON COLUMN deck_leaderships.leadership_type IS 'single=traditional, partner=Partner keyword, partner_with=Partner With X, friends_forever=Doctor Who partners, background=Choose a Background, background_flex=X + any background, oathbreaker=planeswalker + signature spell';
COMMENT ON COLUMN deck_leadership_cards.card_role IS 'commander=main/single, partner=Partner keyword, background=specific background, background_any=flexible slot, signature_spell=oathbreaker instant/sorcery, oathbreaker=the planeswalker';
COMMENT ON COLUMN deck_leadership_cards.is_flexible IS 'True for background_any slots where any valid background can fill';;
