'use client'
// Owns the Deck settings window for the deck page so the rail's two Edit links (Strategy & bracket, Deck health) open the
// same dialog on different tabs. Also owns the Strategy read and save, which used to live in the Strategy block.
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { StrategyWindowData } from '@/lib/deck-strategy-window'
import type { SaveResult, WindowValues } from './StrategyWindow'
import { DeckSettingsWindow, type SettingsTab } from './DeckSettingsWindow'
import type { HealthCardInput } from './DeckHealthTab'
import { useOnlineStatus } from './useOnlineStatus'

export const strategyKey = (deckId: number) => [...deckKeys.detail(deckId), 'strategy-window'] as const
const SAVE_FAILED = "Couldn't save. Your changes are still here and nothing was lost. Check your connection. It will try again by itself."

export async function fetchStrategy(deckId: number): Promise<StrategyWindowData> {
  const res = await fetch(`/api/decks/${deckId}/strategy-window`)
  if (!res.ok) throw new Error('Failed to load strategy')
  return res.json()
}

type OpenSettings = (tab: SettingsTab, from: HTMLElement | null) => void
const SettingsContext = createContext<OpenSettings>(() => {})
/** Opens the Deck settings window on a tab. Does nothing outside a DeckSettingsHost. */
export const useOpenDeckSettings = () => useContext(SettingsContext)

export interface DeckSettingsHostProps {
  deckId: number
  deckName: string
  cards: HealthCardInput[]
  /** Opens wherever History opens today (the deck's Version History window). */
  onSeeHistory: () => void
  children: React.ReactNode
}

export function DeckSettingsHost({ deckId, deckName, cards, onSeeHistory, children }: DeckSettingsHostProps) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [tab, setTab] = useState<SettingsTab | null>(null)
  const [lastTab, setLastTab] = useState<SettingsTab>('strategy')
  const [announce, setAnnounce] = useState('')
  // Focus returns to the Edit link that opened the window.
  const returnTo = useRef<HTMLElement | null>(null)
  const { data } = useQuery<StrategyWindowData>({
    queryKey: strategyKey(deckId),
    queryFn: () => fetchStrategy(deckId),
    staleTime: 60 * 1000,
    retry: 1,
    networkMode: 'always',
  })
  const open = useCallback<OpenSettings>((t, from) => {
    returnTo.current = from
    setLastTab(t)
    setTab(t)
  }, [])
  const save = async (changed: Partial<WindowValues>): Promise<SaveResult> => {
    let res: Response
    try {
      res = await fetch(`/api/decks/${deckId}/strategy-window`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      })
    } catch {
      return { ok: false, error: SAVE_FAILED }
    }
    if (!res.ok) {
      let message = SAVE_FAILED
      try {
        const body = (await res.json()) as { error?: string; code?: string }
        // A specific refusal the owner can act on (for example bracket 5 before the stored-data update) is shown as written.
        if (body.code === 'bracket_5_not_stored_yet' && body.error) message = `${body.error} Your changes are still here.`
        else if (res.status === 400 && body.error) message = `${body.error} Your changes are still here and nothing was lost.`
      } catch {
        /* keep the general message */
      }
      return { ok: false, error: message }
    }
    const { notSaved, ...fresh } = (await res.json()) as StrategyWindowData & { notSaved?: string[] }
    queryClient.setQueryData(strategyKey(deckId), fresh)
    if (!notSaved || notSaved.length === 0) setAnnounce('Strategy saved')
    return { ok: true, notSaved }
  }
  const saveOnLeave = (changed: Partial<WindowValues>) => {
    void fetch(`/api/decks/${deckId}/strategy-window`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changed),
      keepalive: true,
    }).catch(() => {})
  }
  return (
    <SettingsContext.Provider value={open}>
      {children}
      <span role="status" aria-live="polite" className="sr-only">{announce}</span>
      <DeckSettingsWindow
        open={tab !== null}
        deckId={deckId}
        initialTab={tab ?? lastTab}
        cards={cards}
        deckName={deckName}
        data={data}
        online={online}
        onClose={() => setTab(null)}
        onSave={save}
        onSaveOnLeave={saveOnLeave}
        onSeeHistory={onSeeHistory}
        finalFocusRef={returnTo}
      />
    </SettingsContext.Provider>
  )
}
