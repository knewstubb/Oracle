'use client'

/**
 * The card window (card roles and deck jobs, slice 1).
 *
 * Opens from a card name or the card menu ("Card details") in a deck's card list. It opens at once from the data
 * already on the page (picture, name, status, category). Only the roles lookup loads after, on its own, so one slow
 * or failed section never blocks the rest. Roles are read-only for now (they come from the card text, the same way
 * Deck health reads them); jobs and strategy points arrive in later slices.
 *
 * The window is hosted above the card list (CardWindowProvider) because changing a category moves the card to
 * another group, which unmounts the row that opened it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardImage } from '@/components/CardImage'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { CategoryTagEditor } from '@/components/CategoryTagEditor'
import { parseCategoriesCapped, type StructuredCategories } from '@/lib/categoryUtils'
import { WINDOW_ROLE_LABELS, type CardWindowRoles } from '@/lib/card-window-roles'
import type { DeckCard } from '@/components/CardGrid'
import type { CardSlotStatus, DeckCardLifecycle } from '@/lib/card-status'

// ---------------------------------------------------------------------------
// Context: rows ask the host to open the window for a card id
// ---------------------------------------------------------------------------
interface CardWindowApi {
  /** The name is kept so the window can still say which card it was if the card leaves the deck. */
  open: (cardId: number, cardName: string) => void
}
const CardWindowContext = createContext<CardWindowApi | null>(null)

/** Null outside a card list that hosts the window (the row then keeps its old behaviour). */
export function useCardWindow(): CardWindowApi | null {
  return useContext(CardWindowContext)
}

export interface CardWindowProviderProps {
  deckId: number
  /** The deck's live cards. The window reads its card from here, so an edit shows at once. */
  cards: DeckCard[]
  statusMap: Map<number, CardSlotStatus>
  lifecycleMap: Map<number, DeckCardLifecycle>
  availableCategories: string[]
  /** The list's existing category save. Rejects when the save fails. */
  onSaveCategories: (cardId: number, categories: StructuredCategories) => Promise<unknown>
  children: ReactNode
}

export function CardWindowProvider({ deckId, cards, statusMap, lifecycleMap, availableCategories, onSaveCategories, children }: CardWindowProviderProps) {
  const [opened, setOpened] = useState<{ id: number; name: string } | null>(null)
  const api = useMemo<CardWindowApi>(() => ({ open: (id, name) => setOpened({ id, name }) }), [])
  const openId = opened?.id ?? null
  const card = openId == null ? undefined : cards.find((c) => c.id === openId)
  return (
    <CardWindowContext.Provider value={api}>
      {children}
      {openId != null && (
        <CardWindow
          deckId={deckId}
          cardId={openId}
          card={card}
          lastName={opened?.name ?? ''}
          status={(statusMap.get(openId) === 'generic_land' ? 'original' : statusMap.get(openId)) ?? 'available'}
          lifecycle={lifecycleMap.get(openId) ?? 'planned'}
          availableCategories={availableCategories}
          onSaveCategories={onSaveCategories}
          onClose={() => setOpened(null)}
        />
      )}
    </CardWindowContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; previous: StructuredCategories | null }
  | { kind: 'error'; attempt: StructuredCategories }

interface CardWindowProps {
  deckId: number
  cardId: number
  card: DeckCard | undefined
  lastName: string
  status: CardSlotStatus
  lifecycle: DeckCardLifecycle
  availableCategories: string[]
  onSaveCategories: (cardId: number, categories: StructuredCategories) => Promise<unknown>
  onClose: () => void
}

const UNDO_WINDOW_MS = 10_000

function CardWindow({ deckId, cardId, card, lastName, status, lifecycle, availableCategories, onSaveCategories, onClose }: CardWindowProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [editing, setEditing] = useState(false)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })

  const parsed = parseCategoriesCapped(card?.categories ?? '')
  const categoryList = [parsed.primary_category, ...parsed.additional_categories]

  const commit = useCallback(
    async (next: StructuredCategories, previous: StructuredCategories) => {
      setSave({ kind: 'saving' })
      try {
        await onSaveCategories(cardId, next)
        setSave({ kind: 'saved', previous })
      } catch {
        setSave({ kind: 'error', attempt: next })
      }
    },
    [cardId, onSaveCategories],
  )

  // The Undo offer lasts 10 seconds; "Saved" stays.
  useEffect(() => {
    if (save.kind !== 'saved') return
    const t = setTimeout(() => setSave((s) => (s.kind === 'saved' ? { kind: 'saved', previous: null } : s)), UNDO_WINDOW_MS)
    return () => clearTimeout(t)
  }, [save])

  const name = card?.card_name ?? lastName
  const primaryOptions = Array.from(new Set([...availableCategories, parsed.primary_category])).filter(Boolean)

  const changePrimary = (value: string) => {
    if (!card || value === parsed.primary_category) return
    void commit(
      { primary_category: value, additional_categories: parsed.additional_categories.filter((c) => c !== value) },
      parsed,
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        initialFocus={closeRef}
        data-testid="card-window"
        className="max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:overflow-y-auto sm:max-h-[90vh] sm:max-w-[720px] sm:overflow-y-auto"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[length:var(--fs-lg)]">{name}</DialogTitle>
            {card && (
              <div className="mt-1.5">
                <CardSlotBadge status={status} lifecycle={lifecycle} variant="badge" />
              </div>
            )}
          </div>
          <DialogClose
            ref={closeRef}
            render={<Button variant="ghost" size="icon" className="max-sm:size-11" aria-label="Close card details" />}
          >
            <span aria-hidden="true">✕</span>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">Details for {name} in this deck.</DialogDescription>

        {!card ? (
          <div className="flex flex-col gap-3" data-testid="card-window-gone">
            <p>This card isn&apos;t in this deck any more.</p>
            <div>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="mx-auto w-[200px] shrink-0 max-sm:w-[min(60vw,240px)] sm:mx-0">
              <CardImage scryfallId={card.scryfall_id} alt={card.card_name} width={200} height={280} noPreview className="w-full rounded-lg" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              {/* Category */}
              <section aria-labelledby="cw-category">
                <h3 id="cw-category" className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">Category</h3>
                <p className="text-[length:var(--fs-xs)] text-muted-foreground">Category: where it sits in the list</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {categoryList.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      data-testid="card-window-category"
                      className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[length:var(--fs-sm)]"
                    >
                      {c}{i === 0 && categoryList.length > 1 ? ' (main)' : ''}
                    </span>
                  ))}
                  <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                </div>
                {editing && (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--border-default)] p-3">
                    <label className="flex items-center gap-2 text-[length:var(--fs-sm)]">
                      <span className="w-16 shrink-0 text-muted-foreground">Main:</span>
                      <select
                        value={parsed.primary_category}
                        onChange={(e) => changePrimary(e.target.value)}
                        className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-[length:var(--fs-sm)] max-sm:h-11"
                        aria-label="Main category"
                      >
                        {primaryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <CategoryTagEditor
                      primaryCategory={parsed.primary_category}
                      additionalCategories={parsed.additional_categories}
                      availableCategories={availableCategories}
                      onChange={(updated) => void commit(updated, parsed)}
                      disabled={save.kind === 'saving'}
                    />
                  </div>
                )}
                <p className="mt-2 text-[length:var(--fs-xs)] text-muted-foreground">
                  This is your name for the card in this deck. It doesn&apos;t change how the card is counted.
                </p>
              </section>

              {/* Roles, as the app works them out today */}
              <RolesSection deckId={deckId} cardId={cardId} cardName={card.card_name} />

              <p className="text-[length:var(--fs-xs)] text-muted-foreground">Jobs and strategy points are coming</p>

              {/* Save state */}
              <div className="min-h-5 text-[length:var(--fs-sm)]" role="status" aria-live="polite" data-testid="card-window-save">
                {save.kind === 'saving' && <span>Saving…</span>}
                {save.kind === 'saved' && (
                  <span>
                    Saved
                    {save.previous && (
                      <Button
                        variant="link"
                        size="sm"
                        className="ml-2 max-sm:h-11"
                        onClick={() => void commit(save.previous as StructuredCategories, parsed)}
                      >
                        Undo
                      </Button>
                    )}
                  </span>
                )}
                {save.kind === 'error' && (
                  <span>
                    Couldn&apos;t save the category. Nothing was changed.
                    <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={() => void commit(save.attempt, parsed)}>
                      Try again
                    </Button>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Roles (read-only for now): loads after the window is open, on its own
// ---------------------------------------------------------------------------
function RolesSection({ deckId, cardId, cardName }: { deckId: number; cardId: number; cardName: string }) {
  const query = useQuery<CardWindowRoles>({
    queryKey: ['card-window-roles', deckId, cardId],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}/roles`)
      if (!res.ok) throw new Error('roles lookup failed')
      return (await res.json()) as CardWindowRoles
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const data = query.data
  return (
    <section aria-labelledby="cw-roles">
      <h3 id="cw-roles" className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">Roles (read-only for now)</h3>
      <p className="text-[length:var(--fs-xs)] text-muted-foreground">Worked out from the card text. Setting roles comes next.</p>
      <div className="mt-2 text-[length:var(--fs-sm)]">
        {query.isPending ? (
          <div role="status">
            <span className="sr-only">Checking roles for {cardName}</span>
            <Skeleton className="h-6 w-40" />
          </div>
        ) : query.isError || !data ? (
          <p>
            Couldn&apos;t load roles for {cardName}. Nothing has changed.
            <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={() => void query.refetch()}>Try again</Button>
          </p>
        ) : data.kind === 'no_data' ? (
          <p>No card data yet, so no role was worked out.</p>
        ) : data.kind === 'land' ? (
          <p>Lands have no roles.</p>
        ) : data.roles.length === 0 ? (
          <p>No role found. Many cards, such as a plain creature, don&apos;t have one.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Roles worked out from the card text">
            {data.roles.map((r) => (
              <li key={r} data-testid="card-window-role" className="rounded-full border border-dashed border-[var(--border-emphasis)] px-2 py-0.5">
                {WINDOW_ROLE_LABELS[r]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
