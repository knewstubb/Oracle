'use client'
import { forwardRef } from 'react'
import { Button } from '@/components/ui/button'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { cn } from '@/lib/utils'

/** The small accent "Edit" link at the right of a rail section label (10 / 500). One component for every rail section. */
export const RailEditLink = forwardRef<HTMLButtonElement, { label: string; onClick: () => void }>(function RailEditLink({ label, onClick }, ref) {
  return (
    <Button ref={ref} type="button" variant="link" size="xs" aria-haspopup="dialog" aria-label={label} onClick={onClick} className={cn('h-auto px-1 py-1 text-[10px] font-medium text-[var(--accent-primary-text)]', FOCUS_RING)}>
      Edit
    </Button>
  )
})
