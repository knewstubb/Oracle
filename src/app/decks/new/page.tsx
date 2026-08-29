'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, ArrowLeft, Crown, Loader2, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CommanderGrid } from '@/components/CommanderGrid'
import { CommanderCard, type CommanderData } from '@/components/CommanderCard'
import { ColorIdentityFilter } from '@/components/ColorIdentityFilter'
import { useOracle } from '@/contexts/OracleContext'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Combine two color identities into one (union) */
function combineColorIdentities(a: string, b: string): string {
  const colors = 'WUBRG'
  const set = new Set([...a, ...b])
  return colors.split('').filter(c => set.has(c)).join('')
}

/** Check if a commander can partner with another */
function canPartnerWith(first: CommanderData, second: CommanderData): boolean {
  // Can't partner with self
  if (first.canonical_key === second.canonical_key) return false
  
  // Generic partners can pair with any other generic partner
  if (first.leadership_type === 'partner' && second.leadership_type === 'partner') {
    return true
  }
  
  // Friends forever can pair with any other friends forever
  if (first.leadership_type === 'friends_forever' && second.leadership_type === 'friends_forever') {
    return true
  }
  
  // partner_with requires specific pairing (not implemented here - would need DB lookup)
  // For now, allow partner_with to pair with generic partners as fallback
  if (first.leadership_type === 'partner_with' || second.leadership_type === 'partner_with') {
    return first.leadership_type === 'partner' || second.leadership_type === 'partner'
  }
  
  return false
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewDeckPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setContext, open: openOracle } = useOracle()
  
  // Check for pre-selected commander from URL (e.g., from Oracle chat)
  const preselectedCommander = searchParams.get('commander')
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [colorFilter, setColorFilter] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  
  // Selection state
  const [selectedCommander, setSelectedCommander] = useState<CommanderData | null>(null)
  
  // Partner selection state
  const [partnerMode, setPartnerMode] = useState(false)
  const [firstPartner, setFirstPartner] = useState<CommanderData | null>(null)
  const [partnerSearchQuery, setPartnerSearchQuery] = useState('')
  const [debouncedPartnerQuery, setDebouncedPartnerQuery] = useState('')
  
  // Debounce search query
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])
  
  // Debounce partner search query
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedPartnerQuery(partnerSearchQuery)
    }, 300)
    return () => clearTimeout(timeout)
  }, [partnerSearchQuery])
  
  // Set Oracle context for commander selection and open chat panel
  useEffect(() => {
    setContext({ type: 'commander-selection' })
    openOracle()
  }, [setContext, openOracle])
  
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
  
  // Search for partner commanders
  const {
    data: partnerSearchData,
    isLoading: partnerSearchLoading,
  } = useQuery({
    queryKey: ['commanders', 'partners', firstPartner?.leadership_type, debouncedPartnerQuery],
    queryFn: async () => {
      if (!firstPartner) return { commanders: [] }
      
      const params = new URLSearchParams()
      if (debouncedPartnerQuery) params.set('q', debouncedPartnerQuery)
      // Search for commanders with compatible leadership types
      params.set('partnerType', firstPartner.leadership_type)
      
      const res = await fetch(`/api/commanders/search?${params}`)
      if (!res.ok) throw new Error('Partner search failed')
      const data = await res.json() as { commanders: CommanderData[] }
      
      // Filter to only compatible partners
      return {
        commanders: data.commanders.filter(c => canPartnerWith(firstPartner, c))
      }
    },
    enabled: partnerMode && !!firstPartner,
    staleTime: 30 * 1000,
  })
  
  // Create deck mutation - handles both single and partner commanders
  const createDeckMutation = useMutation({
    mutationFn: async ({ commander, partner }: { commander: CommanderData; partner?: CommanderData }) => {
      const deckName = partner 
        ? `${commander.display_name} & ${partner.display_name}`
        : commander.display_name
      
      const colorIdentity = partner
        ? combineColorIdentities(commander.color_identity, partner.color_identity)
        : commander.color_identity
      
      const res = await fetch('/api/decks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deckName,
          format: 'commander',
          commanderName: commander.display_name,
          commanderScryfallId: commander.scryfall_id,
          colourIdentity: colorIdentity,
          // Include partner info for deck_cards insertion
          partnerName: partner?.display_name,
          partnerScryfallId: partner?.scryfall_id,
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
      // Enter partner selection mode
      setFirstPartner(commander)
      setPartnerMode(true)
      setPartnerSearchQuery('')
      toast.info(`${commander.display_name} can have a partner! Select one below or skip.`)
      return
    }
    
    // For non-partner commanders, create deck immediately
    createDeckMutation.mutate({ commander })
  }, [createDeckMutation])
  
  // Handle partner selection (second commander)
  const handleSelectPartner = useCallback((partner: CommanderData) => {
    if (!firstPartner) return
    createDeckMutation.mutate({ commander: firstPartner, partner })
  }, [firstPartner, createDeckMutation])
  
  // Skip partner selection (build with single partner commander)
  const handleSkipPartner = useCallback(() => {
    if (!firstPartner) return
    createDeckMutation.mutate({ commander: firstPartner })
  }, [firstPartner, createDeckMutation])
  
  // Cancel partner selection
  const handleCancelPartner = useCallback(() => {
    setPartnerMode(false)
    setFirstPartner(null)
    setPartnerSearchQuery('')
  }, [])
  
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
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <header className="shrink-0 z-40 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800">
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
      
      {/* Main content - scrollable */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
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
      
      {/* Partner selection overlay */}
      {partnerMode && firstPartner && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full flex items-start justify-center py-8 px-4">
            <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-amber-400" />
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">Choose a Partner</h2>
                    <p className="text-sm text-zinc-400">
                      {firstPartner.display_name} can have a partner commander
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCancelPartner}
                  className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* First partner preview */}
              <div className="p-4 bg-zinc-800/50 border-b border-zinc-800">
                <div className="flex items-center gap-4">
                  <div className="w-32">
                    <CommanderCard commander={firstPartner} compact />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-zinc-400">First commander selected</p>
                    <p className="text-zinc-200 font-medium">{firstPartner.display_name}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Color identity: {firstPartner.color_identity || 'Colorless'}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Partner search */}
              <div className="p-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    type="text"
                    placeholder="Search for a partner..."
                    value={partnerSearchQuery}
                    onChange={(e) => setPartnerSearchQuery(e.target.value)}
                    className="pl-10 bg-zinc-800 border-zinc-700"
                    autoFocus
                  />
                </div>
                
                {/* Partner results */}
                <div className="max-h-[400px] overflow-y-auto">
                  {partnerSearchLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                    </div>
                  ) : partnerSearchData?.commanders && partnerSearchData.commanders.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {partnerSearchData.commanders.map(partner => (
                        <CommanderCard
                          key={partner.canonical_key}
                          commander={partner}
                          onSelect={handleSelectPartner}
                          compact
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-zinc-500">
                      {debouncedPartnerQuery 
                        ? 'No compatible partners found'
                        : 'Search for a compatible partner commander'}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Footer actions */}
              <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
                <Button
                  variant="ghost"
                  onClick={handleCancelPartner}
                  className="text-zinc-400"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSkipPartner}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Skip — Build with just {firstPartner.display_name}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
