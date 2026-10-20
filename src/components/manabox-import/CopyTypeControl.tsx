'use client'

import { cn } from '@/lib/utils'
import type { ManaBoxRowSplit } from '../../../docs/oracle/contracts/manabox-import.types'
import type { CopyType } from './types'
import { setSplitCount, splitCount } from './types'
import { CopyCountStepper } from './CopyCountStepper'

const TYPE_META: Record<
  CopyType,
  { label: string; colorClass: string; selectedClass: string }
> = {
  original: {
    label: 'Original',
    colorClass: 'text-[var(--accent-primary)]',
    selectedClass:
      'bg-[rgba(29,158,117,0.18)] shadow-[inset_0_0_0_1px_var(--accent-primary)] text-foreground',
  },
  proxy: {
    label: 'Proxy',
    colorClass: 'text-[var(--status-proxy)]',
    selectedClass:
      'bg-[rgba(74,147,160,0.18)] shadow-[inset_0_0_0_1px_var(--status-proxy)] text-foreground',
  },
  unsleeved: {
    label: 'Unsleeved',
    colorClass: 'text-muted-foreground',
    selectedClass: 'shadow-[inset_0_0_0_1px_var(--text-secondary)] text-foreground',
  },
}

export interface CopyTypeControlProps {
  qty: number
  split: ManaBoxRowSplit
  onChange: (split: ManaBoxRowSplit) => void
  options: CopyType[]
  cardName: string
}

export function CopyTypeControl({
  qty,
  split,
  onChange,
  options,
  cardName,
}: CopyTypeControlProps) {
  const multi = qty > 1

  const setAll = (type: CopyType) =>
    onChange({
      originalCount: type === 'original' ? qty : 0,
      proxyCount: type === 'proxy' ? qty : 0,
      unsleevedCount: type === 'unsleeved' ? qty : 0,
    })

  const segmentClass = (selected: boolean, meta: (typeof TYPE_META)[CopyType]) =>
    cn(
      'inline-flex h-full items-center gap-1 text-[length:var(--fs-xs)] text-muted-foreground',
      selected && meta.selectedClass,
      selected && meta.colorClass,
      'border-l border-[var(--border-default)] first:rounded-l-[calc(var(--radius-lg)-1px)] first:border-l-0 last:rounded-r-[calc(var(--radius-lg)-1px)]'
    )

  return (
    <span
      role={multi ? 'group' : 'radiogroup'}
      aria-label={`${cardName}${multi ? `, ${qty} copies` : ''}`}
      className="inline-flex h-6 overflow-hidden rounded-lg border border-[var(--border-default)]"
    >
      {options.map((type, idx) => {
        const count = splitCount(split, type)
        const selected = count > 0
        const meta = TYPE_META[type]

        // 2+ copies: Original shows what is left; every other type is a stepper.
        if (multi && type !== 'original') {
          return (
            <span key={type} className={segmentClass(selected, meta)}>
              <CopyCountStepper
                qty={qty}
                type={type}
                value={count}
                cardName={cardName}
                onChange={(n) => onChange(setSplitCount(split, type, n, qty))}
              />
            </span>
          )
        }

        return (
          <button
            key={type}
            type="button"
            role={multi ? undefined : 'radio'}
            aria-checked={!multi ? selected : undefined}
            aria-label={multi ? `Original, ${count} of ${qty}. Make all original` : undefined}
            tabIndex={!multi && (idx === 0 || selected) ? 0 : multi ? 0 : -1}
            onClick={() => setAll(type)}
            className={cn(segmentClass(selected, meta), 'px-2 transition-colors hover:bg-[var(--bg-hover)]')}
          >
            {meta.label}
            {multi && <span aria-live="polite" aria-atomic="true">{count}</span>}
          </button>
        )
      })}
    </span>
  )
}
