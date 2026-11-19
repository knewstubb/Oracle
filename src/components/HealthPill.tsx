'use client'

import { Check, AlertTriangle } from 'lucide-react'

import type { HealthRange, Verdict } from '@/lib/deck-health'

export interface HealthPillProps {
  label: string
  have: number
  range: HealthRange | null
  verdict: Verdict | null
  onClick: () => void
}

/** Row pill: "Targeted Removal 6". Light and Heavy are amber with a warning icon; Ok is a quiet tick. The accessible name is a sentence. */
export function HealthPill({ label, have, range, verdict, onClick }: HealthPillProps) {
  const off = verdict === 'light' || verdict === 'heavy'
  const Icon = off ? AlertTriangle : Check
  const name = `${label} ${have}${range ? `, range ${range.min} to ${range.max}` : ', no range'}${verdict ? `, ${verdict}` : ''}`

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[length:var(--fs-sm)] font-medium cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-2 focus-visible:outline-white"
      style={{
        backgroundColor: off ? 'var(--signal-warning-bg)' : 'transparent',
        color: off ? 'var(--signal-warning)' : 'var(--text-secondary)',
      }}
    >
      <Icon size={12} aria-hidden="true" />
      <span>{label}</span>
      <span>{have}</span>
    </button>
  )
}
