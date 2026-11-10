import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading placeholders that mirror the real deck page (header, tabs, Cards
 * toolbar, progress bar, grouped card list, health strip) so nothing shifts
 * when the data arrives. Keep the wrappers/spacing in sync with
 * decks/[id]/page.tsx, CardsTab and PicklistProgress.
 */

/** Same box as PicklistProgress (label row + legend + 8px bar). */
export function ProgressBarSkeleton() {
  return (
    <div
      className="mb-6 rounded-lg border border-white/[0.08] px-4 py-3"
      style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}
      aria-hidden="true"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-2 flex-1 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-md" />
      </div>
    </div>
  )
}

function GroupSectionSkeleton({ rows }: { rows: number }) {
  return (
    <div
      className="rounded-lg border border-white/[0.08]"
      style={{ backgroundColor: 'rgba(26,26,30,0.5)' }}
    >
      <div className="flex items-center border-b px-3 py-2" style={{ borderColor: 'var(--border-default)' }}>
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex flex-col py-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1.5">
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-20 sm:block" />
            <Skeleton className="size-4 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupsSkeleton() {
  const columns = [[6, 4], [8, 3], [5, 5]]
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {columns.map((sections, c) => (
        <div key={c} className="flex flex-col gap-3">
          {sections.map((rows, s) => (
            <GroupSectionSkeleton key={s} rows={rows} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function DeckViewSkeleton() {
  return (
    <div className="relative flex h-full flex-col bg-[var(--bg-canvas)]" aria-busy="true" aria-label="Loading deck">
      <div className="relative z-10 flex h-full flex-col">
        {/* Persistent header */}
        <div className="px-6 py-4">
          <div className="mx-auto flex max-w-[var(--content-max-width)] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-44" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 border-b border-border px-6">
          <div className="mx-auto flex max-w-[var(--content-max-width)] items-center gap-4 py-2">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="hidden h-5 w-20 sm:block" />
            <Skeleton className="hidden h-5 w-16 sm:block" />
            <Skeleton className="hidden h-5 w-16 sm:block" />
          </div>
        </div>

        {/* Cards tab: toolbar, progress bar, groups */}
        <div className="min-h-0 flex-1 overflow-hidden px-6 py-6">
          <div className="mx-auto max-w-[var(--content-max-width)]">
            <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }}>
              <div className="flex items-center gap-2 md:gap-3">
                <Skeleton className="h-8 w-[260px] max-w-full" />
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-8 w-24 rounded-full" />
                <div className="flex-1" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
            <div className="px-4 py-4">
              <ProgressBarSkeleton />
              <GroupsSkeleton />
            </div>
          </div>
        </div>

        {/* Health strip */}
        <div className="shrink-0 border-t px-6 py-2" style={{ borderColor: 'var(--border-default)' }}>
          <div className="mx-auto flex max-w-[var(--content-max-width)] items-center gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}
