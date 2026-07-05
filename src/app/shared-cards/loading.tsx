import { Skeleton } from '@/components/ui/skeleton'

export default function SharedCardsLoading() {
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-1 h-4 w-56" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <Skeleton className="size-12 rounded" />
            <Skeleton className="h-4 w-32" />
            <div className="flex-1" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
