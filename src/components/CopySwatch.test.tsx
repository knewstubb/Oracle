import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CopySwatch, type CopySwatchKind } from './CopySwatch'

const LABELS: Record<CopySwatchKind, string> = {
  original: 'Original',
  proxy: 'Proxy',
  other_deck: 'In another deck',
  open: 'Open',
  basics: 'Basics',
  unowned: 'Unowned',
  empty: 'Empty slot',
}

describe('CopySwatch', () => {
  it.each(Object.entries(LABELS))('%s is labelled %s', (kind, label) => {
    render(<CopySwatch kind={kind as CopySwatchKind} />)
    expect(screen.getByRole('img', { name: label })).toHaveAttribute('data-swatch', kind)
  })
  it('Original uses the neutral grey token, never green', () => {
    render(<CopySwatch kind="original" />)
    const style = screen.getByRole('img', { name: 'Original' }).getAttribute('style') ?? ''
    expect(style).toContain('--swatch-original')
    expect(style).not.toContain('signal-success')
  })
  it('Basics are dotted and Unowned are amber', () => {
    render(<><CopySwatch kind="basics" /><CopySwatch kind="unowned" /></>)
    expect(screen.getByRole('img', { name: 'Basics' }).getAttribute('style')).toContain('radial-gradient')
    expect(screen.getByRole('img', { name: 'Unowned' }).getAttribute('style')).toContain('--swatch-unowned')
  })
})
