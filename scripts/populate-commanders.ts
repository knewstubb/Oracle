/**
 * Populate ref_commanders from raw_content
 * 
 * Reads unique card_name values from SQLite raw_content,
 * resolves them to commander structures, and saves to Supabase.
 * 
 * Usage: npx tsx scripts/populate-commanders.ts
 */

import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env
config({ path: resolve(__dirname, '../.env.local') });

import { 
  resolveCommander, 
  saveCommander,
  setSupabaseClient,
  type ResolvedCommander
} from '../src/lib/commander-resolver';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
setSupabaseClient(supabase);

// Open SQLite
const db = new Database(resolve(__dirname, '../data/content-raw.sqlite'), { readonly: true });

interface Stats {
  total: number;
  resolved: number;
  saved: number;
  skipped: number;
  failed: string[];
  byType: Record<string, number>;
}

async function main() {
  console.log('Populating ref_commanders from raw_content...\n');
  
  // Get unique card names
  const rows = db.prepare(`
    SELECT DISTINCT card_name, COUNT(*) as content_count
    FROM raw_content
    WHERE card_name IS NOT NULL AND card_name != ''
    GROUP BY card_name
    ORDER BY content_count DESC
  `).all() as { card_name: string; content_count: number }[];
  
  console.log(`Found ${rows.length} unique commander references in raw content\n`);
  
  const stats: Stats = {
    total: rows.length,
    resolved: 0,
    saved: 0,
    skipped: 0,
    failed: [],
    byType: {}
  };
  
  // Process in batches for progress visibility
  const batchSize = 50;
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    
    for (const row of batch) {
      const cardName = row.card_name;
      
      // Skip obvious non-commander content (sentences, descriptions)
      if (
        cardName.length > 100 ||
        cardName.includes(' is ') ||
        cardName.includes(' are ') ||
        cardName.includes(' can ') ||
        cardName.includes(' will ') ||
        cardName.includes(' you ') ||
        cardName.includes(' your ') ||
        cardName.includes(' deck ') ||
        cardName.includes(' this ') ||
        cardName.includes(' that ') ||
        cardName.includes(' which ') ||
        cardName.includes(' when ') ||
        cardName.startsWith('The ') && cardName.split(' ').length > 5
      ) {
        stats.skipped++;
        continue;
      }
      
      try {
        const resolved = await resolveCommander(cardName);
        
        if (!resolved) {
          stats.skipped++;
          continue;
        }
        
        stats.resolved++;
        stats.byType[resolved.commanderType] = (stats.byType[resolved.commanderType] || 0) + 1;
        
        const id = await saveCommander(resolved);
        
        if (id) {
          stats.saved++;
        }
      } catch (err) {
        stats.failed.push(cardName);
      }
    }
    
    // Progress update
    const progress = Math.min(i + batchSize, rows.length);
    process.stdout.write(`\rProcessed ${progress}/${rows.length} (${stats.saved} saved, ${stats.skipped} skipped)`);
  }
  
  console.log('\n\n--- Summary ---');
  console.log(`Total references: ${stats.total}`);
  console.log(`Resolved: ${stats.resolved}`);
  console.log(`Saved to DB: ${stats.saved}`);
  console.log(`Skipped (noise/not found): ${stats.skipped}`);
  console.log(`Failed: ${stats.failed.length}`);
  
  console.log('\nBy commander type:');
  for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  
  if (stats.failed.length > 0 && stats.failed.length < 20) {
    console.log('\nFailed entries:');
    for (const f of stats.failed) {
      console.log(`  - ${f}`);
    }
  }
  
  // Verify final counts
  const { count: commanderCount } = await supabase
    .from('ref_commanders')
    .select('*', { count: 'exact', head: true });
  
  const { count: cardCount } = await supabase
    .from('ref_commander_cards')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\nDatabase state:`);
  console.log(`  ref_commanders: ${commanderCount} rows`);
  console.log(`  ref_commander_cards: ${cardCount} rows`);
}

main().catch(console.error).finally(() => db.close());
