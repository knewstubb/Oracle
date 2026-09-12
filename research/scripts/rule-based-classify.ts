/**
 * Rule-based card classification using oracle text patterns.
 * Applies the taxonomy from docs/category-taxonomy.md
 * 
 * Run: npx tsx scripts/rule-based-classify.ts
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
  card_name: string
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
  const name = card.card_name
  
  const secondary: string[] = []
  let notes: string | undefined
  
  // --- RAMP ---
  // Mana rocks: "{T}: Add"
  if (text.includes('{t}: add {') || text.includes('{t}: add one mana') || text.includes('{t}: add {c}{c}')) {
    if (type.includes('artifact') && !type.includes('creature')) {
      return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Mana rock' }
    }
  }
  
  // Mana dorks: creature with "{T}: Add"
  if (type.includes('creature') && (text.includes('{t}: add {') || text.includes('{t}: add one mana') || text.includes('{t}: add one mana of any'))) {
    return { primary: 'Ramp', secondary: ['Creature'], confidence: 'high', notes: 'Mana dork' }
  }
  
  // Land ramp: "search your library for a ... land card, put it onto the battlefield"
  if (text.includes('search your library for') && text.includes('land') && text.includes('onto the battlefield')) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Land ramp' }
  }
  
  // Sacrifice for land (e.g., Sakura-Tribe Elder)
  if (text.includes('sacrifice') && text.includes('search your library for') && text.includes('basic land')) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Land ramp' }
  }
  
  // Lander tokens (from the new sets)
  if (text.includes('create a lander token') || text.includes('lander token')) {
    return { primary: 'Ramp', secondary: ['Utility:Tokens'], confidence: 'high', notes: 'Lander token' }
  }
  
  // Cost reduction
  if (text.includes('spells you cast cost') && text.includes('less to cast')) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Cost reduction' }
  }
  if (text.includes('spell costs {1} less') || text.includes('spells cost {1} less')) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Cost reduction' }
  }
  
  // Rituals (add multiple mana at once)
  if (text.match(/add \{[wubrg]\}\{[wubrg]\}\{[wubrg]\}/i) && (type.includes('instant') || type.includes('sorcery'))) {
    return { primary: 'Ramp', secondary, confidence: 'high', notes: 'Ritual' }
  }
  
  // Treasure/mana tokens
  if (text.includes('create a treasure token') || text.includes('create two treasure') || text.includes('create three treasure')) {
    if (!type.includes('creature')) {
      return { primary: 'Ramp', secondary: ['Utility:Tokens'], confidence: 'high', notes: 'Treasure generator' }
    }
    secondary.push('Ramp')
  }
  
  // --- CARD DRAW ---
  // Direct draw
  if (text.includes('draw three cards') || text.includes('draw four cards') || text.includes('draw five cards')) {
    return { primary: 'Draw', secondary, confidence: 'high' }
  }
  if (/draw two cards(?!\. you may discard)/.test(text) && !text.includes('target opponent')) {
    if (!type.includes('creature')) {
      return { primary: 'Draw', secondary, confidence: 'high' }
    }
  }
  
  // Draw for each creature (Collective Unconscious, Distant Melody, etc.)
  if (text.includes('draw a card for each') && (text.includes('creature') || text.includes('permanent'))) {
    return { primary: 'Draw', secondary, confidence: 'high', notes: 'Scaling draw' }
  }
  
  // Cantrips (draw a card as part of effect)
  if ((type.includes('instant') || type.includes('sorcery')) && text.includes('draw a card') && !text.includes('whenever')) {
    return { primary: 'Draw', secondary: ['Utility:Selection'], confidence: 'high', notes: 'Cantrip' }
  }
  
  // Draw engines
  if (text.includes('whenever') && text.includes('draw a card') && !type.includes('creature')) {
    return { primary: 'Engine', secondary: ['Draw'], confidence: 'high', notes: 'Draw engine' }
  }
  
  // Creature-based draw engines
  if (type.includes('creature') && text.includes('whenever') && text.includes('draw a card')) {
    return { primary: 'Engine', secondary: ['Draw', 'Creature'], confidence: 'high', notes: 'Draw engine creature' }
  }
  
  // Impulse draw
  if (text.includes('exile the top') && text.includes('you may play')) {
    return { primary: 'Draw', secondary, confidence: 'medium', notes: 'Impulse draw' }
  }
  
  // Scry + draw (Preordain pattern)
  if (text.includes('scry') && text.includes('draw a card') && (type.includes('instant') || type.includes('sorcery'))) {
    return { primary: 'Draw', secondary: ['Utility:Selection'], confidence: 'high', notes: 'Cantrip with selection' }
  }
  
  // Scry/selection only
  if (text.includes('scry') && !text.includes('draw') && !text.includes('destroy') && !text.includes('damage')) {
    secondary.push('Utility:Selection')
  }
  
  // --- REMOVAL ---
  // Destroy target creature/artifact/enchantment/permanent
  if (text.includes('destroy target creature') || text.includes('destroy target artifact') || 
      text.includes('destroy target enchantment') || text.includes('destroy target permanent')) {
    if (!type.includes('creature')) {
      return { primary: 'Removal', secondary, confidence: 'high' }
    }
    secondary.push('Removal')
  }
  
  // Exile target
  if (text.includes('exile target creature') || text.includes('exile target permanent') ||
      text.includes('exile target artifact') || text.includes('exile target enchantment')) {
    if (!type.includes('creature')) {
      return { primary: 'Removal', secondary, confidence: 'high' }
    }
    secondary.push('Removal')
  }
  
  // Board wipes
  if (text.includes('destroy all creatures') || text.includes('destroy all nonland') ||
      text.includes('exile all creatures') || text.includes('deals') && text.includes('to each creature')) {
    return { primary: 'Removal:Mass', secondary, confidence: 'high', notes: 'Board wipe' }
  }
  
  // -X/-X effects
  if (/target creature gets -\d+\/-\d+/.test(text) || /gets -x\/-x/.test(text)) {
    if (!type.includes('creature')) {
      return { primary: 'Removal', secondary, confidence: 'high' }
    }
    secondary.push('Removal')
  }
  
  // Damage-based removal
  if (/deals \d+ damage to target creature/.test(text) || text.includes('deals x damage to target creature')) {
    if (!type.includes('creature')) {
      return { primary: 'Removal', secondary, confidence: 'high' }
    }
    secondary.push('Removal')
  }
  
  // Fight
  if (text.includes('target creature you control fights') || text.includes('it fights')) {
    secondary.push('Removal')
  }
  
  // Sacrifice forcing
  if (text.includes('target player sacrifices a creature') || text.includes('each opponent sacrifices')) {
    return { primary: 'Removal', secondary, confidence: 'high' }
  }
  
  // Bounce (tempo removal)
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
    // Exclude land tutors (already handled under Ramp)
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
  
  // Fog effects
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
  // Doubling effects
  if (text.includes('double') && (text.includes('counters') || text.includes('tokens') || text.includes('damage'))) {
    return { primary: 'Engine', secondary, confidence: 'high', notes: 'Doubling effect' }
  }
  
  // Untap all
  if (text.includes('untap all') && text.includes('you control')) {
    return { primary: 'Engine', secondary, confidence: 'high' }
  }
  
  // Whenever an opponent triggers
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
    if (text.includes('x life') || /loses \d+ life/.test(text) && parseInt(text.match(/loses (\d+)/)?.[1] || '0') >= 5) {
      return { primary: 'Finisher', secondary, confidence: 'medium' }
    }
  }
  // Craterhoof-style mass pump
  if (text.includes('creatures you control') && text.includes('get +x/+x') && text.includes('trample')) {
    return { primary: 'Finisher', secondary, confidence: 'high', notes: 'Overrun finisher' }
  }
  // Damage doublers/triplers
  if (text.includes('deals double that damage') || text.includes('deals triple that damage')) {
    return { primary: 'Engine', secondary: ['Finisher'], confidence: 'high', notes: 'Damage multiplier' }
  }
  // Steal-and-swing effects
  if (text.includes('gain control of') && text.includes('until end of turn') && text.includes('haste')) {
    return { primary: 'Finisher', secondary: ['Removal:Tempo'], confidence: 'medium', notes: 'Threaten effect' }
  }
  
  // --- UTILITY SUB-TYPES ---
  // Tokens
  if (text.includes('create') && text.includes('creature token')) {
    if (!type.includes('creature')) {
      return { primary: 'Utility:Tokens', secondary, confidence: 'medium' }
    }
    secondary.push('Utility:Tokens')
  }
  
  // Graveyard hate
  if (text.includes("exile target player's graveyard") || text.includes('exile all cards from all graveyards')) {
    return { primary: 'Utility:Hate', secondary, confidence: 'high', notes: 'Graveyard hate' }
  }
  
  // Anthems
  if (text.includes('creatures you control get +') && !text.includes('until end of turn')) {
    if (!type.includes('creature')) {
      return { primary: 'Utility:Anthem', secondary, confidence: 'high' }
    }
    secondary.push('Utility:Anthem')
  }
  
  // Sacrifice outlets
  if (text.includes('sacrifice a creature:') || text.includes('sacrifice another creature:')) {
    secondary.push('Utility:Sac-Outlet')
  }
  
  // --- LAND CLASSIFICATION ---
  if (type.includes('land')) {
    // Utility lands with effects
    if (text.includes('exile target') || text.includes('destroy target')) {
      return { primary: 'Removal', secondary: ['Land'], confidence: 'medium' }
    }
    if (text.includes('return') && text.includes('from your graveyard')) {
      return { primary: 'Recursion', secondary: ['Land'], confidence: 'medium' }
    }
    if (text.includes("exile target player's graveyard")) {
      return { primary: 'Utility:Hate', secondary: ['Land'], confidence: 'high' }
    }
    // Mana lands that produce extra
    if (text.includes('add {c}{c}') || text.includes('add two mana')) {
      return { primary: 'Ramp', secondary: ['Land'], confidence: 'medium' }
    }
    // Basic dual lands = fixing
    if (text.includes(': add {') && (text.includes('or {') || type.includes('— '))) {
      return { primary: 'Utility:Fixing', secondary: ['Land'], confidence: 'high' }
    }
    // Basic lands
    return { primary: 'Land', secondary, confidence: 'high' }
  }
  
  // --- FUNCTIONAL FALLBACKS (NOT type-based) ---
  // These examine oracle text more deeply for functional roles
  
  // Creatures with meaningful ETB effects
  if (type.includes('creature')) {
    // ETB draw
    if (text.includes('when') && text.includes('enters') && text.includes('draw')) {
      secondary.push('Draw')
    }
    // ETB tokens
    if (text.includes('when') && text.includes('enters') && text.includes('create') && text.includes('token')) {
      secondary.push('Utility:Tokens')
    }
    // ETB damage to creatures (removal-ish)
    if (text.includes('when') && text.includes('enters') && text.includes('deals') && text.includes('damage')) {
      secondary.push('Removal')
    }
    // Tribal lords / anthems
    if (text.includes('creatures you control get +') || text.includes('other') && text.includes('get +')) {
      return { primary: 'Utility:Anthem', secondary: ['Creature'], confidence: 'high' }
    }
    // Mana dorks (already handled above but catch edge cases)
    if (text.includes('{t}: add')) {
      return { primary: 'Ramp', secondary: ['Creature'], confidence: 'high', notes: 'Mana dork' }
    }
    // Generic combat creatures with no special function
    return { primary: 'Creature', secondary, confidence: 'medium' }
  }
  
  // Planeswalkers - analyze abilities
  if (type.includes('planeswalker')) {
    // Draw-focused
    if (text.includes('draw') && (text.includes('[+') || text.includes('[-'))) {
      return { primary: 'Engine', secondary: ['Draw'], confidence: 'medium', notes: 'Draw-focused planeswalker' }
    }
    // Removal-focused
    if (text.includes('destroy') || text.includes('exile target') || text.includes('deals') && text.includes('damage to')) {
      return { primary: 'Removal', secondary: ['Planeswalker'], confidence: 'medium' }
    }
    // Token-focused
    if (text.includes('create') && text.includes('token')) {
      return { primary: 'Utility:Tokens', secondary: ['Planeswalker'], confidence: 'medium' }
    }
    // Ramp-focused
    if (text.includes('add {') || text.includes('search') && text.includes('land')) {
      return { primary: 'Ramp', secondary: ['Planeswalker'], confidence: 'medium' }
    }
    return { primary: 'Engine', secondary: ['Planeswalker'], confidence: 'low', notes: 'Multi-ability planeswalker' }
  }
  
  // Equipment - mostly utility/combat enhancement
  if (type.includes('equipment')) {
    if (text.includes('protection from') || text.includes('hexproof') || text.includes('indestructible')) {
      return { primary: 'Protection', secondary: ['Equipment'], confidence: 'high' }
    }
    if (text.includes('draw a card')) {
      return { primary: 'Draw', secondary: ['Equipment'], confidence: 'medium' }
    }
    return { primary: 'Utility', secondary: ['Equipment'], confidence: 'medium' }
  }
  
  // Non-creature artifacts
  if (type.includes('artifact') && !type.includes('creature')) {
    // Copy effects = engine
    if (text.includes('copy') && text.includes('creature')) {
      return { primary: 'Engine', secondary, confidence: 'medium', notes: 'Copy engine' }
    }
    // Generic artifacts - utility
    return { primary: 'Utility', secondary, confidence: 'low', notes: 'Artifact utility' }
  }
  
  // Enchantments
  if (type.includes('enchantment')) {
    // Auras that debuff = removal
    if (type.includes('aura') && (text.includes('gets -') || text.includes("can't attack") || text.includes("can't block"))) {
      return { primary: 'Removal', secondary: ['Enchantment'], confidence: 'medium' }
    }
    // Auras that buff = utility
    if (type.includes('aura') && text.includes('gets +')) {
      return { primary: 'Utility', secondary: ['Enchantment'], confidence: 'medium' }
    }
    // Static anthems
    if (text.includes('creatures you control get +')) {
      return { primary: 'Utility:Anthem', secondary, confidence: 'high' }
    }
    return { primary: 'Utility', secondary: ['Enchantment'], confidence: 'low', notes: 'Enchantment utility' }
  }
  
  // Instants and sorceries without a clear primary function
  if (type.includes('instant') || type.includes('sorcery')) {
    // Combat tricks
    if (text.includes('target creature gets +') && text.includes('until end of turn')) {
      return { primary: 'Utility', secondary: ['Combat'], confidence: 'medium', notes: 'Combat trick' }
    }
    // Life gain
    if (text.includes('you gain') && text.includes('life') && !text.includes('draw') && !text.includes('destroy')) {
      return { primary: 'Utility:Lifegain', secondary, confidence: 'medium' }
    }
    return { primary: 'Utility', secondary, confidence: 'low', notes: 'Spell utility' }
  }
  
  // Catch-all
  return { primary: 'Utility', secondary, confidence: 'low', notes: 'Unclassified' }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const limit = process.argv.find(a => a.startsWith('--limit='))
  const limitNum = limit ? parseInt(limit.split('=')[1], 10) : undefined
  
  console.log('=== Rule-Based Card Classification ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  if (limitNum) console.log(`Limit: ${limitNum} cards`)
  console.log('')
  
  // Fetch cards from card_metadata that need classification
  const cardsToClassify: string[] = []
  let offset = 0
  const PAGE = 1000
  
  console.log('Fetching cards needing classification...')
  
  while (true) {
    const { data, error } = await supabase
      .from('card_metadata')
      .select('card_name')
      .not('type_line', 'is', null)
      .is('default_category', null)
      .range(offset, offset + PAGE - 1)
    
    if (error) {
      console.error('Error:', error.message)
      break
    }
    if (!data || data.length === 0) break
    
    cardsToClassify.push(...data.map(d => d.card_name))
    if (limitNum && cardsToClassify.length >= limitNum) {
      cardsToClassify.length = limitNum
      break
    }
    if (data.length < PAGE) break
    offset += PAGE
  }
  
  console.log(`Found ${cardsToClassify.length} cards needing classification`)
  
  if (cardsToClassify.length === 0) {
    console.log('Nothing to do!')
    return
  }
  
  // Fetch oracle text from mtg_cards
  const cardData: Card[] = []
  const batchSize = 100
  
  console.log('Fetching oracle text from mtg_cards...')
  
  for (let i = 0; i < cardsToClassify.length; i += batchSize) {
    const batch = cardsToClassify.slice(i, i + batchSize)
    
    const { data: mtgData, error: mtgErr } = await supabase
      .from('ref_cards')
      .select('name, type_line, oracle_text')
      .in('name', batch)
    
    if (mtgErr) {
      console.error(`Batch ${i} error:`, mtgErr.message)
      continue
    }
    
    if (mtgData) {
      for (const card of mtgData) {
        cardData.push({
          card_name: card.name,
          type_line: card.type_line || '',
          oracle_text: card.oracle_text || ''
        })
      }
    }
    
    if ((i + batchSize) % 500 === 0 || i + batchSize >= cardsToClassify.length) {
      console.log(`Fetched ${Math.min(i + batchSize, cardsToClassify.length)}/${cardsToClassify.length}`)
    }
  }
  
  console.log(`\nClassifying ${cardData.length} cards...`)
  
  // Classify all cards
  const results: { card_name: string; classification: Classification }[] = []
  
  for (const card of cardData) {
    const classification = classifyCard(card)
    results.push({ card_name: card.card_name, classification })
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
    console.log(`  ${cat}: ${count}`)
  }
  
  console.log('\n=== Confidence Distribution ===')
  console.log(`  High: ${confidenceCounts.high}`)
  console.log(`  Medium: ${confidenceCounts.medium}`)
  console.log(`  Low: ${confidenceCounts.low}`)
  
  // Show some examples
  console.log('\n=== Sample Classifications ===')
  const samples = results.slice(0, 20)
  for (const s of samples) {
    const sec = s.classification.secondary.length ? ` [+${s.classification.secondary.join(', ')}]` : ''
    const note = s.classification.notes ? ` (${s.classification.notes})` : ''
    console.log(`  ${s.card_name}: ${s.classification.primary}${sec} - ${s.classification.confidence}${note}`)
  }
  
  if (dryRun) {
    console.log('\n[DRY RUN] Skipping database write')
    return
  }
  
  // Write to database
  console.log('\nWriting to card_metadata...')
  
  const BATCH_SIZE = 100
  let updated = 0
  
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE)
    
    const rows = batch.map(r => ({
      card_name: r.card_name,
      default_category: r.classification
    }))
    
    const { error } = await supabase
      .from('card_metadata')
      .upsert(rows, { onConflict: 'card_name' })
    
    if (error) {
      console.error(`Batch ${i} failed:`, error.message)
    } else {
      updated += batch.length
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= results.length) {
        console.log(`Updated ${Math.min(i + BATCH_SIZE, results.length)}/${results.length}`)
      }
    }
  }
  
  console.log(`\nDone! Updated ${updated} cards`)
}

main().catch(console.error)
