import { Skeleton } from '@/components/ui/skeleton'

export default function CollectionLoading() {
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-1 h-4 w-52" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl bg-[#F6F3EE] dark:bg-card [box-shadow:0px_1px_3px_rgba(0,0,0,0.12),0px_4px_8px_3px_rgba(0,0,0,0.06)]"
          >
            <Skeleton className="aspect-[5/7] w-full rounded-none" />
            <div className="px-3 py-2 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
