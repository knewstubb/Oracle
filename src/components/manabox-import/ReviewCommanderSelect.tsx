'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Crown, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { fetchEligibleNames, type CommanderCandidate } from './CommanderPicker'

export interface ReviewCommanderSelectProps {
  /** Every non-basic card in the file (duplicates are fine). */
  cards: CommanderCandidate[]
  value: CommanderCandidate | null
  onChange: (commander: CommanderCandidate | null) => void
  disabled?: boolean
}

/**
 * Commander picker for the import review screen. Lists only the cards in this file that can
 * legally be a commander (checked against our card data), plus a plain "No commander" choice.
 * The choice is held by the import and saved on the new deck when the import finishes.
 */
export function ReviewCommanderSelect({ cards, value, onChange, disabled }: ReviewCommanderSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [eligible, setEligible] = useState<Set<string> | null>(null)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const namesKey = useMemo(() => [...new Set(cards.map((c) => c.name))].sort().join('\n'), [cards])

  useEffect(() => {
    if (!open || eligible) return
    let cancelled = false
    fetchEligibleNames(namesKey ? namesKey.split('\n') : []).then((set) => {
      if (cancelled) return
      setFailed(set === null)
      if (set !== null) setEligible(set)
    })
    return () => {
      cancelled = true
    }
  }, [open, eligible, namesKey])

  useEffect(() => {
    if (open) queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const seen = new Set<string>()
    return cards.filter((c) => {
      if (!eligible?.has(c.name) || seen.has(c.name)) return false
      seen.add(c.name)
      return !q || c.name.toLowerCase().includes(q)
    })
  }, [cards, eligible, query])

  const choose = (commander: CommanderCandidate | null) => {
    onChange(commander)
    setOpen(false)
    setQuery('')
  }

  const optionClass =
    'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[length:var(--fs-sm)] hover:bg-[var(--bg-surface-hover)] focus-visible:bg-[var(--bg-surface-hover)]'

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id="import-commander-label" className="text-[length:var(--fs-xs)] text-muted-foreground">
        Commander
      </span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              aria-labelledby="import-commander-label import-commander-value"
              aria-haspopup="dialog"
              aria-expanded={open}
              className="w-full justify-start"
            />
          }
        >
          <Crown className="size-4 shrink-0" aria-hidden="true" />
          <span id="import-commander-value" className={cn('truncate', !value && 'text-muted-foreground')}>
            {value ? value.name : 'No commander'}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="end">
          <div className="flex flex-col gap-2">
            <Input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this deck"
              aria-label="Search this deck"
              autoComplete="off"
              className="h-8 text-[length:var(--fs-sm)]"
            />
            <div role="listbox" aria-label="Commander candidates" className="max-h-56 overflow-auto">
              <button type="button" role="option" aria-selected={!value} onClick={() => choose(null)} className={optionClass}>
                <span>No commander</span>
                {!value && <Check className="size-3.5" aria-hidden="true" />}
              </button>
              {failed && (
                <div role="alert" className="py-3 text-center text-[length:var(--fs-sm)] text-destructive">
                  Couldn&apos;t check commanders. Close and try again.
                </div>
              )}
              {!failed && eligible === null && (
                <div className="flex items-center justify-center gap-2 py-3 text-[length:var(--fs-sm)] text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Checking which cards can be commander…
                </div>
              )}
              {eligible !== null && options.length === 0 && (
                <div className="py-3 text-center text-[length:var(--fs-sm)] text-muted-foreground">
                  {query ? 'No match in this deck.' : 'No card in this deck can be a commander.'}
                </div>
              )}
              {options.map((card) => (
                <button
                  key={card.name}
                  type="button"
                  role="option"
                  aria-selected={value?.name === card.name}
                  onClick={() => choose(card)}
                  className={optionClass}
                >
                  <span className="truncate">{card.name}</span>
                  {value?.name === card.name && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
