/**
 * Distill insights for a single commander
 * 
 * Usage: npx tsx scripts/distill-single-commander.ts "Commander Name"
 * 
 * Logs timing for each step.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const db = new Database(resolve(__dirname, '../../research/commander-content/content-raw.sqlite'), { readonly: true });

const commanderName = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!commanderName) {
  console.error('Usage: npx tsx scripts/distill-single-commander.ts "Commander Name" [--dry-run]');
  process.exit(1);
}

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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function findCommander(name: string) {
  const slug = slugify(name);
  
  const { data: exact } = await supabase
    .from('ref_commanders')
    .select('id, canonical_key, display_name')
    .eq('canonical_key', slug)
    .single();
  
  if (exact) return exact;
  
  const { data: fuzzy } = await supabase
    .from('ref_commanders')
    .select('id, canonical_key, display_name')
    .ilike('display_name', `%${name}%`)
    .limit(1)
    .single();
  
  return fuzzy || null;
}

async function extractInsights(content: RawContent, commanderDisplayName: string): Promise<ExtractedInsight[]> {
  const truncatedContent = content.full_content.slice(0, 15000);
  
  const prompt = `You are analyzing Magic: The Gathering Commander content about "${commanderDisplayName}".

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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  
  const insights: ExtractedInsight[] = JSON.parse(jsonMatch[0]);
  return insights.filter(i => 
    i.insightType && 
    i.content && 
    i.content.length > 20 &&
    i.confidence >= 0.5
  );
}

async function main() {
  const totalStart = Date.now();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Distilling: ${commanderName}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Step 1: Find commander
  let stepStart = Date.now();
  const commander = await findCommander(commanderName);
  if (!commander) {
    console.error(`❌ Commander not found: ${commanderName}`);
    process.exit(1);
  }
  console.log(`✓ Found commander: ${commander.display_name} (${Date.now() - stepStart}ms)`);
  
  // Step 2: Check existing insights
  stepStart = Date.now();
  const { count: existingCount } = await supabase
    .from('ref_commander_insights')
    .select('*', { count: 'exact', head: true })
    .eq('commander_id', commander.id);
  console.log(`✓ Existing insights: ${existingCount || 0} (${Date.now() - stepStart}ms)`);
  
  // Step 3: Get raw content
  stepStart = Date.now();
  const rows = db.prepare(`
    SELECT id, source_url, card_name, source, title, author, published_date, full_content
    FROM raw_content
    WHERE full_content IS NOT NULL 
      AND LENGTH(full_content) > 500
      AND card_name LIKE ?
    ORDER BY LENGTH(full_content) DESC
  `).all(`%${commanderName}%`) as RawContent[];
  console.log(`✓ Found ${rows.length} content items (${Date.now() - stepStart}ms)`);
  
  if (rows.length === 0) {
    console.log('\n❌ No content to process');
    process.exit(0);
  }
  
  // Step 4: Process each content item
  let totalInsights = 0;
  let totalSaved = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const content = rows[i];
    console.log(`\n[${i + 1}/${rows.length}] ${content.source}: ${content.title?.slice(0, 50) || 'No title'}...`);
    
    // Check if already processed
    const { count: alreadyDone } = await supabase
      .from('ref_commander_insights')
      .select('*', { count: 'exact', head: true })
      .eq('commander_id', commander.id)
      .eq('source_url', content.source_url);
    
    if (alreadyDone && alreadyDone > 0) {
      console.log(`  ⏭️  Already processed`);
      continue;
    }
    
    // Extract insights
    stepStart = Date.now();
    const insights = await extractInsights(content, commander.display_name);
    console.log(`  Extracted ${insights.length} insights (${Date.now() - stepStart}ms)`);
    totalInsights += insights.length;
    
    if (insights.length === 0) continue;
    
    // Save insights
    if (!dryRun) {
      stepStart = Date.now();
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
        console.log(`  ❌ Save error: ${error.message}`);
      } else {
        console.log(`  ✓ Saved ${inserts.length} insights (${Date.now() - stepStart}ms)`);
        totalSaved += inserts.length;
      }
    } else {
      console.log(`  [DRY RUN] Would save ${insights.length} insights`);
      for (const insight of insights.slice(0, 3)) {
        console.log(`    - [${insight.insightType}] ${insight.content.slice(0, 60)}...`);
      }
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }
  
  // Summary
  const totalTime = Date.now() - totalStart;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`COMPLETE: ${commander.display_name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`Content items: ${rows.length}`);
  console.log(`Insights extracted: ${totalInsights}`);
  console.log(`Insights saved: ${totalSaved}`);
  
  // Final count
  const { count: finalCount } = await supabase
    .from('ref_commander_insights')
    .select('*', { count: 'exact', head: true })
    .eq('commander_id', commander.id);
  console.log(`Total insights for ${commander.display_name}: ${finalCount}`);
}

main().catch(console.error).finally(() => db.close());
