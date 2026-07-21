'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { StorageLocationsSettings } from '@/components/settings/storage-locations-settings'

interface LocationWithCount {
  id: number
  name: string
  color: string | null
  cardCount: number
}

interface StorageOverview {
  locations: LocationWithCount[]
  unsortedCount: number
}

export default function StoragePage() {
  const [showManage, setShowManage] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<StorageOverview>({
    queryKey: ['storage', 'overview'],
    queryFn: async () => {
      const res = await fetch('/api/storage/overview')
      if (!res.ok) throw new Error('Failed to load storage')
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
        <PageHeader title="Storage" subtitle="Where your cards live" />

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
              ))}
            </div>
          ) : (
            <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {/* Location tiles */}
              {(data?.locations ?? []).map((loc) => (
                <Link
                  key={loc.id}
                  href={`/storage/${loc.id}`}
                  className="group flex flex-col justify-between rounded-xl border border-[var(--border-default)] bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  {loc.color && (
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: loc.color }}
                      aria-hidden="true"
                    />
                  )}
                  <div className="mt-auto pt-6">
                    <span className="block text-[length:var(--fs-md)] font-medium text-foreground">
                      {loc.name}
                    </span>
                    <span className="text-[length:var(--fs-sm)] text-muted-foreground">
                      {loc.cardCount} card{loc.cardCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </Link>
              ))}

              {/* Unsorted tile (pinned) */}
              <Link
                href="/storage/unsorted"
                className="group flex flex-col justify-between rounded-xl border border-dashed border-[var(--border-default)] bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <span
                  className="size-3 rounded-full border border-dashed border-muted-foreground"
                  aria-hidden="true"
                />
                <div className="mt-auto pt-6">
                  <span className="block text-[length:var(--fs-md)] font-medium text-muted-foreground">
                    Unsorted
                  </span>
                  <span className="text-[length:var(--fs-sm)] text-muted-foreground">
                    {data?.unsortedCount ?? 0} card{(data?.unsortedCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </Link>

              {/* Manage locations button */}
              <button
                type="button"
                onClick={() => setShowManage(!showManage)}
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] p-4 text-muted-foreground transition-all hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
              >
                {showManage ? <Settings2 className="size-5" /> : <Plus className="size-5" />}
                <span className="mt-2 text-[length:var(--fs-sm)] font-medium">
                  {showManage ? 'Close' : 'Manage locations'}
                </span>
              </button>
            </div>

            {/* Inline Storage Locations CRUD panel */}
            {showManage && (
              <div className="mt-6 max-w-lg rounded-xl border border-[var(--border-default)] bg-card p-5">
                <StorageLocationsSettings />
              </div>
            )}
          </>
          )}
        </div>
      </div>
    </div>
  )
}
