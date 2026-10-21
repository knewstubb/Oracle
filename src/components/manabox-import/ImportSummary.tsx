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

export function ImportSummary({ rows, kind, defaults, copyEdits, unmatchedCount = 0, hiddenCount = 0, onShowHidden }: ImportSummaryProps) {
  const totals = computeTotals(rows, kind, defaults, copyEdits)

  return (
    <span className="text-[length:var(--fs-xs)] text-muted-foreground" aria-live="polite">
      <strong className="text-foreground">
        {kind === 'collection' ? plural(totals.tracked, 'copy', 'copies') : plural(totals.tracked, 'card')}
      </strong>
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
      {totals.proxies > 0 && <span aria-hidden="true"> · </span>}
      {totals.proxies > 0 && plural(totals.proxies, 'proxy', 'proxies')}
      {totals.unsleeved > 0 && <span aria-hidden="true"> · </span>}
      {totals.unsleeved > 0 && `${totals.unsleeved} unsleeved`}
      {totals.foil > 0 && <span aria-hidden="true"> · </span>}
      {totals.foil > 0 && `${totals.foil} foil`}
      {kind === 'deck' && totals.basics > 0 && <span aria-hidden="true"> · </span>}
      {kind === 'deck' && totals.basics > 0 && `${totals.basics} ${totals.basics === 1 ? 'basic' : 'basics'} (generic)`}
    </span>
  )
}
