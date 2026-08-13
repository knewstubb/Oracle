'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, ArrowLeft, Crown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CommanderGrid } from '@/components/CommanderGrid'
import { ColorIdentityFilter } from '@/components/ColorIdentityFilter'
import { OraclePromptCard } from '@/components/OraclePromptCard'
import { useOracle } from '@/contexts/OracleContext'
import { toast } from 'sonner'
import type { CommanderData } from '@/components/CommanderCard'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewDeckPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setContext } = useOracle()
  
  // Check for pre-selected commander from URL (e.g., from Oracle chat)
  const preselectedCommander = searchParams.get('commander')
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [colorFilter, setColorFilter] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  
  // Selection state
  const [selectedCommander, setSelectedCommander] = useState<CommanderData | null>(null)
  
  // Debounce search query
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])
  
  // Set Oracle context for commander selection
  useEffect(() => {
    setContext({ type: 'commander-selection' })
  }, [setContext])
  
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
      router.push(`/decks/${data.deckId}`)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
  
  // Handle commander selection
  const handleSelectCommander = useCallback((commander: CommanderData) => {
    // Check for partner commanders
    if (commander.leadership_type === 'partner' || 
        commander.leadership_type === 'partner_with' ||
        commander.leadership_type === 'friends_forever') {
      // TODO: Handle partner flow - for now, just select
      setSelectedCommander(commander)
      return
    }
    
    // For non-partner commanders, create deck immediately
    createDeckMutation.mutate(commander)
  }, [createDeckMutation])
  
  // Handle pre-selected commander from URL
  useEffect(() => {
    if (!preselectedCommander) return
    
    // First, check if it's in featured data
    if (featuredData?.commanders) {
      const found = featuredData.commanders.find(
        c => c.canonical_key === preselectedCommander || 
             c.display_name.toLowerCase() === preselectedCommander.toLowerCase()
      )
      if (found) {
        handleSelectCommander(found)
        return
      }
    }
    
    // Not in featured - search via API
    const searchForCommander = async () => {
      try {
        const res = await fetch(`/api/commanders/search?q=${encodeURIComponent(preselectedCommander)}`)
        if (res.ok) {
          const data = await res.json()
          const found = data.commanders?.find(
            (c: CommanderData) => 
              c.canonical_key === preselectedCommander ||
              c.display_name.toLowerCase() === preselectedCommander.toLowerCase()
          )
          if (found) {
            handleSelectCommander(found)
          } else {
            toast.error(`Commander "${preselectedCommander}" not found`)
          }
        }
      } catch (err) {
        console.error('Failed to search for pre-selected commander:', err)
      }
    }
    
    searchForCommander()
  }, [preselectedCommander, featuredData, handleSelectCommander])
  
  // Determine which commanders to show
  const commanders = isSearching 
    ? (searchData?.commanders ?? [])
    : (featuredData?.commanders ?? [])
  
  const isLoading = isSearching ? searchLoading : featuredLoading
  const error = isSearching ? searchError : featuredError

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/decks')}
              className="text-zinc-400 hover:text-zinc-200"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              <h1 className="text-lg font-semibold text-zinc-100">
                Choose Your Commander
              </h1>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* Left: Search and commanders */}
          <div className="space-y-6">
            {/* Search bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type="text"
                  placeholder="Search commanders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    'pl-10 bg-zinc-900 border-zinc-700',
                    'focus:border-amber-500/50 focus:ring-amber-500/20'
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
              selectedKey={selectedCommander?.canonical_key}
              title={isSearching ? 'Search Results' : 'Popular Commanders'}
              emptyMessage={
                isSearching 
                  ? 'No commanders match your search'
                  : 'No commanders available'
              }
              onRefresh={!isSearching ? () => refetchFeatured() : undefined}
              isRefreshing={featuredRefetching}
            />
          </div>
          
          {/* Right: Oracle prompt */}
          <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
            <OraclePromptCard
              title="Not sure where to start?"
              description="Chat with the Oracle to explore archetypes, themes, and find the perfect commander for your playstyle."
              buttonLabel="Ask the Oracle"
            />
            
            {/* Quick tips */}
            <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Quick Tips</h3>
              <ul className="space-y-2 text-xs text-zinc-500">
                <li className="flex gap-2">
                  <span className="text-fuchsia-400">*</span>
                  <span>Commanders with magenta borders are not in your collection</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400">*</span>
                  <span>Use the color filter to narrow by color identity</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">*</span>
                  <span>Hover over a card to see the full art</span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      
      {/* Creating deck overlay */}
      {createDeckMutation.isPending && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 flex items-center gap-4">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            <span className="text-zinc-200">Creating your deck...</span>
          </div>
        </div>
      )}
    </div>
  )
}
