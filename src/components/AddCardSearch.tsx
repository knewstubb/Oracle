'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'

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
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    try {
      const res = await fetch(`/api/cards/autocomplete?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setSuggestions(json.data ?? [])
      setShowDropdown((json.data ?? []).length > 0)
      setHighlightedIndex(-1)
    } catch {
      setSuggestions([])
      setShowDropdown(false)
    }
  }, [])

  // Debounced input handler
  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 200)
  }, [fetchSuggestions])

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
      // Invalidate with both string and number variants of deckId for query key matching
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
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
          {addCardMutation.isPending || (query.length >= 2 && suggestions.length === 0 && !showDropdown) ? (
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
