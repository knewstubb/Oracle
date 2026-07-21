'use client'

import { useState, useCallback } from 'react'
import { ScanSetup } from '@/components/scanner/ScanSetup'
import { ScannerViewfinder } from '@/components/scanner/ScannerViewfinder'
import { ReconciliationPage } from '@/components/scanner/ReconciliationPage'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanMode = 'add'  // V1: add to collection. V2 will add 'verify'

export interface ScanTarget {
  /** Target type */
  type: 'collection' | 'deck' | 'storage'
  /** Deck ID (when type = 'deck') */
  deckId?: number
  deckName?: string
  /** Storage location ID (when type = 'storage') */
  storageLocationId?: number
  storageLocationName?: string
}

export interface ScannedCard {
  /** Unique ID within the session (index-based) */
  sessionId: number
  /** Card identification */
  cardName: string
  oracleId: string | null
  /** Printing identification */
  scryfallId: string | null
  setCode: string | null
  collectorNumber: string | null
  /** User-editable metadata */
  isProxy: boolean
  isFoil: boolean
  condition: 'near_mint' | 'lightly_played' | 'moderately_played' | 'heavily_played' | 'damaged'
  /** Scryfall image URL for display */
  imageUrl: string | null
  /** Scan confidence */
  confidence: 'verified' | 'high' | 'unconfirmed'
  /** Timestamp of scan */
  scannedAt: number
}

type SessionPhase = 'setup' | 'scanning' | 'reconciliation'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScanSession() {
  const [phase, setPhase] = useState<SessionPhase>('setup')
  const [mode, setMode] = useState<ScanMode>('add')
  const [target, setTarget] = useState<ScanTarget>({ type: 'collection' })
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([])
  const [nextSessionId, setNextSessionId] = useState(1)

  const handleSetupComplete = useCallback((selectedMode: ScanMode, selectedTarget: ScanTarget) => {
    setMode(selectedMode)
    setTarget(selectedTarget)
    setPhase('scanning')
  }, [])

  const handleCardScanned = useCallback((card: Omit<ScannedCard, 'sessionId' | 'scannedAt'>) => {
    setScannedCards(prev => [
      ...prev,
      { ...card, sessionId: nextSessionId, scannedAt: Date.now() },
    ])
    setNextSessionId(id => id + 1)
  }, [nextSessionId])

  const handleRemoveCard = useCallback((sessionId: number) => {
    setScannedCards(prev => prev.filter(c => c.sessionId !== sessionId))
  }, [])

  const handleUpdateCard = useCallback((sessionId: number, updates: Partial<ScannedCard>) => {
    setScannedCards(prev => prev.map(c =>
      c.sessionId === sessionId ? { ...c, ...updates } : c
    ))
  }, [])

  const handleFinishScanning = useCallback(() => {
    setPhase('reconciliation')
  }, [])

  const handleBackToScanning = useCallback(() => {
    setPhase('scanning')
  }, [])

  const handleMarkLastProxy = useCallback(() => {
    setScannedCards(prev => {
      if (prev.length === 0) return prev
      const updated = [...prev]
      updated[updated.length - 1] = { ...updated[updated.length - 1], isProxy: true }
      return updated
    })
  }, [])

  const handleReset = useCallback(() => {
    setPhase('setup')
    setScannedCards([])
    setNextSessionId(1)
  }, [])

  switch (phase) {
    case 'setup':
      return <ScanSetup onComplete={handleSetupComplete} />

    case 'scanning':
      return (
        <ScannerViewfinder
          mode={mode}
          target={target}
          scannedCards={scannedCards}
          onCardScanned={handleCardScanned}
          onMarkLastProxy={handleMarkLastProxy}
          onFinish={handleFinishScanning}
        />
      )

    case 'reconciliation':
      return (
        <ReconciliationPage
          mode={mode}
          target={target}
          scannedCards={scannedCards}
          onRemoveCard={handleRemoveCard}
          onUpdateCard={handleUpdateCard}
          onBack={handleBackToScanning}
          onConfirm={handleReset}
        />
      )
  }
}
