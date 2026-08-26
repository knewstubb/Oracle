'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'

interface AddCardSearchProps {
  deckId: number
}

/**
 * Autocomplete search input for adding a card to a deck.
 * Fetches suggestions from Scryfall via /api/cards/autocomplete.
 * Selecting a suggestion adds the card to the deck via POST /api/decks/[id]/cards.
 */
export function AddCardSearch({ deckId }: AddCardSearchProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()

  // Fetch autocomplete suggestions with abort support
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
      const res = await fetch(`/api/cards/autocomplete?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
      const json = await res.json()
      
      // Only update state if this request wasn't aborted
      if (!controller.signal.aborted) {
        const data = json.data ?? []
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
  }, [])

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
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add card')
      }
      return res.json()
    },
    onSuccess: (_data, cardName) => {
      const { invalidateDeck } = createDeckInvalidators(queryClient)
      invalidateDeck(deckId)
      toast.success(`Added ${cardName}`)
      setQuery('')
      setSuggestions([])
      setShowDropdown(false)
    },
    onError: (err) => toast.error(err.message),
  })

  // Select a suggestion
  const selectCard = useCallback((cardName: string) => {
    addCardMutation.mutate(cardName)
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
    <div className="relative">
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
          placeholder="Add card..."
          disabled={addCardMutation.isPending}
          className="h-8 w-48 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] pl-8 pr-3 text-[length:var(--fs-sm)] text-foreground placeholder:text-muted-foreground focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-50"
          aria-label="Search for a card to add"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          role="combobox"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full z-50 mt-1 max-h-[240px] w-64 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg"
          role="listbox"
        >
          {suggestions.map((name, idx) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={idx === highlightedIndex}
              onClick={() => selectCard(name)}
              className={`w-full px-3 py-1.5 text-left text-[length:var(--fs-sm)] transition-colors ${
                idx === highlightedIndex
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-foreground hover:bg-white/[0.05]'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
