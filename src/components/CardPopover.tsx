'use client'

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import Image from 'next/image'
import { X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { ProxyBadge } from '@/components/ProxyBadge'
import { ManaCost } from '@/components/ManaCost'

interface CrossDeckEntry {
  id: number
  name: string
  is_proxy: boolean
}

interface CrossDeckResponse {
  card_name: string
  deck_count: number
  decks: CrossDeckEntry[]
}

interface CardPopoverProps {
  cardName: string
  scryfallId: string
  setCode: string
  tags: string
  manaCost?: string
  children: ReactNode
}

function getScryfallNormalUrl(scryfallId: string): string {
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  return `https://cards.scryfall.io/normal/front/${a}/${b}/${scryfallId}.jpg`
}

export function CardPopover({
  cardName,
  scryfallId,
  setCode,
  tags,
  manaCost,
  children,
}: CardPopoverProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isProxy = (tags || '').toLowerCase().includes('proxy')

  const { data, isLoading, error } = useQuery<CrossDeckResponse>({
    queryKey: ['card-decks', cardName],
    queryFn: () =>
      fetch(`/api/cards/${encodeURIComponent(cardName)}/decks`).then((r) => {
        if (!r.ok) throw new Error('Failed to load card details')
        return r.json()
      }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const handleClose = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, handleClose])

  // Click outside handler
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        dialogRef.current &&
        !dialogRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        handleClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, handleClose])

  // Focus trap
  useEffect(() => {
    if (!open || !dialogRef.current) return
    const dialog = dialogRef.current
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length > 0) {
      focusable[0].focus()
    }

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [open, data, isLoading])

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full cursor-pointer text-left"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {children}
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label={`Card details: ${cardName}`}
          className="absolute left-0 z-50 mt-2 flex w-[480px] gap-4 rounded-2xl bg-popover p-5 text-popover-foreground shadow-xl shadow-black/8 ring-1 ring-border"
        >
          {/* Left: full card image */}
          <div className="shrink-0">
            {scryfallId ? (
              <Image
                src={getScryfallNormalUrl(scryfallId)}
                alt={`${cardName} full card`}
                width={180}
                height={252}
                className="rounded-lg"
                unoptimized
              />
            ) : (
              <div className="flex h-[252px] w-[180px] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                No image
              </div>
            )}
          </div>

          {/* Right: details */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="truncate text-base font-bold">{cardName}</h4>
                <p className="text-xs text-muted-foreground">
                  {setCode?.toUpperCase() || 'Unknown set'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleClose}
                aria-label="Close card details"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            {manaCost && <ManaCost cost={manaCost} />}

            {isProxy && <ProxyBadge />}

            <Separator />

            {/* Cross-deck info */}
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-28" />
              </div>
            )}

            {error && (
              <p className="text-xs text-destructive" role="alert">
                Couldn&apos;t load card details.
              </p>
            )}

            {data && data.deck_count > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium">
                  In {data.deck_count} {data.deck_count === 1 ? 'deck' : 'decks'}:
                </p>
                <ul className="space-y-1">
                  {data.decks.map((deck) => (
                    <li key={deck.id} className="flex items-center gap-1.5">
                      <Link
                        href={`/decks/${deck.id}`}
                        className="text-xs text-primary hover:underline"
                        onClick={handleClose}
                      >
                        {deck.name}
                      </Link>
                      {deck.is_proxy && (
                        <span className="text-[10px] text-muted-foreground">(proxy)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data && data.deck_count === 0 && (
              <p className="text-xs text-muted-foreground">Not in any other decks.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
