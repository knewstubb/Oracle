import { describe, expect, it } from 'vitest'
import {
  applyPlan,
  buildPlan,
  formatPlan,
  planToManifest,
  rollbackManifest,
  writeRefusal,
  type BackfillDb,
  type FetchScryfallByOracleId,
} from './ref-card-backfill-plan'
import { mapScryfallToRefCard, type RefCardRow, type ScryfallCard } from './ref-card-backfill'

const USER = 'user-1'

function card(name: string, oracleId: string, extra: Partial<ScryfallCard> = {}): ScryfallCard {
  return { name, oracle_id: oracleId, type_line: 'Creature — Elf Druid', cmc: 1, color_identity: ['G'], oracle_text: `${name} text`, ...extra }
}

const twoFaced = (name: string, id: string) =>
  card(name, id, {
    type_line: 'Creature — Human Scientist // Sorcery',
    oracle_text: undefined,
    card_faces: [
      { name: name.split(' // ')[0], type_line: 'Creature — Human Scientist', oracle_text: 'Front.' },
      { name: name.split(' // ')[1], type_line: 'Sorcery', oracle_text: 'Back.' },
    ],
  })

interface Lib {
  [name: string]: RefCardRow | { name: string; type_line: string; oracle_text: string | null }
}

function makeFake(initial: Lib, owned: Array<{ name: string; oracleId: string | null }>, printings: Record<string, string>) {
  const lib: Lib = JSON.parse(JSON.stringify(initial))
  const state = { writes: 0 }
  const db: BackfillDb = {
    async readOwnedCardsWithoutLibraryRow() {
      return owned.filter(o => !(o.name in lib))
    },
    async readSlashRowsWithoutText() {
      return Object.values(lib)
        .filter(r => r.name.includes(' // ') && r.oracle_text === null)
        .map(r => ({ name: r.name, type_line: r.type_line, oracle_text: r.oracle_text }))
    },
    async findFrontFaceMatches(fronts) {
      return Object.keys(lib).filter(n => fronts.some(f => n === f || n.startsWith(`${f} // `)))
    },
    async readOracleIdsByName(names) {
      return new Map(names.filter(n => printings[n]).map(n => [n, printings[n]]))
    },
    async insertIgnoringExisting(rows) {
      const inserted: string[] = []
      for (const r of rows) {
        if (r.name in lib) continue
        lib[r.name] = r
        inserted.push(r.name)
        state.writes++
      }
      return inserted
    },
    async updateWhereTextNull(name, patch) {
      const row = lib[name]
      if (!row || row.oracle_text !== null) return false
      row.oracle_text = patch.oracle_text
      row.type_line = patch.type_line
      state.writes++
      return true
    },
    async deleteByNames(names) {
      for (const n of names) {
        delete lib[n]
        state.writes++
      }
    },
    async restoreText(name, previous) {
      lib[name].oracle_text = previous.oracle_text
      lib[name].type_line = previous.type_line
      state.writes++
    },
  }
  return { db, lib, state }
}

function fakeScryfall(cards: ScryfallCard[], calls: string[][] = []): FetchScryfallByOracleId {
  return async ids => {
    calls.push(ids)
    const found = cards.filter(c => ids.includes(c.oracle_id!))
    const known = new Set(found.map(c => c.oracle_id))
    return { found, notFound: ids.filter(i => !known.has(i)) }
  }
}

const baseLib: Lib = {
  'Has Text // Back': { name: 'Has Text // Back', type_line: 'Creature — Human Scientist // Sorcery', oracle_text: 'keep me' },
  'Old // Row': { name: 'Old // Row', type_line: 'Creature — Human Scientist // Sorcery', oracle_text: null },
  'Plain Card': { name: 'Plain Card', type_line: 'Creature — Elf', oracle_text: 'x' },
}
const owned = [
  { name: 'New Single', oracleId: 'id-single' },
  { name: 'New Front // New Back', oracleId: 'id-two' },
  { name: 'Plain Card', oracleId: 'id-plain' },
]
const printings = { 'Old // Row': 'id-old', 'Has Text // Back': 'id-has' }
const scryfall = [
  card('New Single', 'id-single'),
  twoFaced('New Front // New Back', 'id-two'),
  twoFaced('Old // Row', 'id-old'),
  twoFaced('Has Text // Back', 'id-has'),
]

describe('dry run', () => {
  it('writes nothing and counts by cause', async () => {
    const { db, state } = makeFake(baseLib, owned, printings)
    const plan = await buildPlan(db, fakeScryfall(scryfall), USER)
    expect(state.writes).toBe(0)
    expect(plan.countsByCause).toEqual({
      'no row, single-faced': 1,
      'no row, two-faced': 1,
      'library row with no text': 1,
    })
    expect(plan.inserts.map(i => i.name).sort()).toEqual(['New Front // New Back', 'New Single'])
    expect(plan.updates).toEqual([
      {
        name: 'Old // Row',
        before: { oracle_text: null, type_line: 'Creature — Human Scientist // Sorcery' },
        after: { oracle_text: 'Front.\n//\nBack.', type_line: 'Creature — Human, Scientist // Sorcery' },
      },
    ])
    expect(plan.nameMismatchCandidates).toEqual([])
    const text = formatPlan(plan)
    expect(text).toContain('DRY RUN')
    expect(text).toContain('no row, single-faced: 1')
    expect(text).toContain('Totals: 2 rows inserted, 1 rows updated')
  })

  it('flags a library row that looks like the same two-faced card under another name', async () => {
    const { db } = makeFake({ ...baseLib, 'New Front': { name: 'New Front', type_line: 'x', oracle_text: 'y' } }, owned, printings)
    const plan = await buildPlan(db, fakeScryfall(scryfall), USER)
    expect(plan.nameMismatchCandidates).toEqual(['New Front'])
  })

  it('requests Scryfall once with the distinct oracle_ids', async () => {
    const { db } = makeFake(baseLib, owned, printings)
    const calls: string[][] = []
    await buildPlan(db, fakeScryfall(scryfall, calls), USER)
    expect(calls).toHaveLength(1)
    expect(calls[0].sort()).toEqual(['id-old', 'id-single', 'id-two'])
  })
})

describe('guards', () => {
  const env = (e: Record<string, string>) => e
  it('refuses without --apply', () => {
    expect(writeRefusal({ apply: false, live: true, envFileGiven: true, env: env({ CC14_OWNER_APPROVED: 'yes' }) })).toMatch(/not given/)
  })
  it('refuses without owner approval', () => {
    expect(writeRefusal({ apply: true, live: true, envFileGiven: false, env: {} })).toMatch(/CC14_OWNER_APPROVED/)
  })
  it('refuses with approval but neither throwaway confirmation nor --live', () => {
    expect(writeRefusal({ apply: true, live: false, envFileGiven: false, env: env({ CC14_OWNER_APPROVED: 'yes' }) })).toMatch(/refused/)
  })
  it('refuses TEST_DB_CONFIRMED without an --env-file', () => {
    const e = env({ CC14_OWNER_APPROVED: 'yes', TEST_DB_CONFIRMED: 'yes' })
    expect(writeRefusal({ apply: true, live: false, envFileGiven: false, env: e })).toMatch(/refused/)
  })
  it('allows the throwaway database path and the --live path (with approval)', () => {
    const e = env({ CC14_OWNER_APPROVED: 'yes', TEST_DB_CONFIRMED: 'yes' })
    expect(writeRefusal({ apply: true, live: false, envFileGiven: true, env: e })).toBeNull()
    expect(writeRefusal({ apply: true, live: true, envFileGiven: false, env: env({ CC14_OWNER_APPROVED: 'yes' }) })).toBeNull()
  })
  it('applies the same guards to --rollback', () => {
    expect(writeRefusal({ apply: true, live: true, envFileGiven: false, env: {} }, '--rollback')).toMatch(/--rollback refused/)
  })
})

describe('apply, idempotence and rollback', () => {
  it('inserts only missing names, updates only null-text rows, never touches rows with text', async () => {
    const { db, lib } = makeFake(baseLib, owned, printings)
    const plan = await buildPlan(db, fakeScryfall(scryfall), USER)
    const manifest = await applyPlan(db, plan)
    expect(manifest.mode).toBe('apply')
    expect(manifest.inserted.sort()).toEqual(['New Front // New Back', 'New Single'])
    expect(manifest.updated.map(u => u.name)).toEqual(['Old // Row'])
    expect(lib['Has Text // Back']).toEqual(baseLib['Has Text // Back'])
    expect(lib['Plain Card']).toEqual(baseLib['Plain Card'])
    expect(lib['Old // Row'].oracle_text).toBe('Front.\n//\nBack.')
    expect(lib['New Single'].name).toBe('New Single')
  })

  it('never overwrites an existing row on insert (name conflict ignored)', async () => {
    const { db, lib } = makeFake(baseLib, owned, printings)
    const plan = await buildPlan(db, fakeScryfall(scryfall), USER)
    lib['New Single'] = { name: 'New Single', type_line: 'raced in', oracle_text: 'mine' } // appeared after planning
    const manifest = await applyPlan(db, plan)
    expect(manifest.inserted).not.toContain('New Single')
    expect(lib['New Single'].oracle_text).toBe('mine')
  })

  it('a second apply is a no-op', async () => {
    const { db, state } = makeFake(baseLib, owned, printings)
    await applyPlan(db, await buildPlan(db, fakeScryfall(scryfall), USER))
    const writesAfterFirst = state.writes
    const second = await buildPlan(db, fakeScryfall(scryfall), USER)
    expect(second.inserts).toHaveLength(0)
    expect(second.updates).toHaveLength(0)
    const manifest = await applyPlan(db, second)
    expect(manifest.inserted).toEqual([])
    expect(manifest.updated).toEqual([])
    expect(state.writes).toBe(writesAfterFirst)
  })

  it('rollback restores the fake exactly', async () => {
    const { db, lib } = makeFake(baseLib, owned, printings)
    const manifest = await applyPlan(db, await buildPlan(db, fakeScryfall(scryfall), USER))
    await rollbackManifest(db, manifest)
    expect(lib).toEqual(baseLib)
  })

  it('a dry-run manifest cannot be rolled back', async () => {
    const { db, lib } = makeFake(baseLib, owned, printings)
    const plan = await buildPlan(db, fakeScryfall(scryfall), USER)
    await expect(rollbackManifest(db, planToManifest(plan, 'dry-run'))).rejects.toThrow(/dry run/)
    expect(lib).toEqual(baseLib)
  })
})

describe('Scryfall problems', () => {
  it('reports cards Scryfall does not find and does not guess', async () => {
    const { db } = makeFake(baseLib, owned, printings)
    const plan = await buildPlan(db, fakeScryfall(scryfall.filter(c => c.oracle_id !== 'id-single')), USER)
    expect(plan.inserts.map(i => i.name)).not.toContain('New Single')
    expect(plan.errors.some(e => e.includes('id-single'))).toBe(true)
  })

  it('rejects a Scryfall card whose oracle_id differs from the requested one', async () => {
    const { db } = makeFake(baseLib, owned, printings)
    // Scryfall answers the request for id-single with a card carrying a different oracle_id.
    const wrong: FetchScryfallByOracleId = async () => ({ found: [card('New Single', 'other-id')], notFound: [] })
    const plan = await buildPlan(db, wrong, USER)
    expect(plan.inserts).toHaveLength(0)
    expect(plan.updates).toHaveLength(0)
    expect(plan.errors.some(e => e.startsWith('New Single'))).toBe(true)
    expect(() => mapScryfallToRefCard(card('New Single', 'other-id'), 'id-single')).toThrow(/mismatch/)
  })

  it('reports a Scryfall name that differs from the owned name instead of inserting it', async () => {
    const { db } = makeFake(baseLib, owned, printings)
    const renamed = scryfall.map(c => (c.oracle_id === 'id-single' ? { ...c, name: 'Different Name' } : c))
    const plan = await buildPlan(db, fakeScryfall(renamed), USER)
    expect(plan.inserts.map(i => i.name)).not.toContain('New Single')
    expect(plan.errors.some(e => e.includes('Different Name'))).toBe(true)
  })

  it('reports an owned card with no oracle_id', async () => {
    const { db } = makeFake(baseLib, [{ name: 'No Id', oracleId: null }], printings)
    const plan = await buildPlan(db, fakeScryfall(scryfall), USER)
    expect(plan.errors.some(e => e.startsWith('No Id'))).toBe(true)
  })
})
