'use client'

/**
 * "Add to Picklist" and "Add all n to the Picklist" for the Unsorted page. Spec: know-where-cards-are.md sections 7 and 20.
 * Owner decision 2026-11-16: one simple destination dropdown (a box or a deck). Nothing is moved; a waiting step is saved
 * per card so the all-decks Picklist fills. Cards that cannot be added are named with a plain reason.
 */
import { createContext, useContext, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { usePlaceOptions, type PlaceOption } from '@/components/PicklistPlaces'

export interface AddableCard { copyId: number; cardName: string }
interface Answer { created: unknown[]; unchanged: unknown[]; skipped: Array<{ message: string }> }

interface Ctx {
  places: PlaceOption[]
  loadingPlaces: boolean
  value: string
  setValue: (v: string) => void
  pending: boolean
  add: (cards: AddableCard[]) => void
}
const AddCtx = createContext<Ctx | null>(null)

export function AddToPicklistProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const places = usePlaceOptions()
  const [value, setValue] = useState('')
  // Stops a fast double click from sending the same list twice before the button has greyed out.
  const sending = useRef(false)
  const mutation = useMutation({
    mutationFn: async (cards: AddableCard[]) => {
      const opt = (places.data ?? []).find((o) => o.value === value)
      if (!opt) throw new Error('Choose where these cards should go first.')
      const res = await fetch('/api/moves/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cards.map((c) => ({ copyId: c.copyId, cardName: c.cardName, to: opt.to })) }),
      })
      const json = (await res.json().catch(() => ({}))) as Partial<Answer> & { message?: string }
      if (!res.ok) throw new Error(json.message || "Couldn't add those to the Picklist. Nothing was changed.")
      return { json: json as Answer, opt }
    },
    onSuccess: ({ json, opt }) => {
      const made = json.created.length
      const already = json.unchanged.length
      const skipped = json.skipped ?? []
      const where = opt.label.replace(/^(Box|Deck): /, '')
      const head = made > 0
        ? `${made} ${made === 1 ? 'card' : 'cards'} added to the Picklist for ${where}.`
        : already > 0 && skipped.length === 0 ? `Already on the Picklist for ${where}.` : 'Nothing was added.'
      const tail = skipped.length > 0 ? ` Left off: ${skipped.slice(0, 3).map((s) => s.message).join('; ')}${skipped.length > 3 ? `; and ${skipped.length - 3} more` : ''}.` : ''
      if (made > 0 || already > 0) toast.success(head + tail)
      else toast.error(head + tail)
      void qc.invalidateQueries({ queryKey: ['picklist', 'all-decks'] })
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => { sending.current = false },
  })
  const add = (c: AddableCard[]) => {
    if (sending.current) return
    sending.current = true
    mutation.mutate(c)
  }
  return (
    <AddCtx.Provider value={{ places: places.data ?? [], loadingPlaces: places.isLoading, value, setValue, pending: mutation.isPending, add }}>
      {children}
    </AddCtx.Provider>
  )
}

function useAdd(): Ctx {
  const c = useContext(AddCtx)
  if (!c) throw new Error('AddToPicklistProvider is missing')
  return c
}

/** Destination dropdown plus the Add all button. `cards` is every copy the page is showing. */
export function AddAllBar({ cards }: { cards: AddableCard[] }) {
  const { places, loadingPlaces, value, setValue, pending, add } = useAdd()
  if (cards.length === 0) return null
  const n = cards.length
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border-default)' }} data-testid="add-all-bar">
      <label className="flex items-center gap-2 text-[length:var(--fs-sm)]">
        <span className="text-muted-foreground">Send to</span>
        <select
          aria-label="Where these cards should go"
          className="min-h-12 rounded-md border border-[var(--border-default)] bg-card px-2 md:min-h-11"
          value={value}
          disabled={loadingPlaces || pending}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">{loadingPlaces ? 'Loading your places…' : 'Choose a box or deck…'}</option>
          {places.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="min-h-12 rounded-md bg-[var(--accent-primary)] px-4 text-[length:var(--fs-sm)] font-medium text-white disabled:opacity-50 md:min-h-11"
        disabled={!value || pending}
        onClick={() => add(cards)}
      >{n === 1 ? 'Add 1 to the Picklist' : `Add all ${n} to the Picklist`}</button>
      {!value && <span className="text-[length:var(--fs-sm)] text-muted-foreground">Pick a place first. Nothing moves until you tick it on the Picklist.</span>}
    </div>
  )
}

export function AddOneButton({ card }: { card: AddableCard }) {
  const { value, pending, add } = useAdd()
  return (
    <button
      type="button"
      className="min-h-11 text-[length:var(--fs-sm)] underline disabled:opacity-50 disabled:no-underline"
      disabled={!value || pending}
      aria-label={`Add to Picklist: ${card.cardName}`}
      onClick={() => add([card])}
    >Add to Picklist</button>
  )
}
