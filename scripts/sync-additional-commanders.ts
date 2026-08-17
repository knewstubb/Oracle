/**
 * Sync additional commanders requested by user
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { normalizeTag, getTagMapping } from './edhrec-tag-mappings';
import { getBaseTrust } from '../src/lib/source-trust-config';

config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_AGENT = 'TheOracle/1.0 (commander-deckbuilder)';
const REQUEST_DELAY_MS = 300;
const MIN_TAG_DECKS = 50;

const COMMANDERS_TO_SYNC = [
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
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchEdhrecData(slug: string): Promise<any> {
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      console.log(`  EDHREC ${res.status} for ${slug}`);
      return null;
    }
    const data = await res.json();
    if (data.redirect) {
      const redirectSlug = data.redirect.replace('/commanders/', '');
      console.log(`  Following redirect: ${slug} → ${redirectSlug}`);
      return fetchEdhrecData(redirectSlug);
    }
    return data;
  } catch (err) {
    console.log(`  Error fetching ${slug}`);
    return null;
  }
}

async function syncCommander(canonicalKey: string): Promise<void> {
  const { data: cmd } = await supabase
    .from('ref_commanders')
    .select('id, display_name')
    .eq('canonical_key', canonicalKey)
    .single();
  
  if (!cmd) {
    console.log(`❌ ${canonicalKey} - not found in DB`);
    return;
  }
  
  console.log(`Syncing ${cmd.display_name}...`);
  
  const edhrecSlug = toEdhrecSlug(cmd.display_name);
  const data = await fetchEdhrecData(edhrecSlug);
  
  if (!data) {
    console.log(`  ❌ No EDHREC data`);
    return;
  }
  
  // EDHREC returns tag_counts as array in newer format
  const tagCounts: Array<{ count: number; slug: string; value: string }> = 
    Array.isArray(data.tag_counts) ? data.tag_counts : 
    Object.entries(data.tag_counts || {}).map(([k, v]) => ({ slug: k, value: k, count: v as number }));
  
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
  
  for (const tag of tagCounts) {
    if (tag.count < MIN_TAG_DECKS) continue;
    
    const pct = Math.round((tag.count / totalDecks) * 100);
    insights.push({
      commander_id: cmd.id,
      insight_type: 'strategy',
      build_variant: tag.slug,
      content: `${tag.count.toLocaleString()} decks (${pct}%) build ${cmd.display_name} with a ${tag.value} focus.`,
      source_type: 'edhrec',
      source_url: `https://edhrec.com/commanders/${edhrecSlug}`,
      confidence: Math.min(0.9, tag.count / 1000),
      source_trust: sourceTrust,
      taxonomy_tags: [],
    });
  }
  
  // Delete existing and insert
  await supabase
    .from('ref_commander_insights')
    .delete()
    .eq('commander_id', cmd.id)
    .eq('source_type', 'edhrec');
  
  if (insights.length > 0) {
    const { error } = await supabase
      .from('ref_commander_insights')
      .insert(insights);
    
    if (error) {
      console.log(`  Error: ${error.message}`);
    }
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
  
  console.log(`  ✓ ${insights.length} insights (${totalDecks.toLocaleString()} decks)`);
}

async function main() {
  console.log('=== Syncing Additional Commanders ===\n');
  
  for (const key of COMMANDERS_TO_SYNC) {
    await syncCommander(key);
    await sleep(REQUEST_DELAY_MS);
  }
  
  console.log('\nDone!');
}

main().catch(console.error);
