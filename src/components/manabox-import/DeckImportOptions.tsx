'use client'

import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FORMAT_OPTIONS, getFormatConfig } from '@/lib/format-config'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export interface DeckImportOptionsProps {
  name: string
  onNameChange: (name: string) => void
  format: string
  onFormatChange: (format: string) => void
  genericBasics: boolean
  onGenericBasicsChange: (value: boolean) => void
  basicsQty: number
  cardCount: number
  disabled?: boolean
}

export function DeckImportOptions({
  name,
  onNameChange,
  format,
  onFormatChange,
  genericBasics,
  onGenericBasicsChange,
  basicsQty,
  cardCount,
  disabled,
}: DeckImportOptionsProps) {
  const fmt = getFormatConfig(format)
  const countLine =
    fmt.deckSize === null
      ? `${cardCount}`
      : `${cardCount}/${fmt.deckSize}${format === 'commander' ? ' · commander picked next' : ''}`

  return (
    <div className="grid grid-cols-[1fr_150px_auto] items-end gap-2.5">
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
        />
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

      {basicsQty > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="flex items-center gap-2">
                  <span
                    id="generic-basics-label"
                    className="text-[length:var(--fs-xs)] text-muted-foreground"
                  >
                    Generic basics
                  </span>
                  <Switch
                    checked={genericBasics}
                    onCheckedChange={onGenericBasicsChange}
                    disabled={disabled}
                    aria-labelledby="generic-basics-label"
                  />
                  <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                    {basicsQty}
                  </span>
                </div>
              }
            />
            <TooltipContent>
              <p>Basic lands count as sleeved and add no copies</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <div className="col-span-full text-[length:var(--fs-xs)] text-muted-foreground">
        {countLine}
      </div>
    </div>
  )
}
