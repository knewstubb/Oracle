'use client'

import { useCardHoverPreview } from '@/components/CardHoverPreview'
import type { AlternatePrinting } from '@/types/import-reconciliation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlternatePrintingSelectProps {
  /** Currently selected printing id (null = imported printing). */
  value: string | null
  /** Available options; first option is always the imported printing. */
  options: AlternatePrinting[]
  onChange: (printingId: string | null) => void
  disabled?: boolean
  'aria-label'?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFinishes(finishes: string[]): string {
  if (finishes.length === 0) return ''
  const unique = Array.from(new Set(finishes))
  return unique.join(' / ')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlternatePrintingSelect({
  value,
  options,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: AlternatePrintingSelectProps) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const selected = e.target.value
        onChange(selected === '' ? null : selected)
      }}
      disabled={disabled || options.length === 0}
      aria-label={ariaLabel ?? 'Use alternate printing'}
      className="h-[29px] appearance-none rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] px-2.5 pr-7 text-[length:var(--fs-xs)] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239C9CA3' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 7px center',
      }}
    >
      {options.map((option) => (
        <option key={option.printingId} value={option.printingId}>
          {option.setName && option.setName !== option.setCode
            ? `${option.setName} (${option.setCode?.toUpperCase() ?? ''})`
            : option.setCode?.toUpperCase() ?? 'Unknown'}
          {' · '}
          {option.collectorNumber ?? '—'}
          {formatFinishes(option.finishes) && ` · ${formatFinishes(option.finishes)}`}
          {option.availableSupply === 0 && ' (allocated elsewhere)'}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Inline printing display with hover preview
// ---------------------------------------------------------------------------

interface PrintingIdentifierProps {
  printingId: string
  cardName: string
  setCode: string | null
  collectorNumber: string | null
  finish: string | null
}

export function PrintingIdentifier({
  printingId,
  cardName,
  setCode,
  collectorNumber,
  finish,
}: PrintingIdentifierProps) {
  const { triggerProps } = useCardHoverPreview({ scryfallId: printingId, cardName })

  return (
    <span
      {...triggerProps}
      className="inline-block cursor-help text-[length:var(--fs-xs)] text-[var(--text-secondary)] hover:text-foreground hover:underline"
    >
      {setCode?.toUpperCase() ?? '—'} · {collectorNumber ?? '—'} · {finish ?? 'nonfoil'}
    </span>
  )
}
