import { Skeleton } from '@/components/ui/skeleton'

export default function RootLoading() {
  return (
    <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-border">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
