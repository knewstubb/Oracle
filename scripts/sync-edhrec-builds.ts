/**
 * EDHREC Build Sync
 * 
 * Self-sufficient sync that fetches tags and build cards directly from EDHREC.
 * No dependency on ref_commander_insights.
 * 
 * Populates:
 * - ref_commander_builds: Known archetype+theme combos per commander
 * - ref_build_cards: Build-specific card recommendations (top 100 by inclusion)
 * 
 * Two-pass approach:
 * - Pass 1 (tags): Fetch commander pages, extract tag_counts, upsert builds
 * - Pass 2 (cards): For builds without cards, fetch theme subpages, extract cards
 * 
 * Usage:
 *   npx tsx scripts/sync-edhrec-builds.ts              # Full sync (tags + cards)
 *   npx tsx scripts/sync-edhrec-builds.ts --tags-only  # Only sync tags/builds
 *   npx tsx scripts/sync-edhrec-builds.ts --cards-only # Only backfill cards
 *   npx tsx scripts/sync-edhrec-builds.ts --dry-run    # Preview without writing
 *   npx tsx scripts/sync-edhrec-builds.ts --limit=10   # Sync only 10 commanders
 *   npx tsx scripts/sync-edhrec-builds.ts --verbose    # Detailed logging
 *   npx tsx scripts/sync-edhrec-builds.ts --force      # Re-sync all (ignore existing)
 *   npx tsx scripts/sync-edhrec-builds.ts --min-decks=300  # Only commanders with 300+ decks
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { getTagMapping, normalizeTag } from './edhrec-tag-mappings';

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
const MIN_THEME_PERCENTAGE = 2; // Only sync themes with >2% of decks
const TOP_CARDS_PER_BUILD = 50; // Store top N cards per build

// CLI args
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const FORCE = process.argv.includes('--force');
const TAGS_ONLY = process.argv.includes('--tags-only');
const CARDS_ONLY = process.argv.includes('--cards-only');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');
const OFFSET = parseInt(process.argv.find(a => a.startsWith('--offset='))?.split('=')[1] || '0');
const MIN_DECKS = parseInt(process.argv.find(a => a.startsWith('--min-decks='))?.split('=')[1] || '300');

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface EdhrecCardView {
  name: string;
  sanitized: string;
  num_decks: number;
  potential_decks: number;
  synergy: number;
  inclusion?: number;
}

interface EdhrecCardList {
  header: string;
  cardviews: EdhrecCardView[];
}

interface EdhrecCommanderData {
  header?: string;
  tag_counts?: Record<string, number>;
  container?: {
    json_dict?: {
      cardlists?: EdhrecCardList[];
      card?: {
        name: string;
        num_decks: number;
      };
    };
  };
  redirect?: string;
}

interface EdhrecThemeData {
  header?: string;
  // Deck structure at top level
  creature?: number;
  instant?: number;
  sorcery?: number;
  artifact?: number;
  enchantment?: number;
  planeswalker?: number;
  land?: number;
  basic?: number;
  nonbasic?: number;
  // Card data
  container?: {
    json_dict?: {
      cardlists?: EdhrecCardList[];
      card?: {
        name: string;
        num_decks: number;
      };
    };
  };
  redirect?: string;
}

interface Commander {
  id: string;
  canonical_key: string;
  display_name: string;
  edhrec_deck_count: number | null;
}

interface TagInfo {
  slug: string;
  deck_count: number;
  percentage: number;
}

interface BuildRecord {
  id: string;
  commander_id: string;
  edhrec_theme_slug: string;
  deck_count: number;
}

interface SyncStats {
  // Pass 1: Tags
  commandersProcessed: number;
  commandersSkipped: number;
  commandersFailed: number;
  tagsFound: number;
  buildsCreated: number;
  buildsSkipped: number;
  // Pass 2: Cards
  buildsNeedingCards: number;
  cardsInserted: number;
  cardSyncsFailed: number;
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

function toEdhrecSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Convert tag name to EDHREC URL slug
 * Handles special cases like "+1/+1 counters" → "plus-1-plus-1-counters"
 */
function toThemeSlug(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/\+1\/\+1/g, 'plus-1-plus-1')  // +1/+1 counters → plus-1-plus-1-counters
    .replace(/-1\/-1/g, 'minus-1-minus-1')  // -1/-1 counters → minus-1-minus-1-counters
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// EDHREC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch commander's main page from EDHREC (contains tag_counts)
 */
async function fetchEdhrecCommanderData(
  commanderSlug: string
): Promise<EdhrecCommanderData | null> {
  const url = `https://json.edhrec.com/pages/commanders/${commanderSlug}.json`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (res.status === 404) {
      verbose(`Commander not found: ${commanderSlug}`);
      return null;
    }
    
    if (!res.ok) {
      verbose(`EDHREC returned ${res.status} for ${commanderSlug}`);
      return null;
    }
    
    const data: EdhrecCommanderData = await res.json();
    
    if (data.redirect) {
      const redirectSlug = data.redirect.replace('/commanders/', '');
      verbose(`Following redirect: ${commanderSlug} → ${redirectSlug}`);
      return fetchEdhrecCommanderData(redirectSlug);
    }
    
    return data;
  } catch (err) {
    verbose(`Error fetching ${commanderSlug}: ${err instanceof Error ? err.message : 'Unknown'}`);
    return null;
  }
}

/**
 * Fetch theme-specific page from EDHREC
 * e.g., https://json.edhrec.com/pages/commanders/korvold-fae-cursed-king/treasure.json
 */
async function fetchEdhrecThemeData(
  commanderSlug: string, 
  themeSlug: string
): Promise<EdhrecThemeData | null> {
  const url = `https://json.edhrec.com/pages/commanders/${commanderSlug}/${themeSlug}.json`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (res.status === 404) {
      verbose(`Theme not found: ${commanderSlug}/${themeSlug}`);
      return null;
    }
    
    if (!res.ok) {
      verbose(`EDHREC returned ${res.status} for ${commanderSlug}/${themeSlug}`);
      return null;
    }
    
    const data: EdhrecThemeData = await res.json();
    
    if (data.redirect) {
      const parts = data.redirect.split('/');
      const newTheme = parts[parts.length - 1];
      // Avoid infinite redirect loop
      if (newTheme === themeSlug) {
        verbose(`Redirect loop detected for ${themeSlug}, skipping`);
        return null;
      }
      verbose(`Following redirect: ${themeSlug} → ${newTheme}`);
      return fetchEdhrecThemeData(commanderSlug, newTheme);
    }
    
    return data;
  } catch (err) {
    verbose(`Error fetching ${commanderSlug}/${themeSlug}: ${err instanceof Error ? err.message : 'Unknown'}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Processing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract tags from commander's EDHREC page
 * Returns tags above the percentage threshold
 */
function extractTags(
  data: EdhrecCommanderData,
  totalDecks: number
): TagInfo[] {
  const tagCounts = data.tag_counts || {};
  const tags: TagInfo[] = [];
  
  for (const [tag, deckCount] of Object.entries(tagCounts)) {
    const percentage = (deckCount / totalDecks) * 100;
    
    // Skip tags below threshold
    if (percentage < MIN_THEME_PERCENTAGE) continue;
    
    // Convert tag to URL slug
    const slug = toThemeSlug(tag);
    if (!slug) continue;
    
    tags.push({
      slug,
      deck_count: deckCount,
      percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
    });
  }
  
  // Sort by deck count descending
  return tags.sort((a, b) => b.deck_count - a.deck_count);
}

/**
 * Map EDHREC header to card category
 */
function mapHeaderToCategory(header: string): string | null {
  const h = header.toLowerCase();
  
  if (h.includes('new') || h.includes('top')) return 'top';
  if (h.includes('creature')) return 'creature';
  if (h.includes('instant')) return 'instant';
  if (h.includes('sorcery')) return 'sorcery';
  if (h.includes('artifact')) return 'artifact';
  if (h.includes('enchantment')) return 'enchantment';
  if (h.includes('planeswalker')) return 'planeswalker';
  if (h.includes('land')) return 'land';
  if (h.includes('mana') || h.includes('ramp')) return 'ramp';
  if (h.includes('draw') || h.includes('advantage')) return 'draw';
  if (h.includes('removal') || h.includes('interaction')) return 'removal';
  if (h.includes('wipe') || h.includes('board')) return 'wipe';
  
  return null;
}

/**
 * Extract deck structure averages from type distribution
 */
function extractDeckStructure(data: EdhrecThemeData): {
  avg_lands: number | null;
  avg_creatures: number | null;
  avg_artifacts: number | null;
  avg_enchantments: number | null;
  avg_instants: number | null;
  avg_sorceries: number | null;
  avg_planeswalkers: number | null;
} {
  return {
    avg_lands: data.land ?? null,
    avg_creatures: data.creature ?? null,
    avg_artifacts: data.artifact ?? null,
    avg_enchantments: data.enchantment ?? null,
    avg_instants: data.instant ?? null,
    avg_sorceries: data.sorcery ?? null,
    avg_planeswalkers: data.planeswalker ?? null,
  };
}

/**
 * Extract cards from theme page
 * Collects all cards first, then returns top 100 by inclusion rate
 */
function extractBuildCards(
  data: EdhrecThemeData,
  buildId: string
): Array<{
  build_id: string;
  card_name: string;
  synergy_score: number;
  inclusion_rate: number;
  deck_count: number;
  category: string | null;
  is_staple: boolean;
  is_signature: boolean;
  position: number;
}> {
  const cardlists = data.container?.json_dict?.cardlists || [];
  const allCards: Array<{
    build_id: string;
    card_name: string;
    synergy_score: number;
    inclusion_rate: number;
    deck_count: number;
    category: string | null;
    is_staple: boolean;
    is_signature: boolean;
    position: number;
  }> = [];
  
  const seenCards = new Set<string>();
  
  for (const list of cardlists) {
    const category = mapHeaderToCategory(list.header);
    
    for (const card of list.cardviews) {
      // Skip duplicates
      if (seenCards.has(card.name)) continue;
      seenCards.add(card.name);
      
      const potentialDecks = card.potential_decks || 1;
      const inclusionRate = card.num_decks / potentialDecks;
      const synergy = card.synergy || 0;
      
      // Determine if staple (>50% inclusion) or signature (high synergy + high inclusion)
      const isStaple = inclusionRate > 0.5;
      const isSignature = synergy > 0.15 && inclusionRate > 0.4;
      
      allCards.push({
        build_id: buildId,
        card_name: card.name,
        synergy_score: synergy,
        inclusion_rate: inclusionRate,
        deck_count: card.num_decks,
        category,
        is_staple: isStaple,
        is_signature: isSignature,
        position: 0, // Will be set after sorting
      });
    }
  }
  
  // Sort by inclusion rate descending, take top 100
  allCards.sort((a, b) => b.inclusion_rate - a.inclusion_rate);
  const topCards = allCards.slice(0, TOP_CARDS_PER_BUILD);
  
  // Set position based on sorted order
  topCards.forEach((card, index) => {
    card.position = index;
  });
  
  return topCards;
}

/**
 * Check if a tag should be skipped (mapped to null in our taxonomy)
 */
function shouldSkipTag(edhrecSlug: string): boolean {
  const normalized = normalizeTag(edhrecSlug);
  const mapping = getTagMapping(normalized);
  
  // If mapping exists and is explicitly null, skip it
  // getTagMapping returns null for ignored tags, undefined for unmapped
  // We need to check the raw TAG_MAPPINGS to distinguish
  const { TAG_MAPPINGS } = require('./edhrec-tag-mappings');
  return TAG_MAPPINGS[normalized] === null;
}

/**
 * Determine archetype and theme from EDHREC slug using our taxonomy
 * Tribes become "kindred:X" themes to distinguish kindred-agnostic from kindred-specific cards
 */
function classifyBuild(edhrecSlug: string): { 
  primary_archetype: string | null; 
  primary_theme: string | null;
} {
  const mapping = getTagMapping(edhrecSlug);
  const normalized = normalizeTag(edhrecSlug);
  
  // Known archetypes (verbs - how the deck wins)
  const archetypes = new Set([
    'aristocrats', 'combo', 'control', 'aggro', 'voltron', 'mill', 'reanimator', 
    'stax', 'group-hug', 'group-slug', 'wheels', 'blink', 'infect', 'lifegain',
    'enchantress', 'superfriends', 'theft', 'chaos', 'spellslinger', 'storm',
    'pillowfort', 'ramp', 'burn', 'extra-combats', 'extra-turns', 'toolbox',
    'topdeck', 'tap-untap', 'lands-matter', 'legendary-matters', 'good-stuff'
  ]);
  
  // Known themes (nouns - what the deck is built from)
  const themes = new Set([
    'artifacts', 'treasure', 'tokens', 'counters', 'graveyard', 'sacrifice',
    'enchantments', 'equipment', 'landfall', 'planeswalkers', 'clones',
    'vehicles', 'energy', 'exile', 'food', 'discard', 'toughness-matters',
    'defenders', 'monarch', 'snow', 'cascade', 'flashback', 'proliferate'
  ]);
  
  // Known kindred types (creature types that form tribal decks)
  const kindredTypes = new Set([
    'angels', 'assassins', 'allies', 'beasts', 'bears', 'birds', 'cats', 
    'clerics', 'constructs', 'demons', 'dinosaurs', 'dogs', 'dragons', 
    'druids', 'dwarves', 'eldrazi', 'elementals', 'elves', 'faeries', 
    'giants', 'goblins', 'gods', 'golems', 'humans', 'hydras', 'knights', 
    'krakens', 'merfolk', 'myr', 'ninjas', 'phyrexians', 'phoenixes', 
    'pirates', 'rats', 'rogues', 'samurai', 'saprolings', 'shamans', 
    'slivers', 'snakes', 'soldiers', 'sphinxes', 'spiders', 'spirits', 
    'squirrels', 'thopters', 'treefolk', 'vampires', 'warriors', 
    'werewolves', 'wizards', 'wolves', 'zombies'
  ]);
  
  if (!mapping) {
    // No mapping - infer from known lists
    if (archetypes.has(normalized)) {
      return { primary_archetype: normalized, primary_theme: null };
    }
    if (kindredTypes.has(normalized)) {
      return { primary_archetype: null, primary_theme: `kindred:${normalized}` };
    }
    if (themes.has(normalized)) {
      return { primary_archetype: null, primary_theme: normalized };
    }
    // Unknown - assume it's a theme
    return { primary_archetype: null, primary_theme: normalized };
  }
  
  // Use mapping category to classify
  const { slug, category } = mapping;
  
  if (category === 'archetypes') {
    return { primary_archetype: slug, primary_theme: null };
  } else if (category === 'themes') {
    // Themes include kindred:X tribes and mechanics now
    return { primary_archetype: null, primary_theme: slug };
  }
  
  // Fallback
  return { primary_archetype: null, primary_theme: normalized };
}

// ═══════════════════════════════════════════════════════════════════════════
// Database Operations
// ═══════════════════════════════════════════════════════════════════════════

async function upsertBuild(
  supabase: SupabaseClient,
  build: {
    commander_id: string;
    primary_archetype: string | null;
    primary_theme: string | null;
    edhrec_theme_slug: string;
    deck_count: number;
    deck_percentage: number;
    avg_lands: number | null;
    avg_creatures: number | null;
    avg_artifacts: number | null;
    avg_enchantments: number | null;
    avg_instants: number | null;
    avg_sorceries: number | null;
    avg_planeswalkers: number | null;
    edhrec_url: string;
  }
): Promise<string | null> {
  if (DRY_RUN) {
    verbose(`Would upsert build: ${build.edhrec_theme_slug}`);
    return 'dry-run-id';
  }
  
  // Also write to old columns for backwards compatibility during migration
  const { data, error } = await supabase
    .from('ref_commander_builds')
    .upsert({
      ...build,
      // Backwards compatibility: write to old columns too
      archetype: build.primary_archetype,
      theme: build.primary_theme,
      // New columns
      secondary_archetypes: [],
      secondary_themes: [],
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'commander_id,edhrec_theme_slug',
    })
    .select('id')
    .single();
  
  if (error) {
    verbose(`Error upserting build: ${error.message}`);
    return null;
  }
  
  return data?.id || null;
}

async function upsertBuildCards(
  supabase: SupabaseClient,
  cards: Array<{
    build_id: string;
    card_name: string;
    synergy_score: number;
    inclusion_rate: number;
    deck_count: number;
    category: string | null;
    is_staple: boolean;
    is_signature: boolean;
    position: number;
  }>
): Promise<number> {
  if (DRY_RUN || cards.length === 0) return cards.length;
  
  // Delete existing cards for this build
  const buildId = cards[0].build_id;
  await supabase.from('ref_build_cards').delete().eq('build_id', buildId);
  
  // Insert new cards in batches
  const BATCH_SIZE = 100;
  let inserted = 0;
  
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('ref_build_cards').insert(batch);
    
    if (error) {
      verbose(`Error inserting cards batch: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  
  return inserted;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Sync
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pass 1: Sync tags for a commander
 * Fetches EDHREC page, extracts tags, upserts builds (without cards)
 */
async function syncCommanderTags(
  commander: Commander, 
  existingBuildSlugs: Set<string>,
  stats: SyncStats
): Promise<void> {
  const slug = toEdhrecSlug(commander.display_name);
  const totalDecks = commander.edhrec_deck_count || 0;
  
  verbose(`Processing ${commander.display_name} (${totalDecks} decks)`);
  
  // Fetch commander's main EDHREC page
  const data = await fetchEdhrecCommanderData(slug);
  
  if (!data) {
    verbose(`No EDHREC data for ${commander.display_name}`);
    stats.commandersFailed++;
    return;
  }
  
  // Get actual deck count from EDHREC if available
  const edhrecDeckCount = data.container?.json_dict?.card?.num_decks || totalDecks;
  
  // Extract tags above threshold
  const tags = extractTags(data, edhrecDeckCount);
  stats.tagsFound += tags.length;
  
  if (tags.length === 0) {
    verbose(`No tags above ${MIN_THEME_PERCENTAGE}% for ${commander.display_name}`);
    stats.commandersSkipped++;
    return;
  }
  
  verbose(`Found ${tags.length} tags: ${tags.map(t => `${t.slug}(${t.percentage}%)`).join(', ')}`);
  
  // Upsert builds for each tag
  for (const tag of tags) {
    // Skip ignored tags
    if (shouldSkipTag(tag.slug)) {
      verbose(`Skipping ignored tag: ${tag.slug}`);
      continue;
    }
    
    // Skip if build already exists (unless forcing)
    if (!FORCE && existingBuildSlugs.has(tag.slug)) {
      verbose(`Build exists: ${tag.slug}`);
      stats.buildsSkipped++;
      continue;
    }
    
    // Classify the build
    const { primary_archetype, primary_theme } = classifyBuild(tag.slug);
    
    // Upsert build (no cards yet - that's pass 2)
    const buildId = await upsertBuild(supabase, {
      commander_id: commander.id,
      primary_archetype,
      primary_theme,
      edhrec_theme_slug: tag.slug,
      deck_count: tag.deck_count,
      deck_percentage: tag.percentage,
      // Structure will be filled in during card sync
      avg_lands: null,
      avg_creatures: null,
      avg_artifacts: null,
      avg_enchantments: null,
      avg_instants: null,
      avg_sorceries: null,
      avg_planeswalkers: null,
      edhrec_url: `https://edhrec.com/commanders/${slug}/${tag.slug}`,
    });
    
    if (buildId) {
      stats.buildsCreated++;
      verbose(`Created build: ${tag.slug}`);
    }
  }
  
  stats.commandersProcessed++;
}

/**
 * Pass 2: Backfill cards for builds that don't have them
 * @param commanderIdsToProcess - If provided, only process builds for these commanders
 */
async function backfillBuildCards(stats: SyncStats, commanderIdsToProcess?: Set<string>): Promise<void> {
  log('');
  log('═══════════════════════════════════════════════════════════════');
  log('PASS 2: BACKFILLING BUILD CARDS');
  log('═══════════════════════════════════════════════════════════════');
  
  // Get all builds (or filtered by commander if specified)
  const allBuilds: BuildRecord[] = [];
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data: page, error } = await supabase
      .from('ref_commander_builds')
      .select('id, commander_id, edhrec_theme_slug, deck_count')
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      log(`Error fetching builds: ${error.message}`);
      return;
    }
    
    if (!page || page.length === 0) break;
    allBuilds.push(...page);
    offset += pageSize;
    if (page.length < pageSize) break;
  }
  
  // Filter to only commanders we processed in Pass 1 (if specified)
  let buildsToConsider = allBuilds;
  if (commanderIdsToProcess && commanderIdsToProcess.size > 0) {
    buildsToConsider = allBuilds.filter(b => commanderIdsToProcess.has(b.commander_id));
    log(`Filtered to ${buildsToConsider.length} builds for ${commanderIdsToProcess.size} commanders`);
  } else {
    log(`Total builds: ${allBuilds.length}`);
  }
  
  // Get builds that already have cards
  const { data: buildsWithCards } = await supabase
    .from('ref_build_cards')
    .select('build_id');
  
  const hasCards = new Set((buildsWithCards || []).map(b => b.build_id));
  
  // Filter to builds needing cards
  let buildsNeedingCards = buildsToConsider.filter(b => !hasCards.has(b.id));
  
  // If forcing, process all builds
  if (FORCE) {
    buildsNeedingCards = buildsToConsider;
  }
  
  stats.buildsNeedingCards = buildsNeedingCards.length;
  log(`Builds needing cards: ${buildsNeedingCards.length}`);
  
  if (buildsNeedingCards.length === 0) {
    log('All builds have cards!');
    return;
  }
  
  // Get commander info for each build (batch to avoid Supabase limits)
  const commanderIds = Array.from(new Set(buildsNeedingCards.map(b => b.commander_id)));
  const commanderMap = new Map<string, string>();
  
  const BATCH_SIZE = 500;
  for (let i = 0; i < commanderIds.length; i += BATCH_SIZE) {
    const batch = commanderIds.slice(i, i + BATCH_SIZE);
    const { data: commanders } = await supabase
      .from('ref_commanders')
      .select('id, display_name')
      .in('id', batch);
    
    for (const c of commanders || []) {
      commanderMap.set(c.id, c.display_name);
    }
  }
  
  log(`Loaded ${commanderMap.size} commander names`);
  
  // Process each build
  for (let i = 0; i < buildsNeedingCards.length; i++) {
    const build = buildsNeedingCards[i];
    const commanderName = commanderMap.get(build.commander_id) || 'Unknown';
    
    if (commanderName === 'Unknown') {
      verbose(`Skipping build ${build.id} - commander not found`);
      stats.cardSyncsFailed++;
      continue;
    }
    
    const commanderSlug = toEdhrecSlug(commanderName);
    const progress = `[${i + 1}/${buildsNeedingCards.length}]`;
    
    verbose(`${progress} ${commanderName}/${build.edhrec_theme_slug}`);
    
    await sleep(REQUEST_DELAY_MS);
    
    // Fetch theme page
    const themeData = await fetchEdhrecThemeData(commanderSlug, build.edhrec_theme_slug);
    
    if (!themeData) {
      verbose(`Could not fetch theme: ${build.edhrec_theme_slug}`);
      stats.cardSyncsFailed++;
      continue;
    }
    
    // Extract deck structure and update build
    const structure = extractDeckStructure(themeData);
    if (!DRY_RUN) {
      await supabase
        .from('ref_commander_builds')
        .update({
          ...structure,
          synced_at: new Date().toISOString(),
        })
        .eq('id', build.id);
    }
    
    // Extract and insert cards
    const cards = extractBuildCards(themeData, build.id);
    const cardsInserted = await upsertBuildCards(supabase, cards);
    stats.cardsInserted += cardsInserted;
    
    verbose(`Inserted ${cardsInserted} cards`);
    
    // Progress update every 100 builds
    if ((i + 1) % 100 === 0) {
      log(`${progress} Progress: ${stats.cardsInserted} cards inserted`);
    }
  }
}

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('EDHREC BUILD SYNC');
  log('═══════════════════════════════════════════════════════════════');
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  log(`Min decks: ${MIN_DECKS}`);
  log(`Min theme %: ${MIN_THEME_PERCENTAGE}%`);
  log(`Tags only: ${TAGS_ONLY}`);
  log(`Cards only: ${CARDS_ONLY}`);
  if (LIMIT) log(`Limit: ${LIMIT} commanders`);
  if (OFFSET) log(`Offset: ${OFFSET}`);
  if (FORCE) log(`Force: re-syncing all`);
  log('');
  
  const stats: SyncStats = {
    commandersProcessed: 0,
    commandersSkipped: 0,
    commandersFailed: 0,
    tagsFound: 0,
    buildsCreated: 0,
    buildsSkipped: 0,
    buildsNeedingCards: 0,
    cardsInserted: 0,
    cardSyncsFailed: 0,
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // PASS 1: Sync tags (unless --cards-only)
  // ─────────────────────────────────────────────────────────────────────────
  if (!CARDS_ONLY) {
    log('═══════════════════════════════════════════════════════════════');
    log('PASS 1: SYNCING TAGS');
    log('═══════════════════════════════════════════════════════════════');
    
    // Fetch commanders with enough decks (paginate to overcome 1000 row limit)
    const allCommanders: Commander[] = [];
    let offset = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data: page, error } = await supabase
        .from('ref_commanders')
        .select('id, canonical_key, display_name, edhrec_deck_count')
        .eq('legal_commander', true)
        .gte('edhrec_deck_count', MIN_DECKS)
        .order('edhrec_deck_count', { ascending: false })
        .range(offset, offset + pageSize - 1);
      
      if (error) {
        log(`Error fetching commanders: ${error.message}`);
        process.exit(1);
      }
      
      if (!page || page.length === 0) break;
      
      allCommanders.push(...page);
      offset += pageSize;
      
      if (page.length < pageSize) break;
    }
    
    log(`Found ${allCommanders.length} commanders with ${MIN_DECKS}+ decks`);
    
    // Apply limit/offset
    let commanders = allCommanders;
    if (LIMIT) {
      commanders = allCommanders.slice(OFFSET, OFFSET + LIMIT);
    }
    
    log(`Processing ${commanders.length} commanders`);
    log('');
    
    // Track which commanders we process for Pass 2
    const processedCommanderIds = new Set<string>();
    
    // Get existing builds for each commander to know what to skip
    const { data: existingBuilds } = await supabase
      .from('ref_commander_builds')
      .select('commander_id, edhrec_theme_slug');
    
    const existingBuildsByCommander = new Map<string, Set<string>>();
    for (const build of existingBuilds || []) {
      if (!existingBuildsByCommander.has(build.commander_id)) {
        existingBuildsByCommander.set(build.commander_id, new Set());
      }
      existingBuildsByCommander.get(build.commander_id)!.add(build.edhrec_theme_slug);
    }
    
    // Process each commander
    for (let i = 0; i < commanders.length; i++) {
      const commander = commanders[i];
      const progress = `[${i + 1}/${commanders.length}]`;
      const existingSlugs = existingBuildsByCommander.get(commander.id) || new Set();
      
      // Track this commander for Pass 2
      processedCommanderIds.add(commander.id);
      
      log(`${progress} ${commander.display_name} (${existingSlugs.size} existing builds)`);
      
      await sleep(REQUEST_DELAY_MS);
      
      try {
        await syncCommanderTags(commander, existingSlugs, stats);
      } catch (err) {
        log(`Error processing ${commander.display_name}: ${err instanceof Error ? err.message : 'Unknown'}`);
        stats.commandersFailed++;
      }
      
      // Progress update every 50 commanders
      if ((i + 1) % 50 === 0) {
        log('');
        log(`Progress: ${stats.commandersProcessed} processed, ${stats.buildsCreated} builds created, ${stats.buildsSkipped} skipped`);
        log('');
      }
    }
    
    log('');
    log('Pass 1 complete');
    log(`  Commanders processed: ${stats.commandersProcessed}`);
    log(`  Commanders skipped: ${stats.commandersSkipped}`);
    log(`  Commanders failed: ${stats.commandersFailed}`);
    log(`  Tags found: ${stats.tagsFound}`);
    log(`  Builds created: ${stats.buildsCreated}`);
    log(`  Builds skipped (already exist): ${stats.buildsSkipped}`);
    
    // Pass the commander IDs to Pass 2
    if (!TAGS_ONLY) {
      await backfillBuildCards(stats, processedCommanderIds);
    }
  } else {
    // Cards only mode - process all commanders
    if (!TAGS_ONLY) {
      await backfillBuildCards(stats);
    }
  }
  
  // Final summary
  log('');
  log('═══════════════════════════════════════════════════════════════');
  log('SYNC COMPLETE');
  log('═══════════════════════════════════════════════════════════════');
  log(`Commanders processed: ${stats.commandersProcessed}`);
  log(`Commanders skipped: ${stats.commandersSkipped}`);
  log(`Commanders failed: ${stats.commandersFailed}`);
  log(`Tags found: ${stats.tagsFound}`);
  log(`Builds created: ${stats.buildsCreated}`);
  log(`Builds skipped: ${stats.buildsSkipped}`);
  log(`Builds needing cards: ${stats.buildsNeedingCards}`);
  log(`Cards inserted: ${stats.cardsInserted}`);
  log(`Card syncs failed: ${stats.cardSyncsFailed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
