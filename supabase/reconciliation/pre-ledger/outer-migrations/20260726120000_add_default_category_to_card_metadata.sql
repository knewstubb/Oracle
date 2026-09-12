-- Migration: Add default_category to card_metadata (global reference table)
-- 
-- Adds a JSONB column to store the default functional category for a card.
-- Structure: { "primary": "Ramp", "secondary": ["Utility"], "confidence": "high", "notes": "..." }
--
-- This is a global reference — all users share the same defaults.
-- deck_cards.categories can still override per-deck.
--
-- The column is nullable; NULL means "derive from type line at display time" (backwards compatible).

ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS default_category JSONB;

COMMENT ON COLUMN card_metadata.default_category IS 
  'Default functional category for this card as JSONB: {primary, secondary[], confidence, notes}. Global reference used as fallback when adding to decks. NULL = derive from type_line.';
