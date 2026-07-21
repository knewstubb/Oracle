'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ScanMode, ScanTarget } from '@/components/scanner/ScanSession'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ScanSetupProps {
  onComplete: (mode: ScanMode, target: ScanTarget) => void
}

export function ScanSetup({ onComplete }: ScanSetupProps) {
  const [target, setTarget] = useState<ScanTarget>({ type: 'collection' })

  // Fetch decks for target picker
  const { data: decks } = useQuery<Array<{ id: number; name: string; status: string }>>({
    queryKey: ['decks'],
    queryFn: () => fetch('/api/decks').then(r => r.json()).then(d => d.decks ?? d),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch storage locations for target picker
  const { data: locations } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['storage-locations'],
    queryFn: () => fetch('/api/storage-locations').then(r => r.json()).then(d => d.locations ?? d),
    staleTime: 5 * 60 * 1000,
  })

  const handleStart = () => {
    onComplete('add', target)
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl" style={{ backgroundColor: 'rgba(29,158,117,0.1)' }}>
            <Camera className="size-8" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <h2 className="text-[length:var(--fs-xl)] font-semibold text-foreground">Add Cards</h2>
          <p className="mt-1 text-[length:var(--fs-sm)] text-muted-foreground">
            Scan physical cards with your camera to add them to your collection
          </p>
        </div>

        {/* Target selection */}
        <div className="space-y-3">
          <label className="text-[length:var(--fs-sm)] font-medium text-foreground">
            Where should scanned cards go?
          </label>

          {/* Collection (default) */}
          <button
            type="button"
            onClick={() => setTarget({ type: 'collection' })}
            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              target.type === 'collection'
                ? 'border-[var(--accent-primary)] bg-[rgba(29,158,117,0.06)]'
                : 'border-[var(--border-default)] hover:bg-white/[0.02]'
            }`}
          >
            <FolderOpen className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <span className="text-[length:var(--fs-sm)] font-medium text-foreground">Collection (unsorted)</span>
              <span className="block text-[length:var(--fs-xs)] text-muted-foreground">Cards added without a specific location</span>
            </div>
          </button>

          {/* Deck targets */}
          {decks && decks.length > 0 && (
            <div className="space-y-1">
              <span className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">
                Add to deck
              </span>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {decks.filter(d => d.status === 'brewing' || d.status === 'in_rotation').map(deck => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => setTarget({ type: 'deck', deckId: deck.id, deckName: deck.name })}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors ${
                      target.type === 'deck' && target.deckId === deck.id
                        ? 'border-[var(--accent-primary)] bg-[rgba(29,158,117,0.06)]'
                        : 'border-[var(--border-default)] hover:bg-white/[0.02]'
                    }`}
                  >
                    <span className="text-[length:var(--fs-sm)] text-foreground">{deck.name}</span>
                    <span className="ml-auto text-[length:var(--fs-xs)] text-muted-foreground">{deck.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Binder targets */}
          {locations && locations.length > 0 && (
            <div className="space-y-1">
              <span className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">
                Add to binder
              </span>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {locations.map(loc => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => setTarget({ type: 'storage', storageLocationId: loc.id, storageLocationName: loc.name })}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors ${
                      target.type === 'storage' && target.storageLocationId === loc.id
                        ? 'border-[var(--accent-primary)] bg-[rgba(29,158,117,0.06)]'
                        : 'border-[var(--border-default)] hover:bg-white/[0.02]'
                    }`}
                  >
                    <span className="text-[length:var(--fs-sm)] text-foreground">{loc.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Start button */}
        <Button
          onClick={handleStart}
          className="w-full"
          size="lg"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <Camera className="size-4" />
          Start Scanning
        </Button>
      </div>
    </div>
  )
}
