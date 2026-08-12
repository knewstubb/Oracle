/**
 * Analyze Build Archetypes
 * 
 * Analyzes each build's cards using oracle text to detect:
 * 1. Secondary themes (counting pattern matches)
 * 2. Secondary archetypes (checking component checklists)
 * 
 * Output: Report with suggested additional tags per build
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import {
  themeRules,
  archetypeChecklists,
  STAPLES,
  DetectionRule,
  ArchetypeChecklist,
} from "./archetype-detection-rules";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VERBOSE = process.argv.includes("--verbose");
const LIMIT = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] || "0");

interface BuildInfo {
  id: string;
  commander_id: string;
  archetype: string | null;
  theme: string | null;
  primary_archetype: string | null;
  secondary_archetypes: string[];
  primary_theme: string | null;
  secondary_themes: string[];
  deck_count: number;
}

interface CardInfo {
  name: string;
  oracle_text: string | null;
  type_line: string | null;
}

interface AnalysisResult {
  build_id: string;
  existing_archetype: string | null;
  existing_theme: string | null;
  detected_themes: { theme: string; count: number; threshold: number }[];
  detected_archetypes: { archetype: string; components: { name: string; count: number; required: number }[] }[];
  contradictions: string[];
  deck_count: number;
}

// Cache for card oracle text
const cardCache = new Map<string, CardInfo>();

async function getCardInfo(cardNames: string[]): Promise<Map<string, CardInfo>> {
  const result = new Map<string, CardInfo>();
  const uncached = cardNames.filter(n => !cardCache.has(n));

  // Return cached results
  for (const name of cardNames) {
    if (cardCache.has(name)) {
      result.set(name, cardCache.get(name)!);
    }
  }

  if (uncached.length === 0) return result;

  // Fetch uncached cards in batches
  for (let i = 0; i < uncached.length; i += 50) {
    const batch = uncached.slice(i, i + 50);
    const { data, error } = await supabase
      .from("ref_cards")
      .select("name, oracle_text, type_line")
      .in("name", batch);

    if (error) {
      console.error(`Error fetching cards: ${error.message}`);
      continue;
    }

    for (const card of data || []) {
      const info: CardInfo = {
        name: card.name,
        oracle_text: card.oracle_text,
        type_line: card.type_line,
      };
      cardCache.set(card.name, info);
      result.set(card.name, info);
    }
  }

  return result;
}

function matchesPattern(text: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(text);
}

function detectThemes(cards: CardInfo[]): { theme: string; count: number; threshold: number }[] {
  const results: { theme: string; count: number; threshold: number }[] = [];

  for (const [themeName, rule] of Object.entries(themeRules)) {
    let matchCount = 0;

    for (const card of cards) {
      const text = `${card.oracle_text || ""} ${card.type_line || ""}`;
      if (rule.patterns.some(p => matchesPattern(text, p))) {
        matchCount++;
      }
    }

    if (matchCount >= rule.threshold) {
      results.push({ theme: themeName, count: matchCount, threshold: rule.threshold });
    }
  }

  return results.sort((a, b) => b.count - a.count);
}

function detectArchetypes(cards: CardInfo[]): { archetype: string; components: { name: string; count: number; required: number }[] }[] {
  const results: { archetype: string; components: { name: string; count: number; required: number }[] }[] = [];

  for (const [archetypeName, checklist] of Object.entries(archetypeChecklists)) {
    const componentResults: { name: string; count: number; required: number }[] = [];
    let allComponentsMet = true;

    for (const component of checklist.components) {
      let matchCount = 0;

      for (const card of cards) {
        const text = `${card.oracle_text || ""} ${card.type_line || ""}`;
        if (component.patterns.some(p => matchesPattern(text, p))) {
          matchCount++;
        }
      }

      componentResults.push({
        name: component.name,
        count: matchCount,
        required: component.minCount,
      });

      if (matchCount < component.minCount) {
        allComponentsMet = false;
      }
    }

    if (allComponentsMet) {
      results.push({ archetype: archetypeName, components: componentResults });
    }
  }

  return results;
}

function findContradictions(
  existing: { archetype: string | null; theme: string | null },
  detected: { themes: string[]; archetypes: string[] }
): string[] {
  const contradictions: string[] = [];

  // Check if existing archetype contradicts detected archetypes
  if (existing.archetype && detected.archetypes.length > 0) {
    if (!detected.archetypes.includes(existing.archetype)) {
      // Existing archetype not confirmed by card analysis
      // This might be a contradiction OR the detection rules need adjustment
      contradictions.push(
        `Existing archetype "${existing.archetype}" not confirmed by card analysis. Detected: [${detected.archetypes.join(", ")}]`
      );
    }
  }

  return contradictions;
}

async function main() {
  console.log("=== Build Archetype Analysis ===");
  console.log(`Verbose: ${VERBOSE}`);
  console.log(`Limit: ${LIMIT || "none"}`);
  console.log("");

  // Load all builds
  const allBuilds: BuildInfo[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ref_commander_builds")
      .select("id, commander_id, archetype, theme, primary_archetype, secondary_archetypes, primary_theme, secondary_themes, deck_count")
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

  // Analyze each build
  const buildsToAnalyze = LIMIT > 0 ? allBuilds.slice(0, LIMIT) : allBuilds;
  const results: AnalysisResult[] = [];

  console.log(`Analyzing ${buildsToAnalyze.length} builds...`);

  for (let i = 0; i < buildsToAnalyze.length; i++) {
    const build = buildsToAnalyze[i];
    const cardNames = buildCards.get(build.id) || [];

    // Filter out staples
    const filteredNames = cardNames.filter(n => !STAPLES.includes(n));

    // Get card info with oracle text
    const cardInfoMap = await getCardInfo(filteredNames);
    const cards = filteredNames
      .map(n => cardInfoMap.get(n))
      .filter((c): c is CardInfo => c !== undefined);

    // Detect themes and archetypes
    const detectedThemes = detectThemes(cards);
    const detectedArchetypes = detectArchetypes(cards);

    // Find contradictions
    const contradictions = findContradictions(
      { archetype: build.archetype, theme: build.theme },
      {
        themes: detectedThemes.map(t => t.theme),
        archetypes: detectedArchetypes.map(a => a.archetype),
      }
    );

    results.push({
      build_id: build.id,
      existing_archetype: build.archetype,
      existing_theme: build.theme,
      detected_themes: detectedThemes,
      detected_archetypes: detectedArchetypes,
      contradictions,
      deck_count: build.deck_count,
    });

    if ((i + 1) % 100 === 0) {
      console.log(`  Analyzed ${i + 1}/${buildsToAnalyze.length}...`);
    }
  }

  console.log("");

  // Generate summary statistics
  const buildsWithNewThemes = results.filter(r => r.detected_themes.length > 0);
  const buildsWithNewArchetypes = results.filter(r => r.detected_archetypes.length > 0);
  const buildsWithContradictions = results.filter(r => r.contradictions.length > 0);

  console.log("=== Summary ===");
  console.log(`Builds with detected themes: ${buildsWithNewThemes.length} (${(buildsWithNewThemes.length / results.length * 100).toFixed(1)}%)`);
  console.log(`Builds with detected archetypes: ${buildsWithNewArchetypes.length} (${(buildsWithNewArchetypes.length / results.length * 100).toFixed(1)}%)`);
  console.log(`Builds with contradictions: ${buildsWithContradictions.length}`);
  console.log("");

  // Count detected themes
  const themeCountMap = new Map<string, number>();
  for (const r of results) {
    for (const t of r.detected_themes) {
      themeCountMap.set(t.theme, (themeCountMap.get(t.theme) || 0) + 1);
    }
  }

  console.log("=== Detected Themes (by frequency) ===");
  const sortedThemes = Array.from(themeCountMap.entries()).sort((a, b) => b[1] - a[1]);
  for (const [theme, count] of sortedThemes.slice(0, 20)) {
    console.log(`  ${theme}: ${count} builds`);
  }
  if (sortedThemes.length > 20) {
    console.log(`  ... and ${sortedThemes.length - 20} more`);
  }
  console.log("");

  // Count detected archetypes
  const archetypeCountMap = new Map<string, number>();
  for (const r of results) {
    for (const a of r.detected_archetypes) {
      archetypeCountMap.set(a.archetype, (archetypeCountMap.get(a.archetype) || 0) + 1);
    }
  }

  console.log("=== Detected Archetypes (by frequency) ===");
  const sortedArchetypes = Array.from(archetypeCountMap.entries()).sort((a, b) => b[1] - a[1]);
  for (const [archetype, count] of sortedArchetypes) {
    console.log(`  ${archetype}: ${count} builds`);
  }
  console.log("");

  // Show sample contradictions
  if (buildsWithContradictions.length > 0) {
    console.log("=== Sample Contradictions ===");
    for (const r of buildsWithContradictions.slice(0, 10)) {
      console.log(`Build ${r.build_id}:`);
      console.log(`  Existing: archetype="${r.existing_archetype}", theme="${r.existing_theme}"`);
      for (const c of r.contradictions) {
        console.log(`  ${c}`);
      }
    }
    console.log("");
  }

  // Write detailed report
  const reportPath = "research/edhrec-sync/archetype-analysis-report.json";
  fs.writeFileSync(reportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    summary: {
      total_builds: results.length,
      with_detected_themes: buildsWithNewThemes.length,
      with_detected_archetypes: buildsWithNewArchetypes.length,
      with_contradictions: buildsWithContradictions.length,
    },
    theme_counts: Object.fromEntries(sortedThemes),
    archetype_counts: Object.fromEntries(sortedArchetypes),
    results: VERBOSE ? results : results.filter(r => r.detected_themes.length > 0 || r.detected_archetypes.length > 0),
  }, null, 2));
  console.log(`Report written to: ${reportPath}`);

  // Write markdown summary
  const mdPath = "research/edhrec-sync/archetype-analysis-report.md";
  const mdLines = [
    "# Archetype Analysis Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Total builds analyzed | ${results.length} |`,
    `| Builds with detected themes | ${buildsWithNewThemes.length} |`,
    `| Builds with detected archetypes | ${buildsWithNewArchetypes.length} |`,
    `| Builds with contradictions | ${buildsWithContradictions.length} |`,
    "",
    "## Detected Themes",
    "",
    "| Theme | Builds |",
    "|-------|--------|",
    ...sortedThemes.map(([theme, count]) => `| ${theme} | ${count} |`),
    "",
    "## Detected Archetypes",
    "",
    "| Archetype | Builds |",
    "|-----------|--------|",
    ...sortedArchetypes.map(([arch, count]) => `| ${arch} | ${count} |`),
    "",
  ];

  if (buildsWithContradictions.length > 0) {
    mdLines.push("## Contradictions");
    mdLines.push("");
    mdLines.push("Builds where card analysis doesn't confirm the EDHREC tag:");
    mdLines.push("");
    for (const r of buildsWithContradictions.slice(0, 20)) {
      mdLines.push(`- **${r.existing_archetype || r.existing_theme}**: ${r.contradictions[0]}`);
    }
    if (buildsWithContradictions.length > 20) {
      mdLines.push(`- ... and ${buildsWithContradictions.length - 20} more`);
    }
  }

  fs.writeFileSync(mdPath, mdLines.join("\n"));
  console.log(`Markdown report written to: ${mdPath}`);
}

main();
