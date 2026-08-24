/**
 * Fix Invalid Scryfall IDs in deck_cards
 * 
 * Finds deck_cards rows where the scryfall_id doesn't exist in ref_printings
 * and replaces them with a valid printing for the same card name.
 * 
 * Usage:
 *   npx tsx scripts/fix-invalid-scryfall-ids.ts --dry-run   # Preview changes
 *   npx tsx scripts/fix-invalid-scryfall-ids.ts             # Apply fixes
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes('--dry-run');

interface DeckCard {
  id: number;
  card_name: string;
  scryfall_id: string | null;
  deck_id: number;
}

interface Printing {
  scryfall_id: string;
  name: string;
  set_code: string;
  price_usd: number | null;
  rarity: string;
}

async function findInvalidScryfallIds(): Promise<DeckCard[]> {
  console.log('Finding deck_cards with scryfall_ids...');
  
  // Get all deck_cards with scryfall_ids
  const allDeckCards: DeckCard[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('deck_cards')
      .select('id, card_name, scryfall_id, deck_id')
      .not('scryfall_id', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching deck_cards:', error.message);
      break;
    }

    if (data && data.length > 0) {
      allDeckCards.push(...(data as DeckCard[]));
      hasMore = data.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  console.log(`Found ${allDeckCards.length} deck_cards with scryfall_ids`);

  // Get unique scryfall_ids
  const uniqueIds = [...new Set(allDeckCards.map(dc => dc.scryfall_id).filter(Boolean))] as string[];
  console.log(`Checking ${uniqueIds.length} unique scryfall_ids against ref_printings...`);

  // Check which ones exist in ref_printings AND have a price (batch to avoid URL limits)
  const validIdsWithPrice = new Set<string>();
  const validIdsNoPrice = new Set<string>();
  const BATCH_SIZE = 200;

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    const { data: printings } = await supabase
      .from('ref_printings')
      .select('scryfall_id, price_usd')
      .in('scryfall_id', batch);

    for (const p of printings ?? []) {
      if (p.price_usd !== null) {
        validIdsWithPrice.add(p.scryfall_id);
      } else {
        validIdsNoPrice.add(p.scryfall_id);
      }
    }
  }

  console.log(`Found ${validIdsWithPrice.size} scryfall_ids with prices`);
  console.log(`Found ${validIdsNoPrice.size} scryfall_ids with null prices`);

  // Find deck_cards that are either invalid OR have null price
  const invalidOrNullPrice = allDeckCards.filter(dc => {
    if (!dc.scryfall_id) return false;
    // Invalid if not found at all
    if (!validIdsWithPrice.has(dc.scryfall_id) && !validIdsNoPrice.has(dc.scryfall_id)) return true;
    // Also include if found but has null price
    if (validIdsNoPrice.has(dc.scryfall_id)) return true;
    return false;
  });
  
  console.log(`Found ${invalidOrNullPrice.length} deck_cards needing fix (invalid or null price)`);

  return invalidOrNullPrice;
}

async function findBestPrinting(cardName: string): Promise<Printing | null> {
  // Find the best available printing for a card:
  // Prefer: has reasonable price ($0.01-$50), common rarity, recent sets
  const { data: printings } = await supabase
    .from('ref_printings')
    .select('scryfall_id, name, set_code, price_usd, rarity')
    .eq('name', cardName)
    .not('price_usd', 'is', null)
    .gt('price_usd', 0)
    .lt('price_usd', 50) // Exclude premium versions like Guru lands
    .order('price_usd', { ascending: true }) // Prefer cheaper (more common) printings
    .limit(10);

  if (printings && printings.length > 0) {
    return printings[0] as Printing;
  }

  // Fall back to any printing with a price (including expensive ones)
  const { data: anyWithPrice } = await supabase
    .from('ref_printings')
    .select('scryfall_id, name, set_code, price_usd, rarity')
    .eq('name', cardName)
    .not('price_usd', 'is', null)
    .order('price_usd', { ascending: true })
    .limit(1);

  if (anyWithPrice && anyWithPrice.length > 0) {
    return anyWithPrice[0] as Printing;
  }

  // Fall back to any printing at all
  const { data: anyPrinting } = await supabase
    .from('ref_printings')
    .select('scryfall_id, name, set_code, price_usd, rarity')
    .eq('name', cardName)
    .limit(1);

  return anyPrinting?.[0] as Printing ?? null;
}

async function fixInvalidIds(invalidCards: DeckCard[]): Promise<void> {
  // Group by card_name to minimize lookups
  const byCardName = new Map<string, DeckCard[]>();
  for (const dc of invalidCards) {
    const existing = byCardName.get(dc.card_name) || [];
    existing.push(dc);
    byCardName.set(dc.card_name, existing);
  }

  console.log(`\nProcessing ${byCardName.size} unique card names...`);

  let fixed = 0;
  let skipped = 0;

  for (const [cardName, deckCards] of byCardName) {
    const bestPrinting = await findBestPrinting(cardName);

    if (!bestPrinting) {
      console.log(`  ❌ ${cardName}: No valid printing found in ref_printings`);
      skipped += deckCards.length;
      continue;
    }

    const ids = deckCards.map(dc => dc.id);
    const oldIds = [...new Set(deckCards.map(dc => dc.scryfall_id))];

    if (DRY_RUN) {
      console.log(`  🔍 ${cardName}: Would update ${ids.length} rows`);
      console.log(`      Old: ${oldIds.join(', ')}`);
      console.log(`      New: ${bestPrinting.scryfall_id} (${bestPrinting.set_code}, $${bestPrinting.price_usd ?? 'N/A'})`);
    } else {
      const { error } = await supabase
        .from('deck_cards')
        .update({ scryfall_id: bestPrinting.scryfall_id })
        .in('id', ids);

      if (error) {
        console.log(`  ❌ ${cardName}: Update failed - ${error.message}`);
        skipped += deckCards.length;
      } else {
        console.log(`  ✅ ${cardName}: Updated ${ids.length} rows → ${bestPrinting.set_code} ($${bestPrinting.price_usd ?? 'N/A'})`);
        fixed += deckCards.length;
      }
    }
  }

  console.log(`\n${DRY_RUN ? 'Would fix' : 'Fixed'}: ${fixed} rows`);
  console.log(`Skipped: ${skipped} rows (no valid printing found)`);
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fix Invalid Scryfall IDs ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  const invalidCards = await findInvalidScryfallIds();

  if (invalidCards.length === 0) {
    console.log('\n✅ No invalid scryfall_ids found!');
    return;
  }

  // Show sample of invalid cards
  console.log('\nSample of invalid entries:');
  const sample = invalidCards.slice(0, 5);
  for (const dc of sample) {
    console.log(`  - ${dc.card_name} (deck ${dc.deck_id}): ${dc.scryfall_id}`);
  }
  if (invalidCards.length > 5) {
    console.log(`  ... and ${invalidCards.length - 5} more`);
  }

  await fixInvalidIds(invalidCards);

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

main().catch(console.error);
