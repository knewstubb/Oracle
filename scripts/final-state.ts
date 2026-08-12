import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get ALL commanders sorted by deck count
  const allCommanders: { id: string; edhrec_deck_count: number }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ref_commanders")
      .select("id, edhrec_deck_count")
      .eq("legal_commander", true)
      .order("edhrec_deck_count", { ascending: false, nullsFirst: false })
      .range(offset, offset + 999);
    
    if (!data || data.length === 0) break;
    allCommanders.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }
  
  // Create bracket sets (1-250, 251-500, etc.)
  const brackets: { label: string; ids: Set<string> }[] = [];
  for (let i = 0; i < allCommanders.length; i += 250) {
    const end = Math.min(i + 250, allCommanders.length);
    const label = `${i + 1}-${end}`;
    const ids = new Set(allCommanders.slice(i, end).map(c => c.id));
    brackets.push({ label, ids });
  }
  
  // Get ALL builds with pagination
  const allBuilds: { id: string; commander_id: string }[] = [];
  offset = 0;
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
  
  // Count builds per bracket
  console.log("=== Builds by Commander Rank Bracket ===\n");
  console.log("Bracket     | Builds | Est. Cards");
  console.log("------------|--------|----------");
  
  let totalBuilds = 0;
  let totalCards = 0;
  
  for (const bracket of brackets) {
    const builds = allBuilds.filter(b => bracket.ids.has(b.commander_id)).length;
    const cards = builds * 50;
    totalBuilds += builds;
    totalCards += cards;
    
    if (builds > 0) {
      console.log(`${bracket.label.padEnd(11)} | ${String(builds).padStart(6)} | ${String(cards).padStart(10)}`);
    }
  }
  
  console.log("------------|--------|----------");
  console.log(`Total       | ${String(totalBuilds).padStart(6)} | ${String(totalCards).padStart(10)}`);
  
  // Get actual card count
  const { count: actualCards } = await supabase
    .from("ref_build_cards")
    .select("*", { count: "exact", head: true });
  
  console.log(`\nActual cards in DB: ${actualCards}`);
}

main();
