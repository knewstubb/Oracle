'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  selectMostSevereViolation,
  formatContextualNote,
} from '@/lib/health-engine'
import type { CategoryHealth, HealthResult, HealthStatus } from '@/lib/health-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthBarProps {
  deckId: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map health status to Tailwind colour classes per the design spec */
function statusClasses(status: HealthStatus): string {
  switch (status) {
    case 'green':
      return 'bg-emerald-500/15 text-emerald-700'
    case 'amber':
      return 'bg-amber-500/15 text-amber-700'
    case 'red':
      return 'bg-red-500/15 text-red-700'
  }
}

/** Scroll to the corresponding category section in the deck view */
function scrollToCategory(category: string) {
  const sectionId = `health-category-${category.toLowerCase().replace(/\s+/g, '-')}`
  const element = document.getElementById(sectionId)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HealthBar({ deckId }: HealthBarProps) {
  const queryClient = useQueryClient()

  // Fetch health data
  const { data, isLoading, isError } = useQuery<HealthResult>({
    queryKey: ['decks', deckId, 'health'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health`)
      if (!res.ok) throw new Error('Failed to fetch health data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Recheck mutation
  const recheckMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health/recheck`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Recheck failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
    },
  })

  // Determine contextual note
  const violation = data ? selectMostSevereViolation(data.categories) : null
  const contextualNote = violation ? formatContextualNote(violation) : null

  return (
    <div className="w-full border-b border-border/40 px-6 py-2">
      {/* Loading state: skeleton pills */}
      {isLoading && (
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-22 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      )}

      {/* Error state: hide pills */}
      {isError && null}

      {/* Render pills + recheck button when data is loaded */}
      {data && (
        <>
          <div className="flex items-center gap-2">
            {/* Pill strip */}
            <div className="inline-flex flex-row flex-wrap items-center gap-1.5">
              {data.categories.map((cat: CategoryHealth) => (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => scrollToCategory(cat.category)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[length:var(--fs-sm)] font-medium transition-opacity hover:opacity-80 cursor-pointer ${statusClasses(cat.status)}`}
                  aria-label={`${cat.category}: ${cat.actual} cards, status ${cat.status}`}
                >
                  <span>{cat.category}</span>
                  <span className="font-medium">{cat.actual}</span>
                </button>
              ))}
            </div>

            {/* Recheck button — right end of pill row */}
            <button
              type="button"
              onClick={() => recheckMutation.mutate()}
              disabled={recheckMutation.isPending}
              aria-label={recheckMutation.isPending ? 'Rechecking health...' : 'Recheck deck health'}
              className="ml-auto inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {recheckMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Contextual note — only shown when non-green categories exist */}
          {contextualNote && (
            <p className="mt-1 text-[length:var(--fs-sm)] text-amber-700 dark:text-amber-400">
              {contextualNote}
            </p>
          )}
        </>
      )}
    </div>
  )
}
