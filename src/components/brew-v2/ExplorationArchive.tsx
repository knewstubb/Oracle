'use client'

import type { ArchivedItem, CommanderOption, DecisionEntry } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExplorationArchiveProps {
  items: ArchivedItem[]
  expanded: boolean
  onToggle: () => void
}

// ---------------------------------------------------------------------------
// ExplorationArchive — Collapsed tray for Phase 1 history (bottom-right)
// ---------------------------------------------------------------------------

/**
 * A collapsed tray positioned absolute bottom-right of the canvas viewport.
 * Shows an archive button with a count badge. When expanded, reveals a
 * scrollable panel listing all Phase 1 candidate and decision cards in
 * read-only (non-draggable) state.
 *
 * Only renders when items.length > 0 (i.e. after first commander commit).
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
export function ExplorationArchive({
  items,
  expanded,
  onToggle,
}: ExplorationArchiveProps) {
  // Requirement 6.4: Only visible after first commit (items.length > 0)
  if (items.length === 0) return null

  return (
    <div
      className="absolute bottom-4 right-4 z-30"
      data-testid="exploration-archive"
    >
      {/* Expanded panel — scrollable list of archived items */}
      {expanded && (
        <div
          className="mb-2 w-64 max-h-72 overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(20,20,30,0.95)] shadow-lg"
          data-testid="exploration-archive-panel"
        >
          <div className="p-2 space-y-1.5">
            {items.map((item, idx) => (
              <ArchivedItemRow key={idx} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Collapsed button with count badge */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[rgba(255,255,255,0.8)] transition-colors hover:text-white"
        style={{
          background: 'rgba(30, 30, 40, 0.9)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} exploration archive, ${items.length} items`}
        aria-expanded={expanded}
        data-testid="exploration-archive-toggle"
      >
        {/* Archive icon */}
        <ArchiveIcon />

        <span>Archive</span>

        {/* Count badge — Requirement 6.2 */}
        <span
          className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{
            background: 'rgba(55, 138, 221, 0.2)',
            color: '#378ADD',
          }}
          data-testid="exploration-archive-count"
        >
          {items.length}
        </span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single archived item row (read-only, non-draggable) */
function ArchivedItemRow({ item }: { item: ArchivedItem }) {
  if (item.type === 'candidate') {
    const commander = item.data as CommanderOption
    return (
      <div
        className="flex items-center gap-2 rounded px-2 py-1.5 bg-[rgba(255,255,255,0.03)]"
        data-testid="archived-candidate"
      >
        {/* Colour identity dot */}
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: '#2dd4bf' }}
          aria-hidden="true"
        />
        <span className="text-[10px] text-[rgba(255,255,255,0.7)] truncate">
          {commander.name}
        </span>
      </div>
    )
  }

  // Decision item
  const decision = item.data as DecisionEntry
  return (
    <div
      className="flex items-center gap-2 rounded border border-dashed border-[rgba(255,255,255,0.15)] px-2 py-1.5"
      data-testid="archived-decision"
    >
      <span className="text-[8px] font-medium uppercase tracking-wide text-[rgba(255,255,255,0.4)] flex-shrink-0">
        {decision.key}:
      </span>
      <span className="text-[10px] text-[rgba(255,255,255,0.65)] truncate">
        {decision.value}
      </span>
    </div>
  )
}

/** Small archive/box icon (16px) */
function ArchiveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  )
}
