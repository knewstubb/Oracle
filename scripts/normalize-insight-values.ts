/**
 * Normalize build_variant and insight_type values to canonical slugs
 * 
 * Run with: npx tsx scripts/normalize-insight-values.ts
 * Add --dry-run to preview changes without applying
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dryRun = process.argv.includes('--dry-run');

// Mapping from old build_variant values to canonical theme slugs
// Some map to themes, some to archetypes (will be moved to archetype column)
const BUILD_VARIANT_MAP: Record<string, { theme: string | null; archetype: string | null }> = {
  // Direct theme mappings
  '+1/+1 counters': { theme: 'counters', archetype: 'midrange' },
  'artifacts': { theme: 'artifacts', archetype: null },
  'clones': { theme: 'clones', archetype: null },
  'discard': { theme: 'graveyard', archetype: 'wheels' },
  'enchantress': { theme: 'enchantments', archetype: 'enchantress' },
  'exile value': { theme: 'exile', archetype: null },
  'go wide': { theme: 'tokens', archetype: 'aggro' },
  'infect': { theme: 'infect', archetype: 'aggro' },
  'lifegain drain': { theme: 'sacrifice', archetype: 'aristocrats' },
  'spellslinger': { theme: 'spellslinger', archetype: null },
  'superfriends': { theme: 'planeswalkers', archetype: 'superfriends' },
  'wheel_punisher': { theme: 'spellslinger', archetype: 'wheels' },
  
  // Tribal themes
  'angels': { theme: 'angels', archetype: null },
  'angels_demons_dragons': { theme: 'dragons', archetype: null }, // Closest fit
  'dragon tribal': { theme: 'dragons', archetype: null },
  'goblin tribal': { theme: 'goblins', archetype: null },
  'zombie tribal': { theme: 'zombies', archetype: null },
  'orc_army': { theme: 'warriors', archetype: 'aggro' }, // Closest fit
  
  // Archetype-focused (theme is secondary)
  'aristocrats': { theme: 'sacrifice', archetype: 'aristocrats' },
  'attack triggers': { theme: 'tokens', archetype: 'aggro' },
  'big mana': { theme: 'landfall', archetype: 'ramp' },
  'cedh combo': { theme: null, archetype: 'combo' },
  'cheerios': { theme: 'artifacts', archetype: 'combo' },
  'combo': { theme: null, archetype: 'combo' },
  'defender_aggro': { theme: 'tokens', archetype: 'aggro' },
  'hatebears': { theme: null, archetype: 'stax' },
  'political_burn': { theme: null, archetype: 'group-slug' },
  'polymorph': { theme: null, archetype: 'combo' },
  'value control': { theme: null, archetype: 'control' },
  'voltron': { theme: 'equipment', archetype: 'voltron' },
};

// Mapping from old insight_type values to canonical types
const INSIGHT_TYPE_MAP: Record<string, string> = {
  'budget_alternative': 'budget',
  'card_recommendation': 'card_recommendation', // Already correct
  'common_mistake': 'common_mistake', // Already correct
  'matchup': 'matchup', // Already correct
  'meta_consideration': 'meta',
  'strategy': 'strategy', // Already correct
  'synergy': 'synergy', // Already correct
};

async function main() {
  console.log(dryRun ? '=== DRY RUN ===' : '=== APPLYING CHANGES ===');
  console.log('');

  // Get all insights
  const { data: insights, error } = await supabase
    .from('ref_commander_insights')
    .select('id, build_variant, insight_type, archetype');

  if (error) {
    console.error('Error fetching insights:', error);
    return;
  }

  console.log(`Found ${insights?.length || 0} insights to process\n`);

  let buildVariantUpdates = 0;
  let insightTypeUpdates = 0;
  let archetypeUpdates = 0;

  for (const insight of insights || []) {
    const updates: Record<string, string | null> = {};

    // Normalize build_variant
    if (insight.build_variant && BUILD_VARIANT_MAP[insight.build_variant]) {
      const mapping = BUILD_VARIANT_MAP[insight.build_variant];
      
      if (mapping.theme && mapping.theme !== insight.build_variant) {
        updates.build_variant = mapping.theme;
        buildVariantUpdates++;
      }
      
      if (mapping.archetype && !insight.archetype) {
        updates.archetype = mapping.archetype;
        archetypeUpdates++;
      }
    }

    // Normalize insight_type
    if (insight.insight_type && INSIGHT_TYPE_MAP[insight.insight_type]) {
      const newType = INSIGHT_TYPE_MAP[insight.insight_type];
      if (newType !== insight.insight_type) {
        updates.insight_type = newType;
        insightTypeUpdates++;
      }
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      console.log(`Insight ${insight.id}:`);
      if (updates.build_variant) {
        console.log(`  build_variant: "${insight.build_variant}" → "${updates.build_variant}"`);
      }
      if (updates.archetype) {
        console.log(`  archetype: null → "${updates.archetype}"`);
      }
      if (updates.insight_type) {
        console.log(`  insight_type: "${insight.insight_type}" → "${updates.insight_type}"`);
      }

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('ref_commander_insights')
          .update(updates)
          .eq('id', insight.id);

        if (updateError) {
          console.error(`  ERROR: ${updateError.message}`);
        }
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`build_variant updates: ${buildVariantUpdates}`);
  console.log(`archetype updates: ${archetypeUpdates}`);
  console.log(`insight_type updates: ${insightTypeUpdates}`);
  
  if (dryRun) {
    console.log('\nRun without --dry-run to apply changes');
  }
}

main().catch(console.error);
