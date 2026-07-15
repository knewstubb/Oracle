'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StorageLocation {
  id: number
  name: string
  color: string | null
}

export interface LocationPickerModalProps {
  open: boolean
  onConfirm: (storageLocationId: number | null) => void
  onCancel: () => void
  /** Card name displayed in the header */
  cardName: string
  /** Printing info displayed as subtitle (e.g., "Tenth Edition (10E)") */
  printingInfo?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal dialog shown when unassigning, removing, or replacing a card.
 * Forces the user to choose where the freed copy goes — no silent defaults.
 *
 * "Unsorted" is a real, listed option (maps to storageLocationId = null).
 * Nothing is pre-selected — user must actively choose.
 */
export function LocationPickerModal({
  open,
  onConfirm,
  onCancel,
  cardName,
  printingInfo,
}: LocationPickerModalProps) {
  // null = "Unsorted" selected, undefined = nothing selected yet
  const [selected, setSelected] = useState<number | null | undefined>(undefined)

  // Fetch storage locations
  const { data: locations } = useQuery<StorageLocation[]>({
    queryKey: ['storage-locations'],
    queryFn: async () => {
      const res = await fetch('/api/settings/storage-locations')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  })

  const handleConfirm = () => {
    if (selected !== undefined) {
      onConfirm(selected)
      setSelected(undefined) // Reset for next use
    }
  }

  const handleCancel = () => {
    setSelected(undefined)
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Where does this copy go?</DialogTitle>
          {(cardName || printingInfo) && (
            <DialogDescription>
              {cardName}{printingInfo ? ` · ${printingInfo}` : ''}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Radio group */}
        <div
          className="flex flex-col gap-1.5 py-2"
          role="radiogroup"
          aria-required="true"
          aria-label="Storage location"
        >
          {/* Unsorted option (always first) */}
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
              selected === null
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-bg)]'
                : 'border-[var(--border-default)] hover:bg-white/[0.03]'
            }`}
          >
            <input
              type="radio"
              name="storage-location"
              checked={selected === null}
              onChange={() => setSelected(null)}
              className="size-4 accent-[var(--accent-primary)]"
            />
            <span className="size-3 rounded-full border border-dashed border-muted-foreground" aria-hidden="true" />
            <span className="text-[length:var(--fs-md)]">Unsorted</span>
          </label>

          {/* User-defined locations */}
          {(locations ?? []).map((loc) => (
            <label
              key={loc.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                selected === loc.id
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-bg)]'
                  : 'border-[var(--border-default)] hover:bg-white/[0.03]'
              }`}
            >
              <input
                type="radio"
                name="storage-location"
                checked={selected === loc.id}
                onChange={() => setSelected(loc.id)}
                className="size-4 accent-[var(--accent-primary)]"
              />
              {loc.color && (
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: loc.color }}
                  aria-hidden="true"
                />
              )}
              <span className="text-[length:var(--fs-md)]">{loc.name}</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected === undefined}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
