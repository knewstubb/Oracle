import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// jsdom cannot compute container-query CSS, so these checks pin the one switch point (800 px of page
// width, spec section 5) across every file that lays out the rail, plus the tab row staying scrollable.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const FILES = ['src/app/decks/[id]/page.tsx', 'src/components/deck-rail/DeckRail.tsx', 'src/components/DeckViewSkeleton.tsx']
describe('deck rail switch point', () => {
  it.each(FILES)('%s uses only the 800 px container breakpoint', (f) => {
    const src = read(f)
    const used = new Set(src.match(/@\[\d+px\]:/g))
    expect([...used]).toEqual(['@[800px]:'])
  })
  it('page declares the container and the rail is a 280 px card in a 292 px group whose scrollbar sits outside the card, with 24/24/12 page padding and 12 gap', () => {
    expect(read('src/app/decks/[id]/page.tsx')).toContain('@container')
    const rail = read('src/components/deck-rail/DeckRail.tsx')
    for (const c of ['@[800px]:w-[292px]', '@[800px]:min-w-[292px]', '@[800px]:overflow-y-scroll', 'deck-hover-scrollbar', '@[800px]:pr-1', '@[800px]:hidden']) expect(rail).toContain(c)
    const page = read('src/app/decks/[id]/page.tsx')
    for (const c of ['@[800px]:gap-3', '@[800px]:pl-6', '@[800px]:pr-3', '@[800px]:pt-6', '@[800px]:h-[71px]']) expect(page).toContain(c)
  })
  it('tab row scrolls sideways instead of running under the build picker', () => {
    expect(read('src/app/decks/[id]/page.tsx')).not.toContain('sm:overflow-visible')
  })
})
