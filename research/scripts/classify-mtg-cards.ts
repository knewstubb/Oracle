/**
 * Rule-based card classification for the full mtg_cards table.
 * Applies the taxonomy from docs/category-taxonomy.md to all 32K+ cards.
 * 
 * Run: npx tsx scripts/classify-mtg-cards.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface Card {
  name: string
  type_line: string
  oracle_text: string
}

interface Classification {
  primary: string
  secondary: string[]
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

// ---------------------------------------------------------------------------
// Classification Rules (from taxonomy)
// ---------------------------------------------------------------------------

function classifyCard(card: Card): Classification {
  const text = (card.oracle_text || '').toLowerCase()
  const type = (card.type_line || '').toLowerCase()
  
  const secondary: string[] = []
  
  // --- RAMP ---
  if (text.includes('{t}: add {') || text.includes('{t}: add one mana') || text.includes('{t}: add {c}{c}')) {
    if (type.includes('artifact') && !type.includes('creature')) {
      return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Mana rock' }
    }
  }
  
  if (type.includes('creature') && (text.includes('{t}: add {') || text.includes('{t}: add one mana') || text.includes('{t}: add one mana of any'))) {
    return { primary: 'Ramp', secondary: ['Creature'], confidence: 'high', notes: 'Mana dork' }
  }
  
  if (text.includes('search your library for') && text.includes('land') && text.includes('onto the battlefield')) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Land ramp' }
  }
  
  if (text.includes('sacrifice') && text.includes('search your library for') && text.includes('basic land')) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Land ramp' }
  }
  
  if (text.includes('create a lander token') || text.includes('lander token')) {
    return { primary: 'Ramp', secondary: ['Utility:Tokens'], confidence: 'high', notes: 'Lander token' }
  }
  
  if (text.includes('spells you cast cost') && text.includes('less to cast')) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Cost reduction' }
  }
  if (text.includes('spell costs {1} less') || text.includes('spells cost {1} less')) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Cost reduction' }
  }
  
  if (text.match(/add \{[wubrg]\}\{[wubrg]\}\{[wubrg]\}/i) && (type.includes('instant') || type.includes('sorcery'))) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Ritual' }
  }
  
  if (text.includes('create a treasure token') || text.includes('create two treasure') || text.includes('create three treasure')) {
    if (!type.includes('creature')) {
      return { primary: 'Ramp', secondary: ['Utility:Tokens'], confidence: 'high', notes: 'Treasure generator' }
    }
    secondary.push('Ramp')
  }

  // --- CARD DRAW ---
  if (text.includes('draw three cards') || text.includes('draw four cards') || text.includes('draw five cards')) {
    return { primary: 'Draw', secondary, confidence: 'high' }
  }
  if (/draw two cards(?!\. you may discard)/.test(text) && !text.includes('target opponent')) {
    if (!type.includes('creature')) {
      return { primary: 'Draw', secondary, confidence: 'high' }
    }
  }
  
  if (text.includes('draw a card for each') && (text.includes('creature') || text.includes('permanent'))) {
    return { primary: 'Draw', secondary, confidence: 'high', notes: 'Scaling draw' }
  }
  
  if ((type.includes('instant') || type.includes('sorcery')) && text.includes('draw a card') && !text.includes('whenever')) {
    return { primary: 'Draw', secondary: ['Utility:Selection'], confidence: 'high', notes: 'Cantrip' }
  }
  
  if (text.includes('whenever') && text.includes('draw a card') && !type.includes('creature')) {
    return { primary: 'Engine', secondary: ['Draw'], confidence: 'high', notes: 'Draw engine' }
  }
  
  if (type.includes('creature') && text.includes('whenever') && text.includes('draw a card')) {
    return { primary: 'Engine', secondary: ['Draw', 'Creature'], confidence: 'high', notes: 'Draw engine creature' }
  }
  
  if (text.includes('exile the top') && text.includes('you may play')) {
    return { primary: 'Draw', secondary, confidence: 'medium', notes: 'Impulse draw' }
  }
  
  if (text.includes('scry') && text.includes('draw a card') && (type.includes('instant') || type.includes('sorcery'))) {
    return { primary: 'Draw', secondary: ['Utility:Selection'], confidence: 'high', notes: 'Cantrip with selection' }
  }
  
  if (text.includes('scry') && !text.includes('draw') && !text.includes('destroy') && !text.includes('damage')) {
    secondary.push('Utility:Selection')
  }

  // --- REMOVAL ---
  if (text.includes('destroy target creature') || text.includes('destroy target artifact') || 
      text.includes('destroy target enchantment') || text.includes('destroy target permanent')) {
    if (!type.includes('creature')) {
      return { primary: 'Removal', secondary, confidence: 'high' }
    }
    secondary.push('Removal')
  }
  
  if (text.includes('exile target creature') || text.includes('exile target permanent') ||
      text.includes('exile target artifact') || text.includes('exile target enchantment')) {
    if (!type.includes('creature')) {
      return { primary: 'Removal', secondary, confidence: 'high' }
    }
    secondary.push('Removal')
  }
  
  if (text.includes('destroy all creatures') || text.includes('destroy all nonland') ||
      text.includes('exile all creatures') || (text.includes('deals') && text.includes('to each creature'))) {
    return { primary: 'Removal:Mass', secondary, confidence: 'high', notes: 'Board wipe' }
  }
  
  if (/target creature gets -\d+\/-\d+/.test(text) || /gets -x\/-x/.test(text)) {
    if (!type.includes('creature')) {
      return { primary: 'Removal', secondary, confidence: 'high' }
    }
    secondary.push('Removal')
  }
  
  if (/deals \d+ damage to target creature/.test(text) || text.includes('deals x damage to target creature')) {
    if (!type.includes('creature')) {
      return { primary: 'Removal', secondary, confidence: 'high' }
    }
    secondary.push('Removal')
  }
  
  if (text.includes('target creature you control fights') || text.includes('it fights')) {
    secondary.push('Removal')
  }
  
  if (text.includes('target player sacrifices a creature') || text.includes('each opponent sacrifices')) {
    return { primary: 'Removal', secondary, confidence: 'high' }
  }
  
  if (text.includes('return target') && text.includes("to its owner's hand")) {
    return { primary: 'Removal:Tempo', secondary, confidence: 'high' }
  }

  // --- COUNTERSPELLS ---
  if (text.includes('counter target spell')) {
    if (text.includes('unless') || text.includes('pays')) {
      return { primary: 'Counterspell:Conditional', secondary, confidence: 'high' }
    }
    return { primary: 'Counterspell', secondary, confidence: 'high' }
  }
  if (text.includes('counter target activated') || text.includes('counter target triggered')) {
    return { primary: 'Counterspell:Ability', secondary, confidence: 'high' }
  }

  // --- TUTORS ---
  if (text.includes('search your library for a card') || text.includes('search your library for a creature card') ||
      text.includes('search your library for an artifact') || text.includes('search your library for an enchantment')) {
    if (!text.includes('land card')) {
      return { primary: 'Tutor', secondary, confidence: 'high' }
    }
  }

  // --- PROTECTION ---
  if (text.includes('gains hexproof') || text.includes('gains indestructible') || 
      text.includes('protection from')) {
    if (!type.includes('creature') && !type.includes('equipment')) {
      return { primary: 'Protection', secondary, confidence: 'high' }
    }
    secondary.push('Protection')
  }
  
  if (text.includes('prevent all combat damage') || text.includes('prevent all damage that would be dealt')) {
    return { primary: 'Protection:Mass', secondary, confidence: 'high', notes: 'Fog effect' }
  }

  // --- RECURSION ---
  if (text.includes('return target') && text.includes('from your graveyard to')) {
    return { primary: 'Recursion', secondary, confidence: 'high' }
  }
  if (text.includes('return all') && text.includes('from your graveyard')) {
    return { primary: 'Recursion', secondary, confidence: 'high' }
  }

  // --- DISCARD ---
  if (text.includes('target player discards') || text.includes('target opponent discards') ||
      text.includes('each opponent discards')) {
    return { primary: 'Discard', secondary, confidence: 'high' }
  }

  // --- ENGINE ---
  if (text.includes('double') && (text.includes('counters') || text.includes('tokens') || text.includes('damage'))) {
    return { primary: 'Engine', secondary, confidence: 'high', notes: 'Doubling effect' }
  }
  
  if (text.includes('untap all') && text.includes('you control')) {
    return { primary: 'Engine', secondary, confidence: 'high' }
  }
  
  if (text.includes('whenever an opponent casts') || text.includes('whenever an opponent draws')) {
    return { primary: 'Engine', secondary, confidence: 'high' }
  }

  // --- MILL ---
  if (text.includes('mill') && (text.includes('target player') || text.includes('each opponent'))) {
    return { primary: 'Mill', secondary, confidence: 'high' }
  }
  if (text.includes('puts the top') && text.includes('into their graveyard')) {
    return { primary: 'Mill', secondary, confidence: 'high' }
  }

  // --- FINISHER ---
  if (text.includes('you win the game')) {
    return { primary: 'Finisher', secondary, confidence: 'high' }
  }
  if (text.includes('each opponent loses') && text.includes('life')) {
    if (text.includes('x life') || (/loses \d+ life/.test(text) && parseInt(text.match(/loses (\d+)/)?.[1] || '0') >= 5)) {
      return { primary: 'Finisher', secondary, confidence: 'medium' }
    }
  }
  if (text.includes('creatures you control') && text.includes('get +x/+x') && text.includes('trample')) {
    return { primary: 'Finisher', secondary, confidence: 'high', notes: 'Overrun finisher' }
  }
  if (text.includes('deals double that damage') || text.includes('deals triple that damage')) {
    return { primary: 'Engine', secondary: ['Finisher'], confidence: 'high', notes: 'Damage multiplier' }
  }
  if (text.includes('gain control of') && text.includes('until end of turn') && text.includes('haste')) {
    return { primary: 'Finisher', secondary: ['Removal:Tempo'], confidence: 'medium', notes: 'Threaten effect' }
  }

  // --- UTILITY SUB-TYPES ---
  if (text.includes('create') && text.includes('creature token')) {
    if (!type.includes('creature')) {
      return { primary: 'Utility:Tokens', secondary, confidence: 'medium' }
    }
    secondary.push('Utility:Tokens')
  }
  
  if (text.includes("exile target player's graveyard") || text.includes('exile all cards from all graveyards')) {
    return { primary: 'Utility:Hate', secondary, confidence: 'high', notes: 'Graveyard hate' }
  }
  
  if (text.includes('creatures you control get +') && !text.includes('until end of turn')) {
    if (!type.includes('creature')) {
      return { primary: 'Utility:Anthem', secondary, confidence: 'high' }
    }
    secondary.push('Utility:Anthem')
  }
  
  if (text.includes('sacrifice a creature:') || text.includes('sacrifice another creature:')) {
    secondary.push('Utility:Sac-Outlet')
  }

  // --- LAND CLASSIFICATION ---
  if (type.includes('land')) {
    if (text.includes('exile target') || text.includes('destroy target')) {
      return { primary: 'Removal', secondary: ['Land'], confidence: 'medium' }
    }
    if (text.includes('return') && text.includes('from your graveyard')) {
      return { primary: 'Recursion', secondary: ['Land'], confidence: 'medium' }
    }
    if (text.includes("exile target player's graveyard")) {
      return { primary: 'Utility:Hate', secondary: ['Land'], confidence: 'high' }
    }
    if (text.includes('add {c}{c}') || text.includes('add two mana')) {
      return { primary: 'Ramp', secondary: ['Land'], confidence: 'medium' }
    }
    if (text.includes(': add {') && (text.includes('or {') || type.includes('—'))) {
      return { primary: 'Utility:Fixing', secondary: ['Land'], confidence: 'high' }
    }
    return { primary: 'Land', secondary, confidence: 'high' }
  }

  // --- FUNCTIONAL FALLBACKS ---
  if (type.includes('creature')) {
    if (text.includes('when') && text.includes('enters') && text.includes('draw')) {
      secondary.push('Draw')
    }
    if (text.includes('when') && text.includes('enters') && text.includes('create') && text.includes('token')) {
      secondary.push('Utility:Tokens')
    }
    if (text.includes('when') && text.includes('enters') && text.includes('deals') && text.includes('damage')) {
      secondary.push('Removal')
    }
    if (text.includes('creatures you control get +') || (text.includes('other') && text.includes('get +'))) {
      return { primary: 'Utility:Anthem', secondary: ['Creature'], confidence: 'high' }
    }
    if (text.includes('{t}: add')) {
      return { primary: 'Ramp', secondary: ['Creature'], confidence: 'high', notes: 'Mana dork' }
    }
    return { primary: 'Creature', secondary, confidence: 'medium' }
  }
  
  if (type.includes('planeswalker')) {
    if (text.includes('draw') && (text.includes('[+') || text.includes('[-'))) {
      return { primary: 'Engine', secondary: ['Draw'], confidence: 'medium', notes: 'Draw-focused planeswalker' }
    }
    if (text.includes('destroy') || text.includes('exile target') || (text.includes('deals') && text.includes('damage to'))) {
      return { primary: 'Removal', secondary: ['Planeswalker'], confidence: 'medium' }
    }
    if (text.includes('create') && text.includes('token')) {
      return { primary: 'Utility:Tokens', secondary: ['Planeswalker'], confidence: 'medium' }
    }
    if (text.includes('add {') || (text.includes('search') && text.includes('land'))) {
      return { primary: 'Ramp', secondary: ['Planeswalker'], confidence: 'medium' }
    }
    return { primary: 'Engine', secondary: ['Planeswalker'], confidence: 'low', notes: 'Multi-ability planeswalker' }
  }
  
  if (type.includes('equipment')) {
    if (text.includes('protection from') || text.includes('hexproof') || text.includes('indestructible')) {
      return { primary: 'Protection', secondary: ['Equipment'], confidence: 'high' }
    }
    if (text.includes('draw a card')) {
      return { primary: 'Draw', secondary: ['Equipment'], confidence: 'medium' }
    }
    return { primary: 'Utility', secondary: ['Equipment'], confidence: 'medium' }
  }
  
  if (type.includes('artifact') && !type.includes('creature')) {
    if (text.includes('copy') && text.includes('creature')) {
      return { primary: 'Engine', secondary, confidence: 'medium', notes: 'Copy engine' }
    }
    return { primary: 'Utility', secondary, confidence: 'low', notes: 'Artifact utility' }
  }
  
  if (type.includes('enchantment')) {
    if (type.includes('aura') && (text.includes('gets -') || text.includes("can't attack") || text.includes("can't block"))) {
      return { primary: 'Removal', secondary: ['Enchantment'], confidence: 'medium' }
    }
    if (type.includes('aura') && text.includes('gets +')) {
      return { primary: 'Utility', secondary: ['Enchantment'], confidence: 'medium' }
    }
    if (text.includes('creatures you control get +')) {
      return { primary: 'Utility:Anthem', secondary, confidence: 'high' }
    }
    return { primary: 'Utility', secondary: ['Enchantment'], confidence: 'low', notes: 'Enchantment utility' }
  }
  
  if (type.includes('instant') || type.includes('sorcery')) {
    if (text.includes('target creature gets +') && text.includes('until end of turn')) {
      return { primary: 'Utility', secondary: ['Combat'], confidence: 'medium', notes: 'Combat trick' }
    }
    if (text.includes('you gain') && text.includes('life') && !text.includes('draw') && !text.includes('destroy')) {
      return { primary: 'Utility:Lifegain', secondary, confidence: 'medium' }
    }
    return { primary: 'Utility', secondary, confidence: 'low', notes: 'Spell utility' }
  }
  
  return { primary: 'Utility', secondary, confidence: 'low', notes: 'Unclassified' }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  
  console.log('=== MTG Cards Full Classification ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Force reclassify: ${force}`)
  console.log('')
  
  // Fetch all cards from mtg_cards
  const allCards: Card[] = []
  let offset = 0
  const PAGE = 1000
  
  console.log('Fetching cards from mtg_cards...')
  
  while (true) {
    let query = supabase
      .from('ref_cards')
      .select('name, type_line, oracle_text')
      .range(offset, offset + PAGE - 1)
    
    if (!force) {
      query = query.is('default_category', null)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error:', error.message)
      break
    }
    if (!data || data.length === 0) break
    
    allCards.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
    
    if (offset % 5000 === 0) {
      console.log(`  Fetched ${offset}...`)
    }
  }
  
  console.log(`Found ${allCards.length} cards to classify`)
  
  if (allCards.length === 0) {
    console.log('Nothing to do!')
    return
  }
  
  // Classify all cards
  console.log('\nClassifying...')
  const results: { name: string; classification: Classification }[] = []
  
  for (const card of allCards) {
    const classification = classifyCard(card)
    results.push({ name: card.name, classification })
  }
  
  // Summary stats
  const primaryCounts = new Map<string, number>()
  const confidenceCounts = { high: 0, medium: 0, low: 0 }
  
  for (const r of results) {
    primaryCounts.set(r.classification.primary, (primaryCounts.get(r.classification.primary) || 0) + 1)
    confidenceCounts[r.classification.confidence]++
  }
  
  console.log('\n=== Category Distribution ===')
  const sortedCategories = [...primaryCounts.entries()].sort((a, b) => b[1] - a[1])
  for (const [cat, count] of sortedCategories) {
    const pct = ((count / results.length) * 100).toFixed(1)
    console.log(`  ${cat}: ${count} (${pct}%)`)
  }
  
  console.log('\n=== Confidence Distribution ===')
  console.log(`  High: ${confidenceCounts.high} (${((confidenceCounts.high / results.length) * 100).toFixed(1)}%)`)
  console.log(`  Medium: ${confidenceCounts.medium} (${((confidenceCounts.medium / results.length) * 100).toFixed(1)}%)`)
  console.log(`  Low: ${confidenceCounts.low} (${((confidenceCounts.low / results.length) * 100).toFixed(1)}%)`)
  
  if (dryRun) {
    console.log('\n[DRY RUN] Skipping database write')
    return
  }
  
  // Write to database using parallel batched updates
  console.log('\nWriting to mtg_cards (parallel batches)...')
  
  const BATCH_SIZE = 50  // Number of cards per batch
  const PARALLEL = 10    // Number of concurrent batches
  let updated = 0
  let failed = 0
  
  // Process in waves of parallel batches
  for (let wave = 0; wave < results.length; wave += BATCH_SIZE * PARALLEL) {
    const waveEnd = Math.min(wave + BATCH_SIZE * PARALLEL, results.length)
    const batches: Promise<void>[] = []
    
    for (let i = wave; i < waveEnd; i += BATCH_SIZE) {
      const batch = results.slice(i, Math.min(i + BATCH_SIZE, waveEnd))
      
      const batchPromise = (async () => {
        for (const r of batch) {
          const { error } = await supabase
            .from('ref_cards')
            .update({ default_category: r.classification })
            .eq('name', r.name)
          
          if (error) {
            failed++
          } else {
            updated++
          }
        }
      })()
      
      batches.push(batchPromise)
    }
    
    await Promise.all(batches)
    
    const progress = Math.min(waveEnd, results.length)
    console.log(`Progress: ${progress}/${results.length} (${((progress / results.length) * 100).toFixed(1)}%)`)
  }
  
  console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`)
}

main().catch(console.error)
