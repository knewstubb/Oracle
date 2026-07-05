'use client'

import { cn } from '@/lib/utils'

interface ManaCostProps {
  cost: string
  className?: string
}

export function ManaCost({ cost, className }: ManaCostProps) {
  if (!cost) return null

  return (
    <span
      className={cn('font-mono text-sm text-muted-foreground', className)}
      aria-label={`Mana cost: ${cost}`}
    >
      {cost}
    </span>
  )
}
