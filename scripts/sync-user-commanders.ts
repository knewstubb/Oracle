/**
 * Sync EDHREC data for user's specific commanders
 * 
 * Usage:
 *   npx tsx scripts/sync-user-commanders.ts
 *   npx tsx scripts/sync-user-commanders.ts --dry-run
 *   npx tsx scripts/sync-user-commanders.ts --verbose
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { getTagMapping, normalizeTag, type TagMapping } from './edhrec-tag-mappings';
import { getBaseTrust } from '../src/lib/source-trust-config';

config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Config
const USER_AGENT = 'TheOracle/1.0 (commander-deckbuilder)';
const REQUEST_DELAY_MS = 300;
const MIN_TAG_DECKS_FOR_INSIGHT = 50; // Lower threshold for more insights

// CLI args
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// User's commanders (canonical_key format)
const USER_COMMANDERS = [
  'ghen-arcanum-weaver',
  'yedora-grave-gardener',
  'wilhelt-the-rotcleaver',
  'auntie-ool-cursewretch',          // Auntie Ool
  'hearthhull-the-worldseed',
  'urza-lord-high-artificer',        // Urza
  'mendicant-core-guidelight',
  'rocco-cabaretti-caterer',
  'norin-the-wary',
  'anikthea-hand-of-erebos',
  'talrand-sky-summoner',
  'ruric-thar-the-unbowed',
  'sephiroth-fabled-soldier-sephiroth-one-winged-angel',
  'zurgo-stormrender',
  'pantlaza-sun-favored',
  'hakbal-of-the-surging-soul',
  'ureni-of-the-unwritten',
  'the-first-sliver',
  // Additional commanders
  'maccready-lamplight-mayor',       // MacCready
  'the-necrobloom',
  'the-scarab-god',
  'rhys-the-redeemed',
  'kardur-doomscourge',
  'king-of-the-oathbreakers',
  'arcades-the-strategist',
];

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface EdhrecCardView {
  name: string;
  sanitized: string;
  url: string;
  num_decks: number;
  potential_decks: number;
  synergy: number;
  inclusion?: number;
}

interface EdhrecCardList {
  header: string;
  cardviews: EdhrecCardView[];
}

interface EdhrecCommanderData {
  header?: string;
  tag_counts?: Record<string, number>;
  similar?: Array<{ name: string; sanitized: string; num_decks: number }>;
  panels?: {
    combocounts?: Array<{ cards: string[]; count: number }>;
  };
  container?: {
    json_dict?: {
      cardlists?: EdhrecCardList[];
      card?: {
        name: string;
        sanitized: string;
        num_decks: number;
        salt: number;
      };
    };
  };
  redirect?: string;
  // Strategy/archetype data
  description?: string;
  strategy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function verbose(msg: string) {
  if (VERBOSE) console.log(`  ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toEdhrecSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// EDHREC API
// ═══════════════════════════════════════════════════════════════════════════

async function fetchEdhrecData(slug: string): Promise<EdhrecCommanderData | null> {
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (res.status === 404) {
      verbose(`404 for ${slug}`);
      return null;
    }
    
    if (!res.ok) {
      verbose(`EDHREC returned ${res.status} for ${slug}`);
      return null;
    }
    
    const data: EdhrecCommanderData = await res.json();
    
    if (data.redirect) {
      const redirectSlug = data.redirect.replace('/commanders/', '');
      verbose(`Following redirect: ${slug} → ${redirectSlug}`);
      return fetchEdhrecData(redirectSlug);
    }
    
    return data;
  } catch (err) {
    verbose(`Error fetching ${slug}: ${err instanceof Error ? err.message : 'Unknown'}`);
    return null;
  }
}

/**
 * Fetch theme-specific data for a commander
 */
async function fetchEdhrecThemeData(
  commanderSlug: string, 
  themeSlug: string
): Promise<EdhrecCommanderData | null> {
  const url = `https://json.edhrec.com/pages/commanders/${commanderSlug}/${themeSlug}.json`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Extraction
// ═══════════════════════════════════════════════════════════════════════════

function extractInsights(
  data: EdhrecCommanderData,
  commanderId: string,
  commanderName: string
): Array<{
  commander_id: string;
  insight_type: string;
  build_variant: string;
  content: string;
  source_type: string;
  source_url: string;
  confidence: number;
  source_trust: number;
  taxonomy_tags: string[];
}> {
  const tagCounts = data.tag_counts || {};
  const totalDecks = data.container?.json_dict?.card?.num_decks || 1;
  const sourceTrust = getBaseTrust('edhrec'); // 0.85 for EDHREC stats
  
  const insights: Array<{
    commander_id: string;
    insight_type: string;
    build_variant: string;
    content: string;
    source_type: string;
    source_url: string;
    confidence: number;
    source_trust: number;
    taxonomy_tags: string[];
  }> = [];
  
  for (const [tag, count] of Object.entries(tagCounts)) {
    if (count < MIN_TAG_DECKS_FOR_INSIGHT) continue;
    
    const normalized = normalizeTag(tag);
    const mapping = getTagMapping(tag);
    const percentage = Math.round((count / totalDecks) * 100);
    const taxonomyTags: string[] = [];
    
    if (mapping) {
      taxonomyTags.push(`${mapping.category}/${mapping.slug}`);
    }
    
    insights.push({
      commander_id: commanderId,
      insight_type: 'strategy',
      build_variant: normalized,
      content: `${count.toLocaleString()} decks (${percentage}%) build ${commanderName} with a ${tag} focus.`,
      source_type: 'edhrec',
      source_url: `https://edhrec.com/commanders/${toEdhrecSlug(commanderName)}`,
      confidence: Math.min(0.9, count / 1000),
      source_trust: sourceTrust,
      taxonomy_tags: taxonomyTags,
    });
  }
  
  return insights.sort((a, b) => b.confidence - a.confidence);
}

function extractTaxonomy(
  data: EdhrecCommanderData,
  commanderId: string
): Array<{
  commander_id: string;
  taxonomy_slug: string;
  source: string;
  confidence: number;
  relevance: string;
}> {
  const tagCounts = data.tag_counts || {};
  const totalDecks = data.container?.json_dict?.card?.num_decks || 1;
  const entries: Array<{
    commander_id: string;
    taxonomy_slug: string;
    source: string;
    confidence: number;
    relevance: string;
  }> = [];
  
  const seenSlugs = new Set<string>();
  
  for (const [tag, count] of Object.entries(tagCounts)) {
    const mapping = getTagMapping(tag);
    if (!mapping) continue;
    if (seenSlugs.has(mapping.slug)) continue;
    seenSlugs.add(mapping.slug);
    
    const ratio = count / totalDecks;
    let relevance = 'minor';
    if (ratio > 0.5) relevance = 'primary';
    else if (ratio > 0.2) relevance = 'secondary';
    
    entries.push({
      commander_id: commanderId,
      taxonomy_slug: mapping.slug,
      source: 'edhrec',
      confidence: Math.min(0.95, ratio + 0.3),
      relevance,
    });
  }
  
  return entries;
}

function extractTopCards(
  data: EdhrecCommanderData,
  commanderId: string
): Array<{
  commander_id: string;
  card_name: string;
  card_type: string;
  synergy_score: number;
  inclusion_rate: number;
  position: number;
}> {
  const cardlists = data.container?.json_dict?.cardlists || [];
  const cards: Array<{
    commander_id: string;
    card_name: string;
    card_type: string;
    synergy_score: number;
    inclusion_rate: number;
    position: number;
  }> = [];
  
  for (const list of cardlists) {
    const cardType = list.header?.toLowerCase() || 'unknown';
    let position = 0;
    
    for (const card of list.cardviews || []) {
      if (position >= 20) break; // Top 20 per type
      
      cards.push({
        commander_id: commanderId,
        card_name: card.name,
        card_type: cardType,
        synergy_score: card.synergy || 0,
        inclusion_rate: card.inclusion || (card.num_decks / (card.potential_decks || 1)),
        position: position++,
      });
    }
  }
  
  return cards;
}

// ═══════════════════════════════════════════════════════════════════════════
// Database Operations
// ═══════════════════════════════════════════════════════════════════════════

async function upsertInsights(commanderId: string, insights: Array<any>): Promise<number> {
  if (DRY_RUN || insights.length === 0) return 0;
  
  // Delete existing EDHREC insights
  await supabase
    .from('ref_commander_insights')
    .delete()
    .eq('commander_id', commanderId)
    .eq('source_type', 'edhrec');
  
  const { error } = await supabase
    .from('ref_commander_insights')
    .insert(insights);
  
  if (error) {
    verbose(`Error inserting insights: ${error.message}`);
    return 0;
  }
  
  return insights.length;
}

async function upsertTaxonomy(commanderId: string, entries: Array<any>): Promise<number> {
  if (DRY_RUN || entries.length === 0) return 0;
  
  // Delete existing EDHREC taxonomy
  await supabase
    .from('ref_commander_taxonomy')
    .delete()
    .eq('commander_id', commanderId)
    .eq('source', 'edhrec');
  
  const { error } = await supabase
    .from('ref_commander_taxonomy')
    .insert(entries);
  
  if (error) {
    verbose(`Error inserting taxonomy: ${error.message}`);
    return 0;
  }
  
  return entries.length;
}

async function upsertCards(commanderId: string, cards: Array<any>): Promise<number> {
  if (DRY_RUN || cards.length === 0) return 0;
  
  // Delete existing cards
  await supabase
    .from('ref_commander_cards')
    .delete()
    .eq('commander_id', commanderId);
  
  const { error } = await supabase
    .from('ref_commander_cards')
    .insert(cards);
  
  if (error) {
    verbose(`Error inserting cards: ${error.message}`);
    return 0;
  }
  
  return cards.length;
}

async function updateCommanderMeta(commanderId: string, data: EdhrecCommanderData): Promise<void> {
  if (DRY_RUN) return;
  
  const card = data.container?.json_dict?.card;
  const similarCommanders = data.similar?.slice(0, 10).map(s => ({
    name: s.name,
    slug: s.sanitized,
    decks: s.num_decks,
  })) || null;
  
  await supabase
    .from('ref_commanders')
    .update({
      edhrec_deck_count: card?.num_decks,
      salt_score: card?.salt,
      similar_commanders: similarCommanders,
      edhrec_synced_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', commanderId);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Sync
// ═══════════════════════════════════════════════════════════════════════════

async function syncCommander(canonicalKey: string): Promise<{
  name: string;
  insights: number;
  taxonomy: number;
  cards: number;
  success: boolean;
}> {
  // Look up commander
  const { data: commander } = await supabase
    .from('ref_commanders')
    .select('id, display_name, canonical_key')
    .eq('canonical_key', canonicalKey)
    .single();
  
  if (!commander) {
    return { name: canonicalKey, insights: 0, taxonomy: 0, cards: 0, success: false };
  }
  
  log(`Syncing ${commander.display_name}...`);
  
  // Fetch from EDHREC
  const edhrecSlug = toEdhrecSlug(commander.display_name);
  const data = await fetchEdhrecData(edhrecSlug);
  
  if (!data) {
    log(`  ❌ No EDHREC data found for ${edhrecSlug}`);
    return { name: commander.display_name, insights: 0, taxonomy: 0, cards: 0, success: false };
  }
  
  // Extract and save data
  const insights = extractInsights(data, commander.id, commander.display_name);
  const taxonomy = extractTaxonomy(data, commander.id);
  const cards = extractTopCards(data, commander.id);
  
  const insightCount = await upsertInsights(commander.id, insights);
  const taxonomyCount = await upsertTaxonomy(commander.id, taxonomy);
  const cardCount = await upsertCards(commander.id, cards);
  
  await updateCommanderMeta(commander.id, data);
  
  const totalDecks = data.container?.json_dict?.card?.num_decks || 0;
  log(`  ✓ ${insightCount} insights, ${taxonomyCount} tags, ${cardCount} cards (${totalDecks.toLocaleString()} decks total)`);
  
  return {
    name: commander.display_name,
    insights: insightCount,
    taxonomy: taxonomyCount,
    cards: cardCount,
    success: true,
  };
}

async function main() {
  log('=== User Commander EDHREC Sync ===');
  log(`Commanders to sync: ${USER_COMMANDERS.length}`);
  if (DRY_RUN) log('DRY RUN - no database changes');
  log('');
  
  const results: Array<{
    name: string;
    insights: number;
    taxonomy: number;
    cards: number;
    success: boolean;
  }> = [];
  
  for (const key of USER_COMMANDERS) {
    const result = await syncCommander(key);
    results.push(result);
    await sleep(REQUEST_DELAY_MS);
  }
  
  // Summary
  log('');
  log('=== Sync Summary ===');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  log(`Successful: ${successful.length}/${results.length}`);
  
  if (successful.length > 0) {
    log('');
    log('Synced commanders:');
    for (const r of successful) {
      log(`  ${r.name}: ${r.insights} insights, ${r.taxonomy} tags, ${r.cards} cards`);
    }
  }
  
  if (failed.length > 0) {
    log('');
    log('Failed:');
    for (const r of failed) {
      log(`  ${r.name}`);
    }
  }
  
  const totalInsights = successful.reduce((sum, r) => sum + r.insights, 0);
  const totalTaxonomy = successful.reduce((sum, r) => sum + r.taxonomy, 0);
  const totalCards = successful.reduce((sum, r) => sum + r.cards, 0);
  
  log('');
  log(`Total: ${totalInsights} insights, ${totalTaxonomy} taxonomy entries, ${totalCards} cards`);
}

main().catch(console.error);
