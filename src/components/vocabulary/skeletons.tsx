'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Shaped skeletons (D-043)
//
// These mirror the exact shape of the content they replace so that first
// loads feel like a preview rather than a generic spinner.
// ---------------------------------------------------------------------------

export interface DeckTileSkeletonProps {
  className?: string
}

export interface CardRowSkeletonProps {
  className?: string
}

export interface BadgeSkeletonProps {
  className?: string
}

/**
 * Skeleton shaped like a deck tile: art block + two text lines + count.
 */
export function DeckTileSkeleton({ className }: DeckTileSkeletonProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        className
      )}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
      }}
      aria-label="Loading deck"
    >
      <Skeleton
        className="h-28 w-full rounded-md"
        style={{ backgroundColor: 'var(--border-default)' }}
      />
      <div className="flex flex-col gap-1.5">
        <Skeleton
          className="h-4 w-3/4 rounded"
          style={{ backgroundColor: 'var(--border-default)' }}
        />
        <Skeleton
          className="h-3 w-1/2 rounded"
          style={{ backgroundColor: 'var(--border-default)' }}
        />
      </div>
      <Skeleton
        className="mt-1 h-3 w-16 rounded"
        style={{ backgroundColor: 'var(--border-default)' }}
      />
    </div>
  )
}

/**
 * Skeleton shaped like a card list row: badge-pill placeholder + text lines.
 */
export function CardRowSkeleton({ className }: CardRowSkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2',
        className
      )}
      style={{ height: 'var(--row-height)' }}
      aria-label="Loading card row"
    >
      <Skeleton
        className="h-5 w-20 rounded-full"
        style={{ backgroundColor: 'var(--border-default)' }}
      />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton
          className="h-3.5 w-1/3 rounded"
          style={{ backgroundColor: 'var(--border-default)' }}
        />
        <Skeleton
          className="h-3 w-1/4 rounded"
          style={{ backgroundColor: 'var(--border-default)' }}
        />
      </div>
    </div>
  )
}

/**
 * Skeleton shaped like a small badge pill.
 */
export function BadgeSkeleton({ className }: BadgeSkeletonProps) {
  return (
    <Skeleton
      className={cn('inline-block h-5 w-16 rounded-full', className)}
      style={{ backgroundColor: 'var(--border-default)' }}
      aria-label="Loading badge"
    />
  )
}
