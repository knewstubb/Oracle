-- ---------------------------------------------------------------------------
-- Oracle Messages — Persistent conversation history for the global Oracle sidebar
-- ---------------------------------------------------------------------------

CREATE TABLE oracle_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- Context at time of message (for reference/debugging)
  context_type TEXT,  -- 'collection', 'deck', 'deck-list', 'forge', 'workbench', 'general'
  context_deck_id INTEGER REFERENCES decks(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching user's conversation history
CREATE INDEX idx_oracle_messages_user_id ON oracle_messages(user_id, created_at DESC);

-- RLS policies
ALTER TABLE oracle_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see their own messages
CREATE POLICY "Users can view own messages"
  ON oracle_messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own messages
CREATE POLICY "Users can insert own messages"
  ON oracle_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own messages (for clearing history)
CREATE POLICY "Users can delete own messages"
  ON oracle_messages FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Oracle Sessions — Track conversation sessions (optional, for analytics)
-- ---------------------------------------------------------------------------

CREATE TABLE oracle_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  
  -- Summary of topics discussed (could be AI-generated)
  summary TEXT
);

CREATE INDEX idx_oracle_sessions_user_id ON oracle_sessions(user_id, last_message_at DESC);

ALTER TABLE oracle_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON oracle_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON oracle_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON oracle_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON oracle_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Add session reference to messages
ALTER TABLE oracle_messages 
  ADD COLUMN session_id UUID REFERENCES oracle_sessions(id) ON DELETE CASCADE;

CREATE INDEX idx_oracle_messages_session_id ON oracle_messages(session_id);
