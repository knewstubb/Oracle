'use client'

import { LoaderCircle, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ImportWorkingProps {
  title: string
  detail?: string
  fileName?: string
  /** With processed and total, shows a progress bar. */
  processed?: number
  total?: number
  unit?: string
  onCancel?: () => void
}

/** Processing and importing stages: one centred group, no layout change between them. */
export function ImportWorking({ title, detail, fileName, processed, total, unit, onCancel }: ImportWorkingProps) {
  const hasBar = total !== undefined && processed !== undefined
  const percent = hasBar && total! > 0 ? Math.round((processed! / total!) * 100) : 0

  return (
    <div role="status" className="flex flex-col items-center gap-3.5 text-center">
      <LoaderCircle
        className="size-9 animate-spin text-[var(--accent-primary)] motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="text-[length:var(--fs-lg)] font-medium">{title}</span>
      {hasBar && (
        <>
          <div
            role="progressbar"
            aria-label="Import progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={processed}
            className="h-1.5 w-[360px] max-w-full overflow-hidden rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${percent}%`, background: 'var(--accent-primary)' }}
            />
          </div>
          <span className="text-[length:var(--fs-xs)] tabular-nums text-muted-foreground">
            {processed} of {total}
            {unit ? ` ${unit}` : ''}
          </span>
        </>
      )}
      {detail && <span className="text-[length:var(--fs-xs)] text-muted-foreground">{detail}</span>}
      {fileName && (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 text-[length:var(--fs-xs)] text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" />
          {fileName}
        </span>
      )}
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel import
        </Button>
      )}
    </div>
  )
}
