import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .from("ref_commander_builds")
    .select(
      "archetype, theme, edhrec_theme_slug, primary_archetype, secondary_archetypes, primary_theme, secondary_themes"
    )
    .limit(20);

  console.log("Sample builds:");
  for (const b of data || []) {
    console.log(JSON.stringify(b));
  }

  // Count populated fields
  const { count: withArchetype } = await supabase
    .from("ref_commander_builds")
    .select("*", { count: "exact", head: true })
    .not("archetype", "is", null);

  const { count: withTheme } = await supabase
    .from("ref_commander_builds")
    .select("*", { count: "exact", head: true })
    .not("theme", "is", null);

  const { count: withPrimaryArchetype } = await supabase
    .from("ref_commander_builds")
    .select("*", { count: "exact", head: true })
    .not("primary_archetype", "is", null);

  const { count: total } = await supabase
    .from("ref_commander_builds")
    .select("*", { count: "exact", head: true });

  console.log("");
  console.log("=== Field Coverage ===");
  console.log(`Total builds: ${total}`);
  console.log(`With archetype: ${withArchetype}`);
  console.log(`With theme: ${withTheme}`);
  console.log(`With primary_archetype: ${withPrimaryArchetype}`);

  // Get distinct archetype values
  const allBuilds: { archetype: string | null; theme: string | null }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ref_commander_builds")
      .select("archetype, theme")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allBuilds.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }

  const archetypes = [...new Set(allBuilds.map((b) => b.archetype).filter(Boolean))];
  const themes = [...new Set(allBuilds.map((b) => b.theme).filter(Boolean))];

  console.log("");
  console.log(`Distinct archetypes: ${archetypes.length}`);
  archetypes.sort().forEach((a) => console.log(`  ${a}`));

  console.log("");
  console.log(`Distinct themes: ${themes.length}`);
  themes.sort().slice(0, 30).forEach((t) => console.log(`  ${t}`));
  if (themes.length > 30) console.log(`  ... and ${themes.length - 30} more`);
}

main();
