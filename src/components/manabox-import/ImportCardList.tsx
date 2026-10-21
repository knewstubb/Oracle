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
import { ImportRowEditor, TypeToggle } from './ImportRowEditor'
import { LANGUAGE_LABELS, SELECT_CLASS } from './import-labels'
import { sortImportRows, type ImportSort } from '@/lib/import-sort'

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
  onCopyEditsChange: (edits: ImportCopyEdits) => void
  /** Deck imports: is "Generic basics" on? */
  genericBasics?: boolean
  openRowKeys: Set<string>
  onOpenRowKeysChange: (keys: Set<string>) => void
  filter: RowFilter
  onFilterChange: (filter: RowFilter) => void
  query: string
  onQueryChange: (query: string) => void
  selectedIds: Set<string>
  onSelectedIdsChange: (ids: Set<string>) => void
}

export function ImportCardList({
  rows,
  kind,
  defaults,
  copyEdits,
  genericBasics = false,
  onCopyEditsChange,
  openRowKeys,
  onOpenRowKeysChange,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  selectedIds,
  onSelectedIdsChange,
}: ImportCardListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [announcement, setAnnouncement] = useState('')

  // Basic lands are ordinary editable rows. `isBasic` only drives the Basics filter and tag;
  // `isGeneric` is a basic while "Generic basics" is on (no collection copy, so always Original-like).
  const isBasic = (row: UiPreviewRow) => row.isBasicLand && kind === 'deck'
  const isGeneric = (row: UiPreviewRow) => isBasic(row) && genericBasics

  const resolvedByKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveRowCopies>>()
    for (const row of rows) {
      const resolved = resolveRowCopies(row, defaults, copyEdits, row.rowKey)
      map.set(
        row.rowKey,
        row.isBasicLand && kind === 'deck' && genericBasics
          ? resolved.map((c) => ({ ...c, type: 'original' as const }))
          : resolved
      )
    }
    return map
  }, [rows, defaults, copyEdits, kind, genericBasics])

  // Import order is the default; the choice lasts only while this list is on screen.
  const [sort, setSort] = useState<ImportSort>('file')
  const sortedRows = useMemo(() => sortImportRows(rows, sort), [rows, sort])

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sortedRows.filter((row) => {
      const resolved = resolvedByKey.get(row.rowKey) ?? []
      const matchesFilter =
        filter === 'all' ||
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
    let next = copyEdits
    // Each field is its own owner edit. An edit never splits or moves the row.
    for (const field of Object.keys(patch) as Array<keyof ImportCopyOwnerEdits>) {
      const value = patch[field]
      if (value !== undefined) next = setCopyField(next, row.rowKey, index, field, value as never)
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
          : 'No cards'

  const countRowsWith = (type: ImportCopyType) =>
    rows.filter((r) => (resolvedByKey.get(r.rowKey) ?? []).some((c) => c.type === type)).length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {FILTER_OPTIONS.map((f) => (
          <FilterChip
            key={f.value}
            label={f.label}
            count={f.value === 'all' ? rows.length : countRowsWith(f.value === 'proxy' ? 'proxy' : 'unsleeved')}
            selected={filter === f.value}
            onClick={() => onFilterChange(f.value)}
          />
        ))}
        {hasBasics && (
          <FilterChip
            label="Basics"
            count={rows.filter(isBasic).length}
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
            className="grid min-h-[30px] grid-cols-[24px_28px_1fr] items-center gap-2 rounded-t-lg px-2.5 text-[length:var(--fs-xs)] text-muted-foreground"
            style={{ background: 'var(--bg-canvas)' }}
          >
            <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} aria-label="Select all shown" />
            <span>Qty</span>
            <span>Card</span>
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
                    <ImportRowEditor
                      row={row}
                      resolved={resolvedByKey.get(row.rowKey) ?? []}
                      kind={kind}
                      defaults={defaults}
                      open={openRowKeys.has(row.rowKey)}
                      selected={selectedIds.has(row.rowKey)}
                      generic={isGeneric(row)}
                      onToggleOpen={() => toggleOpen(row.rowKey)}
                      onToggleSelect={(checked) => handleRowSelect(row.rowKey, checked)}
                      onChangeCopy={(index, patch) => changeCopy(row, index, patch)}
                      onApplyAll={() => applyAll(row)}
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
}: {
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
        <TypeToggle value={typeState} options={options} label="Set type for selected" onChange={setType} />
        {typeState === 'mixed' && <span className="text-muted-foreground">Mixed</span>}
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
