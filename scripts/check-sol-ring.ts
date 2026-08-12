import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .from("ref_printings")
    .select("name, oracle_id")
    .eq("name", "Sol Ring")
    .limit(1)
    .single();
    
  console.log("Sol Ring oracle_id:", data?.oracle_id);
  
  const tagIndex = JSON.parse(fs.readFileSync("data/scryfall-tags/oracle-id-tags.json", "utf-8"));
  console.log("Sol Ring in index?", !!tagIndex[data?.oracle_id]);
  console.log("Sol Ring tags:", JSON.stringify(tagIndex[data?.oracle_id], null, 2));
}

main();
