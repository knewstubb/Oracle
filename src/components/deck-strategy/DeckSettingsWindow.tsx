'use client'
// Deck settings: one window with two tabs. Strategy is the existing Strategy form (StrategyWindow); Deck health holds the
// health targets (DeckHealthTab). Both save by themselves; closing waits for both.
import { useRef, useState } from 'react'
import { StrategyWindow, type StrategyWindowProps, type SettingsTab } from './StrategyWindow'
import { DeckHealthTab } from './DeckHealthTab'
import type { HealthCardInput } from './DeckHealthTab'

export type { SettingsTab }

export interface DeckSettingsWindowProps extends Omit<StrategyWindowProps, 'settings'> {
  deckId: number
  initialTab: SettingsTab
  /** The deck's main-deck cards, for the "N now" counts of custom categories and the Add category suggestions. */
  cards: HealthCardInput[]
}

export function DeckSettingsWindow({ deckId, initialTab, cards, ...rest }: DeckSettingsWindowProps) {
  // The tab the window opened on is the starting tab each time it opens (adjusting state during render).
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [wasOpen, setWasOpen] = useState(rest.open)
  if (rest.open !== wasOpen) {
    setWasOpen(rest.open)
    if (rest.open) setTab(initialTab)
  }
  const flushHealth = useRef<(() => Promise<boolean>) | null>(null)
  return (
    <StrategyWindow
      {...rest}
      settings={{ tab, onTabChange: setTab, flushHealth, health: <DeckHealthTab deckId={deckId} cards={cards} online={rest.online} flushRef={flushHealth} /> }}
    />
  )
}
