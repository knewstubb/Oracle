'use client'

export type OwnershipStatus = 'original' | 'proxy' | null

export interface OwnershipBadgeProps {
  status: OwnershipStatus
  holderDeckName?: string
  className?: string
}

const CONFIG = {
  original: { glyph: '●', label: 'Original', color: 'text-teal-600', bg: 'bg-teal-50' },
  proxy:    { glyph: '◐', label: 'Proxy',    color: 'text-amber-600', bg: 'bg-amber-50' },
} as const

export function OwnershipBadge({ status, holderDeckName, className }: OwnershipBadgeProps) {
  if (!status) return null
  const { glyph, label, color, bg } = CONFIG[status]

  const ariaLabel =
    status === 'proxy' && holderDeckName
      ? `${label} — Original held by ${holderDeckName}`
      : label

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-sm)] font-medium ${color} ${bg} ${className ?? ''}`}
      aria-label={ariaLabel}
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  )
}
