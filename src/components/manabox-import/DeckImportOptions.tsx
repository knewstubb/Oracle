'use client'

import { Input } from '@/components/ui/input'
import { FORMAT_OPTIONS } from '@/lib/format-config'

export interface DeckImportOptionsProps {
  name: string
  onNameChange: (name: string) => void
  format: string
  onFormatChange: (format: string) => void
  /** The commander row (commander, plus Partner / Background and Companion when they apply). Its own row below Name and Format. */
  commanderSlot?: React.ReactNode
  /** One amber line under the Name field (a deck with this name exists). Warns only. */
  nameNote?: string | null
  disabled?: boolean
}

export function DeckImportOptions({
  name,
  onNameChange,
  format,
  onFormatChange,
  commanderSlot,
  nameNote,
  disabled,
}: DeckImportOptionsProps) {
  return (
    <div className="flex flex-col gap-2.5">
    <div className="grid grid-cols-[1fr_150px] items-start gap-2.5">
      <div className="flex flex-col gap-1">
        <label htmlFor="import-deck-name" className="text-[length:var(--fs-xs)] text-muted-foreground">
          Name
        </label>
        <Input
          id="import-deck-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!name.trim()}
          autoFocus
          aria-describedby={nameNote ? 'import-deck-name-note' : undefined}
        />
        {nameNote && (
          <p id="import-deck-name-note" className="text-[length:var(--fs-xs)] text-[var(--signal-warning)]">
            {nameNote}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="import-deck-format" className="text-[length:var(--fs-xs)] text-muted-foreground">
          Format
        </label>
        <select
          id="import-deck-format"
          value={format}
          onChange={(e) => onFormatChange(e.target.value)}
          disabled={disabled}
          className="h-8 w-full cursor-pointer rounded-lg border border-input bg-transparent px-2.5 text-[length:var(--fs-sm)] outline-none hover:border-[var(--text-secondary)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
      {commanderSlot}
    </div>
  )
}
