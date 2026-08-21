/**
 * EDHREC Data Sync
 * 
 * Fetches commander data from EDHREC and populates:
 * - ref_commander_cards: High-synergy cards with scores
 * - ref_commander_insights: Build variant data from tag_counts
 * - ref_commanders: salt_score, deck_count, similar_commanders
 * - ref_commander_taxonomy: Tag → taxonomy mappings
 * 
 * Also generates a mapping report for unmapped tags.
 * 
 * Usage:
 *   npx tsx scripts/sync-edhrec-data.ts              # Full sync
 *   npx tsx scripts/sync-edhrec-data.ts --dry-run    # Preview without writing
 *   npx tsx scripts/sync-edhrec-data.ts --limit=10   # Sync only 10 commanders
 *   npx tsx scripts/sync-edhrec-data.ts --verbose    # Detailed logging
 *   npx tsx scripts/sync-edhrec-data.ts --force      # Re-sync all, ignore last_synced
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { 
  getTagMapping, 
  isIgnoredTag, 
  isUnmappedTag, 
  normalizeTag,
  type TagMapping 
} from './edhrec-tag-mappings';
import { getBaseTrust } from '../src/lib/source-trust-config';

// Load env
config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Config
const USER_AGENT = 'TheOracle/1.0 (commander-deckbuilder)';
const REQUEST_DELAY_MS = 200; // 5 req/sec - safe rate
const SYNC_STALE_DAYS = 7; // Re-sync commanders older than this
const TOP_CARDS_PER_COMMANDER = 50; // Store top N synergy cards
const MIN_TAG_DECKS_FOR_INSIGHT = 100; // Minimum decks for a build variant

// CLI args
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const FORCE = process.argv.includes('--force');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');
const OFFSET = parseInt(process.argv.find(a => a.startsWith('--offset='))?.split('=')[1] || '0');

// Report directory
const REPORT_DIR = resolve(__dirname, '../../research/edhrec-sync');

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface EdhrecCardView {
  name: string;
  sanitized: string;
  sanitized_wo: string;
  url: string;
  num_decks: number;
  potential_decks: number;
  synergy: number;
  inclusion?: number;
}

interface EdhrecCardList {
  header: string;
  cardviews: EdhrecCardView[];
}

/**
 * EDHREC tag_counts entry (array element)
 * 
 * EDHREC's API returns tag_counts as an ARRAY of objects, not a Record<string, number>.
 * Each element has { count, slug, value }.
 */
interface EdhrecTagCount {
  count: number;     // Number of decks with this tag
  slug: string;      // URL-safe key (e.g., "enchantress")
  value: string;     // Display name (e.g., "Enchantress")
}

interface EdhrecCommanderData {
  // Top-level fields
  header?: string;
  tag_counts?: EdhrecTagCount[]; // Array of { count, slug, value }
  similar?: Array<{ name: string; sanitized: string; num_decks: number }>;
  panels?: {
    combocounts?: Array<{ cards: string[]; count: number }>;
  };
  // Container has cardlists and card info
  container?: {
    json_dict?: {
      cardlists?: EdhrecCardList[];
      card?: {
        name: string;
        sanitized: string;
        num_decks: number;
        salt: number;
      };
    };
  };
  redirect?: string;
}

interface Commander {
  id: string;
  canonical_key: string;
  display_name: string;
  edhrec_synced_at: string | null;
}

interface TagStats {
  mapped: Map<string, { count: number; mapping: TagMapping; commanderCount: number }>;
  unmapped: Map<string, { count: number; commanders: string[]; commanderCount: number }>;
  ignored: Map<string, number>;
}

interface SyncStats {
  commandersProcessed: number;
  commandersSkipped: number;
  commandersFailed: number;
  cardsInserted: number;
  insightsInserted: number;
  taxonomyInserted: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function verbose(msg: string) {
  if (VERBOSE) log(`  ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert commander name to EDHREC URL slug
 */
function toEdhrecSlug(name: string): string {
  return name
    .toLowerCase()
    // Normalize accented characters to their base form (ñ→n, é→e, û→u)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove remaining non-alphanumeric (except spaces and hyphens)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Check if a commander needs re-syncing
 */
function needsSync(commander: Commander): boolean {
  if (FORCE) return true;
  if (!commander.edhrec_synced_at) return true;
  
  const syncedAt = new Date(commander.edhrec_synced_at);
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - SYNC_STALE_DAYS);
  
  return syncedAt < staleDate;
}

// ═══════════════════════════════════════════════════════════════════════════
// EDHREC API
// ═══════════════════════════════════════════════════════════════════════════

async function fetchEdhrecData(slug: string): Promise<EdhrecCommanderData | null> {
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (res.status === 404) {
      return null;
    }
    
    if (!res.ok) {
      verbose(`EDHREC returned ${res.status} for ${slug}`);
      return null;
    }
    
    const data: EdhrecCommanderData = await res.json();
    
    // Handle redirects (e.g., "ur-dragon" → "the-ur-dragon")
    if (data.redirect) {
      const redirectSlug = data.redirect.replace('/commanders/', '');
      verbose(`Following redirect: ${slug} → ${redirectSlug}`);
      return fetchEdhrecData(redirectSlug);
    }
    
    return data;
  } catch (err) {
    verbose(`Error fetching ${slug}: ${err instanceof Error ? err.message : 'Unknown'}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Processing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract high-synergy cards from EDHREC cardlists
 */
function extractTopCards(
  data: EdhrecCommanderData,
  commanderId: string
): Array<{
  commander_id: string;
  card_name: string;
  card_type: string;
  synergy_score: number;
  inclusion_rate: number;
  deck_count: number;
  position: number;
}> {
  const cardlists = data.container?.json_dict?.cardlists || [];
  const cards: Array<{
    commander_id: string;
    card_name: string;
    card_type: string;
    synergy_score: number;
    inclusion_rate: number;
    deck_count: number;
    position: number;
  }> = [];
  
  for (const list of cardlists) {
    const cardType = mapHeaderToCardType(list.header);
    if (!cardType) continue;
    
    for (const card of list.cardviews) {
      // Skip cards with very low synergy and deck count
      if (card.synergy < 0.02 && card.num_decks < 50) continue;
      
      const potentialDecks = card.potential_decks || 1;
      
      cards.push({
        commander_id: commanderId,
        card_name: card.name,
        card_type: cardType,
        synergy_score: card.synergy,
        inclusion_rate: card.inclusion || (card.num_decks / potentialDecks),
        deck_count: card.num_decks,
        position: 0, // Will be set after sorting
      });
    }
  }
  
  // Sort by synergy and take top N, then assign positions
  return cards
    .sort((a, b) => b.synergy_score - a.synergy_score)
    .slice(0, TOP_CARDS_PER_COMMANDER)
    .map((card, index) => ({ ...card, position: index + 1 }));
}

/**
 * Map EDHREC list headers to card type values
 */
function mapHeaderToCardType(header: string): string | null {
  const h = header.toLowerCase();
  
  if (h.includes('creature')) return 'creature';
  if (h.includes('instant')) return 'instant';
  if (h.includes('sorcery')) return 'sorcery';
  if (h.includes('artifact')) return 'artifact';
  if (h.includes('enchantment')) return 'enchantment';
  if (h.includes('planeswalker')) return 'planeswalker';
  if (h.includes('land') && !h.includes('basic')) return 'land';
  if (h.includes('battle')) return 'battle';
  
  // Skip these categories
  if (h.includes('top card')) return null; // Duplicate of other categories
  if (h.includes('new')) return null; // Too volatile
  if (h.includes('basic')) return null; // Basic lands not useful
  if (h.includes('signature')) return null; // Often just the commander
  
  return null;
}

/**
 * Extract build variant insights from tag_counts
 * 
 * NOTE: EDHREC's tag_counts is an ARRAY of objects, not a Record<string, number>.
 * Each element has { count, slug, value } where:
 *   - count: number of decks with this tag
 *   - slug: URL-safe key (e.g., "enchantress")
 *   - value: display name (e.g., "Enchantress")
 */
function extractBuildVariants(
  data: EdhrecCommanderData,
  commanderId: string,
  commanderName: string,
  tagStats: TagStats
): Array<{
  commander_id: string;
  insight_type: string;
  build_variant: string;
  content: string;
  source_type: string;
  source_url: string;
  confidence: number;
  source_trust: number;
  taxonomy_tags: string[];
}> {
  // EDHREC returns tag_counts as an array of { count, slug, value }
  const tagCountsArray = (data.tag_counts || []) as unknown as EdhrecTagCount[];
  const totalDecks = data.container?.json_dict?.card?.num_decks || 1;
  const sourceTrust = getBaseTrust('edhrec'); // 0.85 for EDHREC stats
  
  const insights: Array<{
    commander_id: string;
    insight_type: string;
    build_variant: string;
    content: string;
    source_type: string;
    source_url: string;
    confidence: number;
    source_trust: number;
    taxonomy_tags: string[];
  }> = [];
  
  for (const tagEntry of tagCountsArray) {
    const tag = tagEntry.slug; // Use slug as the canonical tag identifier
    const displayName = tagEntry.value; // Human-readable name
    const count = tagEntry.count;
    
    // Track tag statistics
    const mapping = getTagMapping(tag);
    const normalized = normalizeTag(tag);
    
    if (mapping) {
      // Mapped tag
      const existing = tagStats.mapped.get(normalized);
      tagStats.mapped.set(normalized, {
        count: (existing?.count || 0) + count,
        mapping,
        commanderCount: (existing?.commanderCount || 0) + 1,
      });
    } else if (isIgnoredTag(tag)) {
      // Explicitly ignored
      tagStats.ignored.set(normalized, (tagStats.ignored.get(normalized) || 0) + count);
    } else {
      // Unmapped - track for report
      const existing = tagStats.unmapped.get(normalized);
      tagStats.unmapped.set(normalized, {
        count: (existing?.count || 0) + count,
        commanders: [...(existing?.commanders || []), commanderName].slice(0, 5),
        commanderCount: (existing?.commanderCount || 0) + 1,
      });
    }
    
    // Only create insights for significant build variants
    if (count < MIN_TAG_DECKS_FOR_INSIGHT) continue;
    
    const percentage = Math.round((count / totalDecks) * 100);
    const taxonomyTags: string[] = [];
    
    if (mapping) {
      taxonomyTags.push(`${mapping.category}/${mapping.slug}`);
    }
    
    insights.push({
      commander_id: commanderId,
      insight_type: 'strategy', // Use existing allowed value
      build_variant: normalized,
      content: `${count.toLocaleString()} decks (${percentage}%) build ${commanderName} with a ${displayName} focus.`,
      source_type: 'edhrec',
      source_url: `https://edhrec.com/commanders/${toEdhrecSlug(commanderName)}`,
      confidence: Math.min(0.9, count / 1000), // Cap at 0.9, scale by popularity
      source_trust: sourceTrust,
      taxonomy_tags: taxonomyTags,
    });
  }
  
  return insights;
}

/**
 * Extract taxonomy entries from tag_counts
 * 
 * NOTE: EDHREC's tag_counts is an ARRAY of objects (see EdhrecTagCount type).
 */
function extractTaxonomyEntries(
  data: EdhrecCommanderData,
  commanderId: string
): Array<{
  commander_id: string;
  taxonomy_slug: string;
  source: string;
  confidence: number;
  relevance: string;
}> {
  // EDHREC returns tag_counts as an array of { count, slug, value }
  const tagCountsArray = (data.tag_counts || []) as unknown as EdhrecTagCount[];
  const totalDecks = data.container?.json_dict?.card?.num_decks || 1;
  const entries: Array<{
    commander_id: string;
    taxonomy_slug: string;
    source: string;
    confidence: number;
    relevance: string;
  }> = [];
  
  const seenSlugs = new Set<string>();
  
  for (const tagEntry of tagCountsArray) {
    const tag = tagEntry.slug;
    const count = tagEntry.count;
    
    const mapping = getTagMapping(tag);
    if (!mapping) continue;
    
    // Skip if we already have this slug (from a variant)
    if (seenSlugs.has(mapping.slug)) continue;
    seenSlugs.add(mapping.slug);
    
    const ratio = count / totalDecks;
    let relevance = 'minor';
    if (ratio > 0.5) relevance = 'primary';
    else if (ratio > 0.2) relevance = 'secondary';
    
    entries.push({
      commander_id: commanderId,
      taxonomy_slug: mapping.slug,
      source: 'edhrec',
      confidence: Math.min(0.95, ratio + 0.3), // Boost confidence, cap at 0.95
      relevance,
    });
  }
  
  return entries;
}

// ═══════════════════════════════════════════════════════════════════════════
// Database Operations
// ═══════════════════════════════════════════════════════════════════════════

async function getCommandersToSync(): Promise<Commander[]> {
  // Supabase caps at 1000 rows by default, so we need to paginate
  const PAGE_SIZE = 1000;
  let allCommanders: Commander[] = [];
  let offset = OFFSET;
  
  while (true) {
    const query = supabase
      .from('ref_commanders')
      .select('id, canonical_key, display_name, edhrec_synced_at')
      .eq('legal_commander', true)
      .order('edhrec_rank', { ascending: true, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);
    
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allCommanders = allCommanders.concat(data);
    offset += PAGE_SIZE;
    
    // If we got less than PAGE_SIZE, we've reached the end
    if (data.length < PAGE_SIZE) break;
    
    // If LIMIT is set and we've fetched enough, stop
    if (LIMIT > 0 && allCommanders.length >= LIMIT) {
      allCommanders = allCommanders.slice(0, LIMIT);
      break;
    }
  }
  
  // Apply LIMIT if set
  if (LIMIT > 0 && allCommanders.length > LIMIT) {
    allCommanders = allCommanders.slice(0, LIMIT);
  }
  
  return allCommanders;
}

async function updateCommander(
  commanderId: string,
  data: EdhrecCommanderData
): Promise<void> {
  if (DRY_RUN) return;
  
  const card = data.container?.json_dict?.card;
  
  // Format similar commanders as JSON array
  const similarCommanders = data.similar?.slice(0, 10).map(s => ({
    name: s.name,
    slug: s.sanitized,
    decks: s.num_decks,
  })) || null;
  
  const { error } = await supabase
    .from('ref_commanders')
    .update({
      edhrec_deck_count: card?.num_decks,
      salt_score: card?.salt,
      similar_commanders: similarCommanders,
      edhrec_synced_at: new Date().toISOString(),
    })
    .eq('id', commanderId);
  
  if (error) {
    verbose(`Error updating commander ${commanderId}: ${error.message}`);
  }
}

async function upsertCards(
  cards: Array<{
    commander_id: string;
    card_name: string;
    card_type: string;
    synergy_score: number;
    inclusion_rate: number;
    deck_count: number;
    position: number;
  }>
): Promise<number> {
  // DEPRECATED: ref_edhrec_recommendations table has been removed.
  // Card recommendations now come from ref_build_cards (theme-specific).
  // This function is kept for backwards compatibility but does nothing.
  return 0;
}

async function upsertInsights(
  insights: Array<{
    commander_id: string;
    insight_type: string;
    build_variant: string;
    content: string;
    source_type: string;
    source_url: string;
    confidence: number;
    taxonomy_tags: string[];
  }>
): Promise<number> {
  if (DRY_RUN || insights.length === 0) return 0;
  
  // Delete existing EDHREC insights for this commander
  const commanderId = insights[0].commander_id;
  await supabase
    .from('ref_commander_insights')
    .delete()
    .eq('commander_id', commanderId)
    .eq('source_type', 'edhrec');
  
  // Insert new insights
  const { error } = await supabase
    .from('ref_commander_insights')
    .insert(insights);
  
  if (error) {
    verbose(`Error inserting insights: ${error.message}`);
    return 0;
  }
  
  return insights.length;
}

async function upsertTaxonomy(
  entries: Array<{
    commander_id: string;
    taxonomy_slug: string;
    source: string;
    confidence: number;
    relevance: string;
  }>
): Promise<number> {
  if (DRY_RUN || entries.length === 0) return 0;
  
  // First, get valid taxonomy slugs from the database
  const { data: validSlugs } = await supabase
    .from('ref_taxonomy')
    .select('slug');
  
  const validSlugSet = new Set(validSlugs?.map(s => s.slug) || []);
  
  // Filter to only valid slugs
  const validEntries = entries.filter(e => validSlugSet.has(e.taxonomy_slug));
  
  if (validEntries.length === 0) return 0;
  
  // Delete existing EDHREC taxonomy for this commander
  const commanderId = validEntries[0].commander_id;
  await supabase
    .from('ref_commander_taxonomy')
    .delete()
    .eq('commander_id', commanderId)
    .eq('source', 'edhrec');
  
  // Insert new entries (ignore conflicts with existing slugs from other sources)
  const { error } = await supabase
    .from('ref_commander_taxonomy')
    .upsert(validEntries, { 
      onConflict: 'commander_id,taxonomy_slug',
      ignoreDuplicates: true 
    });
  
  if (error) {
    verbose(`Error inserting taxonomy: ${error.message}`);
    return 0;
  }
  
  return validEntries.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// Report Generation
// ═══════════════════════════════════════════════════════════════════════════

function generateReport(tagStats: TagStats, stats: SyncStats): void {
  // Ensure report directory exists
  if (!existsSync(REPORT_DIR)) {
    mkdirSync(REPORT_DIR, { recursive: true });
  }
  
  const now = new Date().toISOString().split('T')[0];
  
  // Sort unmapped by count
  const unmappedSorted = [...tagStats.unmapped.entries()]
    .sort((a, b) => b[1].count - a[1].count);
  
  // Generate markdown report
  const report = `# EDHREC Tag Mapping Report

Generated: ${now}

## Sync Summary

| Metric | Count |
|--------|-------|
| Commanders Processed | ${stats.commandersProcessed} |
| Commanders Skipped (up to date) | ${stats.commandersSkipped} |
| Commanders Failed | ${stats.commandersFailed} |
| Cards Inserted | ${stats.cardsInserted} |
| Insights Inserted | ${stats.insightsInserted} |
| Taxonomy Entries | ${stats.taxonomyInserted} |

## Mapping Coverage

| Status | Unique Tags | Total Deck References |
|--------|-------------|----------------------|
| Mapped | ${tagStats.mapped.size} | ${[...tagStats.mapped.values()].reduce((sum, v) => sum + v.count, 0).toLocaleString()} |
| Unmapped | ${tagStats.unmapped.size} | ${[...tagStats.unmapped.values()].reduce((sum, v) => sum + v.count, 0).toLocaleString()} |
| Ignored | ${tagStats.ignored.size} | ${[...tagStats.ignored.values()].reduce((sum, v) => sum + v, 0).toLocaleString()} |

## Unmapped Tags (by popularity)

These tags from EDHREC don't have mappings to our taxonomy. Review periodically and add mappings in \`scripts/edhrec-tag-mappings.ts\`.

| Tag | Commanders | Deck Count | Example Commanders | Suggested Action |
|-----|------------|------------|-------------------|------------------|
${unmappedSorted.slice(0, 50).map(([tag, data]) => 
  `| ${tag} | ${data.commanderCount} | ${data.count.toLocaleString()} | ${data.commanders.slice(0, 3).join(', ')} | _review_ |`
).join('\n')}

${unmappedSorted.length > 50 ? `\n*...and ${unmappedSorted.length - 50} more unmapped tags*\n` : ''}

## Mapped Tags Summary

| Category | Tags |
|----------|------|
| Themes | ${[...tagStats.mapped.values()].filter(v => v.mapping.category === 'themes').length} |
| Archetypes | ${[...tagStats.mapped.values()].filter(v => v.mapping.category === 'archetypes').length} |

Note: Tribes are included in Themes with \`kindred:\` prefix. Mechanics are folded into Themes.

## Next Steps

1. Review unmapped tags with high deck counts
2. For useful tags, add mappings to \`scripts/edhrec-tag-mappings.ts\`
3. For niche mechanics, consider creating new taxonomy entries in \`data/knowledge/\`
4. For irrelevant tags, add them to the ignored list (set to \`null\`)
`;

  writeFileSync(join(REPORT_DIR, 'tag-mapping-report.md'), report);
  
  // Generate JSON for tooling
  const json = {
    generatedAt: new Date().toISOString(),
    stats,
    unmappedTags: Object.fromEntries(unmappedSorted),
    mappedTags: Object.fromEntries(
      [...tagStats.mapped.entries()].map(([tag, data]) => [
        tag,
        { count: data.count, slug: data.mapping.slug, category: data.mapping.category }
      ])
    ),
  };
  
  writeFileSync(
    join(REPORT_DIR, 'unmapped-tags.json'),
    JSON.stringify(json, null, 2)
  );
  
  log(`Report written to ${REPORT_DIR}/`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  log('═'.repeat(60));
  log('EDHREC DATA SYNC');
  log('═'.repeat(60));
  
  if (DRY_RUN) log('DRY RUN MODE - no database changes');
  if (FORCE) log('FORCE MODE - re-syncing all commanders');
  if (OFFSET) log(`OFFSET MODE - starting at commander ${OFFSET}`);
  if (LIMIT) log(`LIMIT MODE - syncing only ${LIMIT} commanders`);
  
  const tagStats: TagStats = {
    mapped: new Map(),
    unmapped: new Map(),
    ignored: new Map(),
  };
  
  const stats: SyncStats = {
    commandersProcessed: 0,
    commandersSkipped: 0,
    commandersFailed: 0,
    cardsInserted: 0,
    insightsInserted: 0,
    taxonomyInserted: 0,
  };
  
  try {
    // Get commanders to sync
    log('Fetching commanders from database...');
    const commanders = await getCommandersToSync();
    log(`Found ${commanders.length} commanders`);
    
    // Filter to those needing sync
    const needSync = commanders.filter(needsSync);
    log(`${needSync.length} commanders need syncing`);
    
    if (needSync.length === 0) {
      log('All commanders are up to date!');
      return;
    }
    
    // Process each commander
    for (let i = 0; i < needSync.length; i++) {
      const commander = needSync[i];
      const progress = `[${i + 1}/${needSync.length}]`;
      
      verbose(`${progress} Processing ${commander.display_name}...`);
      
      // Fetch EDHREC data
      const slug = toEdhrecSlug(commander.display_name);
      const data = await fetchEdhrecData(slug);
      
      if (!data) {
        verbose(`${progress} No data found for ${commander.display_name}`);
        stats.commandersFailed++;
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      
      // Extract and store data
      const cards = extractTopCards(data, commander.id);
      const insights = extractBuildVariants(data, commander.id, commander.display_name, tagStats);
      const taxonomy = extractTaxonomyEntries(data, commander.id);
      
      // Update database
      await updateCommander(commander.id, data);
      stats.cardsInserted += await upsertCards(cards);
      stats.insightsInserted += await upsertInsights(insights);
      stats.taxonomyInserted += await upsertTaxonomy(taxonomy);
      
      stats.commandersProcessed++;
      
      // Progress logging every 50 commanders + interim report every 50
      if ((i + 1) % 50 === 0) {
        log(`${progress} Processed ${i + 1} commanders...`);
        // Generate interim report so user can watch progress
        generateReport(tagStats, { ...stats, commandersSkipped: 0 });
      }
      
      // Rate limit
      await sleep(REQUEST_DELAY_MS);
    }
    
    stats.commandersSkipped = commanders.length - needSync.length;
    
    // Generate report
    log('');
    log('Generating tag mapping report...');
    generateReport(tagStats, stats);
    
    // Summary
    log('');
    log('═'.repeat(60));
    log('SYNC COMPLETE');
    log('═'.repeat(60));
    log(`Commanders processed: ${stats.commandersProcessed}`);
    log(`Commanders skipped: ${stats.commandersSkipped}`);
    log(`Commanders failed: ${stats.commandersFailed}`);
    log(`Cards inserted: ${stats.cardsInserted}`);
    log(`Insights inserted: ${stats.insightsInserted}`);
    log(`Taxonomy entries: ${stats.taxonomyInserted}`);
    log(`Unmapped tags: ${tagStats.unmapped.size}`);
    
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

main();
