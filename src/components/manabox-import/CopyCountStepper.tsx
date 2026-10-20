'use client'

import { useEffect, useRef } from 'react'
import { Minus, Plus, VenetianMask } from 'lucide-react'
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

/** Count stepper that replaces the label inside the row's own segment while editing. Never floats. */
export function CopyCountStepper({ qty, type, value, cardName, onChange, onClose }: CopyCountStepperProps) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const numberRef = useRef<HTMLSpanElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  const label = type === 'proxy' ? 'Proxy' : 'Unsleeved'
  const plural = type === 'proxy' ? 'proxies' : 'unsleeved'

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
    'inline-flex h-full w-4 items-center justify-center text-muted-foreground hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <span
      ref={rootRef}
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
        ref={numberRef}
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
