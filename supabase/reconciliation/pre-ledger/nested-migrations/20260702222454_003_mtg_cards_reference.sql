CREATE TABLE mtg_cards (
  name TEXT NOT NULL,
  type_line TEXT NOT NULL,
  color_identity TEXT NOT NULL DEFAULT '',
  mana_cost TEXT DEFAULT '',
  mana_value REAL DEFAULT 0,
  oracle_text TEXT DEFAULT '',
  power TEXT,
  toughness TEXT,
  edhrec_rank INTEGER,
  commander_legal BOOLEAN NOT NULL DEFAULT FALSE,
  is_legendary BOOLEAN NOT NULL DEFAULT FALSE,
  is_creature BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (name)
);
CREATE INDEX idx_mtg_cards_commander ON mtg_cards(is_legendary, is_creature, commander_legal) WHERE is_legendary = TRUE AND is_creature = TRUE AND commander_legal = TRUE;
CREATE INDEX idx_mtg_cards_color_identity ON mtg_cards(color_identity);
CREATE INDEX idx_mtg_cards_edhrec_rank ON mtg_cards(edhrec_rank) WHERE edhrec_rank IS NOT NULL;;
