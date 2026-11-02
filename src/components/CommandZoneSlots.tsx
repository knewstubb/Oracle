'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Shield, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fetchEligibleNames, type CommanderCandidate } from '@/components/manabox-import/CommanderPicker'
import { SECOND_SLOT_LABEL } from '@/lib/commander-pairing'
import { isCompanion, isSecondCommander } from '@/lib/command-zone'
import { COMPANION_CATEGORY } from '@/lib/command-zone'
import { companionKeepsCount, companionSlotVisible, isMainListCard } from '@/lib/commander-card-actions'
import { fetchSecondSlotKind, useCommanderEligibility } from '@/hooks/useCommanderActions'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckCard } from '@/components/CardGrid'

/**
 * The other-commander (Partner, Background...) and companion slots on the deck page (T-62 S5).
 * Wording and layout follow the commander slot; there is no Designer spec for the companion yet.
 * The companion sits outside the 100 cards (saved as Sideboard) and outside colour identity and legality.
 * Each slot is shown only when it can be used: the other-commander slot when the commander's rules allow one (or one
 * is set), the companion slot when a companion is set or the deck holds a card with the Companion ability.
 */

export interface CommandZoneSlotsProps {
  deckId: number
  cards: DeckCard[]
  commanderName: string | null | undefined
  /** Cards the deck should hold (100); a card is not offered as companion if moving it out would drop the deck below this. */
  deckTarget?: number | null
  /** Draw a "Commander" heading above the slots (used when the Commander section has no card). */
  heading?: boolean
}

type Slot = 'second' | 'companion'

/** Finds the card row holding the commander: the flagged row, else the one matching the deck's commander name. */
export function findPrimaryRow(cards: DeckCard[], commanderName: string | null | undefined): DeckCard | null {
  const flagged = cards.find((c) => c.is_commander && !isCompanion(c) && !isSecondCommander(c))
  if (flagged) return flagged
  if (!commanderName) return null
  return cards.find((c) => c.card_name === commanderName && !isCompanion(c) && !isSecondCommander(c)) ?? null
}

interface PutBody {
  primaryCardId: number | null
  secondCardId: number | null
  companionCardId: number | null
}

async function putCommandZone(deckId: number, body: PutBody): Promise<string | null> {
  try {
    const res = await fetch(`/api/decks/${deckId}/command-zone`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return null
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    return payload.error ?? 'Could not save the command zone.'
  } catch {
    return 'Could not save the command zone.'
  }
}


export function CommandZoneSlots({ deckId, cards, commanderName, deckTarget, heading = false }: CommandZoneSlotsProps) {
  const queryClient = useQueryClient()
  const primary = useMemo(() => findPrimaryRow(cards, commanderName), [cards, commanderName])
  // Which second-commander slot the commander's own rules text allows (null = none, so no slot).
  const kindQuery = useQuery({
    queryKey: ['second-slot-kind', primary?.card_name ?? null],
    queryFn: () => fetchSecondSlotKind(primary!.card_name),
    enabled: !!primary,
    staleTime: 5 * 60 * 1000,
  })
  const slotKind = kindQuery.data ?? null
  const second = cards.find((c) => isSecondCommander(c)) ?? null
  const companion = cards.find((c) => isCompanion(c)) ?? null
  const { eligibility, companionNames } = useCommanderEligibility(cards, commanderName)
  const showCompanion = companionSlotVisible(cards, companionNames)
  const showSecond = !!primary && !!(second || slotKind)
  const hasCommander = !!primary || cards.some((c) => !!c.is_commander && !isCompanion(c))
  const showLeadHint = heading && !hasCommander && eligibility.lead.size > 0
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  const refresh = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['deck-legality'] })
    await queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
  }, [queryClient, deckId])

  const save = useCallback(
    async (next: Partial<PutBody>, doneText: string) => {
      const body: PutBody = {
        primaryCardId: primary?.id ?? null,
        secondCardId: second?.id ?? null,
        companionCardId: companion?.id ?? null,
        ...next,
      }
      const error = await putCommandZone(deckId, body)
      if (error) {
        toast.error(error)
        return false
      }
      toast.success(doneText)
      await refresh()
      return true
    },
    [primary, second, companion, deckId, refresh]
  )

  const removeCompanion = async () => {
    if (!companion) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/decks/${deckId}/cards/${companion.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(`${companion.card_name} removed`)
      setConfirmingRemove(false)
      await refresh()
    } catch {
      toast.error('Could not remove the companion.')
    } finally {
      setRemoving(false)
    }
  }

  if (!showSecond && !showCompanion && !showLeadHint) return null

  const body = (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="command-zone-slots">
      {showLeadHint && (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          No commander yet. A card that can lead this deck has Add as commander on its menu.
        </p>
      )}
      {showSecond && primary && (
        <SlotPicker
          slot="second"
          label={slotKind ? SECOND_SLOT_LABEL[slotKind] : 'Partner or Background'}
          cards={cards}
          withName={primary.card_name}
          current={second}
          onPick={(c) => save({ secondCardId: c?.id ?? null }, c ? `${c.name} is a commander` : `${second?.card_name ?? 'Commander'} removed`)}
        />
      )}
      {showCompanion && (confirmingRemove && companion ? (
        <div role="alertdialog" aria-label="Remove companion" className="flex items-center gap-2 text-[length:var(--fs-sm)]">
          <span>Remove {companion.card_name} from this deck?</span>
          <Button type="button" size="sm" variant="destructive" disabled={removing} onClick={removeCompanion}>
            {removing ? 'Removing…' : 'Remove'}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={removing} onClick={() => setConfirmingRemove(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <SlotPicker
            slot="companion"
            cards={cards}
            current={companion}
            onPick={(c) => save({ companionCardId: c?.id ?? null }, `${c?.name ?? 'Companion'} is the companion`)}
            deckId={deckId}
            deckTarget={deckTarget}
            requestAddCard={async (name) => {
              const res = await fetch(`/api/decks/${deckId}/cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardName: name, quantity: 1, category: COMPANION_CATEGORY }),
              })
              if (!res.ok) return null
              const data = (await res.json()) as { id: number }
              return data.id
            }}
          />
          {companion && (
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove companion ${companion.card_name}`} onClick={() => setConfirmingRemove(true)}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
  if (!heading) return body
  return (
    <section aria-label="Commander" className="mb-6">
      <h4 className="text-[length:var(--fs-sm)] font-medium uppercase text-muted-foreground">Commander</h4>
      {body}
    </section>
  )
}

interface SlotPickerProps {
  deckTarget?: number | null
  slot: Slot
  /** Slot name shown on the chip; the second-commander slot is named for what it is (Partner, Background...). */
  label?: string
  cards: DeckCard[]
  current: DeckCard | null
  /** Called with the chosen card (deck card id resolved) or null to clear. */
  onPick: (card: { id: number; name: string } | null) => Promise<boolean | void>
  withName?: string
  deckId?: number
  /** Companion only: adds a card that is not in the deck yet (as Sideboard) and returns its row id. */
  requestAddCard?: (name: string) => Promise<number | null>
}

function SlotPicker({ slot, label: labelProp, cards, current, onPick, withName, requestAddCard, deckTarget }: SlotPickerProps) {
  const isSecond = slot === 'second'
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'deck' | 'all'>('deck')
  const [eligibleState, setEligibleState] = useState<{ withName: string | undefined; set: Set<string> } | null>(null)
  const eligible = eligibleState && eligibleState.withName === withName ? eligibleState.set : null
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [allFound, setAllFound] = useState<CommanderCandidate[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // The other commander is a commander like the first: its kind (Partner, Background...) names the slot only while empty.
  const label = labelProp ?? (isSecond ? 'Partner or Background' : 'Companion')
  const noneText = `No ${label.toLowerCase()} · Add`
  const Icon = isSecond ? Users : Shield

  // Only cards that could validly fill the slot are candidates before the server check: the other commander must be on
  // the main list (so the 100 is unchanged); a companion must not drop a full deck below its size.
  const candidates = useMemo(
    () =>
      cards.filter(
        (c) =>
          c.id !== current?.id &&
          !(isSecond && c.card_name === withName) &&
          !isCompanion(c) &&
          !isSecondCommander(c) &&
          (isSecond ? isMainListCard(c) : !isMainListCard(c) || companionKeepsCount(c, cards, deckTarget))
      ),
    [cards, current, isSecond, withName, deckTarget]
  )
  const namesKey = useMemo(() => [...new Set(candidates.map((c) => c.card_name))].sort().join('\n'), [candidates])

  useEffect(() => {
    if (!open || mode !== 'deck' || eligible) return
    let cancelled = false
    fetchEligibleNames(namesKey ? namesKey.split('\n') : [], { role: isSecond ? 'second' : 'companion', withName }).then((set) => {
      if (cancelled) return
      setFailed(set === null)
      if (set) setEligibleState({ withName, set })
    })
    return () => {
      cancelled = true
    }
  }, [open, mode, eligible, namesKey, isSecond, withName])

  useEffect(() => {
    if (open) queueMicrotask(() => inputRef.current?.focus())
  }, [open, mode])

  const searchText = query.trim()
  useEffect(() => {
    if (mode !== 'all' || isSecond || !searchText) return
    const timer = setTimeout(async () => {
      setAllLoading(true)
      try {
        const res = await fetch('/api/ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `${searchText} o:companion f:commander` }),
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        const mapped: CommanderCandidate[] = (data.cards ?? [])
          .map((c: { name: string; scryfallId?: string }) => ({ name: c.name, scryfallId: c.scryfallId ?? null }))
          .slice(0, 20)
        const ok = await fetchEligibleNames(mapped.map((m) => m.name), { role: 'companion' })
        setFailed(ok === null)
        setAllFound(ok ? mapped.filter((m) => ok.has(m.name)) : [])
      } catch {
        setFailed(true)
        setAllFound([])
      } finally {
        setAllLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [mode, searchText, isSecond])
  const allResults = mode === 'all' && searchText ? allFound : []

  const q = query.trim().toLowerCase()
  const deckOptions = candidates
    .filter((c) => eligible?.has(c.card_name))
    .filter((c) => !q || c.card_name.toLowerCase().includes(q))
    .filter((c, i, arr) => arr.findIndex((x) => x.card_name === c.card_name) === i)
    .map((c) => ({ key: c.card_name, name: c.card_name, id: c.id as number | null }))
  const allOptions = allResults.map((c) => ({ key: c.name, name: c.name, id: null as number | null }))
  const options = mode === 'deck' ? deckOptions : allOptions

  const choose = async (opt: { name: string; id: number | null }) => {
    setPending(opt.name)
    try {
      let id = opt.id
      if (id === null && requestAddCard) {
        id = await requestAddCard(opt.name)
        if (id === null) {
          toast.error(`Could not add ${opt.name} to the deck.`)
          return
        }
      }
      if (id === null) return
      const ok = await onPick({ id, name: opt.name })
      if (ok !== false) {
        setOpen(false)
        setQuery('')
      }
    } finally {
      setPending(null)
    }
  }

  const clear = async () => {
    // A companion is never cleared here: removing it goes through the confirmation. Second commander clears directly.
    const ok = await onPick(null)
    if (ok !== false) setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery('')
          setMode('deck')
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={current ? (isSecond ? `Commander: ${current.card_name}. Change.` : `${label}: ${current.card_name}. Change.`) : `No ${label.toLowerCase()}. Add ${label.toLowerCase()}.`}
            className="max-w-64"
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{current ? (isSecond ? current.card_name : `${label} · ${current.card_name}`) : noneText}</span>
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
          <div role="listbox" aria-label={`${label} candidates`} className="max-h-64 overflow-auto">
            {isSecond && current && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={clear}
                className="flex w-full rounded-md px-2 py-1.5 text-left text-[length:var(--fs-sm)] hover:bg-[var(--bg-surface-hover)]"
              >
                Remove {current?.card_name}
              </button>
            )}
            {failed && (
              <div role="alert" className="py-4 text-center text-[length:var(--fs-sm)] text-destructive">
                Could not check which cards can be {isSecond ? 'a partner or background' : 'a companion'}. Try again.
              </div>
            )}
            {mode === 'deck' && !failed && eligible === null && (
              <div className="flex items-center justify-center gap-2 py-4 text-[length:var(--fs-sm)] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Checking cards…
              </div>
            )}
            {mode === 'deck' && eligible !== null && deckOptions.length === 0 && (
              <div className="py-4 text-center text-[length:var(--fs-sm)] text-muted-foreground">
                {q
                  ? 'No match in this deck'
                  : isSecond
                    ? 'No card in this deck can be a commander with this one'
                    : 'No card in this deck has Companion'}
              </div>
            )}
            {mode === 'all' && allLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-[length:var(--fs-sm)] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Searching…
              </div>
            )}
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => choose(opt)}
                disabled={pending === opt.name}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[length:var(--fs-sm)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50"
              >
                <span className="truncate">{opt.name}</span>
                {pending === opt.name ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <Check className="size-3 opacity-0" aria-hidden="true" />}
              </button>
            ))}
          </div>
          {!isSecond && (
            <div className="border-t border-[var(--border-subtle)] pt-1">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'deck' ? 'all' : 'deck')
                  setQuery('')
                  setAllFound([])
                  setFailed(false)
                }}
                className="w-full text-left text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
              >
                {mode === 'deck' ? 'Search all cards' : 'Back to this deck'}
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
