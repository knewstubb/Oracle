/**
 * Check if ref_precons table exists and provide migration SQL
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Checking if ref_precons table exists...');

  const { error } = await supabase.from('ref_precons').select('id').limit(1);
  
  if (error?.code === 'PGRST205') {
    console.log('');
    console.log('Table does not exist. Please run this SQL in Supabase Dashboard SQL Editor:');
    console.log('');
    console.log('='.repeat(70));
    console.log(`
-- Enable trigram extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create table
CREATE TABLE ref_precons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  set_code TEXT NOT NULL,
  set_name TEXT NOT NULL,
  commander_name TEXT,
  commander_scryfall_id UUID,
  color_identity TEXT,
  release_date DATE,
  card_count INTEGER DEFAULT 100,
  archidekt_url TEXT,
  moxfield_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(set_code, name)
);

-- Indexes
CREATE INDEX idx_ref_precons_name ON ref_precons USING gin (name gin_trgm_ops);
CREATE INDEX idx_ref_precons_set_code ON ref_precons(set_code);
CREATE INDEX idx_ref_precons_release_date ON ref_precons(release_date DESC);
CREATE INDEX idx_ref_precons_color_identity ON ref_precons(color_identity);

-- RLS
ALTER TABLE ref_precons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ref_precons_read_authenticated" ON ref_precons FOR SELECT TO authenticated USING (true);
`);
    console.log('='.repeat(70));
    console.log('');
    console.log('After running the SQL, run: npx tsx scripts/sync-precons.ts');
  } else if (error) {
    console.log('Error checking table:', error);
  } else {
    console.log('Table exists! Run: npx tsx scripts/sync-precons.ts');
  }
}

main();
