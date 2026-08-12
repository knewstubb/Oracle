/**
 * Enrich builds with secondary archetypes based on theme mappings.
 * 
 * For builds that have a theme but no archetype, this script:
 * 1. Looks up the theme in the mapping file
 * 2. Sets primary_archetype if empty
 * 3. Adds to secondary_archetypes
 * 
 * Usage:
 *   npx tsx scripts/enrich-build-archetypes.ts --dry-run   # Preview changes
 *   npx tsx scripts/enrich-build-archetypes.ts             # Apply changes
 *   npx tsx scripts/enrich-build-archetypes.ts --report    # Generate report only
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { getArchetypeMapping, getAllMappings } from "./theme-archetype-mappings";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run");
const REPORT_ONLY = process.argv.includes("--report");

interface Build {
  id: string;
  commander_id: string;
  archetype: string | null;
  theme: string | null;
  primary_archetype: string | null;
  secondary_archetypes: string[];
  deck_count: number;
}

interface EnrichmentPlan {
  build_id: string;
  theme: string;
  current_archetype: string | null;
  inferred_archetypes: string[];
  confidence: string;
  notes?: string;
  deck_count: number;
}

async function main() {
  console.log(REPORT_ONLY ? "=== REPORT ONLY ===" : DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  console.log("");

  // Fetch all builds with pagination
  const allBuilds: Build[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("ref_commander_builds")
      .select("id, commander_id, archetype, theme, primary_archetype, secondary_archetypes, deck_count")
      .range(offset, offset + 999);

    if (error) {
      console.error("Error fetching builds:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allBuilds.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`Total builds: ${allBuilds.length}`);

  // Categorize builds
  const buildsWithArchetypeOnly = allBuilds.filter(b => b.archetype && !b.theme);
  const buildsWithThemeOnly = allBuilds.filter(b => !b.archetype && b.theme);
  const buildsWithBoth = allBuilds.filter(b => b.archetype && b.theme);
  const buildsWithNeither = allBuilds.filter(b => !b.archetype && !b.theme);

  console.log(`  Archetype only: ${buildsWithArchetypeOnly.length}`);
  console.log(`  Theme only: ${buildsWithThemeOnly.length}`);
  console.log(`  Both: ${buildsWithBoth.length}`);
  console.log(`  Neither: ${buildsWithNeither.length}`);
  console.log("");

  // Build enrichment plan for theme-only builds
  const enrichmentPlan: EnrichmentPlan[] = [];
  const unmappedThemes = new Map<string, number>();
  const lowConfidenceThemes = new Map<string, number>();

  for (const build of buildsWithThemeOnly) {
    const mapping = getArchetypeMapping(build.theme!);

    if (!mapping || mapping.archetypes.length === 0) {
      unmappedThemes.set(build.theme!, (unmappedThemes.get(build.theme!) || 0) + 1);
      continue;
    }

    if (mapping.confidence === "low") {
      lowConfidenceThemes.set(build.theme!, (lowConfidenceThemes.get(build.theme!) || 0) + 1);
    }

    enrichmentPlan.push({
      build_id: build.id,
      theme: build.theme!,
      current_archetype: build.archetype,
      inferred_archetypes: mapping.archetypes,
      confidence: mapping.confidence,
      notes: mapping.notes,
      deck_count: build.deck_count,
    });
  }

  console.log(`Enrichment plan: ${enrichmentPlan.length} builds`);
  console.log(`Unmapped themes: ${unmappedThemes.size} themes (${Array.from(unmappedThemes.values()).reduce((a, b) => a + b, 0)} builds)`);
  console.log(`Low confidence: ${lowConfidenceThemes.size} themes (${Array.from(lowConfidenceThemes.values()).reduce((a, b) => a + b, 0)} builds)`);
  console.log("");

  // Show unmapped themes
  if (unmappedThemes.size > 0) {
    console.log("Unmapped themes (need manual mapping):");
    const sorted = Array.from(unmappedThemes.entries()).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([theme, count]) => console.log(`  ${theme}: ${count} builds`));
    console.log("");
  }

  // Show low confidence themes
  if (lowConfidenceThemes.size > 0) {
    console.log("Low confidence themes (may need card analysis):");
    const sorted = Array.from(lowConfidenceThemes.entries()).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([theme, count]) => console.log(`  ${theme}: ${count} builds`));
    console.log("");
  }

  // Group by confidence for summary
  const byConfidence = {
    high: enrichmentPlan.filter(p => p.confidence === "high"),
    medium: enrichmentPlan.filter(p => p.confidence === "medium"),
    low: enrichmentPlan.filter(p => p.confidence === "low"),
  };

  console.log("By confidence:");
  console.log(`  High: ${byConfidence.high.length} builds`);
  console.log(`  Medium: ${byConfidence.medium.length} builds`);
  console.log(`  Low: ${byConfidence.low.length} builds`);
  console.log("");

  // Show sample enrichments
  console.log("Sample enrichments (first 20):");
  enrichmentPlan.slice(0, 20).forEach(p => {
    console.log(`  ${p.theme} → [${p.inferred_archetypes.join(", ")}] (${p.confidence})`);
  });
  if (enrichmentPlan.length > 20) {
    console.log(`  ... and ${enrichmentPlan.length - 20} more`);
  }
  console.log("");

  // Write detailed report
  const reportPath = "research/edhrec-sync/archetype-enrichment-plan.md";
  const report = generateReport(enrichmentPlan, unmappedThemes, byConfidence);
  fs.writeFileSync(reportPath, report);
  console.log(`Report written to: ${reportPath}`);

  if (REPORT_ONLY || DRY_RUN) {
    console.log(REPORT_ONLY ? "REPORT ONLY - no changes made" : "DRY RUN - no changes made");
    return;
  }

  // Apply changes
  console.log("");
  console.log("Applying enrichments...");
  let updated = 0;
  let errors = 0;

  for (const plan of enrichmentPlan) {
    // Only update if we have high or medium confidence
    if (plan.confidence === "low") continue;

    const primaryArchetype = plan.inferred_archetypes[0];
    const secondaryArchetypes = plan.inferred_archetypes.slice(1);

    const { error } = await supabase
      .from("ref_commander_builds")
      .update({
        primary_archetype: primaryArchetype,
        secondary_archetypes: secondaryArchetypes,
      })
      .eq("id", plan.build_id);

    if (error) {
      console.error(`Error updating ${plan.build_id}: ${error.message}`);
      errors++;
    } else {
      updated++;
    }

    if (updated % 100 === 0) {
      console.log(`  Updated ${updated}...`);
    }
  }

  console.log("");
  console.log(`=== Complete ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Skipped (low confidence): ${byConfidence.low.length}`);
}

function generateReport(
  plan: EnrichmentPlan[],
  unmapped: Map<string, number>,
  byConfidence: { high: EnrichmentPlan[]; medium: EnrichmentPlan[]; low: EnrichmentPlan[] }
): string {
  const lines: string[] = [
    "# Archetype Enrichment Plan",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Category | Builds |`,
    `|----------|--------|`,
    `| High confidence | ${byConfidence.high.length} |`,
    `| Medium confidence | ${byConfidence.medium.length} |`,
    `| Low confidence (skipped) | ${byConfidence.low.length} |`,
    `| Unmapped themes | ${Array.from(unmapped.values()).reduce((a, b) => a + b, 0)} |`,
    "",
    "## High Confidence Mappings",
    "",
    "These will be applied automatically.",
    "",
    "| Theme | → Archetypes | Builds |",
    "|-------|--------------|--------|",
  ];

  // Group high confidence by theme
  const highByTheme = new Map<string, { archetypes: string[]; count: number }>();
  for (const p of byConfidence.high) {
    const key = p.theme;
    if (!highByTheme.has(key)) {
      highByTheme.set(key, { archetypes: p.inferred_archetypes, count: 0 });
    }
    highByTheme.get(key)!.count++;
  }
  Array.from(highByTheme.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([theme, data]) => {
      lines.push(`| ${theme} | ${data.archetypes.join(", ")} | ${data.count} |`);
    });

  lines.push("");
  lines.push("## Medium Confidence Mappings");
  lines.push("");
  lines.push("These will be applied but may have exceptions.");
  lines.push("");
  lines.push("| Theme | → Archetypes | Builds | Notes |");
  lines.push("|-------|--------------|--------|-------|");

  const medByTheme = new Map<string, { archetypes: string[]; count: number; notes?: string }>();
  for (const p of byConfidence.medium) {
    const key = p.theme;
    if (!medByTheme.has(key)) {
      medByTheme.set(key, { archetypes: p.inferred_archetypes, count: 0, notes: p.notes });
    }
    medByTheme.get(key)!.count++;
  }
  Array.from(medByTheme.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([theme, data]) => {
      lines.push(`| ${theme} | ${data.archetypes.join(", ")} | ${data.count} | ${data.notes || ""} |`);
    });

  lines.push("");
  lines.push("## Low Confidence (Needs Review)");
  lines.push("");
  lines.push("These will NOT be applied without card analysis.");
  lines.push("");
  lines.push("| Theme | Suggested | Builds | Notes |");
  lines.push("|-------|-----------|--------|-------|");

  const lowByTheme = new Map<string, { archetypes: string[]; count: number; notes?: string }>();
  for (const p of byConfidence.low) {
    const key = p.theme;
    if (!lowByTheme.has(key)) {
      lowByTheme.set(key, { archetypes: p.inferred_archetypes, count: 0, notes: p.notes });
    }
    lowByTheme.get(key)!.count++;
  }
  Array.from(lowByTheme.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([theme, data]) => {
      lines.push(`| ${theme} | ${data.archetypes.join(", ") || "(none)"} | ${data.count} | ${data.notes || ""} |`);
    });

  lines.push("");
  lines.push("## Unmapped Themes");
  lines.push("");
  lines.push("These themes have no mapping and need manual review.");
  lines.push("");
  lines.push("| Theme | Builds |");
  lines.push("|-------|--------|");

  Array.from(unmapped.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([theme, count]) => {
      lines.push(`| ${theme} | ${count} |`);
    });

  return lines.join("\n");
}

main();
