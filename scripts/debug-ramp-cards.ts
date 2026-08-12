import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TagIndex {
  [oracleId: string]: {
    tags: string[];
    archetypeSignals: { archetype: string; weight: number }[];
    themeSignals: { theme: string; weight: number }[];
  };
}

async function main() {
  const tagIndex: TagIndex = JSON.parse(
    fs.readFileSync("data/scryfall-tags/oracle-id-tags.json", "utf-8")
  );
  
  // Find an aristocrats build
  const { data: build } = await supabase
    .from("ref_commander_builds")
    .select("id, archetype, theme")
    .eq("archetype", "aristocrats")
    .limit(1)
    .single();
    
  console.log("Build:", build?.id, build?.archetype);
  
  // Get cards in this build
  const { data: cards } = await supabase
    .from("ref_build_cards")
    .select("card_name")
    .eq("build_id", build!.id);
    
  console.log("Cards:", cards?.length);
  
  // Get oracle IDs
  const cardNames = cards!.map(c => c.card_name);
  const { data: printings } = await supabase
    .from("ref_printings")
    .select("name, oracle_id")
    .in("name", cardNames);
    
  const oracleIdMap = new Map<string, string>();
  for (const p of printings || []) {
    if (p.oracle_id) oracleIdMap.set(p.name, p.oracle_id);
  }
  
  // Find ramp-tagged cards
  console.log("\n=== Cards triggering RAMP signal ===");
  for (const cardName of cardNames) {
    const oracleId = oracleIdMap.get(cardName);
    if (!oracleId) continue;
    
    const entry = tagIndex[oracleId];
    if (!entry) continue;
    
    const rampSignal = entry.archetypeSignals.find(s => s.archetype === "ramp");
    if (rampSignal) {
      console.log(`  ${cardName} (weight: ${rampSignal.weight}, tags: ${entry.tags.join(", ")})`);
    }
  }
}

main();
