import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Get all commanders with deck counts in batches
  let allCommanders: Array<{ display_name: string; edhrec_deck_count: number }> = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data } = await supabase
      .from('ref_commanders')
      .select('display_name, edhrec_deck_count')
      .gt('edhrec_deck_count', 0)
      .order('edhrec_deck_count', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (!data || data.length === 0) break;
    allCommanders = allCommanders.concat(data);
    offset += limit;
    if (data.length < limit) break;
  }
  
  console.log('Total commanders with decks:', allCommanders.length);
  console.log('');
  console.log('Thresholds:');
  console.log(`  Top 1000: ${allCommanders[999]?.display_name} - ${allCommanders[999]?.edhrec_deck_count} decks`);
  console.log(`  Top 1500: ${allCommanders[1499]?.display_name} - ${allCommanders[1499]?.edhrec_deck_count} decks`);
  console.log(`  Top 2000: ${allCommanders[1999]?.display_name} - ${allCommanders[1999]?.edhrec_deck_count} decks`);
  console.log(`  Top 2500: ${allCommanders[2499]?.display_name} - ${allCommanders[2499]?.edhrec_deck_count} decks`);
}

check();
