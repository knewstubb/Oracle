'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidDeck {
  deckId: number
  deckName: string
  deckStatus: string
}

interface DeckPickerPopoverProps {
  /** List of valid decks (already filtered by color identity) */
  validDecks: ValidDeck[]
  /** Whether valid decks are still loading */
  isLoading?: boolean
  /** Called when a deck is selected */
  onSelect: (deck: ValidDeck) => void
  /** Optional: disabled state */
  disabled?: boolean
  /** Trigger button label (default: "Assign") */
  label?: string
  /** Trigger button variant */
  variant?: 'outline' | 'default'
  children?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Popover deck picker filtered to valid decks (color identity match).
 * Reuses teal-outline button styling. Used in:
 * - StatusChipPopover's Reassign action
 * - Storage detail view's Assign button
 * - InstanceDetailPanel's Reassign action
 */
export function DeckPickerPopover({
  validDecks,
  isLoading = false,
  onSelect,
  disabled = false,
  label = 'Assign',
  variant = 'outline',
  children,
}: DeckPickerPopoverProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (deck: ValidDeck) => {
    setOpen(false)
    onSelect(deck)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            variant={variant}
            size="sm"
            disabled={disabled}
            className="shrink-0"
            style={{
              color: 'var(--accent-primary)',
              borderColor: 'var(--accent-primary)',
            }}
          >
            {label}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-[240px] p-0"
      >
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : validDecks.length === 0 ? (
          <div className="p-3">
            <p className="text-[length:var(--fs-sm)] text-muted-foreground">
              No valid decks for this card&apos;s color identity.
            </p>
          </div>
        ) : (
          <div className="max-h-[240px] overflow-y-auto py-1">
            {validDecks.map((deck) => (
              <button
                key={deck.deckId}
                type="button"
                onClick={() => handleSelect(deck)}
                className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.05)]"
              >
                <span className="truncate text-[length:var(--fs-sm)] font-medium text-foreground">
                  {deck.deckName}
                </span>
                <span
                  className="shrink-0 ml-2 rounded-full px-1.5 py-0.5 text-[length:10px] font-medium leading-none"
                  style={{
                    background: deck.deckStatus === 'brewing'
                      ? 'rgba(59,130,246,0.15)'
                      : 'rgba(34,197,94,0.15)',
                    color: deck.deckStatus === 'brewing'
                      ? 'rgb(96,165,250)'
                      : 'rgb(74,222,128)',
                  }}
                >
                  {deck.deckStatus}
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
