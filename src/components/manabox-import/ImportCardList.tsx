'use client'

import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ManaBoxPreviewRow } from '../../../docs/oracle/contracts/manabox-import.types'
import type { ImportKind, ImportSource, RowFilter, UiPreviewRow, CopyType } from './types'
import { CopyTypeControl, CopyCountPicker } from './CopyTypeControl'
import { FoilCheckbox } from './FoilCheckbox'
import { Check, VenetianMask } from 'lucide-react'

const FILTER_OPTIONS: { value: RowFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'proxy', label: 'Proxies' },
  { value: 'unsleeved', label: 'Unsleeved' },
]

function FinishTag({ finish }: { finish: ManaBoxPreviewRow['finish'] }) {
  if (finish === 'nonfoil') return null
  return (
    <span className="inline-flex items-center gap-1 text-[length:var(--fs-xs)] text-muted-foreground">
      {finish === 'foil' ? 'Foil' : 'Etched'}
    </span>
  )
}

function LanguageTag({ language }: { language?: string }) {
  if (!language || language === 'en') return null
  return (
    <span className="text-[length:var(--fs-xs)] uppercase text-muted-foreground">{language}</span>
  )
}

export interface ImportCardListProps {
  rows: UiPreviewRow[]
  kind: ImportKind
  source: ImportSource
  filter: RowFilter
  onFilterChange: (filter: RowFilter) => void
  query: string
  onQueryChange: (query: string) => void
  selectedIds: Set<string>
  onSelectedIdsChange: (ids: Set<string>) => void
  onRowChange: (id: string, patch: Partial<UiPreviewRow['choices']>) => void
  openPickerId: string | null
  onOpenPicker: (id: string | null) => void
}

export function ImportCardList({
  rows,
  kind,
  source,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  selectedIds,
  onSelectedIdsChange,
  onRowChange,
  openPickerId,
  onOpenPicker,
}: ImportCardListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [openType, setOpenType] = useState<CopyType | null>(null)

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      const isGeneric = row.isBasicLand && kind === 'deck'
      const matchesFilter =
        filter === 'all' ||
        (filter === 'proxy' && row.choices.split.proxyCount > 0) ||
        (filter === 'unsleeved' && row.choices.split.unsleevedCount > 0) ||
        (filter === 'basic' && isGeneric)
      const matchesQuery = !q || row.cardName.toLowerCase().includes(q)
      return matchesFilter && matchesQuery
    })
  }, [rows, kind, filter, query])

  const hasBasics = useMemo(() => rows.some((r) => r.isBasicLand && kind === 'deck'), [rows, kind])

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 10,
  })

  const allSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.id) || (r.isBasicLand && kind === 'deck'))

  const handleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds)
      visibleRows.forEach((r) => {
        if (!(r.isBasicLand && kind === 'deck')) next.delete(r.id)
      })
      onSelectedIdsChange(next)
    } else {
      const next = new Set(selectedIds)
      visibleRows.forEach((r) => {
        if (!(r.isBasicLand && kind === 'deck')) next.add(r.id)
      })
      onSelectedIdsChange(next)
    }
  }

  const handleRowSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    onSelectedIdsChange(next)
  }

  const handleBulk = (type: CopyType) => {
    for (const id of selectedIds) {
      const row = rows.find((r) => r.id === id)
      if (!row) continue
      onRowChange(id, { split: { originalCount: type === 'original' ? row.qty : 0, proxyCount: type === 'proxy' ? row.qty : 0, unsleevedCount: type === 'unsleeved' ? row.qty : 0 } })
    }
    onSelectedIdsChange(new Set())
  }

  const openPicker = (id: string, type: CopyType) => {
    setOpenType(type)
    onOpenPicker(id)
  }

  const handlePick = (id: string, type: CopyType, value: number) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const next = { ...row.choices.split }
    const remaining = row.qty - value
    if (type === 'proxy') {
      next.proxyCount = value
      next.originalCount = Math.min(row.qty - next.proxyCount, row.qty)
      next.unsleevedCount = row.qty - next.proxyCount - next.originalCount
    } else {
      next.unsleevedCount = value
      next.originalCount = Math.min(row.qty - next.unsleevedCount, row.qty)
      next.proxyCount = row.qty - next.unsleevedCount - next.originalCount
    }
    onRowChange(id, { split: next })
    onOpenPicker(null)
    setOpenType(null)
  }

  const options: CopyType[] = kind === 'deck' ? ['original', 'proxy', 'unsleeved'] : ['original', 'proxy']

  const emptyMessage = query
    ? `No match for "${query}"`
    : filter === 'proxy'
      ? 'No proxies'
      : filter === 'unsleeved'
        ? 'No unsleeved cards'
        : filter === 'basic'
          ? 'No basics'
          : 'No cards'

  const nProxyRows = rows.filter((r) => r.choices.split.proxyCount > 0 && !(r.isBasicLand && kind === 'deck')).length
  const nUnsleevedRows = rows.filter((r) => r.choices.split.unsleevedCount > 0 && !(r.isBasicLand && kind === 'deck')).length
  const nBasicRows = rows.filter((r) => r.isBasicLand && kind === 'deck').length

  const isTextFile = source === 'text'
  const selectedCount = Array.from(selectedIds).filter((id) => rows.some((r) => r.id === id)).length
  const showBulk = selectedCount > 0

  return (
    <div className="flex flex-col gap-1.5">
      {/* Filters + search */}
      <div className="flex items-center gap-1.5">
        {FILTER_OPTIONS.map((f) => (
          <FilterChip
            key={f.value}
            label={f.label}
            count={
              f.value === 'all'
                ? rows.length
                : f.value === 'proxy'
                  ? nProxyRows
                  : nUnsleevedRows
            }
            selected={filter === f.value}
            onClick={() => onFilterChange(f.value)}
          />
        ))}
        {hasBasics && (
          <FilterChip
            label="Basics"
            count={nBasicRows}
            selected={filter === 'basic'}
            onClick={() => onFilterChange('basic')}
          />
        )}
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find card"
          className="ml-auto h-6 w-44 rounded-md px-2 text-[length:var(--fs-xs)]"
          aria-label="Find a card in this file"
        />
      </div>

      {/* List */}
      <div
        className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]"
        role="group"
        aria-label="Cards"
      >
        <div
          className={cn(
            'grid items-center gap-2 px-2.5 text-[length:var(--fs-xs)] text-muted-foreground',
            isTextFile ? 'grid-cols-[24px_28px_1fr_30px_240px]' : 'grid-cols-[24px_28px_1fr_240px]'
          )}
          style={{ minHeight: 30, background: 'var(--bg-canvas)' }}
        >
          <Checkbox
            checked={allSelected}
            onCheckedChange={handleSelectAll}
            aria-label="Select all shown"
          />
          <span>Qty</span>
          <span>{showBulk ? `${selectedCount} selected` : 'Card'}</span>
          {isTextFile && !showBulk && <span className="justify-self-end">Foil</span>}
          <span className={cn('justify-self-end', showBulk && isTextFile && 'col-span-2')}>
            {showBulk ? (
              <span className="flex items-center gap-1">
                <BulkButton type="original" onClick={() => handleBulk('original')} />
                {options.includes('proxy') && <BulkButton type="proxy" onClick={() => handleBulk('proxy')} />}
                {options.includes('unsleeved') && <BulkButton type="unsleeved" onClick={() => handleBulk('unsleeved')} />}
                <button
                  type="button"
                  onClick={() => onSelectedIdsChange(new Set())}
                  className="ml-1 text-[length:var(--fs-xs)] hover:text-foreground"
                >
                  Clear
                </button>
              </span>
            ) : null}
          </span>
        </div>

        <div ref={parentRef} className="max-h-[calc(100vh-380px)] min-h-[180px] overflow-auto">
          {visibleRows.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-[length:var(--fs-sm)] text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const row = visibleRows[virtualItem.index]
                const isGeneric = row.isBasicLand && kind === 'deck'
                const pickerOpen = openPickerId === row.id
                return (
                  <div
                    key={row.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className={cn(
                      'grid min-h-[30px] items-center gap-2 border-b border-[var(--border-subtle)] px-2.5 hover:bg-[var(--bg-hover)]',
                      isTextFile ? 'grid-cols-[24px_28px_1fr_30px_240px]' : 'grid-cols-[24px_28px_1fr_240px]'
                    )}
                  >
                    {isGeneric ? (
                      <span />
                    ) : (
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={(v) => handleRowSelect(row.id, v === true)}
                        aria-label={`Select ${row.cardName}`}
                      />
                    )}
                    <span className="text-[length:var(--fs-xs)] tabular-nums text-muted-foreground">
                      {row.qty}
                    </span>
                    <span className="min-w-0 truncate text-[length:var(--fs-xs)]">
                      <span className="text-foreground">{row.cardName}</span>
                      <span className="ml-1.5 text-[length:var(--fs-xs)] text-muted-foreground">
                        {row.setCode} {row.collectorNumber}
                      </span>
                      <LanguageTag language={row.language} />
                      {!isTextFile && <FinishTag finish={row.finish} />}
                    </span>
                    {isTextFile && !isGeneric && (
                      <span className="justify-self-end">
                        <FoilCheckbox
                          checked={row.choices.foil}
                          onChange={(checked) => onRowChange(row.id, { foil: checked })}
                          cardName={row.cardName}
                        />
                      </span>
                    )}
                    {isTextFile && isGeneric && <span />}
                    <span className="relative justify-self-end py-0.5">
                      {isGeneric ? (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-hover)] px-2 text-[length:var(--fs-xs)] text-muted-foreground">
                          Basic
                        </span>
                      ) : (
                        <CopyTypeControl
                          qty={row.qty}
                          split={row.choices.split}
                          onChange={(split) => onRowChange(row.id, { split })}
                          onOpenPicker={(type) => openPicker(row.id, type)}
                          options={options}
                          cardName={row.cardName}
                        />
                      )}
                      {pickerOpen && openType && (
                        <div className="absolute right-0 top-full z-20 mt-0.5">
                          <CopyCountPicker
                            qty={row.qty}
                            type={openType}
                            value={row.choices.split[openType === 'proxy' ? 'proxyCount' : 'unsleevedCount']}
                            onPick={(value) => handlePick(row.id, openType, value)}
                            onClose={() => {
                              onOpenPicker(null)
                              setOpenType(null)
                            }}
                            cardName={row.cardName}
                          />
                        </div>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
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
          ? 'border-[var(--text-secondary)] bg-[var(--bg-hover)] text-foreground'
          : 'border-[var(--border-default)] text-muted-foreground hover:bg-[var(--bg-hover)]'
      )}
    >
      {label} {count}
    </button>
  )
}

function BulkButton({ type, onClick }: { type: CopyType; onClick: () => void }) {
  const meta =
    type === 'original'
      ? { label: 'Original', icon: <Check className="size-3 text-[var(--accent-primary)]" /> }
      : type === 'proxy'
        ? { label: 'Proxy', icon: <VenetianMask className="size-3 text-[var(--status-proxy)]" /> }
        : { label: 'Unsleeved', icon: null }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--border-default)] px-2 text-[length:var(--fs-xs)] hover:bg-[var(--bg-hover)]"
    >
      {meta.icon}
      {meta.label}
    </button>
  )
}
