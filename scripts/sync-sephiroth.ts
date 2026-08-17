/**
 * Sync Sephiroth specifically - his EDHREC slug doesn't match the DB canonical_key
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Syncing Sephiroth, Fabled SOLDIER...');
  
  // Fetch from EDHREC
  const url = 'https://json.edhrec.com/pages/commanders/sephiroth-fabled-soldier.json';
  const res = await fetch(url);
  
  if (!res.ok) {
    console.log('Failed to fetch:', res.status);
    return;
  }
  
  const data = await res.json();
  console.log('EDHREC data received');
  
  // Get commander ID
  const { data: cmd } = await supabase
    .from('ref_commanders')
    .select('id, display_name')
    .ilike('display_name', '%Sephiroth%Fabled%')
    .single();
  
  if (!cmd) {
    console.log('Commander not found in database');
    return;
  }
  
  console.log(`Found: ${cmd.display_name}`);
  
  // Build insights from tag_counts (EDHREC returns array format)
  const tagCounts: Array<{ count: number; slug: string; value: string }> = data.tag_counts || [];
  const totalDecks = data.container?.json_dict?.card?.num_decks || 6500;
  
  console.log(`Tag counts: ${tagCounts.length} tags`);
  console.log(`Total decks: ${totalDecks.toLocaleString()}`);
  
  const insights: Array<{
    commander_id: string;
    insight_type: string;
    build_variant: string;
    content: string;
    source_type: string;
    source_url: string;
    confidence: number;
    taxonomy_tags: string[];
  }> = [];
  
  for (const tag of tagCounts) {
    if (tag.count < 50) continue;
    
    const pct = Math.round((tag.count / totalDecks) * 100);
    insights.push({
      commander_id: cmd.id,
      insight_type: 'strategy',
      build_variant: tag.slug,
      content: `${tag.count.toLocaleString()} decks (${pct}%) build ${cmd.display_name} with a ${tag.value} focus.`,
      source_type: 'edhrec',
      source_url: 'https://edhrec.com/commanders/sephiroth-fabled-soldier',
      confidence: Math.min(0.9, tag.count / 1000),
      taxonomy_tags: [],
    });
  }
  
  console.log(`Generated ${insights.length} insights`);
  
  // Delete existing EDHREC insights
  await supabase
    .from('ref_commander_insights')
    .delete()
    .eq('commander_id', cmd.id)
    .eq('source_type', 'edhrec');
  
  // Insert new insights
  const { error } = await supabase
    .from('ref_commander_insights')
    .insert(insights);
  
  if (error) {
    console.log('Error inserting insights:', error.message);
  } else {
    console.log(`Inserted ${insights.length} insights`);
  }
  
  // Update commander metadata
  await supabase
    .from('ref_commanders')
    .update({
      edhrec_deck_count: totalDecks,
      edhrec_synced_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', cmd.id);
  
  console.log('Done!');
}

main().catch(console.error);
