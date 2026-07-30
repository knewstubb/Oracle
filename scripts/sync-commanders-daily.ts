/**
 * Daily Commander Sync
 * 
 * Polls Scryfall for new legendary creatures and updates ref_commanders.
 * Designed to run daily via GitHub Actions cron job.
 * 
 * What it does:
 * 1. Queries Scryfall for legendary creatures (handles pagination)
 * 2. Upserts new cards into ref_cards with can_be_commander flag
 * 3. Generates commander combinations for new entries
 * 4. Marks new commanders with needs_insights = true
 * 
 * Usage:
 *   npx tsx scripts/sync-commanders-daily.ts              # Normal run
 *   npx tsx scripts/sync-commanders-daily.ts --dry-run    # Preview without writing
 *   npx tsx scripts/sync-commanders-daily.ts --verbose    # Detailed logging
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

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
const SCRYFALL_DELAY_MS = 100; // Respect rate limits
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  type_line: string;
  oracle_text: string | null;
  mana_cost: string | null;
  cmc: number;
  colors: string[];
  color_identity: string[];
  legalities: {
    commander: string;
    brawl: string;
    oathbreaker?: string;
  };
  keywords: string[];
  released_at: string;
  set: string;
  set_name: string;
}

interface RefCardInsert {
  name: string;
  type_line: string;
  oracle_text: string | null;
  mana_cost: string | null;
  mana_value: number;
  color_identity: string;
  commander_legal: boolean;
  can_be_commander: boolean;
  is_legendary: boolean;
  is_creature: boolean;
}

// Helpers
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function verbose(msg: string) {
  if (VERBOSE) log(`  ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a card can be a commander based on type line and oracle text
 */
function canBeCommander(card: ScryfallCard): boolean {
  const typeLine = card.type_line.toLowerCase();
  const oracleText = (card.oracle_text ?? '').toLowerCase();
  
  // Must be legendary creature (or have "can be your commander" text)
  const isLegendaryCreature = typeLine.includes('legendary') && typeLine.includes('creature');
  const hasCommanderText = oracleText.includes('can be your commander');
  
  // Planeswalkers that can be commanders
  const isCommanderPlaneswalker = typeLine.includes('legendary') && 
    typeLine.includes('planeswalker') && 
    hasCommanderText;
  
  return isLegendaryCreature || hasCommanderText || isCommanderPlaneswalker;
}

/**
 * Fetch all legendary creatures from Scryfall (paginated)
 */
async function fetchLegendaryCreatures(): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | null = 'https://api.scryfall.com/cards/search?q=is%3Acommander+legal%3Acommander&unique=cards&order=released&dir=desc';
  
  log('Fetching legendary creatures from Scryfall...');
  
  while (url) {
    verbose(`Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Scryfall API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.data) {
      cards.push(...data.data);
      verbose(`  Fetched ${data.data.length} cards (total: ${cards.length})`);
    }
    
    // Check for more pages
    url = data.has_more ? data.next_page : null;
    
    // Respect rate limits
    if (url) {
      await sleep(SCRYFALL_DELAY_MS);
    }
  }
  
  log(`Fetched ${cards.length} total commander-eligible cards from Scryfall`);
  return cards;
}

/**
 * Get existing cards from ref_cards
 */
async function getExistingCards(): Promise<Set<string>> {
  const existingNames = new Set<string>();
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('ref_cards')
      .select('name')
      .range(offset, offset + pageSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    for (const row of data) {
      existingNames.add(row.name.toLowerCase());
    }
    
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  
  return existingNames;
}

/**
 * Upsert new cards into ref_cards
 */
async function upsertCards(cards: RefCardInsert[]): Promise<number> {
  if (DRY_RUN) {
    log(`[DRY RUN] Would insert ${cards.length} cards`);
    return 0;
  }
  
  if (cards.length === 0) return 0;
  
  const batchSize = 500;
  let inserted = 0;
  
  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('ref_cards')
      .upsert(batch, { onConflict: 'name' });
    
    if (error) {
      console.error(`Error upserting batch ${i / batchSize + 1}:`, error);
      continue;
    }
    
    inserted += batch.length;
  }
  
  return inserted;
}

/**
 * Generate commander entries for new cards
 * (Simplified version - just creates single-commander entries)
 */
async function generateCommanderEntries(newCards: RefCardInsert[]): Promise<number> {
  if (DRY_RUN) {
    log(`[DRY RUN] Would generate ${newCards.length} commander entries`);
    return 0;
  }
  
  if (newCards.length === 0) return 0;
  
  // Check which commanders already exist
  const existingKeys = new Set<string>();
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('ref_commanders')
      .select('canonical_key')
      .range(offset, offset + pageSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    for (const row of data) {
      existingKeys.add(row.canonical_key);
    }
    
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  
  // Prepare new commander entries
  const commanders: Array<{
    canonical_key: string;
    display_name: string;
    color_identity: string;
    leadership_type: string;
    legal_commander: boolean;
    legal_oathbreaker: boolean;
    legal_brawl: boolean;
    needs_insights: boolean;
    last_synced_at: string;
  }> = [];
  
  for (const card of newCards) {
    const key = slugify(card.name);
    
    if (existingKeys.has(key)) {
      verbose(`Skipping existing commander: ${card.name}`);
      continue;
    }
    
    commanders.push({
      canonical_key: key,
      display_name: card.name,
      color_identity: card.color_identity,
      leadership_type: 'single',
      legal_commander: card.commander_legal,
      legal_oathbreaker: false,
      legal_brawl: true,
      needs_insights: true,
      last_synced_at: new Date().toISOString(),
    });
  }
  
  if (commanders.length === 0) {
    log('No new commanders to add');
    return 0;
  }
  
  // Insert commanders
  const batchSize = 500;
  let inserted = 0;
  
  for (let i = 0; i < commanders.length; i += batchSize) {
    const batch = commanders.slice(i, i + batchSize);
    
    const { data: insertedCommanders, error } = await supabase
      .from('ref_commanders')
      .insert(batch)
      .select('id, canonical_key, display_name');
    
    if (error) {
      console.error(`Error inserting commander batch:`, error);
      continue;
    }
    
    inserted += insertedCommanders?.length || 0;
    
    // Insert commander_cards entries
    if (insertedCommanders) {
      const cardEntries = insertedCommanders.map(cmd => ({
        commander_id: cmd.id,
        card_name: cmd.display_name,
        card_role: 'commander',
        position: 1,
        is_flexible: false,
      }));
      
      const { error: cardError } = await supabase
        .from('ref_commander_cards')
        .insert(cardEntries);
      
      if (cardError) {
        console.error('Error inserting commander cards:', cardError);
      }
    }
  }
  
  return inserted;
}

/**
 * Simple slugify for canonical keys
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Main sync function
 */
async function main() {
  log('='.repeat(60));
  log('DAILY COMMANDER SYNC');
  log('='.repeat(60));
  
  if (DRY_RUN) {
    log('DRY RUN MODE - no changes will be made');
  }
  
  try {
    // 1. Fetch all commander-eligible cards from Scryfall
    const scryfallCards = await fetchLegendaryCreatures();
    
    // 2. Get existing cards from database
    log('Checking existing cards in database...');
    const existingCards = await getExistingCards();
    log(`Found ${existingCards.size} existing cards in ref_cards`);
    
    // 3. Find new cards
    const newCards: RefCardInsert[] = [];
    
    for (const card of scryfallCards) {
      if (existingCards.has(card.name.toLowerCase())) {
        continue;
      }
      
      if (!canBeCommander(card)) {
        continue;
      }
      
      newCards.push({
        name: card.name,
        type_line: card.type_line,
        oracle_text: card.oracle_text,
        mana_cost: card.mana_cost,
        mana_value: card.cmc,
        color_identity: (card.color_identity || []).join(''),
        commander_legal: card.legalities.commander === 'legal',
        can_be_commander: true,
        is_legendary: card.type_line.toLowerCase().includes('legendary'),
        is_creature: card.type_line.toLowerCase().includes('creature'),
      });
    }
    
    log(`Found ${newCards.length} new commander-eligible cards`);
    
    if (newCards.length > 0) {
      // Log first few new cards
      log('New cards found:');
      for (const card of newCards.slice(0, 10)) {
        log(`  - ${card.name} (${card.color_identity || 'C'})`);
      }
      if (newCards.length > 10) {
        log(`  ... and ${newCards.length - 10} more`);
      }
    }
    
    // 4. Upsert new cards
    const cardsInserted = await upsertCards(newCards);
    log(`Inserted ${cardsInserted} new cards into ref_cards`);
    
    // 5. Generate commander entries
    const commandersCreated = await generateCommanderEntries(newCards);
    log(`Created ${commandersCreated} new commander entries`);
    
    // 6. Summary
    log('');
    log('='.repeat(60));
    log('SYNC COMPLETE');
    log('='.repeat(60));
    log(`New cards added: ${cardsInserted}`);
    log(`New commanders created: ${commandersCreated}`);
    
    // Get counts of commanders needing insights
    const { count: needsInsightsCount } = await supabase
      .from('ref_commanders')
      .select('*', { count: 'exact', head: true })
      .eq('needs_insights', true);
    
    log(`Commanders needing insights: ${needsInsightsCount}`);
    
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

main();
