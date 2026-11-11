'use client'

import { Check, AlertTriangle } from 'lucide-react'

export type HealthPillState = 'ok' | 'light'

export interface HealthPillProps {
  label: string
  have: number
  typical: number
  state: HealthPillState
  isGeneralGuide: boolean
  onClick: () => void
}

/** Role pill: "Removal 3/6". Light is amber with a warning icon; on track is a quiet tick. The accessible name is a sentence. */
export function HealthPill({ label, have, typical, state, isGeneralGuide, onClick }: HealthPillProps) {
  const light = state === 'light'
  const short = Math.max(0, typical - have)
  const Icon = light ? AlertTriangle : Check
  const name = `${label} ${have} of ${typical}${isGeneralGuide ? ' (general guide)' : ''}, ${light ? `light, ${short} short` : 'on track'}`

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[length:var(--fs-sm)] font-medium cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-2 focus-visible:outline-white"
      style={{
        backgroundColor: light ? 'var(--signal-warning-bg)' : 'transparent',
        color: light ? 'var(--signal-warning)' : 'var(--text-secondary)',
      }}
    >
      <Icon size={12} aria-hidden="true" />
      <span>{label}</span>
      <span>
        {have}/{typical}
      </span>
    </button>
  )
}
