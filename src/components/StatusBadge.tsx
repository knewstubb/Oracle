'use client'

import type { DeckStatus } from '@/lib/deck-status'

export interface StatusBadgeProps {
  status: DeckStatus
  className?: string
}

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ''}`}
      style={{ fontSize: '14px', fontWeight: 300 }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}

const CONFIG: Record<DeckStatus, { label: string; icon: string; colorClass: string; bgClass: string }> = {
  brewing: {
    label: 'Brewing',
    icon: 'science',
    colorClass: 'text-[#378ADD]',
    bgClass: 'bg-[rgba(55,138,221,0.15)]',
  },
  in_rotation: {
    label: 'In Rotation',
    icon: 'check_circle',
    colorClass: 'text-[var(--accent-primary)]',
    bgClass: 'bg-[var(--accent-primary-bg)]',
  },
  graveyard: {
    label: 'Graveyard',
    icon: 'tombstone',
    colorClass: 'text-[var(--text-secondary)]',
    bgClass: 'bg-[rgba(255,255,255,0.08)]',
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, icon, colorClass, bgClass } = CONFIG[status]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-md)] font-[number:var(--font-medium)] ${colorClass} ${bgClass} ${className ?? ''}`}
      aria-label={`Status: ${label}`}
    >
      <MaterialIcon name={icon} />
      {label}
    </span>
  )
}
