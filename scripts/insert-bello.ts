/**
 * Insert structured insights for Bello, Bard of the Brambles
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const COMMANDER_NAME = 'Bello, Bard of the Brambles'

const insights = [
  {
    build_variant: 'enchantments',
    archetype: 'aggro',
    insight_type: 'strategy',
    content: `Bello is a Gruul enchantment-beatdown commander. During YOUR turn, each non-equipment artifact and non-Aura enchantment with MV 4+ becomes a 4/4 Elemental with indestructible, haste, and "deals combat damage to player → draw a card."

**Game Plan:**
- **Early game (T1-3):** Deploy ramp and value enchantments. Set up your board.
- **Mid game (T4-5):** Cast Bello. Suddenly your enchantments are 4/4 indestructible hasty attackers.
- **Late game:** Swing with your animated enchantments. They draw cards on damage. Opponents can't profitably block indestructible creatures.

**Key Lines:**
- Enchantments that sit around doing nothing now attack for 4 and draw cards
- Indestructible means opponents must chump or take damage + give you cards
- Only animated during YOUR turn — can't block, but doesn't matter for aggro plan`,
    taxonomy_tags: ['enchantments', 'aggro', 'beatdown', 'enchantress'],
    card_mentions: ['Bello, Bard of the Brambles'],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Bello, Bard of the Brambles Gruul Enchantment Beatdown'
  },
  {
    build_variant: 'enchantments',
    archetype: 'aggro',
    insight_type: 'card_recommendation',
    content: `**Value Enchantments (become 4/4s):**
- Garruk's Uprising — Trample + draw on 4+ power creatures (all your animated stuff)
- Citadel Siege — +2 counters each combat OR tap opponents' creatures
- Zendikar Resurgent — Mana doubling + draw on creatures

**Indestructible Gods (always creatures during your turn):**
- Nylea, God of the Hunt — Trample for team + pump ability
- Xenagos, God of Revels — Double a creature's power + haste

**Enchantment Support:**
- Setessan Champion — Grows + draws on enchantments
- Destiny Spinner — Can't be countered + animate lands
- Composer of Spring — Constellation ramp

**Combat Enhancers:**
- Archetype of Aggression — Your creatures have trample, opponents don't
- Nylea's Forerunner — Trample for team`,
    taxonomy_tags: ['enchantments', 'aggro', 'beatdown', 'enchantress'],
    card_mentions: ["Garruk's Uprising", 'Citadel Siege', 'Zendikar Resurgent', 'Nylea, God of the Hunt', 'Xenagos, God of Revels', 'Setessan Champion', 'Destiny Spinner', 'Composer of Spring', 'Archetype of Aggression', "Nylea's Forerunner"],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Bello, Bard of the Brambles Gruul Enchantment Beatdown'
  },
  {
    build_variant: 'enchantments',
    archetype: 'aggro',
    insight_type: 'synergy',
    content: `**Trample Enablers:**
4/4 indestructible is great, but gets chump blocked. Give trample:
- Archetype of Aggression — Team trample + opponents lose trample
- Garruk's Uprising — Trample + draws cards (it's a 4/4 too!)
- Nylea, God of the Hunt — Trample + pump ability

**Theros Gods:**
Gods with devotion < 5 aren't creatures normally. But with Bello, they ARE creatures during your turn (4/4s). If devotion IS met, they're still indestructible anyway. Win-win.

**Card Draw Multiplication:**
Each animated enchantment that connects draws a card. 5 enchantments attacking = potentially 5 cards. Combined with Garruk's Uprising triggers = massive draw.

**Board Wipe Recovery:**
Blasphemous Act when Bello is NOT out = wipe opponents, your enchantments survive (not creatures). Then cast Bello = full swing next turn.`,
    taxonomy_tags: ['enchantments', 'aggro', 'beatdown', 'enchantress'],
    card_mentions: ['Archetype of Aggression', "Garruk's Uprising", 'Nylea, God of the Hunt', 'Bello, Bard of the Brambles', 'Blasphemous Act'],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: 'Bello, Bard of the Brambles Gruul Enchantment Beatdown'
  },
  {
    build_variant: 'enchantments',
    archetype: 'aggro',
    insight_type: 'budget_alternative',
    content: `**Expensive → Budget Swaps:**
- Xenagos, God of Revels ($15) → Nylea, God of the Hunt ($5) — Still a god, gives trample
- Doubling Season ($60) → Not needed, deck works without it

**Budget Enchantments (all become 4/4s):**
- Garruk's Uprising ($1), Citadel Siege ($0.25)
- Rhythm of the Wild ($2) — Riot for creatures OR counter
- Frontier Siege ($0.50) — 2 mana each main phase

**Budget Support:**
- Setessan Champion ($1), Eidolon of Blossoms ($1)
- Destiny Spinner ($0.50), Archetype of Aggression ($0.25)

**Budget Finishers:**
- Overwhelming Stampede ($1), Return of the Wildspeaker ($0.50)
- Shamanic Revelation ($0.50) — Draw + life

Bello is naturally budget — enchantments are cheap and do the heavy lifting.`,
    taxonomy_tags: ['enchantments', 'aggro', 'beatdown', 'enchantress'],
    card_mentions: ['Xenagos, God of Revels', 'Nylea, God of the Hunt', "Garruk's Uprising", 'Citadel Siege', 'Rhythm of the Wild', 'Frontier Siege', 'Setessan Champion', 'Eidolon of Blossoms', 'Destiny Spinner', 'Archetype of Aggression', 'Overwhelming Stampede', 'Return of the Wildspeaker', 'Shamanic Revelation'],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: 'Bello, Bard of the Brambles Gruul Enchantment Beatdown'
  },
  {
    build_variant: 'enchantments',
    archetype: 'aggro',
    insight_type: 'common_mistake',
    content: `**Mistake 1: Running too many Auras**
Auras don't get animated by Bello — only non-Aura enchantments. Focus on global enchantments.

**Mistake 2: Forgetting MV 4+ requirement**
Only enchantments with mana value 4 or greater become creatures. Don't overload on cheap enchantments.

**Mistake 3: Trying to block with enchantments**
Animation only happens during YOUR turn. On opponents' turns, enchantments are just enchantments. Plan defense accordingly.

**Mistake 4: Ignoring trample**
4/4 indestructible gets chump-blocked forever. Include trample enablers or opponents will just throw tokens at you.

**Mistake 5: Not protecting Bello**
Without Bello, your enchantments don't attack. Include protection (Swiftfoot Boots) or ways to recast him quickly.`,
    taxonomy_tags: ['enchantments', 'aggro', 'beatdown', 'enchantress'],
    card_mentions: ['Bello, Bard of the Brambles', 'Swiftfoot Boots'],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Bello, Bard of the Brambles Gruul Enchantment Beatdown'
  },
  {
    build_variant: 'enchantments',
    archetype: 'aggro',
    insight_type: 'upgrade_path',
    content: `**Flex Slots:**
- Low-impact enchantments under MV 4 — Cut for bigger enchantments
- Expensive creatures without synergy — Cut for more enchantments

**Power Upgrades:**
- Add Xenagos, God of Revels — Double power + haste (redundant but powerful)
- Add Berserk — Double power, give trample, one-shot potential
- Add Wild Pair — Play enchantment creature → tutor another

**Alternative Builds:**
- **Artifact hybrid:** Include MV 4+ artifacts too (they also animate)
- **Sagas:** Sagas are enchantments, can animate before they sacrifice
- **Stax:** Animated Stax enchantments that attack (Mana Web, etc.)

**Spicy Tech:**
- Invasion of Chandler / Layline Surge — Battle flips to enchantment, animates
- Opalescence — All enchantments are creatures all the time (symmetry warning)
- Replenish — Mass reanimate enchantments → huge swing next turn`,
    taxonomy_tags: ['enchantments', 'aggro', 'beatdown', 'enchantress'],
    card_mentions: ['Xenagos, God of Revels', 'Berserk', 'Wild Pair', 'Mana Web', 'Opalescence', 'Replenish'],
    confidence: 0.8,
    source_type: 'youtube',
    source_title: 'Bello, Bard of the Brambles Gruul Enchantment Beatdown'
  }
]

async function main() {
  console.log(`\nProcessing: ${COMMANDER_NAME}`)
  const { data: commander } = await supabase.from('ref_commanders').select('id, display_name, edhrec_rank').ilike('display_name', COMMANDER_NAME).single()
  if (!commander) { console.error('Not found'); return }
  console.log(`Found: ${commander.display_name} (Rank #${commander.edhrec_rank})`)
  
  const { count } = await supabase.from('ref_commander_insights').select('*', { count: 'exact', head: true }).eq('commander_id', commander.id)
  console.log(`Deleting ${count || 0} old insights...`)
  await supabase.from('ref_commander_insights').delete().eq('commander_id', commander.id)
  
  const start = Date.now()
  const { data, error } = await supabase.from('ref_commander_insights').insert(insights.map(i => ({ ...i, commander_id: commander.id }))).select()
  if (error) { console.error('Error:', error); return }
  console.log(`✓ Inserted ${data.length} insights (${((Date.now() - start) / 1000).toFixed(2)}s)`)
}
main().catch(console.error)
