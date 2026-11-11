'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useDomHost } from '@/hooks/useDomHost'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HealthPill } from '@/components/HealthPill'
import { DeckHealthButton } from '@/components/DeckHealthButton'
import { DeckHealthPanel } from '@/components/DeckHealthPanel'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckHealthResponse, HealthRoleKey } from '@/lib/deck-health'

export interface HealthStripProps {
  deckId: number
}

export function HealthStrip({ deckId }: HealthStripProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [gapRole, setGapRole] = useState<HealthRoleKey | null>(null)

  const openPanel = (role: HealthRoleKey | null) => {
    setGapRole(role)
    setPanelOpen(true)
  }

  const { data, isLoading, isError, refetch } = useQuery<DeckHealthResponse>({
    queryKey: deckKeys.health(deckId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health`)
      if (!res.ok) throw new Error('Failed to fetch health data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const anyLight = !!data && data.roles.some((r) => r.state === 'light')

  // The strip lives in the app footer (shared with the Oracle chat input). If the footer slot
  // isn't on the page (e.g. in isolated tests), fall back to rendering in place.
  const footerHost = useDomHost('app-footer-left')

  const strip = (
      <div className="flex items-center gap-2" data-testid="health-strip">
        {isLoading && (
          <div className="flex items-center gap-2" aria-busy="true">
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <span className="sr-only" role="status">
              Checking deck health…
            </span>
          </div>
        )}

        {isError && !isLoading && (
          <div role="alert" className="flex items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
            <AlertCircle size={14} aria-hidden="true" />
            <span>Couldn&apos;t check deck health.</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}

        {data && !isError && (
          <>
            <DeckHealthButton state={anyLight ? 'light' : 'ok'} headline={data.verdict.headline} onClick={() => openPanel(null)} />
            <div role="group" aria-label="Role counts" className="flex items-center gap-1">
              {data.roles.map((r) => (
                <HealthPill
                  key={r.role}
                  label={r.label}
                  have={r.have}
                  typical={r.typical}
                  state={r.state}
                  isGeneralGuide={r.targetSource === 'general_guide'}
                  onClick={() => openPanel(r.state === 'light' ? r.role : null)}
                />
              ))}
            </div>
          </>
        )}
      </div>
  )

  return (
    <>
      {footerHost ? createPortal(strip, footerHost) : (
        <div className="shrink-0 border-t px-6 py-2" style={{ borderColor: 'var(--border-default)' }}>
          {strip}
        </div>
      )}

      <DeckHealthPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        data={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        deckId={deckId}
        gapRole={gapRole}
        onGapRole={setGapRole}
      />
    </>
  )
}
