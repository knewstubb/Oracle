import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== TAXONOMY BREAKDOWN ===\n');
  
  // Get all taxonomy entries (paginated)
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('ref_commander_taxonomy')
      .select('taxonomy_slug, relevance')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) {
      console.error('Error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    
    allData = allData.concat(data);
    page++;
    if (data.length < pageSize) break;
  }
  
  console.log(`Total taxonomy entries: ${allData.length.toLocaleString()}\n`);
  
  // Group by slug
  const slugCounts: Map<string, number> = new Map();
  allData.forEach(t => {
    slugCounts.set(t.taxonomy_slug, (slugCounts.get(t.taxonomy_slug) || 0) + 1);
  });
  
  const sorted = [...slugCounts.entries()].sort((a, b) => b[1] - a[1]);
  
  console.log('TOP TAXONOMY SLUGS (by commander count):');
  sorted.slice(0, 30).forEach(([name, count]) => console.log(`  ${name}: ${count} commanders`));
  
  console.log('\nTOTAL UNIQUE SLUGS:', slugCounts.size);
}

main().catch(console.error);
