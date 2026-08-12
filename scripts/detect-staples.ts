/**
 * Detect Staples
 * 
 * Finds cards that appear in a high percentage of builds regardless of tag.
 * These are "format staples" that don't signal any particular archetype/theme.
 * 
 * Output: A list of staple cards to exclude from archetype/theme analysis.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Threshold: cards appearing in X% of builds are considered staples
const STAPLE_THRESHOLD = 0.40; // 40%

interface BuildCard {
  build_id: string;
  card_name: string;
}

interface BuildInfo {
  id: string;
  archetype: string | null;
  theme: string | null;
}

async function main() {
  console.log("=== Staple Detection ===");
  console.log(`Threshold: ${STAPLE_THRESHOLD * 100}% of builds`);
  console.log("");

  // Get all builds with their tags
  const allBuilds: BuildInfo[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ref_commander_builds")
      .select("id, archetype, theme")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allBuilds.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`Total builds: ${allBuilds.length}`);

  // Get all build cards with pagination
  console.log("Loading build cards...");
  const allCards: BuildCard[] = [];
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ref_build_cards")
      .select("build_id, card_name")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allCards.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
    if (offset % 10000 === 0) {
      console.log(`  Loaded ${offset} cards...`);
    }
  }
  console.log(`Total card entries: ${allCards.length}`);
  console.log("");

  // Count appearances per card
  const cardBuildCount = new Map<string, Set<string>>();
  for (const card of allCards) {
    if (!cardBuildCount.has(card.card_name)) {
      cardBuildCount.set(card.card_name, new Set());
    }
    cardBuildCount.get(card.card_name)!.add(card.build_id);
  }

  console.log(`Unique cards: ${cardBuildCount.size}`);

  // Calculate percentage and find staples
  const totalBuilds = allBuilds.length;
  const staples: { card: string; count: number; percentage: number }[] = [];

  for (const [card, builds] of cardBuildCount) {
    const percentage = builds.size / totalBuilds;
    if (percentage >= STAPLE_THRESHOLD) {
      staples.push({ card, count: builds.size, percentage });
    }
  }

  staples.sort((a, b) => b.percentage - a.percentage);

  console.log(`Staples found (≥${STAPLE_THRESHOLD * 100}%): ${staples.length}`);
  console.log("");

  // Print staples
  console.log("=== Staples List ===");
  for (const s of staples) {
    console.log(`  ${(s.percentage * 100).toFixed(1)}% - ${s.card} (${s.count} builds)`);
  }

  // Also show near-staples (30-40%)
  const nearStaples: { card: string; count: number; percentage: number }[] = [];
  for (const [card, builds] of cardBuildCount) {
    const percentage = builds.size / totalBuilds;
    if (percentage >= 0.30 && percentage < STAPLE_THRESHOLD) {
      nearStaples.push({ card, count: builds.size, percentage });
    }
  }
  nearStaples.sort((a, b) => b.percentage - a.percentage);

  console.log("");
  console.log(`=== Near-Staples (30-40%) ===`);
  for (const s of nearStaples) {
    console.log(`  ${(s.percentage * 100).toFixed(1)}% - ${s.card} (${s.count} builds)`);
  }

  // Cross-tag analysis: cards that appear across DIFFERENT tags
  // A true staple should appear in builds with different archetypes/themes
  console.log("");
  console.log("=== Cross-Tag Analysis ===");
  
  // Build a map: card -> set of unique tags it appears in
  const cardTagSpread = new Map<string, Set<string>>();
  const buildTagMap = new Map<string, string>();
  
  for (const build of allBuilds) {
    const tag = build.archetype || build.theme || "unknown";
    buildTagMap.set(build.id, tag);
  }

  for (const card of allCards) {
    const tag = buildTagMap.get(card.build_id) || "unknown";
    if (!cardTagSpread.has(card.card_name)) {
      cardTagSpread.set(card.card_name, new Set());
    }
    cardTagSpread.get(card.card_name)!.add(tag);
  }

  // Get unique tag count
  const uniqueTags = new Set(buildTagMap.values()).size;
  console.log(`Unique tags: ${uniqueTags}`);

  // True staples: high build % AND appear across many different tags
  const trueStaples: { 
    card: string; 
    buildPct: number; 
    tagCount: number;
    tagPct: number;
  }[] = [];

  for (const s of staples) {
    const tagCount = cardTagSpread.get(s.card)?.size || 0;
    trueStaples.push({
      card: s.card,
      buildPct: s.percentage,
      tagCount,
      tagPct: tagCount / uniqueTags,
    });
  }

  trueStaples.sort((a, b) => b.tagPct - a.tagPct);

  console.log("");
  console.log("=== True Staples (high build % + cross-tag presence) ===");
  console.log("Card | Build % | Tags | Tag %");
  console.log("-".repeat(60));
  for (const s of trueStaples) {
    console.log(
      `${s.card.padEnd(30)} | ${(s.buildPct * 100).toFixed(1).padStart(5)}% | ${String(s.tagCount).padStart(3)} | ${(s.tagPct * 100).toFixed(1)}%`
    );
  }

  // Write staples list to file
  const staplesList = trueStaples
    .filter(s => s.tagPct >= 0.50) // Appears in 50%+ of different tags
    .map(s => s.card);

  const output = {
    generated_at: new Date().toISOString(),
    threshold: {
      build_percentage: STAPLE_THRESHOLD,
      tag_percentage: 0.50,
    },
    total_builds: totalBuilds,
    unique_tags: uniqueTags,
    staples: staplesList,
    staples_with_stats: trueStaples.filter(s => s.tagPct >= 0.50),
    near_staples: trueStaples.filter(s => s.tagPct >= 0.30 && s.tagPct < 0.50),
  };

  const outputPath = "research/edhrec-sync/staples.json";
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("");
  console.log(`Staples list written to: ${outputPath}`);
  console.log(`True staples count: ${staplesList.length}`);
}

main();
