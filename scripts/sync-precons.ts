/**
 * Precon Sync Script
 * 
 * Fetches commander preconstructed deck metadata from external sources
 * and populates the ref_precons table.
 * 
 * Data sources:
 * 1. taw/magic-preconstructed-decks-data (GitHub) - comprehensive precon data
 * 2. Scryfall sets API - for supplementing metadata
 * 
 * Usage (DO NOT RUN until the owner has approved and applied the ref_precons_cards migration, see
 * docs/oracle/contracts/drafts/DRAFT_20261023150000_ref_precons_cards.sql; it writes to the database):
 *   npx tsx scripts/sync-precons.ts              # Normal run
 *   npx tsx scripts/sync-precons.ts --dry-run    # Preview without writing
 *   npx tsx scripts/sync-precons.ts --verbose    # Detailed logging
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { buildStoredCards, preconCardCount, type PreconCard } from '../src/lib/precons';

// Load env
config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Config
const USER_AGENT = 'TheOracle/1.0 (https://github.com/bradknewstubb/the-oracle)';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Data source URL
const PRECON_DATA_URL = 'https://raw.githubusercontent.com/taw/magic-preconstructed-decks-data/master/decks_v2.json';

// Types
interface PreconDeckRaw {
  name: string;
  type: string;
  set_code: string;
  set_name: string;
  release_date: string;
  cards: Array<{ name: string; count: number; set_code?: string; number?: string; foil?: boolean }>;
  sideboard?: Array<{ name: string; count: number }>;
  commander?: Array<{ name: string; count: number; set_code?: string; number?: string; foil?: boolean }>;
}

interface RefPreconInsert {
  name: string;
  set_code: string;
  set_name: string;
  commander_name: string | null;
  commander_scryfall_id: string | null;
  color_identity: string | null;
  release_date: string | null;
  card_count: number;
  /** Full card list (DRAFT migration ref_precons_cards must be applied before the sync is run). */
  cards: PreconCard[];
  /** The useless Archidekt search link is no longer stored. */
  archidekt_url: null;
}

// Helpers
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function verbose(msg: string) {
  if (VERBOSE) log(`  ${msg}`);
}

/**
 * Fetch precon data from taw's GitHub repo
 */
async function fetchPreconData(): Promise<PreconDeckRaw[]> {
  log('Fetching precon data from GitHub...');
  
  const response = await fetch(PRECON_DATA_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch precon data: ${response.status}`);
  }
  
  const data: PreconDeckRaw[] = await response.json();
  log(`Fetched ${data.length} total decks from source`);
  
  return data;
}

/**
 * Filter to commander precons only
 */
function filterCommanderPrecons(decks: PreconDeckRaw[]): PreconDeckRaw[] {
  const commanderTypes = [
    'Commander Deck',
    'Commander Precon',
    'Commander',
    'Planechase Commander',
    'Starter Commander Deck',
  ];
  
  const filtered = decks.filter(deck => {
    const type = deck.type.toLowerCase();
    return (
      commanderTypes.some(t => type.includes(t.toLowerCase())) ||
      type.includes('commander')
    );
  });
  
  log(`Filtered to ${filtered.length} commander precons`);
  return filtered;
}

/**
 * Look up commander's color identity from ref_cards
 */
async function getCommanderColorIdentity(commanderName: string): Promise<string | null> {
  const { data } = await supabase
    .from('ref_cards')
    .select('color_identity')
    .eq('name', commanderName)
    .maybeSingle();
  
  return data?.color_identity || null;
}

/**
 * Look up commander's scryfall_id from ref_printings (get newest printing)
 */
async function getCommanderScryfallId(commanderName: string): Promise<string | null> {
  const { data } = await supabase
    .from('ref_printings')
    .select('scryfall_id')
    .eq('name', commanderName)
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return data?.scryfall_id || null;
}

/**
 * Transform raw precon data to database format
 */
async function transformPrecons(decks: PreconDeckRaw[]): Promise<RefPreconInsert[]> {
  const results: RefPreconInsert[] = [];
  
  for (const deck of decks) {
    // Get primary commander name
    const commanderName = deck.commander?.[0]?.name || null;
    
    // Get color identity and scryfall ID if we have a commander
    let colorIdentity: string | null = null;
    let commanderScryfallId: string | null = null;
    if (commanderName) {
      colorIdentity = await getCommanderColorIdentity(commanderName);
      commanderScryfallId = await getCommanderScryfallId(commanderName);
    }
    
    // Full card list (main deck + commander, commander flagged); the count comes from it.
    const cards = buildStoredCards(deck);
    const cardCount = preconCardCount(cards);
    
    results.push({
      name: deck.name,
      set_code: deck.set_code.toLowerCase(),
      set_name: deck.set_name,
      commander_name: commanderName,
      commander_scryfall_id: commanderScryfallId,
      color_identity: colorIdentity,
      release_date: deck.release_date || null,
      card_count: cardCount || 100,
      cards,
      archidekt_url: null,
    });
  }
  
  return results;
}

/**
 * Upsert precons into ref_precons
 */
async function upsertPrecons(precons: RefPreconInsert[]): Promise<number> {
  if (DRY_RUN) {
    log(`[DRY RUN] Would upsert ${precons.length} precons`);
    return 0;
  }
  
  if (precons.length === 0) return 0;
  
  const batchSize = 100;
  let upserted = 0;
  
  for (let i = 0; i < precons.length; i += batchSize) {
    const batch = precons.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('ref_precons')
      .upsert(batch, { onConflict: 'set_code,name' });
    
    if (error) {
      console.error(`Error upserting batch ${i / batchSize + 1}:`, error);
      continue;
    }
    
    upserted += batch.length;
    verbose(`Upserted batch ${i / batchSize + 1} (${batch.length} precons)`);
  }
  
  return upserted;
}

/**
 * Get stats about the precon data
 */
async function getPreconStats(): Promise<void> {
  const { count: totalCount } = await supabase
    .from('ref_precons')
    .select('*', { count: 'exact', head: true });
  
  const { data: recentPrecons } = await supabase
    .from('ref_precons')
    .select('name, set_name, release_date')
    .order('release_date', { ascending: false })
    .limit(5);
  
  log(`Total precons in database: ${totalCount}`);
  log('Most recent precons:');
  for (const p of recentPrecons || []) {
    log(`  - ${p.name} (${p.set_name}) - ${p.release_date}`);
  }
}

/**
 * Main sync function
 */
async function main() {
  log('='.repeat(60));
  log('PRECON SYNC');
  log('='.repeat(60));
  
  if (DRY_RUN) {
    log('DRY RUN MODE - no changes will be made');
  }
  
  try {
    // 1. Fetch precon data
    const allDecks = await fetchPreconData();
    
    // 2. Filter to commander precons
    const commanderPrecons = filterCommanderPrecons(allDecks);
    
    // 3. Transform to database format
    log('Transforming precon data...');
    const precons = await transformPrecons(commanderPrecons);
    
    // Log sample
    log('Sample precons:');
    for (const p of precons.slice(0, 5)) {
      log(`  - ${p.name} (${p.set_name}) - ${p.commander_name || 'No commander'} [${p.color_identity || '?'}]`);
    }
    
    // 4. Upsert into database
    const upsertedCount = await upsertPrecons(precons);
    log(`Upserted ${upsertedCount} precons`);
    
    // 5. Show stats
    if (!DRY_RUN) {
      await getPreconStats();
    }
    
    log('');
    log('='.repeat(60));
    log('SYNC COMPLETE');
    log('='.repeat(60));
    
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

main();
