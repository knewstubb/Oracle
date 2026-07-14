'use client'

import { ArrowLeft } from 'lucide-react'
import type { BrewPhaseV2, CommittedCommander } from '@/lib/brew-v2-types'
import { ColourPips } from '@/components/ColourPips'
import { ModelSelector } from './ModelSelector'

// ---------------------------------------------------------------------------
// SaveIndicator — subtle save status display
// ---------------------------------------------------------------------------

function SaveIndicator({ isSaving, lastSavedAt }: { isSaving?: boolean; lastSavedAt?: number | null }) {
  if (isSaving) {
    return (
      <div className="flex items-center gap-1.5 text-[length:var(--fs-sm)] text-amber-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
        Saving…
      </div>
    )
  }

  if (lastSavedAt) {
    return (
      <div className="flex items-center gap-1.5 text-[length:var(--fs-sm)] text-green-400">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
        </span>
        Saved
      </div>
    )
  }

  // Default: session active but not yet saved
  return (
    <div className="flex items-center gap-1.5 text-[length:var(--fs-sm)] text-green-400">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
      </span>
      Session active
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BrewTopbarProps {
  phase: BrewPhaseV2
  commander?: CommittedCommander | null
  onBack: () => void
  selectedModelId?: string
  onModelChange?: (modelId: string) => void
  isStreaming?: boolean
  isSaving?: boolean
  lastSavedAt?: number | null
}

// ---------------------------------------------------------------------------
// ExplorationTopbar — shown during exploration phase
// ---------------------------------------------------------------------------

function ExplorationTopbar({ onBack, selectedModelId, onModelChange, isStreaming, isSaving, lastSavedAt }: { onBack: () => void; selectedModelId?: string; onModelChange?: (modelId: string) => void; isStreaming?: boolean; isSaving?: boolean; lastSavedAt?: number | null }) {
  return (
    <div className="flex w-full items-center justify-between px-4 py-2 border-b border-border bg-background">
      {/* Left: back nav + title + badge + phase */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:underline text-[length:var(--fs-md)] flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Decks
        </button>

        <span className="text-[length:var(--fs-md)] font-medium">New brew</span>

        <span className="bg-blue-600/20 text-blue-400 rounded px-2 py-0.5 text-[length:var(--fs-sm)] font-medium">
          Brew
        </span>

        <span className="text-[length:var(--fs-sm)] text-muted-foreground">Exploring</span>
      </div>

      {/* Right: model selector + save indicator */}
      <div className="flex items-center gap-4">
        {selectedModelId && onModelChange && (
          <ModelSelector
            selectedModelId={selectedModelId}
            onModelChange={onModelChange}
            disabled={isStreaming}
          />
        )}
        <SaveIndicator isSaving={isSaving} lastSavedAt={lastSavedAt} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BuildingTopbar — shown during building phase (stub for task 8.1)
// ---------------------------------------------------------------------------

function BuildingTopbar({
  commander,
  onBack,
  selectedModelId,
  onModelChange,
  isStreaming,
  isSaving,
  lastSavedAt,
}: {
  commander: CommittedCommander
  onBack: () => void
  selectedModelId?: string
  onModelChange?: (modelId: string) => void
  isStreaming?: boolean
  isSaving?: boolean
  lastSavedAt?: number | null
}) {
  return (
    <div className="flex w-full items-center justify-between px-4 py-2 border-b border-border bg-background">
      {/* Left: back nav + commander name + badge + metadata */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:underline text-[length:var(--fs-md)] flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Decks
        </button>

        <span className="text-[length:var(--fs-md)] font-medium">{commander.name}</span>

        <span className="bg-blue-600/20 text-blue-400 rounded px-2 py-0.5 text-[length:var(--fs-sm)] font-medium">
          Brew
        </span>

        {/* Metadata strip: colour pips, bracket (future), archetype */}
        <div className="flex items-center gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
          <ColourPips colours={commander.colourIdentity} size={10} />
          {commander.archetype && <span>{commander.archetype}</span>}
        </div>
      </div>

      {/* Right: model selector + save indicator */}
      <div className="flex items-center gap-4">
        {selectedModelId && onModelChange && (
          <ModelSelector
            selectedModelId={selectedModelId}
            onModelChange={onModelChange}
            disabled={isStreaming}
          />
        )}
        <SaveIndicator isSaving={isSaving} lastSavedAt={lastSavedAt} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BrewTopbar — wraps phase-specific variants
// ---------------------------------------------------------------------------

export function BrewTopbar({ phase, commander, onBack, selectedModelId, onModelChange, isStreaming, isSaving, lastSavedAt }: BrewTopbarProps) {
  if (phase === 'building' && commander) {
    return <BuildingTopbar commander={commander} onBack={onBack} selectedModelId={selectedModelId} onModelChange={onModelChange} isStreaming={isStreaming} isSaving={isSaving} lastSavedAt={lastSavedAt} />
  }
  return <ExplorationTopbar onBack={onBack} selectedModelId={selectedModelId} onModelChange={onModelChange} isStreaming={isStreaming} isSaving={isSaving} lastSavedAt={lastSavedAt} />
}
