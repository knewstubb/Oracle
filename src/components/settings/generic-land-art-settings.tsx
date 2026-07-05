'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenericLandPreference {
  cardDefinitionId: number
  cardName: string
  scryfallPrintingId: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getArtCropUrl(scryfallPrintingId: string): string {
  const a = scryfallPrintingId.charAt(0)
  const b = scryfallPrintingId.charAt(1)
  return `https://cards.scryfall.io/art_crop/front/${a}/${b}/${scryfallPrintingId}.jpg`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenericLandArtSettings() {
  const queryClient = useQueryClient()
  const [pickerLandType, setPickerLandType] = useState<GenericLandPreference | null>(null)

  // Fetch all 6 preferences
  const { data: preferences, isLoading, error } = useQuery<GenericLandPreference[]>({
    queryKey: ['generic-land-preferences'],
    queryFn: async () => {
      const res = await fetch('/api/settings/generic-land-preferences')
      if (!res.ok) throw new Error('Failed to load land art preferences')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Mutation for updating a preference
  const updateMutation = useMutation({
    mutationFn: async ({ cardDefinitionId, scryfallPrintingId }: { cardDefinitionId: number; scryfallPrintingId: string }) => {
      const res = await fetch(`/api/settings/generic-land-preferences/${cardDefinitionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scryfallPrintingId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Failed to update preference')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generic-land-preferences'] })
    },
  })

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Generic land art</h3>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-16 rounded" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="ml-auto h-8 w-16" />
          </div>
        ))}
      </div>
    )
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load generic land art preferences.</span>
        </div>
      </div>
    )
  }

  // --- Main content ---
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Generic land art</h3>

      <div className="divide-y divide-border rounded-lg border border-border">
        {preferences?.map((pref) => (
          <LandArtRow
            key={pref.cardDefinitionId}
            preference={pref}
            onChangeClick={() => setPickerLandType(pref)}
          />
        ))}
      </div>

      {/* Picker dialog — rendered when a land type is selected for change */}
      {pickerLandType && (
        <ScryfallPrintingPickerPlaceholder
          preference={pickerLandType}
          isSaving={updateMutation.isPending}
          onSelect={(scryfallPrintingId) => {
            updateMutation.mutate(
              { cardDefinitionId: pickerLandType.cardDefinitionId, scryfallPrintingId },
              { onSuccess: () => setPickerLandType(null) }
            )
          }}
          onClose={() => setPickerLandType(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LandArtRow({
  preference,
  onChangeClick,
}: {
  preference: GenericLandPreference
  onChangeClick: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const artUrl = getArtCropUrl(preference.scryfallPrintingId)

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {/* Art thumbnail */}
      <div className="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded bg-muted">
        {imgError ? (
          <PlaceholderImage landType={preference.cardName} />
        ) : (
          <Image
            src={artUrl}
            alt={`${preference.cardName} art`}
            fill
            className="object-cover"
            sizes="64px"
            onError={() => setImgError(true)}
          />
        )}
      </div>

      {/* Land type name */}
      <span className="text-sm font-medium">{preference.cardName}</span>

      {/* Change button */}
      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        onClick={onChangeClick}
      >
        Change
      </Button>
    </div>
  )
}

function PlaceholderImage({ landType }: { landType: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
      {landType}
    </div>
  )
}

/**
 * Placeholder for the ScryfallPrintingPicker component (task 6.3).
 * This will be replaced by the full picker implementation.
 * For now it renders a simple overlay indicating where the picker will go.
 */
function ScryfallPrintingPickerPlaceholder({
  preference,
  isSaving,
  onSelect: _onSelect,
  onClose,
}: {
  preference: GenericLandPreference
  isSaving: boolean
  onSelect: (scryfallPrintingId: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <h4 className="mb-2 text-base font-semibold">
          Choose art for {preference.cardName}
        </h4>
        <p className="mb-4 text-sm text-muted-foreground">
          The full Scryfall printing picker will be implemented in task 6.3.
        </p>
        {isSaving && (
          <p className="mb-4 text-sm text-muted-foreground">Saving...</p>
        )}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
