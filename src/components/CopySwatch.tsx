'use client'
/**
 * One small square that says what a physical copy or slot is: solid light grey = Original, hatched = Proxy,
 * dark grey = in another deck, hollow outline = Open (free copy), dotted = Basics, amber = Unowned, empty track =
 * Empty slot. Colours come from the shared tokens (no green). The hatch is exported so the left rail's
 * "over" bar and the card details modal use the same one.
 */
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export type CopySwatchKind = 'original' | 'proxy' | 'other_deck' | 'open' | 'basics' | 'unowned' | 'empty'

/** A dotted fill, in any colour, for generic basics. */
export function dotBackground(color: string): string {
  return `radial-gradient(circle, ${color} 0 1px, transparent 1.5px) 0 0 / 4px 4px`
}
/** The diagonal hatch fill, in any colour. */
export function hatchBackground(color: string): string {
  return `repeating-linear-gradient(45deg, ${color} 0 3px, transparent 3px 6px)`
}

const LABELS: Record<CopySwatchKind, string> = {
  original: 'Original',
  proxy: 'Proxy',
  other_deck: 'In other decks',
  open: 'Open',
  basics: 'Basics',
  unowned: 'Unowned',
  empty: 'Empty slot',
}

export function swatchStyle(kind: CopySwatchKind): CSSProperties {
  switch (kind) {
    case 'original':
      return { background: 'var(--swatch-original)', border: '1px solid var(--swatch-original)' }
    case 'proxy':
      return { background: hatchBackground('var(--status-proxy)'), border: '1px solid var(--status-proxy)' }
    case 'other_deck':
      return { background: 'var(--swatch-other-decks)', border: '1px solid var(--swatch-other-decks)' }
    case 'open':
      return { background: 'transparent', border: '2px solid var(--text-secondary)' }
    case 'basics':
      return { background: `${dotBackground('var(--bg-canvas)')}, var(--swatch-original)`, border: '1px solid var(--swatch-original)' }
    case 'unowned':
      return { background: 'var(--swatch-unowned)', border: '1px solid var(--swatch-unowned)' }
    case 'empty':
      return { background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }
  }
}

export function CopySwatch({ kind, className }: { kind: CopySwatchKind; className?: string }) {
  return (
    <span
      role="img"
      aria-label={LABELS[kind]}
      data-swatch={kind}
      className={cn('inline-block size-3.5 shrink-0 rounded-[3px]', className)}
      style={swatchStyle(kind)}
    />
  )
}
