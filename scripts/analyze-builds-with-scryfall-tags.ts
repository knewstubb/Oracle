/**
 * Analyze Builds Using Scryfall Tags
 * 
 * For each build, looks up the Scryfall tags for each card and
 * calculates archetype/theme scores based on tag signals.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LIMIT = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] || "0");
const VERBOSE = process.argv.includes("--verbose");

// Archetype-specific thresholds (score, cardCount)
// Higher thresholds for ubiquitous archetypes that appear in most decks
const ARCHETYPE_THRESHOLDS: Record<string, { score: number; cardCount: number }> = {
  // Ubiquitous - most decks run cards that trigger these
  ramp: { score: 24, cardCount: 8 },       // Actual ramp decks score 30+
  control: { score: 15, cardCount: 6 },     // Most decks run some removal
  aggro: { score: 15, cardCount: 8 },       // Anthems, attack triggers
  voltron: { score: 12, cardCount: 6 },     // Equipment/aura decks are distinct
  
  // Medium prevalence
  combo: { score: 10, cardCount: 4 },
  reanimator: { score: 10, cardCount: 4 },
  spellslinger: { score: 10, cardCount: 5 },
  
  // Distinctive - lower thresholds since these are more unique
  aristocrats: { score: 8, cardCount: 4 },
  enchantress: { score: 8, cardCount: 4 },
  mill: { score: 8, cardCount: 3 },
  lifegain: { score: 8, cardCount: 4 },
  "lands-matter": { score: 8, cardCount: 3 },
  blink: { score: 8, cardCount: 4 },
  wheels: { score: 8, cardCount: 3 },
  theft: { score: 6, cardCount: 3 },
  stax: { score: 8, cardCount: 4 },
  "group-slug": { score: 8, cardCount: 4 },
  "group-hug": { score: 6, cardCount: 3 },
  pillowfort: { score: 6, cardCount: 3 },
};

const DEFAULT_THRESHOLD = { score: 8, cardCount: 4 };

interface TagIndex {
  [oracleId: string]: {
    tags: string[];
    archetypeSignals: { archetype: string; weight: number }[];
    themeSignals: { theme: string; weight: number }[];
  };
}

interface BuildInfo {
  id: string;
  commander_id: string;
  archetype: string | null;
  theme: string | null;
  deck_count: number;
}

interface AnalysisResult {
  build_id: string;
  existing_archetype: string | null;
  existing_theme: string | null;
  archetype_scores: { archetype: string; score: number; cardCount: number }[];
  theme_scores: { theme: string; score: number; cardCount: number }[];
  suggested_secondary_archetypes: string[];
  suggested_secondary_themes: string[];
  deck_count: number;
}

// Load the tag index
const tagIndex: TagIndex = JSON.parse(
  fs.readFileSync("data/scryfall-tags/oracle-id-tags.json", "utf-8")
);

// Card name → oracle_id cache
const oracleIdCache = new Map<string, string | null>();

async function getOracleIds(cardNames: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uncached = cardNames.filter(n => !oracleIdCache.has(n));

  // Return cached
  for (const name of cardNames) {
    if (oracleIdCache.has(name)) {
      const id = oracleIdCache.get(name);
      if (id) result.set(name, id);
    }
  }

  if (uncached.length === 0) return result;

  // Fetch from ref_printings (has oracle_id)
  for (let i = 0; i < uncached.length; i += 50) {
    const batch = uncached.slice(i, i + 50);
    const { data } = await supabase
      .from("ref_printings")
      .select("name, oracle_id")
      .in("name", batch);

    for (const card of data || []) {
      if (card.oracle_id) {
        oracleIdCache.set(card.name, card.oracle_id);
        result.set(card.name, card.oracle_id);
      } else {
        oracleIdCache.set(card.name, null);
      }
    }

    // Mark missing as null
    for (const name of batch) {
      if (!oracleIdCache.has(name)) {
        oracleIdCache.set(name, null);
      }
    }
  }

  return result;
}

function analyzeCards(oracleIds: string[]): {
  archetypeScores: Map<string, { score: number; cardCount: number }>;
  themeScores: Map<string, { score: number; cardCount: number }>;
} {
  const archetypeScores = new Map<string, { score: number; cardCount: number }>();
  const themeScores = new Map<string, { score: number; cardCount: number }>();

  for (const oracleId of oracleIds) {
    const entry = tagIndex[oracleId];
    if (!entry) continue;

    // Accumulate archetype scores
    for (const signal of entry.archetypeSignals) {
      const current = archetypeScores.get(signal.archetype) || { score: 0, cardCount: 0 };
      current.score += signal.weight;
      current.cardCount += 1;
      archetypeScores.set(signal.archetype, current);
    }

    // Accumulate theme scores
    for (const signal of entry.themeSignals) {
      const current = themeScores.get(signal.theme) || { score: 0, cardCount: 0 };
      current.score += signal.weight;
      current.cardCount += 1;
      themeScores.set(signal.theme, current);
    }
  }

  return { archetypeScores, themeScores };
}

async function main() {
  console.log("=== Build Analysis with Scryfall Tags ===");
  console.log(`Tag index: ${Object.keys(tagIndex).length} oracle IDs`);
  console.log(`Limit: ${LIMIT || "none"}`);
  console.log("");

  // Load builds
  const allBuilds: BuildInfo[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ref_commander_builds")
      .select("id, commander_id, archetype, theme, deck_count")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allBuilds.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`Total builds: ${allBuilds.length}`);

  // Load build cards
  console.log("Loading build cards...");
  const buildCards = new Map<string, string[]>();
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ref_build_cards")
      .select("build_id, card_name")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!buildCards.has(row.build_id)) {
        buildCards.set(row.build_id, []);
      }
      buildCards.get(row.build_id)!.push(row.card_name);
    }

    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`Builds with cards: ${buildCards.size}`);
  console.log("");

  // Analyze builds
  const buildsToAnalyze = LIMIT > 0 ? allBuilds.slice(0, LIMIT) : allBuilds;
  const results: AnalysisResult[] = [];

  console.log(`Analyzing ${buildsToAnalyze.length} builds...`);

  for (let i = 0; i < buildsToAnalyze.length; i++) {
    const build = buildsToAnalyze[i];
    const cardNames = buildCards.get(build.id) || [];

    // Get oracle IDs for cards
    const oracleIdMap = await getOracleIds(cardNames);
    const oracleIds = Array.from(oracleIdMap.values());

    // Analyze
    const { archetypeScores, themeScores } = analyzeCards(oracleIds);

    // Sort by score
    const sortedArchetypes = Array.from(archetypeScores.entries())
      .map(([archetype, data]) => ({ archetype, ...data }))
      .sort((a, b) => b.score - a.score);

    const sortedThemes = Array.from(themeScores.entries())
      .map(([theme, data]) => ({ theme, ...data }))
      .sort((a, b) => b.score - a.score);

    // Suggest secondary archetypes using archetype-specific thresholds
    const suggestedArchetypes = sortedArchetypes
      .filter(a => {
        const threshold = ARCHETYPE_THRESHOLDS[a.archetype] || DEFAULT_THRESHOLD;
        return a.score >= threshold.score && a.cardCount >= threshold.cardCount;
      })
      .filter(a => a.archetype !== build.archetype) // Exclude existing
      .map(a => a.archetype);

    // Suggest secondary themes (lower threshold - themes are more specific)
    const suggestedThemes = sortedThemes
      .filter(t => t.score >= 6 && t.cardCount >= 3)
      .filter(t => t.theme !== build.theme) // Exclude existing
      .map(t => t.theme);

    results.push({
      build_id: build.id,
      existing_archetype: build.archetype,
      existing_theme: build.theme,
      archetype_scores: sortedArchetypes.slice(0, 5),
      theme_scores: sortedThemes.slice(0, 5),
      suggested_secondary_archetypes: suggestedArchetypes.slice(0, 3),
      suggested_secondary_themes: suggestedThemes.slice(0, 3),
      deck_count: build.deck_count,
    });

    if ((i + 1) % 100 === 0) {
      console.log(`  Analyzed ${i + 1}/${buildsToAnalyze.length}...`);
    }
  }

  console.log("");

  // Summary stats
  const buildsWithSuggestions = results.filter(
    r => r.suggested_secondary_archetypes.length > 0 || r.suggested_secondary_themes.length > 0
  );

  console.log("=== Summary ===");
  console.log(`Builds with suggested additions: ${buildsWithSuggestions.length} (${(buildsWithSuggestions.length / results.length * 100).toFixed(1)}%)`);

  // Count suggested archetypes
  const archetypeSuggestionCounts: Record<string, number> = {};
  for (const r of results) {
    for (const arch of r.suggested_secondary_archetypes) {
      archetypeSuggestionCounts[arch] = (archetypeSuggestionCounts[arch] || 0) + 1;
    }
  }

  console.log("\n=== Suggested Archetypes (frequency) ===");
  Object.entries(archetypeSuggestionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([arch, count]) => console.log(`  ${arch}: ${count} builds`));

  // Count suggested themes
  const themeSuggestionCounts: Record<string, number> = {};
  for (const r of results) {
    for (const theme of r.suggested_secondary_themes) {
      themeSuggestionCounts[theme] = (themeSuggestionCounts[theme] || 0) + 1;
    }
  }

  console.log("\n=== Suggested Themes (frequency) ===");
  Object.entries(themeSuggestionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([theme, count]) => console.log(`  ${theme}: ${count} builds`));

  // Show sample results
  if (VERBOSE) {
    console.log("\n=== Sample Results ===");
    for (const r of results.slice(0, 10)) {
      console.log(`\nBuild: ${r.existing_archetype || r.existing_theme}`);
      console.log(`  Top archetypes: ${r.archetype_scores.map(a => `${a.archetype}(${a.score})`).join(", ")}`);
      console.log(`  Top themes: ${r.theme_scores.map(t => `${t.theme}(${t.score})`).join(", ")}`);
      console.log(`  Suggested archetypes: ${r.suggested_secondary_archetypes.join(", ") || "(none)"}`);
      console.log(`  Suggested themes: ${r.suggested_secondary_themes.join(", ") || "(none)"}`);
    }
  }

  // Write results
  const outputPath = "research/edhrec-sync/scryfall-tag-analysis.json";
  fs.writeFileSync(outputPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    summary: {
      total_builds: results.length,
      builds_with_suggestions: buildsWithSuggestions.length,
      archetype_suggestions: archetypeSuggestionCounts,
      theme_suggestions: themeSuggestionCounts,
    },
    results,
  }, null, 2));
  console.log(`\nResults written to: ${outputPath}`);
}

main();
