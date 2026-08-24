import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Fix commander_legal mismatches between ref_cards and ref_printings.
 * 
 * ref_printings has authoritative legality data from Scryfall's bulk sync.
 * ref_cards was populated by various sync scripts that may have had bugs.
 * 
 * This script:
 * 1. Finds cards where ref_cards.commander_legal doesn't match ref_printings.legality_commander
 * 2. Updates ref_cards to match ref_printings
 * 
 * Usage:
 *   npx tsx scripts/fix-commander-legality.ts --dry-run   # Preview changes
 *   npx tsx scripts/fix-commander-legality.ts             # Apply changes
 */
async function fixCommanderLegality() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`=== Fix Commander Legality Mismatches ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);
  
  // Step 1: Find cards marked as NOT legal in ref_cards but ARE legal in ref_printings
  console.log('Step 1: Finding false negatives (marked illegal but actually legal)...');
  
  // Paginate to get all cards (avoid 1000 row limit)
  const illegalCards: { name: string }[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from('ref_cards')
      .select('name')
      .eq('commander_legal', false)
      .range(offset, offset + PAGE_SIZE - 1);
    
    if (error || !data || data.length === 0) break;
    
    illegalCards.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  
  if (illegalCards.length === 0) {
    console.log('No cards with commander_legal=false found');
    return;
  }
  
  console.log(`  ref_cards has ${illegalCards.length} cards marked as not commander legal`);
  
  // Check ref_printings for these cards
  const cardNames = illegalCards.map(c => c.name);
  const shouldBeLegal: string[] = [];
  
  for (let i = 0; i < cardNames.length; i += 100) {
    const batch = cardNames.slice(i, i + 100);
    const { data: printings } = await supabase
      .from('ref_printings')
      .select('name, legality_commander')
      .in('name', batch)
      .eq('legality_commander', 'legal');
    
    if (printings) {
      const legalNames = [...new Set(printings.map(p => p.name))];
      shouldBeLegal.push(...legalNames);
    }
  }
  
  console.log(`  Found ${shouldBeLegal.length} cards that should be marked legal\n`);
  
  // Step 2: Find cards marked as LEGAL in ref_cards but are NOT legal in ref_printings
  console.log('Step 2: Finding false positives (marked legal but actually banned)...');
  
  const { data: legalCards } = await supabase
    .from('ref_cards')
    .select('name')
    .eq('commander_legal', true);
  
  const shouldBeBanned: string[] = [];
  
  if (legalCards && legalCards.length > 0) {
    const legalNames = legalCards.map(c => c.name);
    
    for (let i = 0; i < legalNames.length; i += 100) {
      const batch = legalNames.slice(i, i + 100);
      const { data: printings } = await supabase
        .from('ref_printings')
        .select('name, legality_commander')
        .in('name', batch)
        .in('legality_commander', ['banned', 'not_legal']);
      
      if (printings && printings.length > 0) {
        // Some cards may have multiple printings with different legalities
        // (e.g., some special versions may be not_legal)
        // Only mark as banned if ALL printings are banned/not_legal
        for (const p of printings) {
          // Check if this card has any legal printing
          const { data: legalPrinting } = await supabase
            .from('ref_printings')
            .select('name')
            .eq('name', p.name)
            .eq('legality_commander', 'legal')
            .limit(1);
          
          if (!legalPrinting || legalPrinting.length === 0) {
            shouldBeBanned.push(p.name);
          }
        }
      }
    }
    // Deduplicate
    const uniqueBanned = [...new Set(shouldBeBanned)];
    shouldBeBanned.length = 0;
    shouldBeBanned.push(...uniqueBanned);
  }
  
  console.log(`  Found ${shouldBeBanned.length} cards that should be marked banned\n`);
  
  // Step 3: Apply fixes
  if (shouldBeLegal.length > 0) {
    console.log(`Fixing ${shouldBeLegal.length} cards that should be legal:`);
    for (const name of shouldBeLegal.slice(0, 10)) {
      console.log(`  - ${name}`);
    }
    if (shouldBeLegal.length > 10) {
      console.log(`  ... and ${shouldBeLegal.length - 10} more`);
    }
    
    if (!dryRun) {
      for (let i = 0; i < shouldBeLegal.length; i += 100) {
        const batch = shouldBeLegal.slice(i, i + 100);
        const { error } = await supabase
          .from('ref_cards')
          .update({ commander_legal: true })
          .in('name', batch);
        
        if (error) {
          console.error(`  Error updating batch: ${error.message}`);
        }
      }
      console.log(`  Updated ${shouldBeLegal.length} cards to commander_legal=true`);
    }
  }
  
  if (shouldBeBanned.length > 0) {
    console.log(`\nFixing ${shouldBeBanned.length} cards that should be banned:`);
    for (const name of shouldBeBanned.slice(0, 10)) {
      console.log(`  - ${name}`);
    }
    if (shouldBeBanned.length > 10) {
      console.log(`  ... and ${shouldBeBanned.length - 10} more`);
    }
    
    if (!dryRun) {
      for (let i = 0; i < shouldBeBanned.length; i += 100) {
        const batch = shouldBeBanned.slice(i, i + 100);
        const { error } = await supabase
          .from('ref_cards')
          .update({ commander_legal: false })
          .in('name', batch);
        
        if (error) {
          console.error(`  Error updating batch: ${error.message}`);
        }
      }
      console.log(`  Updated ${shouldBeBanned.length} cards to commander_legal=false`);
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Cards fixed to legal: ${shouldBeLegal.length}`);
  console.log(`Cards fixed to banned: ${shouldBeBanned.length}`);
  
  if (dryRun) {
    console.log('\nNo changes made (dry run). Run without --dry-run to apply fixes.');
  } else {
    console.log('\nDone!');
  }
}

fixCommanderLegality();
