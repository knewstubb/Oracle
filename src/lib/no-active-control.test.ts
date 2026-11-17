import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '..')
const ROOT = path.resolve(SRC, '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

describe('no control for marking a deck active remains', () => {
  it('the toggle component and its route are gone', () => {
    expect(existsSync(path.join(SRC, 'components/ActiveToggle.tsx'))).toBe(false)
    expect(existsSync(path.join(SRC, 'app/api/decks/[id]/active/route.ts'))).toBe(false)
  })
  it('no source file uses the toggle or the wording for marking a deck active', () => {
    for (const f of walk(SRC)) {
      const text = readFileSync(f, 'utf8')
      expect(text, f).not.toMatch(/ActiveToggle|marked active|Mark as Active|\/api\/decks\/\$\{[^}]+\}\/active/)
    }
  })
  it('nothing in the app sends a request that sets is_active on a deck', () => {
    for (const f of walk(SRC)) {
      if (f.endsWith('types/supabase.ts')) continue
      const text = readFileSync(f, 'utf8')
      expect(text, f).not.toMatch(/is_active\s*:\s*(true|false|isActive)/)
    }
  })
  it('the deck page has no active/inactive switch', () => {
    const page = readFileSync(path.join(ROOT, 'src/app/decks/[id]/page.tsx'), 'utf8')
    expect(page).not.toMatch(/ActiveToggle|is_active/)
  })
})
