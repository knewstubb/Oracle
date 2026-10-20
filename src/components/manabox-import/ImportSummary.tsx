'use client'

import type { ImportCopyEdits, ImportDefaults } from '../../../docs/oracle/contracts/import-row-editing.types'
import type { ImportKind, UiPreviewRow } from './types'
import { computeTotals } from './types'

export interface ImportSummaryProps {
  rows: UiPreviewRow[]
  kind: ImportKind
  genericBasics: boolean
  defaults: ImportDefaults
  copyEdits: ImportCopyEdits
}

function plural(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? singular + 's'}`
}

export function ImportSummary({ rows, kind, genericBasics, defaults, copyEdits }: ImportSummaryProps) {
  const totals = computeTotals(rows, kind, genericBasics, defaults, copyEdits)

  return (
    <span className="text-[length:var(--fs-xs)] text-muted-foreground" aria-live="polite">
      <strong className="text-foreground">
        {plural(totals.tracked, 'card')}
      </strong>
      {totals.proxies > 0 && <span aria-hidden="true"> · </span>}
      {totals.proxies > 0 && plural(totals.proxies, 'proxy', 'proxies')}
      {totals.unsleeved > 0 && <span aria-hidden="true"> · </span>}
      {totals.unsleeved > 0 && `${totals.unsleeved} unsleeved`}
      {totals.foil > 0 && <span aria-hidden="true"> · </span>}
      {totals.foil > 0 && `${totals.foil} foil`}
      {kind === 'deck' && totals.basics > 0 && <span aria-hidden="true"> · </span>}
      {kind === 'deck' && totals.basics > 0 && plural(totals.basics, 'basic')}
    </span>
  )
}
