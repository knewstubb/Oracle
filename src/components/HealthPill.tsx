'use client'

import { Check, AlertTriangle, AlertCircle } from 'lucide-react'

export interface HealthPillCategory {
  name: string
  count: number
  status: 'ok' | 'warn' | 'crit'
}

interface HealthPillProps {
  category: HealthPillCategory
  onClick: () => void
}

const statusConfig = {
  ok: {
    Icon: Check,
    color: 'var(--color-teal)',
    bg: 'transparent',
  },
  warn: {
    Icon: AlertTriangle,
    color: 'var(--color-amber)',
    bg: 'var(--color-amber-bg)',
  },
  crit: {
    Icon: AlertCircle,
    color: 'var(--color-red)',
    bg: 'var(--color-red-bg)',
  },
} as const

export function HealthPill({ category, onClick }: HealthPillProps) {
  const { Icon, color, bg } = statusConfig[category.status]

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[length:var(--fs-sm)] font-medium cursor-pointer transition-opacity hover:opacity-80"
      style={{ backgroundColor: bg, color }}
      aria-label={`${category.status} ${category.name} ${category.count}`}
    >
      <Icon size={12} aria-hidden="true" />
      <span>{category.name}</span>
      <span>{category.count}</span>
    </button>
  )
}
