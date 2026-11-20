'use client'
import { useCallback, useEffect, useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ColourPips } from '@/components/ColourPips'
import { SaveStatus } from '@/components/SaveStatus'
import { useAutosave, type SaveResult } from '@/hooks/useAutosave'
import { useOnlineStatus } from '@/components/deck-strategy/useOnlineStatus'
import { parseCategoriesCapped, MAX_CATEGORIES_PER_CARD, MAX_CATEGORY_LENGTH, type StructuredCategories } from '@/lib/categoryUtils'
import { parseTypeLine, frontFace } from '@/lib/type-line'
import { CARD_DETAILS_LABELS as L } from '@/lib/card-details/labels'
import type { CardDetails } from '@/lib/card-details/load'
import type { DeckCard } from '@/components/CardGrid'
import { OracleText, SELECT, TAB_BODY } from './shared'

const UNDO_WINDOW_MS = 10_000
/** Names that mean something else in a deck (not ordinary categories). */
const RESERVED_NAMES = new Set(['maybeboard', 'sideboard', 'commander', 'companion'])
const TAG_CAP = 3
export const WHY_MAX = 200

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; previous: StructuredCategories | null }
  | { kind: 'error'; attempt: StructuredCategories }

export interface OverviewTabProps {
  deckId: number
  card: DeckCard
  data: CardDetails
  availableCategories: string[]
  onSaveCategories: (cardId: number, categories: StructuredCategories) => Promise<unknown>
  onGoToCopies: () => void
}

export function OverviewTab({ deckId, card, data, availableCategories, onSaveCategories, onGoToCopies }: OverviewTabProps) {
  const facts = data.facts
  const front = frontFace(parseTypeLine(facts?.typeLine))
  const colours = (facts?.colourIdentity ?? '').match(/[WUBRG]/g) ?? []
  const stats: Array<{ label: string; value: React.ReactNode }> = []
  if (facts?.manaValue != null) stats.push({ label: 'Mana value', value: facts.manaValue })
  if (colours.length > 0) stats.push({ label: 'Colour identity', value: <ColourPips colours={colours} size={16} /> })
  if (facts?.power != null && facts?.toughness != null) stats.push({ label: 'P / T', value: `${facts.power} / ${facts.toughness}` })
  if (front.subtypes.length > 0) stats.push({ label: 'Subtypes', value: front.subtypes.join(', ') })

  return (
    <div className={`${TAB_BODY} grid content-start gap-6 sm:grid-cols-[minmax(0,1fr)_300px]`}>
      <div className="flex min-w-0 flex-col gap-5">
        {facts?.oracleText ? (
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-3 text-[length:var(--fs-sm)]" data-testid="card-details-oracle">
            <OracleText text={facts.oracleText} />
          </div>
        ) : (
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">No card text for this card.</p>
        )}
        {stats.length > 0 && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2" data-testid="card-details-stats">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[length:var(--fs-xs)] uppercase tracking-wide text-muted-foreground">{s.label}</dt>
                <dd className="text-[length:var(--fs-sm)]">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <TagsSection tags={data.tags} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <InThisDeck
          deckId={deckId}
          card={card}
          data={data}
          availableCategories={availableCategories}
          onSaveCategories={onSaveCategories}
          onGoToCopies={onGoToCopies}
        />
      </div>
    </div>
  )
}

function TagsSection({ tags }: { tags: CardDetails['tags'] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? tags : tags.slice(0, TAG_CAP)
  const more = tags.length - TAG_CAP
  return (
    <section aria-labelledby="cd-tags" data-testid="card-details-tags">
      <h3 id="cd-tags" className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">{L.tagsHeading}</h3>
      {tags.length === 0 ? (
        <p className="mt-1 text-[length:var(--fs-sm)] text-muted-foreground">{L.noTags}</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="Tags">
          {shown.map((t) => (
            <li key={t.key} className="rounded-full border border-[var(--border-emphasis)] px-2 py-0.5 text-[length:var(--fs-sm)]">{t.displayName}</li>
          ))}
          {more > 0 && (
            <li>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="rounded-full px-2 py-0.5 text-[length:var(--fs-sm)] text-muted-foreground underline max-sm:min-h-11"
              >
                {expanded ? 'Show fewer' : `+${more} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function InThisDeck({ deckId, card, data, availableCategories, onSaveCategories, onGoToCopies }: OverviewTabProps) {
  const cardId = card.id
  const uid = useId()
  const [adding, setAdding] = useState(false)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const parsed = parseCategoriesCapped(card.categories ?? '')

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

  const primaryOptions = Array.from(new Set([...availableCategories, parsed.primary_category])).filter(Boolean)
  const held = [parsed.primary_category, ...parsed.additional_categories]
  const full = held.length >= MAX_CATEGORIES_PER_CARD
  const [newName, setNewName] = useState('')
  const [nameProblem, setNameProblem] = useState<string | null>(null)
  const busy = save.kind === 'saving'

  const changePrimary = (value: string) => {
    if (value === parsed.primary_category) return
    void commit({ primary_category: value, additional_categories: parsed.additional_categories.filter((c) => c !== value) }, parsed)
  }
  const addCategory = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    // Use the deck's own spelling when the name matches one the deck already shows.
    const spelled = [...availableCategories, ...held].find((c) => c.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
    if (spelled.length > MAX_CATEGORY_LENGTH) { setNameProblem(`Names can be up to ${MAX_CATEGORY_LENGTH} characters. This one is ${spelled.length}.`); return }
    if (RESERVED_NAMES.has(spelled.toLowerCase())) { setNameProblem(`"${spelled}" is a reserved name and can't be added here.`); return }
    if (held.some((c) => c.toLowerCase() === spelled.toLowerCase())) { setNameProblem('This card is already in that category.'); return }
    if (full) return
    setNameProblem(null)
    setNewName('')
    void commit({ primary_category: parsed.primary_category, additional_categories: [...parsed.additional_categories, spelled] }, parsed)
  }
  const removeCategory = (name: string) =>
    void commit({ primary_category: parsed.primary_category, additional_categories: parsed.additional_categories.filter((c) => c !== name) }, parsed)
  const addable = availableCategories.filter((c) => c && !held.includes(c) && !RESERVED_NAMES.has(c.toLowerCase()))

  return (
    <section aria-labelledby="cd-in-deck" className="rounded-lg border border-[var(--border-default)] p-3" data-testid="card-details-in-deck">
      <h3 id="cd-in-deck" className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">{L.inThisDeck}</h3>

      <label className="mt-3 flex flex-col gap-1 text-[length:var(--fs-xs)] text-muted-foreground">
        Category
        <select value={parsed.primary_category} onChange={(e) => changePrimary(e.target.value)} disabled={busy} className={`${SELECT} w-full`} aria-label="Category">
          {primaryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <p className="mt-1 text-[length:var(--fs-xs)] text-muted-foreground">The first category is where the card shows in the list.</p>

      <div className="mt-3">
        <div className="text-[length:var(--fs-xs)] text-muted-foreground">Also in</div>
        <ul className="mt-1 flex flex-wrap items-center gap-1.5" aria-label="Also in">
          {parsed.additional_categories.map((name) => (
            <li key={name} data-testid="card-details-category" className="flex max-w-full items-center gap-1 rounded-full border border-[var(--border-default)] py-0.5 pl-2 pr-1 text-[length:var(--fs-sm)]">
              <span className="break-words">{name}</span>
              <button type="button" disabled={busy} onClick={() => removeCategory(name)} aria-label={`Remove ${name}`} className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground max-sm:size-11">
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
          {!full && (
            <li>
              <button
                type="button"
                aria-label="Add to another category"
                aria-expanded={adding}
                onClick={() => setAdding((v) => !v)}
                className="inline-flex size-6 items-center justify-center rounded-full border border-[var(--border-emphasis)] max-sm:size-11"
              >
                <Plus className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
        {full && (
          <p className="mt-1 text-[length:var(--fs-sm)]" data-testid="card-details-category-full">
            A card can be in {MAX_CATEGORIES_PER_CARD} categories. Remove one to add another.
          </p>
        )}
        {adding && !full && (
          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[var(--border-default)] p-2">
            {addable.length > 0 && (
              <label className="flex flex-col gap-1 text-[length:var(--fs-xs)] text-muted-foreground">
                Add one this deck already uses
                <select value="" onChange={(e) => addCategory(e.target.value)} disabled={busy} className={`${SELECT} w-full`} aria-label="Add a category from this deck">
                  <option value="">Choose…</option>
                  {addable.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
            <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); addCategory(newName) }}>
              <label htmlFor={`${uid}-new`} className="text-[length:var(--fs-xs)] text-muted-foreground">Or add a new name (up to {MAX_CATEGORY_LENGTH} characters)</label>
              <div className="flex items-start gap-2">
                <input
                  id={`${uid}-new`}
                  type="text"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setNameProblem(null) }}
                  disabled={busy}
                  aria-describedby={`${uid}-count`}
                  aria-invalid={newName.trim().length > MAX_CATEGORY_LENGTH}
                  className={`${SELECT} min-w-0 flex-1 max-sm:text-base`}
                />
                <Button type="submit" variant="outline" size="sm" className="max-sm:h-11" disabled={busy || !newName.trim()}>Add</Button>
              </div>
              <span id={`${uid}-count`} className="text-[length:var(--fs-xs)] text-muted-foreground">{newName.trim().length} of {MAX_CATEGORY_LENGTH}</span>
              {(nameProblem || newName.trim().length > MAX_CATEGORY_LENGTH) && (
                <p role="alert" className="text-[length:var(--fs-sm)]" data-testid="card-details-category-problem">
                  {nameProblem ?? `Names can be up to ${MAX_CATEGORY_LENGTH} characters. This one is ${newName.trim().length}.`}
                </p>
              )}
            </form>
          </div>
        )}
        <div className="mt-1 min-h-5 text-[length:var(--fs-sm)]" role="status" aria-live="polite" data-testid="card-details-category-save">
          {save.kind === 'saving' && <span>Saving…</span>}
          {save.kind === 'saved' && (
            <span>
              Saved
              {save.previous && (
                <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={() => void commit(save.previous as StructuredCategories, parsed)}>Undo</Button>
              )}
            </span>
          )}
          {save.kind === 'error' && (
            <span>
              Couldn&apos;t save the category. Nothing was changed.
              <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={() => void commit(save.attempt, parsed)}>Try again</Button>
            </span>
          )}
        </div>
      </div>

      {data.whyAvailable && <WhyField deckId={deckId} cardId={cardId} initial={data.why ?? ''} />}

      {data.slot.copyId == null && (
        <p className="mt-3 text-[length:var(--fs-sm)] text-muted-foreground" data-testid="card-details-plan-hint">
          <button type="button" onClick={onGoToCopies} className="underline max-sm:min-h-11">{L.planHint}</button>
        </p>
      )}
    </section>
  )
}

function WhyField({ deckId, cardId, initial }: { deckId: number; cardId: number; initial: string }) {
  const uid = useId()
  const online = useOnlineStatus()
  const auto = useAutosave<{ why: string }>({
    initial: { why: initial },
    online,
    same: (_k, a, b) => String(a).trim() === String(b).trim(),
    save: async (changed): Promise<SaveResult> => {
      try {
        const text = (changed.why ?? '').trim()
        const res = await fetch(`/api/decks/${deckId}/cards/${cardId}/why`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ why: text === '' ? null : text }),
        })
        if (!res.ok) return { ok: false, error: "Couldn't save. Your text is still here." }
        return { ok: true }
      } catch {
        return { ok: false, error: "Couldn't save. Your text is still here." }
      }
    },
  })
  return (
    <div className="mt-3" data-testid="card-details-why">
      <label htmlFor={uid} className="text-[length:var(--fs-xs)] text-muted-foreground">Why it&apos;s here</label>
      <Textarea
        id={uid}
        value={auto.draft.why}
        maxLength={WHY_MAX}
        rows={3}
        onChange={(e) => auto.setField('why', e.target.value)}
        onBlur={() => void auto.saveNow()}
        className="mt-1 text-[length:var(--fs-sm)]"
      />
      <div className="flex items-center justify-between gap-2">
        <SaveStatus status={auto.status} lastSavedAt={auto.lastSavedAt} onRetry={() => void auto.saveNow()} />
        <span className="text-[length:var(--fs-xs)] text-muted-foreground">{auto.draft.why.length} of {WHY_MAX}</span>
      </div>
    </div>
  )
}
