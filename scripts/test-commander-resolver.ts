/**
 * Test script for commander resolver
 * 
 * Usage: npx tsx scripts/test-commander-resolver.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env
config({ path: resolve(__dirname, '../.env.local') });

import { 
  resolveCommander, 
  parseCommanderString, 
  slugify,
  setSupabaseClient 
} from '../src/lib/commander-resolver';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

// Inject the client for script use
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
setSupabaseClient(supabase);

// Test cases covering different commander types
const testCases = [
  // Single commanders
  'Prosper, Tome-Bound',
  'Atraxa, Praetors\' Voice',
  'Korvold, Fae-Cursed King',
  
  // Partner pairs (// separator)
  'Thrasios, Triton Hero // Tymna the Weaver',
  'Breeches, Brazen Plunderer // Malcolm, Keen-Eyed Navigator',
  'Krark, the Thumbless // Sakashima of a Thousand Faces',
  
  // Partner with (specific partners)
  'Pir, Imaginative Rascal // Toothy, Imaginary Friend',
  'Cazur, Ruthless Stalker // Ukkima, Stalking Shadow',
  
  // Background combos
  'Baeloth Barrityl, Entertainer // Raised by Giants',
  'Burakos, Party Leader // Folk Hero',
  'Wilson, Refined Grizzly + Raised by Giants',
  
  // Friends Forever
  'The Tenth Doctor // Rose Tyler',
  
  // Alternative separators
  'Tymna the Weaver and Thrasios, Triton Hero',
  'Malcolm, Keen-Eyed Navigator / Breeches, Brazen Plunderer',
  
  // Edge cases
  'Adrix and Nev, Twincasters', // "and" in card name, single commander
  'Elesh Norn, Mother of Machines', // Comma in name
];

async function runTests() {
  console.log('Testing parseCommanderString:');
  console.log('─'.repeat(60));
  
  for (const test of testCases) {
    const parsed = parseCommanderString(test);
    console.log(`"${test}"`);
    console.log(`  → [${parsed.map(p => `"${p}"`).join(', ')}]`);
    console.log();
  }
  
  console.log('\nTesting slugify:');
  console.log('─'.repeat(60));
  
  const slugTests = [
    'Thrasios, Triton Hero',
    'Tymna the Weaver',
    'Adrix and Nev, Twincasters',
    'Atraxa, Praetors\' Voice',
    'Wilson, Refined Grizzly'
  ];
  
  for (const test of slugTests) {
    console.log(`"${test}" → "${slugify(test)}"`);
  }
  
  console.log('\nTesting full resolution (requires database):');
  console.log('─'.repeat(60));
  
  for (const test of testCases.slice(0, 10)) {
    try {
      const resolved = await resolveCommander(test);
      if (resolved) {
        console.log(`\n"${test}"`);
        console.log(`  Type: ${resolved.commanderType}`);
        console.log(`  Key: ${resolved.canonicalKey}`);
        console.log(`  Display: ${resolved.displayName}`);
        console.log(`  Colors: ${resolved.colorIdentity || '(colorless)'}`);
        console.log(`  Cards: ${resolved.cards.map(c => `${c.cardName} (${c.role})`).join(', ')}`);
      } else {
        console.log(`\n"${test}" → Could not resolve (card not found)`);
      }
    } catch (err) {
      console.log(`\n"${test}" → Error: ${err}`);
    }
  }
  
  console.log('\n\nDone!');
}

runTests().catch(console.error);
