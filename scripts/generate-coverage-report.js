/**
 * Generate insight coverage report with traffic light status
 * 
 * Status legend:
 * 🟢 Green = New format (has archetype + taxonomy_tags on all insights)
 * 🟡 Amber = Partial (some insights have new format, needs reprocessing)
 * 🔴 Red = Old format (no archetype/taxonomy, needs full reprocessing)
 * ⏳ Ready = Has transcripts but no insights yet
 * ❌ None = No transcripts available
 */

const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  // Get all commanders ordered by deck count
  const { data: commanders } = await supabase
    .from('ref_commanders')
    .select('id, display_name, edhrec_rank')
    .eq('legal_commander', true)
    .order('edhrec_rank', { ascending: true, nullsFirst: false })
    .limit(500);

  // Get insight status for all commanders
  const { data: insights } = await supabase
    .from('ref_commander_insights')
    .select('commander_id, archetype, taxonomy_tags');
    
  // Group insights by commander
  const insightsByCommander = {};
  insights.forEach(i => {
    if (!insightsByCommander[i.commander_id]) {
      insightsByCommander[i.commander_id] = { total: 0, withArchetype: 0, withTaxonomy: 0 };
    }
    insightsByCommander[i.commander_id].total++;
    if (i.archetype) insightsByCommander[i.commander_id].withArchetype++;
    if (i.taxonomy_tags && i.taxonomy_tags.length > 0) insightsByCommander[i.commander_id].withTaxonomy++;
  });

  // Get transcript counts from SQLite
  const dbPath = path.join(__dirname, '../../research/commander-content/content-raw.sqlite');
  const db = sqlite3(dbPath);
  const transcriptCounts = {};
  
  const rows = db.prepare(`
    SELECT card_name, COUNT(*) as count 
    FROM raw_content 
    WHERE full_content IS NOT NULL 
    GROUP BY card_name
  `).all();
  
  rows.forEach(r => {
    transcriptCounts[r.card_name] = r.count;
  });
  db.close();

  // Build report
  const lines = [];
  lines.push('# Commander Insight Coverage Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString().split('T')[0]}`);
  lines.push('');
  lines.push('## Status Legend');
  lines.push('');
  lines.push('| Symbol | Meaning |');
  lines.push('|--------|---------|');
  lines.push('| 🟢 | **Complete** — New format insights (archetype + taxonomy) |');
  lines.push('| 🟡 | **Partial** — Some new format, needs reprocessing |');
  lines.push('| 🔴 | **Old Format** — Needs full reprocessing |');
  lines.push('| ⏳ | **Ready** — Has transcripts, no insights yet |');
  lines.push('| ❌ | **None** — No transcripts available |');
  lines.push('');
  
  // Summary counts
  let greenCount = 0, amberCount = 0, redCount = 0, readyCount = 0, noneCount = 0;
  
  commanders.forEach(c => {
    const stats = insightsByCommander[c.id];
    const transcripts = transcriptCounts[c.display_name] || 0;
    
    if (stats) {
      if (stats.withTaxonomy === stats.total && stats.total >= 6) {
        greenCount++;
      } else if (stats.withArchetype > 0 || stats.withTaxonomy > 0) {
        amberCount++;
      } else {
        redCount++;
      }
    } else if (transcripts > 0) {
      readyCount++;
    } else {
      noneCount++;
    }
  });
  
  lines.push('## Summary');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  lines.push(`| 🟢 Complete | ${greenCount} |`);
  lines.push(`| 🟡 Partial | ${amberCount} |`);
  lines.push(`| 🔴 Old Format | ${redCount} |`);
  lines.push(`| ⏳ Ready | ${readyCount} |`);
  lines.push(`| ❌ None | ${noneCount} |`);
  lines.push('');
  lines.push('## Reprocessing Queue (Priority Order)');
  lines.push('');
  lines.push('Commanders with old-format insights that need reprocessing:');
  lines.push('');
  lines.push('| # | Commander | Transcripts | Current Insights | Status |');
  lines.push('|---|-----------|-------------|------------------|--------|');
  
  let reprocessQueue = [];
  commanders.forEach((c, idx) => {
    const stats = insightsByCommander[c.id];
    const transcripts = transcriptCounts[c.display_name] || 0;
    
    if (stats && stats.withTaxonomy < stats.total) {
      const status = stats.withArchetype > 0 ? '🟡' : '🔴';
      reprocessQueue.push({
        rank: idx + 1,
        name: c.display_name,
        transcripts,
        insights: stats.total,
        status
      });
    }
  });
  
  reprocessQueue.forEach(r => {
    lines.push(`| ${r.rank} | ${r.name} | ${r.transcripts} | ${r.insights} | ${r.status} |`);
  });
  
  lines.push('');
  lines.push('## All Commanders by Popularity');
  lines.push('');
  lines.push('| # | Commander | Transcripts | Insights | Status |');
  lines.push('|---|-----------|-------------|----------|--------|');
  
  commanders.slice(0, 200).forEach((c, idx) => {
    const stats = insightsByCommander[c.id];
    const transcripts = transcriptCounts[c.display_name] || 0;
    
    let status, insightCount;
    if (stats) {
      insightCount = stats.total;
      if (stats.withTaxonomy === stats.total && stats.total >= 6) {
        status = '🟢';
      } else if (stats.withArchetype > 0 || stats.withTaxonomy > 0) {
        status = '🟡';
      } else {
        status = '🔴';
      }
    } else if (transcripts > 0) {
      status = '⏳';
      insightCount = 0;
    } else {
      status = '❌';
      insightCount = 0;
    }
    
    lines.push(`| ${idx + 1} | ${c.display_name} | ${transcripts} | ${insightCount} | ${status} |`);
  });
  
  // Write report
  const reportPath = path.join(__dirname, '../../research/commander-content/insight-coverage-report.md');
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`Report written to ${reportPath}`);
  console.log(`\nSummary: ${greenCount} 🟢, ${amberCount} 🟡, ${redCount} 🔴, ${readyCount} ⏳, ${noneCount} ❌`);
  console.log(`Reprocess queue: ${reprocessQueue.length} commanders`);
}

main().catch(console.error);
