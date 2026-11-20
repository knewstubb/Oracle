'use client'
/**
 * One small square that says what a physical copy is: solid = Original, hatched = Proxy, grey = in another deck,
 * hollow outline = Open (free). Colours come from the shared tokens. The hatch is exported so the left rail's
 * "over" bar and the card details modal use the same one.
 */
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export type CopySwatchKind = 'original' | 'proxy' | 'other_deck' | 'open'

/** The diagonal hatch fill, in any colour. */
export function hatchBackground(color: string): string {
  return `repeating-linear-gradient(45deg, ${color} 0 3px, transparent 3px 6px)`
}

const LABELS: Record<CopySwatchKind, string> = {
  original: 'Original',
  proxy: 'Proxy',
  other_deck: 'In another deck',
  open: 'Open',
}

function styleFor(kind: CopySwatchKind): CSSProperties {
  switch (kind) {
    case 'original':
      return { background: 'var(--signal-success)', border: '1px solid var(--signal-success)' }
    case 'proxy':
      return { background: hatchBackground('var(--status-proxy)'), border: '1px solid var(--status-proxy)' }
    case 'other_deck':
      return { background: 'var(--status-partial)', border: '1px solid var(--status-partial)' }
    case 'open':
      return { background: 'transparent', border: '2px solid var(--text-secondary)' }
  }
}

export function CopySwatch({ kind, className }: { kind: CopySwatchKind; className?: string }) {
  return (
    <span
      role="img"
      aria-label={LABELS[kind]}
      data-swatch={kind}
      className={cn('inline-block size-3.5 shrink-0 rounded-[3px]', className)}
      style={styleFor(kind)}
    />
  )
}
