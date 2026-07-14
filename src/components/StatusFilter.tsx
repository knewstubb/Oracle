'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { VALID_STATUSES, type DeckStatus } from '@/lib/deck-status'

const CHIP_CONFIG: Record<DeckStatus, { label: string; color: string; bg: string; borderColor: string }> = {
  brew: {
    label: 'Brew',
    color: 'var(--accent-primary)',
    bg: 'var(--accent-primary-bg)',
    borderColor: 'rgba(29, 158, 117, 0.4)',
  },
  boxed: {
    label: 'Boxed',
    color: 'var(--accent-primary)',
    bg: 'var(--accent-primary-bg)',
    borderColor: 'rgba(29, 158, 117, 0.4)',
  },
  archived: {
    label: 'Archived',
    color: 'var(--text-secondary)',
    bg: 'var(--bg-card)',
    borderColor: 'var(--border-default)',
  },
}

/**
 * Parses the `?status=` URL query param into an array of selected statuses.
 * Returns an empty array if no filter is applied (show all).
 */
export function parseStatusFilter(searchParams: URLSearchParams): DeckStatus[] {
  const raw = searchParams.get('status')
  if (!raw) return []
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter((s): s is DeckStatus => VALID_STATUSES.includes(s as DeckStatus))
}

export interface StatusFilterProps {
  className?: string
}

export function StatusFilter({ className }: StatusFilterProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const selected = parseStatusFilter(searchParams)

  const toggle = useCallback(
    (status: DeckStatus) => {
      const params = new URLSearchParams(searchParams.toString())
      let next: DeckStatus[]

      if (selected.includes(status)) {
        // Remove this status from the filter
        next = selected.filter(s => s !== status)
      } else {
        // Add this status to the filter
        next = [...selected, status]
      }

      // If all statuses are selected or none, clear the param (show all)
      if (next.length === 0 || next.length === VALID_STATUSES.length) {
        params.delete('status')
      } else {
        params.set('status', next.join(','))
      }

      const query = params.toString()
      router.replace(query ? `?${query}` : '/', { scroll: false })
    },
    [searchParams, selected, router]
  )

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`} role="group" aria-label="Filter decks by status">
      {VALID_STATUSES.map(status => {
        const { label, color, bg, borderColor } = CHIP_CONFIG[status]
        const isSelected = selected.length === 0 || selected.includes(status)

        return (
          <button
            key={status}
            type="button"
            onClick={() => toggle(status)}
            aria-pressed={selected.length > 0 && selected.includes(status)}
            className="inline-flex items-center rounded-full px-3 py-1 text-[length:var(--fs-md)] font-medium transition-all"
            style={{
              backgroundColor: isSelected ? bg : 'transparent',
              color: isSelected ? color : 'var(--text-tertiary)',
              border: `1px solid ${isSelected ? borderColor : 'var(--border-default)'}`,
              opacity: isSelected ? 1 : 0.5,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
