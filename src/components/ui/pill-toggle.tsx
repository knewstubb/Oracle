'use client'

import { cn } from '@/lib/utils'

export type PillToggleTone = 'amber' | 'teal' | 'blue'

export interface PillToggleOption<T extends string> {
  value: T
  label: string
  tone: PillToggleTone
  disabled?: boolean
  title?: string
}

interface PillToggleProps<T extends string> {
  options: readonly PillToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  'aria-label': string
  className?: string
}

const ACTIVE_STYLE: Record<PillToggleTone, { background: string; color: string }> = {
  amber: { background: 'rgba(239,159,39,0.2)', color: '#ef9f27' },
  teal: { background: 'rgba(20,184,166,0.2)', color: '#14b8a6' },
  blue: {
    background: 'color-mix(in srgb, var(--status-proxy) 22%, transparent)',
    color: 'var(--status-proxy)',
  },
}

export function PillToggle<T extends string>({
  options,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  className,
}: PillToggleProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-full p-0.5 transition-colors',
        disabled && 'pointer-events-none opacity-40',
        className
      )}
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      {options.map((option) => {
        const selected = option.value === value
        const optionDisabled = disabled || option.disabled
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.disabled ? option.title : undefined}
            disabled={optionDisabled}
            onClick={() => {
              if (!selected) onChange(option.value)
            }}
            className="rounded-full px-2.5 py-1 text-[length:var(--fs-xs)] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
            style={selected ? ACTIVE_STYLE[option.tone] : { color: 'rgba(255,255,255,0.4)' }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
