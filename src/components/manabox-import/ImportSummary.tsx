'use client'

import type { ImportCopyEdits, ImportDefaults } from '../../../docs/oracle/contracts/import-row-editing.types'
import type { ImportKind, UiPreviewRow } from './types'
import { computeTotals } from './types'

export interface ImportSummaryProps {
  rows: UiPreviewRow[]
  kind: ImportKind
  defaults: ImportDefaults
  copyEdits: ImportCopyEdits
  /** Lines that could not be matched; always counted, even when their note is hidden. */
  unmatchedCount?: number
  /** Notes the owner hid; a link brings them back. */
  hiddenCount?: number
  onShowHidden?: () => void
}

function plural(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? singular + 's'}`
}

/** The deck total. It does not change with the selected chip. */
function DeckCounts({ totals }: { totals: ReturnType<typeof computeTotals> }) {
  const deck = totals.cards
  const maybe = totals.maybeboard
  let text: string
  if (maybe === 0) text = `${deck} in deck`
  else text = `${deck + maybe} cards: ${deck} in deck · ${maybe} in maybeboard`
  return <strong className="text-foreground">{text}</strong>
}

export function ImportSummary({ rows, kind, defaults, copyEdits, unmatchedCount = 0, hiddenCount = 0, onShowHidden }: ImportSummaryProps) {
  const totals = computeTotals(rows, kind, defaults, copyEdits)
  const showExtras = kind === 'collection'
  return (
    <span className="text-[length:var(--fs-xs)] text-muted-foreground" aria-live="polite">
      {kind === 'collection' ? (
        <strong className="text-foreground">{plural(totals.tracked, 'copy', 'copies')}</strong>
      ) : (
        <DeckCounts totals={totals} />
      )}
      {unmatchedCount > 0 && <span aria-hidden="true"> · </span>}
      {unmatchedCount > 0 && `${unmatchedCount} ${unmatchedCount === 1 ? 'row' : 'rows'} not matched`}
      {hiddenCount > 0 && onShowHidden && (
        <>
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            id="import-show-hidden-notes"
            onClick={onShowHidden}
            className="cursor-pointer rounded-sm text-[var(--accent-primary)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
          >
            Show hidden notes ({hiddenCount})
          </button>
        </>
      )}
      {showExtras && totals.proxies > 0 && <span aria-hidden="true"> · </span>}
      {showExtras && totals.proxies > 0 && plural(totals.proxies, 'proxy', 'proxies')}
      {showExtras && totals.unsleeved > 0 && <span aria-hidden="true"> · </span>}
      {showExtras && totals.unsleeved > 0 && `${totals.unsleeved} unsleeved`}
      {showExtras && totals.foil > 0 && <span aria-hidden="true"> · </span>}
      {showExtras && totals.foil > 0 && `${totals.foil} foil`}
    </span>
  )
}
