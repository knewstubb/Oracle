'use client'

// Move here: one click moves a chosen copy from another deck into this deck (spec section 19).
// No dialog, no checklist entry, no reminder. An 8 second Undo toast plus a quiet inline note with the same Undo.

import { useState } from 'react'
import { ChevronDown, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import { moveHereErrorMessage, movedToastText, playableWarning, type MoveHereCopy } from '@/lib/move-here'
import type { MoveHereResponse } from '../../docs/oracle/contracts/know-where-cards-are.types'

export const MOVE_HERE_TOAST_MS = 8000

interface CopiesReply {
  hasOpenSlot: boolean
  copies: MoveHereCopy[]
}

type Moved = MoveHereResponse & { sourceWasPlayable?: boolean }

function copyLabel(c: MoveHereCopy): string {
  const state = c.deckState === 'playable' ? 'Playable' : c.deckState === 'assembling' ? 'Assembling' : 'Draft'
  return `${c.deckName}${c.isProxy ? ' (proxy)' : ''} · ${state}`
}

export function MoveHereControl({ deckId, cardName }: { deckId: number; cardName: string }) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moved, setMoved] = useState<Moved | null>(null)
  const [undone, setUndone] = useState(false)

  const key = ['move-here', deckId, cardName] as const
  const { data } = useQuery<CopiesReply>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/move-here?cardName=${encodeURIComponent(cardName)}`)
      if (!res.ok) throw new Error('lookup failed')
      const body = await res.json()
      if (!body || !Array.isArray(body.copies)) throw new Error('unexpected reply')
      return body as CopiesReply
    },
    staleTime: 0,
    retry: false,
  })

  const refresh = (sourceDeckId?: number) => {
    const inv = createDeckInvalidators(queryClient)
    inv.invalidateDeck(deckId)
    if (sourceDeckId !== undefined) inv.invalidateDeck(sourceDeckId)
    void queryClient.invalidateQueries({ queryKey: ['move-here'] })
  }

  const undo = async (m: Moved) => {
    try {
      const res = await fetch('/api/allocation/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(m.undo),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.success !== false) {
        setUndone(true)
        toast.success(`Put ${cardName} back in ${m.sourceDeckName}.`)
        refresh(m.sourceDeckId)
        return
      }
      toast.error(
        body.reason === 'slot_claimed_elsewhere'
          ? `Can't undo: ${m.sourceDeckName} has used that slot since. Nothing was changed.`
          : `Can't undo this move any more. Nothing was changed.`
      )
    } catch {
      toast.error('No connection. Nothing was changed.')
    }
  }

  const move = async (copy: MoveHereCopy) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/decks/${deckId}/move-here`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: copy.copyId, cardName, expectedSourceDeckId: copy.deckId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.message === 'string' ? body.message : moveHereErrorMessage('failed', cardName))
        if (body.error === 'source_changed' || body.error === 'no_open_slot') void queryClient.invalidateQueries({ queryKey: key })
        return
      }
      const m = body as Moved
      setMoved(m)
      setUndone(false)
      toast.success(movedToastText(m.sourceDeckName, Boolean(m.sourceWasPlayable)), {
        duration: MOVE_HERE_TOAST_MS,
        action: { label: 'Undo', onClick: () => void undo(m) },
      })
      refresh(m.sourceDeckId)
    } catch {
      setError('No connection. Nothing was moved.')
    } finally {
      setBusy(false)
    }
  }

  // After a move: a quiet note that keeps Undo available for the rest of the visit.
  if (moved && !undone) {
    return (
      <span role="status" data-testid="moved-note" className="inline-flex items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
        Moved from {moved.sourceDeckName}
        <button type="button" onClick={() => void undo(moved)} className="inline-flex items-center gap-1 underline" style={{ color: 'var(--text-primary)' }}>
          <Undo2 size={12} aria-hidden="true" /> Undo
        </button>
      </span>
    )
  }

  const copies = data?.copies ?? []
  if (!data?.hasOpenSlot || copies.length === 0) {
    return error ? (
      <span role="alert" className="text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>{error}</span>
    ) : null
  }

  const picked = copies.find((c) => c.copyId === selectedId) ?? copies[0]
  return (
    <div className="flex flex-col gap-1" data-testid="move-here">
      <p className="text-[length:var(--fs-sm)]" style={{ color: 'var(--text-secondary)' }}>
        {copies.length === 1
          ? `Your copy is in ${picked.deckName}.`
          : `You have ${copies.length} copies in other decks. Picked: ${copyLabel(picked)}.`}
        {picked.deckState === 'playable' ? ` ${playableWarning(picked.deckName)}` : ''}
      </p>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void move(picked)}
          aria-label={`Move ${cardName} here from ${picked.deckName}`}
          className="h-8 px-2.5 text-[length:var(--fs-sm)]"
        >
          {busy ? 'Moving…' : 'Move here'}
        </Button>
        {copies.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy} aria-label={`Choose which copy of ${cardName} to move`} className="h-8 px-1.5">
                <ChevronDown size={14} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {copies.map((c) => (
                <DropdownMenuItem key={c.copyId} onClick={() => setSelectedId(c.copyId)}>
                  {copyLabel(c)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {error && (
        <span role="alert" className="text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
