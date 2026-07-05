'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { SaveOptions } from '@/types/brew'

interface BrewSaveDialogProps {
  commanderName: string
  defaultDeckName: string
  cardCount: number
  onSave: (options: SaveOptions) => void
  onCancel: () => void
  isSaving: boolean
  error: string | null
}

export function BrewSaveDialog({
  commanderName,
  defaultDeckName,
  cardCount,
  onSave,
  onCancel,
  isSaving,
  error,
}: BrewSaveDialogProps) {
  const [deckName, setDeckName] = useState(defaultDeckName)
  const [pushToArchidekt, setPushToArchidekt] = useState(true)

  const isValid = deckName.trim().length > 0
  const isComplete = cardCount === 100

  function handleSave() {
    if (!isValid || isSaving) return
    onSave({ deckName: deckName.trim(), pushToArchidekt })
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">Save Deck</h3>

      {/* Deck name input */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="brew-deck-name"
          className="text-xs text-muted-foreground"
        >
          Deck name
        </label>
        <input
          id="brew-deck-name"
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          disabled={isSaving}
          placeholder={`${commanderName} Deck`}
          className="w-full rounded-md border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--color-teal)] focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)] disabled:opacity-50"
        />
      </div>

      {/* Card count summary */}
      <div className="text-xs text-muted-foreground">
        {isComplete ? (
          <span className="text-green-400">{cardCount}/100 cards ✓</span>
        ) : (
          <span className="text-yellow-400">{cardCount}/100 cards ⚠️</span>
        )}
      </div>

      {/* Archidekt toggle */}
      <label
        htmlFor="brew-archidekt-toggle"
        className="flex items-center gap-2 cursor-pointer"
      >
        <input
          id="brew-archidekt-toggle"
          type="checkbox"
          checked={pushToArchidekt}
          onChange={(e) => setPushToArchidekt(e.target.checked)}
          disabled={isSaving}
          className="h-4 w-4 rounded border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] accent-[var(--color-teal)]"
        />
        <span className="text-xs text-muted-foreground">
          Also create in Archidekt
        </span>
      </label>

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!isValid || isSaving}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSaving ? 'Saving…' : 'Save Deck'}
      </button>

      {/* Cancel button */}
      <button
        type="button"
        onClick={onCancel}
        disabled={isSaving}
        className="w-full rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
      >
        Cancel
      </button>

      {/* Error display */}
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
