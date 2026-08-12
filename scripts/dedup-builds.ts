import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run");
const THRESHOLD = 0.65; // 65% Jaccard similarity

interface BuildPair {
  commander_name: string;
  build_a: { id: string; label: string; deck_count: number };
  build_b: { id: string; label: string; deck_count: number };
  jaccard: number;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  console.log(`Threshold: ${THRESHOLD * 100}% Jaccard similarity`);
  console.log("");

  // Load similarity data
  const jsonPath = "research/edhrec-sync/build-similarity.json";
  if (!fs.existsSync(jsonPath)) {
    console.error("Run analyze-build-similarity.ts first");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const mergeCandidates: BuildPair[] = data.merge_candidates;

  console.log(`Merge candidates loaded: ${mergeCandidates.length}`);

  // Track which builds to delete (keep the one with more decks)
  const buildsToDelete = new Set<string>();
  const mergeLog: string[] = [];

  for (const pair of mergeCandidates) {
    // Skip if either build already marked for deletion
    if (buildsToDelete.has(pair.build_a.id) || buildsToDelete.has(pair.build_b.id)) {
      continue;
    }

    // Keep the build with more decks
    const [keep, remove] = pair.build_a.deck_count >= pair.build_b.deck_count
      ? [pair.build_a, pair.build_b]
      : [pair.build_b, pair.build_a];

    buildsToDelete.add(remove.id);
    mergeLog.push(
      `${pair.commander_name}: Keep "${keep.label}" (${keep.deck_count}), delete "${remove.label}" (${remove.deck_count}) - ${(pair.jaccard * 100).toFixed(0)}% similar`
    );
  }

  console.log(`Builds to delete: ${buildsToDelete.size}`);
  console.log("");

  // Show first 20 merges
  console.log("Sample merges:");
  mergeLog.slice(0, 20).forEach(line => console.log(`  ${line}`));
  if (mergeLog.length > 20) {
    console.log(`  ... and ${mergeLog.length - 20} more`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("DRY RUN - no changes made");
    
    // Write full merge log
    fs.writeFileSync(
      "research/edhrec-sync/dedup-plan.txt",
      mergeLog.join("\n")
    );
    console.log("Full plan written to research/edhrec-sync/dedup-plan.txt");
    return;
  }

  // Delete cards first
  console.log("Deleting cards...");
  const buildIds = Array.from(buildsToDelete);
  let cardsDeleted = 0;

  for (let i = 0; i < buildIds.length; i += 100) {
    const batch = buildIds.slice(i, i + 100);
    const { error } = await supabase
      .from("ref_build_cards")
      .delete()
      .in("build_id", batch);

    if (error) {
      console.error(`Error deleting cards: ${error.message}`);
    }
    cardsDeleted += batch.length * 50;

    if ((i + 100) % 200 === 0) {
      console.log(`  Processed ${Math.min(i + 100, buildIds.length)}/${buildIds.length}...`);
    }
  }

  // Delete builds
  console.log("Deleting builds...");
  for (let i = 0; i < buildIds.length; i += 100) {
    const batch = buildIds.slice(i, i + 100);
    const { error } = await supabase
      .from("ref_commander_builds")
      .delete()
      .in("id", batch);

    if (error) {
      console.error(`Error deleting builds: ${error.message}`);
    }
  }

  // Verify
  const { count: remainingBuilds } = await supabase
    .from("ref_commander_builds")
    .select("*", { count: "exact", head: true });

  const { count: remainingCards } = await supabase
    .from("ref_build_cards")
    .select("*", { count: "exact", head: true });

  console.log("");
  console.log("=== Final State ===");
  console.log(`Builds deleted: ${buildsToDelete.size}`);
  console.log(`Cards deleted (est): ${cardsDeleted}`);
  console.log(`Remaining builds: ${remainingBuilds}`);
  console.log(`Remaining cards: ${remainingCards}`);

  // Write merge log
  fs.writeFileSync(
    "research/edhrec-sync/dedup-completed.txt",
    mergeLog.join("\n")
  );
}

main();
