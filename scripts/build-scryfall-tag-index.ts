/**
 * Build Scryfall Tag Index
 * 
 * Processes the oracle-tags.jsonl file and creates an index:
 * - oracle_id → list of relevant tags
 * 
 * Only includes tags that map to our archetypes/themes.
 */

import * as fs from "fs";
import * as readline from "readline";
import {
  archetypeTagMappings,
  themeTagMappings,
  tribalTagMappings,
  getAllMappedTags,
} from "./scryfall-tag-mappings";

const INPUT_FILE = "data/scryfall-tags/oracle-tags.jsonl";
const OUTPUT_FILE = "data/scryfall-tags/oracle-id-tags.json";

interface OracleTag {
  object: string;
  id: string;
  label: string;
  slug: string;
  type: string;
  taggings: { oracle_id?: string; weight: string }[];
}

interface TagIndex {
  [oracleId: string]: {
    tags: string[];
    archetypeSignals: { archetype: string; weight: number }[];
    themeSignals: { theme: string; weight: number }[];
  };
}

async function main() {
  console.log("Building Scryfall tag index...");
  
  const mappedTags = new Set(getAllMappedTags());
  console.log(`Mapped tags: ${mappedTags.size}`);

  // Read and process the JSONL file
  const fileStream = fs.createReadStream(INPUT_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const index: TagIndex = {};
  let tagsProcessed = 0;
  let taggingsAdded = 0;

  for await (const line of rl) {
    const tag: OracleTag = JSON.parse(line);
    
    // Skip cycle tags and non-oracle tags
    if (tag.slug.startsWith("cycle-") || tag.type !== "oracle") continue;
    
    // Check if this tag maps to any of our archetypes/themes
    const archetypeMapping = archetypeTagMappings[tag.slug];
    const themeMapping = themeTagMappings[tag.slug];
    const tribalMapping = tribalTagMappings[tag.slug];
    
    if (!archetypeMapping && !themeMapping && !tribalMapping) continue;
    
    tagsProcessed++;

    // Add each oracle_id to the index
    for (const tagging of tag.taggings) {
      if (!tagging.oracle_id) continue;
      
      if (!index[tagging.oracle_id]) {
        index[tagging.oracle_id] = {
          tags: [],
          archetypeSignals: [],
          themeSignals: [],
        };
      }

      const entry = index[tagging.oracle_id];
      
      // Add the raw tag
      if (!entry.tags.includes(tag.slug)) {
        entry.tags.push(tag.slug);
      }

      // Add archetype signals
      if (archetypeMapping) {
        for (const archetype of archetypeMapping.archetypes) {
          const existing = entry.archetypeSignals.find(s => s.archetype === archetype);
          if (existing) {
            existing.weight = Math.max(existing.weight, archetypeMapping.weight);
          } else {
            entry.archetypeSignals.push({ archetype, weight: archetypeMapping.weight });
          }
        }
      }

      // Add theme signals
      if (themeMapping) {
        for (const theme of themeMapping.themes) {
          const existing = entry.themeSignals.find(s => s.theme === theme);
          if (existing) {
            existing.weight = Math.max(existing.weight, themeMapping.weight);
          } else {
            entry.themeSignals.push({ theme, weight: themeMapping.weight });
          }
        }
      }

      // Add tribal/kindred theme
      if (tribalMapping) {
        const existing = entry.themeSignals.find(s => s.theme === tribalMapping);
        if (!existing) {
          entry.themeSignals.push({ theme: tribalMapping, weight: 3 });
        }
      }

      taggingsAdded++;
    }
  }

  console.log(`Tags processed: ${tagsProcessed}`);
  console.log(`Oracle IDs indexed: ${Object.keys(index).length}`);
  console.log(`Total taggings: ${taggingsAdded}`);

  // Write the index
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
  console.log(`Index written to: ${OUTPUT_FILE}`);

  // Stats
  const archetypeCounts: Record<string, number> = {};
  const themeCounts: Record<string, number> = {};

  for (const entry of Object.values(index)) {
    for (const signal of entry.archetypeSignals) {
      archetypeCounts[signal.archetype] = (archetypeCounts[signal.archetype] || 0) + 1;
    }
    for (const signal of entry.themeSignals) {
      themeCounts[signal.theme] = (themeCounts[signal.theme] || 0) + 1;
    }
  }

  console.log("\n=== Archetype Coverage ===");
  Object.entries(archetypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([arch, count]) => console.log(`  ${arch}: ${count} cards`));

  console.log("\n=== Theme Coverage ===");
  Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([theme, count]) => console.log(`  ${theme}: ${count} cards`));
}

main();
