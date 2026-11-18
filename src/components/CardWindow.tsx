'use client'

/**
 * The card window (card roles and deck jobs, slice 1).
 *
 * Opens from a card name or the card menu ("Card details") in a deck's card list. It opens at once from the data
 * already on the page (picture, name, status, category). Only the roles lookup loads after, on its own, so one slow
 * or failed section never blocks the rest. Roles can be added and removed (slice 2); where nothing is stored they
 * still come from the card text, the same way Deck health reads them. Jobs and strategy points arrive in later slices.
 *
 * The window is hosted above the card list (CardWindowProvider) because changing a category moves the card to
 * another group, which unmounts the row that opened it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardImage } from '@/components/CardImage'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { parseCategoriesCapped, type StructuredCategories } from '@/lib/categoryUtils'
import type { CardWindowLookup } from '@/lib/card-window-roles'
import {
  ROLE_SLUG_LABELS, ROLE_SOURCE_LABELS, applyOwnerAction, mergeWindowRoles,
  type OwnerRoleAction, type RoleSlug,
} from '@/lib/card-window-stored-roles'
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
                <p className="text-[length:var(--fs-xs)] text-muted-foreground">Where it sits in the list</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    data-testid="card-window-category"
                    className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[length:var(--fs-sm)]"
                  >
                    {parsed.primary_category}
                  </span>
                  <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                </div>
                {editing && (
                  <div className="mt-3 rounded-lg border border-[var(--border-default)] p-3">
                    <select
                      value={parsed.primary_category}
                      onChange={(e) => changePrimary(e.target.value)}
                      disabled={save.kind === 'saving'}
                      className="h-7 w-full rounded-md border border-input bg-background px-2 text-[length:var(--fs-sm)] max-sm:h-11"
                      aria-label="Category"
                    >
                      {primaryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <p className="mt-2 text-[length:var(--fs-xs)] text-muted-foreground">
                  This is your name for the card in this deck. It doesn&apos;t change how the card is counted.
                </p>
              </section>

              {/* Roles, as the app works them out today */}
              <RolesSection deckId={deckId} cardId={cardId} cardName={card.card_name} />
              {/* Supertypes, card types and subtypes, read-only, from the same lookup */}
              <TypesSection deckId={deckId} cardId={cardId} />

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
// Roles (editable since slice 2): loads after the window is open, on its own
// ---------------------------------------------------------------------------
/** One lookup for the roles and the type groups: both sections use the same query key, so it runs once. */
function useCardWindowLookup(deckId: number, cardId: number) {
  return useQuery<CardWindowLookup>({
    queryKey: ['card-window-roles', deckId, cardId],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}/roles`)
      if (!res.ok) throw new Error('roles lookup failed')
      return (await res.json()) as CardWindowLookup
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
type RoleEdit = { kind: 'saved' } | { kind: 'error'; attempt: { role: RoleSlug; action: OwnerRoleAction } }

function RolesSection({ deckId, cardId, cardName }: { deckId: number; cardId: number; cardName: string }) {
  const query = useCardWindowLookup(deckId, cardId)
  const queryClient = useQueryClient()
  const [edit, setEdit] = useState<RoleEdit | null>(null)
  const pending = useRef(0)
  const data = query.data
  const queryKey = ['card-window-roles', deckId, cardId]

  // The screen changes at once; the save runs in the background. If it fails, the screen goes back and says so.
  const save = async (role: RoleSlug, action: OwnerRoleAction) => {
    await queryClient.cancelQueries({ queryKey })
    const before = queryClient.getQueryData<CardWindowLookup>(queryKey)
    if (before) queryClient.setQueryData<CardWindowLookup>(queryKey, { ...before, stored: applyOwnerAction(before.stored, role, action) })
    setEdit(null)
    pending.current += 1
    let failed = false
    try {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      failed = true
      if (before) queryClient.setQueryData<CardWindowLookup>(queryKey, before)
    }
    pending.current -= 1
    setEdit(failed ? { kind: 'error', attempt: { role, action } } : (e) => (e?.kind === 'error' ? e : { kind: 'saved' }))
    // Read the saved answer back once the last save is done, so the screen matches what is stored.
    if (pending.current === 0) void queryClient.invalidateQueries({ queryKey })
  }

  const stored = data?.stored
  const canEdit = stored?.status === 'ok'
  const view = data ? mergeWindowRoles(stored, data) : null
  return (
    <section aria-labelledby="cw-roles">
      <h3 id="cw-roles" className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">Universal roles</h3>
      <p className="text-[length:var(--fs-xs)] text-muted-foreground">Roles are the same in every deck. Your own category names below don&apos;t change them.</p>
      <div className="mt-2 text-[length:var(--fs-sm)]">
        {query.isPending ? (
          <div role="status">
            <span className="sr-only">Checking roles for {cardName}</span>
            <Skeleton className="h-6 w-40" />
          </div>
        ) : query.isError || !data || !view ? (
          <p>
            Couldn&apos;t load roles for {cardName}. Nothing has changed.
            <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={() => void query.refetch()}>Try again</Button>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {stored?.status === 'error' && (
              <p data-testid="card-window-roles-stored-error">
                Couldn&apos;t load your saved roles, so roles can&apos;t be changed right now. Only what was worked out from the card text is shown.
                <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={() => void query.refetch()}>Try again</Button>
              </p>
            )}
            {stored?.status === 'no_identity' && (
              <p data-testid="card-window-roles-no-identity">This card can&apos;t be matched to a card identity yet, so its roles can&apos;t be changed.</p>
            )}
            {view.chips.length === 0 ? (
              <p>
                {data.kind === 'land' ? 'Lands have no roles.'
                  : data.kind === 'no_data' ? 'No card data yet, so no role was worked out.'
                  : 'No role found. Many cards, such as a plain creature, don\'t have one.'}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2" aria-label="Roles">
                {view.chips.map((c) => (
                  <li
                    key={c.role}
                    data-testid="card-window-role"
                    data-source={c.source}
                    className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${c.source === 'owner' || c.source === 'baseline' ? 'border-[var(--border-emphasis)]' : 'border-dashed border-[var(--border-emphasis)]'}`}
                  >
                    <span>{c.label}</span>
                    <span className="text-[length:var(--fs-xs)] text-muted-foreground">{ROLE_SOURCE_LABELS[c.source]}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="rounded px-1 text-muted-foreground hover:text-foreground disabled:opacity-50 max-sm:min-h-11 max-sm:min-w-11"
                        aria-label={`Remove ${c.label}`}
                       
                        onClick={() => void save(c.role, c.removeAction)}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && view.removed.length > 0 && (
              <ul className="flex flex-col gap-1" aria-label="Roles you removed">
                {view.removed.map((r) => (
                  <li key={r} data-testid="card-window-role-removed">
                    You removed: {ROLE_SLUG_LABELS[r]}.
                    <Button variant="link" size="sm" className="ml-1 max-sm:h-11" onClick={() => void save(r, 'clear')}>
                      Restore<span className="sr-only"> {ROLE_SLUG_LABELS[r]}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && view.addable.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Add role</span>
                <select
                  value=""
                 
                  onChange={(e) => { if (e.target.value) void save(e.target.value as RoleSlug, 'add') }}
                  className="h-7 rounded-md border border-input bg-background px-2 text-[length:var(--fs-sm)] max-sm:h-11"
                  aria-label="Add role"
                >
                  <option value="">Choose a role…</option>
                  {view.addable.map((r) => <option key={r} value={r}>{ROLE_SLUG_LABELS[r]}</option>)}
                </select>
              </label>
            )}
            {view.chips.some((c) => c.source === 'baseline') && (
              <p className="text-[length:var(--fs-xs)] text-muted-foreground">Standard roles come from Oracle.</p>
            )}
            {view.chips.some((c) => c.source === 'text') && (
              <p className="text-[length:var(--fs-xs)] text-muted-foreground">Worked out from card text: nothing is set for these yet, so Oracle read the rules text and guessed.</p>
            )}
            <div className="min-h-5" role="status" aria-live="polite" data-testid="card-window-roles-save">
              {edit?.kind === 'saved' && <span>Saved</span>}
              {edit?.kind === 'error' && (
                <span>
                  Couldn&apos;t save that change, so it was put back.
                  <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={() => void save(edit.attempt.role, edit.attempt.action)}>
                    Try again
                  </Button>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Type line, split by the Magic rules (read-only). Shares the roles lookup; an empty group is hidden.
// ---------------------------------------------------------------------------
function TypesSection({ deckId, cardId }: { deckId: number; cardId: number }) {
  const query = useCardWindowLookup(deckId, cardId)
  if (query.isPending) {
    return (
      <div role="status">
        <span className="sr-only">Checking the type line</span>
        <Skeleton className="h-6 w-40" />
      </div>
    )
  }
  if (query.isError) return <p className="text-[length:var(--fs-sm)]">Couldn&apos;t load the type line.</p>
  const types = query.data?.types
  if (!types) return null
  const groups = [
    { id: 'supertypes', label: 'Supertypes', items: types.supertypes },
    { id: 'card-types', label: 'Card types', items: types.cardTypes },
    { id: 'subtypes', label: 'Subtypes', items: types.subtypes },
  ].filter((g) => g.items.length > 0)
  if (groups.length === 0) return null
  return (
    <section aria-label="Type line" data-testid="card-window-types" className="space-y-2">
      {groups.map((g) => (
        <div key={g.id} data-testid={`card-window-${g.id}`}>
          <h3 className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</h3>
          <ul className="mt-1 flex flex-wrap gap-1.5 text-[length:var(--fs-sm)]" aria-label={g.label}>
            {g.items.map((t) => (
              <li key={t} className="rounded-full border border-[var(--border-emphasis)] px-2 py-0.5">{t}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
