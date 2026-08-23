/**
 * Cleanup Corrupted EDHREC Insights
 * 
 * Removes insights created by the buggy sync that used Object.entries() on 
 * EDHREC's tag_counts array, resulting in:
 *   - build_variant = array indices ('0', '1', '2'...)
 *   - content containing "[object Object]" and "NaN%"
 * 
 * After cleanup, affected commanders need to be re-synced with:
 *   npx tsx scripts/sync-edhrec-data.ts --force
 * 
 * Usage:
 *   npx tsx scripts/cleanup-corrupted-edhrec-insights.ts              # Full cleanup
 *   npx tsx scripts/cleanup-corrupted-edhrec-insights.ts --dry-run    # Preview only
 *   npx tsx scripts/cleanup-corrupted-edhrec-insights.ts --verbose    # Show details
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function verbose(msg: string) {
  if (VERBOSE) log(`  ${msg}`);
}

async function main() {
  log('═'.repeat(60));
  log('CLEANUP CORRUPTED EDHREC INSIGHTS');
  log('═'.repeat(60));
  
  if (DRY_RUN) log('DRY RUN MODE - no database changes');
  
  // Find corrupted insights:
  // 1. build_variant is a numeric string (array index from Object.entries bug)
  // 2. source_type = 'edhrec'
  
  // First, let's count and identify affected commanders
  log('Finding corrupted insights...');
  
  // Get all EDHREC insights with numeric build_variant
  // Note: We check for patterns like '0', '1', '2'... up to '99'
  const { data: corrupted, error } = await supabase
    .from('ref_commander_insights')
    .select('id, commander_id, build_variant, content, source_type')
    .eq('source_type', 'edhrec')
    .or('build_variant.eq.0,build_variant.eq.1,build_variant.eq.2,build_variant.eq.3,build_variant.eq.4,build_variant.eq.5,build_variant.eq.6,build_variant.eq.7,build_variant.eq.8,build_variant.eq.9');
  
  if (error) {
    console.error('Error querying insights:', error);
    process.exit(1);
  }
  
  // Also check for higher numbers and [object Object] in content
  const { data: corruptedByContent, error: error2 } = await supabase
    .from('ref_commander_insights')
    .select('id, commander_id, build_variant, content, source_type')
    .eq('source_type', 'edhrec')
    .like('content', '%[object Object]%');
  
  if (error2) {
    console.error('Error querying insights by content:', error2);
    process.exit(1);
  }
  
  // Combine and dedupe
  const allCorrupted = new Map<string, typeof corrupted[0]>();
  for (const row of [...(corrupted || []), ...(corruptedByContent || [])]) {
    allCorrupted.set(row.id, row);
  }
  
  const corruptedList = Array.from(allCorrupted.values());
  
  if (corruptedList.length === 0) {
    log('No corrupted insights found!');
    return;
  }
  
  log(`Found ${corruptedList.length} corrupted insights`);
  
  // Group by commander
  const byCommander = new Map<string, typeof corruptedList>();
  for (const row of corruptedList) {
    const existing = byCommander.get(row.commander_id) || [];
    existing.push(row);
    byCommander.set(row.commander_id, existing);
  }
  
  log(`Affecting ${byCommander.size} commanders`);
  
  // Show sample of corrupted data
  if (VERBOSE) {
    log('');
    log('Sample corrupted insights:');
    for (const row of corruptedList.slice(0, 5)) {
      verbose(`ID: ${row.id}`);
      verbose(`  build_variant: "${row.build_variant}"`);
      verbose(`  content: "${row.content?.substring(0, 100)}..."`);
    }
  }
  
  // Get commander names for affected commanders
  const commanderIds = Array.from(byCommander.keys());
  const { data: commanders } = await supabase
    .from('ref_commanders')
    .select('id, display_name')
    .in('id', commanderIds.slice(0, 100)); // Batch limit
  
  const commanderNames = new Map(commanders?.map(c => [c.id, c.display_name]) || []);
  
  log('');
  log('Affected commanders (sample):');
  for (const [cmdId, rows] of Array.from(byCommander.entries()).slice(0, 10)) {
    const name = commanderNames.get(cmdId) || cmdId;
    log(`  ${name}: ${rows.length} corrupted insights`);
  }
  
  if (byCommander.size > 10) {
    log(`  ...and ${byCommander.size - 10} more commanders`);
  }
  
  // Delete corrupted insights
  if (!DRY_RUN) {
    log('');
    log('Deleting corrupted insights...');
    
    const idsToDelete = corruptedList.map(r => r.id);
    
    // Delete in batches of 200 to avoid URL length limits
    const BATCH_SIZE = 200;
    let deleted = 0;
    
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      const { error: deleteError } = await supabase
        .from('ref_commander_insights')
        .delete()
        .in('id', batch);
      
      if (deleteError) {
        console.error(`Error deleting batch ${i / BATCH_SIZE + 1}:`, deleteError);
      } else {
        deleted += batch.length;
        verbose(`Deleted batch ${i / BATCH_SIZE + 1}: ${batch.length} rows`);
      }
    }
    
    log(`Deleted ${deleted} corrupted insights`);
    
    // Reset edhrec_synced_at for affected commanders so they'll be re-synced
    log('');
    log('Resetting sync status for affected commanders...');
    
    for (let i = 0; i < commanderIds.length; i += BATCH_SIZE) {
      const batch = commanderIds.slice(i, i + BATCH_SIZE);
      const { error: updateError } = await supabase
        .from('ref_commanders')
        .update({ edhrec_synced_at: null })
        .in('id', batch);
      
      if (updateError) {
        console.error(`Error updating commanders batch ${i / BATCH_SIZE + 1}:`, updateError);
      }
    }
    
    log(`Reset ${commanderIds.length} commanders for re-sync`);
  }
  
  // Summary
  log('');
  log('═'.repeat(60));
  log('CLEANUP COMPLETE');
  log('═'.repeat(60));
  log(`Corrupted insights found: ${corruptedList.length}`);
  log(`Commanders affected: ${byCommander.size}`);
  
  if (DRY_RUN) {
    log('');
    log('Run without --dry-run to apply changes');
    log('Then run: npx tsx scripts/sync-edhrec-data.ts --force');
  } else {
    log('');
    log('Next step: Re-sync affected commanders with:');
    log('  npx tsx scripts/sync-edhrec-data.ts');
  }
}

main().catch(console.error);
