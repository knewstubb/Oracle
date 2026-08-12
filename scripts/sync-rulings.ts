/**
 * Rulings Sync Script
 * 
 * Downloads Scryfall's bulk rulings data and syncs to ref_rulings table.
 * Designed to run weekly via GitHub Actions or manually.
 * 
 * What it does:
 * 1. Fetches the rulings bulk data URL from Scryfall's bulk-data API
 * 2. Downloads and streams the NDJSON file
 * 3. Upserts rulings into ref_rulings table
 * 
 * Usage:
 *   npx tsx scripts/sync-rulings.ts              # Normal run
 *   npx tsx scripts/sync-rulings.ts --dry-run    # Preview without writing
 *   npx tsx scripts/sync-rulings.ts --verbose    # Detailed logging
 *   npx tsx scripts/sync-rulings.ts --full       # Full sync (truncate + insert)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

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
const FULL_SYNC = process.argv.includes('--full');
const BATCH_SIZE = 1000;
const TEMP_FILE = '/tmp/scryfall-rulings.json';

interface ScryfallRuling {
  object: 'ruling';
  oracle_id: string;
  source: 'wotc' | 'scryfall';
  published_at: string;
  comment: string;
}

interface RefRulingInsert {
  oracle_id: string;
  source: string;
  published_at: string;
  comment: string;
}

// Helpers
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function verbose(msg: string) {
  if (VERBOSE) log(`  ${msg}`);
}

/**
 * Fetch the rulings bulk data download URL from Scryfall
 */
async function getRulingsBulkDataUrl(): Promise<{ url: string; isGzipped: boolean; isJsonl: boolean }> {
  log('Fetching bulk data manifest from Scryfall...');
  
  // Fetch the specific rulings bulk data endpoint for full details
  const response = await fetch('https://api.scryfall.com/bulk-data/rulings', {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch bulk data manifest: ${response.status}`);
  }
  
  const rulingsBulk = await response.json();
  
  // Scryfall now uses jsonl_download_uri for gzipped JSONL files
  const downloadUrl = rulingsBulk.download_uri || rulingsBulk.jsonl_download_uri;
  
  if (!downloadUrl) {
    throw new Error('Rulings download URL not found in manifest');
  }
  
  const isGzipped = downloadUrl.endsWith('.gz');
  const isJsonl = downloadUrl.includes('.jsonl');
  
  log(`Found rulings bulk data: ${rulingsBulk.name}`);
  log(`  Size: ${((rulingsBulk.compressed_size || rulingsBulk.size || 0) / 1024 / 1024).toFixed(2)} MB`);
  log(`  Updated: ${rulingsBulk.updated_at}`);
  log(`  Format: ${isJsonl ? 'JSONL' : 'JSON'}${isGzipped ? ' (gzipped)' : ''}`);
  
  return { url: downloadUrl, isGzipped, isJsonl };
}

/**
 * Download the rulings file to a temp location
 */
async function downloadRulingsFile(url: string, isGzipped: boolean): Promise<void> {
  log('Downloading rulings bulk data...');
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download rulings: ${response.status}`);
  }
  
  if (!response.body) {
    throw new Error('No response body');
  }
  
  const fileStream = createWriteStream(TEMP_FILE);
  
  // Convert web ReadableStream to Node.js Readable
  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
  
  if (isGzipped) {
    // Decompress gzipped content
    await pipeline(nodeStream, createGunzip(), fileStream);
  } else {
    await pipeline(nodeStream, fileStream);
  }
  
  log(`Downloaded and saved to ${TEMP_FILE}`);
}

/**
 * Parse the rulings file and return all rulings
 * Handles both JSON array and JSONL (newline-delimited JSON) formats
 */
async function parseRulingsFile(isJsonl: boolean): Promise<ScryfallRuling[]> {
  log('Parsing rulings file...');
  
  const fs = await import('fs/promises');
  const content = await fs.readFile(TEMP_FILE, 'utf-8');
  
  let rulings: ScryfallRuling[];
  
  if (isJsonl) {
    // JSONL format: one JSON object per line
    rulings = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as ScryfallRuling);
  } else {
    // Standard JSON array format
    rulings = JSON.parse(content) as ScryfallRuling[];
  }
  
  log(`Parsed ${rulings.length} rulings from file`);
  return rulings;
}

/**
 * Get count of existing rulings
 */
async function getExistingRulingsCount(): Promise<number> {
  const { count, error } = await supabase
    .from('ref_rulings')
    .select('*', { count: 'exact', head: true });
  
  if (error) throw error;
  return count ?? 0;
}

/**
 * Truncate the rulings table (for full sync)
 */
async function truncateRulings(): Promise<void> {
  if (DRY_RUN) {
    log('[DRY RUN] Would truncate ref_rulings');
    return;
  }
  
  log('Truncating ref_rulings table...');
  const { error } = await supabase.rpc('truncate_ref_rulings');
  
  // If RPC doesn't exist, try direct delete
  if (error) {
    const { error: deleteError } = await supabase
      .from('ref_rulings')
      .delete()
      .neq('id', 0); // Delete all rows
    
    if (deleteError) throw deleteError;
  }
  
  log('Truncated ref_rulings table');
}

/**
 * Upsert rulings into the database
 */
async function upsertRulings(rulings: ScryfallRuling[]): Promise<{ inserted: number; errors: number }> {
  if (DRY_RUN) {
    log(`[DRY RUN] Would upsert ${rulings.length} rulings`);
    return { inserted: rulings.length, errors: 0 };
  }
  
  let inserted = 0;
  let errors = 0;
  
  // Process in batches
  for (let i = 0; i < rulings.length; i += BATCH_SIZE) {
    const batch = rulings.slice(i, i + BATCH_SIZE);
    
    const rows: RefRulingInsert[] = batch.map(ruling => ({
      oracle_id: ruling.oracle_id,
      source: ruling.source,
      published_at: ruling.published_at,
      comment: ruling.comment,
    }));
    
    const { error } = await supabase
      .from('ref_rulings')
      .upsert(rows, { 
        onConflict: 'oracle_id,published_at,comment',
        ignoreDuplicates: true,
      });
    
    if (error) {
      console.error(`Error upserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    
    // Progress logging
    if ((i + BATCH_SIZE) % 10000 === 0 || i + BATCH_SIZE >= rulings.length) {
      log(`Progress: ${Math.min(i + BATCH_SIZE, rulings.length)} / ${rulings.length} rulings`);
    }
  }
  
  return { inserted, errors };
}

/**
 * Clean up temp file
 */
function cleanup() {
  if (existsSync(TEMP_FILE)) {
    unlinkSync(TEMP_FILE);
    verbose(`Cleaned up temp file: ${TEMP_FILE}`);
  }
}

/**
 * Main sync function
 */
async function main() {
  log('='.repeat(60));
  log('RULINGS SYNC');
  log('='.repeat(60));
  
  if (DRY_RUN) {
    log('DRY RUN MODE - no changes will be made');
  }
  
  if (FULL_SYNC) {
    log('FULL SYNC MODE - will truncate and reload all rulings');
  }
  
  try {
    // 1. Get existing count
    const existingCount = await getExistingRulingsCount();
    log(`Existing rulings in database: ${existingCount}`);
    
    // 2. Get download URL and format info
    const { url: downloadUrl, isGzipped, isJsonl } = await getRulingsBulkDataUrl();
    
    // 3. Download file
    await downloadRulingsFile(downloadUrl, isGzipped);
    
    // 4. Parse rulings
    const rulings = await parseRulingsFile(isJsonl);
    
    // 5. Full sync: truncate first
    if (FULL_SYNC && existingCount > 0) {
      await truncateRulings();
    }
    
    // 6. Upsert rulings
    log('Upserting rulings to database...');
    const { inserted, errors } = await upsertRulings(rulings);
    
    // 7. Get final count
    const finalCount = await getExistingRulingsCount();
    
    // 8. Cleanup
    cleanup();
    
    // 9. Summary
    log('');
    log('='.repeat(60));
    log('SYNC COMPLETE');
    log('='.repeat(60));
    log(`Rulings processed: ${rulings.length}`);
    log(`Rulings upserted: ${inserted}`);
    log(`Errors: ${errors}`);
    log(`Previous count: ${existingCount}`);
    log(`Final count: ${finalCount}`);
    log(`Net change: ${finalCount - existingCount}`);
    
  } catch (error) {
    console.error('Sync failed:', error);
    cleanup();
    process.exit(1);
  }
}

main();
