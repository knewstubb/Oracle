/**
 * Distill Y'shtola, Night's Blessed insights
 * 
 * Usage: npx tsx scripts/distill-yshtola.ts
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

// Y'shtola, Night's Blessed insights from YouTube transcripts
const yshtolaInsights: InsightInput[] = [
  {
    commander_id: 'c8d99141-bb18-4d5f-9775-24487855c367',
    build_variant: 'spellslinger',
    archetype: 'control',
    insight_type: 'strategy',
    content: `Y'shtola is an Esper drain/control deck that wins through incremental life drain from casting 3+ mana non-creature spells. Each qualifying spell deals 2 damage to each opponent and gains you 2 life.

**Game Plan:**
- **Early game (T1-4):** Deploy cost reducers (medallions, Stormscape Familiar) and mana rocks. Y'shtola comes down T3-4. Focus on setting up, not aggressing.
- **Mid game (T5-8):** Start chaining 3-mana spells. Each spell deals 6 damage total (2 to each opponent) and gains you 6 life with lifelink effects. Card draw triggers keep your hand full.
- **Late game (T8+):** Overwhelm with spell chains. Two 3-mana spells per turn = 12 damage to the table. Finish with Exsanguinate or just drain them out.

**Key Mechanic — Card Draw:**
Y'shtola draws a card at each end step if ANY player lost 4+ life that turn. This includes:
- Opponents attacking each other
- Damage you deal with spells
- Self-damage from your pain lands (deal yourself 1 if someone already dealt you 3)

**Combat Role:**
Y'shtola herself is a 2/4 with vigilance. With Steel of the Godhead (unblockable + lifelink), she swings for 2 damage, helping trigger her own draw ability. She's defensive primarily.`,
    taxonomy_tags: ['spellslinger', 'control', 'lifegain'],
    card_mentions: [
      "Y'shtola, Night's Blessed", 'Stormscape Familiar', 'Steel of the Godhead',
      'Exsanguinate'
    ],
    confidence: 0.95,
    source_type: 'youtube',
    source_title: "Y'shtola, Night's Blessed. Drain the table! Commander Deck Tech. Bracket 3"
  },
  {
    commander_id: 'c8d99141-bb18-4d5f-9775-24487855c367',
    build_variant: 'spellslinger',
    archetype: 'control',
    insight_type: 'card_recommendation',
    content: `**Curiosity Effects (Essential — draw 3 cards per spell):**
- Curiosity / Keen Sense — "Whenever enchanted creature deals damage to an opponent, draw a card." Y'shtola deals 2 to each opponent = draw 3 cards per spell.
- Ophidian Eye — Same effect with flash, can be cast at instant speed.
- Steel of the Godhead — Gives lifelink (6 life per spell with 3 opponents) AND unblockable to help trigger the 4-damage threshold.

**Cost Reducers (6-8 slots):**
- Stormscape Familiar — White and black spells cost 1 less
- Sapphire Medallion / Jet Medallion — Blue/black spells cost 1 less
- Mind Stone Apparatus — Incremental discount over time, has flash

**Free Spells (Game-changing):**
- Fierce Guardianship — Free counterspell, triggers Y'shtola (MV 3)
- Teferi's Protection — Free protection, triggers Y'shtola (MV 3)
- Malakir Rebirth — Protects Y'shtola for 2 life

**Card Draw (works with Y'shtola's theme):**
- Painful Truths — 3 mana, draw 3, lose 3 life (triggers Y'shtola)
- Frantic Search — Free spell (untap 3 lands), triggers Y'shtola
- Stock Up — 3 mana, look at top 5, take 2 (better than Drown in Dreams)
- Risky Shortcut — 3 mana, draw 2, each player loses 2 life`,
    taxonomy_tags: ['spellslinger', 'control', 'lifegain'],
    card_mentions: [
      'Curiosity', 'Keen Sense', 'Ophidian Eye', 'Steel of the Godhead',
      'Stormscape Familiar', 'Sapphire Medallion', 'Jet Medallion',
      'Mind Stone Apparatus', 'Fierce Guardianship', "Teferi's Protection",
      'Malakir Rebirth', 'Painful Truths', 'Frantic Search', 'Stock Up',
      'Risky Shortcut'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: "Y'shtola, Night's Blessed. Drain the table! Commander Deck Tech. Bracket 3"
  },
  {
    commander_id: 'c8d99141-bb18-4d5f-9775-24487855c367',
    build_variant: 'spellslinger',
    archetype: 'control',
    insight_type: 'synergy',
    content: `**Curiosity + Y'shtola = Card Advantage Engine:**
Each 3+ mana non-creature spell you cast: Y'shtola deals 2 to each opponent → Curiosity triggers 3 times → Draw 3 cards. With lifelink, gain 6 life too. One spell becomes massive value.

**Lifelink Drain Loop:**
Steel of the Godhead + Y'shtola + any 3-mana spell = Deal 6 damage total + gain 6 life. Stack with Enduring Tenacity ("whenever you gain life, target opponent loses that much") for doubled drain.

**Delney, Streetwise Lookout:**
Y'shtola has 2 power. Delney makes abilities of power-2-or-less creatures trigger an additional time. Y'shtola's "deal 2 damage to each opponent" triggers twice = 4 damage per spell, 12 total per spell.

**Jin-Gitaxias Flip:**
Jin-Gitaxias draws a card when you cast 3+ MV non-creature spells. Flips when you have 7+ cards. Flip side: Draw cards equal to hand size, then cast any number of spells free. In a deck that draws 3+ cards per spell, reaching 7 cards is trivial.

**Self-Damage Lands for Triggers:**
Pain lands (Underground River, Caves of Koilos) let you deal yourself damage. If opponents dealt you 3 damage, deal yourself 1 to trigger Y'shtola's draw at end step.`,
    taxonomy_tags: ['spellslinger', 'control', 'lifegain'],
    card_mentions: [
      'Curiosity', "Y'shtola, Night's Blessed", 'Steel of the Godhead',
      'Enduring Tenacity', 'Delney, Streetwise Lookout', 'Jin-Gitaxias',
      'Underground River', 'Caves of Koilos'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: "Y'shtola, Night's Blessed. Drain the table! Commander Deck Tech. Bracket 3"
  },
  {
    commander_id: 'c8d99141-bb18-4d5f-9775-24487855c367',
    build_variant: 'spellslinger',
    archetype: 'control',
    insight_type: 'budget_alternative',
    content: `**Expensive Cards to Consider:**
- Teferi's Protection ($40+) — Essential protection, hard to replace
- Alhammarret's Archive ($15) — Doubles life gain AND card draw, wins games when it sticks
- Jin-Gitaxias ($10) — Strong but replaceable with more draw spells

**Budget Alternatives:**
- Teferi's Protection → Clever Concealment (free if you control Y'shtola)
- Alhammarret's Archive → Vito, Thorn of the Dusk Rose (cheaper, similar drain effect)
- Stock Up (expensive uncommon) → Drown in Dreams (4 mana instead of 3, but cheaper $)

**Mana Base Budget Options:**
The deck wants pain lands for self-damage triggers anyway. These are cheap:
- Underground River, Caves of Koilos, Adarkar Wastes
- Budget fetches: Evolving Wilds, Terramorphic Expanse
- Trilands work fine on a budget

**Core on Any Budget:**
- Curiosity effects are cheap ($1-3 each)
- Cost reducers (medallions) are budget-friendly
- Painful Truths, Frantic Search, Risky Shortcut all under $2`,
    taxonomy_tags: ['spellslinger', 'control', 'lifegain'],
    card_mentions: [
      "Teferi's Protection", "Alhammarret's Archive", 'Jin-Gitaxias',
      'Clever Concealment', 'Vito, Thorn of the Dusk Rose', 'Stock Up',
      'Drown in Dreams', 'Underground River', 'Caves of Koilos',
      'Adarkar Wastes', 'Curiosity', 'Painful Truths', 'Frantic Search',
      'Risky Shortcut'
    ],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: "Y'shtola, Night's Blessed. Drain the table! Commander Deck Tech. Bracket 3"
  },
  {
    commander_id: 'c8d99141-bb18-4d5f-9775-24487855c367',
    build_variant: 'spellslinger',
    archetype: 'control',
    insight_type: 'common_mistake',
    content: `**Mistake 1: Including too many high-mana spells**
Don't load up on 5-6 mana spells. The goal is to cast TWO 3-mana spells per turn for 12 total damage. Five 3-mana spells > Two 5-mana spells for this deck.

**Mistake 2: Forgetting Y'shtola triggers on ANY player losing 4 life**
Track damage dealt to all players. If opponents attack each other, you still draw at end step. Don't miss this trigger — it's significant card advantage.

**Mistake 3: Being too aggressive early**
Y'shtola is a control deck that needs setup time. Don't rush to drain people — establish cost reducers, get Curiosity effects online, then start the engine.

**Mistake 4: Not running enough protection**
Y'shtola is the engine. If she dies repeatedly, the deck stalls. Include: Malakir Rebirth, Spell Skite, Teferi's Protection, Solitary Confinement.

**Mistake 5: Playing Solitary Confinement too early**
Solitary Confinement (shroud, prevent all damage) is a game-winner but makes you a target. Wait until mid-late game when opponents have used removal, then drop it and lock out damage.

**Mistake 6: Missing triggers**
This deck has MANY triggers — end step draws, spell cast triggers, damage-dealt triggers. Use physical tokens or dice to track. You WILL miss triggers otherwise.`,
    taxonomy_tags: ['spellslinger', 'control', 'lifegain'],
    card_mentions: [
      "Y'shtola, Night's Blessed", 'Malakir Rebirth', 'Spell Skite',
      "Teferi's Protection", 'Solitary Confinement', 'Curiosity'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: "Y'shtola, Night's Blessed. Drain the table! Commander Deck Tech. Bracket 3"
  },
  {
    commander_id: 'c8d99141-bb18-4d5f-9775-24487855c367',
    build_variant: 'spellslinger',
    archetype: 'control',
    insight_type: 'upgrade_path',
    content: `**Defensive Package (Anti-Aggro Meta):**
- Propaganda / Ghostly Prison — Tax attackers
- No Mercy — Destroy creatures that damage you
- Solitary Confinement — Complete damage prevention (works since you draw cards anyway)

**Creature Support Package:**
- Archmage Emeritus — Draw when casting instants/sorceries (doesn't trigger Y'shtola but adds draw)
- Sygg, River Cutthroat — Mini Y'shtola effect (draw if opponent lost 3+ life)
- Talion, the Kindly Lord — Choose "2" — opponents lose 2 life and you draw when they cast 2-MV spells

**Graveyard Recursion (Higher Power):**
- Emth'selch, of the Third Sea — Cast instants/sorceries from graveyard when opponents lose life. Spells from graveyard cost 2 less.
- Allows you to reuse Frantic Search, Counterspells, etc.

**Win Condition Upgrades:**
- Exsanguinate — X-spell finisher, gains life equal to damage dealt
- Enduring Tenacity — "Whenever you gain life, target opponent loses that much"
- Consider removing some creatures for more non-creature spells to maximize Y'shtola triggers`,
    taxonomy_tags: ['spellslinger', 'control', 'lifegain'],
    card_mentions: [
      'Propaganda', 'Ghostly Prison', 'No Mercy', 'Solitary Confinement',
      'Archmage Emeritus', 'Sygg, River Cutthroat', 'Talion, the Kindly Lord',
      "Emth'selch, of the Third Sea", 'Frantic Search', 'Exsanguinate',
      'Enduring Tenacity'
    ],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: "Y'shtola, Night's Blessed. Drain the table! Commander Deck Tech. Bracket 3"
  }
]

async function main() {
  console.log("Starting Y'shtola insight distillation...")
  const startTime = Date.now()

  const result = await insertInsights(yshtolaInsights)
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  
  if (result) {
    console.log(`✓ Inserted ${result.length} insights for Y'shtola, Night's Blessed`)
    console.log(`  Build variant: spellslinger`)
    console.log(`  Archetype: control`)
    console.log(`  Insight types: ${yshtolaInsights.map(i => i.insight_type).join(', ')}`)
  }
  
  console.log(`\nTime elapsed: ${elapsed}s`)
}

main().catch(console.error)
