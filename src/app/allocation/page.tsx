'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { CollectionRollupTab } from '@/components/collection/CollectionRollupTab'

export default function AllocationPage() {
  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      {/* Max-width container: 1520px centered, fluid below */}
      <div className="mx-auto flex h-full w-full max-w-[1520px] flex-col">
        {/* ─── Page Header ─────────────────────────────────────────── */}
        <PageHeader
          title="Cards"
          subtitle="Allocation status and proxy assignment across all decks"
          actions={
            <Link
              href="/collection"
              className="text-[length:var(--fs-sm)] font-medium text-[var(--accent-primary)] hover:underline"
            >
              View full collection →
            </Link>
          }
        />

        {/* ─── Page Content ────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">
          <CollectionRollupTab />
        </div>
      </div>
    </div>
  )
}
