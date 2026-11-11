/**
 * Deck health S2 Developer task: sample EDHREC average decks and estimates for about 15 commanders.
 * Read-only. One request per file per commander, at least 1 s apart, existing user agent.
 * Reads card text from ref_cards (read-only). Writes nothing to the database.
 *
 * Usage: npx tsx scripts/sample-edhrec-typical-numbers.ts [--save-dir /tmp/edhrec-sample]
 * Saved raw JSON (optional) is for choosing test fixtures only.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { commanderSlug, fetchEdhrecJson, parseAverageDeck, parseCommanderPage } from '../src/lib/edhrec-client'
import { deriveEstimate, deriveFromAverageDeck, type RefLookup } from '../src/lib/commander-targets'
import { fetchRefTextByName } from '../src/lib/ref-card-text'

config({ path: resolve(__dirname, '../.env.local') })

const SAMPLE: Array<{ tier: string; names: string[] }> = [
  { tier: 'popular', names: ["Atraxa, Praetors' Voice"] },
  { tier: 'popular', names: ['The Ur-Dragon'] },
  { tier: 'popular', names: ['Edgar Markov'] },
  { tier: 'popular', names: ['Krenko, Mob Boss'] },
  { tier: 'popular', names: ["Yuriko, the Tiger's Shadow"] },
  { tier: 'mid', names: ['Mendicant Core, Guidelight'] },
  { tier: 'mid', names: ['Rocco, Cabaretti Caterer'] },
  { tier: 'mid', names: ['Hearthhull, the Worldseed'] },
  { tier: 'mid', names: ['Zhulodok, Void Gorger'] },
  { tier: 'mid', names: ['Baylen, the Haymaker'] },
  { tier: 'mid (DFC)', names: ['Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel'] },
  { tier: 'partner', names: ['Tymna the Weaver', 'Thrasios, Triton Hero'] },
  { tier: 'obscure', names: ['Jedit Ojanen'] },
  { tier: 'obscure', names: ['Tobias Andrion'] },
  { tier: 'obscure', names: ['Sivitri Scarzam'] },
  { tier: 'obscure', names: ['Barktooth Warbeard'] },
  { tier: 'obscure', names: ['Lady Orca'] },
  { tier: 'obscure (<50 decks)', names: ['Gosta Dirk'] },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const GAP_MS = 1000

async function main() {
  const saveIdx = process.argv.indexOf('--save-dir')
  const saveDir = saveIdx > 0 ? process.argv[saveIdx + 1] : null
  if (saveDir) mkdirSync(saveDir, { recursive: true })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const rows: string[] = []
  rows.push(
    '| Commander | Tier | Avg HTTP | Total (incl. cmdr) | Lands in list (basics) | num_decks | Missing text (non-land) | A: ramp/draw/removal/wipes/lands | A5 | Page HTTP | B: ramp/draw/removal/wipes/lands | B classified / coverage / scale | B status |',
  )
  rows.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')

  const onlyIdx = process.argv.indexOf('--only')
  const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null

  for (const s of SAMPLE) {
    const slug = commanderSlug(s.names)!
    if (only && slug !== only) continue
    await sleep(GAP_MS)
    let avgCell = ''
    let total = '', lands = '', decks = '', missing = '', a = '', a5 = ''
    let avgStatus = ''
    try {
      const r = await fetchEdhrecJson(`average-decks/${slug}.json`)
      avgStatus = r.status === 'ok' ? '200' : '404/403'
      if (r.status === 'ok') {
        if (saveDir) writeFileSync(join(saveDir, `avg-${slug}.json`), JSON.stringify(r.data))
        const deck = parseAverageDeck(r.data)
        const { map } = await fetchRefTextByName(supabase, deck.cards.map((c) => c.name))
        const ref: RefLookup = (n) => {
          const x = map.get(n)
          return x ? { typeLine: x.type_line, oracleText: x.oracle_text } : undefined
        }
        const d = deriveFromAverageDeck(deck, ref)
        const basics = deck.cards.filter((c) => /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered .*)$/.test(c.name)).reduce((n, c) => n + c.quantity, 0)
        total = String(d.total)
        lands = `${d.landCount} (${basics})`
        decks = String(d.deckSample)
        missing = `${d.missing}/${d.nonLandCount} (${((d.missing / Math.max(1, d.nonLandCount)) * 100).toFixed(0)}%)`
        a = `${d.roles.map((x) => x.typical).join('/')}/${d.landCount}`
        a5 = d.qualifies ? 'yes' : `no: ${d.reasons.join('; ')}`
        const missingNames = deck.cards.filter((c) => !map.has(c.name)).map((c) => c.name)
        if (missingNames.length) console.error(`[${slug}] avg deck names with no ref row: ${missingNames.join(', ')}`)
      }
    } catch (err) {
      avgStatus = `error: ${err instanceof Error ? err.message : err}`
    }
    avgCell = avgStatus

    await sleep(GAP_MS)
    let pageStatus = '', b = '', bInfo = '', bStatus = ''
    try {
      const r = await fetchEdhrecJson(`commanders/${slug}.json`)
      pageStatus = r.status === 'ok' ? '200' : '404/403'
      if (r.status === 'ok') {
        if (saveDir) writeFileSync(join(saveDir, `cmd-${slug}.json`), JSON.stringify(r.data))
        const page = parseCommanderPage(r.data)
        const { map } = await fetchRefTextByName(supabase, page.cards.map((c) => c.name))
        const ref: RefLookup = (n) => {
          const x = map.get(n)
          return x ? { typeLine: x.type_line, oracleText: x.oracle_text } : undefined
        }
        const d = deriveEstimate(page, ref)
        b = `${d.roles.map((x) => x.typical).join('/')}/${d.landsAvg ?? '?'}`
        bInfo = `${d.classified} (+${d.missing} no text) / ${d.coverage?.toFixed(2) ?? '?'} / ${d.scale?.toFixed(2) ?? '?'}`
        bStatus = d.status === 'ok' ? 'ok' : `thin: ${d.reasons.join('; ')}`
        if (!decks) decks = `(${page.numDecks})`
      }
    } catch (err) {
      pageStatus = `error: ${err instanceof Error ? err.message : err}`
    }

    rows.push(`| ${s.names.join(' + ')} (\`${slug}\`) | ${s.tier} | ${avgCell} | ${total} | ${lands} | ${decks} | ${missing} | ${a} | ${a5} | ${pageStatus} | ${b} | ${bInfo} | ${bStatus} |`)
    console.error(`done ${slug}`)
  }

  console.log(rows.join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
