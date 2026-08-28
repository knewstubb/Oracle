'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Crown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { CommanderGrid } from '@/components/CommanderGrid'
import { ColorIdentityFilter } from '@/components/ColorIdentityFilter'
import { cn } from '@/lib/utils'
import type { CommanderData } from '@/components/CommanderCard'

// ---------------------------------------------------------------------------
// CommanderBrowser — Simplified browse/search for /explore page
// ---------------------------------------------------------------------------

export function CommanderBrowser() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [colorFilter, setColorFilter] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Debounce search query
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  // Fetch featured commanders
  const {
    data: featuredData,
    isLoading: featuredLoading,
    error: featuredError,
    refetch: refetchFeatured,
    isRefetching: featuredRefetching,
  } = useQuery({
    queryKey: ['commanders', 'featured'],
    queryFn: async () => {
      const res = await fetch('/api/commanders/featured')
      if (!res.ok) throw new Error('Failed to load commanders')
      return res.json() as Promise<{ commanders: CommanderData[] }>
    },
    staleTime: 5 * 60 * 1000,
  })

  // Search commanders when query or color filter changes
  const isSearching = debouncedQuery.length > 0 || colorFilter.length > 0

  const {
    data: searchData,
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: ['commanders', 'search', debouncedQuery, colorFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedQuery) params.set('q', debouncedQuery)
      if (colorFilter) params.set('colors', colorFilter)

      const res = await fetch(`/api/commanders/search?${params}`)
      if (!res.ok) throw new Error('Search failed')
      return res.json() as Promise<{ commanders: CommanderData[] }>
    },
    enabled: isSearching,
    staleTime: 30 * 1000,
  })

  // Create deck mutation
  const createDeckMutation = useMutation({
    mutationFn: async (commander: CommanderData) => {
      const res = await fetch('/api/decks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: commander.display_name,
          format: 'commander',
          commanderName: commander.display_name,
          commanderScryfallId: commander.scryfall_id,
          colourIdentity: commander.color_identity,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create deck')
      }
      return res.json() as Promise<{ deckId: number }>
    },
    onSuccess: (data) => {
      toast.success('Deck created!')
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      router.push(`/decks/${data.deckId}`)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // Handle commander selection — create deck immediately
  const handleSelectCommander = useCallback(
    (commander: CommanderData) => {
      // Check for partner commanders — for simplicity, just create single-commander deck
      // Partner selection can be done from the deck page
      if (
        commander.leadership_type === 'partner' ||
        commander.leadership_type === 'partner_with' ||
        commander.leadership_type === 'friends_forever'
      ) {
        toast.info(`${commander.display_name} can have a partner. You can add one from the deck page.`)
      }
      createDeckMutation.mutate(commander)
    },
    [createDeckMutation]
  )

  // Determine which commanders to show
  const commanders = isSearching
    ? (searchData?.commanders ?? [])
    : (featuredData?.commanders ?? [])

  const isLoading = isSearching ? searchLoading : featuredLoading
  const error = isSearching ? searchError : featuredError

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search commanders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'pl-10 bg-surface border-border',
              'focus:border-emerald-500/50 focus:ring-emerald-500/20'
            )}
          />
        </div>
        <ColorIdentityFilter
          value={colorFilter}
          onChange={setColorFilter}
          size="md"
        />
      </div>

      {/* Commander grid */}
      <CommanderGrid
        commanders={commanders}
        isLoading={isLoading}
        error={error?.message}
        onSelect={handleSelectCommander}
        title={isSearching ? 'Search Results' : 'Popular Commanders'}
        emptyMessage={
          isSearching
            ? 'No commanders match your search'
            : 'No commanders available'
        }
        onRefresh={!isSearching ? () => refetchFeatured() : undefined}
        isRefreshing={featuredRefetching}
      />

      {/* Creating deck overlay */}
      {createDeckMutation.isPending && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-surface border border-border rounded-xl p-6 flex items-center gap-4">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-foreground">Creating your deck...</span>
          </div>
        </div>
      )}
    </div>
  )
}
