import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get all builds
  const { data: builds } = await supabase
    .from("ref_commander_builds")
    .select("id");
  
  console.log(`Checking ${builds?.length} builds...\n`);
  
  const distribution = new Map<number, number>();
  let checked = 0;
  
  for (const build of builds || []) {
    const { count } = await supabase
      .from("ref_build_cards")
      .select("*", { count: "exact", head: true })
      .eq("build_id", build.id);
    
    const cardCount = count || 0;
    distribution.set(cardCount, (distribution.get(cardCount) || 0) + 1);
    
    checked++;
    if (checked % 500 === 0) {
      console.log(`  Checked ${checked}/${builds?.length} builds...`);
    }
  }
  
  // Sort and display
  const sorted = [...distribution.entries()].sort((a, b) => b[0] - a[0]);
  
  console.log("\nCard count distribution:\n");
  console.log("Cards | Builds");
  console.log("------|-------");
  for (const [cardCount, buildCount] of sorted.slice(0, 20)) {
    console.log(`${String(cardCount).padStart(5)} | ${buildCount}`);
  }
  if (sorted.length > 20) {
    console.log(`  ... and ${sorted.length - 20} more distinct counts`);
  }
  
  // Check for any over 50
  const over50 = sorted.filter(([count]) => count > 50);
  if (over50.length > 0) {
    console.log("\n⚠️  Builds with >50 cards:");
    for (const [count, builds] of over50) {
      console.log(`  ${count} cards: ${builds} builds`);
    }
  } else {
    console.log("\n✓ All builds have ≤50 cards");
  }
}

main();
