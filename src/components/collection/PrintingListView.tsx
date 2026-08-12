'use client'

import { useCallback, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronUp, ChevronDown, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { truncateName, formatPrice } from '@/lib/collection-printing-utils'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'
import type { PrintingSortField, SortDirection } from '@/lib/collection-filters'

/* ─── High-Performance Hover Preview (Direct DOM, No React State) ───── */

const PREVIEW_WIDTH = 220
const PREVIEW_HEIGHT = 308
const VIEWPORT_PAD = 8

let previewContainer: HTMLDivElement | null = null

function getPreviewContainer(): HTMLDivElement {
  if (typeof document === 'undefined') {
    throw new Error('Cannot create preview container on server')
  }
  
  if (!previewContainer) {
    previewContainer = document.createElement('div')
    previewContainer.id = 'printing-list-hover-preview'
    previewContainer.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: ${PREVIEW_WIDTH}px;
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 50ms ease-out;
      will-change: transform, opacity;
    `
    
    const img = document.createElement('img')
    img.id = 'printing-list-hover-img'
    img.alt = ''
    img.style.cssText = `
      width: 100%;
      aspect-ratio: 5/7;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    `
    img.onerror = () => { img.style.display = 'none' }
    img.onload = () => { img.style.display = 'block' }
    
    previewContainer.appendChild(img)
    document.body.appendChild(previewContainer)
  }
  
  return previewContainer
}

function calcPreviewPos(cursorX: number, cursorY: number, viewW: number, viewH: number) {
  const GAP = 16 // Distance from cursor to card edge
  
  // Determine horizontal position: left or right of cursor based on screen half
  const cursorInLeftHalf = cursorX < viewW / 2
  let left: number
  if (cursorInLeftHalf) {
    // Card to the right of cursor
    left = cursorX + GAP
  } else {
    // Card to the left of cursor
    left = cursorX - PREVIEW_WIDTH - GAP
  }
  
  // Determine vertical position: above or below cursor based on screen half
  const cursorInTopHalf = cursorY < viewH / 2
  let top: number
  if (cursorInTopHalf) {
    // Card below cursor (diagonal down)
    top = cursorY + GAP
  } else {
    // Card above cursor (diagonal up)
    top = cursorY - PREVIEW_HEIGHT - GAP
  }
  
  // Clamp to viewport bounds
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
  if (left + PREVIEW_WIDTH > viewW - VIEWPORT_PAD) left = viewW - PREVIEW_WIDTH - VIEWPORT_PAD
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD
  if (top + PREVIEW_HEIGHT > viewH - VIEWPORT_PAD) top = viewH - PREVIEW_HEIGHT - VIEWPORT_PAD

  return { left, top }
}

function showPreview(scryfallId: string, cursorX: number, cursorY: number) {
  const container = getPreviewContainer()
  const img = document.getElementById('printing-list-hover-img') as HTMLImageElement | null
  if (!img) return

  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  const url = `https://cards.scryfall.io/normal/front/${a}/${b}/${scryfallId}.jpg`
  
  if (img.src !== url) {
    img.src = url
  }
  
  const { left, top } = calcPreviewPos(cursorX, cursorY, window.innerWidth, window.innerHeight)
  container.style.transform = `translate3d(${left}px, ${top}px, 0)`
  container.style.opacity = '1'
}

function updatePreviewPos(cursorX: number, cursorY: number) {
  const container = getPreviewContainer()
  const { left, top } = calcPreviewPos(cursorX, cursorY, window.innerWidth, window.innerHeight)
  container.style.transform = `translate3d(${left}px, ${top}px, 0)`
}

function hidePreview() {
  const container = getPreviewContainer()
  container.style.opacity = '0'
}

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface PrintingListViewProps {
  rows: PrintingRowResponse[]
  sortField: PrintingSortField
  sortDirection: SortDirection
  onSort: (field: PrintingSortField) => void
  /** When true, missing rows are included and rendered with dimmed treatment */
  showMissing?: boolean
}

/* ─── Column Widths ─────────────────────────────────────────────────── */

// Group 1: Checkbox + Qty + Name (FLEX, inner gap-6 = 24px)
// Group 2: Rarity + Set (FLEX, inner gap-6 = 24px)
// Finish: 40px standalone
// Group 3: Cost + Type (288px fixed, inner gap-12 = 48px)
// Group 4: Price + Added (176px fixed, inner gap-12 = 48px)
// Actions: 40px standalone
// Outer gap between groups: gap-10 = 40px

const COL = {
  // Group 1
  checkbox: 'w-6',      // 24px
  qty: 'w-6',           // 24px
  // name is flex-1
  
  // Group 2
  rarity: 'w-10',       // 40px
  // setName is flex-1
  
  // Standalone
  finish: 'w-10',       // 40px
  
  // Group 3 (288px total: 120 + 48gap + 120)
  colors: 'w-[120px]',  // 120px — mana cost
  type: 'w-[120px]',    // 120px
  
  // Group 4 (176px total: 48 + 48gap + 80)
  price: 'w-12',        // 48px
  added: 'w-20',        // 80px
  
  // Standalone
  actions: 'w-10',      // 40px
} as const

/* ─── SortableHeader ────────────────────────────────────────────────── */

function SortableHeader({
  label,
  field,
  align,
  className,
  shrink = true,
  sortField,
  sortDirection,
  onSort,
  suffix,
}: {
  label: string
  field: PrintingSortField | null
  align: 'left' | 'center' | 'right'
  className: string
  shrink?: boolean
  sortField: PrintingSortField
  sortDirection: SortDirection
  onSort: (field: PrintingSortField) => void
  suffix?: React.ReactNode
}) {
  const isSortable = field !== null
  const isActive = isSortable && field === sortField

  const content = (
    <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'justify-end', align === 'center' && 'justify-center')}>
      {label}
      {isActive && (
        sortDirection === 'asc' ? (
          <ChevronUp className="size-3" aria-label="Sorted ascending" />
        ) : (
          <ChevronDown className="size-3" aria-label="Sorted descending" />
        )
      )}
      {suffix}
    </span>
  )

  const baseClasses = cn(
    className,
    shrink && 'shrink-0',
    'text-[length:var(--fs-xs)] font-medium uppercase tracking-wider',
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  )

  if (!isSortable) {
    return (
      <span className={baseClasses} style={{ color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSort(field!)}
      className={cn(baseClasses, 'cursor-pointer transition-colors hover:text-white/50')}
      style={{ color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)' }}
      aria-label={`Sort by ${label}${isActive ? `, currently ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
    >
      {content}
    </button>
  )
}

/**
 * Formats a date as short date with year (e.g. "Jul 15, 2024")
 */
function formatShortDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month} ${day}, ${year}`
}

/**
 * Extracts a short type from a full type line.
 * E.g. "Legendary Creature — Human Wizard" → "Creature"
 *      "Instant" → "Instant"
 *      "Artifact Creature — Golem" → "Artifact"
 */
function shortType(typeLine: string | null): string {
  if (!typeLine) return '—'
  // Remove everything after em-dash (subtypes)
  const mainType = typeLine.split('—')[0].trim()
  // Priority order for display
  const priorities = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Battle']
  for (const p of priorities) {
    if (mainType.includes(p)) return p
  }
  return mainType.split(' ')[0] || '—'
}

/* ─── Mana Cost Pips (using mana-font) ──────────────────────────────── */

/**
 * Parse a mana cost string like "{2}{W}{U}" into individual symbol codes.
 */
function parseManaCost(cost: string): string[] {
  const symbols: string[] = []
  const regex = /\{([^}]+)\}/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(cost)) !== null) {
    symbols.push(match[1])
  }

  return symbols
}

/**
 * Convert a mana symbol code to the mana-font CSS class.
 */
function symbolToClass(symbol: string): string {
  const s = symbol.toLowerCase()

  // Hybrid mana: {W/U} → ms-wu, {2/W} → ms-2w
  if (s.includes('/')) {
    const parts = s.split('/')
    // Phyrexian: {W/P} → ms-wp
    if (parts[1] === 'p') {
      return `ms ms-${parts[0]}p ms-cost`
    }
    return `ms ms-${parts.join('')} ms-cost`
  }

  // Standard symbols
  return `ms ms-${s} ms-cost`
}

function ManaCostPips({ cost }: { cost: string | null }) {
  if (!cost) {
    return <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
  }

  const symbols = parseManaCost(cost)
  if (symbols.length === 0) {
    return <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
  }

  return (
    <span className="inline-flex items-center gap-px">
      {symbols.map((symbol, i) => (
        <i
          key={i}
          className={symbolToClass(symbol)}
          style={{ fontSize: '12px' }}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

/* ─── PrintingListView ──────────────────────────────────────────────── */

export function PrintingListView({
  rows,
  sortField,
  sortDirection,
  onSort,
  showMissing = false,
}: PrintingListViewProps) {
  // Track active hover state via ref (no React state = no rerenders)
  const activeHoverRef = useRef<string | null>(null)

  const handleMouseEnter = useCallback((e: React.MouseEvent, row: PrintingRowResponse) => {
    if (row.scryfallPrintingId) {
      activeHoverRef.current = row.scryfallPrintingId
      showPreview(row.scryfallPrintingId, e.clientX, e.clientY)
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeHoverRef.current) {
      updatePreviewPos(e.clientX, e.clientY)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    activeHoverRef.current = null
    hidePreview()
  }, [])

  // Virtualization
  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 20,
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Table header */}
      <div
        className="flex items-center gap-10 px-4 py-2"
        style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}
      >
        {/* Group 1: Checkbox + Qty + Name (FLEX) */}
        <div className="flex flex-1 items-center gap-6">
          <div className={cn(COL.checkbox, 'shrink-0 flex items-center justify-center')}>
            <input type="checkbox" className="size-3.5 rounded border-[rgba(255,255,255,0.1)] bg-transparent opacity-30 checked:opacity-100 hover:opacity-60 transition-opacity accent-[var(--accent-primary)]" aria-label="Select all" />
          </div>
          <SortableHeader label="Qty" field="quantity" align="center" className={COL.qty} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Name" field="cardName" align="left" className="flex-1 min-w-0" shrink={false} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
        </div>

        {/* Group 2: Rarity + Set (FLEX) */}
        <div className="flex flex-1 items-center gap-6">
          <SortableHeader label="Rarity" field="rarity" align="center" className={COL.rarity} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Set" field="setCode" align="left" className="flex-1 min-w-0" shrink={false} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
        </div>

        {/* Finish (standalone 40px) */}
        <SortableHeader label="Finish" field={null} align="center" className={COL.finish} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />

        {/* Group 3: Cost + Type (288px fixed) */}
        <div className="flex w-[288px] shrink-0 items-center gap-12">
          <SortableHeader label="Cost" field={null} align="right" className={COL.colors} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Type" field={null} align="left" className={COL.type} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
        </div>

        {/* Group 4: Price + Added (176px fixed) */}
        <div className="flex w-[176px] shrink-0 items-center gap-12">
          <SortableHeader label="Price" field="price" align="right" className={COL.price} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Added" field={null} align="left" className={COL.added} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
        </div>

        {/* Actions (standalone 40px) */}
        <div className={cn(COL.actions, 'shrink-0')} aria-hidden="true" />
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[length:var(--fs-sm)]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            No cards match your filters.
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  key={`${row.id}-${row.isFoil}-${row.isProxy}`}
                  className={cn(
                    'group absolute left-0 flex w-full items-center gap-10 px-4 transition-colors hover:bg-[rgba(255,255,255,0.02)]',
                    row.isProxy && 'opacity-60',
                    row.isMissing && 'opacity-40'
                  )}
                  style={{
                    height: `${virtualRow.size}px`,
                    top: `${virtualRow.start}px`,
                    borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                    borderLeft: row.isMissing ? '2px solid rgba(228,75,74,0.4)' : row.isProxy ? '2px dashed rgba(255,255,255,0.15)' : '2px solid transparent',
                  }}
                >
                  {/* Group 1: Checkbox + Qty + Name (FLEX) */}
                  <div className="flex flex-1 items-center gap-6 min-w-0">
                    <span className={cn(COL.checkbox, 'shrink-0 flex items-center justify-center')}>
                      <input type="checkbox" className="size-3.5 rounded border-[rgba(255,255,255,0.1)] bg-transparent opacity-30 checked:opacity-100 hover:opacity-60 transition-opacity accent-[var(--accent-primary)]" aria-label={`Select ${row.cardName}`} />
                    </span>

                    <span className={cn(COL.qty, 'shrink-0 text-center text-[length:var(--fs-base)] tabular-nums')} style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {row.quantity}
                    </span>

                    <span
                      className={cn('flex-1 min-w-0 truncate text-[length:var(--fs-base)] cursor-default', row.isMissing && 'line-through')}
                      title={row.cardName.length > 40 ? row.cardName : undefined}
                      onMouseEnter={(e) => handleMouseEnter(e, row)}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                    >
                      <span style={{ color: row.isMissing ? 'rgba(255,255,255,0.4)' : 'var(--color-primary-text)', fontWeight: 500 }}>
                        {truncateName(row.cardName)}
                      </span>
                      {row.collectorNumber && (
                        <span className="ml-1.5 tabular-nums" style={{ color: 'rgba(255,255,255,0.35)' }}>#{row.collectorNumber}</span>
                      )}
                      {row.isProxy && (
                        <span className="ml-1.5 text-[9px] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>proxy</span>
                      )}
                      {row.isMissing && (
                        <span className="ml-1.5 text-[9px] font-medium uppercase" style={{ color: 'rgba(228,75,74,0.8)' }}>missing</span>
                      )}
                    </span>
                  </div>

                  {/* Group 2: Rarity + Set (FLEX) */}
                  <div className="flex flex-1 items-center gap-6 min-w-0">
                    <span className={cn(COL.rarity, 'shrink-0 flex items-center justify-center')}>
                      {row.setCode && (
                        <i
                          className={`ss ss-${row.setCode.toLowerCase()} ss-fw ss-${row.rarity || 'common'} ss-grad`}
                          style={{ fontSize: '14px' }}
                          aria-label={row.rarity || 'common'}
                        />
                      )}
                    </span>

                    <span className="flex-1 min-w-0 truncate text-[length:var(--fs-base)]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {row.setName}
                    </span>
                  </div>

                  {/* Finish (standalone 40px) */}
                  <span className={cn(COL.finish, 'shrink-0 flex items-center justify-center text-[length:var(--fs-sm)]')} style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {row.isFoil ? 'Foil' : ''}
                  </span>

                  {/* Group 3: Cost + Type (288px fixed) */}
                  <div className="flex w-[288px] shrink-0 items-center gap-12">
                    <span className={cn(COL.colors, 'shrink-0 flex justify-end')}>
                      <ManaCostPips cost={row.manaCost} />
                    </span>

                    <span
                      className={cn(COL.type, 'shrink-0 truncate text-[length:var(--fs-base)]')}
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                      title={row.typeLine || undefined}
                    >
                      {shortType(row.typeLine)}
                    </span>
                  </div>

                  {/* Group 4: Price + Added (176px fixed) */}
                  <div className="flex w-[176px] shrink-0 items-center gap-12">
                    <span
                      className={cn(COL.price, 'shrink-0 text-right text-[length:var(--fs-base)] tabular-nums')}
                      style={{ color: row.price === null ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}
                    >
                      {formatPrice(row.price)}
                    </span>

                    <span
                      className={cn(COL.added, 'shrink-0 text-[length:var(--fs-sm)]')}
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      {formatShortDate(row.addedAt)}
                    </span>
                  </div>

                  {/* Actions (standalone 40px) */}
                  <span className={cn(COL.actions, 'shrink-0 flex items-center justify-end')}>
                    <button
                      type="button"
                      className="rounded p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-[rgba(255,255,255,0.05)]"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                      aria-label="More actions"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
