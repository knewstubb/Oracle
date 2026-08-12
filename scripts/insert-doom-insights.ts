/**
 * Insert Doctor Doom, King of Latveria insights
 * 
 * Run: npx tsx scripts/insert-doom-insights.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COMMANDER_ID = 'e80aa144-6773-400a-87aa-8180ba1ca5c2';

const insights = [
  // STRATEGY INSIGHTS
  {
    commander_id: COMMANDER_ID,
    insight_type: 'strategy',
    build_variant: null,
    content: "Doctor Doom's land discard ability triggers 'whenever you discard one or more land cards' dealing 2 life to each opponent - perfect for multiplayer since it hits all opponents simultaneously.",
    card_mentions: ['Doctor Doom, King of Latveria'],
    confidence: 0.95,
    source_type: 'edhrec',
    source_url: 'https://edhrec.com/articles/discarding-for-profit-with-doctor-doom-king-of-latveria',
    source_title: 'Discarding for Profit With Doctor Doom',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'strategy',
    build_variant: null,
    content: "The wording 'one or more land cards' means both a single Merfolk Looter activation and a powerful wheel like Windfall trigger only 2 life loss each. Maximize individual discard effects over bulk discards.",
    card_mentions: ['Merfolk Looter', 'Windfall'],
    confidence: 0.9,
    source_type: 'edhrec',
    source_url: 'https://edhrec.com/articles/discarding-for-profit-with-doctor-doom-king-of-latveria',
    source_title: 'Discarding for Profit With Doctor Doom',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'strategy',
    build_variant: 'discard',
    content: "Lean into discard synergies rather than villain typal - the precon dilutes both themes. Cut scattered villain pieces and focus on land discard payoffs with Seismic Assault effects and looting creatures.",
    card_mentions: ['Seismic Assault'],
    confidence: 0.85,
    source_type: 'manual',
    source_url: 'https://mtgrocks.com/mtg-doom-prevails-upgrades/',
    source_title: 'MTG Doom Prevails Upgrades',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'strategy',
    build_variant: 'clones',
    content: "Copy Doom with Spark Double or Irenicus's Vile Duplication to multiply triggers - with 2 Dooms, each land discard deals 4 damage to each opponent instead of 2.",
    card_mentions: ['Spark Double', "Irenicus's Vile Duplication", 'Quantum Misalignment'],
    confidence: 0.85,
    source_type: 'edhrec',
    source_url: 'https://edhrec.com/articles/discarding-for-profit-with-doctor-doom-king-of-latveria',
    source_title: 'Discarding for Profit With Doctor Doom',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'strategy',
    build_variant: null,
    content: "This is a Bracket 2-3 commander - fair, value-midrangy gameplay. No infinite combos in stock form, but can add Phyrexian Altar + Ultron/Prowler for combo edge.",
    card_mentions: ['Phyrexian Altar', 'Ultron, Unlimited', 'Prowler, Clawed Thief'],
    confidence: 0.8,
    source_type: 'manual',
    source_url: 'https://draftsim.com/doctor-doom-king-of-latveria-edh-deck/',
    source_title: 'Doctor Doom Commander Deck Guide',
  },
  // CARD RECOMMENDATIONS
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Dakmor Salvage is critical - dredge ensures you always have a land to discard. Combined with any looting effect, this guarantees life loss for opponents every connive trigger.",
    card_mentions: ['Dakmor Salvage'],
    confidence: 0.95,
    source_type: 'edhrec',
    source_url: 'https://edhrec.com/articles/discarding-for-profit-with-doctor-doom-king-of-latveria',
    source_title: 'Discarding for Profit With Doctor Doom',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Tectonic Reformation is key - it lets you cycle lands for R, effectively making each land 'deal 2 to each opponent, draw a card'. Late game this becomes a win condition.",
    card_mentions: ['Tectonic Reformation'],
    confidence: 0.9,
    source_type: 'manual',
    source_url: 'https://www.wargamer.com/magic-the-gathering/marvel-doom-prevails-precon-upgrade',
    source_title: '12 ways to improve your Doom Prevails precon',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Trade Routes provides inexpensive recursive draw while enabling discard synergies. Late game it doubles as a win condition - pick up lands from play and discard them to drain opponents.",
    card_mentions: ['Trade Routes'],
    confidence: 0.85,
    source_type: 'manual',
    source_url: 'https://flipsidegaming.com/blogs/magic-blog/doom-prevails-doctor-doom-precon-budget-upgrade-guide',
    source_title: 'Doom Prevails Budget Upgrade Guide',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Leader, Super-Genius turns every connive into pure card advantage instead of card filtering - draw two, discard one instead of draw one, discard one.",
    card_mentions: ['Leader, Super-Genius'],
    confidence: 0.9,
    source_type: 'manual',
    source_url: 'https://www.wargamer.com/magic-the-gathering/marvel-doom-prevails-precon-upgrade',
    source_title: '12 ways to improve your Doom Prevails precon',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Monument to Endurance offers three great options on discard: card draw, ramp, or life loss. Aim to trigger all three on each turn for maximum value.",
    card_mentions: ['Monument to Endurance'],
    confidence: 0.85,
    source_type: 'manual',
    source_url: 'https://www.wargamer.com/magic-the-gathering/marvel-doom-prevails-precon-upgrade',
    source_title: '12 ways to improve your Doom Prevails precon',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Roaming Throne doubles villain triggers - land discard becomes 4 damage to each opponent, and you connive twice per combat.",
    card_mentions: ['Roaming Throne'],
    confidence: 0.85,
    source_type: 'manual',
    source_url: 'https://draftsim.com/doctor-doom-king-of-latveria-edh-deck/',
    source_title: 'Doctor Doom Commander Deck Guide',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Cool but Rude is a level-up enchantment that provides looting plus damage payoffs - exactly what this deck wants. Villains are very cool and inarguably rude.",
    card_mentions: ['Cool but Rude'],
    confidence: 0.8,
    source_type: 'manual',
    source_url: 'https://www.wargamer.com/magic-the-gathering/marvel-doom-prevails-precon-upgrade',
    source_title: '12 ways to improve your Doom Prevails precon',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Norman Osborn / Green Goblin is a perfect fit - an unblockable conniver who later lets you cast cards from graveyard for cheap as you discard them.",
    card_mentions: ['Norman Osborn', 'Green Goblin'],
    confidence: 0.85,
    source_type: 'manual',
    source_url: 'https://www.wargamer.com/magic-the-gathering/marvel-doom-prevails-precon-upgrade',
    source_title: '12 ways to improve your Doom Prevails precon',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Crucible of Worlds lets you play lands from your graveyard after discarding them - essential since you're not in green and have limited land recursion options.",
    card_mentions: ['Crucible of Worlds'],
    confidence: 0.85,
    source_type: 'manual',
    source_url: 'https://draftsim.com/doctor-doom-king-of-latveria-edh-deck/',
    source_title: 'Doctor Doom Commander Deck Guide',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'card_recommendation',
    build_variant: null,
    content: "Seismic Assault and Land's Edge serve as finishers and flexible board control - discard lands to deal 2 damage while triggering Doom simultaneously.",
    card_mentions: ['Seismic Assault', "Land's Edge"],
    confidence: 0.85,
    source_type: 'edhrec',
    source_url: 'https://edhrec.com/articles/discarding-for-profit-with-doctor-doom-king-of-latveria',
    source_title: 'Discarding for Profit With Doctor Doom',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'synergy',
    build_variant: null,
    content: "Spellshapers like Waterfront Bouncer, Undertaker, and Hammer Mage provide repeatable discard outlets that fit perfectly with the land discard theme.",
    card_mentions: ['Waterfront Bouncer', 'Undertaker', 'Hammer Mage'],
    confidence: 0.8,
    source_type: 'edhrec',
    source_url: 'https://edhrec.com/articles/discarding-for-profit-with-doctor-doom-king-of-latveria',
    source_title: 'Discarding for Profit With Doctor Doom',
  },
  // BUDGET INSIGHTS
  {
    commander_id: COMMANDER_ID,
    insight_type: 'budget_alternative',
    build_variant: null,
    content: "Budget discard outlets under $2: Compulsion, Faithless Looting, Frantic Search, Magmatic Insight, Lightning Axe. These provide the looting effects the deck needs without breaking the bank.",
    card_mentions: ['Compulsion', 'Faithless Looting', 'Frantic Search', 'Magmatic Insight', 'Lightning Axe'],
    confidence: 0.85,
    source_type: 'edhrec',
    source_url: 'https://edhrec.com/articles/discarding-for-profit-with-doctor-doom-king-of-latveria',
    source_title: 'Discarding for Profit With Doctor Doom',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'budget_alternative',
    build_variant: null,
    content: "Add Anger and Wonder from the graveyard package - they're cheap and provide value when discarded. Filth is another option for swampwalk.",
    card_mentions: ['Anger', 'Wonder', 'Filth'],
    confidence: 0.8,
    source_type: 'edhrec',
    source_url: 'https://edhrec.com/guides/doom-prevails-marvel-super-heroes-precon-guide',
    source_title: 'Doom Prevails Precon Guide',
  },
  // META/MATCHUP INSIGHTS
  {
    commander_id: COMMANDER_ID,
    insight_type: 'matchup',
    build_variant: null,
    content: "Incremental life drain bypasses lifegain strategies since it's loss not damage. The deck is flexible between aggro and control based on board state.",
    card_mentions: [],
    confidence: 0.8,
    source_type: 'manual',
    source_url: 'https://draftsim.com/doctor-doom-king-of-latveria-edh-deck/',
    source_title: 'Doctor Doom Commander Deck Guide',
  },
  {
    commander_id: COMMANDER_ID,
    insight_type: 'meta_consideration',
    build_variant: null,
    content: "Weaknesses: Graveyard hate hurts (lands and creatures in yard), 2 damage per trigger is a slow clock, commander-dependent for consistent value, mana hungry for discard outlet activations.",
    card_mentions: [],
    confidence: 0.8,
    source_type: 'manual',
    source_url: 'https://draftsim.com/doctor-doom-king-of-latveria-edh-deck/',
    source_title: 'Doctor Doom Commander Deck Guide',
  },
  // CARDS TO CUT
  {
    commander_id: COMMANDER_ID,
    insight_type: 'common_mistake',
    build_variant: null,
    content: "Cut from precon: Helmut Zemo (not enough instants/sorceries), Klaw (no exile synergy), Damocles Base (opponents choose), Propaganda (doesn't advance plan), Skullclamp (no tokens).",
    card_mentions: ['Helmut Zemo, Mastermind', 'Klaw, Master of Sound', 'Damocles Base, Sword of Kang', 'Propaganda', 'Skullclamp'],
    confidence: 0.9,
    source_type: 'manual',
    source_url: 'https://mtgrocks.com/mtg-doom-prevails-upgrades/',
    source_title: 'MTG Doom Prevails Upgrades',
  },
];

async function main() {
  console.log('Inserting', insights.length, 'insights for Doctor Doom, King of Latveria...\n');
  
  // Check existing insights
  const { count: existing } = await supabase
    .from('ref_commander_insights')
    .select('*', { count: 'exact', head: true })
    .eq('commander_id', COMMANDER_ID);
  
  console.log(`Existing insights for this commander: ${existing || 0}`);
  
  // Insert new insights
  const { data, error } = await supabase
    .from('ref_commander_insights')
    .insert(insights)
    .select('id');
  
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  
  console.log(`\nSuccessfully inserted ${data.length} insights`);
  
  // Get final count
  const { count: total } = await supabase
    .from('ref_commander_insights')
    .select('*', { count: 'exact', head: true })
    .eq('commander_id', COMMANDER_ID);
  
  console.log(`Total insights for Doctor Doom, King of Latveria: ${total}`);
}

main().catch(console.error);
