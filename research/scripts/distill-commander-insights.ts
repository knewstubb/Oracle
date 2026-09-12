/**
 * Distill Commander Insights
 * 
 * Processes raw content (articles, transcripts) to extract commander insights
 * and stores them in ref_commander_insights.
 * 
 * Insight types:
 * - strategy: Core gameplan, win conditions, key synergies
 * - card_recommendation: Specific cards that work well
 * - matchup: How to play against certain archetypes
 * - budget: Budget alternatives or upgrades
 * - meta: Current competitive positioning
 * 
 * Usage: npx tsx scripts/distill-commander-insights.ts [--commander "Name"] [--limit N]
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env
config({ path: resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const db = new Database(
  process.env.COMMANDER_CONTENT_DB_PATH ?? resolve(__dirname, '../../../research/commander-content/content-raw.sqlite'),
  { readonly: true }
);

// Parse CLI args
const args = process.argv.slice(2);
const commanderFilter = args.includes('--commander') 
  ? args[args.indexOf('--commander') + 1] 
  : null;
const limitArg = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : 50;
const dryRun = args.includes('--dry-run');

interface RawContent {
  id: number;
  source_url: string;
  card_name: string;
  source: string;
  title: string | null;
  author: string | null;
  published_date: string | null;
  full_content: string;
}

interface ExtractedInsight {
  insightType: 'strategy' | 'card_recommendation' | 'matchup' | 'budget' | 'meta';
  buildVariant: string | null;
  content: string;
  cardMentions: string[];
  confidence: number;
}

interface Commander {
  id: string;
  canonical_key: string;
  display_name: string;
}

/**
 * Slugify a card name to match canonical_key format
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Find the commander entry for a given card_name from raw content
 */
async function findCommander(cardName: string): Promise<Commander | null> {
  // Try exact match first
  const slug = slugify(cardName);
  
  const { data: exact } = await supabase
    .from('ref_commanders')
    .select('id, canonical_key, display_name')
    .eq('canonical_key', slug)
    .single();
  
  if (exact) return exact;
  
  // Try fuzzy match on display_name
  const { data: fuzzy } = await supabase
    .from('ref_commanders')
    .select('id, canonical_key, display_name')
    .ilike('display_name', `%${cardName}%`)
    .limit(1)
    .single();
  
  return fuzzy || null;
}

/**
 * Extract insights from content using Claude
 */
async function extractInsights(
  content: RawContent,
  commander: Commander
): Promise<ExtractedInsight[]> {
  const truncatedContent = content.full_content.slice(0, 15000); // Limit for API
  
  const prompt = `You are analyzing Magic: The Gathering Commander content about "${commander.display_name}".

Extract actionable insights from this content. Focus on:
1. **Strategy insights**: Core gameplan, win conditions, key synergies, card interactions
2. **Card recommendations**: Specific cards mentioned as strong picks, with reasoning
3. **Matchup insights**: How to play against certain commanders or archetypes
4. **Budget insights**: Budget alternatives or expensive upgrades mentioned
5. **Meta insights**: Competitive positioning, power level discussions

For each insight:
- Be specific and actionable
- Include card names mentioned (exact MTG card names only)
- Rate confidence 0.0-1.0 based on how specific the advice is
- If the content mentions a specific build variant (e.g., "aristocrats build", "voltron", "storm"), note it

Respond with a JSON array of insights:
[
  {
    "insightType": "strategy" | "card_recommendation" | "matchup" | "budget" | "meta",
    "buildVariant": "variant name or null",
    "content": "The specific insight in 1-3 sentences",
    "cardMentions": ["Card Name 1", "Card Name 2"],
    "confidence": 0.8
  }
]

If no relevant insights can be extracted, return an empty array [].

Content source: ${content.source}
Title: ${content.title || 'Unknown'}
Author: ${content.author || 'Unknown'}

---
${truncatedContent}
---

JSON array of insights:`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    
    const insights: ExtractedInsight[] = JSON.parse(jsonMatch[0]);
    
    // Validate and clean
    return insights.filter(i => 
      i.insightType && 
      i.content && 
      i.content.length > 20 &&
      i.confidence >= 0.5
    );
  } catch (err) {
    console.error(`  Error extracting insights: ${err}`);
    return [];
  }
}

/**
 * Save insights to database
 */
async function saveInsights(
  commander: Commander,
  content: RawContent,
  insights: ExtractedInsight[]
): Promise<number> {
  const inserts = insights.map(insight => ({
    commander_id: commander.id,
    build_variant: insight.buildVariant,
    insight_type: insight.insightType,
    content: insight.content,
    source_type: content.source,
    source_url: content.source_url,
    source_title: content.title,
    source_author: content.author,
    source_date: content.published_date,
    confidence: insight.confidence,
    card_mentions: insight.cardMentions
  }));
  
  const { error } = await supabase
    .from('ref_commander_insights')
    .insert(inserts);
  
  if (error) {
    console.error(`  Error saving insights: ${error.message}`);
    return 0;
  }
  
  return inserts.length;
}

async function main() {
  console.log('Commander Insight Distillation Pipeline\n');
  console.log('='.repeat(60));
  
  if (commanderFilter) {
    console.log(`Filtering to commander: ${commanderFilter}`);
  }
  console.log(`Processing limit: ${limitArg}`);
  if (dryRun) {
    console.log('DRY RUN - no database writes');
  }
  console.log();
  
  // Get content to process
  let query = `
    SELECT id, source_url, card_name, source, title, author, published_date, full_content
    FROM raw_content
    WHERE full_content IS NOT NULL 
      AND full_content != ''
      AND LENGTH(full_content) > 500
  `;
  
  if (commanderFilter) {
    query += ` AND card_name LIKE '%${commanderFilter.replace(/'/g, "''")}%'`;
  }
  
  query += ` ORDER BY 
    CASE source 
      WHEN 'youtube' THEN 1 
      WHEN 'commanders_herald' THEN 2 
      ELSE 3 
    END,
    LENGTH(full_content) DESC
  LIMIT ${limitArg}`;
  
  const rows = db.prepare(query).all() as RawContent[];
  console.log(`Found ${rows.length} content items to process\n`);
  
  // Stats
  const stats = {
    processed: 0,
    skipped: 0,
    insightsExtracted: 0,
    insightsSaved: 0,
    byType: {} as Record<string, number>,
    bySource: {} as Record<string, number>
  };
  
  // Process each content item
  for (let i = 0; i < rows.length; i++) {
    const content = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;
    
    console.log(`${progress} Processing: ${content.card_name}`);
    console.log(`  Source: ${content.source} | ${content.title?.slice(0, 50) || 'No title'}...`);
    
    // Find matching commander
    const commander = await findCommander(content.card_name);
    if (!commander) {
      console.log(`  ⏭️  No matching commander found, skipping`);
      stats.skipped++;
      continue;
    }
    
    console.log(`  Commander: ${commander.display_name}`);
    
    // Check if we already have insights from this source
    const { count } = await supabase
      .from('ref_commander_insights')
      .select('*', { count: 'exact', head: true })
      .eq('commander_id', commander.id)
      .eq('source_url', content.source_url);
    
    if (count && count > 0) {
      console.log(`  ⏭️  Already processed this source`);
      stats.skipped++;
      continue;
    }
    
    // Extract insights
    console.log(`  Extracting insights...`);
    const insights = await extractInsights(content, commander);
    
    if (insights.length === 0) {
      console.log(`  ⏭️  No insights extracted`);
      stats.skipped++;
      continue;
    }
    
    console.log(`  Found ${insights.length} insights`);
    stats.insightsExtracted += insights.length;
    
    // Track by type
    for (const insight of insights) {
      stats.byType[insight.insightType] = (stats.byType[insight.insightType] || 0) + 1;
    }
    stats.bySource[content.source] = (stats.bySource[content.source] || 0) + insights.length;
    
    // Save to database
    if (!dryRun) {
      const saved = await saveInsights(commander, content, insights);
      stats.insightsSaved += saved;
      console.log(`  ✅ Saved ${saved} insights`);
    } else {
      console.log(`  [DRY RUN] Would save ${insights.length} insights`);
      for (const insight of insights) {
        console.log(`    - [${insight.insightType}] ${insight.content.slice(0, 80)}...`);
      }
    }
    
    stats.processed++;
    
    // Rate limiting pause
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Processed: ${stats.processed}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Insights extracted: ${stats.insightsExtracted}`);
  console.log(`Insights saved: ${stats.insightsSaved}`);
  
  console.log('\nBy insight type:');
  for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  
  console.log('\nBy source:');
  for (const [source, count] of Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source}: ${count}`);
  }
  
  // Final database count
  if (!dryRun) {
    const { count: totalInsights } = await supabase
      .from('ref_commander_insights')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\nTotal insights in database: ${totalInsights}`);
  }
}

main().catch(console.error).finally(() => db.close());
