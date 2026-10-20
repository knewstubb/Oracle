'use client'

import { LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ImportProgressProps {
  processed: number
  total: number
  cancellable?: boolean
  onCancel?: () => void
  /** What is happening now, e.g. "Looking up cards". */
  phaseLabel?: string
  /** Unit shown after the numbers, e.g. "copies". */
  unit?: string
}

export function ImportProgress({ processed, total, cancellable, onCancel, phaseLabel, unit }: ImportProgressProps) {
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[length:var(--fs-xs)] text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin text-[var(--accent-primary)]" aria-hidden="true" />
        <span>
          {phaseLabel ? `${phaseLabel} · ` : ''}
          {processed}/{total}
          {unit ? ` ${unit}` : ''}
        </span>
        {cancellable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onCancel}
            aria-label="Cancel import"
            title="Cancel import"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={processed}
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percent}%`, background: 'var(--accent-primary)' }}
        />
      </div>
    </div>
  )
}

export interface DeckImportSpinnerProps {
  label?: string
}

export function DeckImportSpinner({ label = 'Importing…' }: DeckImportSpinnerProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <LoaderCircle className="size-6 animate-spin text-[var(--accent-primary)]" aria-hidden="true" />
      <span className="text-[length:var(--fs-sm)] text-muted-foreground">{label}</span>
    </div>
  )
}
