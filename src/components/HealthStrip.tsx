'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { HealthPill } from '@/components/HealthPill'
import type { HealthPillCategory } from '@/components/HealthPill'
import {
  selectMostSevereViolation,
  formatContextualNote,
} from '@/lib/health-engine'
import type { CategoryHealth, HealthResult } from '@/lib/health-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthStripProps {
  deckId: number
  onPillClick: (category: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map API status ('green' | 'amber' | 'red') to HealthPill status ('ok' | 'warn' | 'crit') */
function mapStatus(status: string): 'ok' | 'warn' | 'crit' {
  switch (status) {
    case 'amber':
      return 'warn'
    case 'red':
      return 'crit'
    default:
      return 'ok'
  }
}

/** Convert CategoryHealth from the API into the shape HealthPill expects */
function toPillCategory(cat: CategoryHealth): HealthPillCategory {
  return {
    name: cat.category,
    count: cat.actual,
    status: mapStatus(cat.status),
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HealthStrip({ deckId, onPillClick }: HealthStripProps) {
  const { data, isLoading, isError } = useQuery<HealthResult>({
    queryKey: ['decks', deckId, 'health'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health`)
      if (!res.ok) throw new Error('Failed to fetch health data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Determine if any violations exist for the contextual note
  const violation = data ? selectMostSevereViolation(data.categories) : null
  const contextualNote = violation ? formatContextualNote(violation) : null

  return (
    <div
      className="sticky z-[29] flex items-center gap-2 px-6 py-2"
      style={{
        top: 'var(--header-height, 64px)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      {/* Loading state: skeleton pills */}
      {isLoading && (
        <>
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </>
      )}

      {/* Error state */}
      {isError && (
        <span className="text-[length:var(--fs-sm)] text-muted-foreground">
          Unable to load health data
        </span>
      )}

      {/* Render pills when data is loaded */}
      {data &&
        data.categories.map((cat) => (
          <HealthPill
            key={cat.category}
            category={toPillCategory(cat)}
            onClick={() => onPillClick(cat.category)}
          />
        ))}

      {/* Contextual note — right-aligned, only when violations exist */}
      {contextualNote && (
        <span className="ml-auto inline-flex items-center gap-1 text-[length:var(--fs-sm)] text-[var(--color-amber)]">
          <AlertTriangle size={12} aria-hidden="true" />
          {contextualNote}
        </span>
      )}
    </div>
  )
}
