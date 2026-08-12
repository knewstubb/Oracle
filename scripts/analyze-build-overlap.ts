import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyzeCommander(commanderName: string) {
  // Find commander
  const { data: commander } = await supabase
    .from('ref_commanders')
    .select('id, display_name')
    .ilike('display_name', `%${commanderName}%`)
    .limit(1)
    .single();

  if (!commander) {
    console.log('Commander not found:', commanderName);
    return;
  }

  console.log('Commander:', commander.display_name);

  // Get builds
  const { data: builds } = await supabase
    .from('ref_commander_builds')
    .select('id, edhrec_theme_slug, archetype, theme')
    .eq('commander_id', commander.id);

  console.log('\nBuilds:', builds?.length);
  builds?.forEach(b => 
    console.log(`  - ${b.edhrec_theme_slug} (archetype: ${b.archetype || 'none'} | theme: ${b.theme || 'none'})`)
  );

  if (!builds || builds.length < 2) {
    console.log('Need at least 2 builds for overlap analysis');
    return;
  }

  // Get cards for each build
  const buildCards: Record<string, Set<string>> = {};
  for (const build of builds) {
    const { data: cards } = await supabase
      .from('ref_build_cards')
      .select('card_name')
      .eq('build_id', build.id);
    buildCards[build.edhrec_theme_slug] = new Set(cards?.map(c => c.card_name) || []);
  }

  // Calculate pairwise overlaps
  console.log('\n=== OVERLAP ANALYSIS ===');
  const slugs = Object.keys(buildCards);
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = slugs[i], b = slugs[j];
      const setA = buildCards[a], setB = buildCards[b];
      const intersection = [...setA].filter(c => setB.has(c));
      console.log(`${a} vs ${b}:`);
      console.log(`  ${setA.size} cards vs ${setB.size} cards`);
      console.log(`  Overlap: ${intersection.length} cards (${Math.round(intersection.length / Math.min(setA.size, setB.size) * 100)}% of smaller set)`);
    }
  }

  // Find cards in ALL builds
  const allSets = Object.values(buildCards);
  const inAll = [...allSets[0]].filter(card => allSets.every(s => s.has(card)));
  console.log('\n=== CORE CARDS (in ALL builds) ===');
  console.log('Count:', inAll.length);
  inAll.forEach(c => console.log('  -', c));

  // Find cards unique to each build
  console.log('\n=== UNIQUE CARDS PER BUILD ===');
  for (const slug of slugs) {
    const thisSet = buildCards[slug];
    const otherSets = slugs.filter(s => s !== slug).map(s => buildCards[s]);
    const unique = [...thisSet].filter(card => !otherSets.some(s => s.has(card)));
    console.log(`${slug}: ${unique.length} unique cards`);
    if (unique.length <= 10) {
      unique.forEach(c => console.log('  -', c));
    } else {
      unique.slice(0, 10).forEach(c => console.log('  -', c));
      console.log(`  ... and ${unique.length - 10} more`);
    }
  }
}

const name = process.argv[2] || 'Teysa Karlov';
analyzeCommander(name);
