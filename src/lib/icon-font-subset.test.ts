import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The app ships a cut-down icon font (public/fonts/README.md). If code names an icon the font does not
 * contain, that icon would show blank. This reads the names the font holds from the list saved next to it.
 */
const root = process.cwd()
const fontNames = new Set(
  readFileSync(join(root, 'public/fonts/material-symbols-outlined-subset.names.txt'), 'utf8').split('\n').filter(Boolean)
)

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p)
  }
  return out
}

describe('icon font subset', () => {
  it('contains every icon name the code writes out', () => {
    const missing: string[] = []
    for (const file of sourceFiles(join(root, 'src'))) {
      const text = readFileSync(file, 'utf8')
      const found = new Set<string>()
      // <MaterialIcon name="x" /> and <MaterialSymbol name="x" />
      for (const m of text.matchAll(/<(?:MaterialIcon|MaterialSymbol)\b[^>]*?\bname=["']([a-z][a-z0-9_]*)["']/g)) found.add(m[1])
      // icon: 'x' entries in lists of icons, and icon="x" props
      for (const m of text.matchAll(/\bicon\s*[:=]\s*\{?["']([a-z][a-z0-9_]*)["']/g)) found.add(m[1])
      // <span className="material-symbols-outlined ...">x</span>
      for (const m of text.matchAll(/material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]*)\s*</g)) found.add(m[1])
      for (const name of found) {
        // Plain words used as an icon: 'icon' variants such as 'ok' or 'none' are not icon names.
        if (!fontNames.has(name) && !['ok', 'none', 'icon', 'default'].includes(name)) missing.push(`${file.replace(root + '/', '')}: ${name}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps the font file and its name list together', () => {
    expect(statSync(join(root, 'public/fonts/material-symbols-outlined-subset.woff2')).size).toBeGreaterThan(100_000)
    expect(fontNames.size).toBeGreaterThan(300)
  })
})
