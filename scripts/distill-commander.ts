/**
 * Distill commander insights from raw content
 * 
 * Usage: npx tsx scripts/distill-commander.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface InsightInput {
  commander_id: string
  build_variant: string
  archetype: string
  insight_type: string
  content: string
  taxonomy_tags: string[]
  card_mentions: string[]
  confidence: number
  source_type: string
  source_url?: string
  source_title?: string
  source_author?: string
  source_date?: string
}

async function insertInsights(insights: InsightInput[]) {
  const { data, error } = await supabase
    .from('ref_commander_insights')
    .insert(insights)
    .select()

  if (error) {
    console.error('Insert error:', error)
    return null
  }
  
  return data
}

/**
 * Allowed insight_type values (from DB constraint):
 * - strategy: Core strategy / game plan  
 * - synergy: Key synergies and combos
 * - card_recommendation: Specific card suggestions (includes core cards, flex slots)
 * - budget_alternative: Budget-friendly swaps
 * - matchup: Matchup considerations
 * - upgrade_path: How to improve the deck
 * - common_mistake: Pitfalls to avoid
 * - meta_consideration: Meta/playgroup considerations
 * 
 * Allowed source_type values:
 * - youtube, edhrec, commanders_herald, reddit, moxfield, archidekt, manual
 */

// The Ur-Dragon insights distilled from YouTube transcripts
const urDragonInsights: InsightInput[] = [
  {
    commander_id: '189dee6d-5328-4b21-bac3-63e7b932b47c',
    build_variant: 'dragons',
    archetype: 'aggro',
    insight_type: 'strategy',
    content: `The Ur-Dragon is a dragon tribal deck that leverages eminence for cost reduction, then overwhelms opponents with value from attacking dragons. 

**Game Plan:**
- **Early game (T1-4):** Deploy mana rocks and cost reducers. Dragonlord's Servant, Dragonspeaker Shaman, and Herald's Horn reduce costs by 2-3 mana combined with eminence. Prioritize getting at least one reducer online before casting dragons.
- **Mid game (T5-8):** Deploy 2-3 dragons per turn with discounts active. Target utility dragons first — Scourge of Valkas for removal, Ganax for treasures, Miirym for token copies. Card draw from Vanquisher's Banner and Kindred Discovery keeps the hand full.
- **Late game (T8+):** If The Ur-Dragon resolves, each attack draws cards equal to attackers and cheats a permanent into play. Close with Dragon Tempest/Scourge of Valkas burn or Call the Spirit Dragons alt-win.

**Mulligan Priority:**
Keep hands with 3+ lands (at least 2 colors), 1 mana rock or cost reducer, 1 card draw spell, and 1-2 castable dragons. Eminence means you don't need to cast your commander — focus on board development.

**Turn Sequence:**
- T1-2: Deploy mana rock or cost reducer
- T3-4: First dragon (aim for utility: Rivaz, Ganax, or draw engine)
- T5-6: Deploy 2 dragons per turn with reducers online
- T7+: Explosive turns — draw triggers refill hand, dump dragons, attack

**Resource Management:**
Track discount totals before casting. With Ur-Dragon + 2 reducers, most dragons cost 2-4 mana. Wait for haste enablers before overcommitting attackers.`,
    taxonomy_tags: ['dragons', 'aggro', 'tribal'],
    card_mentions: [
      'The Ur-Dragon', "Dragonlord's Servant", 'Dragonspeaker Shaman', 
      "Herald's Horn", 'Scourge of Valkas', 'Ganax, Astral Hunter', 
      'Miirym, Sentinel Wyrm', "Vanquisher's Banner", 'Kindred Discovery',
      'Dragon Tempest', 'Call the Spirit Dragons', 'Rivaz of the Claw'
    ],
    confidence: 0.95,
    source_type: 'youtube',
    source_title: 'Building THE BEST Ur-Dragon Dragon Commander Deck! mtg edh'
  },
  {
    commander_id: '189dee6d-5328-4b21-bac3-63e7b932b47c',
    build_variant: 'dragons',
    archetype: 'aggro',
    insight_type: 'card_recommendation',
    content: `**Cost Reducers (6-8 slots):**
- Dragonlord's Servant / Dragonspeaker Shaman — Creature-based discounts that stack with eminence
- Sarkhan, Soul of Flame — Planeswalker that discounts dragons
- Rivaz of the Claw — Makes 2 mana for dragons + graveyard recursion
- Urza's Incubator / Herald's Horn — Artifact discounts (Herald also draws)
- Morophon, the Boundless — Reduces colored costs to near-zero

**Utility Dragons (12-15 slots):**
- Miirym, Sentinel Wyrm — Doubles every non-token dragon
- Tiamat — Tutors 5 dragons on ETB
- Hellkite Courser — Cheats The Ur-Dragon into play with haste
- Scourge of Valkas — Burn damage when dragons enter
- Terror of the Peaks — Similar burn with ward 3 life
- Goldspan Dragon / Ancient Copper Dragon / Old Gnawbone — Treasure generation
- Silumgar, the Drifting Death — Board control through -1/-1

**Draw Engines (5-7 slots):**
- Vanquisher's Banner — Anthem + draw on cast
- Kindred Discovery — Draw on attack (careful of self-mill)
- Temur Ascendancy — Haste + draw off 4+ power
- Elemental Bond / Garruk's Uprising — Draw off big creatures`,
    taxonomy_tags: ['dragons', 'aggro', 'tribal'],
    card_mentions: [
      "Dragonlord's Servant", 'Dragonspeaker Shaman', 'Sarkhan, Soul of Flame',
      'Rivaz of the Claw', "Urza's Incubator", "Herald's Horn", 
      'Morophon, the Boundless', 'Miirym, Sentinel Wyrm', 'Tiamat',
      'Hellkite Courser', 'Scourge of Valkas', 'Terror of the Peaks',
      'Goldspan Dragon', 'Ancient Copper Dragon', 'Old Gnawbone',
      'Silumgar, the Drifting Death', "Vanquisher's Banner", 'Kindred Discovery',
      'Temur Ascendancy', 'Elemental Bond', "Garruk's Uprising"
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Building THE BEST Ur-Dragon Dragon Commander Deck! mtg edh'
  },
  {
    commander_id: '189dee6d-5328-4b21-bac3-63e7b932b47c',
    build_variant: 'dragons',
    archetype: 'aggro',
    insight_type: 'budget_alternative',
    content: `**Mana Base Tiers:**

*Premium ($200+):* Fetch lands + shock lands + triomes. Maximum consistency and speed. True duals unnecessary but nice to have.

*Mid-Budget ($80-150):* Triomes + pain lands + check lands. Triomes are worth it — they cycle and are fetchable with basic land types. Skip fetches, use Capenna fetch substitutes instead.

*Budget ($30-50):* Uncommon tri-lands + tango lands + basics. Tango lands are fetchable and enter untapped with enough basics. Terramorphic Expanse/Evolving Wilds for fixing.

**Key Insight:** Tribal lands solve 5-color problems cheaply. Path of Ancestry, Unclaimed Territory, and Secluded Courtyard all produce any color for dragons. Prioritize these before expensive rainbow lands.

**Card Alternatives:**
- Chromatic Lantern ($10) → Dragon's Hoard ($2) + Carnelian Orb of Dragonkind ($1)
- Ancient Copper Dragon ($35) → Cavern-Hoard Dragon ($8) or Goldspan Dragon ($15)
- Mox Jasper (new) — Skip it. Only gives 1 mana and requires dragons already in play.`,
    taxonomy_tags: ['dragons', 'aggro', 'tribal'],
    card_mentions: [
      'Path of Ancestry', 'Unclaimed Territory', 'Secluded Courtyard',
      'Chromatic Lantern', "Dragon's Hoard", 'Carnelian Orb of Dragonkind',
      'Ancient Copper Dragon', 'Cavern-Hoard Dragon', 'Goldspan Dragon'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Building THE BEST Ur-Dragon Dragon Commander Deck! mtg edh'
  },
  {
    commander_id: '189dee6d-5328-4b21-bac3-63e7b932b47c',
    build_variant: 'dragons',
    archetype: 'aggro',
    insight_type: 'synergy',
    content: `**Dragon Token Doubling:**
Miirym, Sentinel Wyrm + Lathliss, Dragon Queen / Utvara Hellkite = exponential dragon generation. Miirym copies every non-token dragon, then Lathliss triggers on the copy entering.

**Treasure Engine:**
Ganax, Astral Hunter + token dragons = treasure generation scales with Miirym/Lathliss. Ancient Copper Dragon rolling even 10 creates enough mana for follow-up spells.

**Board Wipe Recovery:**
Patriarch's Bidding returns all dragons simultaneously. With Dragon Tempest or Scourge of Valkas, this can be lethal — each dragon entering sees all other dragons entering.

**Damage Amplification:**
Thrakkus the Butcher (doubles attacking dragon power) + Atarka, World Render (double strike) = quadruple damage. One dragon connecting for 20+ damage.

**Dracogenesis Draw Engine:**
Cost reducers + Dracogenesis + any draw trigger (Vanquisher's Banner, Temur Ascendancy) = chain through entire deck for near-free dragons.

**Combat Loops:**
Hellkite Charger + treasure generators (7 mana for extra combat) can go infinite with enough treasure production from Goldspan/Gnawbone/Ganax triggers.`,
    taxonomy_tags: ['dragons', 'aggro', 'tribal'],
    card_mentions: [
      'Miirym, Sentinel Wyrm', 'Lathliss, Dragon Queen', 'Utvara Hellkite',
      'Ganax, Astral Hunter', 'Ancient Copper Dragon', "Patriarch's Bidding",
      'Dragon Tempest', 'Scourge of Valkas', 'Thrakkus the Butcher',
      'Atarka, World Render', 'Dracogenesis', "Vanquisher's Banner",
      'Temur Ascendancy', 'Hellkite Charger', 'Goldspan Dragon', 'Old Gnawbone'
    ],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: 'Building THE BEST Ur-Dragon Dragon Commander Deck! mtg edh'
  },
  {
    commander_id: '189dee6d-5328-4b21-bac3-63e7b932b47c',
    build_variant: 'dragons',
    archetype: 'aggro',
    insight_type: 'common_mistake',
    content: `**Mistake 1: Trying to cast The Ur-Dragon**
The Ur-Dragon costs 9 mana in 5 colors. Treat eminence as your primary value — the attack trigger is gravy. The only reliable way to get it into play is Hellkite Courser.

**Mistake 2: Greedy mana bases without fixing**
5-color decks need intentional fixing. Don't rely on drawing Chromatic Lantern. Include 8-10 lands that produce any color for dragons (tribal lands) plus enough fixing to cast early plays.

**Mistake 3: All dragons, no support**
30+ dragons with no cost reducers means waiting until turn 6-7 for your first play. Include 6-8 cost reducers and 5-7 draw engines before maxing out on dragons.

**Mistake 4: No board wipe protection**
Dragons are expensive to recast. Include at least 2-3 protection effects: Heroic Intervention, Teferi's Protection, or recursion like Patriarch's Bidding.

**Mistake 5: Ignoring haste**
A turn cycle before attacking lets opponents remove your threats. Dragon Tempest and Temur Ascendancy are near-mandatory for closing games before removal hits.`,
    taxonomy_tags: ['dragons', 'aggro', 'tribal'],
    card_mentions: [
      'The Ur-Dragon', 'Hellkite Courser', 'Chromatic Lantern',
      'Heroic Intervention', "Teferi's Protection", "Patriarch's Bidding",
      'Dragon Tempest', 'Temur Ascendancy'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Building THE BEST Ur-Dragon Dragon Commander Deck! mtg edh'
  },
  {
    commander_id: '189dee6d-5328-4b21-bac3-63e7b932b47c',
    build_variant: 'dragons',
    archetype: 'aggro',
    insight_type: 'upgrade_path',
    content: `**Flexible Dragon Slots (swap based on meta):**
- Scourge of the Throne — Extra combat if you're hitting the archenemy. Great in battlecruiser, less useful in combo metas.
- Dragonlord Silumgar — Control Magic on a dragon. Swap in if your pod has problematic commanders.
- Decadent Dragon — Adventure provides card advantage. Swap out for more impactful dragons in faster games.
- Scion of Draco — Only 2 mana with triomes, gives keyword soup. Worth it if you have 2+ triomes.

**Board Wipe Selection:**
- Crux of Fate / Kindred Dominance — One-sided, keep your dragons
- Blasphemous Act — When you need everything dead (synergizes with Wrathful Red Dragon)
- Vanquish the Horde — Cheap in creature-heavy games

**Upgrade Path:**
- If games go too long, add Hellkite Charger infinite combat combo
- If getting targeted early, add more removal (Swords, Path) instead of utility dragons
- Premium upgrades: Ancient Tomb, Chrome Mox, Mana Vault for explosive starts`,
    taxonomy_tags: ['dragons', 'aggro', 'tribal'],
    card_mentions: [
      'Scourge of the Throne', 'Dragonlord Silumgar', 'Decadent Dragon',
      'Scion of Draco', 'Crux of Fate', 'Kindred Dominance',
      'Blasphemous Act', 'Wrathful Red Dragon', 'Vanquish the Horde',
      'Hellkite Charger', 'Ancient Tomb', 'Chrome Mox', 'Mana Vault'
    ],
    confidence: 0.8,
    source_type: 'youtube',
    source_title: 'Building THE BEST Ur-Dragon Dragon Commander Deck! mtg edh'
  }
]

async function main() {
  console.log('Starting Ur-Dragon insight distillation...')
  const startTime = Date.now()

  const result = await insertInsights(urDragonInsights)
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  
  if (result) {
    console.log(`✓ Inserted ${result.length} insights for The Ur-Dragon`)
    console.log(`  Build variant: dragons`)
    console.log(`  Archetype: aggro`)
    console.log(`  Insight types: ${urDragonInsights.map(i => i.insight_type).join(', ')}`)
  }
  
  console.log(`\nTime elapsed: ${elapsed}s`)
}

main().catch(console.error)
