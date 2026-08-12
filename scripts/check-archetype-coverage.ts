import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get one commander to see actual columns
  const { data: commander } = await supabase
    .from("ref_commanders")
    .select("*")
    .limit(1)
    .single();

  console.log("ref_commanders columns:");
  console.log(Object.keys(commander || {}));

  // Get one build to see columns
  const { data: build } = await supabase
    .from("ref_commander_builds")
    .select("*")
    .limit(1)
    .single();

  console.log("");
  console.log("ref_commander_builds columns:");
  console.log(Object.keys(build || {}));

  // Get distinct tags from builds
  const { data: builds } = await supabase
    .from("ref_commander_builds")
    .select("tag_name")
    .limit(1000);

  const uniqueTags = [...new Set(builds?.map((b) => b.tag_name) || [])];
  console.log("");
  console.log("Unique tags in builds:", uniqueTags.length);
  console.log(uniqueTags.slice(0, 40).join(", "));

  // Count builds per tag
  const tagCounts: Record<string, number> = {};
  for (const b of builds || []) {
    tagCounts[b.tag_name] = (tagCounts[b.tag_name] || 0) + 1;
  }

  console.log("");
  console.log("Tag distribution (sample):");
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 20).forEach(([tag, count]) => {
    console.log(`  ${tag}: ${count}`);
  });
}

main();
