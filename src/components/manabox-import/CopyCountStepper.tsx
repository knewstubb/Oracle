'use client'

import { useEffect, useRef } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CopyCountStepperProps {
  qty: number
  type: 'proxy' | 'unsleeved'
  value: number
  cardName: string
  onChange: (value: number) => void
  /** Collapse keeping the current number. `refocus` is true for keyboard collapse. */
  onClose: (refocus: boolean) => void
}

/** In-place count stepper that replaces a row's segments while editing. Never floats. */
export function CopyCountStepper({ qty, type, value, cardName, onChange, onClose }: CopyCountStepperProps) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const numberRef = useRef<HTMLSpanElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  const label = type === 'proxy' ? 'Proxy' : 'Unsleeved'
  const plural = type === 'proxy' ? 'proxies' : 'unsleeved'
  const remainder = qty - value

  useEffect(() => {
    numberRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closeRef.current(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const set = (n: number) => {
    const next = Math.max(1, Math.min(qty, n))
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
        set(1)
        break
      case 'End':
        e.preventDefault()
        set(qty)
        break
      case 'Enter':
      case ' ':
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        onClose(true)
        break
      case 'Tab':
        onClose(false)
        break
    }
  }

  const stepBtn =
    'inline-flex h-full w-[26px] items-center justify-center text-muted-foreground hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <span
      ref={rootRef}
      role="group"
      aria-label={`How many ${cardName} are ${plural}`}
      className="inline-flex h-6 items-center gap-2 text-[length:var(--fs-xs)]"
    >
      <span
        className={cn(
          'inline-flex h-6 items-center overflow-hidden rounded-lg border',
          type === 'proxy'
            ? 'border-[var(--status-proxy)] bg-[rgba(74,147,160,0.18)]'
            : 'border-[var(--text-secondary)]'
        )}
      >
        <span className="px-2 text-foreground">{label}</span>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Fewer ${plural}`}
          disabled={value <= 1}
          onClick={() => set(value - 1)}
          className={stepBtn}
        >
          <Minus className="size-3" aria-hidden="true" />
        </button>
        <span
          ref={numberRef}
          role="spinbutton"
          tabIndex={0}
          aria-label={type === 'proxy' ? 'Proxies' : 'Unsleeved'}
          aria-valuemin={1}
          aria-valuemax={qty}
          aria-valuenow={value}
          aria-valuetext={`${value} of ${qty}`}
          onKeyDown={onKeyDown}
          className="min-w-4 text-center font-medium tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {value}
        </span>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`More ${plural}`}
          disabled={value >= qty}
          onClick={() => set(value + 1)}
          className={stepBtn}
        >
          <Plus className="size-3" aria-hidden="true" />
        </button>
      </span>
      <span
        aria-live="polite"
        aria-atomic="true"
        className="inline-flex items-center gap-1 text-[var(--accent-primary)]"
      >
        <Check className="size-3" aria-hidden="true" />
        Original {remainder}
      </span>
    </span>
  )
}
