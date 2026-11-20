'use client'
import { ManaCost } from '@/components/ManaCost'
import { CopySwatch, type CopySwatchKind } from '@/components/CopySwatch'
import type { CopyView } from '@/lib/card-details/copies'
import type { PrintingFinishRow } from '@/lib/card-details/printings'

/** Oracle text with {symbols} drawn as mana icons. Paragraph per line. */
export function OracleText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => (
        <p key={i}>
          {line.split(/(\{[^}]+\})/g).map((part, j) =>
            /^\{[^}]+\}$/.test(part) ? <ManaCost key={j} cost={part} className="align-middle" /> : <span key={j}>{part}</span>,
          )}
        </p>
      ))}
    </div>
  )
}

export function setLabel(setCode: string | null | undefined, collectorNumber: string | null | undefined): string {
  if (!setCode) return '—'
  return `${setCode.toUpperCase()}${collectorNumber ? ` · #${collectorNumber}` : ''}`
}

export function finishSuffix(finish: string | null | undefined): string {
  return finish === 'foil' ? ' · foil' : finish === 'etched' ? ' · etched' : ''
}

export function swatchKindFor(copy: CopyView): CopySwatchKind {
  if (copy.state === 'claimed') return 'other_deck'
  if (copy.isProxy || copy.state === 'proxy_elsewhere') return 'proxy'
  if (copy.state === 'in_this_deck') return 'original'
  return 'open'
}

export function Swatch({ copy }: { copy: CopyView }) {
  return <CopySwatch kind={swatchKindFor(copy)} />
}

export function titleCase(s: string | null | undefined): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

export const rowKey = (p: Pick<PrintingFinishRow, 'scryfallId' | 'finish'>) => `${p.scryfallId}:${p.finish}`

export const TAB_BODY = 'min-h-0 flex-1 overflow-auto p-4 max-sm:p-3'
export const BTN_SM = 'inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-emphasis)] px-2.5 text-[length:var(--fs-sm)] font-medium disabled:opacity-50 max-sm:h-11'
export const SELECT = 'h-8 rounded-md border border-input bg-background px-2 text-[length:var(--fs-sm)] text-foreground max-sm:h-11'

export const LEGALITY: Record<string, string> = { legal: 'Legal', not_legal: 'Not legal', banned: 'Banned', restricted: 'Restricted' }
