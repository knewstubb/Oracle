import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) process.exit(1);

const supabase = createClient(url, key);

async function check() {
  // Sample physical_copy
  const { data: samplePC } = await supabase.from('physical_copies').select('*').limit(2);
  console.log('Sample physical_copy:', JSON.stringify(samplePC?.[0], null, 2));
  
  // deck_cards structure check
  const { data: dcSample, error: dcErr } = await supabase.from('deck_cards').select('*').limit(1);
  console.log('\ndeck_cards sample:', dcSample);
  console.log('deck_cards error:', dcErr?.message);
  
  // Check card_definitions sample
  const { data: cdSample } = await supabase.from('card_definitions').select('*').limit(1);
  console.log('\ncard_definitions sample:', JSON.stringify(cdSample?.[0], null, 2));
}
check().catch(e => console.error('Fatal:', e));
