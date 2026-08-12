import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function audit() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('COMMANDER DATA AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMANDERS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('## COMMANDERS (ref_commanders)\n');

  const { count: totalCommanders } = await supabase
    .from('ref_commanders')
    .select('*', { count: 'exact', head: true });

  const { count: legalCommanders } = await supabase
    .from('ref_commanders')
    .select('*', { count: 'exact', head: true })
    .eq('legal_commander', true);

  const { count: with500Decks } = await supabase
    .from('ref_commanders')
    .select('*', { count: 'exact', head: true })
    .eq('legal_commander', true)
    .gte('edhrec_deck_count', 500);

  const { count: withInsights } = await supabase
    .from('ref_commander_insights')
    .select('commander_id', { count: 'exact', head: true });
  
  const { data: uniqueInsightCmds } = await supabase
    .from('ref_commander_insights')
    .select('commander_id');
  const uniqueInsightCount = new Set(uniqueInsightCmds?.map(i => i.commander_id)).size;

  const { data: uniqueBuildCmds } = await supabase
    .from('ref_commander_builds')
    .select('commander_id');
  const uniqueBuildCount = new Set(uniqueBuildCmds?.map(b => b.commander_id)).size;

  console.log(`Total commanders in DB:        ${totalCommanders?.toLocaleString()}`);
  console.log(`Legal commanders:              ${legalCommanders?.toLocaleString()}`);
  console.log(`With 500+ EDHREC decks:        ${with500Decks?.toLocaleString()}`);
  console.log(`With insights:                 ${uniqueInsightCount.toLocaleString()}`);
  console.log(`With builds:                   ${uniqueBuildCount.toLocaleString()}`);
  console.log('');

  // What we have per commander
  console.log('### Per-commander data coverage:\n');
  console.log('| Field | Source | Coverage |');
  console.log('|-------|--------|----------|');
  
  const { data: sampleCmd } = await supabase
    .from('ref_commanders')
    .select('*')
    .limit(1)
    .single();
  
  const cmdFields = [
    ['canonical_key', 'Generated', '100%'],
    ['display_name', 'Scryfall', '100%'],
    ['color_identity', 'Scryfall', '100%'],
    ['scryfall_id', 'Scryfall', '100%'],
    ['leadership_type', 'Scryfall/derived', '100%'],
    ['legal_commander', 'Scryfall', '100%'],
    ['edhrec_deck_count', 'EDHREC sync', `${Math.round(uniqueInsightCount / (legalCommanders || 1) * 100)}%`],
    ['edhrec_rank', 'EDHREC sync', `${Math.round(uniqueInsightCount / (legalCommanders || 1) * 100)}%`],
  ];
  cmdFields.forEach(([field, source, coverage]) => {
    console.log(`| ${field} | ${source} | ${coverage} |`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n## INSIGHTS (ref_commander_insights)\n');

  const { count: totalInsights } = await supabase
    .from('ref_commander_insights')
    .select('*', { count: 'exact', head: true });

  const { data: insightTypes } = await supabase
    .from('ref_commander_insights')
    .select('insight_type');
  
  const typeCounts: Record<string, number> = {};
  insightTypes?.forEach(i => {
    typeCounts[i.insight_type] = (typeCounts[i.insight_type] || 0) + 1;
  });

  console.log(`Total insights:                ${totalInsights?.toLocaleString()}`);
  console.log(`Commanders with insights:      ${uniqueInsightCount.toLocaleString()}`);
  console.log('');
  console.log('### By type:');
  Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count.toLocaleString()}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILDS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n## BUILDS (ref_commander_builds)\n');

  const { count: totalBuilds } = await supabase
    .from('ref_commander_builds')
    .select('*', { count: 'exact', head: true });

  const { count: totalBuildCards } = await supabase
    .from('ref_build_cards')
    .select('*', { count: 'exact', head: true });

  const { data: archetypeCounts } = await supabase
    .from('ref_commander_builds')
    .select('archetype');
  
  const archCounts: Record<string, number> = {};
  let nullArchetype = 0;
  archetypeCounts?.forEach(b => {
    if (b.archetype) {
      archCounts[b.archetype] = (archCounts[b.archetype] || 0) + 1;
    } else {
      nullArchetype++;
    }
  });

  const { data: themeCounts } = await supabase
    .from('ref_commander_builds')
    .select('theme');
  
  const thCounts: Record<string, number> = {};
  let nullTheme = 0;
  themeCounts?.forEach(b => {
    if (b.theme) {
      thCounts[b.theme] = (thCounts[b.theme] || 0) + 1;
    } else {
      nullTheme++;
    }
  });

  console.log(`Total builds:                  ${totalBuilds?.toLocaleString()}`);
  console.log(`Total build cards:             ${totalBuildCards?.toLocaleString()}`);
  console.log(`Commanders with builds:        ${uniqueBuildCount.toLocaleString()}`);
  console.log(`Avg builds per commander:      ${((totalBuilds || 0) / uniqueBuildCount).toFixed(1)}`);
  console.log(`Avg cards per build:           ${((totalBuildCards || 0) / (totalBuilds || 1)).toFixed(0)}`);
  console.log('');

  console.log('### Archetype distribution:');
  console.log(`  (null/theme-only): ${nullArchetype}`);
  Object.entries(archCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([arch, count]) => {
    console.log(`  - ${arch}: ${count}`);
  });

  console.log('\n### Theme distribution (top 20):');
  console.log(`  (null/archetype-only): ${nullTheme}`);
  Object.entries(thCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([theme, count]) => {
    console.log(`  - ${theme}: ${count}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAPS & MISSING DATA
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n## GAPS & MISSING DATA\n');

  // Commanders with 500+ decks but no builds
  const { data: cmdsWith500 } = await supabase
    .from('ref_commanders')
    .select('id')
    .eq('legal_commander', true)
    .gte('edhrec_deck_count', 500);
  
  const cmdsWithBuildsSet = new Set(uniqueBuildCmds?.map(b => b.commander_id));
  const missing500 = cmdsWith500?.filter(c => !cmdsWithBuildsSet.has(c.id)).length || 0;

  console.log('### Commanders missing builds:');
  console.log(`  500+ decks, no builds:       ${missing500}`);

  // Builds without archetype OR theme classification
  const { count: unclassified } = await supabase
    .from('ref_commander_builds')
    .select('*', { count: 'exact', head: true })
    .is('archetype', null)
    .is('theme', null);
  
  console.log(`  Builds with no classification: ${unclassified}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // WHAT WE DON'T HAVE YET
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n## DATA WE DON\'T HAVE YET\n');

  console.log('### Per Commander:');
  console.log('  [ ] Inherent archetype(s) — e.g., Teysa = aristocrats');
  console.log('  [ ] Primary color strategy — e.g., Orzhov aristocrats patterns');
  console.log('  [ ] Power level estimate — bracket 1-4');
  console.log('  [ ] Partner/background pairings analysis');
  console.log('  [ ] Salt score / social acceptance');
  console.log('');

  console.log('### Per Build:');
  console.log('  [ ] Combined archetype+theme — currently one or the other');
  console.log('  [ ] Budget tier (budget/mid/optimized)');
  console.log('  [ ] Core vs flex card distinction');
  console.log('  [ ] Win conditions / combo lines');
  console.log('  [ ] Mana curve / land count recommendations');
  console.log('');

  console.log('### Per Archetype/Theme (taxonomy level):');
  console.log('  [ ] Archetype knowledge docs — we have /data/knowledge/archetypes/*.md');
  console.log('  [ ] Cross-commander staples — cards in 80%+ of archetype builds');
  console.log('  [ ] Archetype-specific categories — aristocrats needs "sac outlets"');
  console.log('  [ ] Theme synergy matrix — which themes pair well');
  console.log('');

  console.log('### Analysis / Derived:');
  console.log('  [ ] Build clustering — merge 97% overlap builds into primaries');
  console.log('  [ ] Card role tagging — which cards are "staples" vs "signature"');
  console.log('  [ ] Budget alternatives mapping');
  console.log('  [ ] Upgrade paths between budget tiers');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('✅ HAVE:');
  console.log(`   ${totalCommanders?.toLocaleString()} commanders (${legalCommanders?.toLocaleString()} legal)`);
  console.log(`   ${totalInsights?.toLocaleString()} insights across ${uniqueInsightCount} commanders`);
  console.log(`   ${totalBuilds?.toLocaleString()} builds across ${uniqueBuildCount} commanders`);
  console.log(`   ${totalBuildCards?.toLocaleString()} build card recommendations`);
  console.log(`   Archetype/theme taxonomy with ${Object.keys(archCounts).length} archetypes, ${Object.keys(thCounts).length} themes`);
  console.log('');

  console.log('⚠️  GAPS:');
  console.log(`   ${missing500} commanders with 500+ decks missing builds`);
  console.log('   Builds have archetype OR theme, not both');
  console.log('   No inherent archetype tagging for commanders');
  console.log('   No build clustering / primary build identification');
  console.log('');

  console.log('🔮 NEXT STEPS:');
  console.log('   1. Tag commanders with inherent archetype(s)');
  console.log('   2. Backfill builds with commander archetype');
  console.log('   3. Cluster overlapping builds into "primary" builds');
  console.log('   4. Identify cross-commander staples per archetype');
  console.log('   5. Generate budget tier variants');
}

audit();
