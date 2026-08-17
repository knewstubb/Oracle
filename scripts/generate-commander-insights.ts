/**
 * Generate AI-analyzed strategy insights for commanders PER BUILD VARIANT
 * 
 * This script creates "chef's notes" style insights for each theme/archetype:
 * - Core strategy for that build
 * - Key synergies specific to the variant
 * - Staples for that build
 * - Hidden gems for that build
 * 
 * Usage:
 *   npx tsx scripts/generate-commander-insights.ts
 *   npx tsx scripts/generate-commander-insights.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { getBaseTrust } from '../src/lib/source-trust-config';

config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_AGENT = 'TheOracle/1.0 (commander-deckbuilder)';
const REQUEST_DELAY_MS = 400;
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_THEMES_PER_COMMANDER = 5; // Top 5 themes by popularity

// User's commanders
const USER_COMMANDERS = [
  'ghen-arcanum-weaver',
  'yedora-grave-gardener',
  'wilhelt-the-rotcleaver',
  'auntie-ool-cursewretch',
  'hearthhull-the-worldseed',
  'urza-lord-high-artificer',
  'mendicant-core-guidelight',
  'rocco-cabaretti-caterer',
  'norin-the-wary',
  'anikthea-hand-of-erebos',
  'talrand-sky-summoner',
  'ruric-thar-the-unbowed',
  'zurgo-stormrender',
  'pantlaza-sun-favored',
  'hakbal-of-the-surging-soul',
  'ureni-of-the-unwritten',
  'the-first-sliver',
  'maccready-lamplight-mayor',
  'the-necrobloom',
  'the-scarab-god',
  'rhys-the-redeemed',
  'kardur-doomscourge',
  'king-of-the-oathbreakers',
  'arcades-the-strategist',
];

function toEdhrecSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface EdhrecCard {
  name: string;
  synergy: number;
  num_decks: number;
  potential_decks: number;
}

interface ThemeData {
  slug: string;
  name: string;
  deckCount: number;
  cards: EdhrecCard[];
}

async function fetchEdhrecCards(slug: string): Promise<{ cards: EdhrecCard[]; themes: Array<{ slug: string; value: string; count: number }> } | null> {
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (!res.ok) {
      console.log(`  EDHREC returned ${res.status} for ${slug}`);
      return null;
    }
    
    const data = await res.json();
    const cardlists = data.container?.json_dict?.cardlists || [];
    const cards: EdhrecCard[] = [];
    
    for (const list of cardlists) {
      for (const card of list.cardviews || []) {
        cards.push({
          name: card.name,
          synergy: card.synergy || 0,
          num_decks: card.num_decks || 0,
          potential_decks: card.potential_decks || 1,
        });
      }
    }
    
    // Extract themes from tag_counts (array format)
    const tagCounts: Array<{ slug: string; value: string; count: number }> = 
      Array.isArray(data.tag_counts) ? data.tag_counts : [];
    
    const themes = tagCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_THEMES_PER_COMMANDER);
    
    return { cards, themes };
  } catch (e) {
    console.log(`  Error fetching ${slug}:`, e);
    return null;
  }
}

async function fetchThemeCards(commanderSlug: string, themeSlug: string): Promise<EdhrecCard[] | null> {
  const url = `https://json.edhrec.com/pages/commanders/${commanderSlug}/${themeSlug}.json`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const cardlists = data.container?.json_dict?.cardlists || [];
    const cards: EdhrecCard[] = [];
    
    for (const list of cardlists) {
      for (const card of list.cardviews || []) {
        cards.push({
          name: card.name,
          synergy: card.synergy || 0,
          num_decks: card.num_decks || 0,
          potential_decks: card.potential_decks || 1,
        });
      }
    }
    
    return cards;
  } catch {
    return null;
  }
}

// Generate strategy insights for a specific build variant
function generateBuildInsights(
  commanderName: string,
  buildVariant: string,
  cards: EdhrecCard[]
): Array<{
  insight_type: string;
  build_variant: string;
  content: string;
  card_mentions: string[];
  confidence: number;
}> {
  const insights: Array<{
    insight_type: string;
    build_variant: string;
    content: string;
    card_mentions: string[];
    confidence: number;
  }> = [];
  
  if (cards.length < 10) return insights;
  
  // Sort by synergy and by inclusion
  const bySynergy = [...cards].sort((a, b) => b.synergy - a.synergy);
  const byInclusion = [...cards].sort((a, b) => 
    (b.num_decks / b.potential_decks) - (a.num_decks / a.potential_decks)
  );
  
  // Core cards for this build
  const top8Synergy = bySynergy.slice(0, 8);
  if (top8Synergy.length >= 5) {
    const cardNames = top8Synergy.map(c => c.name);
    const avgSynergy = Math.round(top8Synergy.reduce((sum, c) => sum + c.synergy, 0) / top8Synergy.length * 100);
    
    insights.push({
      insight_type: 'strategy',
      build_variant: buildVariant,
      content: `For ${buildVariant} ${commanderName}, the core engine cards are ${cardNames.slice(0, 5).join(', ')}. These have ${avgSynergy}% higher synergy in this build compared to generic ${commanderName} decks.`,
      card_mentions: cardNames,
      confidence: 0.75,
    });
  }
  
  // Staples for this build
  const buildStaples = byInclusion
    .filter(c => (c.num_decks / c.potential_decks) > 0.4)
    .slice(0, 6);
  
  if (buildStaples.length >= 3) {
    const cardNames = buildStaples.map(c => c.name);
    insights.push({
      insight_type: 'card_recommendation',
      build_variant: buildVariant,
      content: `Essential ${buildVariant} staples for ${commanderName}: ${cardNames.slice(0, 5).join(', ')}. These appear in 40%+ of ${buildVariant} builds.`,
      card_mentions: cardNames,
      confidence: 0.80,
    });
  }
  
  // Synergy pairs for this build
  const highSynergyCards = bySynergy.filter(c => c.synergy > 0.15).slice(0, 6);
  if (highSynergyCards.length >= 3) {
    const pairs: string[] = [];
    for (let i = 0; i < Math.min(3, highSynergyCards.length - 1); i++) {
      pairs.push(`${highSynergyCards[i].name} + ${highSynergyCards[i + 1].name}`);
    }
    const allCards = highSynergyCards.map(c => c.name);
    
    insights.push({
      insight_type: 'synergy',
      build_variant: buildVariant,
      content: `Key ${buildVariant} synergies in ${commanderName}: ${pairs.join('; ')}. These cards amplify the ${buildVariant} strategy.`,
      card_mentions: allCards,
      confidence: 0.70,
    });
  }
  
  // Hidden gems for this build
  const underplayed = bySynergy
    .filter(c => c.synergy > 0.12 && (c.num_decks / c.potential_decks) < 0.25)
    .slice(0, 4);
  
  if (underplayed.length >= 2) {
    const cardNames = underplayed.map(c => c.name);
    insights.push({
      insight_type: 'card_recommendation',
      build_variant: buildVariant,
      content: `Underplayed ${buildVariant} options for ${commanderName}: ${cardNames.join(', ')}. High synergy but in fewer than 25% of decks — potential upgrades.`,
      card_mentions: cardNames,
      confidence: 0.60,
    });
  }
  
  return insights;
}

async function processCommander(canonicalKey: string) {
  // Get commander from DB
  const { data: cmd } = await supabase
    .from('ref_commanders')
    .select('id, display_name, color_identity')
    .eq('canonical_key', canonicalKey)
    .single();
  
  if (!cmd) {
    console.log(`❌ ${canonicalKey} - not found in DB`);
    return { name: canonicalKey, insights: 0, themes: 0 };
  }
  
  console.log(`Processing ${cmd.display_name}...`);
  
  const edhrecSlug = toEdhrecSlug(cmd.display_name);
  const baseData = await fetchEdhrecCards(edhrecSlug);
  
  if (!baseData || baseData.cards.length === 0) {
    console.log(`  ❌ No card data from EDHREC`);
    return { name: cmd.display_name, insights: 0, themes: 0 };
  }
  
  const themes = baseData.themes;
  console.log(`  Found ${themes.length} themes: ${themes.map(t => t.value).join(', ')}`);
  
  const allInsights: Array<{
    commander_id: string;
    insight_type: string;
    build_variant: string | null;
    content: string;
    card_mentions: string[];
    confidence: number;
    source_type: string;
    source_trust: number;
    source_url: string;
    taxonomy_tags: string[];
  }> = [];
  
  const sourceTrust = getBaseTrust('ai-analysis');
  
  // Process each theme
  for (const theme of themes) {
    await delay(REQUEST_DELAY_MS);
    
    const themeCards = await fetchThemeCards(edhrecSlug, theme.slug);
    
    if (!themeCards || themeCards.length < 10) {
      console.log(`    Skipping ${theme.value} (not enough cards)`);
      continue;
    }
    
    const insights = generateBuildInsights(cmd.display_name, theme.value, themeCards);
    console.log(`    ${theme.value}: ${insights.length} insights`);
    
    for (const i of insights) {
      allInsights.push({
        commander_id: cmd.id,
        insight_type: i.insight_type,
        build_variant: i.build_variant,
        content: i.content,
        card_mentions: i.card_mentions,
        confidence: i.confidence,
        source_type: 'ai-analysis',
        source_trust: sourceTrust,
        source_url: `https://edhrec.com/commanders/${edhrecSlug}/${theme.slug}`,
        taxonomy_tags: [theme.slug],
      });
    }
  }
  
  if (allInsights.length === 0) {
    console.log(`  ❌ No insights generated`);
    return { name: cmd.display_name, insights: 0, themes: themes.length };
  }
  
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would insert ${allInsights.length} insights across ${themes.length} themes`);
    return { name: cmd.display_name, insights: allInsights.length, themes: themes.length };
  }
  
  // Insert insights
  const { error } = await supabase
    .from('ref_commander_insights')
    .insert(allInsights);
  
  if (error) {
    console.log(`  Error inserting:`, error.message);
    return { name: cmd.display_name, insights: 0, themes: themes.length };
  }
  
  console.log(`  ✓ ${allInsights.length} insights across ${themes.length} themes`);
  return { name: cmd.display_name, insights: allInsights.length, themes: themes.length };
}

async function main() {
  console.log('=== Generating Build-Specific Commander Insights ===\n');
  
  const results: Array<{ name: string; insights: number; themes: number }> = [];
  
  for (const key of USER_COMMANDERS) {
    const result = await processCommander(key);
    results.push(result);
    await delay(REQUEST_DELAY_MS);
  }
  
  console.log('\n=== Summary ===');
  const totalInsights = results.reduce((sum, r) => sum + r.insights, 0);
  const totalThemes = results.reduce((sum, r) => sum + r.themes, 0);
  console.log(`Total insights generated: ${totalInsights} across ${totalThemes} build variants`);
  
  for (const r of results.filter(r => r.insights > 0)) {
    console.log(`  ${r.name}: ${r.insights} insights (${r.themes} themes)`);
  }
}

main().catch(console.error);
