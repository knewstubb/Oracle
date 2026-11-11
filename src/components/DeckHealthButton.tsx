'use client'

import { Check, AlertTriangle } from 'lucide-react'

export interface DeckHealthButtonProps {
  /** 'light' when any role is light. */
  state: 'light' | 'ok'
  /** The verdict headline, so screen readers hear it without opening the panel. */
  headline: string
  onClick: () => void
}

export function DeckHealthButton({ state, headline, onClick }: DeckHealthButtonProps) {
  const light = state === 'light'
  const Icon = light ? AlertTriangle : Check
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`Deck health: ${headline}`}
      className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[length:var(--fs-sm)] font-medium cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-2 focus-visible:outline-white"
      style={{
        borderColor: light ? 'var(--signal-warning)' : 'var(--border-default)',
        backgroundColor: light ? 'var(--signal-warning-bg)' : 'transparent',
        color: light ? 'var(--signal-warning)' : 'var(--text-primary)',
      }}
    >
      <Icon size={14} aria-hidden="true" />
      <span>Deck health</span>
    </button>
  )
}
