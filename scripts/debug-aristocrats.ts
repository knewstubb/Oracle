import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Find an aristocrats build
  const { data: build } = await supabase
    .from("ref_commander_builds")
    .select("id, commander_id, archetype")
    .eq("archetype", "aristocrats")
    .limit(1)
    .single();

  console.log("Build:", build);

  // Get commander name
  const { data: commander } = await supabase
    .from("ref_commanders")
    .select("display_name")
    .eq("id", build?.commander_id)
    .single();

  console.log("Commander:", commander?.display_name);

  // Get its cards
  const { data: cards } = await supabase
    .from("ref_build_cards")
    .select("card_name")
    .eq("build_id", build?.id);

  const cardNames = cards?.map((c) => c.card_name) || [];

  // Get oracle text for these cards
  const { data: cardInfo } = await supabase
    .from("ref_cards")
    .select("name, oracle_text")
    .in("name", cardNames);

  // Debug: show raw oracle text for Zulaport Cutthroat
  const zulaport = cardInfo?.find(c => c.name === "Zulaport Cutthroat");
  console.log("\n=== Zulaport Cutthroat ===");
  console.log("Has oracle_text:", !!zulaport?.oracle_text);
  console.log("Contains dies:", zulaport?.oracle_text?.toLowerCase().includes("dies"));
  console.log("Text:", zulaport?.oracle_text);

  // Check specific patterns
  const testPatterns = ["dies,", "dies.", "creature dies", "control dies"];
  for (const p of testPatterns) {
    const match = zulaport?.oracle_text?.toLowerCase().includes(p);
    console.log("Pattern '" + p + "':", match);
  }

  // Count all cards with "dies" in oracle text
  let diesCount = 0;
  const diesCards: string[] = [];
  for (const card of cardInfo || []) {
    if (card.oracle_text?.toLowerCase().includes("dies")) {
      diesCount++;
      diesCards.push(card.name);
    }
  }
  console.log("\nCards with 'dies':", diesCount);
  console.log(diesCards.join(", "));
}

main();
