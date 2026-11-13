'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Inbox, Package, Layers, Search, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  emptySlotsHint,
  filterByName,
  showDestinationSearch,
  sortByName,
  statusWord,
} from '@/lib/import-destinations-list'
import type { DestinationsResponse, ImportDestination } from '../../../docs/oracle/contracts/know-where-cards-are.types'

export type DestinationPlaces =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DestinationsResponse }

export interface ImportDestinationPickerProps {
  value: ImportDestination
  onChange: (destination: ImportDestination) => void
  places: DestinationPlaces
  onRetry: () => void
  /** Copies in the file, for the one-line note under the picker. */
  copyCount: number
}

interface Option {
  key: string
  group: 'Unsorted' | 'Boxes and binders' | 'Decks'
  name: string
  hint: string
  destination: ImportDestination
}

/** Key of the option a destination points at. */
export function destinationKey(d: ImportDestination): string {
  if (d.kind === 'unsorted') return 'unsorted'
  return d.kind === 'storage' ? `storage:${d.locationId}` : `deck:${d.deckId}`
}

/** The name of the chosen place, or Unsorted when it is not (or no longer) in the list. */
export function destinationName(d: ImportDestination, data: DestinationsResponse | null): string {
  if (d.kind === 'storage') return data?.storage.find((s) => s.locationId === d.locationId)?.name ?? 'Unsorted'
  if (d.kind === 'deck') return data?.decks.find((x) => x.deckId === d.deckId)?.name ?? 'Unsorted'
  return 'Unsorted'
}

export function buildOptions(data: DestinationsResponse): Option[] {
  const out: Option[] = [
    { key: 'unsorted', group: 'Unsorted', name: 'Unsorted', hint: 'default', destination: { kind: 'unsorted' } },
  ]
  for (const s of sortByName(data.storage.map((x) => ({ ...x, name: x.name })))) {
    out.push({
      key: `storage:${s.locationId}`,
      group: 'Boxes and binders',
      name: s.name,
      hint: `${s.copyCount} ${s.copyCount === 1 ? 'card' : 'cards'}`,
      destination: { kind: 'storage', locationId: s.locationId },
    })
  }
  for (const d of sortByName(data.decks)) {
    out.push({
      key: `deck:${d.deckId}`,
      group: 'Decks',
      name: d.name,
      hint: `${statusWord(d.status)} · ${emptySlotsHint(d.emptySlots)}`,
      destination: { kind: 'deck', deckId: d.deckId },
    })
  }
  return out
}

const GROUPS: Option['group'][] = ['Unsorted', 'Boxes and binders', 'Decks']

function GroupIcon({ group }: { group: Option['group'] }) {
  const cls = 'size-4 shrink-0 text-muted-foreground'
  if (group === 'Unsorted') return <Inbox className={cls} aria-hidden="true" />
  if (group === 'Boxes and binders') return <Package className={cls} aria-hidden="true" />
  return <Layers className={cls} aria-hidden="true" />
}

/** The "Put these cards in" row under "Importing as" on the collection import review step (spec section 21). */
export function ImportDestinationPicker({ value, onChange, places, onRetry, copyCount }: ImportDestinationPickerProps) {
  const isMobile = useIsMobile()
  const labelId = useId()
  const valueId = useId()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const data = places.status === 'ready' ? places.data : null
  const options = useMemo(() => (data ? buildOptions(data) : []), [data])
  const hasSearch = data ? showDestinationSearch(data.storage.length, data.decks.length) : false
  const hasChoices = !!data && data.storage.length + data.decks.length > 0
  const selectedKey = destinationKey(value)

  const shown = useMemo(() => {
    const matched = new Set(filterByName(options, query).map((o) => o.key))
    return options.filter((o) => matched.has(o.key))
  }, [options, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }, [])

  const choose = useCallback(
    (option: Option) => {
      onChange(option.destination)
      close()
    },
    [onChange, close]
  )

  // Escape closes the list and returns focus to the button (the dialog's own Escape handling is held off).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, close])

  // On open: laptop focuses the search (when there is one) or the chosen row; phone focuses nothing automatically
  // beyond the chosen row, so the keyboard does not cover the list.
  useEffect(() => {
    if (!open) return
    if (hasSearch && !isMobile) {
      searchRef.current?.focus()
      return
    }
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')
    const selected = Array.from(rows ?? []).find((r) => r.getAttribute('aria-selected') === 'true')
    ;(selected ?? rows?.[0])?.focus()
  }, [open, hasSearch, isMobile])

  const moveFocus = (from: HTMLElement | null, delta: 1 | -1) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    const index = from ? rows.indexOf(from) : -1
    const next = rows[index + delta]
    if (next) next.focus()
    else if (delta === -1 && hasSearch) searchRef.current?.focus()
  }

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
    }
  }

  // ---- states without a picker ----
  if (places.status === 'ready' && !hasChoices) {
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[length:var(--fs-sm)]">
        <span className="text-muted-foreground">Put these cards in:</span> <strong className="font-medium">Unsorted</strong>
        <span className="text-muted-foreground"> · You have no boxes, binders or decks yet to choose from.</span>
      </div>
    )
  }

  const current = options.find((o) => o.key === selectedKey) ?? options[0]
  const triggerName =
    places.status === 'loading' ? 'Loading your places…' : current ? current.name : 'Unsorted'
  const triggerHint = places.status === 'ready' && current ? current.hint : ''

  const note =
    value.kind === 'storage'
      ? `All ${copyCount} ${copyCount === 1 ? 'copy goes' : 'copies go'} straight into ${destinationName(value, data)}. Nothing is added to the Picklist.`
      : places.status === 'loading'
        ? 'Cards go to Unsorted unless you choose a place.'
        : 'They land in Unsorted. Put them away later from the Picklist.'

  const list = (
    <div ref={listRef} className="flex min-h-0 flex-col">
      {hasSearch && (
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-2 py-1.5">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                moveFocus(null, 1)
              }
            }}
            placeholder="Search places"
            aria-label="Search places"
            className="h-8 min-h-8 w-full bg-transparent text-[length:var(--fs-sm)] outline-none max-sm:h-11"
          />
        </div>
      )}
      <div
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        className="min-h-0 flex-1 overflow-y-auto py-1"
        style={{ maxHeight: isMobile ? '50vh' : 260 }}
      >
        {shown.length === 0 ? (
          <div className="px-3 py-3 text-[length:var(--fs-sm)] text-muted-foreground">
            <p>No place matches “{query}”.</p>
            <p>
              Clear the search to see all {options.length} places. Missing and In your hand aren&apos;t places you can
              import into.
            </p>
          </div>
        ) : (
          GROUPS.map((group) => {
            const rows = shown.filter((o) => o.group === group)
            if (rows.length === 0) return null
            return (
              <div key={group} role="group" aria-label={group}>
                <div className="px-3 pb-0.5 pt-1.5 text-[length:var(--fs-xs)] uppercase tracking-wide text-muted-foreground">
                  {group}
                </div>
                {rows.map((o) => {
                  const selected = o.key === selectedKey
                  return (
                    <div
                      key={o.key}
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      onClick={() => choose(o)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          choose(o)
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          moveFocus(e.currentTarget, 1)
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          moveFocus(e.currentTarget, -1)
                        }
                      }}
                      className={cn(
                        'flex min-h-8 cursor-pointer items-center gap-2 px-3 py-1.5 text-[length:var(--fs-sm)] outline-none hover:bg-[var(--bg-hover,rgba(255,255,255,0.06))] focus-visible:bg-[var(--bg-hover,rgba(255,255,255,0.06))] max-sm:min-h-12',
                        selected && 'bg-[rgba(29,158,117,0.12)]'
                      )}
                    >
                      <GroupIcon group={o.group} />
                      <span className="min-w-0 flex-1 truncate">{o.name}</span>
                      <span className="shrink-0 text-[length:var(--fs-xs)] text-muted-foreground">{o.hint}</span>
                      {selected && <Check className="size-4 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )

  return (
    <div className="relative rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-sm)] max-sm:flex-col max-sm:items-stretch">
        <span id={labelId} className="text-muted-foreground">
          Put these cards in
        </span>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={`${labelId} ${valueId}`}
          aria-disabled={places.status === 'loading'}
          disabled={places.status === 'loading'}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onTriggerKey}
          className="flex min-h-8 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-canvas)] px-2 hover:border-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] disabled:cursor-not-allowed max-sm:min-h-11 max-sm:w-full"
        >
          {current && <GroupIcon group={current.group} />}
          <span id={valueId} className="min-w-0 flex-1 truncate text-left">
            {triggerName}
            {places.status === 'ready' && value.kind === 'unsorted' && (
              <span className="text-muted-foreground"> · default</span>
            )}
          </span>
          {triggerHint && value.kind !== 'unsorted' && (
            <span className="shrink-0 text-[length:var(--fs-xs)] text-muted-foreground">{triggerHint}</span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>

      <p role="status" className="mt-1.5 text-[length:var(--fs-xs)] text-muted-foreground">
        {note}
      </p>

      {places.status === 'error' && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--signal-warning)] bg-[var(--signal-warning-bg)] px-2.5 py-1.5 text-[length:var(--fs-xs)]"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--signal-warning)]" aria-hidden="true" />
          <div className="flex-1">
            <p>Couldn&apos;t load your boxes, binders and decks.</p>
            <p className="text-muted-foreground">Cards will go to Unsorted. You can put them away later.</p>
          </div>
          <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-foreground">
            Try again
          </button>
        </div>
      )}

      {open && !isMobile && (
        <div className="mt-2 overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)]">
          {list}
        </div>
      )}

      {open && isMobile && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={close} aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-0 z-50 overflow-hidden rounded-t-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] pb-2">
            <div className="px-3 py-2 text-[length:var(--fs-sm)] font-medium">Put these cards in</div>
            {list}
          </div>
        </>
      )}
    </div>
  )
}
