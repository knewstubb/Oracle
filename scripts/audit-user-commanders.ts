/**
 * Audit user's commanders for EDHREC data completeness
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COMMANDER_SEARCH_TERMS = [
  'Ghen', 'Yedora', 'Wilhelt', 'Auntie', 'Hearthhull', 'Urza', 
  'Mendicant', 'Rocco', 'Norin', 'Anikthea', 'Talrand', 
  'Ruric Thar', 'Sephiroth', 'Zurgo', 'Pantlaza', 'Hakbal', 'Ureni', 'First Sliver'
];

async function main() {
  console.log('=== Auditing User Commander Data ===\n');
  
  const foundCommanders: string[] = [];
  
  for (const term of COMMANDER_SEARCH_TERMS) {
    const { data: cmds } = await supabase
      .from('ref_commanders')
      .select('id, display_name, canonical_key, color_identity, edhrec_rank, last_synced_at')
      .ilike('display_name', `%${term}%`)
      .limit(3);
    
    if (!cmds || cmds.length === 0) {
      console.log(`❌ ${term} - NOT FOUND in ref_commanders`);
      continue;
    }
    
    for (const cmd of cmds) {
      const { count: insights } = await supabase
        .from('ref_commander_insights')
        .select('id', { count: 'exact', head: true })
        .eq('commander_id', cmd.id);
      
      const { count: builds } = await supabase
        .from('ref_commander_builds')
        .select('id', { count: 'exact', head: true })
        .eq('commander_id', cmd.id);
      
      const { count: taxonomy } = await supabase
        .from('ref_commander_taxonomy')
        .select('id', { count: 'exact', head: true })
        .eq('commander_id', cmd.id);
      
      const { count: cards } = await supabase
        .from('ref_commander_cards')
        .select('id', { count: 'exact', head: true })
        .eq('commander_id', cmd.id);
      
      const syncAge = cmd.last_synced_at 
        ? Math.round((Date.now() - new Date(cmd.last_synced_at).getTime()) / (1000*60*60*24))
        : null;
      
      const status = (insights || 0) > 0 ? '✓' : '○';
      console.log(`${status} ${cmd.display_name} [${cmd.color_identity || '?'}]`);
      console.log(`   Rank: #${cmd.edhrec_rank || '?'}`);
      console.log(`   Insights: ${insights || 0} | Builds: ${builds || 0} | Tags: ${taxonomy || 0} | Cards: ${cards || 0}`);
      console.log(`   Last synced: ${syncAge !== null ? `${syncAge} days ago` : 'never'}`);
      console.log(`   Key: ${cmd.canonical_key}`);
      console.log();
      
      foundCommanders.push(cmd.canonical_key);
    }
  }
  
  console.log('\n=== Canonical Keys for Sync ===');
  console.log(foundCommanders.join('\n'));
}

main().catch(console.error);
