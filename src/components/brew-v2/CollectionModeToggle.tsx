'use client'

import type { CollectionMode } from '@/lib/brew-v2-types'
import { MaterialIcon } from '@/components/ui/material-icon'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CollectionModeToggleProps {
  value: CollectionMode
  onChange: (mode: CollectionMode) => void
}

// ---------------------------------------------------------------------------
// Mode Configuration
// ---------------------------------------------------------------------------

interface ModeConfig {
  label: string
  shortLabel: string
  icon: string
  description: string
}

const MODES: Record<CollectionMode, ModeConfig> = {
  any: {
    label: 'Any Card',
    shortLabel: 'Any',
    icon: 'public',
    description: 'Suggest any card regardless of ownership',
  },
  prioritise_owned: {
    label: 'Prioritise Owned',
    shortLabel: 'Owned First',
    icon: 'inventory_2',
    description: 'Prefer owned cards, suggest unowned for key pieces',
  },
  owned_only: {
    label: 'Owned Only',
    shortLabel: 'Owned',
    icon: 'lock',
    description: 'Only suggest cards you own',
  },
}

const MODE_ORDER: CollectionMode[] = ['any', 'prioritise_owned', 'owned_only']

// ---------------------------------------------------------------------------
// CollectionModeToggle — segmented control for collection filtering
// ---------------------------------------------------------------------------

/**
 * A compact segmented control for selecting collection mode during brewing.
 * Shows in the canvas toolbar or topbar when in building phase.
 * 
 * Modes:
 * - Any Card: Full card pool, ownership not considered
 * - Prioritise Owned: Prefer owned cards when quality is comparable
 * - Owned Only: Hard filter to only owned cards
 */
export function CollectionModeToggle({ value, onChange }: CollectionModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-[rgba(255,255,255,0.04)] p-0.5">
      {MODE_ORDER.map((mode) => {
        const config = MODES[mode]
        const isActive = value === mode

        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`
              flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors
              ${isActive 
                ? 'bg-[rgba(55,138,221,0.2)] text-[#378ADD]' 
                : 'text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)] hover:bg-[rgba(255,255,255,0.04)]'
              }
            `}
            title={config.description}
          >
            <MaterialIcon 
              name={config.icon} 
              className="text-[14px]" 
              filled={isActive}
            />
            <span className="hidden sm:inline">{config.shortLabel}</span>
          </button>
        )
      })}
    </div>
  )
}
