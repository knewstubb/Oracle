/**
 * Distill Urza, Lord High Artificer insights (reprocessing)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const urzaInsights = [
  {
    commander_id: 'ea252390-7428-4717-8f42-ab7ed7cef790',
    build_variant: 'artifacts',
    archetype: 'combo',
    insight_type: 'strategy',
    content: `Urza is a mono-blue artifact combo/stax deck that turns all artifacts into mana rocks and assembles infinite mana combos to win.

**Urza's Three Abilities:**
1. Creates a 0/0 Construct that gets +1/+1 per artifact (often a massive beater)
2. Tap ANY artifact to add {U} — your Mana Crypts, Sol Rings, even 0-cost trinkets become mana
3. Pay {5}: Shuffle library, exile top card, cast it free this turn (powerful dig)

**Game Plan:**
- **Early game (T1-3):** Deploy cheap/free artifacts. Urza on T2-3 with fast mana is devastating. Even a board of 0-cost artifacts becomes a mana engine.
- **Mid game (T4-6):** Assemble stax pieces (Winter Orb, Static Orb) that hurt opponents but not you (tap them for mana with Urza before your turn). Dig with Urza's {5} ability.
- **Late game:** Assemble infinite mana combo, then win with outlets (Walking Ballista, Urza's ability to cast entire deck).

**Key Insight:** Stax pieces like Winter Orb only work while UNTAPPED. Tap them with Urza at end of opponent's turn = they suffer the effect, you don't.`,
    taxonomy_tags: ['artifacts', 'combo', 'stax'],
    card_mentions: [
      'Urza, Lord High Artificer', 'Winter Orb', 'Static Orb', 'Walking Ballista',
      'Mana Crypt', 'Sol Ring'
    ],
    confidence: 0.95,
    source_type: 'youtube',
    source_title: 'Urza, Lord High Artificer Magic the Gathering Commander deck tech Stax Combo'
  },
  {
    commander_id: 'ea252390-7428-4717-8f42-ab7ed7cef790',
    build_variant: 'artifacts',
    archetype: 'combo',
    insight_type: 'card_recommendation',
    content: `**0-Cost Artifacts (Critical for combos):**
- Mana Crypt / Mox Opal / Mox Amber / Chrome Mox — Fast mana AND Urza fuel
- Jeweled Amulet / Everflowing Chalice — Become mox sapphires with Urza
- Lotus Petal — Sac for any color OR tap for {U} with Urza
- Urza's Bauble / Mishra's Bauble — Cantrip artifacts, free mana with Urza

**Stax Pieces (tap before your turn):**
- Winter Orb — Players untap only 1 land. Tap it with Urza = doesn't affect you
- Static Orb — Players untap only 2 permanents. Same trick
- Howling Mine — Tap before your turn = only opponents draw extra

**Combo Pieces:**
- Basalt Monolith + Rings of Brighthearth — Infinite colorless mana
- Mystic Forge + Sensei's Divining Top — Draw entire deck (costs {1} per card)
- Intruder Alarm + any token maker (Sai, Efficient Construction) — Infinite tokens/mana

**Protection:**
- Lightning Greaves — Protect Urza
- Darksteel Forge — All artifacts indestructible
- Platinum Emperion — Life total can't change

**Value Engines:**
- Sai, Master Thopterist — Thopter on each artifact cast
- Vedalken Archmage — Draw on each artifact cast
- Emry, Lurker of the Loch — Cast artifacts from graveyard`,
    taxonomy_tags: ['artifacts', 'combo', 'stax'],
    card_mentions: [
      'Mana Crypt', 'Mox Opal', 'Mox Amber', 'Chrome Mox', 'Jeweled Amulet',
      'Everflowing Chalice', 'Lotus Petal', "Urza's Bauble", "Mishra's Bauble",
      'Winter Orb', 'Static Orb', 'Howling Mine', 'Basalt Monolith',
      'Rings of Brighthearth', 'Mystic Forge', "Sensei's Divining Top",
      'Intruder Alarm', 'Sai, Master Thopterist', 'Efficient Construction',
      'Lightning Greaves', 'Darksteel Forge', 'Platinum Emperion',
      'Vedalken Archmage', 'Emry, Lurker of the Loch'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Urza, Lord High Artificer Magic the Gathering Commander deck tech Stax Combo'
  },
  {
    commander_id: 'ea252390-7428-4717-8f42-ab7ed7cef790',
    build_variant: 'artifacts',
    archetype: 'combo',
    insight_type: 'synergy',
    content: `**Stax Lock (Winter Orb / Static Orb):**
These only work while UNTAPPED. End of opponent's turn: tap them with Urza for {U}. Your untap step: they're tapped = full untap for you. Opponents' untap: they untap before you tap = they suffer the restriction.

**Infinite Mana: Basalt Monolith + Rings of Brighthearth:**
1. Tap Monolith for {3}
2. Pay {3} to activate untap ability
3. Pay {2} to Rings to copy the untap
4. Let one resolve, tap for {3} (now 6 floating)
5. Let second resolve, tap again
6. Repeat — net +1 mana each loop = infinite colorless
Use outlets: Walking Ballista, Staff of Domination, Urza's {5} ability

**Infinite Draw: Mystic Forge + Sensei's Divining Top:**
1. Forge lets you cast artifacts from library top
2. Top costs {1}, tap to draw and put Top on library
3. Forge lets you cast Top again from library
4. Repeat = draw entire deck for {1} per card
With Urza + token makers: also generates infinite tokens/mana

**Lockdown: Mycosynth Lattice + Karn, the Great Creator:**
- Lattice: All permanents are artifacts
- Karn static: Opponents can't activate artifact abilities
- Result: Opponents can't tap ANYTHING for mana (lands are artifacts)

**Intruder Alarm Engine:**
Alarm untaps all creatures when a creature enters. With Urza + Sai/Efficient Construction:
1. Cast artifact → make Thopter token → Alarm untaps all creatures
2. Tap Urza/token for mana → cast another artifact
3. Loop until you run out of artifacts or mana (with 0-costs, infinite)`,
    taxonomy_tags: ['artifacts', 'combo', 'stax'],
    card_mentions: [
      'Winter Orb', 'Static Orb', 'Urza, Lord High Artificer', 'Basalt Monolith',
      'Rings of Brighthearth', 'Walking Ballista', 'Staff of Domination',
      'Mystic Forge', "Sensei's Divining Top", 'Mycosynth Lattice',
      'Karn, the Great Creator', 'Intruder Alarm', 'Sai, Master Thopterist',
      'Efficient Construction'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Urza, Lord High Artificer Magic the Gathering Commander deck tech Stax Combo'
  },
  {
    commander_id: 'ea252390-7428-4717-8f42-ab7ed7cef790',
    build_variant: 'artifacts',
    archetype: 'combo',
    insight_type: 'budget_alternative',
    content: `**Expensive Cards:**
- Mana Crypt ($150+) — No direct replacement for speed, but Sol Ring + other rocks help
- Mox Opal ($80) — Cut for more 1-mana rocks (Mind Stone, Thought Vessel)
- Transmute Artifact ($100+) — Fabricate ($3) or Reshape ($2) are slower but functional
- Grim Monolith ($300+) — Basalt Monolith ($15) does the combo without Grim

**Budget Combo Package:**
Basalt Monolith + Rings of Brighthearth is relatively affordable (~$20 total) and gives infinite colorless mana. Add Power Artifact (~$30) as a second line with Basalt Monolith.

**Budget Stax:**
- Winter Orb ($8) — Essential, not that expensive
- Static Orb ($5) — Cheap and effective
- Howling Mine ($3) — Budget draw that you can turn off

**Budget Win Conditions:**
- Walking Ballista ($10) — Infinite mana outlet
- Blue Sun's Zenith ($3) — Draw X, shuffle back, can deck opponents
- Staff of Domination ($8) — Does everything with infinite mana

**Mana Base:**
Mono-blue is cheap. Run basics + utility lands:
- Academy Ruins ($10) — Recur artifacts
- Reliquary Tower ($2) — No max hand size
- Buried Ruin ($1) — Budget artifact recursion`,
    taxonomy_tags: ['artifacts', 'combo', 'stax'],
    card_mentions: [
      'Mana Crypt', 'Sol Ring', 'Mox Opal', 'Mind Stone', 'Thought Vessel',
      'Transmute Artifact', 'Fabricate', 'Reshape', 'Grim Monolith',
      'Basalt Monolith', 'Rings of Brighthearth', 'Power Artifact',
      'Winter Orb', 'Static Orb', 'Howling Mine', 'Walking Ballista',
      "Blue Sun's Zenith", 'Staff of Domination', 'Academy Ruins',
      'Reliquary Tower', 'Buried Ruin'
    ],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: 'Urza, Lord High Artificer Magic the Gathering Commander deck tech Stax Combo'
  },
  {
    commander_id: 'ea252390-7428-4717-8f42-ab7ed7cef790',
    build_variant: 'artifacts',
    archetype: 'combo',
    insight_type: 'common_mistake',
    content: `**Mistake 1: Forgetting to tap stax pieces**
Winter Orb and Static Orb only affect you if they're untapped during YOUR untap step. Always tap them with Urza at end of opponent's turn before yours.

**Mistake 2: Not protecting Urza**
Urza is the engine. Without him, your random artifacts don't tap for mana. Prioritize Lightning Greaves, Swiftfoot Boots, or counterspell backup.

**Mistake 3: Going all-in on combo without interaction**
Mono-blue has the best counterspells. Run enough interaction to protect your combo turn AND stop opponents from winning first. Force of Will, Pact of Negation, Fierce Guardianship.

**Mistake 4: Too many expensive artifacts**
Urza's power comes from turning cheap/free artifacts into mana. A 6-mana artifact that makes one mana is worse than three 0-cost artifacts that make three mana. Keep the curve LOW.

**Mistake 5: Activating Urza's {5} ability without a plan**
The exile is random. Don't spend 5 mana hoping to hit something unless you're desperate or have set up the top of your library.

**Mistake 6: Ignoring the Construct**
Urza's ETB Construct gets +1/+1 per artifact. With 10 artifacts, that's a 10/10. It's a backup win condition via commander damage.`,
    taxonomy_tags: ['artifacts', 'combo', 'stax'],
    card_mentions: [
      'Winter Orb', 'Static Orb', 'Urza, Lord High Artificer', 'Lightning Greaves',
      'Swiftfoot Boots', 'Force of Will', 'Pact of Negation', 'Fierce Guardianship'
    ],
    confidence: 0.9,
    source_type: 'youtube',
    source_title: 'Urza, Lord High Artificer Magic the Gathering Commander deck tech Stax Combo'
  },
  {
    commander_id: 'ea252390-7428-4717-8f42-ab7ed7cef790',
    build_variant: 'artifacts',
    archetype: 'combo',
    insight_type: 'upgrade_path',
    content: `**Power Level Scaling:**

*Bracket 2-3 (Casual):*
- Focus on value over combo
- Run fun artifacts like Mirrorworks, Mechanized Production
- Fewer tutors, more interactive games
- Win with Construct beatdown or incremental value

*Bracket 3-4 (Focused):*
- Add Basalt Monolith + Rings combo
- Include Winter Orb / Static Orb stax
- Run 3-4 tutors (Fabricate, Whir of Invention)
- Walking Ballista as primary win con

*Bracket 4+ (High Power):*
- Full fast mana package (Crypt, Mox Diamond, Chrome Mox)
- Transmute Artifact, Reshape for artifact tutors
- Mycosynth Lattice + Karn lock
- Dramatic Reversal + Isochron Scepter (banned in some groups)
- Multiple combo lines for redundancy

**Planeswalker Upgrades:**
- Tezzeret the Seeker — Tutors artifacts directly to battlefield
- Karn, the Great Creator — Shuts down opponent artifacts, part of lock
- Ugin, the Spirit Dragon — Board wipe that misses your artifacts

**Land Upgrades:**
- Ancient Tomb ($50) — 2 mana, 2 life
- Mishra's Workshop ($2000+) — 3 mana for artifacts only (cEDH)
- Tolarian Academy (BANNED) — Don't even think about it`,
    taxonomy_tags: ['artifacts', 'combo', 'stax'],
    card_mentions: [
      'Mirrorworks', 'Mechanized Production', 'Basalt Monolith', 'Rings of Brighthearth',
      'Winter Orb', 'Static Orb', 'Fabricate', 'Whir of Invention', 'Walking Ballista',
      'Mana Crypt', 'Mox Diamond', 'Chrome Mox', 'Transmute Artifact', 'Reshape',
      'Mycosynth Lattice', 'Karn, the Great Creator', 'Dramatic Reversal',
      'Isochron Scepter', 'Tezzeret the Seeker', 'Ugin, the Spirit Dragon',
      'Ancient Tomb', "Mishra's Workshop", 'Tolarian Academy'
    ],
    confidence: 0.85,
    source_type: 'youtube',
    source_title: 'Urza, Lord High Artificer Magic the Gathering Commander deck tech Stax Combo'
  }
]

async function main() {
  console.log('Starting Urza insight distillation (reprocessing)...')
  const startTime = Date.now()

  const { data, error } = await supabase
    .from('ref_commander_insights')
    .insert(urzaInsights)
    .select()

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  
  if (error) {
    console.error('Insert error:', error)
  } else {
    console.log(`✓ Inserted ${data.length} insights for Urza, Lord High Artificer`)
    console.log(`  Build variant: artifacts`)
    console.log(`  Archetype: combo`)
    console.log(`  Insight types: ${urzaInsights.map(i => i.insight_type).join(', ')}`)
  }
  
  console.log(`\nTime elapsed: ${elapsed}s`)
}

main().catch(console.error)
