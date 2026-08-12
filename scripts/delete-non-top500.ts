import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  console.log("");
  
  // Get top 500 commander IDs by deck count
  const { data: top500 } = await supabase
    .from("ref_commanders")
    .select("id")
    .eq("legal_commander", true)
    .order("edhrec_deck_count", { ascending: false, nullsFirst: false })
    .limit(500);
  
  const top500Ids = new Set(top500?.map(c => c.id) || []);
  console.log("Top 500 commander IDs loaded");
  
  // Get ALL builds with pagination
  const allBuilds: { id: string; commander_id: string }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ref_commander_builds")
      .select("id, commander_id")
      .range(offset, offset + 999);
    
    if (!data || data.length === 0) break;
    allBuilds.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }
  
  // Find builds to delete (not in top 500)
  const buildsToDelete = allBuilds.filter(b => !top500Ids.has(b.commander_id));
  const buildIdsToDelete = buildsToDelete.map(b => b.id);
  
  console.log(`Builds to keep: ${allBuilds.length - buildsToDelete.length}`);
  console.log(`Builds to delete: ${buildsToDelete.length}`);
  console.log(`Estimated cards to delete: ${buildsToDelete.length * 50}`);
  console.log("");
  
  if (DRY_RUN) {
    console.log("DRY RUN - no changes made");
    return;
  }
  
  // Delete cards first (foreign key constraint)
  console.log("Deleting cards...");
  let cardsDeleted = 0;
  
  // Delete in batches of 100 build IDs at a time
  for (let i = 0; i < buildIdsToDelete.length; i += 100) {
    const batch = buildIdsToDelete.slice(i, i + 100);
    
    const { error } = await supabase
      .from("ref_build_cards")
      .delete()
      .in("build_id", batch);
    
    if (error) {
      console.error(`Error deleting cards batch ${i}: ${error.message}`);
    } else {
      cardsDeleted += batch.length * 50; // estimate
    }
    
    if ((i + 100) % 500 === 0) {
      console.log(`  Processed ${i + 100}/${buildIdsToDelete.length} builds...`);
    }
  }
  
  console.log(`Cards deleted (estimated): ${cardsDeleted}`);
  
  // Delete builds
  console.log("Deleting builds...");
  let buildsDeleted = 0;
  
  for (let i = 0; i < buildIdsToDelete.length; i += 100) {
    const batch = buildIdsToDelete.slice(i, i + 100);
    
    const { error } = await supabase
      .from("ref_commander_builds")
      .delete()
      .in("id", batch);
    
    if (error) {
      console.error(`Error deleting builds batch ${i}: ${error.message}`);
    } else {
      buildsDeleted += batch.length;
    }
  }
  
  console.log(`Builds deleted: ${buildsDeleted}`);
  
  // Verify
  const { count: remainingBuilds } = await supabase
    .from("ref_commander_builds")
    .select("*", { count: "exact", head: true });
  
  const { count: remainingCards } = await supabase
    .from("ref_build_cards")
    .select("*", { count: "exact", head: true });
  
  console.log("");
  console.log("=== Final State ===");
  console.log(`Remaining builds: ${remainingBuilds}`);
  console.log(`Remaining cards: ${remainingCards}`);
}

main();
