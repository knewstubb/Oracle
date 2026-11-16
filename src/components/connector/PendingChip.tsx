'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Pause } from 'lucide-react'
import { connectorKeys, fetchPendingCount } from './api'

/** Quiet header chip. Rendered only while something waits; a failed count shows nothing (the Recent changes tab says so). */
export function PendingChip() {
  const { data } = useQuery({
    queryKey: connectorKeys.pendingCount,
    queryFn: fetchPendingCount,
    retry: false,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  if (!data || data <= 0) return null
  return (
    <Link
      href="/settings/claude-connector?tab=changes#waiting"
      data-testid="pending-chip"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-[length:var(--fs-sm)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
      style={{ borderColor: 'var(--signal-warning, #EF9F27)', backgroundColor: 'rgba(239, 159, 39, 0.15)' }}
    >
      <Pause className="size-3.5" aria-hidden="true" />
      <span>{data} Claude is waiting for your yes</span>
    </Link>
  )
}
