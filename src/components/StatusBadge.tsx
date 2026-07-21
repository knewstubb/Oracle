'use client'

import type { DeckStatus } from '@/lib/deck-status'

export interface StatusBadgeProps {
  status: DeckStatus
  className?: string
}

const CONFIG: Record<DeckStatus, { label: string; colorClass: string; bgClass: string }> = {
  brewing: {
    label: 'Brewing',
    colorClass: 'text-[#378ADD]',
    bgClass: 'bg-[rgba(55,138,221,0.15)]',
  },
  in_rotation: {
    label: 'In Rotation',
    colorClass: 'text-[var(--accent-primary)]',
    bgClass: 'bg-[var(--accent-primary-bg)]',
  },
  graveyard: {
    label: 'Graveyard',
    colorClass: 'text-[var(--text-secondary)]',
    bgClass: 'bg-[rgba(255,255,255,0.08)]',
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, colorClass, bgClass } = CONFIG[status]

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--fs-md)] font-[number:var(--font-medium)] ${colorClass} ${bgClass} ${className ?? ''}`}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  )
}
