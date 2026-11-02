'use client'

import { useRef, useMemo, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  CONDITION_LABELS,
  FINISH_LABELS,
  applyBulk,
  applyCopyOneToAll,
  bulkTypeState,
  resolveRowCopies,
  setCopyField,
  type BulkPatch,
} from '@/lib/import-copies'
import type {
  ImportCondition,
  ImportCopyEdits,
  ImportCopyOwnerEdits,
  ImportCopyType,
  ImportDefaults,
  ImportFinish,
} from '../../../docs/oracle/contracts/import-row-editing.types'
import type { ImportKind, ImportSource, RowFilter, UiPreviewRow } from './types'
import { isGenericRow } from './types'
import { ImportRowEditor, ROW_GRID_INTENT, ROW_GRID_PLANNED, TypeToggle } from './ImportRowEditor'
import { LANGUAGE_LABELS, SELECT_CLASS } from './import-labels'
import { sortImportRows, type ImportSort } from '@/lib/import-sort'
import { SOURCE_COLUMN, SOURCE_LABELS, STATUS_COLUMN, TYPE_COLUMN } from './import-copy'
import { filterChipCounts } from './filter-counts'

const FILTER_OPTIONS: { value: RowFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'proxy', label: 'Proxies' },
  { value: 'unsleeved', label: 'Unsleeved' },
]

export interface ImportCardListProps {
  rows: UiPreviewRow[]
  kind: ImportKind
  source: ImportSource
  defaults: ImportDefaults
  copyEdits: ImportCopyEdits
  genericArt?: Record<string, { scryfallId: string }>
  onGenericArtChange?: (rowKey: string, art: { scryfallId: string } | null) => void
  onCopyEditsChange: (edits: ImportCopyEdits) => void
  openRowKeys: Set<string>
  onOpenRowKeysChange: (keys: Set<string>) => void
  filter: RowFilter
  onFilterChange: (filter: RowFilter) => void
  query: string
  onQueryChange: (query: string) => void
  selectedIds: Set<string>
  onSelectedIdsChange: (ids: Set<string>) => void
  /** Deck imports with an intent: ownership tags by row key (display only). */
  /** Deck imports with an intent: per-card Card origin and Type. `onChange` returns a note to announce. */
  intent?: {
    viewsByRow: Record<string, import('@/lib/import-intent').IntentCopyView[]>
    busy: boolean
    onChange: (row: UiPreviewRow, index: number, change: import('@/lib/import-intent').IntentChange) => string | undefined
    /** Every copy of each given row at once (collapsed row and bulk bar). */
    onChangeRows: (rows: UiPreviewRow[], change: import('@/lib/import-intent').IntentChange) => void
    /** Planned decks: no ownership or sleeve tags until the owner changes something. */
    quiet?: boolean
  }
}

export function ImportCardList({
  rows,
  kind,
  defaults,
  copyEdits,
  genericArt,
  onGenericArtChange,
  onCopyEditsChange,
  openRowKeys,
  onOpenRowKeysChange,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  selectedIds,
  onSelectedIdsChange,
  intent,
}: ImportCardListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [announcement, setAnnouncement] = useState('')

  // A generic basic (a basic whose line named no printing) takes no collection copy, so it is
  // always Original-like; a basic naming a printing is an ordinary editable row. This does not
  // depend on the "Generic basics" display toggle.
  const isGeneric = (row: UiPreviewRow) => isGenericRow(row, kind)
  const isBasic = isGeneric

  const resolvedByKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveRowCopies>>()
    for (const row of rows) {
      const resolved = resolveRowCopies(row, defaults, copyEdits, row.rowKey)
      // With an intent, the type shown is what saving would do (e.g. Unsleeved for a card not owned).
      const views = intent?.viewsByRow[row.rowKey]
      const typed = views
        ? resolved.map((c) => ({ ...c, type: views.find((v) => v.index === c.index)?.type ?? c.type }))
        : resolved
      map.set(
        row.rowKey,
        isGenericRow(row, kind) && !views ? typed.map((c) => ({ ...c, type: 'original' as const })) : typed
      )
    }
    return map
  }, [rows, defaults, copyEdits, kind, intent?.viewsByRow])

  // Import order is the default; the choice lasts only while this list is on screen.
  const [sort, setSort] = useState<ImportSort>('file')
  const sortedRows = useMemo(() => sortImportRows(rows, sort), [rows, sort])

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const ordered =
      kind === 'deck' && filter === 'all'
        ? [...sortedRows.filter((r) => r.board !== 'maybeboard'), ...sortedRows.filter((r) => r.board === 'maybeboard')]
        : sortedRows
    return ordered.filter((row) => {
      const resolved = resolvedByKey.get(row.rowKey) ?? []
      const isMaybe = row.board === 'maybeboard'
      if (filter === 'maybeboard') return isMaybe && (!q || row.cardName.toLowerCase().includes(q))
      // Only All and Maybeboard show maybeboard cards; Deck and the other chips are main-deck cards.
      if (isMaybe && kind === 'deck' && filter !== 'all') return false
      const matchesFilter =
        filter === 'all' ||
        filter === 'deck' ||
        (filter === 'proxy' && resolved.some((c) => c.type === 'proxy')) ||
        (filter === 'unsleeved' && resolved.some((c) => c.type === 'unsleeved')) ||
        (filter === 'basic' && isBasic(row))
      return matchesFilter && (!q || row.cardName.toLowerCase().includes(q))
    })
  }, [sortedRows, kind, filter, query, resolvedByKey])

  const hasBasics = rows.some(isBasic)

  const pendingScrollKey = useRef<string | null>(null)
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 10,
  })

  const selectable = visibleRows
  const allSelected = selectable.length > 0 && selectable.every((r) => selectedIds.has(r.rowKey))

  const handleSelectAll = () => {
    const next = new Set(selectedIds)
    for (const r of selectable) {
      if (allSelected) next.delete(r.rowKey)
      else next.add(r.rowKey)
    }
    onSelectedIdsChange(next)
  }

  const handleRowSelect = (key: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(key)
    else next.delete(key)
    onSelectedIdsChange(next)
  }

  const toggleOpen = (key: string) => {
    const next = new Set(openRowKeys)
    if (next.has(key)) next.delete(key)
    else {
      next.add(key)
      pendingScrollKey.current = key
    }
    onOpenRowKeysChange(next)
  }

  // After a row opens, scroll it fully into view once its copies have been measured.
  useEffect(() => {
    const key = pendingScrollKey.current
    if (!key) return
    pendingScrollKey.current = null
    const scrollRow = () => {
      const el = Array.from(parentRef.current?.querySelectorAll('[data-row-key]') ?? []).find(
        (node) => node.getAttribute('data-row-key') === key
      )
      el?.scrollIntoView?.({ block: 'nearest' })
    }
    requestAnimationFrame(() => {
      scrollRow()
      setTimeout(scrollRow, 60)
    })
  }, [openRowKeys])

  const changeCopy = (row: UiPreviewRow, index: number, patch: ImportCopyOwnerEdits) => {
    changeCopies(row, [index], patch)
  }

  const changeCopies = (row: UiPreviewRow, indexes: number[], patch: ImportCopyOwnerEdits) => {
    let next = copyEdits
    // Each field is its own owner edit. An edit never splits or moves the row.
    for (const index of indexes) {
      for (const field of Object.keys(patch) as Array<keyof ImportCopyOwnerEdits>) {
        const value = patch[field]
        if (value !== undefined) next = setCopyField(next, row.rowKey, index, field, value as never)
      }
    }
    onCopyEditsChange(next)
  }

  const applyAll = (row: UiPreviewRow) => {
    onCopyEditsChange(applyCopyOneToAll(copyEdits, row, defaults))
    setAnnouncement('All copies now match copy 1.')
  }

  const selectedRows = rows.filter((r) => selectedIds.has(r.rowKey))
  const showBulk = selectedRows.length > 0
  const selectedResolved = selectedRows.flatMap((r) => resolvedByKey.get(r.rowKey) ?? [])

  const options: ImportCopyType[] = kind === 'deck' ? ['original', 'proxy', 'unsleeved'] : ['original', 'proxy']

  const emptyMessage = query
    ? `No match for "${query}"`
    : filter === 'proxy'
      ? 'No proxies'
      : filter === 'unsleeved'
        ? 'No unsleeved cards'
        : filter === 'basic'
          ? 'No basics'
          : filter === 'deck'
            ? 'No deck cards'
          : filter === 'maybeboard'
            ? 'No maybeboard cards'
          : 'No cards'

  const mainRows = rows.filter((r) => r.board !== 'maybeboard')
  const maybeboardCount = rows.reduce((sum, r) => sum + (r.board === 'maybeboard' ? r.qty : 0), 0)
  const chipCounts = filterChipCounts(mainRows, resolvedByKey, isBasic)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <FilterChip
          label="All"
          count={chipCounts.all + maybeboardCount}
          selected={filter === 'all'}
          onClick={() => onFilterChange('all')}
        />
        {maybeboardCount > 0 && (
          <>
            <FilterChip
              label="Deck"
              count={chipCounts.all}
              selected={filter === 'deck'}
              onClick={() => onFilterChange('deck')}
            />
            <FilterChip
              label="Maybeboard"
              count={maybeboardCount}
              selected={filter === 'maybeboard'}
              onClick={() => onFilterChange('maybeboard')}
            />
          </>
        )}
        {kind === 'collection' && FILTER_OPTIONS.filter((f) => f.value !== 'all').map((f) => (
          <FilterChip
            key={f.value}
            label={f.label}
            count={f.value === 'proxy' ? chipCounts.proxy : chipCounts.unsleeved}
            selected={filter === f.value}
            onClick={() => onFilterChange(f.value)}
          />
        ))}
        {kind === 'collection' && hasBasics && (
          <FilterChip
            label="Basics (generic)"
            count={chipCounts.basic}
            selected={filter === 'basic'}
            onClick={() => onFilterChange('basic')}
          />
        )}
        <label className="ml-auto flex items-center gap-1.5 text-[length:var(--fs-xs)] text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => {
              const next = e.target.value as ImportSort
              setSort(next)
              setAnnouncement(next === 'name' ? 'Sorted by name A to Z.' : 'Sorted by import order.')
            }}
            className={SELECT_CLASS}
          >
            <option value="file">Import order</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find card"
          className="h-6 w-44 rounded-md px-2 text-[length:var(--fs-xs)]"
          aria-label="Find a card in this file"
        />
      </div>

      <div
        className="flex min-h-[140px] flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]"
        role="group"
        aria-label="Cards"
      >
        {showBulk ? (
          <BulkBar
            options={options}
            onIntentChange={
              intent && !intent.quiet
                ? (change) =>
                    intent.onChangeRows(
                      selectedRows.filter((r) => intent.viewsByRow[r.rowKey]),
                      change
                    )
                : undefined
            }
            planned={!!intent?.quiet}
            intentViews={intent && !intent.quiet ? selectedRows.flatMap((r) => intent.viewsByRow[r.rowKey] ?? []) : undefined}
            rows={rows}
            selectedRows={selectedRows}
            selectedResolved={selectedResolved}
            defaults={defaults}
            copyEdits={copyEdits}
            onCopyEditsChange={onCopyEditsChange}
            onClear={() => onSelectedIdsChange(new Set())}
            onAnnounce={setAnnouncement}
          />
        ) : (
          <div
            className={cn(
              'grid min-h-[30px] items-center gap-2 rounded-t-lg px-2.5 text-[length:var(--fs-xs)] text-muted-foreground',
              intent ? (intent.quiet ? ROW_GRID_PLANNED : ROW_GRID_INTENT) : 'grid-cols-[24px_28px_1fr]'
            )}
            style={{ background: 'var(--bg-canvas)' }}
          >
            <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} aria-label="Select all shown" />
            <span>Qty</span>
            <span>Card</span>
            {intent && <span>{intent.quiet ? STATUS_COLUMN : SOURCE_COLUMN}</span>}
            {intent && !intent.quiet && <span>{TYPE_COLUMN}</span>}
            {intent && <span />}
          </div>
        )}

        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          {visibleRows.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-[length:var(--fs-sm)] text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const row = visibleRows[virtualItem.index]
                const startsMaybeboard =
                  kind === 'deck' &&
                  filter === 'all' &&
                  row.board === 'maybeboard' &&
                  (virtualItem.index === 0 || visibleRows[virtualItem.index - 1].board !== 'maybeboard')
                return (
                  <div
                    key={row.rowKey}
                    data-index={virtualItem.index}
                    ref={(el) => {
                      if (el) virtualizer.measureElement?.(el)
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {startsMaybeboard && (
                      <div
                        data-testid="maybeboard-separator"
                        className="px-2.5 py-1.5 text-[length:var(--fs-xs)] font-medium text-muted-foreground"
                        style={{ background: 'var(--bg-canvas)' }}
                      >
                        Maybeboard
                      </div>
                    )}
                    <ImportRowEditor
                      row={row}
                      resolved={resolvedByKey.get(row.rowKey) ?? []}
                      kind={kind}
                      defaults={defaults}
                      open={openRowKeys.has(row.rowKey)}
                      selected={selectedIds.has(row.rowKey)}
                      generic={isGeneric(row)}
                      art={genericArt?.[row.rowKey] ?? null}
                      onChangeArt={(art) => onGenericArtChange?.(row.rowKey, art)}
                      onToggleOpen={() => toggleOpen(row.rowKey)}
                      onToggleSelect={(checked) => handleRowSelect(row.rowKey, checked)}
                      onChangeCopy={(index, patch) => changeCopy(row, index, patch)}
                      onChangeAllCopies={(indexes, patch) => changeCopies(row, indexes, patch)}
                      onApplyAll={() => applyAll(row)}
                      intent={
                        intent && (intent.viewsByRow[row.rowKey] || row.board === 'maybeboard')
                          ? {
                              views: intent.viewsByRow[row.rowKey] ?? [],
                              busy: intent.busy,
                              onChange: (index, change) => {
                                const note = intent.onChange(row, index, change)
                                if (note) setAnnouncement(note)
                              },
                              onChangeRow: (change) => intent.onChangeRows([row], change),
                              quiet: intent.quiet,
                            }
                          : undefined
                      }
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  )
}

function bulkSource(views: import('@/lib/import-intent').IntentCopyView[]) {
  const set = new Set(views.filter((v) => !v.generic && v.source).map((v) => v.source))
  return set.size === 1 ? ([...set][0] as 'none' | 'collection' | 'new') : 'mixed'
}

function bulkIntentType(views: import('@/lib/import-intent').IntentCopyView[]): ImportCopyType | 'mixed' {
  const set = new Set(
    views.filter((v) => !v.generic && (v.source === 'collection' || v.source === 'new')).map((v) => v.type)
  )
  return set.size === 1 ? [...set][0] : 'mixed'
}

function BulkBar({
  options,
  rows,
  selectedRows,
  selectedResolved,
  defaults,
  copyEdits,
  onCopyEditsChange,
  onClear,
  onAnnounce,
  onIntentChange,
  intentViews,
  planned,
}: {
  /** Planned decks have no Card origin or Type to set. */
  planned?: boolean;
  /** Deck imports with an intent: Card origin and Type go through the intent rules. */
  onIntentChange?: (change: import('@/lib/import-intent').IntentChange) => void
  intentViews?: import('@/lib/import-intent').IntentCopyView[]
  options: ImportCopyType[]
  rows: UiPreviewRow[]
  selectedRows: UiPreviewRow[]
  selectedResolved: ReturnType<typeof resolveRowCopies>
  defaults: ImportDefaults
  copyEdits: ImportCopyEdits
  onCopyEditsChange: (edits: ImportCopyEdits) => void
  onClear: () => void
  onAnnounce: (text: string) => void
}) {
  const [popOpen, setPopOpen] = useState(false)
  const [patch, setPatch] = useState({ finish: '', condition: '', language: '' })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const keys = useMemo(() => new Set(selectedRows.map((r) => r.rowKey)), [selectedRows])

  const typeState = bulkTypeState(selectedResolved)
  const totalCopies = selectedResolved.length

  const toPatch = (): BulkPatch => {
    const p: BulkPatch = {}
    if (patch.finish) p.finish = patch.finish as ImportFinish
    if (patch.condition) p.condition = patch.condition as ImportCondition
    if (patch.language) p.language = patch.language
    return p
  }
  const hasPatch = Object.keys(toPatch()).length > 0
  const preview = hasPatch ? applyBulk(copyEdits, rows, keys, toPatch(), defaults) : null

  const closePop = () => {
    setPopOpen(false)
    triggerRef.current?.focus()
  }

  const setType = (type: ImportCopyType) => {
    onCopyEditsChange(applyBulk(copyEdits, rows, keys, { type }, defaults).edits)
    onAnnounce('Type set for selected rows.')
  }

  const apply = () => {
    const result = applyBulk(copyEdits, rows, keys, toPatch(), defaults)
    onCopyEditsChange(result.edits)
    onAnnounce(`Applied to selected rows. ${result.applied} changed, ${result.skipped} left as they were.`)
    setPatch({ finish: '', condition: '', language: '' })
    closePop()
  }

  const rowsWord = selectedRows.length === 1 ? 'row' : 'rows'

  return (
    <div
      className="relative flex min-h-[30px] items-center gap-2 rounded-t-lg bg-[var(--bg-surface-hover)] px-2.5 py-1 text-[length:var(--fs-xs)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && popOpen) {
          e.stopPropagation()
          closePop()
        }
      }}
    >
      <span className="text-foreground">{selectedRows.length} selected</span>
      <span className="ml-auto flex items-center gap-2">
        {onIntentChange && intentViews ? (
          <>
            <TypeToggle<'none' | 'collection' | 'new'>
              value={bulkSource(intentViews)}
              options={['none', 'collection', 'new']}
              labels={SOURCE_LABELS}
              label="Set card origin for selected"
              onChange={(source) => {
                onIntentChange({ source })
                onAnnounce('Card origin set for selected rows.')
              }}
            />
            <TypeToggle
              value={bulkIntentType(intentViews)}
              options={['original', 'proxy']}
              label="Set type for selected"
              onChange={(type) => {
                onIntentChange({ type })
                onAnnounce('Type set for selected rows.')
              }}
            />
          </>
        ) : planned ? null : (
          <>
            <TypeToggle value={typeState} options={options} label="Set type for selected" onChange={setType} />
            {typeState === 'mixed' && <span className="text-muted-foreground">Mixed</span>}
          </>
        )}
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={popOpen}
          aria-haspopup="dialog"
          onClick={() => setPopOpen((v) => !v)}
          className="h-6 rounded-md border border-[var(--border-default)] px-2 hover:bg-[var(--bg-surface-hover)]"
        >
          Set finish / condition / language ▾
        </button>
        <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground">
          Clear
        </button>
      </span>
      {popOpen && (
        <div
          role="dialog"
          aria-label="Set finish, condition, language"
          className="absolute right-2 top-9 z-10 flex w-[300px] flex-col gap-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-foreground shadow-lg"
        >
          <BulkSelect
            label="Finish"
            value={patch.finish}
            onChange={(finish) => setPatch({ ...patch, finish })}
            options={Object.entries(FINISH_LABELS)}
          />
          <BulkSelect
            label="Condition"
            value={patch.condition}
            onChange={(condition) => setPatch({ ...patch, condition })}
            options={Object.entries(CONDITION_LABELS)}
          />
          <BulkSelect
            label="Language"
            value={patch.language}
            onChange={(language) => setPatch({ ...patch, language })}
            options={Object.entries(LANGUAGE_LABELS)}
          />
          <p className="text-muted-foreground" aria-live="polite">
            {preview
              ? `Applies to ${preview.applied} of ${totalCopies} copies in ${selectedRows.length} ${rowsWord}.`
              : `Applies to ${totalCopies} ${totalCopies === 1 ? 'copy' : 'copies'} in ${selectedRows.length} ${rowsWord}.`}{' '}
            Proxies keep only language.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closePop}
              className="h-6 rounded-md px-2 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!hasPatch}
              className="h-6 rounded-md border border-[var(--border-default)] px-2.5 hover:bg-[var(--bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BulkSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[length:var(--fs-xs)] text-muted-foreground">
      {label}
      <select className={cn(SELECT_CLASS, 'w-full')} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Leave as is</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

function FilterChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string
  count: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-6 rounded-full border px-2.5 text-[length:var(--fs-xs)] transition-colors',
        selected
          ? 'border-[var(--text-secondary)] bg-[var(--bg-surface-hover)] text-foreground'
          : 'border-[var(--border-default)] text-muted-foreground hover:bg-[var(--bg-surface-hover)]'
      )}
    >
      {label} {count}
    </button>
  )
}
