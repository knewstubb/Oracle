'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { SecondSlotKind } from '@/lib/commander-pairing'
import {
  actionLabel,
  currentCommanders,
  isMainListCard,
  offeredActions,
  planCommandZoneBody,
  type ActionCard,
  type CardCommanderAction,
  type CommanderEligibility,
} from '@/lib/commander-card-actions'

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

  const actionsFor = useCallback(
    (card: ActionCard) => offeredActions(card, cards, commanderName, eligibility, deckTarget),
    [cards, commanderName, eligibility, deckTarget]
  )

  const run = useCallback(
    async (card: ActionCard, action: CardCommanderAction) => {
      const body = planCommandZoneBody(cards, commanderName, action, card.id)
      if (!body) return
      setBusyId(card.id)
      try {
        const res = await fetch(`/api/decks/${deckId}/command-zone`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string }
          toast.error(payload.error ?? 'Could not save the command zone.')
          return
        }
        toast.success(
          action.kind === 'remove-commander'
            ? `${card.card_name} is no longer a commander`
            : action.kind === 'add-companion'
              ? `${card.card_name} is the companion`
              : `${card.card_name} is a commander`
        )
        queryClient.invalidateQueries({ queryKey: ['deck-legality'] })
        queryClient.invalidateQueries({ queryKey: ['commander-eligible'] })
        await queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
      } catch {
        toast.error('Could not save the command zone.')
      } finally {
        setBusyId(null)
      }
    },
    [cards, commanderName, deckId, queryClient]
  )

  const value = useMemo(() => ({ actionsFor, run, busyId }), [actionsFor, run, busyId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { actionLabel }
