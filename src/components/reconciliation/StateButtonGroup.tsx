'use client'

import { cn } from '@/lib/utils'
import type { InstanceState } from '@/types/import-reconciliation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StateButtonGroupProps {
  /** Current state for this instance. */
  value: InstanceState
  /** Available states. Owned = planned/sleeved/proxy; unowned = planned/proxy. */
  options: readonly InstanceState[]
  /** Called when the user selects a new state. */
  onChange: (value: InstanceState) => void
  /** Accessible label describing what this group controls. */
  'aria-label': string
  /** Whether the group is disabled (e.g. while a mutation is pending). */
  disabled?: boolean
  /** Per-option disabled predicate. */
  isOptionDisabled?: (option: InstanceState) => boolean
  /** Optional tooltip/label for why an option is disabled. */
  disabledReason?: string
}


// ---------------------------------------------------------------------------
// Copy and styles
// ---------------------------------------------------------------------------

const STATE_COPY: Record<InstanceState, string> = {
  planned: 'Planned',
  sleeved: 'Sleeved',
  proxy: 'Proxy',
}

const STATE_COLORS: Record<InstanceState, { active: string; dot: string }> = {
  planned: {
    active: 'bg-[var(--text-secondary)] text-white',
    dot: 'border-[var(--text-secondary)] bg-transparent',
  },
  sleeved: {
    active: 'bg-[var(--signal-success)] text-white',
    dot: 'bg-[var(--signal-success)]',
  },
  proxy: {
    active: 'bg-[var(--status-proxy)] text-white',
    dot: 'bg-[var(--status-proxy)]',
  },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StateButtonGroup({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  disabled,
  isOptionDisabled,
  disabledReason,
}: StateButtonGroupProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded-lg border border-[var(--border-default)]"
    >
      {options.map((option) => {
        const selected = value === option
        const optionDisabled = disabled || isOptionDisabled?.(option)
        const colors = STATE_COLORS[option]
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={optionDisabled}
            title={optionDisabled && disabledReason ? disabledReason : undefined}
            disabled={optionDisabled}
            onClick={() => onChange(option)}
            className={cn(
              'px-2.5 py-1.5 text-[length:var(--fs-xs)] font-semibold transition-colors',
              'border-r border-[var(--border-default)] last:border-r-0',
              'hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
              'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              selected ? colors.active : 'text-[var(--text-secondary)] hover:bg-white/[0.04]'
            )}
          >
            {STATE_COPY[option]}
          </button>
        )
      })}
    </div>
  )
}
