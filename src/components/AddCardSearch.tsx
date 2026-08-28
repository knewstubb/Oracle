'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Bookmark, Crown, Check } from 'lucide-react'
import { toast } from 'sonner'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'

interface AddCardSearchProps {
  deckId: number
}

interface CardSuggestion {
  name: string
  owned: boolean
  isCommander: boolean
}

/**
 * Smart autocomplete search input for adding a card to a deck.
 * Uses /api/cards/search which queries local database first (with ranking),
 * then supplements with Scryfall for cards not in our database.
 * 
 * Features:
 * - Prioritizes commanders, owned cards, and deck color identity matches
 * - Shows ownership and commander indicators
 * - Supports adding cards directly to Maybeboard via toggle
 */
export function AddCardSearch({ deckId }: AddCardSearchProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [addToMaybeboard, setAddToMaybeboard] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()

  // Fetch suggestions from smart search endpoint
  const fetchSuggestions = useCallback(async (q: string) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (q.length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      setIsLoading(false)
      return
    }

    // Create new abort controller for this request
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsLoading(true)

    try {
      // Use smart search endpoint with deck context for better ranking
      const res = await fetch(
        `/api/cards/search?q=${encodeURIComponent(q)}&deckId=${deckId}`,
        { signal: controller.signal }
      )
      const json = await res.json()
      
      // Only update state if this request wasn't aborted
      if (!controller.signal.aborted) {
        const data: CardSuggestion[] = json.data ?? []
        setSuggestions(data)
        setShowDropdown(data.length > 0)
        setHighlightedIndex(-1)
        setIsLoading(false)
      }
    } catch (err) {
      // Ignore abort errors, handle other errors
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      if (!controller.signal.aborted) {
        setSuggestions([])
        setShowDropdown(false)
        setIsLoading(false)
      }
    }
  }, [deckId])

  // Debounced input handler
  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    
    // Clear pending debounce
    if (debounceRef.current) clearTimeout(debounceRef.current)
    
    // Show loading state immediately for better feedback
    if (value.length >= 2) {
      setIsLoading(true)
    } else {
      setIsLoading(false)
      setSuggestions([])
      setShowDropdown(false)
    }
    
    // Debounce the actual fetch
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 150)
  }, [fetchSuggestions])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  // Add card mutation
  const addCardMutation = useMutation({
    mutationFn: async (cardName: string) => {
      const body: { cardName: string; category?: string } = { cardName }
      if (addToMaybeboard) {
        body.category = 'Maybeboard'
      }
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add card')
      }
      return res.json()
    },
    onMutate: async (cardName) => {
      // Show toast immediately for snappy feedback
      toast.success(addToMaybeboard ? `Added ${cardName} to Maybeboard` : `Added ${cardName}`)
      
      // Clear UI immediately
      setQuery('')
      setSuggestions([])
      setShowDropdown(false)
      
      // Return context for potential rollback (card name for error message)
      return { cardName }
    },
    onSuccess: () => {
      // Trigger background refetch to sync with server
      const { invalidateDeck } = createDeckInvalidators(queryClient)
      invalidateDeck(deckId)
    },
    onError: (err, _cardName, context) => {
      toast.error(err.message || `Failed to add ${context?.cardName}`)
    },
  })

  // Select a suggestion
  const selectCard = useCallback((suggestion: CardSuggestion) => {
    addCardMutation.mutate(suggestion.name)
  }, [addCardMutation])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        selectCard(suggestions[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setHighlightedIndex(-1)
    }
  }, [showDropdown, suggestions, highlightedIndex, selectCard])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative flex items-center gap-1">
      {/* Maybeboard toggle */}
      <button
        type="button"
        onClick={() => setAddToMaybeboard(!addToMaybeboard)}
        className={`flex h-8 items-center justify-center rounded-lg border px-2 transition-colors ${
          addToMaybeboard
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-500'
            : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-muted-foreground hover:text-foreground'
        }`}
        title={addToMaybeboard ? 'Adding to Maybeboard (click to add to deck)' : 'Click to add to Maybeboard instead'}
        aria-pressed={addToMaybeboard}
        aria-label={addToMaybeboard ? 'Adding to Maybeboard' : 'Add to Maybeboard'}
      >
        <Bookmark className={`size-3.5 ${addToMaybeboard ? 'fill-current' : ''}`} />
      </button>

      <div className="relative">
        {/* Search/loading icon inside the field */}
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          {addCardMutation.isPending || isLoading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Plus className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true) }}
          placeholder={addToMaybeboard ? 'Add to maybeboard...' : 'Add card...'}
          disabled={addCardMutation.isPending}
          className={`h-8 w-48 rounded-lg border bg-[var(--bg-surface)] pl-8 pr-3 text-[length:var(--fs-sm)] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 ${
            addToMaybeboard
              ? 'border-amber-500/50 focus:border-amber-500'
              : 'border-[var(--border-default)] focus:border-[var(--accent-primary)]'
          }`}
          aria-label={addToMaybeboard ? 'Search for a card to add to maybeboard' : 'Search for a card to add'}
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          role="combobox"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full z-50 mt-1 max-h-[240px] w-72 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg"
          role="listbox"
        >
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion.name}
              type="button"
              role="option"
              aria-selected={idx === highlightedIndex}
              onClick={() => selectCard(suggestion)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--fs-sm)] transition-colors ${
                idx === highlightedIndex
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-foreground hover:bg-white/[0.05]'
              }`}
            >
              <span className="flex-1 truncate">{suggestion.name}</span>
              {/* Indicators */}
              <span className="flex shrink-0 items-center gap-1">
                {suggestion.isCommander && (
                  <Crown 
                    className={`size-3 ${idx === highlightedIndex ? 'text-amber-200' : 'text-amber-500'}`} 
                    title="Commander"
                  />
                )}
                {suggestion.owned && (
                  <Check 
                    className={`size-3 ${idx === highlightedIndex ? 'text-emerald-200' : 'text-emerald-500'}`}
                    title="Owned"
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
