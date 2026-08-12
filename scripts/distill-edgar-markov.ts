/**
 * Distill Edgar Markov insights (reprocessing old format)
 * 
 * Usage: npx tsx scripts/distill-edgar-markov.ts
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

// Edgar Markov insights distilled from YouTube transcripts
const edgarInsights: InsightInput[] = [
  {
    commander_id: 'fd6c3664-b4cb-4fe6-9ede-ff2369c23498',
    build_variant: 'vampires',
    archetype: 'aggro',
    insight_type: 'strategy',
    content: `Edgar Markov is a vampire tribal aggro deck that exploits the eminence mechanic — one of the most broken mechanics ever printed. You get free 1/1 vampire tokens just by casting vampires, even with Edgar in the command zone.

**Game Plan:**
- **Early game (T1-3):** Flood the board with cheap vampires. Each vampire cast = free 1/1 token. By turn 3, you can have 6+ creatures from just 3 spells. Deploy cost-efficient vampires and drain effects.
- **Mid game (T4-6):** Swing wide with vampire lords buffing your army. Edgar's attack trigger (+1/+1 counters on all vampires) makes your tokens dangerous. Start draining opponents with Blood Artist effects.
- **Late game (T7+):** Close with mass drain (Sanctum Seeker, Malakir Bloodwitch) or the Exquisite Blood + Vito/Marauding Blight-Priest combo for instant win.

**Two Win Conditions:**
1. **Combat damage** — Go wide with tokens, buff with lords, swing for lethal
2. **Drain** — Bleed opponents with "whenever creature dies/enters, opponent loses life" effects

**Key Insight:** You often don't need to cast Edgar. Eminence from the command zone is the primary value. Only cast him when you need the attack trigger for +1/+1 counters.`,
    taxonomy_tags: ['vampires', 'aggro', 'tribal', 'sacrifice'],
    card_mentions: [
      'Edgar Markov', 'Blood Artist', 'Sanctum Seeker', 'Malakir Bloodwitch',
      'Exquisite Blood', 'Vito, Thorn of the Dusk Rose', 'Marauding Blight-Priest'
    ],
    confidence: 0.95,
    source_type: 'youtube',
    source_title: 'Edgar Markov Remastered Build The Ultimate Vampire EDH Deck!'
  },
  {
    commander_id: 'fd6c3664-b4cb-4fe6-9ede-ff2369c23498',
    build_variant: 'vampires',
    archetype: 'aggro',
    insight_type: 'card_recommendation',
    content: `**1-Drop Vampires (Critical mass for early pressure):**
- Falkenrath Pit Fighter — Sac a vampire to draw, generates token with Edgar
- Indulgent Aristocrat — Sac outlet + mass +1/+1 counters
- Shadow Alley Denizen — Grants intimidate to black creatures entering

**Drain Package (6-8 slots, essential):**
- Blood Artist — Drain on ANY creature dying (including opponents')
- Cruel Celebrant — Same as Blood Artist, vampire version
- Vindictive Vampire — 1 life drain when your creatures die
- Elas il-Kor, Sadistic Pilgrim — Best 2-drop drain engine (not a vampire but too good)
- Vito, Thorn of the Dusk Rose — Converts life gain to drain, combo piece
- Sanctum Seeker — Drain on each vampire attack

**Vampire Lords (4-6 slots):**
- Legion Lieutenant — +1/+1 to all vampires
- Captivating Vampire — +1/+1 AND steal creatures by tapping 5 vampires
- Stromkirk Captain — +1/+1 and first strike to all vampires
- Bloodline Keeper — Flips into +2/+2 lord, generates 2/2 flyers

**Value Engines:**
- Welcoming Vampire — Draw on power 2 or less entering (once per turn)
- Champion of Dusk — Draw cards equal to vampires you control (refill hand)
- Skullclamp — Equip to 1/1 tokens, draw 2 cards. Busted with free tokens.
- Reconnaissance — Remove attackers from combat after triggers. Protects Edgar.`,
    taxonomy_tags: ['vampires', 'aggro', 'tribal', 'sacrifice'],
    card_mentions: [
      'Falkenrath Pit Fighter', 'Indulgent Aristocrat', 'Shadow Alley Denizen',
      'Blood Artist', 'Cruel Celebrant', 'Vindictive Vampire', 'Elas il-Kor, Sadistic Pilgrim',
      'Vito, Thorn of the Dusk Rose', 'Sanctum Seeker', 'Legion Lieutenant',
      'Captivating Vampire', 'Stromkirk Captain', 'Bloodline Keeper',
      'Welcoming Vampire', 'Champion of Dusk', 'Skullclamp', 'Reconnaissance'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Edgar Markov Remastered Build The Ultimate Vampire EDH Deck!'
  },
  {
    commander_id: 'fd6c3664-b4cb-4fe6-9ede-ff2369c23498',
    build_variant: 'vampires',
    archetype: 'aggro',
    insight_type: 'synergy',
    content: `**Eminence Token Generation:**
Every vampire spell = free 1/1 token. With lords on board (+1/+1, +2/+2), these "free" tokens become real threats. T1 vampire + T2 vampire + T3 vampire = 6 creatures from 3 cards.

**Drain Loop (Non-Infinite):**
Blood Artist + Cruel Celebrant + board wipe = massive drain. If you have 10 vampires and someone wipes, each opponent loses 20 life and you gain 20.

**Infinite Combo (Win on Spot):**
Exquisite Blood + Vito/Marauding Blight-Priest:
- Vito: "Whenever you gain life, target opponent loses that much"
- Exquisite Blood: "Whenever opponent loses life, you gain that much"
- One trigger starts infinite loop → drain all opponents to 0

Alternative: Bloodthirsty Conqueror works like Exquisite Blood ("whenever opponent loses life, gain life")

**Skullclamp Engine:**
Equip Skullclamp to 1/1 vampire token (free from eminence) → token dies → draw 2 cards. Repeat for massive card advantage. This is why Edgar is so strong — even your "free" tokens convert to cards.

**Reconnaissance Protection:**
Attack with Edgar → get +1/+1 counter trigger → remove Edgar from combat before damage. He survives, you get the counters. Works on all attackers.`,
    taxonomy_tags: ['vampires', 'aggro', 'tribal', 'sacrifice'],
    card_mentions: [
      'Edgar Markov', 'Blood Artist', 'Cruel Celebrant', 'Exquisite Blood',
      'Vito, Thorn of the Dusk Rose', 'Marauding Blight-Priest', 'Bloodthirsty Conqueror',
      'Skullclamp', 'Reconnaissance'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Edgar Markov Remastered Build The Ultimate Vampire EDH Deck!'
  },
  {
    commander_id: 'fd6c3664-b4cb-4fe6-9ede-ff2369c23498',
    build_variant: 'vampires',
    archetype: 'aggro',
    insight_type: 'budget_alternative',
    content: `**Mana Base (Biggest Cost):**
Edgar is color-intensive (Mardu: WBR) and wants to play turn 1. Premium mana bases run $200+.

*Budget Options:*
- Replace fetch lands with basic lands + Evolving Wilds/Terramorphic Expanse
- Pain lands (Caves of Koilos, Battlefield Forge, Sulfurous Springs) are cheaper than shocks
- Check lands (Dragonskull Summit, etc.) work fine with enough basics
- Tapped tri-lands are playable but slow you down significantly

**Card Alternatives:**
- Exquisite Blood ($40+) → Cut the combo entirely, lean into aggro/drain without infinite
- Demonic Tutor ($40) → Diabolic Intent ($5) — works great with free tokens to sac
- Skullclamp ($10) — No real replacement, but prioritize this. Too good.
- Champion of Dusk ($3) — Already budget-friendly, essential include

**Budget Build Philosophy:**
Edgar's power comes from eminence, which is free. Budget Edgar can still flood the board with cheap vampires. Focus on:
1. Low-cost vampires (1-2 mana)
2. Drain effects (Blood Artist is $2)
3. One mass draw spell (Champion of Dusk)

Skip expensive tutors and combo pieces — aggro drain still wins games.`,
    taxonomy_tags: ['vampires', 'aggro', 'tribal', 'sacrifice'],
    card_mentions: [
      'Edgar Markov', 'Caves of Koilos', 'Battlefield Forge', 'Sulfurous Springs',
      'Dragonskull Summit', 'Exquisite Blood', 'Demonic Tutor', 'Diabolic Intent',
      'Skullclamp', 'Champion of Dusk', 'Blood Artist'
    ],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: 'Edgar Markov Remastered Build The Ultimate Vampire EDH Deck!'
  },
  {
    commander_id: 'fd6c3664-b4cb-4fe6-9ede-ff2369c23498',
    build_variant: 'vampires',
    archetype: 'aggro',
    insight_type: 'common_mistake',
    content: `**Mistake 1: Running too many expensive vampires**
Edgar wants low-curve vampires (1-3 mana) to maximize eminence triggers. A 6-mana vampire that makes one token is worse than three 2-mana vampires that make three tokens.

**Mistake 2: No protection against board wipes**
Edgar goes wide, making you vulnerable to Wrath effects. Include:
- Boros Charm (indestructible mode)
- Clever Concealment (phase out with convoke)
- Teferi's Protection
- Reconnaissance (dodge combat damage)

**Mistake 3: Cutting drain effects for more vampires**
The drain package is your backup win condition. If combat is locked out, Blood Artist + board presence still wins. Don't cut these for "cool" vampires.

**Mistake 4: Casting Edgar too early**
Edgar costs 6 mana. By turn 6, you should already have a threatening board from eminence. Only cast Edgar when:
- You need the +1/+1 attack trigger to push damage
- You have protection ready
- Opponents have already used removal

**Mistake 5: Including Coat of Arms**
Coat of Arms buffs ALL creatures of a shared type. Your goblin opponent benefits. Use Banner of Kinship instead — only buffs your vampires.

**Mistake 6: Forgetting Edgar makes tokens on CAST, not ETB**
Counterspells still give you the token. The vampire doesn't need to resolve.`,
    taxonomy_tags: ['vampires', 'aggro', 'tribal', 'sacrifice'],
    card_mentions: [
      'Edgar Markov', 'Boros Charm', 'Clever Concealment', "Teferi's Protection",
      'Reconnaissance', 'Blood Artist', 'Coat of Arms', 'Banner of Kinship'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Edgar Markov Remastered Build The Ultimate Vampire EDH Deck!'
  },
  {
    commander_id: 'fd6c3664-b4cb-4fe6-9ede-ff2369c23498',
    build_variant: 'vampires',
    archetype: 'aggro',
    insight_type: 'upgrade_path',
    content: `**Protection Package Upgrades:**
- Teferi's Protection ($45) — Best protection spell, phases out everything
- Flawless Maneuver ($8) — Free if you control commander
- Boros Charm ($3) — Flexible, can also deal 4 damage or give double strike

**Combo Finisher (Higher Power):**
Add Exquisite Blood ($40+) for the infinite combo with Vito/Marauding Blight-Priest. One life gain or loss triggers infinite loop.

**Card Advantage Upgrades:**
- Necropotence ($25) — Pay life to draw cards, insane in a deck that gains life
- Phyrexian Arena ($8) — Steady draw
- Dark Confidant ($15) — Low curve means minimal life loss

**Mana Base Upgrades:**
Priority order for lands:
1. Shock lands (fetchable, 2 life for untapped)
2. Fetch lands (thin deck, fix colors)
3. Phyrexian Tower ($25) — Sac outlet that makes mana, incredible in this deck

**Interaction Upgrades:**
- Swords to Plowshares / Path to Exile — Premium 1-mana removal
- Anguished Unmaking ($3) — Exile any nonland permanent
- Deadly Rollick — Free removal if you control commander

**Flex Slots to Cut:**
- Coat of Arms (replace with Banner of Kinship)
- High-CMC vampires that don't drain or draw
- Situational vampires that don't impact the board immediately`,
    taxonomy_tags: ['vampires', 'aggro', 'tribal', 'sacrifice'],
    card_mentions: [
      "Teferi's Protection", 'Flawless Maneuver', 'Boros Charm', 'Exquisite Blood',
      'Vito, Thorn of the Dusk Rose', 'Marauding Blight-Priest', 'Necropotence',
      'Phyrexian Arena', 'Dark Confidant', 'Phyrexian Tower',
      'Swords to Plowshares', 'Path to Exile', 'Anguished Unmaking', 'Deadly Rollick',
      'Coat of Arms', 'Banner of Kinship'
    ],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: 'Edgar Markov Remastered Build The Ultimate Vampire EDH Deck!'
  }
]

async function main() {
  console.log('Starting Edgar Markov insight distillation (reprocessing)...')
  const startTime = Date.now()

  const result = await insertInsights(edgarInsights)
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  
  if (result) {
    console.log(`✓ Inserted ${result.length} insights for Edgar Markov`)
    console.log(`  Build variant: vampires`)
    console.log(`  Archetype: aggro`)
    console.log(`  Insight types: ${edgarInsights.map(i => i.insight_type).join(', ')}`)
  }
  
  console.log(`\nTime elapsed: ${elapsed}s`)
}

main().catch(console.error)
