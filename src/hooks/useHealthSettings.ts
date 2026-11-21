'use client'
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import { DEFAULT_SETTINGS, UNAVAILABLE_SETTINGS, type HealthSettings } from '@/lib/deck-health-settings'
import type { HealthSettingsAction } from '@/lib/deck-health-settings-server'

export const healthSettingsKey = (deckId: number) => [...deckKeys.detail(deckId), 'health-settings'] as const
const SAVE_FAILED = "Couldn't save. Your changes are still here and nothing was lost."

/**
 * The deck's health targets. A failed read shows the defaults, never an error: the rail must always have something to show.
 * `act` sends one change and puts the answer in the cache.
 */
export function useHealthSettings(deckId: number) {
  const qc = useQueryClient()
  const query = useQuery<HealthSettings>({
    queryKey: healthSettingsKey(deckId),
    queryFn: async () => {
      try {
        const res = await fetch(`/api/decks/${deckId}/health-settings`)
        if (!res.ok) return UNAVAILABLE_SETTINGS
        const body = (await res.json()) as Partial<HealthSettings> | null
        // Anything that is not the settings shape (an error body, a proxy page) counts as not available.
        if (!body || typeof body.mode !== 'string' || !Array.isArray(body.categories) || !body.overrides || typeof body.overrides !== 'object') return UNAVAILABLE_SETTINGS
        return body as HealthSettings
      } catch {
        return UNAVAILABLE_SETTINGS
      }
    },
    staleTime: 60 * 1000,
  })
  const act = useCallback(
    async (action: HealthSettingsAction): Promise<{ ok: true; settings: HealthSettings } | { ok: false; error: string }> => {
      let res: Response
      try {
        res = await fetch(`/api/decks/${deckId}/health-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) })
      } catch {
        return { ok: false, error: SAVE_FAILED }
      }
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        /* keep the general message */
      }
      if (!res.ok) {
        const b = (body ?? {}) as { error?: string; available?: boolean }
        if (b.available === false) qc.setQueryData(healthSettingsKey(deckId), UNAVAILABLE_SETTINGS)
        return { ok: false, error: res.status === 400 || res.status === 409 || res.status === 503 ? (b.error ?? SAVE_FAILED) : SAVE_FAILED }
      }
      const settings = body as HealthSettings
      qc.setQueryData(healthSettingsKey(deckId), settings)
      return { ok: true, settings }
    },
    [deckId, qc],
  )
  return { settings: query.data ?? DEFAULT_SETTINGS, isLoading: query.isPending, act }
}
