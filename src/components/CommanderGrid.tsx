'use client'

import { Loader2, Search, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CommanderCard, type CommanderData } from './CommanderCard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommanderGridProps {
  /** Commanders to display */
  commanders: CommanderData[]
  /** Loading state */
  isLoading?: boolean
  /** Error message */
  error?: string | null
  /** Callback when a commander is selected */
  onSelect?: (commander: CommanderData) => void
  /** Currently selected commander key */
  selectedKey?: string | null
  /** Section title */
  title?: string
  /** Empty state message */
  emptyMessage?: string
  /** Optional refresh callback for featured commanders */
  onRefresh?: () => void
  /** Whether refresh is loading */
  isRefreshing?: boolean
  /** Use compact card mode */
  compact?: boolean
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function CommanderCardSkeleton() {
  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/30 animate-pulse">
      {/* Art placeholder */}
      <div className="aspect-[4/3] bg-zinc-700/50 rounded-t-xl" />
      {/* Info placeholder */}
      <div className="p-3 space-y-2">
        <div className="h-4 bg-zinc-700/50 rounded w-3/4" />
        <div className="h-3 bg-zinc-700/50 rounded w-1/2" />
      </div>
    </div>
  )
}

function CompactCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 animate-pulse">
      <div className="w-10 h-14 bg-zinc-700/50 rounded shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-zinc-700/50 rounded w-3/4" />
        <div className="h-3 bg-zinc-700/50 rounded w-1/2" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CommanderGrid
// ---------------------------------------------------------------------------

/**
 * Responsive grid of commander cards with loading/empty states.
 * Supports both full card and compact list modes.
 */
export function CommanderGrid({
  commanders,
  isLoading = false,
  error = null,
  onSelect,
  selectedKey = null,
  title,
  emptyMessage = "No commanders found",
  onRefresh,
  isRefreshing = false,
  compact = false,
}: CommanderGridProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {title && (
          <h2 className="text-sm font-medium text-zinc-400">{title}</h2>
        )}
        {compact ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <CompactCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <CommanderCardSkeleton key={i} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        {title && (
          <h2 className="text-sm font-medium text-zinc-400">{title}</h2>
        )}
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <p className="text-sm text-red-400">{error}</p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={cn(
                'mt-4 flex items-center gap-2 px-3 py-1.5 rounded-lg',
                'text-sm text-zinc-400 hover:text-zinc-200',
                'bg-zinc-800 hover:bg-zinc-700 transition-colors'
              )}
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  // Empty state
  if (commanders.length === 0) {
    return (
      <div className="space-y-4">
        {title && (
          <h2 className="text-sm font-medium text-zinc-400">{title}</h2>
        )}
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
            <Search className="w-5 h-5 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-500">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  // Content
  return (
    <div className="space-y-4">
      {/* Header with optional refresh */}
      {(title || onRefresh) && (
        <div className="flex items-center justify-between">
          {title && (
            <h2 className="text-sm font-medium text-zinc-400">{title}</h2>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md',
                'text-xs text-zinc-500 hover:text-zinc-300',
                'hover:bg-zinc-800 transition-colors',
                isRefreshing && 'opacity-50 cursor-not-allowed'
              )}
              title="Show different commanders"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
              Shuffle
            </button>
          )}
        </div>
      )}

      {/* Grid or list */}
      {compact ? (
        <div className="space-y-2">
          {commanders.map(commander => (
            <CommanderCard
              key={commander.canonical_key}
              commander={commander}
              onSelect={onSelect}
              selected={selectedKey === commander.canonical_key}
              compact
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {commanders.map(commander => (
            <CommanderCard
              key={commander.canonical_key}
              commander={commander}
              onSelect={onSelect}
              selected={selectedKey === commander.canonical_key}
            />
          ))}
        </div>
      )}
    </div>
  )
}
