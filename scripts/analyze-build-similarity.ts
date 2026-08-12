/**
 * Analyze Build Similarity
 * 
 * Computes Jaccard similarity between builds for the same commander.
 * Flags pairs with ≥65% similarity as merge candidates.
 * 
 * Usage:
 *   npx tsx scripts/analyze-build-similarity.ts
 *   npx tsx scripts/analyze-build-similarity.ts --threshold=0.5  # Custom threshold
 *   npx tsx scripts/analyze-build-similarity.ts --commander="Atraxa"  # Single commander
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// CLI args
const MERGE_THRESHOLD = parseFloat(
  process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1] || '0.65'
);
const COMMANDER_FILTER = process.argv.find(a => a.startsWith('--commander='))?.split('=')[1];
const VERBOSE = process.argv.includes('--verbose');

// Report output
const REPORT_DIR = join(process.cwd(), 'research', 'edhrec-sync');

interface Build {
  id: string;
  commander_id: string;
  primary_archetype: string | null;
  primary_theme: string | null;
  edhrec_theme_slug: string;
  deck_count: number;
}

interface BuildCard {
  build_id: string;
  card_name: string;
}

interface Commander {
  id: string;
  display_name: string;
}

interface SimilarityResult {
  commander_name: string;
  commander_id: string;
  build_a: {
    id: string;
    label: string;
    deck_count: number;
  };
  build_b: {
    id: string;
    label: string;
    deck_count: number;
  };
  jaccard: number;
  shared_cards: number;
  total_unique_cards: number;
}

/**
 * Compute Jaccard similarity between two sets
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Get all builds grouped by commander
 */
async function getBuildsByCommander(): Promise<Map<string, Build[]>> {
  let query = supabase
    .from('ref_commander_builds')
    .select('id, commander_id, primary_archetype, primary_theme, edhrec_theme_slug, deck_count');
  
  const { data: builds, error } = await query;
  
  if (error) {
    console.error('Error fetching builds:', error);
    process.exit(1);
  }
  
  // Group by commander
  const byCommander = new Map<string, Build[]>();
  for (const build of builds) {
    const existing = byCommander.get(build.commander_id) || [];
    existing.push(build);
    byCommander.set(build.commander_id, existing);
  }
  
  return byCommander;
}

/**
 * Get commander names
 */
async function getCommanderNames(ids: string[]): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('ref_commanders')
    .select('id, display_name')
    .in('id', ids);
  
  if (error) {
    console.error('Error fetching commanders:', error);
    return new Map();
  }
  
  return new Map(data.map(c => [c.id, c.display_name]));
}

/**
 * Get cards for a set of builds
 */
async function getCardsForBuilds(buildIds: string[]): Promise<Map<string, Set<string>>> {
  const cardsByBuild = new Map<string, Set<string>>();
  
  // Initialize empty sets
  for (const id of buildIds) {
    cardsByBuild.set(id, new Set());
  }
  
  // Fetch one build at a time to avoid row limits
  // (50 builds × 100 cards = 5000 rows exceeds Supabase default 1000)
  let processed = 0;
  for (const buildId of buildIds) {
    const { data, error } = await supabase
      .from('ref_build_cards')
      .select('card_name')
      .eq('build_id', buildId);
    
    if (error) {
      if (VERBOSE) console.error(`Error fetching cards for ${buildId}:`, error);
      continue;
    }
    
    const set = cardsByBuild.get(buildId);
    if (set && data) {
      for (const card of data) {
        set.add(card.card_name);
      }
    }
    
    processed++;
    if (processed % 100 === 0) {
      console.log(`  Fetched cards for ${processed}/${buildIds.length} builds...`);
    }
  }
  
  return cardsByBuild;
}

/**
 * Analyze similarity for builds of a single commander
 */
function analyzeCommanderBuilds(
  commanderName: string,
  commanderId: string,
  builds: Build[],
  cardsByBuild: Map<string, Set<string>>
): SimilarityResult[] {
  const results: SimilarityResult[] = [];
  
  // Compare all pairs
  for (let i = 0; i < builds.length; i++) {
    for (let j = i + 1; j < builds.length; j++) {
      const buildA = builds[i];
      const buildB = builds[j];
      
      const cardsA = cardsByBuild.get(buildA.id) || new Set();
      const cardsB = cardsByBuild.get(buildB.id) || new Set();
      
      // Skip if either build has no cards
      if (cardsA.size === 0 || cardsB.size === 0) continue;
      
      const jaccard = jaccardSimilarity(cardsA, cardsB);
      const intersection = new Set([...cardsA].filter(x => cardsB.has(x)));
      const union = new Set([...cardsA, ...cardsB]);
      
      results.push({
        commander_name: commanderName,
        commander_id: commanderId,
        build_a: {
          id: buildA.id,
          label: buildA.primary_archetype || buildA.primary_theme || buildA.edhrec_theme_slug,
          deck_count: buildA.deck_count,
        },
        build_b: {
          id: buildB.id,
          label: buildB.primary_archetype || buildB.primary_theme || buildB.edhrec_theme_slug,
          deck_count: buildB.deck_count,
        },
        jaccard,
        shared_cards: intersection.size,
        total_unique_cards: union.size,
      });
    }
  }
  
  return results;
}

/**
 * Main analysis
 */
async function main() {
  console.log('Build Similarity Analysis');
  console.log('=========================');
  console.log(`Merge threshold: ${(MERGE_THRESHOLD * 100).toFixed(0)}%`);
  if (COMMANDER_FILTER) {
    console.log(`Commander filter: ${COMMANDER_FILTER}`);
  }
  console.log('');
  
  // Get all builds grouped by commander
  console.log('Fetching builds...');
  const buildsByCommander = await getBuildsByCommander();
  
  // Filter to commanders with 2+ builds
  const commandersWithMultiple = [...buildsByCommander.entries()]
    .filter(([_, builds]) => builds.length >= 2);
  
  console.log(`Found ${commandersWithMultiple.length} commanders with 2+ builds`);
  
  // Get commander names
  const commanderIds = commandersWithMultiple.map(([id]) => id);
  const commanderNames = await getCommanderNames(commanderIds);
  
  // Apply commander filter if specified
  let filteredCommanders = commandersWithMultiple;
  if (COMMANDER_FILTER) {
    filteredCommanders = commandersWithMultiple.filter(([id]) => {
      const name = commanderNames.get(id) || '';
      return name.toLowerCase().includes(COMMANDER_FILTER.toLowerCase());
    });
    console.log(`Filtered to ${filteredCommanders.length} commanders matching "${COMMANDER_FILTER}"`);
  }
  
  // Collect all build IDs for card fetching
  const allBuildIds = filteredCommanders.flatMap(([_, builds]) => builds.map(b => b.id));
  
  console.log(`Fetching cards for ${allBuildIds.length} builds...`);
  const cardsByBuild = await getCardsForBuilds(allBuildIds);
  
  // Analyze each commander
  console.log('Analyzing similarity...');
  const allResults: SimilarityResult[] = [];
  
  for (const [commanderId, builds] of filteredCommanders) {
    const commanderName = commanderNames.get(commanderId) || 'Unknown';
    const results = analyzeCommanderBuilds(commanderName, commanderId, builds, cardsByBuild);
    allResults.push(...results);
    
    if (VERBOSE) {
      const mergeCandidates = results.filter(r => r.jaccard >= MERGE_THRESHOLD);
      if (mergeCandidates.length > 0) {
        console.log(`  ${commanderName}: ${mergeCandidates.length} merge candidates`);
      }
    }
  }
  
  // Separate merge candidates from distinct builds
  const mergeCandidates = allResults.filter(r => r.jaccard >= MERGE_THRESHOLD);
  const relatedBuilds = allResults.filter(r => r.jaccard >= 0.5 && r.jaccard < MERGE_THRESHOLD);
  const distinctBuilds = allResults.filter(r => r.jaccard < 0.5);
  
  // Sort by similarity descending
  mergeCandidates.sort((a, b) => b.jaccard - a.jaccard);
  relatedBuilds.sort((a, b) => b.jaccard - a.jaccard);
  
  // Summary
  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Total build pairs analyzed: ${allResults.length}`);
  console.log(`Merge candidates (≥${(MERGE_THRESHOLD * 100).toFixed(0)}%): ${mergeCandidates.length}`);
  console.log(`Related but distinct (50-${((MERGE_THRESHOLD - 0.01) * 100).toFixed(0)}%): ${relatedBuilds.length}`);
  console.log(`Distinct builds (<50%): ${distinctBuilds.length}`);
  
  // Generate report
  if (!existsSync(REPORT_DIR)) {
    mkdirSync(REPORT_DIR, { recursive: true });
  }
  
  const report = `# Build Similarity Analysis

Generated: ${new Date().toISOString()}
Merge threshold: ${(MERGE_THRESHOLD * 100).toFixed(0)}%

## Summary

| Category | Count |
|----------|-------|
| Total build pairs | ${allResults.length} |
| Merge candidates (≥${(MERGE_THRESHOLD * 100).toFixed(0)}%) | ${mergeCandidates.length} |
| Related (50-${((MERGE_THRESHOLD - 0.01) * 100).toFixed(0)}%) | ${relatedBuilds.length} |
| Distinct (<50%) | ${distinctBuilds.length} |

## Merge Candidates

These build pairs share ≥${(MERGE_THRESHOLD * 100).toFixed(0)}% of their cards and should be reviewed for merging.

${mergeCandidates.length === 0 ? '*No merge candidates found.*' : mergeCandidates.map(r => `
### ${r.commander_name}

| Build A | Build B | Jaccard | Shared | Total |
|---------|---------|---------|--------|-------|
| ${r.build_a.label} (${r.build_a.deck_count} decks) | ${r.build_b.label} (${r.build_b.deck_count} decks) | ${(r.jaccard * 100).toFixed(1)}% | ${r.shared_cards} | ${r.total_unique_cards} |
`).join('')}

## Related But Distinct (50-${((MERGE_THRESHOLD - 0.01) * 100).toFixed(0)}%)

These builds are related but have enough distinct cards to warrant separate identities.

${relatedBuilds.slice(0, 50).map(r => 
  `- **${r.commander_name}**: ${r.build_a.label} vs ${r.build_b.label} — ${(r.jaccard * 100).toFixed(1)}%`
).join('\n')}
${relatedBuilds.length > 50 ? `\n*...and ${relatedBuilds.length - 50} more*` : ''}

## Distinct Builds (<50%)

${distinctBuilds.length} build pairs have <50% similarity — these are clearly different strategies.
`;

  const reportPath = join(REPORT_DIR, 'build-similarity-report.md');
  writeFileSync(reportPath, report);
  console.log(`\nReport written to: ${reportPath}`);
  
  // Also write JSON for programmatic use
  const jsonPath = join(REPORT_DIR, 'build-similarity.json');
  writeFileSync(jsonPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    threshold: MERGE_THRESHOLD,
    summary: {
      total_pairs: allResults.length,
      merge_candidates: mergeCandidates.length,
      related: relatedBuilds.length,
      distinct: distinctBuilds.length,
    },
    merge_candidates: mergeCandidates,
    related: relatedBuilds,
  }, null, 2));
  console.log(`JSON data written to: ${jsonPath}`);
}

main().catch(console.error);
