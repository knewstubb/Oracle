import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckRenameError } from '../../docs/oracle/contracts/deck-rename-and-reorder.types'

export type RenameResult = { ok: true } | { ok: false; error: DeckRenameError }

/**
 * Rename a deck through PATCH /api/decks/[id]. The cached list and the cached deck page switch to the new
 * name only after the server has saved it (the screen keeps the old name until then, D-030).
 */
export function useRenameDeck(id: number) {
  const queryClient = useQueryClient()
  return useCallback(
    async (name: string): Promise<RenameResult> => {
      try {
        const res = await fetch(`/api/decks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) return { ok: false, error: (data.error as DeckRenameError) ?? 'save_failed' }
        const saved: string = data.name ?? name
        queryClient.setQueryData(deckKeys.all, (old: { decks?: Array<{ id: number; name: string }> } | undefined) =>
          old?.decks ? { ...old, decks: old.decks.map((d) => (d.id === id ? { ...d, name: saved } : d)) } : old
        )
        queryClient.setQueryData(deckKeys.detail(id), (old: { deck?: { name: string } } | undefined) =>
          old?.deck ? { ...old, deck: { ...old.deck, name: saved } } : old
        )
        // Every other place that shows the name (pickers, sidebar) refetches.
        queryClient.invalidateQueries({ queryKey: deckKeys.all })
        return { ok: true }
      } catch {
        return { ok: false, error: 'save_failed' }
      }
    },
    [id, queryClient]
  )
}
