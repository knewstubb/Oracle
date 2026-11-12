import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

describe('scrollbar styling (one rule, dark tracks everywhere)', () => {
  it('sets thin width and a transparent track on html and * only where scrollbar-color is understood', () => {
    const block = css.match(/@supports \(scrollbar-color: auto\) \{([\s\S]*?)\n  \}/)
    expect(block).not.toBeNull()
    expect(block![1]).toMatch(/html,\s*\*\s*\{/)
    expect(block![1]).toMatch(/scrollbar-width:\s*thin/)
    expect(block![1]).toMatch(/scrollbar-color:\s*rgba\(255, 255, 255, 0\.18\) transparent/)
  })

  it('never sets scrollbar-width outside that guard (Safari would then ignore the ::-webkit-scrollbar rules and show a light track)', () => {
    const withoutGuard = css.replace(/@supports \(scrollbar-color: auto\) \{[\s\S]*?\n  \}/, '')
    const lines = withoutGuard.split('\n').filter((l) => /scrollbar-width:/.test(l) && !/none/.test(l))
    expect(lines).toEqual([])
  })

  it('keeps transparent webkit tracks for Safari and the dark colour scheme', () => {
    expect(css).toMatch(/\*::-webkit-scrollbar-track,[\s\S]*?background:\s*transparent/)
    expect(css).toMatch(/color-scheme:\s*dark/)
  })

  it('no component paints a scrollbar track light', () => {
    expect(css).not.toMatch(/scrollbar-track[^}]*(white|#fff)/i)
  })
})
