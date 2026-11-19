import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading placeholders that mirror the real deck page (rail, tabs, Cards
 * toolbar, grouped card list) so nothing shifts
 * when the data arrives. Keep the wrappers/spacing in sync with
 * decks/[id]/page.tsx, CardsTab and PicklistProgress.
 */

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
    <div className="@container relative h-full overflow-y-auto bg-[var(--bg-canvas)] @[800px]:overflow-hidden" aria-busy="true" aria-label="Loading deck">
      <div className="relative z-10 flex min-h-full flex-col @[800px]:h-full @[800px]:flex-row">
        {/* Rail: 64px bar at narrow widths, 304px column at wide widths */}
        <div className="w-full shrink-0 border-b @[800px]:h-full @[800px]:w-[304px] @[800px]:border-b-0 @[800px]:border-r">
          <div className="flex h-16 items-center gap-3 px-4 @[800px]:hidden">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="hidden space-y-5 px-4 py-4 @[800px]:block">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col @[800px]:min-h-0">
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
          {/* Cards tab: toolbar, groups */}
          <div className="min-h-0 flex-1 px-6 py-6 @[800px]:overflow-hidden">
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
                <GroupsSkeleton />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
