'use client'

/**
 * Collection Tag filter (spec: docs/oracle/specs/deck-rail-strategy-tags.md section 4b).
 * One "Tags" button at the end of the filter row opens a list of the 40 Tags. Ticking applies at once.
 * Words: Tag (what a card does in any deck). No "role" anywhere in this file's screen text.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Tag as TagIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALL_TAGS, type TagMatch } from '@/lib/card-tags-read'

const GREEN = '#1D9E75'
const BROAD = ALL_TAGS.filter((t) => t.kind === 'broad')
const MECHANIC = ALL_TAGS.filter((t) => t.kind === 'mechanic')

export interface CollectionTagFilterProps {
  selectedTags: string[]
  onTagsChange: (keys: string[]) => void
  tagsMatch: TagMatch
  onTagsMatchChange: (match: TagMatch) => void
  /** Number of cards the list now shows, or null while it is being worked out. */
  resultCount: number | null
}

const tagName = (key: string) => ALL_TAGS.find((t) => t.key === key)?.name ?? key
export const matchWords = (match: TagMatch, count: number) => (count < 2 ? '' : match === 'all' ? ' (all of them)' : ' (any of them)')

export function CollectionTagFilter({ selectedTags, onTagsChange, tagsMatch, onTagsMatchChange, resultCount }: CollectionTagFilterProps) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const findRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const count = selectedTags.length

  const close = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (open) findRef.current?.focus()
  }, [open])

  // Desktop: the panel sits under the button. It is drawn on the page itself (not inside the scrolling filter row), so the row cannot clip it.
  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect()
      if (!r) return
      const width = 360
      setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      // Keep Tab inside the panel (it is a sheet on a phone).
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, close])

  const toggle = (key: string) =>
    onTagsChange(selectedTags.includes(key) ? selectedTags.filter((k) => k !== key) : [...selectedTags, key])

  const needle = find.trim().toLowerCase()
  const matches = useMemo(() => (t: { name: string }) => !needle || t.name.toLowerCase().includes(needle), [needle])
  const broad = BROAD.filter(matches)
  const mechanic = MECHANIC.filter(matches)

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count > 0 ? `Tags: ${count} selected` : 'Tags'}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[length:var(--fs-sm)] transition-colors',
          count > 0 ? 'font-semibold' : 'text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.05)]'
        )}
        style={{
          border: count > 0 ? `1px solid ${GREEN}` : '0.5px solid rgba(255,255,255,0.2)',
          background: count > 0 ? 'rgba(29,158,117,0.12)' : undefined,
          color: count > 0 ? '#5fd9ad' : undefined,
        }}
      >
        <TagIcon className="size-4" aria-hidden="true" />
        {count > 0 ? `Tags: ${count}` : 'Tags'}
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-black/60 sm:hidden" aria-hidden="true" />
          <div
            ref={panelRef}
            role="dialog"
            aria-labelledby={titleId}
            className={cn(
              'z-50 flex flex-col gap-2 overflow-hidden bg-[#1a1a1a] p-3 text-white shadow-xl',
              'fixed inset-x-0 bottom-0 max-h-[86vh] rounded-t-2xl',
              'sm:inset-x-auto sm:bottom-auto sm:w-[360px] sm:rounded-xl'
            )}
            style={{ border: '0.5px solid rgba(255,255,255,0.18)', ...(pos && window.matchMedia?.('(min-width: 640px)').matches ? { top: pos.top, left: pos.left, maxHeight: `calc(100vh - ${pos.top + 16}px)` } : {}) }}
          >
            <div>
              <h2 id={titleId} className="text-[length:var(--fs-md)] font-semibold">Filter by Tag</h2>
              <p className="text-[length:var(--fs-xs)] text-[rgba(255,255,255,0.7)]">What a card does in any deck. Each Tag is a plain yes or no.</p>
            </div>
            <input
              ref={findRef}
              type="text"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Find a Tag"
              aria-label="Find a Tag in this list"
              className="min-h-11 w-full rounded-md px-3 text-[length:var(--fs-sm)] text-white placeholder:text-[rgba(255,255,255,0.4)]"
              style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.25)' }}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {broad.length === 0 && mechanic.length === 0 && (
                <p className="px-1 py-3 text-[length:var(--fs-sm)] text-[rgba(255,255,255,0.7)]">No Tag has that word in its name.</p>
              )}
              <TagGroup title="Broad Tags" total={BROAD.length} tags={broad} selected={selectedTags} onToggle={toggle} />
              <TagGroup title="Mechanic Tags" total={MECHANIC.length} tags={mechanic} selected={selectedTags} onToggle={toggle} />
            </div>
            {count >= 2 && (
              <div role="radiogroup" aria-label="Show cards with" className="flex items-center gap-2">
                <span className="text-[length:var(--fs-sm)]">Show cards with</span>
                {(['all', 'any'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={tagsMatch === m}
                    onClick={() => onTagsMatchChange(m)}
                    className={cn('inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[length:var(--fs-sm)]', tagsMatch === m && 'font-semibold')}
                    style={{
                      border: tagsMatch === m ? `1px solid ${GREEN}` : '0.5px solid rgba(255,255,255,0.25)',
                      background: tagsMatch === m ? 'rgba(29,158,117,0.15)' : undefined,
                    }}
                  >
                    {tagsMatch === m && <Check className="size-3.5" aria-hidden="true" />}
                    {m === 'all' ? 'All of them' : 'Any of them'}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[length:var(--fs-xs)] text-[rgba(255,255,255,0.7)]">Cards released after 7 August 2026 have no Tags yet.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onTagsChange([])}
                disabled={count === 0}
                className="min-h-11 rounded-md px-3 text-[length:var(--fs-sm)] disabled:opacity-40"
                style={{ border: '0.5px solid rgba(255,255,255,0.25)' }}
              >
                Clear Tags
              </button>
              <span className="flex-1 text-center text-[length:var(--fs-sm)] text-[rgba(255,255,255,0.8)]" role="status" aria-live="polite">
                {count === 0 ? '' : resultCount === null ? 'Checking…' : `${resultCount.toLocaleString()} ${resultCount === 1 ? 'card' : 'cards'}`}
              </span>
              <button
                type="button"
                onClick={close}
                className="min-h-11 rounded-md px-4 text-[length:var(--fs-sm)] font-semibold text-black"
                style={{ background: GREEN }}
              >
                Done
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

function TagGroup({
  title,
  total,
  tags,
  selected,
  onToggle,
}: {
  title: string
  total: number
  tags: { key: string; name: string }[]
  selected: string[]
  onToggle: (key: string) => void
}) {
  if (tags.length === 0) return null
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="px-1 pb-1 pt-2 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-[rgba(255,255,255,0.7)]">
        {title} ({total})
      </legend>
      {tags.map((t) => {
        const on = selected.includes(t.key)
        return (
          <label
            key={t.key}
            className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 text-[length:var(--fs-sm)] hover:bg-[rgba(255,255,255,0.06)] sm:min-h-11', on && 'font-semibold')}
          >
            <input type="checkbox" checked={on} onChange={() => onToggle(t.key)} className="size-[22px] shrink-0 accent-[#1D9E75]" />
            <span>{t.name}</span>
          </label>
        )
      })}
    </fieldset>
  )
}

/** The line under the filter row once Tags are picked: which Tags, how they combine, how many cards, and a Clear Tags button. */
export function TagSummaryLine({
  selectedTags,
  tagsMatch,
  resultCount,
  onClear,
}: {
  selectedTags: string[]
  tagsMatch: TagMatch
  resultCount: number | null
  onClear: () => void
}) {
  if (selectedTags.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-2 text-[length:var(--fs-sm)] text-[rgba(255,255,255,0.85)]">
      <span role="status" aria-live="polite">
        Tags: {selectedTags.map(tagName).join(', ')}
        {matchWords(tagsMatch, selectedTags.length)} · {resultCount === null ? 'Checking…' : `${resultCount.toLocaleString()} ${resultCount === 1 ? 'card' : 'cards'}`}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="min-h-11 rounded-md px-3 text-[length:var(--fs-sm)]"
        style={{ border: '0.5px solid rgba(255,255,255,0.25)' }}
      >
        Clear Tags
      </button>
    </div>
  )
}

/** Shown instead of the list when the chosen Tags (with the other filters) match no card. */
export function TagEmptyState({
  selectedTags,
  tagsMatch,
  onClearTags,
  onClearAll,
}: {
  selectedTags: string[]
  tagsMatch: TagMatch
  onClearTags: () => void
  onClearAll: () => void
}) {
  const names = selectedTags.map(tagName)
  const many = names.length >= 2
  const asked = many
    ? `You own no cards with ${tagsMatch === 'all' ? 'all' : 'any'} of these Tags: ${names.join(', ')}.`
    : `You own no cards with the Tag ${names[0]}.`
  const hint = many ? 'Try Any of them, or take a Tag off.' : 'Try taking a filter off.'
  return (
    <div className="m-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-lg p-6 text-center" style={{ border: '1px dashed rgba(255,255,255,0.3)' }} role="status" aria-live="polite">
      <p className="text-[length:var(--fs-md)] font-semibold">No cards match</p>
      <p className="text-[length:var(--fs-sm)] text-[rgba(255,255,255,0.8)]">{asked}</p>
      <p className="text-[length:var(--fs-sm)] text-[rgba(255,255,255,0.8)]">{hint}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onClearTags} className="min-h-11 rounded-md px-4 text-[length:var(--fs-sm)]" style={{ border: '0.5px solid rgba(255,255,255,0.3)' }}>
          Clear Tags
        </button>
        <button type="button" onClick={onClearAll} className="min-h-11 rounded-md px-4 text-[length:var(--fs-sm)]" style={{ border: '0.5px solid rgba(255,255,255,0.3)' }}>
          Clear all filters
        </button>
      </div>
    </div>
  )
}
