import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseAverageDeck, parseCommanderPage, EdhrecUnavailableError, type EdhrecFetch, type EdhrecAverageDeck, type EdhrecCommanderPage } from './edhrec-client'
import { getCommanderTargets, resetTargetsProcessState, TARGETS_TABLE, type EdhrecSource } from './commander-targets-server'
import { GUIDE_UNREACHABLE_LABEL, type TargetsRow } from './commander-targets'
import { CLASSIFIER_VERSION } from './card-roles'

// Saved EDHREC JSON and saved card text only. No network, no live database.
const FIX = join(__dirname, '__fixtures__', 'edhrec')
const load = (f: string) => JSON.parse(readFileSync(join(FIX, f), 'utf8'))
const refJson = load('ref-card-text.json') as Record<string, { type_line: string | null; oracle_text: string | null } | null>
const refRows = Object.entries(refJson)
  .filter(([, v]) => v !== null)
  .map(([name, v]) => ({ name, type_line: v!.type_line, oracle_text: v!.oracle_text }))

const SLUG = 'mendicant-core-guidelight'
const NAMES = ['Mendicant Core, Guidelight']
const DAY = 86_400_000
const T0 = new Date('2026-11-11T12:00:00Z')

type Row = Record<string, unknown>

interface FakeDbOptions {
  /** The cache table does not exist yet (migration not applied). */
  noTargetsTable?: boolean
  targets?: TargetsRow[]
  builds?: Row[]
}

function fakeDb(opts: FakeDbOptions = {}) {
  const tables: Record<string, Row[]> = {
    ref_cards: refRows,
    [TARGETS_TABLE]: [...((opts.targets ?? []) as unknown as Row[])],
    ref_commanders: [{ id: 'c1', display_name: 'Mendicant Core, Guidelight' }],
    ref_commander_builds: opts.builds ?? [],
  }
  const writes: Row[] = []
  const missing = { data: null, error: { message: `Could not find the table 'public.${TARGETS_TABLE}' in the schema cache` } }
  const client = {
    from(table: string) {
      let data = [...(tables[table] ?? [])]
      const absent = opts.noTargetsTable && table === TARGETS_TABLE
      const result = () => (absent ? missing : { data, error: null })
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { data = data.filter((r) => r[c] === v); return q },
        in: (c: string, vs: unknown[]) => { data = data.filter((r) => vs.includes(r[c])); return q },
        ilike: (c: string, p: string) => { const pre = p.replace(/ \/\/ %$/, '').replace(/\\/g, '').toLowerCase(); data = data.filter((r) => String(r[c]).toLowerCase().startsWith(`${pre} // `)); return q },
        limit: (n: number) => { data = data.slice(0, n); return Promise.resolve(result()) },
        maybeSingle: () => Promise.resolve(absent ? missing : { data: data[0] ?? null, error: null }),
        upsert: (row: Row) => {
          if (absent) return Promise.resolve(missing)
          writes.push(row)
          tables[table] = [...tables[table].filter((r) => r.edhrec_slug !== row.edhrec_slug), row]
          return Promise.resolve({ data: null, error: null })
        },
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      }
      return q
    },
  }
  return { client, writes, saved: () => tables[TARGETS_TABLE] as unknown as TargetsRow[] }
}

type Answer<T> = EdhrecFetch<T> | 'down'
function fakeEdhrec(avg: Answer<EdhrecAverageDeck>, page: Answer<EdhrecCommanderPage>) {
  const calls = { avg: 0, page: 0 }
  const src: EdhrecSource = {
    getAverageDeck: vi.fn(async () => { calls.avg++; if (avg === 'down') throw new EdhrecUnavailableError('EDHREC unreachable'); return avg }),
    getCommanderPage: vi.fn(async () => { calls.page++; if (page === 'down') throw new EdhrecUnavailableError('EDHREC unreachable'); return page }),
  }
  return { src, calls }
}

const AVG_OK: Answer<EdhrecAverageDeck> = { status: 'ok', data: parseAverageDeck(load('average-deck-mendicant-core-guidelight.json')) }
const PAGE_OK: Answer<EdhrecCommanderPage> = { status: 'ok', data: parseCommanderPage(load('commander-mendicant-core-guidelight.json')) }
const NF = { status: 'not_found' } as const
const smallAvg = (): Answer<EdhrecAverageDeck> => ({ status: 'ok', data: { ...parseAverageDeck(load('average-deck-mendicant-core-guidelight.json')), numDecks: 30 } })
const smallPage = (): Answer<EdhrecCommanderPage> => ({ status: 'ok', data: { ...parseCommanderPage(load('commander-mendicant-core-guidelight.json')), numDecks: 30 } })

const run = (db: ReturnType<typeof fakeDb>, edhrec: EdhrecSource, now = T0, recheck = false) =>
  getCommanderTargets({ supabase: db.client, edhrec, now: () => now, log: () => {} }, NAMES, { recheck })

beforeEach(() => resetTargetsProcessState())

describe('source order: average deck, then estimate, then general guide', () => {
  it('(A) usable average deck: used and saved; the estimate is not fetched', async () => {
    const db = fakeDb()
    const e = fakeEdhrec(AVG_OK, PAGE_OK)
    const t = await run(db, e.src)
    expect(t.source).toBe('edhrec_average')
    expect(t.sourceLabel).toBe('EDHREC average deck, 17,659 decks')
    expect(t.landsTypical).toBe(34)
    expect(e.calls).toEqual({ avg: 1, page: 0 })
    expect(db.writes).toHaveLength(1)
    expect(db.saved()[0]).toMatchObject({ edhrec_slug: SLUG, status: 'ok', source: 'edhrec_average', lands_avg: 34, classifier_version: CLASSIFIER_VERSION })
  })

  it('(B) no average deck: the estimate is used and saved', async () => {
    const db = fakeDb()
    const t = await run(db, fakeEdhrec(NF, PAGE_OK).src)
    expect(t.source).toBe('edhrec_estimate')
    expect(t.sourceLabel).toBe('EDHREC estimate, 17,659 decks')
    expect(db.saved()[0]).toMatchObject({ status: 'ok', source: 'edhrec_estimate' })
  })

  it('(B) average deck fails A5: falls through to the estimate', async () => {
    const e = fakeEdhrec(smallAvg(), PAGE_OK)
    const t = await run(fakeDb(), e.src)
    expect(t.source).toBe('edhrec_estimate')
    expect(e.calls).toEqual({ avg: 1, page: 1 })
  })

  it('both thin: general guide, saved as thin with no role numbers, type counts kept', async () => {
    const db = fakeDb()
    const t = await run(db, fakeEdhrec(smallAvg(), smallPage()).src)
    expect(t.source).toBe('general_guide')
    expect(t.sourceLabel).toBe('General guide')
    expect(t.typeCounts.length).toBeGreaterThan(0)
    expect(db.saved()[0]).toMatchObject({ status: 'thin', roles: [] })
  })

  it('neither file exists: general guide, saved as not_found; stored builds give the card types', async () => {
    const db = fakeDb({ builds: [{ commander_id: 'c1', avg_lands: 36, avg_creatures: 28 }, { commander_id: 'c1', avg_lands: 38, avg_creatures: 30 }] })
    const t = await run(db, fakeEdhrec(NF, NF).src)
    expect(t.source).toBe('general_guide')
    expect(t.status).toBe('not_found')
    expect(t.typeCountsLabel).toBe('Averages from 2 stored builds')
    expect(t.typeCounts).toEqual(expect.arrayContaining([{ type: 'land', average: 37 }, { type: 'creature', average: 29 }]))
    expect(db.saved()[0]).toMatchObject({ status: 'not_found' })
  })

  it('no commander: general guide, no EDHREC call', async () => {
    const e = fakeEdhrec(AVG_OK, PAGE_OK)
    const t = await getCommanderTargets({ supabase: fakeDb().client, edhrec: e.src, now: () => T0 }, [])
    expect(t.sourceLabel).toBe('General guide')
    expect(e.calls).toEqual({ avg: 0, page: 0 })
  })
})

describe('cache and refresh rules', () => {
  it('a fresh saved row is used without calling EDHREC', async () => {
    const db = fakeDb()
    await run(db, fakeEdhrec(AVG_OK, PAGE_OK).src)
    const e2 = fakeEdhrec('down', 'down')
    const t = await run(db, e2.src, new Date(T0.getTime() + 13 * DAY))
    expect(t.sourceLabel).toBe('EDHREC average deck, 17,659 decks')
    expect(e2.calls).toEqual({ avg: 0, page: 0 })
  })

  it('an ok row expires after 14 days and is refreshed', async () => {
    const db = fakeDb()
    await run(db, fakeEdhrec(AVG_OK, PAGE_OK).src)
    const e2 = fakeEdhrec(AVG_OK, PAGE_OK)
    await run(db, e2.src, new Date(T0.getTime() + 15 * DAY))
    expect(e2.calls.avg).toBe(1)
    expect(db.writes).toHaveLength(2)
  })

  it('a thin row expires after 7 days', async () => {
    const db = fakeDb()
    await run(db, fakeEdhrec(NF, NF).src)
    const e6 = fakeEdhrec(AVG_OK, PAGE_OK)
    await run(db, e6.src, new Date(T0.getTime() + 6 * DAY))
    expect(e6.calls.avg).toBe(0)
    const e8 = fakeEdhrec(AVG_OK, PAGE_OK)
    const t = await run(db, e8.src, new Date(T0.getTime() + 8 * DAY))
    expect(e8.calls.avg).toBe(1)
    expect(t.source).toBe('edhrec_average')
  })

  it('a row made by older role rules is refreshed at once', async () => {
    const db = fakeDb()
    await run(db, fakeEdhrec(AVG_OK, PAGE_OK).src)
    db.saved()[0].classifier_version = CLASSIFIER_VERSION - 1
    const e2 = fakeEdhrec(AVG_OK, PAGE_OK)
    await run(db, e2.src, new Date(T0.getTime() + DAY))
    expect(e2.calls.avg).toBe(1)
  })

  it('EDHREC down with an old saved row: the old numbers, marked "may be out of date"; nothing written', async () => {
    const db = fakeDb()
    await run(db, fakeEdhrec(AVG_OK, PAGE_OK).src)
    const t = await run(db, fakeEdhrec('down', 'down').src, new Date(T0.getTime() + 20 * DAY))
    expect(t.sourceLabel).toBe('EDHREC average deck, 17,659 decks, may be out of date')
    expect(t.stale).toBe(true)
    expect(t.landsTypical).toBe(34)
    expect(db.writes).toHaveLength(1)
  })

  it('EDHREC down with nothing saved: "General guide (couldn\'t reach EDHREC)", and the failure is not saved', async () => {
    const db = fakeDb()
    const t = await run(db, fakeEdhrec('down', 'down').src)
    expect(t.sourceLabel).toBe(GUIDE_UNREACHABLE_LABEL)
    expect(t.source).toBe('general_guide')
    expect(db.writes).toHaveLength(0)
    // Next time EDHREC is back, it is tried again straight away.
    const back = fakeEdhrec(AVG_OK, PAGE_OK)
    expect((await run(db, back.src)).source).toBe('edhrec_average')
  })

  it('average deck unreachable but estimate fine: the estimate is shown but not saved', async () => {
    const db = fakeDb()
    const t = await run(db, fakeEdhrec('down', PAGE_OK).src)
    expect(t.source).toBe('edhrec_estimate')
    expect(db.writes).toHaveLength(0)
  })

  it('average deck missing and estimate unreachable: treated as unreachable, not "not found"', async () => {
    const db = fakeDb()
    const t = await run(db, fakeEdhrec(NF, 'down').src)
    expect(t.sourceLabel).toBe(GUIDE_UNREACHABLE_LABEL)
    expect(db.writes).toHaveLength(0)
  })

  it('works before the cache table exists: numbers are worked out live, nothing breaks', async () => {
    const db = fakeDb({ noTargetsTable: true })
    const t = await run(db, fakeEdhrec(AVG_OK, PAGE_OK).src)
    expect(t.sourceLabel).toBe('EDHREC average deck, 17,659 decks')
  })

  it('two checks at once make one refresh (single-flight)', async () => {
    const db = fakeDb()
    const e = fakeEdhrec(AVG_OK, PAGE_OK)
    const [a, b] = await Promise.all([run(db, e.src), run(db, e.src)])
    expect(a.sourceLabel).toBe(b.sourceLabel)
    expect(e.calls.avg).toBe(1)
  })

  it('Recheck refreshes an expired row at most once an hour', async () => {
    const db = fakeDb()
    await run(db, fakeEdhrec(AVG_OK, PAGE_OK).src)
    const later = new Date(T0.getTime() + 15 * DAY)
    // First recheck after expiry: EDHREC is down, so the stale row is served.
    const first = fakeEdhrec('down', 'down')
    expect((await run(db, first.src, later, true)).stale).toBe(true)
    expect(first.calls.avg).toBe(1)
    // A second recheck ten minutes later does not ask EDHREC again (still marked out of date).
    const second = fakeEdhrec(AVG_OK, PAGE_OK)
    expect((await run(db, second.src, new Date(later.getTime() + 10 * 60_000), true)).stale).toBe(true)
    expect(second.calls.avg).toBe(0)
    // After an hour it may.
    const third = fakeEdhrec(AVG_OK, PAGE_OK)
    expect((await run(db, third.src, new Date(later.getTime() + 61 * 60_000), true)).stale).toBe(false)
    expect(third.calls.avg).toBe(1)
  })
})
