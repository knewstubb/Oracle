import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isSpare, isSupplyEligible, SUPPLY_ELIGIBLE_FILTER } from './copy-availability'

describe('supply rule (Missing and In your hand are not supply)', () => {
  const base = { is_proxy: false, missing: false, in_hand: false }

  it('truth table', () => {
    expect(isSupplyEligible(base)).toBe(true)
    expect(isSupplyEligible({ ...base, is_proxy: true })).toBe(true)
    expect(isSupplyEligible({ ...base, missing: true })).toBe(false)
    expect(isSupplyEligible({ ...base, in_hand: true })).toBe(false)
  })

  it('spare means eligible and not in any deck', () => {
    expect(isSpare(base, false)).toBe(true)
    expect(isSpare(base, true)).toBe(false)
    expect(isSpare({ ...base, in_hand: true }, false)).toBe(false)
    expect(isSpare({ ...base, missing: true }, false)).toBe(false)
  })

  it('the query filter keeps both columns false', () => {
    expect(SUPPLY_ELIGIBLE_FILTER).toEqual({ missing: false, in_hand: false })
  })
})

/**
 * Guard: every reader that decides "free / spare / candidate" must filter the two markers.
 * A new reader of user_copies in this list loses the filter -> this test fails.
 * Deliberately NOT on the list (they count OWNED copies, which still include Missing and In your hand,
 * contract section 6): import-engine-v2 (replace/sync diff would re-add copies), manabox-resolver (owned counts).
 */
describe('supply readers carry the filter', () => {
  const root = join(__dirname, '..', '..')
  const readers = [
    'src/lib/spare-copy-browse.ts',
    'src/lib/owned-copy-lookup.ts',
    'src/lib/allocation-candidates.ts',
    'src/lib/card-status.ts',
    'src/lib/supply-pool.ts',
    'src/lib/reconcile-overuse.ts',
    'src/lib/import-ownership.ts',
    'src/lib/storage/copies.ts',
    'src/app/api/collection/ownership-batch/route.ts',
    'src/app/api/collection/allocation/route.ts',
  ]

  it.each(readers)('%s filters missing and in_hand', (file) => {
    expect(statSync(join(root, file)).isFile()).toBe(true)
    const src = readFileSync(join(root, file), 'utf8')
    expect(src).toMatch(/\.eq\('missing', false\)/)
    expect(src).toMatch(/\.eq\('in_hand', false\)/)
    // one filter pair per user_copies read in the file (storage/copies.ts counts boxes, which cannot hold them)
    const reads = (src.match(/\.from\('user_copies'\)/g) ?? []).length
    const filters = (src.match(/\.eq\('in_hand', false\)/g) ?? []).length
    // a read that asks for the copies that ARE in hand (to show a slot as In your hand) is deliberate, not a supply read
    const inHandReads = (src.match(/\.eq\('in_hand', true\)/g) ?? []).length
    if (!file.endsWith('storage/copies.ts')) expect(filters + inHandReads).toBeGreaterThanOrEqual(reads)
  })

  it('no other file filters on one marker without the other', () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n)
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
      })
    for (const f of walk(join(root, 'src'))) {
      if (f.endsWith('types/supabase.ts') || f.includes('move-here')) continue
      const src = readFileSync(f, 'utf8')
      if (/\.eq\('missing', false\)/.test(src)) expect(src, f).toMatch(/\.eq\('in_hand', false\)/)
    }
  })
})
