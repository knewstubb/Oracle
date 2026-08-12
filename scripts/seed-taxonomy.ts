/**
 * Seed ref_taxonomy from knowledge base index.json
 * 
 * This script:
 * 1. Reads the knowledge base index.json
 * 2. Extracts archetypes, mechanics, tribes from file entries
 * 3. Adds Scryfall keywords from a known list
 * 4. Inserts into ref_taxonomy table
 * 
 * Run: npx tsx scripts/seed-taxonomy.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Known Scryfall keywords (evergreen + deciduous + ability words)
// Source: https://scryfall.com/docs/syntax#keywords
const SCRYFALL_KEYWORDS = [
  // Evergreen keywords
  'Deathtouch', 'Defender', 'Double strike', 'Enchant', 'Equip', 'First strike',
  'Flash', 'Flying', 'Haste', 'Hexproof', 'Indestructible', 'Lifelink', 'Menace',
  'Protection', 'Reach', 'Trample', 'Vigilance', 'Ward',
  
  // Deciduous keywords
  'Cycling', 'Flashback', 'Kicker', 'Landwalk', 'Regenerate', 'Shroud',
  
  // Common ability words and mechanics
  'Affinity', 'Annihilator', 'Backup', 'Bargain', 'Battalion', 'Blitz',
  'Bloodthirst', 'Bushido', 'Cascade', 'Casualty', 'Changeling', 'Cipher',
  'Cleave', 'Companion', 'Compleated', 'Connive', 'Conspire', 'Convoke',
  'Crew', 'Cumulative upkeep', 'Dash', 'Daybound', 'Decayed', 'Delve',
  'Descend', 'Detain', 'Devour', 'Discover', 'Disturb', 'Domain', 'Dredge',
  'Echo', 'Embalm', 'Emerge', 'Eminence', 'Enlist', 'Enrage', 'Entwine',
  'Epic', 'Equip', 'Escalate', 'Escape', 'Eternalize', 'Evoke', 'Evolve',
  'Exalted', 'Exploit', 'Explore', 'Extort', 'Fabricate', 'Fading', 'Fear',
  'Ferocious', 'Fight', 'Flanking', 'Foretell', 'Formidable', 'Frenzy',
  'Fuse', 'Gift', 'Goad', 'Graft', 'Grandeur', 'Gravestorm', 'Haunt',
  'Hellbent', 'Hero', 'Heroic', 'Hideaway', 'Horsemanship', 'Improvise',
  'Incubate', 'Infect', 'Initiative', 'Inspired', 'Intimidate', 'Investigate',
  'Jump-start', 'Landfall', 'Learn', 'Level up', 'Lieutenant', 'Living weapon',
  'Madness', 'Magecraft', 'Manifest', 'Meld', 'Melee', 'Mentor', 'Miracle',
  'Modular', 'Monstrosity', 'Morph', 'Myriad', 'Nightbound', 'Ninjutsu',
  'Offering', 'Offspring', 'Outlast', 'Overload', 'Pack tactics', 'Parley',
  'Partner', 'Persist', 'Phasing', 'Populate', 'Proliferate', 'Prototype',
  'Provoke', 'Prowess', 'Prowl', 'Radiance', 'Raid', 'Rally', 'Rampage',
  'Ravenous', 'Read ahead', 'Rebound', 'Reconfigure', 'Recover', 'Reinforce',
  'Renown', 'Replicate', 'Retrace', 'Revolt', 'Riot', 'Ripple', 'Role',
  'Saddle', 'Scavenge', 'Shadow', 'Skulk', 'Soulbond', 'Soulshift', 'Spectacle',
  'Spell mastery', 'Splice', 'Split second', 'Squad', 'Storm', 'Strive',
  'Sunburst', 'Support', 'Surge', 'Surveil', 'Suspend', 'Threshold', 'Totem armor',
  'Training', 'Transfigure', 'Transform', 'Transmute', 'Treasure', 'Tribute',
  'Undaunted', 'Undergrowth', 'Undying', 'Unearth', 'Unleash', 'Vanishing',
  'Venture', 'Will of the council', 'Wither',
]

// EDHREC theme aliases - maps their inconsistent naming to our slugs
// Also maps insight build_variant strings to canonical taxonomy slugs
const EDHREC_ALIASES: Record<string, string[]> = {
  // Archetypes
  'aristocrats': ['Aristocrats', 'Sacrifice', 'Death Triggers', 'Blood Artist'],
  'blink': ['Blink', 'Flicker', 'ETB', 'Enter the Battlefield', 'exile value'],
  'tokens': ['Tokens', 'Token', 'Go Wide', 'Swarm', 'orc_army'],
  'reanimator': ['Reanimator', 'Graveyard', 'Reanimate', 'Recursion'],
  'spellslinger': ['Spellslinger', 'Spell Slinger', 'Instants and Sorceries', 'Storm'],
  'voltron': ['Voltron', 'Equipment', 'Auras', 'Commander Damage'],
  'control': ['Control', 'Counterspells', 'Board Wipes', 'value control'],
  'combo': ['Combo', 'Infinite', 'Combos', 'cedh combo', 'cheerios'],
  'stax': ['Stax', 'Tax', 'Hatebears', 'Resource Denial'],
  'mill': ['Mill', 'Self-Mill', 'Library'],
  'lands-matter': ['Lands', 'Landfall', 'Land Matters'],
  'counters': ['+1/+1 Counters', 'Counters', 'Counter Synergy'],
  'treasure': ['Treasure', 'Treasures', 'Treasure Tokens'],
  'enchantress': ['Enchantress', 'Enchantments', 'Constellation'],
  'equipment': ['Equipment', 'Voltron', 'Equip'],
  'artifacts-matter': ['Artifacts', 'Artifact Synergy', 'Affinity'],
  'superfriends': ['Superfriends', 'Planeswalkers', 'Planeswalker', 'angels_demons_dragons'],
  'wheels': ['Wheels', 'Wheel', 'Draw Damage', 'wheel_punisher'],
  'group-hug': ['Group Hug', 'Politics', 'Political', 'political_burn'],
  'pillowfort': ['Pillowfort', 'Pillow Fort', 'Defense', 'defender_aggro'],
  'aggro': ['Aggro', 'Aggressive', 'Combat', 'attack triggers'],
  'ramp': ['Ramp', 'Big Mana', 'Mana Ramp'],
  'lifegain': ['Lifegain', 'Life Gain', 'Soul Sisters', 'lifegain drain'],
  'chaos': ['Chaos', 'Random', 'Coin Flip'],
  'theft': ['Theft', 'Steal', 'Clone', 'polymorph'],
  'cast-from-exile': ['Exile', 'Impulse Draw', 'Play from Exile'],
  'legendary-matters': ['Legends', 'Legendary Matters', 'Historic'],
  'infect': ['Infect', 'Poison', 'Toxic'],
  'group-slug': ['Group Slug', 'Punisher', 'Pain'],
  // Tribes - include "X tribal" variants from insights
  'zombies': ['Zombies', 'Zombie', 'zombie tribal'],
  'elves': ['Elves', 'Elf', 'elf tribal'],
  'dragons': ['Dragons', 'Dragon', 'dragon tribal'],
  'vampires': ['Vampires', 'Vampire', 'vampire tribal'],
  'goblins': ['Goblins', 'Goblin', 'goblin tribal'],
  'angels': ['Angels', 'Angel', 'angel tribal'],
  'humans': ['Humans', 'Human', 'human tribal'],
  'wizards': ['Wizards', 'Wizard', 'wizard tribal'],
  'merfolk': ['Merfolk', 'merfolk tribal'],
  'slivers': ['Slivers', 'Sliver', 'sliver tribal'],
  'spirits': ['Spirits', 'Spirit', 'spirit tribal'],
  'dinosaurs': ['Dinosaurs', 'Dinosaur', 'dinosaur tribal'],
  'elementals': ['Elementals', 'Elemental', 'elemental tribal'],
  'eldrazi': ['Eldrazi', 'eldrazi tribal'],
  'rats': ['Rats', 'Rat', 'rat tribal'],
  'werewolves': ['Werewolves', 'Werewolf', 'werewolf tribal'],
  'cats': ['Cats', 'Cat', 'cat tribal'],
  'rogues': ['Rogues', 'Rogue', 'rogue tribal'],
  'knights': ['Knights', 'Knight', 'knight tribal'],
  'ninjas': ['Ninjas', 'Ninja', 'ninja tribal'],
  'pirates': ['Pirates', 'Pirate', 'pirate tribal'],
  'orcs': ['Orcs', 'Orc', 'orc tribal'],
  'demons': ['Demons', 'Demon', 'demon tribal'],
}

interface KnowledgeIndex {
  categories: {
    [key: string]: {
      files: Array<{
        name: string
        path: string
        topics: string[]
        description: string
      }>
    }
  }
}

interface TaxonomyEntry {
  slug: string
  category: 'archetype' | 'mechanic' | 'tribe' | 'keyword' | 'color'
  display_name: string
  description: string | null
  knowledge_file: string | null
  edhrec_aliases: string[] | null
}

async function main() {
  console.log('Seeding ref_taxonomy...\n')
  
  // Read knowledge base index
  const indexPath = resolve(__dirname, '../data/knowledge/index.json')
  const index: KnowledgeIndex = JSON.parse(readFileSync(indexPath, 'utf-8'))
  
  const entries: TaxonomyEntry[] = []
  
  // Extract archetypes
  if (index.categories.archetypes) {
    for (const file of index.categories.archetypes.files) {
      const slug = file.name.replace('.md', '')
      entries.push({
        slug,
        category: 'archetype',
        display_name: toDisplayName(slug),
        description: file.description,
        knowledge_file: file.path,
        edhrec_aliases: EDHREC_ALIASES[slug] || null,
      })
    }
  }
  
  // Extract mechanics
  if (index.categories.mechanics) {
    for (const file of index.categories.mechanics.files) {
      const slug = file.name.replace('.md', '')
      entries.push({
        slug,
        category: 'mechanic',
        display_name: toDisplayName(slug),
        description: file.description,
        knowledge_file: file.path,
        edhrec_aliases: EDHREC_ALIASES[slug] || null,
      })
    }
  }
  
  // Extract tribes
  if (index.categories.tribes) {
    for (const file of index.categories.tribes.files) {
      const slug = file.name.replace('.md', '')
      entries.push({
        slug,
        category: 'tribe',
        display_name: toDisplayName(slug),
        description: file.description,
        knowledge_file: file.path,
        edhrec_aliases: EDHREC_ALIASES[slug] || null,
      })
    }
  }
  
  // Extract colors (for completeness)
  if (index.categories.colors) {
    for (const file of index.categories.colors.files) {
      const slug = file.name.replace('.md', '')
      entries.push({
        slug,
        category: 'color',
        display_name: toDisplayName(slug),
        description: file.description,
        knowledge_file: file.path,
        edhrec_aliases: null,
      })
    }
  }
  
  // Add Scryfall keywords
  for (const keyword of SCRYFALL_KEYWORDS) {
    const slug = keyword.toLowerCase().replace(/\s+/g, '-')
    // Skip if we already have this as a mechanic
    if (entries.some(e => e.slug === slug)) continue
    
    entries.push({
      slug,
      category: 'keyword',
      display_name: keyword,
      description: null,
      knowledge_file: null,
      edhrec_aliases: null,
    })
  }
  
  console.log(`Prepared ${entries.length} taxonomy entries:`)
  console.log(`  - Archetypes: ${entries.filter(e => e.category === 'archetype').length}`)
  console.log(`  - Mechanics: ${entries.filter(e => e.category === 'mechanic').length}`)
  console.log(`  - Tribes: ${entries.filter(e => e.category === 'tribe').length}`)
  console.log(`  - Keywords: ${entries.filter(e => e.category === 'keyword').length}`)
  console.log(`  - Colors: ${entries.filter(e => e.category === 'color').length}`)
  
  // Upsert into database
  const { data, error } = await supabase
    .from('ref_taxonomy')
    .upsert(entries, { onConflict: 'slug' })
    .select()
  
  if (error) {
    console.error('Error seeding taxonomy:', error)
    process.exit(1)
  }
  
  console.log(`\nSeeded ${data?.length || 0} taxonomy entries`)
}

function toDisplayName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

main().catch(console.error)
