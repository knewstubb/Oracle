import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function count() {
  const { count: buildCount } = await supabase
    .from('ref_commander_builds')
    .select('id', { count: 'exact', head: true });
  
  const { count: cardCount } = await supabase
    .from('ref_build_cards')
    .select('id', { count: 'exact', head: true });
  
  // Get ALL commander_ids (pagination)
  let allIds: string[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('ref_commander_builds')
      .select('commander_id')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allIds = allIds.concat(data.map(d => d.commander_id));
    offset += 1000;
  }
  
  const uniqueIds = new Set(allIds);
  
  console.log('=== DATABASE COUNTS ===');
  console.log('Builds:', buildCount);
  console.log('Build cards:', cardCount);
  console.log('Unique commanders:', uniqueIds.size);
}

count();
