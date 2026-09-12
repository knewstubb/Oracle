-- User preferences for brewing/deck building
-- Stores playgroup context, playstyle preferences, and house rules

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Playgroup context
  bracket_min INTEGER DEFAULT 3 CHECK (bracket_min >= 1 AND bracket_min <= 4),
  bracket_max INTEGER DEFAULT 4 CHECK (bracket_max >= 1 AND bracket_max <= 4),
  playgroup_description TEXT,  -- e.g. "Casual kitchen table with friends"
  
  -- House rules (what to avoid)
  no_infinite_combos BOOLEAN DEFAULT FALSE,
  no_stax BOOLEAN DEFAULT FALSE,
  no_mld BOOLEAN DEFAULT FALSE,  -- mass land destruction
  no_extra_turns BOOLEAN DEFAULT FALSE,
  custom_house_rules TEXT[],  -- additional house rules as array
  
  -- Playstyle preferences
  preferred_archetypes TEXT[],  -- e.g. ['engine', 'aristocrats', 'tokens']
  disliked_archetypes TEXT[],   -- e.g. ['stax', 'combo', 'control']
  playstyle_notes TEXT,         -- freeform description
  
  -- Budget preferences
  budget_mode TEXT DEFAULT 'flexible' CHECK (budget_mode IN ('budget', 'flexible', 'no_limit')),
  max_card_price NUMERIC(10,2),  -- max price for a single card
  prefer_owned_cards BOOLEAN DEFAULT TRUE,
  
  -- Collection context (optional display info)
  collection_size INTEGER,  -- approximate number of cards owned
  favourite_decks TEXT[],   -- names of favourite existing decks
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to get or create default preferences
CREATE OR REPLACE FUNCTION get_or_create_user_preferences(p_user_id UUID)
RETURNS user_preferences
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prefs user_preferences;
BEGIN
  SELECT * INTO prefs FROM user_preferences WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO user_preferences (user_id)
    VALUES (p_user_id)
    RETURNING * INTO prefs;
  END IF;
  
  RETURN prefs;
END;
$$;
