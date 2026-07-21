import { Skeleton } from '@/components/ui/skeleton'

export default function DeckLoading() {
  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-[var(--content-max-width)] items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </header>
      <div className="flex-1 px-6 py-6">
        <div className="mx-auto max-w-[var(--content-max-width)]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 15 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[5/7] w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
