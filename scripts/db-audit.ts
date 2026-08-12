import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== DATABASE AUDIT ===\n');
  
  // Table counts
  const tables = [
    'ref_commanders',
    'ref_commander_insights',
    'ref_edhrec_recommendations',
    'ref_commander_taxonomy',
    'ref_commander_builds',
    'ref_build_cards',
    'decks',
    'deck_cards',
    'user_cards',
    'user_copies'
  ];
  
  console.log('TABLE COUNTS:');
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    const status = error ? 'ERROR' : (count?.toLocaleString() || '0');
    console.log(`  ${table}: ${status}`);
  }
  
  // Taxonomy breakdown by type
  console.log('\nTAXONOMY BREAKDOWN:');
  const { data: taxonomy } = await supabase
    .from('ref_commander_taxonomy')
    .select('tag_type, tag_value')
    .limit(100000);
  
  const byType: Record<string, Map<string, number>> = {};
  taxonomy?.forEach(t => {
    if (!byType[t.tag_type]) byType[t.tag_type] = new Map();
    byType[t.tag_type].set(t.tag_value, (byType[t.tag_type].get(t.tag_value) || 0) + 1);
  });
  
  for (const [type, values] of Object.entries(byType)) {
    console.log(`\n  ${type.toUpperCase()} (${values.size} unique):`);
    const sorted = [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    sorted.forEach(([name, count]) => console.log(`    ${name}: ${count} commanders`));
  }
  
  // Build data check
  console.log('\nBUILD DATA:');
  const { data: builds } = await supabase
    .from('ref_commander_builds')
    .select('id, archetype, theme, edhrec_theme_slug, deck_count')
    .order('deck_count', { ascending: false })
    .limit(10);
  
  if (builds && builds.length > 0) {
    console.log(`  ${builds.length} builds synced. Top by deck count:`);
    for (const b of builds) {
      console.log(`    ${b.archetype || '-'}/${b.theme || '-'} (${b.edhrec_theme_slug}): ${b.deck_count} decks`);
    }
  } else {
    console.log('  No builds synced yet');
  }
  
  // Commanders with EDHREC data
  const { count: syncedCount } = await supabase
    .from('ref_commanders')
    .select('*', { count: 'exact', head: true })
    .not('edhrec_deck_count', 'is', null);
  console.log(`\nCOMMANDERS WITH EDHREC DATA: ${syncedCount?.toLocaleString()}`);
  
  // Sample insights
  console.log('\nINSIGHT TYPES:');
  const { data: insights } = await supabase
    .from('ref_commander_insights')
    .select('insight_type');
  
  const insightCounts: Record<string, number> = {};
  insights?.forEach(i => {
    insightCounts[i.insight_type] = (insightCounts[i.insight_type] || 0) + 1;
  });
  const sortedInsights = Object.entries(insightCounts).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedInsights) {
    console.log(`  ${type}: ${count.toLocaleString()}`);
  }
  
  // Decks with build_id assigned
  console.log('\nUSER DATA:');
  const { count: decksWithBuild } = await supabase
    .from('decks')
    .select('*', { count: 'exact', head: true })
    .not('build_id', 'is', null);
  console.log(`  Decks with build assigned: ${decksWithBuild || 0}`);
  
  const { count: totalDecks } = await supabase
    .from('decks')
    .select('*', { count: 'exact', head: true });
  console.log(`  Total decks: ${totalDecks || 0}`);
}

main().catch(console.error);
