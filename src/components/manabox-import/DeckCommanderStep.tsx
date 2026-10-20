'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckCard } from '@/components/CardGrid'

export interface CommanderChoice {
  /** The chosen commander's name, or null when the owner skipped. */
  name: string | null
}

export interface DeckCommanderStepProps {
  deckId: number
  /** Called once the owner has chosen a commander or skipped. */
  onResolved: (choice: CommanderChoice) => void
  /** Set once resolved, so the step shows what was decided instead of the list. */
  resolved: CommanderChoice | null
}

/** Unique, searchable card names from the deck. Pure so it can be tested. */
export function commanderCandidates(
  cards: Array<Pick<DeckCard, 'card_name' | 'scryfall_id'>>,
  query: string
): Array<{ name: string; scryfallId: string | null }> {
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const out: Array<{ name: string; scryfallId: string | null }> = []
  for (const card of cards) {
    if (q && !card.card_name.toLowerCase().includes(q)) continue
    if (seen.has(card.card_name)) continue
    seen.add(card.card_name)
    out.push({ name: card.card_name, scryfallId: card.scryfall_id || null })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Shown on the import result for Commander decks: pick the commander from the
 * imported cards, or skip (it can still be chosen later on the deck page).
 */
export function DeckCommanderStep({ deckId, onResolved, resolved }: DeckCommanderStepProps) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<{ cards: DeckCard[] }>({
    queryKey: deckKeys.detail(deckId),
    queryFn: () =>
      fetch(`/api/decks/${deckId}`).then((r) => {
        if (!r.ok) throw new Error('Failed to load deck')
        return r.json()
      }),
    enabled: !resolved,
  })

  const options = useMemo(() => commanderCandidates(data?.cards ?? [], query), [data, query])

  async function choose(candidate: { name: string; scryfallId: string | null }) {
    setPending(candidate.name)
    setError(null)
    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commander_name: candidate.name, commander_scryfall_id: candidate.scryfallId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Couldn't set the commander. Try again, or skip and set it later.")
      }
      queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
      queryClient.invalidateQueries({ queryKey: deckKeys.all })
      onResolved({ name: candidate.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set the commander.")
    } finally {
      setPending(null)
    }
  }

  if (resolved) {
    return (
      <section aria-label="Commander" className="flex items-center gap-2 rounded-[10px] border border-[var(--border-subtle)] px-3 py-2">
        <Crown className="size-4 text-[var(--accent-primary)]" aria-hidden="true" />
        <span className="flex-1">
          {resolved.name ? (
            <>
              Commander: <strong>{resolved.name}</strong>
            </>
          ) : (
            <>No commander yet. You can choose one on the deck page.</>
          )}
        </span>
        {resolved.name && <Check className="size-4 text-[var(--accent-primary)]" aria-hidden="true" />}
      </section>
    )
  }

  return (
    <section aria-label="Choose a commander" className="flex flex-col gap-2 rounded-[10px] border border-[var(--border-subtle)] p-3">
      <div className="flex items-center gap-2">
        <Crown className="size-4 text-[var(--accent-primary)]" aria-hidden="true" />
        <h4 className="flex-1 font-medium">Choose a commander</h4>
        <Button type="button" variant="ghost" size="sm" onClick={() => onResolved({ name: null })}>
          Skip for now
        </Button>
      </div>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this deck"
        aria-label="Search this deck"
        autoComplete="off"
        className="h-8 text-[length:var(--fs-sm)]"
      />
      {error && (
        <p role="alert" className="text-[length:var(--fs-xs)] text-destructive">
          {error}
        </p>
      )}
      <div role="listbox" aria-label="Commander candidates" className="max-h-40 overflow-auto">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading cards…
          </p>
        )}
        {isError && <p className="py-3 text-center text-muted-foreground">Couldn&apos;t load the deck. Skip and choose later.</p>}
        {!isLoading && !isError && options.length === 0 && (
          <p className="py-3 text-center text-muted-foreground">No match in this deck</p>
        )}
        {options.map((candidate) => (
          <button
            key={candidate.name}
            type="button"
            role="option"
            aria-selected={false}
            disabled={pending !== null}
            onClick={() => choose(candidate)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            <span className="truncate">{candidate.name}</span>
            {pending === candidate.name && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </section>
  )
}
