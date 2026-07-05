import { Skeleton } from '@/components/ui/skeleton'

export default function NewDeckLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Skeleton className="mb-2 h-8 w-32" />
      <div className="mb-8 flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-16" />
            {i < 3 && <Skeleton className="mx-2 h-px w-8" />}
          </div>
        ))}
      </div>
      <Skeleton className="mb-4 h-10 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[5/7] w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
