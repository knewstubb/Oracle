'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { SecondSlotKind } from '@/lib/commander-pairing'
import {
  actionLabel,
  applyCommandZoneLocally,
  currentCommanders,
  isMainListCard,
  offeredActions,
  planCommandZoneBody,
  secondRoleForAction,
  type ActionCard,
  type CardCommanderAction,
  type CommanderEligibility,
} from '@/lib/commander-card-actions'

type DeckCardLike = ActionCard & { scryfall_id?: string | null }
/** The deck page's cached answer (only the parts this file touches). */
interface DeckCache {
  deck: { commander_name?: string | null; commander_scryfall_id?: string | null } & Record<string, unknown>
  cards: unknown[]
}

/**
 * Which commander actions each deck card gets ("Add as commander / partner / background / companion", "Remove as
 * commander"), and the save. The checks are the existing eligible-commanders route; the save is the existing
 * command-zone route. Cards that fail a check are simply never offered the action.
 */

type Role = 'lead' | 'second' | 'companion'

async function fetchNames(role: Role, body: Record<string, unknown>): Promise<Set<string>> {
  const res = await fetch(`/api/commanders/eligible?role=${role}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Could not check cards')
  const data = (await res.json()) as { eligible?: string[] }
  return new Set(data.eligible ?? [])
}

export async function fetchSecondSlotKind(commander: string): Promise<SecondSlotKind | null> {
  const res = await fetch('/api/commanders/eligible?role=second-kind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ with: commander }),
  })
  if (!res.ok) throw new Error('Could not check the commander')
  const data = (await res.json()) as { kind: SecondSlotKind | null }
  return data.kind ?? null
}

const STALE = 60 * 1000

/** The server's answers for this deck's cards. `null` parts are still loading or failed (nothing is offered then). */
export function useCommanderEligibility(cards: ActionCard[], commanderName: string | null | undefined, enabled = true) {
  const commanders = useMemo(() => currentCommanders(cards, commanderName), [cards, commanderName])
  const allNames = useMemo(() => [...new Set(cards.filter((c) => !c.command_zone_role || c.command_zone_role === 'companion').map((c) => c.card_name))].sort(), [cards])
  const mainNames = useMemo(() => [...new Set(cards.filter(isMainListCard).map((c) => c.card_name))].sort(), [cards])
  const commander = commanders.length === 1 ? commanders[0] : null
  const wantLead = enabled && commanders.length === 0 && mainNames.length > 0

  const companionQ = useQuery({
    queryKey: ['commander-eligible', 'companion', allNames],
    queryFn: () => fetchNames('companion', { names: allNames }),
    enabled: enabled && allNames.length > 0,
    staleTime: STALE,
  })
  const leadQ = useQuery({
    queryKey: ['commander-eligible', 'lead', mainNames],
    queryFn: () => fetchNames('lead', { names: mainNames, deckNames: mainNames }),
    enabled: wantLead,
    staleTime: STALE,
  })
  const secondQ = useQuery({
    queryKey: ['commander-eligible', 'second', commander?.card_name ?? null, mainNames],
    queryFn: () =>
      fetchNames('second', { names: mainNames.filter((n) => n !== commander!.card_name), with: commander!.card_name }),
    enabled: enabled && !!commander,
    staleTime: STALE,
  })
  const kindQ = useQuery({
    queryKey: ['second-slot-kind', commander?.card_name ?? null],
    queryFn: () => fetchSecondSlotKind(commander!.card_name),
    enabled: enabled && !!commander,
    staleTime: 5 * 60 * 1000,
  })

  const empty = useMemo(() => new Set<string>(), [])
  const eligibility: CommanderEligibility = useMemo(
    () => ({
      lead: commanders.length === 0 ? leadQ.data ?? empty : empty,
      second: commander ? secondQ.data ?? empty : empty,
      companion: companionQ.data ?? empty,
      secondKind: kindQ.data ?? null,
    }),
    [commanders.length, commander, leadQ.data, secondQ.data, companionQ.data, kindQ.data, empty]
  )
  return { eligibility, companionNames: companionQ.data ?? null }
}

export interface CommanderActionsValue {
  actionsFor: (card: ActionCard) => CardCommanderAction[]
  run: (card: ActionCard, action: CardCommanderAction) => Promise<void>
  busyId: number | null
}

const Ctx = createContext<CommanderActionsValue | null>(null)

/** Null outside the Cards tab of a commander deck: no commander actions are shown. */
export function useCommanderActions(): CommanderActionsValue | null {
  return useContext(Ctx)
}

export function CommanderActionsProvider({
  deckId,
  cards,
  commanderName,
  deckTarget,
  children,
}: {
  deckId: number
  cards: ActionCard[]
  commanderName: string | null | undefined
  deckTarget: number | null | undefined
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const { eligibility } = useCommanderEligibility(cards, commanderName)
  const [busyId, setBusyId] = useState<number | null>(null)
  // Saves run one after another so the server sees them in the order they were clicked.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)

  const actionsFor = useCallback(
    (card: ActionCard) => offeredActions(card, cards, commanderName, eligibility, deckTarget),
    [cards, commanderName, eligibility, deckTarget]
  )

  const run = useCallback(
    async (card: ActionCard, action: CardCommanderAction) => {
      const key = deckKeys.detail(deckId)
      // Plan from what is on screen right now (which already includes earlier clicks that are still saving).
      const cached = queryClient.getQueryData<DeckCache>(key)
      const liveCards = (cached?.cards as ActionCard[] | undefined) ?? cards
      const liveName = cached ? cached.deck?.commander_name : commanderName
      const body = planCommandZoneBody(liveCards, liveName, action, card.id)
      if (!body) return

      // 1. Change the screen now: the card moves, the header and slots follow because they read the same deck data.
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData<DeckCache>(key)
      if (snapshot) {
        const local = applyCommandZoneLocally(snapshot.cards as DeckCardLike[], body, secondRoleForAction(action))
        queryClient.setQueryData<DeckCache>(key, {
          ...snapshot,
          cards: local.cards,
          deck: { ...snapshot.deck, commander_name: local.commanderName, commander_scryfall_id: local.commanderScryfallId },
        })
      }
      setBusyId(card.id)
      pending.current += 1

      // 2. Save in the background; 3. put it back with a clear message if the save fails.
      const save = queue.current.then(async () => {
        let error: string | null = null
        try {
          const res = await fetch(`/api/decks/${deckId}/command-zone`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (!res.ok) {
            const payload = (await res.json().catch(() => ({}))) as { error?: string }
            error = payload.error ?? 'The server could not save it.'
          }
        } catch {
          error = 'Could not reach the server.'
        }
        pending.current -= 1
        setBusyId((id) => (id === card.id ? null : id))
        if (error) {
          if (snapshot) queryClient.setQueryData(key, snapshot)
          toast.error(`Couldn't ${actionLabel(action).toLowerCase()} for ${card.card_name}. It has been put back. ${error}`)
          if (pending.current === 0) void queryClient.invalidateQueries({ queryKey: key })
          return
        }
        // The deck on screen already matches what was saved, so it is only marked out of date (no re-download of the
        // whole deck). The legality check and counts do depend on the new commander, so those reload.
        void queryClient.invalidateQueries({ queryKey: key, refetchType: 'none' })
        void queryClient.invalidateQueries({ queryKey: ['deck-legality'] })
        void queryClient.invalidateQueries({ queryKey: deckKeys.health(deckId) })
      })
      queue.current = save
      await save
    },
    [cards, commanderName, deckId, queryClient]
  )

  const value = useMemo(() => ({ actionsFor, run, busyId }), [actionsFor, run, busyId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { actionLabel }
