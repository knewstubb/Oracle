/**
 * Generate insight coverage report for top 500 commanders
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import Database from 'better-sqlite3'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  // Get top 500 commanders by edhrec_rank
  const { data: commanders } = await supabase
    .from('ref_commanders')
    .select('id, display_name, edhrec_rank')
    .not('edhrec_rank', 'is', null)
    .order('edhrec_rank', { ascending: true })
    .limit(500)

  // Get insight counts per commander
  const { data: insights } = await supabase
    .from('ref_commander_insights')
    .select('commander_id, build_variant, archetype, taxonomy_tags')

  // Get transcript counts from raw_content sqlite
  const db = new Database('../research/commander-content/content-raw.sqlite', { readonly: true })
  const transcripts = db.prepare('SELECT card_name, COUNT(*) as cnt FROM raw_content WHERE full_content IS NOT NULL GROUP BY card_name').all() as { card_name: string, cnt: number }[]
  const transcriptMap = new Map(transcripts.map(t => [t.card_name, t.cnt]))
  db.close()

  // Build insight map
  const insightMap = new Map<string, { count: number, hasNew: boolean }>()
  for (const i of insights || []) {
    const curr = insightMap.get(i.commander_id) || { count: 0, hasNew: false }
    curr.count++
    if (i.build_variant || i.archetype || (i.taxonomy_tags && i.taxonomy_tags.length > 0)) {
      curr.hasNew = true
    }
    insightMap.set(i.commander_id, curr)
  }

  // Build results
  const results = commanders!.map((c, idx) => {
    const ins = insightMap.get(c.id) || { count: 0, hasNew: false }
    const trans = transcriptMap.get(c.display_name) || 0
    let status = '❌'
    if (ins.count > 0) {
      if (ins.hasNew && ins.count >= 6) status = '🟢'
      else if (ins.hasNew) status = '🟡'
      else status = '🔴'
    } else if (trans > 0) {
      status = '⏳'
    }
    return { rank: idx + 1, name: c.display_name, trans, insights: ins.count, status }
  })

  // Stats
  const stats = { complete: 0, partial: 0, old: 0, ready: 0, none: 0 }
  results.forEach(r => {
    if (r.status === '🟢') stats.complete++
    else if (r.status === '🟡') stats.partial++
    else if (r.status === '🔴') stats.old++
    else if (r.status === '⏳') stats.ready++
    else stats.none++
  })

  // Find old format commanders needing reprocessing
  const oldFormat = results.filter(r => r.status === '🔴')

  // Generate markdown
  const date = new Date().toISOString().split('T')[0]
  let md = `# Commander Insight Coverage Report

**Generated:** ${date}

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 | **Complete** — New format insights (6+ with archetype + taxonomy) |
| 🟡 | **Partial** — Some new format, needs more insights |
| 🔴 | **Old Format** — Needs full reprocessing |
| ⏳ | **Ready** — Has transcripts, no insights yet |
| ❌ | **None** — No transcripts available |

## Summary (Top 500)

| Status | Count |
|--------|-------|
| 🟢 Complete | ${stats.complete} |
| 🟡 Partial | ${stats.partial} |
| 🔴 Old Format | ${stats.old} |
| ⏳ Ready | ${stats.ready} |
| ❌ None | ${stats.none} |

**Coverage:** ${((stats.complete / 500) * 100).toFixed(1)}% complete

`

  if (oldFormat.length > 0) {
    md += `## Reprocessing Queue (Old Format)

Commanders with old-format insights that need reprocessing:

| # | Commander | Transcripts | Current Insights | Status |
|---|-----------|-------------|------------------|--------|
`
    oldFormat.forEach(r => {
      md += `| ${r.rank} | ${r.name} | ${r.trans} | ${r.insights} | ${r.status} |\n`
    })
    md += '\n'
  }

  md += `## All Commanders by Popularity (Top 500)

| # | Commander | Transcripts | Insights | Status |
|---|-----------|-------------|----------|--------|
`
  results.forEach(r => {
    md += `| ${r.rank} | ${r.name} | ${r.trans} | ${r.insights} | ${r.status} |\n`
  })

  fs.writeFileSync('../research/commander-content/insight-coverage-report.md', md)
  console.log(`Report generated: ${stats.complete} complete, ${stats.partial} partial, ${stats.old} old, ${stats.ready} ready, ${stats.none} none`)
}

main().catch(console.error)
