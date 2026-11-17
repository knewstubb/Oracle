import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deckKeys } from '@/hooks/useDeckQueryKeys'

interface DeckListCache {
  decks: { id: number }[]
  folders: unknown[]
  hasCollection: boolean
}

/**
 * Delete a deck. The deck leaves the cached deck list immediately (before the
 * server answers) and comes back with an error toast if the delete fails.
 * The server call is unchanged: cards are returned to storage by the API.
 */
export function useDeleteDeck({ id, name }: { id: number; name: string }) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete deck')
      }
      return res.json().catch(() => ({}))
    },
    onMutate: async () => {
      // Stop any in-flight list fetch from putting the deck back
      await queryClient.cancelQueries({ queryKey: deckKeys.all, exact: true })
      const previous = queryClient.getQueryData<DeckListCache>(deckKeys.all)
      if (previous) {
        queryClient.setQueryData<DeckListCache>(deckKeys.all, {
          ...previous,
          decks: previous.decks.filter((d) => d.id !== id),
        })
      }
      return { previous }
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(deckKeys.all, context.previous)
      toast.error(`Couldn't delete "${name}". It's back in your list. ${err.message}`)
    },
    onSuccess: () => {
      toast.success(`Deleted "${name}"`)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: deckKeys.all })
    },
  })
}
