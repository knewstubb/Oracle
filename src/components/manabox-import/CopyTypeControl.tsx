'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, VenetianMask } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ManaBoxRowSplit } from '../../../docs/oracle/contracts/manabox-import.types'
import type { CopyType } from './types'
import { isSplit, setSplitCount, splitCount } from './types'
import { CopyCountStepper } from './CopyCountStepper'

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
  /** Which type this row's stepper is editing (null = collapsed). Only meaningful on 2+ copy rows. */
  editingType: CopyType | null
  onEditingTypeChange: (type: CopyType | null) => void
  options: CopyType[]
  cardName: string
}

function summary(split: ManaBoxRowSplit, cardName: string): string {
  const parts = [
    split.originalCount > 0 && `${split.originalCount} original`,
    split.proxyCount > 0 && `${split.proxyCount} proxy`,
    split.unsleevedCount > 0 && `${split.unsleevedCount} unsleeved`,
  ].filter(Boolean)
  return `${cardName}: ${parts.join(', ')}`
}

export function CopyTypeControl({
  qty,
  split,
  onChange,
  editingType,
  onEditingTypeChange,
  options,
  cardName,
}: CopyTypeControlProps) {
  const multi = qty > 1
  const buttonRefs = useRef<Partial<Record<CopyType, HTMLButtonElement | null>>>({})
  const refocusType = useRef<CopyType | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const editing = multi && editingType && editingType !== 'original' ? editingType : null

  useEffect(() => {
    if (!editing && refocusType.current) {
      buttonRefs.current[refocusType.current]?.focus()
      refocusType.current = null
    }
  }, [editing])

  const handleClick = (type: CopyType) => {
    if (type === 'original' || !multi) {
      onChange({
        originalCount: type === 'original' ? qty : 0,
        proxyCount: type === 'proxy' ? qty : 0,
        unsleevedCount: type === 'unsleeved' ? qty : 0,
      })
      return
    }
    // Not yet in use: all copies become this type; then edit the number in place.
    if (splitCount(split, type) === 0) {
      onChange({
        originalCount: 0,
        proxyCount: type === 'proxy' ? qty : 0,
        unsleevedCount: type === 'unsleeved' ? qty : 0,
      })
    }
    onEditingTypeChange(type)
  }

  if (editing && (editing === 'proxy' || editing === 'unsleeved')) {
    return (
      <CopyCountStepper
        qty={qty}
        type={editing}
        value={splitCount(split, editing)}
        cardName={cardName}
        onChange={(n) => onChange(setSplitCount(split, editing, n, qty))}
        onClose={(refocus) => {
          if (refocus) refocusType.current = editing
          setAnnouncement(summary(split, cardName))
          onEditingTypeChange(null)
        }}
      />
    )
  }

  return (
    <>
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
              ref={(el) => {
                buttonRefs.current[type] = el
              }}
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
                'border-l border-[var(--border-default)] first:rounded-l-[calc(var(--radius-lg)-1px)] first:border-l-0 last:rounded-r-[calc(var(--radius-lg)-1px)]'
              )}
            >
              {selected && meta.icon}
              {meta.label}
              {isSplit(split) && selected && <span>{count}</span>}
            </button>
          )
        })}
      </span>
      <span className="sr-only" aria-live="polite" role="status">
        {announcement}
      </span>
    </>
  )
}
