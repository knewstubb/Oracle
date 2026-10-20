'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Crown, Search, Loader2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { DeckCard } from '@/components/CardGrid'

export interface CommanderCandidate {
  name: string
  scryfallId: string | null
}

export interface CommanderPickerProps {
  deckId: number
  cards: DeckCard[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSet?: () => void
}

export function CommanderPicker({ deckId, cards, open, onOpenChange, onSet }: CommanderPickerProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'deck' | 'all'>('deck')
  const [allResults, setAllResults] = useState<CommanderCandidate[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open && inputRef.current) {
      queueMicrotask(() => inputRef.current?.focus())
    }
  }, [open, mode])

  const setCommander = useCallback(
    async (candidate: CommanderCandidate) => {
      setPending(candidate.name)
      try {
        const res = await fetch(`/api/decks/${deckId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commander_name: candidate.name,
            commander_scryfall_id: candidate.scryfallId,
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Could not set commander' }))
          throw new Error(body.error ?? 'Could not set commander')
        }

        toast.success(`${candidate.name} is commander`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              await fetch(`/api/decks/${deckId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commander_id: null }),
              })
              queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
            },
          },
        })

        queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
        onOpenChange(false)
        onSet?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not set commander')
      } finally {
        setPending(null)
      }
    },
    [deckId, onOpenChange, onSet, queryClient]
  )

  const searchAll = useCallback(async (q: string) => {
    if (!q.trim()) {
      setAllResults([])
      return
    }
    setAllLoading(true)
    try {
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${q} t:legendary t:creature f:commander` }),
      })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      const mapped: CommanderCandidate[] = (data.cards ?? [])
        .map((card: { name: string; scryfallId?: string }) => ({
          name: card.name,
          scryfallId: card.scryfallId ?? null,
        }))
        .slice(0, 20)
      setAllResults(mapped)
    } catch {
      setAllResults([])
    } finally {
      setAllLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mode !== 'all') return
    const timer = setTimeout(() => searchAll(query), 300)
    return () => clearTimeout(timer)
  }, [mode, query, searchAll])

  const deckCandidates = cards
    .filter((c) => {
      const q = query.trim().toLowerCase()
      return !q || c.card_name.toLowerCase().includes(q)
    })
    .map((c) => ({ name: c.card_name, scryfallId: c.scryfall_id }))
    .filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i)

  const options = mode === 'deck' ? deckCandidates : allResults

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" aria-expanded={open}>
            <Crown className="size-4" aria-hidden="true" />
            Choose commander
          </Button>
        }
      />
      <PopoverContent className="w-80 p-2" align="end">
        <div className="flex flex-col gap-2">
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'deck' ? 'Search this deck' : 'Search all cards'}
            aria-label={mode === 'deck' ? 'Search this deck' : 'Search all cards'}
            autoComplete="off"
            className="h-8 text-[length:var(--fs-sm)]"
          />
          <div
            role="listbox"
            aria-label="Commander candidates"
            className="max-h-64 overflow-auto"
          >
            {mode === 'deck' && deckCandidates.length === 0 && !query && (
              <div className="py-4 text-center text-[length:var(--fs-sm)] text-muted-foreground">
                No eligible card in this deck
              </div>
            )}
            {mode === 'deck' && deckCandidates.length === 0 && query && (
              <div className="py-4 text-center text-[length:var(--fs-sm)] text-muted-foreground">
                No match in this deck
              </div>
            )}
            {mode === 'all' && allLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-[length:var(--fs-sm)] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Searching…
              </div>
            )}
            {options.map((candidate) => (
              <button
                key={candidate.name}
                type="button"
                role="option"
                onClick={() => setCommander(candidate)}
                disabled={pending === candidate.name}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[length:var(--fs-sm)] hover:bg-[var(--bg-hover)]',
                  pending === candidate.name && 'opacity-50'
                )}
              >
                <span className="truncate">{candidate.name}</span>
                <span className="text-[length:var(--fs-xs)] text-muted-foreground">Legendary</span>
                {pending === candidate.name ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3 opacity-0" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-[var(--border-subtle)] pt-1">
            {mode === 'deck' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('all')
                  setQuery('')
                }}
                className="w-full text-left text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
              >
                Search all cards
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('deck')
                  setQuery('')
                  setAllResults([])
                }}
                className="w-full text-left text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
              >
                Back to this deck
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export interface ChooseCommanderButtonProps {
  deckId: number
  cards: DeckCard[]
  openOnMount?: boolean
  onSet?: () => void
}

export function ChooseCommanderButton({
  deckId,
  cards,
  openOnMount,
  onSet,
}: ChooseCommanderButtonProps) {
  const [open, setOpen] = useState(openOnMount ?? false)

  return (
    <CommanderPicker
      deckId={deckId}
      cards={cards}
      open={open}
      onOpenChange={setOpen}
      onSet={onSet}
    />
  )
}
