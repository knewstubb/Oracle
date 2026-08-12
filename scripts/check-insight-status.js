const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  // Get all commanders with insights and their format status
  const { data } = await supabase
    .from('ref_commander_insights')
    .select('commander_id, archetype, taxonomy_tags');
    
  // Group by commander
  const byCommander = {};
  data.forEach(i => {
    if (!byCommander[i.commander_id]) {
      byCommander[i.commander_id] = { total: 0, withArchetype: 0, withTaxonomy: 0 };
    }
    byCommander[i.commander_id].total++;
    if (i.archetype) byCommander[i.commander_id].withArchetype++;
    if (i.taxonomy_tags && i.taxonomy_tags.length > 0) byCommander[i.commander_id].withTaxonomy++;
  });
  
  // Get commander names
  const commanderIds = Object.keys(byCommander);
  const { data: commanders } = await supabase
    .from('ref_commanders')
    .select('id, display_name')
    .in('id', commanderIds);
  
  const nameMap = {};
  commanders.forEach(c => nameMap[c.id] = c.display_name);
  
  // Output status
  console.log('Commander Insight Status:');
  console.log('========================');
  Object.entries(byCommander).forEach(([id, stats]) => {
    const name = nameMap[id] || id;
    const status = stats.withTaxonomy === stats.total ? '🟢' : 
                   stats.withArchetype > 0 ? '🟡' : '🔴';
    console.log(`${status} ${name}: ${stats.total} insights (${stats.withArchetype} with archetype, ${stats.withTaxonomy} with taxonomy)`);
  });
}

main();
