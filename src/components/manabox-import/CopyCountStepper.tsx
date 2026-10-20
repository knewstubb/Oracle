'use client'

import { Minus, Plus, VenetianMask } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CopyCountStepperProps {
  qty: number
  type: 'proxy' | 'unsleeved'
  value: number
  cardName: string
  onChange: (value: number) => void
}

/** Always-visible count stepper shown inside a row's own segment when the row has 2+ copies. */
export function CopyCountStepper({ qty, type, value, cardName, onChange }: CopyCountStepperProps) {
  const label = type === 'proxy' ? 'Proxy' : 'Unsleeved'
  const plural = type === 'proxy' ? 'proxies' : 'unsleeved'

  const set = (n: number) => {
    const next = Math.max(0, Math.min(qty, n))
    if (next !== value) onChange(next)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
      case '+':
      case '=':
        e.preventDefault()
        set(value + 1)
        break
      case 'ArrowDown':
      case 'ArrowLeft':
      case '-':
      case '_':
        e.preventDefault()
        set(value - 1)
        break
      case 'Home':
        e.preventDefault()
        set(0)
        break
      case 'End':
        e.preventDefault()
        set(qty)
        break
    }
  }

  const stepBtn =
    'inline-flex h-full w-4 items-center justify-center text-muted-foreground hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <span
      role="group"
      aria-label={`How many ${cardName} are ${plural}`}
      className="inline-flex h-full items-center"
    >
      <span className="inline-flex items-center gap-1 pl-2 pr-1">
        {type === 'proxy' && <VenetianMask className="size-3" aria-hidden="true" />}
        {label}
      </span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Fewer ${plural}`}
        disabled={value <= 0}
        onClick={() => set(value - 1)}
        className={stepBtn}
      >
        <Minus className="size-3" aria-hidden="true" />
      </button>
      <span
        role="spinbutton"
        tabIndex={0}
        aria-label={type === 'proxy' ? 'Proxies' : 'Unsleeved'}
        aria-valuemin={0}
        aria-valuemax={qty}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${qty}`}
        onKeyDown={onKeyDown}
        className="min-w-3 text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {value}
      </span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`More ${plural}`}
        disabled={value >= qty}
        onClick={() => set(value + 1)}
        className={cn(stepBtn, 'mr-1')}
      >
        <Plus className="size-3" aria-hidden="true" />
      </button>
    </span>
  )
}
