import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckOrderError } from '../../docs/oracle/contracts/deck-rename-and-reorder.types'

class DeckOrderFailure extends Error {
  constructor(readonly code: DeckOrderError) {
    super(code)
  }
}

/** The cached list with its decks in the new order. Decks missing from the list keep their relative place at the end. */
export function applyDeckOrder<T extends { decks?: Array<{ id: number }> }>(data: T | undefined, deckIds: readonly number[]): T | undefined {
  if (!data?.decks) return data
  const place = new Map(deckIds.map((id, i) => [id, i]))
  const decks = [...data.decks].sort((a, b) => (place.get(a.id) ?? Infinity) - (place.get(b.id) ?? Infinity))
  return { ...data, decks }
}

/**
 * Save the whole deck order through PUT /api/decks/order. The list switches to the new order at once and goes back to
 * the old one if the save fails (all or nothing, D-030). A success shows nothing; failures show a message.
 */
export function useSaveDeckOrder() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (deckIds: number[]) => {
      const res = await fetch('/api/decks/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckIds }),
      }).catch(() => null)
      const data = res ? await res.json().catch(() => ({})) : {}
      if (!res || !res.ok || !data.ok) throw new DeckOrderFailure((data.error as DeckOrderError) ?? 'save_failed')
      return data as { ok: true; count: number }
    },
    onMutate: async (deckIds) => {
      await queryClient.cancelQueries({ queryKey: deckKeys.all, exact: true })
      const previous = queryClient.getQueryData(deckKeys.all)
      queryClient.setQueryData(deckKeys.all, (old: { decks?: Array<{ id: number }> } | undefined) => applyDeckOrder(old, deckIds))
      return { previous }
    },
    onError: (err, deckIds, context) => {
      queryClient.setQueryData(deckKeys.all, context?.previous)
      if (err instanceof DeckOrderFailure && err.code === 'deck_order_mismatch') {
        toast.info("Your decks changed in another window, so this move wasn't saved. Showing the latest order.")
        queryClient.invalidateQueries({ queryKey: deckKeys.all })
        return
      }
      toast.error("Couldn't save the new order. Your decks are back where they were.", {
        action: { label: 'Try again', onClick: () => mutation.mutate(deckIds) },
      })
    },
  })
  return { saveOrder: mutation.mutate, saving: mutation.isPending }
}
