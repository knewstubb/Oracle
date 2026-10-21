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

/** Asks the server which of these names can be a commander (null when the check fails). */
export async function fetchEligibleNames(names: string[]): Promise<Set<string> | null> {
  if (names.length === 0) return new Set()
  try {
    const res = await fetch('/api/commanders/eligible', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return new Set<string>(data.eligible ?? [])
  } catch {
    return null
  }
}

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
  /** Current commander, shown on the button so it can also be changed. */
  commanderName?: string | null
}

export function CommanderPicker({ deckId, cards, open, onOpenChange, onSet, commanderName }: CommanderPickerProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'deck' | 'all'>('deck')
  const [allResults, setAllResults] = useState<CommanderCandidate[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [eligible, setEligible] = useState<Set<string> | null>(null)
  const [checkFailed, setCheckFailed] = useState(false)
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
      const ok = await fetchEligibleNames(mapped.map((m) => m.name))
      setAllResults(ok ? mapped.filter((m) => ok.has(m.name)) : [])
      if (!ok) setCheckFailed(true)
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

  const deckNamesKey = [...new Set(cards.map((c) => c.card_name))].sort().join('\n')
  useEffect(() => {
    if (!open || mode !== 'deck') return
    let cancelled = false
    fetchEligibleNames(deckNamesKey ? deckNamesKey.split('\n') : []).then((set) => {
      if (cancelled) return
      setEligible(set)
      setCheckFailed(set === null)
    })
    return () => {
      cancelled = true
    }
  }, [open, mode, deckNamesKey])

  const deckCandidates = cards
    .filter((c) => eligible?.has(c.card_name))
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={commanderName ? `Commander: ${commanderName}. Change.` : 'No commander. Choose commander.'}
            className="max-w-64"
          >
            <Crown className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {commanderName ? `Commander · ${commanderName}` : 'No commander · Choose'}
            </span>
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
            {checkFailed && (
              <div role="alert" className="py-4 text-center text-[length:var(--fs-sm)] text-destructive">
                Could not check which cards can be a commander. Try again.
              </div>
            )}
            {mode === 'deck' && !checkFailed && eligible === null && (
              <div className="flex items-center justify-center gap-2 py-4 text-[length:var(--fs-sm)] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Checking cards…
              </div>
            )}
            {mode === 'deck' && eligible !== null && deckCandidates.length === 0 && !query && (
              <div className="py-4 text-center text-[length:var(--fs-sm)] text-muted-foreground">
                No card in this deck can be a commander
              </div>
            )}
            {mode === 'deck' && eligible !== null && deckCandidates.length === 0 && query && (
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
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[length:var(--fs-sm)] hover:bg-[var(--bg-surface-hover)]',
                  pending === candidate.name && 'opacity-50'
                )}
              >
                <span className="truncate">{candidate.name}</span>
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
  commanderName?: string | null
}

export function ChooseCommanderButton({
  deckId,
  cards,
  openOnMount,
  onSet,
  commanderName,
}: ChooseCommanderButtonProps) {
  const [open, setOpen] = useState(openOnMount ?? false)

  return (
    <CommanderPicker
      deckId={deckId}
      cards={cards}
      open={open}
      onOpenChange={setOpen}
      onSet={onSet}
      commanderName={commanderName}
    />
  )
}
