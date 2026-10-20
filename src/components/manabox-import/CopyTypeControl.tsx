'use client'

import { Check, VenetianMask } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ManaBoxRowSplit } from '../../../docs/oracle/contracts/manabox-import.types'
import type { CopyType } from './types'
import { isSplit, splitCount, splitTotal } from './types'

const TYPE_META: Record<
  CopyType,
  { label: string; icon: React.ReactNode | null; colorClass: string; selectedClass: string }
> = {
  original: {
    label: 'Original',
    icon: <Check className="size-3" aria-hidden="true" />,
    colorClass: 'text-[var(--accent-primary)]',
    selectedClass:
      'bg-[rgba(29,158,117,0.18)] shadow-[inset_0_0_0_1px_var(--accent-primary)] text-foreground',
  },
  proxy: {
    label: 'Proxy',
    icon: <VenetianMask className="size-3" aria-hidden="true" />,
    colorClass: 'text-[var(--status-proxy)]',
    selectedClass:
      'bg-[rgba(74,147,160,0.18)] shadow-[inset_0_0_0_1px_var(--status-proxy)] text-foreground',
  },
  unsleeved: {
    label: 'Unsleeved',
    icon: null,
    colorClass: 'text-muted-foreground',
    selectedClass: 'shadow-[inset_0_0_0_1px_var(--text-secondary)] text-foreground',
  },
}

export interface CopyTypeControlProps {
  qty: number
  split: ManaBoxRowSplit
  onChange: (split: ManaBoxRowSplit) => void
  onOpenPicker: (type: CopyType) => void
  options: CopyType[]
  cardName: string
}

export function CopyTypeControl({
  qty,
  split,
  onChange,
  onOpenPicker,
  options,
  cardName,
}: CopyTypeControlProps) {
  const multi = qty > 1

  const handleClick = (type: CopyType) => {
    if (type === 'original' || qty === 1) {
      onChange({
        originalCount: type === 'original' ? qty : 0,
        proxyCount: type === 'proxy' ? qty : 0,
        unsleevedCount: type === 'unsleeved' ? qty : 0,
      })
      return
    }
    onOpenPicker(type)
  }

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
        const tabIndex = idx === 0 || selected ? 0 : -1
        return (
          <button
            key={type}
            type="button"
            role={multi ? undefined : 'radio'}
            aria-checked={!multi ? selected : undefined}
            aria-pressed={multi ? selected : undefined}
            aria-label={multi ? `${meta.label}, ${count} of ${qty}` : undefined}
            tabIndex={tabIndex}
            onClick={() => handleClick(type)}
            className={cn(
              'inline-flex h-full items-center gap-1 px-2 text-[length:var(--fs-xs)] text-muted-foreground transition-colors hover:bg-[var(--bg-hover)]',
              selected && meta.selectedClass,
              selected && meta.colorClass,
              'border-l border-[var(--border-default)] first:border-l-0'
            )}
          >
            {selected && meta.icon}
            {meta.label}
            {isSplit(split) && selected && <span>{count}</span>}
          </button>
        )
      })}
    </span>
  )
}

export interface CopyCountPickerProps {
  qty: number
  type: CopyType
  value: number
  onPick: (value: number) => void
  onClose: () => void
  cardName: string
}

export function CopyCountPicker({ qty, type, value, onPick, onClose, cardName }: CopyCountPickerProps) {
  const label = type === 'proxy' ? 'Proxies' : 'Unsleeved'
  const originalCount = qty - value

  return (
    <div
      role="dialog"
      aria-label={`How many ${cardName} are ${type === 'proxy' ? 'proxies' : 'unsleeved'}`}
      className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 shadow-lg"
    >
      <span className="text-[length:var(--fs-xs)] text-muted-foreground">{label}</span>
      <span role="radiogroup" aria-label={`Number of ${type === 'proxy' ? 'proxies' : 'unsleeved'}`} className="flex gap-1">
        {Array.from({ length: Math.min(qty, 8) }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            tabIndex={n === value ? 0 : -1}
            onClick={() => onPick(n)}
            className={cn(
              'h-6 min-w-6 rounded border border-[var(--border-default)] text-[length:var(--fs-xs)] font-medium tabular-nums',
              n === value
                ? type === 'proxy'
                  ? 'bg-[rgba(74,147,160,0.18)] border-[var(--status-proxy)] text-foreground'
                  : 'bg-[var(--bg-hover)] border-[var(--text-secondary)] text-foreground'
                : 'bg-transparent text-muted-foreground hover:bg-[var(--bg-hover)]'
            )}
          >
            {n}
          </button>
        ))}
      </span>
      <span className="text-[length:var(--fs-xs)] text-muted-foreground">of {qty}</span>
      <span className="ml-1 inline-flex items-center gap-1 border-l border-[var(--border-subtle)] pl-2 text-[length:var(--fs-xs)] text-[var(--accent-primary)]">
        <Check className="size-3" aria-hidden="true" />
        Original {originalCount}
      </span>
    </div>
  )
}
