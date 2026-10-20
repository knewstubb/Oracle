'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CardDataStatus } from '@/lib/card-data-status'

export const CARD_DATA_STATUS_KEY = ['card-data-status'] as const

async function fetchStatus(): Promise<CardDataStatus> {
  const res = await fetch('/api/card-data/refresh')
  if (!res.ok) throw new Error('Could not read card data status')
  return res.json()
}

/**
 * Card data freshness. Polls every 2s while a refresh is running so the
 * Settings page can show progress.
 */
export function useCardDataStatus() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: CARD_DATA_STATUS_KEY,
    queryFn: fetchStatus,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.refresh.phase === 'running' ? 2000 : false),
  })
  return {
    ...query,
    isStale: query.data?.isStale ?? false,
    ageDays: query.data?.ageDays ?? null,
    invalidate: () => queryClient.invalidateQueries({ queryKey: CARD_DATA_STATUS_KEY }),
  }
}
