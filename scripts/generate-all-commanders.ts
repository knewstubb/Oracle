/**
 * Generate all valid commander combinations
 * 
 * Pre-generates the full ref_commanders reference table:
 * - All single commanders (~1,500+)
 * - Generic Partner combos (C(58,2) = 1,653)
 * - Background combos (32 creatures × 30 backgrounds = 960)
 * - Doctor's Companion combos (18 × 27 = 486)
 * - Friends Forever combos (C(7,2) = 21)
 * - Partner With pairs (19 fixed)
 * 
 * Usage: npx tsx scripts/generate-all-commanders.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env
config({ path: resolve(__dirname, '../.env.local') });

import { 
  slugify,
  setSupabaseClient 
} from '../src/lib/commander-resolver';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
setSupabaseClient(supabase);

interface CardInfo {
  name: string;
  colorIdentity: string;
  oracleText: string | null;
  typeLine: string;
  keyword: 'partner' | 'partner_with' | 'friends_forever' | 'background_chooser' | 'background' | 'doctors_companion' | 'doctor' | 'single';
  partnerWith?: string;
}

interface CommanderInsert {
  canonical_key: string;
  display_name: string;
  color_identity: string;
  leadership_type: string;
  legal_commander: boolean;
  legal_oathbreaker: boolean;
  legal_brawl: boolean;
}

interface CommanderCardInsert {
  commander_id: string;
  card_name: string;
  card_role: string;
  position: number;
  is_flexible: boolean;
}

/**
 * Combine color identities from multiple cards
 */
function combineColorIdentity(identities: string[]): string {
  const colors = new Set<string>();
  const order = 'WUBRG';
  
  for (const identity of identities) {
    for (const char of identity.toUpperCase()) {
      if (order.includes(char)) {
        colors.add(char);
      }
    }
  }
  
  return order.split('').filter(c => colors.has(c)).join('');
}

/**
 * Detect commander keyword from oracle text and type line
 */
function detectKeyword(oracleText: string | null, typeLine: string): {
  keyword: CardInfo['keyword'];
  partnerWith?: string;
} {
  const text = (oracleText ?? '').toLowerCase();
  const type = typeLine.toLowerCase();
  
  // Partner with X (must check before generic Partner)
  const partnerWithMatch = text.match(/partner with ([^(]+)/i);
  if (partnerWithMatch) {
    return { keyword: 'partner_with', partnerWith: partnerWithMatch[1].trim() };
  }
  
  // Friends forever
  if (text.includes('friends forever')) {
    return { keyword: 'friends_forever' };
  }
  
  // Doctor's Companion - check BEFORE checking for doctor type
  if (text.includes("doctor's companion")) {
    return { keyword: 'doctors_companion' };
  }
  
  // Check if card is a Doctor (has "Doctor" creature type - "Time Lord, Doctor" or similar)
  // Must check type_line, not oracle_text
  if (type.includes('time lord') && type.includes('doctor')) {
    return { keyword: 'doctor' };
  }
  
  // Choose a Background
  if (text.includes('choose a background')) {
    return { keyword: 'background_chooser' };
  }
  
  // Generic Partner - must check that it's not "partner with" or "doctor's companion"
  if (/\bpartner\b/i.test(text) && !text.includes('partner with') && !text.includes("doctor's companion")) {
    return { keyword: 'partner' };
  }
  
  // Background type - check type line
  if (type.includes('background')) {
    return { keyword: 'background' };
  }
  
  return { keyword: 'single' };
}

async function main() {
  console.log('Generating all valid commander combinations...\n');
  
  // Fetch all cards that can be commanders (paginated)
  console.log('Fetching commander-eligible cards from ref_cards...');
  const cards: { name: string; color_identity: string; oracle_text: string | null; type_line: string }[] = [];
  let cardOffset = 0;
  const cardPageSize = 1000;
  
  while (true) {
    const { data: batch, error } = await supabase
      .from('ref_cards')
      .select('name, color_identity, oracle_text, type_line')
      .eq('can_be_commander', true)
      .eq('commander_legal', true)
      .range(cardOffset, cardOffset + cardPageSize - 1);
    
    if (error) {
      console.error('Failed to fetch cards:', error);
      process.exit(1);
    }
    
    if (!batch || batch.length === 0) break;
    
    cards.push(...batch);
    
    if (batch.length < cardPageSize) break;
    cardOffset += cardPageSize;
  }
  
  console.log(`Found ${cards.length} commander-eligible cards\n`);
  
  // Classify all cards by their keyword
  const cardsByKeyword: Record<CardInfo['keyword'], CardInfo[]> = {
    single: [],
    partner: [],
    partner_with: [],
    friends_forever: [],
    background_chooser: [],
    background: [],
    doctors_companion: [],
    doctor: []
  };
  
  const partnerWithPairs: Map<string, string> = new Map(); // card name -> partner name
  
  for (const card of cards) {
    const { keyword, partnerWith } = detectKeyword(card.oracle_text, card.type_line);
    
    const info: CardInfo = {
      name: card.name,
      colorIdentity: card.color_identity,
      oracleText: card.oracle_text,
      typeLine: card.type_line,
      keyword,
      partnerWith
    };
    
    cardsByKeyword[keyword].push(info);
    
    if (keyword === 'partner_with' && partnerWith) {
      partnerWithPairs.set(card.name, partnerWith);
    }
  }
  
  console.log('Card classification:');
  for (const [kw, list] of Object.entries(cardsByKeyword)) {
    console.log(`  ${kw}: ${list.length}`);
  }
  console.log();
  
  // Track combinations to insert
  const commanders: CommanderInsert[] = [];
  const commanderCards: Map<string, CommanderCardInsert[]> = new Map(); // canonical_key -> cards
  const existingKeys = new Set<string>();
  
  // Fetch existing canonical keys to avoid duplicates (paginated)
  console.log('Fetching existing commanders...');
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data: existing, error: fetchError } = await supabase
      .from('ref_commanders')
      .select('canonical_key')
      .range(offset, offset + pageSize - 1);
    
    if (fetchError || !existing || existing.length === 0) break;
    
    for (const row of existing) {
      existingKeys.add(row.canonical_key);
    }
    
    if (existing.length < pageSize) break;
    offset += pageSize;
  }
  console.log(`Found ${existingKeys.size} existing commanders\n`);
  
  // 1. SINGLE COMMANDERS
  console.log('Generating single commanders...');
  const singleCount = { total: 0, new: 0 };
  
  for (const card of cards) {
    const key = slugify(card.name);
    singleCount.total++;
    
    if (existingKeys.has(key)) continue;
    
    singleCount.new++;
    commanders.push({
      canonical_key: key,
      display_name: card.name,
      color_identity: card.color_identity,
      leadership_type: 'single',
      legal_commander: true,
      legal_oathbreaker: false,
      legal_brawl: true
    });
    
    commanderCards.set(key, [{
      commander_id: '', // Will be filled after insert
      card_name: card.name,
      card_role: 'commander',
      position: 1,
      is_flexible: false
    }]);
  }
  console.log(`  Total: ${singleCount.total}, New: ${singleCount.new}`);
  
  // 2. GENERIC PARTNER COMBOS (C(n,2))
  console.log('\nGenerating generic partner combos...');
  const partners = cardsByKeyword.partner;
  const partnerCount = { total: 0, new: 0 };
  
  for (let i = 0; i < partners.length; i++) {
    for (let j = i + 1; j < partners.length; j++) {
      const [a, b] = [partners[i], partners[j]].sort((x, y) => x.name.localeCompare(y.name));
      const key = `${slugify(a.name)}//${slugify(b.name)}`;
      partnerCount.total++;
      
      if (existingKeys.has(key)) continue;
      
      partnerCount.new++;
      commanders.push({
        canonical_key: key,
        display_name: `${a.name} & ${b.name}`,
        color_identity: combineColorIdentity([a.colorIdentity, b.colorIdentity]),
        leadership_type: 'partner',
        legal_commander: true,
        legal_oathbreaker: false,
        legal_brawl: false
      });
      
      commanderCards.set(key, [
        { commander_id: '', card_name: a.name, card_role: 'partner', position: 1, is_flexible: false },
        { commander_id: '', card_name: b.name, card_role: 'partner', position: 2, is_flexible: false }
      ]);
    }
  }
  console.log(`  Total: ${partnerCount.total}, New: ${partnerCount.new}`);
  
  // 3. BACKGROUND COMBOS
  console.log('\nGenerating background combos...');
  const backgroundChoosers = cardsByKeyword.background_chooser;
  const backgrounds = cardsByKeyword.background;
  const backgroundCount = { total: 0, new: 0 };
  
  for (const chooser of backgroundChoosers) {
    for (const bg of backgrounds) {
      const key = `${slugify(chooser.name)}+${slugify(bg.name)}`;
      backgroundCount.total++;
      
      if (existingKeys.has(key)) continue;
      
      backgroundCount.new++;
      commanders.push({
        canonical_key: key,
        display_name: `${chooser.name} + ${bg.name}`,
        color_identity: combineColorIdentity([chooser.colorIdentity, bg.colorIdentity]),
        leadership_type: 'background',
        legal_commander: true,
        legal_oathbreaker: false,
        legal_brawl: false
      });
      
      commanderCards.set(key, [
        { commander_id: '', card_name: chooser.name, card_role: 'commander', position: 1, is_flexible: false },
        { commander_id: '', card_name: bg.name, card_role: 'background', position: 2, is_flexible: false }
      ]);
    }
  }
  console.log(`  Total: ${backgroundCount.total}, New: ${backgroundCount.new}`);
  
  // 4. DOCTOR'S COMPANION COMBOS
  console.log('\nGenerating Doctor\'s Companion combos...');
  const doctors = cardsByKeyword.doctor;
  const companions = cardsByKeyword.doctors_companion;
  const doctorCount = { total: 0, new: 0 };
  
  for (const doctor of doctors) {
    for (const companion of companions) {
      const [a, b] = [doctor, companion].sort((x, y) => x.name.localeCompare(y.name));
      const key = `${slugify(a.name)}//${slugify(b.name)}`;
      doctorCount.total++;
      
      if (existingKeys.has(key)) continue;
      
      doctorCount.new++;
      commanders.push({
        canonical_key: key,
        display_name: `${doctor.name} & ${companion.name}`,
        color_identity: combineColorIdentity([doctor.colorIdentity, companion.colorIdentity]),
        leadership_type: 'partner', // Doctor's Companion functions like partner
        legal_commander: true,
        legal_oathbreaker: false,
        legal_brawl: false
      });
      
      commanderCards.set(key, [
        { commander_id: '', card_name: a.name, card_role: 'partner', position: 1, is_flexible: false },
        { commander_id: '', card_name: b.name, card_role: 'partner', position: 2, is_flexible: false }
      ]);
    }
  }
  console.log(`  Total: ${doctorCount.total}, New: ${doctorCount.new}`);
  
  // 5. FRIENDS FOREVER COMBOS
  console.log('\nGenerating Friends Forever combos...');
  const friendsForever = cardsByKeyword.friends_forever;
  const friendsCount = { total: 0, new: 0 };
  
  for (let i = 0; i < friendsForever.length; i++) {
    for (let j = i + 1; j < friendsForever.length; j++) {
      const [a, b] = [friendsForever[i], friendsForever[j]].sort((x, y) => x.name.localeCompare(y.name));
      const key = `${slugify(a.name)}//${slugify(b.name)}`;
      friendsCount.total++;
      
      if (existingKeys.has(key)) continue;
      
      friendsCount.new++;
      commanders.push({
        canonical_key: key,
        display_name: `${a.name} & ${b.name}`,
        color_identity: combineColorIdentity([a.colorIdentity, b.colorIdentity]),
        leadership_type: 'friends_forever',
        legal_commander: true,
        legal_oathbreaker: false,
        legal_brawl: false
      });
      
      commanderCards.set(key, [
        { commander_id: '', card_name: a.name, card_role: 'partner', position: 1, is_flexible: false },
        { commander_id: '', card_name: b.name, card_role: 'partner', position: 2, is_flexible: false }
      ]);
    }
  }
  console.log(`  Total: ${friendsCount.total}, New: ${friendsCount.new}`);
  
  // 6. PARTNER WITH PAIRS
  console.log('\nGenerating Partner With pairs...');
  const partnerWithCount = { total: 0, new: 0 };
  const processedPairs = new Set<string>();
  
  for (const card of cardsByKeyword.partner_with) {
    if (!card.partnerWith) continue;
    
    // Find the partner card
    const partnerCard = cards.find(c => c.name.toLowerCase() === card.partnerWith!.toLowerCase());
    if (!partnerCard) continue;
    
    const [a, b] = [card, { ...partnerCard, colorIdentity: partnerCard.color_identity }]
      .sort((x, y) => x.name.localeCompare(y.name));
    
    const pairKey = `${a.name}||${b.name}`;
    if (processedPairs.has(pairKey)) continue;
    processedPairs.add(pairKey);
    
    const key = `${slugify(a.name)}//${slugify(b.name)}`;
    partnerWithCount.total++;
    
    if (existingKeys.has(key)) continue;
    
    partnerWithCount.new++;
    commanders.push({
      canonical_key: key,
      display_name: `${a.name} & ${b.name}`,
      color_identity: combineColorIdentity([a.colorIdentity, b.colorIdentity]),
      leadership_type: 'partner_with',
      legal_commander: true,
      legal_oathbreaker: false,
      legal_brawl: false
    });
    
    commanderCards.set(key, [
      { commander_id: '', card_name: a.name, card_role: 'partner', position: 1, is_flexible: false },
      { commander_id: '', card_name: b.name, card_role: 'partner', position: 2, is_flexible: false }
    ]);
  }
  console.log(`  Total: ${partnerWithCount.total}, New: ${partnerWithCount.new}`);
  
  // Summary before insert
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`New commanders to insert: ${commanders.length}`);
  console.log(`New commander cards to insert: ${Array.from(commanderCards.values()).flat().length}`);
  
  if (commanders.length === 0) {
    console.log('\nNo new commanders to insert. Database is up to date.');
    return;
  }
  
  // Insert in batches
  console.log('\nInserting commanders...');
  const batchSize = 500;
  let inserted = 0;
  let cardInserted = 0;
  
  for (let i = 0; i < commanders.length; i += batchSize) {
    const batch = commanders.slice(i, i + batchSize);
    
    const { data: insertedCommanders, error: insertError } = await supabase
      .from('ref_commanders')
      .insert(batch)
      .select('id, canonical_key');
    
    if (insertError) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError);
      continue;
    }
    
    inserted += insertedCommanders?.length || 0;
    
    // Insert corresponding cards
    if (insertedCommanders) {
      const cardBatch: CommanderCardInsert[] = [];
      
      for (const cmd of insertedCommanders) {
        const cards = commanderCards.get(cmd.canonical_key);
        if (cards) {
          for (const card of cards) {
            cardBatch.push({ ...card, commander_id: cmd.id });
          }
        }
      }
      
      if (cardBatch.length > 0) {
        const { error: cardError } = await supabase
          .from('ref_commander_cards')
          .insert(cardBatch);
        
        if (cardError) {
          console.error('Error inserting cards:', cardError);
        } else {
          cardInserted += cardBatch.length;
        }
      }
    }
    
    process.stdout.write(`\r  Inserted ${inserted}/${commanders.length} commanders, ${cardInserted} cards`);
  }
  
  // Final counts
  const { count: finalCommanderCount } = await supabase
    .from('ref_commanders')
    .select('*', { count: 'exact', head: true });
  
  const { count: finalCardCount } = await supabase
    .from('ref_commander_cards')
    .select('*', { count: 'exact', head: true });
  
  console.log('\n\n' + '='.repeat(60));
  console.log('FINAL DATABASE STATE');
  console.log('='.repeat(60));
  console.log(`ref_commanders: ${finalCommanderCount} rows`);
  console.log(`ref_commander_cards: ${finalCardCount} rows`);
}

main().catch(console.error);
